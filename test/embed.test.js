'use strict';
// Testes do servidor (sem navegador):  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const embed = require('../api/embed.js');
const { parseEmbed, hostAllowed } = require('../lib/params');
const getConfig = require('../lib/config');
const PipocaPlayer = require('../public/sdk/pipoca-player.js');

function call(url, { method = 'GET', headers = {}, body } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = Object.assign({ host: 'player.test' }, headers);
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ? String(b) : ''; this.done = true; },
  };
  return embed(req, res).then(() => res);
}

function withEnv(env, fn) {
  const old = {};
  Object.keys(env).forEach((k) => { old[k] = process.env[k]; process.env[k] = env[k]; });
  const restore = () => Object.keys(env).forEach((k) => { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; });
  return Promise.resolve().then(fn).finally(restore);
}

const cfg = () => getConfig();
const configOf = (html) => JSON.parse(/id="pf-config">([^<]*)</.exec(html)[1]);

test('GET /embed com src válido devolve a página do player', async () => {
  const r = await call('/embed?src=' + encodeURIComponent('https://cdn.exemplo.com/filme.m3u8') + '&title=Olá');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.body, /<video id="v"/);
  const c = configOf(r.body);
  assert.equal(c.url, 'https://cdn.exemplo.com/filme.m3u8');
  assert.equal(c.isHls, true);
  assert.equal(c.title, 'Olá');
});

test('detecta HLS pela extensão e respeita type=mp4 / type=hls', () => {
  const p = (q) => parseEmbed(q, cfg()).player;
  assert.equal(p({ src: 'https://a.com/x.m3u8?token=1' }).isHls, true);
  assert.equal(p({ src: 'https://a.com/x.mp4' }).isHls, false);
  assert.equal(p({ src: 'https://a.com/stream', type: 'hls' }).isHls, true);
  assert.equal(p({ src: 'https://a.com/x.m3u8', type: 'mp4' }).isHls, false);
});

test('src ausente ou inválido → 400; esquemas perigosos são recusados', async () => {
  assert.equal((await call('/embed')).statusCode, 400);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://a.com/x', 'não é url']) {
    const r = await call('/embed?src=' + encodeURIComponent(bad));
    assert.equal(r.statusCode, 400, bad);
    assert.ok(!r.body.includes('<video'), bad);
  }
});

test('título/descrição maliciosos não escapam do HTML nem do JSON', async () => {
  const evil = '</script><img src=x onerror=alert(1)>';
  const r = await call('/embed?src=https://a.com/x.mp4&title=' + encodeURIComponent(evil) + '&desc=' + encodeURIComponent(evil));
  assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes('<img src=x'), 'tag injetada no HTML');
  assert.equal((r.body.match(/<\/script>/g) || []).length, 2, 'só os 2 </script> legítimos (config + player.js)');
  assert.equal(configOf(r.body).title, evil, 'o texto original chega intacto ao JS');
});

test('poster, next_url e legendas só aceitam http(s)', () => {
  const r = parseEmbed({
    src: 'https://a.com/x.mp4',
    poster: 'javascript:alert(1)',
    next_url: 'javascript:alert(2)',
    next_title: 'Próximo',
    subs: JSON.stringify([{ src: 'javascript:x' }, { src: 'https://a.com/pt.vtt', lang: 'pt-BR', label: 'Português' }]),
  }, cfg(), 'https://player.test');
  assert.equal(r.player.poster, '');
  assert.equal(r.player.next.url, '');
  assert.equal(r.player.next.title, 'Próximo');
  assert.equal(r.player.subs.length, 1);
  assert.equal(r.player.subs[0].lang, 'pt-BR');
});

test('next_url relativo é resolvido contra o endereço do player', () => {
  const r = parseEmbed({ src: 'https://a.com/x.mp4', next_url: '/embed?src=https%3A%2F%2Fa.com%2Fy.mp4' }, cfg(), 'https://player.test');
  assert.equal(r.player.next.url, 'https://player.test/embed?src=https%3A%2F%2Fa.com%2Fy.mp4');
});

test('flags, start, id, accent e origin são validados', () => {
  const r = parseEmbed({
    src: 'https://a.com/x.mp4', autoplay: '0', muted: '1', loop: 'true', resume: 'off', start: '90.7',
    id: 'ep 1 <b>', accent: 'zzz', origin: 'https://meusite.com/pasta', channel: 'abc_1',
  }, cfg());
  const p = r.player;
  assert.equal(p.autoplay, false);
  assert.equal(p.muted, true);
  assert.equal(p.loop, true);
  assert.equal(p.resume, false);
  assert.equal(p.start, 90);
  assert.equal(p.id, '', 'id com caracteres inválidos é descartado');
  assert.equal(p.accent, '#ff2a2a', 'cor inválida cai no padrão');
  assert.equal(p.parentOrigin, '', 'origin precisa ser só scheme+host');
  assert.equal(p.channel, 'abc_1');
  assert.equal(parseEmbed({ src: 'https://a.com/x.mp4', origin: 'https://meusite.com' }, cfg()).player.parentOrigin, 'https://meusite.com');
  assert.equal(parseEmbed({ src: 'https://a.com/x.mp4', accent: '00ff88' }, cfg()).player.accent, '#00ff88');
});

test('ALLOWED_SRC_HOSTS bloqueia hosts fora da lista (vídeo e legendas)', async () => {
  await withEnv({ ALLOWED_SRC_HOSTS: 'meucdn.com, *.videos.com' }, async () => {
    assert.equal((await call('/embed?src=https://meucdn.com/a.mp4')).statusCode, 200);
    assert.equal((await call('/embed?src=https://x.videos.com/a.mp4')).statusCode, 200);
    assert.equal((await call('/embed?src=https://videos.com/a.mp4')).statusCode, 200);
    const bad = await call('/embed?src=https://outro.com/a.mp4');
    assert.equal(bad.statusCode, 403);
    assert.ok(!bad.body.includes('<video'));
    assert.equal((await call('/embed?src=https://evilvideos.com/a.mp4')).statusCode, 403, 'sufixo sem ponto não vale');
    const subs = parseEmbed({ src: 'https://meucdn.com/a.mp4', sub: 'https://outro.com/pt.vtt' }, getConfig());
    assert.equal(subs.player.subs.length, 0);
  });
  assert.equal(hostAllowed('a.b.com', ['*.b.com']), true);
  assert.equal(hostAllowed('b.com', ['*.b.com']), true);
  assert.equal(hostAllowed('xb.com', ['*.b.com']), false);
});

test('FRAME_ANCESTORS e REFERRER_POLICY saem nos cabeçalhos', async () => {
  const padrao = await call('/embed?src=https://a.com/x.mp4');
  assert.equal(padrao.headers['content-security-policy'], 'frame-ancestors *');
  assert.equal(padrao.headers['x-content-type-options'], 'nosniff');
  await withEnv({ FRAME_ANCESTORS: 'https://meusite.com https://*.meusite.com', REFERRER_POLICY: 'origin' }, async () => {
    const r = await call('/embed?src=https://a.com/x.mp4');
    assert.equal(r.headers['content-security-policy'], 'frame-ancestors https://meusite.com https://*.meusite.com');
    assert.equal(r.headers['referrer-policy'], 'origin');
  });
});

test('BRAND, ACCENT e imagens vêm do ambiente; "none" remove a imagem', async () => {
  await withEnv({ BRAND: 'MeuCine', ACCENT: '#00aaff', SLEEP_IMG: 'none', ERROR_IMG: 'https://img.exemplo.com/erro.png' }, async () => {
    const r = await call('/embed?src=https://a.com/x.mp4');
    assert.match(r.body, />MEUCINE</);
    assert.match(r.body, /--accent:#00aaff/);
    assert.ok(!r.body.includes('transferir.png'), 'imagem de soneca removida');
    assert.ok(r.body.includes('https://img.exemplo.com/erro.png'));
    const q = await call('/embed?src=https://a.com/x.mp4&brand=Outra&accent=%23ff00ff');
    assert.match(q.body, />OUTRA</);
    assert.match(q.body, /--accent:#ff00ff/);
  });
});

test('telemetria: 204 sempre; só loga com TELEMETRY=1; lixo é ignorado', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    let r = await call('/embed', { method: 'POST', body: JSON.stringify({ ev: 'start', ms: 1200 }) });
    assert.equal(r.statusCode, 204);
    assert.equal(logs.length, 0, 'desligada por padrão');
    await withEnv({ TELEMETRY: '1' }, async () => {
      r = await call('/embed', { method: 'POST', body: JSON.stringify({ ev: 'error', stage: 'carregamento', ms: 12.6, evil: 'x', stalls: 'abc' }) });
      assert.equal(r.statusCode, 204);
      assert.equal(logs.length, 1);
      assert.deepEqual(JSON.parse(logs[0].replace('[telemetria] ', '')), { ev: 'error', stage: 'carregamento', ms: 13 });
      r = await call('/embed', { method: 'POST', body: '{{{não é json' });
      assert.equal(r.statusCode, 204);
    });
  } finally {
    console.log = orig;
  }
});

test('métodos não suportados → 405; HEAD funciona', async () => {
  assert.equal((await call('/embed?src=https://a.com/x.mp4', { method: 'DELETE' })).statusCode, 405);
  assert.equal((await call('/embed?src=https://a.com/x.mp4', { method: 'HEAD' })).statusCode, 200);
});

test('a página aponta para os arquivos estáticos com versão (cache busting)', async () => {
  const r = await call('/embed?src=https://a.com/x.mp4');
  assert.match(r.body, /\/player\/player\.css\?v=[\w.]+/);
  assert.match(r.body, /\/player\/player\.js\?v=[\w.]+/);
});

test('SDK: embedUrl monta a URL certa', () => {
  const u = new URL(PipocaPlayer.embedUrl({
    src: 'https://a.com/x.m3u8?t=1&u=2', title: 'Olá & tchau', tags: ['a', 'b'], autoplay: false, start: 30,
    subs: [{ src: 'https://a.com/pt.vtt', lang: 'pt' }], next: { title: 'Ep 2', url: 'https://p.com/embed?src=y' },
  }, 'https://player.exemplo.com/'));
  assert.equal(u.origin + u.pathname, 'https://player.exemplo.com/embed');
  assert.equal(u.searchParams.get('src'), 'https://a.com/x.m3u8?t=1&u=2');
  assert.equal(u.searchParams.get('title'), 'Olá & tchau');
  assert.equal(u.searchParams.get('tags'), 'a,b');
  assert.equal(u.searchParams.get('autoplay'), '0');
  assert.equal(u.searchParams.get('start'), '30');
  assert.deepEqual(JSON.parse(u.searchParams.get('subs')), [{ src: 'https://a.com/pt.vtt', lang: 'pt' }]);
  assert.equal(u.searchParams.get('next_title'), 'Ep 2');
  assert.throws(() => PipocaPlayer.embedUrl({}, 'https://p.com'), /src/);
  assert.throws(() => PipocaPlayer.embedUrl({ src: 'https://a.com/x.mp4' }), /baseUrl/);
});
