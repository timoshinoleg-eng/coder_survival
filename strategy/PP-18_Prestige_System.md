# PP-18: Prestige System — «Смена работы» (Job Change)

**Priority:** P0 · **Estimated effort:** 5–8 hours
**Rationale:** Фундамент всех idle-игр. Без престижа игрок достигает CTO уровня 10 к 3–5 дню, и дальше прогресс заканчивается. Prestige добавляет бесконечный long-term loop.
**Source:** Kimi Deep Research (9-страничный PDF), DEFAULTS.heartAttackSessionReset.preserveFields уже ссылается на `lifetime.prestige_currency`.

---

## 1. Core Mechanic

### Тема
Разработчик получает "оффер" от новой компании — сбрасывает прогресс, но сохраняет накопленный опыт и получает перманентные бонусы.

### Trigger
- Порог: `xp_total >= 3100` (CTO Level 10 — последний определённый порог в `XP_THRESHOLDS[5]`).
- TODO later: можно добавить "early prestige" при достижении Senior+ с множителем 0.5.

### Что сбрасывается (soft reset)
```
player_levels.xp_total    → 0
progression.tier          → 1 (Junior)
progression.commits_current → 0
progression.energy        → 100 (base)
progression.session_started_at → NOW()
progression.active_boosters → {}
progression.temporary_multipliers → {}
generators (все)          → удаляются/обнуляются
event_state               → {}
```

### Что сохраняется (persistent)
```
player_levels.prestige_level   → +1
player_levels.prestige_currency → +earned
users.commits_total            → НЕ трогаем (lifetime)
users.skins, inventory         → сохраняются
streak, battle_pass, squads    → сохраняются
daily_quests_state             → сбрасывается на новый день
```

---

## 2. Prestige Currency Formula

```
prestige_points = Math.floor(Math.sqrt(commits_total / 10))
```

| Lifetime commits | Prestige points |
|------------------|-----------------|
| 1,000 | 10 |
| 10,000 | 31 |
| 50,000 | 70 |
| 100,000 | 100 |
| 500,000 | 223 |
| 1,000,000 | 316 |

SQRT обеспечивает diminishing returns: каждый следующий престиж даёт меньше очков относительно накопленного.

---

## 3. Permanent Prestige Bonuses

Накладываются на `resolved` (resolveLevelState) после престижа. Все мультипликативные и суммируются с существующими.

| Бонус | Формула | Эффект при prestige=1 | При prestige=5 |
|-------|---------|----------------------|----------------|
| Tap multiplier | `1 + 0.10 * prestige_level` | x1.10 | x1.50 |
| Energy recovery speed | `1 + 0.05 * prestige_level` (divisor) | -5% interval | -25% interval |
| Crit chance add | `0.02 * prestige_level` | +2% | +10% |
| Max energy add | `10 * prestige_level` | +10 | +50 |
| Depression resistance | `1 - 0.05 * prestige_level` (mult on gain) | -5% gain | -25% gain |

### Где применить в коде
- **Tap multiplier:** в `computeTapXp()` или `tap.js` — `commitsPerTap * tapMultiplier`
- **Energy recovery:** в `getEffectiveRecoveryIntervalSeconds()` — `interval / recoveryMult`
- **Crit chance:** в `calculateTapDelta()` — добавить к `critSilverChance`/`critGoldChance`
- **Max energy:** в `resolveLevelState()` — `maxEnergy + maxEnergyAdd`
- **Depression resistance:** в `TAP_MECHANICS.depressionGainPerTap * resistance`

---

## 4. Backend Implementation

### 4.1 Migration (новый файл `migrations/024_add_prestige.sql`)

```sql
ALTER TABLE player_levels
  ADD COLUMN IF NOT EXISTS prestige_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestige_currency INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestige_shop_purchases JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS prestige_level INTEGER NOT NULL DEFAULT 0;
```

### 4.2 Config addon (`backend/src/config/balance.js`)

```js
export const PRESTIGE = {
  THRESHOLD_XP: 3100,                       // CTO Level 10
  FORMULA: 'sqrt(commits_total / 10)',
  BONUSES: {
    TAP_MULT_PER_LEVEL: 0.10,
    ENERGY_RECOVERY_MULT_PER_LEVEL: 0.05,
    CRIT_CHANCE_ADD_PER_LEVEL: 0.02,
    MAX_ENERGY_ADD_PER_LEVEL: 10,
    DEPRESSION_RESISTANCE_PER_LEVEL: 0.05,
  },
  SHOP: {
    SKIN:         { cost: 50,  id: 'prestige_skin_veteran',   desc: 'Permanent veteran skin' },
    TAP_X1_2:    { cost: 100, id: 'prestige_tap_boost',       desc: 'Permanent x1.2 tap multiplier' },
    STREAK_SAVE:  { cost: 30,  id: 'prestige_streak_save',    desc: '+1 streak protection per season' },
    TITLE:        { cost: 25,  id: 'prestige_title_10x',      desc: '"10x Developer" title badge' },
    CTO_CAPE:     { cost: 200, id: 'prestige_cto_cape',       desc: 'Rare CTO cape skin' },
  }
};
```

### 4.3 New route: `backend/src/routes/prestige.js`

Два эндпоинта:

#### `GET /api/prestige/preview`
- Проверяет, доступен ли престиж (`xp_total >= THRESHOLD_XP`)
- Возвращает:
  - `available: true/false`
  - `prestigeLevelAfter: N+1`
  - `prestigeCurrencyEarned: X`
  - `bonusesThisPrestige: { tapMult, energyRecovery, critAdd, maxEnergyAdd, depressionResist }`
  - `willReset: ['xp_total', 'tier', 'commits_current', 'energy', 'generators', 'boosters']`
  - `willKeep: ['commits_total', 'skins', 'streak', 'battle_pass', 'squads', 'inventory']`

#### `POST /api/prestige/execute`
**Transaction (BEGIN → COMMIT):**

1. `SELECT ... FOR UPDATE` на `player_levels`, `progression`, `users` по `user_id`
2. Валидация: `xp_total >= THRESHOLD_XP`
3. Вычислить `prestigeCurrencyEarned = Math.floor(Math.sqrt(commits_total / 10))`
4. `UPDATE player_levels SET prestige_level = prestige_level + 1, prestige_currency = prestige_currency + $earned, xp_total = 0`
5. `UPDATE progression SET prestige_level = prestige_level + 1, tier = 1, commits_current = 0, energy = 100, session_started_at = NOW(), active_boosters = '{}', temporary_multipliers = '{}', event_state = '{}'`
6. Удалить generators пользователя
7. `UPDATE users SET commits_current = 0 WHERE id = $userId`
8. `COMMIT`
9. Вернуть новый state + `prestigeReward: { level, currencyEarned }` + `bonuses`

#### `GET /api/prestige/shop`
Возвращает магазин престижа и баланс `prestige_currency`.

#### `POST /api/prestige/shop/buy`
`{ itemId: string }` → проверяет баланс, списывает валюту, записывает в `prestige_shop_purchases`.

### 4.4 Utility: `backend/src/utils/prestige.js`

```js
export function computePrestige(commitsTotal) {
  return Math.floor(Math.sqrt(commitsTotal / 10));
}

export function applyPrestigeBonuses(levelState, prestigeLevel, shopPurchases = {}) {
  const p = prestigeLevel || 0;
  return {
    ...levelState,
    commitsPerTap: levelState.commitsPerTap * (1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * p),
    maxEnergy: levelState.maxEnergy + PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * p,
    critChanceAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * p,
    energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * p,
    depressionResistanceMult: 1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * p,
    prestigeLevel: p,
  };
}
```

Эту функцию нужно вызвать в `resolveLevelState()` и в `getEffectiveRecoveryIntervalSeconds()`.

### 4.5 Интеграция в существующие модули

| Файл | Что добавить |
|------|-------------|
| `backend/src/config/balance.js` | Блок `PRESTIGE` (см. выше) |
| `backend/src/utils/vnext.js:resolveLevelState()` | Вызов `applyPrestigeBonuses()` после `getRankMeta()` |
| `backend/src/utils/progression.js:getEffectiveRecoveryIntervalSeconds()` | Учёт `prestigeLevel` для recovery speed |
| `backend/src/routes/tap.js` или `calculateTapDelta` | Учёт `critChanceAdd` и `depressionResistanceMult` |
| `backend/src/routes/state.js` | Добавить `prestige` в `fullStateResponse()` |
| `backend/src/index.js` | `app.use('/api/prestige', prestigeRouter)` |

---

## 5. Frontend Implementation

### 5.1 New component: `frontend/src/components/PrestigeModal.jsx`

**Состояния:**
1. **Preview** (GET /api/prestige/preview) — показывает что будет сброшено/сохранено
2. **Confirm** — кнопка "Сменить работу", с подтверждением
3. **Result** — анимация "Welcome aboard!", confetti, показ бонусов

**UI элементы:**
- Заголовок: "Вас хантят! 🎯"
- Список "Что сбросится" (красные иконки)
- Список "Что сохранится" (зелёные иконки)
- Прогресс-бар: "Prestige Level 1 → 2"
- Бонусы: +10% tap, +10 max energy, +2% crit...
- Кнопка: [Отмена] [Сменить работу ✅]

### 5.2 Prestige button

Кнопка "Job Offer" появляется:
- В `StatsBar` или `HUD` когда `xp_total >= 3100`
- С бейджем и пульсирующей анимацией

### 5.3 Confetti / celebration

При успешном престиже — конфетти (Phaser particles), + экран "Welcome to the new team!" с логотипом компании.

### 5.4 Prestige Shop (опционально, можно во второй фазе)

Панель в Shop, где за `prestige_currency` можно купить перманентные предметы.

---

## 6. State shape changes

```js
// player_levels row:
{
  user_id, xp_total, prestige_level, prestige_currency,
  prestige_shop_purchases: { items: ['prestige_skin_veteran'] },
  created_at, updated_at
}

// progression row:
{
  ..., prestige_level, ...
}

// API /api/state response — новое поле:
{
  prestige: {
    level: 2,
    currency: 47,
    nextThresholdXp: 3100,
    bonuses: { tapMult: 1.20, critAdd: 0.04, maxEnergyAdd: 20, recoveryMult: 1.10, depressionResist: 0.90 },
    shopPurchases: ['prestige_skin_veteran']
  }
}
```

---

## 7. Verification checklist

- [ ] Migration 024 применяется без ошибок
- [ ] `GET /api/prestige/preview` возвращает корректный preview для CTO игрока
- [ ] `POST /api/prestige/execute` в транзакции: сбрасывает xp → 0, tier → 1, сохраняет commits_total
- [ ] Prestige bonuses применяются к `commitsPerTap`, `maxEnergy`, recovery, crit, depression
- [ ] Prestige shop: покупка списывает валюту, записывает в JSONB
- [ ] Второй престиж: bonuses stack (prestige_level=2 → x1.20 tap)
- [ ] Frontend: модалка открывается, анимация конфетти, state обновляется
- [ ] Edge case: нельзя нажать престиж если xp < 3100
- [ ] Edge case: проверка на уже имеющийся prestige_level (не должно быть race condition)

---

## 8. Test scenarios

```
1. Игрок с xp_total=3500, commits_total=50000
   → preview показывает prestige_level 0→1, ~70 currency, bonuses
   → execute: xp_total=0, tier=1, prestige_level=1, currency=70

2. Игрок с xp_total=2000 (Middle)
   → preview unavailable, execute rejected 409

3. Игрок с prestige_level=3, commits_total=200000
   → tap = base_commitsPerTap * (1 + 0.10 * 3) = x1.30
   → maxEnergy = base + 10*3 = +30

4. Престиж сохраняет skin, streak, pass_progress, squad
   → проверить что все preserved поля не изменились
```
