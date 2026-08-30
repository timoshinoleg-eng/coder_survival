import crypto from 'crypto';

/**
 * Публичные ключи Telegram для проверки Ed25519 подписи (signature).
 * Source: https://github.com/Telegram-Mini-Apps/init-data-golang
 */
const TELEGRAM_PROD_PUBLIC_KEY_HEX = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
const TELEGRAM_TEST_PUBLIC_KEY_HEX = '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec';

/**
 * Middleware: проверка Telegram WebApp initData.
 * Поддерживает два формата:
 *   - hash  → HMAC-SHA256 с bot_token (классический)
 *   - signature → Ed25519 с публичным ключом Telegram (Mini App third-party)
 */
export function initDataMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const path = req.path;
  const method = req.method;

  if (!initData) {
    console.log(`[auth] ${method} ${path} — REJECTED: missing initData`);
    return res.status(401).json({ error: 'Missing initData' });
  }

  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[auth] ${method} ${path} — REJECTED: BOT_TOKEN not configured in production`);
      return res.status(500).json({ error: 'BOT_TOKEN is not configured' });
    }
    console.warn(`[auth] ${method} ${path} — DEV mode, skipping signature validation`);
    req.telegramUser = parseInitData(initData);
    return next();
  }

  // Определяем наличие hash / signature
  const hasHash = /(^|&)hash=/.test(initData);
  const hasSignature = /(^|&)signature=/.test(initData);

  let isValid = false;
  let verifiedVia = null;

  if (hasHash) {
    isValid = verifyHash(initData, botToken);
    if (isValid) verifiedVia = 'hmac';
  }

  // Если hash нет или не прошёл, пробуем signature (Ed25519)
  if (!isValid && hasSignature) {
    const botId = botToken.split(':')[0];
    const isTestEnv = process.env.TELEGRAM_TEST_ENV === 'true';
    isValid = verifySignature(initData, botId, isTestEnv);
    if (isValid) verifiedVia = 'ed25519';
  }

  if (!isValid) {
    console.log(`[auth] ${method} ${path} — REJECTED: invalid initData signature (hash: ${hasHash}, signature: ${hasSignature})`);
    return res.status(403).json({ error: 'Invalid initData signature' });
  }

  const parsed = parseInitData(initData);

  // Replay window. Default 1h. Hardened so a misconfigured / non-numeric
  // INIT_DATA_MAX_AGE_SECONDS can NEVER widen the window to "never expires":
  // an unparseable or non-positive value falls back to the safe default, and
  // the window is capped so an operator cannot widen the replay surface to
  // 24h+ (a stolen initData would stay valid for the whole window).
  const maxAgeSeconds = resolveMaxAgeSeconds(process.env.INIT_DATA_MAX_AGE_SECONDS);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const age =
    Number.isInteger(parsed.authDate) && parsed.authDate > 0
      ? nowSeconds - parsed.authDate
      : null;

  // Reject when authDate is missing/garbage OR the initData is older than the
  // replay window. `age === null` (no valid auth_date) MUST reject — otherwise
  // `nowSeconds - NaN > maxAgeSeconds` evaluates to false and initData would
  // never expire (fail-open).
  if (age === null || age > maxAgeSeconds) {
    console.log(`[auth] ${method} ${path} — REJECTED: expired or malformed initData (age: ${age}s, max: ${maxAgeSeconds}s)`);
    return res.status(403).json({ error: 'Expired initData' });
  }

  console.log(`[auth] ${method} ${path} — accepted user=${parsed.user?.id} via=${verifiedVia} age=${age}s`);
  req.telegramUser = parsed;
  next();
}

/**
 * Безопасное разрешение окна replay для initData.
 * Невалидное (не число / не положительное) значение INIT_DATA_MAX_AGE_SECONDS
 * возвращает безопасный дефолт, а слишком большое — обрезается жёстким потолком,
 * чтобы нельзя было расширить окно replay до 24h+.
 */
const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;
const MAX_INIT_DATA_MAX_AGE_SECONDS = 7200; // 2h hard cap — never widen to 24h+.

function resolveMaxAgeSeconds(raw) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (raw !== undefined && raw !== '') {
      console.warn(
        `[auth] INIT_DATA_MAX_AGE_SECONDS=${JSON.stringify(raw)} is invalid ` +
          `(expected a positive integer) — falling back to ` +
          `${DEFAULT_INIT_DATA_MAX_AGE_SECONDS}s.`,
      );
    }
    return DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  }
  if (parsed > MAX_INIT_DATA_MAX_AGE_SECONDS) {
    console.warn(
      `[auth] INIT_DATA_MAX_AGE_SECONDS=${parsed} exceeds the hard cap of ` +
        `${MAX_INIT_DATA_MAX_AGE_SECONDS}s — clamping to prevent an over-wide ` +
        `replay window.`,
    );
    return MAX_INIT_DATA_MAX_AGE_SECONDS;
  }
  return parsed;
}

/**
 * Парсит initData строку в объект.
 */
function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');

  let user = null;
  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      console.error('Failed to parse user from initData:', e);
    }
  }

  return {
    queryId: params.get('query_id'),
    user,
    startParam: params.get('start_param'),
    authDate: parseInt(params.get('auth_date'), 10),
    hash: params.get('hash'),
    signature: params.get('signature'),
    raw: initData
  };
}

/**
 * Извлекает из initData отсортированные пары key=value.
 * Использует URLSearchParams для корректного декодирования значений
 * (согласно реализациям Python/Go/.NET).
 * excludeKeys — массив ключей, которые нужно исключить (например, ['hash', 'signature']).
 * Возвращает массив строк "key=value" в отсортированном порядке.
 */
function getSortedPairs(initData, excludeKeys) {
  const excludeSet = new Set(excludeKeys);
  const params = new URLSearchParams(initData);
  const pairs = [];

  for (const [key, value] of params) {
    if (excludeSet.has(key)) continue;
    pairs.push(`${key}=${value}`);
  }

  pairs.sort((a, b) => {
    const keyA = a.slice(0, a.indexOf('='));
    const keyB = b.slice(0, b.indexOf('='));
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  return pairs;
}

/**
 * Проверяет классический hash через HMAC-SHA256 с bot_token.
 */
function verifyHash(initData, botToken) {
  const hashMatch = initData.match(/(^|&)hash=([^&]*)/);
  const hash = hashMatch ? hashMatch[2] : null;

  if (!hash) {
    console.log('[verifyHash] No hash in initData');
    return false;
  }

  const pairs = getSortedPairs(initData, ['hash']);
  const dataCheckString = pairs.join('\n');

  // HMAC-SHA256("WebAppData", bot_token) → secretKey
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const checkHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expected = Buffer.from(checkHash, 'hex');
  const actual = Buffer.from(hash, 'hex');

  if (expected.length !== actual.length) {
    console.log('[verifyHash] hash length mismatch');
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Проверяет Ed25519 signature (third-party validation).
 * Использует публичный ключ Telegram и botId.
 */
function verifySignature(initData, botId, isTestEnv = false) {
  const sigMatch = initData.match(/(^|&)signature=([^&]*)/);
  const signatureB64url = sigMatch ? sigMatch[2] : null;

  if (!signatureB64url) {
    console.log('[verifySignature] No signature in initData');
    return false;
  }

  let signature;
  try {
    signature = Buffer.from(signatureB64url, 'base64url');
  } catch (e) {
    console.log('[verifySignature] Failed to decode signature from base64url:', e.message);
    return false;
  }

  if (signature.length !== 64) {
    console.log('[verifySignature] Invalid signature length:', signature.length, '(expected 64)');
    return false;
  }

  // Формируем отсортированные пары, исключая hash и signature
  const pairs = getSortedPairs(initData, ['hash', 'signature']);
  const dataCheckString = pairs.join('\n');

  // Сообщение для Ed25519: "{botId}:WebAppData\n{sorted_pairs}"
  const message = `${botId}:WebAppData\n${dataCheckString}`;

  // Публичный ключ Telegram
  const publicKeyHex = isTestEnv ? TELEGRAM_TEST_PUBLIC_KEY_HEX : TELEGRAM_PROD_PUBLIC_KEY_HEX;

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(publicKeyHex, 'hex').toString('base64url')
      },
      format: 'jwk'
    });
  } catch (e) {
    console.log('[verifySignature] Failed to create public key:', e.message);
    return false;
  }

  try {
    const isValid = crypto.verify(null, Buffer.from(message), publicKey, signature);
    console.log('[verifySignature] Ed25519 verify result:', isValid);
    return isValid;
  } catch (e) {
    console.log('[verifySignature] Ed25519 verify error:', e.message);
    return false;
  }
}
