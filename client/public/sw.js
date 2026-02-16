const CACHE_NAME = 'condor-sistema-v1';

const PRECACHE_URLS = [
  '/condor-sistema/',
  '/condor-sistema/index.html',
  '/condor-sistema/condor-logo.png',
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

  // HTML navigation: Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/condor-sistema/index.html'))
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
      .catch(() => caches.match('/condor-sistema/index.html'))
  );
});
