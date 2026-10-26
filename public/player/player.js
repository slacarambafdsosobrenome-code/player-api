
(function(){
  'use strict';
  var C = readConfig();
  function readConfig(){
    try{ var n=document.getElementById('pf-config'); return (n && JSON.parse(n.textContent)) || {}; }catch(e){ return {}; }
  }
  // id padrão do "continuar de onde parou": hash da URL sem query (links assinados mudam a cada acesso)
  function idFromUrl(u){
    var s=String(u||''), h=5381, i;
    try{ var p=new URL(s); s=p.origin+p.pathname; }catch(e){}
    for(i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0;
    return (h>>>0).toString(36);
  }
  if(!C.id) C.id=idFromUrl(C.url);
  function $(id){ return document.getElementById(id); }
  var app=$('app'), rig=$('rig'), video=$('v'), controls=$('controls'), prog=$('prog'), fill=$('fill'), buf=$('buf'),
      hoverEl=$('hover'), thumbEl=$('thumb'), tip=$('tip'), curEl=$('cur'), remEl=$('rem'), msgEl=$('msg'),
      toastEl=$('toast'), menu=$('menu'), drawer=$('drawer'), tapEl=$('tap'), fxL=$('fxL'), fxR=$('fxR'),
      clockEl=$('clock'), endEl=$('endAt'), btnSet=$('btnSet'), btnInfo=$('btnInfo'), btnScenes=$('btnScenes'),
      btnModes=$('btnModes'), btnPip=$('btnPip'), btnCast=$('btnCast'), btnFs=$('btnFs'), btnMute=$('btnMute'),
      volIn=$('vol'), dTitle=$('dTitle'), scGrid=$('scGrid');

  var MSGS=['Preparando a sessão…','Ajustando o projetor…','Quase na primeira cena…'];
  var SPEEDS=[0.5,0.75,1,1.25,1.5,1.75,2];
  var KPOS='pf:pos:'+C.id, KVOL='pf:vol', KMODES='pf:modes', KTELE='pf:tele';

  // ---------- utilidades ----------
  function fmt(t){
    if(!isFinite(t)) return '0:00';
    t=Math.max(0,Math.floor(t));
    var h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=t%60;
    if(h) return h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
    return m+':'+(s<10?'0':'')+s;
  }
  function hhmm(d){ try{ return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return d.getHours()+':'+('0'+d.getMinutes()).slice(-2); } }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function jget(k,d){ try{ var v=JSON.parse(lsGet(k)); return v==null?d:v; }catch(e){ return d; } }
  function norm(s){
    s=String(s||'').toLowerCase();
    try{ s=s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(e){}
    return s.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  }
  function el(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
  function svgUse(id){ var s=document.createElementNS('http://www.w3.org/2000/svg','svg'); var u=document.createElementNS('http://www.w3.org/2000/svg','use'); u.setAttribute('href','#i-'+id); s.setAttribute('aria-hidden','true'); s.setAttribute('focusable','false'); s.appendChild(u); return s; }
  function focusEl(n){ if(!n) return; try{ n.focus({preventScroll:true}); }catch(e){ try{ n.focus(); }catch(_){} } }
  function safeUrl(u){ return /^https?:\/\//i.test(u||'') ? u : ''; }
  function bg(node,u){ u=safeUrl(u); if(u) node.style.backgroundImage='url('+JSON.stringify(u)+')'; }
  var _g={};
  function guard(k,ms){ var n=Date.now(); if(_g[k] && n-_g[k]<ms) return false; _g[k]=n; return true; }

  // ---------- API de mensagens (postMessage) ----------
  // Eventos saem como { ns:'pipoca-player', kind:'event', event, data, channel }.
  // Comandos entram como { ns, kind:'command', cmd, args, reqId, channel } e voltam como kind:'response'.
  var NS='pipoca-player';
  var inFrame=false; try{ inFrame=(window.parent!==window); }catch(e){ inFrame=true; }
  function postParent(msg){
    if(!inFrame) return;
    msg.ns=NS; if(C.channel) msg.channel=C.channel;
    try{ window.parent.postMessage(msg, C.parentOrigin||'*'); }catch(e){}
  }
  function emit(ev,data){ postParent({kind:'event',event:ev,data:data||{}}); }
  function snap(){
    var d=video.duration;
    return {
      currentTime:video.currentTime||0, duration:isFinite(d)?d:0, paused:video.paused, ended:video.ended,
      volume:video.volume, muted:video.muted, playbackRate:video.playbackRate, buffering:!!S.buffering,
      phase:S.phase, started:!!S.started, fullscreen:!!(S.fs||S.pfs), pip:!!S.pip, cinema:!!modes.cinema,
      title:C.title||'', src:C.url||''
    };
  }
  function setMediaMeta(){
    if(!CAP.media) return;
    try{ navigator.mediaSession.metadata=new MediaMetadata({title:C.title||'Vídeo',artist:C.brand||'',artwork:C.poster?[{src:C.poster,sizes:'500x750'}]:[]}); }catch(e){}
  }
  var toastT=0;
  function toast(t){
    toastEl.textContent=t; toastEl.classList.add('on');
    clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.classList.remove('on'); },1900);
  }

  // ---------- teste de compatibilidade: só mostra o que funciona ----------
  var UA=navigator.userAgent||'';
  var isIOS=/iPad|iPhone|iPod/.test(UA)||(navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  var isIPhone=/iPhone|iPod/.test(UA);
  var isApple=isIOS||(/Safari/.test(UA) && !/Chrome|Chromium|Android|Edg|OPR|Firefox/.test(UA));
  var isTouch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
  var CAP={
    fs: !!(app.requestFullscreen||app.webkitRequestFullscreen),
    vfs: !!video.webkitEnterFullscreen,
    pip: !!(document.pictureInPictureEnabled && video.requestPictureInPicture) || !!(video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')),
    cast: !!(video.remote && video.remote.watchAvailability) || !!window.WebKitPlaybackTargetAvailabilityEvent,
    lock: !!(window.screen && screen.orientation && screen.orientation.lock),
    mse: !!(window.MediaSource||window.ManagedMediaSource),
    nativeHls: !!video.canPlayType('application/vnd.apple.mpegurl'),
    wake: !!(navigator.wakeLock && navigator.wakeLock.request),
    media: !!navigator.mediaSession
  };
  btnPip.hidden=!CAP.pip;
  btnFs.hidden=!(CAP.fs||CAP.vfs||(window.top===window && isTouch));

  // ---------- estado central ----------
  // phase: resume | boot | playing | paused | ended | error
  var S={phase:'boot',started:false,buffering:false,ui:true,panel:'',menu:false,napReady:false,dragging:false,
         pip:false,fs:false,pfs:false,rot:false,flip:false,manualRot:false,locked:false,lockPending:false,
         waitGesture:false,nextClosed:false,soft:false,tele:false};
  var modes={cinema:false,night:false,read:false};
  var fit='contain';
  var hideT=0, napT=0, loadT=0, stallT=0, tStart=Date.now(), stalls=0, engName='';
  var hls=null, netTries=0, mediaTries=0, panelsClosedAt=0, savedPos=0, pendingPlay=false, errAt=0, swapUntil=0, lastTU=0;

  function setCls(n,on){ on=!!on; if(app.classList.contains(n)!==on) app.classList.toggle(n,on); }
  function render(){
    var ph=S.phase;
    if(app.getAttribute('data-phase')!==ph) app.setAttribute('data-phase',ph);
    if(app.getAttribute('data-panel')!==S.panel) app.setAttribute('data-panel',S.panel);
    var forced = ph!=='playing' || !!S.panel || S.menu || S.dragging;
    var buffering = ph==='boot' || (S.buffering && (ph==='playing'||ph==='paused'));
    setCls('is-ui', forced||S.ui);
    setCls('is-buffering', buffering);
    setCls('is-started', S.started);
    setCls('is-nap', ph==='paused' && S.started && S.napReady && !S.panel && !S.menu && !S.pip && !buffering && !modes.cinema);
    setCls('is-pip', S.pip);
    setCls('is-fs', S.fs||S.pfs);
    setCls('is-rot', S.rot);
    setCls('is-flip', S.rot && S.flip);
    setCls('is-soft', S.soft);
    setCls('is-next', ph==='ended' && !S.nextClosed);
    setCls('m-cinema', modes.cinema); setCls('m-night', modes.night); setCls('m-read', modes.read);
    var main=$('mPlay');
    var lab = ph==='ended' ? 'Assistir de novo' : (video.paused ? 'Reproduzir' : 'Pausar');
    if(main.getAttribute('aria-label')!==lab){ main.setAttribute('aria-label',lab); $('btnPlay').setAttribute('aria-label',lab); }
    btnSet.setAttribute('aria-expanded',S.menu?'true':'false');
    btnInfo.setAttribute('aria-expanded',S.panel==='info'?'true':'false');
    btnScenes.setAttribute('aria-expanded',S.panel==='scenes'?'true':'false');
    btnModes.setAttribute('aria-expanded',S.panel==='modes'?'true':'false');
    drawer.setAttribute('aria-hidden',S.panel?'false':'true');
    menu.classList.toggle('open',S.menu);
  }

  [app,rig].forEach(function(n){ n.addEventListener('scroll',function(){ n.scrollTop=0; n.scrollLeft=0; }); });

  // ---------- tamanho da tela → layout adaptativo ----------
  function measure(){
    var w=rig.clientWidth, h=rig.clientHeight;
    if(!w||!h) return;
    var lay;
    if(w<300||h<200) lay='tiny';
    else if(h<470 && w>h) lay='phone-l';
    else if(w<640) lay='phone';
    else if(w<1100) lay='tablet';
    else lay='desktop';
    var sz = w<480?'s':(w<900?'m':(w<1500?'l':(w<2200?'xl':'xxl')));
    var wide = ((w/h)>=2 && w>=1100) ? '1' : '0';
    if(app.getAttribute('data-lay')!==lay) app.setAttribute('data-lay',lay);
    if(app.getAttribute('data-sz')!==sz) app.setAttribute('data-sz',sz);
    if(app.getAttribute('data-wide')!==wide) app.setAttribute('data-wide',wide);
    app.style.setProperty('--rh',h+'px');
    app.style.setProperty('--rw',w+'px');
    applyFit();
  }
  if(window.ResizeObserver){ try{ new ResizeObserver(function(){ measure(); }).observe(rig); }catch(e){} }
  window.addEventListener('resize',function(){ measure(); updateRot(); });
  window.addEventListener('orientationchange',function(){ setTimeout(function(){ measure(); updateRot(); },200); });

  // ---------- ícone play/pause com morph ----------
  var PLAYP =[8,5, 13.5,8.4, 13.5,15.6, 8,19,    13.5,8.4, 19,12, 19,12, 13.5,15.6];
  var PAUSEP=[6,5, 10,5,     10,19,     6,19,    14,5,     18,5, 18,19, 14,19];
  function pathOf(a){
    return 'M'+a[0]+' '+a[1]+'L'+a[2]+' '+a[3]+'L'+a[4]+' '+a[5]+'L'+a[6]+' '+a[7]+'Z'+
           'M'+a[8]+' '+a[9]+'L'+a[10]+' '+a[11]+'L'+a[12]+' '+a[13]+'L'+a[14]+' '+a[15]+'Z';
  }
  var mphs=document.querySelectorAll('.mph'), mCur=0, mFrom=0, mTo=0, mT0=0, mRaf=0;
  function mDraw(k){
    var a=[], i, d;
    for(i=0;i<16;i++) a.push(Math.round((PLAYP[i]+(PAUSEP[i]-PLAYP[i])*k)*100)/100);
    d=pathOf(a);
    for(i=0;i<mphs.length;i++) mphs[i].setAttribute('d',d);
  }
  function morphTo(k){
    if(mTo===k && mRaf) return;
    cancelAnimationFrame(mRaf);
    mFrom=mCur; mTo=k; mT0=performance.now();
    function step(now){
      var p=Math.min(1,(now-mT0)/200);
      var e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      mCur=mFrom+(mTo-mFrom)*e;
      mDraw(mCur);
      if(p<1) mRaf=requestAnimationFrame(step); else mRaf=0;
    }
    mRaf=requestAnimationFrame(step);
  }
  function syncIcons(){ morphTo(video.paused?0:1); }

  // ---------- mensagens do carregamento (seguem o estado real) ----------
  var msgIdx=0, msgAt=Date.now(), msgT=0;
  function applyMsg(i){
    msgIdx=i; msgAt=Date.now(); msgEl.classList.add('swap');
    setTimeout(function(){ msgEl.textContent=MSGS[i]; msgEl.classList.remove('swap'); },160);
  }
  function setMsg(i){
    if(S.started){ msgEl.textContent='Carregando…'; return; }
    if(i<=msgIdx) return;
    clearTimeout(msgT);
    msgT=setTimeout(function(){ applyMsg(i); }, Math.max(0,1000-(Date.now()-msgAt)));
  }

  // ---------- visibilidade da interface ----------
  function uiLocked(){ return S.phase!=='playing' || !!S.panel || S.menu || S.dragging; }
  function bumpUI(){
    S.ui=true; clearTimeout(hideT);
    if(!uiLocked()) hideT=setTimeout(hideUI, modes.cinema?1800:3000);
    render();
  }
  function hideUI(){
    if(uiLocked()) return;
    if(window.matchMedia && matchMedia('(hover:hover)').matches && (controls.matches(':hover')||$('top').matches(':hover'))){ hideT=setTimeout(hideUI,1200); return; }
    S.ui=false; render();
  }

  // ---------- reproduzir / pausar ----------
  function tryPlay(){
    var p; pendingPlay=true;
    try{ p=video.play(); }catch(e){ pendingPlay=false; }
    if(p && p.then){ p.then(function(){ pendingPlay=false; }, onPlayReject); } else pendingPlay=false;
  }
  function onPlayReject(err){
    pendingPlay=false;
    if(!err || err.name==='AbortError' || S.phase==='error') return;
    if(err.name==='NotSupportedError'){ showError('decodificacao','NotSupported'); return; }
    // autoplay bloqueado: espera o toque do espectador
    S.waitGesture=true; S.buffering=false;
    if(S.phase==='boot') S.phase='paused';
    bumpUI();
  }
  function toggle(){
    if(!guard('toggle',160)) return;
    if(video.paused||video.ended) tryPlay(); else video.pause();
  }
  function armNap(){
    clearTimeout(napT); S.napReady=false;
    napT=setTimeout(function(){ S.napReady=true; render(); },900);
  }

  // ---------- continuar de onde parou ----------
  function savePos(){
    if(C.resume===false) return;
    var t=video.currentTime, d=video.duration;
    if(!S.started || !isFinite(t) || !isFinite(d) || d<=0) return;
    if(video.ended || d-t<90){ lsDel(KPOS); return; }
    if(t>=30) lsSet(KPOS,String(Math.floor(t)));
  }
  setInterval(function(){ if(!video.paused) savePos(); },5000);
  window.addEventListener('pagehide',function(){ savePos(); track('stalls',{stalls:stalls}); if(hls){ try{ hls.destroy(); }catch(e){} } });
  document.addEventListener('visibilitychange',function(){
    if(document.hidden) savePos(); else if(S.phase==='playing') wakeOn();
  });

  // ---------- telemetria técnica anônima (só se o espectador autorizar) ----------
  S.tele = !!C.tele && lsGet(KTELE)==='1';
  function track(ev,x){
    if(!S.tele) return;
    var o={ev:ev,eng:engName,lay:app.getAttribute('data-lay'),v:1}, k;
    if(x) for(k in x) o[k]=x[k];
    try{ navigator.sendBeacon(location.pathname,new Blob([JSON.stringify(o)],{type:'text/plain'})); }catch(e){}
  }

  // ---------- erros por etapa ----------
  var STAGES={
    biblioteca:['Componente de vídeo','Não foi possível carregar o componente de vídeo. Verifique a conexão e tente de novo.'],
    fonte:['Fonte','O link do vídeo expirou ou não pôde ser carregado.'],
    carregamento:['Carregamento','A conexão com o vídeo falhou ou ficou lenta demais.'],
    decodificacao:['Decodificação','Este aparelho ou navegador não conseguiu decodificar o vídeo.'],
    reproducao:['Reprodução','O navegador bloqueou a reprodução do vídeo.']
  };
  function showError(stage,code){
    if(S.phase==='error') return;
    clearTimeout(loadT); clearTimeout(stallT); clearTimeout(napT);
    errAt=video.currentTime||0;
    savePos();
    try{ video.pause(); }catch(e){}
    wakeOff();
    S.panel=''; S.menu=false; S.buffering=false; S.napReady=false;
    S.phase='error';
    var st=STAGES[stage]||STAGES.carregamento;
    $('errMsg').textContent=st[1]+' Tente novamente em instantes.';
    $('errStage').textContent='Etapa: '+st[0]+(code?' · '+String(code).slice(0,40):'');
    track('error',{stage:stage,code:String(code||'').slice(0,40)});
    emit('error',{stage:stage,code:String(code||'').slice(0,40),message:st[1]});
    render();
    setTimeout(function(){ focusEl($('btnRetry')); },60);
  }
  // solta o que estiver carregado (hls.js, fonte do <video>) antes de trocar/recarregar a fonte
  function teardown(){
    clearTimeout(loadT); clearTimeout(stallT); clearTimeout(napT); clearTimeout(msgT);
    swapUntil=Date.now()+400;
    if(hls){ try{ hls.destroy(); }catch(e){} hls=null; }
    netTries=0; mediaTries=0; stalls=0;
    try{ video.pause(); }catch(e){}
    try{ video.removeAttribute('src'); video.load(); }catch(e){}
  }
  function retry(){
    var at=errAt>5?errAt:0;
    teardown();
    S.panel=''; S.menu=false;
    startSource(at,true);
  }
  $('btnRetry').addEventListener('click',retry);

  // ---------- fonte de vídeo: nativo / hls.js (com vários CDNs) ----------
  function pickEngine(){
    if(!C.isHls) return 'native';
    var e=C.engine||'auto';
    if(e==='native') return CAP.nativeHls?'native':(CAP.mse?'hlsjs':'none');
    if(e==='hlsjs') return CAP.mse?'hlsjs':(CAP.nativeHls?'native':'none');
    if(isApple && CAP.nativeHls) return 'native';
    if(CAP.mse) return 'hlsjs';
    return CAP.nativeHls?'native':'none';
  }
  function loadHls(done){
    if(window.Hls){ done(true); return; }
    var list=(C.hlsCdns||[]).slice(), i=0;
    (function next(){
      if(i>=list.length){ done(false); return; }
      var s=document.createElement('script'), fired=false, to;
      function fail(){ if(fired) return; fired=true; clearTimeout(to); try{ s.parentNode.removeChild(s); }catch(e){} i++; next(); }
      s.onload=function(){ if(fired) return; fired=true; clearTimeout(to); if(window.Hls) done(true); else { i++; next(); } };
      s.onerror=fail;
      to=setTimeout(fail,9000);
      s.async=true; s.src=list[i]; document.head.appendChild(s);
    })();
  }
  function seekOnce(t){
    if(!(t>0)) return;
    function f(){ video.removeEventListener('loadedmetadata',f); try{ video.currentTime=t; }catch(e){} }
    video.addEventListener('loadedmetadata',f);
  }
  function attachNative(startAt,autoplay){
    engName='native';
    video.src=C.url; seekOnce(startAt);
    if(autoplay) tryPlay();
  }
  function attachHls(startAt,autoplay){
    engName='hlsjs';
    var small = isTouch || (navigator.deviceMemory && navigator.deviceMemory<=2);
    hls=new Hls({
      enableWorker:true,
      capLevelToPlayerSize:true,          // não baixa 1080p em tela pequena
      startLevel:-1,                      // qualidade automática
      maxBufferLength: small?30:50,
      maxMaxBufferLength: small?60:120,
      backBufferLength: small?30:90,      // guarda o que já passou: voltar uma cena recente não trava
      startPosition: startAt>0?startAt:-1
    });
    hls.on(Hls.Events.MANIFEST_PARSED,function(){ setMsg(1); if(autoplay) tryPlay(); });
    hls.on(Hls.Events.FRAG_LOADED,function(){ netTries=0; });
    hls.on(Hls.Events.ERROR,function(_,d){
      if(!d || !d.fatal) return;
      if(d.type===Hls.ErrorTypes.NETWORK_ERROR){
        if(netTries<3){ netTries++; setTimeout(function(){ try{ hls.startLoad(); }catch(e){} },800*netTries); return; }
        showError('carregamento',d.details); return;
      }
      if(d.type===Hls.ErrorTypes.MEDIA_ERROR){
        if(mediaTries<2){ mediaTries++; try{ if(mediaTries===2) hls.swapAudioCodec(); hls.recoverMediaError(); }catch(e){} return; }
        showError('decodificacao',d.details); return;
      }
      showError('carregamento',d.details||d.type);
    });
    hls.loadSource(C.url);
    hls.attachMedia(video);
  }
  function startSource(startAt,autoplay){
    S.phase='boot'; S.buffering=true; S.started=false; render();
    clearTimeout(loadT);
    loadT=setTimeout(function(){ showError('carregamento','timeout'); },45000);
    tStart=Date.now();
    var eng=pickEngine();
    if(eng==='native') attachNative(startAt,autoplay);
    else if(eng==='hlsjs'){
      loadHls(function(ok){
        if(!ok){ if(CAP.nativeHls) attachNative(startAt,autoplay); else showError('biblioteca','cdn'); return; }
        if(!window.Hls.isSupported()){ if(CAP.nativeHls) attachNative(startAt,autoplay); else showError('decodificacao','mse'); return; }
        attachHls(startAt,autoplay);
      });
    } else showError('decodificacao','sem-suporte');
  }

  // ---------- eventos do vídeo ----------
  var castWatching=false;
  video.addEventListener('loadedmetadata',function(){
    prog.setAttribute('aria-valuemax',String(Math.floor(video.duration)||0));
    setMsg(1); applyFit(); updTimes(); watchCast();
    emit('loadedmetadata',{duration:video.duration||0});
  });
  video.addEventListener('durationchange',function(){ updTimes(); });
  video.addEventListener('loadeddata',function(){ setMsg(2); });
  video.addEventListener('canplay',function(){
    clearTimeout(loadT); clearTimeout(stallT);
    if(S.buffering && video.readyState>=3){ S.buffering=false; }
    if(S.phase==='boot' && video.paused && !pendingPlay){ S.phase='paused'; S.waitGesture=true; }
    render();
  });
  video.addEventListener('play',function(){
    if(S.phase==='error') return;
    S.waitGesture=false; clearTimeout(napT); S.napReady=false;
    if(S.started){ S.phase='playing'; S.buffering=video.readyState<3; }
    else { S.phase='boot'; S.buffering=true; }
    syncIcons(); bumpUI();
    emit('play');
  });
  video.addEventListener('playing',function(){
    clearTimeout(loadT); clearTimeout(stallT);
    var first=!S.started;
    if(first){ S.started=true; track('start',{ms:Date.now()-tStart}); setTimeout(applyFit,50); }
    S.phase='playing'; S.buffering=false; S.waitGesture=false; S.nextClosed=false;
    syncIcons(); wakeOn(); bumpUI();
    if(first) emit('started',{ms:Date.now()-tStart});
    emit('playing');
  });
  video.addEventListener('pause',function(){
    if(video.ended || S.phase==='error' || Date.now()<swapUntil) return;
    S.phase='paused'; S.buffering=false;
    syncIcons(); wakeOff(); savePos();
    if(S.started) armNap();
    bumpUI();
    emit('pause');
  });
  video.addEventListener('waiting',function(){
    if(!S.started || S.phase==='error') return;
    S.buffering=true; stalls++; setMsg(1); render();
    emit('waiting');
    clearTimeout(stallT);
    stallT=setTimeout(function(){ if(S.buffering) showError('carregamento','travado'); },45000);
  });
  video.addEventListener('seeking',function(){ if(S.started && video.readyState<3){ S.buffering=true; render(); } emit('seeking',{currentTime:video.currentTime||0}); });
  video.addEventListener('seeked',function(){ if(video.readyState>=3){ S.buffering=false; clearTimeout(stallT); render(); } emit('seeked',{currentTime:video.currentTime||0}); });
  video.addEventListener('ended',function(){
    lsDel(KPOS);
    S.phase='ended'; S.buffering=false; S.nextClosed=false; S.napReady=false;
    syncIcons(); wakeOff(); renderNext(); bumpUI();
    emit('ended');
  });
  video.addEventListener('error',function(){
    if(hls || S.phase==='error') return;
    var c=video.error?video.error.code:0;
    if(c===1) return;
    showError(c===2?'carregamento':'decodificacao','E'+c);
  });
  video.addEventListener('ratechange',function(){ updEnd(); emit('ratechange',{rate:video.playbackRate}); });

  // ---------- progresso, tempo restante, "termina às", relógio ----------
  var lastSec=-1;
  function paintRatio(x){ fill.style.width=(x*100)+'%'; thumbEl.style.left=(x*100)+'%'; }
  function bufEnd(t){
    var b=video.buffered, i;
    for(i=0;i<b.length;i++){ if(t>=b.start(i)-0.3 && t<=b.end(i)+0.3) return b.end(i); }
    return b.length?b.end(b.length-1):0;
  }
  function updBuf(){
    var d=video.duration;
    if(d>0 && isFinite(d)) buf.style.width=(Math.min(1,bufEnd(video.currentTime||0)/d)*100)+'%';
  }
  function showTimes(t){
    var d=video.duration, ok=d>0&&isFinite(d);
    curEl.textContent=fmt(t);
    remEl.textContent=ok?'-'+fmt(Math.max(0,d-t)):'';
  }
  function updTimes(){
    var d=video.duration||0, t=video.currentTime||0;
    if(!S.dragging){ paintRatio(d?Math.min(1,t/d):0); showTimes(t); }
    updBuf(); updEnd();
  }
  function updEnd(){
    var d=video.duration, t=video.currentTime||0;
    var txt='';
    if(d>0 && isFinite(d) && S.phase!=='ended'){
      var rate=video.playbackRate||1;
      txt='Termina às '+hhmm(new Date(Date.now()+Math.max(0,d-t)/rate*1000))+(rate!==1?' ('+rateLabel(rate)+')':'');
    }
    if(endEl.textContent!==txt) endEl.textContent=txt;
  }
  function updClock(){ var t=hhmm(new Date()); if(clockEl.textContent!==t) clockEl.textContent=t; }
  updClock(); setInterval(function(){ updClock(); updEnd(); },15000);
  video.addEventListener('progress',updBuf);
  video.addEventListener('timeupdate',function(){
    updTimes();
    var nowT=Date.now();
    if(nowT-lastTU>240){ lastTU=nowT; emit('timeupdate',{currentTime:video.currentTime||0,duration:isFinite(video.duration)?video.duration:0}); }
    var s=Math.floor(video.currentTime||0);
    if(s!==lastSec){
      lastSec=s;
      prog.setAttribute('aria-valuenow',String(s));
      prog.setAttribute('aria-valuetext',fmt(video.currentTime)+' de '+fmt(video.duration));
      if(S.panel==='scenes') markScene();
    }
  });

  // ---------- barra de progresso (clique, arrastar, tooltip) ----------
  function localRatio(e,node){
    var r=node.getBoundingClientRect(), x;
    if(S.rot) x = S.flip ? (r.bottom-e.clientY)/r.height : (e.clientY-r.top)/r.height;
    else x=(e.clientX-r.left)/r.width;
    return Math.min(1,Math.max(0,x||0));
  }
  function moveTip(x){
    tip.textContent=fmt(x*(video.duration||0));
    var w=tip.offsetWidth, tw=prog.clientWidth, px=x*tw;
    px=Math.min(Math.max(tw-w/2,w/2),Math.max(w/2,px));
    tip.style.left=px+'px';
  }
  var dragRatio=0;
  prog.addEventListener('pointerdown',function(e){
    if(!video.duration || !isFinite(video.duration)) return;
    S.dragging=true; prog.classList.add('drag');
    clearTimeout(napT); S.napReady=false;
    try{ prog.setPointerCapture(e.pointerId); }catch(err){}
    var x=localRatio(e,prog); dragRatio=x; paintRatio(x); moveTip(x); showTimes(x*video.duration);
    bumpUI();
  });
  prog.addEventListener('pointermove',function(e){
    var x=localRatio(e,prog);
    hoverEl.style.width=(x*100)+'%';
    moveTip(x);
    if(S.dragging){ dragRatio=x; paintRatio(x); showTimes(x*(video.duration||0)); }
  });
  function endDrag(apply){
    if(!S.dragging) return;
    S.dragging=false; prog.classList.remove('drag');
    if(apply && video.duration) video.currentTime=dragRatio*video.duration;
    if(video.paused && S.started) armNap();
    bumpUI();
  }
  prog.addEventListener('pointerup',function(){ endDrag(true); });
  prog.addEventListener('pointercancel',function(){ endDrag(false); });
  prog.addEventListener('keydown',function(e){
    var k=e.key, d=video.duration||0;
    if(k==='ArrowLeft'||k==='ArrowRight'||k==='Home'||k==='End'){
      e.preventDefault(); e.stopPropagation();
      if(k==='ArrowLeft') seekBy(-5); else if(k==='ArrowRight') seekBy(5);
      else if(k==='Home') video.currentTime=0; else if(d) video.currentTime=Math.max(0,d-1);
      bumpUI();
    }
  });

  // ---------- pular ±10 s (círculo animado) ----------
  function seekBy(d){
    var t=(video.currentTime||0)+d, m=video.duration;
    if(isFinite(m)) t=Math.min(t,m-0.05);
    video.currentTime=Math.max(0,t);
  }
  var fxAcc={l:0,r:0}, fxT={l:0,r:0};
  function fx(z,sec){
    var node=(z==='l')?fxL:fxR;
    clearTimeout(fxT[z]);
    fxAcc[z]+=sec;
    node.querySelector('span').textContent=(z==='l'?'−':'+')+fxAcc[z]+' s';
    node.classList.remove('go'); void node.offsetWidth; node.classList.add('go');
    fxT[z]=setTimeout(function(){ fxAcc[z]=0; },900);
  }
  function skip(z,sec){ sec=sec||10; seekBy(z==='l'?-sec:sec); fx(z,sec); bumpUI(); }

  // ---------- toques: clique (mouse) / toque simples e duplo (celular) ----------
  function closePanels(){
    var any=S.menu||!!S.panel;
    if(S.menu) S.menu=false;
    if(S.panel) closePanel(true);
    if(any){ panelsClosedAt=Date.now(); render(); }
    return any;
  }
  function zoneOf(e){ var x=localRatio(e,rig); return x<0.35?'l':(x>0.65?'r':'c'); }
  function singleTap(){
    if(S.ui && !uiLocked()){ clearTimeout(hideT); S.ui=false; render(); }
    else bumpUI();
  }
  var lastPT='mouse', lastTap=0, lastZone='', tapTimer=0, chainZone='', chainT=0;
  tapEl.addEventListener('pointerdown',function(e){ lastPT=e.pointerType||'mouse'; });
  tapEl.addEventListener('click',function(){
    if(lastPT!=='mouse') return;
    if(closePanels()) return;
    if(Date.now()-panelsClosedAt<400) return;
    toggle(); bumpUI();
  });
  tapEl.addEventListener('dblclick',function(){ if(lastPT==='mouse') toggleFs(); });
  tapEl.addEventListener('pointerup',function(e){
    if(e.pointerType==='mouse') return;
    if(closePanels()) return;
    if(Date.now()-panelsClosedAt<400) return;
    var now=Date.now(), z=zoneOf(e);
    if(S.phase==='ended' || S.phase==='boot'){ bumpUI(); return; }
    if(z!=='c' && chainZone===z && now-chainT<650){
      clearTimeout(tapTimer); lastTap=0; chainT=now; skip(z); return;
    }
    if(now-lastTap<300 && z===lastZone){
      clearTimeout(tapTimer); lastTap=0;
      if(z==='c') toggle(); else { skip(z); chainZone=z; chainT=now; }
      return;
    }
    lastTap=now; lastZone=z;
    clearTimeout(tapTimer);
    tapTimer=setTimeout(singleTap,300);
  });
  app.addEventListener('pointermove',function(e){ if(e.pointerType==='mouse') bumpUI(); });
  rig.addEventListener('focusin',function(){ bumpUI(); });
  controls.addEventListener('pointerdown',function(){ bumpUI(); });
  // tira o foco dos botões depois do clique (o espaço volta a dar play/pause)
  rig.addEventListener('click',function(e){
    var b=e.target.closest ? e.target.closest('button') : null;
    if(b && e.detail>0 && b.closest('.controls,.mid,.top')) { if(b!==btnSet && b!==btnInfo && b!==btnScenes && b!==btnModes) b.blur(); }
  });
  $('mPlay').addEventListener('click',toggle);
  $('btnPlay').addEventListener('click',toggle);
  $('mBack').addEventListener('click',function(){ skip('l'); });
  $('mFwd').addEventListener('click',function(){ skip('r'); });
  $('mBack5').addEventListener('click',function(){ skip('l',5); });
  $('btnBack').addEventListener('click',function(){ skip('l'); });
  $('btnFwd').addEventListener('click',function(){ skip('r'); });

  // ---------- volume ----------
  function applyVolUI(){
    var m=video.muted || video.volume===0;
    $('iVol').style.display=m?'none':'block';
    $('iMute').style.display=m?'block':'none';
    volIn.value=video.muted?0:video.volume;
    btnMute.setAttribute('aria-label', m?'Ativar som':'Silenciar');
  }
  function setVol(v,show){
    v=Math.round(Math.max(0,Math.min(1,v))*100)/100;
    video.volume=v; video.muted=(v===0);
    applyVolUI();
    if(show) toast('Volume '+Math.round(v*100)+'%');
  }
  function toggleMute(){
    video.muted=!video.muted;
    if(!video.muted && video.volume===0) video.volume=0.5;
    applyVolUI();
  }
  btnMute.addEventListener('click',toggleMute);
  volIn.addEventListener('input',function(e){ setVol(parseFloat(e.target.value)); });
  video.addEventListener('volumechange',function(){
    applyVolUI();
    if(!modes.night && !C.muted) lsSet(KVOL,JSON.stringify({v:video.volume,m:video.muted}));
    emit('volumechange',{volume:video.volume,muted:video.muted});
  });
  (function(){
    var o=jget(KVOL,null);
    if(o){ if(typeof o.v==='number') video.volume=Math.max(0,Math.min(1,o.v)); video.muted=!!o.m; }
    applyVolUI();
  })();

  // ---------- enquadramento inteligente (sem deformar) ----------
  var fitInfo={rc:1};
  function zoomFor(f,rc){ return f==='cover'?rc:(f==='pano'?Math.min(rc,1.3):1); }
  function cropFor(z){
    var vw=video.videoWidth, vh=video.videoHeight, cw=rig.clientWidth, ch=rig.clientHeight;
    if(!vw||!vh||!cw||!ch) return 0;
    var c=Math.min(cw/vw,ch/vh);
    return 1-Math.min(1,cw/(vw*c*z))*Math.min(1,ch/(vh*c*z));
  }
  function applyFit(){
    var vw=video.videoWidth, vh=video.videoHeight, cw=rig.clientWidth, ch=rig.clientHeight;
    var rc=1;
    if(vw&&vh&&cw&&ch){ rc=Math.max(cw/vw,ch/vh)/Math.min(cw/vw,ch/vh); }
    fitInfo.rc=rc;
    var z=zoomFor(fit,rc);
    video.style.transform = z>1.002 ? 'scale('+z.toFixed(4)+')' : '';
    if(S.menu) buildMenu();
  }
  function setFit(f,quiet){
    fit=f; lsSet('pf:fit',f); applyFit(); renderModes();
    if(!quiet){
      var z=zoomFor(f,fitInfo.rc), c=Math.round(cropFor(z)*100);
      toast(f==='contain'?'Enquadramento: ajustar à tela':(c>0?'Enquadramento: pode cortar ~'+c+'% da imagem':'Enquadramento: sem cortes neste vídeo'));
    }
  }

  // ---------- configurações (velocidade, enquadramento, dados anônimos) ----------
  function rateLabel(s){ return s===1?'Normal':String(s).replace('.',',')+'x'; }
  function setRate(s){ video.playbackRate=s; toast('Velocidade: '+rateLabel(s)); if(S.menu) buildMenu(); }
  function fitLabel(f){
    var z=zoomFor(f,fitInfo.rc), c=Math.round(cropFor(z)*100);
    if(f==='contain') return ['Ajustar à tela','sem cortes'];
    var nm=f==='pano'?'Panorâmica':'Preencher';
    return [nm, c>0 ? 'pode cortar ~'+c+'% da imagem' : 'sem cortes neste vídeo'];
  }
  function buildMenu(){
    var keepFocus=document.activeElement && menu.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
    while(menu.firstChild) menu.removeChild(menu.firstChild);
    var h=el('h3',null,'Velocidade'); menu.appendChild(h);
    var chips=el('div','chips'); chips.setAttribute('role','group');
    SPEEDS.forEach(function(s){
      var b=el('button','chip',rateLabel(s)); b.type='button';
      b.setAttribute('role','menuitemradio'); b.setAttribute('aria-checked',(video.playbackRate||1)===s?'true':'false'); b.setAttribute('data-k','r'+s);
      b.addEventListener('click',function(){ setRate(s); });
      chips.appendChild(b);
    });
    menu.appendChild(chips);
    menu.appendChild(el('h3',null,'Enquadramento'));
    ['contain','pano','cover'].forEach(function(f){
      var l=fitLabel(f);
      var b=el('button','mi'); b.type='button';
      b.setAttribute('role','menuitemradio'); b.setAttribute('aria-checked',fit===f?'true':'false'); b.setAttribute('data-k','f'+f);
      var t=el('span'); t.appendChild(document.createTextNode(l[0])); var sm=el('small',null,l[1]); t.appendChild(sm);
      b.appendChild(t); b.appendChild(svgUse('check'));
      b.addEventListener('click',function(){ setFit(f); });
      menu.appendChild(b);
    });
    var sl=subList();
    if(sl.length){
      menu.appendChild(el('h3',null,'Legendas'));
      var ob=el('button','mi'); ob.type='button'; ob.setAttribute('role','menuitemradio');
      ob.setAttribute('aria-checked',sl.some(function(s){ return s.on; })?'false':'true'); ob.setAttribute('data-k','s-off');
      var ot=el('span'); ot.appendChild(document.createTextNode('Desativadas')); ob.appendChild(ot); ob.appendChild(svgUse('check'));
      ob.addEventListener('click',function(){ sl.off(); toast('Legendas desativadas'); buildMenu(); });
      menu.appendChild(ob);
      sl.forEach(function(s,i){
        var b=el('button','mi'); b.type='button'; b.setAttribute('role','menuitemradio');
        b.setAttribute('aria-checked',s.on?'true':'false'); b.setAttribute('data-k','s'+i);
        var t=el('span'); t.appendChild(document.createTextNode(s.label)); b.appendChild(t); b.appendChild(svgUse('check'));
        b.addEventListener('click',function(){ s.set(); toast('Legenda: '+s.label); buildMenu(); });
        menu.appendChild(b);
      });
    }
    if(C.tele){
      menu.appendChild(el('h3',null,'Privacidade'));
      var tb=el('button','mi'); tb.type='button'; tb.setAttribute('role','menuitemcheckbox'); tb.setAttribute('aria-checked',S.tele?'true':'false'); tb.setAttribute('data-k','tele');
      var tt=el('span'); tt.appendChild(document.createTextNode('Dados técnicos anônimos')); tt.appendChild(el('small',null,'Só erros e tempo de carga. Nada pessoal.'));
      tb.appendChild(tt); tb.appendChild(el('span','sw'));
      tb.addEventListener('click',function(){ S.tele=!S.tele; lsSet(KTELE,S.tele?'1':'0'); buildMenu(); toast(S.tele?'Obrigado por ajudar!':'Dados técnicos desligados'); });
      menu.appendChild(tb);
    }
    if(keepFocus) focusEl(menu.querySelector('[data-k="'+keepFocus+'"]'));
  }
  function setMenu(on){
    if(on===S.menu) return;
    if(on){ closePanel(true); buildMenu(); }
    S.menu=on; render();
    if(on){ setTimeout(function(){ focusEl(menu.querySelector('[aria-checked=true]')); },40); }
    else if(menu.contains(document.activeElement)) focusEl(btnSet);
    bumpUI();
  }
  btnSet.addEventListener('click',function(){ setMenu(!S.menu); });
  document.addEventListener('pointerdown',function(e){
    if(S.menu && !menu.contains(e.target) && !btnSet.contains(e.target)){ S.menu=false; panelsClosedAt=Date.now(); render(); }
  });

  // ---------- tela cheia + paisagem automática ----------
  function fsEl(){ return document.fullscreenElement||document.webkitFullscreenElement; }
  function toggleFs(){
    if(!guard('fs',450)) return;
    if(fsEl()){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); return; }
    if(S.pfs){ S.pfs=false; updateRot(); return; }
    var fn=app.requestFullscreen||app.webkitRequestFullscreen;
    if(fn){
      var p;
      try{ p=fn.call(app,{navigationUI:'hide'}); }catch(e){ p=null; }
      if(p && p.then) p.then(function(){ lockLandscape(); },function(){ fallbackFs(); });
      else setTimeout(function(){ if(fsEl()) lockLandscape(); else fallbackFs(); },120);
    } else fallbackFs();
  }
  function fallbackFs(){
    if(video.webkitEnterFullscreen){ try{ video.webkitEnterFullscreen(); return; }catch(e){} }
    if(window.top===window && isTouch){ S.pfs=true; S.locked=false; updateRot(); toast('Gire o celular para assistir deitado'); return; }
    toast('Tela cheia indisponível aqui');
  }
  function lockLandscape(){
    if(!isTouch) return;
    if(video.videoWidth && video.videoWidth<video.videoHeight) return; // vídeo vertical: deixa em pé
    if(CAP.lock){
      S.lockPending=true;
      screen.orientation.lock('landscape').then(function(){ S.locked=true; S.lockPending=false; updateRot(); },
                                               function(){ S.locked=false; S.lockPending=false; updateRot(); });
    } else { S.locked=false; updateRot(); }
  }
  function unlockOrientation(){ try{ if(CAP.lock) screen.orientation.unlock(); }catch(e){} S.locked=false; S.lockPending=false; }
  // quando o aparelho não deixa travar em paisagem, gira a imagem 90° dentro da tela
  function updateRot(){
    var portrait=window.innerHeight>window.innerWidth;
    var want = isTouch && portrait && !S.lockPending && (((S.fs||S.pfs) && !S.locked) || S.manualRot);
    if(S.rot!==want) S.rot=want;
    render(); measure();
  }
  function onFs(){
    var on=!!fsEl();
    S.fs=on;
    emit('fullscreenchange',{fullscreen:on});
    btnFs.setAttribute('aria-label', on?'Sair da tela cheia':'Tela cheia');
    if(!on){
      unlockOrientation(); S.manualRot=false; S.pfs=false; S.soft=true;
      setTimeout(function(){ S.soft=false; render(); },1300);
      updateRot();
    } else { updateRot(); } // a recusa do travamento pode chegar antes deste evento: reavalia a rotação
    bumpUI(); setTimeout(measure,150);
  }
  btnFs.addEventListener('click',toggleFs);
  document.addEventListener('fullscreenchange',onFs);
  document.addEventListener('webkitfullscreenchange',onFs);
  video.addEventListener('webkitendfullscreen',function(){ bumpUI(); });

  // ---------- Picture-in-Picture e transmissão ----------
  function togglePip(){
    if(!guard('pip',600)) return;
    try{
      if(document.pictureInPictureElement){ document.exitPictureInPicture(); }
      else if(video.requestPictureInPicture){ video.requestPictureInPicture().catch(function(){ toast('Picture-in-Picture indisponível'); }); }
      else if(video.webkitSetPresentationMode){ video.webkitSetPresentationMode(video.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture'); }
    }catch(e){ toast('Picture-in-Picture indisponível'); }
  }
  btnPip.addEventListener('click',togglePip);
  video.addEventListener('enterpictureinpicture',function(){ S.pip=true; render(); });
  video.addEventListener('leavepictureinpicture',function(){ S.pip=false; render(); });
  video.addEventListener('webkitpresentationmodechanged',function(){ S.pip=(video.webkitPresentationMode==='picture-in-picture'); render(); });

  btnCast.hidden=true;
  function watchCast(){
    if(castWatching) return; castWatching=true;
    try{
      if(video.remote && video.remote.watchAvailability){
        video.remote.watchAvailability(function(av){ btnCast.hidden=!av; }).catch(function(){});
      }
    }catch(e){}
  }
  video.addEventListener('webkitplaybacktargetavailabilitychanged',function(e){ btnCast.hidden=(e.availability!=='available'); });
  btnCast.addEventListener('click',function(){
    if(!guard('cast',800)) return;
    try{
      if(video.webkitShowPlaybackTargetPicker && window.WebKitPlaybackTargetAvailabilityEvent) video.webkitShowPlaybackTargetPicker();
      else if(video.remote && video.remote.prompt){
        video.remote.prompt().catch(function(err){ toast(err && err.name==='NotFoundError' ? 'Nenhum dispositivo encontrado' : 'Transmissão indisponível para este vídeo'); });
      }
    }catch(e){ toast('Transmissão indisponível para este vídeo'); }
  });

  // ---------- legendas (tecla C / modo leitura / menu) ----------
  function subList(){
    var out=[], tt=video.textTracks, i;
    function isSub(t){ return t.kind==='subtitles'||t.kind==='captions'; }
    if(hls && hls.subtitleTracks && hls.subtitleTracks.length){
      hls.subtitleTracks.forEach(function(t,i){
        out.push({label:t.name||t.lang||('Legenda '+(i+1)), on:hls.subtitleTrack===i && hls.subtitleDisplay!==false,
                  set:function(){ hls.subtitleTrack=i; hls.subtitleDisplay=true; }});
      });
      out.off=function(){ hls.subtitleDisplay=false; hls.subtitleTrack=-1; };
      return out;
    }
    for(i=0;i<tt.length;i++){
      if(!isSub(tt[i])) continue;
      (function(t){
        out.push({label:t.label||t.language||'Legenda', on:t.mode==='showing',
                  set:function(){ var j; for(j=0;j<tt.length;j++) if(isSub(tt[j])) tt[j].mode=(tt[j]===t)?'showing':'disabled'; }});
      })(tt[i]);
    }
    out.off=function(){ var j; for(j=0;j<tt.length;j++) if(isSub(tt[j])) tt[j].mode='disabled'; };
    return out;
  }
  // on: true liga a primeira, false desliga, undefined alterna. Devolve o estado final (ou null se não há legendas)
  function captions(on){
    var l=subList();
    if(!l.length) return null;
    var cur=l.some(function(s){ return s.on; });
    if(on===undefined) on=!cur;
    if(on){ if(!cur) l[0].set(); } else l.off();
    return on;
  }
  function toggleCaptions(){
    var r=captions();
    toast(r===null?'Legendas indisponíveis neste vídeo':(r?'Legendas ativadas':'Legendas desativadas'));
  }

  // ---------- painéis laterais: cenas, ficha, modos ----------
  var PANELS={scenes:['Mapa das cenas',btnScenes],info:['Ficha do filme',btnInfo],modes:['Modos de exibição',btnModes]};
  var panelOpener=null;
  function openPanel(name){
    if(S.panel===name){ closePanel(); return; }
    if(name==='scenes' && !buildScenes()){ toast('Aguarde o filme carregar'); return; }
    S.menu=false; panelOpener=PANELS[name][1];
    S.panel=name; dTitle.textContent=PANELS[name][0];
    if(name==='scenes'){ sceneIdx=-1; markScene(); startThumbs(); }
    if(name==='info') renderInfo();
    if(name==='modes') renderModes();
    clearTimeout(napT); S.napReady=false;
    render(); bumpUI();
    setTimeout(function(){
      if(name==='scenes' && thumbs[sceneIdx]) centerInPanel(thumbs[sceneIdx].el);
      focusEl($('dClose'));
    },80);
  }
  function centerInPanel(node){
    if(S.rot) return;
    var db=drawer.querySelector('.dbody'), r=node.getBoundingClientRect(), br=db.getBoundingClientRect();
    db.scrollTop += (r.top-br.top)-(br.height-r.height)/2;
  }
  function closePanel(silent){
    if(!S.panel) return;
    var wasFocus = drawer.contains(document.activeElement);
    S.panel='';
    if(video.paused && S.started) armNap();
    if(!silent){ render(); bumpUI(); }
    if(wasFocus && panelOpener) focusEl(panelOpener);
  }
  btnScenes.addEventListener('click',function(){ openPanel('scenes'); });
  btnInfo.addEventListener('click',function(){ openPanel('info'); });
  btnModes.addEventListener('click',function(){ openPanel('modes'); });
  $('dClose').addEventListener('click',function(){ closePanel(); });

  // ---- mapa das cenas ----
  var thumbs=[], sceneIdx=-1, scBuilt=false, tj=null, SCENES=12;
  // usado ao trocar de vídeo: descarta as miniaturas do vídeo anterior
  function resetScenes(){
    if(tj && !tj.finished){ try{ tj.stop(); }catch(e){} }
    tj=null; scBuilt=false; thumbs=[]; sceneIdx=-1;
    while(scGrid.firstChild) scGrid.removeChild(scGrid.firstChild);
    scGrid.classList.remove('done');
  }
  function buildScenes(){
    if(scBuilt) return true;
    var d=video.duration;
    if(!isFinite(d) || d<=0) return false;
    scBuilt=true;
    SCENES=Math.min(24,Math.max(8,Math.round(d/600)));
    $('scSub').textContent=SCENES+' cenas — toque para pular até lá.';
    var i;
    for(i=0;i<SCENES;i++){
      (function(i){
        var b=el('button','sc'); b.type='button';
        b.setAttribute('aria-label','Ir para '+fmt(d*i/SCENES));
        var c=document.createElement('canvas'); c.width=320; c.height=180;
        b.appendChild(c); b.appendChild(el('span','t',fmt(d*i/SCENES)));
        b.addEventListener('click',function(){ video.currentTime=d*i/SCENES; closePanel(); if(video.paused) tryPlay(); });
        scGrid.appendChild(b);
        thumbs.push({el:b,c:c});
      })(i);
    }
    return true;
  }
  function markScene(){
    var d=video.duration;
    if(!thumbs.length || !isFinite(d) || d<=0) return;
    var idx=Math.min(SCENES-1,Math.floor((video.currentTime||0)/d*SCENES));
    if(idx===sceneIdx) return;
    sceneIdx=idx;
    thumbs.forEach(function(t,i){ t.el.classList.toggle('on',i===idx); });
  }
  // as miniaturas saem de um segundo <video> em baixa qualidade, só enquanto o painel está aberto
  function startThumbs(){
    if(tj){ if(!tj.finished) tj.step(); return; }
    if(navigator.connection && navigator.connection.saveData){ scGrid.classList.add('done'); return; }
    var d=video.duration, tv=document.createElement('video'), th=null, i=0, fails=0, busy=false;
    tj={finished:false, step:step, stop:function(){ finish(); }};
    tv.muted=true; tv.preload='auto'; tv.setAttribute('playsinline','');
    function finish(){
      if(tj.finished) return;
      tj.finished=true; scGrid.classList.add('done');
      try{ if(th) th.destroy(); }catch(e){}
      try{ tv.removeAttribute('src'); tv.load(); }catch(e){}
    }
    function paint(k){
      try{
        var c=thumbs[k].c, x=c.getContext('2d'), vw=tv.videoWidth, vh=tv.videoHeight;
        if(!vw||!vh) return;
        var sc=Math.max(c.width/vw,c.height/vh), w=vw*sc, h=vh*sc;
        x.drawImage(tv,(c.width-w)/2,(c.height-h)/2,w,h);
        thumbs[k].el.classList.add('has');
      }catch(e){}
    }
    function after(){ if(fails>=4){ finish(); return; } step(); }
    function step(){
      if(tj.finished || busy || !S.panel || S.panel!=='scenes' || tv.readyState<1) return;
      if(i>=SCENES){ finish(); return; }
      busy=true;
      var idx=i, done=false, to;
      function on(){
        if(done) return;
        done=true; clearTimeout(to); tv.removeEventListener('seeked',on);
        paint(idx); i++; busy=false; setTimeout(after,80);
      }
      to=setTimeout(function(){
        if(done) return;
        done=true; tv.removeEventListener('seeked',on); fails++; i++; busy=false; after();
      },9000);
      tv.addEventListener('seeked',on);
      try{ tv.currentTime=Math.max(0,Math.min(d-1,d*idx/SCENES+6)); }
      catch(e){ done=true; clearTimeout(to); tv.removeEventListener('seeked',on); fails++; i++; busy=false; after(); }
    }
    tv.addEventListener('loadedmetadata',function(){ step(); });
    tv.addEventListener('error',finish);
    setTimeout(function(){ if(tv.readyState<1) finish(); },20000);
    var eng=pickEngine();
    if(eng==='hlsjs' && window.Hls){
      th=new Hls({enableWorker:false,startLevel:0,capLevelToPlayerSize:true,maxBufferLength:2,maxMaxBufferLength:4,backBufferLength:2});
      th.autoLevelCapping=0;
      th.on(Hls.Events.ERROR,function(_,e){ if(e && e.fatal) finish(); });
      th.loadSource(C.url); th.attachMedia(tv);
    } else if(eng==='native'){ tv.src=C.url; }
    else finish();
  }

  // ---- informações: usa só o que veio nos parâmetros (title, desc, poster, year, age, tags) ----
  function renderInfo(){
    var body=$('infoBody'), m=C.meta||{};
    while(body.firstChild) body.removeChild(body.firstChild);
    var head=el('div','fhead'), post=el('div','fpost'); bg(post,C.poster);
    if(!C.poster) post.style.display='none';
    head.appendChild(post);
    var side=el('div'); side.style.minWidth='0';
    side.appendChild(el('div','ftit',C.title||'Vídeo'));
    var tags=el('div','tags');
    if(m.age) tags.appendChild(el('span','tag age',m.age));
    if(m.year) tags.appendChild(el('span','tag',m.year));
    (m.tags||[]).forEach(function(t){ tags.appendChild(el('span','tag',t)); });
    side.appendChild(tags); head.appendChild(side); body.appendChild(head);
    if(C.desc){ body.appendChild(el('div','fh3','Sobre')); body.appendChild(el('p','fsyn',C.desc)); }
    else body.appendChild(el('p','sub','Sem descrição disponível.'));
    var dur=video.duration;
    if(dur>0 && isFinite(dur)){
      var left=Math.max(0,dur-(video.currentTime||0))/(video.playbackRate||1);
      var fe=el('div','fend'); fe.appendChild(el('b',null,'Termina às '+hhmm(new Date(Date.now()+left*1000))));
      fe.appendChild(document.createTextNode(' se você continuar agora · faltam '+fmt(left)));
      body.appendChild(fe);
    }
  }

  // ---- modos: cinema, madrugada, leitura, tela panorâmica ----
  var nightPrev=null;
  var MODEDEF=[
    ['cinema','film','Cinema','Só o filme: some o título, o relógio e os degradês, e os controles escondem rápido.'],
    ['night','moon','Madrugada','Tom quente, brilho mais baixo e volume limitado a 35% para não acordar ninguém.'],
    ['read','book','Leitura','Legendas grandes e com fundo forte, controles maiores e botão extra de voltar 5 s para reler uma fala.'],
    ['pano','wide','Tela panorâmica','Aproveita telas largas ampliando a imagem até 30%, sem deformar. Mostra quanto pode cortar.']
  ];
  function saveModes(){ lsSet(KMODES,JSON.stringify({cinema:modes.cinema,night:modes.night,read:modes.read})); }
  function anyMode(){ return modes.cinema||modes.night||modes.read||fit==='pano'; }
  function setMode(k,on,quiet){
    if(k==='pano'){ setFit(on?'pano':'contain',true); if(!quiet){ var c=Math.round(cropFor(zoomFor('pano',fitInfo.rc))*100); toast(on?(c>0?'Tela panorâmica: pode cortar ~'+c+'% da imagem':'Tela panorâmica ativa'):'Tela panorâmica desligada'); } return; }
    modes[k]=on;
    if(k==='night'){
      if(on){ nightPrev=video.volume; if(!video.muted && video.volume>0.35) video.volume=0.35; }
      else if(nightPrev!=null){ if(Math.abs(video.volume-0.35)<0.011) video.volume=nightPrev; nightPrev=null; }
    }
    if(k==='read' && on) captions(true);
    if(k==='cinema') emit('cinema',{on:on});
    saveModes(); render(); renderModes(); bumpUI();
    if(!quiet) toast((on?'Modo ':'Saiu do modo ')+MODEDEF.filter(function(m){return m[0]===k;})[0][2]);
  }
  function resetModes(){
    ['cinema','night','read'].forEach(function(k){ if(modes[k]) setMode(k,false,true); });
    setFit('contain',true); S.manualRot=false; updateRot(); renderModes(); toast('Tudo normal');
  }
  function renderModes(){
    btnModes.classList.toggle('has-dot',anyMode());
    if(S.panel!=='modes') return;
    var body=$('modesBody'); while(body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(el('p','sub','Escolha como quer assistir. Dá para combinar os modos.'));
    MODEDEF.forEach(function(m){
      var on = m[0]==='pano' ? fit==='pano' : modes[m[0]];
      var b=el('button','mode'); b.type='button'; b.setAttribute('aria-pressed',on?'true':'false'); b.setAttribute('data-mode',m[0]);
      b.appendChild(svgUse(m[1]));
      var t=el('div','mt'); t.appendChild(el('b',null,m[2])); t.appendChild(el('span','d',m[3])); b.appendChild(t);
      b.appendChild(el('span','sw'));
      b.addEventListener('click',function(){ setMode(m[0],!on); });
      body.appendChild(b);
    });
    if(isTouch && window.innerHeight>window.innerWidth && (window.top===window || S.fs)){
      var rb=el('button','mode'); rb.type='button'; rb.setAttribute('aria-pressed',S.manualRot?'true':'false');
      rb.appendChild(svgUse('rotate'));
      var rt=el('div','mt'); rt.appendChild(el('b',null,'Girar a tela')); rt.appendChild(el('span','d','Para quando o celular está com a rotação travada: deita a imagem. Toque de novo para inverter o lado.')); rb.appendChild(rt); rb.appendChild(el('span','sw'));
      rb.addEventListener('click',function(){
        if(!S.manualRot){ S.manualRot=true; S.flip=false; }
        else if(!S.flip){ S.flip=true; }
        else { S.manualRot=false; S.flip=false; }
        updateRot(); renderModes();
      });
      body.appendChild(rb);
    }
    var row=el('div','cta'); row.style.margin='14px 0 4px';
    var rs=el('button','gbtn','Voltar ao normal'); rs.type='button'; rs.addEventListener('click',resetModes); row.appendChild(rs);
    body.appendChild(row);
    if(isTouch){ return; }
    body.appendChild(el('div','fh3','Atalhos do teclado'));
    var keys=el('div','keys');
    [['Espaço','play/pause'],['J / L','−10 s / +10 s'],['↑ ↓','volume'],['0–9','pular para 0–90%'],['F','tela cheia'],['M','mudo'],['C','legendas'],['T','modo cinema'],['I','ficha'],['S','cenas'],['O','modos'],['P','picture-in-picture']].forEach(function(k){
      var line=el('div'); var kb=el('kbd',null,k[0]); line.appendChild(kb); line.appendChild(document.createTextNode(' '+k[1])); keys.appendChild(line);
    });
    body.appendChild(keys);
  }
  (function restoreModes(){
    var o=jget(KMODES,null), f=lsGet('pf:fit');
    if(o){
      ['cinema','night','read'].forEach(function(k){ if(o[k]) { modes[k]=true; if(k==='night' && !video.muted && video.volume>0.35){ nightPrev=video.volume; video.volume=0.35; } } });
    }
    if(f==='pano'||f==='cover') fit=f;
    renderModes();
  })();

  // ---- fim do vídeo: rever + (opcional) próximo vídeo ----
  // Configurado por ?next_url=&next_title=&next_poster= (ou pelo comando "load" com { next }).
  // Com url, o botão abre o próximo vídeo; sem url, só avisa o site com o evento "next".
  function renderNext(){
    var card=$('nextCard'); while(card.firstChild) card.removeChild(card.firstChild);
    var n=C.next;
    var hd=el('div','nxh'); hd.appendChild(el('span',null,n?'A seguir':'Fim'));
    var x=el('button','btn'); x.type='button'; x.setAttribute('aria-label','Fechar'); x.appendChild(svgUse('close'));
    x.addEventListener('click',function(){ S.nextClosed=true; render(); setTimeout(function(){ focusEl($('mPlay')); },60); });
    hd.appendChild(x); card.appendChild(hd);
    var replay=el('button','gbtn'); replay.type='button'; replay.appendChild(svgUse('replay')); replay.appendChild(document.createTextNode('Rever'));
    replay.addEventListener('click',function(){ S.nextClosed=true; video.currentTime=0; tryPlay(); });
    if(!n){
      card.appendChild(el('h2',null,'Gostou?'));
      card.appendChild(el('p',null,'Reveja do começo quando quiser.'));
      var cta=el('div','cta'); cta.appendChild(replay);
      if(safeUrl(C.site)){ var more=el('a','pbtn','Ver mais'); more.href=C.site; more.target='_top'; more.rel='noopener'; cta.appendChild(more); }
      card.appendChild(cta); return;
    }
    var nx=el('div','nx');
    if(safeUrl(n.poster)){ var p=el('div','nxp'); bg(p,n.poster); nx.appendChild(p); }
    var t=el('div','nxt'); t.appendChild(el('h2',null,n.title||'Próximo vídeo'));
    var act=el('div','nxa');
    var go=n.url?el('a','pbtn'):el('button','pbtn');
    if(n.url){ go.href=n.url; go.target='_self'; go.rel='noopener'; } else go.type='button';
    go.appendChild(svgUse('play')); go.appendChild(document.createTextNode('Assistir'));
    go.addEventListener('click',function(){ emit('next',{url:n.url||'',title:n.title||''}); });
    act.appendChild(go); act.appendChild(replay);
    t.appendChild(act); nx.appendChild(t); card.appendChild(nx);
  }

  // ---------- Media Session, tela sempre ligada ----------
  var wl=null;
  function wakeOn(){
    if(!CAP.wake || wl) return;
    try{ navigator.wakeLock.request('screen').then(function(l){ wl=l; l.addEventListener('release',function(){ wl=null; }); }).catch(function(){}); }catch(e){}
  }
  function wakeOff(){ if(wl){ try{ wl.release(); }catch(e){} wl=null; } }
  if(CAP.media){
    try{
      setMediaMeta();
      navigator.mediaSession.setActionHandler('play',function(){ tryPlay(); });
      navigator.mediaSession.setActionHandler('pause',function(){ video.pause(); });
      navigator.mediaSession.setActionHandler('seekbackward',function(){ seekBy(-10); });
      navigator.mediaSession.setActionHandler('seekforward',function(){ seekBy(10); });
      navigator.mediaSession.setActionHandler('seekto',function(d){ if(d && isFinite(d.seekTime)) video.currentTime=d.seekTime; });
    }catch(e){}
  }

  // ---------- teclado ----------
  document.addEventListener('keydown',function(e){
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    var k=e.key, tag=e.target && e.target.tagName;
    if(k==='Escape'){ if(closePanels()){ e.preventDefault(); } return; }
    if(S.phase==='resume'||S.phase==='error') return;
    if(tag==='INPUT' && (k==='ArrowUp'||k==='ArrowDown'||k==='ArrowLeft'||k==='ArrowRight'||k==='Home'||k==='End')) return;
    if((tag==='BUTTON'||tag==='A') && (k===' '||k==='Enter')) return;
    if(S.menu && (k==='ArrowUp'||k==='ArrowDown')){
      var items=Array.prototype.slice.call(menu.querySelectorAll('button')), i=items.indexOf(document.activeElement);
      i=(i+(k==='ArrowDown'?1:-1)+items.length)%items.length; focusEl(items[i]); e.preventDefault(); return;
    }
    var handled=true;
    if(k===' '||k==='k'||k==='K') toggle();
    else if(k==='ArrowLeft') skip('l',modes.read?5:10);
    else if(k==='ArrowRight') skip('r',modes.read?5:10);
    else if(k==='j'||k==='J') skip('l');
    else if(k==='l'||k==='L') skip('r');
    else if(k==='ArrowUp') setVol(video.volume+0.1,true);
    else if(k==='ArrowDown') setVol(video.volume-0.1,true);
    else if(/^[0-9]$/.test(k)){ if(isFinite(video.duration)) video.currentTime=video.duration*(+k)/10; }
    else if(k==='f'||k==='F') toggleFs();
    else if(k==='m'||k==='M') toggleMute();
    else if(k==='c'||k==='C') toggleCaptions();
    else if(k==='t'||k==='T') setMode('cinema',!modes.cinema);
    else if(k==='i'||k==='I') openPanel('info');
    else if(k==='s'||k==='S') openPanel('scenes');
    else if(k==='o'||k==='O') openPanel('modes');
    else if((k==='p'||k==='P') && CAP.pip) togglePip();
    else if(k==='>'||k==='.'){ var ni=SPEEDS.indexOf(video.playbackRate||1); setRate(SPEEDS[Math.min(SPEEDS.length-1,ni+1)]); }
    else if(k==='<'||k===','){ var pi=SPEEDS.indexOf(video.playbackRate||1); setRate(SPEEDS[Math.max(0,pi-1)]); }
    else handled=false;
    if(handled){ e.preventDefault(); bumpUI(); }
  });

  // ---------- legendas pedidas pela página (?subs=…) ----------
  function applySubs(){
    var old=video.querySelectorAll('track'), i;
    for(i=old.length-1;i>=0;i--) video.removeChild(old[i]);
    (C.subs||[]).forEach(function(s,i){
      if(!safeUrl(s.src)) return;
      var t=document.createElement('track');
      t.kind='subtitles'; t.src=s.src; t.srclang=s.lang||''; t.label=s.label||s.lang||('Legenda '+(i+1));
      if(s['default']) t.setAttribute('default','');
      video.appendChild(t);
    });
  }
  function applyMeta(){
    $('ttl').textContent=C.title||'';
    if(C.title){ try{ document.title=C.title; }catch(e){} }
    var b=$('backdrop'); b.style.backgroundImage='';
    if(C.backdrop||C.poster) bg(b,C.backdrop||C.poster);
    setMediaMeta();
  }

  // ---------- começar: continuar de onde parou? ----------
  function begin(){
    var autoplay=C.autoplay!==false;
    if(C.start>0){ savedPos=0; startSource(C.start,autoplay); return; }
    var raw=parseInt(lsGet(KPOS),10);
    savedPos=(C.resume!==false && isFinite(raw) && raw>=30)?raw:0;
    if(savedPos>0){
      S.phase='resume'; S.buffering=false;
      $('resTime').textContent=fmt(savedPos);
      render();
      setTimeout(function(){ focusEl($('btnResume')); },80);
    } else {
      startSource(0,autoplay);
    }
  }
  $('btnResume').addEventListener('click',function(){ startSource(savedPos,true); });
  $('btnRestart').addEventListener('click',function(){ lsDel(KPOS); startSource(0,true); });

  // ---------- trocar de vídeo sem recarregar a página (comando "load") ----------
  function normList(v,max){ return (Array.isArray(v)?v:[]).slice(0,max); }
  function loadNew(a){
    var src=a && a.src;
    if(!safeUrl(src)) throw new Error('src inválido: use uma URL http:// ou https://');
    savePos();
    teardown();
    S.panel=''; S.menu=false; S.nextClosed=true; S.started=false; S.waitGesture=false; S.buffering=true;
    C.url=src;
    C.isHls=(a.type==='hls') || (a.type!=='mp4' && /\.m3u8(\?|#|$)/i.test(src));
    C.id=a.id?String(a.id).slice(0,120):idFromUrl(src);
    KPOS='pf:pos:'+C.id;
    C.title=a.title?String(a.title).slice(0,200):'';
    C.desc=a.desc?String(a.desc).slice(0,1000):'';
    C.poster=safeUrl(a.poster)?a.poster:'';
    C.backdrop=C.poster;
    C.meta={year:a.year?String(a.year).slice(0,12):'', age:a.age?String(a.age).slice(0,8):'',
            tags:normList(a.tags,8).map(function(t){ return String(t).slice(0,24); })};
    C.next=(a.next && (a.next.title||safeUrl(a.next.url))) ? {url:safeUrl(a.next.url),title:String(a.next.title||'').slice(0,200),poster:safeUrl(a.next.poster)} : null;
    C.subs=normList(a.subs,20).filter(function(s){ return s && safeUrl(s.src); }).map(function(s){
      return {src:s.src,lang:String(s.lang||'').slice(0,12),label:String(s.label||'').slice(0,40),'default':s['default']===true};
    });
    C.start=a.start>0?Math.floor(+a.start):0;
    C.autoplay=a.autoplay!==false;
    C.resume=a.resume!==false;
    C.loop=!!a.loop;
    if(a.muted) C.muted=true;
    video.loop=C.loop;
    if(C.muted){ video.muted=true; applyVolUI(); }
    resetScenes(); applySubs(); applyMeta(); renderModes();
    S.phase='boot'; render();
    begin();
    bumpUI();
    emit('loaded',{src:C.url,title:C.title});
  }

  // ---------- comandos recebidos da página que embute o player ----------
  function cmdPlay(){
    if(S.phase==='resume'){ startSource(savedPos,true); return null; }
    if(S.phase==='error') throw new Error('o player está em estado de erro');
    if(S.phase==='ended'){ try{ video.currentTime=0; }catch(e){} }
    return new Promise(function(resolve,reject){
      var p; pendingPlay=true;
      try{ p=video.play(); }catch(err){ pendingPlay=false; reject(err); return; }
      if(p && p.then) p.then(function(){ pendingPlay=false; resolve(null); }, function(err){ onPlayReject(err); reject(err); });
      else { pendingPlay=false; resolve(null); }
    });
  }
  function num(v,name){ var n=+v; if(v===undefined || v===null || v==='' || !isFinite(n)) throw new Error(name+' inválido'); return n; }
  function runCommand(cmd,a){
    var n;
    switch(cmd){
      case 'play': return cmdPlay();
      case 'pause': video.pause(); return snap();
      case 'toggle': toggle(); return null;
      case 'seek':
        n=Math.max(0,num(a.time,'time')); if(isFinite(video.duration)) n=Math.min(n,video.duration);
        video.currentTime=n; return null;
      case 'seekBy': seekBy(num(a.delta,'delta')); return null;
      case 'setVolume': setVol(num(a.volume,'volume')); return null;
      case 'mute': video.muted=true; applyVolUI(); return null;
      case 'unmute': video.muted=false; if(video.volume===0) video.volume=0.5; applyVolUI(); return null;
      case 'setRate':
        n=num(a.rate,'rate'); if(n<0.25||n>4) throw new Error('rate deve estar entre 0.25 e 4');
        video.playbackRate=n; if(S.menu) buildMenu(); return null;
      case 'captions': return {enabled:captions(a.on===undefined?undefined:!!a.on)};
      case 'setCinema': setMode('cinema',!!a.on,true); return null;
      case 'load': loadNew(a); return null;
      case 'getState': return snap();
    }
    throw new Error('comando desconhecido: '+cmd);
  }
  window.addEventListener('message',function(e){
    var m=e.data;
    if(!inFrame || e.source!==window.parent) return;
    if(!m || typeof m!=='object' || m.ns!==NS || m.kind!=='command') return;
    if(C.parentOrigin && e.origin!==C.parentOrigin) return;
    if(C.channel && m.channel!==C.channel) return;
    function reply(ok,v){
      var r={kind:'response',reqId:m.reqId,ok:ok};
      if(ok) r.data=v; else r.error=String((v && v.message) || v || 'erro');
      postParent(r);
    }
    var out;
    try{ out=runCommand(String(m.cmd||''),(m.args && typeof m.args==='object')?m.args:{}); }
    catch(err){ reply(false,err); return; }
    Promise.resolve(out).then(function(v){ reply(true,v===undefined?null:v); },function(err){ reply(false,err); });
  });

  // ---------- início ----------
  mDraw(0);
  applyMeta();
  applySubs();
  video.loop=!!C.loop;
  if(C.muted){ video.muted=true; applyVolUI(); }
  measure();
  applyFit();
  begin();
  bumpUI();
  emit('ready',snap());

})();
