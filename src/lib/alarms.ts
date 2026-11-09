// Mesin alarm (hanya aktif saat aplikasi terbuka). Fungsi murni agar mudah diuji.
// Saat browser/tab ditutup, JavaScript tidak berjalan: pengingat dikirim backend lewat Web Push (docs/NOTIFICATIONS.md).
import { timeToMinutes, type ISODate } from './date';
import type { AlarmRow, Instance } from './types';

export interface DueAlarm { instance: Instance; alarm: AlarmRow; reason: 'start' | 'snooze' }

export const ALARM_GRACE_MINUTES = 10;   // alarm yang terlewat lebih dari ini tidak dibunyikan (mis. app baru dibuka)

export function dueAlarms(opts: {
  instances: Instance[]; alarms: AlarmRow[]; today: ISODate; nowMinutes: number;
  fired: ReadonlySet<string>; snoozedUntil: ReadonlyMap<string, number>;
}): DueAlarm[] {
  const byTemplate = new Map(opts.alarms.filter((a) => a.enabled).map((a) => [a.template_id, a]));
  const out: DueAlarm[] = [];
  for (const i of opts.instances) {
    if (i.scheduled_date !== opts.today || i.status !== 'planned' || i.is_hidden || !i.start_time || !i.template_id) continue;
    const alarm = byTemplate.get(i.template_id);
    if (!alarm) continue;
    const snooze = opts.snoozedUntil.get(i.id);
    if (snooze !== undefined) {
      if (opts.nowMinutes >= snooze) out.push({ instance: i, alarm, reason: 'snooze' });
      continue;
    }
    if (opts.fired.has(i.id)) continue;
    const trigger = timeToMinutes(i.start_time) - alarm.offset_minutes;
    if (trigger < 0) continue;   // pengingat jatuh pada hari sebelumnya: ditangani push, bukan alarm in-app
    if (opts.nowMinutes >= trigger && opts.nowMinutes - trigger <= ALARM_GRACE_MINUTES) out.push({ instance: i, alarm, reason: 'start' });
  }
  return out;
}
