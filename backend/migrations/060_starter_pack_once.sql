-- Migration 060: enforce one-time starter pack per account.
-- A refunded purchase frees the slot again (deliberate: refund = can rebuy).
-- Guards the concurrent double-intent race the pre-check in buy.js cannot close.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_starter_pack_once
  ON purchases (user_id)
  WHERE item_type = 'starter_pack' AND status IN ('pending', 'completed');
