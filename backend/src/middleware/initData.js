import crypto from 'crypto';

/**
 * Middleware: проверка Telegram WebApp initData
 * Проверяет hash из initData строки используя HMAC-SHA256 с ключом bot_token
 */
export function initDataMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
  
  if (!initData) {
    return res.status(401).json({ error: 'Missing initData' });
  }

  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'BOT_TOKEN is not configured' });
    }
    req.telegramUser = parseInitData(initData);
    return next();
  }

  // Проверка hash
  const isValid = verifyInitData(initData, botToken);
  if (!isValid) {
    return res.status(403).json({ error: 'Invalid initData signature' });
  }

  const parsed = parseInitData(initData);
  const maxAgeSeconds = parseInt(process.env.INIT_DATA_MAX_AGE_SECONDS || '86400', 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!parsed.authDate || nowSeconds - parsed.authDate > maxAgeSeconds) {
    return res.status(403).json({ error: 'Expired initData' });
  }

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
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  
  if (!hash) return false;

  // Убираем hash из проверки
  params.delete('hash');

  // Сортируем параметры
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // HMAC-SHA256 с ключом = HMAC-SHA256("WebAppData", bot_token)
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
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
