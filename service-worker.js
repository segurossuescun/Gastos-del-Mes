const CACHE_NAME = "gdm-v4";
const PRECACHE = [
  "/", "/index.html",
  "/static/script.js",
  "/static/style.css",
  "/static/manifest.json",
  "/static/icons/favicon.png",
  "/static/icons/gasto192.png",
  "/static/icons/gasto512.png",
  "/static/fondos/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
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

  // Navegaciones (SPA): devolver index desde cache si estamos offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  const url = new URL(req.url);

  // Solo cachear mismo origen
  if (url.origin !== location.origin) return;

  // Estrategia: stale-while-revalidate para /static/*
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
