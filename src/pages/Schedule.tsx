import { useMemo, useState } from 'react';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, Segmented, useConfirm } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { AreaDot } from '../features/common/parts';
import { useActivityForm } from '../features/activities/FormHost';
import { applyScheduleVersion, deleteScheduleVersion, saveScheduleVersion } from '../lib/api';
import { addDays, eachDay, endOfMonth, formatDate, shortTime, startOfMonth, startOfWeek } from '../lib/date';
import { occursOn } from '../lib/recurrence';
import type { Template } from '../lib/types';

type View = 'daily' | 'weekly' | 'monthly';
const byTime = (a: Template, b: Template) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99');

export default function Schedule() {
  const { today, attempt, refresh } = useApp();
  const d = useData();
  const { t, locale } = useI18n();
  const { open } = useActivityForm();
  const confirm = useConfirm();
  const [view, setView] = useState<View>('daily');
  const [name, setName] = useState(''); const [note, setNote] = useState('');
  const active = d.templates.filter((x) => x.is_active);
  const areaCode = (id: number) => d.areas.find((a) => a.id === id)?.code ?? '';

  const row = (x: Template) => (
    <li key={x.id} className="flex items-center gap-2 text-sm">
      <span className="w-12 text-xs text-muted shrink-0">{shortTime(x.start_time) || '—'}</span><AreaDot code={areaCode(x.life_area_id)} />
      <button className="truncate text-left hover:text-accent" onClick={() => open(x)}>{x.title}</button></li>);

  const dailyList = useMemo(() => active.filter((x) => occursOn(x, today)).sort(byTime), [active, today]);
  const weekStart = startOfWeek(today);
  const weekDays = eachDay(weekStart, addDays(weekStart, 6));
  const monthDays = eachDay(startOfMonth(today), endOfMonth(today));

  return (
    <div>
      <PageHeader title={t('nav.schedule')} subtitle={t('schedule.subtitle')}
        actions={<button className="btn-primary" onClick={() => open(null)}><Icon name="plus" size={18} />{t('schedule.addManual')}</button>} />
      <div className="mb-4"><Segmented<View> label={t('schedule.view')} value={view} onChange={setView}
        options={(['daily', 'weekly', 'monthly'] as View[]).map((v) => ({ value: v, label: t(`schedule.${v}`) }))} /></div>

      {active.length === 0 ? <div className="card"><EmptyState icon="clock" title={t('schedule.empty')} hint={t('schedule.emptyHint')} /></div> : (<>
        {view === 'daily' && (
          <section className="card"><h2 className="card-title">{formatDate(today, locale)}</h2>
            {dailyList.length ? <ul className="space-y-2.5">{dailyList.map(row)}</ul> : <p className="text-sm text-muted">{t('schedule.noneToday')}</p>}</section>)}
        {view === 'weekly' && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {weekDays.map((day) => { const list = active.filter((x) => occursOn(x, day)).sort(byTime);
              return (<section key={day} className={`card !p-4 ${day === today ? 'border-accent/60' : ''}`}>
                <h2 className="card-title">{formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
                {list.length ? <ul className="space-y-2">{list.map(row)}</ul> : <p className="text-xs text-muted">—</p>}</section>); })}
          </div>)}
        {view === 'monthly' && (
          <section className="card"><h2 className="card-title">{formatDate(today, locale, { month: 'long', year: 'numeric' })}</h2>
            <ul className="divide-y divide-line">
              {monthDays.map((day) => { const list = active.filter((x) => occursOn(x, day)).sort(byTime);
                return list.length ? (<li key={day} className="py-2.5 flex gap-3"><span className={`w-14 text-sm shrink-0 ${day === today ? 'text-accent font-semibold' : 'text-muted'}`}>{formatDate(day, locale, { day: 'numeric', weekday: 'short' })}</span>
                  <ul className="space-y-1.5 flex-1 min-w-0">{list.map(row)}</ul></li>) : null; })}
            </ul></section>)}
      </>)}

      <section className="mt-8">
        <h2 className="card-title">{t('schedule.versions')}</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">{t('schedule.versionsHint')}</p>
        <form className="card grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end mb-4" onSubmit={async (e) => {
          e.preventDefault(); if (!name.trim()) return;
          await attempt(() => saveScheduleVersion(name.trim(), note.trim()), t('schedule.saved')); setName(''); setNote(''); await refresh();
        }}>
          <div><label className="label" htmlFor="sv-name">{t('schedule.versionName')}</label><input id="sv-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('schedule.versionNameHint')} /></div>
          <div><label className="label" htmlFor="sv-note">{t('schedule.versionNote')}</label><input id="sv-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn-primary" disabled={!name.trim() || active.filter((x) => x.recurrence_type !== 'none').length === 0}>{t('schedule.saveCurrent')}</button>
        </form>
        {d.schedules.length === 0 ? <p className="text-sm text-muted">{t('schedule.noVersions')}</p> : (
          <ul className="space-y-2">{d.schedules.map((s) => (
            <li key={s.id} className="card !p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1"><p className="font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted">{t('schedule.versionMeta', { n: s.snapshot.length, date: formatDate(s.created_at.slice(0, 10), locale, { dateStyle: 'medium' }) })}{s.note ? ` · ${s.note}` : ''}</p></div>
              <button className="btn-ghost btn-sm" onClick={async () => {
                if (await confirm({ title: t('schedule.applyTitle'), message: t('schedule.applyMsg', { name: s.name }), confirmLabel: t('schedule.apply') })) {
                  await attempt(() => applyScheduleVersion(s.id), t('schedule.applied')); await refresh(); } }}>{t('schedule.apply')}</button>
              <button className="btn-ghost btn-sm !px-2 hover:!text-bad" aria-label={t('common.delete')} onClick={async () => {
                if (await confirm({ title: t('schedule.deleteTitle'), message: t('schedule.deleteMsg', { name: s.name }), confirmLabel: t('common.delete'), danger: true })) {
                  await attempt(() => deleteScheduleVersion(s.id), t('app.deleted')); await refresh(); } }}><Icon name="trash" size={15} /></button>
            </li>))}</ul>)}
      </section>
    </div>
  );
}
