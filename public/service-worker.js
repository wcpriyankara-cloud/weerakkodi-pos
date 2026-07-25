// catalog/public/service-worker.js

const CACHE_NAME = 'pos-catalog-v1';

const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
];

// ═══════════════════════════════════════
// INSTALL — cache static assets
// ═══════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ═══════════════════════════════════════
// ACTIVATE — clean old caches
// ═══════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ═══════════════════════════════════════
// FETCH — network first, cache fallback
// ═══════════════════════════════════════
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase, API calls
  const url = new URL(event.request.url);
  const skipHosts = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebasestorage.googleapis.com',
  ];
  if (skipHosts.some((h) => url.hostname.includes(h))) return;

  // Skip Next.js HMR / dev requests
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;
  if (url.pathname.startsWith('/_next/static/webpack')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request);
      })
  );
});

// ═══════════════════════════════════════
// MESSAGE — skip waiting on demand
// ═══════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});