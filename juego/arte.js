/* Gráfica compartida de los juegos de ¡Corre, sonidista!: paletas del escenario, la marcha estudiantil,
   pancartas, la ficha 26 y el logo. Todo se dibuja una sola vez, en alta resolución. */
(function () {
'use strict';
var base = (document.currentScript && document.currentScript.src) || location.href;
function url(f) { try { return new URL(f, base).href; } catch (e) { return f; } }
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
var TXT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

/* Paletas del escenario: cambian cada 1000 m (Campanilla → Arrayán → Chilco) y quedan en Chilco. */
var THEMES = [
  { sky: [[242, 240, 205], [216, 222, 150], [158, 168, 92]], mt: [92, 98, 48], sideA: [82, 86, 32], sideB: [92, 96, 38], edge: [214, 202, 112], trA: [50, 52, 22], trB: [44, 46, 18], dash: [196, 190, 136] },
  { sky: [[246, 239, 196], [244, 201, 120], [226, 150, 90]], mt: [150, 74, 40], sideA: [113, 53, 25], sideB: [122, 58, 28], edge: [185, 138, 62], trA: [71, 32, 13], trB: [64, 26, 10], dash: [167, 143, 106] },
  { sky: [[64, 28, 86], [150, 52, 122], [224, 92, 140]], mt: [96, 30, 82], sideA: [88, 28, 70], sideB: [99, 34, 79], edge: [226, 128, 176], trA: [44, 14, 40], trB: [38, 11, 34], dash: [206, 156, 196] }
];
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgb(c, al) { return al == null ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')'; }
function themeAt(m) {
  var k = Math.min(THEMES.length - 1, m / 1000), i = Math.floor(k), f = k - i, t = Math.max(0, Math.min(1, (f - 0.92) / 0.08));
  var A = THEMES[i], B = THEMES[Math.min(THEMES.length - 1, i + 1)], o = {};
  Object.keys(A).forEach(function (key) { o[key] = key === 'sky' ? A.sky.map(function (c, j) { return mix(c, B.sky[j], t); }) : mix(A[key], B[key], t); });
  return o;
}

/* La marcha: siluetas simples con carteles, pancartas, banderas y panfletos */
var MPAL = { body: ['#3b1a0b', '#4a2310', '#552a14', '#2e1408'], coat: '#b3a582', sign: '#d2c59c', ink: '#2a1207', cel: '#86aabb', wht: '#d8cfae' };
var SIGNS = ['EDUCACIÓN|PÚBLICA', 'LA UNI|SE DEFIENDE', 'PRESUPUESTO|YA', '1918', 'NI UN PASO|ATRÁS', 'LIBRE Y|GRATUITA', 'UNRN', 'DEFENDAMOS|LA UNI', 'ARTE|PÚBLICO', 'FAA!', 'REFORMA|1918'];
var BANNERS = ['EL MANIFIESTO ES AHORA!', 'UNIVERSIDAD PÚBLICA', 'EDUCACIÓN PÚBLICA', 'LA UNI SE DEFIENDE'];
var Q = 4;
function person(g, x, b, col, coat, arm) {
  g.fillStyle = col; g.fillRect(x - 3, b - 10, 2.6, 10); g.fillRect(x + 0.6, b - 10, 2.6, 10);
  g.fillStyle = coat ? MPAL.coat : col;
  g.beginPath(); g.moveTo(x - 4.5, b - 9); g.lineTo(x - 4, b - 19); g.quadraticCurveTo(x, b - 23, x + 4.2, b - 19); g.lineTo(x + 4.7, b - 9); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(x + 0.1, b - 25.5, 3.3, 0, 7); g.fill();
  if (arm) { g.strokeStyle = coat ? MPAL.coat : col; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + arm * 3, b - 19); g.lineTo(x + arm * 5, b - 30); g.stroke(); }
}
function sign(g, x, b, text) {
  var L = text.split('|'); g.font = '800 4.4px ' + TXT;
  var w = Math.max.apply(null, L.map(function (l) { return g.measureText(l).width; })) + 4, h = L.length * 5 + 2.6, top = b - 31 - 6 - h;
  g.fillStyle = MPAL.ink; g.fillRect(x - 0.5, top + h, 1, 9);
  g.fillRect(x - w / 2 - 0.6, top - 0.6, w + 1.2, h + 1.2);
  g.fillStyle = MPAL.sign; g.fillRect(x - w / 2, top, w, h);
  g.fillStyle = MPAL.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  L.forEach(function (l, i) { g.fillText(l, x, top + 1.3 + 2.5 + i * 5); });
}
function flag(g, x, b) {
  g.fillStyle = MPAL.ink; g.fillRect(x - 0.4, b - 52, 0.9, 24);
  g.fillStyle = MPAL.cel; g.fillRect(x + 0.5, b - 52, 13, 3); g.fillRect(x + 0.5, b - 46, 13, 3);
  g.fillStyle = MPAL.wht; g.fillRect(x + 0.5, b - 49, 13, 3);
}
function makeCrowd(seedC) {
  var sd = seedC, r = function () { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  var W2 = 110, H2 = 64, b = H2 - 2, c = canvas(W2 * Q, H2 * Q), g = c.getContext('2d'), col = function () { return MPAL.body[Math.floor(r() * 4)]; };
  c.uw = W2; c.uh = H2; g.scale(Q, Q);
  g.fillStyle = '#2a1207';
  for (var x = 6; x < W2 - 4; x += 9 + Math.floor(r() * 6)) { var hb = 24 + r() * 4; g.beginPath(); g.arc(x + 3.5, b - hb, 3, 0, 7); g.fill(); g.fillRect(x + 0.5, b - hb + 2, 6, hb - 2); }
  if (r() < 0.45) {
    var t = BANNERS[Math.floor(r() * BANNERS.length)], fs = 5.4;
    g.font = '800 ' + fs + 'px ' + TXT;
    var tw = g.measureText(t).width;
    if (tw > W2 - 16) { fs = fs * (W2 - 16) / tw; g.font = '800 ' + fs + 'px ' + TXT; tw = g.measureText(t).width; }
    var bw = tw + 8, bx = (W2 - bw) / 2;
    person(g, bx + 3, b, col(), r() < 0.4, 0); person(g, bx + bw - 4, b, col(), r() < 0.4, 0);
    for (var k = 0; k < 2; k++) { person(g, bx + 20 + r() * (bw - 40), b, col(), r() < 0.5, 0); }
    g.fillStyle = MPAL.ink; g.fillRect(bx - 0.7, b - 33.7, bw + 1.4, 10.4);
    g.fillStyle = r() < 0.5 ? MPAL.sign : MPAL.cel; g.fillRect(bx, b - 33, bw, 9);
    g.fillStyle = MPAL.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, bx + bw / 2, b - 28.4);
  } else {
    var n = 4 + Math.floor(r() * 3), step = (W2 - 16) / (n - 1), signs = 0;
    for (var i = 0; i < n; i++) {
      var hx = 8 + i * step + r() * 4, kind = r();
      if (kind < 0.45 && signs < 2) { person(g, hx, b, col(), r() < 0.4, 1); sign(g, hx + 5, b, SIGNS[Math.floor(r() * SIGNS.length)]); signs++; }
      else if (kind < 0.6) { person(g, hx, b, col(), r() < 0.4, 1); flag(g, hx + 5, b); }
      else { person(g, hx, b, col(), r() < 0.4, r() < 0.3 ? -1 : 0); }
    }
  }
  g.fillStyle = MPAL.wht;
  for (var f = 0; f < 4; f++) { g.fillRect(r() * (W2 - 4), b - r() * 1.5, 3, 1); }
  return c;
}
var CROWDS = [];
for (var ci = 0; ci < 12; ci++) { CROWDS.push(makeCrowd(ci * 7919 + 13)); }

/* Pancarta celeste (lo que se pasa agachado o rodando) */
function banner(text, w, h) {
  var q = 6, c = canvas(w * q, h * q), g = c.getContext('2d'), L = text.split('|');
  g.scale(q, q);
  g.fillStyle = '#74C6E8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#F6EFC4'; g.fillRect(0, 0, w, 1.6); g.fillRect(0, h - 1.6, w, 1.6);
  g.fillStyle = '#10283c'; g.font = '900 ' + (h * 0.36) + 'px ' + TXT; g.textAlign = 'center'; g.textBaseline = 'middle';
  var lh = (h - 3.2) / L.length;
  L.forEach(function (l, i) { var mw = g.measureText(l).width, k = Math.min(1, (w - 4) / mw); g.save(); g.translate(w / 2, 1.6 + lh * (i + 0.5) + 0.3); g.scale(k, 1); g.fillText(l, 0, 0); g.restore(); });
  return c;
}

var N26 = new Image(); N26.src = url('n26.png');
var LOGO = new Image(); LOGO.src = url('../logo.webp');

window.FAAArte = { canvas: canvas, THEMES: THEMES, themeAt: themeAt, mix: mix, rgb: rgb, MPAL: MPAL, CROWDS: CROWDS, banner: banner, N26: N26, LOGO: LOGO };
})();
