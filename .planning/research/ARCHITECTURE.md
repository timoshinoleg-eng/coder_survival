# Coder Survival — Telegram Mini App Game Architecture Research

> **Date:** 2026-05-20  
> **Scope:** Tap-based progression, mini-games, meme generation, social features, Phaser frontend, grammy bot  
> **Existing Stack:** Express backend, PostgreSQL, Preact frontend, grammy bot, Phaser 3 (pixel-art)

---

## 1. Executive Summary

This document defines architecture patterns for evolving Coder Survival from a tap-based idle game into a multi-modal Telegram Mini App with embedded mini-games, real-time meme generation, and rich social mechanics. All patterns are chosen to fit the existing **Express + PostgreSQL + Preact + Phaser + grammy** stack with minimal disruption.

**Key design principles:**
- **Main loop inviolability:** The tap/energy/depression core loop must never be blocked by mini-games, social features, or asset generation.
- **Event-driven boundaries:** Components communicate via typed events, not direct function calls.
- **Server authority:** All economy-changing state lives in PostgreSQL; the frontend is a reactive renderer.
- **Lazy-load everything non-core:** Phaser scenes, mini-game assets, and meme templates load on demand.

---

## 2. Component Boundaries

### 2.1 High-Level Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TELEGRAM CLOUD                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐  │
│  │  BotFather  │    │  Tg Payments│    │  Bot API (notifications, share) │  │
│  └──────┬──────┘    └──────┬──────┘    └─────────────────┬───────────────┘  │
│         │                  │                              │                  │
│         └──────────────────┴──────────────────────────────┘                  │
│                            │                                                 │
└────────────────────────────┼─────────────────────────────────────────────────┘
                             │ initData / deep links
┌────────────────────────────┼─────────────────────────────────────────────────┐
│  FRONTEND (Preact + Phaser)│                                                  │
│  ┌─────────────────────────┴─────────────────────────────────────────────┐   │
│  │                      DOM LAYER (Preact)                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │   │
│  │  │StatsBar  │ │TapArea   │ │QuestPanel│ │ShopModal │ │SocialPanels  │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                    CANVAS LAYER (Phaser 3)                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐  │   │
│  │  │BootScene │ │GameScene │ │MiniGame  │ │MemeRenderScene           │  │   │
│  │  │(preload) │ │(idle/desk)│ │Scenes    │ │(offscreen canvas export) │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                    STATE & API LAYER                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐  │   │
│  │  │useGameState│ │useTelegram│ │apiRequest│ │EventBridge (Phaser↔React)│  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                             │ HTTPS JSON
┌────────────────────────────┼─────────────────────────────────────────────────┐
│  BACKEND (Express + node-pg)                                                │
│  ┌─────────────────────────┴─────────────────────────────────────────────┐   │
│  │                      ROUTE LAYER                                       │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │   │
│  │  │/api/tap│ │/api/state│ │/api/battle│ │/api/team│ │/api/quests│ │/api/minigame│ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                      SERVICE LAYER                                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │   │
│  │  │Progression│ │AntiCheat │ │Economy   │ │Social    │ │MemeGenerator │ │   │
│  │  │Engine    │ │(entropy) │ │(balance) │ │Engine    │ │(canvas srv)  │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                      DATA LAYER (PostgreSQL)                           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │   │
│  │  │users   │ │progression│ │sessions│ │battles │ │teams   │ │daily_quests│ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────────────────┐
│  BOT (grammy)               │                                                  │
│  ┌─────────────────────────┴─────────────────────────────────────────────┐   │
│  │  /start → WebApp URL    /leaderboard → API    payment webhook          │   │
│  │  periodic notifications → Bot API          share-to-chat → Bot API     │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Boundary Rules

| Boundary | Rule | Rationale |
|----------|------|-----------|
| **Frontend ↔ Backend** | All state mutations go through REST API; no WebSocket. | Telegram Mini Apps have unreliable WebSocket support on some clients. Polling with backoff is more predictable. |
| **Preact ↔ Phaser** | Communication only via `EventBridge` (shared `EventEmitter`). No direct DOM/canvas manipulation across frameworks. | Preact owns the DOM; Phaser owns the canvas. Direct coupling creates lifecycle bugs. |
| **Mini-games ↔ Main Loop** | Mini-games run in isolated Phaser scenes. They emit `minigame:complete` with a sealed payload. The main loop decides whether to apply rewards. | Prevents mini-game bugs from corrupting core progression. Enables rollback. |
| **Bot ↔ Backend** | Bot only calls `/api/internal/*` routes with `X-Bot-Backend-Secret`. Never touches frontend. | Security: bot token must not leak to client. |
| **Meme Gen ↔ Game State** | Meme generator reads from `window.__GAME_STATE__` (read-only snapshot). It never writes. | Memes are cosmetic; they must not mutate economy state. |

---

## 3. Data Flow

### 3.1 Core Tap Loop (Existing Pattern, Preserved)

```
User taps screen
      │
      ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  TapArea    │────▶│ pendingTaps │────▶│ flushTapQueue() │
│  (Preact)   │     │   (ref)     │     │  (serializes)   │
└─────────────┘     └─────────────┘     └────────┬────────┘
                                                  │
                       ┌──────────────────────────┘
                       │ POST /api/tap
                       │ { session_id }
                       ▼
              ┌─────────────────┐
              │  Express Route  │──▶ initDataMiddleware
              │   (/api/tap)    │──▶ antiCheat (entropy)
              └────────┬────────┘──▶ rateLimit (IP + user)
                       │
                       ▼
              ┌─────────────────┐
              │  DB Transaction │──▶ recoverProgression()
              │   (BEGIN)       │──▶ calculateTapDelta()
              │                 │──▶ UPDATE progression
              │                 │──▶ UPDATE quests, pass, team
              │                 │──▶ recordEventContribution()
              └────────┬────────┘
                       │ COMMIT
                       ▼
              ┌─────────────────┐
              │  JSON Response  │──▶ { delta, state, level, daily, ... }
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ applyTapState() │──▶ setState() → Preact re-render
              │  (useGameState) │──▶ window.__GAME_STATE__ → Phaser reads
              └─────────────────┘
```

**Key invariant:** `flushTapQueue()` serializes taps one-at-a-time. If energy hits 0, the queue is drained and subsequent taps are ignored client-side.

### 3.2 Mini-Game Flow (New Pattern)

```
User opens mini-game modal
      │
      ▼
┌─────────────┐     ┌─────────────────────┐
│ Preact UI   │────▶│ Phaser scene.start()│
│   (modal)   │     │  (lazy-loaded)      │
└─────────────┘     └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        ┌─────────┐     ┌─────────┐     ┌─────────┐
        │ QTEScene│     │QuizScene│     │CardScene│
        └────┬────┘     └────┬────┘     └────┬────┘
             │               │               │
             └───────────────┼───────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ minigame:complete│
                    │ EventBridge emit │
                    │  { type, score,   │
                    │    rewardsHash }  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌─────────┐   ┌───────────┐   ┌───────────┐
        │ Phaser  │   │  Preact   │   │  POST     │
        │ cleanup │   │  modal    │   │ /api/minigame/complete
        │ scene   │   │  close    │   │  (server validation)
        └─────────┘   └───────────┘   └─────┬─────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │  DB: verify   │
                                    │  rewardsHash  │
                                    │  idempotent   │
                                    └───────┬───────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │  apply rewards│
                                    │  (same tx as  │
                                    │   tap route)  │
                                    └───────────────┘
```

**Critical design decision:** Mini-games are **client-side authoritative during play**, but **server-side authoritative on reward payout**. The client sends a `rewardsHash` (HMAC of game parameters + score + nonce) that the server verifies before granting energy, commits, or items. This prevents score manipulation without requiring real-time server involvement during gameplay.

### 3.3 Meme Generation Flow

```
User taps "Generate Meme"
      │
      ▼
┌─────────────────┐
│ MemeGenerator   │──▶ Reads rankName, commits, depression, energy
│   (Preact)      │     from useGameState() (no API call needed)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Canvas render   │──▶ Offscreen 400×400 canvas (or Phaser RenderTexture)
│  (client-side)  │     draws template + dynamic stats text
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Blob / DataURL │──▶ Stored in memory (not localStorage — privacy)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────────┐
│ Share │ │  Publish  │
│ (Tg   │ │  to Chat  │
│ native│ │  (via Bot)│
└───────┘ └─────┬─────┘
                │
                ▼
        ┌───────────────┐
        │ POST /api/meme│──▶ Server generates signed URL
        │ /publish      │    → Bot sends photo to channel
        └───────────────┘
```

**Pattern:** Meme generation is **100% client-side** for the canvas compositing step. Only the "publish to chat" action requires the server, and that is done by uploading the image blob to the bot via a signed short-lived URL.

### 3.4 Social Features Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DAILY BATTLE LIFECYCLE                           │
│                                                                          │
│  00:00 UTC              User A                User B            Server   │
│     │                    │                      │                │       │
│     ▼                    │                      │                ▼       │
│ ┌─────────┐              │                      │         ┌───────────┐  │
│ │ Cronjob │──────────────┼──────────────────────┼────────▶│ battle.distribute│
│ │ (daily) │              │                      │         │  (scheduled)     │
│ └─────────┘              │                      │         └─────┬─────┘  │
│                          │                      │               │        │
│                          │                      │               ▼        │
│                          │                      │        ┌───────────┐   │
│                          │                      │        │ INSERT battles │
│                          │                      │        │  (matchmaking) │
│                          │                      │        └─────┬─────┘   │
│                          ▼                      ▼               │        │
│                    ┌───────────┐        ┌───────────┐           │        │
│                    │ GET /api/ │        │ GET /api/ │◀──────────┘        │
│                    │ battle/active      │ battle/active                   │
│                    └─────┬─────┘        └─────┬─────┘                    │
│                          │                    │                          │
│                          ▼                    ▼                          │
│                    ┌───────────┐        ┌───────────┐                    │
│                    │ BattleCard│        │ BattleCard│                    │
│                    │  (accept) │        │  (accept) │                    │
│                    └─────┬─────┘        └─────┬─────┘                    │
│                          │                    │                          │
│                          ▼                    ▼                          │
│                    POST /api/battle/accept (both players)                │
│                                          │                               │
│                                          ▼                               │
│                                   ┌───────────┐                          │
│                                   │ 24h timer │                          │
│                                   │  (cron)   │                          │
│                                   └─────┬─────┘                          │
│                                         ▼                                │
│                                   POST /api/battle/resolve               │
│                                         │                                │
│                                         ▼                                │
│                                   ┌───────────┐                          │
│                                   │ Distribute│                          │
│                                   │  rewards  │                          │
│                                   └───────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Suggested Build Order

Dependencies are shown as `A → B` (B depends on A).

### Phase 1: Foundation (Weeks 1–2)

```
EventBridge (Phaser↔React) ─┬─▶ MiniGame registry (scene loader)
                             └─▶ MemeRenderScene (offscreen canvas)
```

| # | Component | Why First |
|---|-----------|-----------|
| 1 | **Typed EventBridge** | All later components (mini-games, meme gen, social panels) need a decoupled way to talk across the Preact/Phaser boundary. Current `window.__GAME_STATE__` polling is fragile. |
| 2 | **Mini-game scene loader** | A registry that can `scene.add()` / `scene.remove()` mini-game scenes on demand without restarting the Phaser game. This unlocks all mini-game work. |
| 3 | **Offscreen canvas meme renderer** | Standalone; can be built and tested independently of the backend. |

### Phase 2: Mini-Games Core (Weeks 3–5)

```
MiniGame registry ─┬─▶ QTE Scene
                   ├─▶ Quiz Scene
                   ├─▶ Card Choice Scene
                   └─▶ Pitch Sim Scene
                          │
                          ▼
                    Minigame API routes
                          │
                          ▼
                    Server reward validator (HMAC)
```

| # | Component | Depends On | Notes |
|---|-----------|------------|-------|
| 4 | **QTE Scene** | #2 | Simplest mini-game; tests the `minigame:complete → reward` pipeline. |
| 5 | **Quiz Scene** | #2, #4 | Requires question bank (JSON file or `/api/minigame/questions`). |
| 6 | **Card Choice Scene** | #2, #4 | Requires weighted random loot tables in backend. |
| 7 | **Pitch Sim Scene** | #2, #4, #6 | Most complex; requires dialog tree state machine. |
| 8 | **`/api/minigame/complete`** | #4 | Single endpoint that verifies `rewardsHash` and applies rewards in a DB transaction. |

### Phase 3: Social Features (Weeks 6–8)

```
Team goals engine ─┬─▶ Daily Battle scheduler (cron)
                   ├─▶ Referral webhook improvements
                   └─▶ Leaderboard real-time polling
```

| # | Component | Depends On | Notes |
|---|-----------|------------|-------|
| 9 | **Team goals backend** | Existing `/api/team` | Extend `team_hackathon_state` to support arbitrary goal types. |
| 10 | **Daily Battle scheduler** | Existing `/api/battle` | Cron-based matchmaking + reward distribution. |
| 11 | **Referral webhook v2** | Bot | Bot posts milestone achievements to referrer's chat. |
| 12 | **Leaderboard SSE/long-polling** | — | Optional: replace 5-minute polling with `EventSource` for top-100. |

### Phase 4: Meme Pipeline & Bot Integration (Weeks 9–10)

```
MemeRenderScene ─┬─▶ Share native (client)
                 └─▶ /api/meme/publish ──▶ Bot sends to channel
```

| # | Component | Depends On | Notes |
|---|-----------|------------|-------|
| 13 | **Meme canvas → Blob export** | #3 | Add `canvas.toBlob()` + `URL.createObjectURL()`. |
| 14 | **Bot publish endpoint** | #13 | Backend receives blob, forwards to grammy `sendPhoto`. |
| 15 | **Meme templates from game state** | #13 | Auto-trigger memes on crits, burnout, rank-ups. |

---

## 5. Mini-Game State Without Breaking the Main Loop

### 5.1 The Problem

The main loop assumes:
- Energy decrements by 1 per tap.
- Depression increments deterministically.
- Server state is the single source of truth.

Mini-games break these assumptions:
- A QTE may consume 5 energy in 3 seconds.
- A quiz may reward 50 energy instantly.
- A card choice may modify depression non-linearly.

### 5.2 Solution: The "Energy Sandbox" Pattern

Each mini-game runs in a **sandboxed economy context**:

```typescript
// Conceptual type definitions
interface MiniGameSandbox {
  // Given to the mini-game at start (read-only)
  entryState: {
    energy: number;
    depression: number;
    commits: number;
    inventory: Record<string, number>;
  };

  // Delta the mini-game WANTS to apply (client-side preview)
  pendingDelta: {
    energyDelta: number;      // may be negative (cost) or positive (reward)
    depressionDelta: number;
    commitsDelta: number;
    inventoryChanges: Array<{ item: string; delta: number }>;
  };

  // Sealed by server before mini-game starts; verified on completion
  rewardsHash: string;  // HMAC(entryState + gameConfig + nonce, serverSecret)
}
```

**Flow:**

1. **Client requests sandbox:** `POST /api/minigame/start { type: 'qte' }`
2. **Server creates sandbox:**
   - Locks progression row (or uses optimistic concurrency via `updated_at`).
   - Generates `rewardsHash` based on current state + game config + random nonce.
   - Returns `sandbox` + `rewardsHash`.
3. **Client plays mini-game:** All economy changes are applied to the sandbox copy, not real state.
4. **Client completes mini-game:** `POST /api/minigame/complete { sandboxId, score, rewardsHash }`
5. **Server verifies:**
   - `rewardsHash` matches.
   - Score is within plausible bounds (e.g., QTE max score = 30).
   - Delta does not exceed pre-computed maxima.
   - Applies delta in a single DB transaction.
6. **Client applies server response** to `useGameState()` exactly like a tap response.

### 5.3 Phaser Scene Isolation

```javascript
// frontend/src/game/scenes/BaseMiniGameScene.js
export default class BaseMiniGameScene extends Phaser.Scene {
  constructor(key) {
    super({ key });
    this.sandbox = null;
    this.isPlaying = false;
  }

  init(data) {
    this.sandbox = data.sandbox;
    this.isPlaying = true;
    // PAUSE the main loop visuals (but don't stop GameScene)
    this.game.events.emit('main:pause-effects');
  }

  shutdown() {
    this.isPlaying = false;
    this.game.events.emit('main:resume-effects');
  }

  complete(score) {
    this.game.events.emit('minigame:complete', {
      type: this.scene.key,
      sandboxId: this.sandbox.id,
      score,
      rewardsHash: this.sandbox.rewardsHash,
    });
    this.scene.stop();
  }
}
```

**Key rule:** `GameScene.update()` continues running (depression overlay, idle animations), but `GameScene` ignores tap events while any `BaseMiniGameScene` is active.

### 5.4 State Machine for Mini-Game Lifecycle

```
            ┌─────────────┐
            │   IDLE      │◀─────────────────────────────┐
            │ (GameScene) │                              │
            └──────┬──────┘                              │
                   │ user opens mini-game                │
                   ▼                                     │
            ┌─────────────┐     API error / timeout      │
            │  LOADING    │──────────────────────────────┘
            │  (fetch     │
            │   sandbox)  │
            └──────┬──────┘
                   │ sandbox ready
                   ▼
            ┌─────────────┐
            │  PLAYING    │◀── user pauses → PAUSED
            │ (mini-game  │─── user resumes ──┘
            │   scene)    │
            └──────┬──────┘
                   │ game ends
                   ▼
            ┌─────────────┐
            │  VALIDATING │─── hash mismatch → CHEAT_DETECTED → IDLE
            │  (server)   │
            └──────┬──────┘
                   │ success
                   ▼
            ┌─────────────┐
            │  REWARDING  │
            │  (apply to  │
            │   main loop)│
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   IDLE      │
            └─────────────┘
```

---

## 6. Meme Generation Pipeline Integration

### 6.1 Current State

The existing `MemeGenerator.jsx` already renders client-side canvas with static templates. The gap is:
- No automatic trigger from game events.
- No server-side persistence of generated memes.
- No bot publishing pipeline.

### 6.2 Proposed Architecture: "Event-Triggered Meme Pipeline"

```
Game Event (crit gold, burnout, rank-up, hackathon complete)
      │
      ▼
┌─────────────────┐
│  MemeTrigger    │──▶ Rules engine: "burnout + rank ≥ 3 → trigger meme"
│  (middleware in  │     Each trigger has a priority queue (max 1 per 30s).
│   useGameState) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Template       │──▶ Select template based on event type + player stats.
│  Resolver       │     Example: burnout → "this_is_fine"; crit gold → "wtf_per_minute"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RenderLayer    │──▶ Option A: Preact canvas (current)
│  (client-side)  │     Option B: Phaser RenderTexture (better pixel-art)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Export + Share │──▶ toBlob() → Telegram WebApp share
│  (client-side)  │     OR
│                 │     upload to /api/meme/upload → CDN
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Optional: Bot  │──▶ If user opts in, bot posts to game's channel
│  Publish        │     with attribution stripped (privacy).
└─────────────────┘
```

### 6.3 Server-Side Meme Storage (Minimal)

Only store metadata, never the image blob:

```sql
CREATE TABLE meme_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  template_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL,  -- 'burnout', 'crit_gold', 'rank_up', 'manual'
  shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why no blob storage?** Telegram Mini Apps run on mobile; image uploads add latency and cost. Client-side sharing uses Telegram's native APIs (zero bandwidth for us).

### 6.4 Phaser RenderTexture Option (Recommended for Pixel Art)

For better pixel-art fidelity, use Phaser's `RenderTexture` instead of HTML Canvas:

```javascript
// In MemeRenderScene (hidden scene)
const rt = this.make.renderTexture({ width: 400, height: 400 }, false);
rt.draw('template_bg', 0, 0);
rt.drawDynamicTexture('stats_text', x, y);  // pre-rendered bitmap text
rt.snapshot((image) => {
  // image is an HTMLImageElement
  const blob = await fetch(image.src).then(r => r.blob());
  // share via Telegram
});
```

This preserves pixel-art scaling and integrates with the existing asset pipeline.

---

## 7. Real-Time vs Batch Updates for Social Features

### 7.1 Decision Matrix

| Feature | Latency Requirement | Pattern | Implementation |
|---------|---------------------|---------|----------------|
| **Tap feedback** | < 100 ms | Optimistic + sync | Client predicts energy drop; server confirms |
| **Energy recovery** | ~60 s accuracy | Client countdown | `recoveryEtaSeconds` from server; client ticks down |
| **Daily Battle status** | ~1 min | Adaptive polling | 10s → 30s → 2m backoff (existing pattern) |
| **Team Hackathon progress** | ~5 min | Batch + manual refresh | User taps refresh; no auto-poll |
| **Leaderboard (global)** | ~5 min | Cache + polling | Server caches top-100 in Redis; client polls every 5m |
| **Referral milestone** | Eventual | Webhook (bot) | Bot sends message when milestone reached |
| **Context offers** | < 1 s | Inline with state | Returned in `/api/state` and `/api/tap` responses |
| **Live events (crunch time)** | ~1 min | SSE or polling | `EventSource` on `/api/events/stream` (optional) |

### 7.2 Why Not WebSockets?

Telegram Mini Apps embed a WebView that may throttle background JavaScript, freeze timers, or drop WebSocket connections when the app is backgrounded. **REST + adaptive polling** is more reliable for this environment.

**Exception:** If a live tournament mode is added later, use **Server-Sent Events (SSE)** over `/api/events/stream` — it reconnects automatically and works over HTTP.

### 7.3 Batch Update Architecture

For team goals and leaderboard, implement a **read replica + materialized view** pattern:

```
┌─────────────────┐
│  PostgreSQL     │──▶ Primary (writes: taps, battles, team progress)
│  (primary)      │
└────────┬────────┘
         │
         │ logical replication
         ▼
┌─────────────────┐
│  PostgreSQL     │──▶ Read replica (queries: leaderboard, team stats)
│  (replica)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Materialized   │──▶ Refreshed every 5 minutes via cron
│  View: leaderboard_mv │
└─────────────────┘
```

**API impact:**
- `GET /api/leaderboard` reads from `leaderboard_mv` (O(1) for top-100).
- `GET /api/team/hackathon` reads pre-aggregated JSON from `progression.team_hackathon_state`.

### 7.4 Bot Notification Batch Queue

For bot notifications (referral milestones, battle results), use an **in-memory queue** in the Express process or a simple PostgreSQL queue table:

```sql
CREATE TABLE bot_outbox (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  message_text TEXT NOT NULL,
  payload JSONB,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retries INTEGER DEFAULT 0
);

-- Cron or setInterval worker:
-- SELECT * FROM bot_outbox WHERE sent_at IS NULL AND scheduled_at <= NOW() LIMIT 100;
```

This decouples the HTTP response from the bot API call (which can be slow or rate-limited).

---

## 8. Database Schema Additions (Proposed)

### 8.1 Mini-Games

```sql
CREATE TABLE minigame_sandboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('qte','quiz','card_choice','pitch_sim')),
  entry_state JSONB NOT NULL,
  rewards_hash TEXT NOT NULL,
  max_score INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_minigame_sandboxes_user_expires
ON minigame_sandboxes(user_id, expires_at);
```

### 8.2 Mini-Game Leaderboards (Weekly)

```sql
CREATE TABLE minigame_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  game_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  week_id TEXT NOT NULL,  -- '2026-W21'
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_minigame_scores_leaderboard
ON minigame_scores(game_type, week_id, score DESC);
```

### 8.3 Meme Stats

```sql
CREATE TABLE meme_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  template_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. Anti-Cheat Considerations for New Features

### 9.1 Mini-Game Score Validation

```javascript
// backend/src/utils/minigameValidator.js
export function validateQteScore(entryState, score, rewardsHash, serverSecret) {
  const expectedHash = createHmac('sha256', serverSecret)
    .update(JSON.stringify(entryState) + score)
    .digest('hex');

  if (expectedHash !== rewardsHash) return { valid: false, reason: 'hash_mismatch' };

  // QTE theoretical max: 30 reactions in 10s = 30 points
  const MAX_PLAUSIBLE_QTE_SCORE = 30;
  if (score > MAX_PLAUSIBLE_QTE_SCORE) return { valid: false, reason: 'score_impossible' };

  return { valid: true };
}
```

### 9.2 Meme Spam Prevention

- Rate limit: max 10 memes per hour per user (tracked in `meme_stats`).
- Bot publish rate limit: max 1 per minute per user (Telegram API limit anyway).

---

## 10. Technology Choices & Trade-offs

| Decision | Option A (Chosen) | Option B (Rejected) | Rationale |
|----------|-------------------|---------------------|-----------|
| Mini-game renderer | Phaser scenes | HTML overlay | Consistent pixel-art pipeline; reuses existing loader |
| Meme render | Client canvas/RenderTexture | Server-side (Sharp) | Zero server bandwidth; instant preview |
| Social updates | Adaptive polling | WebSocket | WebView background throttling makes WS unreliable |
| Mini-game authority | Server-verified hash | Real-time server loop | Latency too high for twitch mini-games |
| Bot notifications | DB queue + worker | Direct API call in route | Bot API can be slow; don't block HTTP responses |
| State bridge | EventEmitter | Redux/Zustand | Existing codebase uses hooks; EventEmitter is lighter |

---

## 11. Appendices

### A. Existing EventBridge Pattern (To Implement)

```javascript
// frontend/src/game/EventBridge.js
import Phaser from 'phaser';

export const eventBridge = new Phaser.Events.EventEmitter();

export const GameEvents = {
  // React → Phaser
  TAP: 'game:tap',
  PAUSE_EFFECTS: 'main:pause-effects',
  RESUME_EFFECTS: 'main:resume-effects',

  // Phaser → React
  SCENE_READY: 'phaser:scene-ready',
  MINIGAME_COMPLETE: 'minigame:complete',

  // Bidirectional
  MEME_TRIGGER: 'meme:trigger',
};
```

### B. Mini-Game Scene Registration

```javascript
// frontend/src/game/registry.js
const MINI_GAME_SCENES = {
  qte: () => import('./scenes/QteScene.js'),
  quiz: () => import('./scenes/QuizScene.js'),
  card_choice: () => import('./scenes/CardChoiceScene.js'),
  pitch_sim: () => import('./scenes/PitchSimScene.js'),
};

export async function loadMiniGame(game, type) {
  const loader = MINI_GAME_SCENES[type];
  if (!loader) throw new Error(`Unknown mini-game: ${type}`);
  const { default: SceneClass } = await loader();
  game.scene.add(type, SceneClass, true);
  return game.scene.getScene(type);
}
```

### C. References

- [Phaser + React Integration Guide](https://generalistprogrammer.com/tutorials/phaser-react-integration-guide) — EventBridge pattern
- [Phaser + Redux Architecture](http://orta.io/notes/games/phaser-redux/) — UIUpdates reconciliation
- [State Pattern for Phaser 3](https://blog.ourcade.co/posts/2020/state-pattern-ai-player-control-phaser-3/) — Scene state machines
- [Telegram Mini App Referral System](https://github.com/nikandr-surkov/Make-TON-Telegram-Mini-App-3) — Deep link patterns
- [Idle Clicker Game Architecture](https://docs.unity.com/ugs/en-us/solutions/manual/IdleClickerGame) — Cloud-side state validation patterns
