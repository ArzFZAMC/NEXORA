// Fungsi murni untuk Web Push (tanpa akses browser/Supabase agar mudah diuji: tests/push-util.test.ts)

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Bandingkan applicationServerKey langganan yang ada dengan kunci VAPID saat ini. */
export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

/** Nama perangkat singkat dari user agent (hanya untuk membedakan perangkat di daftar). */
export function deviceLabel(ua: string): string {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Perangkat';
  const br = /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Firefox\//i.test(ua) ? 'Firefox' : /Chrome\/|CriOS/i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${br} di ${os}`;
}

export type PushSupport = 'ok' | 'unsupported' | 'no-key' | 'denied' | 'ios-needs-install' | 'insecure';

export interface Env { hasSW: boolean; hasPush: boolean; hasNotification: boolean; permission: string; ua: string; secure: boolean; hasKey: boolean }

/** Tentukan status dukungan. Murni terhadap `Env` agar semua cabang dapat diuji. */
export function computeSupport(e: Env): PushSupport {
  if (!e.secure) return 'insecure';
  if (!e.hasSW || !e.hasPush || !e.hasNotification) return /iphone|ipad|ipod/i.test(e.ua) ? 'ios-needs-install' : 'unsupported';
  if (!e.hasKey) return 'no-key';
  if (e.permission === 'denied') return 'denied';
  return 'ok';
}

/** Hanya path internal yang aman dibuka dari parameter URL (`?date=`). */
export function parseDateParam(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? v : null;
}
