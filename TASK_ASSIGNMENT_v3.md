# Task Assignment v3 — Final Sprint

**Rule:** Each model owns their files. No model edits files owned by another model without PR/approval.

---

## Model A — ChatGPT (Critical Backend & Infrastructure)

**Role:** Foundation layer. Database consistency, security-critical paths, infrastructure.

### A-FINAL-1: Skin Equip Endpoint (HIGH PRIORITY)
**File:** `backend/src/routes/skins.js` (new)
**Spec:**
```
POST /api/skins/equip
Body: { skinId: string }
Auth: initDataMiddleware
Flow:
  1. Verify user owns skin (SELECT FROM user_skins WHERE user_id = $1 AND skin_id = $2)
  2. Set equipped = FALSE for all user's skins
  3. Set equipped = TRUE for requested skin
  4. Return { success, equippedSkinId }
```
**Guard:** If skin not unlocked → 403.

### A-FINAL-2: Team Battle Contribution Tracking Fix (HIGH PRIORITY)
**File:** `backend/src/routes/tap.js` (modify)
**Bug:** `updateTeamProgress()` updates `teams.total_commits` but does NOT write to `team_battle_contributions`.
**Fix:** After `updateTeamProgress()`, add:
```js
await client.query(
  `INSERT INTO team_battle_contributions (season_id, team_id, user_id, commits_contributed)
   SELECT $1, $2, $3, $4
   FROM team_battle_seasons
   WHERE status = 'active'
     AND EXISTS (SELECT 1 FROM teams WHERE id = $2)
   ON CONFLICT (season_id, user_id) DO UPDATE SET
     commits_contributed = team_battle_contributions.commits_contributed + EXCLUDED.commits_contributed,
     updated_at = NOW()`,
  [activeSeasonId, teamId, userId, tapResult.commitsDelta]
);
```
**Dependency:** Need `getActivePass`-like helper for active team battle season.

### A-FINAL-3: Real Ad SDK Proof Verification (MEDIUM PRIORITY)
**File:** `backend/src/routes/rewards.js` (modify)
**Spec:**
- Uncomment and implement `verifyAdProof(provider, proof, nonce)`
- AdMob: verify SSV payload signature
- Yandex: verify server callback token
- If proof invalid → 403, do NOT mark nonce used

### A-FINAL-4: Cron Job / Battle Distribution Trigger (MEDIUM PRIORITY)
**File:** `scripts/cron_battle_distribution.js` (new)
**Spec:**
```js
// Run at 00:05 UTC daily
fetch('http://localhost:3000/api/battle/distribute', {
  method: 'POST',
  headers: { 'X-Bot-Backend-Secret': process.env.BOT_BACKEND_SECRET }
});
```
**Alternative:** Add cron library to backend (`node-cron`) and schedule internally.

**Model A Ownership:**
- All `backend/src/routes/*` (except those owned by others)
- All `backend/migrations/*`
- All `backend/src/utils/*` (core logic)
- Infrastructure scripts

---

## Model B — Kimi Code (Player Experience & Game Feel)

**Role:** Frontend gameplay, visual polish, interactive systems.

### B-FINAL-1: Mini-Game "Debugger" (QTE) (HIGHEST PRIORITY)
**Files:**
- `frontend/src/components/MiniGameDebug.jsx` (new)
- `frontend/src/game/DebugScene.js` (new, Phaser scene)
**Spec:**
- Trigger: Button in StatsBar OR random popup when depression > 30 (30% chance on tap)
- Gameplay: 3-second QTE. Bugs (🔴) appear on screen. Click/tap them.
- Scoring: 1 point per bug. Need 5 bugs in 3 seconds.
- Rewards (on win):
  - `-5 depression`
  - `+10 commitsCurrent`
- Cooldown: once per session
- UI: Overlay with countdown timer, score, close button

**Backend endpoint** (Model A provides, but B can mock):
```
POST /api/minigame/debug
Response: { success: true, reward: { depressionRelief: 5, commitsCurrent: 10 } }
```

### B-FINAL-2: Skin Visualization (HIGH PRIORITY)
**Files:**
- `frontend/src/game/GameScene.js` (modify)
- `frontend/src/components/SkinPanel.jsx` (modify)
**Spec:**
- In SkinPanel: when clicking "Экипировать", call `POST /api/skins/equip` (Model A endpoint)
- In GameScene: read `state.skins.equipped` and change avatar texture/color:
  - `junior_default` → blue tint
  - `legacy_archaeologist` → brown/gold tint
  - `night_shift` → dark purple glow
- Store skin preference in `localStorage` as fallback before state loads

### B-FINAL-3: Zone-Based BGM Switching (MEDIUM PRIORITY)
**File:** `frontend/src/utils/AudioManager.js` (modify) + `frontend/src/main.jsx` (modify)
**Spec:**
- Switch BGM based on rank:
  - Rank 1 (Junior): `bgm_main`
  - Rank 2 (Middle): `bgm_main`
  - Rank 3 (Senior): `bgm_legacy`
  - Rank 4 (Lead): `bgm_legacy`
  - Rank 5 (CTO): `bgm_hackathon`
- During CrunchTime event: force `bgm_hackathon`
- Transition: `audioManager.duckBGM(0, 0.5)` → switch → `audioManager.resumeBGM()`

### B-FINAL-4: SFX Enhancements (LOW PRIORITY)
**File:** `frontend/src/utils/AudioManager.js` (modify)
**Spec:**
- Add SFX keys: `levelUp`, `questDone`, `deathScreen`, `skinUnlock`
- Trigger `levelUp` in `useGameState.js` when `levelUp` state changes
- Trigger `questDone` in `DailyQuestsPanel.jsx` on claim
- Trigger `deathScreen` in `DeathScreen.jsx` on mount

**Model B Ownership:**
- All `frontend/src/components/*` (except ReferralPanel, EventPanel)
- All `frontend/src/game/*` (Phaser scenes)
- All `frontend/src/utils/*` (client-side utilities)

---

## Model C — ns/я (Integration, QA, Social Polish)

**Role:** Connect A and B, verify end-to-end flows, social features, analytics.

### C-FINAL-1: Final Integration Checklist
**Task:** Verify every A-B interface works:
- [ ] `POST /api/skins/equip` → SkinPanel shows equipped skin after reload
- [ ] `POST /api/minigame/debug` (mock) → MiniGameDebug awards rewards
- [ ] `POST /api/respawn` → DeathScreen disappears, state resets
- [ ] `GET /api/team-battle/current` → TeamBattle renders leaderboard
- [ ] `POST /api/team-battle/claim` → Claim button disabled after success
- [ ] `/api/state` → All Phase 2 fields present: `teamBattle`, `skins`, `achievements`, `crunchTime`, `referralChain`, `isBurnout`

### C-FINAL-2: Achievement Toast Notifications
**File:** `frontend/src/hooks/useGameState.js` (modify)
**Spec:**
- When `payload.achievements` contains newly completed items (completed=true, claimed=false):
  ```js
  showToast(`🏆 Достижение: ${achievement.name}!`, 'success', 4000);
  ```

### C-FINAL-3: Meme Generator Wiring Verification
**File:** `frontend/src/components/MemeGenerator.jsx` (verify)
**Task:**
- Ensure it reads `memeTemplates` from `/api/state`
- Ensure "Share" button calls `shareMeme()` with generated text
- Add audit log call: `POST /api/audit` with action `meme_share` (or track via analytics)

### C-FINAL-4: Observation SQL Validation
**File:** `observation/09_phase2_metrics.sql` (modify if needed)
**Task:**
- Run each query against staging DB after Phase 2 schema applied
- Verify `team_battle_contributions` has data after taps
- Verify `user_skins` populates when achievements complete

### C-FINAL-5: Smoke Test — Full End-to-End
**File:** `scripts/smoke.full_e2e.sh` (new)
**Task:**
```bash
# 1. Create test user
# 2. Open app → check login reward toast
# 3. Tap 5 times → check energy decreases, depression changes
# 4. Open quests → claim tap quest
# 5. Invite friend (mock) → check referral quest completes
# 6. Check team battle shows in StatsBar
# 7. Check CrunchTime banner appears if event active
# 8. Verify /api/state has all Phase 2 fields
```

### C-FINAL-6: Documentation Update
**File:** `COLLABORATION_PLAN.md` (update)
- Mark completed tasks
- Document any API changes discovered during integration
- Update environment variables list (.env.example)

**Model C Ownership:**
- `observation/*.sql`
- `scripts/*`
- Integration verification
- Documentation

---

## Blocking Dependencies

| Task | Blocked By | Resolution |
|---|---|---|
| B-FINAL-2 (Skin visualization) | A-FINAL-1 (POST /api/skins/equip) | B mocks API first, integrates when A done |
| B-FINAL-1 (MiniGameDebug) | A-FINAL-4 is optional, B can mock | No blocker |
| C-FINAL-1 (Integration check) | All A and B tasks | Run after A and B commit |

---

## Execution Order

1. **Day 1:**
   - Model A: A-FINAL-1, A-FINAL-2
   - Model B: B-FINAL-1 (mock backend), B-FINAL-3
   - Model C: C-FINAL-5 (script skeleton)

2. **Day 2:**
   - Model A: A-FINAL-3, A-FINAL-4
   - Model B: B-FINAL-2 (mock API), B-FINAL-4
   - Model C: C-FINAL-2, C-FINAL-3

3. **Day 3:**
   - Model C: C-FINAL-1 (full integration test)
   - All models: Fix bugs found during integration
   - Model C: C-FINAL-6 (docs)

4. **Day 4:**
   - Final review + push
