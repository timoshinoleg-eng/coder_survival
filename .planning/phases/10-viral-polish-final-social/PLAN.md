# Phase 10: Viral Polish & Final Social — PLAN.md

> Context: [10-CONTEXT.md](./10-CONTEXT.md)
> Mode: MVP
> Estimated: 4 waves, ~16 tasks

---

## Wave 1: Backend Foundation (Config, Migrations, GIF Renderer)

**Goal:** Set up data layer and GIF generation utility.

1. **Migration `033_phase10_final_social.sql`**
   - Insert `office_cat` and `rubber_duck` into `skin_definitions`
   - Insert `rubber_duck_unlock` achievement (trigger: `minigame_failure`, target: 3, hidden)

2. **Install `gifencoder`**
   - `cd backend && npm install gifencoder@2.0.1`

3. **Config update `backend/src/config/balance.js`**
   - `PHASE10.SKIN_PRICES.office_cat = 100`
   - `PHASE10.GIF.FRAME_DELAY_MS` defaults

4. **GIF renderer `backend/src/utils/gifRenderer.js`**
   - `generateDebugStagesGif()` → 5 frames, 700ms delay, 200×200px pixel-art style
   - `generateDeadlineGif()` → 2 frames, 1400ms delay, 200×200px
   - Uses `@napi-rs/canvas` for frame drawing + `gifencoder` for encoding
   - Returns `Buffer`

5. **Shop catalog update `backend/src/utils/shopCatalog.js`**
   - Add `office_cat` product: 100 Stars, category 'skin'

6. **Buy route update `backend/src/routes/buy.js`**
   - Add `office_cat` case in `applyItemEffect`: insert into `user_skins`

---

## Wave 2: GIF Reactions & Bot Integration

**Goal:** Deliver both GIF features via bot.

7. **Track bug-hunt failures `backend/src/routes/minigame.js`**
   - On `code_review` failure, increment `inventory.code_review_failures_today`
   - Reset counter at midnight (via week start logic or on first play of day)
   - When count reaches 10, flag `shouldSendDebugGif = true` in response

8. **Bot auto-send debug GIF `bot/src/createBot.js`**
   - On `successful_payment` or any user interaction, check if debug GIF is pending (simpler: backend returns flag, frontend asks bot)
   - Alternative: Backend stores `pending_gif_type` in progression, bot polls or backend pushes via Telegram message
   - **MVP approach**: The `/api/minigame/complete` response includes `pendingGif: 'debug_stages'` when 10 failures reached. Frontend (or bot) triggers send.
   - **Bot implementation**: New bot command `/sendgif debug` (internal) or auto-send on next interaction.
   - **Simpler**: Bot watches a new backend endpoint `/api/internal/gif-pending` and sends GIFs.
   - **Simplest MVP**: In `minigame.js` /complete, when 10th failure detected, call `postToTelegramChat` directly from backend to send the GIF buffer. This reuses Phase 8's extracted utility.

9. **Backend GIF endpoint `backend/src/routes/meme.js` (or new)**
   - `POST /api/meme/gif` — generates GIF on demand, returns buffer or base64
   - Actually, simpler: generate in-memory and send directly via `postToTelegramChat` using `sendAnimation` API call with multipart form data.

10. **Bot `/deadline` command `bot/src/createBot.js`**
    - User types `/deadline` in chat with bot
    - Bot generates deadline GIF and sends it via `ctx.replyWithAnimation({ source: buffer })`

---

## Wave 3: Skin Effects & Secret Achievement

**Goal:** Make new skins functional.

11. **Achievement trigger `backend/src/utils/achievements.js`**
    - Add `case 'minigame_failure'`
    - Track failures per day in `user_achievements` progress
    - When target (3) reached, grant `rubber_duck_unlock` and insert `rubber_duck` into `user_skins`

12. **Office Cat effect `backend/src/utils/progression.js`**
    - In `recoverProgression`, after energy recovery, check equipped `office_cat`
    - If equipped AND 5+ minutes since last depression relief, reduce depression by 10 (min 0)
    - Store `last_cat_relief_at` in progression or use the same checkpoint logic
    - **Simpler**: Since recoverProgression runs on every state fetch, check `secondsPassed >= 300` (5 min) and if office_cat equipped, `depression = max(0, depression - 10)`.

13. **Rubber Duck effect `backend/src/routes/minigame.js`**
    - In `/complete`, after calculating `success`, check equipped `rubber_duck`
    - If equipped AND `!success`, roll 20% chance. If lucky, set `success = true`, `duckSaved = true` in response.
    - Grant rewards as if success.

14. **Secret achievement visibility `backend/src/routes/state.js` (or achievements route)**
    - When listing achievements, filter out any with `is_secret = true` AND not yet completed for the user.
    - Add `is_secret` column to achievements table if needed (or use convention: `id.startsWith('secret_')` or `condition->>'hidden' = 'true'`).
    - **MVP**: Use existing `condition` JSONB — `condition->>'hidden' = 'true'`. Frontend/Backend filters uncompleted hidden achievements.

---

## Wave 4: Social Poll & Integration

**Goal:** Post-interaction poll after Daily Battle.

15. **Daily Battle poll `backend/src/jobs/dailySummaryCron.js`**
    - After posting battle summary to each member's chat, send a follow-up poll:
      ```
      sendPoll(chatId, 'Как прошел день?', ['Продуктивно', 'Выгорел', 'Нужен кофе'])
      ```
    - Uses `postToTelegramChat` utility with `method: 'sendPoll'`.

16. **Frontend skin display**
    - Ensure `office_cat` and `rubber_duck` appear in skin list if skins are dynamically loaded from `/api/skins`.
    - If static list, add entries.

---

## Wave 5: Tests & Polish

**Goal:** All green.

17. **Unit tests `backend/tests/phase10.unit.test.js`**
    - GIF buffer generation (non-null, correct size)
    - Office Cat depression relief math
    - Rubber Duck 20% override (mock random)
    - Secret achievement trigger on 3 failures
    - Shop catalog includes office_cat

18. **Build verification**
    - `cd frontend && npm run build` — zero errors
    - `cd backend && npm test` — all pass

19. **Git commit**
    - `feat(10): Viral Polish & Final Social — GIFs, skins, secret achievement, poll`

---

## Verification Checklist

- [ ] `gifencoder` installed, GIF renderer produces valid buffers.
- [ ] 10 failed Code Review attempts trigger auto-send of debug GIF to player's chat.
- [ ] `/deadline` bot command sends Manager NPC GIF.
- [ ] Office Cat purchasable for 100 Stars; equipping reduces depression by 10 every 5 min.
- [ ] Rubber Duck unlocks after 3 mini-game failures in a day (hidden achievement).
- [ ] Rubber Duck equipped gives 20% chance to turn mini-game failure into success.
- [ ] Daily Battle poll posted to bound chat after summary.
- [ ] All tests pass (target: 6+ new tests).
- [ ] No breaking changes to existing purchases, mini-games, or daily battle.
