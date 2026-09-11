const CACHE_NAME = 'budget-casa-swr';
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
  // Le chiamate all'API di Google Apps Script vanno sempre e solo in rete:
  // sono dati live (spese, saldi...), non vanno mai serviti dalla cache.
  if (event.request.url.includes('script.google.com')) return;
  if (event.request.method !== 'GET') return;

  // Strategia "stale-while-revalidate": rispondi SUBITO con la versione
  // in cache (se c'è) per un caricamento istantaneo, e nel frattempo
  // scarica in background la versione più recente per la prossima volta.
  // Questo rende l'apertura dell'app molto più veloce, specialmente con
  // connessione lenta o instabile. Per forzare subito l'ultima versione
  // (es. dopo un aggiornamento), usa il pulsante "Aggiorna app" in fondo.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
