import { buildMigrationPoolOptions } from '../src/migrate.js';

describe('migration database configuration', () => {
  test('uses verified TLS by default in production', () => {
    expect(buildMigrationPoolOptions({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:password@db.example/game',
    })).toEqual({
      connectionString: 'postgresql://app:password@db.example/game',
      ssl: { rejectUnauthorized: true },
    });
  });

  test('honours an explicit trusted-local TLS disablement', () => {
    expect(buildMigrationPoolOptions({
      NODE_ENV: 'production',
      DB_SSL: 'false',
      DATABASE_URL: 'postgresql://app:password@localhost/game',
    })).toEqual({
      connectionString: 'postgresql://app:password@localhost/game',
      ssl: false,
    });
  });
});
