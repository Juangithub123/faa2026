/* ¡Corre, sonidista! · modo clásico (de costado). Canvas 2D, sin dependencias.
   Misma estética que el modo carriles (paletas, marcha estudiantil, código de colores) y plataformas para subir. */
(function () {
'use strict';
var ART = window.FAAArte;
/* Personaje: side.png, 16 cuadros de 62×70 por fila, una fila por paleta (Arrayán, Chilco, Campanilla).
   0-7 carrera · 8 impulso · 9 subida · 10 punto alto · 11 caída · 12-13 agachado · 14 golpe · 15 quieto */
var CW = 62, CH = 70, FEET = 68;           /* fila de los pies dentro del cuadro */
/* Cajas de choque del cuerpo, más chicas que el dibujo (a favor del jugador): [x1, x2, alto desde los pies] */
var HB = { run: [24, 45, 52], duck: [20, 50, 21] };
var PX = 34;                                /* posición del personaje en pantalla */
var W = 300, H = 480, GROUND = 400, S = 1;  /* unidades de mundo; S = escala a píxeles reales */
var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
var chr = new Image(); chr.src = 'side.png';
var K = { best: 'faa26-juego-best', pal: 'faa26-juego-pal', mute: 'faa26-juego-mute' };
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function $(id) { return document.getElementById(id); }
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

var best = lsGet(K.best, 0), pal = lsGet(K.pal, 0), muted = lsGet(K.mute, false), takes = 0;
var st = 'menu', p, obs, plats, coins, flyers, nCoins = 0, dist = 0, speed = 0, nextX = 0, seed = 1, playT = 0;
var upHeld = false, downHeld = false, frameT = 0, deadT = 0, shake = 0, mountains = [];

/* ---------- Velocidad: arranca lenta para poder anticipar ---------- */
var V0 = 92, VMAX = 235, ACC = 0.0095;      /* px/s; ACC por px recorrido */
function speedAt(wx) { return Math.min(VMAX, V0 + Math.max(0, wx) * ACC); }
/* Salto: flotante, con más altura si se mantiene apretado */
/* Salto corto con un toque; cuanto más se mantiene ↑ (hasta 0,32 s), más alto. */
var G = 1200, JV = 320, HOLDG = 0.3, HOLD = 0.32, CUT = 0.45, STEP = 1 / 120;
var TIER = 54, T1 = 58, T2 = 112;          /* alturas de las plataformas: 58, 112, 166, 220… */
var GRACE = 8;                              /* margen de gracia en px recorridos */

/* ---------- Tamaño ---------- */
function resize() {
  var r = cv.parentElement.getBoundingClientRect(), land = r.width > r.height * 1.15;
  if (land) { H = 230; W = Math.round(H * r.width / Math.max(r.height, 1)); }
  else { W = Math.round(Math.max(250, Math.min(380, r.width / 1.25))); H = Math.round(W * r.height / Math.max(r.width, 1)); }
  GROUND = H - Math.max(26, Math.round(H * (land ? 0.11 : 0.15)));
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); S = cv.height / H;
  draw();
}
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
(function () { var s = 7, n = 64, raw = [], i; for (i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; raw.push((s >>> 16) / 65536); } for (i = 0; i < n; i++) { mountains.push((raw[i] * 2 + raw[(i + 1) % n] + raw[(i + n - 1) % n]) / 4); } })();
/* cuántos pisos de andamio entran en pantalla (en vertical, varios: así se usa toda la altura) */
function maxTier() { return Math.max(1, Math.min(6, Math.floor((GROUND - 150 - 4) / TIER) + 1)); }

/* ---------- Sonido mínimo ---------- */
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
  p = { h: 0, vy: 0, air: false, duck: false, hold: 0, land: 0, coyote: 0, buf: 0, drop: 0, grace: 0, fast: false };
  obs = []; plats = []; coins = []; flyers = []; nCoins = 0; dist = 0; speed = V0; playT = 0; deadT = 0; shake = 0;
  seed = (Date.now() & 0xffff) || 1; nextX = 520; section = null; lastAir = -1;
  $('coins').textContent = '0'; $('score').textContent = '0';
  fill();
}
function start() { reset(); st = 'play'; takes++; hide('start'); hide('over'); beep(330, 660, 0.12, 'triangle', 0.05); }
function over() {
  st = 'over'; deadT = 0; shake = 0.3; beep(220, 55, 0.4, 'sawtooth', 0.07);
  if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
  var m = Math.floor(dist / 10), rec = m > best;
  if (rec) { best = m; lsSet(K.best, best); }
  $('final').textContent = m; $('take').textContent = takes; $('best').textContent = best;
  $('rec').textContent = (nCoins ? nCoins + ' fichas · ' : '') + (rec ? '¡nuevo récord en este teléfono!' : 'récord ' + best + ' m');
  if (window.FAARank) { FAARank.over({ score: m, coins: nCoins, secs: playT }); }
  setTimeout(function () { show('over'); }, 450);
}

/* ---------- Generación procedural, por tramos ----------
   Código de colores: amarillo = se salta · celeste = se pasa agachado · blanco = superficie (te podés subir).
   Cada tramo deja después un espacio proporcional a la velocidad, para tener tiempo de anticipar. */
var BANNERS = ['EDUCACIÓN|PÚBLICA', 'LA UNI|SE DEFIENDE', 'NI UN PASO|ATRÁS', 'PRESUPUESTO|YA'].map(function (t) { return ART.banner(t, 58, 26); });
function wpick(list) { var tot = 0, i; for (i = 0; i < list.length; i++) { tot += list[i][1]; } var r = rnd() * tot; for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) { return list[i][0]; } } return list[0][0]; }
function coinLine(x0, h, n, step) { for (var i = 0; i < n; i++) { coins.push({ x: x0 + i * step, h: h }); } }
/* trayectoria de un salto manteniendo ↑ "hold" segundos: sirve para poner fichas donde el salto pasa */
function jumpPath(hold) {
  var y = 0, vy = JV, t = 0, h = 0, cut = false, out = [], dt = 1 / 60;
  while (t < 2) {
    var up = t < hold, g = vy < 0 ? G * 1.25 : G;
    if (up && vy > 0 && h < HOLD) { g = G * HOLDG; h += dt; }
    if (!up && !cut && vy > 60 && t >= 0.06) { vy *= CUT; cut = true; }
    vy -= g * dt; y += vy * dt; t += dt;
    if (y <= 0) { break; }
    out.push([t, y]);
  }
  return out;
}
var PATH = jumpPath(0.3), PATH_T = PATH.length ? PATH[PATH.length - 1][0] : 0.7;
function apexT() { var m = 0, tt = 0; PATH.forEach(function (q) { if (q[1] > m) { m = q[1]; tt = q[0]; } }); return tt; }
var TAPEX = apexT();
function coinArc(cx, v, base) {
  /* fichas sobre un obstáculo, siguiendo el salto largo con la cima justo encima */
  [-0.2, -0.1, 0, 0.1, 0.2].forEach(function (d) {
    var t = TAPEX + d, q = PATH[Math.max(0, Math.min(PATH.length - 1, Math.round(t * 60) - 1))];
    coins.push({ x: cx + v * d - 7, h: (base || 0) + q[1] - 8 });
  });
}
function coinGapArc(x0, h0, x1, h1) {
  /* fichas en arco entre dos andamios: marcan el salto */
  var top = Math.max(h0, h1) + 34;
  for (var i = 1; i <= 3; i++) { var f = i / 4, h = (1 - f) * h0 + f * h1 + (top - Math.max(h0, h1)) * 4 * f * (1 - f) + 6; coins.push({ x: x0 + (x1 - x0) * f - 7, h: h }); }
}
function coinDiamond(cx, h) { [[0, 0], [-14, 13], [14, 13], [0, 26]].forEach(function (d) { coins.push({ x: cx + d[0] - 7, h: h + d[1] }); }); }
function valla(x) { obs.push({ t: 'valla', x: x, w: 24, y0: 0, y1: 26 }); return x + 24; }
function caja(x) { obs.push({ t: 'caja', x: x, w: 22, y0: 0, y1: 24 }); return x + 22; }
function amarillo(x) { return rnd() < 0.5 ? valla(x) : caja(x); }
function cartel(x) { obs.push({ t: 'cartel', x: x, w: 58, y0: 34, y1: 60, b: Math.floor(rnd() * BANNERS.length) }); return x + 58; }
function bafle(x, h) { obs.push({ t: 'bafle', x: x, w: 34, y0: 0, y1: h }); return x + 34; }
function bafleStairs(x, v) {
  /* escalera de bafles estirada: tres escalones separados (32, 60, 88), cada uno alcanzable desde el piso por si
     te caés en un hueco; huecos más anchos cuanto más rápido vas, con una ficha en el aire marcando cada salto */
  var hs = [32, 60, 88], gap = Math.max(36, Math.min(66, v * 0.3)), px = x, e = x;
  hs.forEach(function (h, i) {
    e = bafle(px, h); coinLine(px + (i === hs.length - 1 ? 3 : 10), h + 12, i === hs.length - 1 ? 2 : 1, 14);
    if (i < hs.length - 1) { coinLine(e + gap / 2 - 7, h + 30, 1, 0); }
    px = e + gap;
  });
  return e;
}
function plat(x, w, y, hang) { var o = { x: x, w: w, y: y, hang: !!hang }; plats.push(o); return o; }

/* ---------- Diseño de nivel ----------
   El recorrido alterna tramos de SUELO (patrones con sentido: ritmo de saltos, agacharse y saltar, elegir ir por
   arriba o por abajo) y ETAPAS AÉREAS de andamios colgantes con muchas fichas. Los elementos aparecen de a poco. */
var section = null, lastAir = -1;
function newSection(x) {
  /* la primera etapa aérea llega a los ~110 m; después, una cada ~250 m (si entra en pantalla) */
  var m = x / 10;
  if (section && section.type === 'suelo' && m > 110 && maxTier() >= 2 && (lastAir < 0 || m - lastAir > 250)) {
    lastAir = m; return { type: 'aire', n: 0, max: 8 + Math.floor(rnd() * 6) };
  }
  return { type: 'suelo', n: 0, max: 4 + Math.floor(rnd() * 4) };
}
function groundPattern(x, v, m) {
  var list = [['salto', 4], ['andamioBajo', 3]];
  if (m > 40) { list.push(['pancarta', 3], ['ritmo', 2]); }
  if (m > 70) { list.push(['escalon', 2], ['agachaSalta', 2]); }
  if (m > 100) { list.push(['arribaOAbajo', 3], ['escalera', 2]); }
  var k = wpick(list), e = x, a, b, i;
  if (k === 'salto') {
    /* un obstáculo amarillo y las fichas marcan el salto largo */
    a = x; e = amarillo(x); if (rnd() < 0.7) { coinArc((a + e) / 2, v); }
  } else if (k === 'ritmo') {
    /* dos o tres saltos seguidos con el mismo ritmo; fichas a ras del piso entre medio */
    var n = 2 + (m > 160 && rnd() < 0.5 ? 1 : 0), sp = Math.max(80, v * 1.05);
    for (i = 0; i < n; i++) { a = e + (i ? sp : 0); e = amarillo(a); if (i < n - 1) { coinLine(e + sp * 0.35, 2, 2, 16); } }
  } else if (k === 'pancarta') {
    /* pancarta celeste: fichas debajo, para pasar agachado */
    a = x; e = cartel(x); coinLine(a + 8, 3, 3, 18);
  } else if (k === 'agachaSalta') {
    /* agacharse y enseguida saltar */
    e = cartel(x); coinLine(x + 8, 3, 3, 18);
    a = e + Math.max(70, v * 0.9); e = amarillo(a); coinArc(a + 12, v);
  } else if (k === 'andamioBajo') {
    /* un andamio bajo con fichas: subir es opcional */
    var w = Math.max(110, v * 1.2 + rnd() * 50), p1 = plat(x, w, T1);
    coinLine(x + 14, T1 + 10, Math.floor((w - 28) / 22), 22); e = x + w;
  } else if (k === 'escalon') {
    /* escalera de bafles separados: se sube de a uno, arriba hay fichas, después se cae con fichas en la bajada */
    e = bafleStairs(x, v);
    coinLine(e + 18, 70, 1, 0); coinLine(e + 38, 40, 1, 0);
  } else if (k === 'arribaOAbajo') {
    /* andamio largo arriba (con fichas) y vallas abajo: elegís el camino */
    var L = Math.max(220, v * 2.6), pa = plat(x, L, T1);
    var nv = 2, gap = L / (nv + 1);
    for (i = 1; i <= nv; i++) { amarillo(x + gap * i - 12); }
    coinLine(x + 16, T1 + 10, Math.floor((L - 32) / 20), 20); e = x + L;
  } else if (k === 'escalera') {
    /* escalera de andamios: cada piso un poco más adelante; arriba, un rombo de fichas */
    var mt = Math.min(maxTier(), 4), y = T1, px = x, top = null;
    for (i = 0; i < mt; i++) { var pw = 90 + rnd() * 40; top = plat(px, pw, y); if (i) { coinLine(px + 10, y + 10, 2, 20); } e = Math.max(e, px + pw); px += pw * 0.55; y += TIER; }
    coinDiamond(top.x + top.w / 2, top.y + 30);
  }
  return e;
}
function airStage(x, v) {
  /* etapa aérea: andamios colgantes a distintas alturas, unidos por saltos marcados con fichas */
  var mt = maxTier(), e = x, lvl = 1, y, prev = null, i;
  /* entrada: escalera de bafles para subir */
  e = bafleStairs(x, v);
  prev = plat(e + Math.max(16, v * 0.22), 110, T2, true); lvl = 2; e = prev.x + prev.w;
  coinLine(prev.x + 12, prev.y + 10, 4, 22);
  for (i = 0; i < section.max; i++) {
    var dl = wpick([[1, lvl < mt ? 3 : 0], [0, 2], [-1, lvl > 2 ? 2 : 0]]);
    lvl += dl; y = T1 + (lvl - 1) * TIER;
    var gap = dl > 0 ? v * (0.18 + rnd() * 0.2) : (dl === 0 ? v * (0.25 + rnd() * 0.25) : v * (0.3 + rnd() * 0.3));
    gap = Math.max(16, gap);
    var w = 80 + rnd() * 70, nx = prev.x + prev.w + gap, pl = plat(nx, w, y, true);
    coinGapArc(prev.x + prev.w, prev.y, nx, y);
    var r = rnd();
    if (r < 0.45) { coinLine(nx + 10, y + 10, Math.floor((w - 20) / 20), 20); }
    else if (r < 0.75) { coinDiamond(nx + w / 2, y + 30); }
    else { coinLine(nx + 10, y + 10, 2, 20); coinDiamond(nx + w * 0.7, y + 30); }
    /* abajo, en el suelo, algo de qué ocuparse si te caés (pero espaciado) */
    if (rnd() < 0.35) { amarillo(nx + w * 0.3); }
    prev = pl; e = nx + w;
  }
  /* salida: fichas en la caída */
  coinLine(e + 10, Math.max(20, prev.y - 30), 1, 0); coinLine(e + 26, Math.max(10, prev.y - 70), 1, 0);
  return e + 20;
}
function chunk() {
  var x = nextX, m = x / 10, v = speedAt(x), e;
  if (!section || section.n >= section.max) { section = newSection(x); }
  if (section.type === 'aire') { e = airStage(x, v); section.n = section.max; }
  else { e = groundPattern(x, v, m); section.n++; }
  if (rnd() < 0.3) { flyers.push({ x: x + rnd() * 120, h: 90 + rnd() * Math.max(10, GROUND - 160), ph: rnd() * 6 }); }
  nextX = e + Math.max(110, v * (0.9 + rnd() * 0.6) + 24);
}
function fill() { while (nextX < dist + W + 260) { chunk(); } }

/* ---------- Física ---------- */
function feetX() { return [dist + PX + 24, dist + PX + 44]; }
function overlapX(a, b, x0, x1) { return a < x1 && b > x0; }
function supports() {
  /* superficies donde se puede pisar: andamios (se atraviesan desde abajo) y la tapa de los bafles */
  var f = feetX(), list = [];
  if (p.drop <= 0) { plats.forEach(function (s) { if (overlapX(f[0], f[1], s.x, s.x + s.w)) { list.push(s.y); } }); }
  obs.forEach(function (o) { if (o.t === 'bafle' && overlapX(f[0], f[1], o.x, o.x + o.w)) { list.push(o.y1); } });
  return list;
}
function update(dt) {
  frameT += dt;
  if (shake > 0) { shake = Math.max(0, shake - dt); }
  if (st === 'over') { deadT += dt; return; }
  if (st !== 'play') { return; }
  playT += dt;
  speed = speedAt(dist + PX);
  var dx = speed * dt; dist += dx;
  fill();
  var cut = dist - 60;
  obs = obs.filter(function (o) { return o.x + o.w > cut; });
  plats = plats.filter(function (s) { return s.x + s.w > cut; });
  coins = coins.filter(function (c) { return c.x + 16 > cut; });
  flyers = flyers.filter(function (f) { return f.x > cut - 40; });
  /* personaje */
  ['land', 'coyote', 'buf', 'drop'].forEach(function (k) { if (p[k] > 0) { p[k] -= dt; } });
  var prevH = p.h, sup = supports();
  if (!p.air) {
    /* ¿sigue apoyado? si no, empieza a caer (con unos instantes para todavía poder saltar) */
    var onIt = p.h <= 0.01 || sup.some(function (y) { return Math.abs(y - p.h) < 0.6; });
    if (!onIt) { p.air = true; p.vy = 0; p.coyote = 0.1; }
  }
  if (p.air) {
    var g = p.vy < 0 ? G * 1.25 : G;
    p.t += dt;
    if (upHeld && p.vy > 0 && p.hold < HOLD) { g = G * HOLDG; p.hold += dt; }
    /* soltó ↑ mientras sube: frena la subida (salto corto) */
    if (!upHeld && !p.cut && p.vy > 60 && p.t >= 0.06) { p.vy *= CUT; p.cut = true; }
    if (p.fast) { g = G * 3; }
    p.vy -= g * dt; p.h += p.vy * dt;
    if (p.vy <= 0) {
      var land = -1;
      sup.forEach(function (y) { if (prevH >= y - 0.5 && p.h <= y && y > land) { land = y; } });
      if (p.h <= 0 && land < 0) { land = 0; }
      if (land >= 0) {
        p.h = land; p.vy = 0; p.air = false; p.land = 0.07; p.fast = false;
        if (p.buf > 0) { p.buf = 0; jump(); }
      }
    }
  }
  p.duck = downHeld && !p.air;
  /* choques con margen de gracia (en distancia): se puede salvar justo, pero no atravesar */
  var hb = p.duck ? HB.duck : HB.run, x1 = dist + PX + hb[0], x2 = dist + PX + hb[1], y1 = p.h + 2, y2 = p.h + hb[2], hit = false;
  obs.forEach(function (o) {
    if (!overlapX(x1, x2, o.x + 2, o.x + o.w - 2)) { return; }
    if (o.t === 'cartel') { if (y2 > o.y0 + 2) { hit = true; } return; }
    if (o.t === 'bafle') { if (p.h < o.y1 - 6 && y2 > 2) { hit = true; } return; }
    if (y1 < o.y1 - 3) { hit = true; }
  });
  if (hit) { p.grace += dx; if (p.grace > GRACE) { over(); return; } } else { p.grace = 0; }
  /* fichas */
  for (var i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    if (overlapX(x1 - 4, x2 + 4, c.x, c.x + 16) && y1 - 4 < c.h + 14 && y2 + 4 > c.h) {
      coins.splice(i, 1); nCoins++; $('coins').textContent = nCoins; beep(880 + (nCoins % 5) * 60, 1320, 0.07, 'square', 0.03);
    }
  }
  $('score').textContent = Math.floor(dist / 10);
}
function jump() {
  if (st !== 'play') { return; }
  if (p.air && p.coyote <= 0) { if (p.vy < 0) { p.buf = 0.16; } return; }
  p.air = true; p.vy = JV; p.hold = 0; p.t = 0; p.cut = false; p.coyote = 0; p.fast = false; beep(420, 820, 0.09, 'square', 0.035);
}
function down() {
  if (st !== 'play') { return; }
  if (p.air) { p.fast = true; return; }
  /* parado sobre un andamio: se baja atravesándolo */
  var onPlat = p.h > 0.5 && plats.some(function (s) { var f = feetX(); return overlapX(f[0], f[1], s.x, s.x + s.w) && Math.abs(s.y - p.h) < 0.6; });
  if (onPlat) { p.drop = 0.25; p.air = true; p.vy = -40; return; }
  beep(300, 160, 0.06, 'square', 0.03);
}

/* ---------- Dibujo ---------- */
var OUT = '#140803';
function sx(wx) { return wx - dist; }
function gy(h) { return GROUND - h; }
function box(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
function framed(x, y, w, h, col) { box(x - 0.8, y - 0.8, w + 1.6, h + 1.6, OUT); box(x, y, w, h, col); }
function drawObs(o) {
  var x = sx(o.x), k;
  if (x > W + 20 || x + o.w < -20) { return; }
  if (o.t === 'valla') {
    box(x + 2, gy(26), 3, 26, '#1a0e08'); box(x + o.w - 5, gy(26), 3, 26, '#1a0e08');
    framed(x, gy(26), o.w, 12, '#FFD23F');
    for (k = 0; k < 4; k++) { if (k % 2) { box(x + k * o.w / 4, gy(26), o.w / 4, 12, '#1a0e08'); } }
  } else if (o.t === 'caja') {
    framed(x, gy(24), o.w, 24, '#FFD23F');
    box(x, gy(24), o.w, 4, '#FFE88C'); box(x, gy(17), o.w, 2.5, '#1a0e08'); box(x + o.w / 2 - 3, gy(12), 6, 5, '#1a0e08');
  } else if (o.t === 'bafle') {
    framed(x, gy(o.y1), o.w, o.y1, '#F6EFC4');
    for (k = 0; k < o.y1 / 44; k++) {
      var b = k * 44;
      box(x, gy(b + 44), o.w, 3, '#E0457B');
      ctx.fillStyle = '#1a0e08'; ctx.beginPath(); ctx.arc(x + o.w / 2, gy(b + 20), 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(x + o.w / 2, gy(b + 20), 5, 0, 7); ctx.fill();
    }
  } else if (o.t === 'cartel') {
    ctx.strokeStyle = '#1a0e08'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 4, -2); ctx.lineTo(x + 4, gy(o.y1)); ctx.moveTo(x + o.w - 4, -2); ctx.lineTo(x + o.w - 4, gy(o.y1)); ctx.stroke();
    box(x - 0.8, gy(o.y1) - 0.8, o.w + 1.6, o.y1 - o.y0 + 1.6, OUT);
    ctx.drawImage(BANNERS[o.b], x, gy(o.y1), o.w, o.y1 - o.y0);
  }
}
function drawPlat(s) {
  var x = sx(s.x);
  if (x > W + 20 || x + s.w < -20) { return; }
  if (s.hang) {
    /* andamio colgante: cuelga con cables desde arriba */
    ctx.strokeStyle = 'rgba(26,14,8,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 5, -2); ctx.lineTo(x + 5, gy(s.y)); ctx.moveTo(x + s.w - 5, -2); ctx.lineTo(x + s.w - 5, gy(s.y)); ctx.stroke();
    framed(x, gy(s.y), s.w, 6, '#F6EFC4'); box(x, gy(s.y) + 4, s.w, 2, '#E0457B');
    return;
  }
  /* andamio: patas y diagonales finas (no se chocan), tablón crema arriba */
  ctx.strokeStyle = 'rgba(26,14,8,.75)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (var px = x + 6; px < x + s.w; px += 46) { ctx.moveTo(px, gy(s.y)); ctx.lineTo(px, GROUND); }
  ctx.moveTo(x + s.w - 6, gy(s.y)); ctx.lineTo(x + s.w - 6, GROUND);
  ctx.stroke();
  ctx.lineWidth = 0.9; ctx.beginPath();
  for (px = x + 6; px + 46 <= x + s.w; px += 46) { ctx.moveTo(px, gy(s.y) + 4); ctx.lineTo(px + 46, GROUND); }
  ctx.stroke();
  framed(x, gy(s.y), s.w, 6, '#F6EFC4');
  box(x, gy(s.y) + 4, s.w, 2, '#E0457B');
}
function drawCoin(c) {
  var x = sx(c.x); if (x < -20 || x > W + 20 || !ART.N26.complete) { return; }
  var sp = Math.abs(Math.cos(frameT * 3 + c.x * 0.05)), w = 16 * Math.max(0.2, sp), bob = Math.sin(frameT * 4 + c.x * 0.1) * 1.5;
  ctx.drawImage(ART.N26, x + (16 - w) / 2, gy(c.h + 14) + bob, w, 14);
}
function drawPlayer() {
  var fr;
  if (st === 'play') {
    if (p.duck) { fr = 12 + Math.floor(frameT * 8) % 2; }
    else if (p.air) { fr = p.vy > 140 ? 9 : (p.vy > -140 ? 10 : 11); }
    else if (p.land > 0) { fr = 8; }
    else { fr = Math.floor(frameT * (9 + speed / 22)) % 8; }
  } else { fr = st === 'over' ? 14 : 15; }
  var px = function (v) { return Math.round(v * S) / S; };
  var y = px(gy(p.h) - FEET);
  ctx.fillStyle = 'rgba(20,8,3,.3)';
  var sh = supports().filter(function (h) { return h <= p.h + 0.6; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
  ctx.beginPath(); ctx.ellipse(PX + 34, gy(sh) + 1, Math.max(6, 13 - (p.h - sh) * 0.06), 2.2, 0, 0, 7); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(chr, fr * CW, pal * CH, CW, CH, px(PX), y, CW, CH);
  ctx.imageSmoothingEnabled = true;
}
function draw() {
  if (!chr.complete || !p) { return; }
  ctx.setTransform(S, 0, 0, S, 0, 0); ctx.imageSmoothingEnabled = true;
  var m = dist / 10, TH = ART.themeAt(m), sky = TH.sky, x;
  var ox = shake > 0 ? (Math.random() - 0.5) * 5 * shake / 0.3 : 0;
  ctx.save(); ctx.translate(ox, 0);
  /* cielo */
  var sg = ctx.createLinearGradient(0, 0, 0, GROUND);
  sg.addColorStop(0, ART.rgb(sky[0])); sg.addColorStop(0.6, ART.rgb(sky[1])); sg.addColorStop(1, ART.rgb(sky[2]));
  ctx.fillStyle = sg; ctx.fillRect(-6, -6, W + 12, GROUND + 7);
  /* cordillera lejana */
  var far = dist * 0.1;
  ctx.fillStyle = ART.rgb(TH.mt); ctx.beginPath(); ctx.moveTo(-6, GROUND);
  for (x = -6; x <= W + 6; x += 3) {
    var u = (x + far) / 12, i0 = Math.floor(u), fr = u - i0;
    var h0 = mountains[((i0 % 64) + 64) % 64], h1 = mountains[(((i0 + 1) % 64) + 64) % 64];
    ctx.lineTo(x, GROUND - 40 - (h0 + (h1 - h0) * fr) * Math.min(230, GROUND * 0.45));
  }
  ctx.lineTo(W + 6, GROUND); ctx.closePath(); ctx.fill();
  /* la marcha (capa media, más lenta que el suelo, apagada para que no distraiga) */
  var mid = dist * 0.4, cw = 130, k0 = Math.floor(mid / cw) - 1;
  ctx.globalAlpha = 0.92;
  for (var k = k0; k < k0 + Math.ceil(W / cw) + 3; k++) {
    var hsh = ((k * 2654435761) >>> 0) % 97;
    if (hsh < 18) { continue; }
    var cr = ART.CROWDS[hsh % ART.CROWDS.length], sc = 0.95, cx = k * cw - mid + (hsh % 30);
    ctx.drawImage(cr, cx, GROUND + 2 - cr.uh * sc, cr.uw * sc, cr.uh * sc);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = ART.rgb(sky[2], 0.22); ctx.fillRect(-6, GROUND - 75, W + 12, 75);
  /* panfletos volando */
  flyers.forEach(function (f) { var fx = sx(f.x); ctx.fillStyle = ART.MPAL.wht; ctx.fillRect(fx, gy(f.h + Math.sin(frameT * 2 + f.ph) * 6), 6 * Math.abs(Math.cos(frameT * 3 + f.ph)), 4); });
  /* suelo */
  box(-6, GROUND, W + 12, H - GROUND + 8, ART.rgb(TH.trA));
  box(-6, GROUND, W + 12, 3, ART.rgb(TH.edge));
  ctx.fillStyle = ART.rgb(TH.dash); var go = dist % 26;
  for (x = -go; x < W + 26; x += 26) { ctx.fillRect(x, GROUND + 9, 12, 2); }
  ctx.fillStyle = ART.rgb(TH.trB); go = dist % 38;
  for (x = -go; x < W + 38; x += 38) { ctx.fillRect(x + 8, GROUND + 18, 5, 2); ctx.fillRect(x + 24, GROUND + 26, 4, 2); }
  /* mundo */
  plats.forEach(drawPlat);
  obs.forEach(drawObs);
  coins.forEach(drawCoin);
  drawPlayer();
  ctx.restore();
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
function downOn() { downHeld = true; down(); }
function downOff() { downHeld = false; }
document.addEventListener('keydown', function (e) {
  if (e.target && e.target.tagName === 'INPUT') { return; }
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
/* tocar el juego = saltar (mantener = más alto); deslizar hacia abajo = agacharse o bajar del andamio */
var ty0 = null;
cv.addEventListener('pointerdown', function (e) { ty0 = e.clientY; upOn(); });
cv.addEventListener('pointermove', function (e) { if (ty0 != null && e.clientY - ty0 > 14) { upOff(); downOn(); ty0 = -9999; } });
['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { ty0 = null; upOff(); downOff(); }); });

/* ---------- Menús ---------- */
function setPal(i) { pal = i; lsSet(K.pal, i); document.querySelectorAll('.pick').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-p') === i)); }); }
document.querySelectorAll('.pick').forEach(function (b) { b.addEventListener('click', function () { setPal(+b.getAttribute('data-p')); beep(500, 700, 0.05, 'triangle', 0.04); }); });
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);
$('change').addEventListener('click', function () { st = 'menu'; hide('over'); show('start'); });
function setMute(v) { muted = v; lsSet(K.mute, v); $('mute').textContent = v ? '♪̸' : '♪'; $('mute').setAttribute('aria-pressed', String(!v)); }
$('mute').addEventListener('click', function () { setMute(!muted); });
if (window.FAARank) { FAARank.mount('clasico'); }
setMute(muted); setPal(pal); $('best').textContent = best;
reset();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
var started = false;
function ready() { if (started || !chr.complete) { return; } started = true; resize(); requestAnimationFrame(loop); }
chr.onload = ready; ART.N26.onload = function () { draw(); }; ready();
})();
