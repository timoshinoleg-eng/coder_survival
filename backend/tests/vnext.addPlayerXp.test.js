import { addPlayerXp } from '../src/utils/vnext.js';

describe('addPlayerXp', () => {
  test('casts xp delta parameter to bigint in insert comparisons', async () => {
    const queries = [];
    const client = {
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes('INSERT INTO player_levels')) {
          return {
            rows: [
              {
                user_id: 1,
                xp_total: 25,
                prestige_level: 0,
              },
            ],
          };
        }
        if (sql.includes('SELECT mu_currency FROM progression')) {
          return { rows: [{ mu_currency: 0 }] };
        }
        return { rows: [] };
      },
    };

    await addPlayerXp(client, 1, 25);

    const insertSql = queries.find((sql) => sql.includes('INSERT INTO player_levels'));
    expect(insertSql).toContain('$2::bigint');
    expect(insertSql).not.toContain('VALUES ($1, $2,');
    expect(insertSql).not.toContain('CASE WHEN $2 <');
  });
});
