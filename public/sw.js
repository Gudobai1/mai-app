const SHELL_CACHE = 'mai-shell-v3'
const ASSET_CACHE = 'mai-assets-v1'
const SHELL = ['/', '/v2', '/login', '/mai-icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('mai-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return

  const isAppAsset = url.pathname === '/api/google/drive/preview'
    && url.searchParams.get('asset') === '1'
    && !event.request.headers.has('range')

  if (isAppAsset) {
    event.respondWith(caches.open(ASSET_CACHE).then(async cache => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok && response.status === 200) await cache.put(event.request, response.clone())
      return response
    }))
    return
  }

  if (url.pathname.startsWith('/api/')) return

  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone()
    caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy))
    return response
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))))
})
