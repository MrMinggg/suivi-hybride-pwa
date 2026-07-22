const CACHE_NAME = 'ascension-v1.1.0';
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './activity-v1.1.css', './activity-core.js', './activity-analysis.js', './activity-export.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function enhancedHtml(request) {
  const cached = await caches.match('./index.html');
  const response = await fetch(request).catch(() => cached);
  if (!response) return new Response('Application indisponible', { status: 503 });
  let html = await response.text();
  if (!html.includes('activity-core.js')) {
    html = html
      .replace('</head>', '  <link rel="stylesheet" href="activity-v1.1.css">\n</head>')
      .replace('<script src="app.js" defer></script>', '<script src="app.js" defer></script>\n  <script src="activity-core.js" defer></script>\n  <script src="activity-analysis.js" defer></script>\n  <script src="activity-export.js" defer></script>');
  }
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(enhancedHtml(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
