# Coder Survival vNext Spec

## Goal

Собрать следующий игровой пакет без расползания scope.

`vNext` должен:
- усилить first-session experience
- добавить понятную краткосрочную прогрессию
- дать 1-2 причины вернуться завтра
- не ломать текущий рабочий контур Telegram Mini App

Это не full redesign и не новая платформа. Это узкое расширение текущего MVP.

## In Scope

### 1. Onboarding + HUD + Tap Feedback

Что входит:
- splash / first-session onboarding
- более понятный верхний HUD
- лучшее визуальное ощущение тапа
- явнее показать уровень, прогресс, энергию, депрессию

Что не входит:
- большой редизайн всех экранов
- тяжёлая анимационная система
- новая UI-библиотека

### 2. Career Ladder v1

Что входит:
- отдельная progression-модель поверх текущих `tier/commits`
- XP за тап
- level up
- 3 ранга для первой версии:
  - Junior
  - Middle
  - Senior

Что не входит:
- 40+ уровней
- глубокая балансная система
- сложные unlock trees

### 3. Daily Quests + Streak v1

Что входит:
- 2 простых daily quests
- 1 бонус за выполнение всех
- простой streak
- claim rewards

Что не входит:
- weekly quests
- event quests
- social quests
- recovery / rescue flows сложнее одного fallback правила

### 4. Shop / Referral Shell

Что входит:
- простая shop витрина
- referral code + referral stats
- заготовка context offers

Что не входит:
- battle pass
- daily battle
- meme generator
- teams / squads

## Explicitly Out of Scope

- Coffee Break как отдельная активная механика
- Bug Hunt
- event platform
- Redis / SSE / PM2
- NAT / bot migration back to VM
- full anti-cheat platform
- full growth platform

## Product Decisions

### Core Economy

Текущий MVP уже считает:
- `commits_total`
- `commits_current`
- `energy`
- `depression_level`
- `streak_days`

`vNext` не должен ломать эту модель. Вместо этого:
- `commits_total` остаётся главной публичной метрикой
- `commits_current` используется как прогресс в текущем ранге/уровне
- `XP` хранится отдельно для новой ladder-модели

### Career Ladder v1

Минимальная модель:

- rank 1: `Junior`
- rank 2: `Middle`
- rank 3: `Senior`

Минимальные уровни:
- по 5 уровней в ранге

Простейшие пороги:

```text
Junior:  0, 25, 60, 110, 180
Middle:  260, 360, 490, 650, 850
Senior:  1100, 1400, 1750, 2150, 2600
```

Этого достаточно для первой версии. Никаких экспоненциальных монстров пока не нужно.

Бонусы:
- Junior: commits per tap = 1, max energy = 100
- Middle: commits per tap = 2, max energy = 120
- Senior: commits per tap = 3, max energy = 140

### Daily Quests v1

Только 2 квеста в первой версии:

1. `tap_count`
- цель: 50 тапов
- награда: +20 энергии

2. `commit_count`
- цель: 100 коммитов
- награда: +40 коммитов в прогресс

Бонус за всё:
- +30 энергии

Streak:
- +1 день, если пользователь хотя бы раз забрал daily reward в сутки
- если день пропущен, streak сбрасывается до 0

Никакой сложной rescue-логики в первой версии не нужно.

### Referral v1

Referral v1 не должен быть “growth machine”.

Минимум:
- у пользователя есть referral code
- есть referral link
- есть stats:
  - total invited
  - active invited
- можно увидеть базовую награду

Активация реферала:
- invited user exists
- invited user сделал минимум 20 тапов

Награда:
- referrer: +50 энергии
- referred: +30 энергии

Только одна награда на реферала.

### Shop v1

Не строим целую экономику. Только 3 SKU:

1. `energy_refill`
2. `depression_cure`
3. `tier_boost`

UI задача:
- показывать витрину
- показывать цены
- инициировать покупку через уже существующий flow

## Minimal Data Model

### New tables

#### 1. `player_levels`

```sql
CREATE TABLE player_levels (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp_total BIGINT NOT NULL DEFAULT 0,
    rank INTEGER NOT NULL DEFAULT 1,
    level_in_rank INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Зачем:
- не ломать текущую `progression`
- отделить новую ladder-логику

#### 2. `daily_quests`

```sql
CREATE TABLE daily_quests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quest_type VARCHAR(32) NOT NULL,
    target_value INTEGER NOT NULL,
    progress_value INTEGER NOT NULL DEFAULT 0,
    reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, quest_date, quest_type)
);
```

#### 3. `referral_codes`

```sql
CREATE TABLE referral_codes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Reuse existing tables

- `users`
- `progression`
- `purchases`
- `star_payments`
- `referrals`

Важно:
- не создавать 10 новых growth-таблиц
- `referrals` уже есть, расширять только при необходимости

## Backend Scope

### New endpoints

#### Career ladder

- `GET /api/player/level`
  - returns current rank, level, xp progress, next threshold

#### Daily quests

- `GET /api/quests/daily`
- `POST /api/quests/claim`

#### Referral

- `GET /api/referral/stats`
- `GET /api/referral/link`

#### Shop shell

- `GET /api/shop/products`

### Existing endpoints to extend

#### `GET /api/state`

Добавить:
- level payload
- quests summary payload
- referral summary payload опционально не нужен сразу

#### `POST /api/tap`

Добавить:
- XP increment
- level progression update
- daily quest progress update

#### `POST /api/buy`

Сохранить текущую механику, только later подключить под shop UI.

## Frontend Scope

### New components

- `SplashScreen.jsx`
- `OnboardingOverlay.jsx`
- `LevelBadge.jsx`
- `ProgressPanel.jsx`
- `DailyQuestsPanel.jsx`
- `ShopPanel.jsx`
- `ReferralPanel.jsx`

### Existing components to extend

- `frontend/src/main.jsx`
- `frontend/src/hooks/useGameState.js`
- `frontend/src/components/StatsBar.jsx`
- `frontend/src/components/TapArea.jsx`
- `frontend/src/components/LeaderboardPanel.jsx`
- `frontend/src/game/scenes/GameScene.js`

### Frontend sequencing

#### Phase A
- splash
- onboarding
- HUD polish
- tap feedback polish

#### Phase B
- level badge
- progress panel
- state wiring for career ladder

#### Phase C
- daily quests panel
- reward claim UX

#### Phase D
- shop panel
- referral panel

## Implementation Order

### Step 1
- DB migration for `player_levels`, `daily_quests`, `referral_codes`

### Step 2
- backend progression service for ladder v1

### Step 3
- extend `state` and `tap`

### Step 4
- frontend HUD / tap polish

### Step 5
- daily quests API + panel

### Step 6
- referral/shop shell

## Ownership

### I own directly

- final progression rules
- DB/API shape
- integration order
- backend changes touching shared game state

### Safe to delegate to kimi k2.6

- frontend UX polish pack
- daily quests panel UI
- referral/shop shell UI + low-risk backend shell
- docs cleanup after scope lock

## Acceptance Criteria

`vNext` можно считать готовым, если:

1. новый пользователь видит понятный onboarding
2. HUD визуально объясняет состояние игры лучше, чем сейчас
3. после тапов ощущается более сильный feedback
4. у игрока есть level/rank progress
5. у игрока есть daily quests
6. у игрока есть streak
7. shop screen открывается и использует существующий purchase intent flow
8. referral screen открывается и показывает рабочий referral link/stats

## Notable Constraints

- не ломать текущий Telegram flow
- не ломать working payment confirm path
- не тащить инфраструктурный replatforming в этот спринт
- не делать большой рефактор ради будущего идеального мира
