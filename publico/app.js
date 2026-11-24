/* FAA! 2026 · app para el público.
   Solo usa datos.json: el programa y las sedes públicas del festival.
   No hay cuentas, ni ranking, ni datos personales: lo único que se guarda queda en este teléfono. */
(function () {
'use strict';
var TZ = 'America/Argentina/Buenos_Aires';
var K = { data: 'faap-data', chg: 'faap-cambios', open: 'faap-open', help: 'faap-ayuda', inst: 'faap-instalar', theme: 'faap-theme' };
var DAY_VIEWS = { programa: 1, mapa: 1 };

/* ---------- Utilidades ---------- */
function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function f(x) { x = ((x % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function $(id) { return document.getElementById(id); }
function by(k) { return function (a, b) { return a[k] - b[k]; }; }
function J(x) { return JSON.stringify(x); }

/* ---------- Estado ---------- */
var D = null, X = { open: lsGet(K.open) || {} };
var S = { day: 0, view: 'programa', loc: false };
var CHG = lsGet(K.chg) || {};   /* id de actividad → momento en que cambió (se muestra 24 h) */

/* ---------- Tiempo (hora argentina) ---------- */
function absT(di, min) { var d = D.days[di].date.split('-'); return Date.UTC(+d[0], +d[1] - 1, +d[2]) + (min + 180) * 60000; }
function todayIdx() {
  var t = Date.now();
  for (var i = 0; i < D.days.length; i++) { var a = absT(i, 360), b = i < D.days.length - 1 ? absT(i + 1, 360) : absT(i, 1800); if (t >= a && t < b) { return i; } }
  return -1;
}
function phase() { var t = Date.now(); if (t < absT(0, 360)) { return 'pre'; } if (t >= absT(D.days.length - 1, 1800)) { return 'post'; } return 'live'; }
function daysLeft() {
  var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  var d = D.days[0].date.split('-'); return Math.round((Date.UTC(+d[0], +d[1] - 1, +d[2]) - Date.UTC(+p.year, +p.month - 1, +p.day)) / 86400000);
}
function inMin(ms) { var mm = Math.round(ms / 60000); if (mm < 1) { return 'ahora'; } if (mm < 60) { return 'en ' + mm + ' min'; } var h = Math.floor(mm / 60), r = mm % 60; return 'en ' + h + ' h' + (r ? ' ' + r + ' min' : ''); }
function evEnd(e) { return e.e == null ? e.s + 60 : e.e; }
function dl(i) { var d = D.days[i]; return d ? d.dow + ' ' + d.k : ''; }

/* ---------- Sedes ---------- */
var PIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5S12.5 9.2 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" fill="currentColor"/></svg>';
function V(k) { return (D.venues && D.venues[k]) || { n: k ? String(k) : 'A confirmar', nomap: true }; }
function hasLL(v) { var o = D.venues[v]; return !!(o && !o.nomap && o.lat != null); }
function gmaps(v) { var o = V(v); return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((o.q || o.n) + ' El Bolsón, Río Negro') + (o.pid ? '&query_place_id=' + o.pid : ''); }
function vtxt(v, room) { var o = V(v); if (o.nomap && room) { return room; } if (room && norm(room).indexOf(norm(o.n)) === 0) { return room; } return o.n + (room ? ' · ' + room : ''); }
function venueLink(v, room) {
  var o = V(v), t = esc(vtxt(v, room));
  if (o.nomap) { return '<span class="venue nolink">' + PIN + t + '</span>'; }
  return '<a class="venue" href="' + gmaps(v) + '" target="_blank" rel="noopener">' + PIN + t + '</a>';
}

/* ---------- Piezas ---------- */
function det(key, cls, summary, inner) { return '<details class="x ' + (cls || '') + '" data-k="' + key + '"' + (X.open[key] ? ' open' : '') + '><summary>' + summary + '</summary><div class="in">' + inner + '</div></details>'; }
function head(title, sub) { return '<div class="h"><h2>' + esc(title) + '</h2>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>'; }
function dayHead(view) { var d = D.days[S.day]; return head(view + ' · ' + d.name + ' ' + d.k, '') + (d.theme ? '<p class="small muted" style="margin:-6px 0 12px">' + esc(d.theme) + '</p>' : ''); }

/* ---------- Cronograma en PDF ---------- */
var PDF = 'cronograma-faa-2026.pdf', PDFNAME = 'Cronograma FAA 2026.pdf';
function pdfCard() {
  return '<section class="card pdfcard"><div class="ico">PDF</div><div><h3>Cronograma oficial</h3><p class="small muted">Para pasarlo por WhatsApp o imprimirlo.</p></div>' +
    '<div class="row-btns"><button class="btn sm pri" type="button" data-act="pdf-share">Compartir</button><a class="btn sm" href="' + PDF + '" download="' + PDFNAME + '">Descargar</a><a class="btn sm" href="' + PDF + '" target="_blank" rel="noopener">Ver</a></div></section>';
}
function getPdfFile() {
  if (X.pdfFile) { return Promise.resolve(X.pdfFile); }
  return fetch(PDF).then(function (r) { return r.blob(); }).then(function (b) { X.pdfFile = new File([b], PDFNAME, { type: 'application/pdf' }); return X.pdfFile; });
}
function copyText(t, ok) { if (navigator.clipboard) { navigator.clipboard.writeText(t).then(function () { toast(ok); }, function () { toast(t); }); } else { toast(t); } }
function sharePdf() {
  var url = new URL(PDF, location.href).href, text = 'Cronograma del FAA! 2026 · del 25 al 29 de noviembre, El Bolsón';
  function viaUrl() { if (navigator.share) { return navigator.share({ title: 'Cronograma FAA! 2026', text: text, url: url }).catch(function () {}); } copyText(url, 'Link del cronograma copiado.'); }
  getPdfFile().then(function (fl) {
    if (navigator.canShare && navigator.canShare({ files: [fl] })) { return navigator.share({ files: [fl], title: 'Cronograma FAA! 2026', text: text }).catch(function (e) { if (!e || e.name !== 'AbortError') { viaUrl(); } }); }
    viaUrl();
  }, viaUrl);
}
function shareApp() {
  var url = location.origin + location.pathname, text = 'FAA! 2026 · Festival Artístico Audiovisual. Programa, sedes y mapa: ';
  if (navigator.share) { navigator.share({ title: 'FAA! 2026', text: text, url: url }).catch(function () {}); } else { copyText(text + url, 'Link de la app copiado.'); }
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
function changed(id) { return CHG[id] && Date.now() - CHG[id] < 24 * 3600000; }
function evRow(e) {
  var t = Date.now(), now = t >= absT(e.day, e.s) && t < absT(e.day, evEnd(e));
  var sum = '<div class="ev-sum"><div class="tm"><b>' + f(e.s) + '</b><span>' + (e.e != null ? f(e.e) : 'en adelante') + '</span></div><div><div class="sum-t">' + esc(e.t) + '</div><div class="sum-m"><span>' + esc(vtxt(e.v, e.room)) + '</span>' +
    (now ? '<span class="badge now">Ahora</span>' : '') + (changed(e.id) ? '<span class="badge chg">Cambió</span>' : '') + '</div></div></div>';
  var inner = (e.tag ? '<p><span class="badge">' + esc(e.tag) + '</span></p>' : '') + (e.d ? '<p>' + esc(e.d) + '</p>' : '') + films(e) +
    '<div class="mt">' + venueLink(e.v, e.room) + '</div>' +
    '<div class="row-btns"><button class="btn sm" type="button" data-act="cal-ev" data-id="' + e.id + '">' + CALI + 'Agendar</button></div>';
  return det('ev-' + e.id, 'ev' + (now ? ' now' : ''), sum, inner);
}
function nowCard() {
  var ph = phase();
  if (ph === 'pre') {
    var n = daysLeft();
    return '<section class="card accent"><p class="kicker">FAA! 2026 · El Bolsón</p><h2 style="font-size:21px">' + (n <= 0 ? '¡Hoy arranca el festival!' : n === 1 ? 'Falta 1 día' : 'Faltan ' + n + ' días') + '</h2><p class="small">Del 25 al 29 de noviembre. Gratis y abierto a todo público.</p></section>';
  }
  if (ph === 'post') { return '<section class="card accent"><h3>¡Gracias por venir al FAA! 2026!</h3><p class="small">Nos vemos en la próxima edición.</p></section>'; }
  var t = Date.now(), all = D.events.slice().sort(function (a, b) { return absT(a.day, a.s) - absT(b.day, b.s); });
  var cur = all.filter(function (e) { return t >= absT(e.day, e.s) && t < absT(e.day, evEnd(e)); });
  var next = all.filter(function (e) { return absT(e.day, e.s) > t; }).slice(0, 2);
  if (!cur.length && !next.length) { return ''; }
  var li = function (e, isNow) { return '<li><b class="num">' + (isNow ? 'Ahora' : f(e.s)) + '</b> ' + esc(e.t) + ' <span class="muted">· ' + esc(vtxt(e.v, e.room)) + (isNow ? '' : ' · ' + inMin(absT(e.day, e.s) - t)) + '</span></li>'; };
  return '<section class="card accent"><p class="kicker">Ahora en el FAA!</p><ul class="plain small">' + cur.map(function (e) { return li(e, true); }).join('') + next.map(function (e) { return li(e, false); }).join('') + '</ul></section>';
}
function vPrograma() {
  var list = D.events.filter(function (e) { return e.day === S.day; }).sort(by('s'));
  var out = installCard() + nowCard() + dayHead('Programa');
  out += list.length ? '<div class="evlist">' + list.map(evRow).join('') + '</div>' : '<p class="card muted">No hay actividades este día.</p>';
  var st = stops(S.day), lg = legs(st).filter(function (l) { return l.a.v !== l.b.v; });
  if (lg.length) { out += det('ruta-' + S.day, '', '<span class="sum-t">Recorrido del día</span><div class="sum-m">' + (lg.length + 1) + ' sedes · tiempos a pie</div>', routeList(S.day) + '<button class="btn sm" type="button" data-go="mapa">Ver en el mapa</button>'); }
  out += calCard() + pdfCard();
  return out;
}

/* ---------- Recorrido y mapa ---------- */
var GEO = { s: 0.9927, tx: 517.616, ty: 458.691, k: 111320 * Math.cos(41.964 * Math.PI / 180), lat0: -41.964, lng0: -71.534 };
var WALK = 75, DETOUR = 1.3;
function dist(a, b) { var R = 6371000, r = Math.PI / 180, P = V(a), Q = V(b), dla = (Q.lat - P.lat) * r, dg = (Q.lng - P.lng) * r; var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(P.lat * r) * Math.cos(Q.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
function fmtDist(x) { return x < 950 ? Math.round(x / 10) * 10 + ' m' : (x / 1000).toFixed(1).replace('.', ',') + ' km'; }
function ll(v) { return V(v).lat + ',' + V(v).lng; }
function dirURL(list) { var o = list[0], d = list[list.length - 1], mid = list.slice(1, -1); return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(ll(o)) + '&destination=' + encodeURIComponent(ll(d)) + (mid.length ? '&waypoints=' + encodeURIComponent(mid.map(ll).join('|')) : '') + '&travelmode=walking'; }
function stops(day) {
  var src = D.events.filter(function (e) { return e.day === day && e.v && hasLL(e.v); }).map(function (e) { return { v: e.v, s: e.s, e: evEnd(e), t: e.t }; }).sort(by('s'));
  var out = [];
  src.forEach(function (x) { var p = out[out.length - 1]; if (p && p.v === x.v && x.s <= p.e + 30) { p.e = Math.max(p.e, x.e); p.t.push(x.t); return; } out.push({ v: x.v, s: x.s, e: x.e, t: [x.t] }); });
  return out;
}
function legs(st) { var out = []; for (var i = 1; i < st.length; i++) { var a = st[i - 1], b = st[i], l = { a: a, b: b }; if (a.v !== b.v) { var m = dist(a.v, b.v) * DETOUR; l.m = m; l.min = Math.max(1, Math.round(m / WALK)); } out.push(l); } return out; }
function routeList(day) {
  var st = stops(day), lg = legs(st);
  if (!st.length) { return '<p class="small muted">No hay actividades con sede en el mapa este día.</p>'; }
  var n = 0, seen = {}, html = '<ol class="route">';
  st.forEach(function (s, i) {
    if (i > 0 && lg[i - 1].min != null) { html += '<li class="leg"><span class="walk">' + lg[i - 1].min + ' min a pie (' + fmtDist(lg[i - 1].m) + ')</span></li>'; }
    if (!(s.v in seen)) { seen[s.v] = ++n; }
    html += '<li class="stop"><span class="pinn">' + seen[s.v] + '</span><div><b class="num">' + f(s.s) + ' a ' + f(s.e) + '</b> · ' + venueLink(s.v) + '<p class="nt">' + esc(s.t.join(' · ')) + '</p></div></li>';
  });
  html += '</ol>';
  var path = st.map(function (s) { return s.v; }).filter(function (v, i, a) { return i === 0 || a[i - 1] !== v; });
  return html + (path.length >= 2 ? '<a class="btn sm" href="' + dirURL(path) + '" target="_blank" rel="noopener">Todo el recorrido en Google Maps ↗</a>' : '');
}
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
  var el = $('lmap'); if (!el) { return; }
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
    var st = stops(S.day), order = st.map(function (s) { return s.v; }), pts = [];
    var path = order.filter(function (v, i) { return i === 0 || order[i - 1] !== v; }).map(function (v) { return [V(v).lat, V(v).lng]; });
    if (path.length > 1) { L.polyline(path, { color: '#1d3a0b', weight: 5, opacity: .85 }).addTo(map); }
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
    map.on('locationerror', function () { toast('No se pudo obtener tu ubicación. Revisá el permiso de ubicación del navegador.'); S.loc = false; var b = document.querySelector('[data-act="map-loc"]'); if (b) { b.setAttribute('aria-pressed', 'false'); } });
    if (S.loc) { map.locate({ watch: true, enableHighAccuracy: true }); }
  }, function () { el.innerHTML = '<p class="small muted" style="padding:14px">No se pudo cargar el mapa. Con conexión se carga una vez y queda guardado.</p>'; });
}
function vMapa() {
  var act = stops(S.day).map(function (s) { return s.v; });
  var all = Object.keys(D.venues).filter(hasLL).sort(function (a, b) { var x = act.indexOf(a), y = act.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
  var cards = all.map(function (v) {
    var o = V(v), li = D.events.filter(function (e) { return e.day === S.day && e.v === v; }).sort(by('s')).map(function (e) { return '<li><b class="num">' + f(e.s) + '</b> ' + esc(e.t) + '</li>'; }).join('');
    return det('v-' + v, '', '<span class="sum-t">' + esc(o.n) + '</span><div class="sum-m">' + esc(o.addr || '') + '</div>',
      (li ? '<ul class="plain small">' + li + '</ul>' : '<p class="muted small">Sin actividades este día.</p>') + '<a class="btn sm" href="' + gmaps(v) + '" target="_blank" rel="noopener">Cómo llegar ↗</a>');
  }).join('');
  var other = []; D.events.filter(function (e) { return e.day === S.day && !hasLL(e.v); }).forEach(function (e) { var t = vtxt(e.v, e.room); if (other.indexOf(t) < 0) { other.push(t); } });
  return dayHead('Mapa y sedes') + '<div class="chips"><button class="chip" type="button" data-act="map-loc" aria-pressed="' + S.loc + '">Mi ubicación</button></div>' +
    '<div class="lmap" id="lmap"></div><p class="small muted">Tiempos a pie estimados (unos 4,5 km/h). Tocá una sede para ver qué pasa ahí. Tu ubicación se usa solo en tu teléfono.</p>' +
    '<section class="card"><h3>Recorrido del día</h3>' + routeList(S.day) + '</section>' +
    (other.length ? '<section class="card"><h3>Sin lugar en el mapa</h3><ul class="plain small">' + other.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>' : '') +
    '<p class="kicker">Sedes</p>' + cards;
}

/* ---------- Juegos y cámara ---------- */
function vJuegos() {
  return head('Juegos y cámara', '') +
    '<p class="small muted">Para la espera entre funciones. Funcionan sin señal una vez abiertos.</p>' +
    '<h3 style="margin:14px 0 8px">¡Corre, sonidista!</h3><div class="jg">' +
    '<a class="jg-o" href="juego/carriles/"><b>Modo carriles</b><span>En 3D, de espaldas: cambiá de carril, saltá y rodá.</span></a>' +
    '<a class="jg-o" href="juego/"><b>Modo clásico</b><span>De costado: saltá los equipos, agachate y subite a los andamios.</span></a></div>' +
    '<h3 style="margin:18px 0 8px">Tera Tiles</h3><div class="jg">' +
    '<a class="jg-o" href="juego/tera-tiles/"><b>Tera Tiles</b><span>Tocá las notas al ritmo de la música. Solo o sincronizado con otros teléfonos.</span></a></div>' +
    '<h3 style="margin:18px 0 8px">Cámara FAA</h3><div class="jg">' +
    '<a class="jg-o" href="mascaras/"><b>Cámara FAA</b><span>Fotos y videos con las máscaras de la tera. Todo se procesa en tu teléfono: nada se sube a internet.</span></a></div>';
}

/* ---------- Más ---------- */
function browserInfo() {
  var ua = navigator.userAgent, ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /android/i.test(ua);
  var b = /SamsungBrowser/i.test(ua) ? 'samsung' : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /EdgiOS|EdgA|Edg\//i.test(ua) ? 'edge' : /OPR|Opera|OPT\//i.test(ua) ? 'opera' : /CriOS|Chrome/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'otro';
  return { ios: ios, android: android, b: b, standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true };
}
function installSteps() {
  var i = browserInfo();
  if (i.ios) { return i.b === 'firefox' ? ['Tocá el menú ☰ (abajo a la derecha).', 'Elegí «Compartir».', 'Elegí «Agregar a inicio».'] : ['Tocá el botón Compartir (el cuadrado con la flecha).', 'Bajá y elegí «Agregar a inicio».', 'Confirmá con «Agregar».']; }
  if (i.android) {
    if (i.b === 'samsung') { return ['Tocá el ícono de instalar en la barra de direcciones, si aparece.', 'Si no: menú ☰ → «Agregar página a» → «Pantalla de inicio».']; }
    if (i.b === 'firefox') { return ['Tocá el menú ⋮.', 'Elegí «Instalar» o «Agregar app a la pantalla de inicio».']; }
    return ['Tocá el menú ⋮ (arriba a la derecha).', 'Elegí «Instalar app» o «Agregar a la pantalla principal».'];
  }
  return ['En la compu: ícono de instalar al final de la barra de direcciones (Chrome o Edge).'];
}
function installHelp() {
  var i = browserInfo();
  if (i.standalone) { return '<p class="small">Ya la estás usando como app.</p>'; }
  return (X.canInstall ? '<button class="btn sm pri" type="button" data-act="install">Instalar la app</button><p class="small muted">O a mano:</p>' : '') +
    '<ol class="steps">' + installSteps().map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol><p class="small muted">Queda con el ícono de FAA!, abre al toque y funciona sin señal.</p>';
}
function installCard() {
  var i = browserInfo();
  if (i.standalone || lsGet(K.inst) || (!i.ios && !i.android && !X.canInstall)) { return ''; }
  if (X.canInstall) { return '<section class="card"><h3>Instalá la app del FAA!</h3><p class="small">El programa en tu teléfono, también sin señal.</p><div class="row-btns"><button class="btn sm pri" type="button" data-act="install">Instalar</button><button class="btn sm" type="button" data-act="install-hide">Ahora no</button></div></section>'; }
  return det('inst', '', '<span class="sum-t">Instalá la app del FAA!</span><div class="sum-m">El programa en tu teléfono, también sin señal</div>', installHelp() + '<button class="btn sm" type="button" data-act="install-hide">No mostrar más</button>');
}
function vMas() {
  var th = document.documentElement.getAttribute('data-theme') || 'auto';
  return head('Más', '') +
    '<ul class="menu">' +
    '<li><button type="button" data-act="help"><b>Ayuda</b><span>Cómo usar la app</span></button></li>' +
    '<li><button type="button" data-act="share-app"><b>Compartir la app</b><span>Mandale el link a quien quieras</span></button></li>' +
    '<li><button type="button" data-act="pdf"><b>Cronograma en PDF</b><span>Para descargar, imprimir o mandar</span></button></li>' +
    '</ul>' +
    det('mas-inst', '', '<span class="sum-t">Instalar en el teléfono</span>', installHelp()) +
    '<section class="card"><h3>Tema</h3><div class="chips" style="margin:0">' + [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(function (x) { return '<button class="chip" type="button" data-theme="' + x[0] + '" aria-pressed="' + (th === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></section>' +
    '<section class="card"><h3>Tus datos</h3><p class="small">Esta app no tiene cuentas ni registra quién la usa. Lo único que guarda (el programa para usarlo sin señal y tus preferencias) queda en tu teléfono.</p>' +
    '<p class="small">El mapa se dibuja con OpenStreetMap; «Cómo llegar» y «Agendar» abren Google Maps y Google Calendar con sus propias reglas de privacidad. La cámara y la ubicación se usan solo en tu teléfono.</p></section>' +
    (D.meta && D.meta.updated ? '<p class="small muted">Programa actualizado: ' + esc(D.meta.updated.replace('T', ' ').slice(0, 16)) + '</p>' : '');
}

/* ---------- Agendar en el calendario y compartir ---------- */
var CALI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2.5v3M17 2.5v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13.5A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 12.5v5M9.5 15h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
var SHAREI = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6" fill="currentColor"/><circle cx="6" cy="12" r="2.6" fill="currentColor"/><circle cx="18" cy="19" r="2.6" fill="currentColor"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" stroke="currentColor" stroke-width="2"/></svg>';
var CALG = { todo: 'Todo el festival', proyecciones: 'Proyecciones', talleres: 'Talleres y charlas' };
function GCAL() { return (D && D.gcal) || {}; }
function calCard() {
  return '<section class="card calcard"><h3>' + CALI + 'Agendá el festival</h3><p class="small muted">Sumá un grupo entero a tu calendario. Si cambia algo, se actualiza solo.</p><div class="chips calchips">' +
    Object.keys(CALG).map(function (k) { return '<button class="chip" type="button" data-act="cal-grp" data-g="' + k + '">' + CALG[k] + '</button>'; }).join('') + '</div></section>';
}
function calUrl(rel) { return new URL('cal/' + rel, location.href).href; }
function webcal(rel) { return calUrl(rel).replace(/^https?:/, 'webcal:'); }
function utc(di, min) { return new Date(absT(di, min)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function calPlace(v, room) { var o = V(v); if (!o || o.nomap || v === 'tbc') { return room || ''; } return o.n + (room ? ' · ' + room : '') + (o.addr ? ', ' + o.addr + ', El Bolsón' : ''); }
function gcalEv(e) {
  var det0 = (e.d ? e.d + '\n' : '') + (e.films && e.films.length ? 'Programa: ' + e.films.map(function (x) { return x.t || x; }).join(' · ') + '\n' : '') + 'FAA! 2026 · Festival Artístico Audiovisual';
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.t + ' · FAA! 2026') +
    '&dates=' + utc(e.day, e.s) + '/' + utc(e.day, e.e != null ? e.e : e.s + 120) + '&details=' + encodeURIComponent(det0) +
    '&location=' + encodeURIComponent(calPlace(e.v, e.room)) + '&ctz=America/Argentina/Buenos_Aires';
}
var CALNOW = null;
function openCal(kind, key) {
  var box = $('calin'), h = '';
  if (kind === 'ev') {
    var e = D.events.filter(function (x) { return x.id === key; })[0]; if (!e) { return; }
    var dd = D.days[e.day], when = dd.name + ' ' + dd.k + ' · ' + f(e.s) + (e.e != null ? ' a ' + f(e.e) : '') + ' · ' + vtxt(e.v, e.room);
    CALNOW = { rel: 'ev/' + e.id + '.ics', name: e.t, text: e.t + ' · FAA! 2026\n' + when + '\nAgregalo a Google Calendar: ' + gcalEv(e) + '\nO a otro calendario: ' + calUrl('ev/' + e.id + '.ics') };
    h = '<p class="kicker">Agendar</p><h2 id="calt">' + esc(e.t) + '</h2><p class="small muted">' + esc(when) + '</p>' +
      '<div class="cal-btns"><a class="btn pri" href="' + gcalEv(e) + '" target="_blank" rel="noopener">' + CALI + 'Google Calendar</a>' +
      '<a class="btn" href="' + calUrl('ev/' + e.id + '.ics') + '">' + CALI + 'Otro calendario (iPhone, Samsung, Outlook…)</a>' +
      '<button class="btn" type="button" data-act="cal-share">' + SHAREI + 'Compartir</button></div>' +
      '<p class="small muted">Trae un aviso 1 hora antes en iPhone y otros calendarios. Google Calendar usa el aviso que tengas por defecto.</p>';
  } else {
    var rel = key + '.ics', name = CALG[key], g = GCAL()[key];
    CALNOW = { rel: rel, name: name, text: 'Calendario del FAA! 2026 · ' + name + (g ? '\nAgregalo a Google Calendar: ' + g : '') + '\nEn iPhone u otro calendario: ' + webcal(rel) };
    h = '<p class="kicker">Agendar</p><h2 id="calt">' + esc(name) + '</h2><p class="small">Todas las actividades de este grupo, los cinco días. Si cambia algo del programa, se actualiza solo.</p>' +
      '<div class="cal-btns">' + (g ? '<a class="btn pri" href="' + g + '" target="_blank" rel="noopener">' + CALI + 'Agregar a Google Calendar</a>' : '') +
      '<a class="btn' + (g ? '' : ' pri') + '" href="' + webcal(rel) + '">' + CALI + 'En iPhone u otro calendario</a>' +
      '<a class="btn" href="' + calUrl(rel) + '">' + CALI + 'Descargar (no se actualiza)</a>' +
      '<button class="btn" type="button" data-act="cal-share">' + SHAREI + 'Compartir</button></div>' +
      '<p class="small muted">Los avisos dependen de tu app de calendario.</p>';
  }
  box.innerHTML = h + '<button class="btn sm sheet-x" type="button" data-act="cal-close">Cerrar</button>';
  var dl0 = $('calsheet'); if (dl0.showModal) { if (!dl0.open) { dl0.showModal(); } } else { location.href = calUrl(CALNOW.rel); }
}
function shareCal() {
  if (!CALNOW) { return; }
  var c = CALNOW, title = c.name + ' · FAA! 2026';
  fetch(calUrl(c.rel), { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error('ics'); } return r.blob(); }).then(function (b) {
    var file = new File([b], 'FAA2026 - ' + c.name.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.ics', { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { return navigator.share({ files: [file], title: title, text: c.text }); }
    throw new Error('nofile');
  }).catch(function (err) {
    if (err && err.name === 'AbortError') { return; }
    if (navigator.share) { return navigator.share({ title: title, text: c.text }).catch(function () {}); }
    copyText(c.text, 'Copié el mensaje con los links para compartir.');
  });
}

/* ---------- Ayuda ---------- */
function go2(to, txt) { return '<button class="btn sm" type="button" data-act="help-go" data-to="' + to + '">' + txt + '</button>'; }
var HELP = [
  ['¿Dónde está todo el programa?', 'programa cronograma actividades peliculas proyecciones horario', '<p>En <b>Programa</b>: cada actividad del día con horario y sede. Tocá una para ver el detalle; en las proyecciones están las películas de cada bloque. Cambiá de día con la barra de arriba.</p><p>' + go2('programa', 'Ir al Programa') + '</p>'],
  ['¿Cómo agendo una actividad?', 'calendario agendar google iphone samsung outlook aviso recordatorio', '<p>Abrí la actividad y tocá <b>Agendar</b>: Google Calendar u otro calendario (iPhone, Samsung, Outlook). Abajo del Programa podés sumar grupos enteros (todo el festival, proyecciones o talleres) y se actualizan solos si cambia algo.</p>'],
  ['¿Cómo le paso una actividad a alguien?', 'compartir whatsapp invitar amigos', '<p>En la ventana de <b>Agendar</b> está <b>Compartir</b>: manda el evento con los links para agregarlo al calendario. Para mandar toda la app: <b>Más → Compartir la app</b>.</p>'],
  ['¿Dónde queda cada lugar?', 'mapa sedes lugares direccion ubicacion como llegar caminar', '<p>En <b>Mapa</b>: las sedes del día numeradas en orden, el recorrido con el tiempo a pie y <b>Cómo llegar</b> en cada sede.</p><p>' + go2('mapa', 'Abrir el mapa') + '</p>'],
  ['¿Y el cronograma en PDF?', 'pdf cronograma descargar imprimir', '<p>Con el botón <b>Cronograma</b> de arriba: compartir, descargar o ver.</p>'],
  ['¿Qué son los juegos y la cámara?', 'juegos sonidista tera tiles camara mascaras fotos', '<p>En <b>Juegos</b>: ¡Corre, sonidista! (dos modos), Tera Tiles y la Cámara FAA con las máscaras de la tera. La cámara procesa todo en tu teléfono: no se sube nada.</p><p>' + go2('juegos', 'Ir a Juegos') + '</p>'],
  ['¿Funciona sin señal?', 'sin señal offline internet datos', '<p>Sí: después de abrirla una vez con internet queda guardada. Cuando vuelve la señal, busca cambios del programa sola.</p>'],
  ['¿Cómo la instalo?', 'instalar app pantalla de inicio', '<p>En <b>Más → Instalar en el teléfono</b> están los pasos para tu navegador.</p><p>' + go2('mas', 'Ver cómo') + '</p>'],
  ['¿Qué datos míos usa?', 'privacidad datos seguridad cuenta ubicacion camara', '<p>Ninguno: no hay cuentas ni registro. La ubicación (en el mapa) y la cámara se usan solo en tu teléfono, y solo si las activás.</p>']
];
function hnorm(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, ' '); }
function openHelp(first) {
  var box = $('helpin');
  box.innerHTML = '<p class="kicker">Ayuda</p><h2 id="helpt">Cómo usar la app</h2>' +
    (first ? '<div class="help-first"><b>¡Bienvenidx al FAA! 2026!</b><ol><li>En <b>Programa</b> está todo, día por día.</li><li>Tocá una actividad para agendarla o ver cómo llegar.</li><li>Esta ayuda queda en el botón <b>?</b> de arriba.</li></ol><div class="row-btns"><button class="btn sm pri" type="button" data-act="help-close">Entendido</button></div></div>' : '') +
    '<input class="help-search" id="helpq" type="search" placeholder="Buscá: mapa, agendar, PDF…" aria-label="Buscar en la ayuda" autocomplete="off">' +
    '<div class="help-list" id="helplist">' + HELP.map(function (h, i) { return '<details data-i="' + i + '"><summary>' + h[0] + '</summary><div class="ans">' + h[2] + '</div></details>'; }).join('') + '</div>' +
    '<p class="help-none" id="helpnone" hidden>No encontré nada con eso. Probá con otra palabra.</p>' +
    '<button class="btn sm sheet-x" type="button" data-act="help-close">Cerrar</button>';
  $('helpq').addEventListener('input', function () {
    var words = hnorm(this.value).trim().split(/\s+/).filter(Boolean), shown = 0;
    box.querySelectorAll('#helplist details').forEach(function (d) {
      var h = HELP[+d.getAttribute('data-i')], txt = hnorm(h[0] + ' ' + h[1] + ' ' + h[2]), ok = words.every(function (w) { return txt.indexOf(w) > -1; });
      d.hidden = !ok; if (ok) { shown++; } d.open = ok && words.length > 0 && shown <= 2;
    });
    $('helpnone').hidden = shown > 0;
  });
  var dl0 = $('helpsheet'); if (dl0.showModal) { if (!dl0.open) { dl0.showModal(); } } else { dl0.setAttribute('open', ''); }
  box.scrollTop = 0;
}

/* ---------- Render y navegación ---------- */
var app = $('app');
var VIEWS = { programa: vPrograma, mapa: vMapa, juegos: vJuegos, mas: vMas };
function renderDays() {
  var el = $('days'); el.hidden = !DAY_VIEWS[S.view]; if (el.hidden) { return; }
  var ti = todayIdx();
  el.innerHTML = D.days.map(function (d, i) {
    var ch = D.events.some(function (e) { return e.day === i && changed(e.id); });
    return '<button class="day' + (i === ti ? ' today' : '') + (ch ? ' chg' : '') + '" type="button" data-day="' + i + '" aria-pressed="' + (S.day === i) + '" aria-label="' + esc(d.name + ' ' + d.k) + (i === ti ? ', hoy' : '') + '"><small>' + esc(d.dow) + '</small><b>' + d.k + '</b></button>';
  }).join('');
}
function renderNav() { document.querySelectorAll('#nav [data-go]').forEach(function (b) { if (b.getAttribute('data-go') === S.view) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); } }); }
function render(keep) {
  if (!D) { return; }
  var y = window.scrollY;
  renderDays(); renderNav(); killMap();
  app.innerHTML = (VIEWS[S.view] || vPrograma)();
  if (S.view === 'mapa') { mountMap(); }
  if (keep) { window.scrollTo(0, y); }
}
function setHash() { var h = '#' + S.view + (DAY_VIEWS[S.view] ? '-' + D.days[S.day].k : ''); if (location.hash !== h) { history.pushState(null, '', h); } }
function readHash() {
  var r = /^#([a-z]+)(?:-(\d+))?$/.exec(location.hash || ''); if (!r || !VIEWS[r[1]]) { return false; }
  S.view = r[1]; if (r[2]) { var i = D.days.findIndex(function (d) { return String(d.k) === r[2]; }); if (i > -1) { S.day = i; } }
  return true;
}
function go(view) { S.view = view; setHash(); render(); window.scrollTo(0, 0); }
window.addEventListener('popstate', function () { if (D && readHash()) { render(); } });

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-go],[data-day],[data-theme],[data-act]'); if (!t) { return; }
  var act = t.getAttribute('data-act');
  if (!D && !/^(pdf|help)/.test(act || '')) { return; }
  if (t.hasAttribute('data-go')) { go(t.getAttribute('data-go')); return; }
  if (t.hasAttribute('data-day')) { S.day = +t.getAttribute('data-day'); setHash(); render(); return; }
  if (t.hasAttribute('data-theme')) { var th = t.getAttribute('data-theme'); if (th === 'auto') { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem(K.theme); } catch (er) {} } else { document.documentElement.setAttribute('data-theme', th); lsSet(K.theme, th); } render(true); return; }
  if (act === 'install') { if (X.bip) { X.bip.prompt(); X.bip.userChoice.then(function () { X.bip = null; X.canInstall = false; render(true); }); } }
  else if (act === 'install-hide') { lsSet(K.inst, 1); render(true); }
  else if (act === 'pdf') { getPdfFile().catch(function () {}); var p = $('pdfsheet'); if (p.showModal) { p.showModal(); } else { window.open(PDF, '_blank'); } }
  else if (act === 'pdf-close') { $('pdfsheet').close(); }
  else if (act === 'pdf-share') { sharePdf(); }
  else if (act === 'share-app') { shareApp(); }
  else if (act === 'cal-ev') { openCal('ev', t.getAttribute('data-id')); }
  else if (act === 'cal-grp') { openCal('grp', t.getAttribute('data-g')); }
  else if (act === 'cal-share') { shareCal(); }
  else if (act === 'cal-close') { $('calsheet').close(); }
  else if (act === 'help') { openHelp(false); }
  else if (act === 'help-close') { $('helpsheet').close(); }
  else if (act === 'help-go') { $('helpsheet').close(); go(t.getAttribute('data-to')); }
  else if (act === 'reload') { location.reload(); }
  else if (act === 'map-loc') { S.loc = !S.loc; t.setAttribute('aria-pressed', S.loc); if (X.lmap) { if (S.loc) { X.lmap.locate({ watch: true, enableHighAccuracy: true }); } else { X.lmap.stopLocate(); if (X.lme) { X.lmap.removeLayer(X.lme); X.lmap.removeLayer(X.lacc); X.lme = null; } } } }
});
['calsheet', 'helpsheet', 'pdfsheet'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) { this.close(); } }); });
$('helpsheet').addEventListener('close', function () { lsSet(K.help, 1); });
document.addEventListener('toggle', function (e) {
  var d = e.target; if (!d.matches || !d.matches('details[data-k]')) { return; }
  X.open[d.getAttribute('data-k')] = d.open ? 1 : 0; lsSet(K.open, X.open);
}, true);

var toastTimer = null;
function toast(text, action, act) {
  var el = $('toast');
  el.innerHTML = '<p>' + esc(text) + '</p>' + (action ? '<button type="button" data-act="' + act + '">' + esc(action) + '</button>' : '') + '<button type="button" class="x" aria-label="Cerrar">✕</button>';
  el.hidden = false; el.querySelector('.x').onclick = function () { el.hidden = true; };
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, action ? 12000 : 4500);
}

/* ---------- Datos: carga y cambios del programa ---------- */
function diffEvents(a, b) {
  var A0 = {}, out = []; a.events.forEach(function (e) { A0[e.id] = e; });
  b.events.forEach(function (n) {
    var o = A0[n.id];
    if (!o) { out.push({ id: n.id, t: 'Nueva actividad: ' + n.t + ' (' + dl(n.day) + ', ' + f(n.s) + ')' }); return; }
    if (o.s !== n.s || o.e !== n.e || o.day !== n.day) { out.push({ id: n.id, t: 'Cambió el horario de ' + n.t + ': ahora ' + dl(n.day) + ' ' + f(n.s) }); }
    else if (o.v !== n.v || o.room !== n.room) { out.push({ id: n.id, t: 'Cambió el lugar de ' + n.t }); }
    else if (o.t !== n.t || o.d !== n.d || J(o.films) !== J(n.films)) { out.push({ id: n.id, t: 'Se actualizó ' + n.t }); }
  });
  return out;
}
function apply(nd) {
  if (D && J(D.events) === J(nd.events) && J(D.venues) === J(nd.venues) && J(D.gcal) === J(nd.gcal)) { return false; }
  var ch = D ? diffEvents(D, nd) : [];
  D = nd; lsSet(K.data, nd);
  if (ch.length) {
    var at = Date.now(); ch.forEach(function (c) { CHG[c.id] = at; }); lsSet(K.chg, CHG);
    toast(ch.length === 1 ? ch[0].t : 'Se actualizó el programa: ' + ch.length + ' cambios.');
  }
  return true;
}
var pulling = null;
function pull() {
  if (pulling) { return pulling; }
  pulling = fetch('datos.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); }).then(function (nd) {
    var first = !D, c = apply(nd);
    if (first) { boot(); } else if (c) { render(true); }
  }).catch(function () {
    if (!D) { app.innerHTML = '<section class="card warn"><h3>No se pudo cargar el programa</h3><p class="small">Conectate a internet una vez para descargarlo. Después funciona sin señal.</p><button class="btn sm pri" type="button" data-act="reload">Reintentar</button></section>'; }
  }).then(function () { pulling = null; });
  return pulling;
}

/* ---------- Instalación y service worker ---------- */
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); X.bip = e; X.canInstall = true; if (D && (S.view === 'programa' || S.view === 'mas')) { render(true); } });
window.addEventListener('appinstalled', function () { X.canInstall = false; X.bip = null; toast('¡Listo! La app quedó instalada.'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  var hadCtrl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(function () {});
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtrl) { toast('Hay una versión nueva de la app.', 'Recargar', 'reload'); } hadCtrl = true; });
}

/* ---------- Arranque ---------- */
function boot() {
  if (app.dataset.booted) { return; }
  app.dataset.booted = '1';
  var ti = todayIdx(); S.day = ti > -1 ? ti : 0;
  if (!readHash()) { S.view = 'programa'; history.replaceState(null, '', '#programa-' + D.days[S.day].k); }
  render();
  if (!lsGet(K.help)) { setTimeout(function () { openHelp(true); }, 600); }
}
(function start() {
  var c = lsGet(K.data); if (c && c.days) { D = c; boot(); }
  pull();
  setInterval(function () { if (document.visibilityState === 'visible') { pull(); } }, 10 * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { pull(); if (D) { render(true); } } });
  window.addEventListener('online', function () { pull(); });
  setInterval(function () { if (D && document.visibilityState === 'visible' && S.view === 'programa') { render(true); } }, 60000);
})();
})();
