'use strict';
// Lê e valida os parâmetros do /embed. Devolve { ok:true, player } ou { ok:false, status, message, code }.
const { hex } = require('./config');

const HLS_RE = /\.m3u8(\?|#|$)/i;

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}
function text(v, max) {
  const s = first(v);
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}
function flag(v, def) {
  const s = first(v);
  if (typeof s !== 'string' || s === '') return def;
  if (/^(0|false|no|off|nao|não)$/i.test(s)) return false;
  if (/^(1|true|yes|on|sim)$/i.test(s)) return true;
  return def;
}
// URL absoluta http(s) ou '' (nunca javascript:, data:, etc.)
function httpUrl(v, max, base) {
  const s = text(v, max || 2048);
  if (!s) return '';
  try {
    const u = base ? new URL(s, base) : new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch (e) {
    return '';
  }
}
function hostAllowed(host, rules) {
  host = String(host).toLowerCase();
  return rules.some((r) => {
    r = r.toLowerCase();
    if (r.indexOf('*.') === 0) {
      const b = r.slice(2);
      return host === b || host.endsWith('.' + b);
    }
    return host === r;
  });
}

function parseSubs(q, cfg) {
  const out = [];
  const add = (s) => {
    if (!s || typeof s !== 'object') return;
    const src = httpUrl(s.src, 2048);
    if (!src || out.length >= 20) return;
    if (cfg.allowedSrcHosts.length && !hostAllowed(new URL(src).hostname, cfg.allowedSrcHosts)) return;
    out.push({
      src,
      lang: String(s.lang || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12),
      label: String(s.label || '').slice(0, 40),
      default: s.default === true,
    });
  };
  const raw = text(q.subs, 8000);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach(add);
    } catch (e) {
      /* JSON inválido: ignora as legendas */
    }
  }
  if (q.sub) add({ src: first(q.sub), lang: first(q.sublang), label: first(q.sublabel) });
  return out;
}

function parseEmbed(q, cfg, selfOrigin) {
  const src = httpUrl(q.src, 2048);
  if (!text(q.src, 2048)) {
    return { ok: false, status: 400, message: 'Faltou o parâmetro src (a URL do vídeo).', code: 'src ausente' };
  }
  if (!src) {
    return { ok: false, status: 400, message: 'O parâmetro src precisa ser uma URL http:// ou https:// válida.', code: 'src inválido' };
  }
  if (cfg.allowedSrcHosts.length && !hostAllowed(new URL(src).hostname, cfg.allowedSrcHosts)) {
    return { ok: false, status: 403, message: 'Este player não aceita vídeos desse endereço.', code: 'host não permitido' };
  }

  const type = text(q.type, 12).toLowerCase();
  const isHls = type === 'hls' || (type !== 'mp4' && type !== 'file' && HLS_RE.test(src));

  const engineQ = text(q.engine, 8).toLowerCase();
  const engine = ['auto', 'native', 'hlsjs'].indexOf(engineQ) >= 0 ? engineQ : cfg.engine;

  const id = /^[\w.:-]{1,120}$/.test(text(q.id, 121)) ? text(q.id, 120) : '';
  const startN = parseFloat(text(q.start, 12));
  const start = isFinite(startN) && startN > 0 ? Math.min(Math.floor(startN), 86400 * 3) : 0;

  const tags = text(q.tags, 400)
    .split(',')
    .map((t) => t.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 8);

  const poster = httpUrl(q.poster, 2048);

  let next = null;
  const nextUrl = httpUrl(q.next_url, 2048, selfOrigin || 'http://localhost');
  const nextTitle = text(q.next_title, 200);
  if (nextUrl || nextTitle) {
    next = { url: nextUrl, title: nextTitle, poster: httpUrl(q.next_poster, 2048) };
  }

  let parentOrigin = '';
  const o = text(q.origin, 200);
  if (o) {
    try {
      const u = new URL(o);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin === o) parentOrigin = o;
    } catch (e) {
      /* ignora */
    }
  }
  const channel = /^[\w-]{1,64}$/.test(text(q.channel, 65)) ? text(q.channel, 64) : '';

  return {
    ok: true,
    player: {
      id,
      url: src,
      isHls,
      title: text(q.title, 200),
      desc: text(q.desc, 1000),
      poster,
      backdrop: poster,
      meta: { year: text(q.year, 12), age: text(q.age, 8), tags },
      start,
      autoplay: flag(q.autoplay, true),
      muted: flag(q.muted, false),
      loop: flag(q.loop, false),
      resume: flag(q.resume, true),
      subs: parseSubs(q, cfg),
      next,
      engine,
      hlsCdns: cfg.hlsCdns,
      site: cfg.siteUrl,
      tele: cfg.telemetry,
      brand: text(q.brand, 30) || cfg.brand,
      accent: hex(text(q.accent, 8), cfg.accent),
      channel,
      parentOrigin,
    },
  };
}

module.exports = { parseEmbed, hostAllowed };
