import fs from 'fs';

export function buildDatabaseUrl(env = process.env) {
  // TEST_DATABASE_URL is a test-harness escape hatch. It must never win in
  // production: if it leaked into the deploy environment, both the API and the
  // migration runner would silently target a throwaway database while the
  // deploy still reported success.
  if (env.NODE_ENV !== 'production' && env.TEST_DATABASE_URL) {
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

function isEnabled(value) {
  return ['1', 'true', 'require', 'verify-ca', 'verify-full'].includes(String(value || '').toLowerCase());
}

function isDisabled(value) {
  return ['0', 'false', 'disable', 'off', 'no'].includes(String(value || '').toLowerCase());
}

function readCertificateAuthority(env) {
  if (env.DB_SSL_CA) {
    return env.DB_SSL_CA;
  }
  if (env.DATABASE_SSL_CA) {
    return env.DATABASE_SSL_CA;
  }
  const caPath = env.DB_SSL_CA_PATH || env.DATABASE_SSL_CA_PATH;
  if (caPath) {
    return fs.readFileSync(caPath, 'utf8');
  }
  return undefined;
}

export function buildDatabaseSslOptions(env = process.env) {
  if (isDisabled(env.DB_SSL)) {
    return false;
  }

  const shouldUseSsl = env.NODE_ENV === 'production' || isEnabled(env.DB_SSL);
  if (!shouldUseSsl) {
    return false;
  }

  const rejectUnauthorized = !isDisabled(env.DB_SSL_REJECT_UNAUTHORIZED);
  const ca = readCertificateAuthority(env);

  return ca
    ? { rejectUnauthorized, ca }
    : { rejectUnauthorized };
}

export function shouldExitOnUnexpectedDbError(env = process.env) {
  return env.NODE_ENV === 'production';
}
