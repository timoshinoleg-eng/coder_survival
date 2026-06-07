# Docs Drift Audit

> Last updated: 2026-05-07  
> Method: cross-reference docs against working tree + prod state (HANDOFF.md / project-status.json)

---

## 1. Summary

| Doc | Status | Drift Found | Action Needed |
|-----|--------|-------------|---------------|
| `HANDOFF.md` | ✅ Current | None significant | None |
| `project-status.json` | ✅ Current | None significant | None |
| `README.md` | ✅ Current | Minor link gap | Add `observation/OPERATOR_CHEATSHEET.md` to docs list |
| `GAME_RULES.md` | ✅ Current | One env var phrasing | Clarify `ENERGY_RECOVERY_INTERVAL_SECONDS` source |
| `AUDIO_INTEGRATION_PLAN.md` | ✅ Current | None | None |
| `support/GAMEPLAY_FAQ.md` | ✅ Current | None | None |
| `support/SUPPORT_TRIAGE_CHECKLIST.md` | ✅ Current | None | None |
| `support/ENERGY_COUNTDOWN_FAQ.md` | ✅ Current | None | None |
| `observation/README.md` | ✅ Current | None | None |
| `observation/OPERATOR_CHEATSHEET.md` | ✅ Current | None | None |

**Verdict:** No critical drift. Two minor polish items below.

---

## 2. Detailed Findings

### 2.1 `README.md` — Missing Operator Cheat Sheet Link

**Finding:** The "Documentation → For team / development" section lists `observation/README.md` but does **not** list `observation/OPERATOR_CHEATSHEET.md`, which is the quick-reference companion.

**Fix:** Add the cheat sheet link.

### 2.2 `GAME_RULES.md` — `ENERGY_RECOVERY_INTERVAL_SECONDS` Source

**Finding:** The doc states:
> "Значение берётся из переменной окружения `ENERGY_RECOVERY_INTERVAL_SECONDS` (по умолчанию `60`)."

This is **technically correct** (`process.env.ENERGY_RECOVERY_INTERVAL_SECONDS || '60'` appears in `backend/src/routes/state.js`, `tap.js`, and `utils/progression.js`), but the doc does not mention that the variable is **optional** and falls back to 60 seconds hardcoded.

**Fix:** Add "(optional env var; hardcoded default 60s if unset)" to avoid operators thinking it must be explicitly configured.

### 2.3 `GAME_RULES.md` — Referenced Source Files Verified

All referenced backend source files exist and contain the expected constants:

| Reference in GAME_RULES.md | File | Status |
|----------------------------|------|--------|
| `backend/src/config/balance.js` (`TAP_MECHANICS.depressionPenaltyMultiplier`) | ✅ `0.5` | Confirmed |
| `backend/src/utils/vnext.js` (`XP_THRESHOLDS`, `RANK_META`) | ✅ Present | Confirmed |
| `backend/src/utils/vnext.js` (`updateDailyQuestProgress`, `markLoginQuestComplete`) | ✅ Present | Confirmed |
| `backend/src/utils/rewards.js` (`applyReward`) | ✅ Present | Confirmed |
| `backend/src/utils/events.js` | ✅ Exists | Confirmed |
| `backend/src/utils/offers.js` (`getContextOffer`) | ✅ Exists | Confirmed |
| `backend/src/utils/shopCatalog.js` (`premium_pass` = 200⭐) | ✅ Exists | Confirmed |
| `backend/src/utils/pass.js` | ✅ Exists | Confirmed |
| `backend/src/routes/tap.js:121` (`addPassXp`) | ✅ `tap.js` references pass XP | Confirmed |
| `backend/src/routes/buy.js` | ✅ Exists | Confirmed |
| `bot/api/invoice-link.js` | ✅ Exists | Confirmed |
| `backend/src/routes/internalPayments.js` | ✅ Exists | Confirmed |
| `backend/src/utils/teams.js` | ✅ Exists | Confirmed |

### 2.4 `AUDIO_INTEGRATION_PLAN.md` — File Mapping Verified

All 14 mapped files exist in the working tree:

| Mapped File | Exists | Note |
|-------------|--------|------|
| `frontend/src/utils/AudioManager.js` | ✅ | Staged, unwired |
| `frontend/src/utils/SFX_REGISTRY.js` | ✅ | Staged, unwired |
| `frontend/src/utils/sfx/*.js` (4 files) | ✅ | Staged, unwired |
| `frontend/src/components/AudioSettings.*` | ✅ | Staged, unwired |
| `frontend/public/audio/bgm_*.ogg` (4 files) | ✅ | Staged |
| `frontend/public/audio/music_manifest.json` | ✅ | Staged |
| `frontend/public/audio/audio_manifest.json` | ✅ | Staged |
| `frontend/public/audio/LICENSES.md` | ✅ | Staged |

**Status note:** The plan states "No runtime wiring yet." This remains true. No drift.

### 2.5 `HANDOFF.md` vs `project-status.json`

Both documents agree on:
- Latest migration: `007_minimum_economy_instrumentation.sql` ✅
- Prod URLs (Vercel frontend, DuckDNS upstream, bot webhook) ✅
- Verified flows list (health, state, tap, quests, battle, event, pass, referral, shop, team, buy/invoice-link, observation, energy countdown) ✅
- Next steps (observe metrics, rotate secrets if crossed boundary) ✅

No drift.

### 2.6 Smoke Scripts vs Docs

`smoke-prod.ps1` asserts concrete economy values that match `GAME_RULES.md` and `backend/src/config/balance.js`:
- Quest targets `40 / 80 / 1` ✅
- Battle rewards `50 / 30 / 15` ✅
- Event target `650`, reward `80/60/15` ✅
- Pass curve total `915`, premium price `200` ✅
- Referral milestones `1/3/5`, rewards `30/60/100`, threshold `20` ✅
- Shop prices `10/40/75/200` ✅

No drift.

---

## 3. Action Items

- [ ] `README.md` — add `observation/OPERATOR_CHEATSHEET.md` to docs list (low priority).
- [ ] `GAME_RULES.md` — clarify that `ENERGY_RECOVERY_INTERVAL_SECONDS` is optional with hardcoded default.
- [ ] No other docs changes required at this time.
