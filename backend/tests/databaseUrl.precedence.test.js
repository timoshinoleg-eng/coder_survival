import { buildDatabaseUrl } from '../src/config/database.js';

describe('database URL precedence', () => {
  test('honours TEST_DATABASE_URL under NODE_ENV=test', () => {
    expect(buildDatabaseUrl({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgresql://u:p@test-host:5432/test_db',
      DATABASE_URL: 'postgresql://u:p@prod-host:5432/prod_db',
    })).toBe('postgresql://u:p@test-host:5432/test_db');
  });

  test('honours TEST_DATABASE_URL when NODE_ENV is unset', () => {
    expect(buildDatabaseUrl({
      TEST_DATABASE_URL: 'postgresql://u:p@test-host:5432/test_db',
      DATABASE_URL: 'postgresql://u:p@prod-host:5432/prod_db',
    })).toBe('postgresql://u:p@test-host:5432/test_db');
  });

  // Regression guard: the migration runner executes with NODE_ENV=production
  // during deploys. If TEST_DATABASE_URL leaked into that environment it would
  // silently migrate a throwaway database while the deploy reported success.
  test('IGNORES TEST_DATABASE_URL in production', () => {
    expect(buildDatabaseUrl({
      NODE_ENV: 'production',
      TEST_DATABASE_URL: 'postgresql://u:p@test-host:5432/test_db',
      DATABASE_URL: 'postgresql://u:p@prod-host:5432/prod_db',
    })).toBe('postgresql://u:p@prod-host:5432/prod_db');
  });

  test('falls back to DB_* parts in production when DATABASE_URL is absent', () => {
    expect(buildDatabaseUrl({
      NODE_ENV: 'production',
      TEST_DATABASE_URL: 'postgresql://u:p@test-host:5432/test_db',
      DB_HOST: 'host.docker.internal',
      DB_PORT: '5432',
      DB_NAME: 'coder_survival',
      DB_USER: 'app',
      DB_PASSWORD: 'secret',
    })).toBe('postgresql://app:secret@host.docker.internal:5432/coder_survival');
  });
});
