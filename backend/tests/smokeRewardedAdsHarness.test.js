import crypto from 'crypto';
import { buildSignedInitData, corruptInitDataSignature, summarizeResults } from '../../scripts/smoke_rewarded_ads_harness.mjs';

function verifyHmacInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const pairs = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort((left, right) => left.localeCompare(right));
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return hash === expected;
}

describe('signed rewarded-ads smoke fixtures', () => {
  const botToken = '900000:smoke-harness-test-token';

  test('builds a valid, deterministic Telegram HMAC initData fixture', () => {
    const input = { telegramId: 785000001, username: 'smoke_valid', botToken, authDate: 1700000000 };
    const first = buildSignedInitData(input);
    const second = buildSignedInitData(input);

    expect(first).toBe(second);
    expect(verifyHmacInitData(first, botToken)).toBe(true);
    expect(new URLSearchParams(first).get('auth_date')).toBe('1700000000');
  });

  test('corrupts the signature while preserving the payload used by a negative check', () => {
    const signed = buildSignedInitData({
      telegramId: 785000002,
      username: 'smoke_tampered',
      botToken,
      authDate: 1700000000,
    });
    const corrupted = corruptInitDataSignature(signed);

    expect(verifyHmacInitData(corrupted, botToken)).toBe(false);
    expect(new URLSearchParams(corrupted).get('user')).toBe(new URLSearchParams(signed).get('user'));
    expect(new URLSearchParams(corrupted).get('auth_date')).toBe('1700000000');
  });

  test('treats owner-gated SKIP as incomplete rather than a passing smoke verdict', () => {
    const summary = summarizeResults([
      { name: 'signed authentication', status: 'PASS' },
      { name: 'provider mutation', status: 'SKIP' },
    ]);

    expect(summary).toEqual({
      total: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
      verdict: 'INCOMPLETE',
    });
  });
});
