import { useCallback, useEffect, useState } from 'react';
import { useApp, useData } from '../../app/AppContext';
import { useI18n } from '../../i18n';
import { useConfirm, useToast } from '../../components/ui/ui';
import { Icon } from '../../components/ui/Icon';
import * as api from '../../lib/api';
import { currentEndpoint, disablePush, enablePush, notificationPermission, pushSupport } from '../../lib/push';

/** Kartu pengaturan notifikasi push latar belakang. Izin HANYA diminta saat tombol "Aktifkan" diklik. */
export default function PushSettings() {
  const { user, attempt, refresh } = useApp();
  const d = useData();
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = user!.id;
  const support = pushSupport();
  const [devices, setDevices] = useState<api.PushDevice[] | null>(null);
  const [here, setHere] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setDevices(await api.listPushDevices()); } catch { setDevices(null); }
    setHere(await currentEndpoint());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const thisDevice = devices?.find((x) => x.endpoint === here && x.is_active) ?? null;
  const perm = notificationPermission();
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  const run = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); try { await attempt(fn, ok); } finally { setBusy(false); await load(); await refresh(); } };

  return (
    <div className="border-t border-line pt-4" aria-live="polite">
      <p className="font-medium text-sm">{t('settings.push')}</p>
      <p className="text-xs text-muted mt-1">{t(`push.${support}`)}</p>

      {support === 'ok' && (
        <p className="text-xs mt-2">
          <span className="text-muted">{t('push.statusLabel')}: </span>
          <span className={thisDevice ? 'text-good font-medium' : 'font-medium'}>
            {thisDevice ? t('push.statusOn') : perm === 'granted' ? t('push.statusGrantedOff') : t('push.statusOff')}
          </span>
        </p>
      )}
      {support === 'denied' && <p className="text-xs text-warn mt-2" role="alert">{t('push.deniedHelp')}</p>}

      {support === 'ok' && (
        <div className="flex gap-2 flex-wrap mt-3">
          {thisDevice ? (
            <>
              <button className="btn-ghost" disabled={busy} onClick={() => void run(async () => { await disablePush(); await api.updateSettings(uid, { notify_push: false }); }, t('settings.pushOff'))}>{t('settings.pushDisable')}</button>
              <button className="btn-ghost" disabled={busy} onClick={() => void run(async () => {
                const r = await api.sendTestPush();
                toast(r.sent > 0 ? t('push.testSent', { n: r.sent }) : t('push.testFailed'), r.sent > 0 ? 'success' : 'error');
              })}><Icon name="play" size={14} />{t('push.test')}</button>
            </>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => void run(async () => { await enablePush(); await api.updateSettings(uid, { notify_push: true }); }, t('settings.pushOk'))}>
              <Icon name="bell" size={16} />{t('settings.pushEnable')}</button>
          )}
        </div>
      )}

      {devices && devices.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium">{t('push.devices')}</p>
          <ul className="mt-2 space-y-2">
            {devices.map((x) => (
              <li key={x.id} className="rounded-xl border border-line p-2.5 flex items-center gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{x.device_label || t('push.deviceUnknown')}{x.endpoint === here && <span className="text-accent"> • {t('push.thisDevice')}</span>}</p>
                  <p className="text-muted">{x.is_active ? t('push.devActive') : t('push.devInactive')} · {t('push.lastOk')}: {fmt(x.last_success_at)}</p>
                </div>
                <button className="btn-ghost btn-sm" aria-label={t('push.removeDevice')} title={t('push.removeDevice')} disabled={busy}
                  onClick={async () => { if (await confirm({ title: t('push.removeDevice'), message: t('push.removeConfirm'), confirmLabel: t('common.delete'), danger: true })) await run(() => api.removePushDevice(x.id)); }}>
                  <Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted mt-3">{t('settings.pushLimit')}</p>
      <p className="text-xs text-muted mt-1">{t('push.noExact')}</p>
    </div>
  );
}
