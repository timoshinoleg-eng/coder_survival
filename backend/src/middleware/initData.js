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

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN not set, skipping initData verification (dev mode)');
    // В dev режиме парсим без проверки
    req.telegramUser = parseInitData(initData);
    return next();
  }

  // Проверка hash
  const isValid = verifyInitData(initData, botToken);
  if (!isValid) {
    return res.status(403).json({ error: 'Invalid initData signature' });
  }

  req.telegramUser = parseInitData(initData);
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
      user = JSON.parse(decodeURIComponent(userStr));
    } catch (e) {
      console.error('Failed to parse user from initData:', e);
    }
  }

  return {
    queryId: params.get('query_id'),
    user,
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

  return checkHash === hash;
}
