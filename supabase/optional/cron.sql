-- NEXORA — OPSIONAL: scheduler backend untuk notifikasi saat browser ditutup.
-- Jalankan SETELAH Edge Function `send-reminders` ter-deploy dan secrets (CRON_SECRET, VAPID_*) diisi.
-- Ganti <PROJECT_REF> dan <CRON_SECRET> sebelum menjalankan. Jangan commit file yang sudah berisi secret.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 1) Kirim pengingat tiap menit
select cron.schedule(
  'nexora-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- 2) Buat instance 60 hari ke depan untuk semua user tiap hari (jam 17:00 UTC = 00:00 WIB)
select cron.schedule('nexora-generate-instances', '0 17 * * *', $$ select public.generate_all_instances(); $$);

-- Menghapus job:
--   select cron.unschedule('nexora-send-reminders');
--   select cron.unschedule('nexora-generate-instances');
