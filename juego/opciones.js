/* Galería de opciones de objetos para elegir la estética del juego (solo para revisar, no se usa en el juego). */
(function () {
'use strict';
var OUT = '#140803', K = '#1a0e08', Y = '#FFD23F', YL = '#FFE88C', YD = '#c99a22', C = '#74C6E8', CL = '#bfe6f5', CD = '#3f8fb3',
  WC = '#F6EFC4', WD = '#d6cca3', F = '#E0457B', GR = '#8a8478', GRL = '#bdb7aa', TXT = '"Arial Narrow", Arial, sans-serif';
var GW = 150, GH = 124, G0 = 108;   /* tarjeta en unidades del juego; G0 = línea del piso */
var chr = new Image(); chr.src = 'side.png';
var g;
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function FR(x, y, w, h, c) { R(x - 0.8, y - 0.8, w + 1.6, h + 1.6, OUT); R(x, y, w, h, c); }
function CIR(x, y, r, c, o) { if (o) { g.fillStyle = OUT; g.beginPath(); g.arc(x, y, r + 0.8, 0, 7); g.fill(); } g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function POLY(pts, c, o) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) { g.lineTo(pts[i], pts[i + 1]); } g.closePath(); g.fillStyle = c; g.fill(); if (o !== false) { g.strokeStyle = OUT; g.lineWidth = 0.8; g.lineJoin = 'round'; g.stroke(); } }
function LINE(x1, y1, x2, y2, c, w) { g.strokeStyle = c; g.lineWidth = w || 1; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function TEXT(t, x, y, size, c, wt) { g.fillStyle = c; g.font = (wt || 900) + ' ' + size + 'px ' + TXT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); }
function wires(x1, x2, y) { LINE(x1, -2, x1, y, K, 0.9); LINE(x2, -2, x2, y, K, 0.9); }
function stripes(x, y, w, h, n, c1, c2, diag) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (var i = -n; i < n * 2; i++) { g.fillStyle = i % 2 ? c2 : c1; if (diag) { POLY([x + i * w / n, y + h, x + (i + 1) * w / n, y + h, x + (i + 1) * w / n + h, y, x + i * w / n + h, y], i % 2 ? c2 : c1, false); } else { g.fillRect(x + i * w / n, y, w / n + 0.2, h); } }
  g.restore(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x, y, w, h);
}
var X = 92;  /* centro del objeto */
var b = G0;  /* piso */

var CATS = [
  { id: 'A', t: 'Saltar (amarillo)', s: 'Obstáculos bajos del piso. Medida en juego: ~24 de ancho × 26 de alto.', items: [
    ['Valla rayada (la actual)', function () { R(X - 10, b - 26, 3, 26, K); R(X + 7, b - 26, 3, 26, K); stripes(X - 12, b - 26, 24, 12, 4, Y, K); }],
    ['Claqueta tirada', function () { FR(X - 15, b - 16, 30, 16, Y); R(X - 12, b - 11, 24, 1.4, K); R(X - 12, b - 6, 16, 1.4, K); TEXT('26', X + 9, b - 6, 6, K);
      g.save(); g.translate(X - 15, b - 16); g.rotate(-0.42); stripes(0, -6, 30, 6, 6, Y, K, true); g.restore(); }],
    ['Flight case (caja de equipos)', function () { FR(X - 13, b - 24, 26, 24, Y); R(X - 13, b - 24, 26, 4, YL); R(X - 13, b - 13, 26, 2, YD);
      [[X - 13, b - 24], [X + 9, b - 24], [X - 13, b - 4], [X + 9, b - 4]].forEach(function (q) { R(q[0], q[1], 4, 4, GRL); });
      R(X - 4, b - 15, 8, 3, K); R(X - 6, b - 26, 12, 2, K); }],
    ['Bobina de cable', function () { CIR(X, b - 13, 13, Y, true); CIR(X, b - 13, 9, K); for (var r = 8.5; r > 4; r -= 1.6) { g.strokeStyle = r % 2 > 1 ? '#3b3b3b' : '#222'; g.lineWidth = 1.2; g.beginPath(); g.arc(X, b - 13, r, 0, 7); g.stroke(); } CIR(X, b - 13, 3.5, YD); LINE(X + 8, b - 5, X + 22, b - 1, K, 1.6); }],
    ['Monitor de piso', function () { POLY([X - 16, b, X + 14, b, X + 14, b - 12, X - 4, b - 24, X - 16, b - 24], Y); POLY([X - 13, b - 6, X - 13, b - 21, X - 4, b - 21, X + 9, b - 11, X + 9, b - 6], K, false);
      CIR(X - 4, b - 13, 4.5, '#333'); CIR(X - 4, b - 13, 2, '#666'); }],
    ['Latas de película', function () { [0, 1, 2].forEach(function (i) { var y = b - 8 - i * 8; FR(X - 14, y, 28, 7, i % 2 ? YL : Y); R(X - 14, y + 2.5, 28, 1.2, YD); }); TEXT('35mm', X, b - 4.2, 3.6, K, 800); }],
    ['Bolsa de arena', function () { POLY([X - 15, b, X + 15, b, X + 13, b - 9, X + 4, b - 13, X - 4, b - 13, X - 13, b - 9], Y); POLY([X - 11, b - 10, X - 7, b - 22, X + 7, b - 22, X + 11, b - 10], YL); R(X - 1, b - 24, 2, 14, K); R(X - 13, b - 6, 26, 1.4, YD); }],
    ['Foco de piso (fresnel)', function () { LINE(X - 10, b, X, b - 10, K, 1.6); LINE(X + 10, b, X, b - 10, K, 1.6); LINE(X, b, X, b - 10, K, 1.6); FR(X - 11, b - 26, 18, 14, Y); CIR(X + 8, b - 19, 6.5, K, false); CIR(X + 8, b - 19, 4.5, YL); POLY([X + 7, b - 27, X + 15, b - 31, X + 15, b - 27], YD); POLY([X + 7, b - 11, X + 15, b - 7, X + 15, b - 11], YD); }]
  ] },
  { id: 'B', t: 'Agacharse (celeste)', s: 'Cuelgan a media altura: se pasa agachado. Medida: ~58 de ancho × 26 de alto.', items: [
    ['Pancarta (la actual)', function () { wires(X - 25, X + 25, b - 60); FR(X - 29, b - 60, 58, 26, C); R(X - 29, b - 60, 58, 1.6, WC); R(X - 29, b - 35.6, 58, 1.6, WC); TEXT('EDUCACIÓN', X, b - 51, 8, '#10283c'); TEXT('PÚBLICA', X, b - 42, 8, '#10283c'); }],
    ['Barra de focos (truss)', function () { wires(X - 25, X + 25, b - 60); FR(X - 29, b - 60, 58, 6, CD); for (var i = 0; i < 9; i++) { LINE(X - 29 + i * 6.5, b - 60, X - 26 + i * 6.5, b - 54, CL, 0.8); }
      [-18, 0, 18].forEach(function (d) { LINE(X + d, b - 54, X + d, b - 51, K, 1.2); FR(X + d - 6, b - 51, 12, 13, C); CIR(X + d, b - 38, 4.5, CL, true); }); }],
    ['Pantalla de proyección', function () { wires(X - 25, X + 25, b - 60); FR(X - 29, b - 60, 58, 26, CD); R(X - 26, b - 57, 52, 20, CL); POLY([X - 4, b - 52, X - 4, b - 42, X + 6, b - 47], C, false); R(X - 29, b - 35, 58, 2, K); }],
    ['Cartel "GRABANDO"', function () { wires(X - 20, X + 20, b - 58); FR(X - 27, b - 58, 54, 22, C); R(X - 24, b - 55, 48, 16, '#10283c'); CIR(X - 16, b - 47, 3.4, '#ff4b4b'); TEXT('GRABANDO', X + 4, b - 47, 6.2, CL); }],
    ['Caña con micrófono', function () { LINE(X - 30, b - 42, X + 30, b - 50, CD, 3); LINE(X - 30, b - 42, X - 34, b - 70, K, 1); LINE(X + 30, b - 50, X + 24, b - 70, K, 1);
      g.fillStyle = C; for (var i = 0; i < 14; i++) { var a = i / 14 * 6.28; g.beginPath(); g.arc(X + 4 + Math.cos(a) * 9, b - 38 + Math.sin(a) * 5, 3.2, 0, 7); g.fill(); } CIR(X + 4, b - 38, 7.5, CL); LINE(X + 4, b - 46, X + 4, b - 43, K, 1.4); }],
    ['Bambalina (telón corto)', function () { R(X - 30, b - 62, 60, 3, K); wires(X - 26, X + 26, b - 62); for (var i = 0; i < 8; i++) { POLY([X - 30 + i * 7.5, b - 59, X - 22.5 + i * 7.5, b - 59, X - 22.5 + i * 7.5 - 1, b - 34, X - 30 + i * 7.5 + 1, b - 36], i % 2 ? CD : C); } }],
    ['Claqueta gigante colgada', function () { wires(X - 22, X + 22, b - 60); FR(X - 28, b - 54, 56, 20, C); stripes(X - 28, b - 60, 56, 6, 8, CL, '#10283c', true); TEXT('ESCENA 26', X, b - 47, 6.5, '#10283c'); TEXT('TOMA 1', X, b - 39, 6.5, '#10283c'); }]
  ] },
  { id: 'C', t: 'Subirse encima (blanco)', s: 'Se chocan de costado pero se puede caer encima. Medida: ~34 de ancho × 44 de alto (o doble).', items: [
    ['Bafle (el actual)', function () { FR(X - 17, b - 44, 34, 44, WC); R(X - 17, b - 44, 34, 3, F); CIR(X, b - 20, 10, K); CIR(X, b - 20, 5, '#5a4a3a'); CIR(X, b - 35, 3.5, K); }],
    ['Flight case con ruedas', function () { FR(X - 17, b - 44, 34, 40, WC); R(X - 17, b - 44, 34, 4, '#fff8dc'); R(X - 17, b - 24, 34, 2, WD); [[X - 17, b - 44], [X + 13, b - 44], [X - 17, b - 8], [X + 13, b - 8]].forEach(function (q) { R(q[0], q[1], 4, 4, GR); }); R(X - 5, b - 28, 10, 3, K); R(X - 17, b - 34, 34, 2, F); CIR(X - 11, b - 2.5, 2.5, K); CIR(X + 11, b - 2.5, 2.5, K); }],
    ['Pila de cajas de equipo', function () { FR(X - 18, b - 22, 36, 22, WC); R(X - 18, b - 13, 36, 2, F); TEXT('FRÁGIL', X, b - 6, 5, K, 800); FR(X - 13, b - 44, 26, 22, '#fff8dc'); R(X - 13, b - 35, 26, 2, WD); TEXT('LUCES', X, b - 28, 5, K, 800); }],
    ['Consola de sonido', function () { R(X - 14, b - 24, 3, 24, K); R(X + 11, b - 24, 3, 24, K); FR(X - 19, b - 44, 38, 20, WC); R(X - 19, b - 44, 38, 3, F); for (var i = 0; i < 8; i++) { R(X - 16 + i * 4.3, b - 38, 1, 11, '#888'); R(X - 17 + i * 4.3, b - 33 + (i * 7 % 6), 3, 2, K); } }],
    ['Practicable (tarima)', function () { FR(X - 20, b - 44, 40, 6, WC); R(X - 20, b - 40, 40, 2, F); LINE(X - 16, b - 38, X + 16, b, K, 1.4); LINE(X + 16, b - 38, X - 16, b, K, 1.4); R(X - 18, b - 38, 2.5, 38, K); R(X + 15.5, b - 38, 2.5, 38, K); }],
    ['Equipo de guitarra (cabezal)', function () { FR(X - 17, b - 30, 34, 30, WC); R(X - 15, b - 28, 30, 26, '#2b2622'); for (var i = 0; i < 6; i++) { R(X - 15, b - 26 + i * 4.3, 30, 0.8, '#3d3732'); } FR(X - 17, b - 44, 34, 14, WC); R(X - 15, b - 41, 30, 3, F); for (i = 0; i < 6; i++) { CIR(X - 12 + i * 4.8, b - 35, 1.2, K); } }],
    ['Baúl de vestuario', function () { FR(X - 18, b - 40, 36, 40, WC); POLY([X - 18, b - 40, X - 14, b - 44, X + 14, b - 44, X + 18, b - 40], '#fff8dc'); R(X - 18, b - 30, 36, 2, WD); R(X - 18, b - 12, 36, 2, WD); R(X - 3, b - 26, 6, 6, F); }]
  ] },
  { id: 'D', t: 'Andamios del piso', s: 'Plataformas que se atraviesan desde abajo y se suben saltando.', items: [
    ['Andamio (el actual)', function () { var y = b - 58, x0 = X - 40; LINE(x0 + 6, y, x0 + 6, b, 'rgba(26,14,8,.8)', 1.6); LINE(x0 + 74, y, x0 + 74, b, 'rgba(26,14,8,.8)', 1.6); LINE(x0 + 6, y + 4, x0 + 74, b, 'rgba(26,14,8,.8)', 0.9); FR(x0, y, 80, 6, WC); R(x0, y + 4, 80, 2, F); }],
    ['Truss de escenario', function () { var y = b - 58, x0 = X - 40;
      [x0 + 2, x0 + 70].forEach(function (tx) { R(tx, y + 8, 1.2, b - y - 8, GRL); R(tx + 7, y + 8, 1.2, b - y - 8, GRL); for (var k = y + 8; k < b; k += 8) { LINE(tx, k, tx + 8, k + 8, GRL, 0.8); } });
      FR(x0, y, 80, 8, WC); for (var i = 0; i < 13; i++) { LINE(x0 + i * 6.2, y + 8, x0 + i * 6.2 + 3, y, '#9a9488', 0.8); } R(x0, y, 80, 1.6, WC); }],
    ['Tarima con patas tijera', function () { var y = b - 58, x0 = X - 40; for (var i = 0; i < 2; i++) { var xx = x0 + 8 + i * 48; LINE(xx, y + 6, xx + 18, b, K, 1.4); LINE(xx + 18, y + 6, xx, b, K, 1.4); } FR(x0, y, 80, 7, WC); R(x0, y + 5, 80, 2, F); }],
    ['Vías de travelling elevadas', function () { var y = b - 58, x0 = X - 40; [x0 + 10, x0 + 40, x0 + 70].forEach(function (xx) { R(xx - 1, y + 4, 2.4, b - y - 4, K); POLY([xx - 6, b, xx + 6, b, xx, b - 8], K, false); }); FR(x0, y, 80, 4, WC); R(x0, y - 2, 80, 1.6, GRL); FR(x0 + 20, y - 9, 20, 7, WD); CIR(x0 + 24, y - 2, 2, K); CIR(x0 + 36, y - 2, 2, K); }]
  ] },
  { id: 'E', t: 'Andamios colgantes (etapas aéreas)', s: 'Cuelgan del techo; son el camino de las etapas por el aire.', items: [
    ['Tablón con cables (el actual)', function () { var y = b - 76, x0 = X - 40; wires(x0 + 5, x0 + 75, y); FR(x0, y, 80, 6, WC); R(x0, y + 4, 80, 2, F); }],
    ['Truss con motores y cadenas', function () { var y = b - 76, x0 = X - 40; [x0 + 12, x0 + 68].forEach(function (cx) { for (var k = -2; k < y - 12; k += 3) { R(cx - 0.8, k, 1.6, 2, '#555'); } FR(cx - 5, y - 14, 10, 9, K); });
      FR(x0, y, 80, 8, WC); for (var i = 0; i < 13; i++) { LINE(x0 + i * 6.2, y + 8, x0 + i * 6.2 + 3, y, '#9a9488', 0.8); } }],
    ['Pantalla LED colgante', function () { var y = b - 76, x0 = X - 36; wires(x0 + 6, x0 + 66, y); FR(x0, y, 72, 5, WC); R(x0 + 3, y + 5, 66, 26, '#141a20'); for (var i = 0; i < 6; i++) { for (var j = 0; j < 3; j++) { R(x0 + 6 + i * 11, y + 8 + j * 8, 9, 6, (i + j) % 3 ? '#1f3a4a' : '#284f63'); } } TEXT('FAA!', x0 + 36, y + 18, 10, '#F4C95C'); }],
    ['Pasarela de luces (catwalk)', function () { var y = b - 76, x0 = X - 40; wires(x0 + 5, x0 + 75, y - 10); LINE(x0, y - 10, x0 + 80, y - 10, K, 1); for (var i = 0; i <= 8; i++) { LINE(x0 + i * 10, y - 10, x0 + i * 10, y, K, 0.8); } FR(x0, y, 80, 5, WC); R(x0, y + 3, 80, 2, F); [x0 + 16, x0 + 40, x0 + 64].forEach(function (lx) { LINE(lx, y + 5, lx, y + 8, K, 1); FR(lx - 4, y + 8, 8, 8, '#333'); }); }]
  ] },
  { id: 'F', t: 'Escenografía del fondo (extra)', s: 'Para sumar al fondo junto con la marcha, sin función en el juego.', items: [
    ['Torre de luces', function () { LINE(X, b, X, b - 80, K, 2); LINE(X - 12, b, X, b - 40, K, 1.2); LINE(X + 12, b, X, b - 40, K, 1.2); R(X - 18, b - 82, 36, 3, K); [-14, -5, 4, 13].forEach(function (d) { FR(X + d - 3, b - 79, 7, 7, '#333'); CIR(X + d + 0.5, b - 72, 2, YL); }); }],
    ['Cámara en trípode', function () { LINE(X - 10, b, X, b - 30, K, 1.6); LINE(X + 10, b, X, b - 30, K, 1.6); LINE(X, b, X, b - 30, K, 1.6); FR(X - 13, b - 44, 24, 14, '#2b2622'); FR(X + 11, b - 41, 9, 8, '#2b2622'); CIR(X + 21, b - 37, 3, '#555'); FR(X - 10, b - 50, 10, 6, '#2b2622'); }],
    ['Grúa de cámara (jib)', function () { LINE(X - 8, b, X, b - 34, K, 1.6); LINE(X + 8, b, X, b - 34, K, 1.6); LINE(X - 32, b - 30, X + 34, b - 58, '#2b2622', 3); FR(X - 38, b - 34, 10, 8, '#555'); FR(X + 30, b - 64, 12, 9, '#2b2622'); CIR(X + 43, b - 59, 2.5, '#555'); }],
    ['Line array colgado', function () { wires(X - 6, X + 6, b - 90); for (var i = 0; i < 6; i++) { g.save(); g.translate(X, b - 90 + i * 9); g.rotate(i * 0.05); FR(-12, 0, 24, 8, '#2b2622'); R(-10, 2, 20, 1.2, '#555'); g.restore(); } }],
    ['Pantalla gigante', function () { R(X - 2, b - 30, 4, 30, K); FR(X - 36, b - 82, 72, 52, '#141a20'); TEXT('FAA!', X, b - 62, 16, '#F4C95C'); TEXT('2026', X, b - 46, 9, '#F6EFC4'); }]
  ] }
];

function card(cat, i, item) {
  var fig = document.createElement('figure'), c = document.createElement('canvas'), q = 4;
  c.width = GW * q; c.height = GH * q; g = c.getContext('2d'); g.scale(q, q);
  var sg = g.createLinearGradient(0, 0, 0, G0); sg.addColorStop(0, '#f6efc4'); sg.addColorStop(1, '#e2965a');
  g.fillStyle = sg; g.fillRect(0, 0, GW, G0);
  g.fillStyle = '#47200d'; g.fillRect(0, G0, GW, GH - G0); g.fillStyle = '#b98a3e'; g.fillRect(0, G0, GW, 2);
  if (chr.complete && chr.naturalWidth) { g.globalAlpha = 0.45; g.imageSmoothingEnabled = false; g.drawImage(chr, 15 * 62, 0, 62, 70, -8, G0 - 68, 62, 70); g.imageSmoothingEnabled = true; g.globalAlpha = 1; }
  item[1]();
  var cap = document.createElement('figcaption'); cap.innerHTML = '<b>' + cat.id + (i + 1) + '</b>' + item[0];
  fig.appendChild(c); fig.appendChild(cap); return fig;
}
function build() {
  var out = document.getElementById('out');
  CATS.forEach(function (cat) {
    var h = document.createElement('h2'); h.innerHTML = cat.id + ' · ' + cat.t + '<small>' + cat.s + '</small>'; out.appendChild(h);
    var grid = document.createElement('div'); grid.className = 'grid';
    cat.items.forEach(function (it, i) { grid.appendChild(card(cat, i, it)); });
    out.appendChild(grid);
  });
}
if (chr.complete) { build(); } else { chr.onload = build; chr.onerror = build; }
})();
