import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp, useData } from '../../app/AppContext';
import { useI18n } from '../../i18n';
import { Modal, Segmented } from '../../components/ui/ui';
import { Icon } from '../../components/ui/Icon';
import * as api from '../../lib/api';
import { isValidISO } from '../../lib/date';
import { xpForDifficulty } from '../../lib/gamification';
import type { Template } from '../../lib/types';
import { startOfMonthDay } from './formUtils';
import { playTestTone } from '../../lib/sound';

interface FormApi { open: (tpl?: Template | null, preset?: { date?: string }) => void }
const Ctx = createContext<FormApi>({ open: () => undefined });
export const useActivityForm = () => useContext(Ctx);

export function ActivityFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ tpl: Template | null; date?: string } | null>(null);
  const value = useMemo<FormApi>(() => ({ open: (tpl = null, preset) => setState({ tpl, date: preset?.date }) }), []);
  return <Ctx.Provider value={value}>{children}{state && <ActivityForm tpl={state.tpl} presetDate={state.date} onClose={() => setState(null)} />}</Ctx.Provider>;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];     // tampil Senin..Minggu
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const OFFSETS = [0, 5, 10, 15, 30, 60];

function ActivityForm({ tpl, presetDate, onClose }: { tpl: Template | null; presetDate?: string; onClose: () => void }) {
  const { user, today, attempt, refresh } = useApp();
  const { areas, alarms } = useData();
  const { t } = useI18n();
  const existingAlarm = tpl ? alarms.find((a) => a.template_id === tpl.id) : undefined;

  const [title, setTitle] = useState(tpl?.title ?? '');
  const [description, setDescription] = useState(tpl?.description ?? '');
  const [areaId, setAreaId] = useState<number>(tpl?.life_area_id ?? areas[0]?.id ?? 1);
  const [difficulty, setDifficulty] = useState<string>(tpl?.difficulty ?? 'normal');
  const [startDate, setStartDate] = useState(tpl?.start_date ?? presetDate ?? today);
  const [startTime, setStartTime] = useState(tpl?.start_time?.slice(0, 5) ?? '');
  const [endTime, setEndTime] = useState(tpl?.end_time?.slice(0, 5) ?? '');
  const [recurrence, setRecurrence] = useState<string>(tpl?.recurrence_type ?? 'none');
  const [days, setDays] = useState<number[]>(tpl?.recurrence_days ?? []);
  const [dom, setDom] = useState<number | ''>(tpl?.day_of_month ?? '');
  const [endDate, setEndDate] = useState(tpl?.end_date ?? '');
  const [alarmOn, setAlarmOn] = useState(!!existingAlarm?.enabled);
  const [offset, setOffset] = useState(existingAlarm?.offset_minutes ?? 0);
  const [snooze, setSnooze] = useState(existingAlarm?.snooze_minutes ?? 5);
  const [soundPath, setSoundPath] = useState<string | null>(existingAlarm?.sound_type === 'custom' ? existingAlarm.sound_path : null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (!areas.some((a) => a.id === areaId) && areas[0]) setAreaId(areas[0].id); }, [areas, areaId]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = t('form.errTitle');
    if (title.length > 120) e.title = t('form.errTitleLong');
    if (!isValidISO(startDate)) e.date = t('form.errDate');
    if (startTime && endTime && endTime <= startTime) e.time = t('form.errEndTime');
    if (endTime && !startTime) e.time = t('form.errNeedStart');
    if (recurrence === 'custom' && days.length === 0) e.days = t('form.errDays');
    if (recurrence === 'monthly' && dom !== '' && (dom < 1 || dom > 31)) e.dom = t('form.errDom');
    if (endDate && recurrence !== 'none' && endDate < startDate) e.endDate = t('form.errEndDate');
    if (alarmOn && !startTime) e.alarm = t('form.errAlarmNeedsTime');
    return e;
  }, [title, startDate, startTime, endTime, recurrence, days, dom, endDate, alarmOn, t]);

  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()));

  async function submit() {
    setTouched(true);
    if (Object.keys(errors).length || !user) return;
    setBusy(true);
    const result = await attempt(async () => {
      let path = soundPath;
      if (alarmOn && file) path = await api.uploadSound(user.id, file);
      await api.saveActivity(user.id, {
        title, description, life_area_id: areaId, difficulty, start_time: startTime || null, end_time: endTime || null,
        recurrence_type: recurrence, recurrence_days: days, day_of_month: recurrence === 'monthly' ? (dom === '' ? startOfMonthDay(startDate) : dom) : null,
        start_date: startDate, end_date: endDate || null,
        alarm: alarmOn && startTime ? { offset_minutes: offset, sound_type: path ? 'custom' : 'default', sound_path: path, snooze_minutes: snooze } : null,
      }, tpl, today);
      return true;
    }, t(tpl ? 'form.updated' : 'form.created'));
    setBusy(false);
    if (result) { await refresh(); onClose(); }
  }

  const err = (k: string) => touched && errors[k] ? <p className="text-xs text-bad mt-1" role="alert">{errors[k]}</p> : null;
  return (
    <Modal open wide title={t(tpl ? 'form.editTitle' : 'form.newTitle')} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? t('common.saving') : t('common.save')}</button></>}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div>
          <label className="label" htmlFor="f-title">{t('form.title')}</label>
          <input id="f-title" className="input" value={title} maxLength={130} onChange={(e) => setTitle(e.target.value)} placeholder={t('form.titleHint')} aria-invalid={!!(touched && errors.title)} />
          {err('title')}
        </div>
        <div>
          <label className="label" htmlFor="f-desc">{t('form.description')}</label>
          <textarea id="f-desc" className="input" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="f-area">{t('form.area')}</label>
            <select id="f-area" className="input" value={areaId} onChange={(e) => setAreaId(Number(e.target.value))}>
              {areas.map((a) => <option key={a.id} value={a.id}>{t(`area.${a.code}`)}</option>)}
            </select>
          </div>
          <div>
            <span className="label">{t('form.difficulty')} <span className="text-accent">(+{xpForDifficulty(difficulty)} XP)</span></span>
            <Segmented label={t('form.difficulty')} value={difficulty} onChange={setDifficulty}
              options={['easy', 'normal', 'hard', 'challenge'].map((d) => ({ value: d, label: t(`difficulty.${d}`) }))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-1"><label className="label" htmlFor="f-date">{t(recurrence === 'none' ? 'form.date' : 'form.startFrom')}</label>
            <input id="f-date" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />{err('date')}</div>
          <div className="col-span-3 sm:col-span-1"><label className="label" htmlFor="f-st">{t('form.startTime')}</label>
            <input id="f-st" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          <div className="col-span-3 sm:col-span-1"><label className="label" htmlFor="f-et">{t('form.endTime')}</label>
            <input id="f-et" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
        </div>
        {err('time')}

        <fieldset className="rounded-2xl border border-line p-4 space-y-4">
          <legend className="px-2 text-xs uppercase tracking-widest text-muted">{t('form.recurrence')}</legend>
          <select className="input" aria-label={t('form.recurrence')} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            {['none', 'daily', 'weekly', 'monthly', 'custom'].map((r) => <option key={r} value={r}>{t(`recurrence.${r}`)}</option>)}
          </select>
          {(recurrence === 'weekly' || recurrence === 'custom') && (
            <div><p className="label">{t(recurrence === 'weekly' ? 'form.weekdaysOptional' : 'form.weekdays')}</p>
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label={t('form.weekdays')}>
                {WEEKDAYS.map((d) => (
                  <button type="button" key={d} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}
                    className={`min-w-[44px] min-h-[40px] rounded-xl text-xs font-medium border transition ${days.includes(d) ? 'bg-accent text-accent-ink border-accent' : 'border-line text-muted hover:text-ink'}`}>
                    {t(`weekday.${DAY_KEYS[d]}`)}</button>))}
              </div>{err('days')}</div>)}
          {recurrence === 'monthly' && (
            <div><label className="label" htmlFor="f-dom">{t('form.dayOfMonth')}</label>
              <input id="f-dom" type="number" min={1} max={31} className="input max-w-[140px]" value={dom}
                placeholder={String(startOfMonthDay(startDate))} onChange={(e) => setDom(e.target.value === '' ? '' : Number(e.target.value))} />
              <p className="text-xs text-muted mt-1">{t('form.dayOfMonthHint')}</p>{err('dom')}</div>)}
          {recurrence !== 'none' && (
            <div><label className="label" htmlFor="f-end">{t('form.endDate')}</label>
              <input id="f-end" type="date" className="input max-w-[200px]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <p className="text-xs text-muted mt-1">{t('form.endDateHint')}</p>{err('endDate')}</div>)}
          {tpl && <p className="text-xs text-muted flex gap-2"><Icon name="alert" size={14} className="shrink-0 mt-0.5" />{t('form.editNote')}</p>}
        </fieldset>

        <fieldset className="rounded-2xl border border-line p-4 space-y-4">
          <legend className="px-2 text-xs uppercase tracking-widest text-muted">{t('form.alarm')}</legend>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-[rgb(var(--accent))]" checked={alarmOn} onChange={(e) => setAlarmOn(e.target.checked)} />
            <span className="text-sm">{t('form.alarmOn')}</span>
          </label>
          {err('alarm')}
          {alarmOn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="f-off">{t('form.alarmOffset')}</label>
                  <select id="f-off" className="input" value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
                    {OFFSETS.map((o) => <option key={o} value={o}>{o === 0 ? t('form.alarmAtStart') : t('form.minutesBefore', { n: o })}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="f-snz">{t('form.snooze')}</label>
                  <select id="f-snz" className="input" value={snooze} onChange={(e) => setSnooze(Number(e.target.value))}>
                    {[5, 10, 15].map((o) => <option key={o} value={o}>{t('form.minutes', { n: o })}</option>)}
                  </select></div>
              </div>
              <div>
                <label className="label" htmlFor="f-snd">{t('form.sound')}</label>
                <input id="f-snd" type="file" accept="audio/*" className="input !py-2 text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-muted">{file ? file.name : soundPath ? t('form.soundCustom') : t('form.soundDefault')}</span>
                  {(file || soundPath) && <button type="button" className="btn-ghost btn-sm" onClick={() => { setFile(null); setSoundPath(null); }}>{t('form.soundReset')}</button>}
                  {!file && !soundPath && <button type="button" className="btn-ghost btn-sm" onClick={() => playTestTone()}>{t('settings.testSound')}</button>}
                </div>
                <p className="text-xs text-muted mt-1">{t('form.soundLimit')}</p>
              </div>
              <p className="text-xs text-muted">{t('form.alarmLimit')}</p>
            </div>)}
        </fieldset>
      </form>
    </Modal>
  );
}
