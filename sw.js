/* Service worker de la guía FAA! 2026.
   App: se guarda al instalar y se sirve desde el teléfono (funciona sin señal).
   data.json: siempre se pide a la red; si no hay señal, se usa la última copia guardada.
   Al publicar cambios en app.js, app.css o index.html, subí el número de VERSION. */
var VERSION = 'faa26-v23';
/* El juego secreto se guarda aparte, para que funcione sin señal; se pide primero a la red para tomar cambios. */
var GAME = 'faa26-juego', GAME_FILES = ['juego/', 'juego/juego.js', 'juego/ranking.js', 'juego/side.png', 'juego/back.png', 'juego/atlas.png', 'juego/n26.png', 'juego/arte.js', 'juego/carriles/', 'juego/carriles/carriles.js', 'juego/logros.js', 'juego/escenarios/sello-faa.webp',
  'juego/tera-tiles/', 'juego/tera-tiles/midi.js', 'juego/tera-tiles/sync.js', 'juego/tera-tiles/rank.js', 'juego/tera-tiles/songs/lista.json'];
/* Las máscaras (mascaras/) no se bajan al instalar: se guardan aparte recién cuando alguien las usa (pesan ~4 MB). */
var MASK = 'faa26-mascaras';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest', 'logo.webp', 'map.webp', 'icons/icon-192.png', 'data.json', 'cronograma-faa-2026.pdf', 'vendor/leaflet.js', 'vendor/leaflet.css'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () {
    caches.open(GAME).then(function (c) { return c.addAll(GAME_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).catch(function () {});
    return self.skipWaiting();
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION && k !== 'faa26-tiles' && k !== GAME && k !== MASK; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') { return; }
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open('faa26-tiles').then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); } return res; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.hostname === 'storage.googleapis.com' && url.pathname.indexOf('/mediapipe-models/') === 0) {
    /* modelo del detector de caras: primero la copia guardada */
    e.respondWith(caches.open(MASK).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok) { c.put(req, res.clone()); } return res; });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) { return; }
  if (url.pathname.indexOf('/mascaras/') > -1) {
    /* como el juego: se pregunta a la red si hay versión nueva; sin señal, la última copia */
    e.respondWith(fetch(new Request(req.url, { cache: 'no-cache' })).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(MASK).then(function (c) { c.put(req.url.split('?')[0], copy); }); }
      return res;
    }).catch(function () { return caches.open(MASK).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (r) { return r || Response.error(); }); }));
    return;
  }
  if (url.pathname.indexOf('/cal/') > -1) {
    /* calendarios: siempre de la red (cambian con el cronograma); sin señal, la última copia */
    e.respondWith(fetch(new Request(req.url, { cache: 'no-cache' })).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req.url.split('?')[0], copy); }); }
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || Response.error(); }); }));
    return;
  }
  if (url.pathname.indexOf('/juego/') > -1) {
    /* no-cache: el navegador pregunta siempre si hay versión nueva (si no cambió, no se vuelve a bajar) */
    e.respondWith(fetch(new Request(req.url, { cache: 'no-cache' })).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(GAME).then(function (c) { c.put(req.url.split('?')[0], copy); }); }
      return res;
    }).catch(function () { return caches.open(GAME).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (r) { return r || Response.error(); }); }));
    return;
  }
  if (/\/data\.json$/.test(url.pathname) || /\/config\.js$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(url.pathname.endsWith('config.js') ? 'config.js' : 'data.json', copy); }); }
      return res;
    }).catch(function () {
      return caches.match(url.pathname.endsWith('config.js') ? 'config.js' : 'data.json').then(function (r) {
        if (!r) { return Response.error(); }
        return r.blob().then(function (b) { return new Response(b, { headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'x-faa-cache': '1' } }); });
      });
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); } return res; });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './#novedades';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) { cs[i].navigate(target).catch(function () {}); return cs[i].focus(); } }
    return self.clients.openWindow(target);
  }));
});
