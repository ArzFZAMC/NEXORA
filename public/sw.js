/* NEXORA service worker
 * - App shell: network-first untuk navigasi (fallback ke cache saat offline)
 * - Aset statis same-origin: stale-while-revalidate
 * - Tidak pernah men-cache request ke Supabase (data selalu dari server / cache IndexedDB aplikasi)
 * - Web Push: menampilkan notifikasi dari backend scheduler (lihat docs/NOTIFICATIONS.md)
 * Catatan: service worker TIDAK dapat membunyikan alarm sendiri saat browser ditutup; hanya push dari server yang bisa.
 */
const VERSION = 'nexora-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'NEXORA', body: 'Ada aktivitas yang akan dimulai.', tag: 'nexora', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) { /* payload bukan JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, tag: data.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { url: data.url }, requireInteraction: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    }),
  );
});
