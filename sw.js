// Subir CACHE y APP_VERSION (js/app.js) en cada deploy.
const CACHE = 'bitacora-v2.0.0';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'js/app.js',
  'js/store.js',
  'js/core/dates.js',
  'js/core/stats.js',
  'js/core/months.js',
  'js/core/summary.js',
  'js/core/importer.js',
  'js/core/migrate.js',
  'js/core/years.js',
  'js/core/sheets.js',
  'js/core/plan.js',
  'js/ui/dom.js',
  'js/ui/install.js',
  'js/ui/onboarding.js',
  'js/ui/today.js',
  'js/ui/month.js',
  'js/ui/review.js',
  'js/ui/settings.js',
  'js/ui/year.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bitacora-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first para el shell. Los datos viven en IndexedDB, nunca pasan por aquí.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html').then((r) => r || fetch(req));
      return fetch(req);
    }),
  );
});
