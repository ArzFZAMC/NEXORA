// Edge Function: send-reminders
// Dipanggil tiap menit oleh pg_cron (lihat supabase/optional/cron.sql). Mengirim Web Push untuk aktivitas
// yang alarmnya jatuh tempo, sehingga notifikasi muncul walau browser/tab sudah ditutup.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Due = {
  instance_id: string; user_id: string; title: string; start_time: string;
  endpoint: string; p256dh: string; auth: string;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  if (!pub || !priv) return new Response("VAPID keys belum diset", { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("due_reminders", { p_now: new Date().toISOString(), p_window_minutes: 2 });
  if (error) return new Response(error.message, { status: 500 });

  const rows = (data ?? []) as Due[];
  const sentInstances = new Set<string>();
  const deadEndpoints: string[] = [];

  await Promise.all(rows.map(async (r) => {
    const payload = JSON.stringify({
      title: "NEXORA",
      body: `${r.title} • ${r.start_time.slice(0, 5)}`,
      tag: `instance-${r.instance_id}`,
      url: "/",
    });
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
      sentInstances.add(r.instance_id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) deadEndpoints.push(r.endpoint);   // langganan sudah tidak berlaku
      else console.error("push gagal", status);
    }
  }));

  if (sentInstances.size) await admin.rpc("mark_reminders_sent", { p_ids: [...sentInstances] });
  if (deadEndpoints.length) await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);

  return new Response(JSON.stringify({ due: rows.length, sent: sentInstances.size, removed: deadEndpoints.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
