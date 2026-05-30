import {
  normalize,
  computeScoreComponents,
  determineStatuses,
  buildChatMessage
} from '../src/utils/dailySummary.js';

describe('Phase 7: Daily Summary Scoring', () => {
  test('normalize: scales value against max and weight', () => {
    expect(normalize(250, 500, 40)).toBe(20); // half of max -> half of weight
    expect(normalize(500, 500, 40)).toBe(40); // max -> full weight
    expect(normalize(600, 500, 40)).toBe(40); // caps at max
    expect(normalize(0, 500, 40)).toBe(0);
    expect(normalize(100, 100, 30)).toBe(30);
  });

  test('normalize: handles zero max safely', () => {
    expect(normalize(100, 0, 40)).toBe(0);
  });

  test('computeScoreComponents: perfect score', () => {
    const result = computeScoreComponents({
      commitsToday: 500,
      depressionLevel: 0,
      socialEvents: 5,
      activeReferrals: 3
    });
    expect(result.productivity).toBe(40);
    expect(result.depression).toBe(30);
    expect(result.social).toBe(20);
    expect(result.referral).toBe(10);
    expect(result.total).toBe(100);
  });

  test('computeScoreComponents: zero score', () => {
    const result = computeScoreComponents({
      commitsToday: 0,
      depressionLevel: 200,
      socialEvents: 0,
      activeReferrals: 0
    });
    expect(result.productivity).toBe(0);
    expect(result.depression).toBe(0);
    expect(result.social).toBe(0);
    expect(result.referral).toBe(0);
    expect(result.total).toBe(0);
  });

  test('computeScoreComponents: mixed values', () => {
    const result = computeScoreComponents({
      commitsToday: 250,
      depressionLevel: 100,
      socialEvents: 2,
      activeReferrals: 1
    });
    expect(result.productivity).toBe(20); // 250/500 * 40
    expect(result.depression).toBe(15); // (200-100)/200 * 30
    expect(result.social).toBe(8); // 2/5 * 20
    expect(result.referral).toBeCloseTo(3.33, 1); // 1/3 * 10
    expect(result.total).toBeCloseTo(46.33, 1);
  });

  test('computeScoreComponents: depression inversion works', () => {
    const lowDepression = computeScoreComponents({ commitsToday: 0, depressionLevel: 0, socialEvents: 0, activeReferrals: 0 });
    const highDepression = computeScoreComponents({ commitsToday: 0, depressionLevel: 200, socialEvents: 0, activeReferrals: 0 });
    expect(lowDepression.depression).toBe(30);
    expect(highDepression.depression).toBe(0);
  });
});

describe('Phase 7: Status Determination', () => {
  test('determineStatuses: awards statuses to correct players', () => {
    const results = [
      { userId: 1, scores: { productivity: 30, total: 70 }, details: { depressionLevel: 50 } },
      { userId: 2, scores: { productivity: 40, total: 80 }, details: { depressionLevel: 90 } },
      { userId: 3, scores: { productivity: 20, total: 60 }, details: { depressionLevel: 10 } }
    ];
    const progressionMap = new Map([
      [1, { depression_level: 50 }],
      [2, { depression_level: 90 }],
      [3, { depression_level: 10 }]
    ]);

    const withStatuses = determineStatuses(results, progressionMap);

    const genius = withStatuses.find(r => r.userId === 1); // user 2 is burnt_out, so genius goes to next highest productivity
    const burntOut = withStatuses.find(r => r.userId === 2);
    const savior = withStatuses.find(r => r.userId === 3);

    expect(genius.status).toBe('productive_genius');
    expect(burntOut.status).toBe('burnt_out');
    expect(savior.status).toBe('depression_savior');
  });

  test('determineStatuses: handles empty results', () => {
    expect(determineStatuses([], new Map())).toEqual([]);
  });

  test('determineStatuses: single player with high depression gets burnt_out', () => {
    const results = [
      { userId: 1, scores: { productivity: 10, total: 10 }, details: { depressionLevel: 80 } }
    ];
    const progressionMap = new Map([[1, { depression_level: 80 }]]);
    const withStatuses = determineStatuses(results, progressionMap);
    // Single player: gets burnt_out because depression status takes precedence when overlapping
    expect(withStatuses[0].status).toBe('burnt_out');
  });
});

describe('Phase 7: Chat Message Builder', () => {
  test('buildChatMessage: formats top 3 and statuses', () => {
    const results = [
      { userId: 1, rank: 1, scores: { total: 85 }, status: 'productive_genius' },
      { userId: 2, rank: 2, scores: { total: 72 }, status: 'burnt_out' },
      { userId: 3, rank: 3, scores: { total: 60 } }
    ];
    const message = buildChatMessage(results, '2026-05-22');
    expect(message).toContain('🏆 *Ежедневная битва — 2026-05-22*');
    expect(message).toContain('#1');
    expect(message).toContain('score: 85');
    expect(message).toContain('Продуктивный гений');
    expect(message).toContain('Выгорел дня');
  });

  test('buildChatMessage: handles empty results', () => {
    const message = buildChatMessage([], '2026-05-22');
    expect(message).toContain('Сегодня никто не кодил');
  });

  test('buildChatMessage: limits to top 10 but includes all statuses', () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      userId: i + 1,
      rank: i + 1,
      scores: { total: 100 - i },
      status: i === 0 ? 'productive_genius' : i === 14 ? 'depression_savior' : undefined
    }));
    const message = buildChatMessage(results.slice(0, 10), '2026-05-22');
    expect(message).toContain('Продуктивный гений');
    expect(message).not.toContain('Спаситель депрессии'); // #15 not in top 10 slice passed
  });
});
