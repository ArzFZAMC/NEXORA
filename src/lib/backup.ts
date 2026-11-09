// Validasi file backup sebelum dikirim ke restore_my_data() di server.
// Server memvalidasi ulang (constraint database); validasi di sini memberi pesan error yang jelas lebih awal.

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

const STATUSES = ['planned', 'completed', 'skipped', 'missed'];
const DIFFICULTIES = ['easy', 'normal', 'hard', 'challenge'];
const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'custom'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BackupSummary {
  templates: number;
  instances: number;
  completed: number;
  restDays: number;
  schedules: number;
  exportedAt: string | null;
}

export type BackupValidation =
  | { ok: true; data: Record<string, unknown>; summary: BackupSummary }
  | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);

export function parseBackup(text: string): BackupValidation {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['File terlalu besar (maks 8 MB).'] };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, errors: ['File bukan JSON yang valid.'] }; }
  return validateBackup(raw);
}

export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = [];
  if (!isRec(raw)) return { ok: false, errors: ['Format backup tidak dikenali.'] };
  if (raw.app !== 'nexora') errors.push('Bukan file backup NEXORA.');
  if (raw.version !== BACKUP_VERSION) errors.push(`Versi backup tidak didukung (butuh versi ${BACKUP_VERSION}).`);
  for (const key of ['templates', 'instances', 'alarms', 'rest_days', 'schedules', 'personal_quests']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) errors.push(`Bagian "${key}" harus berupa daftar.`);
  }
  if (errors.length) return { ok: false, errors };

  const templates = arr(raw.templates);
  const instances = arr(raw.instances);
  const ids = new Set<string>();
  templates.forEach((t, i) => {
    if (typeof t.id !== 'string' || !UUID_RE.test(t.id)) errors.push(`Template #${i + 1}: id tidak valid.`);
    else ids.add(t.id);
    if (typeof t.title !== 'string' || !t.title.trim()) errors.push(`Template #${i + 1}: judul kosong.`);
    if (!RECURRENCES.includes(String(t.recurrence_type))) errors.push(`Template #${i + 1}: jenis pengulangan tidak valid.`);
    if (!DIFFICULTIES.includes(String(t.difficulty))) errors.push(`Template #${i + 1}: tingkat kesulitan tidak valid.`);
    if (typeof t.start_date !== 'string' || !DATE_RE.test(t.start_date)) errors.push(`Template #${i + 1}: start_date tidak valid.`);
  });
  const seen = new Set<string>();
  instances.forEach((it, i) => {
    if (typeof it.id !== 'string' || !UUID_RE.test(it.id)) errors.push(`Aktivitas #${i + 1}: id tidak valid.`);
    if (!STATUSES.includes(String(it.status))) errors.push(`Aktivitas #${i + 1}: status tidak valid.`);
    if (typeof it.scheduled_date !== 'string' || !DATE_RE.test(it.scheduled_date)) errors.push(`Aktivitas #${i + 1}: tanggal tidak valid.`);
    if (it.template_id != null && !ids.has(String(it.template_id))) errors.push(`Aktivitas #${i + 1}: merujuk template yang tidak ada di file.`);
    if (it.status === 'completed' && !it.completed_at) errors.push(`Aktivitas #${i + 1}: selesai tetapi tanpa waktu selesai.`);
    // duplikat: template yang sama pada tanggal yang sama (kecuali instance exception)
    if (it.template_id && !it.is_exception) {
      const k = `${it.template_id}|${it.scheduled_date}`;
      if (seen.has(k)) errors.push(`Aktivitas #${i + 1}: duplikat pada tanggal yang sama.`);
      seen.add(k);
    }
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };

  return {
    ok: true,
    data: raw,
    summary: {
      templates: templates.length,
      instances: instances.length,
      completed: instances.filter((x) => x.status === 'completed').length,
      restDays: arr(raw.rest_days).length,
      schedules: arr(raw.schedules).length,
      exportedAt: typeof raw.exported_at === 'string' ? raw.exported_at : null,
    },
  };
}

export function backupFilename(isoDate: string): string {
  return `nexora-backup-${isoDate}.json`;
}
