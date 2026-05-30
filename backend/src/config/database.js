export function buildDatabaseUrl(env = process.env) {
  if (env.NODE_ENV === 'test' && env.TEST_DATABASE_URL) {
    return env.TEST_DATABASE_URL;
  }
  if (env.TEST_DATABASE_URL) {
    return env.TEST_DATABASE_URL;
  }
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const user = env.DB_USER || 'postgres';
  const password = env.DB_PASS ?? env.DB_PASSWORD ?? 'postgres';
  const host = env.DB_HOST || 'localhost';
  const port = env.DB_PORT || '5432';
  const database = env.DB_NAME || 'coder_survival';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function shouldExitOnUnexpectedDbError(env = process.env) {
  return env.NODE_ENV === 'production';
}
