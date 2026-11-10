// Edge Function: send-test-push
// Dipanggil dari Pengaturan (tombol "Kirim notifikasi percobaan") dengan token login pengguna.
// User ID TIDAK diambil dari body: identitas ditentukan dengan memverifikasi token ke Supabase Auth.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureWebPush, sendPush } from '../_shared/webpush.ts';
import { testPayload } from '../_shared/payload.ts';

const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] ?? 'null'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(req, 401, { error: 'Belum masuk' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !u?.user) return json(req, 401, { error: 'Sesi tidak valid' });

  try { configureWebPush(); } catch { return json(req, 500, { error: 'Server push belum dikonfigurasi (VAPID).' }); }

  const { data, error } = await admin.rpc('prepare_test_push', { p_user: u.user.id });
  if (error) {
    if (error.code === '54000') return json(req, 429, { error: 'Tunggu beberapa detik sebelum mengirim percobaan lagi.' });
    console.error('prepare_test_push', error.code);
    return json(req, 500, { error: 'Gagal menyiapkan notifikasi percobaan.' });
  }
  const rows = (data ?? []) as Array<{ delivery_id: number; d_endpoint: string; d_p256dh: string; d_auth: string }>;
  if (rows.length === 0) return json(req, 404, { error: 'Belum ada perangkat yang berlangganan notifikasi.' });

  let sent = 0, failed = 0;
  await Promise.all(rows.map(async (r) => {
    const res = await sendPush({ endpoint: r.d_endpoint, p256dh: r.d_p256dh, auth: r.d_auth }, testPayload());
    if (res.outcome === 'sent') sent++; else failed++;
    await admin.rpc('complete_push_delivery', { p_id: r.delivery_id, p_outcome: res.outcome, p_http: res.status, p_error: res.error });
  }));
  return json(req, 200, { sent, failed });
});
