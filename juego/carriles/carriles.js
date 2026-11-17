/* ¡Corre, sonidista! · modo carriles. Falso 3D en Canvas 2D (proyección en perspectiva), sin dependencias. */
(function () {
'use strict';
var A = { case: [0, 0, 22, 18], case2: [23, 0, 22, 32], chairs: [46, 0, 18, 26], tripod: [65, 0, 16, 30], bang: [82, 0, 14, 22], n26: [97, 0, 28, 25], spot: [126, 0, 18, 14], logo: [145, 0, 64, 24] };
/* Personaje de espaldas: back.png, 16 cuadros de 58×70, una fila por paleta (Arrayán, Chilco, Campanilla).
   0-7 carrera · 8 impulso · 9 subida · 10 punto alto · 11 caída · 12-13 rodando · 14 inclinado */
var CW = 58, CH = 70, CX = 22;
var LW = 50;                             /* ancho de carril (unidades de mundo = px a la distancia del personaje) */
var D = 170, F = 170;                    /* cámara: distancia detrás del personaje y focal */
var DMAX = 2300;                         /* distancia de dibujo */
var PXM = 38;                            /* unidades por metro */
var W = 180, H = 320, HOR = 110, CAMY = 166, lift = 0, CY = 166;
var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
var img = new Image(); img.src = '../atlas.png';
var chr = new Image(); chr.src = '../back.png';
var K = { best: 'faa26-carril-best', pal: 'faa26-juego-pal', mute: 'faa26-juego-mute' };
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function $(id) { return document.getElementById(id); }
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

var best = lsGet(K.best, 0), pal = lsGet(K.pal, 0), muted = lsGet(K.mute, false), takes = 0;
var playT = 0, st = 'menu', p, obs, coins, decos, pups, dist, speed, seed, rowZ, frameT = 0, deadT = 0, shake = 0, camX = 0, nCoins = 0, decoZ = 0, mountains = [];

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
  p = { lane: 0, x: 0, nudge: 0, y: 0, vy: 0, air: false, roll: 0, stumble: -9, land: 0, mag: 0, sj: 0, fly: 0, inv: 0 };
  obs = []; coins = []; pups = []; decos = []; dist = 0; speed = 430; nCoins = 0; deadT = 0; shake = 0; camX = 0;
  seed = (Date.now() & 0xffff) || 1; rowZ = 900; decoZ = 0;
  fillWorld();
  $('coins').textContent = '0'; $('score').textContent = '0';
}
function start() { reset(); playT = 0; st = 'play'; takes++; hide('start'); hide('over'); hide('pause'); beep(330, 660, 0.12, 'triangle', 0.05); }
function over() {
  st = 'over'; deadT = 0; shake = 0.35; beep(220, 55, 0.45, 'sawtooth', 0.07);
  if (navigator.vibrate) { try { navigator.vibrate(90); } catch (e) {} }
  var m = Math.floor(dist / PXM), rec = m > best;
  if (rec) { best = m; lsSet(K.best, best); }
  $('final').textContent = m; $('fcoins').textContent = nCoins; $('take').textContent = takes; $('best').textContent = best;
  $('rec').textContent = rec ? '¡nuevo récord en este teléfono!' : 'récord ' + best + ' m';
  if (window.FAARank) { FAARank.over({ score: m, coins: nCoins, secs: playT }); }
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
  /* no poner nada en un carril que todavía está ocupado por un camión */
  var lanes = [-1, 0, 1].filter(function (l) { return !hardAt(l, z - 40, z + 66); }).sort(function () { return rnd() - 0.5; }).slice(0, n), row = [];
  if (!lanes.length) { return; }
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
  coins = coins.filter(function (c) { return c.y > 90 || !row.some(function (o) { return o.lane === c.lane && c.z > o.z - 40 && c.z < o.z + o.len + 40; }); });
  pups = pups.filter(function (u) { return !row.some(function (o) { return o.lane === u.lane && u.z > o.z - 40 && u.z < o.z + o.len + 40; }); });
  obs = obs.concat(row);
  /* fichas en lugares difíciles: en arco sobre lo que se salta, bajo las pancartas y justo detrás de los obstáculos */
  var placed = 0;
  row.forEach(function (o) {
    if (placed >= 2 || rnd() > (o.t === 'stack' ? 0.4 : 0.7)) { return; }
    var c, mid = o.z + o.len / 2, after = o.z + o.len + 26;
    if (o.t === 'low') {
      /* el arco sigue la curva real del salto a la velocidad que habrá al llegar: más rápido = fichas más separadas */
      var v = Math.min(880, speed + z * 0.0052), ta = JV / G;
      for (c = -2; c <= 2; c++) { var t = ta + c * 0.112; coins.push({ lane: o.lane, z: mid + v * (t - ta), y: 16 + JV * t - G * t * t / 2, ph: c * 0.6 }); }
      after = mid + v * (2 * ta - ta) + 30;
    } else if (o.t === 'duck') {
      for (c = 0; c < 3; c++) { coins.push({ lane: o.lane, z: o.z - 6 + c * 19, y: 9, ph: c * 0.6 }); }
    } else if (o.t !== 'stack') { return; }
    var n2 = o.t === 'stack' ? 4 : 3;
    for (c = 0; c < n2; c++) { coins.push({ lane: o.lane, z: after + c * 30, y: 16, ph: c * 0.6 }); }
    placed++;
  });
  /* fichas en el techo de camiones y pilas (se llega con las zapatillas o desde arriba de otro camión) */
  row.forEach(function (o) {
    if (o.t === 'truck' && rnd() < 0.6) { for (var zc = o.z + 40; zc < o.z + o.len - 30; zc += 42) { coins.push({ lane: o.lane, z: zc, y: TOP.truck + 16, ph: zc * 0.02 }); } }
    else if (o.t === 'stack' && rnd() < 0.3) { coins.push({ lane: o.lane, z: o.z + o.len / 2, y: TOP.stack + 16, ph: 0 }); }
  });
  /* poderes: pocos y en lugares difíciles (detrás de algo duro, en lo alto de un salto o bajo una pancarta) */
  if (m > 35 && !pups.length && !p.mag && !p.sj && !p.fly && rnd() < 0.08) {
    var host = row[Math.floor(rnd() * row.length)], kind = ['mag', 'jump', 'fly'][Math.floor(rnd() * 3)], pu = { k: kind, lane: host.lane, ph: 0 };
    if (HARD[host.t]) { pu.z = host.z + host.len + 22; pu.y = 16; }
    else if (host.t === 'low') { pu.z = host.z + host.len / 2; pu.y = 16 + JV * JV / (2 * G) - 4; }
    else { pu.z = host.z + 13; pu.y = 8; }
    coins = coins.filter(function (c) { return c.lane !== pu.lane || Math.abs(c.z - pu.z) > 28; });
    pups.push(pu);
  }
  /* de vez en cuando, una tira fácil en un carril libre */
  if (!placed && rnd() < 0.3) {
    var free = [-1, 0, 1].filter(function (l) { return !row.some(function (o) { return o.lane === l; }) && !hardAt(l, z + 30, z + 260); });
    if (free.length) {
      var cl = free[Math.floor(rnd() * free.length)];
      for (var k2 = 0; k2 < 4; k2++) { coins.push({ lane: cl, z: z + 70 + k2 * 42, y: 16, ph: k2 * 0.6 }); }
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
    [-1, 1].forEach(function (side) {
      if (rnd() < 0.3) { return; }
      if (rnd() < 0.12) { decos.push({ k: 'logo', x: side * (1.5 * LW + 60), z: decoZ + rnd() * 40 }); return; }
      decos.push({ k: 'crowd', side: side, x: side * (1.5 * LW + 16 + rnd() * 26), z: decoZ + rnd() * 50, i: Math.floor(rnd() * CROWDS.length) });
    });
    if (rnd() < 0.5) { decos.push({ k: 'flyer', x: (rnd() < 0.5 ? -1 : 1) * (1.5 * LW + 14 + rnd() * 40), y: 40 + rnd() * 50, z: decoZ + 60, ph: rnd() * 6 }); }
    decoZ += 150 + rnd() * 110;
  }
}

/* ---------- Gráfica de la marcha: siluetas simples con carteles, pancartas, banderas y panfletos ----------
   Se dibujan una sola vez al empezar, en lienzos chicos, y después se usan como sprites. */
var FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100110101010', '7': '111001010010010', '8': '010101010101010', '9': '010101011001110',
  '!': '010010010000010', '¡': '010000010010010', '.': '000000000000010', ' ': '000000000000000'
};
function txt(g, str, x, y, col) {
  g.fillStyle = col;
  for (var i = 0; i < str.length; i++) {
    var f = FONT[str[i]] || FONT[' '];
    for (var k = 0; k < 15; k++) { if (f[k] === '1') { g.fillRect(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1); } }
  }
}
function txtW(str) { return str.length * 4 - 1; }
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
var MPAL = { body: ['#3b1a0b', '#4a2310', '#552a14', '#2e1408'], coat: '#b3a582', sign: '#c4b68e', ink: '#3b1a0b', cel: '#7f9fae', wht: '#c9bf9f' };
var SIGNS = ['EDUCACION|PUBLICA', 'LA UNI|SE DEFIENDE', 'PRESUPUESTO|YA', '1918', 'NI UN PASO|ATRAS', 'LIBRE Y|GRATUITA', 'UNRN', 'DEFENDAMOS|LA UNI', 'ARTE|PUBLICO', 'FAA!', 'REFORMA|1918'];
var BANNERS = ['EL MANIFIESTO ES AHORA!', 'UNIVERSIDAD PUBLICA', 'EDUCACION PUBLICA', 'LA UNI SE DEFIENDE'];
var CROWDS = [];
function person(g, x, base, col, coat, arm) {
  g.fillStyle = col; g.fillRect(x - 3, base - 10, 3, 10); g.fillRect(x + 1, base - 10, 3, 10);   /* piernas */
  g.fillStyle = coat ? MPAL.coat : col; g.fillRect(x - 4, base - 22, 9, 13);                     /* cuerpo / guardapolvo */
  g.fillStyle = col; g.fillRect(x - 2, base - 28, 6, 6); g.clearRect(x - 2, base - 28, 1, 1); g.clearRect(x + 3, base - 28, 1, 1); /* cabeza */
  if (arm) { g.fillStyle = coat ? MPAL.coat : col; g.fillRect(x + (arm > 0 ? 4 : -4), base - 31, 2, 10); }  /* brazo en alto */
}
function sign(g, x, base, text) {
  var L = text.split('|'), w = Math.max.apply(null, L.map(txtW)) + 4, h = L.length * 6 + 3, top = base - 31 - 6 - h;
  g.fillStyle = MPAL.ink; g.fillRect(x, top + h, 1, 9);
  g.fillRect(x - Math.floor(w / 2) - 1, top - 1, w + 2, h + 2);
  g.fillStyle = MPAL.sign; g.fillRect(x - Math.floor(w / 2), top, w, h);
  L.forEach(function (l, i) { txt(g, l, x - Math.floor(txtW(l) / 2), top + 2 + i * 6, MPAL.ink); });
}
function flag(g, x, base) {
  g.fillStyle = MPAL.ink; g.fillRect(x, base - 52, 1, 24);
  g.fillStyle = MPAL.cel; g.fillRect(x + 1, base - 52, 13, 3); g.fillRect(x + 1, base - 46, 13, 3);
  g.fillStyle = MPAL.wht; g.fillRect(x + 1, base - 49, 13, 3);
}
function makeCrowd(seedC) {
  var sd = seedC, r = function () { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  var W2 = 110, H2 = 64, base = H2 - 2, c = canvas(W2, H2), g = c.getContext('2d'), col = function () { return MPAL.body[Math.floor(r() * 4)]; };
  /* fila de atrás, más oscura y chica de alto */
  for (var x = 6; x < W2 - 4; x += 9 + Math.floor(r() * 6)) { g.fillStyle = '#2a1207'; g.fillRect(x, base - 26 - Math.floor(r() * 4), 7, 26); }
  if (r() < 0.45) {
    /* pancarta sostenida por dos personas */
    var t = BANNERS[Math.floor(r() * BANNERS.length)], bw = Math.min(W2 - 8, txtW(t) + 8), bx = Math.floor((W2 - bw) / 2);
    person(g, bx + 3, base, col(), r() < 0.4, 0); person(g, bx + bw - 4, base, col(), r() < 0.4, 0);
    for (var k = 0; k < 2; k++) { var px = bx + 20 + Math.floor(r() * (bw - 40)); person(g, px, base, col(), r() < 0.5, 0); }
    g.fillStyle = MPAL.ink; g.fillRect(bx - 1, base - 33, bw + 2, 11);
    g.fillStyle = r() < 0.5 ? MPAL.sign : MPAL.cel; g.fillRect(bx, base - 32, bw, 9);
    txt(g, t, bx + Math.floor((bw - txtW(t)) / 2), base - 30, MPAL.ink);
  } else {
    var n = 4 + Math.floor(r() * 3), step = Math.floor((W2 - 16) / (n - 1)), signs = 0;
    for (var i = 0; i < n; i++) {
      var hx = 8 + i * step + Math.floor(r() * 4), kind = r();
      if (kind < 0.45 && signs < 2) { person(g, hx, base, col(), r() < 0.4, 1); sign(g, hx + 5, base, SIGNS[Math.floor(r() * SIGNS.length)]); signs++; }
      else if (kind < 0.6) { person(g, hx, base, col(), r() < 0.4, 1); flag(g, hx + 5, base); }
      else { person(g, hx, base, col(), r() < 0.4, r() < 0.3 ? -1 : 0); }
    }
  }
  /* panfletos en el piso */
  g.fillStyle = MPAL.wht;
  for (var f = 0; f < 4; f++) { g.fillRect(Math.floor(r() * (W2 - 4)), base - Math.floor(r() * 2), 3, 1); }
  return c;
}
for (var ci = 0; ci < 12; ci++) { CROWDS.push(makeCrowd(ci * 7919 + 13)); }
/* pancartas de los obstáculos de agacharse (celestes) */
var DUCKS = ['EDUCACION|PUBLICA', 'LA UNI|SE DEFIENDE', 'NI UN PASO|ATRAS'].map(function (t) {
  var c = canvas(48, 20), g = c.getContext('2d'), L = t.split('|');
  g.fillStyle = '#74C6E8'; g.fillRect(0, 0, 48, 20);
  g.fillStyle = '#F6EFC4'; g.fillRect(0, 0, 48, 2); g.fillRect(0, 18, 48, 2);
  L.forEach(function (l, i) { txt(g, l, Math.floor((48 - txtW(l)) / 2), 4 + i * 7, '#14304a'); });
  return c;
});

/* ---------- Física (paso fijo) ---------- */
var G = 1700, JV = 455, JV2 = 760, STEP = 1 / 120, ROLL = 0.62, ACC = 0.0052, FLYY = 150;
var TOP = { truck: 86, stack: 96 };
function update(dt) {
  frameT += dt;
  if (shake > 0) { shake = Math.max(0, shake - dt); }
  if (st === 'over') { deadT += dt; return; }
  if (st !== 'play') { return; }
  playT += dt;
  speed = Math.min(880, 430 + dist * ACC);
  var dz = speed * dt; dist += dz;
  rowZ -= dz; decoZ -= dz;
  for (var i = obs.length - 1; i >= 0; i--) { obs[i].z -= dz; if (obs[i].z + obs[i].len < -D + 20) { obs.splice(i, 1); } }
  for (i = coins.length - 1; i >= 0; i--) { coins[i].z -= dz; if (coins[i].z < -60) { coins.splice(i, 1); } }
  for (i = decos.length - 1; i >= 0; i--) { decos[i].z -= dz; if (decos[i].z < -D + 30) { decos.splice(i, 1); } }
  fillWorld();
  for (i = pups.length - 1; i >= 0; i--) { pups[i].z -= dz; if (pups[i].z < -60) { pups.splice(i, 1); } }
  /* personaje */
  p.x += (p.lane * LW - p.x) * Math.min(1, dt * 16);
  p.nudge *= Math.max(0, 1 - dt * 10);
  ['mag', 'sj', 'inv'].forEach(function (k) { if (p[k] > 0) { p[k] = Math.max(0, p[k] - dt); } });
  if (p.fly > 0) {
    /* volando: sube al cielo y no choca; al terminar, cae con unos segundos de protección */
    p.fly = Math.max(0, p.fly - dt);
    p.y += (FLYY - p.y) * Math.min(1, dt * 3); p.vy = 0; p.roll = 0;
    if (p.fly === 0) { p.air = true; p.inv = 2; }
  } else {
    /* techo de camiones y pilas: se puede caer encima y correr arriba */
    var floor = 0;
    for (i = 0; i < obs.length; i++) {
      var q = obs[i];
      if (!HARD[q.t] || q.z > 10 || q.z + q.len < -10 || Math.abs(p.x - q.lane * LW) > 30) { continue; }
      if (p.y >= TOP[q.t] - 8) { floor = Math.max(floor, TOP[q.t]); }
    }
    if (!p.air && p.y > floor) { p.air = true; p.vy = 0; }
    if (p.air) {
      p.vy -= G * dt; p.y += p.vy * dt;
      if (p.y <= floor && p.vy <= 0) { p.y = floor; p.vy = 0; p.air = false; p.land = 0.07; }
    }
  }
  if (p.roll > 0 && !p.air) { p.roll -= dt; }
  if (p.land > 0) { p.land -= dt; }
  /* choques */
  if (!p.fly && !p.inv) {
    for (i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (o.z > 14 || o.z + o.len < -14) { continue; }
      var dx = Math.abs(p.x - o.lane * LW);
      if (HARD[o.t] && dx < 34 && p.y < TOP[o.t] - 8) { over(); return; }
      if (dx > 28) { continue; }
      if (o.t === 'low' && p.y < 30) { over(); return; }
      if (o.t === 'duck' && p.y < 66 && !(p.roll > 0 && p.y < 6)) { over(); return; }
    }
  }
  /* imán (megáfono): las fichas cercanas vienen solas */
  for (i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    if (c.x == null) { c.x = c.lane * LW; }
    if (p.mag > 0 && c.z < 330 && c.z > -20) {
      var k = Math.min(1, dt * 9);
      c.x += (p.x - c.x) * k; c.y += (p.y + 16 - c.y) * k; c.z += (0 - c.z) * k;
    }
    if (Math.abs(c.z) < 24 && Math.abs(p.x - c.x) < 28 && Math.abs(c.y - 16 - p.y) < 40) {
      coins.splice(i, 1); nCoins++; $('coins').textContent = nCoins;
      beep(880 + (nCoins % 5) * 60, 1320, 0.07, 'square', 0.03);
    }
  }
  for (i = pups.length - 1; i >= 0; i--) {
    var u = pups[i];
    if (Math.abs(u.z) < 24 && Math.abs(p.x - u.lane * LW) < 30 && Math.abs(u.y - 16 - p.y) < 40) { pups.splice(i, 1); power(u.k); }
  }
  $('score').textContent = Math.floor(dist / PXM);
}
function power(k) {
  beep(520, 1560, 0.25, 'triangle', 0.06); setTimeout(function () { beep(780, 2080, 0.2, 'triangle', 0.05); }, 90);
  if (k === 'mag') { p.mag = 10; }
  else if (k === 'jump') { p.sj = 15; }
  else {
    p.fly = 10; p.air = false; p.roll = 0;
    /* fichas en el cielo durante todo el vuelo, en zigzag entre carriles */
    var lane = p.lane, n = Math.floor(speed * 9.2 / 46);
    for (var i = 0; i < n; i++) {
      if (i > 6 && i % 9 === 0) { lane = Math.max(-1, Math.min(1, lane + (rnd() < 0.5 ? -1 : 1))); }
      coins.push({ lane: lane, z: 160 + i * 46, y: FLYY + 16, ph: i * 0.5 });
    }
  }
}
function move(dir) {
  if (st !== 'play') { return; }
  var nl = p.lane + dir;
  if (nl < -1 || nl > 1) { p.nudge = dir * 8; beep(200, 150, 0.05, 'square', 0.025); return; }
  if (!p.fly && !p.inv && obs.some(function (o) { return HARD[o.t] && o.lane === nl && o.z < 30 && o.z + o.len > -20 && p.y < TOP[o.t] - 8; })) {
    /* tropezón contra el costado: dos seguidos y se corta la toma */
    p.nudge = dir * 14; shake = 0.2; beep(180, 90, 0.15, 'sawtooth', 0.05);
    if (frameT - p.stumble < 4) { over(); } else { p.stumble = frameT; }
    return;
  }
  p.lane = nl; beep(520, 610, 0.04, 'triangle', 0.025);
}
function jump() {
  if (st !== 'play' || p.air || p.fly) { return; }
  p.air = true; p.vy = p.sj > 0 ? JV2 : JV; p.roll = 0; beep(420, 820, 0.09, 'square', 0.035);
}
function roll() {
  if (st !== 'play' || p.fly) { return; }
  p.roll = ROLL;
  if (p.air) { p.vy = Math.min(p.vy, -900); } /* en el aire: baja de golpe y rueda al tocar el piso */
  beep(300, 160, 0.07, 'square', 0.03);
}

/* ---------- Proyección ---------- */
function sx(x, d) { return W / 2 + (x - camX) * F / d; }
function sy(y, d) { return HOR + (CY - y) * F / d; }

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
var OUT = '#140803';
function shadow(lx, hw, d) {
  if (d < 30) { return; }
  var y = Math.round(sy(0, d)), x0 = Math.round(sx(lx - hw - 4, d)), x1 = Math.round(sx(lx + hw + 4, d)), h = Math.max(1, Math.round(5 * F / d));
  ctx.fillStyle = 'rgba(15,5,2,.55)'; ctx.fillRect(x0, y - Math.floor(h / 2), x1 - x0, h);
}
function poly(pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (var i = 2; i < pts.length; i += 2) { ctx.lineTo(pts[i], pts[i + 1]); }
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
}
/* caja en 3D: frente, costado visible y techo, con contorno oscuro */
function cuboid(xc, hw, yT, z0, z1, c) {
  var x0 = xc - hw, x1 = xc + hw, d0 = Math.max(30, z0 + D), d1 = Math.min(DMAX + 400, z1 + D);
  if (d1 <= d0) { return false; }
  if (x1 < camX) { poly([sx(x1, d0), sy(0, d0), sx(x1, d0), sy(yT, d0), sx(x1, d1), sy(yT, d1), sx(x1, d1), sy(0, d1)], c.s); }
  if (x0 > camX) { poly([sx(x0, d0), sy(0, d0), sx(x0, d0), sy(yT, d0), sx(x0, d1), sy(yT, d1), sx(x0, d1), sy(0, d1)], c.s); }
  if (CY > yT) { poly([sx(x0, d0), sy(yT, d0), sx(x1, d0), sy(yT, d0), sx(x1, d1), sy(yT, d1), sx(x0, d1), sy(yT, d1)], c.t); }
  if (z0 + D < 30) { return false; }
  box3(x0 - 1 * D / d0, x1 + 1 * D / d0, -1 * D / d0, yT + 1 * D / d0, d0, OUT);
  box3(x0, x1, 0, yT, d0, c.f);
  return true;
}
function drawObs(o) {
  var d = o.z + D, lx = o.lane * LW, k;
  if (o.t === 'truck') {
    /* camión de sonido: blanco con franja fucsia (se esquiva) */
    if (cuboid(lx, 24, 86, o.z, o.z + o.len, { f: '#F6EFC4', s: '#d6cca3', t: '#fff8dc' })) {
      box3(lx - 20, lx + 20, 52, 78, d, '#1a0e08');
      box3(lx - 24, lx + 24, 30, 38, d, '#E0457B');
      box3(lx - 21, lx - 13, 12, 20, d, '#F4C95C'); box3(lx + 13, lx + 21, 12, 20, d, '#F4C95C');
      spr(A.logo, lx, 56, d, 0.55);
    }
    return;
  }
  if (d < 28) { return; }
  if (o.t === 'low') {
    shadow(lx, 22, d);
    if (o.v) {
      /* caja amarilla (se salta) */
      if (cuboid(lx, 22, 32, o.z, o.z + o.len, { f: '#FFD23F', s: '#c99a22', t: '#FFE88C' })) {
        box3(lx - 22, lx + 22, 24, 27, d, '#1a0e08'); box3(lx - 4, lx + 4, 12, 18, d, '#1a0e08');
      }
    } else {
      /* valla rayada amarilla y negra (se salta) */
      box3(lx - 24, lx + 24, 15, 33, d, OUT);
      box3(lx - 23, lx - 19, 0, 32, d, '#1a0e08'); box3(lx + 19, lx + 23, 0, 32, d, '#1a0e08');
      for (k = 0; k < 6; k++) { box3(lx - 23 + k * 7.67, lx - 23 + (k + 1) * 7.67, 16, 32, d, k % 2 ? '#1a0e08' : '#FFD23F'); }
    }
  } else if (o.t === 'duck') {
    /* pancarta celeste en alto (se pasa rodando) */
    shadow(lx, 25, d);
    box3(lx - 26, lx - 22, 0, 66, d, '#1a0e08'); box3(lx + 22, lx + 26, 0, 66, d, '#1a0e08');
    box3(lx - 26, lx + 26, 41, 66, d, OUT);
    var sc = F / d, X = Math.round(sx(lx - 24, d)), Y = Math.round(sy(65, d)), w = Math.round(48 * sc), h = Math.round(22 * sc);
    if (w > 0 && h > 0) { ctx.drawImage(DUCKS[o.v ? 1 : (o.lane + 2) % 3 === 0 ? 2 : 0], X, Y, w, h); }
  } else if (o.t === 'stack') {
    /* pila de bafles blancos con franjas fucsia (se esquiva) */
    shadow(lx, 23, d);
    if (cuboid(lx, 23, 96, o.z, o.z + o.len, { f: '#F6EFC4', s: '#d6cca3', t: '#fff8dc' })) {
      for (k = 0; k < 3; k++) {
        box3(lx - 23, lx + 23, k * 32 + 28, k * 32 + 32, d, '#E0457B');
        box3(lx - 9, lx + 9, k * 32 + 7, k * 32 + 23, d, '#1a0e08');
        box3(lx - 5, lx + 5, k * 32 + 11, k * 32 + 19, d, '#5a4a3a');
      }
    }
  }
}
function drawDeco(o) {
  var d = o.z + D;
  if (d < 40) { return; }
  var sc = F / d;
  if (o.k === 'crowd') {
    var c = CROWDS[o.i], w = c.width * 2 * sc, h = c.height * 2 * sc;
    if (w < 2) { return; }
    var X = o.side < 0 ? sx(o.x, d) - w : sx(o.x, d);
    ctx.drawImage(c, Math.round(X), Math.round(sy(0, d) - h), Math.round(w), Math.round(h));
  } else if (o.k === 'flyer') {
    var fw = Math.max(1, Math.round(6 * sc * Math.abs(Math.cos(frameT * 3 + o.ph)))), fh = Math.max(1, Math.round(4 * sc));
    ctx.fillStyle = MPAL.wht; ctx.fillRect(Math.round(sx(o.x, d)), Math.round(sy(o.y + Math.sin(frameT * 2 + o.ph) * 6, d)), fw, fh);
  } else if (o.k === 'logo') {
    box3(o.x - 2, o.x + 2, 0, 70, d, '#2a1207');
    box3(o.x - 38, o.x + 38, 62, 98, d, '#4d2410');
    spr(A.logo, o.x, 66, d, 1.05);
  }
}
/* Poderes: megáfono (imán), zapatillas (súper salto) y avión de papel (vuelo). Íconos de 14×14 en una ficha redonda. */
var PUPS = {
  mag: { ring: '#E0457B', px: ['..............', '..........##..', '........####..', '......######..', '##..########..', '##.#########..', '##.#########..', '##..########..', '......######..', '.......#.###..', '......##..##..', '..............', '..............', '..............'], c: '#F4C95C' },
  jump: { ring: '#5BD08A', px: ['..............', '..............', '....####......', '...######.....', '...#######....', '..##########..', '.############.', '.############.', '..............', '...#.#.#.#....', '..#.#.#.#.....', '...#.#.#.#....', '..............', '..............'], c: '#F6EFC4' },
  fly: { ring: '#74C6E8', px: ['..............', '............#.', '..........###.', '........#####.', '......######..', '....#######...', '..########....', '#########.....', '....#####.....', '.....####.....', '......##......', '......#.......', '..............', '..............'], c: '#ffffff' }
};
Object.keys(PUPS).forEach(function (k) {
  var P = PUPS[k], c = canvas(22, 22), g = c.getContext('2d');
  g.fillStyle = '#140803'; g.beginPath(); g.arc(11, 11, 11, 0, 7); g.fill();
  g.fillStyle = P.ring; g.beginPath(); g.arc(11, 11, 10, 0, 7); g.fill();
  g.fillStyle = '#3a1606'; g.beginPath(); g.arc(11, 11, 8, 0, 7); g.fill();
  g.fillStyle = P.c;
  P.px.forEach(function (row, y) { for (var x = 0; x < row.length; x++) { if (row[x] === '#') { g.fillRect(4 + x, 4 + y, 1, 1); } } });
  P.img = c;
});
function drawPup(u) {
  var d = u.z + D; if (d < 30) { return; }
  var sc = F / d, pulse = 1 + Math.sin(frameT * 6) * 0.08, w = 22 * 1.5 * sc * pulse, y = u.y + 4 + Math.sin(frameT * 3) * 4;
  var X = sx(u.lane * LW, d) - w / 2, Y = sy(y, d) - w;
  ctx.fillStyle = 'rgba(255,240,180,' + (0.25 + Math.sin(frameT * 8) * 0.1) + ')';
  ctx.fillRect(Math.round(X - w * 0.15), Math.round(Y - w * 0.15), Math.round(w * 1.3), Math.round(w * 1.3));
  ctx.drawImage(PUPS[u.k].img, Math.round(X), Math.round(Y), Math.round(w), Math.round(w));
}
function drawHud() {
  var y = 4, list = [['mag', p.mag, 10], ['jump', p.sj, 15], ['fly', p.fly, 10]];
  list.forEach(function (it) {
    if (it[1] <= 0) { return; }
    ctx.drawImage(PUPS[it[0]].img, 4, y, 16, 16);
    ctx.fillStyle = 'rgba(20,8,3,.6)'; ctx.fillRect(23, y + 5, 42, 6);
    ctx.fillStyle = PUPS[it[0]].ring; ctx.fillRect(24, y + 6, Math.round(40 * it[1] / it[2]), 4);
    y += 19;
  });
}
function drawCoin(c) {
  var d = c.z + D; if (d < 30) { return; }
  var y = c.y + Math.sin(frameT * 4 + c.ph) * 3, s = Math.abs(Math.cos(frameT * 3 + c.ph));
  spr(A.n26, c.x == null ? c.lane * LW : c.x, y, d, 0.72, 0.5, Math.max(0.15, s));
}
function drawPlayer() {
  var fr, flip = false, lean = p.lane * LW - p.x;
  if (st === 'play') {
    if (p.roll > 0 && !p.air) { fr = 12 + Math.floor(frameT * 10) % 2; }
    else if (p.fly > 0) { fr = 10; }
    else if (p.air) { fr = p.vy > 170 ? 9 : (p.vy > -170 ? 10 : 11); }
    else if (p.land > 0) { fr = 8; }
    else if (Math.abs(lean) > 7) { fr = 14; flip = lean > 0; }
    else { fr = Math.floor(frameT * (12 + speed / 70)) % 8; }
  } else { fr = st === 'over' ? 11 : 0; }
  if (st === 'play' && p.inv > 0 && Math.floor(frameT * 14) % 2) { return; }
  var x = Math.round(sx(p.x + p.nudge, D)), gy = Math.round(sy(0, D)), y = Math.round(sy(p.y, D)) - CH + 1;
  ctx.fillStyle = 'rgba(30,10,4,.35)';
  var sw = Math.max(12, 30 - p.y * 0.15); ctx.fillRect(x - sw / 2, gy - 2, sw, 4);
  if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(chr, fr * CW, pal * CH, CW, CH, -CX, y, CW, CH); ctx.restore(); }
  else { ctx.drawImage(chr, fr * CW, pal * CH, CW, CH, x - CX, y, CW, CH); }
}
function draw() {
  if (!img.complete || !chr.complete || !p) { return; }
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
  var y0 = Math.ceil(HOR + CY * F / DMAX);
  for (var yy = y0; yy < H + 4; yy++) {
    var d = CY * F / (yy + 0.5 - HOR), zz = dist + d - D, sc = F / d;
    var b1 = Math.floor(zz / 46) & 1, b2 = Math.floor(zz / 90) & 1;
    ctx.fillStyle = b2 ? '#7a3a1c' : '#713519'; ctx.fillRect(-4, yy, W + 8, 1);
    var e0 = sx(-1.5 * LW - 7, d), e1 = sx(1.5 * LW + 7, d);
    ctx.fillStyle = '#b98a3e'; ctx.fillRect(Math.round(e0), yy, Math.round(e1 - e0), 1);
    var t0 = sx(-1.5 * LW, d), t1 = sx(1.5 * LW, d);
    ctx.fillStyle = b1 ? '#401a0a' : '#47200d'; ctx.fillRect(Math.round(t0), yy, Math.round(t1 - t0), 1);
    if ((Math.floor(zz / 60) & 1) === 0) {
      var lw = Math.max(1, Math.round(3 * sc));
      ctx.fillStyle = '#a78f6a';
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
    if (HARD[o.t] && o.z < 6 && o.z + o.len > -6) { key = D + 1; }
    L.push([key, 0, o]);
  });
  coins.forEach(function (c) { L.push([c.z + D, 1, c]); });
  pups.forEach(function (u) { L.push([u.z + D, 4, u]); });
  decos.forEach(function (c) { L.push([c.z + D, 2, c]); });
  L.push([D - 0.5, 3, null]);
  L.sort(function (a, b) { return b[0] - a[0]; });
  for (i = 0; i < L.length; i++) {
    var it = L[i];
    if (!fogDrawn && it[0] < DMAX * 0.62) { ctx.fillStyle = gr; ctx.fillRect(-4, HOR, W + 8, y0 + 26 - HOR); fogDrawn = true; }
    if (it[0] > DMAX + 200) { continue; }
    if (it[1] === 0) { drawObs(it[2]); } else if (it[1] === 1) { drawCoin(it[2]); } else if (it[1] === 2) { drawDeco(it[2]); } else if (it[1] === 4) { drawPup(it[2]); } else { drawPlayer(); }
  }
  if (!fogDrawn) { ctx.fillStyle = gr; ctx.fillRect(-4, HOR, W + 8, y0 + 26 - HOR); }
  ctx.restore();
  if (st === 'play' || st === 'pause') { drawHud(); }
  if (st === 'over') { ctx.fillStyle = 'rgba(58,22,6,' + Math.min(0.35, deadT) + ')'; ctx.fillRect(0, 0, W, H); }
}

/* ---------- Bucle ---------- */
var last = 0, acc = 0;
function loop(ts) {
  var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  /* la cámara sigue al personaje a medias, para que se vea el carril de al lado */
  if (p) {
    camX += (p.x * 0.6 - camX) * Math.min(1, dt * 8);
    /* la cámara sube cuando el personaje vuela o corre arriba de los camiones */
    var want = (p.fly > 0 || p.y > 70) ? p.y * 0.75 : 0;
    lift += (want - lift) * Math.min(1, dt * 3);
  }
  CY = CAMY + lift;
  draw(); requestAnimationFrame(loop);
}

/* ---------- Controles: flechas / WASD y deslizar el dedo ---------- */
function pause() { if (st === 'play') { st = 'pause'; show('pause'); } }
function resume() { if (st === 'pause') { st = 'play'; hide('pause'); last = performance.now(); acc = 0; } }
document.addEventListener('keydown', function (e) {
  if (e.target && e.target.tagName === 'INPUT') { return; }
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
if (window.FAARank) { FAARank.mount('carriles'); }
setMute(muted); setPal(pal); $('best').textContent = best;
reset();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
var started = false;
function ready() { if (started || !img.complete || !chr.complete) { return; } started = true; resize(); requestAnimationFrame(loop); }
img.onload = ready; chr.onload = ready; ready();
})();
