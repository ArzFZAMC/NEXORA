import { useData } from '../app/AppContext';
import { useI18n } from '../i18n';
import { PageHeader, ProgressBar } from '../components/ui/ui';
import { Icon } from '../components/ui/Icon';
import { levelFromXp } from '../lib/gamification';
import { formatDate } from '../lib/date';

export default function Achievements() {
  const d = useData();
  const { t, locale } = useI18n();
  const unlocked = new Map(d.userAchievements.map((u) => [u.achievement_id, u.unlocked_at]));
  const metric = (kind: string, area: string | null) => {
    if (kind === 'total_completed') return d.progress.completed_total;
    if (kind === 'streak') return d.progress.streaks.best_daily;
    if (kind === 'level') return levelFromXp(d.progress.total_xp);
    if (kind === 'xp_total') return d.progress.total_xp;
    if (kind === 'area_completed') return d.progress.completed_by_area[area ?? ''] ?? 0;
    return 0;
  };
  return (
    <div>
      <PageHeader title={t('nav.achievements')} subtitle={t('achievements.subtitle', { a: d.progress.achievements_unlocked, b: d.progress.achievements_total })} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.achievementDefs.map((a) => {
          const at = unlocked.get(a.id); const v = Math.min(metric(a.kind, a.area_code), a.threshold);
          return (
            <li key={a.id} className={`card !p-4 ${at ? 'border-accent/50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${at ? 'bg-accent/15 text-accent' : 'bg-elevated text-muted'}`}><Icon name={at ? 'trophy' : 'lock'} size={20} /></div>
                <div className="min-w-0 flex-1"><p className="font-medium">{a.name}</p><p className="text-xs text-muted mt-0.5">{a.description}</p>
                  {at ? <p className="text-xs text-accent mt-2">{t('achievements.unlockedOn', { date: formatDate(at.slice(0, 10), locale, { dateStyle: 'medium' }) })}{a.xp_reward ? ` · +${a.xp_reward} XP` : ''}</p>
                    : <div className="mt-2"><ProgressBar pct={(v / a.threshold) * 100} height={5} label={a.name} /><p className="text-[11px] text-muted mt-1">{v}/{a.threshold}{a.xp_reward ? ` · +${a.xp_reward} XP` : ''}</p></div>}</div>
              </div>
            </li>); })}
      </ul>
    </div>
  );
}
