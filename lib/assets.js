'use strict';
// Versão dos arquivos estáticos do player (CSS/JS) para quebrar o cache sozinho:
// é um hash do conteúdo, então editar player.js/player.css já invalida o cache dos navegadores.
// Se os arquivos não estiverem acessíveis na função (ex.: sem includeFiles), cai na versão do package.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { version } = require('../package.json');

let cached = null;

function assetVersion() {
  if (cached) return cached;
  try {
    const dir = path.join(__dirname, '..', 'public', 'player');
    const h = crypto.createHash('md5');
    ['player.css', 'player.js'].forEach((f) => h.update(fs.readFileSync(path.join(dir, f))));
    cached = h.digest('hex').slice(0, 10);
  } catch (e) {
    cached = version;
  }
  return cached;
}

module.exports = { assetVersion };
