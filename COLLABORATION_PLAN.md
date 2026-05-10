# Coder Survival — Collaboration Plan (Phase 2 + Tech Debt)

## Goal
Distribute remaining work from Improvement Plan v3.0 across 3 models:
- **Model A** (current): Core backend, infrastructure, migrations, API contracts
- **Model B**: Frontend player experience (mini-games, skins, creative UI)
- **Model C**: Social features, events, referrals, analytics

## Rules
1. **Model A owns the database.** Only Model A creates migrations. B/C must request schema changes.
2. **No breaking API changes.** Model A extends `/api/state` with new fields; never removes existing ones.
3. **Parallel work.** B/C can start frontend immediately using mock data. Integration happens when Model A deploys endpoints.
4. **File ownership.** Marked per task to avoid merge conflicts.

---

## Model A — Foundation Layer

### Scope
Database schema, backend API, critical bug fixes, cron jobs, authentication/anti-fraud.

### Tasks (priority order)

#### A-1. Fix Shop Purchase Pipeline (CRITICAL TECH DEBT)
- **Problem:** `buy.js` creates `pending` purchase but no webhook receives Telegram `successful_payment`.
- **Files:** `backend/src/routes/buy.js` (modify), `backend/src/routes/webhook.js` (new)
- **Spec:**
  - Create `POST /api/webhook/payment` endpoint
  - Verify Telegram signature on webhook payload
  - Call `applyItemEffect()` on successful payment
  - Update `purchases.status` to `completed`
- **Deliverable:** Working end-to-end purchase flow

#### A-2. Daily Battle Auto-Distribution (CRITICAL TECH DEBT)
- **Problem:** `battle.js` shows leaderboard but never awards top 1-3 players.
- **Files:** `backend/src/routes/battle.js` (modify), `backend/src/utils/battleDistribution.js` (new)
- **Spec:**
  - `POST /api/battle/distribute` (admin/cron only)
  - Query top 3 players from yesterday's `sessions`
  - Apply `BATTLE_REWARD_PREVIEW` rewards
  - Idempotent (check `battle_reward_claims` table before inserting)
- **Deliverable:** Cron job or manual trigger that correctly distributes rewards

#### A-3. Phase 2 Schema Migration
- **File:** `backend/migrations/013_phase2_schema.sql` (new)
- **Tables to create:**
```sql
-- P1-5 Team Battle
CREATE TABLE team_battle_seasons (
    id SERIAL PRIMARY KEY,
    season_number INT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    target_commits INT NOT NULL DEFAULT 500,
    reward_payload JSONB NOT NULL,
    status VARCHAR(16) DEFAULT 'active'
);

CREATE TABLE team_battle_contributions (
    id SERIAL PRIMARY KEY,
    season_id INT REFERENCES team_battle_seasons(id),
    team_id INT REFERENCES teams(id),
    user_id INT REFERENCES users(id),
    commits_contributed INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, user_id)
);

-- P2-2 Skins
CREATE TABLE skin_definitions (
    id SERIAL PRIMARY KEY,
    skin_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128),
    description TEXT,
    rarity VARCHAR(16), -- common, rare, epic, legendary
    unlock_type VARCHAR(32), -- achievement, purchase, event
    unlock_payload JSONB
);

CREATE TABLE user_skins (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    skin_id VARCHAR(32),
    equipped BOOLEAN DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skin_id)
);

-- P2-2 Achievements
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    achievement_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128),
    description TEXT,
    target_value INT NOT NULL,
    reward_payload JSONB
);

CREATE TABLE user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    achievement_id VARCHAR(32),
    progress_value INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    claimed BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, achievement_id)
);

-- P2-3 Referral Chain
CREATE TABLE referral_chain_progress (
    id SERIAL PRIMARY KEY,
    referrer_id INT REFERENCES users(id),
    milestone INT NOT NULL, -- 3, 5, 10
    reward_claimed BOOLEAN DEFAULT FALSE,
    claimed_at TIMESTAMPTZ
);

-- P2-4 Crunch Time Event
CREATE TABLE crunch_time_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(32) DEFAULT 'crunch_time',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    commit_multiplier DECIMAL(3,2) DEFAULT 2.00,
    depression_multiplier DECIMAL(3,2) DEFAULT 1.50,
    reward_payload JSONB,
    status VARCHAR(16) DEFAULT 'active'
);

-- P1-3 Meme Templates (metadata only, actual generation is client-side)
CREATE TABLE meme_templates (
    id SERIAL PRIMARY KEY,
    template_id VARCHAR(32) UNIQUE NOT NULL,
    title VARCHAR(128),
    unlock_condition VARCHAR(32), -- default, achievement, event
    asset_path VARCHAR(256)
);

-- Tech Debt: Battle Reward Claims
CREATE TABLE battle_reward_claims (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    battle_date DATE NOT NULL,
    rank INT NOT NULL,
    reward_payload JSONB,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, battle_date)
);
```
- **Deliverable:** Applied migration, schema verified

#### A-4. Extended State API
- **File:** `backend/src/routes/state.js` (modify)
- **New fields in response:**
```json
{
  "teamBattle": {
    "active": true,
    "seasonNumber": 3,
    "teamCommits": 240,
    "targetCommits": 500,
    "teamRank": 5,
    "reward": { "energy": 100 }
  },
  "skins": {
    "equipped": "legacy_archaeologist",
    "unlocked": ["legacy_archaeologist", "night_shift"]
  },
  "achievements": [
    { "id": "legacy_zone", "progress": 1, "target": 1, "completed": true, "claimed": false }
  ],
  "crunchTime": {
    "active": true,
    "endsAt": "2026-05-12T00:00:00Z",
    "commitMultiplier": 2.0,
    "depressionMultiplier": 1.5
  },
  "referralChain": {
    "activeReferrals": 2,
    "nextMilestone": 3,
    "milestoneReward": { "energy": 50 }
  },
  "isBurnout": false,
  "death": {
    "canRespawn": false,
    "respawnCost": null
  }
}
```
- **Deliverable:** `/api/state` returns all new fields (null/empty if feature inactive)

#### A-5. Death Screen Backend Trigger
- **File:** `backend/src/utils/deathScreen.js` (new)
- **Spec:**
  - In `recoverProgression` and `tap.js`: if `depression_level >= 100`, set `is_burnout = true` in progression
  - In `/api/state`: return `isBurnout: true`
  - `POST /api/respawn`: resets depression to 0, subtracts respawn cost
- **Deliverable:** Death state correctly triggered and resettable

#### A-6. Enhanced Anti-Fraud
- **File:** `backend/src/middleware/antiFraud.js` (modify)
- **Spec:**
  - Hard reject if IP has >= 5 referrals in 24h (soft flag stays at >= 3)
  - Check Telegram account age (`initDataUnsafe.user?.created_at` if available)
  - Device fingerprint: hash of `initData + user-agent + platform` stored in `referrals.device_hash`
  - Flag if same device hash appears with > 2 different referrer_id
- **Deliverable:** Hard blocks for obvious farms, soft flags for suspicious patterns

#### A-7. Team Battle Backend
- **File:** `backend/src/routes/teamBattle.js` (new)
- **Endpoints:**
  - `GET /api/team-battle/current` — current season + team contribution + leaderboard
  - `POST /api/team-battle/claim` — claim season reward if target reached
- **Deliverable:** Team battle core logic

#### A-8. Achievement Engine
- **File:** `backend/src/utils/achievements.js` (new)
- **Spec:**
  - Track achievements on key actions (tap, rank up, referral, login streak)
  - `checkAndUpdateAchievement(userId, triggerType, payload)`
  - Example: `triggerType: 'rank_up', payload: { rank: 3 }` unlocks "Senior Developer" skin
- **Deliverable:** Achievement progression auto-updates

---

## Model B — Player Experience Layer

### Scope
Mini-games, skins UI, death screen, creative frontend features.

### Tasks

#### B-1. P2-1 Mini-Game "Debugger" (QTE)
- **File:** `frontend/src/components/MiniGameDebug.jsx` (new)
- **Spec:**
  - Phaser scene overlay (not full screen)
  - 3-second QTE: tap bugs appearing on screen
  - Reward: -5 depression, bonus commits
  - Cooldown: once per session
  - Trigger: button in StatsBar or random popup when depression > 30
- **API needed from A:** `POST /api/minigame/debug` (returns `{ reward, nextAvailableAt }`)
- **Deliverable:** Working QTE with visual feedback

#### B-2. P2-2 Skin Panel
- **File:** `frontend/src/components/SkinPanel.jsx` (new)
- **Spec:**
  - Grid of unlocked skins
  - Show rarity, unlock condition, preview
  - Equip button
  - Locked skins show progress bar toward unlock
- **API needed from A:** `/api/state` → `skins` object
- **Deliverable:** Functional skin inventory

#### B-3. Death Screen UI
- **File:** `frontend/src/components/DeathScreen.jsx` (new)
- **Spec:**
  - Triggered when `state.isBurnout === true`
  - Dark overlay, dramatic copy (" burnout...")
  - "Respawn" button (calls `POST /api/respawn`)
  - Show stats: days survived, total commits, rank
- **API needed from A:** `/api/state` → `isBurnout`
- **Deliverable:** Polished death + respawn flow

#### B-4. P1-3 Meme Generator (Client-Side)
- **File:** `frontend/src/components/MemeGenerator.jsx` (new)
- **Spec:**
  - HTML5 Canvas overlay
  - 5 templates with placeholders:
    - "It works on my machine"
    - "Deploy on Friday"
    - "This is fine" (burning server)
    - "WTF per minute"
    - "Stack Overflow copy-paste"
  - Fill in game stats (rank, commits, days)
  - "Share shame" button → `Telegram.WebApp.shareUrl()`
- **No heavy backend needed** — just template list from `/api/state`
- **Deliverable:** Shareable meme generator

#### B-5. Audio Enhancements
- **File:** `frontend/src/utils/AudioManager.js` (modify)
- **Spec:**
  - BGM track switching per zone (legacy code zone → `bgm_legacy`, hackathon → `bgm_hackathon`)
  - SFX for level-up, quest complete, death screen
- **Deliverable:** Context-aware BGM

---

## Model C — Social & Events Layer

### Scope
Team battles UI, referral chains, limited-time events, analytics.

### Tasks

#### C-1. P1-5 Team Battle Frontend
- **File:** `frontend/src/components/TeamBattle.jsx` (new)
- **Spec:**
  - Team leaderboard (aggregated commits)
  - Progress bar toward team target
  - Personal contribution vs team average
  - Reward preview
  - Countdown timer
- **API needed from A:** `GET /api/team-battle/current`
- **Deliverable:** Full team battle panel

#### C-2. P2-3 Referral Chain UI
- **File:** `frontend/src/components/ReferralChainPanel.jsx` (new)
- **Spec:**
  - Show progress: "2/3 active friends" → "Reward: +50 energy"
  - Milestones: 3, 5, 10 active friends
  - Weekly quest: "Invite an active friend"
  - Claim button for reached milestones
- **API needed from A:** `/api/state` → `referralChain`
- **Deliverable:** Visible referral progression

#### C-3. P2-4 Crunch Time Event
- **Files:**
  - `frontend/src/components/CrunchTimeBanner.jsx` (new)
  - `frontend/src/components/EventPanel.jsx` (modify)
- **Spec:**
  - Sticky banner: "CRUNCH TIME! 2x commits, 1.5x stress. Ends in 14:32"
  - EventPanel shows modified rules + exclusive sticker reward
  - Depression color shifts to orange/red during event
- **API needed from A:** `/api/state` → `crunchTime`
- **Deliverable:** FOMO event fully wired

#### C-4. P1-3 Meme Share Integration
- **File:** `frontend/src/utils/shareMeme.js` (new)
- **Spec:**
  - Generate share text: "Я накодил {commits} коммитов и дошёл до {rank} в Coder Survival. А ты?"
  - Use `Telegram.WebApp.shareUrl()` with generated image blob
- **Deliverable:** One-tap meme sharing

#### C-5. Phase 2 Observation SQL
- **File:** `observation/09_phase2_metrics.sql` (new)
- **Queries:**
  - Team battle participation rate
  - Skin equip rate by rarity
  - Meme shares per day
  - Crunch Time DAU lift
  - Referral chain conversion (3+ active friends)
- **Deliverable:** Analytics queries

---

## API Contract Reference

### `/api/state` new fields (Model A provides)
```typescript
interface ExtendedState {
  teamBattle?: {
    active: boolean;
    seasonNumber: number;
    teamCommits: number;
    targetCommits: number;
    teamRank: number;
    reward: RewardPayload;
  };
  skins?: {
    equipped: string | null;
    unlocked: string[];
  };
  achievements?: Array<{
    id: string;
    progress: number;
    target: number;
    completed: boolean;
    claimed: boolean;
  }>;
  crunchTime?: {
    active: boolean;
    endsAt: string; // ISO date
    commitMultiplier: number;
    depressionMultiplier: number;
  };
  referralChain?: {
    activeReferrals: number;
    nextMilestone: number;
    milestoneReward: RewardPayload;
  };
  isBurnout: boolean;
  death?: {
    canRespawn: boolean;
    respawnCost: RewardPayload | null;
  };
}
```

### New Endpoints (Model A provides)
| Endpoint | Method | Body | Response | Consumer |
|---|---|---|---|---|
| `/api/webhook/payment` | POST | Telegram payload | `{ success: true }` | Telegram |
| `/api/battle/distribute` | POST | `{ date }` | `{ distributed: 3 }` | Cron |
| `/api/respawn` | POST | — | `{ success, energy, depression }` | B-3 Death Screen |
| `/api/team-battle/current` | GET | — | `{ season, teamCommits, target, rank }` | C-1 |
| `/api/team-battle/claim` | POST | — | `{ reward }` | C-1 |
| `/api/minigame/debug` | POST | — | `{ reward, nextAvailableAt }` | B-1 |

---

## Synchronization Points

1. **Day 1:** Model A applies migration `013_phase2_schema.sql` + deploys extended `/api/state`
2. **Day 2:** Models B and C start frontend using mock data + new API fields
3. **Day 5:** Model A completes all backend endpoints (webhook, respawn, team-battle, minigame)
4. **Day 7:** Integration testing: B and C wire real API calls
5. **Day 10:** Smoke tests + observation SQL validation
6. **Day 12:** Push to production

---

## Merge Conflict Prevention

| File | Owner | Notes |
|---|---|---|
| `backend/src/routes/state.js` | **Model A** | B/C must not modify; request new fields via issue |
| `frontend/src/hooks/useGameState.js` | **Model A** | B/C add mapping only via PR to Model A |
| `backend/src/config/balance.js` | **Model A** | B/C request constants |
| `backend/migrations/*` | **Model A ONLY** | B/C forbidden |
| `frontend/src/components/*` | **B and C** | Coordinate via file naming (no overlaps in task list) |
| `observation/*.sql` | **Model C** | Append-only |

---

## Immediate Next Steps

1. **Model A** (current session): Start with A-1 (shop webhook) + A-2 (battle distribution) + A-3 (migration 013)
2. **Model B:** Start B-4 (meme generator) — client-side only, no backend dependency
3. **Model C:** Start C-5 (observation SQL) + C-4 (share utility) — no backend dependency

Ready to execute.
