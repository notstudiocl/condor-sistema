const CACHE_NAME = 'condor-sistema-v2';

// Base path derivado del scope con que se registró el SW (main.jsx usa BASE_URL):
// '/condor-sistema/' en GitHub Pages, '/' en condor.notstudio.cl.
const BASE = new URL(self.registration.scope).pathname;

const PRECACHE_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'condor-logo.png',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: intercept requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache API calls — offline layer handles those
  if (url.pathname.startsWith('/api') || url.hostname !== location.hostname) return;

  // El admin panel vive bajo {BASE}admin/ en el mismo origen — es otra app, no se cachea ni se
  // le sirve el index.html de terreno como fallback offline.
  if (url.pathname.startsWith(BASE + 'admin')) return;

  // HTML navigation: Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(BASE + 'index.html'))
    );
    return;
  }

  // Static assets: Cache First
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
      .catch(() => caches.match(BASE + 'index.html'))
  );
});
