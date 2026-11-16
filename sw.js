/* Service worker de la guía FAA! 2026.
   App: se guarda al instalar y se sirve desde el teléfono (funciona sin señal).
   data.json: siempre se pide a la red; si no hay señal, se usa la última copia guardada.
   Al publicar cambios en app.js, app.css o index.html, subí el número de VERSION. */
var VERSION = 'faa26-v3';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest', 'logo.webp', 'map.webp', 'icons/icon-192.png', 'data.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) { return; }
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
