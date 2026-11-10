import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useI18n } from '../../i18n';
import { Icon } from '../../components/ui/Icon';
import { dueAlarms, type DueAlarm } from '../../lib/alarms';
import { downloadSound } from '../../lib/api';
import { minutesNowInTz, shortTime } from '../../lib/date';
import { startAlarmSound } from '../../lib/sound';

/** Alarm in-app: aktif selama NEXORA terbuka. Saat tertutup, pengingat berasal dari Web Push (lihat Pengaturan). */
export function AlarmHost() {
  const { data, today, complete } = useApp();
  const { t } = useI18n();
  const [ringing, setRinging] = useState<DueAlarm | null>(null);
  const fired = useRef(new Set<string>());
  const snoozed = useRef(new Map<string, number>());
  const stopSound = useRef<() => void>(() => undefined);
  const soundCache = useRef(new Map<string, string>());
  const ringingRef = useRef<DueAlarm | null>(null);
  ringingRef.current = ringing;
  const tz = data?.profile.timezone ?? 'Asia/Jakarta';

  const stop = useCallback(() => { stopSound.current(); stopSound.current = () => undefined; }, []);

  const ring = useCallback(async (d: DueAlarm) => {
    setRinging(d);
    const settings = data?.settings;
    if (settings?.notify_sound !== false) {
      let url: string | undefined;
      if (d.alarm.sound_type === 'custom' && d.alarm.sound_path) {
        url = soundCache.current.get(d.alarm.sound_path);
        if (!url) {
          try { url = URL.createObjectURL(await downloadSound(d.alarm.sound_path)); soundCache.current.set(d.alarm.sound_path, url); } catch { url = undefined; }
        }
      }
      stop(); stopSound.current = startAlarmSound(url);
    }
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try { new Notification('NEXORA', { body: `${d.instance.title} • ${shortTime(d.instance.start_time)}`, tag: `instance-${d.instance.id}`, icon: '/icons/icon-192.png' }); } catch { /* beberapa browser mobile melarang konstruktor */ }
    }
  }, [data?.settings, stop]);

  useEffect(() => {
    if (!data) return;
    const check = () => {
      if (ringingRef.current) return;
      const due = dueAlarms({
        instances: data.instances, alarms: data.alarms, today, nowMinutes: minutesNowInTz(tz),
        fired: fired.current, snoozedUntil: snoozed.current,
      });
      if (due.length) { const d = due[0]; fired.current.add(d.instance.id); snoozed.current.delete(d.instance.id); void ring(d); }
    };
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [data, today, tz, ring]);

  useEffect(() => () => { stop(); soundCache.current.forEach((u) => URL.revokeObjectURL(u)); }, [stop]);

  if (!ringing) return null;
  const { instance, alarm } = ringing;
  const close = () => { stop(); setRinging(null); };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/70 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
      <div className="w-full max-w-sm card text-center shadow-glow">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 text-accent grid place-items-center animate-pulse"><Icon name="bell" size={28} /></div>
        <p className="text-xs uppercase tracking-widest text-muted mt-4">{t('alarm.title')}</p>
        <h2 id="alarm-title" className="text-xl font-semibold mt-1">{instance.title}</h2>
        <p className="text-sm text-muted mt-1">{shortTime(instance.start_time)}</p>
        <div className="grid gap-2 mt-6">
          <button className="btn-primary" onClick={() => { close(); void complete(instance); }}><Icon name="check" size={18} />{t('activity.complete')}</button>
          <button className="btn-ghost" onClick={() => {
            snoozed.current.set(instance.id, minutesNowInTz(tz) + alarm.snooze_minutes); close();
          }}>{t('alarm.snooze', { n: alarm.snooze_minutes })}</button>
          <button className="btn-ghost" onClick={() => { snoozed.current.delete(instance.id); close(); }}>{t('alarm.dismiss')}</button>
        </div>
      </div>
    </div>
  );
}
