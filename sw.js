/* ─────────────────────────────────────────────────────────────────
   WTC Foto — Service Worker
   Cache strategy:
   • App shell + overlay: Cache-First (pre-cached on install)
   • Font CDNs: Network-First with cache fallback (fonts update rarely)
   • JSZip CDN: Cache-First (versioned URL, never changes)
   To update: bump CACHE_NAME to 'wtc-app-v7' — activate handler
   automatically deletes old caches.
───────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'wtc-app-v6';

// Everything needed to run the app completely offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './assets/wtc-logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/overlays/linkedin.png',
  './assets/overlays/ig-h-centro.png',
  './assets/overlays/ig-h-destra.png',
  './assets/overlays/ig-h-sinistra.png',
  './assets/overlays/ig-h-alto.png',
  './assets/overlays/ig-v-centro.png',
  './assets/overlays/ig-v-destra.png',
  './assets/overlays/ig-v-sinistra.png',
  './assets/overlays/ig-v-alto.png',
];

// ── Install: pre-cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old tabs to close
  );
});

// ── Activate: remove stale caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Font CDNs — Network-First so updated font versions eventually arrive
  if (
    url.hostname === 'api.fontshare.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // JSZip CDN — Cache-First (URL is versioned, content never changes)
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App shell (same origin) — Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // All other cross-origin requests: pass through without caching
});

// ── Strategy: Cache-First ─────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — risorsa non disponibile.', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

// ── Strategy: Network-First ───────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline — risorsa non disponibile.', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}
