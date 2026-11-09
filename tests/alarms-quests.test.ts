import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueAlarms } from '../src/lib/alarms';
import { questView, periodStart } from '../src/lib/quests';
import type { AlarmRow, Instance, Quest, UserQuest } from '../src/lib/types';

const inst = (o: Partial<Instance> = {}): Instance => ({
  id: 'i1', user_id: 'u', template_id: 't1', scheduled_date: '2026-11-09', title: 'Belajar', description: '', life_area_id: 2,
  difficulty: 'normal', start_time: '20:30:00', end_time: null, status: 'planned', completed_at: null, notes: '',
  is_exception: false, is_hidden: false, ...o,
});
const alarm = (o: Partial<AlarmRow> = {}): AlarmRow => ({
  id: 'a1', user_id: 'u', template_id: 't1', offset_minutes: 10, sound_type: 'default', sound_path: null, snooze_minutes: 5, enabled: true, ...o,
});
const base = { today: '2026-11-09', fired: new Set<string>(), snoozedUntil: new Map<string, number>() };
const at = (h: number, m: number) => h * 60 + m;

test('alarm berbunyi pada (jam mulai - offset) dan hanya dalam masa toleransi', () => {
  const args = { ...base, instances: [inst()], alarms: [alarm()] };
  assert.equal(dueAlarms({ ...args, nowMinutes: at(20, 19) }).length, 0);
  assert.equal(dueAlarms({ ...args, nowMinutes: at(20, 20) }).length, 1);
  assert.equal(dueAlarms({ ...args, nowMinutes: at(20, 29) }).length, 1);
  assert.equal(dueAlarms({ ...args, nowMinutes: at(20, 31) }).length, 0);   // terlalu lama terlewat
});

test('alarm tidak berbunyi dua kali, tidak untuk aktivitas selesai/tersembunyi/hari lain/alarm nonaktif', () => {
  const now = at(20, 25);
  assert.equal(dueAlarms({ ...base, instances: [inst()], alarms: [alarm()], nowMinutes: now, fired: new Set(['i1']) }).length, 0);
  assert.equal(dueAlarms({ ...base, instances: [inst({ status: 'completed' })], alarms: [alarm()], nowMinutes: now }).length, 0);
  assert.equal(dueAlarms({ ...base, instances: [inst({ is_hidden: true })], alarms: [alarm()], nowMinutes: now }).length, 0);
  assert.equal(dueAlarms({ ...base, instances: [inst({ scheduled_date: '2026-11-10' })], alarms: [alarm()], nowMinutes: now }).length, 0);
  assert.equal(dueAlarms({ ...base, instances: [inst()], alarms: [alarm({ enabled: false })], nowMinutes: now }).length, 0);
  assert.equal(dueAlarms({ ...base, instances: [inst({ start_time: null })], alarms: [alarm()], nowMinutes: now }).length, 0);
});

test('snooze: berbunyi lagi setelah waktu tunda, dan tidak sebelumnya', () => {
  const snoozed = new Map([['i1', at(20, 35)]]);
  const args = { ...base, instances: [inst()], alarms: [alarm()], fired: new Set(['i1']), snoozedUntil: snoozed };
  assert.equal(dueAlarms({ ...args, nowMinutes: at(20, 34) }).length, 0);
  const r = dueAlarms({ ...args, nowMinutes: at(20, 35) });
  assert.equal(r.length, 1); assert.equal(r[0].reason, 'snooze');
});

const quest = (o: Partial<Quest> = {}): Quest => ({
  id: 'q1', user_id: null, title: 'Q', description: '', period: 'daily', kind: 'complete_any', area_code: null,
  target: 3, xp_reward: 15, is_active: true, created_at: '2026-01-01T00:00:00Z', ...o,
});

test('periode quest: harian, mingguan (Senin), bulanan, pribadi', () => {
  const today = '2026-11-11'; // Rabu
  assert.equal(periodStart(quest(), today, '2026-01-01'), '2026-11-11');
  assert.equal(periodStart(quest({ period: 'weekly' }), today, '2026-01-01'), '2026-11-09');
  assert.equal(periodStart(quest({ period: 'monthly' }), today, '2026-01-01'), '2026-11-01');
  assert.equal(periodStart(quest({ period: 'personal' }), today, '2026-03-05'), '2026-03-05');
});

test('questView memakai baris periode saat ini, bukan periode lama', () => {
  const rows: UserQuest[] = [
    { id: 'a', quest_id: 'q1', period_start: '2026-11-10', progress: 3, completed_at: 'x' },
    { id: 'b', quest_id: 'q1', period_start: '2026-11-11', progress: 2, completed_at: null },
  ];
  const v = questView(quest(), rows, '2026-11-11', '2026-01-01');
  assert.equal(v.progress, 2); assert.equal(v.done, false); assert.equal(v.pct, 67);
  const none = questView(quest(), rows, '2026-11-12', '2026-01-01');
  assert.equal(none.progress, 0);
});
