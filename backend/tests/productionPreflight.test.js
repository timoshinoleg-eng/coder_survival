import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
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

  test.each([
    'https://app.example.test/',
    'https://app.example.test/play',
    'https://app.example.test?preview=1',
    'https://app.example.test#fragment',
  ])('rejects a CORS URL that cannot literally equal a browser Origin: %s', (origin) => {
    const findings = inspectProductionConfig(validProductionEnv({ FRONTEND_URL: origin }));

    expect(findings.errors).toContain('INVALID_CORS_ALLOWLIST');
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

  test('active production compose consumes a raw env file and release workflow populates preflight variables', () => {
    const compose = readFileSync(new URL('../../docker-compose.backend.yml', import.meta.url), 'utf8');
    const deploy = readFileSync(new URL('../../.github/workflows/deploy-backend.yml', import.meta.url), 'utf8');

    expect(compose).toContain('image: coder-survival-backend:${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}');
    expect(compose).toContain('path: ./backend.env');
    expect(compose).toContain('format: raw');
    expect(compose).toContain('PAYMENTS_ENABLED: "false"');

    for (const variable of [
      'BOT_TOKEN',
      'BOT_BACKEND_SECRET',
      'ADMIN_API_SECRET',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'DB_SSL',
      'WEBAPP_URL',
      'FRONTEND_URL',
      'CORS_ALLOWED_ORIGINS',
      'REWARDED_AD_PROVIDER',
      'ADSGRAM_SECRET',
      'PROPELLER_SECRET',
      'ALERT_CHAT_ID',
      'INIT_DATA_MAX_AGE_SECONDS',
    ]) {
      expect(deploy).toContain(`'${variable}'`);
    }

    // Secrets must not be expanded by Compose itself; raw env_file owns their transport.
    expect(compose).not.toContain('ADMIN_API_SECRET: ${ADMIN_API_SECRET');
    expect(compose).not.toContain('BOT_BACKEND_SECRET: ${BOT_BACKEND_SECRET');
    expect(deploy).toContain("print('PAYMENTS_ENABLED=false')");
  });
});
