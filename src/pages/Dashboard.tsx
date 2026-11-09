import { Link } from 'react-router-dom';
import { useApp, useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { EmptyState, PageHeader, ProgressBar } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { InstanceList, AreaDot } from '../features/common/parts';
import { useActivityForm } from '../features/activities/FormHost';
import { ATTRIBUTES, attributeLevel, greetingKey, levelProgress } from '../lib/gamification';
import { addDays, eachDay, formatDate, hourInTz, startOfWeek, shortTime } from '../lib/date';
import { questView } from '../lib/quests';
import { saveLayout } from '../lib/api';
import type { Preset } from '../lib/types';
import { Segmented } from '../components/ui/ui';

type W = 'level' | 'daily' | 'today' | 'upcoming' | 'dailyQuests' | 'weeklyQuests' | 'streak' | 'attributes' | 'achievements' | 'weekly';
const PRESETS: Record<Preset, W[]> = {
  balanced: ['level', 'daily', 'today', 'upcoming', 'dailyQuests', 'weeklyQuests', 'streak', 'attributes', 'achievements', 'weekly'],
  compact: ['level', 'daily', 'streak', 'today', 'dailyQuests', 'weekly'],
  focus: ['level', 'today', 'dailyQuests'],
};
const WIDE: W[] = ['today', 'weekly'];

export default function Dashboard() {
  const { today, user, attempt, refresh } = useApp();
  const d = useData();
  const { t, locale } = useI18n();
  const { open } = useActivityForm();
  const lp = levelProgress(d.progress.total_xp);
  const preset = d.layout.preset;
  const hour = hourInTz(d.profile.timezone);
  const mine = d.instances.filter((i) => !i.is_hidden);
  const todays = mine.filter((i) => i.scheduled_date === today);
  const upcoming = mine.filter((i) => i.scheduled_date > today && i.status === 'planned').slice(0, 5);
  const isRest = d.restDays.some((r) => r.rest_date === today);
  const doneToday = todays.filter((i) => i.status === 'completed').length;
  const pctToday = todays.length ? Math.round((doneToday / todays.length) * 100) : 0;
  const created = (q: { created_at: string }) => q.created_at.slice(0, 10);
  const quests = d.quests.map((q) => questView(q, d.userQuests, today, created(q)));
  const daily = quests.filter((q) => q.quest.period === 'daily');
  const weekly = quests.filter((q) => q.quest.period === 'weekly' || q.quest.period === 'monthly');
  const weekStart = startOfWeek(today);
  const week = eachDay(weekStart, addDays(weekStart, 6));
  const statBy = new Map(d.stats.map((s) => [s.stat_date, s]));
  const maxWeek = Math.max(1, ...week.map((x) => (statBy.get(x)?.completed ?? 0) + (statBy.get(x)?.planned ?? 0) + (statBy.get(x)?.missed ?? 0)));
  const weekDone = week.reduce((n, x) => n + (statBy.get(x)?.completed ?? 0), 0);

  const card = (id: W) => {
    switch (id) {
      case 'level': return (
        <section className="card" aria-labelledby="w-level">
          <h2 id="w-level" className="card-title">{t('dashboard.level')}</h2>
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-4xl font-display font-bold leading-none">{lp.level}</p><p className="text-sm text-accent mt-1">{t(`tier.${lp.tier}`)}</p></div>
            <div className="text-right"><p className="text-2xl font-semibold">{lp.totalXp.toLocaleString(locale)}</p><p className="text-xs text-muted">{t('dashboard.totalXp')}</p></div>
          </div>
          <div className="mt-4"><ProgressBar pct={lp.pct} label={t('dashboard.toNext')} />
            <p className="text-xs text-muted mt-2">{t('dashboard.xpToNext', { xp: lp.xpToNext, level: lp.level + 1 })}</p></div>
        </section>);
      case 'daily': return (
        <section className="card" aria-labelledby="w-daily">
          <h2 id="w-daily" className="card-title">{t('dashboard.dailyProgress')}</h2>
          {isRest ? <p className="text-sm text-muted">{t('dashboard.restDay')}</p> : (<>
            <div className="flex items-baseline gap-2"><p className="text-3xl font-display font-bold">{doneToday}<span className="text-muted text-lg">/{todays.length}</span></p>
              <p className="text-sm text-muted">{t('dashboard.activitiesDone')}</p></div>
            <div className="mt-3"><ProgressBar pct={pctToday} label={t('dashboard.dailyProgress')} /></div></>)}
        </section>);
      case 'streak': return (
        <section className="card" aria-labelledby="w-streak">
          <h2 id="w-streak" className="card-title">{t('dashboard.streak')}</h2>
          <div className="flex items-center gap-4">
            <Icon name="flame" size={34} className={d.progress.streaks.current_daily > 0 ? 'text-warn' : 'text-muted'} />
            <div><p className="text-3xl font-display font-bold leading-none">{d.progress.streaks.current_daily}<span className="text-sm text-muted font-normal"> {t('dashboard.days')}</span></p>
              <p className="text-xs text-muted mt-1">{t('dashboard.bestStreak', { n: d.progress.streaks.best_daily })} · {t('dashboard.weeklyStreak', { n: d.progress.streaks.current_weekly })}</p></div>
          </div>
          <p className="text-xs text-muted mt-3">{t('dashboard.streakNote')}</p>
        </section>);
      case 'today': return (
        <section className="card" aria-labelledby="w-today">
          <div className="flex items-center justify-between mb-3"><h2 id="w-today" className="card-title !mb-0">{t('dashboard.today')}</h2>
            <Link to="/activities" className="text-xs text-accent">{t('common.viewAll')}</Link></div>
          {todays.length ? <InstanceList items={todays} /> : <EmptyState icon="calendar" title={t('dashboard.noToday')} hint={t('dashboard.noTodayHint')}
            action={<button className="btn-primary btn-sm" onClick={() => open(null)}><Icon name="plus" size={14} />{t('activity.new')}</button>} />}
        </section>);
      case 'upcoming': return (
        <section className="card" aria-labelledby="w-up">
          <h2 id="w-up" className="card-title">{t('dashboard.upcoming')}</h2>
          {upcoming.length ? <ul className="space-y-2">{upcoming.map((i) => (
            <li key={i.id} className="flex items-center gap-3 text-sm"><span className="w-14 text-xs text-muted shrink-0">{formatDate(i.scheduled_date, locale, { day: 'numeric', month: 'short' })}</span>
              <AreaDot code={d.areas.find((a) => a.id === i.life_area_id)?.code ?? ''} /><span className="truncate flex-1">{i.title}</span><span className="text-xs text-muted">{shortTime(i.start_time)}</span></li>))}</ul>
            : <p className="text-sm text-muted">{t('dashboard.noUpcoming')}</p>}
        </section>);
      case 'dailyQuests': case 'weeklyQuests': {
        const list = id === 'dailyQuests' ? daily : weekly;
        return (
          <section className="card" aria-labelledby={`w-${id}`}>
            <div className="flex items-center justify-between mb-3"><h2 id={`w-${id}`} className="card-title !mb-0">{t(id === 'dailyQuests' ? 'dashboard.dailyQuests' : 'dashboard.weeklyQuests')}</h2>
              <Link to="/quests" className="text-xs text-accent">{t('common.viewAll')}</Link></div>
            {list.length ? <ul className="space-y-3">{list.map((q) => (
              <li key={q.quest.id}><div className="flex justify-between text-sm gap-2"><span className={q.done ? 'text-good' : ''}>{q.done && '✓ '}{q.quest.title}</span>
                <span className="text-xs text-muted shrink-0">{q.progress}/{q.target}{q.quest.xp_reward ? ` · +${q.quest.xp_reward} XP` : ''}</span></div>
                <div className="mt-1.5"><ProgressBar pct={q.pct} height={6} label={q.quest.title} /></div></li>))}</ul>
              : <p className="text-sm text-muted">{t('quests.none')}</p>}
          </section>);
      }
      case 'attributes': return (
        <section className="card" aria-labelledby="w-attr">
          <h2 id="w-attr" className="card-title">{t('dashboard.attributes')}</h2>
          <ul className="space-y-3">{ATTRIBUTES.map((a) => { const xp = d.attributes[a] ?? 0; const al = attributeLevel(xp);
            return (<li key={a}><div className="flex justify-between text-sm"><span>{t(`attr.${a}`)}</span><span className="text-xs text-muted">Lv {al.level}</span></div>
              <div className="mt-1"><ProgressBar pct={al.pct} height={6} label={t(`attr.${a}`)} /></div></li>); })}</ul>
          <p className="text-xs text-muted mt-3">{t('dashboard.attrNote')}</p>
        </section>);
      case 'achievements': return (
        <section className="card" aria-labelledby="w-ach">
          <div className="flex items-center justify-between mb-3"><h2 id="w-ach" className="card-title !mb-0">{t('dashboard.achievements')}</h2>
            <Link to="/achievements" className="text-xs text-accent">{t('common.viewAll')}</Link></div>
          <p className="text-3xl font-display font-bold">{d.progress.achievements_unlocked}<span className="text-muted text-lg">/{d.progress.achievements_total}</span></p>
          <div className="mt-3"><ProgressBar pct={d.progress.achievements_total ? (d.progress.achievements_unlocked / d.progress.achievements_total) * 100 : 0} label={t('dashboard.achievements')} /></div>
        </section>);
      case 'weekly': return (
        <section className="card" aria-labelledby="w-week">
          <div className="flex items-center justify-between mb-3"><h2 id="w-week" className="card-title !mb-0">{t('dashboard.weekly')}</h2>
            <span className="text-xs text-muted">{t('dashboard.weekDone', { n: weekDone })}</span></div>
          <div className="grid grid-cols-7 gap-2 items-end h-28">
            {week.map((day) => { const s = statBy.get(day); const done = s?.completed ?? 0; const total = done + (s?.planned ?? 0) + (s?.missed ?? 0);
              const h = total ? Math.max(8, (total / maxWeek) * 100) : 4; const hd = total ? (done / total) * 100 : 0;
              return (<div key={day} className="flex flex-col items-center gap-1 h-full justify-end" title={`${day}: ${done}/${total}`}>
                <div className={`w-full rounded-md overflow-hidden flex flex-col justify-end ${s?.is_rest_day ? 'bg-accent/10 border border-dashed border-accent/40' : 'bg-elevated'} ${day === today ? 'ring-1 ring-accent' : ''}`} style={{ height: `${h}%` }}>
                  <div className="bg-accent" style={{ height: `${hd}%` }} /></div>
                <span className="text-[10px] text-muted">{formatDate(day, locale, { weekday: 'narrow' })}</span></div>); })}
          </div>
        </section>);
    }
  };

  const items = PRESETS[preset];
  return (
    <div>
      <PageHeader title={`${t(`greeting.${greetingKey(hour)}`)}${d.profile.display_name ? `, ${d.profile.display_name}` : ''}`}
        subtitle={formatDate(today, locale)}
        actions={<Segmented<Preset> label={t('settings.layout')} value={preset} onChange={(p) => { void attempt(() => saveLayout(user!.id, p)).then(() => refresh()); }}
          options={(['compact', 'balanced', 'focus'] as Preset[]).map((p) => ({ value: p, label: t(`preset.${p}`) }))} />} />
      <div className={`grid gap-4 ${preset === 'focus' ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {items.map((id) => (
          <div key={id} className={WIDE.includes(id) && preset !== 'focus' ? 'md:col-span-2' : id === 'today' && preset === 'focus' ? 'md:col-span-2' : ''}>{card(id)}</div>))}
      </div>
    </div>
  );
}
