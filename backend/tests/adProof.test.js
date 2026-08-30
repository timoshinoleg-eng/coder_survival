import { jest } from '@jest/globals';
import crypto from 'crypto';
import {
  verifyAdProof,
  verifyAdsgramCallbackSignature,
  verifyPropellerCallbackHash,
} from '../src/utils/adProof.js';

describe('adProof — negative / boundary security', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('mock provider is always accepted (local/dev shortcut)', async () => {
    expect(await verifyAdProof('mock', null, 'any-nonce')).toBe(true);
    expect(await verifyAdProof('mock', { foo: 'bar' }, 'any-nonce')).toBe(true);
  });

  test('unknown provider is rejected', async () => {
    expect(await verifyAdProof('some-new-adnet', { proof: 'x' }, 'nonce')).toBe(false);
  });

  test('non-object proof is rejected', async () => {
    expect(await verifyAdProof('admob', null, 'nonce')).toBe(false);
    expect(await verifyAdProof('admob', 'string-proof', 'nonce')).toBe(false);
  });

  test('admob proof without a verifiable query string is rejected (no network)', async () => {
    expect(await verifyAdProof('admob', {}, 'nonce')).toBe(false);
    expect(await verifyAdProof('admob', { callbackUrl: 'https://example.com/no-sig' }, 'nonce')).toBe(false);
  });

  test('yandex proof without secret is rejected', async () => {
    delete process.env.YANDEX_REWARDED_SECRET;
    expect(await verifyAdProof('yandex', { signature: 'abc', payload: { nonce: 'n' } }, 'n')).toBe(false);
  });

  test('yandex proof with wrong signature is rejected', async () => {
    process.env.YANDEX_REWARDED_SECRET = 'test-secret';
    const proof = { signature: 'totally-wrong', payload: { nonce: 'n', user_id: '5' } };
    expect(await verifyAdProof('yandex', proof, 'n')).toBe(false);
  });

  test('yandex proof with nonce mismatch is rejected', async () => {
    process.env.YANDEX_REWARDED_SECRET = 'test-secret';
    const proof = { signature: 'x', payload: { nonce: 'expected', user_id: '5' } };
    expect(await verifyAdProof('yandex', proof, 'different')).toBe(false);
  });

  test('adsgram callback signature rejects empty secret / empty signature', () => {
    expect(verifyAdsgramCallbackSignature({ a: 1 }, 'sig', '')).toBe(false);
    expect(verifyAdsgramCallbackSignature({ a: 1 }, '', 'secret')).toBe(false);
  });

  test('adsgram callback signature verifies a correct HMAC and rejects a wrong one', () => {
    const secret = 'adsgram-secret';
    const payload = { a: 1, b: 'two' };
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
    expect(verifyAdsgramCallbackSignature(payload, expected, secret)).toBe(true);
    expect(verifyAdsgramCallbackSignature(payload, 'wrong', secret)).toBe(false);
  });

  test('propeller callback hash rejects missing fields', () => {
    expect(verifyPropellerCallbackHash({ eventId: '1', userId: '2' })).toBe(false);
    expect(verifyPropellerCallbackHash({ eventId: '1', userId: '2', hash: 'h', secret: '' })).toBe(false);
  });

  test('propeller callback hash verifies a correct MD5 and rejects a wrong one', () => {
    const secret = 'prop-secret';
    const expected = crypto
      .createHash('md5')
      .update(`evtusr${secret}`, 'utf8')
      .digest('hex');
    expect(
      verifyPropellerCallbackHash({ eventId: 'evt', userId: 'usr', hash: expected, secret }),
    ).toBe(true);
    expect(
      verifyPropellerCallbackHash({ eventId: 'evt', userId: 'usr', hash: 'wrong', secret }),
    ).toBe(false);
  });
});
