#!/usr/bin/env node
'use strict';
// Servidor local (sem precisar de login na Vercel):  npm run dev   →  http://localhost:3000
// Faz o mesmo que a Vercel faz com este projeto: serve /public e roda api/embed.js em /embed.
// (Alternativa oficial: `npx vercel dev`.)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const embed = require('../api/embed.js');

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/embed' || url.pathname === '/api/embed') {
    Promise.resolve(embed(req, res)).catch((e) => {
      console.error(e);
      res.statusCode = 500;
      res.end('erro interno');
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (serveStatic(req, res, url.pathname)) return;
  }
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Não encontrado');
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`pipoca-player em http://localhost:${port}  (demo)  ·  /embed?src=URL_DO_VIDEO`));
module.exports = server;
