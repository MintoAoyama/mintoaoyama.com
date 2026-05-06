const CACHE_VERSION = 'v3';
const CACHE_NAME = `emojis-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './emoji.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('emojis-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // WebLLM model fetches (HuggingFace CDN etc.) — pass through, managed by IndexedDB
  if (url.origin !== self.location.origin) {
    return;
  }

  // Vite hashed assets: Network First, fall back to cache for offline support.
  // Hash changes on every build, so Cache First would serve stale 404s after redeploy.
  const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9]{8,}\.(js|css)(\?.*)?$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache First for everything else (emoji.json, icons, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Message: force update on demand
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
