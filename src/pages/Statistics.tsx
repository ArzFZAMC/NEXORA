import { useMemo, useState } from 'react';
import { useData, useApp } from '../app/AppContext';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, Segmented } from '../components/ui/ui';
import { AREA_COLORS } from '../features/common/parts';
import { addDays, dayOfWeek, eachDay, formatDate } from '../lib/date';
import { levelProgress } from '../lib/gamification';

type Range = 7 | 30 | 90;

function Bars({ values, labels, color, label }: { values: number[]; labels: string[]; color: string; label: string }) {
  const max = Math.max(1, ...values); const w = 100 / values.length;
  return (
    <svg viewBox="0 0 100 44" className="w-full h-40" role="img" aria-label={label} preserveAspectRatio="none">
      <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" className="text-line" strokeWidth=".3" />
      {values.map((v, i) => { const h = (v / max) * 36; return (
        <g key={i}><title>{`${labels[i]}: ${v}`}</title>
          <rect x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={Math.max(v ? 0.8 : 0, h)} rx=".6" fill={color} opacity={v ? 1 : 0.15} /></g>); })}
    </svg>);
}

export default function Statistics() {
  const { today } = useApp();
  const d = useData();
  const { t, locale } = useI18n();
  const [range, setRange] = useState<Range>(30);
  const days = useMemo(() => eachDay(addDays(today, -(range - 1)), today), [today, range]);
  const by = useMemo(() => new Map(d.stats.map((s) => [s.stat_date, s])), [d.stats]);

  const sum = useMemo(() => {
    let completed = 0, planned = 0, skipped = 0, missed = 0, xp = 0, active = 0, rest = 0;
    const area: Record<string, number> = {}; const dow = Array(7).fill(0) as number[];
    for (const day of days) { const s = by.get(day); if (!s) continue;
      completed += s.completed; planned += s.planned; skipped += s.skipped; missed += s.missed; xp += s.xp_earned;
      if (s.completed > 0) active++; if (s.is_rest_day) rest++;
      for (const [k, v] of Object.entries(s.by_area)) area[k] = (area[k] ?? 0) + v;
      dow[dayOfWeek(day)] += s.completed; }
    const scheduled = completed + planned + skipped + missed;
    return { completed, planned, skipped, missed, xp, active, rest, area, dow, scheduled, rate: scheduled ? Math.round((completed / scheduled) * 100) : 0 };
  }, [days, by]);

  const lp = levelProgress(d.progress.total_xp);
  const areaTotal = Object.values(sum.area).reduce((a, b) => a + b, 0);
  const bestDow = sum.dow.indexOf(Math.max(...sum.dow));
  const dowKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const labels = days.map((x) => formatDate(x, locale, { day: 'numeric', month: 'short' }));

  const tile = (k: string, v: string | number, sub?: string) => (
    <div className="card !p-4"><p className="text-xs text-muted">{t(k)}</p><p className="text-2xl font-display font-bold mt-1">{v}</p>{sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}</div>);

  return (
    <div>
      <PageHeader title={t('nav.statistics')} subtitle={t('stats.subtitle')}
        actions={<Segmented<string> label={t('stats.range')} value={String(range)} onChange={(v) => setRange(Number(v) as Range)}
          options={[7, 30, 90].map((r) => ({ value: String(r), label: t('stats.days', { n: r }) }))} />} />
      {d.stats.length === 0 ? <div className="card"><EmptyState icon="chart" title={t('stats.empty')} hint={t('stats.emptyHint')} /></div> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {tile('stats.completed', sum.completed, t('stats.ofScheduled', { n: sum.scheduled }))}
          {tile('stats.rate', `${sum.rate}%`)}
          {tile('stats.xp', sum.xp.toLocaleString(locale), t('stats.totalXp', { n: lp.totalXp.toLocaleString(locale) }))}
          {tile('stats.activeDays', sum.active, t('stats.restDays', { n: sum.rest }))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card"><h2 className="card-title">{t('stats.completedPerDay')}</h2>
            <Bars values={days.map((x) => by.get(x)?.completed ?? 0)} labels={labels} color="rgb(var(--accent))" label={t('stats.completedPerDay')} /></section>
          <section className="card"><h2 className="card-title">{t('stats.xpPerDay')}</h2>
            <Bars values={days.map((x) => by.get(x)?.xp_earned ?? 0)} labels={labels} color="rgb(var(--good))" label={t('stats.xpPerDay')} /></section>
          <section className="card"><h2 className="card-title">{t('stats.byArea')}</h2>
            {areaTotal === 0 ? <p className="text-sm text-muted">{t('stats.noData')}</p> : (
              <ul className="space-y-3">{d.areas.map((a) => { const v = sum.area[a.code] ?? 0; return (
                <li key={a.id}><div className="flex justify-between text-sm"><span>{t(`area.${a.code}`)}</span><span className="text-muted">{v}</span></div>
                  <div className="h-2 rounded-full bg-elevated mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(v / areaTotal) * 100}%`, background: AREA_COLORS[a.code] }} /></div></li>); })}</ul>)}
          </section>
          <section className="card"><h2 className="card-title">{t('stats.byWeekday')}</h2>
            <Bars values={[1, 2, 3, 4, 5, 6, 0].map((x) => sum.dow[x])} labels={[1, 2, 3, 4, 5, 6, 0].map((x) => t(`weekday.${dowKeys[x]}`))} color="rgb(var(--warn))" label={t('stats.byWeekday')} />
            <div className="grid grid-cols-7 text-center text-[10px] text-muted mt-1">{[1, 2, 3, 4, 5, 6, 0].map((x) => <span key={x}>{t(`weekday.${dowKeys[x]}`)}</span>)}</div>
            {Math.max(...sum.dow) > 0 && <p className="text-xs text-muted mt-3">{t('stats.bestDay', { day: t(`weekday.${dowKeys[bestDow]}`) })}</p>}</section>
        </div>
        <p className="text-xs text-muted mt-4">{t('stats.note')}</p>
      </>)}
    </div>
  );
}
