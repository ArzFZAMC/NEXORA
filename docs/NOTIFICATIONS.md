# Alarm & Notifikasi — cara kerja dan batasannya

## Dua lapisan
| Lapisan | Kapan jalan | Suara | Butuh setup |
|---|---|---|---|
| **Alarm in-app** (`src/features/alarms/AlarmHost.tsx`) | Hanya saat NEXORA terbuka (tab/PWA, boleh di latar belakang selama browser belum menghentikan tab) | Nada bawaan atau audio unggahan, loop sampai ditutup; snooze 5/10/15 menit | Tidak ada |
| **Web Push** (`public/sw.js` + Edge Function `send-reminders`) | Walau browser/tab ditutup | Suara notifikasi bawaan perangkat | VAPID, deploy fungsi, cron |

## Kenapa alarm lokal tidak bisa andal saat browser ditutup
Saat browser/tab ditutup, JavaScript tidak berjalan, dan service worker tidak boleh menjadwalkan timer lama sendiri. Satu-satunya cara yang didukung browser adalah **server mengirim push** yang membangunkan service worker. Karena itu NEXORA tidak mengklaim alarm lokal andal saat tertutup.

## Alur Web Push (v2 — Background Push)
1. Pengguna menekan **Pengaturan → Aktifkan notifikasi push** (izin TIDAK pernah diminta otomatis) → izin browser → langganan dibuat dan disimpan lewat RPC `register_push_subscription` (user_id diambil dari `auth.uid()` di database, bukan dari frontend). Banyak perangkat didukung; tiap perangkat satu baris di `push_subscriptions`.
2. `pg_cron` memanggil Edge Function `send-reminders` tiap menit dengan header `x-cron-secret` (secret ada di Supabase Vault).
3. Fungsi memanggil `claim_due_reminders()`: database menghitung `fire_at` = (tanggal + jam mulai − offset alarm) pada **zona waktu profil pengguna**, membuat baris `push_deliveries` secara idempoten (indeks unik `instance_id + subscription_id + fire_at`) dan mengklaimnya dengan `FOR UPDATE SKIP LOCKED` → tidak ada pengiriman ganda walau fungsi berjalan dobel. Toleransi keterlambatan scheduler 10 menit; lebih lama dari itu dianggap basi dan dilewati.
4. Fungsi mengirim Web Push (VAPID) ke tiap perangkat lalu memanggil `complete_push_delivery()`. 404/410 → langganan dinonaktifkan; gagal sementara → dicoba ulang (maks. 3 kali selama masih dalam toleransi).
5. `sw.js` menampilkan notifikasi (tag `instance-<id>`, sama dengan notifikasi alarm in-app sehingga saling menggantikan). Mengetuknya membuka `/calendar?date=YYYY-MM-DD`. URL dari payload divalidasi: hanya path internal.
6. Bila NEXORA sedang terlihat, service worker tidak menampilkan notifikasi pengingat (alarm in-app sudah menanganinya), kecuali di iOS/Safari yang mewajibkan setiap push menampilkan notifikasi.
7. Alarm in-app lama tidak diubah dan tetap berjalan seperti sebelumnya; push hanyalah lapisan tambahan.

## Setup
Lihat `INSTALLATION.md` pada paket update (migrasi 0006, VAPID, secrets, deploy 2 fungsi, `supabase/optional/cron.sql`, env Vercel).
Secrets Edge Function: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (min. 16 karakter), `ALLOWED_ORIGINS`. Frontend hanya memakai `VITE_VAPID_PUBLIC_KEY`.

## Batasan
- Presisi sekitar 1 menit (cron per menit) dan TIDAK dijamin tepat detik; OS/layanan push dapat menunda (mode hemat daya, Doze). Pengingat yang terlambat lebih dari 10 menit dilewati.
- Jika pengguna menutup paksa browser (force stop) atau menghapus data situs, sebagian perangkat Android tidak menerima push sampai aplikasi dibuka lagi.
- **iPhone/iPad**: push hanya jika NEXORA dipasang ke Layar Utama (iOS 16.4+) dan dibuka dari ikon itu.
- Audio unggahan **tidak** diputar oleh push; hanya alarm in-app.
- Pengingat yang jatuh pada hari sebelumnya (mis. mulai 00:10, 30 menit sebelumnya) ditangani push, bukan alarm in-app.
- Browser dapat memblokir suara otomatis: tekan **Tes suara** sekali per sesi.
- Untuk alarm yang benar-benar andal (seperti jam alarm), dibutuhkan aplikasi native — di luar cakupan proyek ini.
