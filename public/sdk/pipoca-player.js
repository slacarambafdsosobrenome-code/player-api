/*!
 * pipoca-player SDK — controla o player (/embed) por postMessage.
 *
 *   <script src="https://SEU-PLAYER.vercel.app/sdk/pipoca-player.js"></script>
 *   <div id="box" style="aspect-ratio:16/9"></div>
 *   <script>
 *     const player = new PipocaPlayer('#box', { src: 'https://…/video.m3u8', title: 'Meu vídeo' });
 *     player.on('ended', () => console.log('acabou'));
 *     await player.play();
 *   </script>
 *
 * Sem dependências. Funciona como <script>, CommonJS ou import (passe baseUrl nesses dois últimos).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipocaPlayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NS = 'pipoca-player';

  // De onde este script foi carregado = onde o player está hospedado
  var SCRIPT_ORIGIN = '';
  try {
    if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
      SCRIPT_ORIGIN = new URL(document.currentScript.src).origin;
    }
  } catch (e) { /* ignora */ }

  var PARAM_MAP = ['src', 'type', 'title', 'desc', 'poster', 'year', 'age', 'id', 'start', 'accent', 'brand', 'engine'];
  var FLAGS = ['autoplay', 'muted', 'loop', 'resume'];

  function toQuery(o) {
    var q = [];
    function add(k, v) {
      if (v === undefined || v === null || v === '') return;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    PARAM_MAP.forEach(function (k) { add(k, o[k]); });
    FLAGS.forEach(function (k) { if (o[k] !== undefined) add(k, o[k] ? '1' : '0'); });
    if (o.tags) add('tags', [].concat(o.tags).join(','));
    if (o.subs && o.subs.length) add('subs', JSON.stringify(o.subs));
    if (o.next) {
      add('next_url', o.next.url);
      add('next_title', o.next.title);
      add('next_poster', o.next.poster);
    }
    add('channel', o.channel);
    add('origin', o.origin);
    return q.join('&');
  }

  function cleanBase(b) {
    return String(b || '').replace(/\/+$/, '');
  }

  /** Monta a URL do /embed (útil para <iframe> escrito à mão). */
  function embedUrl(options, baseUrl) {
    var base = cleanBase(baseUrl || (options && options.baseUrl) || SCRIPT_ORIGIN);
    if (!base) throw new Error('PipocaPlayer.embedUrl: informe baseUrl (ex.: https://seu-player.vercel.app)');
    if (!options || !options.src) throw new Error('PipocaPlayer.embedUrl: src é obrigatório');
    return base + '/embed?' + toQuery(options);
  }

  function PipocaPlayer(target, options) {
    if (!(this instanceof PipocaPlayer)) return new PipocaPlayer(target, options);
    options = options || {};
    var self = this;
    var base = cleanBase(options.baseUrl || SCRIPT_ORIGIN);
    if (!base) throw new Error('PipocaPlayer: informe baseUrl (ex.: https://seu-player.vercel.app)');
    if (!options.src) throw new Error('PipocaPlayer: src é obrigatório');
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('PipocaPlayer: elemento não encontrado: ' + target);

    this.baseUrl = base;
    this.channel = 'pp' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    this.ready = false;
    this._origin = new URL(base).origin;
    this._listeners = {};
    this._pending = {};
    this._queue = [];
    this._seq = 0;
    this._destroyed = false;

    var params = {};
    Object.keys(options).forEach(function (k) { params[k] = options[k]; });
    params.channel = this.channel;
    params.origin = location.origin;

    var iframe = document.createElement('iframe');
    iframe.src = base + '/embed?' + toQuery(params);
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', options.title || 'Player de vídeo');
    iframe.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#000';
    this.iframe = iframe;

    this._onMessage = function (e) {
      if (e.source !== iframe.contentWindow || e.origin !== self._origin) return;
      var m = e.data;
      if (!m || typeof m !== 'object' || m.ns !== NS || m.channel !== self.channel) return;
      if (m.kind === 'response') {
        var p = self._pending[m.reqId];
        if (!p) return;
        delete self._pending[m.reqId];
        clearTimeout(p.timer);
        if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error || 'erro no player'));
      } else if (m.kind === 'event') {
        if (m.event === 'ready') {
          self.ready = true;
          var q = self._queue; self._queue = [];
          q.forEach(function (fn) { fn(); });
        }
        self._emit(m.event, m.data || {});
      }
    };
    window.addEventListener('message', this._onMessage);
    host.appendChild(iframe);
  }

  PipocaPlayer.embedUrl = embedUrl;

  var proto = PipocaPlayer.prototype;

  // ---------- eventos ----------
  proto.on = function (ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    return this;
  };
  proto.off = function (ev, fn) {
    var l = this._listeners[ev];
    if (!l) return this;
    this._listeners[ev] = fn ? l.filter(function (f) { return f !== fn && f._orig !== fn; }) : [];
    return this;
  };
  proto.once = function (ev, fn) {
    var self = this;
    function w(d) { self.off(ev, w); fn(d); }
    w._orig = fn;
    return this.on(ev, w);
  };
  proto._emit = function (ev, data) {
    var l = (this._listeners[ev] || []).slice();
    var all = (this._listeners['*'] || []).slice();
    l.forEach(function (fn) { try { fn(data); } catch (e) { setTimeout(function () { throw e; }); } });
    all.forEach(function (fn) { try { fn(ev, data); } catch (e) { setTimeout(function () { throw e; }); } });
  };

  // ---------- comandos ----------
  proto.command = function (cmd, args, timeout) {
    var self = this;
    if (this._destroyed) return Promise.reject(new Error('player destruído'));
    return new Promise(function (resolve, reject) {
      function send() {
        var id = 'r' + (++self._seq);
        var win = self.iframe.contentWindow;
        if (!win) { reject(new Error('iframe indisponível')); return; }
        self._pending[id] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            delete self._pending[id];
            reject(new Error('o player não respondeu a "' + cmd + '"'));
          }, timeout || 15000)
        };
        win.postMessage({ ns: NS, kind: 'command', channel: self.channel, reqId: id, cmd: cmd, args: args || {} }, self._origin);
      }
      if (self.ready) send(); else self._queue.push(send);
    });
  };

  proto.play = function () { return this.command('play', null, 60000); };
  proto.pause = function () { return this.command('pause'); };
  proto.toggle = function () { return this.command('toggle'); };
  proto.seek = function (time) { return this.command('seek', { time: time }); };
  proto.seekBy = function (delta) { return this.command('seekBy', { delta: delta }); };
  proto.setVolume = function (volume) { return this.command('setVolume', { volume: volume }); };
  proto.mute = function () { return this.command('mute'); };
  proto.unmute = function () { return this.command('unmute'); };
  proto.setRate = function (rate) { return this.command('setRate', { rate: rate }); };
  proto.captions = function (on) { return this.command('captions', on === undefined ? {} : { on: !!on }); };
  proto.setCinema = function (on) { return this.command('setCinema', { on: !!on }); };
  proto.getState = function () { return this.command('getState'); };
  /** Troca o vídeo sem recarregar o iframe. Aceita as mesmas opções do construtor. */
  proto.load = function (options) { return this.command('load', options || {}); };

  proto.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    window.removeEventListener('message', this._onMessage);
    var self = this;
    Object.keys(this._pending).forEach(function (id) {
      clearTimeout(self._pending[id].timer);
      self._pending[id].reject(new Error('player destruído'));
    });
    this._pending = {};
    if (this.iframe && this.iframe.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this._listeners = {};
  };

  return PipocaPlayer;
});
