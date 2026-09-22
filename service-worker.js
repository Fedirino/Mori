const CACHE = 'mori-v0.9.5';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // network-first for the app shell so installed PWAs pick up new versions on launch;
  // fall back to cache if offline. everything else stays cache-first.
  const isShell = req.mode === 'navigate' || req.destination === 'document' ||
    /\/(index\.html|manifest\.json|service-worker\.js)$/.test(new URL(req.url).pathname);
  if (isShell) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('/index.html')))
    );
    return;
  }
  event.respondWith(caches.match(req).then(match => match || fetch(req)));
});
