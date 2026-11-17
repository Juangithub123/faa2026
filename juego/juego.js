/* ¡Corre, sonidista! · juego secreto del FAA! 2026. Canvas 2D, sin dependencias. */
(function () {
'use strict';
var A = { case: [0, 0, 22, 18], case2: [23, 0, 22, 32], chairs: [46, 0, 18, 26], tripod: [65, 0, 16, 30], bang: [82, 0, 14, 22], n26: [97, 0, 28, 25], spot: [126, 0, 18, 14], mid: [0, 33, 280, 27] };
/* Personaje: side.png, 16 cuadros de 62×70 por fila, una fila por paleta (Arrayán, Chilco, Campanilla).
   0-7 carrera · 8 impulso · 9 subida · 10 punto alto · 11 caída · 12-13 agachado · 14 golpe · 15 quieto */
var CW = 62, CH = 70;
/* Cajas de choque del cuerpo (sin el micrófono), dentro del cuadro de 62×70 */
var HB = { run: [19, 7, 50, 68], jump: [19, 8, 50, 62], duck: [16, 43, 54, 68] };
var H = 200, W = 320, GROUND = H - 24, PX = 26;
var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
var img = new Image(); img.src = 'atlas.png';
var chr = new Image(); chr.src = 'side.png';
var K = { best: 'faa26-juego-best', pal: 'faa26-juego-pal', mute: 'faa26-juego-mute' };
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

var best = lsGet(K.best, 0), pal = lsGet(K.pal, 0), muted = lsGet(K.mute, false), takes = 0;
var st = 'menu', p, obs, dist, speed, t0, nextGap, seed, upHeld = false, downHeld = false, frameT = 0, deadT = 0;
var scrollFar = 0, scrollMid = 0, scrollGround = 0, mountains = [];

/* ---------- Tamaño: alto interno fijo, ancho según la pantalla ---------- */
function resize() {
  var r = cv.parentElement.getBoundingClientRect();
  var land = window.matchMedia('(orientation:landscape) and (max-height:520px)').matches;
  var aw = r.width, ah = land ? r.height : Math.min(r.height, r.width * 0.85);
  W = Math.round(Math.max(240, Math.min(440, H * aw / Math.max(ah, 1))));
  cv.width = W; cv.height = H;
  if (!land) { cv.style.width = '100%'; cv.style.height = 'auto'; } else { cv.style.height = '100%'; cv.style.width = 'auto'; }
  ctx.imageSmoothingEnabled = false;
  buildMountains();
  draw();
}
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function buildMountains() {
  /* Cordillera (con el Piltriquitrón de frente): alturas suavizadas que se repiten */
  mountains = []; var s = 7, n = 64, raw = [];
  for (var i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; raw.push((s >>> 16) / 65536); }
  for (i = 0; i < n; i++) { var v = (raw[i] * 2 + raw[(i + 1) % n] + raw[(i + n - 1) % n]) / 4; mountains.push(v); }
}

/* ---------- Sonido mínimo (WebAudio, sin archivos) ---------- */
var ac = null;
function beep(f1, f2, dur, type, vol) {
  if (muted) { return; }
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) {}
}

/* ---------- Partida ---------- */
function reset() {
  p = { y: 0, vy: 0, air: false, duck: false, hold: 0, land: 0 };
  obs = []; dist = 0; speed = 150; nextGap = 220; seed = (Date.now() & 0xffff) || 1; deadT = 0;
}
function start() {
  reset(); st = 'play'; takes++;
  hide('start'); hide('over'); beep(330, 660, 0.12, 'triangle', 0.05);
}
function over() {
  st = 'over'; deadT = 0; beep(220, 55, 0.4, 'sawtooth', 0.07);
  if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
  var m = Math.floor(dist / 10), rec = m > best;
  if (rec) { best = m; lsSet(K.best, best); }
  $('final').textContent = m; $('take').textContent = takes; $('best').textContent = best;
  $('rec').textContent = rec ? '¡Nuevo récord en este teléfono!' : 'Récord: ' + best + ' m';
  setTimeout(function () { show('over'); }, 450);
}
function $(id) { return document.getElementById(id); }
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

/* Obstáculos: suelo (saltar) o aire (agacharse). Se arman en tandas al azar, siempre pasables. */
var KINDS = [
  { k: 'case', y: 0, w: 4 }, { k: 'chairs', y: 0, w: 3 }, { k: 'tripod', y: 0, w: 3 }, { k: 'case2', y: 0, w: 2, from: 40 },
  { k: 'bang', air: 1, w: 2, from: 25 }, { k: 'n26', air: 1, w: 2, from: 60 }, { k: 'spot', air: 2, w: 2, from: 90 }
];
function pick() {
  var m = dist / 10, list = KINDS.filter(function (o) { return !o.from || m >= o.from; }), tot = 0;
  list.forEach(function (o) { tot += o.w; });
  var r = rnd() * tot;
  for (var i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) { return list[i]; } }
  return list[0];
}
function spawn() {
  var o = pick(), a = A[o.k], x = W + 10, y;
  if (!o.air) { y = GROUND - a[3] + 1; }
  else { y = GROUND - 46 - a[3] - (o.air === 2 ? 0 : Math.floor(rnd() * 6)); }
  obs.push({ k: o.k, x: x, y: y, w: a[2], h: a[3], air: !!o.air, bob: rnd() * 6.28 });
  /* a veces, un segundo obstáculo de suelo pegado (más tarde en la partida) */
  if (!o.air && dist / 10 > 70 && rnd() < 0.22) {
    var b = A[rnd() < 0.5 ? 'case' : 'chairs'];
    obs.push({ k: b === A.case ? 'case' : 'chairs', x: x + a[2] + 2, y: GROUND - b[3] + 1, w: b[2], h: b[3], air: false });
  }
  var air = 2 * 430 / 1500; /* tiempo de vuelo base */
  var minGap = speed * air + 40 + (o.air ? 10 : 0);
  nextGap = minGap + rnd() * (150 + 120 * Math.max(0, 1 - speed / 420));
}

/* ---------- Física (paso fijo) ---------- */
var G = 1500, JV = 430, STEP = 1 / 120;
function update(dt) {
  frameT += dt;
  if (st !== 'play') { if (st === 'over') { deadT += dt; } return; }
  speed = Math.min(430, 150 + dist * 0.045);
  var dx = speed * dt; dist += dx; nextGap -= dx;
  scrollFar += dx * 0.12; scrollMid += dx * 0.4; scrollGround += dx;
  if (nextGap <= 0) { spawn(); }
  /* personaje */
  p.duck = downHeld && !p.air;
  if (p.land > 0) { p.land -= dt; }
  if (p.air) {
    var g = G;
    if (upHeld && p.vy < 0 && p.hold < 0.22) { g = G * 0.5; p.hold += dt; }
    if (downHeld) { g = G * 2.6; }
    p.vy += g * dt; p.y += p.vy * dt;
    if (p.y >= 0) { p.y = 0; p.vy = 0; p.air = false; p.land = 0.07; if (downHeld) { p.duck = true; } }
  }
  /* obstáculos */
  for (var i = obs.length - 1; i >= 0; i--) { obs[i].x -= dx; if (obs[i].x + obs[i].w < -10) { obs.splice(i, 1); } }
  /* choque */
  var hb = p.duck ? HB.duck : (p.air ? HB.jump : HB.run), top = GROUND - CH + Math.round(p.y);
  var bx1 = PX + hb[0], by1 = top + hb[1], bx2 = PX + hb[2], by2 = top + hb[3];
  for (i = 0; i < obs.length; i++) {
    var o = obs[i], m = 3, oy = o.air ? o.y + Math.sin(frameT * 3 + o.bob) * 2 : o.y;
    if (bx1 < o.x + o.w - m && bx2 > o.x + m && by1 < oy + o.h - m && by2 > oy + m) { over(); break; }
  }
  $('score').textContent = Math.floor(dist / 10);
}
function jump() {
  if (st !== 'play') { return; }
  if (!p.air) { p.air = true; p.vy = -JV; p.hold = 0; beep(420, 820, 0.09, 'square', 0.035); }
}

/* ---------- Dibujo ---------- */
var SKY = [
  [[246, 239, 196], [244, 201, 120], [226, 150, 90]],   /* tarde */
  [[244, 201, 120], [214, 120, 70], [140, 62, 40]],     /* atardecer */
  [[90, 60, 110], [140, 62, 70], [107, 42, 14]]          /* noche FAA! */
];
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function skyAt(m) {
  var c = (m / 600) % SKY.length, i = Math.floor(c), t = Math.min(1, (c - i) * 3), a = SKY[i], b = SKY[(i + 1) % SKY.length];
  return a.map(function (col, k) { return col.map(function (v, j) { return lerp(v, b[k][j], t); }); });
}
function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
function draw() {
  if (!img.complete || !chr.complete) { return; }
  var m = dist / 10 || 0, sky = skyAt(m), bands = 6, i;
  /* cielo en franjas, estilo pixel */
  for (i = 0; i < bands; i++) {
    var t = i / (bands - 1), c = t < 0.5 ? sky[0].map(function (v, j) { return lerp(v, sky[1][j], t * 2); }) : sky[1].map(function (v, j) { return lerp(v, sky[2][j], (t - 0.5) * 2); });
    ctx.fillStyle = rgb(c); ctx.fillRect(0, Math.floor(i * GROUND / bands), W, Math.ceil(GROUND / bands) + 1);
  }
  /* cordillera lejana */
  var mc = sky[2].map(function (v) { return Math.round(v * 0.72); });
  ctx.fillStyle = rgb(mc);
  var seg = 10, off = scrollFar % seg, base = Math.floor(scrollFar / seg);
  for (var x = -seg; x < W + seg; x += 2) {
    var idx = base + Math.floor((x + off) / seg), fr = ((x + off) % seg) / seg;
    var h0 = mountains[((idx % 64) + 64) % 64], h1 = mountains[(((idx + 1) % 64) + 64) % 64];
    var hh = 34 + (h0 + (h1 - h0) * fr) * 46;
    ctx.fillRect(x, GROUND - hh, 2, hh);
  }
  /* nieve en los picos */
  /* letras del festival (capa media) */
  var mid = A.mid, mo = Math.floor(scrollMid % mid[2]);
  for (x = -mo; x < W; x += mid[2]) { ctx.drawImage(img, mid[0], mid[1], mid[2], mid[3], x, GROUND - mid[3], mid[2], mid[3]); }
  /* suelo */
  ctx.fillStyle = '#6B2A0E'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#F6EFC4'; ctx.fillRect(0, GROUND, W, 2);
  ctx.fillStyle = '#8c3e16';
  var go = Math.floor(scrollGround % 16);
  for (x = -go; x < W; x += 16) { ctx.fillRect(x, GROUND + 6, 6, 2); ctx.fillRect(x + 9, GROUND + 13, 3, 2); }
  /* obstáculos */
  obs.forEach(function (o) {
    var a = A[o.k], y = o.air ? o.y + Math.round(Math.sin(frameT * 3 + o.bob) * 2) : o.y, x0 = Math.round(o.x);
    if (o.k === 'spot') { ctx.fillStyle = '#1a0e08'; ctx.fillRect(x0 + 8, 0, 2, y); }
    ctx.drawImage(img, a[0], a[1], a[2], a[3], x0, y, a[2], a[3]);
  });
  /* personaje */
  var fr2;
  if (st === 'play') {
    if (p.duck) { fr2 = 12 + Math.floor(frameT * 8) % 2; }
    else if (p.air) { fr2 = p.vy < -170 ? 9 : (p.vy < 170 ? 10 : 11); }
    else if (p.land > 0) { fr2 = 8; }
    else { fr2 = Math.floor(frameT * (11 + speed / 40)) % 8; }
  } else { fr2 = st === 'over' ? 14 : 15; }
  var py = GROUND - CH + Math.round(p ? p.y : 0) + 1;
  ctx.drawImage(chr, fr2 * CW, pal * CH, CW, CH, PX, py, CW, CH);
  if (st === 'over') { ctx.fillStyle = 'rgba(58,22,6,' + Math.min(0.35, deadT) + ')'; ctx.fillRect(0, 0, W, H); }
}

/* ---------- Bucle ---------- */
var last = 0, acc = 0;
function loop(ts) {
  var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw(); requestAnimationFrame(loop);
}

/* ---------- Controles ---------- */
function upOn() { if (st === 'menu') { return; } if (st === 'over') { if (deadT > 0.6) { start(); } return; } upHeld = true; jump(); }
function upOff() { upHeld = false; }
function downOn() { downHeld = true; if (st === 'play' && !p.air) { beep(300, 160, 0.06, 'square', 0.03); } }
function downOff() { downHeld = false; }
document.addEventListener('keydown', function (e) {
  if (e.repeat) { if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); } return; }
  if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') { e.preventDefault(); if (st === 'menu') { start(); } else { upOn(); } }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); downOn(); }
  if (e.key === 'Enter' && st !== 'play') { start(); }
});
document.addEventListener('keyup', function (e) {
  if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') { upOff(); }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { downOff(); }
});
function hold(el, on, off) {
  el.addEventListener('pointerdown', function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (er) {} el.classList.add('on'); on(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { el.addEventListener(ev, function () { el.classList.remove('on'); off(); }); });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}
hold($('bUp'), upOn, upOff);
hold($('bDown'), downOn, downOff);
/* tocar el juego = saltar; deslizar hacia abajo = agacharse */
var ty0 = null;
cv.addEventListener('pointerdown', function (e) { ty0 = e.clientY; upOn(); });
cv.addEventListener('pointermove', function (e) { if (ty0 != null && e.clientY - ty0 > 24) { upOff(); downOn(); ty0 = -9999; } });
['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { ty0 = null; upOff(); downOff(); }); });

/* ---------- Menús ---------- */
function setPal(i) { pal = i; lsSet(K.pal, i); document.querySelectorAll('.pick').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-p') === i)); }); }
document.querySelectorAll('.pick').forEach(function (b) { b.addEventListener('click', function () { setPal(+b.getAttribute('data-p')); beep(500, 700, 0.05, 'triangle', 0.04); }); });
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);
$('change').addEventListener('click', function () { st = 'menu'; hide('over'); show('start'); });
function setMute(v) { muted = v; lsSet(K.mute, v); $('mute').textContent = v ? '♪̸' : '♪'; $('mute').setAttribute('aria-pressed', String(!v)); }
$('mute').addEventListener('click', function () { setMute(!muted); });
setMute(muted); setPal(pal); $('best').textContent = best;
reset();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
var started = false;
function ready() { if (started || !img.complete || !chr.complete) { return; } started = true; resize(); requestAnimationFrame(loop); }
img.onload = ready; chr.onload = ready; ready();
})();
