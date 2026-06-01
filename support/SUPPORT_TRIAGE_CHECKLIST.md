# Support Triage Checklist

> Operational step-by-step guides for the most common player complaints.  
> If a case does not match the expected path — escalate to backend with the data points listed below.

---

## 1. Payment missing — "Я оплатил, но предмета нет"

### Quick checks

1. **Find the latest purchase**
   ```sql
   SELECT id, item_type, stars_amount, status, created_at
   FROM purchases
   WHERE user_id = (SELECT id FROM users WHERE telegram_id = :tgId)
   ORDER BY id DESC
   LIMIT 5;
   ```

2. **Interpret status**
   - `pending` → payment webhook from Telegram not yet received. Ask player to wait 1–2 min and reopen the app.
   - `completed` → move to step 3.

3. **Verify payment record**
   ```sql
   SELECT telegram_payment_charge_id, status, created_at
   FROM star_payments
   WHERE purchase_id = :purchaseId;
   ```
   - Missing record → webhook lost. May need manual backend intervention.
   - Record exists → move to step 4.

4. **Audit trail**
   ```sql
   SELECT action, context, created_at
   FROM audit_logs
   WHERE user_id = :userId
     AND action IN ('purchase_intent', 'payment_confirm', 'pass_premium_unlock', 'item_effect')
   ORDER BY created_at DESC
   LIMIT 10;
   ```

5. **Check player state for expected effect**
   | Item | Expected state change |
   |------|----------------------|
   | `energy_refill` | `progression.energy = maxEnergy` |
   | `depression_cure` | `progression.depression_level` down by ~60 (capped at 0) |
   | `tier_boost` | `player_levels.xp_total` +40, `progression.commits_current` +50 |
   | `premium_pass` | `player_passes.is_premium = TRUE` for active pass |

### Escalate to backend if
- `star_payments` exists + `purchases.status = 'completed'` + audit shows `payment_confirm`, **but** player state is unchanged.
- `Amount mismatch` error appears in backend logs (rare after invoice-link fix).
- Multiple `pending` purchases older than 10 minutes with no `star_payments` record.

---

## 2. Quest not claimed / Full-clear bonus missing

### Quick checks

1. **List today's quests**
   ```sql
   SELECT quest_type, target_value, progress_value, completed, claimed, completed_at, claimed_at
   FROM daily_quests
   WHERE user_id = :userId AND quest_date = CURRENT_DATE;
   ```

2. **Triage**
   - Any row has `claimed = false` → **expected behavior**. Player must press «Забрать» manually.
   - All 3 rows have `claimed = true` but player says no +25 bonus → move to step 3.

3. **Check energy before/after last claim**
   ```sql
   SELECT energy, updated_at
   FROM progression
   WHERE user_id = :userId;
   ```
   Compare `updated_at` with `daily_quests.claimed_at` of the last claimed quest. Bonus is applied at the moment the **last** quest is claimed.

### Escalate to backend if
- All 3 quests `claimed = true`, but `progression.energy` did not increase by 25 after the last `claimed_at`.
- `daily_quests` shows `completed = true` but `claimed = false` and the UI does not show a claim button (frontend state desync — ask player to reload).

---

## 3. Event reward missing — "Хакатон пройден, награды нет"

### Quick checks

1. **Active event**
   ```sql
   SELECT id, target_commits, reward_payload
   FROM events
   WHERE is_active = TRUE AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE;
   ```

2. **Player contribution**
   ```sql
   SELECT commits_contributed, claimed
   FROM event_contributions
   WHERE user_id = :userId AND event_id = :eventId;
   ```

3. **Triage**
   - `commits_contributed < target_commits` → player has not reached the goal yet.
   - `claimed = false` + `commits_contributed >= target_commits` → **expected behavior**. Player must press «Забрать» in the event panel.
   - `claimed = true` → move to step 4.

4. **Verify reward application**
   Check `audit_logs` for `event_claim` and inspect `progression.energy`, `progression.commits_current`, `progression.depression_level` against `events.reward_payload`.

### Escalate to backend if
- `claimed = true`, audit shows `event_claim`, but player state does not match `reward_payload` values.
- `commits_contributed >= target_commits`, but `POST /api/event/claim` returns an error.

---

## 4. Team join failed — "Не могу войти в команду"

### Quick checks

1. **Is the player already in a team?**
   ```sql
   SELECT team_id, role FROM team_members WHERE user_id = :userId;
   ```
   - Row exists → player must leave current team first.

2. **Does the invite code exist?**
   ```sql
   SELECT id, name FROM teams WHERE invite_code = UPPER(:code);
   ```

3. **Is the team full?**
   ```sql
   SELECT COUNT(*) as cnt FROM team_members WHERE team_id = :teamId;
   ```
   - `cnt >= 5` → **expected behavior**. Team is full.

4. **Recent error logs** (if available via `docker-compose logs`)
   Look for `Already in a team` or `Team is full` responses from `backend/src/utils/teams.js`.

### Escalate to backend if
- Player is not in any team, code exists, team has <5 members, but join still returns 500 or unexpected error.
- `team_members` state is inconsistent (duplicate rows for same user, etc.).

---

## 5. Referral milestone not active — "Пригласил друга, а он не считается"

### Quick checks

1. **Referral link exists?**
   ```sql
   SELECT referrer_id, referred_id, status
   FROM referrals
   WHERE referrer_id = :userId OR referred_id = (SELECT id FROM users WHERE telegram_id = :friendTgId);
   ```

2. **Referred player's commit count**
   ```sql
   SELECT commits_total FROM progression WHERE user_id = :referredUserId;
   ```
   - `< 20` → **expected behavior**. Friend is not active yet.
   - `>= 20` → move to step 3.

3. **Milestone status**
   ```sql
   SELECT milestone, reward_energy
   FROM referral_milestone_claims
   WHERE user_id = :userId AND milestone IN (1, 3, 5);
   ```
   - Missing milestone row → player has not claimed it. Ask to open Referral panel and press «Забрать».
   - Row exists → milestone already claimed. Check `progression.energy` at `created_at` time.

4. **Active referral count**
   ```sql
   SELECT COUNT(*) as active_count
   FROM referrals r
   JOIN progression p ON p.user_id = r.referred_id
   WHERE r.referrer_id = :userId AND p.commits_total >= 20;
   ```
   Compare against `REFERRAL_MILESTONE_REWARDS` thresholds (1 / 3 / 5).

### Escalate to backend if
- Referred has `>= 20` commits, but `referrals.status` is still `pending` **and** claim attempt fails with 409/500.
- `referral_milestone_claims` row exists, but `progression.energy` did not increase by the `reward_energy` amount.
- Active count in SQL matches milestone, but UI does not show the claim button after reload.

---

## 6. Meme generator — «Мем пустой / чёрный / не генерируется»

### Quick checks

1. **Check meme render audit trail**
   ```sql
   SELECT action, context, created_at
   FROM audit_logs
   WHERE user_id = :userId
     AND action = 'meme_render'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

2. **Verify backend commit/deploy date**
   - Meme illustrated-scene fix is in commit `e2393fa`.
   - If production backend image was built **before** this commit, the fix is not yet live.
   - Confirm with: `SELECT NOW() - INTERVAL '1 hour'` vs backend deploy time.

3. **Quick API smoke**
   ```powershell
   Invoke-RestMethod "https://coder-survival-api.duckdns.org/api/meme?telegramId=:tgId" `
     -Headers @{ 'X-Telegram-Init-Data' = ':initData' } `
     -TimeoutSec 15
   ```
   - HTTP 200 + body length > 10 KB → likely OK.
   - HTTP 200 + body length < 5 KB → possibly blank card; escalate.
   - HTTP 4xx/5xx → backend error; escalate.

### Escalate to backend if
- Response is HTTP 200 but PNG is visually blank/black after decode.
- `audit_logs` shows `meme_render` entries but no `meme_share` follow-ups despite player action.
- Error appears in backend logs related to `memeRenderer.js` or canvas/image buffers.

---

## 7. Onboarding / Help — «Не понятно, что делать» / «Обучение не появилось»

### Quick checks

1. **Is this a first-time player?**
   ```sql
   SELECT created_at, sessions_count
   FROM users
   WHERE telegram_id = :tgId;
   ```
   - `created_at` within last 24 hours + `sessions_count <= 2` → new player.

2. **Check if onboarding was dismissed/completed**
   - Ask player: «Видели ли вы всплывающие подсказки при первом входе?»
   - If yes and dismissed → expected; direct to `?` help button if available.
   - If no and account is new → possible frontend state issue.

3. **Verify frontend build version**
   - Ask player to перезайти в Mini App (закрыть и открыть заново).
   - Check if `?` help button is visible in HUD after reload.

### Escalate to backend if
- Onboarding is entirely missing for a brand-new account on a fresh open.
- Help button (`?`) is missing across multiple sessions for the same user.
- Frontend build is confirmed current but onboarding component fails to mount (check browser console for JS errors).

---

## Generic escalation template

When a case is **not** expected behavior, include:

- `telegram_id` (или `user_id`)
- Время жалобы (UTC)
- Скриншот / описание действий игрока
- Результаты **всех** SQL-шагов из чеклиста выше
- Любые `audit_logs` записи с `action` и `context`
- Ответ API (если жалоба касается ошибки endpoint)
