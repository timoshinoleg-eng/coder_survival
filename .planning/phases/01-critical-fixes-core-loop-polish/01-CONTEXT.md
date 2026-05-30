# Phase 1: Critical Fixes & Core Loop Polish - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Фиксим критические баги и восстанавливаем доверие к core gameplay loop перед добавлением новых фич. В scope: энергия, депрессия/economy, обратная связь при тапе, прогресс квестов. Out of scope: новые фичи, рефакторинг архитектуры, streak_protect (отложено в Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Стратегия фикса энергии
- **D-01:** Алгоритм — накопление с порогом 5 минут. При открытии приложения энергия обновляется только если прошло ≥5 минут с момента последнего обновления `updated_at`. Накопленная за эти 5+ минут энергия начисляется сразу.
- **D-02:** UX — анимация +X энергии при входе в игру с пояснением «Восстановлено за время отсутствия». Наглядно для игрока, не раздражает при коротких визитах (5-минутный порог предотвращает спам анимацией).

### Депрессия и economy v2
- **D-03:** Активировать depression economy v2 полностью: включаем `stress_v2` flag, понижаем порог `high_stress` offer с 55% до 20%, активируем `DEPRESSION_PASSIVE_DECAY_PER_HOUR: 5`.
- **D-04:** Пересмотр баланса depression — planner должен проверить, не сделает ли passive decay + порог 20% игру слишком лёгкой. Возможно, нужно скорректировать скорость роста депрессии от тапов.
- **D-05:** `streak_protect` (no-op в `backend/src/routes/buy.js:153–155`) — отложить в Phase 5. В Phase 1 не трогаем.

### Обратная связь при тапе
- **D-06:** Haptic feedback — оба API с фоллбэком: сначала `Telegram.WebApp.HapticFeedback.impactOccurred('light')`, если недоступен (не Telegram WebView) — `navigator.vibrate(10)`.
- **D-07:** Визуальная «печать строк» — Phaser Text/Particle эффект поверх игрового мира. Использовать существующий Phaser-контекст, не DOM-overlay.

### Конфетти и прогресс-квесты
- **D-08:** Конфетти-анимация при завершении квеста — Phaser Particle Emitter (единообразно с печатью строк).
- **D-09:** Числовой прогресс — дополнение существующих индикаторов, не полная замена. Показывать «450/500 коммитов» по тапу/ховеру или в expanded view.

### Claude's Discretion
- Точные параметры particle emitter (конфетти, печать строк) — оставить на усмотрение implementer на основе performance budget мобильных устройств.
- Текст анимации при входе (+X энергии) — формулировка может быть адаптирована для лучшего UX.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Требования и roadmap
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, requirements mapped (TECH-01..04)
- `.planning/REQUIREMENTS.md` — TECH-01..04 definitions
- `.planning/PROJECT.md` — Core Value, Constraints, Context

### Codebase map
- `.planning/codebase/CONCERNS.md` §2.1 — `featureFlags: {}` hardcoded, `stress_v2` blocked
- `.planning/codebase/CONCERNS.md` §2.2 — `streak_protect` no-op
- `.planning/codebase/CONCERNS.md` §2.3 — rate-limit defaults softer than documented
- `.planning/codebase/STACK.md` §4 — Backend dependencies (express, pg, helmet, cors)

### Исходный код (ключевые файлы)
- `backend/src/routes/tap.js` — `featureFlags: {}` (line ~192), энергия/депрессия логика
- `backend/src/routes/buy.js` — `streak_protect` no-op (line ~153–155)
- `backend/src/middleware/rateLimit.js` — дефолты rate limit (line ~13–15)
- `backend/src/index.js` — CORS, trust proxy, SSL config
- `frontend/src/` — Preact + Phaser фронтенд (для haptic и particle эффектов)

### Аудиты
- `CONFLICT_MATRIX.md` — C-002, C-003 (stress_v2, passive decay)
- `SYNC_AUDIT.md` — 5.6.4 (feature flags)
- `AUDIT_ECONOMY_2026-05-07.md` — экономика энергии и депрессии

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phaser** — уже используется в frontend, можно расширить particle effects и text animations.
- **Express middleware** — `backend/src/middleware/` содержит rateLimit, initData; можно добавить energy-recovery middleware.
- **initData auth** — уже реализована, использовать для защиты эндпоинтов обновления энергии.

### Established Patterns
- **Feature flags через `featureFlags: {}`** — захардкожен пустой объект. Нужно либо активировать v2 логику без флага, либо ввести нормальную систему фиче-флагов (например, env-переменные или DB-флаги).
- **Energy update pattern** — `updated_at` timestamp в БД используется для rate limiting. Можно расширить для порогового накопления.
- **Item effect pattern** — `backend/src/routes/buy.js` использует `applyItemEffect` для бустеров. `streak_protect` — заглушка в этом же switch.

### Integration Points
- **Frontend ↔ Backend** — энергия и депрессия загружаются при инициализации. Нужно добавить endpoint или изменить логику обновления энергии.
- **Bot ↔ Backend** — не затрагивается в Phase 1 (кроме возможного уведомления о восстановлении энергии — out of scope).
- **Telegram WebApp SDK** — `window.Telegram.WebApp.HapticFeedback` доступен в Mini App context.

</code_context>

<specifics>
## Specific Ideas

- Анимация +X энергии при входе должна быть короткой (<1.5 сек) и неблокирующей — игрок может сразу тапать.
- Phaser particle emitter для конфетти — использовать существующий `animations.css` как reference для цветовой палитры.
- Haptic feedback — лёгкий impact (`light`), не `heavy`, чтобы не раздражать при частых тапах.

</specifics>

<deferred>
## Deferred Ideas

- **streak_protect** — реальная логика защиты стрика. Отложено в Phase 5 (Streaks, Achievements & Social Seeds).
- **Пуш-уведомление «Энергия полностью восстановлена»** — требует пуш-инфраструктуры, out of scope для Phase 1.
- **График восстановления энергии в профиле** — visualization, отложено.

</deferred>

---

*Phase: 1-Critical Fixes & Core Loop Polish*
*Context gathered: 2026-05-20*
