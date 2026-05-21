import crypto from 'crypto';

const SECRET = process.env.BOT_BACKEND_SECRET || process.env.MEME_TOKEN_SECRET;
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function hmac(data) {
  return crypto.createHmac('sha256', SECRET || 'dev-secret').update(data).digest('hex');
}

export function signMemeToken({ userId, templateId, format }) {
  if (!SECRET) {
    throw new Error('BOT_BACKEND_SECRET or MEME_TOKEN_SECRET not set');
  }
  const exp = Date.now() + EXPIRY_MS;
  const payload = `${userId}:${templateId}:${format}:${exp}`;
  const sig = hmac(payload);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyMemeToken(token) {
  if (!SECRET) {
    throw new Error('BOT_BACKEND_SECRET or MEME_TOKEN_SECRET not set');
  }
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 5) return null;
    const [userId, templateId, format, exp, sig] = parts;
    const payload = `${userId}:${templateId}:${format}:${exp}`;
    const expectedSig = hmac(payload);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    if (Date.now() > Number(exp)) {
      return null;
    }
    return { userId: Number(userId), templateId, format };
  } catch {
    return null;
  }
}
