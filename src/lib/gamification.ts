// Aturan gamifikasi (sisi tampilan). Sumber kebenaran XP ada di database (xp_transactions);
// rumus level di sini HARUS sama dengan public.level_from_xp() di SQL.

export type Difficulty = 'easy' | 'normal' | 'hard' | 'challenge';

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 10, normal: 20, hard: 35, challenge: 50 };

export function xpForDifficulty(d: string): number {
  return XP_BY_DIFFICULTY[d as Difficulty] ?? XP_BY_DIFFICULTY.normal;
}

/** XP kumulatif yang dibutuhkan untuk MULAI level n: 50 * (n-1) * n  (L2=100, L3=300, L4=600 ...) */
export function xpAtLevelStart(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + safe / 12.5)) / 2));
  // koreksi pembulatan floating point di sekitar batas level
  while (xpAtLevelStart(level + 1) <= safe) level++;
  while (level > 1 && xpAtLevelStart(level) > safe) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  intoLevel: number;
  levelSize: number;
  pct: number;
  xpToNext: number;
  tier: Tier;
}

export function levelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelFromXp(xp);
  const start = xpAtLevelStart(level);
  const size = xpAtLevelStart(level + 1) - start;
  const into = xp - start;
  return { level, totalXp: xp, intoLevel: into, levelSize: size, pct: Math.min(100, Math.round((into / size) * 100)), xpToNext: size - into, tier: tierForLevel(level) };
}

export type Tier = 'beginner' | 'explorer' | 'builder' | 'achiever' | 'specialist' | 'master' | 'legend';

export function tierForLevel(level: number): Tier {
  if (level <= 5) return 'beginner';
  if (level <= 10) return 'explorer';
  if (level <= 20) return 'builder';
  if (level <= 30) return 'achiever';
  if (level <= 40) return 'specialist';
  if (level <= 50) return 'master';
  return 'legend';
}

export const ATTRIBUTES = ['knowledge', 'career', 'health', 'spiritual', 'personal', 'creativity'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

/** Level atribut hanyalah statistik perkembangan (bukan ukuran nilai diri). */
export function attributeLevel(xp: number): { level: number; pct: number } {
  const x = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(x / 25)) + 1;
  const start = 25 * (level - 1) ** 2;
  const next = 25 * level ** 2;
  return { level, pct: Math.round(((x - start) / (next - start)) * 100) };
}

export function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'afternoon';
  if (hour >= 15 && hour < 19) return 'evening';
  return 'night';
}
