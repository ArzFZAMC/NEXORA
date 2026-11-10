// Web Push di sisi klien. PENTING: izin notifikasi HANYA diminta di dalam enablePush(), yang dipanggil dari klik tombol pengguna.
// Tidak ada pemanggilan requestPermission() otomatis saat aplikasi dibuka.
import { vapidPublicKey } from './supabase';
import { registerPushSubscription, removePushSubscriptionByEndpoint } from './api';
import { computeSupport, deviceLabel, sameKey, urlBase64ToUint8Array, type PushSupport } from './pushUtil';

export type { PushSupport };

export function pushSupport(): PushSupport {
  return computeSupport({
    hasSW: 'serviceWorker' in navigator,
    hasPush: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
    ua: navigator.userAgent,
    secure: window.isSecureContext,
    hasKey: Boolean(vapidPublicKey),
  });
}

export const notificationPermission = (): NotificationPermission | 'unsupported' => ('Notification' in window ? Notification.permission : 'unsupported');

/** Pakai service worker yang sudah ada (didaftarkan main.tsx). Jika belum (mis. mode dev), daftarkan SW yang SAMA, bukan yang baru. */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const reg = existing ?? await navigator.serviceWorker.register('/sw.js');
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Service worker belum siap. Muat ulang halaman lalu coba lagi.')), 10_000));
  await Promise.race([ready, timeout]);
  return reg;
}

async function subscribeAndSave(reg: ServiceWorkerRegistration): Promise<void> {
  const key = urlBase64ToUint8Array(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }   // kunci VAPID berganti
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('Langganan push tidak lengkap dari browser.');
  await registerPushSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, userAgent: navigator.userAgent.slice(0, 200), label: deviceLabel(navigator.userAgent) });
}

/** Dipanggil HANYA dari klik tombol. Meminta izin, membuat langganan, menyimpannya lewat RPC. */
export async function enablePush(): Promise<void> {
  if (pushSupport() !== 'ok') throw new Error('Perangkat/browser ini belum dapat menerima notifikasi push.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Izin notifikasi ditolak. Ubah di pengaturan situs browser.' : 'Izin notifikasi belum diberikan.');
  await subscribeAndSave(await getRegistration());
}

/** Sinkronisasi senyap (tanpa dialog izin): memperbarui langganan di database bila izin SUDAH diberikan sebelumnya. */
export async function syncPushSubscription(): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return;
  await subscribeAndSave(reg);
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await removePushSubscriptionByEndpoint(sub.endpoint).catch(() => undefined); await sub.unsubscribe(); }
}

export async function currentEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try { const reg = await navigator.serviceWorker.getRegistration('/'); return (await reg?.pushManager.getSubscription())?.endpoint ?? null; } catch { return null; }
}

export async function hasPushSubscription(): Promise<boolean> { return (await currentEndpoint()) !== null; }
