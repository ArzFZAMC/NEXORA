# NEXORA — Build Your Better Self

Platform manajemen hidup & produktivitas pribadi (PWA): aktivitas berulang, jadwal, kalender, gamifikasi tanpa hukuman, alarm, dan sinkronisasi cloud lintas perangkat.
**Stack:** React 19 · Vite · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions) · PWA.

> Baca dulu bagian **[Status & batasan yang jujur](#status--batasan-yang-jujur)** sebelum dipakai sehari-hari.

---

## Isi

1. [Fitur](#fitur)
2. [Jalankan secara lokal (cepat)](#jalankan-secara-lokal)
3. [Konfigurasi Supabase — panduan pemula](#konfigurasi-supabase--panduan-pemula)
4. [Deploy ke Vercel (atau Netlify)](#deploy-ke-vercel)
5. [Notifikasi push saat browser tertutup (opsional)](#notifikasi-push-opsional)
6. [Backup & pemulihan](#backup--pemulihan)
7. [Testing](#testing)
8. [Struktur proyek](#struktur-proyek)
9. [Status & batasan yang jujur](#status--batasan-yang-jujur)
10. [Troubleshooting](#troubleshooting)

---

## Fitur

| Area | Yang ada |
|---|---|
| Auth | Email+password, magic link, **registrasi hanya dengan kode undangan** (berlaku sampai tanggal tertentu, batas pemakaian, disimpan sebagai hash) |
| Aktivitas | Buat/ubah/hapus/selesaikan/lewati/pindahkan jadwal, catatan, cari, filter, urutkan |
| Pengulangan | Tidak berulang, harian, mingguan (hari terpilih), bulanan (tanggal 31 → hari terakhir bulan), hari tertentu. **Template** dan **Instance** dipisah; riwayat tidak berubah saat template diedit |
| Jadwal & Kalender | Tampilan harian/mingguan/bulanan, versi jadwal tersimpan, hari istirahat (tidak dihitung terlewat, tidak memutus streak) |
| Gamifikasi | XP 10/20/35/50, level & tier, streak harian/mingguan, milestone, quest harian/mingguan/bulanan/pribadi, 15 pencapaian, 6 atribut hidup. **Ledger XP**: satu kali per aktivitas, tidak pernah berkurang |
| Alarm | Nada bawaan atau audio unggahan, snooze, notifikasi visual, Web Push untuk saat aplikasi tertutup (butuh setup opsional) |
| Sinkronisasi | Cloud = sumber kebenaran, realtime lintas perangkat, cache IndexedDB, antrean aksi offline (idempoten) |
| Pengaturan | Profil, zona waktu, tema (gelap/terang/sistem), 5 warna aksen, 3 preset dashboard (Compact/Balanced/Focus), backup/restore JSON, ganti password, keluar dari semua perangkat |
| Bahasa | Bahasa Indonesia. Struktur i18n siap menambah bahasa Inggris (`src/i18n/en.ts`) |

---

## Jalankan secara lokal

Prasyarat: **Node.js 18.18+** (disarankan 20/22) dan akun Supabase (gratis).

```bash
npm install
cp .env.example .env.local     # lalu isi nilainya (lihat bagian Supabase di bawah)
npm run dev                    # http://localhost:5173
```

Tanpa `.env.local`, aplikasi menampilkan halaman “NEXORA belum dikonfigurasi”.

Perintah lain:

```bash
npm test            # tes logika murni (33 tes)
npm run build       # build produksi ke dist/
npm run preview     # coba hasil build
npm run typecheck   # pengecekan tipe TypeScript
npm run icons       # buat ulang ikon PWA dari public/icons/icon.svg
```

---

## Konfigurasi Supabase — panduan pemula

Supabase adalah layanan database + login siap pakai. Paket **Free** cukup untuk NEXORA pribadi.
Ikuti urutan ini persis. Estimasi 20–30 menit.

### Langkah 1 — Buat project

1. Buka <https://supabase.com> → **Sign in** (bisa pakai GitHub) → **New project**.
2. Isi **Name** (mis. `nexora`), **Database Password** (simpan di password manager, jangan dibagikan), dan **Region** terdekat (mis. *Southeast Asia (Singapore)*).
3. Klik **Create new project**, tunggu sampai selesai (± 2 menit).

### Langkah 2 — Jalankan migrasi database

Di dashboard: menu kiri **SQL Editor** → **New query**. Untuk **setiap file berikut, berurutan**, salin seluruh isinya ke editor lalu klik **Run**:

1. `supabase/migrations/0001_schema.sql` — tabel & constraint
2. `supabase/migrations/0002_functions.sql` — logika inti (XP, streak, generator jadwal, backup)
3. `supabase/migrations/0003_rls.sql` — Row Level Security, bucket audio, realtime
4. `supabase/migrations/0004_seed.sql` — area hidup, pencapaian, quest bawaan
5. `supabase/migrations/0005_grants.sql` — area hidup, pencapaian, quest bawaan

Setiap langkah harus menampilkan “Success. No rows returned”. **Jangan lompat urutan.** Kalau ada error, jangan lanjut — salin pesan errornya (lihat [Troubleshooting](#troubleshooting)).

> Cek hasil: menu **Table Editor** harus menampilkan tabel seperti `activity_templates`, `activity_instances`, `xp_transactions`, dst., dan `life_areas` berisi 6 baris.

### Langkah 3 — Matikan pendaftaran publik (PENTING)

NEXORA invite-only, jadi pendaftaran bebas harus dimatikan:

1. **Authentication** → **Sign In / Providers** (atau **Providers → Email**).
2. Matikan **Allow new users to sign up**. Biarkan **Email** provider tetap aktif.
3. (Opsional) Matikan **Confirm email** kalau tidak ingin ada langkah konfirmasi — akun dibuat oleh Edge Function dengan email yang sudah dikonfirmasi, jadi ini tidak wajib.

### Langkah 4 — Atur URL (untuk magic link)

**Authentication → URL Configuration**:
- **Site URL**: `http://localhost:5173` untuk sekarang (ganti dengan URL Vercel setelah deploy).
- **Redirect URLs**: tambahkan `http://localhost:5173` dan, nanti, URL Vercel kamu (mis. `https://nexora-kamu.vercel.app`).

Magic link hanya berlaku untuk akun yang sudah ada (registrasi tetap lewat undangan).

### Langkah 5 — Ambil URL & anon key

**Project Settings → API** (atau **API Keys**):
- **Project URL** → isi `VITE_SUPABASE_URL`
- **anon / publishable key** → isi `VITE_SUPABASE_ANON_KEY`

Salin `.env.example` ke `.env.local` dan isi keduanya.
**JANGAN** pernah memakai `service_role` / secret key di file `.env` frontend. Key itu hanya hidup di server Supabase.

### Langkah 6 — Deploy Edge Function pendaftaran (`redeem-invite`)

Fungsi ini satu-satunya jalan membuat akun. Perlu **Supabase CLI**:

```bash
npx supabase login                                   # buka browser, izinkan
npx supabase link --project-ref <PROJECT_REF>        # PROJECT_REF = bagian awal URL project: https://<PROJECT_REF>.supabase.co
npx supabase functions deploy redeem-invite --no-verify-jwt
npx supabase functions deploy send-reminders --no-verify-jwt     # hanya jika memakai push (opsional)
npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://nexora-kamu.vercel.app
```

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` otomatis tersedia di dalam Edge Function; tidak perlu diatur.
Ulangi `secrets set` setelah kamu tahu URL Vercel final.

### Langkah 7 — Buat kode undangan pertama

SQL Editor → jalankan isi `supabase/optional/create-invitation.sql`:

```sql
select public.create_invitation(1, 7, 'untuk saya');   -- 1x pakai, berlaku 7 hari
```

Hasilnya satu kode (mis. `A1B2C3D4E5F6`). **Kode hanya tampil sekali**; database hanya menyimpan hash-nya.

### Langkah 8 — Daftar & masuk

Jalankan `npm run dev` → tab **Daftar** → masukkan kode, email, password (min. 8 karakter). Setelah itu kamu langsung masuk.
Untuk mengundang orang lain, buat kode baru dengan cara yang sama.

### Catatan paket Free (cek ulang di supabase.com/pricing, bisa berubah)

- Project Free dapat **di-pause otomatis** jika tidak aktif lama; buka dashboard dan klik *Restore* bila itu terjadi.
- Backup otomatis harian **tidak termasuk** di Free — gunakan **Pengaturan → Unduh backup** secara berkala.
- Email bawaan Supabase punya batas kirim yang kecil; cukup untuk magic link pribadi.

---

## Deploy ke Vercel

1. Push proyek ke GitHub (file `.env.local` otomatis diabaikan oleh `.gitignore`).
2. <https://vercel.com> → **Add New → Project** → impor repo. Framework terdeteksi **Vite**.
3. **Environment Variables**: tambahkan `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (dan `VITE_VAPID_PUBLIC_KEY` bila memakai push).
4. **Deploy**.
5. Kembali ke Supabase: perbarui **Site URL**, **Redirect URLs** (Langkah 4), dan `ALLOWED_ORIGINS` (Langkah 6) dengan URL Vercel.
6. Buka URL Vercel di HP → menu browser → **Tambahkan ke Layar Utama** untuk memasang PWA.

`vercel.json` sudah berisi SPA rewrite, header keamanan, dan Content-Security-Policy.
**Netlify** juga didukung: `netlify.toml` tersedia (build `npm run build`, publish `dist`, SPA redirect, header yang sama).

---

## Notifikasi push (opsional)

Alarm di dalam aplikasi berbunyi saat NEXORA terbuka. Agar **tetap ada pengingat saat browser/tab ditutup**, dibutuhkan server terjadwal + Web Push. Penjelasan lengkap dan batasannya: **[docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)**. Ringkas:

```bash
npx web-push generate-vapid-keys          # hasilkan public & private key
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:emailkamu@contoh.com CRON_SECRET=<string-acak-panjang>
npx supabase functions deploy send-reminders --no-verify-jwt
```

Lalu isi `VITE_VAPID_PUBLIC_KEY` (kunci publik saja) di `.env.local`/Vercel, jalankan `supabase/optional/cron.sql` (ganti `<PROJECT_REF>` dan `<CRON_SECRET>`), dan aktifkan dari **Pengaturan → Notifikasi push**.

---

## Backup & pemulihan

- **Unduh backup**: Pengaturan → *Unduh backup* → file `nexora-backup-YYYY-MM-DD.json` (template, aktivitas, hari istirahat, versi jadwal, quest pribadi, alarm).
- **Pulihkan**: Pengaturan → *Pulihkan dari file*. File divalidasi dulu (format, versi, duplikat, rujukan template) lalu server memvalidasi lagi.
- Pemulihan **mengganti** data aktivitas saat ini. **XP tidak diimpor** dari file (agar tidak bisa dipalsukan); ledger XP dibangun ulang dari aktivitas yang berstatus selesai. Karena itu total XP setelah restore bisa sedikit berbeda dari sebelumnya (bonus quest periode lama tidak ikut).
- Restore ditujukan ke **akun yang sama**. ID di backup tetap dipakai, sehingga memulihkan ke akun lain saat akun asal masih ada akan gagal karena bentrok ID.
- File audio alarm tidak termasuk di backup (hanya referensi path).

---

## Testing

Detail: **[docs/TESTING.md](docs/TESTING.md)**.

| Jenis | Perintah | Cakupan |
|---|---|---|
| Unit (logika murni) | `npm test` | Pengulangan (akhir bulan, kabisat, pergantian tahun, zona waktu), XP & level, alarm/snooze, quest, antrean offline, validasi backup |
| Database (pgTAP) | `npx supabase test db` (butuh Supabase CLI + Docker) | RLS antar-user, duplikat instance, integritas XP, riwayat vs edit template, undangan |
| End-to-end | `npm run e2e` (butuh `npx playwright install`) | Halaman masuk, validasi, navigasi responsif; alur aktivitas bila `E2E_EMAIL`/`E2E_PASSWORD` diset |

---

## Struktur proyek

```
src/
  app/            AppContext: sesi, data, cache offline, antrean aksi, realtime
  components/     ui/ (Modal, Toast, Confirm, ProgressBar…) dan layout/ (Shell: sidebar & bottom nav)
  features/       activities/ (form), alarms/ (AlarmHost), common/ (baris aktivitas), quests/
  i18n/           id.ts (lengkap), en.ts (kerangka), index.tsx
  lib/            date, recurrence, gamification, quests, alarms, outbox, backup, sound, push, api, supabase, idb
  pages/          Dashboard, Activities, Schedule, Calendar, Quests, Statistics, Achievements, Settings, Auth, Setup
  styles/         Tailwind + token tema (CSS variables)
public/           manifest.webmanifest, sw.js (service worker), icons/
supabase/
  migrations/     0001 skema · 0002 fungsi · 0003 RLS · 0004 seed
  functions/      redeem-invite, send-reminders
  optional/       cron.sql, create-invitation.sql
  tests/          pgTAP
tests/            unit test (node:test + tsx)
e2e/              Playwright
docs/             DESIGN (rancangan awal), NOTIFICATIONS, SECURITY, TESTING
```

Prinsip: logika yang menyangkut XP, status, dan pembuatan jadwal berjalan **di database** (fungsi atomik), bukan di frontend, sehingga klien tidak bisa memalsukan XP dan dua perangkat tidak menghasilkan data ganda.

---

## Status & batasan yang jujur

**Sudah diverifikasi saat pembangunan:**
- 33 unit test lulus (`npm test`); modul non-React lolos `tsc --strict`.
- Seluruh halaman berhasil dirender (uji SSR dengan data contoh) dan seluruh kode berhasil di-bundle dengan esbuild; semua kunci terjemahan terpakai ada di kamus.

**BELUM dijalankan / diverifikasi (lingkungan pembangunan tidak punya internet untuk instalasi paket dan tidak ada server PostgreSQL/Supabase):**
- **Migrasi SQL belum dieksekusi di PostgreSQL sungguhan.** Ditulis dan ditinjau dengan teliti, tetapi mungkin masih ada kesalahan kecil saat pertama dijalankan. Jika ada error, kirim pesan error persisnya.
- `npm run build` (Vite) dan `tsc` untuk file React belum dijalankan. Karena itu skrip `build` hanya menjalankan Vite (tanpa type-check) agar deploy tidak gagal; jalankan `npm run typecheck` dan perbaiki bila ada keluhan tipe.
- pgTAP dan Playwright belum dijalankan; Web Push end-to-end, uji lintas perangkat nyata, dan uji tampilan di perangkat asli belum dilakukan.
- Edge Function belum di-deploy/diuji terhadap Supabase sungguhan.

**Keterbatasan desain:**
- **Alarm saat browser tertutup tidak bisa diandalkan tanpa server.** JavaScript tidak berjalan saat browser ditutup. Solusi realistis = Web Push dari server terjadwal; suaranya adalah suara notifikasi sistem (bukan audio unggahan), iOS mensyaratkan PWA dipasang ke Layar Utama, dan OS bisa menunda push. Alarm in-app (audio unggahan, snooze) hanya saat aplikasi terbuka, dan browser dapat memblokir suara sebelum ada interaksi (gunakan tombol “Tes suara”).
- Aplikasi bersifat **pelacak mandiri**: pengguna bisa membuat aktivitas sendiri lalu menyelesaikannya untuk mendapat XP. Ini wajar untuk app pribadi, tetapi XP bukan alat pembuktian.
- Bahasa Inggris belum diterjemahkan (struktur sudah siap).
- Preset dashboard bersifat tetap (tiga preset); `dashboard_layouts.widgets` disiapkan untuk penyusunan widget kustom di masa depan.
- Menandai hari istirahat pada tanggal yang sudah punya aktivitas **tidak menghapus** aktivitas itu; hanya mencegah ditandai terlewat dan mencegah pembuatan jadwal baru di hari itu.
- Statistik di layar menampilkan 120 hari terakhir; jadwal 60 hari ke belakang dan 90 ke depan.
- Konflik sinkronisasi: server menang; aksi offline bersifat idempoten (selesai menang atas lewati). Tidak ada penggabungan per-field untuk pengeditan bersamaan; perubahan terakhir pada server yang berlaku.
- Tidak ada fitur hapus akun dari UI (bisa lewat dashboard Supabase → Authentication → Users; seluruh data ikut terhapus via `on delete cascade`).

---

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| “NEXORA belum dikonfigurasi” | `.env.local` belum ada/isi salah. Restart `npm run dev` setelah mengubah env. |
| Error saat menjalankan SQL | Pastikan urutan 0001→0004 dan belum pernah dijalankan sebagian. Untuk mengulang dari nol di project baru yang masih kosong: Database → hapus tabel `public` (atau buat project baru). Salin pesan error lengkap. |
| Daftar: “Kode undangan tidak valid…” | Kode kedaluwarsa/habis/dicabut, atau salah ketik. Buat kode baru. |
| Daftar gagal tanpa pesan jelas / CORS | `ALLOWED_ORIGINS` belum berisi URL kamu, atau fungsi belum di-deploy (`functions deploy redeem-invite`). |
| Magic link tidak masuk | Periksa Redirect URLs dan folder spam; akun harus sudah ada. |
| Data tidak muncul setelah login | Buka konsol browser (F12). Biasanya migrasi 0003/0004 belum dijalankan atau key salah. |
| Suara alarm tidak berbunyi | Browser memblokir audio otomatis. Buka Pengaturan → **Tes suara** sekali per sesi. |
| Push tidak muncul | Lihat [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) (VAPID, cron, izin browser, iOS). |
