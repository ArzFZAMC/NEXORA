-- NEXORA — OPSIONAL: scheduler backend untuk Web Push (menggantikan versi lama cron.sql).
-- Secret disimpan di Supabase VAULT (terenkripsi), BUKAN ditulis di SQL job.
-- Jalankan di SQL Editor SETELAH: migrasi 0006, deploy Edge Function `send-reminders`, dan `supabase secrets set ...`.
-- LANGKAH 1 hanya sekali; ganti <PROJECT_REF> dan <CRON_SECRET> (nilai sama dengan secret CRON_SECRET di Edge Function).
-- Jangan commit file ini setelah diisi nilai asli.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- LANGKAH 1: simpan secret & URL di Vault
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'nexora_project_url');
select vault.create_secret('<CRON_SECRET>', 'nexora_cron_secret');
-- (untuk mengganti nilai nanti: select vault.update_secret(id, 'nilai-baru') from vault.secrets where name = '...';)

-- LANGKAH 2: jadwalkan (aman dijalankan ulang; job lama dengan nama sama diganti)
select cron.unschedule(jobname) from cron.job
 where jobname in ('nexora-send-reminders', 'nexora-generate-instances', 'nexora-purge-push');

-- Kirim pengingat tiap menit
select cron.schedule('nexora-send-reminders', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'nexora_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nexora_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);

-- Buat instance 60 hari ke depan untuk semua user (00:00 WIB)
select cron.schedule('nexora-generate-instances', '0 17 * * *', $$ select public.generate_all_instances(); $$);

-- Bersihkan log pengiriman lama & langganan mati (00:30 WIB)
select cron.schedule('nexora-purge-push', '30 17 * * *', $$ select public.purge_push_data(14); $$);

-- Melihat status job:   select jobid, jobname, schedule, active from cron.job;
-- Riwayat eksekusi:     select * from cron.job_run_details order by start_time desc limit 20;
-- Respons HTTP terakhir: select id, status_code, left(content::text, 200) from net._http_response order by created desc limit 10;
