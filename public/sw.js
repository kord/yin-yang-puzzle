const CACHE = 'yinyang-v1'

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', (event) => {
    const req = event.request
    if (req.method !== 'GET') return
    const url = new URL(req.url)
    if (url.origin !== location.origin) return

    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached
            return fetch(req)
                .then((res) => {
                    if (res && res.ok) {
                        const clone = res.clone()
                        caches.open(CACHE).then((cache) => cache.put(req, clone))
                    }
                    return res
                })
                .catch(() => cached)
        }),
    )
})
