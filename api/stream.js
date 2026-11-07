'use strict';
// Relay de vídeo para servidores que só falam http:// (o navegador não toca http:// dentro de uma página https).
//
//   GET /api/stream?t=filme&l=1555&n=0            → repassa o link nº 0 da célula P1555
//   GET /api/stream?t=serie&a=5&l=12&n=1          → repassa o link nº 1 da célula E12 da aba 5
//
// NÃO é um proxy aberto: o visitante não escolhe a URL. Ele só diz "linha tal, link nº N" e o servidor
// pega a URL na SUA planilha. Também recusa endereços internos (localhost, 10.x, 192.168.x, 169.254.x…).
//
// O vídeo sai em pedaços de PROXY_CHUNK_MB (padrão 4 MB) como "206 Partial Content": o navegador pede o
// próximo pedaço sozinho. Isso mantém cada chamada curta e abaixo do limite de resposta da Vercel (4,5 MB).
const dns = require('node:dns').promises;
const net = require('node:net');
const getConfig = require('../lib/config');
const { getItem } = require('../lib/sheets');
const { filterAllowedLinks } = require('../lib/params');
const { queryOf } = require('../lib/http');

const first = (v) => (Array.isArray(v) ? v[0] : v);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function plain(res, status, msg, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) Object.keys(extra).forEach((k) => res.setHeader(k, extra[k]));
  res.end(msg);
}

// ---------------------------------------------------------------- segurança: só endereços públicos
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateIp(mapped[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return true;
}

async function assertPublic(url, cfg) {
  if (cfg.proxyAllowPrivate) return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const bad = () => Object.assign(new Error('endereço não permitido'), { code: 'PRIVATE' });
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw bad();
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw Object.assign(new Error('host não encontrado'), { code: 'DNS' });
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw bad();
}

// abre a origem seguindo até 4 redirecionamentos (conferindo cada um)
async function open(url, headers, signal, cfg) {
  let u = url;
  for (let i = 0; i <= 4; i++) {
    await assertPublic(u, cfg);
    const r = await fetch(u, { headers, redirect: 'manual', signal });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      try { await r.body.cancel(); } catch (e) { /* ok */ }
      u = new URL(loc, u).href;
      continue;
    }
    return r;
  }
  throw new Error('redirecionamentos demais');
}

// Se o link está em https:// mas o servidor só atende em http:// (conexão recusada), tenta em http://.
async function openWithFallback(url, headers, signal, cfg) {
  try {
    return await open(url, headers, signal, cfg);
  } catch (e) {
    if (e.code === 'PRIVATE' || e.code === 'DNS' || signal.aborted || !/^https:/i.test(url)) throw e;
    const u = new URL(url);
    u.protocol = 'http:';
    return open(u.href, headers, signal, cfg);
  }
}

// ---------------------------------------------------------------- handler
module.exports = async function handler(req, res) {
  const cfg = getConfig();
  if (!cfg.proxyHttp) return plain(res, 404, 'Relay desligado (PROXY_HTTP=0).');
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'Método não permitido', { Allow: 'GET, HEAD' });

  const q = Object.assign(queryOf(req), req.query || {});
  const type = first(q.t) === 'serie' ? 'serie' : 'filme';
  const n = parseInt(first(q.n), 10);
  if (!(n >= 0 && n < 50)) return plain(res, 400, 'Parâmetro n inválido');

  // a URL vem SEMPRE da planilha (aceita cópia de até 30 min pra não rebaixar a planilha inteira a cada pedaço)
  let url;
  try {
    const item = await getItem(cfg, type, first(q.a), first(q.l), { maxAge: 30 * 60 * 1000 });
    url = filterAllowedLinks(item.links, cfg)[n];
  } catch (e) {
    return plain(res, e.status || 502, e.message || 'erro ao ler a planilha');
  }
  if (!url) return plain(res, 404, 'Esse link não existe nessa linha');

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }

  // ---- qual pedaço o navegador quer
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0;
  let want = null; // último byte pedido (null = até o fim)
  let suffix = '';
  if (m && m[1] === '' && m[2] !== '') suffix = 'bytes=-' + m[2]; // "últimos N bytes": repassa como veio
  else if (m) {
    start = parseInt(m[1] || '0', 10);
    want = m[2] === '' ? null : parseInt(m[2], 10);
  }
  const cap = cfg.proxyChunk;
  const last = suffix ? null : Math.min(want == null ? Infinity : want, start + cap - 1);
  if (!suffix && last < start) return plain(res, 416, 'Intervalo inválido');

  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); }); // o navegador desistiu: para de baixar da origem
  const headTimer = setTimeout(() => ctrl.abort(), 15000);

  let up;
  try {
    up = await openWithFallback(url, {
      Range: suffix || `bytes=${start}-${last}`,
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Encoding': 'identity',
    }, ctrl.signal, cfg);
  } catch (e) {
    clearTimeout(headTimer);
    if (res.destroyed) return;
    return plain(res, e.code === 'PRIVATE' ? 403 : 502, e.code === 'PRIVATE' ? 'Endereço não permitido' : 'Não consegui abrir o vídeo na origem');
  }
  clearTimeout(headTimer);

  const ctype = String(up.headers.get('content-type') || '');
  const drop = (status, msg, extra) => { try { up.body && up.body.cancel(); } catch (e) { /* ok */ } return plain(res, status, msg, extra); };

  if (up.status === 416) {
    const cr = up.headers.get('content-range');
    return drop(416, 'Intervalo fora do arquivo', cr ? { 'Content-Range': cr } : undefined);
  }
  if (up.status !== 206 && up.status !== 200) return drop(up.status === 404 ? 404 : 502, 'A origem respondeu HTTP ' + up.status);
  if (/text\/html/i.test(ctype)) return drop(502, 'A origem devolveu uma página, não um vídeo');

  let limit = Infinity; // só usado quando a origem ignora Range e manda o arquivo inteiro
  let contentRange;
  let contentLength;
  if (up.status === 206) {
    contentRange = up.headers.get('content-range');
    contentLength = up.headers.get('content-length');
    if (!contentRange) return drop(502, 'A origem respondeu 206 sem Content-Range');
  } else {
    // a origem não sabe de "Range": só dá pra servir do começo (cortamos no tamanho do pedaço)
    const total = parseInt(up.headers.get('content-length') || '', 10);
    if (suffix || start > 0 || !(total > 0)) return drop(502, 'A origem não aceita Range (não dá pra pular pra frente nesse link)');
    const end = Math.min(last, total - 1);
    limit = end + 1;
    contentRange = `bytes 0-${end}/${total}`;
    contentLength = String(limit);
  }

  res.statusCode = 206;
  res.setHeader('Content-Type', /^(video|audio)\//i.test(ctype) ? ctype : 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Range', contentRange);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Cache-Control', 'no-store');

  let idle;
  const arm = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), 20000); }; // origem travou no meio
  arm();
  let sent = 0;
  try {
    for await (const chunk of up.body) {
      arm();
      let buf = chunk;
      if (sent + buf.length > limit) buf = buf.subarray(0, limit - sent);
      sent += buf.length;
      if (!res.write(buf)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
      if (sent >= limit || res.destroyed) break;
    }
    clearTimeout(idle);
    res.end();
  } catch (e) {
    clearTimeout(idle);
    res.destroy(); // já mandamos os cabeçalhos: o navegador vê a conexão cair e tenta de novo
  }
};

module.exports.isPrivateIp = isPrivateIp;
