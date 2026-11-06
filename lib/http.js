'use strict';
// Pedaços de HTTP usados por api/embed.js e api/watch.js (rodam igual na Vercel, no dev local e nos testes).

function queryOf(req) {
  const q = {};
  const u = new URL(req.url || '/', 'http://localhost');
  u.searchParams.forEach((v, k) => {
    if (k in q) q[k] = [].concat(q[k], v);
    else q[k] = v;
  });
  return q;
}

function selfOrigin(req) {
  const h = req.headers || {};
  const host = h['x-forwarded-host'] || h.host;
  if (!host) return 'http://localhost';
  const proto = h['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}

function send(res, status, type, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  if (headers) Object.keys(headers).forEach((k) => res.setHeader(k, headers[k]));
  res.end(body);
}

async function readBody(req) {
  let body = req.body;
  if (body === undefined || body === null || body === '') {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 8192) break;
      chunks.push(c);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') return JSON.parse(body.slice(0, 2000));
  return body;
}

// Telemetria técnica anônima (só loga se TELEMETRY=1 e o espectador autorizou no menu)
async function telemetry(req, res, cfg) {
  if (cfg.telemetry) {
    try {
      const body = await readBody(req);
      const clean = {};
      ['ev', 'stage', 'code', 'eng', 'lay'].forEach((k) => {
        if (body[k]) clean[k] = String(body[k]).slice(0, 40);
      });
      ['ms', 'stalls', 'v'].forEach((k) => {
        if (isFinite(body[k])) clean[k] = Math.round(+body[k]);
      });
      console.log('[telemetria]', JSON.stringify(clean));
    } catch (e) {
      /* ignora lixo */
    }
  }
  res.statusCode = 204;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

// cabeçalhos de segurança comuns às páginas do player
function baseHeaders(res, cfg) {
  res.setHeader('Content-Security-Policy', `frame-ancestors ${cfg.frameAncestors}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', cfg.referrerPolicy);
}

module.exports = { queryOf, selfOrigin, send, readBody, telemetry, baseHeaders };
