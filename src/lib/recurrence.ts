// Aturan pengulangan aktivitas. HARUS identik dengan fungsi SQL public.template_occurs_on()
// (supabase/migrations/0002_functions.sql). Dipakai UI untuk pratinjau jadwal di luar horizon yang sudah dibuat server.
import { addDays, dayOfMonth, dayOfWeek, daysInMonth, eachDay, type ISODate } from './date';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface RecurrenceRule {
  recurrence_type: RecurrenceType;
  recurrence_days: number[];      // 0 = Minggu ... 6 = Sabtu
  day_of_month: number | null;
  start_date: ISODate;
  end_date: ISODate | null;
  is_active: boolean;
}

export function occursOn(t: RecurrenceRule, date: ISODate): boolean {
  if (!t.is_active) return false;
  if (date < t.start_date) return false;
  if (t.end_date && date > t.end_date) return false;

  switch (t.recurrence_type) {
    case 'none':
      return date === t.start_date;
    case 'daily':
      return true;
    case 'weekly': {
      const days = t.recurrence_days.length ? t.recurrence_days : [dayOfWeek(t.start_date)];
      return days.includes(dayOfWeek(date));
    }
    case 'custom':
      return t.recurrence_days.includes(dayOfWeek(date));
    case 'monthly': {
      const wanted = t.day_of_month ?? dayOfMonth(t.start_date);
      const y = Number(date.slice(0, 4));
      const m = Number(date.slice(5, 7));
      // tanggal 31 di bulan 30 hari -> jatuh pada hari terakhir bulan itu
      return dayOfMonth(date) === Math.min(wanted, daysInMonth(y, m));
    }
    default:
      return false;
  }
}

/** Semua tanggal kemunculan pada rentang [from, to], dengan mengecualikan hari istirahat. */
export function occurrencesBetween(
  t: RecurrenceRule, from: ISODate, to: ISODate, restDays: ReadonlySet<ISODate> = new Set(),
): ISODate[] {
  return eachDay(from, to).filter((d) => occursOn(t, d) && !restDays.has(d));
}

export interface ProjectionTemplate extends RecurrenceRule {
  id: string;
  title: string;
  life_area_id: number;
  difficulty: string;
  start_time: string | null;
  end_time: string | null;
}

export interface ProjectedItem {
  template_id: string;
  date: ISODate;
  title: string;
  life_area_id: number;
  difficulty: string;
  start_time: string | null;
  end_time: string | null;
  projected: true;
}

/**
 * Proyeksi aktivitas mendatang yang belum dibuat server (di luar horizon generator).
 * Tidak pernah memproyeksikan tanggal yang sudah punya instance dari template yang sama (anti-duplikat),
 * tidak memproyeksikan masa lalu, dan melewati hari istirahat.
 */
export function projectMissing(
  templates: ProjectionTemplate[],
  existing: ReadonlyArray<{ template_id: string | null; scheduled_date: ISODate }>,
  from: ISODate, to: ISODate, today: ISODate, restDays: ReadonlySet<ISODate> = new Set(),
): ProjectedItem[] {
  const have = new Set(existing.map((e) => `${e.template_id}|${e.scheduled_date}`));
  const start = from < today ? today : from;
  if (to < start) return [];
  const out: ProjectedItem[] = [];
  for (const t of templates) {
    for (const d of occurrencesBetween(t, start, to, restDays)) {
      if (have.has(`${t.id}|${d}`)) continue;
      out.push({
        template_id: t.id, date: d, title: t.title, life_area_id: t.life_area_id, difficulty: t.difficulty,
        start_time: t.start_time, end_time: t.end_time, projected: true,
      });
    }
  }
  return out.sort((a, b) => (a.date + (a.start_time ?? '')).localeCompare(b.date + (b.start_time ?? '')));
}

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function nextOccurrence(t: RecurrenceRule, after: ISODate, horizonDays = 400): ISODate | null {
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(after, i);
    if (occursOn(t, d)) return d;
  }
  return null;
}
