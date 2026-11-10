/* Bukid — funcionamento offline.
 * - Os arquivos do app (/_next/static, com hash no nome) ficam guardados e são servidos do cache primeiro.
 * - As páginas tentam a rede por alguns segundos e, sem internet, abrem a cópia guardada.
 * - Os dados ficam no aparelho (lib/v2/storage) e sincronizam sozinhos quando a internet volta (lib/v2/sync).
 */
const SHELL_CACHE = 'mai-shell-v4'
const STATIC_CACHE = 'mai-static-v1'
const ASSET_CACHE = 'mai-assets-v1'
const SHELL = ['/', '/v2', '/login', '/mai-icon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']
const NETWORK_WAIT_MS = 4000

/** Guarda as páginas e todos os arquivos que elas pedem, para o app abrir offline já na primeira vez. */
async function precache() {
  const shell = await caches.open(SHELL_CACHE)
  const statics = await caches.open(STATIC_CACHE)
  const assets = new Set()
  await Promise.all(SHELL.map(async path => {
    try {
      const response = await fetch(path, { cache: 'reload' })
      if (!response.ok) return
      await shell.put(path, response.clone())
      if ((response.headers.get('content-type') || '').includes('text/html')) {
        const html = await response.text()
        for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(match[0])
      }
    } catch { /* offline na instalação: o cache é preenchido nas próximas visitas */ }
  }))
  await Promise.all([...assets].map(async url => {
    try {
      if (await statics.match(url)) return
      const response = await fetch(url)
      if (response.ok) await statics.put(url, response)
    } catch { /* ignora */ }
  }))
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('mai-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

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

  // Arquivos com hash no nome nunca mudam: cache primeiro.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async cache => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) cache.put(event.request, response.clone())
      return response
    }))
    return
  }

  // Páginas e demais arquivos: rede primeiro (com limite de espera) e, sem internet, a cópia guardada.
  event.respondWith(withTimeout(fetch(event.request), NETWORK_WAIT_MS).then(response => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy))
    }
    return response
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(cached => cached || caches.match('/'))))
})
