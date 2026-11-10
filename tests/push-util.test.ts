import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlBase64ToUint8Array, sameKey, deviceLabel, computeSupport, parseDateParam, type Env } from '../src/lib/pushUtil.ts';

const base: Env = { hasSW: true, hasPush: true, hasNotification: true, permission: 'default', ua: 'Mozilla/5.0 (X11; Linux) Chrome/120', secure: true, hasKey: true };

test('urlBase64ToUint8Array: base64url tanpa padding', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255]);
});
test('sameKey', () => {
  const k = new Uint8Array([1, 2, 3]);
  assert.equal(sameKey(k.buffer, new Uint8Array([1, 2, 3])), true);
  assert.equal(sameKey(k.buffer, new Uint8Array([1, 2, 4])), false);
  assert.equal(sameKey(null, k), false);
});
test('deviceLabel', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile'), 'Chrome di Android');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/605'), 'Safari di iOS');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10) Chrome/120 Edg/120'), 'Edge di Windows');
});
test('computeSupport: semua cabang', () => {
  assert.equal(computeSupport(base), 'ok');
  assert.equal(computeSupport({ ...base, secure: false }), 'insecure');
  assert.equal(computeSupport({ ...base, hasPush: false }), 'unsupported');
  assert.equal(computeSupport({ ...base, hasPush: false, ua: 'iPhone Safari' }), 'ios-needs-install');
  assert.equal(computeSupport({ ...base, hasKey: false }), 'no-key');
  assert.equal(computeSupport({ ...base, permission: 'denied' }), 'denied');
});
test('parseDateParam menolak input tidak valid', () => {
  assert.equal(parseDateParam('2030-03-10'), '2030-03-10');
  for (const v of [null, '', '2030-13-40', 'x', '../etc', '2030-3-1']) assert.equal(parseDateParam(v), null);
});
