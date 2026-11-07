'use strict';
// Configuração do servidor (variáveis de ambiente). Tudo é opcional.
// Lida a cada chamada para poder mudar em testes; é barato.
const pkg = require('../package.json');

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function str(name, def) {
  const v = process.env[name];
  return v === undefined || String(v).trim() === '' ? def : String(v).trim();
}
function bool(name, def) {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === '') return def;
  return /^(1|true|yes|on|sim)$/i.test(String(v).trim());
}
// URL de imagem: undefined → padrão; "", none, off, 0 → sem imagem; URL http(s) → ela mesma
function img(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  const t = String(v).trim();
  if (/^(|none|off|0|false)$/i.test(t)) return '';
  return /^https?:\/\//i.test(t) ? t : def;
}
function num(name, def, min, max) {
  const n = parseFloat(process.env[name]);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function list(name) {
  return String(process.env[name] || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}
function hex(v, def) {
  if (!v || !HEX.test(v)) return def;
  return v.charAt(0) === '#' ? v : '#' + v;
}

// Planilha de filmes (aba "SITE, DADOS!") — links na coluna P, a partir da linha 2
const FILMES_SHEET_ID = '1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU';
const FILMES_GID = '300449936';
// Planilha de séries ("Episodios Divididos") — 17 abas, links na coluna E, a partir da linha 2.
// A posição na lista é o "número da aba" da rota: /serie/1/… = primeiro gid, /serie/17/… = último.
const SERIES_SHEET_ID = '1V63nNbhO7CSTuZ_srWERFGwZ9BVIzQ9pDy0L5XCc3j0';
const SERIES_GIDS = [
  '0', '960870531', '1545106536', '1178006905', '195568786', '1541187609', '527077688', '1627684064', '1472501831',
  '1868310468', '1184026804', '1274699946', '1440381138', '1905552367', '352960003', '61753690', '921858127',
];

function getConfig() {
  const engine = str('HLS_ENGINE', 'auto').toLowerCase();
  return {
    version: pkg.version,
    brand: str('BRAND', 'PipocaFlix').slice(0, 30),
    accent: hex(str('ACCENT', ''), '#ff2a2a'),
    siteUrl: /^https?:\/\//i.test(str('SITE_URL', '')) ? str('SITE_URL', '') : '',
    sleepImg: img('SLEEP_IMG', 'https://i.ibb.co/GvwSZ1yM/transferir.png'),
    errorImg: img('ERROR_IMG', 'https://i.pinimg.com/736x/20/d2/fd/20d2fdf6742140fd80973142ea36ceab.jpg'),
    allowedSrcHosts: list('ALLOWED_SRC_HOSTS'),
    frameAncestors: list('FRAME_ANCESTORS').join(' ') || '*',
    engine: ['auto', 'native', 'hlsjs'].indexOf(engine) >= 0 ? engine : 'auto',
    // "no-referrer": vários servidores de vídeo recusam (ou aceitam) conforme o site de origem; sem referrer é o mais compatível
    referrerPolicy: str('REFERRER_POLICY', 'no-referrer'),
    // quanto esperar cada link antes de passar pro próximo (segundos → ms)
    srcTimeout: num('SRC_TIMEOUT', 25, 5, 120) * 1000,
    // 1 = iframes (Drive / OK.ru) sempre depois dos links que o player consegue controlar
    iframeLast: bool('IFRAME_LAST', false),
    // Links http:// não tocam numa página https (o navegador bloqueia) e muitos servidores de vídeo não têm https.
    // Com PROXY_HTTP ligado, o servidor do player repassa o vídeo (só links que estão na planilha, em pedaços de PROXY_CHUNK_MB).
    proxyHttp: bool('PROXY_HTTP', true),
    proxyChunk: Math.round(num('PROXY_CHUNK_MB', 4, 1, 32) * 1024 * 1024),
    proxyAllowPrivate: bool('PROXY_ALLOW_PRIVATE', false), // só pra testes locais (libera 127.0.0.1)
    sheets: {
      base: str('SHEETS_BASE', 'https://docs.google.com/spreadsheets/d').replace(/\/+$/, ''),
      ttl: num('SHEET_TTL', 120, 0, 3600) * 1000,
      filmes: {
        id: str('FILMES_SHEET_ID', FILMES_SHEET_ID),
        gid: str('FILMES_GID', FILMES_GID),
        linkCol: str('FILMES_LINK_COL', 'P').toUpperCase(),
      },
      series: {
        id: str('SERIES_SHEET_ID', SERIES_SHEET_ID),
        gids: list('SERIES_GIDS').length ? list('SERIES_GIDS') : SERIES_GIDS,
        linkCol: str('SERIES_LINK_COL', 'E').toUpperCase(),
      },
    },
    telemetry: bool('TELEMETRY', false),
    // hls.js: o arquivo do próprio projeto vem primeiro; CDNs só entram se ele falhar
    hlsCdns: [
      '/vendor/hls.min.js',
      'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js',
      'https://unpkg.com/hls.js@1.5.8/dist/hls.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.8/hls.min.js',
    ],
  };
}

module.exports = getConfig;
module.exports.hex = hex;
