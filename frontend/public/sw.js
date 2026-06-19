// Hansons Coach service worker — minimálny offline fallback.
// Dáta (Garmin/AI) potrebujú internet, takže necacheujeme appku ani API.
// Iba: keď je používateľ offline a otvorí/naviguje stránku, namiesto
// prázdnej obrazovky ukážeme peknú offline stránku.

const CACHE = "hansons-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Riešime len navigačné požiadavky (otváranie/obnova stránok).
  // Všetko ostatné (API, assety) ide priamo na sieť.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
