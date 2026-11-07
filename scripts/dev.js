#!/usr/bin/env node
'use strict';
// Servidor local (sem precisar de login na Vercel):  npm run dev   →  http://localhost:3000
// Faz o mesmo que a Vercel faz com este projeto: serve /public, roda api/embed.js em /embed,
// api/stream.js em /api/stream e, pra qualquer outro endereço que não seja arquivo, api/watch.js
// (/P1555 → filme da linha 1555 · /5/12 → série da aba 5, linha 12).
// (Alternativa oficial: `npx vercel dev`.)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const embed = require('../api/embed.js');
const watch = require('../api/watch.js');
const stream = require('../api/stream.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
  return true;
}

function run(fn, req, res) {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end('erro interno');
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p === '/embed' || p === '/api/embed') return run(embed, req, res);
  if (p === '/api/stream') return run(stream, req, res);
  if (p === '/api/watch') return run(watch, req, res);
  // arquivos de /public primeiro (igual à Vercel); o que sobrar vai pro player: /P1555, /5/12…
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (serveStatic(req, res, p)) return;
  }
  if (/^\/(?:serie\/)?\d{1,3}\/[Pp]?\d+\/?$|^\/(?:filme\/)?[Pp]?\d+\/?$/.test(p) || req.method === 'POST') return run(watch, req, res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Não encontrado');
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`pipoca-player em http://localhost:${port}  ·  /P{linha} (filmes)  ·  /{aba}/{linha} (séries)  ·  /embed?src=URL`));
module.exports = server;
