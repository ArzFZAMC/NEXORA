import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForDifficulty, levelFromXp, xpAtLevelStart, levelProgress, tierForLevel, attributeLevel, greetingKey,
} from '../src/lib/gamification';

test('XP per tingkat kesulitan sesuai spesifikasi', () => {
  assert.equal(xpForDifficulty('easy'), 10);
  assert.equal(xpForDifficulty('normal'), 20);
  assert.equal(xpForDifficulty('hard'), 35);
  assert.equal(xpForDifficulty('challenge'), 50);
});

test('batas level tepat (L2=100, L3=300, L4=600)', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(299), 2);
  assert.equal(levelFromXp(300), 3);
  assert.equal(levelFromXp(599), 3);
  assert.equal(levelFromXp(600), 4);
});

test('levelFromXp konsisten dengan xpAtLevelStart untuk level 1..80', () => {
  for (let n = 1; n <= 80; n++) {
    assert.equal(levelFromXp(xpAtLevelStart(n)), n, `awal level ${n}`);
    assert.equal(levelFromXp(xpAtLevelStart(n + 1) - 1), n, `akhir level ${n}`);
  }
});

test('levelProgress', () => {
  const p = levelProgress(150);
  assert.equal(p.level, 2);
  assert.equal(p.intoLevel, 50);
  assert.equal(p.levelSize, 200);
  assert.equal(p.xpToNext, 150);
  assert.equal(p.pct, 25);
  assert.equal(p.tier, 'beginner');
});

test('tier berdasarkan level', () => {
  const cases: Array<[number, string]> = [[1, 'beginner'], [5, 'beginner'], [6, 'explorer'], [10, 'explorer'], [11, 'builder'],
    [20, 'builder'], [21, 'achiever'], [30, 'achiever'], [31, 'specialist'], [40, 'specialist'], [41, 'master'], [50, 'master'], [51, 'legend']];
  for (const [lvl, tier] of cases) assert.equal(tierForLevel(lvl), tier, `level ${lvl}`);
});

test('XP tidak pernah negatif / mengurangi level (input negatif dianggap 0)', () => {
  assert.equal(levelFromXp(-50), 1);
  assert.equal(levelProgress(-1).totalXp, 0);
});

test('atribut & sapaan', () => {
  assert.equal(attributeLevel(0).level, 1);
  assert.equal(attributeLevel(25).level, 2);
  assert.equal(greetingKey(6), 'morning');
  assert.equal(greetingKey(12), 'afternoon');
  assert.equal(greetingKey(17), 'evening');
  assert.equal(greetingKey(23), 'night');
  assert.equal(greetingKey(2), 'night');
});
