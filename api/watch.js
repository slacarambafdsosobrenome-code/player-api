'use strict';
// GET /P1555        → toca os links da coluna P da linha 1555 da planilha de filmes   (também: /1555 e /filme/1555)
// GET /5/12         → toca os links da coluna E da linha 12 da aba 5 (1 a 17) da planilha de séries   (também: /serie/5/12)
// POST …            → telemetria técnica anônima (igual ao /embed)
//
// Na Vercel qualquer endereço que não seja um arquivo chega aqui por um "rewrite" (vercel.json); a rota é lida do
// caminho. No servidor local, por scripts/dev.js.
// Cada célula pode ter vários links separados por vírgula: o player tenta um por um.
const getConfig = require('../lib/config');
const { parseEmbed } = require('../lib/params');
const { renderPlayer, renderError } = require('../lib/render');
const { assetVersion } = require('../lib/assets');
const { getItem, parseLine, SheetError } = require('../lib/sheets');
const { queryOf, selfOrigin, send, telemetry, baseHeaders } = require('../lib/http');

const first = (v) => (Array.isArray(v) ? v[0] : v);

// Descobre { type, aba, linha } pelo caminho da URL:  /P1555 · /1555 · /5/12 · /filme/1555 · /serie/5/12
// Na Vercel o caminho pode chegar em req.url (original) ou no parâmetro "path" do rewrite (às vezes como lista):
// testa as duas formas e fica com a primeira que for uma rota válida.
function parsePath(path) {
  let m = /^\/(?:serie\/)?(\d{1,3})\/([Pp]?\d{1,7})\/?$/.exec(path);
  if (m) return { type: 'serie', aba: m[1], linha: m[2] };
  m = /^\/(?:filme\/)?([Pp]?\d{1,7})\/?$/.exec(path);
  if (m) return { type: 'filme', aba: '', linha: m[1] };
  return null;
}
function routeOf(req, query) {
  const candidates = [new URL(req.url || '/', 'http://localhost').pathname];
  const p = query.path;
  if (p != null && p !== '') candidates.push('/' + [].concat(p).join('/').replace(/^\/+/, ''));
  for (const c of candidates) {
    const r = parsePath(c);
    if (r) return r;
  }
  // chamada direta de /api/watch?type=…&aba=…&linha=… (testes)
  if (first(query.linha)) return { type: first(query.type) === 'serie' ? 'serie' : 'filme', aba: first(query.aba), linha: first(query.linha) };
  return null;
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

  if (!route) {
    return fail(404, 'Endereço inválido. Use /P1555 (filmes: P + número da linha) ou /5/12 (séries: número da aba / número da linha).', 'rota', false);
  }

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

  // relay pra links http:// (o player escolhe o link nº N: /api/stream?…&n=N). Só existe pra links que vieram da planilha.
  const lineNo = String(parseLine(route.linha));
  parsed.player.proxy = cfg.proxyHttp
    ? { base: route.type === 'serie' ? `/api/stream?t=serie&a=${parseInt(route.aba, 10)}&l=${lineNo}` : `/api/stream?t=filme&l=${lineNo}` }
    : null;

  return send(res, 200, 'text/html; charset=utf-8', renderPlayer(parsed.player, cfg, assetVersion()), {
    // os links só mudam quando você edita a planilha: o CDN guarda 1 min e serve a cópia antiga enquanto atualiza
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
  });
};
