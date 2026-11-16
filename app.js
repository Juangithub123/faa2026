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
var S = { me: '', done: {}, tarea: '', mineOnly: false, notif: false, day: 0, view: 'hoy', map: { rec: true, trl: true, full: false } };
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
    (x.ev || []).forEach(function (id) { (X.evAreas[id] = X.evAreas[id] || {})[x.area] = 1; });
  });
  if (S.me && !X.pp[S.me]) { S.me = ''; }
  buildChg();
}
function buildChg() { X.chg = {}; X.chgDay = {}; var recent = Date.now() - 12 * 3600000; NEWS.items.forEach(function (n) { if (n.at > NEWS.read || n.at > recent) { X.chg[n.ref] = 1; if (n.day != null) { X.chgDay[n.day] = 1; } } }); }
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
function whoNames(area, evId) { var out = []; D.shifts.forEach(function (x) { if (x.area === area && (x.ev || []).indexOf(evId) > -1) { (x.who || []).forEach(function (w) { if (out.indexOf(w) < 0) { out.push(w); } }); } }); return out; }

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
  return t.length ? '<span class="relevo">Relevo de ' + t.join(' y ') + '</span>' : '';
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
  return '<li class="it' + (done ? ' done' : '') + (now ? ' now' : '') + '" data-row="' + x.id + '">' + chk(x.id, x.t) +
    '<div class="tm"><b>' + f(x.s) + '</b><span>a ' + f(x.e) + '</span></div><div class="bd">' +
    '<p class="t">' + (now ? '<span class="badge now">Ahora</span> ' : '') + (X.chg['sh:' + x.id] ? '<span class="badge chg">Cambió</span> ' : '') + esc(x.t) + '</p>' +
    '<div class="mt">' + venueLink(x.v) + (opt.area ? '<span class="tags">' + areaTag(x.area) + '</span>' : '') + relevo(x.s, x.e) + '</div>' +
    (x.note ? '<p class="nt">' + esc(x.note) + '</p>' : '') + (opt.who === false ? '' : who) + '</div></li>';
}

/* ---------- Mi día ---------- */
function myShiftsAll() { return D.shifts.filter(mineShift).map(function (x) { return { x: x, a: absT(x.day, x.s), b: absT(x.day, x.e) }; }).sort(by('a')); }
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
function installCard() {
  if (!X.canInstall || lsGet(K.inst)) { return ''; }
  return '<section class="card accent"><h3>Instalá la guía en tu teléfono</h3><p class="small">Queda como una app, abre al toque y funciona sin señal.</p><div class="row-btns"><button class="btn sm pri" type="button" data-act="install">Instalar</button><button class="btn sm" type="button" data-act="install-hide">Ahora no</button></div></section>';
}
function vHoy() {
  var p = me(), out = installCard();
  if (!p) {
    return out + '<section class="card accent"><h2 style="font-size:21px">¿Quién sos?</h2><p>Elegí tu nombre: esta pantalla te va a mostrar tus tareas, dónde tenés que estar y qué cambió.</p>' + whoSelect() + '<p class="small muted">Se guarda solo en este teléfono. Lo podés cambiar en Más → Ajustes.</p></section>' + programaMini();
  }
  var list = D.shifts.filter(function (x) { return x.day === S.day && mineShift(x); }).sort(by('s'));
  var trs = D.transfers.filter(function (t) { return t.day === S.day && hasMine(t.areas); });
  out += head('Hola, ' + shortName(p.n), esc(p.a.map(function (a) { return A(a).n; }).join(' · ')));
  out += myNewsCard() + statusCard();
  out += '<div class="h" style="margin-top:4px"><p class="kicker">Tus tareas · ' + esc(D.days[S.day].name + ' ' + D.days[S.day].k) + '</p><span class="sub">' + list.length + '</span></div>';
  out += list.length ? '<ul class="list">' + list.map(function (x) { return shiftRow(x, { area: p.a.length > 1 }); }).join('') + '</ul>' : '<p class="card muted small">No tenés tareas asignadas este día.</p>';
  out += mealsLine();
  if (trs.length) { out += '<button class="btn" type="button" data-go="traslados">' + trs.length + (trs.length === 1 ? ' traslado' : ' traslados') + ' de tu área este día →</button>'; }
  out += programaMini();
  if (phase() === 'pre') { out += vAntesCard(); }
  return out;
}

/* ---------- Programa ---------- */
function evRow(e) {
  var t = Date.now(), now = t >= absT(e.day, e.s) && t < absT(e.day, evEnd(e)), mine = S.me && mineEv(e), chg = X.chg['ev:' + e.id];
  var ar = areasFor(e.id), dir = whoNames('dir', e.id), coo = whoNames('coo', e.id);
  var sum = '<div class="ev-sum"><div class="tm"><b>' + f(e.s) + '</b><span>' + (e.e != null ? f(e.e) : 'en adelante') + '</span></div><div><div class="sum-t">' + esc(e.t) + '</div><div class="sum-m"><span>' + esc(vtxt(e.v, e.room)) + '</span>' +
    (now ? '<span class="badge now">Ahora</span>' : '') + (chg ? '<span class="badge chg">Cambió</span>' : '') + (mine ? '<span class="badge mine">Tu área</span>' : '') + (e.flag ? '<span class="badge flag">A confirmar</span>' : '') + '</div></div></div>';
  var inner = (e.tag ? '<p><span class="badge">' + esc(e.tag) + '</span></p>' : '') + (e.d ? '<p>' + esc(e.d) + '</p>' : '') + (e.flag ? '<p class="fl">' + esc(e.flag) + '</p>' : '') +
    (e.lead ? kv('A cargo', esc(e.lead)) : '') +
    kv('Dirección', dir.length ? esc(dir.join(' · ')) : '<span class="muted">sin asignar</span>') +
    kv('Coordinación', coo.length ? esc(coo.join(' · ')) : '<span class="muted">sin asignar</span>') +
    (ar.length ? '<div class="tags">' + ar.map(areaTag).join('') + '</div>' : '') +
    '<div class="mt">' + venueLink(e.v, e.room) + ' ' + relevo(e.s, e.e) + '</div>';
  return det('ev-' + e.id, 'ev' + (now ? ' now' : ''), sum, inner);
}
function vPrograma() {
  var list = D.events.filter(function (e) { return e.day === S.day; }).sort(by('s'));
  if (S.mineOnly && S.me) { list = list.filter(mineEv); }
  var out = dayHead('Programa');
  if (S.me) { out += '<div class="chips"><button class="chip" type="button" data-mine="0" aria-pressed="' + !S.mineOnly + '">Todo el programa</button><button class="chip" type="button" data-mine="1" aria-pressed="' + S.mineOnly + '">Solo donde está mi área</button></div>'; }
  out += list.length ? '<div class="evlist">' + list.map(evRow).join('') + '</div>' : '<p class="card muted">Nada para mostrar con este filtro.</p>';
  out += mealsLine();
  var al = (D.alerts[S.day] || []).length;
  if (al) { out += '<button class="btn" type="button" data-go="pendientes">' + al + ' avisos y pendientes de este día →</button>'; }
  return out;
}

/* ---------- Turnos ---------- */
function bucket(s) { return s < 780 ? 'Mañana' : (s < 1140 ? 'Tarde' : 'Noche'); }
function peak(list) { var best = 0; list.forEach(function (a) { var n = list.filter(function (b) { return b.s <= a.s && b.e > a.s; }).length; if (n > best) { best = n; } }); return best; }
function areaCard(a, open) {
  var items = D.shifts.filter(function (x) { return x.day === S.day && x.area === a; }).sort(by('s'));
  var ppl = X.members[a] || [], n = ppl.length, pk = peak(items), rows = '', last = '';
  items.forEach(function (x) { var b = bucket(x.s); if (b !== last) { rows += '<li class="turno-lbl">' + b + '</li>'; last = b; } rows += shiftRow(x); });
  var warn = n === 0 ? 'Sin integrantes cargados: falta confirmar quién cubre el área.' : (pk > n ? 'Hay momentos con ' + pk + ' tareas a la vez y ' + n + (n === 1 ? ' persona' : ' personas') + ': conviene sumar apoyo.' : '');
  var sum = '<div class="area-h">' + ad(a) + '<span class="sum-t">' + esc(A(a).n) + '</span></div><div class="sum-m"><span>' + items.length + (items.length === 1 ? ' tarea' : ' tareas') + '</span><span>' + n + (n === 1 ? ' persona' : ' personas') + '</span>' + (warn ? '<span class="badge flag">Revisar</span>' : '') + (items.some(function (x) { return X.chg['sh:' + x.id]; }) ? '<span class="badge chg">Cambió</span>' : '') + '</div>';
  var inner = '<p class="nt small muted">' + (n ? ppl.map(function (id) { return esc(X.pp[id].n); }).join(' · ') : '') + '</p>' + (warn ? '<p class="warnline">' + warn + '</p>' : '') +
    (items.length ? '<ul class="list" style="margin:0 -14px -14px;border-radius:0;border-left:0;border-right:0;border-bottom:0">' + rows + '</ul>' : '<p class="muted small">Sin tareas este día.</p>');
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
      '<p class="nt"><b>Programación:</b> ' + (pr.length ? esc(pr.join(' · ')) : '—') + (areasFor(e.id).indexOf('tec') > -1 ? ' · con Técnica' : '') + '</p>' + (rg.length ? '<p class="nt"><b>Registro:</b> ' + esc(rg.join(' · ')) + '</p>' : '') + '</div></li>';
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
  out += det('map-' + S.day, '', '<span class="sum-t">Mapa del día</span><div class="sum-m">Recorrido entre sedes y traslados</div>', '<div data-map></div>');
  if (S.day === 0 && D.rider) { out += det('rider', '', '<span class="sum-t">Equipamiento para la apertura</span><div class="sum-m">' + D.rider.length + ' ítems y de dónde salen</div>', '<ul class="plain">' + D.rider.map(function (x) { return '<li><b>' + esc(x[0]) + '</b> · ' + esc(x[1]) + '</li>'; }).join('') + '</ul>'); }
  out += '<p class="small muted">' + esc(D.notes.traslados) + '</p>';
  return out;
}

/* ---------- Mapa ---------- */
var MAPW = 1255, MAPH = 870, MAPIMG = 'map.webp';
var NODE = { orig: { x: 400, y: 750, n: 'Origen a definir' }, tbc: { x: 700, y: 770, n: 'A confirmar' }, merl: { x: 540, y: 810, n: 'Casa de Merlin' } };
var LAB = { unrn: { dx: -24, dy: 7, a: 'end' }, gim: { dx: 24, dy: 7, a: 'start' }, bic: { dx: -24, dy: 7, a: 'end' }, ea: { dx: 24, dy: -12, a: 'start' }, pm: { dx: -24, dy: -4, a: 'end' }, awka: { dx: 24, dy: 16, a: 'start' }, obr: { dx: 24, dy: 7, a: 'start' } };
var GEO = { s: 0.9927, tx: 517.616, ty: 458.691, k: 111320 * Math.cos(41.964 * Math.PI / 180), lat0: -41.964, lng0: -71.534 };
function dist(a, b) { var R = 6371000, r = Math.PI / 180, P = V(a), Q = V(b), dla = (Q.lat - P.lat) * r, dg = (Q.lng - P.lng) * r; var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(P.lat * r) * Math.cos(Q.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
function fmtDist(x) { return x < 950 ? Math.round(x / 10) * 10 + ' m' : (x / 1000).toFixed(1).replace('.', ',') + ' km'; }
function ll(v) { return V(v).lat + ',' + V(v).lng; }
function dirURL(list, mode) { var o = list[0], d = list[list.length - 1], mid = list.slice(1, -1); return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(ll(o)) + '&destination=' + encodeURIComponent(ll(d)) + (mid.length ? '&waypoints=' + encodeURIComponent(mid.map(ll).join('|')) : '') + '&travelmode=' + mode; }
function daySeq(d) { var out = []; D.events.filter(function (e) { return e.day === d; }).sort(by('s')).forEach(function (e) { if (e.v === 'virt' || !e.v) { return; } if (!out.length || out[out.length - 1].v !== e.v) { out.push({ v: e.v, t: e.s }); } }); return out; }
function dayVenues(d) { var out = []; daySeq(d).forEach(function (x) { if (!V(x.v).nomap && out.indexOf(x.v) < 0) { out.push(x.v); } }); D.transfers.filter(function (t) { return t.day === d; }).forEach(function (t) { [t.from, t.to].forEach(function (v) { if (v && !V(v).nomap && out.indexOf(v) < 0) { out.push(v); } }); }); return out; }
function inMap(v) { return !!NODE[v] || !!(D.venues[v] && !D.venues[v].nomap && D.venues[v].lat != null); }
function pos(v) {
  if (NODE[v]) { return NODE[v]; }
  var o = V(v), p = { x: GEO.s * (o.lng - GEO.lng0) * GEO.k + GEO.tx, y: -GEO.s * (o.lat - GEO.lat0) * 111200 + GEO.ty };
  if (p.x > 0 && p.x < MAPW && p.y > 0 && p.y < MAPH) { return p; }
  return { x: Math.min(Math.max(p.x, 300), 760), y: S.map.full ? 50 : 262, off: true };
}
function leg(a, b, off, id, label, color, dash, u) {
  var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, r = 21 * u;
  var x1 = a.x + ux * r, y1 = a.y + uy * r, x2 = b.x - ux * (r + 4 * u), y2 = b.y - uy * (r + 4 * u), cx = (x1 + x2) / 2 + nx * off * 2 * u, cy = (y1 + y2) / 2 + ny * off * 2 * u;
  var mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2, my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  var s = '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + (5 * u) + '" stroke-linecap="round" ' + (dash ? 'stroke-dasharray="' + (12 * u) + ' ' + (10 * u) + '" ' : '') + 'marker-end="url(#ah-' + id + ')"/>';
  if (label) { s += '<text x="' + mx.toFixed(1) + '" y="' + (my + 6 * u).toFixed(1) + '" text-anchor="middle" font-size="' + (17 * u) + '" font-weight="800" fill="' + color + '" stroke="#fff" stroke-width="' + (6 * u) + '" paint-order="stroke" stroke-linejoin="round">' + esc(label) + '</text>'; }
  return s;
}
function mapSVG() {
  var u = S.map.full ? 2.3 : 1, vb = S.map.full ? [0, 0, MAPW, MAPH] : [250, 236, 540, 634], LC = '#1d3a0b', TC = '#b3470f';
  var seq = daySeq(S.day), trs = D.transfers.filter(function (t) { return t.day === S.day; }), ord = [], drawn = {};
  seq.forEach(function (x) { if (ord.indexOf(x.v) < 0) { ord.push(x.v); } });
  dayVenues(S.day).forEach(function (v) { if (ord.indexOf(v) < 0) { ord.push(v); } });
  trs.forEach(function (t) { if (!t.from && inMap(t.to) && ord.indexOf('orig') < 0) { ord.push('orig'); } [t.from, t.to].forEach(function (k) { if ((k === 'tbc' || k === 'merl') && ord.indexOf(k) < 0) { ord.push(k); } }); });
  var s = '<div class="mapframe" style="padding-bottom:' + (vb[3] / vb[2] * 100).toFixed(2) + '%"><svg viewBox="' + vb.join(' ') + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de El Bolsón con las sedes, el recorrido y los traslados del día" font-family="system-ui,Arial,sans-serif">' +
    '<defs><marker id="ah-rec" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="' + (14 * u) + '" markerHeight="' + (14 * u) + '" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8z" fill="' + LC + '"/></marker><marker id="ah-trl" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="' + (14 * u) + '" markerHeight="' + (14 * u) + '" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8z" fill="' + TC + '"/></marker></defs>' +
    '<image href="' + MAPIMG + '" x="0" y="0" width="' + MAPW + '" height="' + MAPH + '" preserveAspectRatio="none"/><rect width="' + MAPW + '" height="' + MAPH + '" fill="#fff" opacity=".18"/>';
  if (S.map.rec) { for (var i = 0; i < seq.length - 1; i++) { if (inMap(seq[i].v) && inMap(seq[i + 1].v)) { s += leg(pos(seq[i].v), pos(seq[i + 1].v), 14, 'rec', f(seq[i + 1].t), LC, false, u); } } }
  if (S.map.trl) { trs.forEach(function (t) { var a = t.from || 'orig', key = a + '>' + t.to; if (inMap(a) && inMap(t.to) && !drawn[key]) { drawn[key] = 1; s += leg(pos(a), pos(t.to), -14, 'trl', /^\d/.test(t.phases[0][0]) ? 'Traslado ' + t.phases[0][0] : 'A confirmar', TC, true, u); } }); }
  var all = Object.keys(D.venues).filter(function (k) { return inMap(k) && (!pos(k).off || ord.indexOf(k) > -1); }).concat(['orig', 'tbc', 'merl'].filter(function (k) { return ord.indexOf(k) > -1; }));
  all.forEach(function (v) {
    var p = pos(v), on = ord.indexOf(v) > -1, isN = !!NODE[v], nm = isN ? NODE[v].n : V(v).n, n = ord.indexOf(v) + 1, L = isN ? { dx: 0, dy: 38, a: 'middle' } : (LAB[v] || { dx: 24, dy: 7, a: 'start' });
    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (16 * u) + '" fill="' + (on ? (isN ? '#1d3a0b' : '#b3470f') : '#fff') + '" stroke="' + (on ? '#fff' : '#4d6733') + '" stroke-width="' + (4 * u) + '"' + (isN ? ' stroke-dasharray="' + (5 * u) + ' ' + (4 * u) + '"' : '') + '/>';
    if (on) { s += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 6 * u).toFixed(1) + '" text-anchor="middle" font-size="' + (18 * u) + '" font-weight="800" fill="#fff">' + (isN ? '?' : n) + '</text>'; }
    s += '<text x="' + (p.x + L.dx * u).toFixed(1) + '" y="' + (p.y + L.dy * u).toFixed(1) + '" text-anchor="' + L.a + '" font-size="' + ((on ? 23 : 20) * u) + '" font-weight="' + (on ? 800 : 700) + '" fill="' + (on ? '#1d3a0b' : '#4d6733') + '" stroke="#fff" stroke-width="' + (7 * u) + '" paint-order="stroke" stroke-linejoin="round">' + esc(nm + (p.off ? ' · al norte' : '')) + '</text>';
  });
  var bx = vb[0] + 22 * u, byy = vb[1] + vb[3] - 22 * u;
  s += '<g font-weight="800" fill="#1d3a0b" font-size="' + (17 * u) + '" stroke="#fff" stroke-width="' + (5 * u) + '" paint-order="stroke"><line x1="' + bx + '" y1="' + byy + '" x2="' + (bx + GEO.s * 100) + '" y2="' + byy + '" stroke="#1d3a0b" stroke-width="' + (5 * u) + '"/><text x="' + bx + '" y="' + (byy - 10 * u) + '">100 m</text><text x="' + (vb[0] + vb[2] - 30 * u) + '" y="' + (vb[1] + 34 * u) + '" text-anchor="middle">N</text></g></svg></div>';
  return s;
}
function mapBox() {
  var seq = daySeq(S.day).map(function (x) { return x.v; }).filter(function (v) { return !V(v).nomap; });
  var link = seq.length >= 2 ? '<a class="chip" href="' + dirURL(seq, 'walking') + '" target="_blank" rel="noopener">Recorrido en Google Maps ↗</a>' : '';
  return '<div class="chips"><button class="chip" type="button" data-layer="rec" aria-pressed="' + S.map.rec + '">Recorrido</button><button class="chip" type="button" data-layer="trl" aria-pressed="' + S.map.trl + '">Traslados</button><button class="chip" type="button" data-layer="full" aria-pressed="' + S.map.full + '">Mapa completo</button>' + link + '</div>' + mapSVG() +
    '<div class="legend"><span><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="#1d3a0b" stroke-width="3"/></svg>Recorrido entre sedes, con la hora de llegada</span><span><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="#b3470f" stroke-width="3" stroke-dasharray="7 6"/></svg>Traslado de equipos, con la hora de salida</span></div>';
}
function fillMaps() { document.querySelectorAll('[data-map]').forEach(function (el) { if (!el.closest('details:not([open])')) { el.innerHTML = mapBox(); } }); }
function vMapa() {
  var act = dayVenues(S.day), all = Object.keys(D.venues).filter(function (k) { return !V(k).nomap; });
  all.sort(function (a, b) { var x = act.indexOf(a), y = act.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
  var cards = all.map(function (v) {
    var o = V(v), on = act.indexOf(v) > -1;
    var li = D.events.filter(function (e) { return e.day === S.day && e.v === v; }).sort(by('s')).map(function (e) { return '<li><b class="num">' + f(e.s) + '</b> ' + esc(e.t) + '</li>'; }).join('') +
      D.transfers.filter(function (t) { return t.day === S.day && (t.to === v || t.from === v); }).map(function (t) { return '<li><b class="num">' + esc(t.phases[0][0]) + '</b> Traslado: ' + esc(t.title) + '</li>'; }).join('');
    return det('v-' + v, '', '<span class="sum-t">' + (on ? '<span class="badge mine">' + (act.indexOf(v) + 1) + '</span> ' : '') + esc(o.n) + '</span><div class="sum-m">' + esc(o.addr || '') + '</div>',
      (li ? '<ul class="plain small">' + li + '</ul>' : '<p class="muted small">Sin actividades este día.</p>') + '<a class="btn sm" href="' + gmaps(v) + '" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>');
  }).join('');
  return dayHead('Mapa y sedes') + '<section class="card" data-map></section>' + cards;
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
  out += '<section class="card"><h3>Avisos de cambios</h3><p class="small">Cuando cambia algo en la logística, la guía te avisa con un mensaje y lo marca en Novedades. Revisa cada ' + (CFG.pollMinutes || 5) + ' minutos mientras está abierta.</p>' +
    (perm === 'unsupported' ? '<p class="small muted">Este navegador no permite avisos del sistema.</p>' : '<button class="btn sm' + (S.notif && perm === 'granted' ? '' : ' pri') + '" type="button" data-act="notif">' + (S.notif && perm === 'granted' ? 'Desactivar avisos del sistema' : 'Activar avisos del sistema') + '</button>' + (perm === 'denied' ? '<p class="small muted">Los avisos están bloqueados en la configuración del navegador.</p>' : '')) + '</section>';
  out += '<section class="card"><h3>Datos</h3><p class="small">' + (SYNC.at ? 'Última actualización: ' + clock(SYNC.at) : 'Todavía no se actualizó.') + '</p><p class="small muted">Fuente: ' + esc(D.meta && D.meta.source || 'data.json') + ((CFG.sources || []).length ? ' + ' + CFG.sources.map(function (s) { return esc(s.name); }).join(', ') : '') + '</p>' + (SYNC.msg ? '<p class="small fl">' + esc(SYNC.msg) + '</p>' : '') +
    '<div class="row-btns"><button class="btn sm pri" type="button" data-act="sync">Buscar actualizaciones</button><button class="btn sm" type="button" data-act="reset">Desmarcar todas las tareas</button></div></section>';
  out += '<section class="card"><h3>Instalar en el teléfono</h3>' + (standalone ? '<p class="small">Ya la estás usando como app.</p>' : X.canInstall ? '<button class="btn sm pri" type="button" data-act="install">Instalar la guía</button>' : ios ? '<p class="small">En Safari: tocá Compartir y después "Agregar a inicio".</p>' : '<p class="small">En Chrome: menú ⋮ → "Instalar app" o "Agregar a la pantalla principal".</p>') + '</section>';
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
  b.textContent = SYNC.state === 'busy' ? 'Actualizando…' : off ? (SYNC.state === 'off' ? 'Sin conexión' : 'Sin actualizar') : (SYNC.at ? 'Al día · ' + clock(SYNC.at) : 'Al día');
  b.title = SYNC.msg || 'Tocá para buscar actualizaciones';
}
function render(keepScroll) {
  if (!D) { return; }
  var y = window.scrollY;
  renderDays(); renderNav(); renderSync();
  app.innerHTML = (VIEWS[S.view] || vHoy)();
  fillMaps();
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
  var t = e.target.closest('[data-go],[data-day],[data-done],[data-tarea],[data-mine],[data-layer],[data-theme],[data-act]');
  if (!t || !D) { return; }
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
  if (t.hasAttribute('data-layer')) { var l = t.getAttribute('data-layer'); S.map[l] = !S.map[l]; t.setAttribute('aria-pressed', S.map[l]); fillMaps(); return; }
  if (t.hasAttribute('data-theme')) { var th = t.getAttribute('data-theme'); if (th === 'auto') { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem(K.theme); } catch (er) {} } else { document.documentElement.setAttribute('data-theme', th); lsSet(K.theme, th); } render(true); return; }
  var act = t.getAttribute('data-act');
  if (act === 'sync') { pull(true); }
  else if (act === 'reset') { S.done = {}; saveS(); render(true); toast('Se desmarcaron todas las tareas.'); }
  else if (act === 'install') { if (X.bip) { X.bip.prompt(); X.bip.userChoice.then(function () { X.bip = null; X.canInstall = false; render(true); }); } }
  else if (act === 'install-hide') { lsSet(K.inst, 1); render(true); }
  else if (act === 'notif') { toggleNotif(); }
  else if (act === 'reload') { location.reload(); }
});
$('sync').addEventListener('click', function () { pull(true); });
document.addEventListener('change', function (e) {
  if (e.target.id !== 'who') { return; }
  S.me = e.target.value; S.tarea = ''; saveS(); render(true);
});
document.addEventListener('toggle', function (e) {
  var d = e.target; if (!d.matches || !d.matches('details[data-k]')) { return; }
  var k = d.getAttribute('data-k'); if (d.open) { X.open[k] = 1; } else { X.open[k] = 0; }
  lsSet(K.open, X.open);
  if (d.open && d.querySelector('[data-map]')) { fillMaps(); }
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
  });
  Object.keys(a).forEach(function (id) { if (!b[id]) { push({ ref: 'ev:' + id, day: a[id].day, view: 'programa', mine: false, text: 'Se quitó del programa: “' + a[id].t + '” (' + dl(a[id].day) + ', ' + f(a[id].s) + ')' }); } });

  a = idMap(Aa.shifts); b = idMap(B.shifts);
  function shMine(x) { return !!meId && (x.pids ? x.pids : (Bmembers[x.area] || [])).indexOf(meId) > -1; }
  Object.keys(b).forEach(function (id) {
    var n = b[id], o = a[id], base = { ref: 'sh:' + id, day: n.day, view: 'turnos', mine: shMine(n) || (o ? shMine(o) : false) };
    function p(t) { push(Object.assign({}, base, { text: t })); }
    var who = (B.areas[n.area] || { n: n.area }).n;
    if (!o) { p('Nueva tarea de ' + who + ': “' + n.t + '” (' + dl(n.day) + ', ' + f(n.s) + ')'); return; }
    if (o.s !== n.s || o.e !== n.e || o.day !== n.day) { p('Cambió el horario de “' + n.t + '” (' + who + '): ' + dl(o.day) + ' ' + rng(o) + ' → ' + dl(n.day) + ' ' + rng(n)); }
    if (o.v !== n.v) { p('Cambió el lugar de “' + n.t + '”: ' + vn(o.v) + ' → ' + vn(n.v)); }
    if (o.t !== n.t) { p('Tarea de ' + who + ' renombrada: “' + n.t + '”'); }
    if (J(o.who) !== J(n.who) || J(o.pids) !== J(n.pids)) { p('Cambiaron las personas de “' + n.t + '”: ' + ((n.who || []).join(' · ') || 'toda el área')); }
    if (o.note !== n.note) { p('Nueva nota en “' + n.t + '”'); }
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

  a = idMap(Aa.people, function (p) { return p.n; }); b = idMap(B.people, function (p) { return p.n; });
  function an(list) { return list.map(function (z) { return (B.areas[z] || { n: z }).n; }).join(' y '); }
  Object.keys(b).forEach(function (k) { var n = b[k], o = a[k]; if (!o) { push({ ref: 'pp:' + k, view: 'equipo', mine: hit(n.a), text: 'Se sumó ' + k + ' a ' + an(n.a) }); } else if (J(o.a) !== J(n.a)) { push({ ref: 'pp:' + k, view: 'equipo', mine: n.id === meId, text: k + ' ahora está en ' + an(n.a) }); } });
  Object.keys(a).forEach(function (k) { if (!b[k]) { push({ ref: 'pp:' + k, view: 'equipo', mine: false, text: k + ' ya no figura en el equipo' }); } });

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
function parseCSV(t) {
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else { q = false; } } else { cell += c; } }
    else if (c === '"') { q = true; } else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') { i++; } row.push(cell); rows.push(row); row = []; cell = ''; }
    else { cell += c; }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  var hd = (rows.shift() || []).map(function (h) { return norm(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); });
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }).map(function (r) { var o = {}; hd.forEach(function (h, i) { if (h) { o[h] = String(r[i] == null ? '' : r[i]).trim(); } }); return o; });
}
function csvURL(u) {
  if (/\/spreadsheets\/d\/e\//.test(u)) { return u.replace(/\/pubhtml.*/, '/pub?output=csv').replace(/output=\w+/, 'output=csv'); }
  var id = /\/spreadsheets\/d\/([\w-]+)/.exec(u), gid = /[#&?]gid=(\d+)/.exec(u);
  return id ? 'https://docs.google.com/spreadsheets/d/' + id[1] + '/gviz/tq?tqx=out:csv' + (gid ? '&gid=' + gid[1] : '') : u;
}
function dayOf(d, v) { var n = /(\d{1,2})/.exec(String(v || '')); if (!n) { return -1; } var k = +n[1]; var i = d.days.findIndex(function (x) { return x.k === k; }); return i > -1 ? i : (k < d.days.length ? k : -1); }
function venueKey(d, name) {
  var n = norm(name); if (!n) { return 'tbc'; }
  var keys = Object.keys(d.venues), hit = keys.filter(function (k) { return norm(k) === n || norm(d.venues[k].n) === n; })[0] || keys.filter(function (k) { return n.indexOf(norm(d.venues[k].n)) > -1 || norm(d.venues[k].n).indexOf(n) > -1; })[0];
  if (hit) { return hit; }
  var k2 = 'x_' + n.replace(/[^a-z0-9]+/g, '_'); d.venues[k2] = { n: String(name).trim(), nomap: true }; return k2;
}
function areaKeys(d, txt) { var n = norm(txt); return Object.keys(d.areas).filter(function (a) { return n.indexOf(norm(d.areas[a].n)) > -1 || n.split(/[^a-z]+/).indexOf(a) > -1; }); }
function list(t) { return String(t || '').split(/\s*[;\n]\s*/).map(function (s) { return s.trim(); }).filter(Boolean); }
function endOf(s, e) { var x = m(e); if (x == null) { return null; } return x <= s ? x + 1440 : x; }
var ADAPT = {
  eventos: function (d, rows) {
    d.events = rows.map(function (r, i) { var s = m(r.inicio || r.hora || r.desde); return { id: r.id || 'e' + i, day: dayOf(d, r.dia || r.fecha), s: s, e: endOf(s, r.fin || r.hasta), t: r.titulo || r.actividad || '', d: r.descripcion || r.detalle || '', v: venueKey(d, r.sede || r.lugar), room: r.sala || '', tag: r.tipo || '', flag: r.aviso || r.observaciones || '', lead: r.a_cargo || undefined, leadAreas: areaKeys(d, r.a_cargo) }; })
      .filter(function (e) { return e.day > -1 && e.s != null && e.t; });
  },
  turnos: function (d, rows) {
    d.shifts = rows.map(function (r, i) { var s = m(r.inicio || r.desde), who = list(r.personas || r.quienes).join(' · '); var ids = who ? who.split(' · ').map(function (n) { var t = norm(n).split(/\s+/); var p = d.people.filter(function (p0) { var pt = norm(p0.n).split(/\s+/); return t.every(function (x) { return pt.indexOf(x) > -1; }); }); return p.length === 1 ? p[0].id : null; }).filter(Boolean) : null;
      return { id: r.id || 't' + i, day: dayOf(d, r.dia), area: areaKeys(d, r.area)[0] || 'coo', s: s, e: endOf(s, r.fin || r.hasta) || s + 60, v: venueKey(d, r.sede || r.lugar), t: r.tarea || r.titulo || '', ev: list(r.actividades).map(function (x) { return x.split(',')[0]; }), note: r.nota || '', who: who ? who.split(' · ') : [], pids: who ? ids : null }; })
      .filter(function (x) { return x.day > -1 && x.s != null && x.t; });
  },
  traslados: function (d, rows) {
    d.transfers = rows.map(function (r, i) { return { id: r.id || 'r' + i, day: dayOf(d, r.dia), kind: r.tipo || 'Equipos', title: r.titulo || r.traslado || '', from: r.desde ? venueKey(d, r.desde) : null, to: venueKey(d, r.hacia || r.destino),
      phases: list(r.fases || r.horarios).map(function (p) { var q = p.split('|'); return q.length > 1 ? [q[0].trim(), '', q.slice(1).join('|').trim()] : [(/\d{1,2}[:.]\d{2}/.exec(p) || ['A confirmar'])[0], '', p]; }),
      areas: areaKeys(d, r.areas), check: list(r.carga || r.lista_de_carga), note: r.nota || '' }; })
      .filter(function (t) { return t.day > -1 && t.title; });
  },
  personas: function (d, rows) {
    d.people = rows.map(function (r, i) { return { id: 'p' + i, n: r.nombre || r.nombre_y_apellido || '', a: areaKeys(d, r.area || r.areas), r: r.rol || '' }; }).filter(function (p) { return p.n; });
  },
  avisos: function (d, rows) {
    var al = d.days.map(function () { return []; }), pend = [];
    rows.forEach(function (r) { var i = dayOf(d, r.dia); var t = r.aviso || r.texto || ''; if (!t) { return; } if (i > -1) { al[i].push(t); } else { pend.push(t); } });
    d.alerts = al; if (pend.length) { d.pending = pend; }
  }
};
function fetchOK(url, type) {
  return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) { throw new Error(r.status); } return type === 'json' ? r.json().then(function (j) { return { j: j, cached: r.headers.get('x-faa-cache') === '1' }; }) : r.text(); });
}
var pulling = null;
function pull(manual) {
  if (pulling) { return pulling; }
  SYNC.state = 'busy'; renderSync();
  pulling = fetchOK('data.json', 'json').then(function (res) {
    var nd = JSON.parse(J(res.j)), errs = [];
    var srcs = (CFG.sources || []).filter(function (s) { return s && s.url && ADAPT[s.type]; });
    return Promise.all(srcs.map(function (s) { return fetchOK(csvURL(s.url), 'text').then(function (t) { if (/^\s*</.test(t)) { throw new Error('html'); } return { s: s, rows: parseCSV(t) }; }).catch(function () { errs.push(s.name || s.type); return null; }); }))
      .then(function (got) {
        got.forEach(function (g) { if (g && g.rows.length) { try { ADAPT[g.s.type](nd, g.rows); } catch (e) { errs.push(g.s.name || g.s.type); } } });
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
