import { jest } from '@jest/globals';
import { checkTapRateLimit } from '../src/middleware/rateLimit.js';

function createRateLimitClient(userTapCounts, ipTapCount = 1) {
  let userQueryIndex = 0;
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('rate_limit_user')) {
        const tapCount = userTapCounts[Math.min(userQueryIndex, userTapCounts.length - 1)];
        userQueryIndex += 1;
        return { rows: [{ tap_count: tapCount }] };
      }
      if (sql.includes('rate_limit_ip')) {
        return { rows: [{ tap_count: ipTapCount }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}

describe('tap rate limiter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RATE_LIMIT_MAX_TAPS_PER_SECOND = '15';
    process.env.RATE_LIMIT_SOFT_BAN_THRESHOLD = '25';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('applies per-second tap limits across the tracking window', async () => {
    const client = createRateLimitClient([60]);

    const result = await checkTapRateLimit(client, 1, '127.0.0.1', 20);

    expect(result.allowed).toBe(true);
    expect(result.info).toMatchObject({
      maxPerSecond: 15,
      windowSeconds: 5,
      burstLimit: 75,
      softBanLimit: 125,
      userTapCount: 60,
    });
  });

  test('blocks bursts above the per-user window limit', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createRateLimitClient([76]);

    const result = await checkTapRateLimit(client, 1, '127.0.0.1', 20);

    expect(result).toMatchObject({
      allowed: false,
      status: 429,
      payload: { type: 'burst_limit', retryAfter: 1 },
    });
  });

  test('soft-ban threshold is also scaled to the tracking window', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createRateLimitClient([126]);

    const result = await checkTapRateLimit(client, 1, '127.0.0.1', 20);

    expect(result).toMatchObject({
      allowed: false,
      status: 429,
      payload: { type: 'soft_ban', retryAfter: 60 },
    });
  });

  test('normal burst of 60 taps within window is allowed (no 429)', async () => {
    const client = createRateLimitClient([60]);

    const result = await checkTapRateLimit(client, 1, '127.0.0.1', 20);

    expect(result.allowed).toBe(true);
    expect(result.info).toMatchObject({
      userTapCount: 60,
      burstLimit: 75,
      softBanLimit: 125,
    });
  });
});
