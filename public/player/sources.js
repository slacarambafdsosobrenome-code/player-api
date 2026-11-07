/* Lê a célula de links da planilha, descobre o tipo de cada link e monta a fila de tentativas.
 *
 * Um único arquivo usado em dois lugares (por isso o "UMD" aqui embaixo):
 *   - no servidor:   require('../public/player/sources.js')
 *   - no navegador:  <script src="/player/sources.js"> → window.PipocaSources
 *
 * Tipos reconhecidos:
 *   file   .mp4 .webm .mov .mkv …                    → <video> direto
 *   hls    .m3u8 / .m3u                              → hls.js (ou HLS nativo no Safari)
 *   drive  Google Drive (/file/d/ID, open?id=, uc?id=) → tenta direto; se não der, abre o player do próprio Drive (iframe)
 *   okru   ok.ru/video/ID                            → player do OK.ru (iframe)
 *   auto   link sem extensão                         → tenta como arquivo; se falhar, tenta como HLS
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipocaSources = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_LINKS = 12;
  var MAX_URL = 2048;
  var ID_RE = /^[A-Za-z0-9_-]{10,}$/;
  var FILE_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|3gp)$/i;
  // endereços colados sem "https://" (comum em planilha)
  var BARE_HOSTS = /(^|[\s,;|]+)((?:www\.|m\.)?(?:drive\.google\.com|drive\.usercontent\.google\.com|ok\.ru|odnoklassniki\.ru)\/)/gi;

  function stripWrap(s) {
    return s.replace(/^[\s"'“”‘’<]+|[\s"'“”‘’>]+$/g, '');
  }

  // "https://a.mp4, https://b.m3u8" → ["https://a.mp4", "https://b.m3u8"]
  // Só separa por vírgula / ponto e vírgula / barra vertical / espaço / quebra de linha quando o que vem
  // depois é outro http(s)://, então uma vírgula dentro de um link continua dentro do link.
  function splitLinks(text) {
    var s = String(text == null ? '' : text).replace(/\u00a0/g, ' ').trim();
    if (!s) return [];
    s = s.replace(BARE_HOSTS, function (m, pre, host) { return pre + 'https://' + host; });
    return s
      .split(/[\s,;|]+(?=["'“‘<]*https?:\/\/)/i)
      // o que sobrar depois de "vírgula + espaço" ou de uma quebra de linha não faz parte do link
      .map(function (t) { return stripWrap(t.split(/[,;|]\s|\r?\n/)[0].replace(/[,;|\s]+$/, '')); })
      .filter(Boolean);
  }

  // só http(s), tamanho razoável; devolve a URL normalizada ou ''
  function normalizeUrl(raw) {
    if (!raw || raw.length > MAX_URL) return '';
    var u;
    try { u = new URL(raw); } catch (e) { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  }

  // texto da célula → lista de URLs válidas, sem repetidas, no máximo `max`
  function parseLinks(text, max) {
    var out = [], seen = {};
    splitLinks(text).forEach(function (raw) {
      var u = normalizeUrl(raw);
      if (!u || seen[u] || out.length >= (max || MAX_LINKS)) return;
      seen[u] = 1;
      out.push(u);
    });
    return out;
  }

  function driveId(u, host) {
    var p = u.pathname.replace(/^\/u\/\d+(?=\/)/, '');
    if (host === 'docs.google.com' && !/^\/(?:uc|file\/)/.test(p)) return ''; // Docs/Planilhas não são vídeo
    var m = /\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/.exec(p);
    if (m) return m[1];
    var q = u.searchParams.get('id');
    if (q && ID_RE.test(q) && /^\/(?:open|uc|download|thumbnail)/.test(p)) return q;
    return '';
  }

  function isHlsUrl(u) {
    return /\.m3u8?$/i.test(u.pathname) || /[?&](?:format|type|ext|container)=(?:m3u8|hls)(?:&|$)/i.test(u.search);
  }

  // → { kind, url, host, id? } ou null se não for uma URL válida
  function classify(url) {
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^www\./, '');
    var id;

    if (host === 'drive.google.com' || host === 'drive.usercontent.google.com' || host === 'docs.google.com') {
      id = driveId(u, host);
      if (id) return { kind: 'drive', url: url, host: host, id: id, resourceKey: u.searchParams.get('resourcekey') || '' };
    }
    if (host === 'ok.ru' || /\.ok\.ru$/.test(host) || host === 'odnoklassniki.ru' || /\.odnoklassniki\.ru$/.test(host)) {
      var m = /\/(?:video|videoembed)\/(\d{5,})/i.exec(u.pathname);
      if (m) return { kind: 'okru', url: url, host: host, id: m[1] };
    }
    if (isHlsUrl(u)) return { kind: 'hls', url: url, host: host };
    if (FILE_EXT.test(u.pathname)) return { kind: 'file', url: url, host: host };
    return { kind: 'auto', url: url, host: host };
  }

  function driveDirect(c) {
    return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(c.id) + '&export=download&confirm=t' +
      (c.resourceKey ? '&resourcekey=' + encodeURIComponent(c.resourceKey) : '');
  }
  function drivePreview(c) {
    return 'https://drive.google.com/file/d/' + encodeURIComponent(c.id) + '/preview' +
      (c.resourceKey ? '?resourcekey=' + encodeURIComponent(c.resourceKey) : '');
  }
  function okruEmbed(c) {
    return 'https://ok.ru/videoembed/' + encodeURIComponent(c.id);
  }

  function labelOf(a, c) {
    var h = c.host || '';
    if (c.kind === 'drive') return a.mode === 'frame' ? 'Google Drive (player do Drive)' : 'Google Drive (direto)';
    if (c.kind === 'okru') return 'OK.ru';
    if (a.kind === 'proxy') return 'MP4 · ' + h + ' (pelo servidor)';
    if (a.mode === 'hls') return 'HLS · ' + h;
    if (c.kind === 'file') return 'MP4 · ' + h;
    return 'Link · ' + h;
  }

  /* Monta a fila de tentativas, na ordem dos links.
   *   mode 'native' = <video src>   |   'hls' = hls.js (ou nativo no Safari)   |   'frame' = <iframe>
   * opções:
   *   secure     página em https → links http:// viram https:// (senão o navegador bloqueia: "mixed content")
   *   type       'hls' | 'mp4' força o tipo dos links comuns (não mexe em Drive / OK.ru)
   *   nativeHls  Safari/iPhone: link sem extensão vira uma tentativa só (o nativo já lê HLS)
   *   iframeLast todos os iframes (Drive/OK.ru) ficam por último
   *   proxyUrl   function(índiceDoLink) → URL do relay do servidor (ou ''). Quando existe, cada link de arquivo ganha uma
   *              segunda tentativa "pelo servidor": é o que faz tocar vídeo de servidor que só fala http:// (ou sem https).
   * Padrão: ordem dos links; só o "player do Drive" (plano B do Drive) vai pro final, porque o iframe não avisa
   * quando falha e travaria a troca automática de link.
   */
  function buildAttempts(links, opts) {
    opts = opts || {};
    var out = [], seen = {};

    function add(a, c, link) {
      var key = a.mode + '|' + a.url;
      if (seen[key]) return;
      seen[key] = 1;
      a.link = link;
      a.host = c.host || '';
      a.label = labelOf(a, c);
      out.push(a);
    }
    function secureUrl(u) {
      if (!opts.secure || !/^http:\/\//i.test(u)) return u;
      try { if (new URL(u).port) return u; } catch (e) { return u; } // porta explícita: não dá pra adivinhar o https
      return 'https://' + u.slice(7);
    }

    (links || []).forEach(function (raw, idx) {
      var c = classify(raw);
      if (!c) return;
      if (c.kind === 'drive') {
        add({ mode: 'native', kind: 'drive', url: driveDirect(c) }, c, idx);
        add({ mode: 'frame', kind: 'drive', url: drivePreview(c), fallback: true }, c, idx);
        return;
      }
      if (c.kind === 'okru') {
        add({ mode: 'frame', kind: 'okru', url: okruEmbed(c) }, c, idx);
        return;
      }
      var kind = c.kind;
      if (opts.type === 'hls') kind = 'hls';
      else if (opts.type === 'mp4' || opts.type === 'file') kind = 'file';
      var u = secureUrl(c.url);
      var guessed = u !== c.url; // era http:// e viramos https:// "no chute": se o servidor não tiver https falha rápido
      var viaServer = opts.proxyUrl && !(kind === 'hls') ? opts.proxyUrl(idx) : '';
      if (kind === 'hls') add({ mode: 'hls', kind: 'hls', url: u, probe: guessed }, c, idx);
      else if (kind === 'file') {
        add({ mode: 'native', kind: 'file', url: u, probe: guessed }, c, idx);
        if (viaServer) add({ mode: 'native', kind: 'proxy', url: viaServer }, c, idx);
      } else {
        add({ mode: 'native', kind: 'auto', url: u, probe: guessed }, c, idx);
        if (viaServer && /^http:\/\//i.test(c.url)) add({ mode: 'native', kind: 'proxy', url: viaServer }, c, idx);
        if (!opts.nativeHls) add({ mode: 'hls', kind: 'auto', url: u, probe: guessed }, c, idx);
      }
    });

    var late = opts.iframeLast
      ? function (a) { return a.mode === 'frame'; }
      : function (a) { return !!a.fallback; };
    out = out.filter(function (a) { return !late(a); }).concat(out.filter(late));
    out.forEach(function (a, i) { a.i = i; a.n = out.length; });
    return out;
  }

  return {
    MAX_LINKS: MAX_LINKS,
    splitLinks: splitLinks,
    normalizeUrl: normalizeUrl,
    parseLinks: parseLinks,
    classify: classify,
    buildAttempts: buildAttempts,
  };
});
