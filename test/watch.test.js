'use strict';
// Testes das rotas /filme/{linha} e /serie/{aba}/{linha} com uma "planilha do Google" falsa servida localmente.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');

const watch = require('../api/watch.js');
const sheets = require('../lib/sheets.js');

// ---- planilha falsa -------------------------------------------------------------------------------------------
const FILMES = [
  'Nome,Player 1,Sinopse,Capa,Categoria,Ano,Duracao,Trailer,Nomes,Fotos,Num0,Tipo,Audio,Temporadas,ID,Link Player 2',
  // linha 2
  'A Casa da Árvore,x,"Dora, uma bióloga\nque mora sozinha",https://img.test/capa.jpg,"Thriller, Terror",2023,81 min,,,,0,Filme,DUB,0,,"http://fhd4.oneplayer.site/a/tt1.mp4, https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view"',
  // linha 3: EM BRANCO (não pode deslocar a numeração!)
  ',,,,,,,,,,,,,,,',
  // linha 4: sem link
  'Sem Link,x,s,,Drama,2020,90 min,,,,0,Filme,LEG,0,,',
  // linha 5: só lixo
  'Lixo,x,s,,Drama,2020,90 min,,,,0,Filme,LEG,0,,javascript:alert(1)',
  // linha 6: título malicioso
  '"</script><b>x</b>",x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,https://cdn.test/v.m3u8',
].join('\r\n') + '\r\n';

const EPS = [
  'Nome,PLAYER 1,Temporada,Episódio,LINK PARA PROXY',
  'A Caverna Encantada,,1,1,http://shd12.oneplayer.site/1x1.mp4',
  'A Caverna Encantada,,1,2,"https://a.test/1x2.mp4, https://ok.ru/video/1234567890123"',
  'Outra Serie,,1,1,https://a.test/o.mp4',
  'Outra Serie,,1,2,',
].join('\n');

let server, base, hits, mode;
test.before(async () => {
  hits = [];
  mode = 'ok';
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    if (mode === 'private') { res.setHeader('content-type', 'text/html'); return res.end('<!DOCTYPE html><html>login</html>'); }
    if (mode === 'down') { res.statusCode = 500; return res.end('x'); }
    res.setHeader('content-type', 'text/csv');
    if (u.pathname === '/FILMES/export' && u.searchParams.get('gid') === '111') return res.end(FILMES);
    if (u.pathname === '/SERIES/export' && u.searchParams.get('gid') === 'g3') return res.end(EPS);
    res.statusCode = 404; res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  Object.assign(process.env, {
    SHEETS_BASE: base, FILMES_SHEET_ID: 'FILMES', FILMES_GID: '111', SERIES_SHEET_ID: 'SERIES',
    SERIES_GIDS: 'g1 g2 g3', SHEET_TTL: '0',
  });
});
test.after(() => server.close());
test.beforeEach(() => { mode = 'ok'; hits = []; sheets.clearCache(); });

function call(url, { method = 'GET', query } = {}) {
  const req = Readable.from([]);
  req.method = method; req.url = url; req.headers = { host: 'player.test' };
  if (query) req.query = query;
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b ? String(b) : ''; } };
  return watch(req, res).then(() => res);
}
const configOf = (html) => JSON.parse(/id="pf-config">([^<]*)</.exec(html)[1]);

test('/filme/2 → toca os links da coluna P com os dados da linha 2', async () => {
  const r = await call('/filme/2');
  assert.equal(r.statusCode, 200);
  const c = configOf(r.body);
  assert.deepEqual(c.links, ['http://fhd4.oneplayer.site/a/tt1.mp4', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view']);
  assert.equal(c.url, c.links[0]);
  assert.equal(c.title, 'A Casa da Árvore');
  assert.equal(c.poster, 'https://img.test/capa.jpg');
  assert.equal(c.meta.year, '2023');
  assert.deepEqual(c.meta.tags, ['Thriller', 'Terror', '81 min', 'Dublado']);
  assert.match(c.desc, /Dora, uma bióloga\nque mora sozinha/);
  assert.equal(c.id, 'f2');
  assert.match(r.headers['cache-control'], /s-maxage=60/);
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
});

test('aceita "P2" no lugar de "2" (o jeito que você fala a linha)', async () => {
  const r = await call('/filme/P2');
  assert.equal(r.statusCode, 200);
  assert.equal(configOf(r.body).id, 'f2');
});

test('linha em branco no meio NÃO desloca a numeração', async () => {
  const r = await call('/filme/6');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(configOf(r.body).links, ['https://cdn.test/v.m3u8']);
  assert.equal((await call('/filme/3')).statusCode, 404); // a linha 3 existe, mas está vazia
});

test('título malicioso da planilha não escapa do HTML', async () => {
  const r = await call('/filme/6');
  assert.ok(!r.body.includes('<b>x</b>'));
  assert.equal((r.body.match(/<\/script>/g) || []).length, 3);
  assert.equal(configOf(r.body).title, '</script><b>x</b>');
});

test('erros claros: cabeçalho, linha inexistente, célula vazia, link inválido, linha inválida', async () => {
  let r = await call('/filme/1');
  assert.equal(r.statusCode, 404); assert.match(r.body, /cabeçalho/);
  r = await call('/filme/99999');
  assert.equal(r.statusCode, 404); assert.match(r.body, /não existe/);
  r = await call('/filme/4');
  assert.equal(r.statusCode, 404); assert.match(r.body, /P4 está vazia/);
  r = await call('/filme/5');
  assert.equal(r.statusCode, 404); assert.match(r.body, /nenhum link/);
  r = await call('/filme/abc');
  assert.equal(r.statusCode, 400);
  for (const x of ['/filme/1', '/filme/4']) assert.ok(!(await call(x)).body.includes('<video'));
});

test('/serie/3/2 → aba 3 (gid g3), coluna E, título "Série · T E" e próximo episódio', async () => {
  const r = await call('/serie/3/2');
  assert.equal(r.statusCode, 200);
  const c = configOf(r.body);
  assert.deepEqual(c.links, ['http://shd12.oneplayer.site/1x1.mp4']);
  assert.equal(c.title, 'A Caverna Encantada · T1 E1');
  assert.equal(c.id, 's3-2');
  assert.deepEqual(c.next, { url: 'https://player.test/serie/3/3', title: 'A Caverna Encantada · T1 E2', poster: '' });
  assert.ok(hits.some((h) => h.startsWith('/SERIES/export?format=csv&gid=g3')));
});

test('série: último episódio da série não oferece "a seguir" de outra série', async () => {
  const r = await call('/serie/3/3');
  const c = configOf(r.body);
  assert.deepEqual(c.links, ['https://a.test/1x2.mp4', 'https://ok.ru/video/1234567890123']);
  assert.equal(c.next, null); // a linha 4 é de "Outra Serie"
  const r2 = await call('/serie/3/4');
  assert.equal(configOf(r2.body).next, null); // a linha 5 não tem link
});

test('série: aba fora de 1..N → 404', async () => {
  for (const aba of ['0', '4', '18', 'x']) assert.equal((await call('/serie/' + aba + '/2')).statusCode, 404, aba);
});

test('funciona quando a Vercel passa a rota por req.query (rewrite) e a URL original', async () => {
  const r = await call('/filme/2', { query: { type: 'filme', linha: '2' } });
  assert.equal(r.statusCode, 200);
  const s = await call('/api/watch?type=serie&aba=3&linha=2');
  assert.equal(s.statusCode, 200);
  const o = await call('/serie/3/2', { query: { type: 'serie', aba: '3', linha: '2' } });
  assert.equal(configOf(o.body).id, 's3-2');
});

test('parâmetros da URL (autoplay, muted, start, accent) passam, mas não dá pra trocar o vídeo', async () => {
  const r = await call('/filme/2?autoplay=0&muted=1&start=90&accent=00ff00&src=https://evil.test/x.mp4&title=Hack');
  const c = configOf(r.body);
  assert.equal(c.autoplay, false); assert.equal(c.muted, true); assert.equal(c.start, 90); assert.equal(c.accent, '#00ff00');
  assert.ok(!c.links.includes('https://evil.test/x.mp4'));
  assert.equal(c.title, 'A Casa da Árvore');
});

test('planilha privada → mensagem explicando como liberar; Google fora do ar → 502', async () => {
  mode = 'private';
  let r = await call('/filme/2');
  assert.equal(r.statusCode, 502); assert.match(r.body, /Qualquer pessoa com o link/);
  mode = 'down'; sheets.clearCache();
  r = await call('/filme/2');
  assert.equal(r.statusCode, 502);
});

test('cache: com TTL a planilha é baixada uma vez só; se o Google cair, usa a última cópia boa', async () => {
  process.env.SHEET_TTL = '60';
  try {
    await call('/filme/2'); await call('/filme/6'); await call('/filme/2');
    assert.equal(hits.length, 1);
    process.env.SHEET_TTL = '0'; mode = 'down';
    const r = await call('/filme/2'); // TTL vencido + Google caiu → cópia antiga
    assert.equal(r.statusCode, 200);
  } finally { process.env.SHEET_TTL = '0'; }
});

test('várias visitas ao mesmo tempo baixam a aba uma vez só', async () => {
  process.env.SHEET_TTL = '60';
  try {
    await Promise.all([call('/filme/2'), call('/filme/2'), call('/filme/6'), call('/serie/3/2')]);
    assert.equal(hits.filter((h) => h.startsWith('/FILMES')).length, 1);
  } finally { process.env.SHEET_TTL = '0'; }
});

test('POST (telemetria) responde 204 e métodos estranhos → 405', async () => {
  assert.equal((await call('/filme/2', { method: 'POST' })).statusCode, 204);
  assert.equal((await call('/filme/2', { method: 'DELETE' })).statusCode, 405);
});

test('CSV: aspas, vírgulas, quebras de linha e linhas em branco preservadas', () => {
  const rows = sheets.parseCsv('a,b\n"x,1","li\nnha ""2"""\n\n,,\nfim');
  assert.deepEqual(rows, [['a', 'b'], ['x,1', 'li\nnha "2"'], [''], ['', '', ''], ['fim']]);
  assert.equal(sheets.colIndex('P'), 15); assert.equal(sheets.colIndex('E'), 4); assert.equal(sheets.colIndex('AA'), 26);
  assert.equal(sheets.parseLine('P2555'), 2555); assert.equal(sheets.parseLine('0'), 0); assert.equal(sheets.parseLine('2x'), 0);
});
