import { CONTEXT_OFFER_GLOBAL_COOLDOWN_MS, CONTEXT_OFFER_PRIORITY, CONTEXT_OFFER_RULES } from '../config/balance.js';
import { getProductById } from './shopCatalog.js';

const NEAR_RANK_LAST_CHANCE_THRESHOLD = 0.95;

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

    return buildOfferPayload(offerType, signals);
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

function getNearRankProgress(signals) {
  const xpProgress = Number(signals?.xpProgress ?? 0);
  const xpRequiredForNext = Number(signals?.xpRequiredForNext ?? 0);
  if (xpRequiredForNext <= 0) return 0;
  return Math.max(0, xpProgress / xpRequiredForNext);
}

export function getNearRankOfferVariant(signals) {
  const ratio = getNearRankProgress(signals);
  if (ratio >= NEAR_RANK_LAST_CHANCE_THRESHOLD) {
    return {
      variant: 'last_chance',
      title: '🔥 Последний шанс до повышения',
      body: 'До следующего ранга остался последний рывок. Буст поможет закрыть уровень сейчас.',
      action: 'Финишировать',
      progressPercent: Math.min(100, Math.floor(ratio * 100))
    };
  }

  return {
    variant: 'better_offer',
    title: '🚀 Повышение рядом',
    body: 'Ты уже прошёл 85% пути. Буст поможет быстрее добрать XP до следующего ранга.',
    action: 'Дожать',
    progressPercent: Math.min(100, Math.floor(ratio * 100))
  };
}

function matchesOfferSignals(offerType, signals) {
  const energy = Number(signals?.energy ?? 0);
  const maxEnergy = Number(signals?.maxEnergy ?? 0);
  const depression = Number(signals?.depression ?? 0);
  const energyPercent = maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0;
  const stressV2 = signals?.featureFlags?.stress_v2 === true;

  switch (offerType) {
    case 'low_energy':
      return energyPercent <= CONTEXT_OFFER_RULES.low_energy.energyPercentThreshold;
    case 'stress_warning': {
      const threshold = stressV2 ? 20 : CONTEXT_OFFER_RULES.stress_warning.depressionThreshold;
      return depression >= threshold;
    }
    case 'near_rank':
      return getNearRankProgress(signals) >= CONTEXT_OFFER_RULES.near_rank.progressThreshold;
    default:
      return false;
  }
}

function buildOfferPayload(offerType, signals) {
  const template = CONTEXT_OFFER_RULES[offerType];
  const product = getProductById(template.productId);
  const nearRankVariant = offerType === 'near_rank' ? getNearRankOfferVariant(signals) : null;

  return {
    type: offerType,
    variant: nearRankVariant?.variant ?? 'default',
    title: nearRankVariant?.title ?? template.title,
    body: nearRankVariant?.body ?? template.body,
    productId: template.productId,
    action: nearRankVariant?.action ?? template.action,
    stars: product?.stars ?? null,
    ...(nearRankVariant ? { progressPercent: nearRankVariant.progressPercent } : {})
  };
}
