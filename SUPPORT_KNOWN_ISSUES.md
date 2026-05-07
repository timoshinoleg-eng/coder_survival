# Coder Survival — Support Known-Issues Inventory

**Scope:** docs-only risk inventory. No production code changes here.  
**Last updated:** 2026-05-07  
**Source of truth:** code in repo + `DRIFT_HANDOFF_STATUS_vs_CODE.md`

---

## Issue 1 — Bot Invoice-Link vs Backend Catalog Drift

**Severity:** Resolved in repo on 2026-05-07  
**Status:** Closed in code. Follow-up is production verification only.  
**Files involved:** `bot/api/invoice-link.js`, `backend/src/routes/internalPayments.js`, `backend/src/routes/buy.js`

### What changed

- `bot/api/invoice-link.js` no longer builds invoice amounts from a second bot-side price map.
- Bot now calls backend internal route `/api/internal/payments/telegram/invoice-context`.
- Backend invoice context resolves title/description from catalog metadata and amount from stored `purchases.stars_amount`.
- This removes the previous drift path that could cause `Amount mismatch` on confirm.

### Remaining follow-up

- Run live production verification for `buy -> invoice-link -> confirm` after deploy.
- Optional hardening later: add a dedicated smoke or CI check for the invoice path.

---

## Issue 2 — Smoke Coverage Gaps (By Design)

**Severity:** Low  
**Status:** Accepted limitation. Manual spot-checks cover the gap.

What smoke does **not** cover:
- Premium pass purchase flow end-to-end (`/api/buy` → invoice-link → confirm)
- `team.total_commits` increase from non-tap reward sources
- Exact energy threshold (19) for `low_energy` offer trigger

Mitigation:
- `scripts/smoke-offers.ps1` covers offer logic down to `energy ≤ 25`.
- Manual live verification was performed on 2026-05-07 for payment flow and team commits.
- `scripts/observe-economy.ps1` covers post-release aggregate health.

---

## Issue 3 — VM Egress to `api.telegram.org`

**Severity:** Medium (runtime topology limitation)  
**Status:** Permanently bypassed by moving bot runtime to Vercel webhook.

- VM `111.88.247.195` cannot reliably reach `https://api.telegram.org`.
- Bot runtime is now hosted on `https://coder-survival-bot.vercel.app/api/webhook`.
- `bot/index.js` (polling) is guarded by `ENABLE_POLLING_BOT=true` and explicitly not the production path.

---

*This file is updated during routine support sweeps. If a listed issue is resolved, keep the resolution note and move the operational follow-up into the status block.*
