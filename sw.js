const CACHE_NAME = 'daily-habits-shell-v2';
const BASE = new URL(self.registration.scope);
const SHELL = ['', 'index.html', 'styles.css', 'src/app.js', 'src/domain.js', 'manifest.json', 'icons/icon.svg']
  .map(path => new URL(path, BASE).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('daily-habits-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const isShellAsset = SHELL.includes(url.href);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(new URL('index.html', BASE).href, response.clone()));
      return response;
    }).catch(async () => (await caches.match(new URL('index.html', BASE).href)) || caches.match(new URL('', BASE).href)));
    return;
  }
  if (!isShellAsset) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
