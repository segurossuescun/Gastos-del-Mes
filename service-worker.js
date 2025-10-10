// === SW con versión por query y caché por release ===
const APP_VER   = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE_NAME = `gdm-${APP_VER}`;

const PRECACHE = [
  '/', '/index.html',
  `/static/script.js?v=${APP_VER}`,
  `/static/style.css?v=${APP_VER}`,
  '/static/manifest.json',
  '/static/icons/favicon.png',
  '/static/icons/gasto192.png',
  '/static/icons/gasto512.png',
  '/static/fondos/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('gdm-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navegaciones: red primero; si falla, vuelve al index cacheado
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html', { ignoreSearch: true }))
    );
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isCritico =
    url.pathname === '/static/script.js' ||
    url.pathname === '/static/style.css';

  // JS/CSS críticos: Network-first (para no servir "stale" tras deploy)
  if (isCritico) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const clone = net.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(req, clone)));
        return net;
      } catch (e) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Otros /static: Stale-while-revalidate
  if (url.pathname.startsWith('/static/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then(res => {
          const clone = res.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(req, clone)));
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })());
  }
});
