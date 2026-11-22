/* Máscaras del FAA! 2026.
   MediaPipe Face Detector (el detector liviano) da 6 puntos por cara: ojos, punta de la nariz, boca y orejas.
   Con esos 6 puntos se estima la rotación de la cabeza ajustando un modelo 3D simple de cabeza (método POS:
   pose por ortografía y escala) y las máscaras se dibujan como objetos 3D en un canvas 2D: cada pieza se
   proyecta con perspectiva, se ordena de atrás hacia adelante y se esconde si queda detrás de la cabeza.
   El motor (mp/) y el modelo (~230 KB, de Google) se bajan recién al tocar «Activar cámara», con un 26 que se llena.
   El service worker los guarda para usarlos sin señal. La imagen de la cámara nunca sale del teléfono. */

var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';
var WASM = './mp/vision_wasm_internal.wasm';
var WASM_BYTES = 14665716, MODEL_BYTES = 230000; /* tamaños reales, por si el servidor no los informa */
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d'), vid = $('vid');
var detector = null, stream = null, facing = 'user', mask = 'tera-rosa';
var faces = [], lastTs = -1, running = false;
/* el detector mira una copia chica del video y corre unas pocas veces por segundo; entre detección y detección
   se predice el movimiento, así la máscara se dibuja fluida a la velocidad de la pantalla */
var det = document.createElement('canvas'), dctx = det.getContext('2d');
var lastDet = 0;

/* Calidad automática: arranca en el nivel más alto y baja si el video cae de ~24 cuadros por segundo;
   si después sobra, vuelve a subir de a un nivel. Cada nivel define el ancho de la copia que mira el detector,
   cada cuánto detecta (0 = en cada cuadro) y cuántas caras busca. */
var LEVELS = [
  { w: 320, every: 0 },
  { w: 256, every: 33 },
  { w: 192, every: 50 },
  { w: 160, every: 80 },
  { w: 128, every: 125 }
];
var level = 0, stats = { frames: 0, dets: 0, ms: 0, t: 0, good: 0, wait: 0, fps: 0, tps: 0, dms: 0 };

function setLevel(n) {
  n = Math.max(0, Math.min(LEVELS.length - 1, n));
  if (n === level) { return; }
  level = n;
}

/* cada 1,5 s: medir y decidir */
function tune(now) {
  if (!stats.t) { stats.t = now; return; }
  var dt = now - stats.t; if (dt < 1500) { return; }
  stats.fps = stats.frames * 1000 / dt; stats.tps = stats.dets * 1000 / dt; stats.dms = stats.dets ? stats.ms / stats.dets : 0;
  stats.frames = stats.dets = stats.ms = 0; stats.t = now;
  if (!detector) { showStats(); return; }
  if (stats.wait > 0) { stats.wait--; }
  else if (stats.fps < 24 && level < LEVELS.length - 1) { setLevel(level + 1); stats.good = 0; stats.wait = 1; }
  else if (stats.fps > 45 && level > 0) { if (++stats.good >= 3) { setLevel(level - 1); stats.good = 0; stats.wait = 2; } }
  else { stats.good = 0; }
  showStats();
}

function showStats() {
  var el = $('stats'); if (!el || el.hidden) { return; }
  el.textContent = 'Video ' + Math.round(stats.fps) + ' fps · Trackeo ' + Math.round(stats.tps) + '/s · ' + Math.round(stats.dms) + ' ms · N' + (level + 1) + ' · ' + faces.length + (faces.length === 1 ? ' cara' : ' caras');
}
var logo = new Image(); logo.src = '../logo.webp';

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

/* Modelo 3D simple de cabeza, en cm, con el origen entre las pupilas.
   X hacia la derecha de la imagen, Y hacia abajo, Z hacia atrás (lejos de la cámara).
   Los 6 puntos en el orden en que los da el detector: ojo derecho, ojo izquierdo, nariz, boca, oreja derecha, oreja izquierda. */
var CAN = [[-3.2, 0, 0], [3.2, 0, 0], [0, 4.6, -2.2], [0, 7.2, -1.0], [-7.3, 1.6, 7.8], [7.3, 1.6, 7.8]];
var UNIT = 9.5; /* las máscaras se dibujan en unidades de 9,5 cm (más o menos el ancho de los ojos) */
/* peso de cada punto en el ajuste: las orejas son las menos confiables (cuando la cabeza gira, el detector las adivina) */
var WGT = [1, 1, 1.2, 1, 0.35, 0.35], WSUM = WGT.reduce(function (a, b) { return a + b; }, 0);
var CANM = CAN.reduce(function (m, p, i) { return add(m, mul(p, WGT[i] / WSUM)); }, [0, 0, 0]);
var CANC = CAN.map(function (p) { return sub(p, CANM); });
var GINV = (function () {
  var g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  CANC.forEach(function (p, n) { for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) { g[i][j] += WGT[n] * p[i] * p[j]; } } });
  var a = g, det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  return [
    [(a[1][1] * a[2][2] - a[1][2] * a[2][1]) / det, (a[0][2] * a[2][1] - a[0][1] * a[2][2]) / det, (a[0][1] * a[1][2] - a[0][2] * a[1][1]) / det],
    [(a[1][2] * a[2][0] - a[1][0] * a[2][2]) / det, (a[0][0] * a[2][2] - a[0][2] * a[2][0]) / det, (a[0][2] * a[1][0] - a[0][0] * a[1][2]) / det],
    [(a[1][0] * a[2][1] - a[1][1] * a[2][0]) / det, (a[0][1] * a[2][0] - a[0][0] * a[2][1]) / det, (a[0][0] * a[1][1] - a[0][1] * a[1][0]) / det]
  ];
})();
/* contorno de la cara, para esconder lo que queda detrás de la cabeza */
var OVALC = [];
for (var oi = 0; oi < 32; oi++) { var ot = oi / 32 * Math.PI * 2; OVALC.push([7 * Math.sin(ot) / UNIT, (2 - 9 * Math.cos(ot)) / UNIT, (1 + 4 * Math.abs(Math.sin(ot))) / UNIT]); }
/* puntos de referencia de la cara, en unidades de 9,5 cm */
var ANCH = { top: [0, -0.74, 0.05], chin: [0, 1.16, 0.1], nose: [0, 0.47, -0.24], under: [0, 0.6, -0.18], lip: [0, 0.7, -0.15],
  mr: [-0.26, 0.76, -0.02], ml: [0.26, 0.76, -0.02], er: [-0.34, 0, 0], el: [0.34, 0, 0], hw: 0.74, earY: 0.2, earZ: 0.7 };

/* Pose desde los 6 puntos: se busca la matriz que mejor lleva el modelo a la imagen y se la separa en escala y rotación. */
function headFrame(P, tr, now) {
  var n = CAN.length, mx = 0, my = 0, i;
  for (i = 0; i < n; i++) { mx += WGT[i] * P[i][0]; my += WGT[i] * P[i][1]; }
  mx /= WSUM; my /= WSUM;
  var bx = [0, 0, 0], by = [0, 0, 0];
  for (i = 0; i < n; i++) { bx = add(bx, mul(CANC[i], WGT[i] * (P[i][0] - mx))); by = add(by, mul(CANC[i], WGT[i] * (P[i][1] - my))); }
  var rx = [dot(GINV[0], bx), dot(GINV[1], bx), dot(GINV[2], bx)], ry = [dot(GINV[0], by), dot(GINV[1], by), dot(GINV[2], by)];
  var k = (len(rx) + len(ry)) / 2, r0 = norm(rx), r1 = norm(sub(ry, mul(r0, dot(ry, r0)))), r2 = cross(r0, r1);
  var X = [r0[0], r1[0], r2[0]], Y = [r0[1], r1[1], r2[1]];
  /* la rotación y el tamaño también pasan por el filtro, y después se vuelven a escuadrar los ejes */
  if (tr) {
    X = X.map(function (v, j) { return tr.rot[j].filter(v, now); });
    Y = Y.map(function (v, j) { return tr.rot[3 + j].filter(v, now); });
    k = tr.size.filter(k, now);
    X = norm(X); Y = norm(sub(Y, mul(X, dot(Y, X))));
  }
  var Z = cross(X, Y);
  var O = [mx - dot(rx, CANM), my - dot(ry, CANM), 0], s = k * UNIT;
  var F = { O: O, s: s, X: X, Y: Y, Z: Z, f: cv.width * 1.6, A: ANCH };
  F.world = function (m) { return add(O, mul(add(add(mul(X, m[0]), mul(Y, m[1])), mul(Z, m[2])), s)); };
  F.proj = function (m) {
    var w = F.world(m), kk = F.f / (F.f + (w[2] - O[2]));
    return { x: O[0] + (w[0] - O[0]) * kk, y: O[1] + (w[1] - O[1]) * kk, z: w[2], k: kk };
  };
  var pts = OVALC.map(function (m) { var q = F.proj(m); return [q.x, q.y]; }), cx = 0, cy = 0;
  pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
  var up = [-Y[0], -Y[1]], ul = Math.hypot(up[0], up[1]) || 1; up = [up[0] / ul, up[1] / ul];
  F.occ = pts.map(function (p) {
    var vx = p[0] - cx, vy = p[1] - cy, q = [cx + vx * 1.1, cy + vy * 1.1];
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

/* La tera, mascota del FAA!: lo que lleva en la cabeza, sin la cabeza gris (para que se vea la cara).
   Visor de dos placas triangulares translúcidas cruzadas en X, pico, auriculares grises con cable y copete. */
var TERA = {
  rosa: { visor: [255, 60, 110, 0.4], borde: [176, 18, 66, 1] },
  verde: { visor: [236, 230, 140, 0.45], borde: [150, 140, 50, 1] },
  dorada: { visor: [242, 186, 80, 0.45], borde: [150, 92, 30, 1] }
};
var GRIS = [150, 150, 150, 1], GRIS_OSC = [70, 72, 70, 1], GRIS_CLARO = [196, 196, 196, 1], PICO = [226, 128, 230, 1];

function tera(col) {
  var A = F.A, c = TERA[col];
  /* visor: dos triángulos que se tocan en el centro, apenas curvados hacia los costados */
  var tl = [-0.6, -0.62, -0.2], bl = [-0.6, 0.5, -0.2], mid = [0, 0.12, -0.36], tr = [0.6, -0.62, -0.2], br = [0.6, 0.5, -0.2];
  poly([tl, bl, mid], c.visor);
  poly([tr, mid, br], c.visor);
  strip([tl, bl, mid, tl], c.borde, 0.025, 0.02);
  strip([tr, br, mid, tr], c.borde, 0.025, 0.02);
  /* pico: una pirámide desde la nariz hacia adelante y abajo */
  var top = [0, 0.22, -0.38], bot = [0, 0.58, -0.32], l = [-0.18, 0.4, -0.33], r = [0.18, 0.4, -0.33], tip = [0, 0.98, -1.0];
  poly([top, l, tip], PICO); poly([top, tip, r], PICO); poly([l, bot, tip], PICO); poly([bot, r, tip], PICO);
  [-1, 1].forEach(function (sg) { strip([[sg * 0.13, 0.45, -0.37], lerp([sg * 0.13, 0.45, -0.37], tip, 0.62)], [110, 40, 120, 1], 0.03, 0.01); });
  /* auriculares grises */
  var R = A.hw + 0.14, band = [], light = [];
  for (var i = 0; i <= 18; i++) {
    var t = i / 18 * Math.PI, h = A.earY - A.top[1] + 0.45;
    band.push([-R * Math.cos(t), A.earY - h * Math.sin(t), A.earZ + 0.1]);
    light.push([-(R - 0.01) * Math.cos(t), A.earY - (h + 0.03) * Math.sin(t), A.earZ + 0.08]);
  }
  strip(band, GRIS_OSC, 0.16, 0, true);
  strip(light.slice(2, 17), GRIS, 0.08, 0.01, true);
  [-1, 1].forEach(function (sg) {
    var cc = [sg * (R + 0.02), A.earY, A.earZ], v = norm([-sg * 0.45, 0, 1]), out = norm(cross(EY, v));
    if (out[0] * sg < 0) { out = mul(out, -1); }
    poly(ring(cc, EY, v, 0.36, 0.32, 22), GRIS_OSC);
    poly(ring(add(cc, mul(out, 0.1)), EY, v, 0.36, 0.32, 22), GRIS);
    poly(ring(add(cc, mul(out, 0.11)), EY, v, 0.22, 0.2, 20), GRIS_CLARO);
  });
  /* cable que cuelga del auricular derecho de la imagen */
  var c0 = [R + 0.1, A.earY + 0.3, A.earZ + 0.05];
  strip([c0, [R + 0.18, A.earY + 0.8, A.earZ - 0.05], [R + 0.08, A.earY + 1.35, A.earZ - 0.25], [R - 0.05, A.earY + 1.9, A.earZ - 0.3]], NEGRO, 0.025);
  /* copete: plumitas finas desde arriba y atrás de la cabeza, hacia arriba y atrás */
  var base = [0.08, A.top[1] - 0.12, A.earZ + 0.15];
  [[0.2, -1.4, 1.5], [0.42, -1.12, 1.7], [0.62, -0.8, 1.8], [0.03, -1.55, 1.25]].forEach(function (d, k) {
    var end = add(base, d), ctl = add(base, [d[0] * 0.3, d[1] * 0.85, d[2] * 0.3]), pts = [];
    for (var j = 0; j <= 8; j++) { var u = j / 8; pts.push(add(add(mul(base, (1 - u) * (1 - u)), mul(ctl, 2 * u * (1 - u))), mul(end, u * u))); }
    strip(pts, NEGRO, k === 3 ? 0.045 : 0.035);
  });
}

var MASKS = [
  { id: 'tera-rosa', name: 'Tera rosa', fn: function () { tera('rosa'); } },
  { id: 'tera-verde', name: 'Tera verde', fn: function () { tera('verde'); } },
  { id: 'tera-dorada', name: 'Tera dorada', fn: function () { tera('dorada'); } },
  { id: 'anteojos', name: 'Anteojos', fn: anteojos },
  { id: 'bigote', name: 'Bigote', fn: bigote },
  { id: 'sonidista', name: 'Sonidista', fn: sonidista },
  { id: 'huemul', name: 'Huemul', fn: huemul },
  { id: 'chilco', name: 'Chilco', fn: chilco },
  { id: 'nada', name: 'Sin máscara', fn: null }
];

/* ---------- Detección, filtro y predicción ---------- */
var USED = [0, 1, 2, 3, 4, 5];

/* Filtro «One Euro»: suaviza mucho cuando algo está quieto y poco cuando se mueve rápido,
   así la máscara no tiembla parada y tampoco se queda atrás al moverse. */
function OneEuro(minCut, beta) { this.minCut = minCut; this.beta = beta; this.x = null; this.dx = 0; this.t = 0; }
OneEuro.prototype.filter = function (v, t) {
  if (this.x === null) { this.x = v; this.t = t; return v; }
  var dt = (t - this.t) / 1000; if (dt <= 0) { return this.x; }
  var a = function (cut) { var r = 2 * Math.PI * cut * dt; return r / (r + 1); };
  this.dx += a(1) * ((v - this.x) / dt - this.dx);
  this.x += a(this.minCut + this.beta * Math.abs(this.dx)) * (v - this.x);
  this.t = t; return this.x;
};

/* cada cara que se sigue tiene sus filtros */
var tracks = [];
function newTrack() {
  var tr = { kp: [], rot: [], size: new OneEuro(1.0, 0.02), seen: 0, pts: null };
  for (var i = 0; i < 12; i++) { tr.kp.push(new OneEuro(1.0, 0.02)); }
  for (var j = 0; j < 6; j++) { tr.rot.push(new OneEuro(1.2, 1.5)); }
  return tr;
}
function center(P) { return [(P[0][0] + P[1][0] + P[3][0]) / 3, (P[0][1] + P[1][1] + P[3][1]) / 3]; }

function updateTracks(list, now) {
  var free = tracks.slice(), next = [];
  list.forEach(function (P) {
    var c = center(P), best = null, bd = Infinity;
    free.forEach(function (tr) { var q = center(tr.pts), d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < bd) { bd = d; best = tr; } });
    var eye = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
    var tr = best && bd < eye * 1.5 ? best : newTrack();
    if (tr === best) { free.splice(free.indexOf(tr), 1); }
    tr.pts = P.map(function (p, i) { return [tr.kp[i * 2].filter(p[0], now), tr.kp[i * 2 + 1].filter(p[1], now), 0]; });
    tr.seen = now; next.push(tr);
  });
  /* una cara que se pierde un instante no desaparece de golpe */
  free.forEach(function (tr) { if (now - tr.seen < 250) { next.push(tr); } });
  tracks = next;
}

/* entre detección y detección, se sigue el movimiento con la velocidad que da el filtro (sin pasarse) */
function predicted(tr, now) {
  var dt = Math.min(120, now - tr.seen) / 1000 * 0.7;
  return tr.pts.map(function (p, i) { return [p[0] + tr.kp[i * 2].dx * dt, p[1] + tr.kp[i * 2 + 1].dx * dt, 0]; });
}

/* Si hay una sola cara, el detector mira un recorte alrededor de ella: la cara llena la imagen que analiza y
   los puntos salen más precisos. Cada tanto mira la imagen entera para encontrar caras nuevas. */
var lastFull = 0;
function detect(now) {
  var vw = vid.videoWidth, vh = vid.videoHeight, roi = null;
  if (tracks.length === 1 && now - tracks[0].seen < 200 && now - lastFull < 1000) {
    var P = tracks[0].pts, c = center(P), eye = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), side = Math.min(vw, vh, eye * 5);
    roi = { x: Math.max(0, Math.min(vw - side, c[0] - side / 2)), y: Math.max(0, Math.min(vh - side, c[1] - side * 0.45)), w: side, h: side };
  }
  if (!roi) { roi = { x: 0, y: 0, w: vw, h: vh }; lastFull = now; }
  var W = Math.min(LEVELS[level].w, Math.round(roi.w)), H = Math.round(W * roi.h / roi.w);
  if (det.width !== W || det.height !== H) { det.width = W; det.height = H; }
  dctx.drawImage(vid, roi.x, roi.y, roi.w, roi.h, 0, 0, W, H);
  var ts = now; if (ts <= lastTs) { ts = lastTs + 1; } lastTs = ts;
  var t0 = performance.now(), res = detector.detectForVideo(det, ts), took = performance.now() - t0;
  stats.dets++; stats.ms += took;
  var sx = cv.width / vw, sy = cv.height / vh;
  var list = (res.detections || []).filter(function (d) { return d.keypoints && d.keypoints.length >= 6; }).map(function (d) {
    return USED.map(function (i) { var q = d.keypoints[i]; return [(roi.x + q.x * roi.w) * sx, (roi.y + q.y * roi.h) * sy, 0]; });
  });
  if (!list.length && roi.w < vw) { lastFull = 0; } /* se perdió en el recorte: la próxima mira todo */
  updateTracks(list, now);
}

function loop() {
  if (!running) { return; }
  requestAnimationFrame(loop);
  if (vid.readyState < 2 || !vid.videoWidth) { return; }
  if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; }
  var now = performance.now();
  stats.frames++; tune(now);
  if (detector && now - lastDet >= LEVELS[level].every) {
    lastDet = now;
    try { detect(now); } catch (e) { /* un cuadro fallido no corta el loop */ }
  }
  faces = tracks.filter(function (tr) { return tr.pts; });
  render(now);
}

function render(now) {
  var W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (facing === 'user') { ctx.setTransform(-1, 0, 0, 1, W, 0); }
  ctx.drawImage(vid, 0, 0, W, H);
  var m = MASKS.filter(function (x) { return x.id === mask; })[0];
  if (!m || !m.fn) { return; }
  faces.forEach(function (tr) {
    F = headFrame(predicted(tr, now), tr, now); items = [];
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

var prog = { wasm: 0, model: 0 };
function showProgress() {
  var p = (prog.wasm * WASM_BYTES + prog.model * MODEL_BYTES) / (WASM_BYTES + MODEL_BYTES);
  $('nivel').setAttribute('y', String(118 - 104 * p));
  $('meter').setAttribute('aria-valuenow', String(Math.round(p * 100)));
}

function loadDetector() {
  var mpP = import('./mp/vision_bundle.mjs');
  var wasmP = grab(WASM, WASM_BYTES, function (p) { prog.wasm = p; showProgress(); });
  var modelP = grab(MODEL, MODEL_BYTES, function (p, total) { MODEL_BYTES = total; prog.model = p; showProgress(); });
  return Promise.all([mpP, wasmP, modelP]).then(function (r) {
    var mp = r[0], wasmUrl = URL.createObjectURL(new Blob([r[1]], { type: 'application/wasm' })), model = r[2];
    return mp.FilesetResolver.forVisionTasks('./mp').then(function (files) {
      files.wasmBinaryPath = wasmUrl;
      var opts = function (delegate) { return { baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 }; };
      return mp.FaceDetector.createFromOptions(files, opts('GPU')).catch(function () { return mp.FaceDetector.createFromOptions(files, opts('CPU')); });
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
  facing = facing === 'user' ? 'environment' : 'user'; faces = []; tracks = [];
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
