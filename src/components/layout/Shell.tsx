import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { useI18n } from '../../i18n';
import { Icon, type IconName } from '../ui/Icon';
import { Modal } from '../ui/ui';
import { ActivityFormProvider, useActivityForm } from '../../features/activities/FormHost';
import { AlarmHost } from '../../features/alarms/AlarmHost';
import { levelProgress } from '../../lib/gamification';

const NAV: Array<{ to: string; key: string; icon: IconName; end?: boolean; main: boolean }> = [
  { to: '/', key: 'nav.dashboard', icon: 'home', end: true, main: true },
  { to: '/activities', key: 'nav.activities', icon: 'list', main: true },
  { to: '/calendar', key: 'nav.calendar', icon: 'calendar', main: true },
  { to: '/quests', key: 'nav.quests', icon: 'flag', main: true },
  { to: '/schedule', key: 'nav.schedule', icon: 'clock', main: false },
  { to: '/statistics', key: 'nav.statistics', icon: 'chart', main: false },
  { to: '/achievements', key: 'nav.achievements', icon: 'trophy', main: false },
  { to: '/settings', key: 'nav.settings', icon: 'settings', main: false },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-xl" />
      <div className="leading-tight"><p className="font-display font-bold tracking-wide">NEXORA</p></div>
    </div>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { online, pending, data, user, signOut } = useApp();
  const { t } = useI18n();
  const { open } = useActivityForm();
  const [more, setMore] = useState(false);
  const lp = levelProgress(data?.progress.total_xp ?? 0);

  return (
    <div className="min-h-full md:flex">
      {/* sidebar desktop */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur sticky top-0 h-[100dvh] p-4">
        <Brand />
        <nav className="mt-8 flex-1 space-y-1" aria-label={t('nav.main')}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-sm font-medium transition ${isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink hover:bg-elevated'}`}>
              <Icon name={n.icon} size={19} />{t(n.key)}
            </NavLink>))}
        </nav>
        <div className="rounded-2xl border border-line bg-elevated/50 p-3 text-xs space-y-2">
          <div className="flex justify-between"><span className="text-muted">{t('dashboard.level')}</span><span className="font-semibold">{lp.level} · {t(`tier.${lp.tier}`)}</span></div>
          <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent" style={{ width: `${lp.pct}%` }} /></div>
          <p className="text-muted truncate">{user?.email}</p>
          <button className="btn-ghost btn-sm w-full" onClick={() => void signOut()}><Icon name="logout" size={14} />{t('auth.signOut')}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {(!online || pending > 0) && (
          <div className="bg-warn/15 border-b border-warn/30 text-warn text-xs px-4 py-2 flex items-center gap-2 justify-center pt-safe" role="status">
            <Icon name="wifioff" size={14} />{!online ? t('app.offline') : t('app.pending', { n: pending })}{!online && pending > 0 ? ` · ${t('app.pending', { n: pending })}` : ''}
          </div>)}
        <header className="md:hidden flex items-center justify-between px-4 py-3 pt-safe"><Brand />
          <div className="chip !text-ink">Lv {lp.level}</div></header>
        <main className="flex-1 px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10 max-w-6xl w-full mx-auto">{children}</main>
      </div>

      <button onClick={() => open(null)} className="btn-primary fixed z-30 right-4 bottom-24 md:bottom-8 md:right-8 !rounded-full !min-h-[52px] !px-5 shadow-glow" aria-label={t('activity.new')}>
        <Icon name="plus" size={20} /><span className="hidden sm:inline">{t('activity.new')}</span>
      </button>

      {/* bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe" aria-label={t('nav.main')}>
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => n.main).map((n) => (
            <li key={n.to}><NavLink to={n.to} end={n.end}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`}>
              <Icon name={n.icon} size={21} />{t(n.key)}</NavLink></li>))}
          <li><button className="w-full flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] text-muted" onClick={() => setMore(true)}>
            <Icon name="list" size={21} />{t('nav.more')}</button></li>
        </ul>
      </nav>
      <Modal open={more} title={t('nav.more')} onClose={() => setMore(false)}>
        <ul className="grid gap-2">
          {NAV.filter((n) => !n.main).map((n) => (
            <li key={n.to}><NavLink to={n.to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-xl border border-line px-4 min-h-[52px] hover:bg-elevated">
              <Icon name={n.icon} />{t(n.key)}</NavLink></li>))}
          <li><button className="btn-ghost w-full justify-start !min-h-[52px]" onClick={() => void signOut()}><Icon name="logout" />{t('auth.signOut')}</button></li>
        </ul>
      </Modal>
      <AlarmHost />
    </div>
  );
}

export function Shell() {
  return <ActivityFormProvider><Inner><Outlet /></Inner></ActivityFormProvider>;
}
