/* House Lights - offline-first service worker */
const CACHE = 'house-lights-v1';
const CORE = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Never cache API calls - always hit the network.
  if (url.includes('/api/')) return;
  // Network-first for navigation and HTML.
  if (e.request.mode === 'navigate' || url.includes('index.html')) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Cache-first for everything else (icons, manifest).
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
