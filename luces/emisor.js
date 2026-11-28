/* Emisor: arma el comando (escena + velocidad + color + patrón + intensidad) y lo suena para los teléfonos.
   Usa los mismos protocolos que los WAV de wav/ (ggwave NORMAL, audible o ultrasonido). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var HEX = ['', '#FF2E6A', '#8E24D9', '#93CC6E', '#F4C95C', '#8FBABA', '#FFFFFF', '#FF3B1F', '#2F6BFF', ''];
  var data = null, mode = 'ultrasonido', actx = null, gg = null, inst = null;
  var st = { e: 3, bpm: 120, c: 0, p: 0, i: 9 };

  /* comando de 5 caracteres: escena, velocidad (base 36), color, patrón, intensidad */
  function code() { return String(st.e) + ((st.bpm - 60) / 4).toString(36) + st.c + st.p + st.i; }

  function render() {
    [].forEach.call($('grid').children, function (b) { b.setAttribute('aria-pressed', String(+b.dataset.e === st.e)); });
    [].forEach.call($('colors').children, function (b) { b.setAttribute('aria-pressed', String(+b.dataset.c === st.c)); });
    var esc = data.escenas.filter(function (x) { return x.n === st.e; })[0];
    if (st.p >= esc.patrones.length) { st.p = 0; }
    $('patterns').innerHTML = esc.patrones.map(function (n, i) { return '<button class="chip" type="button" data-p="' + i + '" aria-pressed="' + (i === st.p) + '">' + n + '</button>'; }).join('');
    $('pth').hidden = $('patterns').hidden = !esc.patrones.length;
    $('bpm').value = st.bpm; $('bpmv').textContent = st.bpm + ' BPM';
    $('int').value = st.i; $('intv').textContent = (st.i + 1) * 10 + ' %';
    $('code').textContent = 'comando ' + code();
  }

  fetch('comandos.json').then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    $('grid').innerHTML = d.escenas.map(function (e) { return '<button class="scene" type="button" data-e="' + e.n + '">' + e.nombre + '<small>tecla ' + e.n + '</small></button>'; }).join('');
    $('colors').innerHTML = d.colores.map(function (n, i) {
      var dot = HEX[i] ? '<i style="background:' + HEX[i] + '"></i>' : '';
      return '<button class="chip" type="button" data-c="' + i + '">' + dot + n + '</button>';
    }).join('');
    $('wavs').innerHTML = ['ultrasonido', 'audible'].map(function (m) {
      return d.escenas.map(function (e) { var f = 'https://juangithub123.github.io/ShowTelefonico/wav/' + m + '/' + e.n + '-' + e.id + '.wav'; return '<li><a href="' + f + '" download>' + f + '</a></li>'; }).join('');
    }).join('');
    render();
  });

  $('grid').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-e]'); if (!b) { return; }
    st.e = +b.dataset.e; st.p = 0; render(); if ($('auto').checked) { send(); }
  });
  $('colors').addEventListener('click', function (ev) { var b = ev.target.closest('[data-c]'); if (b) { st.c = +b.dataset.c; render(); } });
  $('patterns').addEventListener('click', function (ev) { var b = ev.target.closest('[data-p]'); if (b) { st.p = +b.dataset.p; render(); } });
  $('bpm').addEventListener('input', function () { st.bpm = +this.value; render(); });
  $('int').addEventListener('input', function () { st.i = +this.value; render(); });
  $('mode').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-m]'); if (!b) { return; }
    mode = b.dataset.m;
    [].forEach.call(this.querySelectorAll('[data-m]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
  });

  /* tap tempo: el promedio de los últimos toques, redondeado al paso de 4 BPM que entra en el comando */
  var taps = [];
  function tap() {
    var now = performance.now(); taps = taps.filter(function (t) { return now - t < 3000; }); taps.push(now);
    if (taps.length < 2) { return; }
    var avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    st.bpm = Math.max(60, Math.min(200, Math.round(60000 / avg / 4) * 4)); render();
  }
  $('tap').addEventListener('click', tap);

  function ready() {
    if (gg) { return Promise.resolve(); }
    var AC = window.AudioContext || window.webkitAudioContext;
    try { actx = new AC({ sampleRate: 48000 }); } catch (e) { actx = new AC(); }
    return ggwave_factory().then(function (g) {
      gg = g; gg.disableLog();
      var p = gg.getDefaultParameters(); p.sampleRateInp = actx.sampleRate; p.sampleRateOut = actx.sampleRate;
      inst = gg.init(p);
    });
  }
  function wave() {
    var proto = mode === 'audible' ? gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL : gg.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_NORMAL;
    var raw = gg.encode(inst, code(), proto, +$('vol').value);
    var f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    return withTic(f, mode === 'audible' ? 9000 : 17500, actx.sampleRate);
  }
  /* tic de sincronía: 200 ms después del comando, un pulso de 30 ms. El golpe de luz cae en el tic. */
  function withTic(f, freq, rate) {
    var peak = 0, i; for (i = 0; i < f.length; i++) { peak = Math.max(peak, Math.abs(f[i])); }
    var gap = Math.round(0.2 * rate), n = Math.round(0.03 * rate), att = Math.round(0.001 * rate), rel = Math.round(0.005 * rate);
    var out = new Float32Array(f.length + gap + n + Math.round(0.05 * rate)); out.set(f);
    for (i = 0; i < n; i++) { out[f.length + gap + i] = peak * 0.9 * Math.min(1, i / att, (n - i) / rel) * Math.sin(2 * Math.PI * freq * i / rate); }
    return out;
  }
  function send() {
    ready().then(function () {
      if (actx.state === 'suspended') { actx.resume(); }
      var f = wave(), buf = actx.createBuffer(1, f.length, actx.sampleRate); buf.getChannelData(0).set(f);
      var src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination); src.start();
      var b = $('send'); b.classList.add('on'); b.textContent = 'Sonando…';
      src.onended = function () { b.classList.remove('on'); b.textContent = 'Enviar'; };
    });
  }
  $('send').addEventListener('click', send);

  /* WAV de 16 bits del comando actual */
  $('dl').addEventListener('click', function () {
    ready().then(function () {
      var f = wave(), rate = actx.sampleRate, n = f.length, v = new DataView(new ArrayBuffer(44 + n * 2));
      var w = function (o, s) { for (var i = 0; i < s.length; i++) { v.setUint8(o + i, s.charCodeAt(i)); } };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) { v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767))), true); }
      var esc = data.escenas.filter(function (x) { return x.n === st.e; })[0];
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
      a.download = mode + '-' + st.e + '-' + esc.id + '-' + st.bpm + 'bpm-c' + st.c + 'p' + st.p + 'i' + st.i + '.wav';
      document.body.appendChild(a); a.click(); a.remove();
    });
  });

  /* teclado para operar rápido */
  document.addEventListener('keydown', function (ev) {
    if (ev.target.tagName === 'INPUT' && ev.target.type !== 'range' && ev.target.type !== 'checkbox') { return; }
    if (/^[1-9]$/.test(ev.key) && data) { st.e = +ev.key; st.p = 0; render(); if ($('auto').checked) { send(); } }
    else if (ev.key === ' ') { ev.preventDefault(); send(); }
    else if (ev.key === 't' || ev.key === 'T') { tap(); }
  });
})();
