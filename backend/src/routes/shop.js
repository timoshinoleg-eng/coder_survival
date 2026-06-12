import { Router } from 'express';
import { pool } from '../index.js';
import { getProducts, getProductById } from '../utils/shopCatalog.js';
import { validate } from '../middleware/validate.js';
import { purchaseDealSchema } from '../validation/schemas.js';

const router = Router();



router.get('/products', async (req, res) => {
  res.json({ success: true, products: getProducts() });
});

/**
 * GET /api/shop/active-sales
 * Returns current flash sale and daily deal with enriched product info.
 */
router.get('/active-sales', async (req, res) => {
  const client = await pool.connect();
  try {
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const dailyDealResult = await client.query(
      `SELECT deal_date, item_slug, original_stars, discounted_stars, purchases_count
       FROM daily_deals
       WHERE deal_date = $1`,
      [today]
    );

    const flashSaleResult = await client.query(
      `SELECT id, sale_type, start_time, end_time, item_slug, discount_percent
       FROM flash_sale_schedule
       WHERE is_active = TRUE
         AND start_time <= $1
         AND end_time > $1
       ORDER BY start_time
       LIMIT 1`,
      [now]
    );

    const dailyDeal = dailyDealResult.rows[0] || null;
    const flashSale = flashSaleResult.rows[0] || null;

    let enrichedDailyDeal = null;
    if (dailyDeal) {
      const product = getProductById(dailyDeal.item_slug);
      const tomorrow = new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1
      ));
      enrichedDailyDeal = {
        ...dailyDeal,
        product: product || null,
        endsAt: tomorrow.toISOString()
      };
    }

    let enrichedFlashSale = null;
    if (flashSale) {
      const product = getProductById(flashSale.item_slug);
      enrichedFlashSale = {
        ...flashSale,
        product: product || null,
        endsAt: flashSale.end_time
      };
    }

    res.json({
      success: true,
      dailyDeal: enrichedDailyDeal,
      flashSale: enrichedFlashSale
    });
  } catch (err) {
    console.error('[shop/active-sales] Error:', err);
    res.status(500).json({ error: 'Failed to load active sales' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/shop/purchase-deal
 * Validates active deal timer, creates a discounted purchase intent,
 * and returns a Telegram payment payload.
 */
router.post('/purchase-deal', validate(purchaseDealSchema), async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { dealType } = req.body;
  const now = new Date().toISOString();

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      let itemSlug;
      let discountedStars;

      if (dealType === 'daily_deal') {
        const today = new Date().toISOString().slice(0, 10);
        const dealResult = await client.query(
          `SELECT item_slug, discounted_stars
           FROM daily_deals
           WHERE deal_date = $1`,
          [today]
        );
        if (dealResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'No active daily deal' });
        }
        itemSlug = dealResult.rows[0].item_slug;
        discountedStars = dealResult.rows[0].discounted_stars;

        await client.query(
          `UPDATE daily_deals
           SET purchases_count = purchases_count + 1
           WHERE deal_date = $1`,
          [today]
        );
      } else if (dealType === 'flash_sale') {
        const flashResult = await client.query(
          `SELECT item_slug, discount_percent
           FROM flash_sale_schedule
           WHERE is_active = TRUE
             AND start_time <= $1
             AND end_time > $1
           ORDER BY start_time
           LIMIT 1`,
          [now]
        );
        if (flashResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'No active flash sale' });
        }
        itemSlug = flashResult.rows[0].item_slug;
        const product = getProductById(itemSlug);
        if (!product) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Product not found' });
        }
        const discount = flashResult.rows[0].discount_percent;
        discountedStars = Math.max(1, Math.ceil(product.stars * (100 - discount) / 100));
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid dealType' });
      }

      const product = getProductById(itemSlug);
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found in catalog' });
      }

      const purchaseResult = await client.query(
        `INSERT INTO purchases (user_id, item_type, stars_amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [userId, itemSlug, discountedStars]
      );
      const purchase = purchaseResult.rows[0];

      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'deal_purchase_intent', $2::jsonb)`,
        [userId, JSON.stringify({ purchaseId: purchase.id, dealType, itemType: itemSlug, starsAmount: discountedStars })]
      );

      await client.query('COMMIT');

      res.status(202).json({
        success: true,
        purchase: {
          id: purchase.id,
          itemType: purchase.item_type,
          starsAmount: purchase.stars_amount,
          status: purchase.status
        },
        payment: {
          required: true,
          currency: 'XTR',
          payload: `purchase:${purchase.id}:${itemSlug}`
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
