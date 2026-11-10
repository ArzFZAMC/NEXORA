# INSTALLATION — NEXORA Background Push Update

Prasyarat: project NEXORA yang sudah berjalan (dari `NEXORA-FULL.zip`, termasuk migrasi 0001–0005), Supabase CLI (`npx supabase`), dan Node 18+.

## 1. Salin file (ke folder project NEXORA kamu)
Folder ini mengikuti struktur project. Salin dan **timpa** file berikut ke path yang sama:

| File di paket | Tujuan | Jenis |
|---|---|---|
| `public/sw.js` | `public/sw.js` | timpa |
| `src/lib/push.ts`, `src/lib/api.ts` | `src/lib/` | timpa |
| `src/lib/pushUtil.ts` | `src/lib/` | baru |
| `src/features/notifications/PushSettings.tsx` | `src/features/notifications/` | baru |
| `src/pages/Settings.tsx`, `src/pages/Calendar.tsx` | `src/pages/` | timpa |
| `src/app/AppContext.tsx` | `src/app/` | timpa |
| `src/features/alarms/AlarmHost.tsx` | `src/features/alarms/` | timpa |
| `src/i18n/id.ts` | `src/i18n/` | timpa |
| `supabase/migrations/0006_push_delivery.sql` | `supabase/migrations/` | baru |
| `supabase/functions/_shared/payload.ts`, `webpush.ts` | `supabase/functions/_shared/` | baru |
| `supabase/functions/send-test-push/index.ts` | `supabase/functions/send-test-push/` | baru |
| `supabase/functions/send-reminders/index.ts` | `supabase/functions/send-reminders/` | timpa |
| `supabase/config.toml` | `supabase/config.toml` | timpa (tambah `[functions.send-test-push]`) |
| `supabase/optional/cron.sql` | `supabase/optional/` | timpa |
| `supabase/tests/002_push.test.sql`, `tests/*.test.ts` | `supabase/tests/`, `tests/` | baru |
| `docs/NOTIFICATIONS.md` | `docs/` | timpa |

> Jika kamu sudah mengubah `api.ts`, `Settings.tsx`, `AppContext.tsx`, `Calendar.tsx`, atau `id.ts` sendiri, gabungkan manual: perubahan saya hanya di bagian push/`PushSettings`/deep link `?date=`/tag alarm.
> Jangan menyalin `.env.example` di atas `.env.local`; pakai sebagai referensi.

## 2. Jalankan migrasi SQL
Supabase Dashboard → SQL Editor → tempel isi `supabase/migrations/0006_push_delivery.sql` → Run. (Atau `npx supabase db push`.) Aman dijalankan ulang (`if not exists`). Data lama tidak dihapus.

## 3. Buat VAPID key
```bash
npx web-push generate-vapid-keys
```
Simpan **Public Key** dan **Private Key**. Private Key tidak boleh masuk frontend, Git, atau database.

## 4. Atur secrets Edge Function
```bash
npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:emailkamu@contoh.com
npx supabase secrets set CRON_SECRET=<string-acak-min-16-karakter>
npx supabase secrets set ALLOWED_ORIGINS=https://domain-kamu.vercel.app,http://localhost:5173
```
(Jika `ALLOWED_ORIGINS` sudah diset untuk `redeem-invite`, tidak perlu diulang.)

## 5. Deploy Edge Function
```bash
npx supabase functions deploy send-reminders --no-verify-jwt
npx supabase functions deploy send-test-push --no-verify-jwt
```

## 6. Jadwalkan dengan Supabase Cron
Buka `supabase/optional/cron.sql`, ganti `<PROJECT_REF>` dan `<CRON_SECRET>` (nilai sama dengan langkah 4), jalankan di SQL Editor. Jangan commit file yang sudah berisi nilai asli.
Cek: `select jobname, schedule, active from cron.job;` harus ada `nexora-send-reminders` (`* * * * *`).

## 7. Env frontend & redeploy
Tambahkan `VITE_VAPID_PUBLIC_KEY=<public>` di `.env.local` dan di Vercel (Project → Settings → Environment Variables), lalu **Redeploy** (variabel VITE_* tertanam saat build). Untuk Netlify: Site settings → Environment variables, lalu trigger deploy.

## 8. Uji
1. Buka NEXORA via HTTPS (atau localhost) → Pengaturan → **Aktifkan notifikasi push** → izinkan.
2. Tekan **Kirim notifikasi percobaan** → notifikasi harus muncul (coba juga dengan tab ditutup).
3. Buat aktivitas hari ini 3–4 menit ke depan dengan alarm aktif; tutup NEXORA. Notifikasi harus muncul sekitar waktu pengingat (±1 menit); ketuk → membuka kalender pada tanggal itu.
4. Periksa log: `select status, attempts, http_status, error from push_deliveries order by id desc limit 20;`

## Troubleshooting
| Gejala | Penyebab / solusi |
|---|---|
| Tombol tidak muncul, teks "VITE_VAPID_PUBLIC_KEY kosong" | Isi env frontend lalu redeploy |
| "Fungsi send-test-push belum ter-deploy (404)" | Jalankan langkah 5 |
| Percobaan 500 "VAPID belum dikonfigurasi" | Ulangi langkah 4 |
| 42501 permission denied | Pastikan migrasi 0005 dan 0006 sudah dijalankan |
| Pengingat tidak datang | `select * from cron.job_run_details order by start_time desc limit 5;` dan `select status_code, left(content::text,200) from net._http_response order by created desc limit 5;` (401 = CRON_SECRET beda dengan Vault) |
| Status `expired` | Langganan sudah dicabut browser; matikan lalu aktifkan lagi di Pengaturan |
| iPhone/iPad | Tambahkan NEXORA ke Layar Utama (iOS 16.4+), buka dari ikon |
| Izin diblokir | Ubah izin Notifikasi di pengaturan situs browser, muat ulang |
| Gagal deploy fungsi karena `npm:web-push` | Lihat catatan "belum terverifikasi" di README; alternatif `jsr:@negrel/webpush` |
