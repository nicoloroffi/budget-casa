const CACHE_NAME = 'budget-casa-offline';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Le chiamate all'API di Google Apps Script vanno sempre in rete
  if (event.request.url.includes('script.google.com')) return;

  // Strategia "network-first": prova sempre a scaricare la versione
  // più recente. Solo se non c'è connessione, usa quella salvata.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
