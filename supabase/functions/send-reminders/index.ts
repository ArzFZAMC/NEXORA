// Edge Function: send-reminders (diperbarui — Background Push v2)
// Dipanggil tiap menit oleh pg_cron (supabase/optional/cron.sql) dengan header x-cron-secret.
// Alur: claim_due_reminders() (atomik, idempoten) -> kirim Web Push per perangkat -> complete_push_delivery().
// Fungsi ini tidak menerima user ID atau jadwal dari request: semua ditentukan database.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureWebPush, sendPush } from '../_shared/webpush.ts';
import { reminderPayload, safeEqual, type DueRow } from '../_shared/payload.ts';

interface Claimed extends DueRow {
  delivery_id: number; d_user_id: string; d_endpoint: string; d_p256dh: string; d_auth: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const secret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || secret.length < 16) return json(500, { error: 'CRON_SECRET belum diset (min. 16 karakter)' });
  if (!safeEqual(given, secret)) return json(401, { error: 'unauthorized' });

  try { configureWebPush(); } catch (e) { return json(500, { error: (e as Error).message }); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('claim_due_reminders', { p_now: new Date().toISOString(), p_grace_minutes: 10, p_limit: 200, p_max_attempts: 3 });
  if (error) { console.error('claim gagal', error.code); return json(500, { error: 'claim gagal' }); }

  const rows = (data ?? []) as Claimed[];
  const summary = { claimed: rows.length, sent: 0, failed: 0, expired: 0 };

  // Kirim paralel terbatas (20 sekaligus) agar tidak melewati batas waktu fungsi
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (r) => {
      const res = await sendPush({ endpoint: r.d_endpoint, p256dh: r.d_p256dh, auth: r.d_auth }, reminderPayload(r));
      summary[res.outcome]++;
      const { error: e2 } = await admin.rpc('complete_push_delivery', {
        p_id: r.delivery_id, p_outcome: res.outcome, p_http: res.status, p_error: res.error,
      });
      if (e2) console.error('complete gagal', r.delivery_id, e2.code);   // 'sending' macet akan diklaim ulang setelah 3 menit
    }));
  }
  return json(200, summary);
});
