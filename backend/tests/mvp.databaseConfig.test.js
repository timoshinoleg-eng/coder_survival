import { buildDatabaseUrl, shouldExitOnUnexpectedDbError } from '../src/config/database.js';

describe('MVP local database config', () => {
  test('uses DB_PASSWORD when DB_PASS is not set', () => {
    expect(buildDatabaseUrl({
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'coder_survival',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres',
    })).toBe('postgresql://postgres:postgres@localhost:5432/coder_survival');
  });

  test('has usable local defaults instead of producing an invalid URL', () => {
    expect(buildDatabaseUrl({})).toBe('postgresql://postgres:postgres@localhost:5432/coder_survival');
  });

  test('keeps explicit DATABASE_URL as source of truth', () => {
    expect(buildDatabaseUrl({
      DATABASE_URL: 'postgresql://custom:secret@db:5432/game',
      DB_PASSWORD: 'ignored',
    })).toBe('postgresql://custom:secret@db:5432/game');
  });

  test('keeps local development process alive across transient database restarts', () => {
    expect(shouldExitOnUnexpectedDbError({ NODE_ENV: 'development' })).toBe(false);
    expect(shouldExitOnUnexpectedDbError({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldExitOnUnexpectedDbError({ NODE_ENV: 'production' })).toBe(true);
  });
});
