const APP_VER   = "1.0.5";                 // súbelo en cada release
const CACHE_NAME = `gdm-${APP_VER}`;

const PRECACHE = [
  "/", "/index.html",
  `/static/script.js?v=${APP_VER}`,
  `/static/style.css?v=${APP_VER}`,
  "/static/manifest.json",
  "/static/icons/favicon.png",
  "/static/icons/gasto192.png",
  "/static/icons/gasto512.png",
  "/static/fondos/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navegaciones: red primero, fallback a index cacheado
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // ✅ Network-first para los críticos (evita 1 carga "stale" tras deploy)
  const isCritical =
    url.pathname === "/static/script.js" || url.pathname === "/static/style.css";
  if (isCritical) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Resto de estáticos: stale-while-revalidate
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const refresh = fetch(req)
          .then((res) => {
            caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    );
  }
});
