# Testing

## Yang dijalankan pada pembangunan (hasil nyata)
- `npm test` → **33 tes lulus** (`node:test` + `tsx`): pengulangan (harian/mingguan/bulanan/hari tertentu, tanggal 31, 29 Februari, pergantian tahun, hari istirahat, anti-duplikat proyeksi, zona waktu WIB vs UTC), XP & level (batas level 1–80, tier), alarm & snooze, periode quest, antrean offline (gabung, flush, network error, penolakan, idempoten), validasi backup.
- `tsc --strict` untuk modul non-React dan semua file tes: lulus.
- Uji render SSR seluruh halaman dengan data contoh (tiga preset dashboard): lulus. Seluruh kode di-bundle dengan esbuild tanpa error.
- Pemeriksaan kunci terjemahan: 0 kunci hilang.

## Belum dijalankan (butuh lingkungan yang tidak tersedia saat pembangunan)
| Tes | Cara menjalankan | Cakupan |
|---|---|---|
| pgTAP (`supabase/tests/001_core.test.sql`, 21 assertion) | `npx supabase start` lalu `npx supabase test db` | RLS isolasi, duplikat, XP sekali, riwayat vs edit template, stop/hapus template, hak tabel, undangan |
| Playwright (`e2e/`) | `npx playwright install` lalu `npm run e2e` | Auth/validasi, navigasi responsif desktop & mobile; alur aktivitas+XP dengan `E2E_EMAIL`/`E2E_PASSWORD` |
| Uji lintas perangkat | Login di dua perangkat, selesaikan aktivitas di satu, amati yang lain | Realtime + sinkronisasi |
| Uji offline | DevTools → Network → Offline, selesaikan aktivitas, kembali online | Antrean & flush idempoten |
| Build produksi | `npm run build`, `npm run typecheck` | Type-check file React |

## Pemetaan ke daftar pengujian di master prompt
| Kebutuhan | Tempat |
|---|---|
| Activity creation / completion | pgTAP + e2e |
| Recurring activities, duplicate prevention | `tests/recurrence.test.ts`, pgTAP (unique index) |
| XP transaction integrity | `tests/gamification.test.ts`, pgTAP |
| Schedule changes, historical preservation | pgTAP (edit/stop/delete template) |
| Authentication, database permissions | pgTAP, e2e |
| Cross-device sync | manual (di atas); logika outbox di `tests/outbox-backup.test.ts` |
| Responsive layout | e2e (desktop vs mobile) |
| Backup & restoration | `tests/outbox-backup.test.ts` (validasi); restore server perlu uji manual |
