import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd(), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('MVP performance guardrails', () => {
  test('state endpoint does not pin a long explicit transaction', () => {
    const source = read('backend/src/routes/state.js');
    expect(source).not.toContain('client.query("BEGIN")');
    expect(source).not.toContain('client.query("COMMIT")');
    expect(source).not.toContain('client.query("ROLLBACK")');
  });

  test('daily quests are created in bulk and tap progress does not re-run ensure on return', () => {
    const source = read('backend/src/utils/vnext.js');
    expect(source).toContain('jsonb_to_recordset');
    expect(source).not.toContain('for (const quest of DAILY_QUEST_DEFS)');
    expect(source).not.toContain('return ensureDailyQuests(client, userId);');
  });

  test('pool and health check have production-safe limits and release discipline', () => {
    const source = read('backend/src/index.js');
    expect(source).toContain('max: Number(process.env.DB_POOL_MAX || 50)');
    expect(source).toContain('connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000)');
    expect(source).toContain('finally');
    expect(source).toContain('client.release()');
  });

  test('frontend loadState is deduplicated while in flight', () => {
    const source = read('frontend/src/hooks/useGameState.js');
    expect(source).toContain('loadStatePromiseRef');
    expect(source).toContain('if (loadStatePromiseRef.current)');
  });

  test('performance indexes migration is present', () => {
    const migration = read('backend/migrations/043_performance_indexes.sql');
    expect(migration).toContain('idx_pass_rewards_pass_id');
    expect(migration).toContain('idx_team_members_team_id');
    expect(migration).toContain('idx_event_contributions_event_id');
  });

  test('tap endpoint accepts capped batches and avoids redundant hot-path work', () => {
    const source = read('backend/src/routes/tap.js');
    expect(source).toContain('requestedTapCount');
    expect(source).toContain('actualTapCount');
    expect(source).toContain('Math.min(requestedTapCount, 20)');
    expect(source).not.toContain("getDailyQuestSummary");
    expect(source).not.toContain(".catch(() => {})");
  });

  test('tap context offers run after the tap transaction commits', () => {
    const source = read('backend/src/routes/tap.js');
    const lastCommitIndex = source.lastIndexOf("await client.query('COMMIT');");
    const offerIndex = source.indexOf('await getContextOffer');
    expect(lastCommitIndex).toBeGreaterThan(-1);
    expect(offerIndex).toBeGreaterThan(lastCommitIndex);
  });

  test('sprint pass claim inserts the claim before applying reward', () => {
    const route = read('backend/src/routes/pass.js');
    const util = read('backend/src/utils/pass.js');
    const claimRouteStart = route.indexOf("router.post(['/claim/:level', '/claim']");
    const claimRoute = route.slice(claimRouteStart);
    expect(claimRoute).toContain("await client.query('BEGIN');");
    expect(claimRoute).toContain("await client.query('COMMIT');");
    expect(claimRoute).toContain("await client.query('ROLLBACK');");

    const insertIndex = util.indexOf('INSERT INTO pass_claims');
    const rewardIndex = util.indexOf('const rewardResult = await applyReward');
    expect(insertIndex).toBeGreaterThan(-1);
    expect(rewardIndex).toBeGreaterThan(insertIndex);
    expect(util).toContain('ON CONFLICT (user_id, pass_id, level, track) DO NOTHING');
    expect(util).toContain('RETURNING id');
    expect(route).toContain('success: true, level, track');
    expect(util).toContain("premiumPassProduct: getProductById('premium_pass')");
  });

  test('rate limit accounts for batch tap increments', () => {
    const source = read('backend/src/middleware/rateLimit.js');
    expect(source).toContain('tapIncrement');
    expect(source).toContain('rate_limit_user.tap_count + $2');
    expect(source).toContain('rate_limit_ip.tap_count + $2');
  });

  test('heart attack reset returns the updated progression row without a follow-up SELECT', () => {
    const heartAttack = read('backend/src/utils/heartAttack.js');
    const tap = read('backend/src/routes/tap.js');
    expect(heartAttack).toContain('RETURNING *');
    expect(tap).not.toContain('resetProgressionResult');
  });
});
