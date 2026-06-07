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

  console.log(`[auth] ${method} ${path} — initData present: ${!!initData}, length: ${initData?.length || 0}`);

  if (!initData) {
    console.log(`[auth] ${method} ${path} — REJECTED: Missing initData`);
    return res.status(401).json({ error: 'Missing initData' });
  }

  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  console.log(`[auth] ${method} ${path} — BOT_TOKEN present: ${!!botToken}, NODE_ENV: ${process.env.NODE_ENV}`);

  if (!botToken) {
    if (process.env.NODE_ENV === 'production') {
      console.log(`[auth] ${method} ${path} — REJECTED: BOT_TOKEN not configured in production`);
      return res.status(500).json({ error: 'BOT_TOKEN is not configured' });
    }
    console.log(`[auth] ${method} ${path} — DEV mode, skipping signature validation`);
    req.telegramUser = parseInitData(initData);
    return next();
  }

  // Определяем наличие hash / signature
  const hasHash = /(^|&)hash=/.test(initData);
  const hasSignature = /(^|&)signature=/.test(initData);

  let isValid = false;

  if (hasHash) {
    isValid = verifyHash(initData, botToken);
    console.log(`[auth] ${method} ${path} — hash validation result: ${isValid}`);
  }

  // Если hash нет или не прошёл, пробуем signature (Ed25519)
  if (!isValid && hasSignature) {
    const botId = botToken.split(':')[0];
    const isTestEnv = process.env.TELEGRAM_TEST_ENV === 'true';
    isValid = verifySignature(initData, botId, isTestEnv);
    console.log(`[auth] ${method} ${path} — signature validation result: ${isValid}`);
  }

  if (!isValid) {
    console.log(`[auth] ${method} ${path} — REJECTED: Invalid initData signature`);
    return res.status(403).json({ error: 'Invalid initData signature' });
  }

  const parsed = parseInitData(initData);
  const maxAgeSeconds = parseInt(process.env.INIT_DATA_MAX_AGE_SECONDS || '86400', 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const age = parsed.authDate ? nowSeconds - parsed.authDate : null;
  console.log(`[auth] ${method} ${path} — authDate: ${parsed.authDate}, age: ${age}s, maxAge: ${maxAgeSeconds}s`);

  if (!parsed.authDate || nowSeconds - parsed.authDate > maxAgeSeconds) {
    console.log(`[auth] ${method} ${path} — REJECTED: Expired initData (age: ${age}s)`);
    return res.status(403).json({ error: 'Expired initData' });
  }

  console.log(`[auth] ${method} ${path} — ACCEPTED: user_id=${parsed.user?.id}`);
  req.telegramUser = parsed;
  next();
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

  console.log('[verifyHash] sorted keys:', pairs.map(p => p.split('=')[0]).join(', '));
  console.log('[verifyHash] dataCheckString length:', dataCheckString.length);

  // HMAC-SHA256("WebAppData", bot_token) → secretKey
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const checkHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  console.log('[verifyHash] expected hash:', checkHash.substring(0, 20) + '...');
  console.log('[verifyHash] actual hash:', hash.substring(0, 20) + '...');

  const expected = Buffer.from(checkHash, 'hex');
  const actual = Buffer.from(hash, 'hex');

  if (expected.length !== actual.length) {
    console.log('[verifyHash] Hash length mismatch:', expected.length, 'vs', actual.length);
    return false;
  }

  const equal = crypto.timingSafeEqual(expected, actual);
  console.log('[verifyHash] timingSafeEqual result:', equal);
  return equal;
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

  console.log('[verifySignature] sorted keys:', pairs.map(p => p.split('=')[0]).join(', '));
  console.log('[verifySignature] message prefix:', `${botId}:WebAppData`);
  console.log('[verifySignature] message length:', message.length);

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
