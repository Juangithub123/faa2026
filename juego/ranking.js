/* Ranking compartido de ¡Corre, sonidista! — guarda los puntajes en una planilla de Google (Apps Script).
   Para activarlo, pegá abajo la URL de la implementación ("…/exec"). Vacía = el ranking no se muestra. */
(function () {
'use strict';
var URL = '';

var NICK = 'faa26-nick', game = '', last = null, sent = false;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clean(n) { return String(n || '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _.]/g, '').replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, '').slice(0, 12); }
function getNick() { try { return localStorage.getItem(NICK) || ''; } catch (e) { return ''; } }
function setNick(n) { try { localStorage.setItem(NICK, n); } catch (e) {} }

function call(params) {
  var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) { ctl.abort(); } }, 9000);
  return fetch(URL + '?' + q, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { return r.json(); })
    .then(function (j) { clearTimeout(t); if (!j.ok) { throw new Error(j.err || 'error'); } return j; });
}
function list(el, rows, me, myScore) {
  if (!rows || !rows.length) { el.innerHTML = '<li class="rk-empty">Todavía no hay tomas. ¡Sé la primera!</li>'; return; }
  el.innerHTML = rows.map(function (r, i) {
    var mine = me && r.n.toLowerCase() === me.toLowerCase();
    return '<li' + (mine ? ' class="me"' : '') + '><b>' + (i + 1) + '</b><span>' + esc(r.n) + '</span><em>' + r.s + ' m</em></li>';
  }).join('');
}
function css() {
  var s = document.createElement('style');
  s.textContent = '.rk{display:grid;gap:8px;text-align:left}' +
    '.rk-row{display:flex;gap:6px}.rk-row input{flex:1;min-width:0;border:2px solid #F4C95C;border-radius:999px;background:#3a1606;color:#F6EFC4;padding:9px 13px;font:700 15px system-ui;-webkit-user-select:text;user-select:text}' +
    '.rk-row button{border:0;border-radius:999px;background:#8FBABA;color:#3a1606;font:900 14px system-ui;padding:9px 14px}' +
    '.rk ol{list-style:none;padding:0;margin:0;display:grid;gap:2px;font:600 14px system-ui}' +
    '.rk li{display:flex;gap:8px;align-items:baseline;padding:4px 8px;border-radius:8px;background:rgba(246,239,196,.07)}' +
    '.rk li b{width:20px;color:#F4C95C;font-variant-numeric:tabular-nums}.rk li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.rk li em{font-style:normal;font-variant-numeric:tabular-nums;opacity:.9}.rk li.me{background:#F4C95C;color:#3a1606}.rk li.me b{color:#3a1606}' +
    '.rk-msg{font-size:12.5px;opacity:.8;min-height:1em;text-align:center}.rk-empty{opacity:.7}.rk h2{font:900 15px system-ui;text-align:center;color:#8FBABA;letter-spacing:.04em;text-transform:uppercase}';
  document.head.appendChild(s);
}
function block(id) {
  var d = document.createElement('div'); d.className = 'rk'; d.id = id;
  d.innerHTML = '<h2>Ranking del staff</h2>' +
    (id === 'rk-over' ? '<div class="rk-row"><input id="rk-nick" maxlength="12" placeholder="Tu apodo" autocomplete="nickname" enterkeyhint="send"><button type="button" id="rk-send">Subir</button></div>' : '') +
    '<ol></ol><p class="rk-msg"></p>';
  return d;
}
function load(box, hint) {
  var msg = box.querySelector('.rk-msg'), ol = box.querySelector('ol');
  msg.textContent = 'Cargando…';
  call({ a: 'top', g: game }).then(function (j) { if (box.id === 'rk-over' && sent) { return; } list(ol, j.top, getNick()); msg.textContent = hint || ''; })
    .catch(function () { msg.textContent = navigator.onLine === false ? 'Sin conexión: el ranking se ve con internet.' : 'No se pudo cargar el ranking.'; });
}
function send() {
  var inp = $('rk-nick'), box = $('rk-over'), msg = box.querySelector('.rk-msg'), n = clean(inp.value);
  inp.value = n;
  if (!n) { msg.textContent = 'Poné un apodo (hasta 12 letras).'; inp.focus(); return; }
  if (sent || !last) { return; }
  setNick(n); sent = true; $('rk-send').disabled = true; msg.textContent = 'Subiendo…';
  call({ a: 'add', g: game, n: n, s: last.score, c: last.coins || 0, t: Math.round(last.secs) })
    .then(function (j) { list(box.querySelector('ol'), j.top, n); msg.textContent = 'Quedaste en el puesto ' + j.pos + '.'; })
    .catch(function (e) { sent = false; $('rk-send').disabled = false; msg.textContent = e.message === 'puntaje' ? 'Ese puntaje no se pudo validar.' : 'No se pudo subir. Probá de nuevo con señal.'; });
}

window.FAARank = {
  /* game: 'carriles' o 'clasico'. Agrega el ranking a los cuadros de inicio y de fin de partida. */
  mount: function (g) {
    if (!URL) { return; }
    game = g; css();
    var startBox = document.querySelector('#start .box'), overBox = document.querySelector('#over .box');
    var see = document.createElement('button'); see.type = 'button'; see.className = 'lnk rk-see'; see.textContent = 'Ver ranking del staff';
    see.style.cssText = 'background:transparent;border:0;color:#F4C95C;font:800 14px system-ui;text-decoration:underline';
    var sb = block('rk-start'); sb.hidden = true;
    see.addEventListener('click', function () { sb.hidden = !sb.hidden; see.textContent = sb.hidden ? 'Ver ranking del staff' : 'Ocultar ranking'; if (!sb.hidden) { load(sb); } });
    startBox.appendChild(see); startBox.appendChild(sb);
    var ob = block('rk-over');
    overBox.insertBefore(ob, overBox.querySelector('.go'));
    $('rk-send').addEventListener('click', send);
    $('rk-nick').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { send(); } });
  },
  /* llamar al terminar cada partida */
  over: function (r) {
    if (!URL) { return; }
    last = r; sent = false;
    var inp = $('rk-nick'); inp.value = getNick(); $('rk-send').disabled = !(r.score > 0);
    load($('rk-over'), r.score > 0 ? (getNick() ? 'Tocá Subir para anotar esta toma.' : 'Poné tu apodo para anotar esta toma.') : '');
  }
};
})();
