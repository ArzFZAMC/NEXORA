# Keamanan

## Model ancaman singkat
Data pribadi per pengguna; pendaftaran hanya lewat undangan; frontend tidak dipercaya.

## Kontrol yang diimplementasikan
| Risiko | Kontrol | Lokasi |
|---|---|---|
| Pengguna membaca data pengguna lain | RLS aktif di semua tabel, policy `user_id = auth.uid()` | `0003_rls.sql` |
| Pemalsuan XP | `xp_transactions` tidak bisa ditulis klien (hak INSERT dicabut); XP hanya dari `complete_instance()`; `UNIQUE(user_id, ref_key)`; `CHECK amount > 0`; status `completed` tidak bisa diset langsung (trigger `guard_instance`) | `0001`, `0002`, `0003` |
| Aktivitas selesai diubah kembali | Trigger memblokir perubahan status/tanggal/judul/kesulitan instance yang selesai | `guard_instance` |
| Quest pribadi dipakai farming XP | Trigger memaksa `xp_reward = 0` untuk quest buatan user | `guard_quest` |
| Registrasi bebas | Signup publik dimatikan; akun hanya dibuat Edge Function `redeem-invite` | README langkah 3 & 6 |
| Kode undangan bocor dari database | Hanya hash SHA-256 disimpan; tabel tak bisa diakses klien; batas pakai & masa berlaku atomik | `consume_invitation` |
| Brute force kode undangan | Maks 10 percobaan / 15 menit / IP | `invite_attempts` |
| Kebocoran service_role | Hanya di sisi server (secrets Edge Function); frontend hanya anon key | `.env.example`, kode `api.ts` |
| Fungsi internal dipanggil klien | `REVOKE EXECUTE` dari `anon`/`authenticated` untuk fungsi internal; RPC klien hanya untuk `authenticated` | akhir `0002` |
| Upload audio berbahaya | Bucket privat, folder per user, tipe MIME & ukuran (2 MB) dibatasi | `0003`, `uploadSound()` |
| XSS / clickjacking | React escape bawaan, CSP ketat, `X-Frame-Options: DENY`, `nosniff`, Referrer/Permissions-Policy | `vercel.json`, `netlify.toml` |
| Input tidak valid | Validasi klien + CHECK/constraint database + validasi backup dua lapis | form, SQL, `backup.ts` |
| Password | Dikelola Supabase Auth (hash bcrypt); tidak pernah disimpan/di-log oleh aplikasi | — |

## Yang perlu kamu lakukan
1. Matikan *Allow new users to sign up* di Supabase.
2. Jangan commit `.env.local` dan jangan taruh `service_role` di variabel `VITE_*`.
3. Isi `ALLOWED_ORIGINS` Edge Function dengan domain Vercel kamu (bukan `*`).
4. Jalankan `npx supabase test db` setelah setiap perubahan SQL.
5. Pertimbangkan memutar (rotate) kunci jika pernah terlanjur ter-commit.

## Batasan yang diketahui
- Rate limit undangan berbasis IP dari header `x-forwarded-for` (dapat dipalsukan di balik proxy tertentu); batas pakai & masa berlaku tetap melindungi.
- Aplikasi adalah pelacak mandiri; XP tidak membuktikan aktivitas benar-benar dilakukan.
- Belum ada audit penetrasi pihak ketiga.
