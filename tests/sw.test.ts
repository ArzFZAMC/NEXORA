// Menguji logika public/sw.js dengan menjalankannya di sandbox `vm` dengan API service worker tiruan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

type Handler = (e: any) => void;
function load(opts: { clients?: any[]; ua?: string } = {}) {
  const handlers: Record<string, Handler> = {};
  const shown: Array<{ title: string; o: any }> = [];
  const opened: string[] = [];
  const clients = opts.clients ?? [];
  const self: any = {
    location: { origin: 'https://app.example.com' },
    navigator: { userAgent: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/120' },
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    registration: { showNotification: async (title: string, o: any) => { shown.push({ title, o }); } },
    clients: { matchAll: async () => clients, openWindow: async (u: string) => { opened.push(u); }, claim: async () => undefined },
    skipWaiting: async () => undefined,
  };
  const ctx = vm.createContext({ self, URL, caches: {}, fetch: async () => undefined, Promise, console });
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), ctx);
  const fire = async (type: string, e: any) => { let p: Promise<unknown> = Promise.resolve(); e.waitUntil = (x: Promise<unknown>) => { p = x; }; handlers[type](e); await p; };
  return { handlers, shown, opened, fire };
}
const pushEvent = (obj: unknown) => ({ data: { json: () => obj } });

test('hanya SATU service worker: tidak ada registrasi kedua di sw.js dan semua handler terdaftar', () => {
  const { handlers } = load();
  for (const k of ['install', 'activate', 'fetch', 'push', 'notificationclick', 'pushsubscriptionchange']) assert.ok(handlers[k], k);
});
test('push reminder (tab tertutup) menampilkan notifikasi dengan tag & url', async () => {
  const s = load();
  await s.fire('push', pushEvent({ title: 'Olahraga', body: 'Mulai pukul 08:00', tag: 'instance-1', url: '/calendar?date=2030-03-10', kind: 'reminder' }));
  assert.equal(s.shown.length, 1);
  assert.equal(s.shown[0].title, 'Olahraga');
  assert.equal(s.shown[0].o.tag, 'instance-1');
  assert.equal(s.shown[0].o.data.url, '/calendar?date=2030-03-10');
});
test('push reminder saat tab terlihat tidak ditampilkan ganda (non-Apple), tapi percobaan tetap tampil', async () => {
  const posted: unknown[] = [];
  const visible = { visibilityState: 'visible', url: 'https://app.example.com/', postMessage: (m: unknown) => posted.push(m) };
  const s = load({ clients: [visible] });
  await s.fire('push', pushEvent({ title: 'A', kind: 'reminder', url: '/' }));
  assert.equal(s.shown.length, 0); assert.equal(posted.length, 1);
  await s.fire('push', pushEvent({ title: 'Tes', kind: 'test', url: '/settings' }));
  assert.equal(s.shown.length, 1);
});
test('iOS/Safari: selalu tampilkan notifikasi (wajib oleh platform)', async () => {
  const visible = { visibilityState: 'visible', url: 'https://app.example.com/', postMessage: () => undefined };
  const s = load({ clients: [visible], ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605' });
  await s.fire('push', pushEvent({ title: 'A', kind: 'reminder' }));
  assert.equal(s.shown.length, 1);
});
test('payload rusak / bukan JSON tetap menampilkan notifikasi default', async () => {
  const s = load();
  await s.fire('push', { data: { json: () => { throw new Error('bad'); } } });
  assert.equal(s.shown[0].title, 'NEXORA');
  const s2 = load(); await s2.fire('push', {});
  assert.equal(s2.shown.length, 1);
});
test('URL eksternal / berbahaya di payload dinetralkan ke "/"', async () => {
  for (const bad of ['https://evil.com/x', 'javascript:alert(1)', '//evil.com', 'data:text/html,x']) {
    const s = load();
    await s.fire('push', pushEvent({ title: 'x', url: bad }));
    assert.equal(s.shown[0].o.data.url, '/', bad);
  }
});
test('payload dibatasi panjangnya', async () => {
  const s = load();
  await s.fire('push', pushEvent({ title: 'T'.repeat(500), body: 'B'.repeat(900), tag: 'g'.repeat(500) }));
  assert.ok(s.shown[0].title.length <= 100 && s.shown[0].o.body.length <= 200 && s.shown[0].o.tag.length <= 80);
});
test('notificationclick: tidak ada jendela -> openWindow ke URL internal', async () => {
  const s = load(); let closed = false;
  await s.fire('notificationclick', { notification: { close: () => { closed = true; }, data: { url: '/calendar?date=2030-03-10' } } });
  assert.ok(closed); assert.deepEqual(s.opened, ['/calendar?date=2030-03-10']);
});
test('notificationclick: jendela ada -> navigate + focus, tidak buka jendela baru', async () => {
  const calls: string[] = [];
  const win = { url: 'https://app.example.com/today', navigate: async (u: string) => { calls.push('nav:' + u); }, focus: async () => { calls.push('focus'); } };
  const s = load({ clients: [win] });
  await s.fire('notificationclick', { notification: { close: () => undefined, data: { url: '/calendar?date=2030-03-10' } } });
  assert.deepEqual(calls, ['nav:/calendar?date=2030-03-10', 'focus']); assert.equal(s.opened.length, 0);
});
test('notificationclick dengan URL eksternal tetap diarahkan ke "/"', async () => {
  const s = load();
  await s.fire('notificationclick', { notification: { close: () => undefined, data: { url: 'https://evil.com' } } });
  assert.deepEqual(s.opened, ['/']);
});
test('pushsubscriptionchange memberi tahu klien untuk berlangganan ulang', async () => {
  const posted: any[] = [];
  const s = load({ clients: [{ postMessage: (m: unknown) => posted.push(m) }] });
  await s.fire('pushsubscriptionchange', {});
  assert.equal(posted[0].type, 'nexora-push-resubscribe');
});
