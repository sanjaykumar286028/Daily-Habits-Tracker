const CACHE_NAME = 'daily-habits-shell-v6';
const BASE = new URL(self.registration.scope);
const VERSION = CACHE_NAME.replace('daily-habits-shell-', '');
const shellUrl = path => {
  const url = new URL(path, BASE);
  url.searchParams.set('v', VERSION);
  return url.href;
};
const SHELL = ['', 'index.html', 'styles.css', 'src/app.js', 'src/domain.js', 'src/focus-timer.js', 'src/reminder-utils.js', 'src/task-utils.js', 'src/task-view.js', 'src/public-config.js', 'src/supabase-client.js', 'src/sync.js', 'manifest.json', 'icons/logo.svg', 'icons/icon.svg']
  .map(shellUrl);

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
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(shellUrl('index.html'), response.clone()));
      return response;
    }).catch(async () => (await caches.match(shellUrl('index.html'))) || caches.match(shellUrl(''))));
    return;
  }
  if (!isShellAsset) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

