/* Service worker de la app pública del FAA! 2026.
   La app se guarda al instalar y funciona sin señal. datos.json y los calendarios se piden siempre
   a la red (si no hay señal, la última copia). Juegos y cámara se guardan aparte cuando se usan. */
var VERSION = 'faap-__BUILD__';
var GAME = 'faap-juegos', MASK = 'faap-mascaras', TILES = 'faap-mapa';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'logo.webp', 'map.webp', 'icons/icon-192.png', 'datos.json', 'cronograma-faa-2026.pdf', 'vendor/leaflet.js', 'vendor/leaflet.css'];
var GAME_FILES = ['juego/', 'juego/juego.js', 'juego/arte.js', 'juego/side.png', 'juego/back.png', 'juego/atlas.png', 'juego/n26.png', 'juego/carriles/', 'juego/carriles/carriles.js', 'juego/logros.js', 'juego/escenarios/sello-faa.webp',
  'juego/tera-tiles/', 'juego/tera-tiles/midi.js', 'juego/tera-tiles/sync.js', 'juego/tera-tiles/songs/lista.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () {
    caches.open(GAME).then(function (c) { return c.addAll(GAME_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).catch(function () {});
    return self.skipWaiting();
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return [VERSION, GAME, MASK, TILES].indexOf(k) < 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function netFirst(e, req, cacheName) {
  e.respondWith(fetch(new Request(req.url, { cache: 'no-cache' })).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(cacheName).then(function (c) { c.put(req.url.split('?')[0], copy); }); }
    return res;
  }).catch(function () { return caches.open(cacheName).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (r) { return r || Response.error(); }); }));
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') { return; }
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then(function (c) { return c.match(req).then(function (hit) { var net = fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); } return res; }); return hit || net; }); }));
    return;
  }
  if (url.hostname === 'storage.googleapis.com' && url.pathname.indexOf('/mediapipe-models/') === 0) {
    e.respondWith(caches.open(MASK).then(function (c) { return c.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { if (res.ok) { c.put(req, res.clone()); } return res; }); }); }));
    return;
  }
  if (url.origin !== location.origin) { return; }
  var p = url.pathname;
  if (p.indexOf('/mascaras/') > -1) { netFirst(e, req, MASK); return; }
  if (p.indexOf('/juego/') > -1) { netFirst(e, req, GAME); return; }
  if (p.indexOf('/cal/') > -1 || /\/datos\.json$/.test(p)) { netFirst(e, req, VERSION); return; }
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(function () { return caches.match('index.html'); })); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); } return res; });
  }));
});
