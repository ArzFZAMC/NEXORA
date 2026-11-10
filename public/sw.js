/* NEXORA service worker (SATU-SATUNYA service worker aplikasi; v2 menambahkan Background Push)
 * - App shell: network-first untuk navigasi (fallback ke cache saat offline)
 * - Aset statis same-origin: stale-while-revalidate
 * - Tidak pernah men-cache request ke Supabase (data selalu dari server / cache IndexedDB aplikasi)
 * - Web Push: menampilkan notifikasi dari backend scheduler (lihat docs/NOTIFICATIONS.md)
 * Catatan: service worker TIDAK dapat membunyikan alarm sendiri saat browser ditutup; hanya push dari server yang bisa.
 */
const VERSION = 'nexora-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];

/** Hanya path internal yang diizinkan (cegah open-redirect / URL eksternal dari payload push). */
function safeUrl(raw) {
  try {
    const u = new URL(String(raw || '/'), self.location.origin);
    if (u.origin !== self.location.origin) return '/';
    return u.pathname + u.search + u.hash;
  } catch (_) { return '/'; }
}
const isApple = () => /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg/.test(self.navigator.userAgent));

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
  let data = {};
  try { if (event.data) data = event.data.json() || {}; } catch (_) { /* payload bukan JSON */ }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 100) : 'NEXORA';
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : 'Ada aktivitas yang akan dimulai.';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag.slice(0, 80) : 'nexora';
  const url = safeUrl(data.url);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Jika NEXORA sedang terlihat, alarm dalam aplikasi sudah menangani pengingat -> jangan tampilkan ganda.
    // Pengecualian: notifikasi percobaan selalu tampil, dan Safari/iOS mewajibkan setiap push menampilkan notifikasi.
    if (data.kind === 'reminder' && !isApple() && wins.some((c) => c.visibilityState === 'visible')) {
      wins.forEach((c) => c.postMessage({ type: 'nexora-push', payload: { kind: data.kind, url } }));
      return;
    }
    await self.registration.showNotification(title, {
      body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { url }, requireInteraction: false, renotify: false,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      try { if ('navigate' in c) await c.navigate(target); } catch (_) { /* abaikan */ }
      return c.focus();
    }
    return self.clients.openWindow(target);
  })());
});

// Langganan diganti browser (kunci/endpoint berubah). SW tidak punya token login, jadi hanya memberi tahu aplikasi;
// aplikasi akan memperbarui langganan di database saat berikutnya dibuka (lihat syncPushSubscription di src/lib/push.ts).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: 'nexora-push-resubscribe' }))));
});
