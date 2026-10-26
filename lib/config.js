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
function list(name) {
  return String(process.env[name] || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}
function hex(v, def) {
  if (!v || !HEX.test(v)) return def;
  return v.charAt(0) === '#' ? v : '#' + v;
}

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
    referrerPolicy: str('REFERRER_POLICY', 'strict-origin-when-cross-origin'),
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
