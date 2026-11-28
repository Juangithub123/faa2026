// Puntos por segundo máximos posibles en cada juego (con margen): descarta puntajes imposibles.
var JUEGOS = { carriles: 30, clasico: 50, teratiles: 20000 };
// Puntaje máximo aceptado (Tera Tiles suma mucho más que los metros de los corredores).
var TOPE = { teratiles: 10000000 };

// Versión 7: medallas (pestaña "logros", ranking de coleccionistas, rareza y nivel al lado del apodo),
// control del tiempo de cada toma de carriles y columna "Revisar" para tomas con muy pocos movimientos.
// Versión 6: suma Tera Tiles (ranking por tema) al ranking y al pozo común.
// Importante: no usar parámetros de una sola letra (Google rechaza algunos cuando no hay cuenta iniciada).
function doGet(e) {
  var q = (e && e.parameter) || {}, out;
  var p = { a: q.op || q.a, g: q.juego || q.g, n: q.apodo || q.n, s: q.metros || q.s, c: q.fichas || q.c, t: q.seg || q.t, k: q.partidas,
            tema: limpiarTema(q.tema), parte: String(q.parte || '').slice(0, 20), dif: String(q.dif || '').slice(0, 10), cb: q.cb, q: q };
  try {
    var g = p.g;
    if (!JUEGOS[g]) out = { ok: false, err: 'juego' };
    else if (p.a === 'add' || p.a === 'anotar') out = agregar(g, p);
    else if (p.a === 'pozo') out = sumarPozo(p);
    else if (p.a === 'logros') out = guardarLogros(q);
    else if (p.a === 'recuperar') out = recuperar(q);
    else out = conLogros({ ok: true, top: mejores(g, p.tema).slice(0, 10), pozo: totalPozo() });
  } catch (err) {
    out = { ok: false, err: 'script: ' + (err && err.message ? err.message : String(err)) };
  }
  return salida(out, p.cb);
}

function hoja(g) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(g);
  if (!sh) {
    sh = ss.insertSheet(g);
    sh.appendRow(g === 'teratiles' ? ['Fecha', 'Apodo', 'Puntaje', 'Fichas', 'Segundos', 'Tema', 'Parte', 'Dificultad'] : ['Fecha', 'Apodo', 'Metros', 'Fichas', 'Segundos']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function limpiar(n) {
  return String(n || '')
    .replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _.]/g, '')
    .replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, '')
    .slice(0, 12);
}

function limpiarTema(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

function agregar(g, p) {
  var n = limpiar(p.n), s = Math.floor(Number(p.s)), c = Math.floor(Number(p.c)) || 0, t = Number(p.t);
  if (!n) return { ok: false, err: 'apodo' };
  if (!(s > 0 && s < (TOPE[g] || 100000) && t >= 2 && s / t <= JUEGOS[g])) return { ok: false, err: 'puntaje' };
  if (g === 'carriles' && !tiempoOk(s, t)) return { ok: false, err: 'tiempo' };
  if (g === 'teratiles') {
    if (!p.tema) return { ok: false, err: 'tema' };
    hoja(g).appendRow([new Date(), n, s, c, Math.round(t), p.tema, p.parte, p.dif]);
  } else if (g === 'carriles') {
    var q = p.q || {}, ac = ['saltos', 'rodadas', 'carriles', 'obstaculos'].map(function (k) { var v = Math.floor(Number(q[k])); return v >= 0 ? v : ''; });
    var sh = hoja(g);
    if (!sh.getRange('F1').getValue()) sh.getRange('F1:J1').setValues([['Saltos', 'Rodadas', 'Carriles', 'Obstáculos', 'Revisar']]);
    sh.appendRow([new Date(), n, s, c, Math.round(t)].concat(ac, [revisar(s, ac)]));
  } else {
    hoja(g).appendRow([new Date(), n, s, c, Math.round(t)]);
  }
  var lista = mejores(g, p.tema), pos = 1;
  lista.forEach(function (r) { if (r.s > s && r.n.toLowerCase() !== n.toLowerCase()) pos++; });
  return conLogros({ ok: true, top: lista.slice(0, 10), pos: pos, pozo: totalPozo() });
}

// Pozo común: todas las fichas de todas las partidas de todos los juegos.
function hojaPozo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('pozo');
  if (!sh) {
    sh = ss.insertSheet('pozo');
    sh.getRange('A1:B3').setValues([['Fichas en el pozo', 0], ['Partidas', 0], ['Última suma', '']]);
  }
  return sh;
}

function totalPozo() {
  return Number(hojaPozo().getRange('B1').getValue()) || 0;
}

function sumarPozo(p) {
  var f = Math.floor(Number(p.c)), t = Number(p.t), k = Math.max(1, Math.floor(Number(p.k)) || 1);
  if (!(f >= 0 && f <= 200000 && t >= 1 && f <= t * 200 + 30 && k <= 500)) return { ok: false, err: 'fichas' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, err: 'ocupado' };
  try {
    var sh = hojaPozo(), r = sh.getRange('B1:B3'), v = r.getValues();
    var total = (Number(v[0][0]) || 0) + f;
    r.setValues([[total], [(Number(v[1][0]) || 0) + k], [new Date()]]);
    return { ok: true, pozo: total };
  } finally {
    lock.releaseLock();
  }
}

// Mejor marca de cada apodo. En Tera Tiles, solo del tema pedido (columna F), con su parte y dificultad.
function mejores(g, tema) {
  var filas = hoja(g).getDataRange().getValues().slice(1), mejor = {}, tt = g === 'teratiles';
  filas.forEach(function (f) {
    var n = String(f[1]), s = Number(f[2]), k = n.toLowerCase();
    if (!n || !(s > 0)) return;
    if (tt && String(f[5]) !== tema) return;
    if (!mejor[k] || s > mejor[k].s) mejor[k] = tt ? { n: n, s: s, c: Number(f[3]) || 0, p: String(f[6] || ''), d: String(f[7] || '') } : { n: n, s: s, c: Number(f[3]) || 0 };
  });
  return Object.keys(mejor).map(function (k) { return mejor[k]; }).sort(function (a, b) { return b.s - a.s; });
}

function salida(o, cb) {
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$]{0,40}$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(o) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Control de carriles ----------
// El juego acelera siempre igual, así que los metros dicen cuánto tiempo tuvo que durar la toma (sin contar pausas).
// Se acepta la curva nueva (desde el 28/11) o la anterior, con un margen chico.
function tiempoEsperado(m, nueva) {
  var t = 0, x = 0, paso = 5;
  while (x < m) {
    var d = Math.min(paso, m - x), v = nueva ? 400 + 560 * Math.pow(Math.min(1, x / 5000), 0.75) : Math.min(880, 430 + x * 38 * 0.0052);
    t += d * 38 / v; x += d;
  }
  return t;
}
function tiempoOk(m, t) {
  return [true, false].some(function (nueva) { var e = tiempoEsperado(m, nueva); return Math.abs(t - e) <= Math.max(3, e * 0.04); });
}
// Muy pocos movimientos para tantos metros: no se rechaza, queda marcada para que alguien la mire.
function revisar(m, ac) {
  if (m < 1000) return '';
  if (ac[0] === '' || ac[3] === '') return 'sin datos';
  var mov = ac[0] + ac[1] + ac[2];
  if (mov < m / 40) return 'pocos movimientos';
  if (ac[3] < m / 40) return 'pocos obstáculos';
  return '';
}

// ---------- Medallas ----------
function hojaLogros() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('logros');
  if (!sh) {
    sh = ss.insertSheet('logros');
    sh.appendRow(['Apodo', 'Clave (cifrada)', 'Puntos', 'Nivel', 'Medallas', 'Datos', 'Actualizado']);
    sh.setFrozenRows(1);
  }
  return sh;
}
// La clave de cada teléfono no se guarda tal cual: se guarda cifrada junto con el apodo.
function cifrar(clave, apodo) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(clave) + '|' + String(apodo).toLowerCase(), Utilities.Charset.UTF_8);
  return 'h' + b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('').slice(0, 24);
}
function datosLogros() {
  var filas = hojaLogros().getDataRange().getValues().slice(1);
  return filas.filter(function (f) { return f[0]; }).map(function (f, i) {
    return { n: String(f[0]), k: String(f[1]), p: Number(f[2]) || 0, l: Number(f[3]) || 1, med: String(f[4] || ''), datos: String(f[5] || ''), fila: i + 2 };
  });
}
// Agrega a cualquier respuesta: nivel de cada apodo del ranking, top de coleccionistas y rareza de cada medalla.
function conLogros(out) {
  var L = datosLogros(), nivel = {}, rar = {};
  L.forEach(function (r) {
    nivel[r.n.toLowerCase()] = r.l;
    r.med.split(',').forEach(function (m) {
      var a = m.split(':'); if (!a[0]) return;
      for (var t = 1; t <= (parseInt(a[1], 10) || 1); t++) rar[a[0] + ':' + t] = (rar[a[0] + ':' + t] || 0) + 1;
    });
  });
  (out.top || []).forEach(function (r) { var l = nivel[String(r.n).toLowerCase()]; if (l) r.l = l; });
  out.col = L.slice().sort(function (a, b) { return b.p - a.p; }).slice(0, 10).map(function (r) { return { n: r.n, p: r.p, l: r.l }; });
  out.rar = rar; out.jug = L.length;
  return out;
}
function guardarLogros(q) {
  var n = limpiar(q.apodo), k = String(q.clave || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var med = String(q.med || '').slice(0, 4000), datos = String(q.datos || '').slice(0, 4000);
  if (!n) return { ok: false, err: 'apodo' };
  if (k.length !== 8) return { ok: false, err: 'clave' };
  if (!/^[a-z0-9.:,]*$/i.test(med)) return { ok: false, err: 'medallas' };
  var pts = Math.max(0, Math.min(30000, Math.floor(Number(q.pts) || 0))), lv = Math.max(1, Math.min(30, Math.floor(Number(q.nivel) || 1)));
  var h = cifrar(k, n), lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, err: 'ocupado' };
  try {
    var sh = hojaLogros(), L = datosLogros(), r = L.filter(function (x) { return x.n.toLowerCase() === n.toLowerCase(); })[0];
    if (r && r.k !== h) return { ok: false, err: 'apodo-ocupado' };
    var fila = [n, h, pts, lv, med, datos, new Date()];
    if (r) sh.getRange(r.fila, 1, 1, 7).setValues([fila]); else sh.appendRow(fila);
  } finally {
    lock.releaseLock();
  }
  return conLogros({ ok: true, sync: 1 });
}
// Pasar medallas a otro teléfono: con el apodo y el código del teléfono anterior.
function recuperar(q) {
  var n = limpiar(q.apodo), k = String(q.clave || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var r = datosLogros().filter(function (x) { return x.n.toLowerCase() === n.toLowerCase(); })[0];
  if (!r || r.k !== cifrar(k, n)) return { ok: false, err: 'clave' };
  return { ok: true, sync: 1, med: r.med, datos: r.datos, pts: r.p };
}
