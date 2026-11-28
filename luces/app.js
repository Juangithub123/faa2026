/* Luces FAA! · página del público.
   El micrófono escucha comandos cortos codificados en sonido (ggwave) que salen por la PA del show.
   Cada comando elige una escena y sus controles; la escena corre con el reloj del teléfono desde que llegó el comando.
   No necesita red durante el show: alcanza con haber abierto la página antes (queda guardada para usarse sin señal).

   Formato del comando: 5 caracteres «ETCPI»
     E escena 1-9 · T velocidad 0-z (BPM = 60 + 4·T, de 60 a 200) · C color 0-9 · P patrón 0-9 · I intensidad 0-9 (10 % a 100 %)
   Los comandos viejos «e1»…«e7» siguen funcionando (con los valores por defecto). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv');
  /* modos de prueba por la dirección: ?diag muestra números, ?css pinta con el fondo de la página en vez del lienzo,
     ?nomic arranca sin micrófono */
  var Q = location.search, DIAG = /diag/.test(Q), CSS = /css/.test(Q), NOMIC = /nomic/.test(Q);
  var diag = { frames: 0, drawMs: 0, maxMs: 0, t: performance.now(), blocks: 0, decMs: 0, path: NOMIC ? 'sin micrófono' : '—' };

  /* colores: 0 = paleta FAA! completa; 9 = uno al azar por teléfono */
  var ROSA = '#FF2E6A', VIOLETA = '#8E24D9', VERDE = '#93CC6E', DORADO = '#F4C95C', TURQUESA = '#8FBABA';
  var PALETA = [ROSA, VIOLETA, VERDE, DORADO, TURQUESA];
  var COLORES = [null, ROSA, VIOLETA, VERDE, DORADO, TURQUESA, '#FFFFFF', '#FF3B1F', '#2F6BFF', null];

  var seed = Math.random(); /* cada teléfono distinto: chispas, vela, arcoíris y color al azar */
  var st = { e: 1, bpm: 120, c: 0, p: 0, i: 9 }, t0 = performance.now();

  function frac(x) { return x - Math.floor(x); }
  function rnd(n) { return frac(Math.sin((n + 1) * 12.9898 + seed * 78.233) * 43758.5453); }
  function beat() { return 60000 / st.bpm; }
  /* el color de la escena; k = índice para recorrer la paleta (por tiempo, por compás…) */
  function color(k) {
    if (st.c === 0) { return PALETA[((k || 0) % PALETA.length + PALETA.length) % PALETA.length]; }
    if (st.c === 9) { return PALETA[Math.floor(rnd(k || 0) * PALETA.length)]; }
    return COLORES[st.c];
  }
  /* ---------- Dibujo ----------
     Las escenas son colores planos: cada cuadro se calcula un solo color y se pinta toda la pantalla de una vez.
     Con WebGL eso es una sola orden a la placa de video (gl.clear) sobre un lienzo de 4×4 píxeles estirado:
     mucho más liviano que dibujar con el lienzo 2D, que en Firefox para Android iba a ~25 fps.
     Respaldo: lienzo 2D (si no hay WebGL) o el fondo de la página (?css). El 26 es texto HTML encima. */
  var gl = null, c2d = null;
  if (!CSS) {
    try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
    if (!gl) { c2d = cv.getContext('2d'); }
  }
  cv.width = 4; cv.height = 4;
  var RENDER = gl ? 'webgl' : c2d ? 'lienzo 2D' : 'css';
  var out = [0, 0, 0], rgbCache = {};
  function rgb(c) {
    var v = rgbCache[c];
    if (v) { return v; }
    if (c.charAt(0) === '#') { var n = parseInt(c.slice(1), 16); v = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    else {
      var m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(c), h = +m[1] / 360, sa = +m[2] / 100, l = +m[3] / 100;
      var q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, pp = 2 * l - q;
      var hue = function (t) { t = frac(t); return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
      v = [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
    }
    if (c.charAt(0) === '#') { rgbCache[c] = v; }
    return v;
  }
  /* pinta todo con un color y una intensidad 0-1 (sobre negro) */
  function fill(c, a) { out = [0, 0, 0]; layer(c, a); }
  /* una capa encima de lo que ya hay (para los fundidos) */
  function layer(c, a) {
    if (!c || a <= 0) { return; }
    var k = Math.min(1, a) * (0.1 + 0.1 * st.i), v = rgb(c);
    out = [out[0] + (v[0] - out[0]) * k, out[1] + (v[1] - out[1]) * k, out[2] + (v[2] - out[2]) * k];
  }
  var lastCss = '';
  function present() {
    if (gl) { gl.clearColor(out[0], out[1], out[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    var css = 'rgb(' + Math.round(out[0] * 255) + ',' + Math.round(out[1] * 255) + ',' + Math.round(out[2] * 255) + ')';
    if (c2d) { c2d.fillStyle = css; c2d.fillRect(0, 0, 4, 4); return; }
    if (css !== lastCss) { document.body.style.background = css; lastCss = css; }
  }
  /* el 26: texto HTML encima del color, que el navegador compone con la placa de video */
  var n26 = $('n26'), n26On = false;
  function show26(c, a, scale) {
    if (!c) { if (n26On) { n26.style.opacity = '0'; n26On = false; } return; }
    n26On = true; n26.style.color = c; n26.style.opacity = String(Math.min(1, a) * (0.1 + 0.1 * st.i)); n26.style.transform = 'translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
  }

  /* destellos: nunca más de 3 por segundo (límite recomendado por fotosensibilidad) */
  function safe(ms) { return Math.max(ms, 1000 / 3); }

  /* ---------- Escenas: f(t), t = milisegundos desde que llegó el comando ---------- */
  var SCENES = {
    1: { nombre: 'Apagado', f: function () { fill(null, 0); } },
    2: { nombre: 'Color', f: function (t) {
      var b = beat();
      if (st.p === 1) { fill(color(0), 0.55 + 0.45 * Math.sin(t / (b * 4) * Math.PI * 2)); }        /* respira cada compás */
      else if (st.p === 2) { fill(color(0), (t % safe(b)) < safe(b) / 2 ? 1 : 0.15); }                /* parpadeo suave */
      else { fill(color(0), 1); }                                                                     /* fijo */
    } },
    3: { nombre: 'Pulso', f: function (t) {
      var b = beat(), n, ph;
      if (st.p === 2) { b *= 2; }                                    /* cada 2 tiempos */
      ph = (t % b) / b; n = Math.floor(t / b);
      if (st.p === 3) { ph = frac(ph + 0.5); }                       /* a contratiempo */
      var k = st.p === 1 ? (ph < 0.18 ? 1 : 0) : Math.pow(1 - ph, 2.2); /* 1 = seco, si no, decae suave */
      fill(color(n), 0.12 + 0.88 * k);
    } },
    4: { nombre: 'Colores', f: function (t) {
      var b = beat();
      if (st.p === 1) { fill(color(Math.floor(t / (b * 4))), 1); }    /* cambia por compás */
      else if (st.p === 2) {                                         /* fundido continuo entre colores */
        var x = t / (b * 2), i = Math.floor(x);
        fill(color(i), 1); layer(color(i + 1), frac(x));
      } else if (st.p === 3) { var nn = Math.floor(t / b); fill(PALETA[Math.floor(rnd(nn) * PALETA.length)], 1); } /* al azar por teléfono */
      else { fill(color(Math.floor(t / b)), 1); }                      /* cambia por tiempo */
    } },
    5: { nombre: 'Destellos', f: function (t) {
      var b = beat(), per = safe(st.p === 1 || st.p === 2 ? b * 2 : b), ph = t % per;
      var on = ph < 80 || (st.p === 2 && ph > per / 4 && ph < per / 4 + 80 && per / 4 >= 1000 / 6); /* 2: doble destello */
      fill(color(Math.floor(t / per)) || '#fff', on ? 1 : 0);
    } },
    6: { nombre: 'Chispas', f: function (t) {
      var slot = Math.floor(t / 180), r = rnd(slot * 7.31), dens = 0.04 + 0.05 * st.p; /* patrón = cantidad de chispas */
      fill(color(Math.floor(rnd(slot) * 97)), r < dens ? 1 : 0);
    } },
    7: { nombre: '26', f: function (t) {
      var b = beat(), n = Math.floor(t / b), ph = (t % b) / b, s = 1 + 0.06 * Math.pow(1 - ph, 3);
      fill(null, 0);
      if (st.p === 2 && (t % safe(b)) > safe(b) / 2) { show26(null); return; } /* 2: parpadea */
      show26(st.p === 1 ? color(n) : color(0) || ROSA, 1, s);                    /* 1: cambia de color por tiempo */
    } },
    8: { nombre: 'Vela', f: function (t) {
      /* cada teléfono titila distinto, como una vela; el patrón es cuánto se mueve la llama */
      var x = t / 1000 * (1.5 + st.p), n = Math.sin(x * 2.1 + seed * 40) * 0.5 + Math.sin(x * 3.7 + seed * 13) * 0.3 + Math.sin(x * 7.3 + seed * 7) * 0.2;
      fill(st.c === 0 ? DORADO : color(0), 0.62 + 0.3 * n);
    } },
    9: { nombre: 'Arcoíris', f: function (t) {
      /* recorre los colores sin cortes; patrón 0 = todos juntos, 1-9 = cada teléfono corrido (de lejos, un brillo que se mueve) */
      var hue = (t / (beat() * 8) * 360 + (st.p ? seed * 36 * st.p : 0)) % 360;
      fill('hsl(' + hue.toFixed(0) + ',90%,55%)', 1);
    } }
  };

  /* at: momento (reloj de performance.now) en que arranca la escena; puede haber sido hace unos milisegundos */
  function apply(next, at) {
    if (!SCENES[next.e]) { return; }
    st = next; t0 = at === undefined ? performance.now() : at;
    $('stxt').textContent = SCENES[st.e].nombre + ' · ' + st.bpm + ' BPM';
    showStatus();
  }

  function frame() {
    requestAnimationFrame(frame);
    var tf = performance.now();
    if (st.e !== 7) { show26(null); }
    SCENES[st.e].f(performance.now() - t0);
    present();
    if (DIAG) {
      var dt = performance.now() - tf; diag.frames++; diag.drawMs += dt; diag.maxMs = Math.max(diag.maxMs, dt);
      if (tf - diag.t >= 1000) {
        $('diag').textContent = Math.round(diag.frames * 1000 / (tf - diag.t)) + ' fps · cuadro ' + (diag.drawMs / diag.frames).toFixed(1) + ' ms (máx ' + diag.maxMs.toFixed(1) + ')' +
          ' · audio ' + diag.blocks + ' bloques/s, decodificar ' + diag.decMs.toFixed(2) + ' ms · ' + (actx ? actx.sampleRate + ' Hz' : '') + ' · ' + diag.path + ' · ' + RENDER + ' · ' + (navigator.userAgent.indexOf('Firefox') > -1 ? 'Firefox' : 'Chrome/otro') +
          ' · ' + innerWidth + '×' + innerHeight + ' @' + devicePixelRatio +
          ' · latencia entrada ' + Math.round(inLat * 1000) + ' ms, salida ' + Math.round(outLat() * 1000) + ' ms · sincro: ' + sync.last;
        diag.frames = 0; diag.drawMs = 0; diag.maxMs = 0; diag.t = tf;
      }
    }
  }

  /* ---------- Estado: se ve un momento al entrar o al cambiar de escena, después se apaga ---------- */
  var dimT = 0;
  function showStatus() { $('status').classList.remove('dim'); clearTimeout(dimT); dimT = setTimeout(function () { $('status').classList.add('dim'); }, 4000); }

  /* ---------- Escucha: micrófono sin procesar → decodificador en un proceso aparte ---------- */
  /* El audio no pasa por el hilo de la pantalla: un AudioWorklet lo junta en el hilo de audio y lo manda
     directo a un Web Worker que corre ggwave. Si el navegador no tiene AudioWorklet, se usa el método viejo,
     pero igual la decodificación queda en el Worker. */
  var actx, worker, inLat = 0;

  /* ---------- Sincronía ----------
     El comando dice QUÉ hacer; el tic que suena 0,2 s después dice CUÁNDO. Las dos horas vienen del reloj del audio
     (la muestra exacta) y se pasan al reloj de la pantalla descontando la demora de entrada y de salida de audio
     que informa el navegador, así todos los teléfonos marcan el momento en que el sonido llegó a su micrófono.
     Medido en simulación (con música encima): el tic llega entre 340 y 485 ms después del bloque donde se decodifica
     el comando (casi siempre 430-460) y su llegada se mide con un error menor a 1 ms (contra ~25 ms usando solo el comando).
     Se buscan candidatos en una ventana alrededor de lo esperado y se queda el más fuerte (un platillo puede colarse). */
  var TIC_AFTER = 448, WIN_BEFORE = 120, WIN_AFTER = 50, sync = { pending: null, timer: 0, last: '—' };
  function outLat() { return actx ? (actx.outputLatency || actx.baseLatency || 0) : 0; }
  /* hora del audio (segundos) → reloj de la pantalla (ms), en el momento en que ese sonido entró al micrófono */
  function audioToPerf(t) {
    var ts = actx.getOutputTimestamp ? actx.getOutputTimestamp() : null, lat = (outLat() + inLat) * 1000;
    if (ts && ts.performanceTime) { return ts.performanceTime + (t - ts.contextTime) * 1000 - lat; }
    return performance.now() - (actx.currentTime - t) * 1000 - lat;
  }
  function onSync(state, tAudio) {
    var expect = tAudio === undefined ? performance.now() + TIC_AFTER : audioToPerf(tAudio) + TIC_AFTER;
    clearTimeout(sync.timer);
    sync.pending = { state: state, expect: expect, best: null };
    /* al cerrar la ventana: el tic más fuerte, o si no apareció (mucha música encima), la hora esperada */
    sync.timer = setTimeout(function () {
      var pd = sync.pending; if (!pd) { return; }
      sync.pending = null;
      if (pd.best) { apply(pd.state, pd.best.at); var d = pd.best.at - pd.expect; sync.last = 'tic ' + (d >= 0 ? '+' : '') + d.toFixed(0) + ' ms'; }
      else { apply(pd.state, pd.expect); sync.last = 'sin tic (por comando)'; }
    }, Math.max(0, expect + WIN_AFTER + 10 - performance.now()));
  }
  function onTic(tAudio, strength) {
    var pd = sync.pending; if (!pd) { return; }
    var at = audioToPerf(tAudio), d = at - pd.expect;
    if (d < -WIN_BEFORE || d > WIN_AFTER) { return; } /* fuera de la ventana es la música, no el nuestro */
    if (!pd.best || strength > pd.best.p) { pd.best = { at: at, p: strength }; }
  }

  function listen() {
    /* a 48 kHz: ggwave decodifica mal si le llega audio a otra frecuencia (medido: 0/7 audibles a 44,1 kHz);
       así el navegador convierte el micrófono a 48 kHz antes de pasárselo */
    var AC = window.AudioContext || window.webkitAudioContext;
    try { actx = new AC({ sampleRate: 48000 }); } catch (e) { actx = new AC(); }
    worker = new Worker('decodificador.js?v=4');
    worker.onmessage = function (e) {
      if (e.data.cmd) { onCommand(e.data.cmd, e.data.t); }
      if (e.data.diag) { diag.blocks = e.data.diag.blocks; diag.decMs = e.data.diag.ms; }
      if (e.data.lv !== undefined) { $('dot').style.setProperty('--lv', String(1 + Math.min(1, e.data.lv * 4))); }
    };
    return navigator.mediaDevices.getUserMedia({
      /* sin cancelación de eco, supresión de ruido ni ganancia automática: si no, el teléfono borra las señales */
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false
    }).then(function (stream) {
      var src, tr = stream.getAudioTracks()[0], set = tr && tr.getSettings ? tr.getSettings() : {};
      inLat = typeof set.latency === 'number' ? set.latency : 0; /* demora de entrada que informa el navegador (Chrome) */
      /* Firefox no deja conectar un micrófono a un contexto de audio con otra frecuencia:
         en ese caso se usa la frecuencia del teléfono y el decodificador convierte a 48 kHz */
      try { src = actx.createMediaStreamSource(stream); } catch (e) {
        try { actx.close(); } catch (e2) { /* nada */ }
        actx = new AC(); src = actx.createMediaStreamSource(stream);
      }
      var mute = actx.createGain();
      mute.gain.value = 0; mute.connect(actx.destination);
      if (actx.audioWorklet && window.AudioWorkletNode) {
        return actx.audioWorklet.addModule('captura.js?v=3').then(function () {
          var node = new AudioWorkletNode(actx, 'captura'), ch = new MessageChannel();
          node.port.postMessage({ port: ch.port1 }, [ch.port1]);
          node.port.onmessage = function (m) { if (m.data.tic !== undefined) { onTic(m.data.t, m.data.p); } };
          worker.postMessage({ init: true, rate: actx.sampleRate, port: ch.port2 }, [ch.port2]);
          src.connect(node); node.connect(mute); diag.path = 'worklet';
          if (actx.state === 'suspended') { actx.resume(); }
        });
      }
      var proc = actx.createScriptProcessor(1024, 1, 1);
      worker.postMessage({ init: true, rate: actx.sampleRate });
      proc.onaudioprocess = function (e) { var f = new Float32Array(e.inputBuffer.getChannelData(0)); worker.postMessage({ audio: f, t: e.playbackTime || actx.currentTime }, [f.buffer]); };
      src.connect(proc); proc.connect(mute); diag.path = 'script';
      if (actx.state === 'suspended') { actx.resume(); }
    });
  }

  function onCommand(cmd, tAudio) {
    cmd = cmd.trim().toLowerCase();
    var m = /^([1-9])([0-9a-z])([0-9])([0-9])([0-9])$/.exec(cmd);
    if (m) { onSync({ e: +m[1], bpm: 60 + 4 * parseInt(m[2], 36), c: +m[3], p: +m[4], i: +m[5] }, tAudio); return; }
    var old = /^e(\d)$/.exec(cmd); /* comandos viejos (sin tic) */
    if (old) { apply({ e: +old[1], bpm: 120, c: 0, p: 0, i: 9 }); }
  }

  /* ---------- Pantalla siempre encendida ---------- */
  var lock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator)) { return; }
    navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && lock === null) { keepAwake(); }
    if (!document.hidden && actx && actx.state === 'suspended') { actx.resume(); }
    if (document.hidden) { lock = null; }
  });

  /* ---------- Entrar ---------- */
  $('go').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Abriendo…';
    keepAwake();
    var de = document.documentElement;
    if (de.requestFullscreen) { de.requestFullscreen().catch(function () {}); }
    (NOMIC ? Promise.resolve() : listen()).then(function () {
      $('ov').hidden = true; apply({ e: 1, bpm: 120, c: 0, p: 0, i: 9 }); $('stxt').textContent = 'Escuchando…'; showStatus();
    }).catch(function () {
      b.disabled = false; b.textContent = 'Probar de nuevo';
      $('warn').textContent = 'Sin micrófono no llegan las señales. Revisá el permiso, o tocá 5 veces la pantalla para elegir la escena a mano.';
      $('ov').hidden = true;
    });
  });

  /* ---------- Plan B: 5 toques seguidos abren el selector de escenas a mano ---------- */
  var taps = [];
  $('picker').innerHTML = Object.keys(SCENES).map(function (k) { return '<button type="button" data-s="' + k + '">' + SCENES[k].nombre + '</button>'; }).join('');
  $('picker').addEventListener('click', function (e) {
    var b = e.target.closest('[data-s]'); if (b) { apply({ e: +b.dataset.s, bpm: st.bpm, c: st.c, p: 0, i: 9 }); this.hidden = true; }
  });
  cv.addEventListener('click', function () {
    var now = performance.now(); taps = taps.filter(function (t) { return now - t < 2000; }); taps.push(now);
    if (taps.length >= 5) { taps = []; $('picker').hidden = !$('picker').hidden; }
  });

  /* guardar la página para usarla sin señal */

  if (DIAG) { $('diag').hidden = false; }
  if (CSS) { cv.style.display = 'none'; }
  frame();
})();
