const CACHE_NAME = "ledger-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/login.html",
  "/style.css",
  "/login.js",
  "/change-credentials.html",
  "/change-credentials.js",
  "/favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
