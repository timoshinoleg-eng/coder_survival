import crypto from 'crypto';

/**
 * Middleware: проверка Telegram WebApp initData
 * Проверяет hash из initData строки используя HMAC-SHA256 с ключом bot_token
 */
export function initDataMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
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

  // Проверка hash
  const isValid = verifyInitData(initData, botToken);
  console.log(`[auth] ${method} ${path} — signature valid: ${isValid}`);

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
 * Парсит initData строку в объект
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
    raw: initData
  };
}

/**
 * Проверяет подпись initData
 */
function verifyInitData(initData, botToken) {
  // Поддерживаем оба формата: hash (стандартный) и signature (Mini App v2)
  const hashMatch = initData.match(/(^|&)hash=([^&]*)/);
  const sigMatch = initData.match(/(^|&)signature=([^&]*)/);
  const hash = hashMatch ? hashMatch[2] : (sigMatch ? sigMatch[2] : null);
  const hashKey = hashMatch ? 'hash' : (sigMatch ? 'signature' : null);
  
  if (!hash) {
    console.log('[verifyInitData] No hash or signature in initData');
    console.log('[verifyInitData] initData preview:', initData.substring(0, 100));
    return false;
  }

  // Убираем hash/signature из строки
  const dataCheckString = initData
    .replace(new RegExp(`(^|&)${hashKey}=[^&]*`, 'g'), '')
    .replace(/^&/, '');

  // Парсим параметры для сортировки (сохраняем raw значения)
  const pairs = dataCheckString.split('&').filter(Boolean);
  const sorted = pairs
    .map(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) return [pair, ''];
      return [pair.slice(0, eq), pair.slice(eq + 1)];
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  console.log('[verifyInitData] using key:', hashKey);
  console.log('[verifyInitData] sorted keys:', pairs.map(p => p.split('=')[0]).sort().join(', '));
  console.log('[verifyInitData] sorted length:', sorted.length);

  // HMAC-SHA256 с ключом = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const checkHash = crypto
    .createHmac('sha256', secretKey)
    .update(sorted)
    .digest('hex');

  console.log('[verifyInitData] expected hash:', checkHash.substring(0, 20) + '...');
  console.log('[verifyInitData] actual hash:', hash.substring(0, 20) + '...');

  const expected = Buffer.from(checkHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length) {
    console.log('[verifyInitData] Hash length mismatch:', expected.length, 'vs', actual.length);
    return false;
  }
  const equal = crypto.timingSafeEqual(expected, actual);
  console.log('[verifyInitData] timingSafeEqual result:', equal);
  return equal;
}
