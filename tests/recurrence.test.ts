import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysInMonth, dayOfWeek, endOfMonth, startOfWeek, todayInTz, isValidISO } from '../src/lib/date';
import { occursOn, occurrencesBetween, projectMissing, type RecurrenceRule, type ProjectionTemplate } from '../src/lib/recurrence';

const base: RecurrenceRule = {
  recurrence_type: 'daily', recurrence_days: [], day_of_month: null,
  start_date: '2026-01-01', end_date: null, is_active: true,
};

test('daily: setiap hari sejak start_date, tidak sebelum', () => {
  assert.equal(occursOn(base, '2025-12-31'), false);
  assert.equal(occursOn(base, '2026-01-01'), true);
  assert.equal(occursOn(base, '2026-07-19'), true);
});

test('none: hanya pada start_date', () => {
  const t = { ...base, recurrence_type: 'none' as const };
  assert.equal(occursOn(t, '2026-01-01'), true);
  assert.equal(occursOn(t, '2026-01-02'), false);
});

test('weekly dengan hari terpilih (Sen, Rab, Jum)', () => {
  const t = { ...base, recurrence_type: 'weekly' as const, recurrence_days: [1, 3, 5] };
  const got = occurrencesBetween(t, '2026-03-02', '2026-03-08'); // Senin–Minggu
  assert.deepEqual(got, ['2026-03-02', '2026-03-04', '2026-03-06']);
});

test('weekly tanpa hari terpilih memakai hari dari start_date', () => {
  const t = { ...base, recurrence_type: 'weekly' as const, start_date: '2026-03-04' }; // Rabu
  assert.deepEqual(occurrencesBetween(t, '2026-03-02', '2026-03-15'), ['2026-03-04', '2026-03-11']);
});

test('custom days', () => {
  const t = { ...base, recurrence_type: 'custom' as const, recurrence_days: [0, 6] };
  assert.deepEqual(occurrencesBetween(t, '2026-03-02', '2026-03-08'), ['2026-03-07', '2026-03-08']);
  assert.equal(occursOn({ ...t, recurrence_days: [] }, '2026-03-07'), false);
});

test('monthly tanggal 31: jatuh di hari terakhir bulan yang lebih pendek', () => {
  const t = { ...base, recurrence_type: 'monthly' as const, day_of_month: 31, start_date: '2026-01-31' };
  assert.equal(occursOn(t, '2026-01-31'), true);
  assert.equal(occursOn(t, '2026-02-28'), true);
  assert.equal(occursOn(t, '2026-02-27'), false);
  assert.equal(occursOn(t, '2026-04-30'), true);
  assert.equal(occursOn(t, '2026-04-29'), false);
  assert.equal(occursOn(t, '2026-05-31'), true);
});

test('monthly tahun kabisat: 29 Februari', () => {
  const t = { ...base, recurrence_type: 'monthly' as const, day_of_month: 29, start_date: '2027-01-01' };
  assert.equal(occursOn(t, '2028-02-29'), true);
  assert.equal(occursOn(t, '2027-02-28'), true);   // bukan kabisat -> 28
  assert.equal(occursOn(t, '2027-03-29'), true);
});

test('monthly tanpa day_of_month memakai tanggal start_date', () => {
  const t = { ...base, recurrence_type: 'monthly' as const, start_date: '2026-03-15' };
  assert.deepEqual(occurrencesBetween(t, '2026-03-01', '2026-05-31'), ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('pergantian tahun: daily 30 Des – 2 Jan', () => {
  assert.deepEqual(occurrencesBetween(base, '2026-12-30', '2027-01-02'),
    ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
});

test('end_date menghentikan pengulangan; is_active=false menghentikan semua', () => {
  const t = { ...base, end_date: '2026-01-03' };
  assert.deepEqual(occurrencesBetween(t, '2026-01-01', '2026-01-06'), ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.equal(occursOn({ ...base, is_active: false }, '2026-02-01'), false);
});

test('hari istirahat tidak menghasilkan jadwal', () => {
  const rest = new Set(['2026-03-03']);
  assert.deepEqual(occurrencesBetween(base, '2026-03-02', '2026-03-04', rest), ['2026-03-02', '2026-03-04']);
});

test('projectMissing: tidak menduplikasi instance yang sudah ada & tidak memproyeksikan masa lalu', () => {
  const tpl: ProjectionTemplate = {
    ...base, id: 't1', title: 'Belajar', life_area_id: 2, difficulty: 'normal', start_time: '20:30', end_time: null,
  };
  const existing = [{ template_id: 't1', scheduled_date: '2026-05-11' }];
  const got = projectMissing([tpl], existing, '2026-05-09', '2026-05-12', '2026-05-10');
  assert.deepEqual(got.map((g) => g.date), ['2026-05-10', '2026-05-12']);   // 05-09 lampau, 05-11 sudah ada
  assert.ok(got.every((g) => g.projected));
});

test('utilitas tanggal: akhir bulan, kabisat, awal minggu (Senin)', () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(endOfMonth('2026-04-10'), '2026-04-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(dayOfWeek('2026-11-08'), 0);                 // Minggu
  assert.equal(startOfWeek('2026-11-08'), '2026-11-02');    // Senin
  assert.equal(isValidISO('2026-02-30'), false);
  assert.equal(isValidISO('2028-02-29'), true);
});

test('zona waktu: tanggal lokal bergeser sesuai zona (WIB vs UTC)', () => {
  const instant = new Date('2026-11-08T18:30:00Z');       // 01:30 WIB tanggal 9
  assert.equal(todayInTz('UTC', instant), '2026-11-08');
  assert.equal(todayInTz('Asia/Jakarta', instant), '2026-11-09');
  assert.equal(todayInTz('America/Los_Angeles', instant), '2026-11-08');
});
