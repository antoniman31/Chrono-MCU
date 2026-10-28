// Service worker : après une première visite, l'application s'ouvre sans réseau.
// Les fichiers versionnés (?v=<build>) sont immuables : cache d'abord. La page d'accueil passe par le réseau d'abord,
// pour qu'un nouveau déploiement apparaisse dès qu'on est en ligne. Les affiches TMDB ne sont jamais conservées.
// __BUILD__ est remplacé par l'identifiant du commit au déploiement (comme dans js/) ; sans cela, le worker n'est pas enregistré.
const BUILD = '__BUILD__';
const CACHE = `chrono-mcu-${BUILD}`;

// Fichiers demandés avec ?v=<build> (tests/sw.test.js vérifie que la liste couvre tout js/, css/ et data/)
const VERSIONED = [
  'css/style.css',
  'js/achievements.js',
  'js/app.js',
  'js/backup.js',
  'js/categories.js',
  'js/github.js',
  'js/heroes.js',
  'js/insights.js',
  'js/duration.js',
  'js/logic.js',
  'js/phases.js',
  'js/prefs.js',
  'js/recovery.js',
  'js/spoilers.js',
  'js/store.js',
  'js/ui/detail.js',
  'js/ui/dom.js',
  'js/ui/parts.js',
  'js/ui/progression.js',
  'js/ui/reglages.js',
  'js/ui/sheet.js',
  'js/ui/swipe.js',
  'js/ui/voir.js',
  'js/ui/welcome.js',
  'data/mcu.json',
  'data/sagas.json',
];
// Fichiers demandés sans version
const STATIC = [
  './',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'fonts/bebas-neue-subset.woff2',
];

self.addEventListener('install', (event) => {
  const urls = [...VERSIONED.map((u) => `${u}?v=${BUILD}`), ...STATIC];
  // addAll est atomique : si un fichier manque, le worker ne s'installe pas et le site reste servi par le réseau
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chrono-mcu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms))]);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(request), 4000)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
