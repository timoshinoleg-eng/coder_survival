# Phase 6: Mini-Games Tier 1 (Early Levels) — PLAN.md

> Status: Ready for review
> Requirements: MINI-01, MINI-02
> Context: 06-CONTEXT.md, 06-DISCUSSION-LOG.md
> Mode: mvp

---

## Goal
Launch the first two mini-games to validate engagement, reward pacing, and cooldown mechanics.

---

## Architecture

```
Before:
  MiniGameDebug.jsx       → single debug QTE, no backend, feature-flagged
  No minigame routes      → API calls fail
  No cooldown system      → unlimited plays
  No tap boost system     → commitBoostPercent unused in tap logic

After:
  MiniGameHelloWorld.jsx  → 5-key QTE, 3s timer
  MiniGameCodeReview.jsx  → 3-bug hunt, 15s timer
  MiniGameLauncher.jsx    → game selection panel with cooldowns/locks
  POST /api/minigame/start    → cooldown + level gate check
  POST /api/minigame/complete → score validation + reward application
  progression.minigame_state  → JSONB cooldown tracking
  progression.active_effects  → JSONB tap boost + other buffs
  tap.js                    → reads active_effects for tapBoost
```

---

## Work Breakdown

### W1: Hello World QTE (MINI-01)

#### 1.1 Migration: minigame state fields (`backend/migrations/028_minigame_state.sql`)
- `ALTER TABLE progression ADD COLUMN IF NOT EXISTS minigame_state JSONB DEFAULT '{}'`
- `ALTER TABLE progression ADD COLUMN IF NOT EXISTS active_effects JSONB DEFAULT '{}'`

#### 1.2 Add mini-game config (`backend/src/config/balance.js`)
- Add `STAGE2.MINIGAMES` section:
  ```js
  MINIGAMES: {
    hello_world: {
      requiredLevel: 2,
      cooldownHours: 4,
      maxScore: 5,
      reward: { commits: 50, depressionRelief: 10 }
    },
    code_review: {
      requiredLevel: 4,
      cooldownHours: 6,
      maxScore: 3,
      reward: { commits: 100, depressionRelief: 20, tapBoostPercent: 10, tapBoostDurationMinutes: 10 }
    }
  }
  ```

#### 1.3 Create mini-game engine (`backend/src/utils/minigame.js`)
- `canPlay(minigameState, gameType, now)` → checks cooldown + level
- `calculateCooldownRemaining(minigameState, gameType, now)` → returns ms remaining
- `validateScore(gameType, score)` → score <= maxScore for game type
- `buildReward(gameType)` → returns reward payload from config
- `applyReward(client, userId, reward)` → applies commits, depression relief, active effects

#### 1.4 Create mini-game routes (`backend/src/routes/minigame.js`)
- `POST /api/minigame/start`
  - Body: `{ gameType: 'hello_world' | 'code_review' }`
  - Checks level gate, checks cooldown
  - Returns: `{ canPlay: true, config: { maxScore, timeLimit } }` or `{ canPlay: false, reason, remainingMs }`
- `POST /api/minigame/complete`
  - Body: `{ gameType, score }`
  - Validates score plausibility (0 <= score <= maxScore)
  - Applies reward in transaction
  - Updates `minigame_state` with `lastPlayedAt`
  - Returns: `{ success, reward, newState }`

#### 1.5 Create MiniGameHelloWorld (`frontend/src/components/MiniGameHelloWorld.jsx`)
- Modal overlay (reuse DailyQuests modal pattern)
- Terminal/code-typing visual theme
- Displays sequence of 5 random keys (W/A/S/D/Space/Enter)
- Player must press keys in order within 3 seconds
- Progress bar for timer
- On success: confetti animation + "Hello World compiled!"
- On fail: "Segmentation fault" + retry button (respects cooldown)
- Calls `/api/minigame/start` on open, `/api/minigame/complete` on finish

#### 1.6 Update StatsBar button (`frontend/src/components/StatsBar.jsx`)
- Replace 🐛 `MiniGameDebug` button with 🎮 "Мини-игры" launcher button
- Keep `featureFlags.minigameEnabled` gate

---

### W2: Code Review Bug Hunt (MINI-02)

#### 2.1 Create MiniGameCodeReview (`frontend/src/components/MiniGameCodeReview.jsx`)
- Modal overlay with diff-viewer styling
- Grid of 9 code snippets (3x3), 3 contain hidden bugs
- 15-second timer
- Player clicks snippets to reveal bug/no-bug
- On success (found all 3): "All bugs fixed! Ship it!"
- On fail: "Bugs in production..." + retry button
- Calls same `/api/minigame/start` and `/api/minigame/complete`

#### 2.2 Add active effects system (`backend/src/utils/activeEffects.js`)
- `getActiveEffects(activeEffectsJson, now)` → filters expired effects
- `applyTapBoost(activeEffects, baseCommits)` → adds tapBoostPercent if active
- `addEffect(activeEffects, type, payload, durationMinutes, now)` → returns new state

#### 2.3 Hook active effects into tap (`backend/src/routes/tap.js`)
- Read `progression.active_effects` before tap
- Pass to `calculateTapDelta`
- If `tapBoost` effect active and not expired, multiply commits by `(1 + tapBoostPercent/100)`
- Clean expired effects after tap

#### 2.4 Update state load to clean expired effects (`backend/src/routes/state.js`)
- On state load, prune expired `active_effects`
- Return `activeEffects` in response so frontend can show buff icons

---

### W3: Mini-Game Launcher Panel

#### 3.1 Create MiniGameLauncher (`frontend/src/components/MiniGameLauncher.jsx`)
- Modal panel listing available mini-games
- Each game card shows: name, level requirement, cooldown status, reward preview
- Locked games show padlock + required level
- Ready games show "Играть" button
- Games on cooldown show timer (e.g. "Через 2ч 15мин")
- Replace direct `MiniGameDebug` / `MiniGameHelloWorld` / `MiniGameCodeReview` modals

#### 3.2 Update useGameState (`frontend/src/hooks/useGameState.js`)
- Add `activeEffects` to state
- Add `startMinigame(gameType)` helper
- Add `completeMinigame(gameType, score)` helper
- Add `refreshMinigameState()` helper

#### 3.3 Update StatsBar integration
- `🎮 Мини-игры` button opens `MiniGameLauncher`
- Badge shows number of games ready to play (not on cooldown + level met)

#### 3.4 Update GameScene to show active buffs
- If `tapBoost` active, show floating "+X%" near commit counter
- Visual indicator (glow) on avatar when buffed

---

### W4: Tests, Polish & Cleanup

#### 4.1 Backend tests (`backend/tests/phase6.unit.test.js`)
- `canPlay` — level gate blocks under-leveled, cooldown blocks recent play
- `calculateCooldownRemaining` — correct ms calculation
- `validateScore` — rejects negative, rejects overflow
- `applyReward` — commits added, depression reduced, active effects created
- `getActiveEffects` — filters expired, keeps active
- `calculateTapDelta` with tapBoost — correct multiplier

#### 4.2 Frontend build verification
- `npm run build` in frontend — 0 errors
- Visual smoke: MiniGameLauncher opens, shows 2 games
- Visual smoke: Hello World accepts keypresses, timer works
- Visual smoke: Code Review reveals bugs, timer works
- Visual smoke: Cooldown blocks replay, timer counts down

#### 4.3 Balance audit
- Hello World: 50 commits / 4h = 12.5 commits/hour — modest, not game-breaking
- Code Review: 100 commits / 6h = 16.7 commits/hour + tap boost — stronger but gated by level 4
- Tap boost: +10% for 10 min ≈ +1-2 commits per tap during active period — minor

#### 4.4 Remove dead code
- Deprecate `MiniGameDebug.jsx` or keep behind debug flag
- Remove commented-out sandbox code if any

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/028_minigame_state.sql` | Add `minigame_state` and `active_effects` JSONB columns |
| `backend/src/utils/minigame.js` | Cooldown validation, score validation, reward application |
| `backend/src/utils/activeEffects.js` | Effect lifecycle, tap boost calculation |
| `backend/src/routes/minigame.js` | `POST /start` and `POST /complete` endpoints |
| `backend/tests/phase6.unit.test.js` | Unit tests for mini-game engine and active effects |
| `frontend/src/components/MiniGameLauncher.jsx` | Game selection panel |
| `frontend/src/components/MiniGameHelloWorld.jsx` | QTE mini-game |
| `frontend/src/components/MiniGameCodeReview.jsx` | Bug hunt mini-game |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Add `STAGE2.MINIGAMES` config |
| `backend/src/index.js` | Register `/api/minigame` router |
| `backend/src/routes/tap.js` | Hook `activeEffects` into `calculateTapDelta` |
| `backend/src/routes/state.js` | Prune expired effects, return `activeEffects` |
| `frontend/src/components/StatsBar.jsx` | Replace 🐛 with 🎮 launcher button |
| `frontend/src/hooks/useGameState.js` | Add mini-game helpers and `activeEffects` state |
| `frontend/src/game/scenes/GameScene.js` | Show buff visual indicators |

## Verification

- [ ] `npm test` backend — all existing tests pass + new phase6 tests pass
- [ ] `npm run build` frontend — 0 errors
- [ ] Hello World: level 2+ can play, 5 keys in 3s = success, +50 commits, -10 depression
- [ ] Hello World: cooldown 4h enforced, retry blocked with timer
- [ ] Code Review: level 4+ can play, 3 bugs in 15s = success, +100 commits, -20 depression, +10% tap boost
- [ ] Code Review: cooldown 6h enforced
- [ ] Tap boost: active for 10 minutes, visible in UI, correctly multiplies commits
- [ ] Under-leveled players see lock message with required level
- [ ] MiniGameLauncher shows both games, cooldowns, rewards, level locks

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| React overlay feels cheap vs Phaser scenes | Accept for MVP; Tier 2 (Phase 8) will build Phaser scenes if engagement validates |
| Score hacking | Plausibility bounds + small rewards make abuse unprofitable; sandbox deferred |
| Active effects clutter progression JSONB | Keep schema minimal; prune expired effects on every state load |
| Two mini-games in one phase = scope creep | Strict CSS-only animations, reuse existing SFX, no new assets |

## Estimation

- W1: Hello World QTE (backend + frontend) — ~3h
- W2: Code Review bug hunt + active effects — ~3h
- W3: Launcher panel + buff UI — ~2h
- W4: Tests, cleanup, polish — ~2h
- **Total: ~10h**

---

*Plan ready for review. Next: `/gsd:execute-phase 6` or `/gsd:review` for cross-AI peer review.*
