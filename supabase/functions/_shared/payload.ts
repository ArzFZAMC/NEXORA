// Logika murni (tanpa dependensi) untuk payload push — dipakai Edge Functions dan diuji dengan tsx (tests/push-payload.test.ts).

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  /** Path internal NEXORA (selalu diawali "/"). Service worker memvalidasi ulang sebelum membuka. */
  url: string;
  kind: 'reminder' | 'test';
  instanceId?: string;
  fireAt?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^(\d{2}):(\d{2})/;

/** Buang karakter kontrol & batasi panjang agar payload kecil (batas push ±4 KB) dan aman ditampilkan. */
export function clean(text: unknown, max: number): string {
  const s = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export interface DueRow {
  d_instance_id: string;
  d_scheduled_date: string;
  d_title: string;
  d_start_time: string;
  d_fire_at: string;
}

export function reminderPayload(r: DueRow): PushPayload {
  const date = DATE_RE.test(r.d_scheduled_date) ? r.d_scheduled_date : null;
  const id = UUID_RE.test(r.d_instance_id) ? r.d_instance_id : null;
  const m = TIME_RE.exec(r.d_start_time ?? '');
  const hhmm = m ? `${m[1]}:${m[2]}` : '';
  return {
    title: clean(r.d_title, 80) || 'NEXORA',
    body: hhmm ? `Mulai pukul ${hhmm}` : 'Waktunya aktivitas kamu',
    tag: id ? `instance-${id}` : 'nexora-reminder',
    url: date ? `/calendar?date=${date}${id ? `&i=${id}` : ''}` : '/',
    kind: 'reminder',
    instanceId: id ?? undefined,
    fireAt: r.d_fire_at,
  };
}

export function testPayload(): PushPayload {
  return { title: 'NEXORA', body: 'Notifikasi percobaan berhasil. Pengingat akan tampil seperti ini.', tag: 'nexora-test', url: '/settings', kind: 'test' };
}

/** 404/410 = langganan sudah tidak berlaku (hapus/nonaktifkan). Lainnya = gagal sementara (coba ulang). */
export function classifyPushError(statusCode: number | undefined): 'expired' | 'failed' {
  return statusCode === 404 || statusCode === 410 ? 'expired' : 'failed';
}

/** Perbandingan string waktu-konstan untuk secret (mencegah timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
