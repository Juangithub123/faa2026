/* Máscaras del FAA! 2026.
   Detecta caras con MediaPipe Face Detector (6 puntos por cara) y dibuja las máscaras en un canvas 2D.
   El motor (mp/) se carga recién al tocar «Activar cámara». El modelo (~230 KB) viene de Google y el
   service worker lo guarda para usarlo sin señal. La imagen de la cámara nunca sale del teléfono. */

var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d'), vid = $('vid');
var detector = null, stream = null, facing = 'user', mask = 'anteojos';
var faces = [], lastTs = -1, slow = 0, frame = 0, running = false;
var logo = new Image(); logo.src = '../logo.webp';

/* ---------- Máscaras: se dibujan en unidades de «distancia entre ojos», con el origen entre los ojos ---------- */
var MASKS = [
  { id: 'anteojos', name: 'Anteojos' },
  { id: 'bigote', name: 'Bigote' },
  { id: 'sonidista', name: 'Sonidista' },
  { id: 'huemul', name: 'Huemul' },
  { id: 'chilco', name: 'Chilco' },
  { id: 'nada', name: 'Sin máscara' }
];
var VERDE = '#2D6A1F', CLARO = '#93CC6E', CREMA = '#F4F7D9';

function anteojos() {
  ctx.lineWidth = 0.09; ctx.strokeStyle = VERDE; ctx.fillStyle = 'rgba(244,201,92,.35)';
  [-0.5, 0.5].forEach(function (x) { ctx.beginPath(); ctx.arc(x, 0, 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(-0.14, -0.02); ctx.quadraticCurveTo(0, -0.14, 0.14, -0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.86, -0.04); ctx.lineTo(-1.12, -0.1); ctx.moveTo(0.86, -0.04); ctx.lineTo(1.12, -0.1); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  [-0.5, 0.5].forEach(function (x) { ctx.beginPath(); ctx.ellipse(x - 0.13, -0.14, 0.09, 0.05, -0.6, 0, Math.PI * 2); ctx.fill(); });
}

function bigote(f) {
  var m = { x: f.nose.x * 0.45 + f.mouth.x * 0.55, y: f.nose.y * 0.45 + f.mouth.y * 0.55 };
  ctx.save(); ctx.translate(m.x, m.y); ctx.fillStyle = '#3B2412';
  [1, -1].forEach(function (s) {
    ctx.save(); ctx.scale(s, 1); ctx.beginPath();
    ctx.moveTo(0, -0.08);
    ctx.bezierCurveTo(0.15, -0.18, 0.4, -0.14, 0.55, 0.0);
    ctx.bezierCurveTo(0.62, 0.07, 0.72, 0.02, 0.74, -0.13);
    ctx.bezierCurveTo(0.78, 0.06, 0.63, 0.19, 0.48, 0.15);
    ctx.bezierCurveTo(0.32, 0.11, 0.15, 0.09, 0, 0.07);
    ctx.closePath(); ctx.fill(); ctx.restore();
  });
  ctx.restore();
}

function sonidista(f) {
  var ex = Math.min(1.4, Math.max(0.95, (Math.abs(f.earR.x) + Math.abs(f.earL.x)) / 2)), ey = (f.earR.y + f.earL.y) / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1B1E18'; ctx.lineWidth = 0.2;
  ctx.beginPath(); ctx.ellipse(0, ey, ex + 0.05, 1.75, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = VERDE; ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.ellipse(0, ey, ex + 0.05, 1.75, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  [-1, 1].forEach(function (s) {
    ctx.fillStyle = '#1B1E18'; rrect(s * (ex + 0.05) - 0.24, ey - 0.42, 0.48, 0.84, 0.2); ctx.fill();
    ctx.fillStyle = CLARO; rrect(s * (ex + 0.05) - 0.15, ey - 0.3, 0.3, 0.6, 0.13); ctx.fill();
  });
  ctx.strokeStyle = '#1B1E18'; ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(-(ex + 0.05), ey + 0.3); ctx.quadraticCurveTo(-0.9, f.mouth.y + 0.1, -0.22, f.mouth.y); ctx.stroke();
  ctx.fillStyle = '#1B1E18'; ctx.beginPath(); ctx.arc(-0.18, f.mouth.y, 0.09, 0, Math.PI * 2); ctx.fill();
}

function huemul(f) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#7A5232'; ctx.lineWidth = 0.12;
  [-1, 1].forEach(function (s) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, -1.25); ctx.quadraticCurveTo(s * 0.75, -1.9, s * 1.25, -2.35);
    ctx.moveTo(s * 0.68, -1.7); ctx.lineTo(s * 0.45, -2.2);
    ctx.moveTo(s * 0.98, -2.12); ctx.lineTo(s * 0.92, -2.6);
    ctx.stroke();
    ctx.save(); ctx.translate(s * 1.0, -1.05); ctx.rotate(s * -0.7);
    ctx.fillStyle = '#9C6B3F'; ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E8B48A'; ctx.beginPath(); ctx.ellipse(0, 0.04, 0.1, 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = '#1B1E18'; ctx.beginPath(); ctx.ellipse(f.nose.x, f.nose.y - 0.02, 0.16, 0.11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(f.nose.x - 0.05, f.nose.y - 0.06, 0.035, 0, Math.PI * 2); ctx.fill();
}

function chilco() {
  var n = 7, i, t, x, y;
  ctx.fillStyle = '#3E7A2A';
  for (i = 0; i < n - 1; i++) {
    t = -1.1 + (i + 0.5) * (2.2 / (n - 1)); x = 1.2 * Math.sin(t); y = -0.25 - 1.15 * Math.cos(t);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t + Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (i = 0; i < n; i++) {
    t = -1.1 + i * (2.2 / (n - 1)); x = 1.2 * Math.sin(t); y = -0.25 - 1.15 * Math.cos(t);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.6); ctx.scale(1.3, 1.3);
    ctx.fillStyle = '#C8102E';
    [-0.9, -0.3, 0.3, 0.9].forEach(function (a) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -0.16, 0.06, 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    ctx.fillStyle = '#6A2C91'; ctx.beginPath(); ctx.ellipse(0, 0.06, 0.1, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#C8102E'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(-0.03, 0.15); ctx.lineTo(-0.05, 0.3); ctx.moveTo(0.03, 0.15); ctx.lineTo(0.05, 0.3); ctx.stroke();
    ctx.restore();
  }
}

function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

var DRAW = { anteojos: anteojos, bigote: bigote, sonidista: sonidista, huemul: huemul, chilco: chilco };

/* ---------- Detección y suavizado ---------- */
function measure(det) {
  var k = det.keypoints, W = cv.width, H = cv.height;
  if (!k || k.length < 6) { return null; }
  var p = k.map(function (q) { return { x: q.x * W, y: q.y * H }; });
  var cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
  var dx = p[1].x - p[0].x, dy = p[1].y - p[0].y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  if (d < 4) { return null; }
  var c = Math.cos(-ang), s = Math.sin(-ang);
  function local(q) { var x = q.x - cx, y = q.y - cy; return { x: (x * c - y * s) / d, y: (x * s + y * c) / d }; }
  return { cx: cx, cy: cy, d: d, ang: ang, nose: local(p[2]), mouth: local(p[3]), earR: local(p[4]), earL: local(p[5]) };
}

function smooth(list) {
  var a = 0.55;
  return list.map(function (f) {
    var best = null, bd = Infinity;
    faces.forEach(function (g) { var dd = Math.hypot(g.cx - f.cx, g.cy - f.cy); if (dd < bd) { bd = dd; best = g; } });
    if (!best || bd > f.d * 1.5) { return f; }
    function mix(u, v) { return u + (v - u) * a; }
    function mixp(u, v) { return { x: mix(u.x, v.x), y: mix(u.y, v.y) }; }
    return { cx: mix(best.cx, f.cx), cy: mix(best.cy, f.cy), d: mix(best.d, f.d), ang: mix(best.ang, f.ang),
      nose: mixp(best.nose, f.nose), mouth: mixp(best.mouth, f.mouth), earR: mixp(best.earR, f.earR), earL: mixp(best.earL, f.earL) };
  });
}

function loop() {
  if (!running) { return; }
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) { return; }
  if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; }
  frame++;
  /* si el teléfono tarda, detectamos un cuadro sí y uno no */
  if (detector && (slow < 3 || frame % 2 === 0)) {
    var ts = performance.now(); if (ts <= lastTs) { ts = lastTs + 1; } lastTs = ts;
    try {
      var t0 = performance.now();
      var res = detector.detectForVideo(vid, ts);
      var took = performance.now() - t0; slow = took > 30 ? Math.min(6, slow + 1) : Math.max(0, slow - 1);
      faces = smooth((res.detections || []).map(measure).filter(Boolean));
    } catch (e) { /* un cuadro fallido no corta el loop */ }
  }
  render(ctx);
}

function render(c) {
  var W = cv.width, H = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (facing === 'user') { c.setTransform(-1, 0, 0, 1, W, 0); }
  c.drawImage(vid, 0, 0, W, H);
  var fn = DRAW[mask];
  if (!fn) { return; }
  faces.forEach(function (f) {
    c.save(); c.translate(f.cx, f.cy); c.rotate(f.ang); c.scale(f.d, f.d); fn(f); c.restore();
  });
}

/* ---------- Cámara ---------- */
function startCamera() {
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } }).then(function (s) {
    stream = s; vid.srcObject = s; return vid.play();
  });
}

function loadDetector() {
  return import('./mp/vision_bundle.mjs').then(function (mp) {
    return mp.FilesetResolver.forVisionTasks('./mp').then(function (files) {
      var opts = function (delegate) { return { baseOptions: { modelAssetPath: MODEL, delegate: delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 }; };
      return mp.FaceDetector.createFromOptions(files, opts('GPU')).catch(function () { return mp.FaceDetector.createFromOptions(files, opts('CPU')); });
    });
  });
}

function say(t, ms) {
  var m = $('msg'); m.textContent = t; m.hidden = false;
  clearTimeout(say.t); if (ms) { say.t = setTimeout(function () { m.hidden = true; }, ms); }
}

$('start').addEventListener('click', function () {
  var b = this; b.disabled = true; b.textContent = 'Cargando…';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('note').textContent = 'Este navegador no deja usar la cámara.'; b.textContent = 'No disponible'; return; }
  var cam = startCamera().then(function () { $('ov').hidden = true; running = true; loop(); say('Buscando caras…', 2500); });
  cam.catch(function () { $('note').textContent = 'No se pudo abrir la cámara. Revisá el permiso en la configuración del navegador.'; b.disabled = false; b.textContent = 'Probar de nuevo'; });
  loadDetector().then(function (d) { detector = d; }).catch(function () {
    say(navigator.onLine ? 'No se pudo cargar el detector' : 'Sin señal: la primera vez hace falta conexión', 6000);
  });
});

$('flip').addEventListener('click', function () {
  if (!running) { return; }
  facing = facing === 'user' ? 'environment' : 'user'; faces = [];
  startCamera().catch(function () { facing = 'user'; startCamera(); });
});

/* ---------- Selector ---------- */
$('chips').innerHTML = MASKS.map(function (m) { return '<button class="chip" type="button" data-m="' + m.id + '" aria-pressed="' + (m.id === mask) + '">' + m.name + '</button>'; }).join('');
$('chips').addEventListener('click', function (e) {
  var b = e.target.closest('[data-m]'); if (!b) { return; }
  mask = b.dataset.m;
  [].forEach.call(this.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
});

/* ---------- Foto con marco del FAA! ---------- */
$('shot').addEventListener('click', function () {
  if (!running || !cv.width) { return; }
  var W = cv.width, H = cv.height, band = Math.round(W * 0.14);
  var out = document.createElement('canvas'); out.width = W; out.height = H + band;
  var o = out.getContext('2d');
  o.drawImage(cv, 0, 0);
  o.fillStyle = '#1F3A12'; o.fillRect(0, H, W, band);
  var pad = band * 0.2;
  if (logo.complete && logo.naturalWidth) { var lh = band * 0.56, lw = lh * logo.naturalWidth / logo.naturalHeight; o.drawImage(logo, pad, H + (band - lh) / 2, lw, lh); }
  o.fillStyle = CREMA; o.font = '700 ' + Math.round(band * 0.26) + 'px system-ui,sans-serif'; o.textAlign = 'right'; o.textBaseline = 'middle';
  o.fillText('equipo FAA! 2026', W - pad, H + band / 2);
  var fl = $('flash'); fl.classList.add('on'); setTimeout(function () { fl.classList.remove('on'); }, 60);
  out.toBlob(function (blob) {
    if (!blob) { return; }
    var file = new File([blob], 'faa2026-mascara.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'FAA! 2026' }).catch(function () {});
    } else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }
  }, 'image/jpeg', 0.9);
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden && stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; running = false; }
  else if (!document.hidden && !running && $('ov').hidden) { startCamera().then(function () { running = true; loop(); }); }
});
