/* Medallas y niveles de los juegos del FAA! 2026.
   Todo se guarda en el teléfono (funciona sin señal). Si el juego tiene ranking, además se sincroniza con la planilla
   (ese módulo completa FAALogros.server). Cada juego tiene su catálogo; los puntos y el nivel son de todos los juegos juntos. */
(function () {
'use strict';
var KEY = 'faa26-logros', KCLAVE = 'faa26-clave', KRAR = 'faa26-rar', KESC = 'faa26-esc', KNICK = 'faa26-nick';
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmt(n) { try { return Number(n).toLocaleString('es-AR'); } catch (e) { return String(n); } }
function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

/* ---------- Niveles, colores y escenarios ---------- */
var TIER = ['Bronce', 'Plata', 'Oro', 'Platino', 'Leyenda'];
var TPTS = [10, 25, 50, 100, 250];
var TCOL = ['#C77B3C', '#8FBABA', '#F4C95C', '#F6EFC4', '#E0457B'];
var SECRET_COL = '#A90EE0';
var LEVELS = [[0, 'Meritorio'], [50, 'Asistente'], [150, 'Microfonista'], [300, 'Plomo'], [550, 'Operador de sala'],
  [900, 'Sonidista'], [1400, 'Jefe de sonido'], [2200, 'Director de sonido'], [3500, 'Leyenda del sonido'], [5500, 'Leyenda del FAA!']];
/* escenarios del cielo: se desbloquean subiendo de nivel. f = cuadros (los animados vienen en una tira horizontal) */
var ESC = [
  { id: 'marcha', n: 'La marcha', lv: 1 },
  { id: 'esferas', n: 'Esferas', lv: 2, src: 'esferas.webp', k: 0.5 },
  { id: 'franjas', n: 'Franjas', lv: 3, src: 'franjas.webp' },
  { id: 'cine', n: 'Cine', lv: 4, src: 'cine.webp', k: 0.5 },
  { id: 'liquido', n: 'Líquido', lv: 5, src: 'liquido.webp' },
  { id: 'ventanas', n: 'Ventanas', lv: 6, src: 'ventanas.webp', f: 21 },
  { id: 'faa', n: 'FAA!', lv: 7, src: 'faa.webp' }
];

/* ---------- Catálogos ----------
   Medalla con niveles: t = umbrales (bronce → leyenda), v = valor a comparar.
   Medalla única: p = puntos, ok = condición. s: secreta (no se ve hasta conseguirla). end: se revisa solo al terminar la toma.
   c(k): acumulado de todas las tomas (incluida la que está en curso). */
var G = {
  carriles: { pre: 'c', groups: [
    { g: 'Distancia', i: 'm', list: [
      { id: 'dist', n: 'Distancia', d: 'Llegá a {x} m en una sola toma.', t: [500, 1000, 2000, 3000, 4000], u: 'm', v: function (R) { return R.dist; } },
      { id: 'dist2', n: 'Gran distancia', d: 'Llegá a {x} m en una sola toma.', t: [5000, 6500, 8000, 10000, 15000], u: 'm', v: function (R) { return R.dist; } },
      { id: 'd20', n: 'Más allá', d: 'Llegá a 20.000 m en una sola toma.', p: 300, ok: function (R) { return R.dist >= 20000; } },
      { id: 'dtot', n: 'Kilómetros', d: 'Sumá {x} entre todas tus tomas.', t: [10000, 25000, 50000, 100000, 250000], u: 'km', v: function (R, c) { return c('dist'); } }
    ] },
    { g: 'Paisajes', i: '▲', list: [
      { id: 'pa1', n: 'Arrayán', d: 'Llegá al paisaje Arrayán (1000 m).', p: 15, ok: function (R) { return R.dist >= 1000; } },
      { id: 'pa2', n: 'Chilco', d: 'Llegá al paisaje Chilco (2000 m).', p: 25, ok: function (R) { return R.dist >= 2000; } },
      { id: 'pa3', n: 'Campanilla invertida', d: 'Llegá a la Campanilla invertida (3000 m).', p: 40, ok: function (R) { return R.dist >= 3000; } },
      { id: 'pa4', n: 'Arrayán invertido', d: 'Llegá al Arrayán invertido (4000 m).', p: 60, ok: function (R) { return R.dist >= 4000; } },
      { id: 'pa5', n: 'Chilco invertido', d: 'Llegá al Chilco invertido (5000 m), a toda velocidad.', p: 80, ok: function (R) { return R.dist >= 5000; } },
      { id: 'pa6', n: 'Vuelta completa', d: 'Pasá por los seis paisajes y volvé a empezar (6000 m).', p: 100, ok: function (R) { return R.dist >= 6000; } }
    ] },
    { g: 'Fichas', i: '26', list: [
      { id: 'fich', n: 'Fichas en una toma', d: 'Juntá {x} fichas en una sola toma.', t: [150, 400, 800, 1500, 3000], v: function (R) { return R.coins; } },
      { id: 'lluvia', n: 'Lluvia de fichas', d: 'Juntá 4000 fichas en una sola toma.', p: 200, ok: function (R) { return R.coins >= 4000; } },
      { id: 'ftot', n: 'Alcancía', d: 'Juntá {x} fichas entre todas tus tomas.', t: [1000, 5000, 15000, 40000, 100000], v: function (R, c) { return c('coins'); } },
      { id: 'iman', n: 'Megáfono a fondo', d: 'Juntá 40 fichas con un solo megáfono.', p: 40, ok: function (R) { return R.magMax >= 40; } },
      { id: 'vuelo', n: 'Vuelo perfecto', d: 'Agarrá todas las fichas del cielo en un vuelo.', p: 50, ok: function (R) { return R.flyAll > 0; } },
      { id: 'sinf1', n: 'Bolsillos vacíos', d: 'Llegá a 1000 m sin agarrar ninguna ficha.', p: 60, ok: function (R) { return R.dist >= 1000 && R.coins === 0; } },
      { id: 'sinf2', n: 'Desinteresadx', d: 'Llegá a 2000 m sin agarrar ninguna ficha.', p: 150, ok: function (R) { return R.dist >= 2000 && R.coins === 0; } }
    ] },
    { g: 'Movimientos', i: '↑', list: [
      { id: 'salt', n: 'Saltos', d: 'Hacé {x} saltos entre todas tus tomas.', t: [100, 500, 2000, 5000, 15000], v: function (R, c) { return c('jumps'); } },
      { id: 'rod', n: 'Rodadas', d: 'Rodá {x} veces entre todas tus tomas.', t: [50, 250, 1000, 3000, 8000], v: function (R, c) { return c('rolls'); } },
      { id: 'carr', n: 'Cambios de carril', d: 'Cambiá de carril {x} veces entre todas tus tomas.', t: [200, 1000, 4000, 10000, 30000], v: function (R, c) { return c('lanes'); } },
      { id: 'techo', n: 'Por los techos', d: 'Corré {x} sobre camiones y pilas, sumando todas tus tomas.', t: [200, 1000, 3000, 8000, 20000], u: 'm', v: function (R, c) { return c('roof'); } },
      { id: 'tech5', n: 'Sin tocar el piso', d: 'Recorré 500 m seguidos por arriba, sin bajar al piso.', p: 80, ok: function (R) { return R.roofMax >= 500; } },
      { id: 'cami', n: 'De techo en techo', d: 'Caé sobre 3 camiones seguidos sin tocar el piso.', p: 60, ok: function (R) { return R.chainMax >= 3; } },
      { id: 'antic', n: 'Reflejos', d: 'Encadená 20 saltos anticipados (↑ justo antes de caer) en una toma.', p: 30, ok: function (R) { return R.buf >= 20; } },
      { id: 'zig', n: 'Zigzag', d: 'Cambiá de carril 30 veces en 10 segundos.', p: 30, ok: function (R) { return R.zig > 0; } },
      { id: 'fiel', n: 'Fiel al carril', d: 'Recorré 400 m sin cambiar de carril.', p: 40, ok: function (R) { return R.holdMax >= 400; } },
      { id: 'pies', n: 'Pies en la tierra', d: 'Recorré 800 m sin saltar.', p: 40, ok: function (R) { return R.noJumpMax >= 800; } }
    ] },
    { g: 'Al límite', i: '!', list: [
      { id: 'pelo', n: 'Por un pelo', d: 'Salvate {x} veces justo cuando ya estabas chocando (todas tus tomas).', t: [10, 50, 200, 500, 1500], v: function (R, c) { return c('saves'); } },
      { id: 'pelo1', n: 'Siete vidas', d: 'Salvate por un pelo {x} veces en una sola toma.', t: [3, 10, 25, 50, 100], v: function (R) { return R.saves; } },
      { id: 'obst', n: 'Obstáculos', d: 'Dejá atrás {x} obstáculos entre todas tus tomas.', t: [500, 2500, 10000, 30000, 80000], v: function (R, c) { return c('passed'); } },
      { id: 'limp1', n: 'Toma limpia', d: 'Llegá a 1000 m sin tropezar ni salvarte por un pelo.', p: 50, ok: function (R) { return R.dist >= 1000 && !R.saves && !R.stumbles; } },
      { id: 'limp3', n: 'Toma impecable', d: 'Llegá a 3000 m sin tropezar ni salvarte por un pelo.', p: 150, ok: function (R) { return R.dist >= 3000 && !R.saves && !R.stumbles; } },
      { id: 'trop', n: 'Me levanto', d: 'Tropezá contra un costado y seguí 500 m más.', p: 20, ok: function (R) { return R.stOk > 0; } }
    ] },
    { g: 'Poderes', i: '✦', list: [
      { id: 'pod', n: 'Poderes', d: 'Agarrá {x} poderes entre todas tus tomas.', t: [10, 50, 150, 400, 1000], v: function (R, c) { return c('pups'); } },
      { id: 'tres', n: 'Combo completo', d: 'Agarrá los tres poderes distintos en menos de 500 m.', p: 40, ok: function (R) { return R.tri > 0; } },
      { id: 'sinp1', n: 'A pulmón', d: 'Llegá a 1000 m sin agarrar ningún poder.', p: 30, ok: function (R) { return R.dist >= 1000 && R.pups === 0; } },
      { id: 'sinp3', n: 'A puro pulmón', d: 'Llegá a 3000 m sin agarrar ningún poder.', p: 90, ok: function (R) { return R.dist >= 3000 && R.pups === 0; } },
      { id: 'sinp5', n: 'Sin ayuda', d: 'Llegá a 5000 m sin agarrar ningún poder.', p: 200, ok: function (R) { return R.dist >= 5000 && R.pups === 0; } }
    ] },
    { g: 'Constancia', i: '▶', list: [
      { id: 'tomas', n: 'Tomas', d: 'Jugá {x} tomas.', t: [10, 25, 50, 100, 250], v: function (R, c) { return c('runs'); } },
      { id: 'recs', n: 'Superación', d: 'Superá tu propio récord {x} veces.', t: [3, 10, 25, 50, 100], v: function (R, c) { return c('recs'); } },
      { id: 'tiempo', n: 'Horas de rodaje', d: 'Jugá {x} en total.', t: [600, 1800, 3600, 10800, 21600], u: 'min', v: function (R, c) { return c('secs'); } },
      { id: 'dias', n: 'Todos los días', d: 'Jugá {x} días distintos.', t: [2, 3, 4, 5, 7], v: function (R, c, T) { return (T.days || []).length; } },
      { id: 'segu', n: 'En racha', d: 'Hacé 3 tomas seguidas de más de 2000 m.', p: 80, ok: function (R, c, T) { return (T.streak || 0) >= 3; } },
      { id: 'mara', n: 'Maratón', d: 'Jugá 20 tomas en un mismo día.', p: 40, ok: function (R, c, T) { return ((T.dayRuns || {})[today()] || 0) >= 20; } }
    ] },
    { g: 'Secretas', i: '?', list: [
      { id: 'chau', s: 1, end: 1, n: 'Corte rápido', d: 'Chocá antes de los 10 m.', p: 10, ok: function (R) { return R.dist < 10; } },
      { id: 'cien', s: 1, end: 1, n: 'Redondo', d: 'Terminá una toma justo en 100 m.', p: 30, ok: function (R) { return R.dist === 100; } },
      { id: 'anio', s: 1, end: 1, n: 'Edición 2026', d: 'Terminá una toma justo en 2026 m.', p: 60, ok: function (R) { return R.dist === 2026; } },
      { id: 'pausa', s: 1, n: 'Corte para el mate', d: 'Quedate 30 segundos en pausa.', p: 10, ok: function (R) { return R.pauseMax >= 30; } },
      { id: 'noche', s: 1, end: 1, n: 'Trasnoche', d: 'Jugá entre las 3 y las 6 de la mañana.', p: 20, ok: function () { var h = new Date().getHours(); return h >= 3 && h < 6; } },
      { id: 'vest', s: 1, end: 1, n: 'Cambio de vestuario', d: 'Jugá con los tres vestuarios.', p: 20, ok: function (R, c, T) { return (T.pals || []).length >= 3; } }
    ] }
  ] }
};
/* acumulados que se suman al terminar cada toma */
var SUM = ['dist', 'coins', 'jumps', 'rolls', 'lanes', 'roof', 'saves', 'passed', 'pups', 'runs', 'recs', 'secs'];

/* ---------- Estado ---------- */
var S = lsGet(KEY, null);
if (!S || S.v !== 1) { S = { v: 1, g: {} }; }
var game = '', CAT = null, opt = {}, rar = lsGet(KRAR, null), toastQ = [], toastBusy = false, live = [];
function gs(g) { g = g || game; if (!S.g[g]) { S.g[g] = { got: {}, at: {}, T: {} }; } return S.g[g]; }
function save() { lsSet(KEY, S); }
function all(g) { var out = []; (G[g || game] || { groups: [] }).groups.forEach(function (gr) { gr.list.forEach(function (m) { m.grp = gr; out.push(m); }); }); return out; }
function code(g, m) { return G[g].pre + '.' + m.id; }
function ptsOf(m, tier) { if (!tier) { return 0; } if (m.t) { var s = 0; for (var i = 0; i < tier; i++) { s += TPTS[i]; } return s; } return m.p; }
function points() {
  var tot = 0;
  Object.keys(G).forEach(function (g) { var st = S.g[g]; if (!st) { return; } all(g).forEach(function (m) { tot += ptsOf(m, st.got[m.id] || 0); }); });
  return tot;
}
function level(p) { var i = 0; while (i + 1 < LEVELS.length && p >= LEVELS[i + 1][0]) { i++; } return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: i + 1 < LEVELS.length ? LEVELS[i + 1][0] : null }; }
function counts() {
  var have = 0, total = 0, st = gs();
  all().forEach(function (m) { var k = m.t ? m.t.length : 1; total += k; have += Math.min(k, st.got[m.id] || 0); });
  return { have: have, total: total };
}
function clave() {
  var c = lsGet(KCLAVE, '');
  if (!c) {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint8Array(8);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 8; i++) { a[i] = Math.floor(Math.random() * 256); } }
    c = ''; for (var j = 0; j < 8; j++) { c += abc[a[j] % abc.length]; }
    lsSet(KCLAVE, c);
  }
  return c;
}
function nick() { try { return localStorage.getItem(KNICK) || ''; } catch (e) { return ''; } }
function unit(m, x) {
  if (m.u === 'km') { return fmt(x / 1000) + ' km'; }
  if (m.u === 'min') { return x >= 3600 ? fmt(x / 3600) + (x === 3600 ? ' hora' : ' horas') : fmt(x / 60) + ' minutos'; }
  if (m.u === 'm') { return fmt(x) + ' m'; }
  return fmt(x);
}
function desc(m, tier) { return m.t ? m.d.replace('{x}', unit(m, m.t[Math.min(tier, m.t.length - 1)])).replace(/(\d) m m/, '$1 m') : m.d; }
function col(m, tier) { if (m.s) { return SECRET_COL; } if (m.t) { return TCOL[Math.max(0, tier - 1)]; } return TCOL[m.p >= 200 ? 4 : m.p >= 100 ? 3 : m.p >= 50 ? 2 : m.p >= 30 ? 1 : 0]; }

/* ---------- Revisión ---------- */
function test(R, live, only) {
  var st = gs(), T = st.T, got = [];
  var c = function (k) { return (T[k] || 0) + (live ? (R[k] || 0) : 0); };
  all().forEach(function (m) {
    if (live && m.end) { return; }
    if (only && only.indexOf(m.id) < 0) { return; }
    var have = st.got[m.id] || 0;
    if (m.t) {
      var v = m.v(R, c, T), k = have;
      while (k < m.t.length && v >= m.t[k]) { k++; }
      if (k > have) { st.got[m.id] = k; st.at[m.id] = Date.now(); got.push({ m: m, tier: k, pts: ptsOf(m, k) - ptsOf(m, have) }); }
    } else if (!have && m.ok(R, c, T)) {
      st.got[m.id] = 1; st.at[m.id] = Date.now(); got.push({ m: m, tier: 1, pts: m.p });
    }
  });
  if (got.length) { save(); }
  return got;
}
function label(x) { return x.m.t ? x.m.n + ' · ' + TIER[x.tier - 1] : x.m.n; }

/* ---------- Interfaz ---------- */
function css() {
  var s = document.createElement('style');
  s.textContent =
    '.lg-b{--c:#C77B3C;flex:none;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;position:relative;color:#F6EFC4;font:900 15px/1 system-ui;' +
    'background:radial-gradient(circle at 34% 30%,#d9813b,#9a3d14 55%,#6a2408);border:4px solid var(--c);box-shadow:0 0 0 2px #2a1207,inset 0 -3px 0 rgba(0,0,0,.25)}' +
    '.lg-b i{position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);display:flex;gap:2px}.lg-b i u{width:6px;height:6px;border-radius:50%;background:#2a1207;border:1px solid var(--c)}.lg-b i u.on{background:var(--c)}' +
    '.lg-b.off{filter:grayscale(1) brightness(.55);opacity:.7}.lg-b.sec{background:radial-gradient(circle at 34% 30%,#c447f0,#6a0a90 60%,#3a0550)}' +
    '.lg-open{display:flex;align-items:center;justify-content:center;gap:8px;border:2px solid #F4C95C;border-radius:999px;background:rgba(244,201,92,.12);color:#F6EFC4;padding:7px 12px;font:800 14px system-ui}' +
    '.lg-open img{width:26px;height:26px}.lg-open b{color:#F4C95C}' +
    '.lg-esc{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.lg-esc button{width:40px;height:40px;border-radius:10px;border:2px solid rgba(246,239,196,.35);background:#3a1606 center/cover;position:relative;padding:0;color:#F6EFC4;font:900 10px system-ui}' +
    '.lg-esc button[aria-pressed="true"]{border-color:#F4C95C;box-shadow:0 0 0 2px #F4C95C}.lg-esc button.lock{filter:grayscale(1) brightness(.5)}.lg-esc button span{position:absolute;inset:auto 0 -1px;font-size:9px;background:rgba(20,8,3,.75);border-radius:0 0 8px 8px}' +
    '.lg-cap{font:800 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8FBABA}' +
    '#lg-ov .box{max-width:560px;text-align:left;gap:12px;max-height:100%;overflow:auto}#lg-ov h1{text-align:center}' +
    '.lg-lv{display:flex;gap:12px;align-items:center;background:rgba(246,239,196,.08);border-radius:14px;padding:10px}.lg-lv img{width:62px;height:62px}' +
    '.lg-lv b{display:block;font:900 18px system-ui;color:#F4C95C}.lg-bar{height:8px;border-radius:9px;background:rgba(20,8,3,.55);overflow:hidden;margin-top:5px}.lg-bar u{display:block;height:100%;background:#F4C95C;border-radius:9px}' +
    '.lg-how{background:rgba(246,239,196,.07);border-radius:12px;padding:8px 10px;font:600 13px/1.4 system-ui}.lg-how summary{cursor:pointer;font-weight:800;color:#F4C95C}.lg-how p{margin:6px 0 0}' +
    '.lg-g h2{font:900 13px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#F4C95C;margin:4px 0 6px}' +
    '.lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}' +
    '.lg-m{display:flex;gap:10px;align-items:flex-start;background:rgba(246,239,196,.07);border-radius:12px;padding:8px 9px 10px}.lg-m div{min-width:0;flex:1}' +
    '.lg-m b{display:block;font:800 14px/1.2 system-ui}.lg-m small{display:block;font:600 12px/1.3 system-ui;opacity:.85}.lg-m em{display:block;font:700 11px system-ui;font-style:normal;color:#8FBABA;margin-top:3px}' +
    '.lg-m .lg-bar{height:5px}.lg-m .lg-bar u{background:var(--c)}' +
    '.lg-sync{display:grid;gap:7px;background:rgba(116,198,232,.1);border:1px solid rgba(116,198,232,.5);border-radius:12px;padding:10px;font:600 13px/1.35 system-ui}' +
    '.lg-sync code{font:800 16px ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#F4C95C;-webkit-user-select:text;user-select:text}' +
    '.lg-sync input{border:2px solid #8FBABA;border-radius:999px;background:#3a1606;color:#F6EFC4;padding:7px 11px;font:700 14px system-ui;min-width:0;flex:1;-webkit-user-select:text;user-select:text}' +
    '.lg-sync .row{display:flex;gap:6px}.lg-sync button{border:0;border-radius:999px;background:#8FBABA;color:#3a1606;font:900 13px system-ui;padding:7px 12px}' +
    '.lg-toast{position:absolute;left:50%;top:10px;transform:translate(-50%,-140%);transition:transform .35s cubic-bezier(.2,1.4,.4,1);display:flex;gap:9px;align-items:center;' +
    'background:#6B2A0E;border:2px solid #F4C95C;border-radius:999px;padding:5px 14px 5px 6px;color:#F6EFC4;font:800 13px/1.2 system-ui;pointer-events:none;z-index:5;max-width:92%;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
    '.lg-toast.on{transform:translate(-50%,0)}.lg-toast .lg-b{width:34px;height:34px;font-size:11px;border-width:3px}.lg-toast small{display:block;font:700 11px system-ui;color:#F4C95C}' +
    '.lg-new{display:grid;gap:6px;background:rgba(244,201,92,.1);border:1px solid rgba(244,201,92,.5);border-radius:12px;padding:8px 10px;text-align:left}' +
    '.lg-new p{font:800 13px system-ui;color:#F4C95C;text-align:center;margin:0}.lg-new ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px;justify-content:center}' +
    '.lg-new li{display:flex;gap:6px;align-items:center;font:700 12px system-ui}.lg-new .lg-b{width:30px;height:30px;font-size:10px;border-width:3px}';
  document.head.appendChild(s);
}
function badge(m, tier, small) {
  var on = tier > 0, n = m.t ? m.t.length : 0, pips = '';
  if (n && !small) { pips = '<i>'; for (var k = 0; k < n; k++) { pips += '<u' + (k < tier ? ' class="on"' : '') + '></u>'; } pips += '</i>'; }
  var txt = m.s && !on ? '?' : m.grp.i;
  return '<span class="lg-b' + (on ? '' : ' off') + (m.s ? ' sec' : '') + '" style="--c:' + col(m, Math.max(1, tier)) + '">' + esc(txt) + pips + '</span>';
}
function toast(x) { toastQ.push(x); if (!toastBusy) { nextToast(); } }
function nextToast() {
  var el = $('lg-toast'), x = toastQ.shift();
  if (!el || !x) { toastBusy = false; return; }
  toastBusy = true;
  el.innerHTML = x.info ? '<span>' + esc(x.info) + '</span>' : badge(x.m, x.tier, true) + '<span>' + esc(label(x)) + '<small>¡Medalla nueva! +' + x.pts + ' puntos</small></span>';
  el.classList.add('on');
  if (opt.onUnlock && !x.info) { try { opt.onUnlock(x); } catch (e) {} }
  setTimeout(function () { el.classList.remove('on'); setTimeout(nextToast, 380); }, 2300);
}
function rarText(m, tier) {
  if (!rar || !rar.jug) { return ''; }
  var n = (rar.r || {})[code(game, m) + ':' + Math.max(1, tier)] || 0, pc = n / rar.jug * 100;
  if (!n) { return 'Nadie la tiene todavía'; }
  return 'La tiene el ' + (pc < 1 ? 'menos del 1' : Math.round(pc)) + ' % de lxs jugadores';
}
function escUnlocked(e) { return level(points()).n >= e.lv; }
function curEsc() { var id = lsGet(KESC, 'marcha'), e = ESC.filter(function (x) { return x.id === id; })[0]; return e && escUnlocked(e) ? e : ESC[0]; }
var imgs = {};
function escImg(e) {
  if (!e.src) { return null; }
  if (!imgs[e.id]) { var im = new Image(); im.src = (opt.base || '') + e.src; imgs[e.id] = im; }
  return imgs[e.id];
}
function renderStart() {
  var el = $('lg-start'); if (!el) { return; }
  var c = counts(), L = level(points()), cur = curEsc();
  el.innerHTML = '<span class="lg-cap">Escenario</span><div class="lg-esc">' + ESC.map(function (e) {
    var ok = escUnlocked(e), bg = e.src ? 'background-image:url(' + (opt.base || '') + e.src + ')' + (e.f ? ';background-size:' + (e.f * 100) + '% 100%;background-position:0 0' : '') : 'background:linear-gradient(#F2F0CD,#9EA85C 55%,#52561E)';
    return '<button type="button" data-e="' + e.id + '" aria-pressed="' + (e.id === cur.id) + '"' + (ok ? '' : ' class="lock"') + ' style="' + bg + '" title="' + esc(e.n + (ok ? '' : ' · se desbloquea en el nivel ' + e.lv)) + '">' + (ok ? '' : '<span>Nv ' + e.lv + '</span>') + '</button>';
  }).join('') + '</div><button type="button" class="lg-open" id="lg-open"><img src="' + (opt.base || '') + 'sello-faa.webp" alt="">Medallas <b>' + c.have + '/' + c.total + '</b> · Nivel <b>' + L.n + '</b></button>';
  el.querySelectorAll('.lg-esc button').forEach(function (b) {
    b.addEventListener('click', function () {
      var e = ESC.filter(function (x) { return x.id === b.getAttribute('data-e'); })[0];
      if (!escUnlocked(e)) { b.title = 'Se desbloquea en el nivel ' + e.lv; toast({ info: 'El escenario ' + e.n + ' se desbloquea en el nivel ' + e.lv + '.' }); return; }
      lsSet(KESC, e.id); escImg(e); renderStart();
    });
  });
  $('lg-open').addEventListener('click', openList);
}
function openList() {
  var ov = $('lg-ov'); if (!ov) { return; }
  var st = gs(), P = points(), L = level(P), c = counts();
  var pc = L.to ? Math.round((P - L.from) / (L.to - L.from) * 100) : 100;
  var h = '<h1>Medallas</h1><div class="lg-lv"><img src="' + (opt.base || '') + 'sello-faa.webp" alt=""><div style="flex:1"><b>Nivel ' + L.n + ' · ' + esc(L.name) + '</b>' +
    fmt(P) + ' puntos · ' + c.have + ' de ' + c.total + ' medallas' + (L.to ? '<div class="lg-bar"><u style="width:' + pc + '%"></u></div><small style="opacity:.8">Faltan ' + fmt(L.to - P) + ' puntos para el nivel ' + (L.n + 1) + '</small>' : '') + '</div></div>';
  var nextEsc = ESC.filter(function (e) { return !escUnlocked(e); })[0];
  if (nextEsc) { h += '<p style="font-size:12.5px;opacity:.85;margin:0">En el nivel ' + nextEsc.lv + ' se desbloquea el escenario <b>' + esc(nextEsc.n) + '</b>.</p>'; }
  h += '<details class="lg-how"><summary>¿Cómo funciona?</summary><p>Todo lo que hacés en el juego suma: metros, fichas, saltos, rodadas, salvadas por un pelo, poderes. ' +
    'Muchas medallas tienen cinco niveles (bronce, plata, oro, platino y leyenda) y algunas son secretas.</p><p>Cada medalla da puntos; con los puntos subís de nivel y se desbloquean escenarios nuevos para el cielo (los elegís en el menú del juego). ' +
    'Las medallas se guardan en este teléfono' + (API.server ? '; si anotás una toma en el ranking con tu apodo, también suman en el ranking de coleccionistas. ' +
    'Guardá tu código de 8 letras: con tu apodo y ese código pasás las medallas a otro teléfono, y nadie más puede juntar medallas con tu apodo.' : '.') + '</p></details>';
  h += syncHtml();
  (G[game] || { groups: [] }).groups.forEach(function (gr) {
    h += '<div class="lg-g"><h2>' + esc(gr.g) + '</h2><div class="lg-grid">';
    gr.list.forEach(function (m) {
      m.grp = gr;
      var tier = st.got[m.id] || 0, max = m.t ? m.t.length : 1, done = tier >= max, hidden = m.s && !tier;
      var name = hidden ? 'Medalla secreta' : m.n + (m.t && tier ? ' · ' + TIER[tier - 1] : '');
      var d = hidden ? 'Seguí jugando para descubrirla.' : done && m.t ? '¡Completa! ' + desc(m, max - 1) : desc(m, tier);
      var bar = '';
      if (m.t && !done) {
        var T = st.T, cc = function (k) { return T[k] || 0; }, v = m.v({ dist: T.best || 0, coins: T.bestCoins || 0, saves: T.bestSaves || 0 }, cc, T);
        var lo = tier ? m.t[tier - 1] : 0, w = Math.max(0, Math.min(100, (v - lo) / (m.t[tier] - lo) * 100));
        bar = '<div class="lg-bar"><u style="width:' + Math.round(w) + '%"></u></div>';
      }
      var r = hidden ? '' : rarText(m, tier ? tier : 1);
      h += '<div class="lg-m" style="--c:' + col(m, Math.max(1, tier)) + '">' + badge(m, tier) + '<div><b>' + esc(name) + '</b><small>' + esc(d) + '</small>' + bar +
        '<em>' + (tier ? '+' + ptsOf(m, tier) + ' pts' + (r ? ' · ' : '') : '') + esc(r) + '</em></div></div>';
    });
    h += '</div></div>';
  });
  h += '<button class="go" type="button" id="lg-close">Volver</button>';
  ov.querySelector('.box').innerHTML = h;
  ov.hidden = false; ov.querySelector('.box').scrollTop = 0;
  $('lg-close').addEventListener('click', function () { ov.hidden = true; renderStart(); });
  bindSync();
}
function syncHtml() {
  if (!API.server) { return ''; }
  var n = nick(), k = clave();
  return '<div class="lg-sync" id="lg-sync"><b style="color:#74C6E8">Coleccionistas</b>' +
    (n ? '<span>Tus medallas suman en el ranking de coleccionistas como <b>' + esc(n) + '</b>. <span id="lg-sst"></span></span>'
       : '<span>Anotá una toma en el ranking con tu apodo y tus medallas van a sumar en el ranking de coleccionistas.</span>') +
    '<span>Tu código para pasar las medallas a otro teléfono: <code>' + k.slice(0, 4) + '-' + k.slice(4) + '</code></span>' +
    '<details><summary style="cursor:pointer;font-weight:800">Traer medallas de otro teléfono</summary><div style="display:grid;gap:6px;margin-top:6px">' +
    '<div class="row"><input id="lg-rn" maxlength="12" placeholder="Apodo" value="' + esc(n) + '"><input id="lg-rk" maxlength="9" placeholder="Código" autocapitalize="characters"></div>' +
    '<div class="row"><button type="button" id="lg-rb">Traer medallas</button><span id="lg-rm" style="align-self:center;font-size:12px"></span></div></div></details></div>';
}
function bindSync() {
  if (!API.server || !$('lg-sync')) { return; }
  var st = $('lg-sst'); if (st) { st.textContent = syncMsg; }
  ['lg-rn', 'lg-rk'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { e.stopPropagation(); }); });
  $('lg-rb').addEventListener('click', function () {
    var n = $('lg-rn').value.trim(), k = $('lg-rk').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), m = $('lg-rm');
    if (!n || k.length !== 8) { m.textContent = 'Poné el apodo y el código de 8 letras.'; return; }
    m.textContent = 'Buscando…';
    API.server.recover(n, k).then(function (j) {
      merge(j); lsSet(KCLAVE, k); try { localStorage.setItem(KNICK, n); } catch (e) {}
      m.textContent = '¡Listo! Medallas recuperadas.'; setTimeout(openList, 700); renderStart();
    }).catch(function (e) { m.textContent = e.message === 'clave' ? 'El apodo y el código no coinciden.' : 'No se pudo conectar. Probá de nuevo.'; });
  });
}
/* trae medallas guardadas en la planilla y se queda con lo mejor de cada lado */
function merge(j) {
  String(j.med || '').split(',').forEach(function (s) {
    var a = s.split(':'), parts = a[0].split('.'), g = null;
    Object.keys(G).forEach(function (k) { if (G[k].pre === parts[0]) { g = k; } });
    if (!g || !parts[1]) { return; }
    var st = gs(g), t = Math.max(1, parseInt(a[1], 10) || 1);
    if ((st.got[parts[1]] || 0) < t) { st.got[parts[1]] = t; st.at[parts[1]] = Date.now(); }
  });
  var D = {}; try { D = JSON.parse(j.datos || '{}'); } catch (e) {}
  Object.keys(D).forEach(function (g) {
    var T = gs(g).T, R = D[g] || {};
    Object.keys(R).forEach(function (k) {
      if (typeof R[k] === 'number') { T[k] = Math.max(T[k] || 0, R[k]); }
      else if (Array.isArray(R[k])) { var u = {}; (T[k] || []).concat(R[k]).forEach(function (x) { u[x] = 1; }); T[k] = Object.keys(u).map(function (x) { return isNaN(x) ? x : +x; }); }
    });
  });
  save();
}
var syncMsg = '', syncing = false;
function sync() {
  if (!API.server || !nick() || syncing) { return; }
  syncing = true; syncMsg = 'Sincronizando…';
  API.server.sync(API.payload()).then(function () { syncing = false; syncMsg = 'Sincronizadas.'; var s = $('lg-sst'); if (s) { s.textContent = syncMsg; } })
    .catch(function (e) {
      syncing = false;
      syncMsg = e.message === 'apodo-ocupado' ? 'Ese apodo ya tiene medallas en otro teléfono: si es tuyo, traelas con el código de ese teléfono.' :
        e.message === 'viejo' ? 'El ranking todavía no tiene medallas.' : 'Se sincronizan cuando haya señal.';
      var s = $('lg-sst'); if (s) { s.textContent = syncMsg; }
    });
}

/* ---------- API para los juegos ---------- */
var API = {
  server: null,
  /* opts: base (carpeta de escenarios), onUnlock(x), stage, startBox, overBox, best (récord guardado antes de las medallas) */
  mount: function (g, opts) {
    game = g; CAT = G[g]; opt = opts || {}; css();
    var st = gs();
    /* récord previo: las medallas de distancia de una sola toma se dan por ganadas */
    if (opt.best > (st.T.best || 0)) { st.T.best = opt.best; }
    if (st.T.best && opt.retro) { test({ dist: st.T.best }, false, opt.retro); }
    var t = document.createElement('div'); t.className = 'lg-toast'; t.id = 'lg-toast'; (opt.stage || document.body).appendChild(t);
    var sb = document.createElement('div'); sb.id = 'lg-start'; sb.style.cssText = 'display:grid;gap:7px';
    var picks = opt.startBox.querySelector('.picks'); opt.startBox.insertBefore(sb, picks ? picks.nextSibling : opt.startBox.firstChild);
    var ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'lg-ov'; ov.hidden = true; ov.innerHTML = '<div class="box"></div>';
    (opt.stage || document.body).appendChild(ov);
    var nw = document.createElement('div'); nw.id = 'lg-over'; nw.hidden = true;
    opt.overBox.insertBefore(nw, opt.overBox.querySelector('.manif') || opt.overBox.querySelector('.go'));
    escImg(curEsc()); renderStart();
    setTimeout(sync, 1500);
  },
  /* contadores de una toma nueva */
  run: function () {
    return { dist: 0, coins: 0, jumps: 0, rolls: 0, lanes: 0, roof: 0, saves: 0, passed: 0, pups: 0, secs: 0, runs: 0, recs: 0, stumbles: 0,
      magMax: 0, flyAll: 0, roofMax: 0, chainMax: 0, buf: 0, zig: 0, holdMax: 0, noJumpMax: 0, stOk: 0, tri: 0, pauseMax: 0 };
  },
  /* durante la toma: avisa al momento las medallas conseguidas */
  check: function (R) { var got = test(R, true); got.forEach(function (x) { live.push(x); toast(x); }); return got; },
  /* al terminar: suma la toma a los acumulados, revisa todo y muestra lo nuevo en el cuadro final */
  end: function (R, extra) {
    var st = gs(), T = st.T;
    R.runs = 1;
    SUM.forEach(function (k) { T[k] = (T[k] || 0) + (R[k] || 0); });
    T.best = Math.max(T.best || 0, R.dist); T.bestCoins = Math.max(T.bestCoins || 0, R.coins); T.bestSaves = Math.max(T.bestSaves || 0, R.saves);
    var d = today(); T.days = T.days || []; if (T.days.indexOf(d) < 0) { T.days.push(d); }
    T.dayRuns = T.dayRuns || {}; T.dayRuns = (function (o) { var n = {}; n[d] = (o[d] || 0) + 1; return n; })(T.dayRuns);
    T.streak = R.dist >= 2000 ? (T.streak || 0) + 1 : 0;
    if (extra && extra.pal != null) { T.pals = T.pals || []; if (T.pals.indexOf(extra.pal) < 0) { T.pals.push(extra.pal); } }
    save();
    var got = live.concat(test(R, false)); live = [];
    var el = $('lg-over');
    if (el) {
      if (got.length) {
        var pts = got.reduce(function (a, x) { return a + x.pts; }, 0), L = level(points());
        el.className = 'lg-new'; el.hidden = false;
        el.innerHTML = '<p>' + (got.length === 1 ? '1 medalla nueva' : got.length + ' medallas nuevas') + ' · +' + pts + ' puntos · Nivel ' + L.n + '</p><ul>' +
          got.map(function (x) { return '<li>' + badge(x.m, x.tier, true) + esc(label(x)) + '</li>'; }).join('') + '</ul>';
      } else { el.hidden = true; }
    }
    renderStart();
    setTimeout(sync, 300);
    return got;
  },
  /* cielo del escenario elegido: { img, f (cuadros) } o null para el cielo de siempre */
  sky: function () { var e = curEsc(), im = escImg(e); return im && im.complete && im.naturalWidth ? { img: im, f: e.f || 1, k: e.k || 1 } : null; },
  points: points,
  level: function () { return level(points()); },
  /* lo que se manda a la planilla */
  payload: function () {
    var med = [], datos = {};
    Object.keys(S.g).forEach(function (g) {
      if (!G[g]) { return; }
      var st = S.g[g]; Object.keys(st.got).forEach(function (id) { med.push(G[g].pre + '.' + id + ':' + st.got[id]); });
      var T = {}; Object.keys(st.T).forEach(function (k) { if (k !== 'dayRuns') { T[k] = st.T[k]; } }); datos[g] = T;
    });
    var P = points();
    return { apodo: nick(), clave: clave(), med: med.join(','), pts: P, nivel: level(P).n, datos: JSON.stringify(datos) };
  },
  setRemote: function (r, jug) { if (r && jug) { rar = { r: r, jug: jug }; lsSet(KRAR, rar); } },
  sync: sync,
  renderStart: function () { renderStart(); },
  catalog: function () { return G; },
  levels: LEVELS, tiers: TIER, tierPts: TPTS, escenarios: ESC
};
window.FAALogros = API;
})();
