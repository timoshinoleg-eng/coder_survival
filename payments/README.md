# Coder Survival — Payments Directory

**Status:** Legacy cleanup completed on 2026-05-07.

## What was removed

- `bot-webhook.js` — dead mock path (always `MOCK_MODE = true`, empty `grantItemToUser`)
- `prices.json` — stale webhook catalog with wrong prices and deprecated item IDs

## What remains

This directory is intentionally kept empty to preserve the path in repo history, but it is **not referenced** by any production code path.

## Production payment truth

| Layer | Source of truth |
|-------|-----------------|
| Shop catalog (backend) | `backend/src/utils/shopCatalog.js` |
| Item effects | `backend/src/routes/buy.js` (`applyItemEffect`) |
| Invoice creation (bot) | `bot/api/invoice-link.js` — resolves invoice context from backend internal payments route |
| Payment confirm | `backend/src/routes/internalPayments.js` |
| Stars transactions | `star_payments` table |
| Purchases | `purchases` table |

## Invoice amount source

Invoice amount now comes from stored `purchases.stars_amount` via backend internal invoice context, which removes the old bot-side price drift path for confirm.

For current payment-path follow-up and residual operational notes: see `SUPPORT_KNOWN_ISSUES.md` Issue 1.
