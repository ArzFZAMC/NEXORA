# NEXORA — Background Push Update

Menambahkan **notifikasi push latar belakang** ke NEXORA yang sudah ada (bukan membangun ulang). Pengingat dapat tiba saat website/PWA tidak dibuka.

## Tujuan
Pengingat aktivitas tetap sampai walau tab/browser ditutup, tanpa mengubah alarm in-app, autentikasi, data, atau desain.

## Teknologi
Web Push (VAPID) · Service Worker tunggal (`public/sw.js`) · Supabase Postgres + RLS + RPC `SECURITY DEFINER` · Edge Functions (Deno, `npm:web-push`) · pg_cron + pg_net + Vault · React 19 + TypeScript.

## Arsitektur
```
Browser (klik tombol) → izin → PushManager.subscribe → RPC register_push_subscription (RLS/auth.uid)
pg_cron (tiap menit) → Edge Function send-reminders (x-cron-secret dari Vault)
   → claim_due_reminders()   [hitung fire_at per zona waktu user, idempoten, SKIP LOCKED]
   → web-push (VAPID private key dari secrets Edge Function)
   → complete_push_delivery()[sent / failed(retry) / expired(404,410 → nonaktif)]
Service Worker push → showNotification → klik → /calendar?date=...
```
Keamanan: private key hanya di secrets Edge Function; frontend hanya anon key + public VAPID; `INSERT/UPDATE` langsung ke `push_subscriptions` dicabut (hanya RPC); fungsi pengiriman hanya untuk `service_role`; `send-test-push` mengambil identitas dari token; user ID/jadwal dari frontend tidak dipercaya; izin notifikasi hanya diminta saat tombol diklik.

## File baru
`src/lib/pushUtil.ts`, `src/features/notifications/PushSettings.tsx`, `supabase/migrations/0006_push_delivery.sql`, `supabase/functions/_shared/{payload,webpush}.ts`, `supabase/functions/send-test-push/index.ts`, `supabase/tests/002_push.test.sql`, `tests/{push-payload,push-util,sw}.test.ts`.

## File dimodifikasi
`public/sw.js`, `src/lib/push.ts`, `src/lib/api.ts`, `src/pages/Settings.tsx`, `src/pages/Calendar.tsx`, `src/app/AppContext.tsx`, `src/features/alarms/AlarmHost.tsx`, `src/i18n/id.ts`, `supabase/functions/send-reminders/index.ts`, `supabase/config.toml`, `supabase/optional/cron.sql`, `docs/NOTIFICATIONS.md`. Detail: `CHANGELOG.md`. Pemasangan: `INSTALLATION.md`.

## Cara kerja ringkas
Pengingat dihitung server: tanggal + jam mulai − offset alarm, pada zona waktu profil pengguna. Baris `push_deliveries` unik per (aktivitas, perangkat, waktu) sehingga tidak terkirim ganda. Scheduler yang terlambat ditoleransi 10 menit; lebih dari itu dilewati agar tidak ada pengingat basi. Kegagalan sementara dicoba ulang hingga 3 kali.

## Hasil pengujian (jujur)
Terverifikasi:
- 56 tes unit lulus (33 lama + 12 payload/util + 11 service worker via sandbox `vm`: handler push/klik, URL berbahaya dinetralkan, payload rusak, iOS, tidak ganda saat tab terlihat).
- `tsc --strict` lulus untuk modul murni (`pushUtil.ts`, `payload.ts`).
- Bundling esbuild seluruh app berhasil (semua impor terselesaikan); `requestPermission` hanya ada di `enablePush()` yang dipanggil dari klik.
- Pemeriksaan sintaks semua Edge Function (esbuild).
- Di Chromium sungguhan: `sw.js` terdaftar, hanya 1 registrasi, cache `nexora-v2`.

**BELUM terverifikasi** (tidak ada lingkungannya di sandbox): SQL 0006 dan `002_push.test.sql` belum dijalankan di Postgres; Edge Function belum dijalankan di Deno/Supabase (termasuk apakah `npm:web-push@3.6.7` berjalan di Deno Edge); pengiriman push sungguhan via FCM/Mozilla/Apple; **tampilnya notifikasi saat tab ditutup di perangkat nyata** (uji headless Chromium via CDP tidak berhasil menampilkan/membaca notifikasi, jadi tidak diklaim); klik notifikasi di browser nyata; pg_cron di Supabase; `vite build` dan `tsc` untuk file React (dependensi tidak terpasang); uji manual lintas browser/iOS. Fitur **belum boleh dianggap production-ready** sampai langkah uji di INSTALLATION.md bagian 8 lolos di perangkatmu.

## Batasan Web Push (vs alarm native Android)
- Tidak presisi hingga detik: cron per menit; OS/layanan push dapat menunda (Doze, hemat daya).
- Suara = suara notifikasi bawaan perangkat; audio unggahan hanya saat NEXORA terbuka.
- Tidak menjamin tidak bisa dimatikan pengguna/OS; force-stop atau hapus data situs menghentikan push di sebagian perangkat.
- iOS: wajib dipasang ke Layar Utama (16.4+). Beberapa browser tidak mendukung Push (ditangani dengan pesan "tidak didukung").
- Pengingat terlambat >10 menit dilewati.
