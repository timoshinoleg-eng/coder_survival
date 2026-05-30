import crypto from 'crypto';

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const ADMOB_KEYS_TTL_MS = 24 * 60 * 60 * 1000;

let admobKeysCache = {
  expiresAt: 0,
  keys: new Map()
};

export async function verifyAdProof(provider, proof, nonce) {
  if (provider === 'mock') {
    return true;
  }

  if (!proof || typeof proof !== 'object') {
    return false;
  }

  switch ((provider || '').toLowerCase()) {
    case 'admob':
      return verifyAdMobProof(proof, nonce);
    case 'yandex':
      return verifyYandexProof(proof, nonce);
    default:
      return false;
  }
}

export function verifyAdsgramCallbackSignature(payload, signature, secret) {
  if (!secret || typeof signature !== 'string' || !signature.trim()) {
    return false;
  }
  const body = typeof payload === 'string' ? payload : stableStringify(payload);
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return safeEqual(signature.trim(), expected);
}

export function verifyPropellerCallbackHash({ eventId, userId, hash, secret }) {
  if (!secret || !eventId || !userId || !hash) {
    return false;
  }
  const expected = crypto.createHash('md5').update(`${eventId}${userId}${secret}`, 'utf8').digest('hex');
  return safeEqual(String(hash).trim(), expected);
}

async function verifyAdMobProof(proof, nonce) {
  const callbackUrl = typeof proof.callbackUrl === 'string' ? proof.callbackUrl : null;
  const rawQuery = typeof proof.rawQuery === 'string'
    ? proof.rawQuery
    : typeof proof.queryString === 'string'
      ? proof.queryString
      : callbackUrl
        ? new URL(callbackUrl).search.slice(1)
        : null;

  if (!rawQuery) {
    return false;
  }

  const signatureIndex = rawQuery.indexOf('&signature=');
  if (signatureIndex <= 0) {
    return false;
  }

  const toBeSigned = rawQuery.slice(0, signatureIndex);
  const suffix = rawQuery.slice(signatureIndex + 1);
  const keyIndex = suffix.indexOf('&key_id=');
  if (keyIndex <= 'signature='.length) {
    return false;
  }

  const signatureValue = suffix.slice('signature='.length, keyIndex);
  const keyIdValue = suffix.slice(keyIndex + '&key_id='.length);
  if (!signatureValue || !keyIdValue) {
    return false;
  }

  const parsed = new URLSearchParams(rawQuery);
  if (!matchesNonce(parsed, nonce)) {
    return false;
  }

  const keyId = Number(keyIdValue);
  if (!Number.isFinite(keyId)) {
    return false;
  }

  const key = await getAdMobPublicKey(keyId);
  if (!key) {
    return false;
  }

  const signature = decodeBase64Url(signatureValue);
  if (!signature) {
    return false;
  }

  const verifier = crypto.createVerify('SHA256');
  verifier.update(Buffer.from(toBeSigned, 'utf8'));
  verifier.end();

  return verifier.verify(
    {
      key,
      dsaEncoding: 'der'
    },
    signature
  );
}

async function getAdMobPublicKey(keyId) {
  const now = Date.now();
  if (admobKeysCache.keys.size > 0 && admobKeysCache.expiresAt > now) {
    return admobKeysCache.keys.get(keyId) || null;
  }

  try {
    const response = await fetch(ADMOB_KEYS_URL);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const keys = new Map();
    for (const item of payload?.keys || []) {
      if (!Number.isFinite(Number(item?.keyId)) || typeof item?.pem !== 'string') {
        continue;
      }
      keys.set(Number(item.keyId), item.pem);
    }

    if (keys.size === 0) {
      return null;
    }

    admobKeysCache = {
      expiresAt: now + ADMOB_KEYS_TTL_MS,
      keys
    };

    return admobKeysCache.keys.get(keyId) || null;
  } catch (_err) {
    return null;
  }
}

function verifyYandexProof(proof, nonce) {
  const secret = process.env.YANDEX_REWARDED_SECRET;
  if (!secret) {
    return false;
  }

  const signature = typeof proof.signature === 'string' ? proof.signature.trim() : '';
  if (!signature) {
    return false;
  }

  const payloadString = getYandexPayloadString(proof);
  if (!payloadString) {
    return false;
  }

  if (!matchesNonce(extractNonceCarrier(proof, payloadString), nonce)) {
    return false;
  }

  const expectedHex = crypto.createHmac('sha256', secret).update(payloadString, 'utf8').digest('hex');
  const expectedBase64Url = crypto.createHmac('sha256', secret).update(payloadString, 'utf8').digest('base64url');

  return safeEqual(signature, expectedHex) || safeEqual(signature, expectedBase64Url);
}

function getYandexPayloadString(proof) {
  if (typeof proof.payload === 'string') {
    return proof.payload;
  }

  if (proof.payload && typeof proof.payload === 'object') {
    return stableStringify(proof.payload);
  }

  if (typeof proof.rawBody === 'string') {
    return proof.rawBody;
  }

  return null;
}

function extractNonceCarrier(proof, payloadString) {
  if (proof?.payload && typeof proof.payload === 'object') {
    return proof.payload;
  }

  try {
    return JSON.parse(payloadString);
  } catch (_err) {
    return new URLSearchParams(payloadString);
  }
}

function matchesNonce(source, nonce) {
  if (!nonce) {
    return false;
  }

  const candidates = [];

  if (source instanceof URLSearchParams) {
    candidates.push(source.get('nonce'));
    candidates.push(source.get('custom_data'));
    candidates.push(source.get('user_id'));
  } else if (source && typeof source === 'object') {
    candidates.push(source.nonce);
    candidates.push(source.custom_data);
    candidates.push(source.customData);
    candidates.push(source.user_id);
    candidates.push(source.userId);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) {
      continue;
    }
    if (candidate === nonce) {
      return true;
    }
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.nonce === nonce || parsed?.sessionNonce === nonce) {
        return true;
      }
    } catch (_err) {
      // Ignore non-JSON custom_data.
    }
  }

  return false;
}

function decodeBase64Url(value) {
  try {
    return Buffer.from(value, 'base64url');
  } catch (_err) {
    return null;
  }
}

function safeEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
