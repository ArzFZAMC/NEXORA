# NEXORA — Rancangan Sistem (Sebelum Phase 1)

## 1. Analisis Kebutuhan

**Inti produk:** aplikasi harian pribadi (invite-only) untuk jadwal + kebiasaan + gamifikasi tanpa hukuman.

**Kebutuhan fungsional utama**
1. Auth (email+password, magic link), registrasi hanya via kode undangan.
2. Activity Template + Activity Instance (recurring).
3. Schedule (harian/mingguan/bulanan, banyak versi) dan Calendar (day/week/month, rest day).
4. XP ledger, level, streak, quest, achievement, life attributes.
5. Alarm + notifikasi (dengan batasan browser, lihat bagian 8).
6. Sinkronisasi cloud, cache lokal, backup/restore.
7. Settings (tema, aksen, timezone, bahasa, layout dashboard).

**Kebutuhan non-fungsional:** RLS ketat, tanpa service_role di frontend, responsif, offline-friendly, dapat diuji, tanpa fitur palsu.

**Aturan bisnis yang tidak boleh dilanggar (jadi constraint di database, bukan hanya di UI)**
- Satu instance per (template, tanggal) → `UNIQUE(template_id, scheduled_date)`.
- XP hanya sekali per instance → `UNIQUE` pada ledger untuk (instance_id, reason='activity_complete').
- Riwayat tidak berubah saat template diedit → instance menyimpan **snapshot** (judul, area, difficulty, jam).
- Instance `completed` tidak pernah di-reset otomatis oleh generator.
- Tidak ada pengurangan XP; ledger hanya bernilai positif (`CHECK amount > 0`).
- Rest day tidak dihitung missed dan tidak memutus streak.

## 2. Arsitektur Sistem

```
[React + Vite PWA]
   ├─ UI (Tailwind) ── TanStack Query (server state) ── Zustand (UI state)
   ├─ Dexie/IndexedDB (cache + outbox offline)
   ├─ Service Worker (cache aset, terima Web Push)
   └─ supabase-js (anon key + JWT user)
          │ HTTPS
[Supabase]
   ├─ Auth (signup publik dimatikan)
   ├─ Postgres + RLS + fungsi SQL (RPC)
   ├─ Edge Functions: redeem-invite, send-reminders, backup-export
   ├─ Storage: audio alarm (bucket privat per user)
   └─ pg_cron: generator instance + pemicu pengingat
```

**Prinsip:** logika kritis (generate instance, complete + beri XP, redeem invite) ada di **fungsi Postgres/RPC yang atomik**, bukan di frontend. Frontend hanya memanggilnya. Ini mencegah XP ganda dan data tidak konsisten.

## 3. Pemilihan Teknologi

| Area | Pilihan | Alasan |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Sesuai permintaan, type-safe |
| Styling | Tailwind CSS + CSS variables untuk tema/aksen | Dark/light + warna aksen dinamis |
| Data fetching | TanStack Query | Cache, retry, invalidasi |
| Form/validasi | React Hook Form + Zod | Satu skema validasi |
| Lokal | Dexie (IndexedDB) | Cache + antrean offline |
| Tanggal | date-fns + date-fns-tz | Timezone & pergantian bulan/tahun |
| Backend | Supabase (Postgres, Auth, Edge Functions, Storage) | Sesuai permintaan |
| PWA | vite-plugin-pwa | Service worker + installable |
| Test | Vitest, Testing Library, pgTAP, Playwright | Unit, DB/RLS, E2E |

## 4. Struktur Folder

```
nexora/
├─ src/
│  ├─ app/            (router, providers, layout shell)
│  ├─ components/ui/  (Button, Modal, Card, Input, dll.)
│  ├─ features/
│  │   ├─ auth/  dashboard/  activities/  schedule/  calendar/
│  │   ├─ gamification/ (xp, level, streak, quests, achievements)
│  │   ├─ alarms/  statistics/  settings/  backup/
│  │   └─ (tiap feature: components/ hooks/ api/ schemas/ types.ts)
│  ├─ lib/            (supabase client, dexie, date utils, sync)
│  ├─ styles/         (tokens tema)
│  └─ sw/             (service worker)
├─ supabase/
│  ├─ migrations/     (SQL berurutan)
│  ├─ functions/      (redeem-invite, send-reminders, backup-export)
│  ├─ tests/          (pgTAP: RLS, XP, duplikat)
│  └─ seed.sql        (data referensi: life_areas, achievements)
├─ e2e/               (Playwright)
└─ docs/
```

## 5. Skema Database (ringkas)

Semua tabel milik user punya `user_id uuid references auth.users on delete cascade` dan RLS `user_id = auth.uid()`.

- **profiles**: id (=auth.uid), display_name, timezone, language, created_at.
- **life_areas**: id, code (spiritual, learning, career, health, personal, entertainment), name, attribute (knowledge/career/health/spiritual/personal/creativity). Data referensi, read-only untuk user.
- **activity_templates**: id, user_id, title, description, life_area_id, difficulty (easy/normal/hard/challenge), start_time, end_time, recurrence_type (none/daily/weekly/monthly/custom), recurrence_days int[] (0–6), day_of_month, start_date, end_date (null = tak berbatas), is_active, alarm_enabled, version, updated_at.
- **activity_instances**: id, user_id, template_id (nullable, `on delete set null`), scheduled_date (DATE lokal), snapshot kolom (title, life_area_id, difficulty, start_time, end_time), status (planned/completed/skipped/missed), completed_at, notes, is_exception (diubah manual), `UNIQUE(template_id, scheduled_date)`. Index: (user_id, scheduled_date), (user_id, status).
- **schedules**: id, user_id, name, type (daily/weekly/monthly), is_active, config jsonb, created_at (mendukung banyak versi).
- **rest_days**: id, user_id, date, reason, `UNIQUE(user_id, date)`. (Tabel tambahan, perlu untuk fitur hari istirahat.)
- **alarms**: id, user_id, template_id/instance_id, offset_minutes, sound_type (default/custom), sound_path, snooze_minutes (5), enabled.
- **push_subscriptions** (tambahan): id, user_id, endpoint, keys, user_agent.
- **xp_transactions**: id, user_id, instance_id, quest_id, amount (>0), reason, created_at. Unique parsial: (instance_id) where reason='activity_complete'. Total XP = SUM; level dihitung dari total (tidak disimpan sebagai sumber kebenaran).
- **achievements**: id, code, name, condition jsonb, xp_reward. **user_achievements**: user_id, achievement_id, unlocked_at, `UNIQUE(user_id, achievement_id)`.
- **quests**: id, user_id nullable (null = bawaan), period (daily/weekly/monthly/personal), target_type, target_value, xp_reward. **user_quests**: user_id, quest_id, period_start, progress, completed_at, `UNIQUE(user_id, quest_id, period_start)`.
- **daily_statistics**: user_id, date, planned, completed, skipped, missed, xp_earned, per-area counts. `PK(user_id, date)`. Diisi oleh fungsi, bisa dihitung ulang.
- **dashboard_layouts**: user_id, preset, widgets jsonb.
- **user_settings**: user_id, theme, accent_color, notification prefs, default alarm sound.
- **invitations**: id, code_hash (hash, bukan plaintext), created_by, expires_at, max_uses, used_count, `CHECK used_count <= max_uses`, revoked. **Tidak dapat dibaca user biasa**; hanya diakses via Edge Function/RPC security definer.

**Fungsi RPC kunci**
- `generate_instances(user, from, to)`: idempoten (`INSERT … ON CONFLICT DO NOTHING`), melewati rest day, hanya tanggal ≥ hari ini dan ≥ start_date.
- `complete_instance(id)`: dalam satu transaksi: set completed, insert XP ledger (konflik diabaikan), update quest/streak/statistik.
- `redeem_invite(code)`: cek kedaluwarsa, batas pakai, lalu naikkan used_count secara atomik.

## 6. Arsitektur Keamanan

- Signup publik dimatikan di Supabase; akun hanya dibuat lewat Edge Function `redeem-invite` (service_role hanya di sisi server/secrets).
- RLS aktif di **semua** tabel; test pgTAP memastikan user A tidak bisa baca/tulis data user B.
- Frontend hanya memakai anon key. Password di-hash oleh Supabase Auth (bcrypt), tidak pernah disimpan sendiri.
- Validasi dua lapis: Zod di klien, CHECK/constraint di database.
- Kode undangan disimpan sebagai hash, ada rate limit pada redeem.
- Audio upload: batasi tipe & ukuran, bucket privat dengan policy per user.
- CSP header, HTTPS wajib (hosting Vercel/Netlify/Cloudflare).
- Backup: Supabase daily backup (tergantung plan) + fitur ekspor JSON per user + restore dengan validasi skema.

## 7. Sinkronisasi & Offline

- Cloud (Postgres) = sumber kebenaran. IndexedDB = cache baca + **outbox** untuk aksi saat offline.
- Aksi dikirim ulang saat online; aksi dibuat **idempoten** (complete dua kali tidak memberi XP dua kali).
- Konflik: field-level last-write-wins berdasarkan `updated_at` + `version`; untuk status instance, `completed` menang atas `planned/missed`. Konflik nyata ditampilkan ke user hanya bila perlu.
- Realtime Supabase untuk refresh lintas perangkat.

## 8. Batasan Alarm & Notifikasi (jujur)

- **Alarm berbunyi saat tab/aplikasi terbuka:** bisa, dengan audio kustom, snooze 5 menit, dan notifikasi visual.
- **Browser ditutup total:** JavaScript tidak berjalan, jadi alarm lokal **tidak bisa** diandalkan.
- **Solusi realistis:** Web Push (service worker) + backend scheduler (pg_cron → Edge Function → Web Push). Notifikasi tetap muncul walau tab ditutup.
- **Keterbatasan push:** suara memakai suara sistem (audio kustom tidak bisa diputar saat app tertutup); di iOS push hanya jalan jika PWA di-install ke Home Screen (iOS 16.4+); OS bisa menunda/menahan push (mode hemat baterai).
- Jadi: audio kustom penuh hanya saat app terbuka; saat tertutup = push notification dengan suara sistem. Untuk alarm sangat andal, dibutuhkan aplikasi native (di luar cakupan).

## 9. Roadmap

| Phase | Isi | Hasil yang bisa dicoba |
|---|---|---|
| 1 Foundation | Setup, design system, layout responsif, auth, invite, migrasi DB + RLS | Login via undangan, shell aplikasi |
| 2 Life Mgmt | Activity CRUD, recurring, schedule, calendar, rest day, dashboard dasar | Kelola aktivitas harian |
| 3 Gamification | XP ledger, level, streak, quest, achievement, statistik | Progres & statistik |
| 4 Alarm | Audio kustom, snooze, Web Push, scheduler | Pengingat |
| 5 Polish | Sinkronisasi offline, konflik, backup/restore, uji keamanan, performa | Siap pakai |

Estimasi kasar: Phase 1–2 paling besar. Tiap phase diakhiri test dan ringkasan sebelum lanjut.

## 10. Risiko Teknis

1. **Timezone & tanggal recurring** → simpan tanggal lokal (DATE) + timezone profil; test pergantian bulan/tahun, akhir bulan (tgl 31), DST tidak berlaku di WIB tapi tetap diuji.
2. **Duplikat/XP ganda** → constraint unik di DB + RPC atomik.
3. **Edit template vs riwayat** → snapshot di instance, perubahan hanya untuk instance masa depan.
4. **Alarm saat browser tertutup** → lihat bagian 8.
5. **Konflik sinkronisasi** → idempotensi + aturan prioritas status.
6. **Kebocoran data / RLS salah** → test pgTAP wajib sebelum rilis.
7. **Kunci rahasia bocor** → service_role hanya di Edge Function secrets.
8. **Cakupan terlalu besar** → fase bertahap, fitur kecil seperti multi-versi schedule dikerjakan setelah inti stabil.

## 11. Hal yang Perlu Kamu Putuskan

1. Hosting: Vercel / Netlify / Cloudflare Pages?
2. Supabase: sudah punya project (free tier cukup untuk mulai)? Daily backup otomatis butuh plan berbayar; tanpa itu saya andalkan ekspor JSON.
3. Bahasa awal UI: Indonesia, Inggris, atau keduanya?
4. Preset layout dashboard: cukup 3 preset (Compact, Balanced, Focus)?
5. Format ZIP: seluruh repo (`src` + `supabase/migrations` + README setup)?
