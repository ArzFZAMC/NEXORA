# Alarm & Notifikasi — cara kerja dan batasannya

## Dua lapisan
| Lapisan | Kapan jalan | Suara | Butuh setup |
|---|---|---|---|
| **Alarm in-app** (`src/features/alarms/AlarmHost.tsx`) | Hanya saat NEXORA terbuka (tab/PWA, boleh di latar belakang selama browser belum menghentikan tab) | Nada bawaan atau audio unggahan, loop sampai ditutup; snooze 5/10/15 menit | Tidak ada |
| **Web Push** (`public/sw.js` + Edge Function `send-reminders`) | Walau browser/tab ditutup | Suara notifikasi bawaan perangkat | VAPID, deploy fungsi, cron |

## Kenapa alarm lokal tidak bisa andal saat browser ditutup
Saat browser/tab ditutup, JavaScript tidak berjalan, dan service worker tidak boleh menjadwalkan timer lama sendiri. Satu-satunya cara yang didukung browser adalah **server mengirim push** yang membangunkan service worker. Karena itu NEXORA tidak mengklaim alarm lokal andal saat tertutup.

## Alur Web Push
1. Pengguna menekan **Pengaturan → Aktifkan notifikasi push** → izin browser → langganan disimpan di `push_subscriptions`.
2. `pg_cron` memanggil Edge Function `send-reminders` tiap menit (dengan header `x-cron-secret`).
3. Fungsi memanggil `due_reminders()` (aktivitas berstatus planned, alarm aktif, waktu pengingat dalam 2 menit terakhir, belum pernah dikirim), mengirim push, lalu `mark_reminders_sent()` agar tidak terkirim dua kali. Langganan yang sudah mati (404/410) dibersihkan otomatis.
4. `sw.js` menampilkan notifikasi; mengetuknya membuka NEXORA.

## Setup
```bash
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:emailkamu@contoh.com CRON_SECRET=<acak-panjang>
npx supabase functions deploy send-reminders --no-verify-jwt
```
Isi `VITE_VAPID_PUBLIC_KEY` (publik saja) di `.env.local` dan Vercel, lalu build ulang. Jalankan `supabase/optional/cron.sql` setelah mengganti `<PROJECT_REF>` dan `<CRON_SECRET>` (jangan commit file yang sudah berisi secret).

## Batasan
- Presisi sekitar 1 menit (cron per menit); OS dapat menunda push (mode hemat daya, Doze).
- **iPhone/iPad**: push hanya jika NEXORA dipasang ke Layar Utama (iOS 16.4+) dan dibuka dari ikon itu.
- Audio unggahan **tidak** diputar oleh push; hanya alarm in-app.
- Pengingat yang jatuh pada hari sebelumnya (mis. mulai 00:10, 30 menit sebelumnya) ditangani push, bukan alarm in-app.
- Browser dapat memblokir suara otomatis: tekan **Tes suara** sekali per sesi.
- Untuk alarm yang benar-benar andal (seperti jam alarm), dibutuhkan aplikasi native — di luar cakupan proyek ini.
