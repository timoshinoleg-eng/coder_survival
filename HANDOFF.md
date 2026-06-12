# HANDOFF — Coder Survival Project
**Дата:** 2026-06-10
**Сессия:** 2 (30+ мин автономной работы + Kimi audit Tasks 1-3)

---

## ✅ ВЫПОЛНЕНО

### Баланс-фиксы (коммит `00bd0aa`, запушен в `main`)
| Файл | Изменение | Эффект |
|------|-----------|--------|
| `balance.js:183` | `DEPRESSION_PASSIVE_RECOVERY_PER_HOUR`: 120 → **20** | Стресс-механика теперь осмысленная, depression_cure монетизируется |
| `balance.js:636` | `CRIT_CHANCE_ADD_PER_LEVEL`: 0.02 → **0.005** | Endgame crit инфляция ×5 → ×1.15, leaderboard честный |
| `tap.js:24` | Добавлен gold crit cap `Math.min(0.25, ...)` | Защита от будущих балансных кеков |
| `dailyQuests.js:83-86` | earnLoc target: static 10000 → **dynamic `max(300, avgDailyFarm * 0.6)`** | Квест достижим для новичков |

### Kimi Audit — 3 задачи выполнены
- **Task 1 (Баланс):** 3 критических риска найдены и исправлены
- **Task 2 (Античит):** Сравнение Redis vs PostgreSQL → **решение: Variant B (PostgreSQL)** с pg_advisory_lock, batch INSERT, cron cleanup
- **Task 3 (Tap Performance):** 7 оптимизаций найдено, ~28 → ~18 запросов (-35%)

### Оптимизации tap.js — ЧАСТИЧНО ПРИМЕНЕНЫ
| # | Оптимизация | Статус |
|---|-------------|--------|
| 1 | Batch user_skins SELECT (senior_pajamas + all equipped в один запрос) | ✅ ПРИМЕНЕНО |
| 2 | UPDATE burnout RETURNING (UPDATE + SELECT → один UPDATE RETURNING) | ✅ ПРИМЕНЕНО |
| 3 | Batch daily_quests UPDATE | ❌ НЕ ПРИМЕНЕНО — нужно править |
| 5 | Single social progression UPDATE (team_hackathon + referral → один UPDATE) | ❌ НЕ ПРИМЕНЕНО — нужно править |
| 6 | Audit → out-of-transaction INSERT (anticheat INSERT до BEGIN) | ❌ НЕ ПРИМЕНЕНО — нужно править |
| 7 | 5 Covering Indexes (миграция) | ❌ НЕ СОЗДАНО |

---

## 🚧 ПРОДОЛЖЕНИЕ — СЛЕДУЮЩИЕ ШАГИ

### Приоритет 1: Закончить оптимизации tap.js
В файле `backend/src/routes/tap.js` нужно:

**3. Batch daily_quests UPDATE** — строки ~379-432:
- Сейчас: SELECT daily_quests_state → process → UPDATE
- Оптимизация: процесс обработки в памяти остаётся, но если `changed=true` — батчим UPDATE вместе с другими обновлениями progression

**5. Single social UPDATE** — строки ~477-492:
- Сейчас: два отдельных `UPDATE progression SET team_hackathon_state...` и `UPDATE progression SET referral_state...`
- Замена: один динамический UPDATE с IF EXISTS:
```javascript
const socialUpdates = {};
if (teamId && tapResult.commitsDelta > 0 && hackathonState) {
  socialUpdates.team_hackathon_state = JSON.stringify(hackathonState);
}
if (referralCheck.newlyUnlocked.length > 0) {
  socialUpdates.referral_state = JSON.stringify(referralCheck.state);
}
if (Object.keys(socialUpdates).length > 0) {
  const fields = Object.keys(socialUpdates).map((f, i) => `${f} = $${i + 2}`).join(', ');
  await client.query(
    `UPDATE progression SET ${fields}, updated_at = NOW() WHERE user_id = $1`,
    [userId, ...Object.values(socialUpdates)]
  );
}
```

**6. Audit → out-of-transaction INSERT** — строки ~92-110:
- Сейчас: `antich...` INSERT внутри транзакции (hold lock дольше)
- Замена: собирать audit entries в массив, флашить после COMMIT
```javascript
// В начале транзакции:
const pendingAuditLogs = [];

// Вместо INSERT INTO audit_logs:
pendingAuditLogs.push({ action: 'anticheat_pattern_ban', context: antiCheat.metrics });

// После COMMIT:
for (const log of pendingAuditLogs) {
  pool.query('INSERT INTO audit_logs (user_id, action, context) VALUES ($1, $2, $3::jsonb)', [userId, log.action, JSON.stringify(log.context)]);
}
```

### Приоритет 2: Миграция с индексами
Создать файл `backend/migrations/057_covering_indexes_tap.sql`:
```sql
-- 057_covering_indexes_tap.sql
-- Covering indexes for tap hot path (Kimi Task 3 optimization #7)

-- tap.js: SELECT * FROM progression WHERE user_id = $1 FOR UPDATE
CREATE INDEX IF NOT EXISTS idx_progression_user_id_covering
  ON progression (user_id)
  INCLUDE (energy, depression_level, commits_total, commits_current, tier, streak_days, active_effects, anti_cheat_state, inventory, daily_quests_state, event_state, forced_break_until, is_burnout, burnout_affliction, tier_boost_active, premium_boost_active);

-- buy.js / internalPayments.js: SELECT FROM purchases WHERE user_id = $1 AND item_type = $2
CREATE INDEX IF NOT EXISTS idx_purchases_user_item_status
  ON purchases (user_id, item_type, status)
  INCLUDE (id, stars_amount);

-- audit_logs: SELECT FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

-- sessions: SELECT FROM sessions WHERE session_id = $1 AND user_id = $2
CREATE INDEX IF NOT EXISTS idx_sessions_session_user
  ON sessions (session_id, user_id)
  INCLUDE (taps_count, commits_earned);

-- rate_limit_user / rate_limit_ip: атомарные UPDATE
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_window
  ON rate_limit_user (user_id, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_window
  ON rate_limit_ip (ip_address, window_start);
```

**Регистрация миграции:** номер файла `057` (последний в папке: `056_daily_quest_analytics_mirror.sql`)

### Приоритет 3: Задача 4 от Kimi — Тесты
Создать `backend/__tests__/` с файлами:
- `tap.test.js` — happy path, energy=0, burnout, crit, anti-cheat
- `buy.test.js` + `internalPayments.test.js` — purchase flow
- `anticheat.test.js` — CPS, entropy, CV, fatigue, ban score
- `shopCatalog.test.js` — getProductById, getProducts

### Приоритет 4: Render Deploy
- Баланс-фиксы уже запушены → Render должен автодеплоиться (autoDeploy: true в render.yaml)
- Проверить: `<masked>/health`
- Если не задеплоился: Render Dashboard → Manual Deploy

---

## 📋 KIMI WORK — ГОТОВЫЕ ПРОМПТЫ

### Task 4: Тесты
```
=== ЗАДАЧА 4: ТЕСТЫ ДЛЯ КРИТИЧЕСКИХ ПУТЕЙ ===
Напиши jest-тесты (backend/package.json → npm test).
Покрой 4 модуля: tap.js, buy.js+internalPayments.js, antiCheat.js, shopCatalog.js.
Требования: beforeEach → mockQuery.mockReset(), <100ms на тест, детерминированные.
Мок pg.Pool в __mocks__/pg.js.
Начни с tap.test.js.
```

### Task 5: Production Readiness
```
=== ЗАДАЧА 5: PRODUCTION READINESS CHECKLIST ===
Чек-лист для бэкенда: structured logging (pino), health checks (liveness/readiness),
metrics (Prometheus), error tracking, graceful shutdown, DB pool tuning.
Для каждого: текущее состояние + что добавить кодом.
```

---

## 🏗 ТЕКУЩАЯ ИНФРАСТРУКТУРА

| Компонент | URL | Статус |
|-----------|-----|--------|
| Frontend (Mini App) | `<masked>` | ✅ |
| Bot Webhook | `<masked>` | ✅ |
| API (Vercel proxy) | `<masked>/api/*` | ✅ |
| Backend (DuckDNS) | `<masked>` | ✅ |
| Render | `<masked>` | ⏳ Pending deploy |
| Health Check | `<masked>/health` | ✅ |

---

## 🔑 ДОСТУП

- **GitHub Remote:** `<masked>`
- **Git User:** `Debi <debi@local>` (настроен в WSL)
- **Render Dashboard:** <masked>
- **Render API Key:** НЕ ЗАПРОШЕН — нужен для автоматизации
- **Telegram User ID:** <masked>

---

## ⚠️ ИЗВЕСТНЫЕ ПРОБЛЕМЫ

1. **Yandex Cloud VM** — грант истёк, VM <masked> удалена
2. **Hetzner** — требует KYC (паспорт+селфи) — пользователь отказался
3. **Oracle Cloud** — нужен номер телефона для верификации
4. **Codex** — SMS-верификация, номер телефона из РФ не подходит
5. **Telegram** — заблокирован в РФ, нужен VPN для пользователей
6. **Git/Docker в Windows** — нет в PATH, использовать `wsl` префикс
7. **WSL путь с кириллицей** — `node --check` не работает с пробелами в путях, использовать `cd backend && node --check src/...`

---

## 📁 КЛЮЧЕВЫЕ ФАЙЛЫ

```
C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh\
├── backend/
│   ├── src/
│   │   ├── config/balance.js          ← ИЗМЕНЁН (фикс баланса)
│   │   ├── routes/tap.js              ← ИЗМЕНЁН (оптимизации #1, #2)
│   │   ├── utils/dailyQuests.js       ← ИЗМЕНЁН (динамический earnLoc target)
│   │   ├── utils/tap.js               ← ИЗМЕНЁН (gold crit cap)
│   │   ├── middleware/antiCheat.js     ← TODO: in-memory → PG (Task 2)
│   │   ├── middleware/rateLimit.js     ← TODO: in-memory → PG
│   │   └── utils/anticheat.js         ← TODO: batch INSERT для PG variant
│   ├── migrations/                    ← 56 миграций (последняя: 056)
│   ├── __tests__/                     ← TODO: создать (Task 4)
│   ├── render.yaml                    ← Render IaC (autoDeploy)
│   └── Dockerfile                     ← node:20-alpine
├── frontend/                          ← Preact + Phaser + Vite
├── bot/                               ← Grammy webhook
└── render.yaml                        ← Render service + PostgreSQL
```
