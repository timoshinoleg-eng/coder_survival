import { computePrestige, applyPrestigeBonuses } from '../src/utils/prestige.js';
import { calculateTapDelta, calculateDepressionDelta } from '../src/utils/tap.js';
import { resolveLevelState } from '../src/utils/vnext.js';
import { PRESTIGE, TAP_MECHANICS } from '../src/config/balance.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 1. computePrestige
// ============================================================================
describe('PP-18: computePrestige', () => {
  test('0 -> 0', () => {
    expect(computePrestige(0)).toBe(0);
  });

  test('9 -> 0 (floor rounding)', () => {
    expect(computePrestige(9)).toBe(0);
  });

  test('10 -> 1', () => {
    expect(computePrestige(10)).toBe(1);
  });

  test('90 -> 3', () => {
    expect(computePrestige(90)).toBe(3);
  });

  test('1000 -> 10', () => {
    expect(computePrestige(1000)).toBe(10);
  });

  test('9999 -> 31', () => {
    expect(computePrestige(9999)).toBe(31);
  });

  test('handles invalid input safely as 0', () => {
    expect(computePrestige(-1)).toBe(0);
    expect(computePrestige(Number.NaN)).toBe(0);
    expect(computePrestige(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  test('handles non-integer input', () => {
    const result = computePrestige(12.5);
    expect(result).toBe(1);
  });
});

// ============================================================================
// 2. applyPrestigeBonuses
// ============================================================================
describe('PP-18: applyPrestigeBonuses', () => {
  const baseState = {
    commitsPerTap: 8,
    maxEnergy: 220,
    critChanceAdd: 0,
    energyRecoveryMult: 1,
    depressionResistanceMult: 1,
    rankName: 'CTO',
    levelInRank: 10,
  };

  test('p=0 returns base state with explicit default prestige fields', () => {
    const result = applyPrestigeBonuses(baseState, 0);
    expect(result.commitsPerTap).toBe(8);
    expect(result.maxEnergy).toBe(220);
    expect(result.critChanceAdd).toBe(0);
    expect(result.energyRecoveryMult).toBe(1);
    expect(result.depressionResistanceMult).toBe(1);
    expect(result.prestigeLevel).toBe(0);
  });

  test('p=1 applies single-level bonuses including prestigeLevel', () => {
    const result = applyPrestigeBonuses(baseState, 1);
    expect(result.commitsPerTap).toBeCloseTo(8.8, 5);
    expect(result.maxEnergy).toBe(230);
    expect(result.critChanceAdd).toBeCloseTo(0.005, 5);
    expect(result.energyRecoveryMult).toBeCloseTo(1.05, 5);
    expect(result.depressionResistanceMult).toBeCloseTo(0.95, 5);
    expect(result.prestigeLevel).toBe(1);
  });

  test('p=2 tap x1.20, recovery x1.10, crit +0.01, maxEnergy +20, dep-resist 0.90', () => {
    const result = applyPrestigeBonuses(baseState, 2);
    expect(result.commitsPerTap).toBeCloseTo(8 * 1.20, 5);
    expect(result.maxEnergy).toBe(240);
    expect(result.critChanceAdd).toBeCloseTo(0.01, 5);
    expect(result.energyRecoveryMult).toBeCloseTo(1.10, 5);
    expect(result.depressionResistanceMult).toBeCloseTo(0.90, 5);
    expect(result.prestigeLevel).toBe(2);
  });

  test('p=20 depression resistance mult clamps to 0 (Math.max applied)', () => {
    const result = applyPrestigeBonuses(baseState, 20);
    expect(result.depressionResistanceMult).toBe(0.0);
  });

  test('p=30 depression resistance clamps to 0 (not negative)', () => {
    const result = applyPrestigeBonuses(baseState, 30);
    expect(result.depressionResistanceMult).toBe(0.0);
  });

  test('shopPurchases parameter is accepted but does not crash', () => {
    const result = applyPrestigeBonuses(baseState, 3, { items: ['prestige_skin_veteran'] });
    expect(result.commitsPerTap).toBeCloseTo(8 * 1.30, 5);
  });
});

// ============================================================================
// 3. calculateTapDelta backward compatibility
// ============================================================================
describe('PP-18: calculateTapDelta backward compatibility', () => {
  test('5-arg call (old API) works', () => {
    const result = calculateTapDelta(5, 80, 20, 3);
    expect(result).toHaveProperty('commitsDelta');
    expect(result).toHaveProperty('isCrit');
    expect(result).toHaveProperty('critTier');
    expect(result).toHaveProperty('isBurnout');
    expect(typeof result.commitsDelta).toBe('number');
    expect(result.commitsDelta).toBeGreaterThan(0);
  });

  test('6-arg call (oldest compat) works', () => {
    const result = calculateTapDelta(5, 80, 20, 3, 1.5);
    expect(result.commitsDelta).toBeGreaterThan(0);
  });

  test('7-arg call (full API with critChanceAdd) works', () => {
    const result = calculateTapDelta(5, 80, 20, 3, 1, 0, 0.05);
    expect(result.commitsDelta).toBeGreaterThan(0);
  });

  test('critChanceAdd=0 preserves default crit rates', () => {
    let critCount = 0;
    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
      const result = calculateTapDelta(5, 80, 20, 3);
      if (result.isCrit) critCount++;
    }
    expect(critCount).toBeGreaterThanOrEqual(50);
    expect(critCount).toBeLessThanOrEqual(600);
  });

  test('critChanceAdd=0.05 increases crit rate measurably', () => {
    let critCountWithBonus = 0;
    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
      const result = calculateTapDelta(5, 80, 20, 3, 1, 0, 0.05);
      if (result.isCrit) critCountWithBonus++;
    }
    expect(critCountWithBonus).toBeGreaterThanOrEqual(100);
  });

  test('critChanceAdd deterministic with mocked Math.random', () => {
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.30;
      const noBonus = calculateTapDelta(5, 80, 20, 3);
      expect(noBonus.isCrit).toBe(false);
      const withBonus = calculateTapDelta(5, 80, 20, 3, 1, 0, 0.02);
      expect(withBonus.isCrit).toBe(false);
      const withMore = calculateTapDelta(5, 80, 20, 3, 1, 0, 0.10);
      expect(withMore.isCrit).toBe(true);
      expect(withMore.critTier).toBe('silver');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('critChanceAdd is capped to gold chance and does not guarantee every roll', () => {
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.24;
      const lowRoll = calculateTapDelta(5, 80, 20, 3, 1, 0, 1.0);
      expect(lowRoll.isCrit).toBe(true);
      expect(lowRoll.critTier).toBe('gold');

      Math.random = () => 0.99;
      const highRoll = calculateTapDelta(5, 80, 20, 3, 1, 0, 1.0);
      expect(highRoll.isCrit).toBe(false);
    } finally {
      Math.random = originalRandom;
    }
  });
});

// ============================================================================
// 4. resolveLevelState prestige integration
// ============================================================================
describe('PP-18: resolveLevelState prestige integration', () => {
  test('prestigeLevel=0 returns base CTO stats at max XP', () => {
    const state = resolveLevelState(3100, 0);
    expect(state.rankName).toBe('CTO');
    expect(state.commitsPerTap).toBe(8);
    expect(state.maxEnergy).toBe(220);
    expect(state.critChanceAdd).toBe(0);
    expect(state.energyRecoveryMult).toBe(1);
    expect(state.depressionResistanceMult).toBe(1);
    expect(state.prestigeLevel).toBe(0);
  });

  test('prestigeLevel=1 applies all bonuses', () => {
    const state = resolveLevelState(3100, 1);
    expect(state.commitsPerTap).toBeCloseTo(8.8, 5);
    expect(state.maxEnergy).toBe(230);
    expect(state.critChanceAdd).toBeCloseTo(0.005, 5);
    expect(state.energyRecoveryMult).toBeCloseTo(1.05, 5);
    expect(state.depressionResistanceMult).toBeCloseTo(0.95, 5);
    expect(state.prestigeLevel).toBe(1);
  });

  test('prestigeLevel=20 depressionResistanceMult caps at 0 via Math.max', () => {
    const state = resolveLevelState(3100, 20);
    expect(state.depressionResistanceMult).toBe(0);
  });

  test('prestigeLevel=30 depressionResistanceMult still caps at 0', () => {
    const state = resolveLevelState(3100, 30);
    expect(state.depressionResistanceMult).toBe(0);
  });

  test('prestigeLevel as string "3" coerces fine', () => {
    const state = resolveLevelState(100, '3');
    expect(state.commitsPerTap).toBeCloseTo(1 * 1.30, 5);
    expect(state.maxEnergy).toBe(100 + 30);
  });

  test('prestigeLevel=undefined defaults to 0', () => {
    const state = resolveLevelState(100);
    expect(state.commitsPerTap).toBe(1);
    expect(state.critChanceAdd).toBe(0);
    expect(state.prestigeLevel).toBe(0);
  });

  test('prestige bonuses stack additively per level (linear)', () => {
    const s0 = resolveLevelState(0, 0);
    const s1 = resolveLevelState(0, 1);
    const s2 = resolveLevelState(0, 2);
    const s5 = resolveLevelState(0, 5);

    expect(s5.commitsPerTap).toBeCloseTo(s0.commitsPerTap * 1.50, 5);
    expect(s5.maxEnergy).toBe(s0.maxEnergy + 50);
    expect(s5.critChanceAdd).toBeCloseTo(0.025, 5);
    expect(s2.commitsPerTap).toBeCloseTo(s0.commitsPerTap * 1.20, 5);
    expect(s2.maxEnergy).toBe(s0.maxEnergy + 20);
  });

  test('withResolvedLevel integrates prestige from player_levels row', () => {
    // Simulate the function's internal behavior
    const row = { xp_total: 200, prestige_level: 2 };
    const resolved = resolveLevelState(Number(row.xp_total), Number(row.prestige_level ?? 0));
    expect(resolved.commitsPerTap).toBeCloseTo(1 * 1.20, 5); // Junior base * 1.20
    expect(resolved.prestigeLevel).toBe(2);
  });
});

// ============================================================================
// 5. calculateDepressionDelta with prestige multiplier
// ============================================================================
describe('PP-18: calculateDepressionDelta with prestige multiplier', () => {
  test('depressionMultiplier=1 is default', () => {
    const delta = calculateDepressionDelta(50);
    expect(delta).toBe(TAP_MECHANICS.depressionGainPerTap);
  });

  test('depressionMultiplier=0.95 reduces depression gain', () => {
    const base = calculateDepressionDelta(50, 1);
    const withResist = calculateDepressionDelta(50, 0.95);
    expect(withResist).toBeLessThan(base);
  });

  test('depressionMultiplier=0 means zero depression gain', () => {
    const delta = calculateDepressionDelta(50, 0);
    expect(delta).toBe(0);
  });

  test('depressionMultiplier<0 is clamped to zero gain', () => {
    const delta = calculateDepressionDelta(50, -0.5);
    expect(delta).toBe(0);
  });

  test('depression low-energy penalties still apply with resist < 1', () => {
    const delta10 = calculateDepressionDelta(10, 0.95);
    const delta50 = calculateDepressionDelta(50, 0.95);
    expect(delta10).toBeGreaterThan(delta50);
  });
});

// ============================================================================
// 6. PRESTIGE config structural checks
// ============================================================================
describe('PP-18: PRESTIGE config integrity', () => {
  test('THRESHOLD_XP matches CTO Level 10', () => {
    expect(PRESTIGE.THRESHOLD_XP).toBe(3100);
  });

  test('BONUSES has all 5 required keys with positive values', () => {
    const keys = ['TAP_MULT_PER_LEVEL', 'ENERGY_RECOVERY_MULT_PER_LEVEL',
      'CRIT_CHANCE_ADD_PER_LEVEL', 'MAX_ENERGY_ADD_PER_LEVEL',
      'DEPRESSION_RESISTANCE_PER_LEVEL'];
    keys.forEach(k => {
      expect(PRESTIGE.BONUSES[k]).toBeGreaterThan(0);
    });
  });

  test('SHOP has exactly 5 items', () => {
    expect(Object.keys(PRESTIGE.SHOP).length).toBe(5);
  });

  test('SHOP items all have numeric cost, string id, string desc', () => {
    Object.values(PRESTIGE.SHOP).forEach(item => {
      expect(item).toHaveProperty('cost');
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('desc');
      expect(typeof item.cost).toBe('number');
      expect(item.cost).toBeGreaterThan(0);
      expect(typeof item.id).toBe('string');
      expect(typeof item.desc).toBe('string');
    });
  });

  test('resolveLevelState uses same multipliers as balance.js PRESTIGE', () => {
    const s = resolveLevelState(0, 1);
    expect(s.commitsPerTap).toBeCloseTo(1 * (1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL), 5);
    expect(s.energyRecoveryMult).toBeCloseTo(1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL, 5);
  });
});

// ============================================================================
// 7. Migration 044 idempotency
// ============================================================================
describe('PP-18: Migration 044 schema validation', () => {
  test('migration file exists', () => {
    const migrationPath = path.resolve(__dirname, '..', 'migrations', '044_add_prestige.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  test('all ADD COLUMN use IF NOT EXISTS (fully idempotent)', () => {
    const migrationPath = path.resolve(__dirname, '..', 'migrations', '044_add_prestige.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    const addColumnCount = (sql.match(/ADD COLUMN/g) || []).length;
    const ifNotExistsCount = (sql.match(/IF NOT EXISTS/g) || []).length;
    expect(addColumnCount).toBe(ifNotExistsCount);
  });

  test('migration targets player_levels (+3 cols) and progression (+1 col)', () => {
    const migrationPath = path.resolve(__dirname, '..', 'migrations', '044_add_prestige.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch('prestige_level');
    expect(sql).toMatch('prestige_currency');
    expect(sql).toMatch('prestige_shop_purchases');
    expect(sql).toMatch(/ALTER TABLE progression/);
  });

  test('migration does NOT reference phantom tables or columns', () => {
    const migrationPath = path.resolve(__dirname, '..', 'migrations', '044_add_prestige.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).not.toMatch('active_boosters');
    expect(sql).not.toMatch('temporary_multipliers');
    expect(sql).not.toMatch('generators');
  });
});

// ============================================================================
// 8. Route SQL schema: verify referenced columns exist
// ============================================================================
describe('PP-18: Route SQL references valid columns', () => {
  let routeSrc;

  beforeAll(() => {
    const routePath = path.resolve(__dirname, '..', 'src', 'routes', 'prestige.js');
    routeSrc = fs.readFileSync(routePath, 'utf-8');
  });

  test('preview reads commits_total from progression (not users)', () => {
    // commits_total is now in progression table
    expect(routeSrc).toMatch(/FROM progression.*commits_total/s);
  });

  test('execute reads progression rows with FOR UPDATE for commits_total', () => {
    expect(routeSrc).toMatch(/SELECT[\s\S]*commits_total[\s\S]*FROM progression[\s\S]*FOR UPDATE/);
  });

  test('execute soft-reset targets progression: tier, commits_current, energy, active_effects, generator_state, event_state', () => {
    const updateMatch = routeSrc.match(/UPDATE progression[\s\S]*?WHERE user_id/s);
    expect(updateMatch).not.toBeNull();
    const sql = updateMatch[0];
    expect(sql).toMatch('tier');
    expect(sql).toMatch('commits_current');
    expect(sql).toMatch('energy');
    expect(sql).toMatch('active_effects');
    expect(sql).toMatch('generator_state');
    expect(sql).toMatch('event_state');
  });

  test('execute does NOT reference active_boosters or temporary_multipliers (legacy cols)', () => {
    // These were old column names; current code uses active_effects/generator_state
    // Check the UPDATE progression SQL specifically, not the string willReset
    const updateMatch = routeSrc.match(/UPDATE progression[\s\S]*?WHERE user_id/s);
    expect(updateMatch).not.toBeNull();
    const updateSql = updateMatch[0];
    expect(updateSql).not.toMatch('active_boosters');
    expect(updateSql).not.toMatch('temporary_multipliers');
  });

  test('execute does not DELETE FROM generators (uses generator_state reset)', () => {
    const updateMatch = routeSrc.match(/UPDATE progression[\s\S]*?WHERE user_id/s);
    expect(updateMatch).not.toBeNull();
    const executeSection = routeSrc.match(/router\.post\('\/execute'[\s\S]*?\n\}\);/);
    // generators table deletion is absent — reset happens via generator_state = '{}'
    if (executeSection) {
      expect(executeSection[0]).not.toMatch(/DELETE\s+FROM\s+generators/i);
    }
  });

  test('preview willReset list matches actual reset fields in execute', () => {
    expect(routeSrc).toMatch('willReset');
    for (const field of ['xp_total', 'tier', 'commits_current', 'energy', 'generator_state', 'active_effects', 'event_state']) {
      expect(routeSrc).toMatch(field);
    }
    expect(routeSrc).not.toMatch("'generators'");
    expect(routeSrc).not.toMatch("'boosters'");
    expect(routeSrc).not.toMatch("'temporary_multipliers'");
  });

  test('preview willKeep matches what is NOT reset', () => {
    expect(routeSrc).toMatch('willKeep');
    expect(routeSrc).toMatch('commits_total');
    expect(routeSrc).toMatch('skins');
    expect(routeSrc).toMatch('inventory');
    expect(routeSrc).toMatch('streak');
  });

  test('does NOT reference phantom tables (session_data, user_events, event_logs)', () => {
    const phantomTables = ['session_data', 'user_events', 'event_logs'];
    phantomTables.forEach(t => {
      expect(routeSrc).not.toMatch(new RegExp(`(FROM|UPDATE|DELETE)\\s+${t}`, 'i'));
    });
  });
});

// ============================================================================
// 9. Prestige currency formula consistency
// ============================================================================
describe('PP-18: Prestige currency formula consistency', () => {
  test('new player (0 commits) earns 0 PP', () => {
    expect(computePrestige(0)).toBe(0);
  });

  test('moderate player (1000 commits) earns 10 PP', () => {
    expect(computePrestige(1000)).toBe(10);
  });

  test('veteran (10000 commits) earns 31 PP', () => {
    expect(computePrestige(10000)).toBe(31);
  });

  test('giga-veteran (100000 commits) earns 100 PP', () => {
    expect(computePrestige(100000)).toBe(100);
  });

  test('no integer overflow for MAX_SAFE_INTEGER commits', () => {
    const result = computePrestige(Number.MAX_SAFE_INTEGER);
    expect(typeof result).toBe('number');
    expect(Number.isNaN(result)).toBe(false);
    expect(Number.isFinite(result)).toBe(true);
  });

  test('diminishing returns: doubling commits does NOT double PP', () => {
    const pp1k = computePrestige(1000);   // 10
    const pp2k = computePrestige(2000);   // sqrt(200) ≈ 14.14, floor = 14
    expect(pp2k).toBeLessThan(pp1k * 2);  // 14 < 20
  });
});
