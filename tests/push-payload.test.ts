import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, reminderPayload, testPayload, classifyPushError, safeEqual } from '../supabase/functions/_shared/payload.ts';

const row = { d_instance_id: 'dddddddd-0000-4000-8000-0000000000d1', d_scheduled_date: '2030-03-10', d_title: 'Olahraga pagi', d_start_time: '08:00:00', d_fire_at: '2030-03-10T00:55:00Z' };

test('reminderPayload: judul, jam, tag stabil, deep link ke kalender', () => {
  const p = reminderPayload(row);
  assert.equal(p.title, 'Olahraga pagi');
  assert.equal(p.body, 'Mulai pukul 08:00');
  assert.equal(p.tag, 'instance-dddddddd-0000-4000-8000-0000000000d1');
  assert.equal(p.url, '/calendar?date=2030-03-10&i=dddddddd-0000-4000-8000-0000000000d1');
  assert.equal(p.kind, 'reminder');
});
test('reminderPayload: data tidak valid tidak menghasilkan URL berbahaya', () => {
  const p = reminderPayload({ ...row, d_scheduled_date: 'javascript:alert(1)', d_instance_id: '../../x' });
  assert.equal(p.url, '/');
  assert.equal(p.tag, 'nexora-reminder');
});
test('clean: buang karakter kontrol & potong panjang', () => {
  assert.equal(clean('a\u0000b\nc', 10), 'a b c');
  assert.equal(clean('x'.repeat(200), 80).length, 80);
  assert.equal(clean(null, 5), '');
});
test('judul kosong jatuh ke NEXORA; payload kecil', () => {
  assert.equal(reminderPayload({ ...row, d_title: '   ' }).title, 'NEXORA');
  assert.ok(JSON.stringify(reminderPayload({ ...row, d_title: 'x'.repeat(5000) })).length < 600);
});
test('testPayload selalu ke /settings', () => { assert.equal(testPayload().url, '/settings'); assert.equal(testPayload().kind, 'test'); });
test('classifyPushError: 404/410 expired, lainnya failed', () => {
  assert.equal(classifyPushError(410), 'expired'); assert.equal(classifyPushError(404), 'expired');
  for (const c of [400, 401, 413, 429, 500, 503, undefined]) assert.equal(classifyPushError(c), 'failed');
});
test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true); assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false); assert.equal(safeEqual('', 'x'), false);
});
