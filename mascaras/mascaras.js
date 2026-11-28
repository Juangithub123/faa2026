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
/* modelo pesado, solo para el modo foto: 478 puntos de la cara con su profundidad (~3,7 MB) */
var LMODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', LMODEL_BYTES = 3758596;
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d'), vid = $('vid');
var delegate = '', detector = null, stream = null, facing = 'user', mask = 'tera-rosa';
var faces = [], lastTs = -1, running = false;
/* el detector mira una copia chica del video y corre unas pocas veces por segundo; entre detección y detección
   se predice el movimiento, así la máscara se dibuja fluida a la velocidad de la pantalla */
var det = document.createElement('canvas'), dctx = det.getContext('2d');
var lastDet = 0;

/* Calidad automática: arranca en el nivel más alto y baja si el video cae de ~24 cuadros por segundo;
   si después sobra, vuelve a subir de a un nivel. Cada nivel define el lado mayor de la vista previa (view),
   el ancho de la copia que mira el detector (w) y cada cuánto detecta (every, 0 = en cada cuadro).
   Las fotos no dependen del nivel: se arman aparte, a la resolución completa de la cámara. */
var LEVELS = [
  { view: 1280, w: 320, every: 0 },
  { view: 960, w: 256, every: 33 },
  { view: 800, w: 192, every: 50 },
  { view: 640, w: 160, every: 80 },
  { view: 480, w: 128, every: 125 }
];
/* resolución que se le pide a la cámara: la más alta que dé; si aun en el último nivel no alcanza, se baja */
var CAMS = [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 640, h: 480 }], cam = 0;
var level = 0, recording = false, stats = { frames: 0, dets: 0, ms: 0, t: 0, good: 0, wait: 0, low: 0, fps: 0, tps: 0, dms: 0 };

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
  if (recording) { showStats(); return; } /* mientras se graba no se cambia nada */
  if (stats.wait > 0) { stats.wait--; }
  else if (stats.fps < 24 && level < LEVELS.length - 1) { setLevel(level + 1); stats.good = 0; stats.wait = 1; }
  else if (stats.fps < 20 && cam < CAMS.length - 1) {
    if (++stats.low >= 2) { cam++; stats.low = 0; stats.wait = 2; tracks = []; startCamera(); }
  }
  else if (stats.fps > 45 && level > 0) { if (++stats.good >= 3) { setLevel(level - 1); stats.good = 0; stats.wait = 2; } }
  else { stats.good = 0; }
  showStats();
}

function showStats() {
  var el = $('stats'); if (!el || el.hidden) { return; }
  el.textContent = 'Video ' + Math.round(stats.fps) + ' fps · Trackeo ' + Math.round(stats.tps) + '/s · ' + Math.round(stats.dms) + ' ms · N' + (level + 1) + ' · ' + faces.length + (faces.length === 1 ? ' cara' : ' caras') + (delegate ? ' · ' + delegate : '') + ' · ' + (vid.videoWidth || 0) + '×' + (vid.videoHeight || 0);
}
var logo = new Image(); logo.src = '../logo.webp';

var NEGRO = [27, 30, 24, 1];

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
  return makeFrame(O, s, X, Y, Z, cv.width * 1.6);
}

/* el marco de una cabeza: origen en la imagen (entre las pupilas), tamaño de la unidad en píxeles, ejes de la cabeza
   vistos en la imagen y distancia focal (para la perspectiva) */
function makeFrame(O, s, X, Y, Z, f) {
  var F = { O: O, s: s, X: X, Y: Y, Z: Z, f: f, A: ANCH };
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
  /* cabeza invisible: un elipsoide que sigue la cabeza; su contorno sirve para tapar lo que queda detrás */
  var hp = [];
  for (var hu = 0; hu < 16; hu++) {
    for (var hv = -4; hv <= 4; hv++) {
      var a = hu / 16 * Math.PI * 2, b = hv / 4 * Math.PI / 2;
      var q = F.proj([HEAD.c[0] + HEAD.r[0] * Math.cos(b) * Math.cos(a), HEAD.c[1] + HEAD.r[1] * Math.sin(b), HEAD.c[2] + HEAD.r[2] * Math.cos(b) * Math.sin(a)]);
      hp.push([q.x, q.y]);
    }
  }
  F.head = hull(hp);
  F.headZ = F.world(HEAD.c)[2];
  return F;
}

/* tamaño de la cabeza invisible, en unidades de 9,5 cm: centro un poco detrás de las orejas */
var HEAD = { c: [0, -0.08, 0.62], r: [0.8, 1.2, 0.95] };

/* envolvente convexa (cadena monótona de Andrew) */
function hull(pts) {
  pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
  var lo = [], up = [], i;
  for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) { lo.pop(); } lo.push(pts[i]); }
  for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) { up.pop(); } up.push(pts[i]); }
  lo.pop(); up.pop(); return lo.concat(up);
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
/* lo que queda detrás de la cabeza ya no se esconde pieza por pieza: lo tapa la cabeza invisible (ver render) */
function hidden() { return false; }
/* piezas que van siempre por encima de la cabeza (por ejemplo la vincha, que se apoya arriba) */
function front(z, keep) { return keep ? Math.min(z, F.headZ - 0.02 * F.s) : z; }

function poly(pts, fill, keep) {
  var q = pts.map(F.proj), z = 0, x = 0, y = 0;
  q.forEach(function (p) { z += p.z; x += p.x; y += p.y; });
  var c = { x: x / q.length, y: y / q.length, z: z / q.length };
  if (hidden(c)) { return; }
  var w = pts.map(F.world), n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0]))), sh = 0.62 + 0.38 * Math.abs(n[2]);
  items.push({ z: front(c.z, keep), draw: function () {
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
      items.push({ z: front(c.z, keep), draw: function () {
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
/* La tera, mascota del FAA!: lo que lleva en la cabeza, sin la cabeza gris (para que se vea la cara).
   Visor de dos placas triangulares translúcidas cruzadas en X, pico, auriculares grises con cable y copete. */
var TERA = {
  rosa: { visor: [255, 60, 110, 0.4], borde: [176, 18, 66, 1] },
  verde: { visor: [236, 230, 140, 0.45], borde: [150, 140, 50, 1] },
  dorada: { visor: [242, 186, 80, 0.45], borde: [150, 92, 30, 1] }
};
var GRIS = [150, 150, 150, 1], GRIS_OSC = [70, 72, 70, 1], GRIS_CLARO = [196, 196, 196, 1], PICO = [226, 128, 230, 1];

function tera(col) {
  var A = F.A, c = TERA[col], i;
  /* visor: dos triángulos que se tocan en el centro, apenas curvados hacia los costados */
  var tl = [-0.68, -0.72, -0.18], bl = [-0.68, 0.58, -0.18], mid = [0, 0.12, -0.36], tr = [0.68, -0.72, -0.18], br = [0.68, 0.58, -0.18];
  poly([tl, bl, mid], c.visor);
  poly([tr, mid, br], c.visor);
  strip([tl, bl, mid, tl], c.borde, 0.025, 0.02);
  strip([tr, br, mid, tr], c.borde, 0.025, 0.02);
  picoTera(mid, bl, br);
  /* auriculares grises, más toscos: copas como cajas redondeadas y vincha plana y ancha */
  var R = A.hw + 0.12, cupH = 0.38, cupD = 0.32, cupT = 0.17, yTop = A.earY - cupH + 0.04, h = yTop - A.top[1] + 0.45, Zb = HEAD.c[2] - 0.08; /* un poco delante del centro de la cabeza: al girar, la mitad de atrás queda tapada */
  for (i = 0; i < 18; i++) {
    var t0 = i / 18 * Math.PI, t1 = (i + 1) / 18 * Math.PI;
    var p0 = [-(R + cupT / 2) * Math.cos(t0), yTop - h * Math.sin(t0), Zb], p1 = [-(R + cupT / 2) * Math.cos(t1), yTop - h * Math.sin(t1), Zb];
    poly([add(p0, [0, 0, -0.11]), add(p0, [0, 0, 0.11]), add(p1, [0, 0, 0.11]), add(p1, [0, 0, -0.11])], GRIS_OSC);
    /* el canto de adelante de la vincha, para que de frente se vea gruesa */
    var q0 = [-(R + cupT / 2 + 0.12) * Math.cos(t0), yTop - (h + 0.12) * Math.sin(t0), Zb - 0.11], q1 = [-(R + cupT / 2 + 0.12) * Math.cos(t1), yTop - (h + 0.12) * Math.sin(t1), Zb - 0.11];
    poly([add(p0, [0, 0, -0.11]), add(p1, [0, 0, -0.11]), q1, q0], GRIS);
  }
  var mid = [];
  for (i = 2; i <= 16; i++) { var tt = i / 18 * Math.PI; mid.push([-(R + cupT / 2 + 0.06) * Math.cos(tt), yTop - (h + 0.06) * Math.sin(tt), Zb - 0.12]); }
  strip(mid, GRIS_CLARO, 0.035, 0.01);
  [-1, 1].forEach(function (sg) {
    var cc = [sg * R, A.earY, A.earZ], v = norm([-sg * 0.3, 0, 1]), out = norm(cross(EY, v));
    if (out[0] * sg < 0) { out = mul(out, -1); }
    var rr = function (c0, a, b, r) {
      var o = [], k, corners = [[a - r, b - r, 0], [-(a - r), b - r, Math.PI / 2], [-(a - r), -(b - r), Math.PI], [a - r, -(b - r), Math.PI * 1.5]];
      corners.forEach(function (q) { for (k = 0; k <= 3; k++) { var an = q[2] + k / 3 * Math.PI / 2; o.push(add(c0, add(mul(EY, q[0] + r * Math.cos(an)), mul(v, q[1] + r * Math.sin(an))))); } });
      return o;
    };
    var inner = rr(cc, cupH, cupD, 0.13), outer = rr(add(cc, mul(out, cupT)), cupH, cupD, 0.13);
    poly(inner, GRIS_OSC);
    for (var j = 0; j < inner.length; j++) { var j2 = (j + 1) % inner.length; poly([inner[j], inner[j2], outer[j2], outer[j]], GRIS_OSC); }
    poly(outer, GRIS);
    poly(rr(add(cc, mul(out, cupT + 0.005)), cupH * 0.62, cupD * 0.6, 0.08), GRIS_CLARO);
  });
  /* cable que cuelga del auricular derecho de la imagen */
  var c0 = [R + cupT / 2, A.earY + cupH - 0.05, A.earZ + 0.05];
  strip([c0, [R + 0.18, A.earY + 0.8, A.earZ - 0.05], [R + 0.08, A.earY + 1.35, A.earZ - 0.25], [R - 0.05, A.earY + 1.9, A.earZ - 0.3]], NEGRO, 0.025);
  /* copete: plumitas finas desde arriba y atrás de la cabeza, hacia arriba y atrás */
  var base = [0.08, A.top[1] - 0.12, A.earZ + 0.15];
  [[0.2, -1.4, 1.5], [0.42, -1.12, 1.7], [0.62, -0.8, 1.8], [0.03, -1.55, 1.25]].forEach(function (d, k) {
    var end = add(base, d), ctl = add(base, [d[0] * 0.3, d[1] * 0.85, d[2] * 0.3]), pts = [];
    for (var j = 0; j <= 8; j++) { var u = j / 8; pts.push(add(add(mul(base, (1 - u) * (1 - u)), mul(ctl, 2 * u * (1 - u))), mul(end, u * u))); }
    strip(pts, NEGRO, k === 3 ? 0.045 : 0.035);
  });
}

/* Pico de la tera: recto y grueso, nace en el ángulo de abajo donde se cruzan las placas del visor; sus bordes de
   arriba siguen un tramo las diagonales del visor y de ahí sale hacia adelante, casi horizontal, con una quilla abajo. */
var PICO_B = [190, 96, 200, 1], BOCA = [110, 40, 120, 1];
function picoTera(mid, bl, br) {
  var f = 0.4, tip = [0, 0.7, -1.28], low = [0, 0.54, -0.37];
  var top = add(mid, [0, 0, -0.02]), l = add(lerp(mid, bl, f), [0, 0, -0.02]), r = add(lerp(mid, br, f), [0, 0, -0.02]);
  poly([top, l, tip], PICO); poly([top, tip, r], PICO);
  poly([l, low, tip], PICO_B); poly([low, r, tip], PICO_B);
  /* la línea de la boca, desde las esquinas de abajo hacia la punta */
  strip([l, lerp(l, tip, 0.6)], BOCA, 0.03, 0.01);
  strip([r, lerp(r, tip, 0.6)], BOCA, 0.03, 0.01);
}

var MASKS = [
  { id: 'tera-rosa', name: 'Tera rosa', fn: function () { tera('rosa'); } },
  { id: 'tera-verde', name: 'Tera verde', fn: function () { tera('verde'); } },
  { id: 'tera-dorada', name: 'Tera dorada', fn: function () { tera('dorada'); } }
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
  var k = Math.min(1, LEVELS[level].view / Math.max(vid.videoWidth, vid.videoHeight)), pw = Math.round(vid.videoWidth * k), ph = Math.round(vid.videoHeight * k);
  if (!recording && (cv.width !== pw || cv.height !== ph)) { cv.width = pw; cv.height = ph; tracks = []; }
  var now = performance.now();
  stats.frames++; tune(now);
  if (detector && now - lastDet >= LEVELS[level].every) {
    lastDet = now;
    try { detect(now); } catch (e) { /* un cuadro fallido no corta el loop */ }
  }
  faces = tracks.filter(function (tr) { return tr.pts; });
  render(now);
}

/* s: escala de salida (1 para la vista previa; mayor para la foto a resolución completa) */
function render(now, s) {
  var W = cv.width, H = cv.height; s = s || 1;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  if (facing === 'user') { ctx.setTransform(-s, 0, 0, s, W * s, 0); }
  drawScene(vid, W, H, faces.map(function (tr) { return function () { return headFrame(predicted(tr, now), tr, now); }; }));
}

/* dibuja la imagen de fondo y una máscara por cada marco (frames: funciones que arman el marco de cada cabeza) */
function drawScene(src, W, H, frames) {
  ctx.drawImage(src, 0, 0, W, H);
  var m = MASKS.filter(function (x) { return x.id === mask; })[0];
  if (!m || !m.fn) { return; }
  frames.forEach(function (mk) {
    F = mk(); items = [];
    m.fn();
    /* la cabeza invisible: vuelve a dibujar la imagen real dentro del contorno de la cabeza, a la profundidad del centro
       de la cabeza; lo que se dibujó antes (lo que está detrás) queda tapado por la cabeza de verdad */
    var head = F.head;
    items.push({ z: F.headZ, draw: function () {
      ctx.save(); ctx.beginPath(); head.forEach(function (p, i) { if (i) { ctx.lineTo(p[0], p[1]); } else { ctx.moveTo(p[0], p[1]); } });
      ctx.closePath(); ctx.clip(); ctx.drawImage(src, 0, 0, W, H); ctx.restore();
    } });
    items.sort(function (a, b) { return b.z - a.z; }).forEach(function (it) { it.draw(); });
  });
}

/* ---------- Cámara y carga ---------- */
function startCamera() {
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: CAMS[cam].w }, height: { ideal: CAMS[cam].h } } }).then(function (s) {
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

var prog = { wasm: 0, model: 0, lm: 0, heavy: false };
function showProgress() {
  if (prog.heavy && prog.base) { $('nivel').setAttribute('y', String(118 - 104 * prog.lm)); return; }
  var n = WASM_BYTES + MODEL_BYTES + (prog.heavy ? LMODEL_BYTES : 0);
  var p = (prog.wasm * WASM_BYTES + prog.model * MODEL_BYTES + (prog.heavy ? prog.lm * LMODEL_BYTES : 0)) / n;
  $('nivel').setAttribute('y', String(118 - 104 * p));
  $('meter').setAttribute('aria-valuenow', String(Math.round(p * 100)));
}

/* el motor y el modelo chico se bajan una sola vez y los comparten la cámara y el modo foto */
var engineP = null, modelP = null;
function loadEngine() {
  if (!engineP) {
    var mpP = import('./mp/vision_bundle.mjs');
    var wasmP = grab(WASM, WASM_BYTES, function (p) { prog.wasm = p; showProgress(); });
    engineP = Promise.all([mpP, wasmP]).then(function (r) {
      var mp = r[0], wasmUrl = URL.createObjectURL(new Blob([r[1]], { type: 'application/wasm' }));
      return mp.FilesetResolver.forVisionTasks('./mp').then(function (files) { files.wasmBinaryPath = wasmUrl; return { mp: mp, files: files }; });
    });
    engineP.catch(function () { engineP = null; });
  }
  return engineP;
}
function loadModel() {
  if (!modelP) {
    modelP = grab(MODEL, MODEL_BYTES, function (p, total) { MODEL_BYTES = total; prog.model = p; showProgress(); });
    modelP.catch(function () { modelP = null; });
  }
  return modelP;
}
/* crea una tarea de MediaPipe en la placa de video; si no se puede, en el procesador */
function create(Task, buf, extra) {
  return loadEngine().then(function (e) {
    var opts = function (d) { var o = { baseOptions: { modelAssetBuffer: new Uint8Array(buf), delegate: d } }; for (var k in extra) { o[k] = extra[k]; } return o; };
    return e.mp[Task].createFromOptions(e.files, opts('GPU')).then(function (t) { t.dlg = 'GPU'; return t; })
      .catch(function () { return e.mp[Task].createFromOptions(e.files, opts('CPU')).then(function (t) { t.dlg = 'CPU'; return t; }); });
  });
}
function loadDetector() {
  return Promise.all([loadEngine(), loadModel()]).then(function (r) {
    return create('FaceDetector', r[1], { runningMode: 'VIDEO', minDetectionConfidence: 0.5 });
  }).then(function (d) { delegate = d.dlg; return d; });
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
    camOn = true;
    [].forEach.call(box.querySelectorAll('p,.go'), function (el) { el.hidden = true; });
    $('meter').hidden = false; running = true; loop();
    return loadDetector().then(function (d) { detector = d; }).catch(function () {
      say(navigator.onLine ? 'No se pudo cargar el detector' : 'Sin señal: la primera vez hace falta conexión', 6000);
    }).then(function () { $('ov').hidden = true; });
  }).catch(function () { $('note').textContent = 'No se pudo abrir la cámara. Revisá el permiso en la configuración del navegador.'; b.disabled = false; b.textContent = 'Probar de nuevo'; });
});

$('flip').addEventListener('click', function () {
  if (!running) { return; }
  if (recording) { return; }
  facing = facing === 'user' ? 'environment' : 'user'; faces = []; tracks = [];
  startCamera().catch(function () { facing = 'user'; startCamera(); });
});

$('ttl').addEventListener('click', function () { var el = $('stats'); el.hidden = !el.hidden; if (still) { showStill(); } else { showStats(); } });

/* ---------- Selector ---------- */
$('chips').innerHTML = MASKS.map(function (m) { return '<button class="chip" type="button" data-m="' + m.id + '" aria-pressed="' + (m.id === mask) + '">' + m.name + '</button>'; }).join('');
$('chips').addEventListener('click', function (e) {
  var b = e.target.closest('[data-m]'); if (!b) { return; }
  mask = b.dataset.m;
  [].forEach.call(this.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
  if (still) { drawStill(); }
});

/* ---------- Guardar ---------- */
var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function stamp() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); }
/* En Android se descarga directo. En iPhone el navegador no deja guardar sin preguntar: se abre el menú para «Guardar». */
function save(blob, name) {
  var file = new File([blob], name, { type: blob.type });
  if (IOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'FAA! 2026' }).catch(function () {});
    return;
  }
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  say('Guardado en Descargas', 2500);
}

/* ---------- Foto: se vuelve a dibujar el cuadro a la resolución completa de la cámara ---------- */
function photo() {
  if (!running || !cv.width) { return; }
  var s = Math.max(1, vid.videoWidth / cv.width);
  faces = tracks.filter(function (tr) { return tr.pts; });
  saveJpg(banded(Math.round(cv.width * s), Math.round(cv.height * s), function () { render(performance.now(), s); }));
}

/* arma la imagen final: lo que dibuja draw (W×H) y debajo la franja verde con el logo */
function banded(W, H, draw) {
  var band = Math.round(W * 0.12), out = document.createElement('canvas'); out.width = W; out.height = H + band;
  var o = out.getContext('2d'), keep = ctx;
  ctx = o;
  try { draw(); } finally { ctx = keep; }
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.fillStyle = '#1F3A12'; o.fillRect(0, H, W, band);
  var pad = band * 0.2;
  if (logo.complete && logo.naturalWidth) { var lh = band * 0.56, lw = lh * logo.naturalWidth / logo.naturalHeight; o.drawImage(logo, pad, H + (band - lh) / 2, lw, lh); }
  o.fillStyle = '#F4F7D9'; o.font = '700 ' + Math.round(band * 0.26) + 'px system-ui,sans-serif'; o.textAlign = 'right'; o.textBaseline = 'middle';
  o.fillText('equipo FAA! 2026', W - pad, H + band / 2);
  return out;
}
function saveJpg(out) {
  var fl = $('flash'); fl.classList.add('on'); setTimeout(function () { fl.classList.remove('on'); }, 60);
  out.toBlob(function (blob) { if (blob) { save(blob, 'faa2026-' + stamp() + '.jpg'); } }, 'image/jpeg', 0.95);
}

/* ---------- Video: graba la vista previa con las máscaras, y el micrófono si dan permiso ---------- */
var mode = 'foto', rec = null, recChunks = [], recT0 = 0, recTimer = 0, micStream = null, MAX_REC = 60;
function recType() {
  var opts = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (!window.MediaRecorder) { return null; }
  for (var i = 0; i < opts.length; i++) { if (MediaRecorder.isTypeSupported(opts[i])) { return opts[i]; } }
  return '';
}
function startRec() {
  var type = recType();
  if (type === null || !cv.captureStream) { say('Este navegador no puede grabar video', 4000); return; }
  var mic = micStream ? Promise.resolve(micStream) : navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (m) { micStream = m; return m; }).catch(function () { return null; });
  mic.then(function (m) {
    var st = cv.captureStream(30);
    if (m) { m.getAudioTracks().forEach(function (t) { st.addTrack(t); }); }
    recChunks = [];
    try { rec = new MediaRecorder(st, type ? { mimeType: type, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 }); } catch (e) { rec = new MediaRecorder(st); }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) { recChunks.push(e.data); } };
    rec.onstop = function () {
      var t = rec.mimeType || type || 'video/webm', blob = new Blob(recChunks, { type: t.split(';')[0] });
      save(blob, 'faa2026-' + stamp() + (t.indexOf('mp4') > -1 ? '.mp4' : '.webm'));
      rec = null;
    };
    rec.start(1000);
    recording = true; recT0 = performance.now();
    $('shot').classList.add('rec'); $('rec').hidden = false; tickRec();
  });
}
function tickRec() {
  if (!recording) { return; }
  var sec = Math.floor((performance.now() - recT0) / 1000);
  $('rec').textContent = '● ' + Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
  if (sec >= MAX_REC) { stopRec(); return; }
  recTimer = setTimeout(tickRec, 250);
}
function stopRec() {
  if (!recording) { return; }
  recording = false; clearTimeout(recTimer);
  $('shot').classList.remove('rec'); $('rec').hidden = true;
  if (rec && rec.state !== 'inactive') { rec.stop(); }
}

$('shot').addEventListener('click', function () {
  if (still) { saveJpg(banded(still.W, still.H, drawStill)); return; }
  if (mode === 'foto') { photo(); }
  else if (recording) { stopRec(); }
  else if (running) { startRec(); }
});
$('mode').addEventListener('click', function () {
  if (still) { exitStill(); return; }
  if (recording) { return; }
  mode = mode === 'foto' ? 'video' : 'foto';
  this.textContent = mode === 'foto' ? 'Video' : 'Foto';
  this.setAttribute('aria-label', mode === 'foto' ? 'Pasar a video' : 'Pasar a foto');
  $('shot').classList.toggle('vid', mode === 'video');
  $('shot').setAttribute('aria-label', mode === 'foto' ? 'Sacar foto' : 'Grabar video');
});

/* ---------- Modo foto: una imagen de la galería, analizada con el modelo pesado ----------
   1) El detector chico recorre la foto entera y después por partes cada vez más chicas (mosaicos que se pisan a la mitad),
      así encuentra también las caras chiquitas del fondo de una foto grupal.
   2) Cada cara encontrada se recorta y pasa por el Face Landmarker: 478 puntos de la cara. Si no confirma que es una cara,
      se descarta (así se filtran los falsos positivos de los mosaicos).
   3) La pose se ajusta con esos ~400 puntos contra el modelo de cara de MediaPipe (sin labios ni párpados, que se mueven),
      con el mismo método que en vivo pero con muchos más puntos: mucho más precisa. */
var still = null, camOn = false, heavyP = null, CANON = null, CANF = null;
var MAXS = 4096; /* lado mayor con el que se trabaja (y se guarda) la foto */
/* corrección entre el modelo de cara de MediaPipe y el de la cámara en vivo, para que la tera quede igual en los dos modos */
var CAL = { pitch: -0.155, d: [0, 0, 0] }; /* medido: el modelo de MediaPipe queda ~9° más inclinado hacia atrás */

function inv3(a) {
  var det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  return [
    [(a[1][1] * a[2][2] - a[1][2] * a[2][1]) / det, (a[0][2] * a[2][1] - a[0][1] * a[2][2]) / det, (a[0][1] * a[1][2] - a[0][2] * a[1][1]) / det],
    [(a[1][2] * a[2][0] - a[1][0] * a[2][2]) / det, (a[0][0] * a[2][2] - a[0][2] * a[2][0]) / det, (a[0][2] * a[1][0] - a[0][0] * a[1][2]) / det],
    [(a[1][0] * a[2][1] - a[1][1] * a[2][0]) / det, (a[0][1] * a[2][0] - a[0][0] * a[2][1]) / det, (a[0][0] * a[1][1] - a[0][1] * a[1][0]) / det]
  ];
}
/* prepara un modelo para el ajuste: puntos en cm (mismo sistema que CAN) y pesos */
function prepModel(pts, w) {
  var ws = 0, M = [0, 0, 0], g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach(function (p, n) { ws += w[n]; M = add(M, mul(p, w[n])); });
  M = mul(M, 1 / ws);
  var C = pts.map(function (p) { return sub(p, M); });
  C.forEach(function (p, n) { for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) { g[i][j] += w[n] * p[i] * p[j]; } } });
  return { C: C, M: M, w: w, ws: ws, G: inv3(g) };
}
/* pose por ortografía y escala con N puntos (P: puntos en la imagen, en el mismo orden que el modelo) */
function posFit(P, md, fl, cal) {
  var n = P.length, mx = 0, my = 0, i, w = md.w;
  for (i = 0; i < n; i++) { mx += w[i] * P[i][0]; my += w[i] * P[i][1]; }
  mx /= md.ws; my /= md.ws;
  var bx = [0, 0, 0], by = [0, 0, 0];
  for (i = 0; i < n; i++) { bx = add(bx, mul(md.C[i], w[i] * (P[i][0] - mx))); by = add(by, mul(md.C[i], w[i] * (P[i][1] - my))); }
  var rx = [dot(md.G[0], bx), dot(md.G[1], bx), dot(md.G[2], bx)], ry = [dot(md.G[0], by), dot(md.G[1], by), dot(md.G[2], by)];
  var k = (len(rx) + len(ry)) / 2, r0 = norm(rx), r1 = norm(sub(ry, mul(r0, dot(ry, r0)))), r2 = cross(r0, r1);
  var X = [r0[0], r1[0], r2[0]], Y = [r0[1], r1[1], r2[1]], Z = cross(X, Y);
  var O = [mx - dot(rx, md.M), my - dot(ry, md.M), 0], s = k * UNIT;
  if (cal) {
    var c = Math.cos(cal.pitch), sn = Math.sin(cal.pitch), Y2 = add(mul(Y, c), mul(Z, sn)), Z2 = add(mul(Y, -sn), mul(Z, c));
    Y = Y2; Z = Z2;
    O = add(O, mul(add(add(mul(X, cal.d[0]), mul(Y, cal.d[1])), mul(Z, cal.d[2])), s)); O[2] = 0;
  }
  return makeFrame(O, s, X, Y, Z, fl);
}
var CAN6 = prepModel(CAN, WGT);

function loadHeavy() {
  if (!heavyP) {
    prog.heavy = true; prog.base = prog.wasm === 1 && prog.model === 1; showProgress();
    var lmP = grab(LMODEL, LMODEL_BYTES, function (p, total) { LMODEL_BYTES = total; prog.lm = p; showProgress(); });
    var cP = fetch('canon.json').then(function (r) { if (!r.ok) { throw new Error('canon'); } return r.json(); });
    heavyP = Promise.all([loadModel(), lmP, cP]).then(function (r) {
      CANON = r[2].map(function (q) { return q[0]; });
      CANF = prepModel(r[2].map(function (q) { return [q[1], q[2], q[3]]; }), r[2].map(function () { return 1; }));
      return Promise.all([
        create('FaceDetector', r[0], { runningMode: 'IMAGE', minDetectionConfidence: 0.45 }),
        create('FaceLandmarker', r[1], { runningMode: 'IMAGE', numFaces: 3, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 })
      ]);
    }).then(function (t) { return { fd: t[0], lm: t[1] }; });
    heavyP.catch(function () { heavyP = null; prog.heavy = false; });
  }
  return heavyP;
}

function readImage(file) {
  var viaImg = function () {
    return new Promise(function (ok, bad) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () { ok(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      im.onerror = bad; im.src = u;
    });
  };
  if (window.createImageBitmap) { return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(viaImg); }
  return viaImg();
}

/* posiciones de los mosaicos a lo largo de un lado de N píxeles, con mosaicos de t y pisándose a la mitad */
function steps(N, t) {
  if (t >= N - 1) { return [0]; }
  var n = Math.ceil((N - t) / (t / 2)), out = [];
  for (var i = 0; i <= n; i++) { out.push(Math.round(i * (N - t) / n)); }
  return out;
}
function overlap(a, b) {
  var ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  var I = ix * iy, sa = a.w * a.h, sb = b.w * b.h;
  return Math.max(I / (sa + sb - I), I / Math.min(sa, sb) * 0.5);
}
function findFaces(src, W, H, fd) {
  var L = Math.max(W, H), minT = Math.max(256, L / 8), cands = [], tc = document.createElement('canvas'), tx = tc.getContext('2d'), tiles = 0;
  for (var t = L; t >= minT * 0.99; t /= 2) {
    var tw = Math.min(W, Math.round(t)), th = Math.min(H, Math.round(t)), k = Math.min(1, 384 / Math.max(tw, th));
    tc.width = Math.round(tw * k); tc.height = Math.round(th * k);
    steps(H, th).forEach(function (y) {
      steps(W, tw).forEach(function (x) {
        tx.drawImage(src, x, y, tw, th, 0, 0, tc.width, tc.height); tiles++;
        var res = fd.detect(tc);
        (res.detections || []).forEach(function (d) {
          var b = d.boundingBox, sc = d.categories && d.categories[0] ? d.categories[0].score : 0;
          cands.push({ x: x + b.originX / k, y: y + b.originY / k, w: b.width / k, h: b.height / k, sc: sc,
            kp: (d.keypoints || []).map(function (q) { return [x + q.x * tw, y + q.y * th, 0]; }) });
        });
      });
    });
  }
  cands.sort(function (a, b) { return b.sc - a.sc; });
  var keep = [];
  cands.forEach(function (c) { if (!keep.some(function (q) { return overlap(q, c) > 0.3; })) { keep.push(c); } });
  return { list: keep, tiles: tiles };
}
/* recorta alrededor de una cara y la pasa por el modelo pesado; devuelve los 478 puntos en píxeles de la foto */
function refine(src, W, H, c, lm, cc, cx) {
  var side = Math.max(c.w, c.h) * 2.6, x0 = c.x + c.w / 2 - side / 2, y0 = c.y + c.h / 2 - side / 2;
  var S = Math.round(Math.max(256, Math.min(512, side))), k = S / side;
  cc.width = S; cc.height = S; cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S);
  var sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(W, x0 + side), ey = Math.min(H, y0 + side);
  if (ex <= sx || ey <= sy) { return null; }
  cx.drawImage(src, sx, sy, ex - sx, ey - sy, (sx - x0) * k, (sy - y0) * k, (ex - sx) * k, (ey - sy) * k);
  var r = lm.detect(cc), best = null, bd = Infinity;
  (r.faceLandmarks || []).forEach(function (f) { var d = Math.hypot(f[4].x - 0.5, f[4].y - 0.5); if (d < bd) { bd = d; best = f; } });
  if (!best || bd > 0.3) { return null; }
  return best.map(function (q) { return [x0 + q.x * side, y0 + q.y * side, 0]; });
}

function analyze(src, W, H, m) {
  var t0 = performance.now(), found = findFaces(src, W, H, m.fd), cc = document.createElement('canvas'), cx = cc.getContext('2d');
  var heads = [], fl = W * 1.6, nMesh = 0;
  found.list.forEach(function (c) {
    var L = refine(src, W, H, c, m.lm, cc, cx), P, eye, mk;
    if (L) {
      P = CANON.map(function (i) { return L[i]; });
      eye = [(L[33][0] + L[133][0] + L[362][0] + L[263][0]) / 4, (L[33][1] + L[133][1] + L[362][1] + L[263][1]) / 4];
      mk = (function (P) { return function () { return posFit(P, CANF, fl, CAL); }; })(P);
      nMesh++;
    } else if (c.sc >= 0.75 && c.kp.length >= 6) {
      /* el modelo pesado no la confirmó pero el detector está muy seguro: se usa la pose de 6 puntos, como en vivo */
      P = c.kp.slice(0, 6); eye = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      mk = (function (P) { return function () { return posFit(P, CAN6, fl); }; })(P);
    } else { return; }
    var span = Math.max(c.w, c.h);
    if (heads.some(function (h) { return Math.hypot(h.eye[0] - eye[0], h.eye[1] - eye[1]) < span * 0.3; })) { return; }
    heads.push({ eye: eye, mk: mk, mesh: !!L });
  });
  return { heads: heads, tiles: found.tiles, cands: found.list.length, mesh: nMesh, ms: performance.now() - t0, dlg: m.lm.dlg };
}

function drawStill() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawScene(still.src, still.W, still.H, still.heads.map(function (h) { return h.mk; }));
}
function showStill() {
  if (cv.width !== still.W || cv.height !== still.H) { cv.width = still.W; cv.height = still.H; }
  drawStill();
  var el = $('stats'), r = still.info;
  if (r) { el.textContent = 'Foto ' + still.W + '×' + still.H + ' · ' + still.heads.length + (still.heads.length === 1 ? ' cara' : ' caras') + ' (' + r.mesh + ' con 478 pts) · ' + r.tiles + ' mosaicos · ' + Math.round(r.ms) + ' ms · ' + r.dlg; }
}

/* el cartel del principio también sirve para «esperando el modelo» */
var ovTitle = $('ov').querySelector('h2').textContent;
function busy(on, title) {
  var box = $('ov').querySelector('.box');
  $('ov').hidden = !on;
  if (!on) { return; }
  box.querySelector('h2').textContent = title;
  [].forEach.call(box.querySelectorAll('p,.go'), function (el) { el.hidden = true; });
  $('meter').hidden = false;
}
function resetOverlay() {
  var box = $('ov').querySelector('.box');
  box.querySelector('h2').textContent = ovTitle;
  [].forEach.call(box.querySelectorAll('p,.go'), function (el) { el.hidden = false; });
  $('start').disabled = false; $('meter').hidden = true; $('ov').hidden = false;
}

function enterStill(file) {
  stopRec();
  running = false;
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  document.body.classList.add('still');
  $('mode').textContent = 'Cámara'; $('mode').setAttribute('aria-label', 'Volver a la cámara');
  $('shot').classList.remove('vid'); $('shot').setAttribute('aria-label', 'Guardar foto');
  busy(true, 'Buscando caras');
  var job = Promise.all([readImage(file), loadHeavy()]);
  job.then(function (r) {
    var img = r[0], iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(1, MAXS / Math.max(iw, ih));
    var src = document.createElement('canvas'); src.width = Math.round(iw * k); src.height = Math.round(ih * k);
    src.getContext('2d').drawImage(img, 0, 0, src.width, src.height);
    if (img.close) { img.close(); }
    prog.lm = 1; showProgress();
    /* se deja dibujar el cartel lleno antes del cálculo, que traba la página un momento */
    return new Promise(function (ok) { setTimeout(ok, 60); }).then(function () {
      var info = analyze(src, src.width, src.height, r[1]);
      still = { src: src, W: src.width, H: src.height, heads: info.heads, info: info };
      if (/debug/.test(location.search)) { window.__still = still; }
      busy(false); showStill();
      var n = info.heads.length;
      say(n ? (n === 1 ? 'Una cara' : n + ' caras') + ' · tocá el botón para guardar' : 'No encontré caras en esta foto', 4000);
    });
  }).catch(function (e) {
    busy(false); exitStill();
    say(heavyP || navigator.onLine ? 'No se pudo abrir la foto' : 'Sin señal: la primera vez hace falta conexión', 5000);
  });
}

function exitStill() {
  still = null;
  document.body.classList.remove('still');
  $('mode').textContent = mode === 'foto' ? 'Video' : 'Foto';
  $('mode').setAttribute('aria-label', mode === 'foto' ? 'Pasar a video' : 'Pasar a foto');
  $('shot').classList.toggle('vid', mode === 'video');
  $('shot').setAttribute('aria-label', mode === 'foto' ? 'Sacar foto' : 'Grabar video');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  if (camOn) { tracks = []; faces = []; startCamera().then(function () { running = true; loop(); }).catch(function () { say('No se pudo abrir la cámara', 4000); }); }
  else { resetOverlay(); }
}

function pick() { var f = $('file'); f.value = ''; f.click(); }
$('gal').addEventListener('click', function () { if (!recording) { pick(); } });
$('pick').addEventListener('click', pick);
$('file').addEventListener('change', function () { if (this.files && this.files[0]) { enterStill(this.files[0]); } });

document.addEventListener('visibilitychange', function () {
  if (document.hidden && stream) { stopRec(); stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; running = false; }
  else if (!document.hidden && !running && $('ov').hidden && !still && !document.body.classList.contains('still')) { startCamera().then(function () { running = true; loop(); }); }
});
