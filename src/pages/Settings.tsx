import { useMemo, useRef, useState } from 'react';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { PageHeader, Segmented, useConfirm, useToast } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import * as api from '../lib/api';
import { parseBackup, backupFilename, type BackupSummary } from '../lib/backup';
import PushSettings from '../features/notifications/PushSettings';
import { playTestTone } from '../lib/sound';
import type { AccentName, Preset, ThemeName } from '../lib/types';

const ACCENTS: Array<{ id: AccentName; color: string }> = [
  { id: 'electric-blue', color: '#2979ff' }, { id: 'violet', color: '#8b5cf6' }, { id: 'emerald', color: '#10b981' }, { id: 'amber', color: '#f59e0b' }, { id: 'rose', color: '#f43f5e' },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="card"><h2 className="font-display text-lg font-semibold">{title}</h2>{hint && <p className="text-sm text-muted mt-1">{hint}</p>}<div className="mt-4 space-y-4">{children}</div></section>;
}

export default function Settings() {
  const { user, today, attempt, refresh, signOut } = useApp();
  const d = useData();
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const uid = user!.id;
  const [name, setName] = useState(d.profile.display_name);
  const [tz, setTz] = useState(d.profile.timezone);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [restore, setRestore] = useState<{ data: Record<string, unknown>; summary: BackupSummary } | null>(null);
  const [restoreErr, setRestoreErr] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); } catch { return ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC']; } }, []);

  const save = async (fn: () => Promise<void>) => { await attempt(fn, t('settings.saved')); await refresh(); };

  return (
    <div>
      <PageHeader title={t('nav.settings')} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Section title={t('settings.profile')}>
          <div><label className="label" htmlFor="s-name">{t('auth.displayName')}</label><input id="s-name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label" htmlFor="s-tz">{t('settings.timezone')}</label>
            <select id="s-tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
            <p className="text-xs text-muted mt-1">{t('settings.timezoneHint')}</p></div>
          <div><label className="label" htmlFor="s-lang">{t('settings.language')}</label>
            <select id="s-lang" className="input" value="id" onChange={() => undefined}><option value="id">Bahasa Indonesia</option><option value="en" disabled>English — {t('settings.soon')}</option></select></div>
          <button className="btn-primary" disabled={name === d.profile.display_name && tz === d.profile.timezone}
            onClick={() => void save(() => api.updateProfile(uid, { display_name: name.trim(), timezone: tz }))}>{t('common.save')}</button>
        </Section>

        <Section title={t('settings.appearance')}>
          <div><p className="label">{t('settings.theme')}</p><Segmented<ThemeName> label={t('settings.theme')} value={d.settings.theme}
            onChange={(v) => void save(() => api.updateSettings(uid, { theme: v }))} options={(['dark', 'light', 'system'] as ThemeName[]).map((v) => ({ value: v, label: t(`theme.${v}`) }))} /></div>
          <div><p className="label">{t('settings.accent')}</p>
            <div className="flex gap-2.5 flex-wrap" role="radiogroup" aria-label={t('settings.accent')}>
              {ACCENTS.map((a) => (<button key={a.id} role="radio" aria-checked={d.settings.accent === a.id} aria-label={t(`accent.${a.id}`)} title={t(`accent.${a.id}`)}
                onClick={() => void save(() => api.updateSettings(uid, { accent: a.id }))}
                className={`w-11 h-11 rounded-full border-2 transition ${d.settings.accent === a.id ? 'border-ink scale-110' : 'border-transparent'}`} style={{ background: a.color }} />))}
            </div></div>
          <div><p className="label">{t('settings.layout')}</p><Segmented<Preset> label={t('settings.layout')} value={d.layout.preset}
            onChange={(v) => void save(() => api.saveLayout(uid, v))} options={(['compact', 'balanced', 'focus'] as Preset[]).map((v) => ({ value: v, label: t(`preset.${v}`) }))} />
            <p className="text-xs text-muted mt-2">{t(`preset.${d.layout.preset}Hint`)}</p></div>
        </Section>

        <Section title={t('settings.notifications')} hint={t('settings.notificationsHint')}>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer"><input type="checkbox" className="w-5 h-5 accent-[rgb(var(--accent))]" checked={d.settings.notify_sound}
            onChange={(e) => void save(() => api.updateSettings(uid, { notify_sound: e.target.checked }))} /><span className="text-sm">{t('settings.soundOn')}</span></label>
          <div className="flex gap-2 flex-wrap items-center"><button className="btn-ghost btn-sm" onClick={() => { if (!playTestTone()) toast(t('settings.soundBlocked'), 'error'); }}><Icon name="play" size={14} />{t('settings.testSound')}</button>
            <span className="text-xs text-muted">{t('settings.testSoundHint')}</span></div>
          <PushSettings />
        </Section>

        <Section title={t('settings.backup')} hint={t('settings.backupHint')}>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-primary" onClick={async () => {
              const data = await attempt(() => api.exportData()); if (!data) return;
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
              const a = document.createElement('a'); a.href = url; a.download = backupFilename(today); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast(t('settings.exported'), 'success');
            }}><Icon name="download" size={16} />{t('settings.export')}</button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />{t('settings.restore')}</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              setRestoreErr(null); setRestore(null);
              const res = parseBackup(await f.text());
              if (res.ok) setRestore({ data: res.data, summary: res.summary }); else setRestoreErr(res.errors);
            }} />
          </div>
          {restoreErr && <div className="rounded-xl border border-bad/40 p-3 text-sm" role="alert"><p className="font-medium text-bad">{t('settings.restoreInvalid')}</p><ul className="list-disc pl-5 mt-1 text-xs text-muted">{restoreErr.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
          {restore && (
            <div className="rounded-xl border border-warn/40 p-3 space-y-3">
              <p className="text-sm">{t('settings.restoreSummary', { templates: restore.summary.templates, instances: restore.summary.instances, completed: restore.summary.completed })}</p>
              <p className="text-xs text-warn">{t('settings.restoreWarn')}</p>
              <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setRestore(null)}>{t('common.cancel')}</button>
                <button className="btn-danger btn-sm" onClick={async () => {
                  if (!(await confirm({ title: t('settings.restoreConfirmTitle'), message: t('settings.restoreConfirmMsg'), confirmLabel: t('settings.restoreNow'), danger: true }))) return;
                  const r = await attempt(() => api.restoreData(restore.data), t('settings.restored')); if (r) { setRestore(null); await refresh(); } }}>{t('settings.restoreNow')}</button></div>
            </div>)}
        </Section>

        <Section title={t('settings.security')}>
          <p className="text-sm text-muted">{user?.email}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label" htmlFor="s-pw">{t('settings.newPassword')}</label><input id="s-pw" type="password" autoComplete="new-password" className="input" maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div><label className="label" htmlFor="s-pw2">{t('settings.confirmPassword')}</label><input id="s-pw2" type="password" autoComplete="new-password" className="input" maxLength={72} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          </div>
          {pw && pw.length < 8 && <p className="text-xs text-bad">{t('auth.errPassword')}</p>}
          {pw2 && pw !== pw2 && <p className="text-xs text-bad">{t('settings.pwMismatch')}</p>}
          <button className="btn-primary" disabled={pw.length < 8 || pw !== pw2} onClick={async () => { const ok = await attempt(() => api.changePassword(pw).then(() => true), t('settings.pwChanged')); if (ok) { setPw(''); setPw2(''); } }}>{t('settings.changePassword')}</button>
          <div className="border-t border-line pt-4 flex gap-2 flex-wrap">
            <button className="btn-ghost" onClick={() => void signOut()}><Icon name="logout" size={16} />{t('auth.signOut')}</button>
            <button className="btn-danger" onClick={async () => { if (await confirm({ title: t('settings.signOutAllTitle'), message: t('settings.signOutAllMsg'), confirmLabel: t('settings.signOutAll'), danger: true })) await api.signOutEverywhere(); }}>{t('settings.signOutAll')}</button>
          </div>
        </Section>
      </div>
    </div>
  );
}
