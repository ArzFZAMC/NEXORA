// Utilitas tanggal berbasis string ISO "YYYY-MM-DD" (tanggal kalender lokal, tanpa jam).
// Semua aritmetika memakai UTC internal sehingga tidak terpengaruh zona waktu perangkat/DST.

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISO(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

function toUTC(iso: ISODate): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Tanggal tidak valid: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUTC(d: Date): ISODate {
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

/** 0 = Minggu ... 6 = Sabtu (sama dengan extract(dow) di PostgreSQL) */
export function dayOfWeek(iso: ISODate): number {
  return toUTC(iso).getUTCDay();
}

export function dayOfMonth(iso: ISODate): number {
  return Number(iso.slice(8, 10));
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Senin sebagai awal minggu */
export function startOfWeek(iso: ISODate): ISODate {
  const dow = dayOfWeek(iso);
  return addDays(iso, -((dow + 6) % 7));
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  const d = Math.min(dayOfMonth(iso), daysInMonth(ny, nm + 1));
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Tanggal "hari ini" menurut zona waktu IANA tertentu (mis. Asia/Jakarta). */
export function todayInTz(tz: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Jam (0-23) menurut zona waktu tertentu */
export function hourInTz(tz: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now);
  return Number(h) % 24;
}

/** Menit sejak tengah malam menurut zona waktu tertentu */
export function minutesNowInTz(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return h * 60 + m;
}

export function formatDate(iso: ISODate, locale = 'id-ID', opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...(opts ?? { dateStyle: 'full' }) }).format(toUTC(iso));
}

/** "HH:MM:SS" | "HH:MM" -> "HH:MM" */
export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}
