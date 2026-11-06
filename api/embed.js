'use strict';
// GET  /embed?src=…        → página do player (HTML), para usar em <iframe>
//                            (src pode ter vários links separados por vírgula: o player tenta um por um)
// POST /embed              → telemetria técnica anônima (só se TELEMETRY=1 e o espectador autorizar)
//
// Usa só a API nativa do Node (statusCode/setHeader/end), então roda igual na Vercel,
// no servidor local (scripts/dev.js) e nos testes.
const getConfig = require('../lib/config');
const { parseEmbed } = require('../lib/params');
const { renderPlayer, renderError } = require('../lib/render');
const { assetVersion } = require('../lib/assets');
const { queryOf, selfOrigin, send, telemetry, baseHeaders } = require('../lib/http');

module.exports = async function handler(req, res) {
  const cfg = getConfig();
  baseHeaders(res, cfg);

  if (req.method === 'POST') return telemetry(req, res, cfg);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Método não permitido', { Allow: 'GET, HEAD, POST' });
  }

  const parsed = parseEmbed(queryOf(req), cfg, selfOrigin(req));
  if (!parsed.ok) {
    return send(res, parsed.status, 'text/html; charset=utf-8', renderError(parsed.message, parsed.code, cfg), {
      'Cache-Control': 'no-store',
    });
  }

  const html = renderPlayer(parsed.player, cfg, assetVersion());
  return send(res, 200, 'text/html; charset=utf-8', html, {
    // A página só depende da URL: o CDN pode guardar por 1 min
    'Cache-Control': 'public, max-age=0, s-maxage=60',
  });
};
