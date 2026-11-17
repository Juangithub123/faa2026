/* Logística FAA! 2026 · app del equipo.
   Datos: data.json (base) + planillas configuradas en config.js. Se guardan en el teléfono,
   se actualizan cuando hay conexión y avisan qué cambió. Sin dependencias. */
(function () {
'use strict';
var CFG = window.FAA_CONFIG || {};
var TZ = 'America/Argentina/Buenos_Aires';
var K = { data: 'faa26-data', state: 'faa26-state', news: 'faa26-news', theme: 'faa26-theme', sync: 'faa26-sync', inst: 'faa26-install-hidden', open: 'faa26-open' };
var DAY_VIEWS = { hoy: 1, programa: 1, turnos: 1, traslados: 1, mapa: 1, arte: 1 };
var SUB_VIEWS = { mapa: 1, arte: 1, equipo: 1, pendientes: 1, antes: 1, ajustes: 1 };

/* ---------- Utilidades ---------- */
function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function f(x) { x = ((x % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
function m(s) { var r = /(\d{1,2})\s*[:.h]\s*(\d{2})/.exec(String(s || '')); return r ? +r[1] * 60 + +r[2] : null; }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function $(id) { return document.getElementById(id); }
function by(k) { return function (a, b) { return a[k] - b[k]; }; }
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* ---------- Estado ---------- */
var D = null, DH = '', X = { open: {} };
var S = { me: '', done: {}, tarea: '', mineOnly: false, notif: false, day: 0, view: 'hoy', map: { rec: true, trl: true, mine: false, loc: false } };
(function () { var st = lsGet(K.state); if (st) { ['me', 'done', 'tarea', 'mineOnly', 'notif'].forEach(function (k) { if (k in st) { S[k] = st[k]; } }); } X.open = lsGet(K.open) || {}; })();
function saveS() { lsSet(K.state, { me: S.me, done: S.done, tarea: S.tarea, mineOnly: S.mineOnly, notif: S.notif }); }
var NEWS = lsGet(K.news) || { items: [], read: 0 };
var SYNC = { at: (lsGet(K.sync) || {}).at || null, state: 'idle', msg: '' };

/* ---------- Tiempo (hora argentina) ---------- */
function nowAR() {
  var p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, min: +p.hour * 60 + +p.minute };
}
function absT(di, min) { var d = D.days[di].date.split('-'); return Date.UTC(+d[0], +d[1] - 1, +d[2]) + (min + 180) * 60000; }
function todayIdx() {
  var t = Date.now();
  for (var i = 0; i < D.days.length; i++) { var a = absT(i, 360), b = i < D.days.length - 1 ? absT(i + 1, 360) : absT(i, 1800); if (t >= a && t < b) { return i; } }
  return -1;
}
function phase() { var t = Date.now(); if (t < absT(0, 360)) { return 'pre'; } if (t >= absT(D.days.length - 1, 1800)) { return 'post'; } return 'live'; }
function daysLeft() { var n = nowAR(), d = D.days[0].date.split('-'); return Math.round((Date.UTC(+d[0], +d[1] - 1, +d[2]) - Date.UTC(n.y, n.mo - 1, n.d)) / 86400000); }
function dl(i) { var d = D.days[i]; return d ? d.dow + ' ' + d.k : ''; }
function dlong(i) { var d = D.days[i]; return d ? d.name.toLowerCase() + ' ' + d.k : ''; }
function inMin(ms) {
  var mm = Math.round(ms / 60000); if (mm < 1) { return 'ahora'; }
  if (mm < 60) { return 'en ' + mm + ' min'; }
  var h = Math.floor(mm / 60), r = mm % 60;
  if (h < 24) { return 'en ' + h + ' h' + (r ? ' ' + r + ' min' : ''); }
  var dd = Math.round(h / 24); return 'en ' + dd + (dd === 1 ? ' día' : ' días');
}
function clock(ts) {
  var o = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
  var d0 = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'numeric' });
  return d0.format(new Date(ts)) === d0.format(new Date()) ? o : d0.format(new Date(ts)) + ' ' + o;
}

/* ---------- Índices ---------- */
function prep() {
  X.ak = Object.keys(D.areas);
  X.ev = {}; D.events.forEach(function (e) { X.ev[e.id] = e; });
  X.pp = {}; D.people.forEach(function (p) { X.pp[p.id] = p; });
  X.members = {}; X.ak.forEach(function (a) { X.members[a] = D.people.filter(function (p) { return p.a.indexOf(a) > -1; }).map(function (p) { return p.id; }); });
  X.evAreas = {};
  D.shifts.forEach(function (x) {
    x._ppl = x.pids ? x.pids : (X.members[x.area] || []);
    if (!x.sug) { (x.ev || []).forEach(function (id) { (X.evAreas[id] = X.evAreas[id] || {})[x.area] = 1; }); }
  });
  if (S.me && !X.pp[S.me]) { S.me = ''; }
  buildChg();
}
function buildChg() { X.chg = {}; X.chgDay = {}; var recent = Date.now() - 12 * 3600000; NEWS.items.forEach(function (n) { if (n.at > NEWS.read || n.at > recent) { X.chg[n.ref] = 1; (n.refs || []).forEach(function (r) { X.chg[r] = 1; }); if (n.day != null) { X.chgDay[n.day] = 1; } } }); }
function V(k) { return (D.venues && D.venues[k]) || { n: k ? String(k) : 'A confirmar', nomap: true }; }
function A(k) { return D.areas[k] || { n: k }; }
function areasFor(id) { var o = X.evAreas[id] || {}; return X.ak.filter(function (a) { return o[a]; }); }
function me() { return (S.me && X.pp[S.me]) || null; }
function myAreas() { var p = me(); return p ? p.a : []; }
function hasMine(list) { var a = myAreas(); return (list || []).some(function (z) { return a.indexOf(z) > -1; }); }
function mineShift(x) { return !!S.me && x._ppl.indexOf(S.me) > -1; }
function mineEv(e) { return hasMine(areasFor(e.id).concat(e.leadAreas || [])); }
function evEnd(e) { return e.e == null ? e.s + 60 : e.e; }
function shortName(n) { return String(n).split(' ')[0]; }
function whoNames(area, evId, sug) { var out = []; D.shifts.forEach(function (x) { if (x.area === area && !!x.sug === !!sug && (x.ev || []).indexOf(evId) > -1) { (x.who || []).forEach(function (w) { if (out.indexOf(w) < 0) { out.push(w); } }); } }); return out; }

/* ---------- Piezas ---------- */
var PIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5S12.5 9.2 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" fill="currentColor"/></svg>';
function gmaps(v) { var o = V(v); return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((o.q || o.n) + ' El Bolsón, Río Negro') + (o.pid ? '&query_place_id=' + o.pid : ''); }
function vtxt(v, room) { var o = V(v); if (o.nomap && room) { return room; } if (room && norm(room).indexOf(norm(o.n)) === 0) { return room; } return o.n + (room ? ' · ' + room : ''); }
function venueLink(v, room) {
  var o = V(v), t = esc(vtxt(v, room));
  if (o.nomap) { return '<span class="venue nolink">' + PIN + t + '</span>'; }
  return '<a class="venue" href="' + gmaps(v) + '" target="_blank" rel="noopener">' + PIN + t + '</a>';
}
function ad(a) { return '<i class="ad" style="--c:var(--a-' + a + ')"></i>'; }
function areaTag(a) { return '<span>' + ad(a) + esc(A(a).n) + '</span>'; }
function ov(s, e, r) { return s < r[1] && e > r[0]; }
function relevo(s, e) {
  e = e == null ? s + 60 : e; var t = [];
  if (ov(s, e, D.meals.lunch)) { t.push('almuerzo'); }
  if (ov(s, e, D.meals.snack)) { t.push('merienda'); }
  return t.length ? '<span class="relevo">Turnarse para ' + t.map(function (x) { return x === 'almuerzo' ? 'almorzar' : 'merendar'; }).join(' y ') + '</span>' : '';
}
function mealsLine() { var L = D.meals.lunch, M = D.meals.snack; return '<p class="meals"><span><b>Almuerzo</b> ' + f(L[0]) + ' a ' + f(L[1]) + '</span><span><b>Merienda</b> ' + f(M[0]) + ' a ' + f(M[1]) + '</span><span>Lugar a definir</span></p>'; }
function kv(k, v) { return '<div class="kv"><b>' + esc(k) + '</b><span>' + v + '</span></div>'; }
function chk(id, label) { var dn = !!S.done[id]; return '<button class="chk" type="button" data-done="' + id + '" aria-pressed="' + dn + '" aria-label="Marcar como hecho: ' + esc(label) + '"></button>'; }
function det(key, cls, summary, inner) { return '<details class="x ' + (cls || '') + '" data-k="' + key + '"' + (X.open[key] ? ' open' : '') + '><summary>' + summary + '</summary><div class="in">' + inner + '</div></details>'; }
function head(title, sub) { return '<div class="h"><h2>' + esc(title) + '</h2>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>'; }
function dayHead(view) { var d = D.days[S.day]; return head(view + ' · ' + d.name + ' ' + d.k, '') + '<p class="muted small">' + esc(d.theme || '') + '</p>'; }
function whoSelect() {
  var opts = D.people.slice().sort(function (a, b) { return a.n.localeCompare(b.n, 'es'); }).map(function (p) { return '<option value="' + p.id + '"' + (p.id === S.me ? ' selected' : '') + '>' + esc(p.n) + '</option>'; }).join('');
  return '<select class="big" id="who" aria-label="Tu nombre"><option value="">Elegí tu nombre</option>' + opts + '</select>';
}

function shiftRow(x, opt) {
  opt = opt || {};
  var done = !!S.done[x.id], t0 = absT(x.day, x.s), t1 = absT(x.day, x.e), now = Date.now() >= t0 && Date.now() < t1;
  var who = (x.who || []).length ? '<p class="nt">' + esc(x.who.join(' · ')) + '</p>' : '';
  return '<li class="it' + (done ? ' done' : '') + (now ? ' now' : '') + (x.sug ? ' sug' : '') + '" data-row="' + x.id + '">' + chk(x.id, x.t) +
    '<div class="tm"><b>' + f(x.s) + '</b><span>a ' + f(x.e) + '</span></div><div class="bd">' +
    '<p class="t">' + (x.sug ? '<span class="badge sugb">Sugerencia</span> ' : '') + (now ? '<span class="badge now">Ahora</span> ' : '') + (X.chg['sh:' + x.id] ? '<span class="badge chg">Cambió</span> ' : '') + esc(x.t) + '</p>' +
    '<div class="mt">' + venueLink(x.v) + (opt.area ? '<span class="tags">' + areaTag(x.area) + '</span>' : '') + relevo(x.s, x.e) + '</div>' +
    (x.note ? '<p class="nt">' + esc(x.note) + '</p>' : '') + (opt.who === false ? '' : who) + '</div></li>';
}

function sugBlock(key, list, opt) {
  if (!list.length) { return ''; }
  return det(key, 'sugbox', '<span class="sum-t">Sugerencias · ' + list.length + '</span><div class="sum-m">No son del cronograma oficial</div>',
    '<p class="small muted">' + esc(D.notes.sug || '') + '</p><ul class="list" style="margin:0 -14px -14px;border-radius:0;border-left:0;border-right:0;border-bottom:0">' + list.map(function (x) { return shiftRow(x, opt); }).join('') + '</ul>');
}
var PDF = 'cronograma-faa-2026.pdf', PDFNAME = 'Cronograma FAA 2026.pdf';
function pdfCard() {
  return '<section class="card pdfcard"><div class="ico">PDF</div><div><h3>Cronograma oficial</h3><p class="small muted">Para pasarlo por WhatsApp o imprimirlo.</p></div>' +
    '<div class="row-btns"><button class="btn sm pri" type="button" data-act="pdf-share">Compartir</button><a class="btn sm" href="' + PDF + '" download="' + PDFNAME + '">Descargar</a><a class="btn sm" href="' + PDF + '" target="_blank" rel="noopener">Ver</a></div></section>';
}
function getPdfFile() {
  if (X.pdfFile) { return Promise.resolve(X.pdfFile); }
  return fetch(PDF).then(function (r) { return r.blob(); }).then(function (b) { X.pdfFile = new File([b], PDFNAME, { type: 'application/pdf' }); return X.pdfFile; });
}
function copyLink(url) {
  if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function () { toast('Link del cronograma copiado.'); }, function () { toast(url); }); } else { toast(url); }
}
function sharePdf() {
  var url = new URL(PDF, location.href).href, text = 'Cronograma del FAA! 2026 · del 25 al 29 de noviembre, El Bolsón';
  function viaUrl() { if (navigator.share) { return navigator.share({ title: 'Cronograma FAA! 2026', text: text, url: url }).catch(function () {}); } copyLink(url); }
  var go = function (f) {
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      return navigator.share({ files: [f], title: 'Cronograma FAA! 2026', text: text }).catch(function (e) { if (!e || e.name !== 'AbortError') { viaUrl(); } });
    }
    return viaUrl();
  };
  if (X.pdfFile) { go(X.pdfFile); } else { getPdfFile().then(go, viaUrl); }
}
/* ---------- Mi día ---------- */
function myShiftsAll() { return D.shifts.filter(function (x) { return !x.sug && mineShift(x); }).map(function (x) { return { x: x, a: absT(x.day, x.s), b: absT(x.day, x.e) }; }).sort(by('a')); }
function statusCard() {
  var all = myShiftsAll(), t = Date.now(), ph = phase(), out = '';
  var cur = all.filter(function (o) { return o.a <= t && t < o.b; }), next = all.filter(function (o) { return o.a > t; })[0];
  if (ph === 'pre') { var n = daysLeft(); out += '<p class="kicker">' + (n > 1 ? 'Faltan ' + n + ' días para el festival' : n === 1 ? 'El festival empieza mañana' : 'El festival empieza hoy') + '</p>'; }
  cur.forEach(function (o) {
    out += '<section class="card accent"><p class="kicker">Ahora · hasta las ' + f(o.x.e) + '</p><h3>' + esc(o.x.t) + '</h3><div class="mt">' + venueLink(o.x.v) + '</div></section>';
  });
  if (next) {
    var x = next.x, o = V(x.v);
    out += '<section class="card' + (cur.length ? '' : ' accent') + '"><p class="kicker">Tu próxima tarea · ' + inMin(next.a - t) + '</p>' +
      '<h3>' + esc(x.t) + '</h3><p class="small"><b class="num">' + dl(x.day) + ' · ' + f(x.s) + ' a ' + f(x.e) + '</b></p>' +
      '<div class="row-btns">' + (o.nomap ? '<span class="venue nolink">' + PIN + esc(o.n) + '</span>' : '<a class="btn sm pri" href="' + gmaps(x.v) + '" target="_blank" rel="noopener">' + PIN + ' Cómo llegar a ' + esc(o.n) + '</a>') +
      (x.day !== S.day ? '<button class="btn sm" type="button" data-day="' + x.day + '">Ver ese día</button>' : '') + '</div></section>';
  } else if (!cur.length && all.length) {
    out += '<section class="card accent"><h3>Terminaste todas tus tareas del festival</h3><p class="small">¡Gracias por sumarte al FAA! 2026!</p></section>';
  }
  return out;
}
function myNewsCard() {
  var mine = NEWS.items.filter(function (n) { return n.at > NEWS.read && n.mine; });
  if (!mine.length) { return ''; }
  return '<section class="card warn"><p class="kicker" style="color:var(--warn)">Cambió algo que te toca</p><ul class="plain small">' +
    mine.slice(0, 4).map(function (n) { return '<li>' + esc(n.text) + '</li>'; }).join('') + '</ul>' +
    '<button class="btn sm" type="button" data-go="novedades">Ver todas las novedades</button></section>';
}
function programaMini() {
  var list = D.events.filter(function (e) { return e.day === S.day; }).sort(by('s')), t = Date.now();
  if (!list.length) { return ''; }
  var rows = list.map(function (e) {
    var now = t >= absT(e.day, e.s) && t < absT(e.day, evEnd(e));
    return '<li class="it nochk' + (now ? ' now' : '') + '"><div class="tm"><b>' + f(e.s) + '</b></div><div class="bd"><p class="t">' + (now ? '<span class="badge now">Ahora</span> ' : '') + esc(e.t) + '</p><p class="nt">' + esc(vtxt(e.v, e.room)) + '</p></div></li>';
  }).join('');
  return det('mini-' + S.day, '', '<span class="sum-t">Programa del ' + esc(dlong(S.day)) + '</span><div class="sum-m">' + list.length + ' actividades · abiertas al público</div>', '<ul class="list" style="border:0;margin:0 -14px -14px">' + rows + '</ul>');
}
function browserInfo() {
  var ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /android/i.test(ua);
  var b = /SamsungBrowser/i.test(ua) ? 'samsung' : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /EdgiOS|EdgA|Edg\//i.test(ua) ? 'edge' : /OPR|Opera|OPT\//i.test(ua) ? 'opera' : /CriOS|Chrome/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'otro';
  return { ios: ios, android: android, b: b, standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true };
}
function installSteps() {
  var i = browserInfo();
  if (i.ios) {
    if (i.b === 'firefox') { return ['Tocá el menú ☰ (abajo a la derecha).', 'Elegí «Compartir».', 'Elegí «Agregar a inicio» y confirmá con «Agregar».']; }
    if (i.b === 'chrome' || i.b === 'edge') { return ['Tocá el botón Compartir (el cuadrado con la flecha, en la barra de direcciones).', 'Bajá y elegí «Agregar a inicio».', 'Confirmá con «Agregar».']; }
    return ['Tocá el botón Compartir (el cuadrado con la flecha hacia arriba).', 'Bajá y elegí «Agregar a inicio».', 'Confirmá con «Agregar».'];
  }
  if (i.android) {
    if (i.b === 'firefox') { return ['Tocá el menú ⋮ (arriba o abajo a la derecha).', 'Elegí «Instalar» o «Agregar app a la pantalla de inicio».', 'Confirmá. Si solo aparece «Agregar a la pantalla de inicio», también sirve: funciona igual, sin señal incluida.']; }
    if (i.b === 'samsung') { return ['Tocá el ícono de instalar en la barra de direcciones (una flecha hacia abajo), si aparece.', 'Si no: menú ☰ (abajo a la derecha) → «Agregar página a» → «Pantalla de inicio».', 'Confirmá con «Agregar».']; }
    if (i.b === 'chrome' || i.b === 'edge' || i.b === 'opera') { return ['Tocá el menú ⋮ (arriba a la derecha).', 'Elegí «Instalar app» o «Agregar a la pantalla principal».', 'Confirmá con «Instalar».']; }
    return ['Abrí esta misma dirección en Chrome o Firefox.', 'Desde el menú del navegador, elegí «Instalar» o «Agregar a la pantalla de inicio».'];
  }
  if (i.b === 'chrome' || i.b === 'edge') { return ['Hacé clic en el ícono de instalar al final de la barra de direcciones.', 'Confirmá con «Instalar».']; }
  return ['En compu se usa mejor en Chrome o Edge (ícono de instalar en la barra de direcciones). En Firefox de escritorio se puede usar como página normal.'];
}
function installHelp() {
  var i = browserInfo(), names = { chrome: 'Chrome', firefox: 'Firefox', samsung: 'Samsung Internet', edge: 'Edge', opera: 'Opera', safari: 'Safari', otro: 'tu navegador' };
  if (i.standalone) { return '<p class="small">Ya la estás usando como app.</p>'; }
  var where = (i.ios ? 'iPhone' : i.android ? 'Android' : 'compu') + ' · ' + names[i.b];
  return (X.canInstall ? '<button class="btn sm pri" type="button" data-act="install">Instalar la guía</button><p class="small muted">O a mano:</p>' : '') +
    '<p class="kicker">Detectamos: ' + esc(where) + '</p><ol class="steps">' + installSteps().map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
    '<p class="small muted">Queda con el ícono de FAA!, abre al toque y funciona sin señal.</p>';
}
function installCard() {
  var i = browserInfo();
  if (i.standalone || lsGet(K.inst) || (!i.ios && !i.android && !X.canInstall)) { return ''; }
  if (X.canInstall) { return '<section class="card accent"><h3>Instalá la guía en tu teléfono</h3><p class="small">Queda como una app, abre al toque y funciona sin señal.</p><div class="row-btns"><button class="btn sm pri" type="button" data-act="install">Instalar</button><button class="btn sm" type="button" data-act="install-hide">Ahora no</button></div></section>'; }
  return det('inst-help', 'accent-x', '<span class="sum-t">Instalá la guía en tu teléfono</span><div class="sum-m">Cómo hacerlo en tu navegador</div>', installHelp() + '<button class="btn sm" type="button" data-act="install-hide">Ya está / no mostrar más</button>');
}
function vHoy() {
  var p = me(), out = installCard();
  if (!p) {
    return out + pdfCard() + '<section class="card accent"><h2 style="font-size:21px">¿Quién sos?</h2><p>Elegí tu nombre: esta pantalla te va a mostrar tus tareas, dónde tenés que estar y qué cambió.</p>' + whoSelect() + '<p class="small muted">Se guarda solo en este teléfono. Lo podés cambiar en Más → Ajustes.</p></section>' + programaMini();
  }
  var all = D.shifts.filter(function (x) { return x.day === S.day && mineShift(x); }).sort(by('s'));
  var list = all.filter(function (x) { return !x.sug; }), sugs = all.filter(function (x) { return x.sug; });
  var trs = D.transfers.filter(function (t) { return t.day === S.day && hasMine(t.areas); });
  out += head('Hola, ' + shortName(p.n), esc(p.a.map(function (a) { return A(a).n; }).join(' · ')));
  out += myNewsCard() + statusCard() + pdfCard();
  out += '<div class="h" style="margin-top:4px"><p class="kicker">Tus tareas · ' + esc(D.days[S.day].name + ' ' + D.days[S.day].k) + '</p><span class="sub">' + list.length + '</span></div>';
  out += list.length ? '<ul class="list">' + list.map(function (x) { return shiftRow(x, { area: p.a.length > 1 }); }).join('') + '</ul>' : '<p class="card muted small">No tenés tareas asignadas este día.</p>';
  out += myRouteCard();
  out += sugBlock('sug-me-' + S.day, sugs, { area: p.a.length > 1 });
  out += mealsLine();
  if (trs.length) { out += '<button class="btn" type="button" data-go="traslados">' + trs.length + (trs.length === 1 ? ' traslado' : ' traslados') + ' de tu área este día →</button>'; }
  out += programaMini();
  if (phase() === 'pre') { out += vAntesCard(); }
  return out;
}

/* ---------- Programa ---------- */
function films(e) {
  if (!e.films || !e.films.length) { return ''; }
  return '<div class="kv"><b>Selección · ' + e.films.length + '</b><ul class="films">' + e.films.map(function (x) {
    if (typeof x === 'string') { return '<li><span></span><div><span class="ft">' + esc(x) + '</span></div></li>'; }
    var meta = [x.by, [x.from, x.y].filter(Boolean).join(', '), x.dur].filter(Boolean).join(' · ');
    return '<li>' + (x.img ? '<img loading="lazy" decoding="async" src="' + esc(x.img) + '" alt="" width="64" height="92">' : '<span class="noimg"></span>') + '<div><span class="ft">' + esc(x.t) + '</span><span class="fm">' + esc(meta) + '</span></div></li>';
  }).join('') + '</ul></div>';
}
function evRow(e) {
  var t = Date.now(), now = t >= absT(e.day, e.s) && t < absT(e.day, evEnd(e)), mine = S.me && mineEv(e), chg = X.chg['ev:' + e.id];
  var ar = areasFor(e.id), dir = whoNames('dir', e.id), coo = whoNames('coo', e.id), sdir = whoNames('dir', e.id, true);
  var sum = '<div class="ev-sum"><div class="tm"><b>' + f(e.s) + '</b><span>' + (e.e != null ? f(e.e) : 'en adelante') + '</span></div><div><div class="sum-t">' + esc(e.t) + '</div><div class="sum-m"><span>' + esc(vtxt(e.v, e.room)) + '</span>' +
    (now ? '<span class="badge now">Ahora</span>' : '') + (chg ? '<span class="badge chg">Cambió</span>' : '') + (mine ? '<span class="badge mine">Tu área</span>' : '') + (e.flag ? '<span class="badge flag">A confirmar</span>' : '') + '</div></div></div>';
  var inner = (e.tag ? '<p><span class="badge">' + esc(e.tag) + '</span></p>' : '') + (e.d ? '<p>' + esc(e.d) + '</p>' : '') + films(e) + (e.flag ? '<p class="fl">' + esc(e.flag) + '</p>' : '') +
    (e.lead ? kv('A cargo', esc(e.lead)) : '') +
    (dir.length ? kv('Dirección', esc(dir.join(' · '))) : '') + (coo.length ? kv('Coordinación', esc(coo.join(' · '))) : '') +
    (sdir.length ? kv('Sugerencia · Dirección', '<span class="muted">' + esc(sdir.join(' · ')) + '</span>') : '') +
    (ar.length ? '<div class="tags">' + ar.map(areaTag).join('') + '</div>' : '') +
    '<div class="mt">' + venueLink(e.v, e.room) + ' ' + relevo(e.s, e.e) + '</div>';
  return det('ev-' + e.id, 'ev' + (now ? ' now' : ''), sum, inner);
}
function vPrograma() {
  var list = D.events.filter(function (e) { return e.day === S.day; }).sort(by('s'));
  if (S.mineOnly && S.me) { list = list.filter(mineEv); }
  var out = dayHead('Programa') + pdfCard();
  if (S.me) { out += '<div class="chips"><button class="chip" type="button" data-mine="0" aria-pressed="' + !S.mineOnly + '">Todo el programa</button><button class="chip" type="button" data-mine="1" aria-pressed="' + S.mineOnly + '">Solo donde está mi área</button></div>'; }
  out += list.length ? '<div class="evlist">' + list.map(evRow).join('') + '</div>' : '<p class="card muted">Nada para mostrar con este filtro.</p>';
  var dl0 = legs(stops('day')).filter(function (l) { return l.tight; });
  if (dl0.length) { out += det('froute-' + S.day, '', '<span class="sum-t">Recorrido del público</span><div class="sum-m"><span class="badge flag">' + dl0.length + ' cambio' + (dl0.length > 1 ? 's' : '') + ' de sede justo' + (dl0.length > 1 ? 's' : '') + '</span></div>', routeList('day')); }
  out += mealsLine();
  var al = (D.alerts[S.day] || []).length;
  if (al) { out += '<button class="btn" type="button" data-go="pendientes">' + al + ' avisos y pendientes de este día →</button>'; }
  return out;
}

/* ---------- Turnos ---------- */
function bucket(s) { return s < 780 ? 'Mañana' : (s < 1140 ? 'Tarde' : 'Noche'); }
function peak(list) { var best = 0; list.forEach(function (a) { var n = list.filter(function (b) { return b.s <= a.s && b.e > a.s; }).length; if (n > best) { best = n; } }); return best; }
function areaCard(a, open) {
  var both = D.shifts.filter(function (x) { return x.day === S.day && x.area === a; }).sort(by('s'));
  var items = both.filter(function (x) { return !x.sug; }), sugs = both.filter(function (x) { return x.sug; });
  var ppl = X.members[a] || [], n = ppl.length, pk = peak(items), rows = '', last = '';
  items.forEach(function (x) { var b = bucket(x.s); if (b !== last) { rows += '<li class="turno-lbl">' + b + '</li>'; last = b; } rows += shiftRow(x); });
  var warn = n === 0 ? 'Sin integrantes cargados: falta confirmar quién cubre el área.' : (pk > n ? 'Hay momentos con ' + pk + ' tareas a la vez y ' + n + (n === 1 ? ' persona' : ' personas') + ': conviene sumar apoyo.' : '');
  var sum = '<div class="area-h">' + ad(a) + '<span class="sum-t">' + esc(A(a).n) + '</span></div><div class="sum-m"><span>' + items.length + (items.length === 1 ? ' tarea' : ' tareas') + '</span><span>' + n + (n === 1 ? ' persona' : ' personas') + '</span>' + (warn ? '<span class="badge flag">Revisar</span>' : '') + (items.some(function (x) { return X.chg['sh:' + x.id]; }) ? '<span class="badge chg">Cambió</span>' : '') + '</div>';
  var inner = '<p class="nt small muted">' + (n ? ppl.map(function (id) { return esc(X.pp[id].n); }).join(' · ') : '') + '</p>' + (warn ? '<p class="warnline">' + warn + '</p>' : '') +
    (items.length ? '<ul class="list" style="margin:0 -14px' + (sugs.length ? ' 0' : ' -14px') + ';border-radius:0;border-left:0;border-right:0;border-bottom:0">' + rows + '</ul>' : '<p class="muted small">Sin tareas del cronograma este día.</p>') +
    sugBlock('sug-' + a + '-' + S.day, sugs);
  var key = 'ar-' + a;
  if (open && !(key in X.open)) { X.open[key] = 1; }
  return det(key, '', sum, inner);
}
function projPanel() {
  var evs = D.events.filter(function (e) { return e.day === S.day && areasFor(e.id).indexOf('prg') > -1; }).sort(by('s'));
  if (!evs.length) { return ''; }
  var rows = evs.map(function (e) {
    var pr = whoNames('prg', e.id), rg = whoNames('reg', e.id);
    return '<li class="it nochk"><div class="tm"><b>' + f(e.s) + '</b><span>' + (e.e != null ? 'a ' + f(e.e) : '') + '</span></div><div class="bd"><p class="t">' + esc(e.t) + '</p><div class="mt">' + venueLink(e.v, e.room) + relevo(e.s, e.e) + '</div>' +
      (e.films ? '<p class="nt">' + e.films.length + ' obras en la selección</p>' : '') + '<p class="nt"><b>Programación:</b> ' + (pr.length ? esc(pr.join(' · ')) : '—') + (areasFor(e.id).indexOf('tec') > -1 ? ' · con Técnica' : '') + '</p>' + (rg.length ? '<p class="nt"><b>Registro:</b> ' + esc(rg.join(' · ')) + '</p>' : '') + '</div></li>';
  }).join('');
  return det('proj-' + S.day, '', '<span class="sum-t">Turnos de proyección</span><div class="sum-m">' + evs.length + ' proyecciones · Programación, Técnica y Registro</div>', '<ul class="list" style="margin:0 -14px -14px;border-radius:0;border-left:0;border-right:0;border-bottom:0">' + rows + '</ul>');
}
function vTurnos() {
  var mine = myAreas(), sel = S.tarea || (mine.length ? 'mine' : 'all');
  if (sel === 'mine' && !mine.length) { sel = 'all'; }
  var chips = (mine.length ? [['mine', 'Mi área']] : []).concat([['all', 'Todas']]).concat(X.ak.map(function (a) { return [a, A(a).n]; }));
  var out = dayHead('Turnos') + '<div class="chips">' + chips.map(function (c) { return '<button class="chip" type="button" data-tarea="' + c[0] + '" aria-pressed="' + (sel === c[0]) + '">' + (X.ak.indexOf(c[0]) > -1 ? ad(c[0]) : '') + esc(c[1]) + '</button>'; }).join('') + '</div>';
  out += mealsLine();
  var areas = sel === 'mine' ? mine : sel === 'all' ? X.ak : [sel];
  out += '<div class="cols">' + areas.map(function (a) { return areaCard(a, sel !== 'all'); }).join('') + '</div>';
  out += projPanel();
  out += '<p class="small muted">' + esc(D.notes.turnos) + '</p>';
  return out;
}

/* ---------- Traslados ---------- */
function trRow(t) {
  var first = t.phases[0] ? t.phases[0][0] : '', open = /confirmar|no dice|no está aclarado|falta/i.test(t.note || '') || !t.from || V(t.to).n === 'A confirmar';
  var sum = '<div class="ev-sum"><div class="tm"><b>' + esc(first) + '</b></div><div><div class="sum-t">' + esc(t.title) + '</div><div class="sum-m"><span>' + esc(t.from ? V(t.from).n : 'Origen a definir') + ' → ' + esc(V(t.to).n) + '</span>' +
    (X.chg['tr:' + t.id] ? '<span class="badge chg">Cambió</span>' : '') + (S.me && hasMine(t.areas) ? '<span class="badge mine">Tu área</span>' : '') + (open ? '<span class="badge flag">A confirmar</span>' : '') + '</div></div></div>';
  var both = t.from && t.to && !V(t.from).nomap && !V(t.to).nomap;
  var inner = '<div class="fromto"><span>' + esc(t.from ? V(t.from).n : 'Origen a definir') + '</span><span class="arr">→</span>' + venueLink(t.to) + (both ? '<span class="muted small">' + fmtDist(dist(t.from, t.to)) + ' en línea recta</span>' : '') + '</div>' +
    '<ol class="phases">' + t.phases.map(function (p) { return '<li><b>' + esc(p[0]) + (p[1] ? ' a ' + esc(p[1]) : '') + '</b><span>' + esc(p[2]) + '</span></li>'; }).join('') + '</ol>' +
    '<div class="tags">' + t.areas.map(areaTag).join('') + '</div>' +
    '<p class="kicker">Lista de carga</p><ul class="checks">' + t.check.map(function (c, i) { var id = t.id + '-' + i; return '<li class="' + (S.done[id] ? 'done' : '') + '" data-row="' + id + '">' + chk(id, c) + '<span>' + esc(c) + '</span></li>'; }).join('') + '</ul>' +
    (t.note ? '<p class="nt small muted">' + esc(t.note) + '</p>' : '') +
    (both ? '<a class="btn sm" href="' + dirURL([t.from, t.to], 'driving') + '" target="_blank" rel="noopener">Ver el traslado en Google Maps ↗</a>' : '');
  return det('tr-' + t.id, 'ev', sum, inner);
}
function vTraslados() {
  var list = D.transfers.filter(function (t) { return t.day === S.day; }).sort(function (a, b) { return (m(a.phases[0] && a.phases[0][0]) || 9999) - (m(b.phases[0] && b.phases[0][0]) || 9999); });
  if (S.mineOnly && S.me) { list = list.filter(function (t) { return hasMine(t.areas); }); }
  var out = dayHead('Traslados');
  if (S.me) { out += '<div class="chips"><button class="chip" type="button" data-mine="0" aria-pressed="' + !S.mineOnly + '">Todos</button><button class="chip" type="button" data-mine="1" aria-pressed="' + S.mineOnly + '">Solo los de mi área</button></div>'; }
  out += list.length ? '<div class="evlist">' + list.map(trRow).join('') + '</div>' : '<p class="card muted">No hay traslados para mostrar.</p>';
  out += '<button class="btn" type="button" data-go="mapa">Ver los traslados en el mapa →</button>';
  if (S.day === 0 && D.rider) { out += det('rider', '', '<span class="sum-t">Equipamiento para la apertura</span><div class="sum-m">' + D.rider.length + ' ítems y de dónde salen</div>', '<ul class="plain">' + D.rider.map(function (x) { return '<li><b>' + esc(x[0]) + '</b> · ' + esc(x[1]) + '</li>'; }).join('') + '</ul>'); }
  out += '<p class="small muted">' + esc(D.notes.traslados) + '</p>';
  return out;
}

/* ---------- Mapa (Leaflet + OpenStreetMap) ---------- */
var GEO = { s: 0.9927, tx: 517.616, ty: 458.691, k: 111320 * Math.cos(41.964 * Math.PI / 180), lat0: -41.964, lng0: -71.534 };
var WALK = 75, DETOUR = 1.3, MARGIN = 5; /* metros por minuto a pie, rodeo de calles, minutos de margen */
function hasLL(v) { var o = D.venues[v]; return !!(o && !o.nomap && o.lat != null); }
function dist(a, b) { var R = 6371000, r = Math.PI / 180, P = V(a), Q = V(b), dla = (Q.lat - P.lat) * r, dg = (Q.lng - P.lng) * r; var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(P.lat * r) * Math.cos(Q.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
function fmtDist(x) { return x < 950 ? Math.round(x / 10) * 10 + ' m' : (x / 1000).toFixed(1).replace('.', ',') + ' km'; }
function walk(a, b) { var mtr = dist(a, b) * DETOUR; return { m: mtr, min: Math.max(1, Math.round(mtr / WALK)) }; }
function ll(v) { return V(v).lat + ',' + V(v).lng; }
function dirURL(list, mode) { var o = list[0], d = list[list.length - 1], mid = list.slice(1, -1); return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(ll(o)) + '&destination=' + encodeURIComponent(ll(d)) + (mid.length ? '&waypoints=' + encodeURIComponent(mid.map(ll).join('|')) : '') + '&travelmode=' + mode; }
function routeMode() { return S.map.mine && S.me ? 'mine' : 'day'; }
/* Paradas del día en orden: las actividades del festival, o las tareas propias. */
function stops(mode, day) {
  day = day == null ? S.day : day;
  var src = mode === 'mine'
    ? D.shifts.filter(function (x) { return x.day === day && !x.sug && mineShift(x); }).map(function (x) { return { v: x.v, s: x.s, e: x.e, t: x.t }; })
    : D.events.filter(function (e) { return e.day === day && e.v && e.v !== 'virt'; }).map(function (e) { return { v: e.v, s: e.s, e: evEnd(e), t: e.t }; });
  src.sort(by('s'));
  var out = [];
  src.forEach(function (x) {
    var p = out[out.length - 1];
    if (p && p.v === x.v && x.s <= p.e + 30) { p.e = Math.max(p.e, x.e); p.t.push(x.t); return; }
    out.push({ v: x.v, s: x.s, e: x.e, t: [x.t] });
  });
  return out;
}
function legs(st) {
  var out = [];
  for (var i = 1; i < st.length; i++) {
    var a = st[i - 1], b = st[i], gap = b.s - a.e, l = { a: a, b: b, gap: gap };
    if (a.v !== b.v && hasLL(a.v) && hasLL(b.v)) { var w = walk(a.v, b.v); l.m = w.m; l.min = w.min; l.tight = gap < w.min + MARGIN; }
    out.push(l);
  }
  return out;
}
function legHtml(l) {
  if (l.a.v === l.b.v) { return ''; }
  var info = l.min != null ? l.min + ' min a pie (' + fmtDist(l.m) + ')' : 'distancia sin calcular';
  var warn = l.tight ? (l.gap <= 0 ? 'Se superponen: ' + (l.gap < 0 ? 'empieza ' + (-l.gap) + ' min antes de que termine lo anterior' : 'empieza a la misma hora que termina lo anterior') : 'Cambio justo: hay ' + l.gap + ' min y se tarda ' + l.min) : '';
  return '<li class="leg' + (l.tight ? ' tight' : '') + '"><span class="walk">' + esc(info) + '</span>' + (warn ? '<span class="warnline">' + esc(warn) + '</span>' : '') + '</li>';
}
function routeList(mode, day) {
  var st = stops(mode, day), lg = legs(st);
  if (!st.length) { return '<p class="small muted">' + (mode === 'mine' ? 'No tenés tareas este día.' : 'No hay actividades con sede este día.') + '</p>'; }
  var n = 0, seen = {}, html = '<ol class="route">';
  st.forEach(function (s, i) {
    if (i > 0) { html += legHtml(lg[i - 1]); }
    var mapped = hasLL(s.v); if (mapped && !(s.v in seen)) { seen[s.v] = ++n; }
    html += '<li class="stop"><span class="pinn' + (mapped ? '' : ' off') + '">' + (mapped ? seen[s.v] : '?') + '</span><div><b class="num">' + f(s.s) + ' a ' + f(s.e) + '</b> · ' + venueLink(s.v) + '<p class="nt">' + esc(s.t.join(' · ')) + '</p></div></li>';
  });
  html += '</ol>';
  var tight = lg.filter(function (l) { return l.tight; }).length, mapped = st.filter(function (s) { return hasLL(s.v); }).map(function (s) { return s.v; });
  var uniq2 = mapped.filter(function (v, i) { return i === 0 || mapped[i - 1] !== v; });
  return (tight ? '<p class="warnline">' + tight + (tight === 1 ? ' cambio justo' : ' cambios justos') + ' de una sede a otra.</p>' : '') + html +
    (uniq2.length >= 2 ? '<a class="btn sm" href="' + dirURL(uniq2, 'walking') + '" target="_blank" rel="noopener">Todo el recorrido en Google Maps ↗</a>' : '');
}
function myRouteCard() {
  if (!S.me) { return ''; }
  var st = stops('mine'), lg = legs(st), moves = lg.filter(function (l) { return l.a.v !== l.b.v; });
  if (!moves.length) { return ''; }
  var tight = moves.filter(function (l) { return l.tight; }).length;
  return det('myroute-' + S.day, '', '<span class="sum-t">Mi recorrido</span><div class="sum-m">' + moves.length + (moves.length === 1 ? ' cambio de sede' : ' cambios de sede') + (tight ? '<span class="badge flag">' + tight + ' justo' + (tight > 1 ? 's' : '') + '</span>' : '') + '</div>',
    routeList('mine') + '<button class="btn sm" type="button" data-act="map-mine">Ver en el mapa</button>');
}
/* Carga diferida de Leaflet: solo cuando se abre un mapa. */
function loadLeaflet() {
  if (window.L) { return Promise.resolve(window.L); }
  if (X.lfp) { return X.lfp; }
  X.lfp = new Promise(function (res, rej) {
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet.css'; document.head.appendChild(css);
    var sc = document.createElement('script'); sc.src = 'vendor/leaflet.js'; sc.onload = function () { res(window.L); }; sc.onerror = function () { X.lfp = null; rej(); }; document.head.appendChild(sc);
  });
  return X.lfp;
}
function killMap() { if (X.lmap) { try { X.lmap.remove(); } catch (e) {} X.lmap = null; X.lme = null; } }
function popupHtml(v) {
  var o = V(v), li = D.events.filter(function (e) { return e.day === S.day && e.v === v; }).sort(by('s')).map(function (e) { return '<li><b>' + f(e.s) + '</b> ' + esc(e.t) + '</li>'; }).join('');
  return '<div class="pop"><b>' + esc(o.n) + '</b><br><span>' + esc(o.addr || '') + '</span>' + (li ? '<ul>' + li + '</ul>' : '') + '<a href="' + gmaps(v) + '" target="_blank" rel="noopener">Cómo llegar ↗</a></div>';
}
function mountMap() {
  var el = document.getElementById('lmap'); if (!el) { return; }
  loadLeaflet().then(function (L) {
    if (!document.body.contains(el)) { return; }
    killMap();
    var map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
    X.lmap = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    if (!navigator.onLine) {
      var lngOf = function (x) { return (x - GEO.tx) / (GEO.s * GEO.k) + GEO.lng0; }, latOf = function (y) { return GEO.lat0 - (y - GEO.ty) / (GEO.s * 111200); };
      L.imageOverlay('map.webp', [[latOf(870), lngOf(0)], [latOf(0), lngOf(1255)]], { opacity: 1 }).addTo(map);
    }
    var mode = routeMode(), st = stops(mode), order = [], pts = [];
    st.forEach(function (s) { if (hasLL(s.v)) { order.push(s.v); } });
    /* Recorrido */
    if (S.map.rec) {
      var path = order.filter(function (v, i) { return i === 0 || order[i - 1] !== v; }).map(function (v) { return [V(v).lat, V(v).lng]; });
      if (path.length > 1) { L.polyline(path, { color: '#1d3a0b', weight: 5, opacity: .85 }).addTo(map); }
    }
    /* Traslados */
    if (S.map.trl) {
      D.transfers.filter(function (t) { return t.day === S.day && (!S.map.mine || !S.me || hasMine(t.areas)); }).forEach(function (t) {
        if (t.from && hasLL(t.from) && hasLL(t.to) && t.from !== t.to) { L.polyline([[V(t.from).lat, V(t.from).lng], [V(t.to).lat, V(t.to).lng]], { color: '#b3470f', weight: 4, dashArray: '8 8' }).bindTooltip(esc(t.phases[0][0] + ' · ' + t.title)).addTo(map); }
      });
    }
    /* Sedes */
    var num = {}, n = 0; order.forEach(function (v) { if (!(v in num)) { num[v] = ++n; } });
    Object.keys(D.venues).filter(hasLL).forEach(function (v) {
      var on = v in num, o = V(v);
      var icon = L.divIcon({ className: 'lpin' + (on ? ' on' : ''), html: '<span>' + (on ? num[v] : '') + '</span><em>' + esc(o.n) + '</em>', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([o.lat, o.lng], { icon: icon, zIndexOffset: on ? 500 : 0, title: o.n }).bindPopup(popupHtml(v)).addTo(map);
      if (on) { pts.push([o.lat, o.lng]); }
    });
    if (!pts.length) { Object.keys(D.venues).filter(hasLL).forEach(function (v) { pts.push([V(v).lat, V(v).lng]); }); }
    if (pts.length === 1) { map.setView(pts[0], 17); } else { map.fitBounds(pts, { padding: [36, 36], maxZoom: 17 }); }
    map.on('locationfound', function (e) {
      if (!X.lme) { X.lme = L.circleMarker(e.latlng, { radius: 8, color: '#fff', weight: 3, fillColor: '#2b7de9', fillOpacity: 1 }).addTo(map); X.lacc = L.circle(e.latlng, { radius: e.accuracy, color: '#2b7de9', weight: 1, fillOpacity: .1 }).addTo(map); map.setView(e.latlng, Math.max(map.getZoom(), 16)); }
      else { X.lme.setLatLng(e.latlng); X.lacc.setLatLng(e.latlng).setRadius(e.accuracy); }
    });
    map.on('locationerror', function () { toast('No se pudo obtener tu ubicación. Revisá el permiso de ubicación del navegador.'); S.map.loc = false; var b = document.querySelector('[data-act="map-loc"]'); if (b) { b.setAttribute('aria-pressed', 'false'); } });
    if (S.map.loc) { map.locate({ watch: true, enableHighAccuracy: true }); }
  }, function () { el.innerHTML = '<p class="small muted" style="padding:14px">No se pudo cargar el mapa. Con conexión se carga una vez y queda guardado.</p>'; });
}
function vMapa() {
  var mode = routeMode(), nomapUsed = [];
  stops('day').concat(S.me ? stops('mine') : []).forEach(function (s) { if (!hasLL(s.v) && nomapUsed.indexOf(s.v) < 0) { nomapUsed.push(s.v); } });
  D.transfers.filter(function (t) { return t.day === S.day; }).forEach(function (t) { [t.from, t.to].forEach(function (v) { if (v && !hasLL(v) && nomapUsed.indexOf(v) < 0) { nomapUsed.push(v); } }); });
  var chips = '<div class="chips">' + (S.me ? '<button class="chip" type="button" data-maptab="day" aria-pressed="' + (mode === 'day') + '">Recorrido del festival</button><button class="chip" type="button" data-maptab="mine" aria-pressed="' + (mode === 'mine') + '">Mi recorrido</button>' : '') +
    '<button class="chip" type="button" data-layer="trl" aria-pressed="' + S.map.trl + '">Traslados</button><button class="chip" type="button" data-act="map-loc" aria-pressed="' + !!S.map.loc + '">Mi ubicación</button></div>';
  var act = stops(mode).map(function (s) { return s.v; }).filter(hasLL);
  var all = Object.keys(D.venues).filter(hasLL).sort(function (a, b) { var x = act.indexOf(a), y = act.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
  var cards = all.map(function (v) {
    var o = V(v), li = D.events.filter(function (e) { return e.day === S.day && e.v === v; }).sort(by('s')).map(function (e) { return '<li><b class="num">' + f(e.s) + '</b> ' + esc(e.t) + '</li>'; }).join('') +
      D.transfers.filter(function (t) { return t.day === S.day && (t.to === v || t.from === v); }).map(function (t) { return '<li><b class="num">' + esc(t.phases[0][0]) + '</b> Traslado: ' + esc(t.title) + '</li>'; }).join('');
    return det('v-' + v, '', '<span class="sum-t">' + esc(o.n) + '</span><div class="sum-m">' + esc(o.addr || '') + '</div>',
      (li ? '<ul class="plain small">' + li + '</ul>' : '<p class="muted small">Sin actividades este día.</p>') + '<a class="btn sm" href="' + gmaps(v) + '" target="_blank" rel="noopener">Cómo llegar ↗</a>');
  }).join('');
  return dayHead('Mapa y sedes') + chips + '<div class="lmap" id="lmap"></div>' +
    '<p class="small muted">Tiempos a pie estimados por distancia (unos 4,5 km/h). Tocá una sede para ver qué pasa ahí.</p>' +
    (nomapUsed.length ? '<section class="card"><h3>Sin ubicación en el mapa</h3><ul class="plain small">' + nomapUsed.map(function (v) { return '<li><b>' + esc(V(v).n) + '</b>' + (V(v).addr ? ' · ' + esc(V(v).addr) : '') + '</li>'; }).join('') + '</ul></section>' : '') +
    '<section class="card"><h3>' + (mode === 'mine' ? 'Mi recorrido' : 'Recorrido del festival') + '</h3>' + routeList(mode) + '</section>' +
    '<p class="kicker">Sedes</p>' + cards;
}
/* ---------- Más ---------- */
function vArte() {
  var list = D.art.filter(function (a) { return a.day === S.day; });
  var cards = list.map(function (a) {
    var idx = D.art.indexOf(a), title = a.t || (a.v ? V(a.v).n + (a.room ? ' · ' + a.room : '') : 'Todas las sedes');
    var evs = (a.ev || []).map(function (id) { return X.ev[id]; }).filter(Boolean);
    var inner = (a.v ? '<div class="mt">' + venueLink(a.v, a.t ? a.room : '') + '</div>' : '') +
      '<ol class="phases">' + a.win.map(function (w) { return '<li><b>' + esc(w[0]) + ' a ' + esc(w[1]) + '</b><span>' + esc(w[2]) + '</span></li>'; }).join('') + '</ol>' +
      (evs.length ? '<p class="kicker">Actividades</p><ul class="plain small">' + evs.map(function (e) { return '<li><b class="num">' + f(e.s) + '</b> ' + esc(e.t) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="kicker">Qué ambientar</p><ul class="checks">' + a.items.map(function (c, j) { var id = 'ar' + idx + '-' + j; return '<li class="' + (S.done[id] ? 'done' : '') + '" data-row="' + id + '">' + chk(id, c) + '<span>' + esc(c) + '</span></li>'; }).join('') + '</ul>' +
      (a.note ? '<p class="nt small muted">' + esc(a.note) + '</p>' : '');
    return det('art-' + idx, '', '<span class="sum-t">' + esc(title) + '</span><div class="sum-m num">' + esc(a.win.map(function (w) { return w[0] + ' a ' + w[1]; }).join(' · ')) + '</div>', inner);
  }).join('');
  return dayHead('Ambientación') + '<p class="small muted">' + esc(D.notes.arte) + '</p>' + (cards || '<p class="card muted">Sin ambientación este día.</p>');
}
function vEquipo() {
  var cards = X.ak.map(function (a) {
    var ps = X.members[a];
    return '<section class="card"><div class="area-h">' + ad(a) + '<h3>' + esc(A(a).n) + '</h3><span class="muted small">' + ps.length + '</span></div><div class="people">' +
      (ps.length ? ps.map(function (id) { var p = X.pp[id]; return '<span class="person' + (id === S.me ? ' me' : '') + '">' + esc(p.n + (p.r ? ' (' + p.r + ')' : '')) + '</span>'; }).join('') : '<span class="muted small">Sin integrantes cargados</span>') + '</div></section>';
  }).join('');
  var none = D.people.filter(function (p) { return !p.a.length; });
  if (none.length) { cards += '<section class="card"><div class="area-h"><i class="ad"></i><h3>Sin área asignada</h3><span class="muted small">' + none.length + '</span></div><div class="people">' + none.map(function (p) { return '<span class="person' + (p.id === S.me ? ' me' : '') + '">' + esc(p.n + (p.r ? ' (' + p.r + ')' : '')) + '</span>'; }).join('') + '</div></section>'; }
  return head('Equipo', D.people.length + ' personas') + '<div class="cols">' + cards + '</div><p class="small muted">' + esc(D.notes.equipo) + '</p>';
}
function coordGaps(d) { return D.events.filter(function (e) { return e.day === d && areasFor(e.id).indexOf('coo') < 0; }); }
function vPendientes() {
  var out = head('Pendientes y avisos', '') + '<p class="small muted">Lo que falta confirmar y lo que hay que tener en cuenta cada día. Pensado para coordinación.</p>';
  if (D.pending && D.pending.length) { out += '<section class="card warn"><h3>Falta confirmar</h3><ul class="plain small">' + D.pending.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>'; }
  D.days.forEach(function (d, i) {
    var al = (D.alerts[i] || []).slice(), g = coordGaps(i);
    if (g.length) { al.push('Coordinación no tiene a nadie asignado en: ' + g.map(function (e) { return f(e.s) + ' ' + e.t; }).join('; ') + '.'); }
    if (!al.length) { return; }
    var key = 'pend-' + i; if (i === S.day && !(key in X.open)) { X.open[key] = 1; }
    out += det(key, '', '<span class="sum-t">' + esc(d.name + ' ' + d.k) + '</span><div class="sum-m">' + al.length + ' avisos' + (X.chg['al:' + i] ? ' <span class="badge chg">Cambió</span>' : '') + '</div>', '<ul class="plain small">' + al.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
  });
  return out;
}
function vAntesCard() {
  if (!D.pre || !D.pre.length) { return ''; }
  return det('antes', '', '<span class="sum-t">Antes del festival</span><div class="sum-m">Fechas decisivas de la previa</div>', D.pre.map(function (p) { return '<p class="kicker">' + esc(p[0]) + '</p><ul class="plain small">' + p[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }).join(''));
}
function vAntes() { var k = 'antes'; if (!(k in X.open)) { X.open[k] = 1; } return head('Antes del festival', '') + vAntesCard(); }
function vMas() {
  var it = [['mapa', 'Mapa y sedes', 'Dónde queda cada lugar y el recorrido del día'], ['arte', 'Ambientación', 'Qué ambienta Arte en cada sede'], ['equipo', 'Equipo', 'Quién está en cada área'], ['pendientes', 'Pendientes y avisos', 'Lo que falta confirmar, por día'], ['antes', 'Antes del festival', 'Fechas de la previa'], ['novedades', 'Novedades', 'Historial de cambios'], ['ajustes', 'Ajustes', 'Tu nombre, tema, avisos e instalación']];
  return head('Más', '') + '<ul class="menu">' + it.map(function (x) { return '<li><button type="button" data-go="' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></button></li>'; }).join('') + '</ul>';
}
function vAjustes() {
  var th = lsGet(K.theme) || 'auto', perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var out = head('Ajustes', '');
  out += '<section class="card"><h3>Quién sos</h3>' + whoSelect() + '<p class="small muted">Se guarda solo en este teléfono.</p></section>';
  out += '<section class="card"><h3>Tema</h3><div class="chips" style="margin:0;padding:0">' + [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(function (t) { return '<button class="chip" type="button" data-theme="' + t[0] + '" aria-pressed="' + (th === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></section>';
  out += '<section class="card"><h3>Avisos de cambios</h3><p class="small">Cuando se publica un cambio en la logística, la guía te avisa con un mensaje y lo marca en Novedades. Revisa al abrirse y cada ' + (CFG.pollMinutes || 5) + ' minutos mientras está abierta.</p>' +
    (perm === 'unsupported' ? '<p class="small muted">Este navegador no permite avisos del sistema.</p>' : '<button class="btn sm' + (S.notif && perm === 'granted' ? '' : ' pri') + '" type="button" data-act="notif">' + (S.notif && perm === 'granted' ? 'Desactivar avisos del sistema' : 'Activar avisos del sistema') + '</button>' + (perm === 'denied' ? '<p class="small muted">Los avisos están bloqueados en la configuración del navegador.</p>' : '')) + '</section>';
  out += '<section class="card"><h3>Datos</h3><p class="small">' + (SYNC.at ? 'Última revisión: ' + clock(SYNC.at) : 'Todavía no se revisó.') + '</p><p class="small muted">Fuente: ' + esc(D.meta && D.meta.source || 'data.json') + '</p>' + (SYNC.msg ? '<p class="small fl">' + esc(SYNC.msg) + '</p>' : '') +
    '<div class="row-btns"><button class="btn sm pri" type="button" data-act="sync">Buscar actualizaciones</button><button class="btn sm" type="button" data-act="reset">Desmarcar todas las tareas</button></div></section>';
  out += '<section class="card"><h3>Instalar en el teléfono</h3>' + installHelp() + '</section>';
  out += '<section class="card"><h3>Cómo se usa</h3><ul class="plain small"><li><b>Mi día</b>: tus tareas, la próxima con cuánto falta y cómo llegar.</li><li>Arriba elegís el día. Tocá cualquier tarjeta para ver el detalle.</li><li>Los círculos marcan tareas y cargas hechas (se guardan en tu teléfono).</li><li>La campana muestra los cambios. <span class="badge chg">Cambió</span> marca lo que se modificó.</li><li>El punto de arriba dice si los datos están al día.</li></ul></section>';
  return out;
}
function vNovedades() {
  var items = NEWS.items, read = X.readBefore != null ? X.readBefore : NEWS.read;
  var out = head('Novedades', items.length ? items.length + ' cambios' : '');
  if (!items.length) { return out + '<p class="card muted">Todavía no hubo cambios desde que abriste la guía. Cuando se actualice algo, aparece acá.</p>'; }
  out += '<ul class="news">' + items.slice(0, 120).map(function (n) {
    var go = n.view ? n.view + (n.day != null && DAY_VIEWS[n.view] ? '-' + D.days[n.day].k : '') : '';
    return '<li class="' + (n.at > read ? 'unread' : '') + '"><span class="when">' + clock(n.at) + (n.mine ? ' · <b>te toca</b>' : '') + '</span><span>' + esc(n.text) + '</span>' + (go ? '<a href="#' + go + '">Ver</a>' : '') + '</li>';
  }).join('') + '</ul>';
  return out;
}

/* ---------- Render ---------- */
var app = $('app');
var VIEWS = { hoy: vHoy, programa: vPrograma, turnos: vTurnos, traslados: vTraslados, mapa: vMapa, arte: vArte, equipo: vEquipo, pendientes: vPendientes, antes: vAntes, mas: vMas, ajustes: vAjustes, novedades: vNovedades };
function renderDays() {
  var el = $('days'); el.hidden = !DAY_VIEWS[S.view]; if (el.hidden) { return; }
  var ti = todayIdx();
  el.innerHTML = D.days.map(function (d, i) { return '<button class="day' + (i === ti ? ' today' : '') + (X.chgDay[i] ? ' chg' : '') + '" type="button" data-day="' + i + '" aria-pressed="' + (S.day === i) + '" aria-label="' + esc(d.name + ' ' + d.k) + (i === ti ? ', hoy' : '') + '"><small>' + esc(d.dow) + '</small><b>' + d.k + '</b></button>'; }).join('');
}
function renderNav() {
  var cur = SUB_VIEWS[S.view] ? 'mas' : S.view;
  document.querySelectorAll('#nav [data-go]').forEach(function (b) { if (b.getAttribute('data-go') === cur) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); } });
  var unread = NEWS.items.filter(function (n) { return n.at > NEWS.read; }).length, bc = $('bellcount');
  bc.hidden = !unread; bc.textContent = unread > 99 ? '99+' : unread;
  $('bell').setAttribute('aria-label', 'Novedades' + (unread ? ': ' + unread + ' sin leer' : ''));
}
function renderSync() {
  var b = $('sync'), off = SYNC.state === 'off' || SYNC.state === 'err';
  b.className = 'sync' + (SYNC.state === 'busy' ? ' busy' : off ? ' off' : '');
  b.innerHTML = SYNC.state === 'busy' ? '<span class="lbl">Actualizando…</span>' : off ? '<span class="lbl">' + (SYNC.state === 'off' ? 'Sin conexión' : 'Sin actualizar') + '</span>' : (SYNC.at ? '<span class="lbl">Al día · </span>' + clock(SYNC.at) : 'Al día');
  b.title = SYNC.msg || 'Tocá para buscar actualizaciones';
}
function render(keepScroll) {
  if (!D) { return; }
  var y = window.scrollY;
  renderDays(); renderNav(); renderSync();
  killMap();
  app.innerHTML = (VIEWS[S.view] || vHoy)();
  if (S.view === 'mapa') { mountMap(); }
  if (S.view === 'novedades') { markRead(); }
  if (keepScroll) { window.scrollTo(0, y); }
}
function markRead() { if (X.readBefore == null) { X.readBefore = NEWS.read; } NEWS.read = Date.now(); lsSet(K.news, NEWS); buildChg(); renderNav(); renderDays(); }

/* ---------- Navegación ---------- */
function setHash() { var h = '#' + S.view + (DAY_VIEWS[S.view] ? '-' + D.days[S.day].k : ''); if (location.hash !== h) { history.pushState(null, '', h); } }
function readHash() {
  var r = /^#([a-z]+)(?:-(\d+))?$/.exec(location.hash || '');
  if (!r || !VIEWS[r[1]]) { return false; }
  S.view = r[1];
  if (r[2]) { var i = D.days.findIndex(function (d) { return String(d.k) === r[2]; }); if (i > -1) { S.day = i; } }
  return true;
}
function go(view) { if (view !== 'novedades') { X.readBefore = null; } S.view = view; setHash(); render(); window.scrollTo(0, 0); }
window.addEventListener('popstate', function () { if (D && readHash()) { X.readBefore = null; render(); } });

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-go],[data-day],[data-done],[data-tarea],[data-mine],[data-layer],[data-maptab],[data-theme],[data-act]');
  if (!t) { return; }
  if (!D && !/^pdf/.test(t.getAttribute('data-act') || '')) { return; }
  if (t.hasAttribute('data-go')) { go(t.getAttribute('data-go')); return; }
  if (t.hasAttribute('data-day')) { S.day = +t.getAttribute('data-day'); setHash(); render(); return; }
  if (t.hasAttribute('data-done')) {
    e.preventDefault();
    var id = t.getAttribute('data-done'); if (S.done[id]) { delete S.done[id]; } else { S.done[id] = 1; } saveS();
    var on = !!S.done[id]; t.setAttribute('aria-pressed', on);
    document.querySelectorAll('[data-row="' + id + '"]').forEach(function (r) { r.classList.toggle('done', on); });
    return;
  }
  if (t.hasAttribute('data-tarea')) { S.tarea = t.getAttribute('data-tarea'); saveS(); render(true); return; }
  if (t.hasAttribute('data-mine')) { S.mineOnly = t.getAttribute('data-mine') === '1'; saveS(); render(true); return; }
  if (t.hasAttribute('data-layer')) { var l = t.getAttribute('data-layer'); S.map[l] = !S.map[l]; render(true); return; }
  if (t.hasAttribute('data-maptab')) { S.map.mine = t.getAttribute('data-maptab') === 'mine'; render(true); return; }
  if (t.hasAttribute('data-theme')) { var th = t.getAttribute('data-theme'); if (th === 'auto') { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem(K.theme); } catch (er) {} } else { document.documentElement.setAttribute('data-theme', th); lsSet(K.theme, th); } render(true); return; }
  var act = t.getAttribute('data-act');
  if (act === 'sync') { pull(true); }
  else if (act === 'reset') { S.done = {}; saveS(); render(true); toast('Se desmarcaron todas las tareas.'); }
  else if (act === 'install') { if (X.bip) { X.bip.prompt(); X.bip.userChoice.then(function () { X.bip = null; X.canInstall = false; render(true); }); } }
  else if (act === 'install-hide') { lsSet(K.inst, 1); render(true); }
  else if (act === 'notif') { toggleNotif(); }
  else if (act === 'reload') { location.reload(); }
  else if (act === 'pdf') { var dl = $('pdfsheet'); getPdfFile().catch(function () {}); if (dl.showModal) { dl.showModal(); } else { window.open(PDF, '_blank'); } }
  else if (act === 'pdf-close') { $('pdfsheet').close(); }
  else if (act === 'pdf-share') { sharePdf(); }
  else if (act === 'map-mine') { S.map.mine = true; go('mapa'); }
  else if (act === 'map-loc') { S.map.loc = !S.map.loc; t.setAttribute('aria-pressed', S.map.loc); if (X.lmap) { if (S.map.loc) { X.lmap.locate({ watch: true, enableHighAccuracy: true }); } else { X.lmap.stopLocate(); if (X.lme) { X.lmap.removeLayer(X.lme); X.lmap.removeLayer(X.lacc); X.lme = null; } } } }
});
$('sync').addEventListener('click', function () { pull(true); });
$('pdfsheet').addEventListener('click', function (e) { if (e.target === this) { this.close(); } });
document.addEventListener('change', function (e) {
  if (e.target.id !== 'who') { return; }
  S.me = e.target.value; S.tarea = ''; saveS(); render(true);
});
document.addEventListener('toggle', function (e) {
  var d = e.target; if (!d.matches || !d.matches('details[data-k]')) { return; }
  var k = d.getAttribute('data-k'); if (d.open) { X.open[k] = 1; } else { X.open[k] = 0; }
  lsSet(K.open, X.open);
}, true);

/* ---------- Avisos ---------- */
var toastTimer = null;
function toast(text, action, view) {
  var el = $('toast');
  el.innerHTML = '<p>' + esc(text) + '</p>' + (action ? '<button type="button" ' + (view === 'reload' ? 'data-act="reload"' : 'data-go="' + view + '"') + '>' + esc(action) + '</button>' : '') + '<button type="button" class="x" aria-label="Cerrar">✕</button>';
  el.hidden = false;
  el.querySelector('.x').onclick = function () { el.hidden = true; };
  el.onclick = function (ev) { if (ev.target.closest('[data-go],[data-act]')) { el.hidden = true; } };
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, action ? 12000 : 4000);
}
function toggleNotif() {
  if (!('Notification' in window)) { return; }
  if (S.notif && Notification.permission === 'granted') { S.notif = false; saveS(); render(true); return; }
  Notification.requestPermission().then(function (p) { S.notif = p === 'granted'; saveS(); render(true); if (S.notif) { toast('Listo: te vamos a avisar cuando cambie algo.'); } });
}
function sysNotify(title, body) {
  if (!S.notif || !('Notification' in window) || Notification.permission !== 'granted') { return; }
  var opt = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'faa-cambios', renotify: true, data: { url: location.pathname + '#novedades' } };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) { navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, opt); }).catch(function () {}); }
  else { try { new Notification(title, opt); } catch (e) {} }
}

/* ---------- Comparar versiones y registrar cambios ---------- */
function rng(o) { return f(o.s) + (o.e != null ? ' a ' + f(o.e) : ''); }
function idMap(arr, key) { var o = {}; (arr || []).forEach(function (x, i) { o[key ? key(x, i) : x.id] = x; }); return o; }
function J(x) { return JSON.stringify(x); }
function diff(Aa, B) {
  var out = [], meId = S.me;
  var Bmembers = {}; Object.keys(B.areas).forEach(function (a) { Bmembers[a] = B.people.filter(function (p) { return p.a.indexOf(a) > -1; }).map(function (p) { return p.id; }); });
  var meP = (B.people || []).filter(function (p) { return p.id === meId; })[0], meA = meP ? meP.a : [];
  function hit(list) { return (list || []).some(function (z) { return meA.indexOf(z) > -1; }); }
  function vn(v, room) { var o = B.venues[v] || Aa.venues[v] || { n: v || 'A confirmar' }; return o.n + (room ? ' · ' + room : ''); }
  function push(o) { out.push(o); }
  function evAreasIn(D0, id) { var s = {}; D0.shifts.forEach(function (x) { if ((x.ev || []).indexOf(id) > -1) { s[x.area] = 1; } }); return Object.keys(s); }
  var a = idMap(Aa.events), b = idMap(B.events);
  Object.keys(b).forEach(function (id) {
    var n = b[id], o = a[id], base = { ref: 'ev:' + id, day: n.day, view: 'programa', mine: hit(evAreasIn(B, id).concat(n.leadAreas || [])) };
    function p(t) { push(Object.assign({}, base, { text: t })); }
    if (!o) { p('Nueva actividad: “' + n.t + '” (' + dl(n.day) + ', ' + f(n.s) + ')'); return; }
    if (o.s !== n.s || o.e !== n.e || o.day !== n.day) { p('Cambió el horario de “' + n.t + '”: ' + dl(o.day) + ' ' + rng(o) + ' → ' + dl(n.day) + ' ' + rng(n)); }
    if (o.v !== n.v || o.room !== n.room) { p('Cambió el lugar de “' + n.t + '”: ' + vn(o.v, o.room) + ' → ' + vn(n.v, n.room)); }
    if (o.t !== n.t) { p('Cambió el nombre: “' + o.t + '” → “' + n.t + '”'); }
    if (o.d !== n.d || o.flag !== n.flag || o.lead !== n.lead || o.tag !== n.tag) { p('Se actualizó la información de “' + n.t + '”'); }
    if (J(o.films) !== J(n.films)) { p('Se actualizó la selección de “' + n.t + '”'); }
  });
  Object.keys(a).forEach(function (id) { if (!b[id]) { push({ ref: 'ev:' + id, day: a[id].day, view: 'programa', mine: false, text: 'Se quitó del programa: “' + a[id].t + '” (' + dl(a[id].day) + ', ' + f(a[id].s) + ')' }); } });

  a = idMap(Aa.shifts); b = idMap(B.shifts); var whoG = {}, sugG = {};
  function shMine(x) { return !!meId && (x.pids ? x.pids : (Bmembers[x.area] || [])).indexOf(meId) > -1; }
  Object.keys(b).forEach(function (id) {
    var n = b[id], o = a[id], base = { ref: 'sh:' + id, day: n.day, view: 'turnos', mine: shMine(n) || (o ? shMine(o) : false) };
    function p(t) { push(Object.assign({}, base, { text: t })); }
    var who = (B.areas[n.area] || { n: n.area }).n;
    if (!o) { p('Nueva tarea de ' + who + ': “' + n.t + '” (' + dl(n.day) + ', ' + f(n.s) + ')'); return; }
    if (o.s !== n.s || o.e !== n.e || o.day !== n.day) { p('Cambió el horario de “' + n.t + '” (' + who + '): ' + dl(o.day) + ' ' + rng(o) + ' → ' + dl(n.day) + ' ' + rng(n)); }
    if (o.v !== n.v) { p('Cambió el lugar de “' + n.t + '”: ' + vn(o.v) + ' → ' + vn(n.v)); }
    if (o.t !== n.t) { p('Tarea de ' + who + ' renombrada: “' + n.t + '”'); }
    if (J(o.who) !== J(n.who) || J(o.pids) !== J(n.pids)) { (whoG[n.area] = whoG[n.area] || []).push(Object.assign({}, base, { text: 'Cambiaron las personas de “' + n.t + '”: ' + ((n.who || []).join(' · ') || 'toda el área') })); }
    if (!!o.sug !== !!n.sug) { (sugG[n.area] = sugG[n.area] || []).push(Object.assign({}, base, { text: '“' + n.t + '” ' + (n.sug ? 'ahora es una sugerencia (no es del cronograma)' : 'ahora es una tarea del cronograma') })); }
    if (o.note !== n.note) { p('Nueva nota en “' + n.t + '”'); }
  });
  Object.keys(sugG).forEach(function (ar) {
    var g = sugG[ar]; if (g.length <= 2) { g.forEach(push); return; }
    push({ ref: g[0].ref, refs: g.map(function (x) { return x.ref; }), day: g[0].day, view: 'turnos', mine: g.some(function (x) { return x.mine; }), text: g.length + ' tareas de ' + (B.areas[ar] || { n: ar }).n + ' pasaron a «Sugerencias»: no son del cronograma oficial' });
  });
  Object.keys(whoG).forEach(function (ar) {
    var g = whoG[ar]; if (g.length <= 2) { g.forEach(push); return; }
    push({ ref: g[0].ref, refs: g.map(function (x) { return x.ref; }), day: g[0].day, view: 'turnos', mine: g.some(function (x) { return x.mine; }), text: 'Cambiaron las personas asignadas en ' + g.length + ' tareas de ' + (B.areas[ar] || { n: ar }).n });
  });
  Object.keys(a).forEach(function (id) { if (!b[id]) { var o = a[id]; push({ ref: 'sh:' + id, day: o.day, view: 'turnos', mine: shMine(o), text: 'Se quitó la tarea “' + o.t + '” (' + dl(o.day) + ', ' + f(o.s) + ')' }); } });

  a = idMap(Aa.transfers); b = idMap(B.transfers);
  Object.keys(b).forEach(function (id) {
    var n = b[id], o = a[id], base = { ref: 'tr:' + id, day: n.day, view: 'traslados', mine: hit(n.areas) };
    function p(t) { push(Object.assign({}, base, { text: t })); }
    if (!o) { p('Nuevo traslado: “' + n.title + '” (' + dl(n.day) + ')'); return; }
    if (J(o.phases.map(function (x) { return [x[0], x[1]]; })) !== J(n.phases.map(function (x) { return [x[0], x[1]]; })) || o.day !== n.day) { p('Cambió el horario del traslado “' + n.title + '”: ' + n.phases.map(function (x) { return x[0]; }).join(', ')); }
    else if (J(o.phases) !== J(n.phases)) { p('Se actualizó el detalle del traslado “' + n.title + '”'); }
    if (o.from !== n.from || o.to !== n.to) { p('Cambió el recorrido de “' + n.title + '”: ' + vn(n.from) + ' → ' + vn(n.to)); }
    if (J(o.check) !== J(n.check)) { p('Cambió la lista de carga de “' + n.title + '”'); }
    if (J(o.areas) !== J(n.areas)) { p('Cambiaron las áreas del traslado “' + n.title + '”'); }
    if (o.note !== n.note || o.title !== n.title) { p('Se actualizó la información del traslado “' + n.title + '”'); }
  });
  Object.keys(a).forEach(function (id) { if (!b[id]) { push({ ref: 'tr:' + id, day: a[id].day, view: 'traslados', mine: hit(a[id].areas), text: 'Se quitó el traslado “' + a[id].title + '” (' + dl(a[id].day) + ')' }); } });

  a = idMap(Aa.people); b = idMap(B.people);
  function an(list) { return list.length ? list.map(function (z) { return (B.areas[z] || { n: z }).n; }).join(' y ') : 'sin área asignada'; }
  var added = [];
  Object.keys(b).forEach(function (k) { var n = b[k], o = a[k];
    if (!o) { added.push(n); return; }
    if (o.n !== n.n) { push({ ref: 'pp:' + k, view: 'equipo', mine: k === meId, text: o.n + ' figura ahora como ' + n.n }); }
    if (J(o.a) !== J(n.a)) { push({ ref: 'pp:' + k, view: 'equipo', mine: k === meId, text: n.n + ' ahora está en ' + an(n.a) }); } });
  if (added.length > 3) { push({ ref: 'pp:new', view: 'equipo', mine: false, text: 'Se sumaron ' + added.length + ' personas al equipo: ' + added.map(function (n) { return n.n + ' (' + an(n.a) + ')'; }).join(', ') }); }
  else { added.forEach(function (n) { push({ ref: 'pp:' + n.id, view: 'equipo', mine: hit(n.a), text: 'Se sumó ' + n.n + ' (' + an(n.a) + ')' }); }); }
  Object.keys(a).forEach(function (k) { if (!b[k]) { push({ ref: 'pp:' + k, view: 'equipo', mine: false, text: a[k].n + ' ya no figura en el equipo' }); } });

  (B.days || []).forEach(function (d, i) { if (J((Aa.alerts || [])[i]) !== J((B.alerts || [])[i])) { push({ ref: 'al:' + i, day: i, view: 'pendientes', mine: false, text: 'Hay avisos nuevos o actualizados para el ' + dlong(i) }); } });
  if (J(Aa.pending) !== J(B.pending)) { push({ ref: 'pend', view: 'pendientes', mine: false, text: 'Se actualizó la lista de pendientes' }); }
  if (J(Aa.meals) !== J(B.meals)) { push({ ref: 'meals', view: 'hoy', mine: true, text: 'Cambió el horario del almuerzo o la merienda' }); }
  if (J(Aa.art) !== J(B.art)) { push({ ref: 'art', view: 'arte', mine: meA.indexOf('art') > -1, text: 'Se actualizó la ambientación de Arte' }); }
  if (J(Aa.venues) !== J(B.venues)) { push({ ref: 'ven', view: 'mapa', mine: false, text: 'Se actualizaron las sedes o sus direcciones' }); }
  return out;
}
function addNews(list) {
  var at = Date.now();
  list.forEach(function (n) { n.at = at; });
  NEWS.items = list.concat(NEWS.items).slice(0, 200);
  lsSet(K.news, NEWS);
  var mine = list.filter(function (n) { return n.mine; }).length;
  var txt = list.length === 1 ? 'Cambió la logística: ' + list[0].text : 'Se actualizó la logística: ' + list.length + ' cambios' + (mine ? ' (' + mine + (mine === 1 ? ' te toca' : ' te tocan') + ')' : '');
  toast(txt, 'Ver', 'novedades');
  if (mine && navigator.vibrate) { try { navigator.vibrate([60, 40, 60]); } catch (e) {} }
  if (document.visibilityState !== 'visible' || mine) { sysNotify(mine ? 'Cambió algo que te toca' : 'Cambios en la logística FAA!', list.length === 1 ? list[0].text : list.slice(0, 3).map(function (n) { return n.text; }).join('\n')); }
}

/* ---------- Datos: carga, planillas y actualización ---------- */
function stripMeta(d) { var c = Object.assign({}, d); delete c.meta; return c; }
function apply(nd, quiet) {
  var h = hash(J(stripMeta(nd)));
  if (D && h === DH) { return false; }
  var changes = (D && !quiet) ? diff(D, nd) : [];
  D = nd; DH = h; lsSet(K.data, { h: h, data: nd });
  prep();
  if (changes.length) { addNews(changes); buildChg(); }
  return true;
}
function fetchOK(url, type) {
  return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) { throw new Error(r.status); } return type === 'json' ? r.json().then(function (j) { return { j: j, cached: r.headers.get('x-faa-cache') === '1' }; }) : r.text(); });
}
var pulling = null;
function pull(manual) {
  if (pulling) { return pulling; }
  SYNC.state = 'busy'; renderSync();
  pulling = fetchOK('data.json', 'json').then(function (res) {
    var nd = res.j, errs = [];
    return Promise.resolve().then(function () {
        if (res.cached) {
          if (!D) { apply(nd, true); app.dataset.ready = '1'; }
          SYNC.state = 'off'; SYNC.msg = 'Sin conexión: se muestran los datos guardados.'; renderSync();
          if (manual) { toast(SYNC.msg); }
          return;
        }
        var changed = apply(nd);
        SYNC.state = 'ok'; SYNC.at = Date.now(); SYNC.msg = errs.length ? 'No se pudo leer: ' + errs.join(', ') : '';
        lsSet(K.sync, { at: SYNC.at });
        if (changed || !app.dataset.ready) { app.dataset.ready = '1'; render(true); } else { renderSync(); if (S.view === 'ajustes') { render(true); } }
        if (manual && !changed) { toast(errs.length ? SYNC.msg : 'Ya tenés la última versión.'); }
      });
  }).catch(function () {
    SYNC.state = navigator.onLine ? 'err' : 'off'; SYNC.msg = navigator.onLine ? 'No se pudo actualizar. Se muestran los datos guardados.' : 'Sin conexión: se muestran los datos guardados.';
    renderSync(); if (manual) { toast(SYNC.msg); }
    if (!D) { app.innerHTML = '<section class="card warn"><h3>No se pudo cargar la guía</h3><p class="small">Conectate a internet una vez para descargarla. Después funciona sin señal.</p><button class="btn sm pri" type="button" data-act="sync">Reintentar</button></section>'; }
  }).then(function () { pulling = null; });
  return pulling;
}

/* ---------- Instalación y service worker ---------- */
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); X.bip = e; X.canInstall = true; if (D && (S.view === 'hoy' || S.view === 'ajustes')) { render(true); } });
window.addEventListener('appinstalled', function () { X.canInstall = false; X.bip = null; toast('¡Listo! La guía quedó instalada.'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  var hadCtrl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(function () {});
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtrl) { toast('Hay una versión nueva de la guía.', 'Recargar', 'reload'); } hadCtrl = true; });
}

/* ---------- Arranque ---------- */
function start() {
  var c = lsGet(K.data);
  if (c && c.data && c.data.days) { D = c.data; DH = c.h; prep(); }
  if (D) { boot(); }
  pull().then(function () { if (D && !app.dataset.booted) { boot(); } });
  setInterval(function () { if (document.visibilityState === 'visible') { pull(); } }, (CFG.pollMinutes || 5) * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (!SYNC.at || Date.now() - SYNC.at > 60000)) { pull(); } if (D && document.visibilityState === 'visible') { render(true); } });
  window.addEventListener('online', function () { pull(); });
  window.addEventListener('offline', function () { SYNC.state = 'off'; renderSync(); });
  setInterval(function () { if (D && document.visibilityState === 'visible' && (S.view === 'hoy' || S.view === 'programa')) { render(true); } }, 60000);
}
function boot() {
  app.dataset.booted = '1'; app.dataset.ready = '1';
  var ti = todayIdx(); S.day = ti > -1 ? ti : 0;
  if (!readHash()) { S.view = 'hoy'; history.replaceState(null, '', '#hoy-' + D.days[S.day].k); }
  render();
}
start();
})();
