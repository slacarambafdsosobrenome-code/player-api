'use strict';
// Lê as planilhas do Google (precisam estar com "Qualquer pessoa com o link → Leitor") e entrega
// os dados de UMA linha: título, capa, sinopse… e a célula de links.
//
//   filme : /filme/2555        → linha 2555 da aba de filmes, links na coluna P
//   série : /serie/3/150       → linha 150 da aba "episodios3",  links na coluna E
//
// Número da linha = o número que aparece na planilha (a linha 1 é o cabeçalho, os links começam na 2).
const Sources = require('../public/player/sources.js');

class SheetError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SheetError';
    this.status = status;
    this.code = code;
  }
}

// "P" → 15, "E" → 4, "AA" → 26
function colIndex(letters) {
  const s = String(letters || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) throw new Error('coluna inválida: ' + letters);
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// CSV de verdade: aspas, vírgulas e quebras de linha dentro da célula.
// IMPORTANTE: NÃO descarta linhas vazias — o número da linha da planilha precisa bater com a posição aqui.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); } // última linha sem quebra no final
  return rows;
}

// ---------------------------------------------------------------- download + cache
const cache = new Map(); // "id:gid" → { ts, rows }
const pending = new Map(); // "id:gid" → Promise (evita baixar a mesma aba 2x ao mesmo tempo)

async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/csv, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; pipoca-player)',
      },
    });
    const ct = String(r.headers.get('content-type') || '');
    const body = await r.text();
    if (!r.ok) {
      if (r.status === 404) throw new SheetError(502, 'planilha-nao-encontrada', 'A planilha (ou a aba) não foi encontrada. Confira o ID e o gid.');
      throw new SheetError(502, 'planilha-http', 'O Google respondeu HTTP ' + r.status + ' ao ler a planilha.');
    }
    // planilha privada: o Google devolve a página de login (HTML) em vez do CSV
    if (/text\/html/i.test(ct) || /^\s*<(!doctype|html)/i.test(body)) {
      throw new SheetError(502, 'planilha-privada', 'Não consegui ler a planilha. Em Compartilhar, deixe "Qualquer pessoa com o link" como Leitor.');
    }
    return body;
  } catch (e) {
    if (e instanceof SheetError) throw e;
    throw new SheetError(502, 'planilha-indisponivel', 'Não consegui falar com o Google Planilhas agora.');
  } finally {
    clearTimeout(timer);
  }
}

async function loadTab(cfg, sheetId, gid) {
  const key = sheetId + ':' + gid;
  const ttl = cfg.sheets.ttl;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.rows;
  if (pending.has(key)) return pending.get(key);

  const p = (async () => {
    const url = `${cfg.sheets.base}/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    try {
      const rows = parseCsv(await download(url));
      cache.set(key, { ts: Date.now(), rows });
      return rows;
    } catch (e) {
      if (hit) return hit.rows; // o Google falhou agora: usa a última cópia boa em vez de derrubar o player
      throw e;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

function clearCache() {
  cache.clear();
  pending.clear();
}

// ---------------------------------------------------------------- dados de uma linha
const cell = (row, i) => String((row && row[i]) || '').trim();

const AUDIO = { DUB: 'Dublado', LEG: 'Legendado', DUAL: 'Dual áudio', NAC: 'Nacional' };

function splitList(s) {
  return String(s || '').split(/[,/]/).map((t) => t.trim()).filter(Boolean);
}

// Filmes — colunas da aba "SITE, DADOS!": A nome · C sinopse · D capa · E categoria · F ano · G duração · M áudio
function movieInfo(row, linha, linkIdx) {
  const tags = splitList(cell(row, 4));
  const dur = cell(row, 6);
  const audio = cell(row, 12);
  if (dur) tags.push(dur);
  if (audio) tags.push(AUDIO[audio.toUpperCase()] || audio);
  return {
    id: 'f' + linha,
    title: cell(row, 0),
    desc: cell(row, 2),
    poster: /^https?:\/\//i.test(cell(row, 3)) ? cell(row, 3) : '',
    year: cell(row, 5),
    tags: tags.slice(0, 8),
    linkText: cell(row, linkIdx),
    next: null,
  };
}

// Séries — colunas das abas "episodiosN": A nome da série · C temporada · D episódio
function episodeTitle(row) {
  const nome = cell(row, 0);
  const t = cell(row, 2);
  const e = cell(row, 3);
  const tag = (t ? 'T' + t : '') + (t && e ? ' ' : '') + (e ? 'E' + e : '');
  return { nome, tag, title: nome && tag ? nome + ' · ' + tag : nome || tag };
}

function episodeInfo(rows, aba, linha, linkIdx) {
  const row = rows[linha - 1];
  const cur = episodeTitle(row);
  const info = {
    id: 's' + aba + '-' + linha,
    title: cur.title,
    desc: '',
    poster: '',
    year: '',
    tags: cur.tag ? [cur.tag] : [],
    linkText: cell(row, linkIdx),
    next: null,
  };
  // próximo episódio = linha de baixo, se for da mesma série e tiver link
  const nrow = rows[linha];
  if (nrow && cell(nrow, linkIdx) && cur.nome && cell(nrow, 0).toLowerCase() === cur.nome.toLowerCase()) {
    info.next = { url: `/serie/${aba}/${linha + 1}`, title: episodeTitle(nrow).title };
  }
  return info;
}

function parseLine(v) {
  const m = /^[A-Za-z]?(\d{1,7})$/.exec(String(v == null ? '' : v).trim());
  return m ? parseInt(m[1], 10) : 0;
}

// → { id, title, desc, poster, year, tags, links[], next }
// Erros viram SheetError com status HTTP e mensagem em português pra mostrar na tela.
async function getItem(cfg, type, abaRaw, linhaRaw) {
  const linha = parseLine(linhaRaw);
  if (linha < 1) throw new SheetError(400, 'linha-invalida', 'Número da linha inválido.');
  if (linha === 1) throw new SheetError(404, 'linha-cabecalho', 'A linha 1 é o cabeçalho da planilha. Os links começam na linha 2.');

  let rows;
  let info;
  let colLetter;
  let aba = 0;

  if (type === 'serie') {
    aba = parseInt(String(abaRaw), 10);
    const gids = cfg.sheets.series.gids;
    if (!(aba >= 1 && aba <= gids.length)) {
      throw new SheetError(404, 'aba-invalida', `Aba inválida: use um número de 1 a ${gids.length}.`);
    }
    colLetter = cfg.sheets.series.linkCol;
    rows = await loadTab(cfg, cfg.sheets.series.id, gids[aba - 1]);
  } else {
    colLetter = cfg.sheets.filmes.linkCol;
    rows = await loadTab(cfg, cfg.sheets.filmes.id, cfg.sheets.filmes.gid);
  }

  if (linha > rows.length) {
    throw new SheetError(404, 'linha-inexistente', `A linha ${linha} não existe (a planilha vai até a linha ${rows.length}).`);
  }
  const linkIdx = colIndex(colLetter);
  info = type === 'serie' ? episodeInfo(rows, aba, linha, linkIdx) : movieInfo(rows[linha - 1], linha, linkIdx);

  if (!info.linkText) {
    throw new SheetError(404, 'sem-link', `A célula ${colLetter}${linha} está vazia: coloque o link do vídeo nela.`);
  }
  const links = Sources.parseLinks(info.linkText, Sources.MAX_LINKS);
  if (!links.length) {
    throw new SheetError(404, 'link-invalido', `A célula ${colLetter}${linha} não tem nenhum link http(s) válido.`);
  }
  return Object.assign(info, { links });
}

module.exports = { getItem, parseCsv, colIndex, parseLine, clearCache, SheetError };
