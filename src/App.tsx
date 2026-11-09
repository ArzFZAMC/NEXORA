import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { ToastProvider, ErrorState, PageLoading, Spinner } from './components/ui/ui';
import { Shell } from './components/layout/Shell';
import { isConfigured } from './lib/supabase';
import { useI18n } from './i18n';
import Auth from './pages/Auth';
import Setup from './pages/Setup';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Activities = lazy(() => import('./pages/Activities'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Quests = lazy(() => import('./pages/Quests'));
const Statistics = lazy(() => import('./pages/Statistics'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Settings = lazy(() => import('./pages/Settings'));

function Gate() {
  const { status, error, refresh, data } = useApp();
  const { t } = useI18n();
  if (!isConfigured) return <Setup />;
  if (status === 'booting' || status === 'loading') return <div className="min-h-[100dvh] grid place-items-center"><Spinner size={32} /></div>;
  if (status === 'signed-out') return <Auth />;
  if (status === 'error' || !data) return <div className="min-h-[100dvh] grid place-items-center p-4"><div className="max-w-md w-full"><ErrorState message={error ?? t('common.error')} onRetry={() => void refresh()} /></div></div>;
  return (
    <Suspense fallback={<div className="p-6"><PageLoading /></div>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="activities" element={<Activities />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="quests" element={<Quests />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return <ToastProvider><AppProvider><BrowserRouter><Gate /></BrowserRouter></AppProvider></ToastProvider>;
}
