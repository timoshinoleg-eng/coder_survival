import { createNextSeason } from '../src/utils/seasonCreation.js';
import { processPremiumRefunds } from '../src/utils/passRefund.js';

function mockClient(rows = []) {
  let callIndex = 0;
  return {
    query: async (sql, params) => {
      const response = rows[callIndex] || { rows: [] };
      callIndex++;
      return response;
    }
  };
}

describe('Season creation', () => {
  test('createNextSeason inserts sprint_passes and pass_rewards', async () => {
    const client = mockClient([
      { rows: [{ max_num: 1 }] },
      { rows: [{ id: 2, season_number: 2, season_name: 'Season 2', start_date: '2026-07-01', end_date: '2026-07-30', theme: 'default' }] },
      { rows: [] }
    ]);
    const result = await createNextSeason(client);
    expect(result.season.season_number).toBe(2);
    expect(result.season.season_name).toBe('Season 2');
    expect(result.rewardCount).toBe(50);
  });

  test('createNextSeason accepts overrides', async () => {
    const client = mockClient([
      { rows: [{ max_num: 5 }] },
      { rows: [{ id: 6, season_number: 6, season_name: 'Halloween', start_date: '2026-10-25', end_date: '2026-11-23', theme: 'spooky' }] },
      { rows: [] }
    ]);
    const result = await createNextSeason(client, {
      seasonNumber: 6,
      seasonName: 'Halloween',
      theme: 'spooky'
    });
    expect(result.season.season_name).toBe('Halloween');
    expect(result.season.theme).toBe('spooky');
  });
});

describe('Premium refund', () => {
  test('processPremiumRefunds distributes stars and ton to premium users', async () => {
    const queries = [];
    const client = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT pp.user_id')) {
          return { rows: [{ user_id: 1, current_level: 25, claimed_levels: Array.from({ length: 25 }, (_, i) => i + 1) }] };
        }
        if (sql.includes('SELECT COUNT(*) AS total_levels')) {
          return { rows: [{ total_levels: 50 }] };
        }
        return { rows: [] };
      }
    };

    const result = await processPremiumRefunds(client, 1);
    expect(result.processed).toBe(1);
    expect(result.totalStars).toBeGreaterThan(0);
    expect(result.totalTon).toBeGreaterThan(0);

    const updateQuery = queries.find(q => q.sql.includes('UPDATE progression'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery.params[0]).toBe(1);

    const flagQuery = queries.find(q => q.sql.includes('refund_processed'));
    expect(flagQuery).toBeDefined();
  });

  test('processPremiumRefunds returns zeros when no premium users', async () => {
    const client = {
      query: async () => ({ rows: [] })
    };
    const result = await processPremiumRefunds(client, 1);
    expect(result.processed).toBe(0);
    expect(result.totalStars).toBe(0);
  });

  test('refund scales with claimed levels', async () => {
    const queries = [];
    const client = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT pp.user_id')) {
          return { rows: [{ user_id: 1, current_level: 50, claimed_levels: Array.from({ length: 50 }, (_, i) => i + 1) }] };
        }
        if (sql.includes('SELECT COUNT(*) AS total_levels')) {
          return { rows: [{ total_levels: 50 }] };
        }
        return { rows: [] };
      }
    };

    const fullRefund = await processPremiumRefunds(client, 1);
    expect(fullRefund.totalStars).toBeGreaterThan(0);
  });
});
