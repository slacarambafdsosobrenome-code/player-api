'use strict';
// Testes da leitura da célula de links e da fila de tentativas (o mesmo código roda no navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/player/sources.js');

test('separa links por vírgula, ponto e vírgula, espaço e quebra de linha', () => {
  const l = S.parseLinks('https://a.com/1.mp4, https://b.com/2.mp4;https://c.com/3.m3u8\nhttps://d.com/4.mp4 https://e.com/5.mp4');
  assert.deepEqual(l, ['https://a.com/1.mp4', 'https://b.com/2.mp4', 'https://c.com/3.m3u8', 'https://d.com/4.mp4', 'https://e.com/5.mp4']);
});

test('vírgula dentro do link não separa; lixo depois do link é descartado', () => {
  assert.deepEqual(S.parseLinks('https://b.com/q?a=1,2&b=3'), ['https://b.com/q?a=1,2&b=3']);
  assert.deepEqual(S.parseLinks('https://a.com/x.mp4, javascript:alert(1), ftp://a.com/x'), ['https://a.com/x.mp4']);
  assert.deepEqual(S.parseLinks('"https://a.com/x.mp4", "https://b.com/y.m3u8"'), ['https://a.com/x.mp4', 'https://b.com/y.m3u8']);
});

test('esquemas perigosos, vazio e texto solto viram lista vazia; repetidos saem', () => {
  for (const bad of ['', '   ', 'sem link', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://a.com/x']) {
    assert.deepEqual(S.parseLinks(bad), [], bad);
  }
  assert.deepEqual(S.parseLinks('https://a.com/1.mp4, https://a.com/1.mp4'), ['https://a.com/1.mp4']);
});

test('limita a quantidade de links', () => {
  const many = Array.from({ length: 40 }, (_, i) => 'https://a.com/' + i + '.mp4').join(', ');
  assert.equal(S.parseLinks(many).length, S.MAX_LINKS);
});

test('classifica mp4, hls, .m3u, link sem extensão, Drive e OK.ru', () => {
  const k = (u) => S.classify(u).kind;
  assert.equal(k('http://fhd4.oneplayer.site/x/FHD4/tt1.mp4'), 'file');
  assert.equal(k('https://a.com/v.webm?x=1'), 'file');
  assert.equal(k('https://a.com/live/index.m3u8?token=1'), 'hls');
  assert.equal(k('https://a.com/lista.m3u'), 'hls');
  assert.equal(k('https://a.com/stream?format=m3u8'), 'hls');
  assert.equal(k('https://reprodutormp4.canalpedroid.workers.dev/2'), 'auto');
  assert.equal(k('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing'), 'drive');
  assert.equal(k('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz'), 'drive');
  assert.equal(k('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz'), 'drive');
  assert.equal(k('https://drive.google.com/u/0/uc?id=1AbCdEfGhIjKlMnOpQrStUvWxYz'), 'drive');
  assert.equal(k('https://ok.ru/video/1234567890123'), 'okru');
  assert.equal(k('https://m.ok.ru/video/1234567890123'), 'okru');
  assert.equal(k('https://ok.ru/videoembed/1234567890123'), 'okru');
  // Docs/Planilhas e pastas do Drive não são vídeo
  assert.equal(k('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit'), 'auto');
  assert.equal(k('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz'), 'auto');
});

test('links sem https:// de Drive e OK.ru são completados', () => {
  assert.deepEqual(S.parseLinks('drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz, ok.ru/video/1234567890123'),
    ['https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz', 'https://ok.ru/video/1234567890123']);
});

test('fila: mp4 http vira https na página https; Drive tem direto + player do Drive (este por último)', () => {
  const links = S.parseLinks('http://a.com/1.mp4, https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view, https://b.com/2.m3u8');
  const at = S.buildAttempts(links, { secure: true });
  assert.deepEqual(at.map((a) => a.mode), ['native', 'native', 'hls', 'frame']);
  assert.equal(at[0].url, 'https://a.com/1.mp4');
  assert.match(at[1].url, /^https:\/\/drive\.usercontent\.google\.com\/download\?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&export=download&confirm=t$/);
  assert.equal(at[3].url, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview');
  assert.ok(at.every((a, i) => a.i === i && a.n === at.length && a.label));
  // sem "secure" (dev local em http) o link fica como está
  assert.equal(S.buildAttempts(['http://a.com/1.mp4'], { secure: false })[0].url, 'http://a.com/1.mp4');
});

test('fila: link http com porta explícita não é "adivinhado" como https', () => {
  assert.equal(S.buildAttempts(['http://a.com:8080/1.mp4'], { secure: true })[0].url, 'http://a.com:8080/1.mp4');
});

test('fila: OK.ru fica na posição que você pôs; iframeLast empurra todos os iframes pro fim', () => {
  const links = S.parseLinks('https://ok.ru/video/1234567890123, https://a.com/1.mp4');
  assert.deepEqual(S.buildAttempts(links).map((a) => a.mode), ['frame', 'native']);
  assert.deepEqual(S.buildAttempts(links, { iframeLast: true }).map((a) => a.mode), ['native', 'frame']);
});

test('fila: link sem extensão tenta como arquivo e depois como HLS (Safari: uma tentativa só)', () => {
  const links = ['https://w.workers.dev/2'];
  assert.deepEqual(S.buildAttempts(links).map((a) => a.mode), ['native', 'hls']);
  assert.deepEqual(S.buildAttempts(links, { nativeHls: true }).map((a) => a.mode), ['native']);
});

test('fila: type=hls / type=mp4 forçam o tipo dos links comuns, mas não mexem em Drive/OK.ru', () => {
  assert.equal(S.buildAttempts(['https://a.com/stream'], { type: 'hls' })[0].mode, 'hls');
  assert.equal(S.buildAttempts(['https://a.com/x.m3u8'], { type: 'mp4' })[0].mode, 'native');
  assert.equal(S.buildAttempts(['https://ok.ru/video/1234567890123'], { type: 'hls' })[0].mode, 'frame');
});

test('fila com relay: link http ganha tentativa direta curta (probe) + "pelo servidor"', () => {
  const links = S.parseLinks('http://fhd1.oneplayer.site/x/tt1.mp4, https://b.test/2.mp4, http://w.test/stream, https://c.test/live.m3u8');
  const at = S.buildAttempts(links, { secure: true, proxyUrl: (i) => '/api/stream?t=filme&l=7&n=' + i });
  const d = at.map((a) => `${a.kind}${a.probe ? '*' : ''}:${a.url.startsWith('/api') ? a.url.split('n=')[1] : 'direto'}`);
  assert.deepEqual(d, [
    'file*:direto', 'proxy:0',          // http mp4: https no chute (rápido) e depois o relay
    'file:direto', 'proxy:1',           // https mp4: direto e relay (cobre servidor que só atende em http)
    'auto*:direto', 'proxy:2', 'auto*:direto', // sem extensão em http: arquivo, relay, HLS
    'hls:direto',                       // HLS: sem relay (a lista aponta pra outros arquivos)
  ]);
  assert.match(at[1].label, /\(pelo servidor\)/);
  assert.equal(at[1].mode, 'native');
  // sem proxyUrl (ex.: /embed?src=…) nada muda
  assert.ok(S.buildAttempts(links, { secure: true }).every((a) => a.kind !== 'proxy'));
  // Drive e OK.ru nunca usam o relay
  const dr = S.buildAttempts(S.parseLinks('https://ok.ru/video/1234567890123, https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view'), { secure: true, proxyUrl: () => '/x' });
  assert.ok(dr.every((a) => a.kind !== 'proxy'));
});

test('fila: em página http (dev local) não há "chute" de https nem probe', () => {
  const at = S.buildAttempts(['http://a.test/1.mp4'], { secure: false, proxyUrl: () => '/p' });
  assert.equal(at[0].url, 'http://a.test/1.mp4');
  assert.ok(!at[0].probe);
});
