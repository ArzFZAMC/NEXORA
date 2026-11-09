import { startOfMonth, startOfWeek, type ISODate } from './date';
import type { Quest, UserQuest } from './types';

/** Awal periode quest (harus sama dengan perhitungan v_start di SQL refresh_progress). */
export function periodStart(q: Pick<Quest, 'period' | 'created_at'>, today: ISODate, createdLocalDate: ISODate): ISODate {
  if (q.period === 'daily') return today;
  if (q.period === 'weekly') return startOfWeek(today);
  if (q.period === 'monthly') return startOfMonth(today);
  return createdLocalDate;
}

export interface QuestView { quest: Quest; progress: number; target: number; done: boolean; pct: number }

export function questView(quest: Quest, userQuests: UserQuest[], today: ISODate, createdLocalDate: ISODate): QuestView {
  const start = periodStart(quest, today, createdLocalDate);
  const row = userQuests.find((u) => u.quest_id === quest.id && u.period_start === start);
  const progress = row?.progress ?? 0;
  const done = progress >= quest.target || !!row?.completed_at;
  return { quest, progress: Math.min(progress, quest.target), target: quest.target, done, pct: Math.min(100, Math.round((progress / quest.target) * 100)) };
}
