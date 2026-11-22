// Service Worker for sbatomic4.1 / SBAgent Trading Platform
const CACHE_NAME = 'sbatomic-v4.1-shell-v3';
const STATIC_ASSETS = [
  '/manifest.json',
  '/metadata.json',
];

// Install Event: pre-cache lightweight manifest shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching asset warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event: prune all old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Never intercept cross-origin requests; Network-First for HTML/navigation; Stale-While-Revalidate only for same-origin static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/websockets/') ||
    url.protocol.startsWith('ws')
  ) {
    return;
  }

  // Always prefer fresh network HTML for navigations so updated app bundles load immediately
  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then(
            (cached) => cached || caches.match('/index.html').then((idx) => idx || Response.error())
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => Response.error());
    })
  );
});
