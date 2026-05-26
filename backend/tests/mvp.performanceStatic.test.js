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
});
