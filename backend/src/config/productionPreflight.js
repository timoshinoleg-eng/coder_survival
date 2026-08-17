const REQUIRED_SECRETS = [
  'BOT_BACKEND_SECRET',
  'ADMIN_API_SECRET',
];

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsOrigin(value) {
  if (!isNonEmpty(value) || value.includes('*')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function databaseConfigured(env) {
  if (isNonEmpty(env.DATABASE_URL)) return true;
  const requiredParts = ['DB_HOST', 'DB_USER'];
  const hasPassword = isNonEmpty(env.DB_PASS) || isNonEmpty(env.DB_PASSWORD);
  return requiredParts.every((key) => isNonEmpty(env[key])) && hasPassword;
}

function configuredOrigins(env) {
  return [
    ...(isNonEmpty(env.FRONTEND_URL) ? [env.FRONTEND_URL] : []),
    ...(isNonEmpty(env.CORS_ALLOWED_ORIGINS)
      ? env.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
      : []),
  ];
}

/**
 * Returns named configuration findings only. Secret values, URL values and any
 * credential-derived data are deliberately excluded from errors and warnings.
 */
export function inspectProductionConfig(env = process.env) {
  const errors = [];
  const warnings = [];

  if (!isNonEmpty(env.BOT_TOKEN) && !isNonEmpty(env.TELEGRAM_BOT_TOKEN)) {
    errors.push('MISSING_TELEGRAM_BOT_TOKEN');
  }
  for (const key of REQUIRED_SECRETS) {
    if (!isNonEmpty(env[key])) errors.push(`MISSING_${key}`);
  }
  if (!databaseConfigured(env)) errors.push('MISSING_DATABASE_CONFIGURATION');
  if (!isHttpsOrigin(env.WEBAPP_URL)) errors.push('INVALID_WEBAPP_URL');

  const origins = configuredOrigins(env);
  if (origins.length === 0) {
    errors.push('MISSING_CORS_ALLOWLIST');
  } else if (!origins.every(isHttpsOrigin)) {
    errors.push('INVALID_CORS_ALLOWLIST');
  }

  const initDataAge = env.INIT_DATA_MAX_AGE_SECONDS;
  if (isNonEmpty(initDataAge)) {
    const seconds = Number(initDataAge);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
      errors.push('INVALID_INIT_DATA_MAX_AGE_SECONDS');
    }
  }

  if (env.PAYMENTS_ENABLED === 'true') {
    errors.push('PAYMENTS_MUST_REMAIN_DISABLED');
  } else if (!isNonEmpty(env.PAYMENTS_ENABLED)) {
    warnings.push('PAYMENTS_DISABLED_BY_IMPLICIT_DEFAULT');
  }

  const provider = isNonEmpty(env.REWARDED_AD_PROVIDER)
    ? env.REWARDED_AD_PROVIDER.trim().toLowerCase()
    : null;
  if (!provider) {
    warnings.push('REWARDED_AD_PROVIDER_UNDECLARED');
  } else if (!['adsgram', 'propeller'].includes(provider)) {
    errors.push('INVALID_REWARDED_AD_PROVIDER');
  } else if (provider === 'adsgram' && !isNonEmpty(env.ADSGRAM_SECRET)) {
    errors.push('MISSING_ADSGRAM_SECRET');
  } else if (provider === 'propeller' && !isNonEmpty(env.PROPELLER_SECRET)) {
    errors.push('MISSING_PROPELLER_SECRET');
  }

  return { errors, warnings };
}

export function assertProductionConfig(env = process.env, logger = console) {
  const findings = inspectProductionConfig(env);
  if (findings.warnings.length > 0) {
    logger.warn(`[startup] production config warnings: ${findings.warnings.join(', ')}`);
  }
  if (findings.errors.length > 0) {
    throw new Error(`Production configuration invalid: ${findings.errors.join(', ')}`);
  }
  logger.info('[startup] production config preflight passed');
  return findings;
}
