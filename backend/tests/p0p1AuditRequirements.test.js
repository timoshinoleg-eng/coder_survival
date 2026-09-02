import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPRESSION_PASSIVE_RECOVERY_PER_HOUR } from '../src/utils/progression.js';
import { getNearRankOfferVariant } from '../src/utils/offers.js';
import { getSecondsToLocalMidnight, shouldOfferStreakSaver } from '../src/utils/streak.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('P0/P1 audit requirements', () => {
  test('passive depression recovery is fixed at 5 points per hour', () => {
    expect(DEPRESSION_PASSIVE_RECOVERY_PER_HOUR).toBe(5);
  });

  test('near-rank offer escalates at 85% and 95%', () => {
    const better = getNearRankOfferVariant({ xpProgress: 85, xpRequiredForNext: 100 });
    const lastChance = getNearRankOfferVariant({ xpProgress: 95, xpRequiredForNext: 100 });

    expect(better.variant).toBe('better_offer');
    expect(better.progressPercent).toBe(85);
    expect(lastChance.variant).toBe('last_chance');
    expect(lastChance.progressPercent).toBe(95);
  });

  test('streak saver uses the player local midnight window', () => {
    const now = new Date('2026-09-02T20:30:00.000Z'); // 23:30 at UTC+3
    expect(getSecondsToLocalMidnight(now, 180)).toBe(30 * 60);

    const streakState = {
      currentStreak: 7,
      lastLoginDate: '2026-09-01',
      protection: {}
    };
    expect(shouldOfferStreakSaver({
      streakState,
      energy: 0,
      todayDate: '2026-09-02',
      now,
      timezoneOffsetMinutes: 180
    })).toBe(true);
    expect(shouldOfferStreakSaver({
      streakState,
      energy: 0,
      todayDate: '2026-09-02',
      now,
      timezoneOffsetMinutes: 0
    })).toBe(false);
  });

  test('production Sprint Pass is achievable within 30 days at 120 baseline taps/day', () => {
    const migrationPath = path.resolve(__dirname, '../migrations/004_stage4_retention.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const tuples = [...sql.matchAll(/^\s*\((\d+),\s*(\d+),\s*'\{/gm)]
      .map((match) => ({ level: Number(match[1]), requiredXp: Number(match[2]) }));

    expect(tuples).toHaveLength(20);
    expect(tuples.map((entry) => entry.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    const configuredXp = tuples.reduce((sum, entry) => sum + entry.requiredXp, 0);
    // player_passes starts at level 1. Reaching level 20 consumes thresholds
    // 1..19; level 20's stored threshold would be a nonexistent 20→21 step.
    const xpToUnlockLevel20 = tuples.slice(0, -1).reduce((sum, entry) => sum + entry.requiredXp, 0);
    const baselineThirtyDayXp = 120 * 30; // 1 XP/tap, excludes quests/weekend bonuses.
    expect(configuredXp).toBe(915);
    expect(xpToUnlockLevel20).toBe(835);
    expect(xpToUnlockLevel20).toBeLessThanOrEqual(baselineThirtyDayXp);

    const questsSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/quests.js'), 'utf8');
    const streakSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/streak.js'), 'utf8');
    const buySource = fs.readFileSync(path.resolve(__dirname, '../src/routes/buy.js'), 'utf8');
    expect(questsSource).toContain('await addPassXp(client, userId');
    expect(streakSource).toContain('await addPassXp(client, userId');
    expect(questsSource).not.toContain('pass_state =');
    expect(streakSource).not.toContain('pass_state =');
    expect(buySource).toContain('streak_state, timezone_offset');
    expect(buySource).toContain('now.getTime() + timezoneOffset * 60000');
  });
});
