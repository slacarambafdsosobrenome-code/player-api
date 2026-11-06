'use strict';
// GET /filme/{linha}          → toca os links da coluna P da linha {linha} da planilha de filmes
// GET /serie/{aba}/{linha}    → toca os links da coluna E da linha {linha} da aba {aba} (1 a 17) da planilha de séries
// POST …                      → telemetria técnica anônima (igual ao /embed)
//
// Na Vercel essas rotas chegam aqui por "rewrites" (vercel.json); no servidor local, por scripts/dev.js.
// Cada célula pode ter vários links separados por vírgula: o player tenta um por um.
const getConfig = require('../lib/config');
const { parseEmbed } = require('../lib/params');
const { renderPlayer, renderError } = require('../lib/render');
const { assetVersion } = require('../lib/assets');
const { getItem, SheetError } = require('../lib/sheets');
const { queryOf, selfOrigin, send, telemetry, baseHeaders } = require('../lib/http');

const first = (v) => (Array.isArray(v) ? v[0] : v);

// Descobre { type, aba, linha } pelos parâmetros do rewrite OU, se a Vercel entregar a URL original, pelo caminho.
function routeOf(req, query) {
  let type = first(query.type);
  let aba = first(query.aba);
  let linha = first(query.linha);
  if (!type || !linha) {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    let m = /\/serie\/([^/]+)\/([^/]+)\/?$/.exec(path);
    if (m) { type = 'serie'; aba = m[1]; linha = m[2]; }
    else if ((m = /\/filme\/([^/]+)\/?$/.exec(path))) { type = 'filme'; linha = m[1]; }
  }
  return { type: type === 'serie' ? 'serie' : 'filme', aba, linha };
}

module.exports = async function handler(req, res) {
  const cfg = getConfig();
  baseHeaders(res, cfg);

  if (req.method === 'POST') return telemetry(req, res, cfg);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Método não permitido', { Allow: 'GET, HEAD, POST' });
  }

  // na Vercel o rewrite coloca :aba/:linha em req.query; a query da URL (?autoplay=0…) também vem junto
  const query = Object.assign(queryOf(req), req.query || {});
  const route = routeOf(req, query);
  const fail = (status, message, code, retry) =>
    send(res, status, 'text/html; charset=utf-8', renderError(message, code, cfg, { retry }), { 'Cache-Control': 'no-store' });

  let item;
  try {
    item = await getItem(cfg, route.type, route.aba, route.linha);
  } catch (e) {
    if (e instanceof SheetError) return fail(e.status, e.message, e.code, e.status >= 500 || e.code === 'planilha-indisponivel');
    console.error('[watch]', e);
    return fail(500, 'Algo inesperado aconteceu ao abrir este vídeo.', 'erro interno', true);
  }

  // o que vem da planilha manda (src, título, capa…); o resto (autoplay, muted, start, accent…) pode vir na URL
  const q = Object.assign({}, query, {
    src: item.links.join('\n'),
    id: item.id,
    title: item.title || (route.type === 'serie' ? 'Série' : 'Filme'),
    desc: item.desc,
    poster: item.poster,
    year: item.year,
    tags: item.tags.join(','),
    next_url: item.next ? item.next.url : '',
    next_title: item.next ? item.next.title : '',
    next_poster: '',
  });

  const parsed = parseEmbed(q, cfg, selfOrigin(req));
  if (!parsed.ok) return fail(parsed.status, parsed.message, parsed.code, false);

  return send(res, 200, 'text/html; charset=utf-8', renderPlayer(parsed.player, cfg, assetVersion()), {
    // os links só mudam quando você edita a planilha: o CDN guarda 1 min e serve a cópia antiga enquanto atualiza
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
  });
};
