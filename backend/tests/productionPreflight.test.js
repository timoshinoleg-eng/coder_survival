import { jest } from '@jest/globals';
import { assertProductionConfig, inspectProductionConfig } from '../src/config/productionPreflight.js';

function validProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    BOT_TOKEN: 'test-bot-token',
    DATABASE_URL: 'postgresql://test:password@db.example.test/coder_survival',
    BOT_BACKEND_SECRET: 'test-bot-backend-secret',
    ADMIN_API_SECRET: 'test-admin-secret',
    WEBAPP_URL: 'https://app.example.test',
    FRONTEND_URL: 'https://app.example.test',
    INIT_DATA_MAX_AGE_SECONDS: '3600',
    PAYMENTS_ENABLED: 'false',
    REWARDED_AD_PROVIDER: 'adsgram',
    ADSGRAM_SECRET: 'test-adsgram-secret',
    ...overrides,
  };
}

describe('production configuration preflight', () => {
  test('accepts a complete HTTPS allowlist configuration without exposing values', () => {
    const findings = inspectProductionConfig(validProductionEnv());

    expect(findings).toEqual({ errors: [], warnings: [] });
  });

  test('fails closed for missing release-critical secrets and CORS allowlist', () => {
    const findings = inspectProductionConfig(validProductionEnv({
      BOT_TOKEN: '',
      BOT_BACKEND_SECRET: '',
      ADMIN_API_SECRET: '',
      FRONTEND_URL: '',
      CORS_ALLOWED_ORIGINS: '',
    }));

    expect(findings.errors).toEqual(expect.arrayContaining([
      'MISSING_TELEGRAM_BOT_TOKEN',
      'MISSING_BOT_BACKEND_SECRET',
      'MISSING_ADMIN_API_SECRET',
      'MISSING_CORS_ALLOWLIST',
    ]));
  });

  test('rejects insecure CORS, widened auth replay windows and enabled payments', () => {
    const findings = inspectProductionConfig(validProductionEnv({
      FRONTEND_URL: 'https://*.vercel.app',
      INIT_DATA_MAX_AGE_SECONDS: '3601',
      PAYMENTS_ENABLED: 'true',
    }));

    expect(findings.errors).toEqual(expect.arrayContaining([
      'INVALID_CORS_ALLOWLIST',
      'INVALID_INIT_DATA_MAX_AGE_SECONDS',
      'PAYMENTS_MUST_REMAIN_DISABLED',
    ]));
  });

  test('requires the matching rewarded provider secret when an operator declares a provider', () => {
    const findings = inspectProductionConfig(validProductionEnv({
      REWARDED_AD_PROVIDER: 'propeller',
      ADSGRAM_SECRET: '',
      PROPELLER_SECRET: '',
    }));

    expect(findings.errors).toContain('MISSING_PROPELLER_SECRET');
  });

  test('returns only named checks in throw and logs, never secret values', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const secret = 'should-never-appear-in-output';

    expect(() => assertProductionConfig(validProductionEnv({ BOT_BACKEND_SECRET: '' }), logger))
      .toThrow('MISSING_BOT_BACKEND_SECRET');
    expect(() => assertProductionConfig(validProductionEnv({ BOT_BACKEND_SECRET: '' }), logger))
      .not.toThrow(secret);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
