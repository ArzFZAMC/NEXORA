import type { Attribute, Difficulty } from './gamification';
import type { RecurrenceType } from './recurrence';

export type Status = 'planned' | 'completed' | 'skipped' | 'missed';
export type AccentName = 'electric-blue' | 'violet' | 'emerald' | 'amber' | 'rose';
export type ThemeName = 'dark' | 'light' | 'system';
export type Preset = 'compact' | 'balanced' | 'focus';

export interface LifeArea { id: number; code: string; name: string; attribute: Attribute; sort_order: number }

export interface Template {
  id: string; user_id: string; title: string; description: string; life_area_id: number; difficulty: Difficulty;
  start_time: string | null; end_time: string | null; recurrence_type: RecurrenceType; recurrence_days: number[];
  day_of_month: number | null; start_date: string; end_date: string | null; is_active: boolean; version: number;
}

export interface Instance {
  id: string; user_id: string; template_id: string | null; scheduled_date: string; title: string; description: string;
  life_area_id: number; difficulty: Difficulty; start_time: string | null; end_time: string | null; status: Status;
  completed_at: string | null; notes: string; is_exception: boolean; is_hidden: boolean;
}

export interface AlarmRow {
  id: string; user_id: string; template_id: string; offset_minutes: number; sound_type: 'default' | 'custom';
  sound_path: string | null; snooze_minutes: number; enabled: boolean;
}

export interface RestDay { id: string; rest_date: string; reason: string }

export interface Quest {
  id: string; user_id: string | null; title: string; description: string; period: 'daily' | 'weekly' | 'monthly' | 'personal';
  kind: 'complete_any' | 'complete_area' | 'active_days'; area_code: string | null; target: number; xp_reward: number; is_active: boolean;
  created_at: string;
}
export interface UserQuest { id: string; quest_id: string; period_start: string; progress: number; completed_at: string | null }

export interface Achievement {
  id: number; code: string; name: string; description: string; kind: string; threshold: number; area_code: string | null;
  xp_reward: number; sort_order: number;
}
export interface UserAchievement { achievement_id: number; unlocked_at: string }

export interface DailyStat {
  stat_date: string; planned: number; completed: number; skipped: number; missed: number; xp_earned: number;
  is_rest_day: boolean; by_area: Record<string, number>;
}

export interface Profile { id: string; display_name: string; timezone: string; language: 'id' | 'en' }
export interface Settings { user_id: string; theme: ThemeName; accent: AccentName; notify_push: boolean; notify_sound: boolean }
export interface Layout { user_id: string; preset: Preset; widgets: unknown }

export interface ScheduleVersion { id: string; name: string; note: string; snapshot: unknown[]; last_applied_at: string | null; created_at: string }

export interface Streaks { current_daily: number; best_daily: number; current_weekly: number; best_weekly: number }
export interface Progress {
  total_xp: number; streaks: Streaks; achievements_unlocked: number; achievements_total: number;
  completed_total: number; completed_by_area: Record<string, number>;
}
