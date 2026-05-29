# Performance & Freeze Audit — Coder Survival
**Date:** 2026-05-26
**Scope:** Frontend, Backend API, DB, Integration, iOS WebView
**Method:** Static code analysis + hot-path tracing
**Previous fix analyzed:** `fab4d49 [MVP] reduce local gameplay freezes`

---

## Executive Summary

Коммит `fab4d49` устранил **симптомы** (лишние refresh-запросы после тапа, блокировку кнопки серии, лог-шум), но **не затронул корневые причины** зависаний. По результатам аудита выявлено **5 критических (P0) архитектурных проблем**, которые создают каскадные тормоза на каждом тапе и при загрузке state.

**Главный вывод:** игра виснет не из-за одного узкого места, а из-за **каскада** — монолитный контекст тянет 20+ пере-рендеров, каждый тап порождает 50–75 SQL-запросов, а Phaser при каждом resize пересоздаёт сцену с 7 эмиттерами. Даже после дросселирования refresh'ов фундаментальная нагрузка остаётся.

---

## P0 — Критические (прямая причина зависаний)

### 1. Монолитный GameProvider: 20+ компонентов пере-рендериваются на любое изменение

**Файлы:**
- `frontend/src/hooks/useGameState.js:838` — `value` объект пересоздаётся каждый render
- `frontend/src/hooks/useGameState.js:974` — `useGameState()` возвращает весь контекст без селекторов

**Проблема:** `GameProvider` хранит ~75 полей + ~30 колбэков в одном `useContext`. Любое изменение (тик энергии, таймер, toast) создаёт новый `value` → все 20+ подписчиков (`StatsBar`, `TapArea`, `DailyQuests`, `PassPanel`, `TeamPanel` и др.) пере-рендериваются синхронно.

**Эффект:** Даже при быстром тапе без сетевых запросов UI подвисает из-за React-рендера.

**Рекомендация:**
- Разбить на 3–4 изолированных контекста: `PlayerContext` (энергия/коммиты/ранг), `QuestContext`, `BattleContext`, `ToastContext`.
- Или внедрить селектор-паттерн: `useGameState(selector)` + `useMemo`/`useCallback` на `value`.
- **Оценка трудоёмкости:** 2–3 часа. Риск: medium (нужно проверить все вызовы `useGameState`).

---

### 2. `GET /api/state` — 45–65 SQL-запросов за один запрос

**Файл:** `backend/src/routes/state.js:221–468`

**Проблема:** State-эндпоинт открывает транзакцию `BEGIN` и последовательно выполняет ~45–65 запросов, многие из которых избыточны:
- `ensureDailyQuests` (N+1, 5 запросов) вызывается **3 раза** косвенно
- `getMyTeam` — 3 запроса
- `recoverPassiveLoc` → `updateTeamProgress` — ещё 5 запросов
- `getPassStatus` — 4–5 запросов
- `getUserSkins` — 3–4 запроса
- `processLoginReward` — 3–4 запроса
- `getContextOffer` + `recordOfferImpression` — 2 запроса

**Эффект:** При pool=10 (по умолчанию) 5 одновременных пользователей исчерпывают все соединения. Остальные висят в очереди.

**Рекомендация:**
- **Краткосрочно:** убрать `BEGIN/COMMIT` из `/api/state` — это read-only эндпоинт (кроме `INSERT users` и `UPDATE last_active`, которые можно вынести). Без транзакции запросы не блокируют друг друга.
- **Среднесрочно:** создать `/api/state/minimal` — только критические поля для первого рендера. Остальное (пас, скины, ачивки, баттлы) грузить лениво отдельными запросами после отрисовки UI.
- **Оценка:** 1 час (убрать транзакцию) + 2 часа (минимальный state-эндпоинт).

---

### 3. `POST /api/tap` — 55–75 SQL-запросов + N+1 на квесты

**Файл:** `backend/src/routes/tap.js:51–462`

**Проблема:** Каждый тап — это транзакция с 55–75 запросами. Ключевые узкие места:
- `ensureDailyQuests` (N+1, 5 запросов) вызывается **3 раза** на тап
- `updateDailyQuestProgress` → ещё 8 запросов
- `getDailyQuestSummary` → ещё 6 запросов
- `updateTeamProgress` — 5 запросов, **даже если у пользователя нет команды**
- `checkAchievement` ×3 — 6 запросов
- Fire-and-forget `INSERT audit_logs` (строка 99–103) не awaited — риск connection leak

**Эффект:** Serial tap queue во фронтенде ждёт, пока бэкенд выполнит 60+ запросов. Пользователь тапает быстрее, чем успевает обрабатываться очередь.

**Рекомендация:**
- **P0-fix за 1 час:** `ensureDailyQuests` заменить на один bulk `INSERT ... ON CONFLICT DO NOTHING` для всех 4 квестов.
- **P0-fix за 30 мин:** `updateTeamProgress` — ранний return если `SELECT team_members` вернул 0 строк.
- **P1-fix:** `getDailyQuestSummary` не вызывать внутри tap — квесты уже ensure'ены и update'ены выше.
- **P1-fix:** `audit_logs` fire-and-forget вынести за пределы транзакции.

---

### 4. Phaser: `scene.restart()` при каждом resize + утечка 7 эмиттеров

**Файлы:**
- `frontend/src/game/scenes/GameScene.js:332–334` — `onResize() { this.scene.restart(); }`
- `frontend/src/game/scenes/GameScene.js:66–151` — 7 эмиттеров создаются в `create()`, но не уничтожаются при restart

**Проблема:** Telegram WebView на iOS и Android инициирует resize при:
- открытии/закрытии клавиатуры
- вызове `tg.expand()`
- изменении safe area
- смене ориентации

Каждый restart создаёт новую сцену, а старые эмиттеры, графические объекты и таймеры остаются в памяти Phaser. При активной игре это приводит к OOM-киллу WebView.

**Рекомендация:**
- Заменить `scene.restart()` на динамическое пере-позиционирование объектов.
- Или, если restart критичен, в `SHUTDOWN` listener явно уничтожать все эмиттеры (`emitter.destroy()`), графику (`graphics.destroy()`), и очищать `setInterval`/`setTimeout`.
- **Оценка:** 1–1.5 часа.

---

### 5. `loadState()` — 10 параллельных запросов без дедупликации

**Файл:** `frontend/src/hooks/useGameState.js:428–489`

**Проблема:** `loadState()` одновременно стреляет:
1. `/api/state`
2. `/api/quests`
3. `/api/streak`
4. `/api/pass`
5. `/api/rewarded-video/status`
6. `/api/team/hackathon`
7. `/api/battle/active`
8. `/api/referral/status`
9. `/api/events`
10. `/api/quests/weekly`

Нет in-flight guard'а. Если `loadState()` вызван 3 раза подряд (например, из `claimQuests`, `claimStreak`, `claimPassReward`), получаем 30 одновременных запросов.

**Эффект:** Браузерный лимит 6 соединений на домен + backend pool=10 = мгновенный deadlock.

**Рекомендация:**
- Добавить `let loadStatePromise = null` в модуле — если promise уже есть, возвращать его вместо нового вызова.
- **Оценка:** 15 минут.

---

## P1 — Высокие (усиливают P0, но сами по себе не фатальны)

### 6. Frontend: последовательная очередь тапов

**Файл:** `frontend/src/hooks/useGameState.js:628–677`

```js
while (pendingTapsRef.current > 0) {
  const payload = await apiRequest("/api/tap", { ... });
  // ...
}
```

Пользователь тапает быстрее, чем бэкенд отвечает (особенно при 60+ запросах на тап). Очередь растёт, и каждый новый тап ждёт завершения предыдущего.

**Рекомендация:** Batch-тапы — отправлять `pendingTapCount` одним запросом, бэкенд применяет multiplier.

---

### 7. Backend: pool соединений = 10 (default), без таймаутов

**Файл:** `backend/src/index.js:61–67`

```js
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
```

Нет `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`. При 50+ запросов в транзакции и burst-трафике 10 соединений мгновенно кончаются.

**Рекомендация:**
```js
new Pool({
  connectionString: DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})
```

---

### 8. Backend: `pass_rewards.pass_id` и `team_members.team_id` — нет индексов

**Файлы:** миграции `024_pass_frontload_rewards.sql`, `021_stage3_social_layer.sql`

Таблицы `pass_rewards`, `player_passes`, `pass_claims`, `team_members` не имеют индексов на FK. `getPassStatus` и `updateTeamProgress` делают seq scan.

**Рекомендация:**
```sql
CREATE INDEX IF NOT EXISTS idx_pass_rewards_pass_id ON pass_rewards(pass_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_event_contributions_event_id ON event_contributions(event_id);
```

---

### 9. Backend: Health-check leak

**Файл:** `backend/src/index.js:82–96`

```js
app.get("/health", async (req, res) => {
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();  // ← вне try/finally
  res.json({ status: "ok" });
});
```

Если `client.query("SELECT 1")` бросит, `client.release()` не вызовется.

**Рекомендация:** обернуть в `try/finally`.

---

### 10. Frontend/iOS: 7 частиц-эмиттеров в Canvas 2D режиме

**Файл:** `frontend/src/game/scenes/GameScene.js:66–151`

Canvas 2D рендерит частицы на CPU. `crashDebris` выпускает 90 частиц за раз. На iOS WebView (aggressive CPU throttling) это вызывает frame drops и freeze.

**Рекомендация:**
- На iOS (`/iPhone|iPad/.test(navigator.userAgent)`) отключать частицы или снижать count до 10–15.
- Или детектить `navigator.hardwareConcurrency < 4` и включать low-power mode.

---

### 11. Frontend: дублирующиеся 1-секундные таймеры

**Файлы:**
- `frontend/src/App.jsx:164` — `setInterval(() => setRuntimeNow(Date.now()), 1000)`
- `frontend/src/components/StatsBar.jsx:114` — ещё один `setInterval(..., 1000)`

Два таймера делают одно и то же. `StatsBar` дополнительно пересчитывает строки каждую секунду.

**Рекомендация:** один глобальный таймер в `GameProvider`, время раздавать через ref или отдельный лёгкий контекст.

---

### 12. Frontend: `EventManager` не останавливается при shutdown сцены

**Файл:** `frontend/src/game/EventManager.js:14–19`

`start()` вызывается в `GameScene.create()`, но `stop()` не вызывается в `SHUTDOWN`. Таймеры Phaser накапливаются при restart.

**Рекомендация:** в `GameScene` `SHUTDOWN` listener добавить `this.eventManager.stop()`.

---

## P2 — Средние

### 13. `balanceAudit.js` — full table scan каждые 5 минут
**Файл:** `backend/src/jobs/balanceAudit.js`

Сканирует всю `progression` без индексов на `energy` и `depression_level`.

### 14. `dailySummaryCron.js` — N+1 внутри транзакции
**Файл:** `backend/src/utils/dailySummary.js:315–403`

Цикл по всем активным пользователям с персональными `INSERT/UPDATE`.

### 15. Anti-cheat: `tapHistory` Map растёт бесконечно
**Файл:** `backend/src/middleware/antiCheat.js:12`

Нет eviction. На проде при 10k+ пользователей — memory leak.

### 16. Frontend: `Confetti` создаёт массив каждый render
**Файл:** `frontend/src/components/Confetti.jsx:4–9`

`Array.from({ length: pieceCount }, ...)` + `Math.random()` на каждый render `PassPanel`.

### 17. Frontend: `TapArea` — 20 inline style-объектов каждый render
**Файл:** `frontend/src/components/TapArea.jsx:161–346`

Каждый тап создаёт ~20 новых объектов `{ ... }` для inline styles.

---

## Итоговая матрица приоритетов

| Приоритет | Проблема | Файл | Оценка времени | Ожидаемый эффект |
|-----------|----------|------|----------------|------------------|
| **P0** | Убрать BEGIN/COMMIT из `GET /api/state` | `state.js` | 1 ч | –40 запросов, –pool exhaustion |
| **P0** | Bulk-insert в `ensureDailyQuests` | `vnext.js` | 1 ч | –15 запросов на тап |
| **P0** | Ранний return в `updateTeamProgress` если нет команды | `teams.js` | 30 мин | –5 запросов на тап |
| **P0** | In-flight guard на `loadState()` | `useGameState.js` | 15 мин | Предотвращает 30-request storm |
| **P0** | Убрать `scene.restart()` из `onResize` | `GameScene.js` | 1–1.5 ч | Исправляет OOM на iOS |
| **P0** | Разбить GameProvider / селекторы | `useGameState.js` | 2–3 ч | Убирает каскадные re-renders |
| **P1** | Увеличить pool + добавить таймауты | `index.js` | 15 мин | Устойчивость к burst |
| **P1** | Batch-тапы на фронтенде | `useGameState.js` | 1 ч | Убирает serial queue |
| **P1** | Добавить FK-индексы | миграции | 30 мин | Ускоряет state/tap на 20–40% |
| **P1** | Отключать частицы на iOS | `GameScene.js` | 30 мин | Плавность на iOS |
| **P1** | Один глобальный 1-сек таймер | `App.jsx` + `StatsBar.jsx` | 30 мин | Меньше CPU load |
| **P2** | Eviction в `tapHistory` Map | `antiCheat.js` | 30 мин | Предотвращает memory leak |
| **P2** | `Confetti` + `TapArea` memoization | компоненты | 1 ч | Меньше GC pressure |

---

## Почему `fab4d49` не дал ощутимого эффекта

| Что исправлено | Почему недостаточно |
|----------------|---------------------|
| Post-tap refresh throttled | Refresh был 2 запроса, но сам тап всё ещё 60+ запросов. Экономия ~3% |
| Streak claim не блокирует | Блокировка была 1–2 секунды, не критична |
| Убран лог-шум | Ускоряет консоль, но не бэкенд |
| Polling 5→15 сек | Экономия 1 запрос в 10 секунд — несущественно |

**Критический путь:** сократить запросы в `POST /api/tap` с 60+ до 15–20 и убрать каскадные re-renders. Всё остальное — оптимизация второго порядка.
