# Changelog

## Background Push Update (0006)
### Ditambahkan
- Migrasi `0006_push_delivery.sql`: kolom status/perangkat pada `push_subscriptions`, tabel `push_deliveries` (log + idempotensi), RPC `register_push_subscription`, `claim_due_reminders`, `complete_push_delivery`, `prepare_test_push`, `purge_push_data`.
- Edge Function `send-test-push` (tombol "Kirim notifikasi percobaan"; identitas dari token, bukan dari body).
- Modul bersama `_shared/payload.ts` (logika murni, teruji) dan `_shared/webpush.ts` (VAPID).
- UI `PushSettings` di Pengaturan: status, tombol aktifkan/matikan, info izin ditolak/tidak didukung, daftar perangkat, hapus perangkat.
- Deep link `/calendar?date=YYYY-MM-DD` dari notifikasi.
- Tes: `push-payload`, `push-util`, `sw` (unit) dan `supabase/tests/002_push.test.sql` (pgTAP, belum dijalankan).
### Diubah
- `public/sw.js` tetap SATU service worker; cache `nexora-v2`; handler push divalidasi, `notificationclick` fokus/arahkan jendela, `pushsubscriptionchange`.
- `send-reminders` memakai klaim atomik per perangkat (bukan `due_reminders` lama), secret dibandingkan waktu-konstan.
- `supabase/optional/cron.sql`: secret di Supabase Vault, tambah job purge.
- Penulisan langganan hanya lewat RPC (INSERT/UPDATE langsung dicabut dari `authenticated`).
- Tag notifikasi alarm in-app menjadi `instance-<id>` agar sama dengan push (saling menggantikan, tidak ganda).
### Tidak diubah
- Alarm in-app, autentikasi, tabel/data lama, jadwal pengingat lama, desain UI. `due_reminders` / `mark_reminders_sent` dipertahankan (deprecated).
