/* ¡Corre, sonidista! · modo carriles. Falso 3D en Canvas 2D (proyección en perspectiva), sin dependencias. */
(function () {
'use strict';
var A = { case: [0, 196, 22, 18], case2: [23, 196, 22, 32], chairs: [46, 196, 18, 26], tripod: [65, 196, 16, 30], bang: [82, 196, 14, 22], n26: [97, 196, 28, 25], spot: [126, 196, 18, 14], logo: [145, 196, 64, 24] };
var LETTERS = [[0, 50], [58, 81], [153, 43], [204, 67]]; /* tramos de letras del banner (y 229, alto 27) */
var CW = 41, CH = 65, CX = 22;          /* cuadro del personaje y su centro */
var LW = 50;                             /* ancho de carril (unidades de mundo = px a la distancia del personaje) */
var D = 170, F = 170;                    /* cámara: distancia detrás del personaje y focal */
var DMAX = 2300;                         /* distancia de dibujo */
var PXM = 38;                            /* unidades por metro */
var W = 180, H = 320, HOR = 110, CAMY = 166;
var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
var img = new Image(); img.src = '../atlas.png';
var K = { best: 'faa26-carril-best', pal: 'faa26-juego-pal', mute: 'faa26-juego-mute' };
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function $(id) { return document.getElementById(id); }
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

var best = lsGet(K.best, 0), pal = lsGet(K.pal, 0), muted = lsGet(K.mute, false), takes = 0;
var st = 'menu', p, obs, coins, decos, dist, speed, seed, rowZ, frameT = 0, deadT = 0, shake = 0, camX = 0, nCoins = 0, decoZ = 0, mountains = [];

/* ---------- Tamaño: la resolución interna sigue la forma de la pantalla ---------- */
function resize() {
  var r = cv.parentElement.getBoundingClientRect();
  H = Math.round(Math.max(220, Math.min(340, r.height / 2.2)));
  W = Math.round(Math.max(150, Math.min(640, H * r.width / Math.max(r.height, 1))));
  cv.width = W; cv.height = H;
  HOR = Math.round(H * 0.34);
  CAMY = (H - 44 - HOR) * D / F;
  ctx.imageSmoothingEnabled = false;
  draw();
}
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
(function () { var s = 11, n = 64, raw = [], i; for (i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; raw.push((s >>> 16) / 65536); } for (i = 0; i < n; i++) { mountains.push((raw[i] * 2 + raw[(i + 1) % n] + raw[(i + n - 1) % n]) / 4); } })();

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
  p = { lane: 0, x: 0, nudge: 0, y: 0, vy: 0, air: false, roll: 0, stumble: -9 };
  obs = []; coins = []; decos = []; dist = 0; speed = 430; nCoins = 0; deadT = 0; shake = 0; camX = 0;
  seed = (Date.now() & 0xffff) || 1; rowZ = 900; decoZ = 0;
  fillWorld();
  $('coins').textContent = '0'; $('score').textContent = '0';
}
function start() { reset(); st = 'play'; takes++; hide('start'); hide('over'); hide('pause'); beep(330, 660, 0.12, 'triangle', 0.05); }
function over() {
  st = 'over'; deadT = 0; shake = 0.35; beep(220, 55, 0.45, 'sawtooth', 0.07);
  if (navigator.vibrate) { try { navigator.vibrate(90); } catch (e) {} }
  var m = Math.floor(dist / PXM), rec = m > best;
  if (rec) { best = m; lsSet(K.best, best); }
  $('final').textContent = m; $('fcoins').textContent = nCoins; $('take').textContent = takes; $('best').textContent = best;
  $('rec').textContent = rec ? '¡nuevo récord en este teléfono!' : 'récord ' + best + ' m';
  setTimeout(function () { show('over'); }, 600);
}

/* ---------- Generación procedural ----------
   Los obstáculos vienen en filas. Tipos: low (saltar), duck (rodar), stack y truck (cambiar de carril).
   Cada fila se valida: desde cualquier carril posible tiene que existir un carril libre alcanzable. */
var HARD = { stack: 1, truck: 1 };
function hardAt(lane, z1, z2, extra) {
  var list = extra ? obs.concat(extra) : obs;
  for (var i = 0; i < list.length; i++) { var o = list[i]; if (HARD[o.t] && o.lane === lane && o.z < z2 && o.z + o.len > z1) { return true; } }
  return false;
}
function fair(z, row) {
  /* carriles donde podría estar el jugador justo antes de la fila */
  var from = [-1, 0, 1].filter(function (l) { return !hardAt(l, z - 160, z - 20, row); });
  var to = [-1, 0, 1].filter(function (l) { return !hardAt(l, z - 10, z + 40, row); });
  if (!to.length) { return false; }
  return from.every(function (a) {
    return to.some(function (b) {
      var lo = Math.min(a, b), hi = Math.max(a, b);
      for (var l = lo; l <= hi; l++) { if (hardAt(l, z - 160, z - 10, row) && l !== a) { return false; } }
      return true;
    });
  });
}
function wpick(list) { var tot = 0, i; for (i = 0; i < list.length; i++) { tot += list[i][1]; } var r = rnd() * tot; for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) { return list[i][0]; } } return list[0][0]; }
function makeRow(z) {
  var m = (z + dist) / PXM, n = 1;
  if (m > 40 && rnd() < 0.55) { n = 2; }
  if (m > 220 && rnd() < 0.3) { n = 3; }
  var lanes = [-1, 0, 1].sort(function () { return rnd() - 0.5; }).slice(0, n), row = [];
  lanes.forEach(function (l, i) {
    var types = [['low', 4]];
    if (m > 20) { types.push(['duck', 3]); }
    if (m > 10 && i < 2) { types.push(['stack', 3]); }
    if (m > 70 && i < 2) { types.push(['truck', 2]); }
    var t = wpick(types), o = { t: t, lane: l, z: z, len: 26, v: rnd() < 0.5 ? 0 : 1 };
    if (t === 'truck') { o.len = Math.round(260 + rnd() * (m > 200 ? 520 : 300)); }
    row.push(o);
  });
  /* si la fila no es justa, los obstáculos duros pasan a ser saltables */
  for (var k = 0; k < 3 && !fair(z, row); k++) { row.forEach(function (o) { if (HARD[o.t] && !fair(z, row)) { o.t = rnd() < 0.5 ? 'low' : 'duck'; o.len = 26; } }); }
  /* nada de fichas metidas dentro de un obstáculo */
  coins = coins.filter(function (c) { return !row.some(function (o) { return o.lane === c.lane && c.z > o.z - 40 && c.z < o.z + o.len + 40; }); });
  obs = obs.concat(row);
  /* tira de fichas en un carril libre */
  if (rnd() < 0.7) {
    var free = [-1, 0, 1].filter(function (l) { return !row.some(function (o) { return o.lane === l; }) && !hardAt(l, z + 30, z + 330); });
    if (free.length) {
      var cl = free[Math.floor(rnd() * free.length)], cnt = 4 + Math.floor(rnd() * 4);
      for (var c = 0; c < cnt; c++) { coins.push({ lane: cl, z: z + 70 + c * 42, y: 16, ph: c * 0.6 }); }
    }
  }
}
function fillWorld() {
  while (rowZ < DMAX) {
    var m = (rowZ + dist) / PXM;
    makeRow(rowZ);
    var gapT = Math.max(0.62, 1.15 - m / 900) + rnd() * 0.45;
    var last = obs[obs.length - 1], extra = last && last.t === 'truck' ? last.len * 0.35 : 0;
    rowZ += Math.max(240, speed * gapT) + extra;
  }
  while (decoZ < DMAX) {
    var side = rnd() < 0.5 ? -1 : 1, kind = wpick([['letters', 4], ['tripod', 2], ['logo', 2], ['chairs', 1]]);
    decos.push({ k: kind, x: side * (1.5 * LW + 56 + rnd() * 30), z: decoZ, i: Math.floor(rnd() * LETTERS.length) });
    if (rnd() < 0.5) { decos.push({ k: wpick([['letters', 3], ['tripod', 2], ['logo', 1]]), x: -side * (1.5 * LW + 56 + rnd() * 30), z: decoZ + 30, i: Math.floor(rnd() * LETTERS.length) }); }
    decoZ += 110 + rnd() * 120;
  }
}

/* ---------- Física (paso fijo) ---------- */
var G = 1700, JV = 455, STEP = 1 / 120, ROLL = 0.62;
function update(dt) {
  frameT += dt;
  if (shake > 0) { shake = Math.max(0, shake - dt); }
  if (st === 'over') { deadT += dt; return; }
  if (st !== 'play') { return; }
  speed = Math.min(920, 430 + dist * 0.0105);
  var dz = speed * dt; dist += dz;
  rowZ -= dz; decoZ -= dz;
  for (var i = obs.length - 1; i >= 0; i--) { obs[i].z -= dz; if (obs[i].z + obs[i].len < -D + 20) { obs.splice(i, 1); } }
  for (i = coins.length - 1; i >= 0; i--) { coins[i].z -= dz; if (coins[i].z < -60) { coins.splice(i, 1); } }
  for (i = decos.length - 1; i >= 0; i--) { decos[i].z -= dz; if (decos[i].z < -D + 30) { decos.splice(i, 1); } }
  fillWorld();
  /* personaje */
  p.x += (p.lane * LW - p.x) * Math.min(1, dt * 16);
  p.nudge *= Math.max(0, 1 - dt * 10);
  if (p.air) {
    p.vy -= G * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.air = false; }
  }
  if (p.roll > 0 && !p.air) { p.roll -= dt; }
  /* choques */
  for (i = 0; i < obs.length; i++) {
    var o = obs[i];
    if (o.z > 14 || o.z + o.len < -14) { continue; }
    var dx = Math.abs(p.x - o.lane * LW);
    if (HARD[o.t] && dx < 34) { over(); return; }
    if (dx > 28) { continue; }
    if (o.t === 'low' && p.y < 30) { over(); return; }
    if (o.t === 'duck' && !(p.roll > 0 && p.y < 6)) { over(); return; }
  }
  /* fichas */
  for (i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    if (Math.abs(c.z) < 20 && Math.abs(p.x - c.lane * LW) < 26 && p.y < 60) {
      coins.splice(i, 1); nCoins++; $('coins').textContent = nCoins;
      beep(880 + (nCoins % 5) * 60, 1320, 0.07, 'square', 0.03);
    }
  }
  $('score').textContent = Math.floor(dist / PXM);
}
function move(dir) {
  if (st !== 'play') { return; }
  var nl = p.lane + dir;
  if (nl < -1 || nl > 1) { p.nudge = dir * 8; beep(200, 150, 0.05, 'square', 0.025); return; }
  if (hardAt(nl, -20, 30)) {
    /* tropezón contra el costado: dos seguidos y se corta la toma */
    p.nudge = dir * 14; shake = 0.2; beep(180, 90, 0.15, 'sawtooth', 0.05);
    if (frameT - p.stumble < 4) { over(); } else { p.stumble = frameT; }
    return;
  }
  p.lane = nl; beep(520, 610, 0.04, 'triangle', 0.025);
}
function jump() {
  if (st !== 'play' || p.air) { return; }
  p.air = true; p.vy = JV; p.roll = 0; beep(420, 820, 0.09, 'square', 0.035);
}
function roll() {
  if (st !== 'play') { return; }
  p.roll = ROLL;
  if (p.air) { p.vy = Math.min(p.vy, -900); } /* en el aire: baja de golpe y rueda al tocar el piso */
  beep(300, 160, 0.07, 'square', 0.03);
}

/* ---------- Proyección ---------- */
function sx(x, d) { return W / 2 + (x - camX) * F / d; }
function sy(y, d) { return HOR + (CAMY - y) * F / d; }

/* ---------- Dibujo ---------- */
var SKY = [
  [[246, 239, 196], [244, 201, 120], [226, 150, 90]],
  [[244, 201, 120], [214, 120, 70], [140, 62, 40]],
  [[90, 60, 110], [140, 62, 70], [107, 42, 14]]
];
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
function skyAt(m) {
  var c = (m / 600) % SKY.length, i = Math.floor(c), t = Math.min(1, (c - i) * 3), a = SKY[i], b = SKY[(i + 1) % SKY.length];
  return a.map(function (col, k) { return mix(col, b[k], t); });
}
function spr(a, x, y, d, s, ax, sxs) {
  /* sprite del atlas a escala de mundo s, apoyado en (x, y) a profundidad d */
  if (d < 28) { return; }
  var sc = F / d, w = a[2] * s * sc * (sxs == null ? 1 : sxs), h = a[3] * s * sc;
  if (w < 1 || h < 1) { return; }
  var X = sx(x, d) - w * (ax == null ? 0.5 : ax), Y = sy(y, d) - h;
  ctx.drawImage(img, a[0], a[1], a[2], a[3], Math.round(X), Math.round(Y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}
function box3(x0, x1, y0, y1, d, col) {
  /* rectángulo de frente (plano) a profundidad d */
  var X0 = Math.round(sx(x0, d)), X1 = Math.round(sx(x1, d)), Y0 = Math.round(sy(y1, d)), Y1 = Math.round(sy(y0, d));
  ctx.fillStyle = col; ctx.fillRect(X0, Y0, Math.max(1, X1 - X0), Math.max(1, Y1 - Y0));
}
function quad(pts, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (var i = 2; i < pts.length; i += 2) { ctx.lineTo(pts[i], pts[i + 1]); }
  ctx.closePath(); ctx.fill();
}
function drawTruck(o) {
  var x0 = o.lane * LW - 24, x1 = o.lane * LW + 24, yT = 84, d0 = Math.max(30, o.z + D), d1 = Math.min(DMAX + 400, o.z + o.len + D);
  if (d1 <= d0) { return; }
  /* costado visible */
  if (x1 < camX) { quad([sx(x1, d0), sy(0, d0), sx(x1, d0), sy(yT, d0), sx(x1, d1), sy(yT, d1), sx(x1, d1), sy(0, d1)], '#c9bf93'); }
  if (x0 > camX) { quad([sx(x0, d0), sy(0, d0), sx(x0, d0), sy(yT, d0), sx(x0, d1), sy(yT, d1), sx(x0, d1), sy(0, d1)], '#c9bf93'); }
  /* franja del costado */
  var side = x1 < camX ? x1 : (x0 > camX ? x0 : null);
  if (side != null) { quad([sx(side, d0), sy(30, d0), sx(side, d0), sy(40, d0), sx(side, d1), sy(40, d1), sx(side, d1), sy(30, d1)], '#8FBABA'); }
  /* techo */
  quad([sx(x0, d0), sy(yT, d0), sx(x1, d0), sy(yT, d0), sx(x1, d1), sy(yT, d1), sx(x0, d1), sy(yT, d1)], '#F4C95C');
  if (o.z + D < 30) { return; }
  /* frente */
  box3(x0, x1, 0, yT, d0, '#6B2A0E');
  box3(x0, x1, 6, 12, d0, '#3a1606');
  box3(x0 + 3, x0 + 10, 14, 20, d0, '#F6EFC4'); box3(x1 - 10, x1 - 3, 14, 20, d0, '#F6EFC4');
  box3(x0 + 4, x1 - 4, 52, 78, d0, '#3a1606');
  spr(A.logo, o.lane * LW, 54, d0, 0.62);
  box3(x0, x1, 28, 32, d0, '#8FBABA');
}
function drawObs(o) {
  var d = o.z + D, lx = o.lane * LW;
  if (o.t === 'truck') { drawTruck(o); return; }
  if (d < 28) { return; }
  if (o.t === 'low') {
    if (o.v) { spr(A.case, lx, 0, d, 2); }
    else {
      /* valla rayada */
      box3(lx - 22, lx - 19, 0, 32, d, '#3a1606'); box3(lx + 19, lx + 22, 0, 32, d, '#3a1606');
      for (var k = 0; k < 6; k++) { box3(lx - 23 + k * 7.7, lx - 23 + (k + 1) * 7.7, 18, 32, d, k % 2 ? '#3a1606' : '#F4C95C'); }
    }
  } else if (o.t === 'duck') {
    box3(lx - 25, lx - 22, 0, 62, d, '#3a1606'); box3(lx + 22, lx + 25, 0, 62, d, '#3a1606');
    box3(lx - 25, lx + 25, 42, 62, d, '#6B2A0E');
    for (var j = 0; j < 7; j++) { if (j % 2) { box3(lx - 25 + j * 7.15, lx - 25 + (j + 1) * 7.15, 42, 46, d, '#F4C95C'); } }
    if (o.v) { spr(A.n26, lx, 45, d, 0.62); } else { spr(A.bang, lx, 46, d, 0.7); }
  } else if (o.t === 'stack') {
    if (o.v) { spr(A.case2, lx, 0, d, 2.1); spr(A.spot, lx, 67, d, 1.4); }
    else { spr(A.chairs, lx, 0, d, 2.5); }
  }
}
function drawDeco(o) {
  var d = o.z + D;
  if (d < 40) { return; }
  if (o.k === 'letters') { var L = LETTERS[o.i]; spr([L[0], 229, L[1], 27], o.x, 0, d, 1.8); }
  else if (o.k === 'tripod') { spr(A.tripod, o.x, 0, d, 2.4); }
  else if (o.k === 'chairs') { spr(A.chairs, o.x, 0, d, 2.2); }
  else if (o.k === 'logo') {
    box3(o.x - 2, o.x + 2, 0, 70, d, '#3a1606');
    box3(o.x - 38, o.x + 38, 62, 98, d, '#6B2A0E');
    spr(A.logo, o.x, 66, d, 1.05);
  }
}
function drawCoin(c) {
  var d = c.z + D; if (d < 30) { return; }
  var y = c.y + Math.sin(frameT * 4 + c.ph) * 3, s = Math.abs(Math.cos(frameT * 3 + c.ph));
  spr(A.n26, c.lane * LW, y, d, 0.72, 0.5, Math.max(0.15, s));
}
function drawPlayer() {
  var fr = st === 'play' ? (p.roll > 0 && !p.air ? 5 : (p.air ? 4 : Math.floor(frameT * (7 + speed / 110)) % 4)) : (st === 'over' ? 4 : Math.floor(frameT * 3) % 2);
  var x = Math.round(sx(p.x + p.nudge, D)), gy = Math.round(sy(0, D));
  ctx.fillStyle = 'rgba(30,10,4,.35)';
  var sw = Math.max(10, 26 - p.y * 0.15); ctx.fillRect(x - sw / 2, gy - 2, sw, 4);
  ctx.drawImage(img, fr * CW, pal * CH, CW, CH, x - CX, Math.round(sy(p.y, D)) - CH + 1, CW, CH);
}
function draw() {
  if (!img.complete || !p) { return; }
  var m = dist / PXM, sky = skyAt(m), i;
  var ox = shake > 0 ? Math.round((Math.random() - 0.5) * 6 * shake / 0.35) : 0, oy = shake > 0 ? Math.round((Math.random() - 0.5) * 4 * shake / 0.35) : 0;
  ctx.save(); ctx.translate(ox, oy);
  /* cielo en franjas */
  var bands = 6;
  for (i = 0; i < bands; i++) {
    var t = i / (bands - 1), c = t < 0.5 ? mix(sky[0], sky[1], t * 2) : mix(sky[1], sky[2], (t - 0.5) * 2);
    ctx.fillStyle = rgb(c); ctx.fillRect(-4, Math.floor(i * HOR / bands) - 4, W + 8, Math.ceil(HOR / bands) + 5);
  }
  /* cordillera (se corre apenas con la cámara) */
  var mc = mix(sky[2], [58, 22, 6], 0.35), snow = mix(sky[0], [255, 255, 255], 0.3), off = camX * 0.15;
  for (var x = -4; x < W + 4; x += 2) {
    var u = (x + off) / 9, i0 = Math.floor(u), fr = u - i0;
    var h0 = mountains[((i0 % 64) + 64) % 64], h1 = mountains[(((i0 + 1) % 64) + 64) % 64], hh = Math.round(HOR * 0.12 + (h0 + (h1 - h0) * fr) * HOR * 0.3);
    ctx.fillStyle = rgb(mc); ctx.fillRect(x, HOR - hh, 2, hh + 1);
    if (hh > HOR * 0.34) { ctx.fillStyle = rgb(snow); ctx.fillRect(x, HOR - hh, 2, 2); }
  }
  /* suelo: una franja por línea de pantalla */
  var fog = rgb(mix(sky[2], [107, 42, 14], 0.4));
  ctx.fillStyle = fog; ctx.fillRect(-4, HOR, W + 8, H - HOR + 4);
  var y0 = Math.ceil(HOR + CAMY * F / DMAX);
  for (var yy = y0; yy < H + 4; yy++) {
    var d = CAMY * F / (yy + 0.5 - HOR), zz = dist + d - D, sc = F / d;
    var b1 = Math.floor(zz / 46) & 1, b2 = Math.floor(zz / 90) & 1;
    ctx.fillStyle = b2 ? '#8c3e16' : '#7f3713'; ctx.fillRect(-4, yy, W + 8, 1);
    var e0 = sx(-1.5 * LW - 7, d), e1 = sx(1.5 * LW + 7, d);
    ctx.fillStyle = '#F4C95C'; ctx.fillRect(Math.round(e0), yy, Math.round(e1 - e0), 1);
    var t0 = sx(-1.5 * LW, d), t1 = sx(1.5 * LW, d);
    ctx.fillStyle = b1 ? '#5e250c' : '#6B2A0E'; ctx.fillRect(Math.round(t0), yy, Math.round(t1 - t0), 1);
    if ((Math.floor(zz / 60) & 1) === 0) {
      var lw = Math.max(1, Math.round(3 * sc));
      ctx.fillStyle = '#F6EFC4';
      ctx.fillRect(Math.round(sx(-LW / 2, d) - lw / 2), yy, lw, 1);
      ctx.fillRect(Math.round(sx(LW / 2, d) - lw / 2), yy, lw, 1);
    }
  }
  /* niebla en el horizonte */
  var gr = ctx.createLinearGradient(0, HOR, 0, y0 + 26);
  gr.addColorStop(0, fog); gr.addColorStop(1, 'rgba(0,0,0,0)');
  var fogDrawn = false;
  /* objetos de atrás hacia adelante */
  var L = [];
  obs.forEach(function (o) {
    var key = o.z + D;
    if (o.t === 'truck' && o.z < 0 && o.z + o.len > 0) { key = D + 1; }
    L.push([key, 0, o]);
  });
  coins.forEach(function (c) { L.push([c.z + D, 1, c]); });
  decos.forEach(function (c) { L.push([c.z + D, 2, c]); });
  L.push([D - 0.5, 3, null]);
  L.sort(function (a, b) { return b[0] - a[0]; });
  for (i = 0; i < L.length; i++) {
    var it = L[i];
    if (!fogDrawn && it[0] < DMAX * 0.62) { ctx.fillStyle = gr; ctx.fillRect(-4, HOR, W + 8, y0 + 26 - HOR); fogDrawn = true; }
    if (it[0] > DMAX + 200) { continue; }
    if (it[1] === 0) { drawObs(it[2]); } else if (it[1] === 1) { drawCoin(it[2]); } else if (it[1] === 2) { drawDeco(it[2]); } else { drawPlayer(); }
  }
  if (!fogDrawn) { ctx.fillStyle = gr; ctx.fillRect(-4, HOR, W + 8, y0 + 26 - HOR); }
  ctx.restore();
  if (st === 'over') { ctx.fillStyle = 'rgba(58,22,6,' + Math.min(0.35, deadT) + ')'; ctx.fillRect(0, 0, W, H); }
}

/* ---------- Bucle ---------- */
var last = 0, acc = 0;
function loop(ts) {
  var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  /* la cámara sigue al personaje a medias, para que se vea el carril de al lado */
  if (p) { camX += (p.x * 0.6 - camX) * Math.min(1, dt * 8); }
  draw(); requestAnimationFrame(loop);
}

/* ---------- Controles: flechas / WASD y deslizar el dedo ---------- */
function pause() { if (st === 'play') { st = 'pause'; show('pause'); } }
function resume() { if (st === 'pause') { st = 'play'; hide('pause'); last = performance.now(); acc = 0; } }
document.addEventListener('keydown', function (e) {
  var k = e.key;
  if (/^Arrow/.test(k) || k === ' ') { e.preventDefault(); }
  if (e.repeat) { return; }
  if (st === 'menu' && (k === 'Enter' || k === ' ' || k === 'ArrowUp')) { start(); return; }
  if (st === 'over') { if ((k === 'Enter' || k === ' ' || k === 'ArrowUp') && deadT > 0.7) { start(); } return; }
  if (st === 'pause') { if (k === 'Enter' || k === ' ' || k === 'Escape' || k === 'p') { resume(); } return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(-1); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { jump(); }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') { roll(); }
  else if (k === 'Escape' || k === 'p') { pause(); }
});
/* el gesto se reconoce apenas el dedo recorre unos px, sin esperar a que se levante */
var g0 = null, stage = $('stage');
stage.addEventListener('pointerdown', function (e) {
  if (e.target !== cv) { return; }
  g0 = { x: e.clientX, y: e.clientY, used: false };
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
});
stage.addEventListener('pointermove', function (e) {
  if (!g0 || g0.used) { return; }
  var dx = e.clientX - g0.x, dy = e.clientY - g0.y, th = 22;
  if (Math.abs(dx) < th && Math.abs(dy) < th) { return; }
  g0.used = true;
  if (Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); } else if (dy < 0) { jump(); } else { roll(); }
});
['pointerup', 'pointercancel'].forEach(function (ev) {
  stage.addEventListener(ev, function () {
    /* un toque sin deslizar: salta (más fácil para quien no conoce el gesto) */
    if (g0 && !g0.used && ev === 'pointerup') { jump(); }
    g0 = null;
  });
});
document.addEventListener('visibilitychange', function () { if (document.hidden) { pause(); } });

/* ---------- Menús ---------- */
function setPal(i) { pal = i; lsSet(K.pal, i); document.querySelectorAll('.pick').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-p') === i)); }); }
document.querySelectorAll('.pick').forEach(function (b) { b.addEventListener('click', function () { setPal(+b.getAttribute('data-p')); beep(500, 700, 0.05, 'triangle', 0.04); }); });
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);
$('resume').addEventListener('click', resume);
$('change').addEventListener('click', function () { st = 'menu'; hide('over'); show('start'); });
function setMute(v) { muted = v; lsSet(K.mute, v); $('mute').textContent = v ? '♪̸' : '♪'; $('mute').setAttribute('aria-pressed', String(!v)); }
$('mute').addEventListener('click', function () { setMute(!muted); });
setMute(muted); setPal(pal); $('best').textContent = best;
reset();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
img.onload = function () { resize(); requestAnimationFrame(loop); };
if (img.complete && img.naturalWidth) { img.onload(); }
})();
