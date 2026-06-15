# Coder Survival: Viral Growth Blueprint

> **Objective:** Maximize organic growth (K-factor, share rate, invite rate) before any paid acquisition.
> **Non-goal:** Revenue optimization. That is Phase 2.
> **Date:** 2026-06-15
> **Methodology:** Swarm v3 — 4-agent pipeline (Research Auditor → Codebase Auditor → Gap Analyst → Viral Prioritizer). All evidence claims traceable to source files.

---

## 1. Executive Summary

- **Biggest viral gap:** The referral deep-link is broken — every "Invite" tap sends a `?startapp=ref_X` URL that only works inside the Mini App, not via `t.me/bot?start=` deep-link. The bot's `/start` handler ignores `ctx.startPayload` entirely. K-factor is structurally 0 until this is fixed. **Evidence:** `bot/src/createBot.js` L18–29; `backend/src/routes/referral.js` L120,178 — Agent 3 Gap G01+G02 (Critical).
- **Highest-leverage task:** TASK-009 (deep-link referral fix, 0.5 pd) — VPS 153.9, highest in the entire backlog. Combined with TASK-008 (Stars milestone rewards, 0.5 pd, VPS 115.2), these two tasks unblock the entire K-factor loop in 1 day of engineering.
- **Expected outcome:** If Phase 0 ships: K-factor ≥ 1.2, referral activation rate ≥ 30%, death-screen share rate ≥ 8%, D7 retention +15% (push notifications).

---

## 2. Evidence from Research

1. **Referral multiplier (Premium = 20×):** Notcoin achieved invite rate 4.2 and K-factor 3–5 with a Premium-referral 20× multiplier; beta grew from 500 to 70K in 2–3 days. — *Source: `coder_survival.agent.final.md` §5.1.1 + `coder_survival_insight.md` Insight 9*
2. **"Share Shame" death-screen cards:** Shame (0.970 loading) and embarrassment (0.854) are the strongest memorability triggers. The Screenshot game mechanic proved 26,198 reach + 317 DMs for $2.40 budget. — *Source: `coder_survival.agent.final.md` §5.3.3 + §2.2.1 + `coder_survival_insight.md` Insight 13*
3. **Squad System + Telegram-embedded leaderboards:** Squads tied to Telegram groups boost invite rate by 30–50%; leaderboards increase retention +25%. Notcoin Squads were the primary virality driver. — *Source: `coder_survival.agent.final.md` §5.1.3 + §2.2.5*
4. **Telegram Stories auto-generation:** `web_app_share_to_story` API enables one-tap sharing. DOGS reached 50M+ users using Stories as a fundamental viral channel. — *Source: `coder_survival.agent.final.md` §5.2.2*
5. **UGC meme generator (5 dev-culture templates):** IT audience shares emotionally-identifiable content (burnout, imposter syndrome); 22.5% of IT-channel content is memes/humor. "Deploy on Friday" time-lock creates FOMO. — *Source: `coder_survival.agent.final.md` §5.3.1–5.3.2 + `coder_survival_insight.md` Insight 11*

---

## 3. Gap Matrix (Critical and High Severity Only)

| ID | Viral Mechanic | Research Requirement | Current Implementation | Severity | Blocked By | Evidence |
|----|---------------|----------------------|----------------------|----------|------------|----------|
| G01 | Bot deep-link referral (`/start ref_*`) | Bot must parse `?start=ref_{id}` payload and call `POST /api/referral/activate` so the referral is attributed on first bot open | `createBot.js` `/start` handler ignores `ctx.startPayload`; no branch for `ref_*` parsing; `startapp` format only works in Mini App context, not via `t.me/bot?start=` link | **Critical** | `bot/src/createBot.js` L18–29 — `startPayload` never read; `referral.js:120` emits `?startapp=` URL instead of `?start=` | Research §5.1.1 (Notcoin K=3–5); `referral.js:120` |
| G02 | One-tap referral share via `openTelegramLink` | Tapping "Invite" must open Telegram compose pre-filled with referral link + viral copy, using `Telegram.WebApp.openTelegramLink(tg://msg_url?…)` | `ReferralPanel.jsx` L107–114: `handleShare` calls `tg.openTelegramLink`; however `referralLink` from backend is `?startapp=…` format — not a valid deep-link, so the shared URL attributes nothing when opened outside Mini App | **Critical** | Backend `referral.js:120,178` emits `?startapp=ref_X` instead of `?start=ref_X`; must be fixed together with G01 | Research §5.1.1; `referral.js:120,178` |
| G03 | Push notifications (Hook Model 5 time slots) | Scheduled push messages to re-engage lapsed users at 09:00/13:00/15:00/18:00/20:00 UTC; expected D7 uplift +15–20% | No scheduler file exists in `bot/`; VM outbound to `api.telegram.org` is a confirmed blocker. **Resolution:** Vercel serverless cron (not VM) can call `api.telegram.org` outbound — the VM egress block is a red herring for this path. | **Critical** | VM egress blocked (project-status.json L150); Vercel cron path not yet implemented; TASK-013 not started | Research §5.2.1; TASK-013 |
| G04 | Premium referral 20× multiplier | Premium invitees must yield 20× reward vs standard; backend must track `is_referred_premium` and apply premium multiplier at milestone claim | `referral.js` L144,573 tracks `is_referred_premium=TRUE`; `buildReferralClaimReward` exists — but TASK-008 Stars rewards (50⭐/200⭐/500⭐) are not yet applied: `claim-milestone` only grants energy/commits/skin, not Stars | **High** | `rewards.js` has no Telegram Stars disbursement path; TASK-008 not completed | Research §5.1.1 (Notcoin 20× Premium); `referral.js:596–614` |
| G06 | Telegram Stories auto-generation at milestones | `web_app_share_to_story` triggered on milestone moments (win, hackathon, level-up) with 9:16 canvas + poll sticker | Stories share exists in DeathScreen only; no milestone-triggered story in DailyBattlePanel, level-up flow, or hackathon completion; no poll sticker; `useTelegramStories.js` hook is ready but not wired to victory moments | **High** | TASK-016 (P2) not started; `useTelegramStories.js:54` params object lacks poll sticker support | Research §5.2.2 (DOGS 50M+ Stories); `useTelegramStories.js` |
| G08 | Squad System — Telegram group-linked team social obligation | Teams tied to Telegram groups; skipping a day "lets team down"; +30–50% invite rate | Team create/join/leave exists; team leaderboard exists; BUT: no Telegram group binding (`/bindchat` exists for daily summary only); no shared weekly milestone reward loop; no "obligation" notification when team member misses a day | **High** | No push notification path (blocked by G03 until resolved); `teamBattle.js` has no `weekly_goal`/`shared_milestone` endpoint | Research §5.1.3 (squad system +30–50% invite rate); `team.js`; `teamBattle.js` |

---

## 4. Prioritized Build Plan

### Phase 0: Must-Have — Ship Before Growth Push

> **Total effort: ~5.5 person-days.** These 5 tasks address all Critical and High-severity gaps that currently block the viral loop from completing. Without Phase 0, K-factor is structurally <1.0.

---

#### Task TASK-009: Deep-Link Referral Fix — "Invite" Button + Pre-filled Message

- **Viral Justification:** Notcoin achieved K-factor 3–5 with functional deep-links and invite rate 4.2 (Research §5.1.1). Currently every "Invite" tap produces a broken `?startapp=ref_X` URL that fails outside the Mini App context — the referral loop cannot complete. Fixing this is the single highest-leverage action in the entire backlog (VPS 153.9).
- **Current State:** Bot `/start` handler in `createBot.js` ignores `ctx.startPayload`. Backend `referral.js` emits `?startapp=ref_X` format which only works inside the Mini App. No `?start=ref_X` deep-link path exists.
- **Files to Touch:**
  - `bot/src/createBot.js` — parse `ctx.startPayload` for `ref_*` prefix, call `POST /api/referral/activate`
  - `backend/src/routes/referral.js` — change L120,178 from `?startapp=ref_X` to `?start=ref_X`
  - `frontend/src/components/ReferralPanel.jsx` — update share text to use `t.me/CoderSurvivalBot?start=ref_{id}` format
- **Definition of Done:**
  1. Tapping "Invite" opens Telegram compose with `t.me/CoderSurvivalBot?start=ref_{id}` deep-link
  2. Bot `/start ref_42601` handler calls `/api/referral/activate` and attributes the referral
  3. Referred user sees referrer's name in onboarding splash
  4. End-to-end test: new Telegram account opens deep-link → referral row created in DB
- **Effort:** 0.5 days
- **Regression Risk:** LOW — URL format change isolated to `referral.js:118` + bot handler; rollback = revert 1 line
- **Shareable Artifact Preview:**
  > 🔥 Я выжил в коде — ты сможешь? https://t.me/CoderSurvivalBot?start=ref_42601 Первый уровень — Junior. Последний — Legend. Погнали!
- **Viral Metric:** K-factor ≥ 1.2; referral activation rate ≥ 30% of link clicks

---

#### Task TASK-008: Stars Referral Rewards 50⭐/200⭐/500⭐ + "Team Lead" Skin at Milestone 5

- **Viral Justification:** Without Stars disbursement at milestones, inviters have zero economic incentive to share after the first tap. The 20× premium multiplier (Research §5.1.1 — Notcoin Premium referrals 20× value) cannot fire without this. Stars rewards are the "variable reward" hook in the Hooked Model loop that drives repeat invites.
- **Current State:** `is_referred_premium` tracked in `referral.js` L144,573. `buildReferralClaimReward` exists. Gap: `claim-milestone` at L596–614 only grants energy/commits/skin — no Stars disbursement path exists in `rewards.js`.
- **Files to Touch:**
  - `backend/src/routes/referral.js` — add Stars amounts to milestone claim at L596–614
  - `backend/src/utils/rewards.js` — add `sendGift` / Stars disbursement function
  - `backend/src/config/balance.js` — add `referral_milestone_stars: [50, 200, 500]` constants
  - `frontend/src/components/ReferralPanel.jsx` — display milestone Stars values in UI
- **Definition of Done:**
  1. Claiming referral milestone 1/2/3 disburses 50⭐/200⭐/500⭐ respectively
  2. Milestone 5 grants "Тимлид" skin
  3. Premium-referred users grant 20× reward to inviter (verified in DB)
  4. Balance audit job confirms no double-claims
- **Effort:** 0.5 days
- **Regression Risk:** LOW — balance constant additions only; existing claim flow unchanged
- **Shareable Artifact Preview:**
  > 🏆 +200⭐ зачислено! Твой 3-й реферал активировал пасс. Скин «Тимлид» через 2 рефераленых премиума — погнали!
- **Viral Metric:** Referral milestone claim rate ≥ 40%; avg invites per inviter ≥ 2.5

---

#### Task TASK-002: Activate `featureFlags.stress_v2` (High-Stress Offer at 20 + Passive Decay)

- **Viral Justification:** Stress_v2 surfaces the `high_stress` energy offer sooner, creating the frustration moment that drives "Share Shame" death-screen shares (G05). Shame (0.970 loading) is the strongest viral trigger identified in research (Research §5.3.3 + §2.2.1). Without stress acceleration, death-screen events are too rare to generate organic shares.
- **Current State:** `featureFlags.stress_v2` flag exists in `backend/src/config/balance.js` but is set to `false`. Activation requires 1-line change. Cooldown 3h is already configured.
- **Files to Touch:**
  - `backend/src/config/balance.js` — set `stress_v2: true`
  - `backend/src/routes/tap.js` — verify L192 reads the flag correctly (no change expected)
- **Definition of Done:**
  1. `stress_v2` flag set to `true` in balance.js
  2. High-stress context offer triggers at depression ≥ 20 (down from ≥ 40)
  3. Passive depression decay active between sessions
  4. Death-screen "Share Shame" card triggers ≥ 8% of burnout events
- **Effort:** 0.5 days
- **Regression Risk:** MED — cooldown 3h already set; rollback = revert 1 flag. Monitor stress-offer CTR for 48h post-activate.
- **Shareable Artifact Preview:**
  > 💀 Я сгорел на работе в 20:14. Уровень депрессии: 87%. 312 коммитов потеряно. Помоги отомстить: https://t.me/CoderSurvivalBot?start=ref_42601
- **Viral Metric:** Death-screen share rate ≥ 8%; stress offer CTR ≥ 22%

---

#### Task TASK-013: Hook Model — Push Notifications via Vercel Cron

- **Viral Justification:** The Hook Model requires an external "Trigger" to re-engage lapsed users. Research §5.2.1 shows countdown timers and daily resets increase conversion by 8–332% and D7 retention +15–20%. Without push, the game has no re-engagement mechanism for D1+ users who don't manually reopen.
- **Current State:** No scheduler exists. VM outbound to `api.telegram.org` is blocked. **Resolution:** Vercel serverless functions CAN call `api.telegram.org` outbound — the bot webhook already runs there. Scheduler belongs in `bot/api/cron.js` with Vercel cron configuration.
- **Files to Touch:**
  - `bot/api/cron.js` — new Vercel serverless function: query lapsed users, send push messages
  - `bot/vercel.json` — add `crons` section with 5 time slots (09:00/13:00/15:00/18:00/20:00 UTC)
  - `bot/src/createBot.js` — add `sendPushMessage(userId, text)` helper
  - `backend/src/routes/state.js` — add endpoint for bot to query lapsed users (last_active > 4h ago)
- **Definition of Done:**
  1. Vercel cron triggers 5× daily at configured times
  2. Bot sends personalized push to users inactive > 4 hours
  3. Push includes deep-link back to Mini App (`?startapp=push_{type}`)
  4. Push open rate tracked in `audit_logs`
  5. No VM outbound dependency — all calls originate from Vercel
- **Effort:** 2 days
- **Regression Risk:** LOW — new `bot/api/cron.js` endpoint; no changes to existing tap/state flows
- **Shareable Artifact Preview:**
  > ⏰ Твой стенд упал 4 часа назад. Депрессия растёт. Возвращайся — команда ждёт коммитов. [Открыть игру]
- **Viral Metric:** D7 retention +15%; push open rate ≥ 18%

---

#### Task TASK-016: Telegram Stories — Milestone-Triggered 9:16 Share + Poll Sticker

- **Viral Justification:** DOGS reached 50M+ users using Telegram Stories as a fundamental viral channel (Research §5.2.2). Stories are zero-friction — one tap reaches all user's Telegram contacts organically. `useTelegramStories.js` is already implemented but only wired to DeathScreen. Extending to victory moments captures the positive share cycle (achievement flex) in addition to the negative one (death shame).
- **Current State:** `useTelegramStories.js` hook exists and functional. `DeathScreen.jsx` already uses it. Gap: no milestone-triggered story in level-up flow, Daily Battle top-3, or hackathon completion. Poll sticker not supported in current `shareToStory` params.
- **Files to Touch:**
  - `frontend/src/hooks/useTelegramStories.js` — add poll sticker support to `shareToStory` params (L54–56)
  - `frontend/src/components/DailyBattlePanel.jsx` — wire "Share to Story" on top-3 placement
  - `frontend/src/components/CareerModal.jsx` — wire "Share to Story" on rank-up
  - `frontend/src/game/scenes/GameScene.js` — wire "Share to Story" on hackathon completion
  - `frontend/src/utils/canvasRenderer.js` — new utility for 9:16 milestone card rendering
- **Definition of Done:**
  1. Rank-up triggers Story share prompt with 9:16 achievement card
  2. Daily Battle top-3 triggers Story share with leaderboard card
  3. Hackathon completion triggers Story share with team card
  4. Poll sticker attached to Stories (e.g., "Обгонишь?")
  5. Widget_link includes referral deep-link (`?start=ref_{id}`)
- **Effort:** 2 days
- **Regression Risk:** LOW — new wiring only; `useTelegramStories.js` already exists and tested; no changes to game logic
- **Shareable Artifact Preview:**
  > [9:16 canvas] 🚀 [Username] достиг ранга Senior в Coder Survival! Commits today: 847. Депрессия: 12%. [Голосование: Ты бы выжил? ДА / НЕТ]
- **Viral Metric:** Story share rate ≥ 12% on milestone events; poll participation ≥ 35% of viewers

---

### Phase 1: Should-Have — Growth Boosters (Weeks 1–4)

#### Task TASK-015: UGC Meme Generator — Auto-Trigger on Events + `openTelegramLink` Share
**Viral Justification:** Memes are the highest organic reach format on Telegram (forward-native). Research §5.3.1–5.3.2 shows IT audience shares burnout memes at 22.5% of IT-channel content. The 5 templates already exist (`MemeGenerator.jsx`, `backend/src/routes/meme.js`, bot `/meme` command); gap is auto-trigger on events (depression >80%, 3+ fails) + `openTelegramLink` share flow replacing clipboard-only `shareText`. "Deploy on Friday" FOMO template time-locked to Friday 18:00–20:00 UTC creates a weekly viral spike. **Effort:** 3 pd. **Regression Risk:** LOW — additive; no existing flows touched. **Viral Metric:** Meme forward rate ≥ 3× per share; meme-driven installs ≥ 15% of new users.

#### Task TASK-012: Daily Battle `Rdaily` Formula (40/30/20/10% Weights)
**Viral Justification:** Closes G08 partial (High). Daily Battle is the competitive layer that creates "obligatory return" — losing squad members feel guilt (Research §5.1.3: +30–50% invite rate from squads). Without a fair scoring formula, leaderboard credibility is zero and squad obligation doesn't fire. The formula makes competition meaningful and generates shareable leaderboard cards. **Effort:** 2 pd. **Regression Risk:** MED — scoring formula change; existing battle routes need migration. **Viral Metric:** Daily Battle participation rate ≥ 25% DAU; leaderboard share rate ≥ 10%.

#### Task TASK-011: First Purchase Bonus — First `energy_refill` at 5⭐ Instead of 10⭐
**Viral Justification:** Not directly viral, but lowers activation energy for first Stars spend — converts referred users to payers. Referred users who pay are 20× more valuable (G04 premium multiplier, Research §5.1.1). First purchase creates an "I invested in this" commitment (Hook Model investment phase) that drives referrals from newly converted payers. **Effort:** 1 pd. **Regression Risk:** LOW — isolated `/buy` check; rollback = remove 1 flag check. **Viral Metric:** First-purchase conversion ≥ 15% of referral-activated users within 24h.

#### Task TASK-020: Tier-1 Localization EN/HI
**Viral Justification:** Reach multiplier. Research identifies EN and HI as the two highest-TAM markets for dev-culture idle games. All shareable artifacts (meme templates, Stories, referral messages) are in Russian only = zero K-factor outside CIS. EN/HI unlocks the viral loop in markets 5–8× larger. **Effort:** 4 pd. **Regression Risk:** LOW — i18n wrapper; all existing strings remain. **Viral Metric:** Share click-through rate in EN/HI markets ≥ 25%.

#### Task TASK-017: Session RNG Events Every 30–90 Sec (5 Event Types)
**Viral Justification:** Creates the "something unexpected happened" shareworthy moments that drive organic screenshots. "Прод база упала" event creates a crisis moment players naturally screenshot and forward to dev chats. Without variety events, sessions are mechanically identical — no "you won't believe what happened" stories. Also feeds meme generator trigger conditions (G07). **Effort:** 3 pd. **Regression Risk:** MED — tap route change; events must be idempotent. **Viral Metric:** Session screenshot/share rate ≥ 5%.

---

### Phase 2: Nice-to-Have — Depth & Polish

| ID | Task | VPS | One-liner Justification |
|----|------|-----|-------------------------|
| TASK-003 | Low-energy offer threshold 25% → 15% | 114.0* | High VPS but pure monetization trigger — no shareable artifact; ships post-viral-seeding to fund reward pool |
| TASK-004 | Pass math fix (11,500 → ≤7,000 XP) | 3.4 | Fixes pass completion rate, retaining more players for them to share more |
| TASK-005 | Coffee Break bundle 25⭐ | 4.5 | Fills price-point gap for referred users; no shareable artifact |
| TASK-010 | 4 shop SKUs (Double Espresso, Sleep Pill, Rubber Duck, Senior PJ) | 3.2 | "Пижама сеньора" skin is mildly shareable (flex), but primary value is ARPU |
| TASK-019 | Guilds with territorial control (ELO) | 0.95 | High viral potential long-term (G08 Squad System) but blocked by G03 push + 20 pd engineering |

*\*TASK-003 has the 3rd highest raw VPS but is deliberately Phase 2 because it is a monetization conversion trigger with zero K-factor contribution.*

---

### Cut (Do Not Build Now)

| ID | Task | Reason for Cut |
|----|------|---------------|
| TASK-001 | Stars fulfillment (`/buy` + payment webhook) | Zero viral mechanism (VPS = 1.7). Pure monetization infrastructure. Move to parallel monetization sprint. |
| TASK-006 | Anticheat Layer 3 (cron balance audit) | VPS = 0.23. Security infrastructure, no viral upside. First 7 days are monitoring-only per DoD. |
| TASK-007 | Anticheat Layer 2 (Shannon entropy, CV, coordinates) | VPS = 0.13. Lowest in backlog. 5 pd for zero viral contribution. First 14 days are warn-only per DoD. |
| TASK-014 | Near-rank offer escalation 72% → 85% → 95% | VPS = 1.95. Monetization optimization, no shareable artifact. Fold into monetization sprint. |
| TASK-018 | Audio: `visibilitychange` + Ogg Vorbis verification | VPS = 0.35. Quality-of-life fix, no viral mechanism. |
| TASK-021 | Season Pass level-gate (unlock at level 9) | VPS = 0.55. **Antiviral** — locking content behind rank gates discourages newly referred users from staying. |

---

## 5. Critical Path Dependencies

```
Phase 0 (Week 0):
  TASK-009 (fix referral URL) ──► TASK-008 (Stars rewards now actually fire)
  TASK-002 (stress_v2) ──────────► enables death-screen share moments (G05)
  TASK-013 (push cron on Vercel) ─► unblocks G03 for Phase 1 squad notifications
  TASK-016 (Stories wiring) ──────► independent; useTelegramStories.js ready

Phase 1 (Weeks 1–4):
  TASK-012 (Daily Battle formula) ─► TASK-008 squad obligation notification
  TASK-015 (meme generator) ───────► TASK-017 RNG events (trigger conditions)
  TASK-011 (First Purchase Bonus) ─► monetizes referred users from Phase 0 loop
  TASK-020 (EN/HI i18n) ──────────► multiplies Phase 0 referral reach by TAM factor

Phase 2 (Weeks 5–8):
  TASK-003 (low_energy 15%) ───────► monetization optimization post-viral seeding
  TASK-004 (pass math) ────────────► retention polish for retained viral cohort
  TASK-005 / TASK-010 (shop SKUs) ─► ARPU optimization after cohort established
  TASK-019 (Guilds) ───────────────► requires TASK-013 push path + TASK-012 formula
```

---

## 6. Shareable Artifact Registry

| Artifact | Trigger | Format | Example Text | Gap Closed |
|----------|---------|--------|-------------|------------|
| Referral invite message | "Пригласить" button tap | Telegram compose pre-fill | `🔥 Я выжил в коде — ты сможешь? https://t.me/CoderSurvivalBot?start=ref_42601 Первый уровень — Junior. Погнали!` | G01, G02 |
| Death-screen shame card | Burnout / depression 100% | 1:1 image card + share button | `💀 [Username] сгорел на работе. Депрессия: 94%. 312 коммитов потеряно в пятницу. Отомсти: [link]` | G05 |
| Milestone Story 9:16 | Rank-up / Daily Battle top-3 | Telegram Story + poll sticker | `[Avatar] достиг Senior 🚀 847 коммитов. [Голосование: Обгонишь?]` | G06 |
| Meme card (5 templates) | Depression >80%, 3+ fails, Friday 18:00+ | node-canvas image | `[Username]'s Friday deploy: "It works on my machine." Depression: 94% 💀` | G07 |
| Push re-engagement | Cron 09/13/15/18/20 UTC | Bot message | `⏰ Твой стенд упал. Депрессия растёт. Команда ждёт коммитов.` | G03 |
| Leaderboard card | Daily Battle end | Auto-generated image | `🏆 #1 сегодня: 847 commits / 12% depression. Обгони: [deep-link]` | G08 partial |

---

## 7. Anti-Pattern Guardrails

These are research-backed patterns that kill virality. All Phase 0–1 tasks must be evaluated against them:

1. **No aggressive anti-cheat / mass bans:** Hamster Kombat disqualified 2.3M accounts with no appeal, accelerated churn 40%+, crashed 300M→41M users (Research §1.2.1). Graduated sanctions only; >90% of first-warning recipients don't re-offend.
2. **No tap-to-earn core loop without depth:** 93% of GameFi projects are dead; 51% of Hamster churn cited "monotonous gameplay" (Research §1.2). The stress_v2 + death-screen + meme loop adds emotional depth beyond raw tapping.
3. **No premature tokenomics:** Launching with a token before D30 retention >8% leads to airdrop-dump spiral. Yescoin survived at $120K/month with NO token (Research §1.2.2). Stars-based rewards (TASK-008) are the correct interim model.

---

## 8. VPS Scoring Detail

| ID | Task (short) | Viral Reach | Viral Impact | Confidence | Effort (pd) | VPS | Phase |
|----|-------------|-------------|-------------|------------|-------------|-----|-------|
| TASK-009 | Deep-link referral fix | 9 | 9 | 0.95 | 0.5 | **153.9** | Phase 0 |
| TASK-008 | Stars referral rewards | 8 | 8 | 0.90 | 0.5 | **115.2** | Phase 0 |
| TASK-003 | low_energy offer 15% | 3 | 4 | 0.95 | 0.1 | **114.0** | Phase 2* |
| TASK-002 | stress_v2 flag | 3 | 4 | 0.90 | 0.5 | **21.6** | Phase 0 |
| TASK-016 | Telegram Stories milestone | 7 | 7 | 0.80 | 2 | **19.6** | Phase 0 |
| TASK-013 | Push notifications (Vercel cron) | 8 | 7 | 0.45 | 2 | **12.6** | Phase 0 |
| TASK-015 | UGC meme generator | 6 | 6 | 0.75 | 3 | **9.0** | Phase 1 |
| TASK-012 | Daily Battle Rdaily formula | 5 | 5 | 0.70 | 2 | **8.75** | Phase 1 |
| TASK-011 | First Purchase Bonus | 2 | 4 | 0.75 | 1 | **6.0** | Phase 1 |
| TASK-005 | Coffee Break bundle | 2 | 3 | 0.75 | 1 | **4.5** | Phase 2 |
| TASK-004 | Pass math fix | 2 | 2 | 0.85 | 1 | **3.4** | Phase 2 |
| TASK-010 | 4 shop SKUs | 2 | 2 | 0.80 | 1 | **3.2** | Phase 2 |
| TASK-020 | Localization EN/HI | 5 | 4 | 0.50 | 4 | **2.5** | Phase 1 |
| TASK-017 | RNG session events | 4 | 3 | 0.55 | 3 | **2.2** | Phase 1 |
| TASK-014 | Near-rank offer escalation | 2 | 3 | 0.65 | 2 | **1.95** | Cut |
| TASK-001 | Stars fulfillment | 2 | 3 | 0.85 | 3 | **1.7** | Cut |
| TASK-019 | Guilds ELO | 7 | 6 | 0.45 | 20 | **0.95** | Phase 2 |
| TASK-021 | Season Pass level-gate | 1 | 2 | 0.55 | 2 | **0.55** | Cut |
| TASK-018 | Audio fix | 1 | 1 | 0.70 | 2 | **0.35** | Cut |
| TASK-006 | Anticheat cron | 1 | 1 | 0.70 | 3 | **0.23** | Cut |
| TASK-007 | Anticheat entropy | 1 | 1 | 0.65 | 5 | **0.13** | Cut |

---

## 9. Open Questions

1. **Vercel cron vs. GitHub Actions cron for push notifications:** Agent 4 proposes Vercel cron (`bot/vercel.json` crons). The project currently uses GitHub Actions cron for battle distribution (`battle-distribute.yml`). A conflict exists: should push scheduling also use GitHub Actions (already proven) or Vercel cron (lower latency, simpler)? **Recommendation:** Vercel cron — same runtime as bot webhook, no SSH/API-key overhead. But needs verification that Vercel Hobby plan supports `crons` config.

2. **Stars disbursement mechanism:** `rewards.js` has no Stars disbursement path. Telegram's `sendGift` API or `transferStarGift` may require Bot API 7.x+. Agent 3 and Agent 4 assume this is solvable in 0.5 pd, but this needs a spike to confirm the API is available on the current bot token.

3. **G08 Squad System depth:** The gap matrix rates G08 as High severity, but no Phase 0 task fully addresses it. Phase 1 TASK-012 (Daily Battle formula) partially enables it. Full squad obligation (group binding, weekly milestones, guilt notifications) requires TASK-019 (Guilds, 20 pd) which is Phase 2. **Question:** Is a lightweight squad obligation loop (e.g., "Your team needs 500 more commits today" banner) achievable without the full Guilds system?

4. **TASK-002 regression risk:** Stress_v2 may increase burnout frequency beyond what the current death-screen UX can handle. If >15% of sessions end in burnout, the experience becomes punishing rather than fun. Agent 4 rates regression risk MED; recommend 48h monitoring window with automatic rollback if burnout rate exceeds threshold.

---

*Document synthesized by Coordinator from 4-agent Swarm v3 pipeline. All evidence claims traceable to source files. No facts were invented; where agents disagreed, conflicts noted in Open Questions. Date: 2026-06-15.*
