import { getRehearsalEnvironment } from '../../scripts/rehearse_migrations_059_061.mjs';

describe('migration 059–061 rehearsal safety guard', () => {
  const originalUrl = process.env.MIGRATION_REHEARSAL_DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MIGRATION_REHEARSAL_DATABASE_URL;
    } else {
      process.env.MIGRATION_REHEARSAL_DATABASE_URL = originalUrl;
    }
  });

  test('fails closed when no disposable database URL is provided', () => {
    delete process.env.MIGRATION_REHEARSAL_DATABASE_URL;

    expect(() => getRehearsalEnvironment()).toThrow('MIGRATION_REHEARSAL_DATABASE_URL is required');
  });

  test('rejects a non-local database even when its name contains rehearsal', () => {
    process.env.MIGRATION_REHEARSAL_DATABASE_URL = 'postgresql://user:password@example.com/coder_survival_rehearsal';

    expect(() => getRehearsalEnvironment()).toThrow('Refusing a non-local rehearsal database');
  });

  test('rejects a local database without the rehearsal marker', () => {
    process.env.MIGRATION_REHEARSAL_DATABASE_URL = 'postgresql://user:password@127.0.0.1/coder_survival';

    expect(() => getRehearsalEnvironment()).toThrow('name does not contain "rehearsal"');
  });

  test('allows a local database whose name is explicitly marked for rehearsal', () => {
    process.env.MIGRATION_REHEARSAL_DATABASE_URL = 'postgresql://user:password@127.0.0.1/coder_survival_migration_rehearsal';

    expect(getRehearsalEnvironment()).toMatchObject({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: process.env.MIGRATION_REHEARSAL_DATABASE_URL,
      DATABASE_URL: undefined,
    });
  });
});
