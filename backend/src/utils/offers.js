import { CONTEXT_OFFER_GLOBAL_COOLDOWN_MS, CONTEXT_OFFER_PRIORITY, CONTEXT_OFFER_RULES } from '../config/balance.js';
import { getProductById } from './shopCatalog.js';

export function isValidOfferType(offerType) {
  return Object.prototype.hasOwnProperty.call(CONTEXT_OFFER_RULES, offerType);
}

export async function getContextOffer(client, userId, signals) {
  const rows = await client.query(
    `SELECT offer_type, last_dismissed_at
     FROM offer_cooldowns
     WHERE user_id = $1`,
    [userId]
  );

  const cooldowns = new Map();
  let globalLast = 0;
  for (const row of rows.rows) {
    const timestamp = row.last_dismissed_at ? new Date(row.last_dismissed_at).getTime() : 0;
    cooldowns.set(row.offer_type, timestamp);
    if (timestamp > globalLast) {
      globalLast = timestamp;
    }
  }

  const now = Date.now();
  if (now - globalLast < CONTEXT_OFFER_GLOBAL_COOLDOWN_MS) {
    return null;
  }

  for (const offerType of CONTEXT_OFFER_PRIORITY) {
    if (!matchesOfferSignals(offerType, signals)) {
      continue;
    }

    const rule = CONTEXT_OFFER_RULES[offerType];
    const lastDismissedAt = cooldowns.get(offerType) || 0;
    if (now - lastDismissedAt <= rule.cooldownMs) {
      continue;
    }

    return buildOfferPayload(offerType);
  }

  return null;
}

export async function dismissContextOffer(client, userId, offerType) {
  if (!isValidOfferType(offerType)) {
    return { error: 'Invalid offer_type', status: 400 };
  }

  const result = await client.query(
    `INSERT INTO offer_cooldowns (user_id, offer_type, last_dismissed_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id, offer_type) DO UPDATE SET
       last_dismissed_at = NOW(),
       updated_at = NOW()
     RETURNING offer_type, last_dismissed_at`,
    [userId, offerType]
  );

  await client.query(
    `INSERT INTO audit_logs (user_id, action, context)
     VALUES ($1, 'offer_dismiss', $2::jsonb)`,
    [userId, JSON.stringify({ offerType })]
  );

  return {
    offerType: result.rows[0].offer_type,
    dismissedAt: result.rows[0].last_dismissed_at
  };
}

export async function recordOfferImpression(client, userId, offerType, source = 'state') {
  if (!offerType || !isValidOfferType(offerType)) {
    return;
  }

  await client.query(
    `INSERT INTO offer_impressions (user_id, offer_type, source)
     VALUES ($1, $2, $3)`,
    [userId, offerType, source]
  );
}

function matchesOfferSignals(offerType, signals) {
  const energy = Number(signals?.energy ?? 0);
  const maxEnergy = Number(signals?.maxEnergy ?? 0);
  const depression = Number(signals?.depression ?? 0);
  const xpProgress = Number(signals?.xpProgress ?? 0);
  const xpRequiredForNext = Number(signals?.xpRequiredForNext ?? 0);
  const energyPercent = maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0;
  const stressV2 = signals?.featureFlags?.stress_v2 === true;

  switch (offerType) {
    case 'low_energy':
      return energyPercent <= CONTEXT_OFFER_RULES.low_energy.energyPercentThreshold;
    case 'high_stress': {
      const threshold = stressV2 ? 20 : CONTEXT_OFFER_RULES.high_stress.depressionThreshold;
      return depression >= threshold;
    }
    case 'near_rank':
      return (
        xpRequiredForNext > 0
        && xpProgress / xpRequiredForNext >= CONTEXT_OFFER_RULES.near_rank.progressThreshold
      );
    default:
      return false;
  }
}

function buildOfferPayload(offerType) {
  const template = CONTEXT_OFFER_RULES[offerType];
  const product = getProductById(template.productId);

  return {
    type: offerType,
    title: template.title,
    body: template.body,
    productId: template.productId,
    action: template.action,
    stars: product?.stars ?? null
  };
}
