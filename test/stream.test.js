'use strict';
// Relay /api/stream: pega o link da PLANILHA (nunca da URL), repassa em pedaços com Range, bloqueia endereços internos.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const stream = require('../api/stream.js');
const sheets = require('../lib/sheets.js');

const SIZE = 3 * 1024 * 1024 + 123; // 3 MB e uns trocados
const FILE = Buffer.alloc(SIZE);
for (let i = 0; i < SIZE; i++) FILE[i] = i % 251;

let up, sheet, relay, upPort, relayPort, upMode, upClosed;
const pending = [];

test.before(async () => {
  upMode = 'ok';
  upClosed = 0;
  // ---- "servidor de vídeo" http-only, com suporte a Range
  up = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (upMode === 'html') { res.setHeader('content-type', 'text/html'); return res.end('<html>erro</html>'); }
    if (upMode === 'down' || u.pathname === '/gone.mp4') { res.statusCode = 404; return res.end('x'); }
    if (u.pathname === '/redir') { res.statusCode = 302; res.setHeader('location', '/video.mp4'); return res.end(); }
    if (u.pathname === '/slow.mp4') {
      res.setHeader('content-type', 'video/mp4'); res.setHeader('content-length', 10 * 1024 * 1024);
      res.on('close', () => { upClosed++; });
      const t = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(Buffer.alloc(64 * 1024)); }, 10);
      res.on('close', () => clearInterval(t));
      return;
    }
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('content-type', 'application/octet-stream');
    if (upMode === 'norange' || !m) { res.setHeader('content-length', SIZE); return res.end(FILE); }
    let a, b;
    if (m[1] === '') { a = Math.max(0, SIZE - parseInt(m[2], 10)); b = SIZE - 1; }
    else { a = parseInt(m[1], 10); b = m[2] === '' ? SIZE - 1 : Math.min(parseInt(m[2], 10), SIZE - 1); }
    if (a >= SIZE) { res.statusCode = 416; res.setHeader('content-range', `bytes */${SIZE}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${a}-${b}/${SIZE}`);
    res.setHeader('content-length', b - a + 1);
    res.end(FILE.subarray(a, b + 1));
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  upPort = up.address().port;

  // ---- planilha falsa
  const base = `127.0.0.1:${upPort}`;
  const CSV = [
    'Nome,B,C,D,E,F,G,H,I,J,K,L,M,N,O,Link Player 2',
    `Filme A,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,"http://${base}/video.mp4, https://${base}/video.mp4"`, // linha 2: http + "https" de servidor só-http
    `Filme B,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,http://${base}/gone.mp4`, // linha 3: 404
    `Filme C,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,http://${base}/redir`, // linha 4: redireciona
    `Filme D,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,http://${base}/slow.mp4`, // linha 5: lento
    'Filme E,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,http://169.254.169.254/latest/meta-data/', // linha 6: metadata da nuvem
    'Filme F,x,s,,Drama,2020,90 min,,,,0,Filme,DUB,0,,"http://localhost:1/x.mp4, http://[::1]:1/x.mp4, http://10.0.0.5/x.mp4"', // linha 7
  ].join('\n');
  const EPS = `Nome,P1,T,Ep,Link\nSerie,,1,1,http://${base}/video.mp4\n`;
  sheet = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('content-type', 'text/csv');
    if (u.pathname === '/FIL/export') return res.end(CSV);
    if (u.pathname === '/SER/export') return res.end(EPS);
    res.statusCode = 404; res.end('x');
  });
  await new Promise((r) => sheet.listen(0, '127.0.0.1', r));

  Object.assign(process.env, {
    SHEETS_BASE: `http://127.0.0.1:${sheet.address().port}`, FILMES_SHEET_ID: 'FIL', FILMES_GID: '1',
    SERIES_SHEET_ID: 'SER', SERIES_GIDS: 'g1 g2', SHEET_TTL: '60',
    PROXY_ALLOW_PRIVATE: '1', PROXY_CHUNK_MB: '1',
  });
  relay = http.createServer((req, res) => stream(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); }));
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  relayPort = relay.address().port;
});
test.after(() => { up.close(); sheet.close(); relay.close(); delete process.env.PROXY_ALLOW_PRIVATE; delete process.env.PROXY_CHUNK_MB; delete process.env.SHEET_TTL; });
test.beforeEach(() => { upMode = 'ok'; sheets.clearCache(); });

const get = (q, headers) => fetch(`http://127.0.0.1:${relayPort}/api/stream?${q}`, { headers });
const MB = 1024 * 1024;

test('Range: 0- devolve só o 1º pedaço (206), com Content-Range certo e os bytes certos', async () => {
  const r = await get('t=filme&l=2&n=0', { Range: 'bytes=0-' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 0-${MB - 1}/${SIZE}`);
  assert.equal(r.headers.get('content-length'), String(MB));
  assert.equal(r.headers.get('content-type'), 'video/mp4'); // origem mandou octet-stream → vira video/mp4
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  const body = Buffer.from(await r.arrayBuffer());
  assert.ok(body.equals(FILE.subarray(0, MB)));
});

test('percorrendo os pedaços em sequência dá o arquivo inteiro, idêntico', async () => {
  const parts = [];
  let pos = 0;
  while (pos < SIZE) {
    const r = await get('t=filme&l=2&n=0', { Range: `bytes=${pos}-` });
    assert.equal(r.status, 206);
    const b = Buffer.from(await r.arrayBuffer());
    parts.push(b); pos += b.length;
  }
  assert.equal(parts.length, 4); // 3 pedaços cheios de 1 MB + o resto
  assert.ok(Buffer.concat(parts).equals(FILE));
});

test('Range pequeno no meio do arquivo e "últimos N bytes" (Safari)', async () => {
  let r = await get('t=filme&l=2&n=0', { Range: 'bytes=3000000-3000009' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 3000000-3000009/${SIZE}`);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(FILE.subarray(3000000, 3000010)));
  r = await get('t=filme&l=2&n=0', { Range: 'bytes=-100' });
  assert.equal(r.status, 206);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(FILE.subarray(SIZE - 100)));
  r = await get('t=filme&l=2&n=0', { Range: 'bytes=0-1' }); // o "teste" que o Safari faz primeiro
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 2);
});

test('Range além do fim → 416', async () => {
  const r = await get('t=filme&l=2&n=0', { Range: `bytes=${SIZE + 10}-` });
  assert.equal(r.status, 416);
});

test('link "https://" de servidor que só atende em http:// → relay desce pra http e toca', async () => {
  const r = await get('t=filme&l=2&n=1', { Range: 'bytes=0-9' });
  assert.equal(r.status, 206);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(FILE.subarray(0, 10)));
});

test('série: /api/stream?t=serie&a=1&l=2', async () => {
  const r = await get('t=serie&a=1&l=2&n=0', { Range: 'bytes=0-9' });
  assert.equal(r.status, 206);
});

test('segue redirecionamento da origem', async () => {
  const r = await get('t=filme&l=4&n=0', { Range: 'bytes=0-9' });
  assert.equal(r.status, 206);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(FILE.subarray(0, 10)));
});

test('origem que ignora Range: serve do começo (cortado no pedaço); pular pra frente → 502', async () => {
  upMode = 'norange';
  let r = await get('t=filme&l=2&n=0', { Range: 'bytes=0-' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 0-${MB - 1}/${SIZE}`);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(FILE.subarray(0, MB)));
  r = await get('t=filme&l=2&n=0', { Range: 'bytes=5000-' });
  assert.equal(r.status, 502);
});

test('origem devolve página HTML, 404 ou cai → erro rápido (o player troca de fonte)', async () => {
  upMode = 'html';
  assert.equal((await get('t=filme&l=2&n=0', { Range: 'bytes=0-' })).status, 502);
  upMode = 'ok';
  assert.equal((await get('t=filme&l=3&n=0', { Range: 'bytes=0-' })).status, 404);
});

test('NÃO é proxy aberto: a URL vem só da planilha; n/linha inválidos não passam', async () => {
  let r = await get('t=filme&l=2&n=0&url=http://evil.test/x.mp4&u=http://evil.test/x', { Range: 'bytes=0-9' });
  assert.equal(r.status, 206); // ignorou url=/u= (e tocou o link da planilha)
  assert.equal((await get('t=filme&l=2&n=9')).status, 404);
  assert.equal((await get('t=filme&l=2&n=-1')).status, 400);
  assert.equal((await get('t=filme&l=2&n=abc')).status, 400);
  assert.equal((await get('t=filme&l=999&n=0')).status, 404);
  assert.equal((await get('t=filme&l=1&n=0')).status, 404); // cabeçalho
  assert.equal((await get('t=serie&a=9&l=2&n=0')).status, 404);
});

test('endereços internos são bloqueados (nuvem/metadata, localhost, 10.x, ::1)', async () => {
  delete process.env.PROXY_ALLOW_PRIVATE;
  try {
    assert.equal((await get('t=filme&l=6&n=0', { Range: 'bytes=0-9' })).status, 403); // 169.254.169.254
    for (const n of [0, 1, 2]) assert.equal((await get('t=filme&l=7&n=' + n, { Range: 'bytes=0-9' })).status, 403, 'n=' + n);
    assert.equal((await get('t=filme&l=2&n=0', { Range: 'bytes=0-9' })).status, 403); // 127.0.0.1 (o servidor de teste)
  } finally { process.env.PROXY_ALLOW_PRIVATE = '1'; }
  const { isPrivateIp } = stream;
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('o navegador desiste no meio → o relay para de baixar da origem', async () => {
  const ctrl = new AbortController();
  const r = await fetch(`http://127.0.0.1:${relayPort}/api/stream?t=filme&l=5&n=0`, { headers: { Range: 'bytes=0-' }, signal: ctrl.signal });
  assert.equal(r.status, 206);
  const reader = r.body.getReader();
  await reader.read(); // chegou algum dado
  upClosed = 0;
  ctrl.abort();
  await new Promise((res) => setTimeout(res, 400));
  assert.equal(upClosed, 1, 'a conexão com a origem deveria ter fechado');
});

test('HEAD, método errado e PROXY_HTTP=0', async () => {
  let r = await fetch(`http://127.0.0.1:${relayPort}/api/stream?t=filme&l=2&n=0`, { method: 'HEAD' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('accept-ranges'), 'bytes');
  r = await fetch(`http://127.0.0.1:${relayPort}/api/stream?t=filme&l=2&n=0`, { method: 'POST' });
  assert.equal(r.status, 405);
  process.env.PROXY_HTTP = '0';
  try { assert.equal((await get('t=filme&l=2&n=0', { Range: 'bytes=0-9' })).status, 404); } finally { delete process.env.PROXY_HTTP; }
});
