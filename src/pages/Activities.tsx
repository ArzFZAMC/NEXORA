import { useMemo, useState } from 'react';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, Segmented, useConfirm } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { InstanceList, AreaChip } from '../features/common/parts';
import { useActivityForm } from '../features/activities/FormHost';
import { deleteTemplate, stopTemplate } from '../lib/api';
import { nextOccurrence } from '../lib/recurrence';
import { shortTime } from '../lib/date';
import { xpForDifficulty } from '../lib/gamification';
import type { Status } from '../lib/types';

type Tab = 'list' | 'routines';
type Sort = 'date' | 'difficulty' | 'title';
const DIFF_ORDER: Record<string, number> = { challenge: 0, hard: 1, normal: 2, easy: 3 };

export default function Activities() {
  const { today, attempt, refresh } = useApp();
  const d = useData();
  const { t } = useI18n();
  const { open } = useActivityForm();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('list');
  const [q, setQ] = useState(''); const [status, setStatus] = useState<'all' | Status>('all');
  const [area, setArea] = useState('all'); const [range, setRange] = useState<'upcoming' | 'past' | 'all'>('upcoming'); const [sort, setSort] = useState<Sort>('date');

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = d.instances.filter((i) => !i.is_hidden)
      .filter((i) => range === 'all' ? true : range === 'upcoming' ? i.scheduled_date >= today : i.scheduled_date < today)
      .filter((i) => status === 'all' || i.status === status)
      .filter((i) => area === 'all' || d.areas.find((a) => a.id === i.life_area_id)?.code === area)
      .filter((i) => !needle || i.title.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle) || i.notes.toLowerCase().includes(needle));
    const cmp: Record<Sort, (a: typeof list[number], b: typeof list[number]) => number> = {
      date: (a, b) => (range === 'past' ? -1 : 1) * (a.scheduled_date + (a.start_time ?? '99')).localeCompare(b.scheduled_date + (b.start_time ?? '99')),
      difficulty: (a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || a.scheduled_date.localeCompare(b.scheduled_date),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return list.sort(cmp[sort]).slice(0, 300);
  }, [d.instances, d.areas, q, status, area, range, sort, today]);

  const routines = d.templates.filter((x) => x.recurrence_type !== 'none');
  const oneOffs = d.templates.filter((x) => x.recurrence_type === 'none');

  return (
    <div>
      <PageHeader title={t('nav.activities')} subtitle={t('activities.subtitle')}
        actions={<button className="btn-primary" onClick={() => open(null)}><Icon name="plus" size={18} />{t('activity.new')}</button>} />
      <div className="mb-4"><Segmented<Tab> label={t('activities.view')} value={tab} onChange={setTab}
        options={[{ value: 'list', label: t('activities.tabList') }, { value: 'routines', label: t('activities.tabRoutines', { n: routines.length }) }]} /></div>

      {tab === 'list' && (<>
        <div className="card mb-4 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2 relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input" aria-label={t('activities.filterRange')} value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            <option value="upcoming">{t('activities.rangeUpcoming')}</option><option value="past">{t('activities.rangePast')}</option><option value="all">{t('activities.rangeAll')}</option></select>
          <select className="input" aria-label={t('activities.filterStatus')} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">{t('activities.allStatus')}</option>{(['planned', 'completed', 'skipped', 'missed'] as Status[]).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
          <select className="input" aria-label={t('activities.filterArea')} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">{t('activities.allAreas')}</option>{d.areas.map((a) => <option key={a.id} value={a.code}>{t(`area.${a.code}`)}</option>)}</select>
          <select className="input md:col-span-2" aria-label={t('activities.sort')} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="date">{t('activities.sortDate')}</option><option value="difficulty">{t('activities.sortDifficulty')}</option><option value="title">{t('activities.sortTitle')}</option></select>
        </div>
        {items.length ? <InstanceList items={items} showDate /> : (
          <div className="card"><EmptyState icon="list" title={d.templates.length ? t('activities.noMatch') : t('activities.empty')} hint={d.templates.length ? undefined : t('activities.emptyHint')}
            action={!d.templates.length ? <button className="btn-primary" onClick={() => open(null)}><Icon name="plus" size={16} />{t('activity.new')}</button> : undefined} /></div>)}
        <p className="text-xs text-muted mt-4">{t('activities.windowNote')}</p>
      </>)}

      {tab === 'routines' && (
        <div className="space-y-6">
          <section><h2 className="card-title">{t('activities.routines')}</h2>
            {routines.length === 0 ? <div className="card"><EmptyState icon="repeat" title={t('activities.noRoutines')} hint={t('activities.noRoutinesHint')} /></div> : (
              <ul className="space-y-2">{routines.map((r) => {
                const next = r.is_active ? nextOccurrence(r, today > r.start_date ? addDay(today, -1) : addDay(r.start_date, -1)) : null;
                return (
                  <li key={r.id} className={`card !p-4 flex items-start gap-3 ${r.is_active ? '' : 'opacity-60'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted">
                        <AreaChip areaId={r.life_area_id} /><span className="chip"><Icon name="repeat" size={12} />{t(`recurrence.${r.recurrence_type}`)}</span>
                        {r.start_time && <span>{shortTime(r.start_time)}</span>}<span>+{xpForDifficulty(r.difficulty)} XP</span>
                        {!r.is_active && <span className="chip text-warn border-warn/40">{t('activities.stopped')}</span>}
                        {next && <span>{t('activities.next', { date: next })}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button className="btn-ghost btn-sm !px-2" aria-label={t('common.edit')} onClick={() => open(r)}><Icon name="edit" size={15} /></button>
                      {r.is_active && <button className="btn-ghost btn-sm" onClick={async () => {
                        if (await confirm({ title: t('activities.stopTitle'), message: t('activities.stopMsg', { title: r.title }), confirmLabel: t('activities.stop') }))
                          { await attempt(() => stopTemplate(r.id), t('activities.stoppedOk')); await refresh(); } }}>{t('activities.stop')}</button>}
                      <button className="btn-ghost btn-sm !px-2 hover:!text-bad" aria-label={t('common.delete')} onClick={async () => {
                        if (await confirm({ title: t('activities.deleteRoutineTitle'), message: t('activities.deleteRoutineMsg', { title: r.title }), confirmLabel: t('common.delete'), danger: true }))
                          { await attempt(() => deleteTemplate(r.id), t('app.deleted')); await refresh(); } }}><Icon name="trash" size={15} /></button>
                    </div>
                  </li>); })}</ul>)}
          </section>
          {oneOffs.length > 0 && <p className="text-xs text-muted">{t('activities.oneOffNote', { n: oneOffs.length })}</p>}
        </div>)}
    </div>
  );
}

function addDay(iso: string, n: number) {
  const dt = new Date(iso + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10);
}
