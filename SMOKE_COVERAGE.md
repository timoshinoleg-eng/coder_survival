# Smoke Coverage Inventory

> Last updated: 2026-05-07  
> Source of truth: `scripts/smoke-prod.ps1`, `scripts/smoke-offers.ps1`, backend routes.

---

## 1. What is currently smoke-tested

### `smoke-prod.ps1` — Full production path (17 checks)

| # | Endpoint / Flow | What it asserts | Priority |
|---|-----------------|-----------------|----------|
| 1 | `GET /health` | Returns `status` and `db` fields | P0 |
| 2 | `GET /api/state` | Energy, daily quests, event, pass level present | P0 |
| 3 | `POST /api/tap` | `commitsDelta`, event target, pass XP present | P0 |
| 4 | `GET /api/quests/daily` | 3 quests, targets `40 / 80 / 1`, full-clear bonus `+25` energy | P1 |
| 5 | `GET /api/battle/today` | Reward preview `50 / 30 / 15` energy | P1 |
| 6 | `GET /api/event/active` | Target `650` commits, reward `80 / 60 / 15` | P1 |
| 7 | `GET /api/pass/status` | 20 rewards, first XP `20`, total `915`, premium price `200` Stars | P1 |
| 8 | `GET /api/referral/link` | Referral code generated | P1 |
| 9 | `GET /api/referral/stats` | Milestones `1/3/5`, rewards `30/60/100`, active threshold `20` | P1 |
| 10 | `GET /api/shop/products` | Prices `10 / 40 / 75 / 200` Stars | P1 |
| 11 | `POST /api/buy` → `bot/api/invoice-link` | Purchase intent created, invoice URL returned | P1 |
| 12 | `GET /api/internal/observation/economy` | 7 `sqlSlices` present (DAU, quests, offers, hackathon, pass, shop, health) | P1 |
| 13 | `GET /api/team/my` | Team state readable | P1 |
| 14 | `POST /api/team/create` | Team created with invite code | P1 |
| 15 | `GET /api/team/leaderboard` | Leaderboard readable | P1 |
| 16 | `POST /api/team/leave` | Leave succeeds | P1 |
| 17 | `GET /bot/webhook` | Returns `401` or `405` (alive but unauthenticated) | P0 |

### `smoke-offers.ps1` — Context offer lifecycle (3 checks)

| # | Check | What it asserts | Priority |
|---|-------|-----------------|----------|
| 1 | Direct API offer generation | Offer appears after driving energy into range | P1 |
| 2 | `POST /api/offers/dismiss` (direct) | Offer hidden on subsequent state reads | P1 |
| 3 | Vercel proxy consistency | Offer also hidden through frontend `/api/state` proxy | P1 |

---

## 2. Coverage Gaps (not yet smoke-tested)

| Area | Missing Check | Risk if Broken | Suggested Priority |
|------|---------------|----------------|-------------------|
| **Energy countdown** | `state` / `tap` responses do not assert `progressionUpdatedAt` + `serverNow` | Frontend HUD may break silently | P1 |
| **Daily quest claim** | No `POST /api/quests/daily/:id/claim` flow | Full-clear bonus logic untested end-to-end | P2 |
| **Event claim** | No `POST /api/event/claim` | Reward fulfillment path untested | P2 |
| **Pass claim** | No `POST /api/pass/claim` | Sprint pass reward path untested | P2 |
| **Shop purchase confirm** | No `POST /api/internal/payments/telegram/confirm` (needs real Stars payment) | Hard to automate; manual only | P2 (manual) |
| **Team join** | `smoke-prod` only creates/leaves; never joins by code | Join-by-code path untested | P2 |
| **Referral milestone claim** | No `POST /api/referral/claim-milestone` | Milestone reward path untested | P2 |
| **Context offer via proxy** | `smoke-offers` checks state proxy, but not `POST /api/offers/dismiss` via proxy | Dismiss endpoint proxy untested | P2 |
| **Rate limits** | No 429 / soft-ban assertions | Anti-cheat regression risk | P3 |
| **Leaderboard filters** | Only `battle/today` checked; no `/api/leaderboard` with rank filters | Rank-filtered leaderboard untested | P3 |
| **Onboarding flow** | No assertions for first-session onboarding | UX regression risk | P3 |
| **Audio wiring** | No audio tests (expected — Phase 1 not wired yet) | N/A until Phase 1 | — |

---

## 3. Recommended Additions (short-term)

1. **Energy countdown contract check** (P1)  
   Add to `smoke-prod.ps1` after `state` and `tap` calls:
   ```powershell
   $state.serverNow -gt 0 -and $state.progressionUpdatedAt -ne $null
   ```

2. **Daily quest claim + full-clear bonus** (P2)  
   After `quests/daily` check, claim each quest and assert energy increase.

3. **Team join-by-code** (P2)  
   After `team/create`, use `team/join` with the invite code from a second smoke user.

4. **Proxy dismiss endpoint** (P2)  
   In `smoke-offers.ps1`, also call `POST $BaseUrl/api/offers/dismiss` through the Vercel proxy and assert 200.

---

## 4. Notes

- `smoke-prod.ps1` is designed to be **idempotent** for the smoke user (random `telegram_id` each run).
- `smoke-offers.ps1` uses a dedicated `telegram_id` (`900000777`) to avoid collision with main smoke.
- Both scripts fetch `BOT_TOKEN` and `BOT_BACKEND_SECRET` from the VM runtime to ensure they test the **live** configuration.
- No destructive operations (purchases, real payments) are automated. Purchase confirm remains a **manual live smoke** step.
