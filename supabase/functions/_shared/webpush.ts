// Pengirim Web Push (VAPID). Kunci privat HANYA dibaca dari secrets Edge Function, tidak pernah dari database/frontend.
import webpush from 'npm:web-push@3.6.7';
import { classifyPushError, type PushPayload } from './payload.ts';

let configured = false;

export function configureWebPush(): void {
  if (configured) return;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!pub || !priv || !subject) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT belum diset di secrets');
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface Target { endpoint: string; p256dh: string; auth: string }
export interface SendResult { outcome: 'sent' | 'failed' | 'expired'; status: number | null; error: string | null }

export async function sendPush(target: Target, payload: PushPayload): Promise<SendResult> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      // TTL 10 menit: pengingat yang terlambat lebih lama dari itu tidak ada gunanya; urgency tinggi agar tidak ditunda
      { TTL: 600, urgency: 'high', timeout: 10_000 },
    );
    return { outcome: 'sent', status: res.statusCode ?? 201, error: null };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    const kind = classifyPushError(status);
    // Jangan menyimpan/melog payload atau endpoint penuh; cukup status & pesan singkat
    return { outcome: kind, status: status ?? null, error: String((e as Error).message ?? 'push error').slice(0, 200) };
  }
}
