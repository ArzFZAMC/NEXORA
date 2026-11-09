import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import * as api from '../lib/api';
import { ApiError } from '../lib/api';
import { addDays, todayInTz, type ISODate } from '../lib/date';
import { idbGet, idbSet, idbOutboxStorage } from '../lib/idb';
import { Outbox } from '../lib/outbox';
import { I18nProvider, translate, type Lang } from '../i18n';
import { ConfirmProvider, useToast } from '../components/ui/ui';
import type { Achievement, Instance, LifeArea } from '../lib/types';
import type { UserBundle } from '../lib/api';
import { xpForDifficulty } from '../lib/gamification';

export interface AppUser { id: string; email: string }

interface Data extends UserBundle { instances: Instance[]; areas: LifeArea[]; achievementDefs: Achievement[] }

export interface AppState {
  status: 'booting' | 'signed-out' | 'loading' | 'ready' | 'error';
  error: string | null;
  user: AppUser | null;
  data: Data | null;
  today: ISODate;
  windowFrom: ISODate;
  windowTo: ISODate;
  online: boolean;
  pending: number;
  refresh: () => Promise<void>;
  complete: (i: Instance) => Promise<void>;
  skip: (i: Instance) => Promise<void>;
  saveNotes: (i: Instance, notes: string) => Promise<void>;
  reschedule: (i: Instance, date: ISODate, start: string | null, end: string | null) => Promise<boolean>;
  removeInstance: (i: Instance) => Promise<boolean>;
  /** Menjalankan aksi API; error ditampilkan sebagai toast dan mengembalikan false. */
  attempt: <T>(fn: () => Promise<T>, okMessage?: string) => Promise<T | undefined>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
export { Ctx as AppContext };
export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp harus dipakai di dalam AppProvider');
  return v;
}
export function useData(): Data {
  const { data } = useApp();
  if (!data) throw new Error('Data belum siap');
  return data;
}

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
/** Mencegah loading tanpa ujung: bila server tidak menjawab, tampilkan pesan error yang bisa dicoba ulang. */
const withTimeout = <T,>(p: Promise<T>, ms = 25_000): Promise<T> => Promise.race([
  p, new Promise<T>((_, reject) => setTimeout(() => reject(new ApiError('Server tidak merespons. Periksa VITE_SUPABASE_URL, koneksi internet, dan pastikan project Supabase tidak sedang di-pause.')), ms)),
]);
const PAST_DAYS = 60;
const FUTURE_DAYS = 90;

export function AppProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [status, setStatus] = useState<AppState['status']>('booting');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [today, setToday] = useState<ISODate>(todayInTz(deviceTz()));
  const outboxRef = useRef<Outbox | null>(null);
  const staticRef = useRef<{ areas: LifeArea[]; achievements: Achievement[] } | null>(null);
  const loadingRef = useRef(false);
  const lang: Lang = data?.profile.language ?? 'id';
  const t = useCallback((k: string, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);

  const user = useMemo<AppUser | null>(() => (session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null), [session]);

  // ---------------------------------------------------------------- sesi
  useEffect(() => {
    if (!isConfigured) { setSession(null); setStatus('signed-out'); return; }
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ---------------------------------------------------------------- tema
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    const apply = () => {
      const pref = data.settings.theme;
      const theme = pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
      root.dataset.theme = theme; root.dataset.accent = data.settings.accent; root.lang = data.profile.language;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080b14' : '#f4f6fb');
    };
    apply();
    if (data.settings.theme === 'system') {
      const mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [data?.settings.theme, data?.settings.accent, data?.profile.language]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- muat data
  const load = useCallback(async (uid: string, quiet: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!quiet) setStatus('loading');
    try {
      if (!staticRef.current) staticRef.current = await withTimeout(api.loadStatic());
      let bundle: UserBundle; let instances: Instance[]; let tdy: ISODate;
      try {
        await withTimeout(api.syncSchedule(60)).catch((e) => { if (!(api.toApiError(e).network)) throw e; });
        const first = todayInTz(data?.profile.timezone ?? deviceTz());
        bundle = await withTimeout(api.loadUserBundle(uid, first));
        tdy = todayInTz(bundle.profile.timezone);
        instances = await withTimeout(api.fetchInstances(addDays(tdy, -PAST_DAYS), addDays(tdy, FUTURE_DAYS)));
        void idbSet(`cache:${uid}`, { bundle, instances, at: Date.now() });
      } catch (e) {
        const ae = api.toApiError(e);
        const cached = ae.network ? await idbGet<{ bundle: UserBundle; instances: Instance[] }>(`cache:${uid}`) : undefined;
        if (!cached) throw ae;
        bundle = cached.bundle; instances = cached.instances; tdy = todayInTz(bundle.profile.timezone);
        toast(translate(bundle.profile.language, 'app.offlineCache'), 'info');
      }
      setToday(tdy);
      setData({ ...bundle, instances, areas: staticRef.current.areas, achievementDefs: staticRef.current.achievements });
      setError(null); setStatus('ready');
    } catch (e) {
      const ae = api.toApiError(e);
      if (ae.code === '28000') { await api.signOut(); return; }
      setError(ae.message);
      if (!quiet || !data) setStatus('error');
    } finally { loadingRef.current = false; }
  }, [data?.profile.timezone, toast]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- antrean offline
  const flush = useCallback(async () => {
    const box = outboxRef.current; if (!box) return;
    if ((await box.size()) === 0) { setPending(0); return; }
    const report = await box.flush(async (op) => {
      try {
        if (op.type === 'complete') await api.completeInstance(op.instanceId);
        else if (op.type === 'skip') await api.skipInstance(op.instanceId);
        else await api.updateNotes(op.instanceId, op.payload?.notes ?? '');
        return { outcome: 'ok' as const };
      } catch (e) {
        const ae = api.toApiError(e);
        return ae.network ? { outcome: 'network-error' as const } : { outcome: 'rejected' as const, reason: ae.message };
      }
    });
    setPending(report.remaining);
    if (report.sent > 0) toast(t('app.synced', { n: report.sent }), 'success');
    if (report.rejected.length > 0) toast(t('app.syncRejected', { n: report.rejected.length }), 'error');
  }, [t, toast]);

  useEffect(() => {
    if (!user) { outboxRef.current = null; setData(null); setStatus(session === undefined ? 'booting' : 'signed-out'); return; }
    outboxRef.current = new Outbox(idbOutboxStorage(user.id));
    void outboxRef.current.size().then(setPending);
    void (async () => { await flush(); await load(user.id, false); })();
  }, [user?.id, session === undefined]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !online) return;
    void (async () => { await flush(); await load(user.id, true); })();
  }, [online]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- realtime lintas perangkat + pergantian hari
  useEffect(() => {
    if (!user || status !== 'ready') return;
    let timer: number | undefined;
    const reload = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(user.id, true), 800); };
    const ch = supabase.channel(`nexora-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_instances', filter: `user_id=eq.${user.id}` }, reload)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    const tick = window.setInterval(() => {
      const tdy = todayInTz(data?.profile.timezone ?? deviceTz());
      setToday((cur) => { if (cur !== tdy) reload(); return cur; });
    }, 60_000);
    return () => { window.clearTimeout(timer); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(tick); };
  }, [user?.id, status]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- aksi
  const patchInstance = useCallback((id: string, patch: Partial<Instance>) => {
    setData((d) => (d ? { ...d, instances: d.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : d));
  }, []);

  const attempt = useCallback(async <T,>(fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> => {
    try { const r = await fn(); if (okMessage) toast(okMessage, 'success'); return r; }
    catch (e) { toast(api.toApiError(e).message, 'error'); return undefined; }
  }, [toast]);

  const refresh = useCallback(async () => { if (user) await load(user.id, true); }, [user, load]);

  const complete = useCallback(async (i: Instance) => {
    if (i.status === 'completed') return;
    const prev = { status: i.status, completed_at: i.completed_at };
    patchInstance(i.id, { status: 'completed', completed_at: new Date().toISOString() });
    try {
      const r = await api.completeInstance(i.id);
      toast(r.xp_awarded > 0 ? t('app.xpGained', { xp: r.xp_awarded }) : t('app.done'), 'success');
      await refresh();
    } catch (e) {
      const ae = api.toApiError(e);
      if (ae.network && outboxRef.current) {
        await outboxRef.current.enqueue('complete', i.id); setPending(await outboxRef.current.size());
        toast(t('app.queued', { xp: xpForDifficulty(i.difficulty) }), 'info');
      } else { patchInstance(i.id, prev); toast(ae.message, 'error'); }
    }
  }, [patchInstance, refresh, t, toast]);

  const skip = useCallback(async (i: Instance) => {
    const prev = i.status; patchInstance(i.id, { status: 'skipped' });
    try { await api.skipInstance(i.id); await refresh(); }
    catch (e) {
      const ae = api.toApiError(e);
      if (ae.network && outboxRef.current) { await outboxRef.current.enqueue('skip', i.id); setPending(await outboxRef.current.size()); toast(t('app.queuedPlain'), 'info'); }
      else { patchInstance(i.id, { status: prev }); toast(ae.message, 'error'); }
    }
  }, [patchInstance, refresh, t, toast]);

  const saveNotes = useCallback(async (i: Instance, notes: string) => {
    patchInstance(i.id, { notes });
    try { await api.updateNotes(i.id, notes); }
    catch (e) {
      const ae = api.toApiError(e);
      if (ae.network && outboxRef.current) { await outboxRef.current.enqueue('notes', i.id, { notes }); setPending(await outboxRef.current.size()); toast(t('app.queuedPlain'), 'info'); }
      else { patchInstance(i.id, { notes: i.notes }); toast(ae.message, 'error'); }
    }
  }, [patchInstance, t, toast]);

  const reschedule = useCallback(async (i: Instance, date: ISODate, start: string | null, end: string | null) => {
    const r = await attempt(() => api.rescheduleInstance(i.id, date, start, end), t('app.rescheduled'));
    if (r) await refresh();
    return !!r;
  }, [attempt, refresh, t]);

  const removeInstance = useCallback(async (i: Instance) => {
    const ok = await attempt(() => api.deleteInstance(i.id).then(() => true), t('app.deleted'));
    if (ok) await refresh();
    return !!ok;
  }, [attempt, refresh, t]);

  const signOut = useCallback(async () => { await api.signOut(); }, []);

  const value = useMemo<AppState>(() => ({
    status, error, user, data, today, online, pending, refresh, complete, skip, saveNotes, reschedule, removeInstance, attempt, signOut,
    windowFrom: addDays(today, -PAST_DAYS), windowTo: addDays(today, FUTURE_DAYS),
  }), [status, error, user, data, today, online, pending, refresh, complete, skip, saveNotes, reschedule, removeInstance, attempt, signOut]);

  return (
    <Ctx.Provider value={value}>
      <I18nProvider lang={lang}><ConfirmProvider>{children}</ConfirmProvider></I18nProvider>
    </Ctx.Provider>
  );
}

export { ApiError };
