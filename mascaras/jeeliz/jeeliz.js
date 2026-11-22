/* Máscaras del FAA! 2026 · versión de prueba con Jeeliz FaceFilter (para comparar con la de MediaPipe en ../).
   Jeeliz da directamente la posición, el tamaño y la rotación de cada cabeza (corre en la placa de video, con WebGL).
   Con eso se arma el sistema de ejes de la cabeza y las máscaras 3D se dibujan igual que en la otra versión.
   La librería y su red neuronal (~0,5 MB comprimidos) se bajan al tocar «Activar cámara», con un 26 que se llena. */

var LIB = './jz/jeelizFaceFilter.moduleES6.js', NET = './jz/NN_LIGHT_1.json';
var LIB_BYTES = 111478, NET_BYTES = 711104;
/* calibración: el tamaño de la ventana de detección de Jeeliz contra las unidades de las máscaras (9,5 cm),
   y dónde quedan los ojos respecto del centro de esa ventana */
var JZ_SIZE = 0.6, JZ_EYES = -0.3, MAX_FACES = 2;
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d'), vid = $('vid');
var detector = null, stream = null, facing = 'user', mask = 'anteojos';
var faces = [], lastTs = -1, running = false;
/* último estado de cada cara que avisó Jeeliz */
var jzStates = [], jzOn = [];

var stats = { frames: 0, dets: 0, t: 0, fps: 0, tps: 0 };
function tune(now) {
  if (!stats.t) { stats.t = now; return; }
  var dt = now - stats.t; if (dt < 1500) { return; }
  stats.fps = stats.frames * 1000 / dt; stats.tps = stats.dets * 1000 / dt;
  stats.frames = stats.dets = 0; stats.t = now; showStats();
}
function showStats() {
  var el = $('stats'); if (!el || el.hidden) { return; }
  el.textContent = 'Video ' + Math.round(stats.fps) + ' fps · Trackeo ' + Math.round(stats.tps) + '/s · ' + faces.length + (faces.length === 1 ? ' cara' : ' caras') + ' · Jeeliz';
}

var logo = new Image(); logo.src = '../../logo.webp';

var VERDE = [45, 106, 31, 1], CLARO = [147, 204, 110, 1], NEGRO = [27, 30, 24, 1], CAFE = [122, 82, 50, 1];

/* ---------- Geometría ---------- */
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm(a) { return mul(a, 1 / (len(a) || 1)); }
function lerp(a, b, t) { return add(a, mul(sub(b, a), t)); }

/* contorno de la cara, para esconder lo que queda detrás de la cabeza */
var UNIT = 9.5;
var OVALC = [];
for (var oi = 0; oi < 32; oi++) { var ot = oi / 32 * Math.PI * 2; OVALC.push([7 * Math.sin(ot) / UNIT, (2 - 9 * Math.cos(ot)) / UNIT, (1 + 4 * Math.abs(Math.sin(ot))) / UNIT]); }
/* puntos de referencia de la cara, en unidades de 9,5 cm */
var ANCH = { top: [0, -0.74, 0.05], chin: [0, 1.16, 0.1], nose: [0, 0.47, -0.24], under: [0, 0.6, -0.18], lip: [0, 0.7, -0.15],
  mr: [-0.26, 0.76, -0.02], ml: [0.26, 0.76, -0.02], er: [-0.34, 0, 0], el: [0.34, 0, 0], hw: 0.74, earY: 0.2, earZ: 0.7 };

/* Jeeliz usa los ejes de three.js (Y para arriba, Z hacia la cámara) y la rotación en orden ZYX.
   Acá se pasan a los ejes de las máscaras: X a la derecha, Y para abajo, Z hacia atrás de la cabeza. */
function jzFrame(ds) {
  var W = cv.width, H = cv.height;
  var cx = Math.cos(ds.rx), sx = Math.sin(ds.rx), cy = Math.cos(ds.ry), sy = Math.sin(ds.ry), cz = Math.cos(ds.rz), sz = Math.sin(ds.rz);
  /* R = Rz · Ry · Rx */
  var R = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx]
  ];
  var col = function (j) { return [R[0][j], -R[1][j], -R[2][j]]; }; /* columna de R, con Y y Z dados vuelta */
  var X = col(0), Y = mul(col(1), -1), Z = mul(col(2), -1);
  var s = ds.s * W * JZ_SIZE, c = [(0.5 + 0.5 * ds.x) * W, (0.5 - 0.5 * ds.y) * H, 0];
  return buildFrame(add(c, mul(Y, JZ_EYES * s)), s, X, Y);
}

function buildFrame(O, s, X, Y) {
  var Z = cross(X, Y);
  var F = { O: O, s: s, X: X, Y: Y, Z: Z, f: cv.width * 1.6, A: ANCH };
  F.world = function (m) { return add(O, mul(add(add(mul(X, m[0]), mul(Y, m[1])), mul(Z, m[2])), s)); };
  F.proj = function (m) {
    var w = F.world(m), kk = F.f / (F.f + (w[2] - O[2]));
    return { x: O[0] + (w[0] - O[0]) * kk, y: O[1] + (w[1] - O[1]) * kk, z: w[2], k: kk };
  };
  var pts = OVALC.map(function (m) { var q = F.proj(m); return [q.x, q.y]; }), ox = 0, oy = 0;
  pts.forEach(function (p) { ox += p[0]; oy += p[1]; }); ox /= pts.length; oy /= pts.length;
  var up = [-Y[0], -Y[1]], ul = Math.hypot(up[0], up[1]) || 1; up = [up[0] / ul, up[1] / ul];
  F.occ = pts.map(function (p) {
    var vx = p[0] - ox, vy = p[1] - oy, q = [ox + vx * 1.1, oy + vy * 1.1];
    if (vx * up[0] + vy * up[1] > 0) { q[0] += up[0] * 0.35 * s; q[1] += up[1] * 0.35 * s; }
    return q;
  });
  F.backZ = F.world([0, ANCH.earY, ANCH.earZ])[2] + 0.15 * s;
  F.roll = Math.atan2(X[1], X[0]);
  return F;
}

function inside(pt, poly) {
  var c = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) { c = !c; }
  }
  return c;
}

/* ---------- Piezas 3D: se juntan, se ordenan por profundidad y se dibujan ---------- */
var items, F;
function rgba(c, sh) { sh = sh === undefined ? 1 : sh; return 'rgba(' + Math.round(c[0] * sh) + ',' + Math.round(c[1] * sh) + ',' + Math.round(c[2] * sh) + ',' + c[3] + ')'; }
function hidden(p) { return p.z > F.backZ && inside([p.x, p.y], F.occ); }

function poly(pts, fill) {
  var q = pts.map(F.proj), z = 0, x = 0, y = 0;
  q.forEach(function (p) { z += p.z; x += p.x; y += p.y; });
  var c = { x: x / q.length, y: y / q.length, z: z / q.length };
  if (hidden(c)) { return; }
  var w = pts.map(F.world), n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0]))), sh = 0.62 + 0.38 * Math.abs(n[2]);
  items.push({ z: c.z, draw: function () {
    ctx.beginPath(); q.forEach(function (p, i) { if (i) { ctx.lineTo(p.x, p.y); } else { ctx.moveTo(p.x, p.y); } }); ctx.closePath();
    ctx.fillStyle = rgba(fill, sh); ctx.fill();
  } });
}

function strip(pts, color, lw, bias, keep) {
  var q = pts.map(F.proj);
  for (var i = 1; i < q.length; i++) {
    (function (a, b) {
      var c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 - (bias || 0) * F.s };
      if (!keep && hidden(c)) { return; }
      items.push({ z: c.z, draw: function () {
        ctx.strokeStyle = rgba(color); ctx.lineCap = 'round'; ctx.lineWidth = lw * F.s * (a.k + b.k) / 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } });
    })(q[i - 1], q[i]);
  }
}

function sprite(m, size, fn, bias) {
  var p = F.proj(m);
  if (hidden(p)) { return; }
  items.push({ z: p.z - (bias || 0) * F.s, draw: function () {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(F.roll); var k = size * F.s * p.k; ctx.scale(k, k); fn(); ctx.restore();
  } });
}

/* un círculo (o elipse) en el plano de dos ejes */
function ring(c, u, v, ru, rv, n) {
  var out = []; n = n || 24;
  for (var i = 0; i < n; i++) { var t = i / n * Math.PI * 2; out.push(add(c, add(mul(u, Math.cos(t) * ru), mul(v, Math.sin(t) * rv)))); }
  return out;
}

/* curva Bézier cúbica muestreada */
function bez(p0, p1, p2, p3, n, out) {
  for (var i = 1; i <= n; i++) {
    var t = i / n, a = (1 - t) * (1 - t) * (1 - t), b = 3 * (1 - t) * (1 - t) * t, c = 3 * (1 - t) * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
}

var EX = [1, 0, 0], EY = [0, 1, 0], EZ = [0, 0, 1];

/* ---------- Máscaras ---------- */
function anteojos() {
  var A = F.A, r = 0.27, eyes = [A.er, A.el];
  eyes.forEach(function (e, i) {
    var sg = i ? 1 : -1, c = [e[0], e[1] - 0.02, e[2] - 0.2], rim = ring(c, EX, EY, r, r, 28);
    poly(rim, [244, 201, 92, 0.3]);
    strip(rim.concat([rim[0]]), VERDE, 0.06, 0.01);
    sprite([c[0] - 0.09, c[1] - 0.1, c[2] - 0.01], 0.06, function () { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.55, -0.6, 0, Math.PI * 2); ctx.fill(); }, 0.02);
    var out = [c[0] + sg * r, c[1] - 0.03, c[2]];
    strip([out, [sg * A.hw * 0.98, A.earY - 0.12, A.earZ - 0.15], [sg * A.hw * 0.98, A.earY - 0.08, A.earZ + 0.25], [sg * A.hw * 0.9, A.earY + 0.15, A.earZ + 0.4]], VERDE, 0.05);
  });
  var a = [A.er[0] + r, A.er[1] - 0.04, A.er[2] - 0.2], b = [A.el[0] - r, A.el[1] - 0.04, A.el[2] - 0.2];
  strip([a, [(a[0] + b[0]) / 2, a[1] - 0.09, a[2] - 0.06], b], VERDE, 0.05, 0.01);
}

function bigote() {
  var A = F.A, m = lerp(A.under, A.lip, 0.5), half = [[0, -0.05]];
  bez([0, -0.05], [0.1, -0.12], [0.27, -0.1], [0.38, 0], 6, half);
  bez([0.38, 0], [0.43, 0.05], [0.5, 0.01], [0.51, -0.09], 5, half);
  bez([0.51, -0.09], [0.54, 0.04], [0.44, 0.13], [0.33, 0.1], 5, half);
  bez([0.33, 0.1], [0.22, 0.07], [0.1, 0.06], [0, 0.05], 5, half);
  [1, -1].forEach(function (sg) {
    poly(half.map(function (p) { var x = sg * p[0]; return [m[0] + x, m[1] + p[1], m[2] - 0.04 + 0.9 * x * x]; }), [59, 36, 18, 1]);
  });
}

function sonidista() {
  var A = F.A, R = A.hw + 0.14, band = [], green = [];
  for (var i = 0; i <= 18; i++) {
    var t = i / 18 * Math.PI, h = A.earY - A.top[1] + 0.4;
    band.push([-R * Math.cos(t), A.earY - h * Math.sin(t), A.earZ + 0.05]);
    green.push([-(R - 0.01) * Math.cos(t), A.earY - (h + 0.02) * Math.sin(t), A.earZ + 0.03]);
  }
  strip(band, NEGRO, 0.15, 0, true);
  strip(green.slice(3, 16), VERDE, 0.05, 0.01, true);
  [-1, 1].forEach(function (sg) {
    var c = [sg * (R + 0.02), A.earY, A.earZ], v = norm([-sg * 0.45, 0, 1]), out = norm(cross(EY, v));
    if (out[0] * sg < 0) { out = mul(out, -1); }
    poly(ring(c, EY, v, 0.32, 0.28, 22), [15, 17, 13, 1]);
    poly(ring(add(c, mul(out, 0.1)), EY, v, 0.32, 0.28, 22), NEGRO);
    poly(ring(add(c, mul(out, 0.11)), EY, v, 0.2, 0.17, 20), CLARO);
  });
  var mic = [[-(R + 0.04), A.earY + 0.2, A.earZ - 0.1], [-A.hw * 0.85, A.mr[1] + 0.05, A.earZ - 0.6], [A.mr[0] - 0.08, A.mr[1] + 0.02, A.mr[2] - 0.12]];
  strip(mic, NEGRO, 0.045);
  sprite(mic[2], 0.08, function () { ctx.fillStyle = rgba(NEGRO); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); }, 0.01);
}

function huemul() {
  var A = F.A, y = A.top[1], z = A.earZ * 0.55;
  [-1, 1].forEach(function (sg) {
    var b = [sg * A.hw * 0.45, y + 0.08, z], j1 = [sg * A.hw * 0.75, y - 0.55, z + 0.15], j2 = [sg * A.hw * 1.05, y - 0.95, z + 0.3], tip = [sg * A.hw * 1.3, y - 1.15, z + 0.4];
    strip([b, j1, j2, tip], CAFE, 0.1);
    strip([j1, [sg * A.hw * 0.55, y - 1.05, z + 0.08]], CAFE, 0.08);
    strip([j2, [sg * A.hw * 0.98, y - 1.38, z + 0.25]], CAFE, 0.07);
    var c = [sg * (A.hw + 0.06), y + 0.4, A.earZ - 0.05], u = norm([sg * 0.6, -0.8, 0.1]), v = norm([0.8, sg * 0.6, sg * 0.45]);
    poly(ring(c, u, v, 0.34, 0.17, 18), [156, 107, 63, 1]);
    poly(ring(add(c, [0, 0, -0.03]), u, v, 0.22, 0.09, 16), [232, 180, 138, 1]);
  });
  sprite([A.nose[0], A.nose[1] - 0.02, A.nose[2] - 0.06], 0.13, function () {
    ctx.fillStyle = rgba(NEGRO); ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-0.35, -0.3, 0.22, 0, Math.PI * 2); ctx.fill();
  }, 0.02);
}

function flor() {
  ctx.fillStyle = '#C8102E';
  [-0.9, -0.3, 0.3, 0.9].forEach(function (a) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -0.5, 0.18, 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  ctx.fillStyle = '#6A2C91'; ctx.beginPath(); ctx.ellipse(0, 0.2, 0.3, 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#C8102E'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-0.1, 0.5); ctx.lineTo(-0.15, 0.95); ctx.moveTo(0.1, 0.5); ctx.lineTo(0.15, 0.95); ctx.stroke();
}

function chilco() {
  var A = F.A, rx = A.hw * 1.05, rz = A.hw * 1.15, cz = A.earZ + 0.05, y0 = A.top[1] - 0.05, n = 14;
  function at(t) { return [rx * Math.sin(t), y0 + 0.17 - 0.6 * (1 - Math.cos(t)) / 2, cz - rz * Math.cos(t)]; }
  for (var i = 0; i < n; i++) {
    var t = i / n * Math.PI * 2, tl = t + Math.PI / n, p = at(tl), tan = norm(sub(at(tl + 0.05), at(tl - 0.05)));
    poly(ring(p, tan, EY, 0.13, 0.05, 10), [62, 122, 42, 1]);
    sprite(at(t), 0.17, flor, 0.02);
  }
}

var MASKS = [
  { id: 'anteojos', name: 'Anteojos', fn: anteojos },
  { id: 'bigote', name: 'Bigote', fn: bigote },
  { id: 'sonidista', name: 'Sonidista', fn: sonidista },
  { id: 'huemul', name: 'Huemul', fn: huemul },
  { id: 'chilco', name: 'Chilco', fn: chilco },
  { id: 'nada', name: 'Sin máscara', fn: null }
];

/* ---------- Seguimiento: lo hace Jeeliz y avisa en callbackTrack ---------- */
function onTrack(list) {
  if (!Array.isArray(list)) { list = [list]; }
  stats.dets++;
  /* con histéresis, para que una cara dudosa no parpadee */
  jzStates = list.filter(function (ds, i) {
    var on = jzOn[i] ? ds.detected > 0.4 : ds.detected > 0.6; jzOn[i] = on; return on;
  }).map(function (ds) { return { x: ds.x, y: ds.y, s: ds.s, rx: ds.rx, ry: ds.ry, rz: ds.rz }; });
}

function loop() {
  if (!running) { return; }
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) { return; }
  if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; }
  var now = performance.now();
  stats.frames++; tune(now);
  faces = jzStates;
  render(now);
}

function render(now) {
  var W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (facing === 'user') { ctx.setTransform(-1, 0, 0, 1, W, 0); }
  ctx.drawImage(vid, 0, 0, W, H);
  var m = MASKS.filter(function (x) { return x.id === mask; })[0];
  if (!m || !m.fn) { return; }
  faces.forEach(function (ds) {
    F = jzFrame(ds); items = [];
    m.fn();
    items.sort(function (a, b) { return b.z - a.z; }).forEach(function (it) { it.draw(); });
  });
}

/* ---------- Cámara y carga ---------- */
function startCamera() {
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } }).then(function (s) {
    stream = s; vid.srcObject = s; return vid.play();
  });
}

/* descarga con avance; si el servidor comprime, se usa el tamaño conocido del archivo */
function grab(url, approx, onp) {
  return fetch(url).then(function (res) {
    if (!res.ok) { throw new Error('HTTP ' + res.status); }
    var n = +res.headers.get('content-length'), total = n && !res.headers.get('content-encoding') ? n : approx;
    if (!res.body || !res.body.getReader) { return res.arrayBuffer().then(function (b) { onp(1, total); return new Uint8Array(b); }); }
    var rd = res.body.getReader(), parts = [], got = 0;
    function pump() {
      return rd.read().then(function (r) {
        if (r.done) { onp(1, total); var out = new Uint8Array(got), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out; }
        parts.push(r.value); got += r.value.length; onp(Math.min(1, got / total), total); return pump();
      });
    }
    return pump();
  });
}

var prog = { lib: 0, net: 0 };
function showProgress() {
  var p = (prog.lib * LIB_BYTES + prog.net * NET_BYTES) / (LIB_BYTES + NET_BYTES);
  $('nivel').setAttribute('y', String(118 - 104 * p));
  $('meter').setAttribute('aria-valuenow', String(Math.round(p * 100)));
}

function loadDetector() {
  var libP = grab(LIB, LIB_BYTES, function (p) { prog.lib = p; showProgress(); }).then(function (bytes) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    return import(url);
  });
  var netP = grab(NET, NET_BYTES, function (p) { prog.net = p; showProgress(); }).then(function (bytes) { return new TextDecoder().decode(bytes); });
  return Promise.all([libP, netP]).then(function (r) {
    var JZ = r[0].default, jc = $('jzcv');
    jc.width = vid.videoWidth || 640; jc.height = vid.videoHeight || 480;
    return new Promise(function (ok, fail) {
      JZ.init({
        canvas: jc, NNC: r[1], maxFacesDetected: MAX_FACES, followZRot: true,
        videoSettings: { videoElement: vid },
        callbackReady: function (err) { if (err) { fail(err); } else { ok(JZ); } },
        callbackTrack: onTrack
      });
    });
  });
}

function say(t, ms) {
  var m = $('msg'); m.textContent = t; m.hidden = false;
  clearTimeout(say.t); if (ms) { say.t = setTimeout(function () { m.hidden = true; }, ms); }
}

$('start').addEventListener('click', function () {
  var b = this, box = b.parentNode;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('note').textContent = 'Este navegador no deja usar la cámara.'; b.disabled = true; return; }
  b.disabled = true;
  startCamera().then(function () {
    [].forEach.call(box.querySelectorAll('p,.go'), function (el) { el.hidden = true; });
    $('meter').hidden = false; running = true; loop();
    return loadDetector().then(function (d) { detector = d; }).catch(function () {
      say(navigator.onLine ? 'No se pudo cargar el detector' : 'Sin señal: la primera vez hace falta conexión', 6000);
    }).then(function () { $('ov').hidden = true; });
  }).catch(function () { $('note').textContent = 'No se pudo abrir la cámara. Revisá el permiso en la configuración del navegador.'; b.disabled = false; b.textContent = 'Probar de nuevo'; });
});

$('flip').addEventListener('click', function () {
  if (!running) { return; }
  facing = facing === 'user' ? 'environment' : 'user'; faces = []; jzStates = [];
  startCamera().catch(function () { facing = 'user'; startCamera(); });
});

$('ttl').addEventListener('click', function () { var el = $('stats'); el.hidden = !el.hidden; showStats(); });

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
  o.fillStyle = '#F4F7D9'; o.font = '700 ' + Math.round(band * 0.26) + 'px system-ui,sans-serif'; o.textAlign = 'right'; o.textBaseline = 'middle';
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
