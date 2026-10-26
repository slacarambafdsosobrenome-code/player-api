'use strict';
// Monta o HTML do player (/embed) e a tela de erro do servidor.
// CSS e JS do player são arquivos estáticos em /public/player (cacheados pelo CDN da Vercel).
const SPRITE = require('./sprite');
const { escapeHtml, safeJson } = require('./util');

const MPH = 'M8 5L13.5 8.4L13.5 15.6L8 19ZM13.5 8.4L19 12L19 12L13.5 15.6Z';

function ic(id) {
  return `<svg aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
}

// p = config do player (ver lib/params.js); cfg = config do servidor; v = versão dos assets
function renderPlayer(p, cfg, v) {
  const brand = p.brand || cfg.brand;
  const title = p.title || brand;
  const safeTitle = escapeHtml(p.title || '');
  let vidOrigin = '';
  try {
    vidOrigin = new URL(p.url).origin;
  } catch (e) {
    /* ignora */
  }
  const sleepImg = cfg.sleepImg
    ? `<img src="${escapeHtml(cfg.sleepImg)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
    : '';
  const errorImg = cfg.errorImg
    ? `<img src="${escapeHtml(cfg.errorImg)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
${vidOrigin ? `<link rel="preconnect" href="${escapeHtml(vidOrigin)}" crossorigin>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/player/player.css?v=${escapeHtml(v)}">
<style>:root{--accent:${escapeHtml(p.accent)}}</style>
</head>
<body>
${SPRITE}
<div id="app" class="is-ui" data-phase="boot" data-panel="" data-lay="phone" data-sz="s">
<div id="rig">
  <div class="backdrop" id="backdrop"></div>
  <video id="v" playsinline webkit-playsinline x-webkit-airplay="allow" preload="auto"></video>
  <div id="tint"></div>
  <div class="tap" id="tap"></div>

  <div class="fx l" id="fxL" aria-hidden="true">${ic('b10')}<span></span></div>
  <div class="fx r" id="fxR" aria-hidden="true">${ic('f10')}<span></span></div>
  <div class="pipnote" aria-hidden="true">Reproduzindo em janela flutuante</div>

  <div class="gtop"></div>
  <div class="gbot"></div>

  <header class="top" id="top">
    <div class="ttl"><h1 id="ttl">${safeTitle}</h1><div class="endat" id="endAt"></div></div>
    <div class="clock" id="clock" aria-hidden="true"></div>
    <div class="tacts">
      <button class="btn" id="btnInfo" type="button" aria-label="Informações" title="Informações (I)" aria-expanded="false">${ic('info')}</button>
      <button class="btn" id="btnScenes" type="button" aria-label="Mapa das cenas" title="Mapa das cenas (S)" aria-expanded="false">${ic('grid')}</button>
      <button class="btn" id="btnModes" type="button" aria-label="Modos de exibição" title="Modos de exibição (O)" aria-expanded="false">${ic('tune')}<i class="dot"></i></button>
      <button class="btn" id="btnSet" type="button" aria-label="Configurações" title="Configurações" aria-haspopup="menu" aria-expanded="false" aria-controls="menu">${ic('gear')}</button>
    </div>
  </header>

  <div class="stage">
    <div class="nap" id="nap" aria-hidden="true">
      ${sleepImg}
      <div class="txt"><b>As imagens foram tirar uma soneca.</b><span>Clique em reproduzir para despertá-las. 🌙</span></div>
    </div>
    <div class="mid" id="mid">
      <button class="mbtn m5" id="mBack5" type="button" aria-label="Voltar 5 segundos">${ic('b5')}</button>
      <button class="mbtn" id="mBack" type="button" aria-label="Voltar 10 segundos">${ic('b10')}</button>
      <button class="mbtn main" id="mPlay" type="button" aria-label="Reproduzir"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="mph" d="${MPH}"/></svg></button>
      <button class="mbtn" id="mFwd" type="button" aria-label="Avançar 10 segundos">${ic('f10')}</button>
    </div>
  </div>

  <div class="loader" id="loader" role="status" aria-live="polite">
    <div class="lbox">
      <div class="brand">${escapeHtml(brand.toUpperCase())}</div>
      <svg class="pop" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs><clipPath id="bk"><path d="M13 30h38l-4.5 29h-29z"/></clipPath></defs>
        <circle class="pk a" cx="32" cy="24" r="3.2"/>
        <circle class="pk b" cx="32" cy="24" r="3.6"/>
        <circle class="pk c" cx="32" cy="24" r="3.2"/>
        <g fill="#ffe9a8" stroke="#f1c25e" stroke-width="1.2">
          <circle cx="19" cy="29" r="6"/><circle cx="27" cy="25" r="7"/><circle cx="37" cy="25" r="7"/><circle cx="45" cy="29" r="6"/><circle cx="32" cy="29" r="6.5"/>
        </g>
        <g clip-path="url(#bk)">
          <rect x="10" y="28" width="44" height="34" fill="#fff"/>
          <rect x="17" y="28" width="7" height="34" fill="${escapeHtml(p.accent)}"/>
          <rect x="30" y="28" width="7" height="34" fill="${escapeHtml(p.accent)}"/>
          <rect x="43" y="28" width="7" height="34" fill="${escapeHtml(p.accent)}"/>
        </g>
        <path d="M13 30h38l-4.5 29h-29z" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      </svg>
      <div class="msg" id="msg">Preparando a sessão…</div>
    </div>
  </div>

  <div class="menu" id="menu" role="menu" aria-label="Configurações"></div>

  <aside class="drawer" id="drawer" aria-hidden="true" aria-labelledby="dTitle">
    <div class="dh"><h2 id="dTitle">Painel</h2><button class="btn" id="dClose" type="button" aria-label="Fechar painel">${ic('close')}</button></div>
    <div class="dbody">
      <section class="dsec" id="pScenes"><p class="sub" id="scSub">Escolha uma cena para pular até lá.</p><div class="grid" id="scGrid"></div></section>
      <section class="dsec" id="pInfo"><div id="infoBody"></div></section>
      <section class="dsec" id="pModes"><div id="modesBody"></div></section>
    </div>
  </aside>

  <div class="ovl" id="next" role="dialog" aria-label="Próximo vídeo"><div class="card" id="nextCard"></div></div>

  <div class="ovl" id="resume" role="dialog" aria-modal="true" aria-label="Continuar de onde parou">
    <div class="card">
      <h2>Continuar de <span id="resTime">0:00</span>?</h2>
      <p>Você parou aqui da última vez.</p>
      <div class="cta">
        <button class="pbtn" id="btnResume" type="button">Continuar</button>
        <button class="gbtn" id="btnRestart" type="button">Do início</button>
      </div>
    </div>
  </div>

  <div class="ovl" id="err" role="alertdialog" aria-modal="true" aria-label="Erro ao carregar o vídeo">
    <div class="card">
      ${errorImg}
      <h2>Algo deu errado 😕</h2>
      <p id="errMsg">Não foi possível carregar o vídeo. Tente novamente.</p>
      <button class="pbtn" id="btnRetry" type="button" aria-label="Tentar novamente">Tentar novamente</button>
      <div><span class="stg" id="errStage"></span></div>
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <div class="controls" id="controls" role="group" aria-label="Controles do player">
    <div class="prow">
      <span class="tm" id="cur" aria-hidden="true">0:00</span>
      <div class="prog" id="prog" role="slider" tabindex="0" aria-label="Barra de progresso" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00">
        <div class="track">
          <div class="hover" id="hover"></div>
          <div class="buf" id="buf"></div>
          <div class="fill" id="fill"></div>
        </div>
        <div class="thumb" id="thumb"></div>
        <div class="tip" id="tip" aria-hidden="true">0:00</div>
      </div>
      <span class="tm" id="rem" title="Tempo restante" aria-hidden="true">-0:00</span>
    </div>
    <div class="cl">
      <button class="btn" id="btnPlay" type="button" aria-label="Reproduzir" title="Reproduzir (espaço)"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="mph" d="${MPH}"/></svg></button>
      <button class="btn" id="btnBack" type="button" aria-label="Voltar 10 segundos" title="Voltar 10s (J)">${ic('b10')}</button>
      <button class="btn" id="btnFwd" type="button" aria-label="Avançar 10 segundos" title="Avançar 10s (L)">${ic('f10')}</button>
      <div class="vol">
        <button class="btn" id="btnMute" type="button" aria-label="Silenciar" title="Silenciar (M)"><svg id="iVol" aria-hidden="true" focusable="false"><use href="#i-vol"/></svg><svg id="iMute" aria-hidden="true" focusable="false" style="display:none"><use href="#i-mute"/></svg></button>
        <input id="vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      </div>
    </div>
    <div class="cr">
      <button class="btn" id="btnCast" type="button" aria-label="Transmitir para a TV" title="Transmitir para a TV" hidden>${ic('cast')}</button>
      <button class="btn" id="btnPip" type="button" aria-label="Picture-in-Picture" title="Picture-in-Picture (P)" hidden>${ic('pip')}</button>
      <button class="btn" id="btnFs" type="button" aria-label="Tela cheia" title="Tela cheia (F)"><svg class="i-enter" aria-hidden="true" focusable="false"><use href="#i-fs"/></svg><svg class="i-exit" aria-hidden="true" focusable="false"><use href="#i-fsx"/></svg></button>
    </div>
  </div>
</div>
</div>
<script type="application/json" id="pf-config">${safeJson(p)}</script>
<script src="/player/player.js?v=${escapeHtml(v)}"></script>
</body>
</html>`;
}

// Tela de erro do servidor (parâmetro faltando, host não permitido…)
function renderError(message, code, cfg) {
  const accent = cfg.accent;
  const errorImg = cfg.errorImg
    ? `<img src="${escapeHtml(cfg.errorImg)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Algo deu errado • ${escapeHtml(cfg.brand)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%;background:#000;color:#fff;font-family:Roboto,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(ellipse at 50% 30%,#2a0d0f,#000 70%)}
.card{display:flex;flex-direction:column;align-items:center;max-width:420px;width:100%;text-align:center;padding:24px 22px;border-radius:24px;background:rgba(20,20,20,.7);border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 60px rgba(0,0,0,.6)}
.card>*+*{margin-top:12px}
.brand{font-weight:900;letter-spacing:.32em;font-size:12px;color:${escapeHtml(accent)}}
img{width:min(300px,70%);max-height:34vh;object-fit:cover;border-radius:16px}
h1{font-size:22px}
p{font-size:14px;line-height:1.5;color:rgba(255,255,255,.75)}
.chip{display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.6)}
</style>
</head>
<body>
<div class="card" role="alert">
  <div class="brand">${escapeHtml(cfg.brand.toUpperCase())}</div>
  ${errorImg}
  <h1>Algo deu errado 😕</h1>
  <p>${escapeHtml(message)}</p>
  <span class="chip">${escapeHtml(String(code || '').slice(0, 60))}</span>
</div>
</body>
</html>`;
}

module.exports = { renderPlayer, renderError };
