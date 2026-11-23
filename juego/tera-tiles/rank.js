/* Ranking del staff y pozo común para Tera Tiles.
   Usa la misma planilla de Google (Apps Script) que ¡Corre, sonidista! (../ranking.js), con juego=teratiles.
   - Ranking: uno por tema (solo los temas de la biblioteca), con el mejor puntaje de cada apodo.
   - Pozo común: cada partida suma el 1 % de su puntaje en fichas. Sin señal quedan guardadas en el
     teléfono (misma lista de pendientes que los otros juegos) y se mandan después. */
(function () {
'use strict';
var URL = 'https://script.google.com/macros/s/AKfycbwxL9zxyDG1T9gg9pPqzpRNzI5wFGNc9XR6aMMdax-PdUywFKKR-ace5_Biw4nfhT_MkA/exec';
var GAME = 'teratiles', NICK = 'faa26-nick', POZO = 'faa26-pozo-pend', PCT = 0.01;
var DIF = { facil: 'fácil', normal: 'normal', dificil: 'difícil' };
var PARTE = { melody: 'melodía', bass: 'bajo', drums: 'batería', harmony: 'armonía' };
var last = null, sent = false, tema = '';

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clean(n) { return String(n || '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _.]/g, '').replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, '').slice(0, 12); }
function getNick() { try { return localStorage.getItem(NICK) || ''; } catch (e) { return ''; } }
function setNick(n) { try { localStorage.setItem(NICK, n); } catch (e) {} }
function fmt(n) { try { return Number(n).toLocaleString('es-AR'); } catch (e) { return String(n); } }
/* clave del tema en la planilla: el nombre del archivo de la biblioteca, sin ".mid" (los temas propios no tienen ranking) */
function temaDe(song) {
  if (!song || !song.file || !/^songs\//.test(song.file)) { return ''; }
  return song.file.slice(6).replace(/\.midi?$/i, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

/* pedido JSONP al script de Google (igual que ../ranking.js) */
var seq = 0;
function call(params) {
  return new Promise(function (resolve, reject) {
    var cb = 'ttrank' + Date.now().toString(36) + (seq++), el = document.createElement('script'), done = false;
    params.cb = cb;
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    function fin() { done = true; clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (el.parentNode) { el.parentNode.removeChild(el); } }
    function fail(name) { if (done) { return; } fin(); var e = new Error(name); e.name = name; reject(e); }
    var to = setTimeout(function () { fail('Timeout'); }, 25000);
    window[cb] = function (j) { if (done) { return; } fin(); if (!j || !j.ok) { reject(new Error((j && j.err) || 'error')); } else { resolve(j); } };
    el.onerror = function () { fail('NetworkError'); };
    el.src = URL + '?' + q;
    document.head.appendChild(el);
  });
}
function errMsg(e) {
  return e.message === 'juego' ? 'El ranking de Tera Tiles todavía no está activado.' :
    e.message === 'puntaje' ? 'Ese puntaje no se pudo validar.' :
    navigator.onLine === false ? 'Sin señal: probá de nuevo cuando vuelva.' :
    e.name === 'Timeout' ? 'El ranking tardó demasiado en responder. Probá de nuevo.' :
    /^script: /.test(e.message) ? 'Error del ranking: ' + e.message.slice(8) :
    'No se pudo conectar con el ranking (' + (e.name || 'error') + ').';
}

/* ---------- vista ---------- */
function css() {
  var s = document.createElement('style');
  s.textContent = '.rk{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;text-align:left;width:100%;max-width:380px}.rk[hidden]{display:none}' +
    '.rk h3{margin:0;font:900 15px system-ui;text-align:center;color:#F4C95C;letter-spacing:.04em;text-transform:uppercase;border-top:1px solid rgba(246,239,196,.25);padding-top:10px}' +
    '.rk h3 small{display:block;font:700 12px system-ui;color:#F6EFC4;opacity:.8;text-transform:none;letter-spacing:0;margin-top:2px}' +
    '.rk-row{display:flex;gap:6px}.rk-row input{flex:1;min-width:0;width:0;border:2px solid #F4C95C;border-radius:999px;background:#3a1606;color:#F6EFC4;padding:9px 13px;font:700 15px system-ui;-webkit-user-select:text;user-select:text}' +
    '.rk-row button{border:0;border-radius:999px;background:#8FBABA;color:#3a1606;font:900 14px system-ui;padding:9px 14px}.rk-row button:disabled{opacity:.5}' +
    '.rk ol{list-style:none;padding:0;margin:0;display:grid;gap:2px;font:600 14px system-ui}' +
    '.rk li{display:flex;gap:8px;align-items:baseline;padding:4px 8px;border-radius:8px;background:rgba(246,239,196,.07)}' +
    '.rk li b{width:20px;color:#F4C95C;font-variant-numeric:tabular-nums}.rk li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.rk li i{font-style:normal;font-size:11px;opacity:.7}' +
    '.rk li em{font:800 13px ui-monospace,monospace;font-style:normal;font-variant-numeric:tabular-nums}.rk li.me{background:#F4C95C;color:#3a1606}.rk li.me b{color:#3a1606}' +
    '.rk-msg{margin:0;font-size:12.5px;opacity:.8;min-height:1em;text-align:center}.rk-empty{opacity:.7}' +
    '.rk-pozo{margin:0;width:100%;max-width:380px;box-sizing:border-box;padding:8px 12px;border-radius:12px;background:rgba(116,198,232,.14);border:1px solid rgba(116,198,232,.55);color:#F6EFC4;font:600 13.5px/1.3 system-ui;text-align:center}' +
    '.rk-pozo b{color:#74C6E8;font:900 17px ui-monospace,Menlo,monospace}.rk-pozo small{display:block;opacity:.8;font-size:12px;margin-top:2px}' +
    '.rk-see{background:transparent;border:0;color:#F4C95C;font:800 14px system-ui;text-decoration:underline;cursor:pointer}';
  document.head.appendChild(s);
}
function block(id, withInput) {
  var d = document.createElement('div'); d.className = 'rk'; d.id = id;
  d.innerHTML = '<h3>Ranking del staff<small></small></h3>' +
    (withInput ? '<div class="rk-row"><input id="rk-nick" maxlength="12" placeholder="Tu apodo" autocomplete="nickname" enterkeyhint="send"><button type="button" id="rk-send">Subir</button></div>' : '') +
    '<ol></ol><p class="rk-msg"></p>';
  return d;
}
function pozoLine(id) {
  var d = document.createElement('p'); d.className = 'rk-pozo'; d.id = id;
  d.innerHTML = 'Pozo común para la universidad pública: <b>…</b> fichas<small></small>';
  return d;
}
function list(box, rows, me) {
  var ol = box.querySelector('ol');
  if (!rows || !rows.length) { ol.innerHTML = '<li class="rk-empty">Todavía nadie anotó este tema. ¡Sé la primera toma!</li>'; return; }
  ol.innerHTML = rows.map(function (r, i) {
    var mine = me && r.n.toLowerCase() === me.toLowerCase();
    var tag = [PARTE[r.p] || '', DIF[r.d] || ''].filter(Boolean).join(' · ');
    return '<li' + (mine ? ' class="me"' : '') + '><b>' + (i + 1) + '</b><span>' + esc(r.n) + (tag ? ' <i>' + esc(tag) + '</i>' : '') + '</span><em>' + fmt(r.s) + '</em></li>';
  }).join('');
}
function showPozo(n) { if (n == null) { return; } document.querySelectorAll('.rk-pozo b').forEach(function (b) { b.textContent = fmt(n); }); }
function load(box, t, hint) {
  var msg = box.querySelector('.rk-msg');
  msg.textContent = 'Cargando…';
  call({ op: 'top', juego: GAME, tema: t }).then(function (j) {
    showPozo(j.pozo);
    if (t !== tema || (box.id === 'rk-res' && sent)) { return; }
    list(box, j.top, getNick()); msg.textContent = hint || '';
  }).catch(function (e) { if (t === tema) { box.querySelector('ol').innerHTML = ''; msg.textContent = navigator.onLine === false ? 'Sin conexión: el ranking se ve con internet.' : errMsg(e); } });
}

/* ---------- pozo común (misma lista de pendientes que ../ranking.js) ---------- */
function pend() { try { return JSON.parse(localStorage.getItem(POZO)) || { f: 0, s: 0, k: 0 }; } catch (e) { return { f: 0, s: 0, k: 0 }; } }
function setPend(o) { try { localStorage.setItem(POZO, JSON.stringify(o)); } catch (e) {} }
var flushing = false, flushP = null;
function flush() {
  var q = pend();
  if (flushing) { return flushP.then(function () { return pend().f > 0 ? flush() : true; }); }
  if (!(q.f > 0)) { return Promise.resolve(true); }
  flushing = true;
  var out = { f: q.f, s: q.s, k: q.k || 1 };
  flushP = call({ op: 'pozo', juego: GAME, fichas: out.f, seg: Math.max(1, Math.round(out.s)), partidas: out.k })
    .then(function (j) {
      if (j.pozo == null) { throw new Error('sin-pozo'); }
      var now = pend(); setPend({ f: Math.max(0, now.f - out.f), s: Math.max(0, now.s - out.s), k: Math.max(0, (now.k || 0) - out.k) });
      flushing = false; showPozo(j.pozo); return true;
    })
    .catch(function (e) { flushing = false; if (e.message === 'fichas') { setPend({ f: 0, s: 0, k: 0 }); } return false; });
  return flushP;
}

function send() {
  var inp = $('rk-nick'), box = $('rk-res'), msg = box.querySelector('.rk-msg'), n = clean(inp.value);
  inp.value = n;
  if (!n) { msg.textContent = 'Poné un apodo (hasta 12 letras).'; inp.focus(); return; }
  if (sent || !last) { return; }
  setNick(n); sent = true; $('rk-send').disabled = true; msg.textContent = 'Subiendo…';
  var r = last;
  call({ op: 'anotar', juego: GAME, apodo: n, metros: r.score, fichas: r.fichas, seg: Math.max(2, Math.round(r.secs)), tema: r.tema, parte: r.parte, dif: r.dif })
    .then(function (j) { showPozo(j.pozo); list(box, j.top, n); msg.textContent = 'Quedaste en el puesto ' + j.pos + ' de este tema.'; })
    .catch(function (e) { sent = false; $('rk-send').disabled = false; msg.textContent = errMsg(e); });
}

var songBox, songSee, resBox, resPozo;
window.TRank = {
  mount: function () {
    if (!URL) { return; }
    css();
    // menú: total del pozo
    var menu = $('sMenu'); menu.insertBefore(pozoLine('rk-pozo-menu'), $('calBtn'));
    // pantalla del tema: "Ver ranking del tema"
    var play = $('playBtn');
    songSee = document.createElement('button'); songSee.type = 'button'; songSee.className = 'rk-see'; songSee.textContent = 'Ver ranking del tema';
    songBox = block('rk-song', false); songBox.hidden = true;
    play.parentNode.insertBefore(songBox, play.nextSibling);
    play.parentNode.insertBefore(songSee, play.nextSibling);
    songSee.addEventListener('click', function () {
      songBox.hidden = !songBox.hidden; songSee.textContent = songBox.hidden ? 'Ver ranking del tema' : 'Ocultar ranking';
      if (!songBox.hidden) { load(songBox, tema); }
    });
    // resultados: pozo y ranking del tema, antes de "Otra toma"
    var again = $('againBtn');
    resPozo = pozoLine('rk-pozo-res'); resBox = block('rk-res', true);
    again.parentNode.insertBefore(resPozo, again); again.parentNode.insertBefore(resBox, again);
    $('rk-send').addEventListener('click', send);
    $('rk-nick').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { send(); } });
    $('rk-nick').addEventListener('keyup', function (e) { e.stopPropagation(); });
    call({ op: 'top', juego: GAME, tema: 'x' }).then(function (j) { showPozo(j.pozo); }).catch(function () {});
    flush();
    window.addEventListener('online', flush);
  },
  /* al abrir un tema */
  song: function (s) {
    if (!songBox) { return; }
    tema = temaDe(s);
    songSee.hidden = !tema; songBox.hidden = true; songSee.textContent = 'Ver ranking del tema';
    songBox.querySelector('h3 small').textContent = s.title;
  },
  /* al terminar la partida: r = { score, secs, parte, dif, song } */
  over: function (r) {
    if (!resBox) { return; }
    tema = temaDe(r.song);
    var fichas = Math.max(0, Math.floor(r.score * PCT)), note = resPozo.querySelector('small');
    last = { score: r.score, secs: r.secs, tema: tema, parte: r.parte, dif: r.dif, fichas: fichas }; sent = false;
    if (fichas > 0) {
      var q = pend(); q.f += fichas; q.s += r.secs || 0; q.k = (q.k || 0) + 1; setPend(q);
      note.textContent = 'Esta toma suma ' + fmt(fichas) + ' fichas (1 cada 100 puntos)…';
      flush().then(function (ok) { note.textContent = ok ? 'Tus ' + fmt(fichas) + ' fichas ya se sumaron. ¡Gracias!' : 'Tus ' + fmt(fichas) + ' fichas se suman cuando haya señal.'; });
    } else { note.textContent = 'Cada 100 puntos suman una ficha al pozo.'; }
    resBox.hidden = !tema;
    if (!tema) { return; }
    resBox.querySelector('h3 small').textContent = r.song.title;
    var inp = $('rk-nick'); inp.value = getNick(); $('rk-send').disabled = !(r.score > 0);
    list(resBox, [], ''); resBox.querySelector('ol').innerHTML = '';
    load(resBox, tema, r.score > 0 ? (getNick() ? 'Tocá Subir para anotar esta toma.' : 'Poné tu apodo para anotar esta toma.') : '');
  }
};
})();
