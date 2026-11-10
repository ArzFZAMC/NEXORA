// Seluruh komunikasi dengan Supabase ada di sini. Komponen UI tidak memanggil supabase langsung.
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from './supabase';
import type {
  AlarmRow, Achievement, AccentName, DailyStat, Instance, LifeArea, Layout, Preset, Profile, Progress, Quest,
  RestDay, ScheduleVersion, Settings, Template, ThemeName, UserAchievement, UserQuest,
} from './types';
import type { Attribute } from './gamification';
import { addDays, type ISODate } from './date';

export class ApiError extends Error {
  constructor(message: string, public readonly network = false, public readonly code?: string) { super(message); }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = e as Partial<PostgrestError> & { message?: string; name?: string };
  const msg = String(err?.message ?? 'Terjadi kesalahan');
  const network = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|network request failed|load failed/i.test(msg) || err?.name === 'TypeError';
  if (network) return new ApiError('Tidak ada koneksi ke server.', true);
  if (err?.code === '23505') return new ApiError('Data yang sama sudah ada (duplikat).', false, err.code);
  if (err?.code === '42501') return new ApiError('Akses ditolak database (42501). Jalankan migrasi supabase/migrations/0005_grants.sql di SQL Editor (lihat README).', false, err.code);
  if (err?.code === '28000' || /jwt|not authenticated/i.test(msg)) return new ApiError('Sesi berakhir. Silakan masuk lagi.', false, '28000');
  return new ApiError(msg, false, err?.code);
}

async function run<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  try {
    const { data, error } = await p;
    if (error) throw error;
    return data as T;
  } catch (e) { throw toApiError(e); }
}

// ------------------------------------------------------------------ data referensi & pengguna
export async function loadStatic(): Promise<{ areas: LifeArea[]; achievements: Achievement[] }> {
  const [areas, achievements] = await Promise.all([
    run<LifeArea[]>(supabase.from('life_areas').select('*').order('sort_order')),
    run<Achievement[]>(supabase.from('achievements').select('*').order('sort_order')),
  ]);
  return { areas, achievements };
}

export interface UserBundle {
  profile: Profile; settings: Settings; layout: Layout;
  templates: Template[]; alarms: AlarmRow[]; restDays: RestDay[]; quests: Quest[]; userQuests: UserQuest[];
  userAchievements: UserAchievement[]; stats: DailyStat[]; progress: Progress; attributes: Partial<Record<Attribute, number>>;
  schedules: ScheduleVersion[];
}

export async function loadUserBundle(uid: string, today: ISODate): Promise<UserBundle> {
  const statsFrom = addDays(today, -120);
  const [profile, settings, layout, templates, alarms, restDays, quests, userQuests, userAchievements, stats, progress, attributes, schedules] =
    await Promise.all([
      run<Profile>(supabase.from('profiles').select('*').eq('id', uid).single()),
      run<Settings>(supabase.from('user_settings').select('*').eq('user_id', uid).single()),
      run<Layout>(supabase.from('dashboard_layouts').select('*').eq('user_id', uid).single()),
      run<Template[]>(supabase.from('activity_templates').select('*').order('created_at')),
      run<AlarmRow[]>(supabase.from('alarms').select('*')),
      run<RestDay[]>(supabase.from('rest_days').select('id, rest_date, reason').order('rest_date')),
      run<Quest[]>(supabase.from('quests').select('*').eq('is_active', true).order('created_at')),
      run<UserQuest[]>(supabase.from('user_quests').select('id, quest_id, period_start, progress, completed_at')
        .order('period_start', { ascending: false }).limit(1000)),
      run<UserAchievement[]>(supabase.from('user_achievements').select('achievement_id, unlocked_at')),
      run<DailyStat[]>(supabase.from('daily_statistics').select('stat_date, planned, completed, skipped, missed, xp_earned, is_rest_day, by_area')
        .gte('stat_date', statsFrom).order('stat_date')),
      run<Progress>(supabase.rpc('get_progress')),
      run<Partial<Record<Attribute, number>>>(supabase.rpc('get_attributes')),
      run<ScheduleVersion[]>(supabase.from('schedules').select('*').order('created_at', { ascending: false })),
    ]);
  return { profile, settings, layout, templates, alarms, restDays, quests, userQuests, userAchievements, stats, progress, attributes, schedules };
}

export async function fetchInstances(from: ISODate, to: ISODate): Promise<Instance[]> {
  return run<Instance[]>(supabase.from('activity_instances').select('*').eq('is_hidden', false)
    .gte('scheduled_date', from).lte('scheduled_date', to)
    .order('scheduled_date').order('start_time', { nullsFirst: false }).limit(2000));
}

export async function syncSchedule(days = 60): Promise<void> {
  await run(supabase.rpc('sync_schedule', { p_days: days }));
}

// ------------------------------------------------------------------ aktivitas (template + instance + alarm)
export interface ActivityInput {
  title: string; description: string; life_area_id: number; difficulty: string;
  start_time: string | null; end_time: string | null;
  recurrence_type: string; recurrence_days: number[]; day_of_month: number | null;
  start_date: ISODate; end_date: ISODate | null;
  alarm: null | { offset_minutes: number; sound_type: 'default' | 'custom'; sound_path: string | null; snooze_minutes: number };
}

export async function saveActivity(uid: string, input: ActivityInput, existing: Template | null, today: ISODate): Promise<string> {
  const row = {
    title: input.title.trim(), description: input.description.trim(), life_area_id: input.life_area_id,
    difficulty: input.difficulty, start_time: input.start_time, end_time: input.end_time,
    recurrence_type: input.recurrence_type,
    recurrence_days: input.recurrence_type === 'weekly' || input.recurrence_type === 'custom' ? input.recurrence_days : [],
    day_of_month: input.recurrence_type === 'monthly' ? input.day_of_month : null,
    start_date: input.start_date, end_date: input.recurrence_type === 'none' ? null : input.end_date,
    is_active: true,
  };
  let templateId: string;
  if (existing) {
    await run(supabase.from('activity_templates').update(row).eq('id', existing.id));
    templateId = existing.id;
  } else {
    const created = await run<{ id: string }>(supabase.from('activity_templates').insert({ ...row, user_id: uid }).select('id').single());
    templateId = created.id;
  }

  if (input.alarm && input.start_time) {
    await run(supabase.from('alarms').upsert({ user_id: uid, template_id: templateId, enabled: true, ...input.alarm }, { onConflict: 'template_id' }));
  } else {
    await run(supabase.from('alarms').delete().eq('template_id', templateId));
  }

  await run(supabase.rpc('refresh_template_instances', { p_template: templateId }));

  // Aktivitas sekali jalan pada tanggal lampau tidak dibuat oleh generator (agar riwayat tidak terbentuk otomatis);
  // karena user memintanya secara eksplisit, instance dibuat langsung bila belum ada.
  if (input.recurrence_type === 'none' && input.start_date < today) {
    const have = await run<Instance[]>(supabase.from('activity_instances').select('id')
      .eq('template_id', templateId).eq('scheduled_date', input.start_date));
    if (have.length === 0) {
      await run(supabase.from('activity_instances').insert({
        user_id: uid, template_id: templateId, scheduled_date: input.start_date, title: row.title,
        description: row.description, life_area_id: row.life_area_id, difficulty: row.difficulty,
        start_time: row.start_time, end_time: row.end_time,
      }));
    }
  }
  return templateId;
}

export const stopTemplate = (id: string) => run(supabase.rpc('stop_template', { p_template: id })).then(() => undefined);
export const deleteTemplate = (id: string) => run(supabase.rpc('delete_template', { p_template: id })).then(() => undefined);

export interface CompleteResult { instance_id: string; already_completed: boolean; xp_awarded: number; progress: Progress }
export const completeInstance = (id: string) => run<CompleteResult>(supabase.rpc('complete_instance', { p_id: id }));
export const skipInstance = (id: string) => run(supabase.rpc('skip_instance', { p_id: id })).then(() => undefined);
export const deleteInstance = (id: string) => run(supabase.rpc('delete_instance', { p_id: id })).then(() => undefined);
export const rescheduleInstance = (id: string, date: ISODate, start: string | null, end: string | null) =>
  run<string>(supabase.rpc('reschedule_instance', { p_id: id, p_date: date, p_start: start, p_end: end }));
export const updateNotes = (id: string, notes: string) =>
  run(supabase.from('activity_instances').update({ notes }).eq('id', id)).then(() => undefined);

export async function createOneOff(uid: string, input: ActivityInput, today: ISODate): Promise<void> {
  await saveActivity(uid, { ...input, recurrence_type: 'none' }, null, today);
}

// ------------------------------------------------------------------ hari istirahat
export const addRestDay = (uid: string, date: ISODate, reason: string) =>
  run(supabase.from('rest_days').insert({ user_id: uid, rest_date: date, reason })).then(() => undefined);
export const removeRestDay = (id: string) => run(supabase.from('rest_days').delete().eq('id', id)).then(() => undefined);

// ------------------------------------------------------------------ quest pribadi
export async function createPersonalQuest(uid: string, q: { title: string; description: string; kind: string; area_code: string | null; target: number }) {
  await run(supabase.from('quests').insert({ user_id: uid, period: 'personal', xp_reward: 0, ...q }));
}
export const deletePersonalQuest = (id: string) => run(supabase.from('quests').delete().eq('id', id)).then(() => undefined);

// ------------------------------------------------------------------ pengaturan
export async function updateSettings(uid: string, patch: Partial<Pick<Settings, 'theme' | 'accent' | 'notify_push' | 'notify_sound'>>) {
  await run(supabase.from('user_settings').update(patch).eq('user_id', uid));
}
export async function updateProfile(uid: string, patch: Partial<Pick<Profile, 'display_name' | 'timezone' | 'language'>>) {
  await run(supabase.from('profiles').update(patch).eq('id', uid));
}
export async function saveLayout(uid: string, preset: Preset) {
  await run(supabase.from('dashboard_layouts').update({ preset }).eq('user_id', uid));
}
export type { ThemeName, AccentName };

// ------------------------------------------------------------------ audio alarm (Storage privat)
export const MAX_SOUND_BYTES = 2 * 1024 * 1024;
export async function uploadSound(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith('audio/')) throw new ApiError('File harus berupa audio.');
  if (file.size > MAX_SOUND_BYTES) throw new ApiError('Ukuran audio maksimal 2 MB.');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `${uid}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('alarm-sounds').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw toApiError(error);
  return path;
}
export async function downloadSound(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('alarm-sounds').download(path);
  if (error || !data) throw toApiError(error ?? new Error('Audio tidak ditemukan'));
  return data;
}

// ------------------------------------------------------------------ push
export interface PushDevice { id: string; endpoint: string; device_label: string; is_active: boolean; created_at: string; last_success_at: string | null; last_error: string | null }
// Penulisan langganan hanya lewat RPC SECURITY DEFINER (user_id diambil dari auth.uid() di database, bukan dari frontend).
export const registerPushSubscription = (i: { endpoint: string; p256dh: string; auth: string; userAgent: string; label: string }) =>
  run<string>(supabase.rpc('register_push_subscription', { p_endpoint: i.endpoint, p_p256dh: i.p256dh, p_auth: i.auth, p_user_agent: i.userAgent, p_label: i.label }));
export const listPushDevices = () =>
  run<PushDevice[]>(supabase.from('push_subscriptions').select('id,endpoint,device_label,is_active,created_at,last_success_at,last_error').order('created_at', { ascending: false }));
export const removePushDevice = (id: string) => run(supabase.from('push_subscriptions').delete().eq('id', id)).then(() => undefined);
export const removePushSubscriptionByEndpoint = (endpoint: string) => run(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)).then(() => undefined);
export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new ApiError('Sesi berakhir. Masuk lagi.');
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/send-test-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, Authorization: `Bearer ${token}` },
      body: '{}',   // tidak ada user ID di body: server mengambil identitas dari token
    });
  } catch { throw new ApiError('Tidak dapat menghubungi server notifikasi.', true); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body?.error) throw new ApiError(body.error);
    if (res.status === 404) throw new ApiError('Fungsi send-test-push belum ter-deploy (HTTP 404). Lihat INSTALLATION.md.');
    throw new ApiError(`Gagal mengirim notifikasi percobaan (HTTP ${res.status}).`);
  }
  return body as { sent: number; failed: number };
}

// ------------------------------------------------------------------ versi jadwal
export const saveScheduleVersion = (name: string, note: string) => run<string>(supabase.rpc('save_schedule_version', { p_name: name, p_note: note }));
export const applyScheduleVersion = (id: string) => run<number>(supabase.rpc('apply_schedule_version', { p_id: id }));
export const deleteScheduleVersion = (id: string) => run(supabase.from('schedules').delete().eq('id', id)).then(() => undefined);

// ------------------------------------------------------------------ backup
export const exportData = () => run<Record<string, unknown>>(supabase.rpc('export_my_data'));
export const restoreData = (data: Record<string, unknown>) => run<Record<string, number>>(supabase.rpc('restore_my_data', { p: data }));

// ------------------------------------------------------------------ auth
export async function signInPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new ApiError(/invalid login/i.test(error.message) ? 'Email atau password salah.' : error.message);
}
export async function sendMagicLink(email: string) {
  // shouldCreateUser:false -> link hanya berlaku untuk akun yang SUDAH ada (registrasi tetap invite-only)
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  if (error) throw new ApiError(error.message);
}
export async function redeemInvite(input: { code: string; email: string; password: string; displayName: string; timezone: string }) {
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/redeem-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
      },
      body: JSON.stringify(input),
    });
  } catch { throw new ApiError('Tidak dapat menghubungi server (jaringan atau CORS). Pastikan ALLOWED_ORIGINS berisi http://localhost:5173.', true); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body?.error) throw new ApiError(body.error);
    if (res.status === 404) throw new ApiError('Fungsi redeem-invite belum ter-deploy di Supabase (HTTP 404). Lihat README langkah 6.');
    if (res.status === 401) throw new ApiError('Fungsi ditolak (HTTP 401). Deploy ulang dengan: npx supabase functions deploy redeem-invite --no-verify-jwt');
    throw new ApiError(`Gagal mendaftar (HTTP ${res.status}${body?.message ? `: ${body.message}` : ''}).`);
  }
}
export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new ApiError(error.message);
}
export async function signOut() { await supabase.auth.signOut(); }
export async function signOutEverywhere() { await supabase.auth.signOut({ scope: 'global' }); }

export { toApiError };
