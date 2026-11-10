import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { PageHeader, Segmented, Spinner } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { InstanceList, AreaDot } from '../features/common/parts';
import { useActivityForm } from '../features/activities/FormHost';
import { addRestDay, fetchInstances, removeRestDay, toApiError } from '../lib/api';
import { addDays, addMonths, eachDay, endOfMonth, formatDate, startOfMonth, startOfWeek, shortTime, dayOfWeek, type ISODate } from '../lib/date';
import { projectMissing } from '../lib/recurrence';
import { parseDateParam } from '../lib/pushUtil';
import type { Instance } from '../lib/types';

type View = 'day' | 'week' | 'month';

export default function Calendar() {
  const { today, user, attempt, refresh, data: appData } = useApp();
  const d = useData();
  const { t, locale } = useI18n();
  const { open } = useActivityForm();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<ISODate>(today);
  const [selected, setSelected] = useState<ISODate>(today);
  const [items, setItems] = useState<Instance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Deep link dari notifikasi push: /calendar?date=YYYY-MM-DD membuka tanggal tersebut
  const [params] = useSearchParams();
  const linkedDate = parseDateParam(params.get('date'));
  useEffect(() => { if (linkedDate) { setCursor(linkedDate as ISODate); setSelected(linkedDate as ISODate); } }, [linkedDate]);

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor };
    if (view === 'week') { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 6) }; }
    const s = startOfWeek(startOfMonth(cursor)); return { from: s, to: addDays(startOfWeek(endOfMonth(cursor)), 6) };
  }, [view, cursor]);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems(await fetchInstances(range.from, range.to)); } catch (e) { setErr(toApiError(e).message); setItems(null); }
  }, [range.from, range.to]);
  // memuat ulang saat rentang berubah ATAU data aplikasi diperbarui (aksi selesai/lewati, realtime)
  useEffect(() => { void load(); }, [load, appData?.instances]);

  const rest = useMemo(() => new Set(d.restDays.map((r) => r.rest_date)), [d.restDays]);
  const restRow = (day: ISODate) => d.restDays.find((r) => r.rest_date === day);

  const all = useMemo(() => {
    const real = items ?? [];
    const projected = projectMissing(d.templates.filter((x) => x.is_active), real.map((i) => ({ template_id: i.template_id, scheduled_date: i.scheduled_date })), range.from, range.to, today, rest);
    return { real, projected };
  }, [items, d.templates, range, today, rest]);

  const forDay = (day: ISODate) => all.real.filter((i) => i.scheduled_date === day);
  const projDay = (day: ISODate) => all.projected.filter((p) => p.date === day);

  const step = (dir: -1 | 1) => setCursor((c) => view === 'month' ? addMonths(c, dir) : addDays(c, dir * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? formatDate(cursor, locale, { month: 'long', year: 'numeric' })
    : view === 'week' ? `${formatDate(range.from, locale, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, locale, { day: 'numeric', month: 'short', year: 'numeric' })}` : formatDate(cursor, locale);

  const dots = (day: ISODate) => {
    const list = forDay(day); const c = { completed: 0, planned: 0, missed: 0, skipped: 0 };
    list.forEach((i) => { c[i.status]++; });
    return { c, proj: projDay(day).length, total: list.length };
  };

  const dayPanel = (day: ISODate) => {
    const list = forDay(day); const proj = projDay(day); const rr = restRow(day);
    return (
      <section className="card" aria-label={formatDate(day, locale)}>
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <h2 className="card-title !mb-0">{formatDate(day, locale)}</h2>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => open(null, { date: day < today ? today : day })}><Icon name="plus" size={14} />{t('calendar.add')}</button>
            {rr ? <button className="btn-ghost btn-sm" onClick={async () => { await attempt(() => removeRestDay(rr.id), t('calendar.restRemoved')); await refresh(); }}>{t('calendar.removeRest')}</button>
              : <button className="btn-ghost btn-sm" onClick={async () => { if (!user) return; await attempt(() => addRestDay(user.id, day, ''), t('calendar.restAdded')); await refresh(); }}><Icon name="moon" size={14} />{t('calendar.markRest')}</button>}
          </div>
        </div>
        {rr && <p className="chip text-accent border-accent/40 mb-3"><Icon name="moon" size={12} />{t('calendar.restDay')}</p>}
        {list.length ? <InstanceList items={list} /> : proj.length === 0 && <p className="text-sm text-muted">{t('calendar.noActivities')}</p>}
        {proj.length > 0 && (<div className={list.length ? 'mt-4' : ''}><p className="text-xs text-muted mb-2">{t('calendar.projected')}</p>
          <ul className="space-y-1.5">{proj.map((p) => (<li key={p.template_id} className="flex items-center gap-2 text-sm text-muted border border-dashed border-line rounded-lg px-3 py-2">
            <AreaDot code={d.areas.find((a) => a.id === p.life_area_id)?.code ?? ''} /><span className="w-12 text-xs">{shortTime(p.start_time) || '—'}</span><span className="truncate">{p.title}</span></li>))}</ul></div>)}
      </section>);
  };

  return (
    <div>
      <PageHeader title={t('nav.calendar')} subtitle={t('calendar.subtitle')} />
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm !px-2" aria-label={t('calendar.prev')} onClick={() => step(-1)}><Icon name="chevleft" size={18} /></button>
          <h2 className="font-display font-semibold min-w-[11rem] text-center capitalize">{title}</h2>
          <button className="btn-ghost btn-sm !px-2" aria-label={t('calendar.next')} onClick={() => step(1)}><Icon name="chevright" size={18} /></button>
          <button className="btn-ghost btn-sm" onClick={() => { setCursor(today); setSelected(today); }}>{t('calendar.today')}</button>
        </div>
        <Segmented<View> label={t('calendar.view')} value={view} onChange={setView} options={(['day', 'week', 'month'] as View[]).map((v) => ({ value: v, label: t(`calendar.${v}`) }))} />
      </div>
      {err && <div className="card border-bad/40 text-sm mb-4" role="alert">{err} <button className="btn-ghost btn-sm ml-2" onClick={() => void load()}>{t('common.retry')}</button></div>}
      {items === null && !err && <div className="flex justify-center py-10"><Spinner /></div>}

      {items !== null && view === 'month' && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <section className="card !p-3 md:!p-4" aria-label={title}>
            <div className="grid grid-cols-7 text-center text-[11px] text-muted mb-1">
              {eachDay(range.from, addDays(range.from, 6)).map((x) => <span key={x} className="py-1">{formatDate(x, locale, { weekday: 'short' })}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {eachDay(range.from, range.to).map((day) => {
                const inMonth = day.slice(0, 7) === cursor.slice(0, 7); const { c, proj } = dots(day); const isRest = rest.has(day);
                return (<button key={day} onClick={() => setSelected(day)} aria-label={formatDate(day, locale)} aria-pressed={selected === day}
                  className={`aspect-square sm:aspect-[4/3] rounded-xl border text-xs flex flex-col items-center justify-between p-1.5 transition ${selected === day ? 'border-accent bg-accent/10' : 'border-line hover:bg-elevated'}
                    ${inMonth ? '' : 'opacity-35'} ${isRest ? 'bg-accent/5 border-dashed' : ''} ${day === today ? 'ring-1 ring-accent' : ''}`}>
                  <span className={day === today ? 'text-accent font-bold' : ''}>{Number(day.slice(8))}</span>
                  <span className="flex gap-0.5 h-2 items-center">
                    {c.completed > 0 && <i className="w-1.5 h-1.5 rounded-full bg-good" />}{c.planned > 0 && <i className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    {c.missed > 0 && <i className="w-1.5 h-1.5 rounded-full bg-warn" />}{proj > 0 && <i className="w-1.5 h-1.5 rounded-full border border-muted" />}
                    {isRest && <Icon name="moon" size={10} className="text-accent" />}</span></button>); })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[11px] text-muted" aria-label={t('calendar.legend')}>
              <li className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-good" />{t('status.completed')}</li><li className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-accent" />{t('status.planned')}</li>
              <li className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-warn" />{t('status.missed')}</li><li className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full border border-muted" />{t('calendar.legendProjected')}</li>
              <li className="flex items-center gap-1.5"><Icon name="moon" size={10} />{t('calendar.restDay')}</li></ul>
          </section>
          {dayPanel(selected)}
        </div>)}

      {items !== null && view === 'week' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {eachDay(range.from, range.to).map((day) => <div key={day} className={dayOfWeek(day) === 0 ? 'xl:col-span-2' : ''}>{dayPanel(day)}</div>)}
        </div>)}

      {items !== null && view === 'day' && dayPanel(cursor)}
    </div>
  );
}
