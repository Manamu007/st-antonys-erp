/**
 * St. Antony's School ERP - Service Worker
 * Handles offline caching, asset precaching, and network fallback.
 */

const CACHE_NAME = 'antonyschool-erp-v1';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icon.svg',
  '/school_logo.svg'
];

// Install Event: Precaches essential core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Precache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleans up obsolete caches and claims clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never cache non-GET requests or WebSocket connections
  if (request.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // 2. Never cache backend API calls (always live network)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // 3. Navigation requests (HTML documents) - Network First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 4. Static assets (JS, CSS, images, fonts) - Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
