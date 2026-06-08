-- migrations/051_flash_sales.sql
-- Flash Sales & Daily Deals engine

CREATE TABLE IF NOT EXISTS flash_sale_schedule (
    id SERIAL PRIMARY KEY,
    sale_type VARCHAR(16) NOT NULL CHECK (sale_type IN ('flash_sale', 'daily_deal')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    item_slug VARCHAR(32) NOT NULL,
    discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flash_sale_schedule_time ON flash_sale_schedule(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_flash_sale_schedule_active ON flash_sale_schedule(is_active);

CREATE TABLE IF NOT EXISTS daily_deals (
    deal_date DATE PRIMARY KEY,
    item_slug VARCHAR(32) NOT NULL,
    original_stars INTEGER NOT NULL,
    discounted_stars INTEGER NOT NULL,
    purchases_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_deals_date ON daily_deals(deal_date);
