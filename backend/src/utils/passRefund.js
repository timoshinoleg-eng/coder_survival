import { STAGE2 } from '../config/balance.js';

const { PASS } = STAGE2;
const REFUND = PASS.premiumTrackRefundPercent || 0.50;
const STARS_SPLIT = PASS.premiumTrackRefundCurrencySplit?.stars || 0.40;
const TON_SPLIT = PASS.premiumTrackRefundCurrencySplit?.ton || 0.10;

/**
 * Process premium refunds for an expired season.
 * Calculates per-level refund for each premium buyer and distributes Stars + TON.
 *
 * @param {object} client — pg Pool client (inside transaction)
 * @param {number} passId — sprint_passes.id of the expired season
 * @returns {{ processed: number, totalStars: number, totalTon: number }}
 */
export async function processPremiumRefunds(client, passId) {
  const premiumUsers = await client.query(
    `SELECT pp.user_id, pp.current_level, pp.claimed_levels
     FROM player_passes pp
     WHERE pp.pass_id = $1
       AND pp.is_premium = TRUE`,
    [passId]
  );

  if (premiumUsers.rows.length === 0) {
    return { processed: 0, totalStars: 0, totalTon: 0 };
  }

  const levelsResult = await client.query(
    'SELECT COUNT(*) AS total_levels FROM pass_rewards WHERE pass_id = $1',
    [passId]
  );
  const totalLevels = Number(levelsResult.rows[0]?.total_levels || 50);
  const baseCostStars = 200;

  let totalStars = 0;
  let totalTon = 0;
  let processed = 0;

  for (const user of premiumUsers.rows) {
    const claimed = Array.isArray(user.claimed_levels) ? user.claimed_levels.length : 0;
    const refundPercent = REFUND * (claimed / totalLevels);
    const starsRefund = Math.floor(baseCostStars * refundPercent * STARS_SPLIT);
    const tonRefund = Math.floor(baseCostStars * refundPercent * TON_SPLIT * 10);

    if (starsRefund > 0 || tonRefund > 0) {
      await client.query(
        `UPDATE progression
         SET stars = stars + $2,
             mu_currency = mu_currency + $3
         WHERE user_id = $1`,
        [user.user_id, starsRefund, tonRefund]
      );
      totalStars += starsRefund;
      totalTon += tonRefund;
      processed++;
    }
  }

  await client.query(
    'UPDATE sprint_passes SET refund_processed = TRUE WHERE id = $1',
    [passId]
  );

  return { processed, totalStars, totalTon };
}
