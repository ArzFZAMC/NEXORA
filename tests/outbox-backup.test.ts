import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Outbox, MemoryOutboxStorage } from '../src/lib/outbox';
import { validateBackup, parseBackup } from '../src/lib/backup';

test('outbox: aksi yang sama untuk instance yang sama digabung', async () => {
  const box = new Outbox(new MemoryOutboxStorage(), () => 1);
  await box.enqueue('complete', 'i1');
  await box.enqueue('complete', 'i1');
  await box.enqueue('notes', 'i1', { notes: 'a' });
  await box.enqueue('notes', 'i1', { notes: 'b' });
  const ops = await box.list();
  assert.equal(ops.length, 2);
  assert.equal(ops.find((o) => o.type === 'notes')?.payload?.notes, 'b');
});

test('outbox: complete mengalahkan skip, skip diabaikan jika complete menunggu', async () => {
  const box = new Outbox(new MemoryOutboxStorage());
  await box.enqueue('skip', 'i1');
  await box.enqueue('complete', 'i1');
  assert.deepEqual((await box.list()).map((o) => o.type), ['complete']);
  await box.enqueue('skip', 'i1');
  assert.deepEqual((await box.list()).map((o) => o.type), ['complete']);
});

test('outbox flush: sukses dibuang, network error menghentikan & menyisakan antrean', async () => {
  const box = new Outbox(new MemoryOutboxStorage());
  await box.enqueue('complete', 'a');
  await box.enqueue('complete', 'b');
  await box.enqueue('complete', 'c');
  const calls: string[] = [];
  const report = await box.flush(async (op) => {
    calls.push(op.instanceId);
    return op.instanceId === 'b' ? { outcome: 'network-error' as const } : { outcome: 'ok' as const };
  });
  assert.deepEqual(calls, ['a', 'b']);            // berhenti di b
  assert.equal(report.sent, 1);
  assert.equal(report.remaining, 2);
  assert.deepEqual((await box.list()).map((o) => o.instanceId), ['b', 'c']);
});

test('outbox flush: aksi yang ditolak server dilaporkan dan dibuang', async () => {
  const box = new Outbox(new MemoryOutboxStorage());
  await box.enqueue('skip', 'x');
  const report = await box.flush(async () => ({ outcome: 'rejected' as const, reason: 'sudah selesai' }));
  assert.equal(report.rejected.length, 1);
  assert.equal(report.rejected[0].reason, 'sudah selesai');
  assert.equal(await box.size(), 0);
});

test('outbox flush idempoten: mengirim ulang setelah sukses tidak mengirim apa pun', async () => {
  const box = new Outbox(new MemoryOutboxStorage());
  await box.enqueue('complete', 'a');
  await box.flush(async () => ({ outcome: 'ok' as const }));
  let n = 0;
  await box.flush(async () => { n++; return { outcome: 'ok' as const }; });
  assert.equal(n, 0);
});

const UUID1 = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const goodBackup = () => ({
  app: 'nexora', version: 1, exported_at: '2026-11-08T00:00:00Z',
  templates: [{ id: UUID1, title: 'Belajar', recurrence_type: 'daily', difficulty: 'normal', start_date: '2026-01-01' }],
  instances: [
    { id: UUID2, template_id: UUID1, scheduled_date: '2026-01-02', status: 'completed', completed_at: '2026-01-02T13:00:00Z' },
  ],
  alarms: [], rest_days: [], schedules: [], personal_quests: [],
});

test('backup: file valid diterima dan diringkas', () => {
  const v = validateBackup(goodBackup());
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.summary.templates, 1); assert.equal(v.summary.completed, 1); }
});

test('backup: menolak file asing, versi salah, status tidak valid, duplikat, rujukan template hilang', () => {
  assert.equal(validateBackup({ app: 'lain', version: 1 }).ok, false);
  assert.equal(validateBackup({ ...goodBackup(), version: 99 }).ok, false);
  const bad = goodBackup(); (bad.instances[0] as Record<string, unknown>).status = 'done';
  assert.equal(validateBackup(bad).ok, false);
  const dup = goodBackup(); dup.instances.push({ ...dup.instances[0], id: '33333333-3333-4333-8333-333333333333' });
  const r = validateBackup(dup);
  assert.equal(r.ok, false);
  const orphan = goodBackup(); (orphan.instances[0] as Record<string, unknown>).template_id = '44444444-4444-4444-8444-444444444444';
  assert.equal(validateBackup(orphan).ok, false);
  assert.equal(parseBackup('{bukan json').ok, false);
});
