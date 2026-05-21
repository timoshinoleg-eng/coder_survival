---
phase: "01"
name: "Walking Skeleton — Coder Survival"
scope: end-to-end minimal viable slice
stack: Node.js 20, Express 4, PostgreSQL 16, Preact 10, Phaser 3.60, Vite 5
---

# Walking Skeleton: Coder Survival

**Назначение:** Описать тончайший возможный end-to-end рабочий скелет проекта. Скелет включает структуру проекта, роутинг, одну реальную операцию чтения/записи в БД, одну реальную UI-интеракцию и dev-деплой.

**Статус:** Скелет уже реализован в репозитории; Phase 1 его укрепляет (critical fixes) и расширяет обратной связью.

---

## 1. Project Structure

```
coder_survival_repo/
├── backend/
│   ├── src/
│   │   ├── index.js                 # Express app, pool export, graceful shutdown
│   │   ├── migrate.js               # File-based migration runner
│   │   ├── config/
│   │   │   └── balance.js           # Economy constants (TAP_MECHANICS, STRESS_V2)
│   │   ├── middleware/
│   │   │   ├── initData.js          # Telegram Mini App auth (HMAC-SHA256)
│   │   │   ├── rateLimit.js         # Per-user sliding-window rate limit
│   │   │   └── errorHandler.js      # PG error codes → HTTP statuses
│   │   ├── routes/
│   │   │   ├── state.js             # GET /api/state — hydrate player state
│   │   │   ├── tap.js               # POST /api/tap — core loop: commit + energy
│   │   │   └── buy.js               # POST /api/buy — item purchases
│   │   └── utils/
│   │       └── progression.js       # Energy recovery + depression decay logic
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   └── 002_progression.sql      # users, progression, sessions tables
│   ├── tests/
│   │   ├── helpers/
│   │   │   ├── testDb.js            # testPool, ensureTestSchema, resetTestDatabase
│   │   │   └── testServer.js        # startTestServer() → { request, close }
│   │   └── smoke.idleEnergyRegen.test.js
│   ├── package.json
│   ├── .env.example
│   └── docker-compose.yml           # PostgreSQL 16 + backend with hot-reload
├── frontend/
│   ├── src/
│   │   ├── main.jsx                 # Preact mount point
│   │   ├── App.jsx                  # App shell
│   │   ├── hooks/
│   │   │   ├── useGameState.js      # Server-authoritative state sync
│   │   │   └── useTelegram.js       # Haptic, initData, MainButton wrapper
│   │   ├── utils/
│   │   │   └── api.js               # Fetch wrapper with X-Telegram-Init-Data
│   │   ├── game/
│   │   │   ├── PhaserGame.js        # Phaser 3 bootstrap
│   │   │   └── scenes/
│   │   │       ├── BootScene.js     # Procedural textures
│   │   │       └── GameScene.js     # Tap area, particles, avatar
│   │   └── components/
│   │       ├── TapArea.jsx          # DOM tap receiver
│   │       ├── StatsBar.jsx         # Energy / depression HUD
│   │       ├── PassPanel.jsx        # Battle Pass UI
│   │       └── DailyQuestsPanel.jsx # Daily quests UI
│   ├── public/
│   ├── index.html                   # Telegram WebApp meta, telegram-web-app.js
│   ├── vite.config.js
│   └── package.json
├── bot/
│   ├── api/
│   │   ├── webhook.js               # Vercel serverless: grammy webhook
│   │   └── invoice-link.js          # Telegram Stars invoice creation
│   ├── src/
│   │   └── createBot.js             # Commands, pre-checkout handlers
│   ├── package.json
│   └── vercel.json
└── .github/workflows/
    ├── ci.yml                         # Install → test → build
    └── backend-tests.yml            # Jest with PostgreSQL 15 service
```

---

## 2. Backend Skeleton

### 2.1 Entry Point (`backend/src/index.js`)

```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import stateRouter from './routes/state.js';
import tapRouter from './routes/tap.js';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/state', stateRouter);
app.use('/api/tap', tapRouter);

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Backend listening on :${process.env.PORT || 3000}`);
});
```

### 2.2 One Real DB Read/Write — `/api/tap`

**Route:** `POST /api/tap` (`backend/src/routes/tap.js`)

**Request:**
```json
{ "count": 1 }
```

**DB Transaction:**
1. `SELECT energy, depression_level, commits_total FROM progression WHERE user_id = $1 FOR UPDATE`
2. `UPDATE progression SET energy = energy - $2, commits_total = commits_total + $3, updated_at = NOW() WHERE user_id = $1`
3. `COMMIT`

**Response:**
```json
{
  "ok": true,
  "energy": 47,
  "commitsTotal": 1250,
  "depressionLevel": 15
}
```

Это — единственная реальная запись в БД, необходимая для существования core loop.

### 2.3 One Real DB Read — `/api/state`

**Route:** `GET /api/state` (`backend/src/routes/state.js`)

**DB Queries:**
1. `SELECT * FROM progression WHERE user_id = $1`
2. `SELECT * FROM daily_quests WHERE user_id = $1`
3. `SELECT * FROM player_pass WHERE user_id = $1`

**Response:**
```json
{
  "progression": { "energy": 47, "depressionLevel": 15, "commitsTotal": 1250 },
  "dailyQuests": { ... },
  "pass": { "currentLevel": 3, "currentXp": 450 },
  "featureFlags": { "stress_v2": true }
}
```

### 2.4 Migration Runner (`backend/src/migrate.js`)

```javascript
// Reads backend/migrations/*.sql in lexicographic order
// Tracks applied migrations in schema_migrations table
// Runs inside a transaction
```

---

## 3. Frontend Skeleton

### 3.1 Entry Point (`frontend/src/main.jsx`)

```javascript
import { render } from 'preact';
import { App } from './App.jsx';
render(<App />, document.getElementById('app'));
```

### 3.2 One Real UI Interaction — Tap

**Компонент:** `frontend/src/components/TapArea.jsx`

**Flow:**
1. Пользователь кликает/тапает по `TapArea`.
2. `useGameState.tap(count = 1)` вызывается.
3. `api.js` шлёт `POST /api/tap` с `X-Telegram-Init-Data` header.
4. При успехе:
   - `useGameState` обновляет локальный state (energy, commitsTotal).
   - `window.__PHASER_GAME__.events.emit('tap', { x, y })` уведомляет Phaser.
   - `GameScene.onTap()` запускает particles + floating text.

**Это — минимальная сквозная интеракция:** User gesture → Frontend state → API call → DB write → Backend response → Frontend update → Phaser visual feedback.

### 3.3 Phaser Integration (`frontend/src/game/PhaserGame.js`)

```javascript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

export function createPhaserGame(parentId) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 360,
    height: 640,
    parent: parentId,
    scene: [BootScene, GameScene],
    physics: { default: 'arcade' }
  });
}
```

---

## 4. Dev Deployment

### 4.1 Local Backend (Docker)

```bash
cd backend
cp .env.example .env   # заполнить DATABASE_URL
docker-compose up       # PostgreSQL 16 + backend nodemon
# API доступен на http://localhost:3000
```

### 4.2 Local Frontend

```bash
cd frontend
npm install
npm run dev             # Vite dev server на http://localhost:5173
# Переменная VITE_API_BASE_URL=http://localhost:3000
```

### 4.3 Local Bot (Polling — debug only)

```bash
cd bot
cp .env.example .env
ENABLE_POLLING_BOT=true node index.js
```

### 4.4 Test DB

```bash
cd backend
npm test                # Jest с PostgreSQL (TEST_DATABASE_URL)
```

---

## 5. Phase 1 Skeleton Additions

В рамках Phase 1 скелет дополняется следующими связями:

| Addition | File | Purpose |
|----------|------|---------|
| Energy recovery threshold gate | `backend/src/utils/progression.js` | 5-минутный порог — не даёт сбросить таймер при быстром открытии |
| Idle recovery payload | `backend/src/routes/state.js` | Передаёт `idleRecovery` во фронтенд для toast |
| Toast on entry | `frontend/src/hooks/useGameState.js` | Показывает «Восстановлено +X энергии» при входе |
| Stress v2 universal | `backend/src/routes/state.js`, `tap.js` | Убирает A/B, включает v2 для всех |
| Depression threshold 20% | `backend/src/config/balance.js` | Активирует high_stress offer раньше |
| Pass numeric XP | `backend/src/utils/pass.js` | Добавляет `nextLevelXp`, `remainingXp` в API |
| Confetti component | `frontend/src/components/Confetti.jsx` | Shared анимация завершения |
| Pass panel XP + confetti | `frontend/src/components/PassPanel.jsx` | Числовой прогресс + празднование level-up |
| Quest confetti | `frontend/src/components/DailyQuestsPanel.jsx` | Празднование завершения квеста |
| Haptic fallback | `frontend/src/hooks/useTelegram.js` | `navigator.vibrate` для не-Telegram браузеров |
| Code line print | `frontend/src/game/scenes/GameScene.js` | Phaser floating text при каждом tap |

---

## 6. Verification Steps

1. **Backend boots:** `cd backend && docker-compose up` → no errors, pool connects.
2. **Migration runs:** `cd backend && npm run migrate` → schema_migrations table populated.
3. **State endpoint works:**
   ```bash
   curl -H "X-Telegram-Init-Data: <test>" http://localhost:3000/api/state
   ```
   → Returns JSON with energy, depressionLevel, commitsTotal.
4. **Tap endpoint writes:**
   ```bash
   curl -X POST -H "Content-Type: application/json" -H "X-Telegram-Init-Data: <test>" \
     -d '{"count":1}' http://localhost:3000/api/tap
   ```
   → energy decremented by 1, commitsTotal incremented.
5. **Frontend builds:** `cd frontend && npm run build` → `dist/` created without errors.
6. **Dev server serves:** `cd frontend && npm run dev` → TapArea clickable, Phaser canvas renders.
7. **Tests pass:** `cd backend && npm test` → all existing + new phase1 tests green.

---

*Walking Skeleton defined for Phase 01. End-to-end slice: Express ↔ PostgreSQL ↔ Preact ↔ Phaser ↔ Telegram WebApp SDK.*
