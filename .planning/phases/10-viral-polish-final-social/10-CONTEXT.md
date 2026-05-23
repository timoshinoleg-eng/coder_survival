# Phase 10: Viral Polish & Final Social — CONTEXT.md

> Status: Locked decisions for planning
> Requirements: MEME-04, MEME-05, VISU-08, VISU-09, SOCL-03
> Date: 2026-05-22

---

## Requirements

### MEME-04: GIF «Пять стадий отладки»
- Auto-sends after 10 failed Code Review bug-hunt attempts
- 3.5s pixel-art style GIF

### MEME-05: GIF «Менеджер: +1 дедлайн»
- Can be sent via reply button in chat
- 2.8s pixel-art style GIF

### VISU-08: Скин «Офисный кот»
- –10 depression every 5 minutes when equipped
- Purchasable with Telegram Stars (100 Stars)

### VISU-09: Скин «Резиновая уточка»
- Hides random mini-game errors (20% chance to suppress failure message)
- Unlocks via secret achievement

### SOCL-03: Telegram Stories / Social Poll
- Published after Daily Battle closes
- Interactive poll with results

---

## Locked Decisions

### GIF Generation
1. **Library**: `gifencoder` v2.0.1 + existing `@napi-rs/canvas` for frame rendering.
2. **"Five stages of debugging"**: 5 frames (Denial → Anger → Bargaining → Depression → Acceptance), 700ms each = 3.5s. Pixel-art style via canvas rectangles + text.
3. **"Manager NPC: +1 deadline"**: 2 frames (Manager face → "+1 deadline" text), 1.4s each = 2.8s.
4. **Storage**: Generated on-demand, cached in memory (LRU), no DB storage.
5. **Delivery**: Bot sends animation via `sendAnimation` (buffer from canvas + gifencoder).

### Office Cat Skin
6. **Price**: 100 Telegram Stars.
7. **Effect application**: In `recoverProgression` — if equipped, reduce depression by 10 every 5 min (same cadence as energy recovery check).
8. **Purchase flow**: Standard Stars purchase via `/api/buy` → `applyItemEffect` grants skin into `user_skins`.

### Rubber Duck Skin
9. **Secret achievement**: `rubber_duck_unlock` — triggered after 3 mini-game failures in a single day. Hidden from achievement list until unlocked.
10. **Effect**: In `minigame.js` /complete — if equipped AND mini-game failed, 20% chance to set `success = true` and grant reward anyway (the "duck saved you" effect).
11. **Achievement condition**: `trigger_type = 'minigame_failure'`, `target_value = 3`, `condition->>'period' = 'day'`.

### Telegram Stories (MVP Fallback)
12. **Primary**: Telegram Bot API `postStory` requires channel admin + specific permissions. Document as Phase 10+ enhancement.
13. **MVP Fallback**: After Daily Battle closes, post an interactive poll to the bound work chat using `sendPoll` with the question: "Как прошел день?" and options: "Продуктивно", "Выгорел", "Нужен кофе".
14. **Integration point**: Hook into `dailySummaryCron.js` after the battle summary post.

### Scope Fences
- **IN**: 2 GIF generators, 2 new skins with effects, secret achievement, chat poll fallback.
- **OUT**: True Telegram Stories (deferred to post-v1), complex pixel-art asset creation.
- **NO**: Phaser scenes for GIFs.
- **NO**: New DB tables (reuse existing achievements, user_skins, purchases).

---

## Reusable Assets

| Asset | Location | How to reuse |
|-------|----------|-------------|
| Canvas renderer | `backend/src/utils/memeRenderer.js` | Extend with GIF frame drawing |
| Bot sendAnimation | `bot/src/createBot.js` | Use `ctx.api.sendAnimation` with buffer |
| Stars purchase | `backend/src/routes/buy.js` + `internalPayments.js` | Add `office_cat` product |
| Skin system | `user_skins` + `skin_definitions` | Seed new skins, query equipped in loops |
| Achievement engine | `backend/src/utils/achievements.js` | Add `minigame_failure` trigger |
| Recovery loop | `backend/src/utils/progression.js` | Add depression relief check |
| Mini-game complete | `backend/src/routes/minigame.js` | Add rubber duck override |
| Daily summary cron | `backend/src/jobs/dailySummaryCron.js` | Add poll after battle post |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/033_phase10_final_social.sql` | Seed `office_cat`, `rubber_duck` skins + secret achievement |
| `backend/src/utils/gifRenderer.js` | GIF encoder wrapper using canvas frames |
| `backend/src/utils/secretAchievement.js` | Helper to check if achievement should be hidden |
| `backend/tests/phase10.unit.test.js` | Tests for GIF generation, skin effects, secret achievement |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Add skin prices, gif config |
| `backend/src/utils/shopCatalog.js` | Add `office_cat` product (100 Stars) |
| `backend/src/routes/buy.js` | Handle `office_cat` purchase effect |
| `backend/src/utils/achievements.js` | Add `minigame_failure` trigger case |
| `backend/src/utils/progression.js` | Office Cat depression relief in recovery loop |
| `backend/src/routes/minigame.js` | Track failures, rubber duck override, failure achievement trigger |
| `backend/src/routes/tap.js` | (if needed) |
| `backend/src/jobs/dailySummaryCron.js` | Send poll after battle summary |
| `bot/src/createBot.js` | Add `/deadline` command and debug GIF auto-send logic |
| `frontend/src/components/SkinPanel.jsx` | (if exists) Ensure new skins display |
