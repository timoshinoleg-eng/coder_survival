import cron from 'node-cron';
import { pool } from '../index.js';
import { getProducts } from '../utils/shopCatalog.js';

const ENABLE_CRON = process.env.ENABLE_FLASH_SALE_CRON !== 'false';

const ELIGIBLE_DEAL_ITEMS = [
  'energy_refill',
  'coffee_break',
  'depression_cure',
  'tier_boost',
  'streak_protect',
  'streak_saver',
  'office_cat'
];

function getRandomDiscount() {
  return Math.floor(Math.random() * 31) + 20; // 20-50%
}

function pickRandomItem() {
  const items = getProducts().filter(p => ELIGIBLE_DEAL_ITEMS.includes(p.id));
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Rotates the daily deal at 00:00 UTC.
 */
export async function rotateDailyDeal() {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().slice(0, 10);

    const existing = await client.query(
      `SELECT 1 FROM daily_deals WHERE deal_date = $1`,
      [today]
    );
    if (existing.rows.length > 0) {
      return { created: false, reason: 'Already exists' };
    }

    const item = pickRandomItem();
    if (!item) {
      return { created: false, reason: 'No eligible items' };
    }

    const discount = getRandomDiscount();
    const discountedStars = Math.max(1, Math.ceil(item.stars * (100 - discount) / 100));

    await client.query(
      `INSERT INTO daily_deals (deal_date, item_slug, original_stars, discounted_stars, purchases_count)
       VALUES ($1, $2, $3, $4, 0)`,
      [today, item.id, item.stars, discountedStars]
    );

    console.log(`[flashSaleCron] Daily deal created: ${item.id} at ${discount}% off (${discountedStars} stars)`);
    return { created: true, itemSlug: item.id, discount, discountedStars };
  } catch (err) {
    console.error('[flashSaleCron] rotateDailyDeal error:', err);
    return { created: false, reason: err.message };
  } finally {
    client.release();
  }
}

/**
 * Activates / deactivates flash sales based on schedule.
 */
export async function syncFlashSales() {
  const client = await pool.connect();
  try {
    const now = new Date().toISOString();

    const activated = await client.query(
      `UPDATE flash_sale_schedule
       SET is_active = TRUE
       WHERE is_active = FALSE
         AND start_time <= $1
         AND end_time > $1
       RETURNING id, item_slug`,
      [now]
    );

    const deactivated = await client.query(
      `UPDATE flash_sale_schedule
       SET is_active = FALSE
       WHERE is_active = TRUE
         AND end_time <= $1
       RETURNING id, item_slug`,
      [now]
    );

    if (activated.rows.length > 0) {
      console.log('[flashSaleCron] Activated sales:', activated.rows.map(r => r.item_slug).join(', '));
    }
    if (deactivated.rows.length > 0) {
      console.log('[flashSaleCron] Deactivated sales:', deactivated.rows.map(r => r.item_slug).join(', '));
    }

    return { activated: activated.rows.length, deactivated: deactivated.rows.length };
  } catch (err) {
    console.error('[flashSaleCron] syncFlashSales error:', err);
    return { activated: 0, deactivated: 0, error: err.message };
  } finally {
    client.release();
  }
}

export function startFlashSaleCron() {
  if (!ENABLE_CRON) {
    console.log('[flashSaleCron] Disabled via ENABLE_FLASH_SALE_CRON=false');
    return;
  }

  const flashTask = cron.schedule('* * * * *', syncFlashSales, {
    timezone: 'UTC',
    scheduled: true
  });

  const dailyTask = cron.schedule('0 0 * * *', rotateDailyDeal, {
    timezone: 'UTC',
    scheduled: true
  });

  console.log('[flashSaleCron] Started. Flash sync: every minute. Daily deal: 00:00 UTC.');
  return { flashTask, dailyTask };
}
