# Kimi Tasks for vNext

## Task 1 — UX Polish Pack

```text
Проект: Coder Survival Telegram Mini App.

Контекст:
- Источник истины: VNEXT_SPEC.md, README.md, HANDOFF.md.
- Игра уже рабочая: /start, Mini App, tap loop, leaderboard.
- Нужен узкий UX polish pack, а не редизайн с нуля.

Задача:
Сделай frontend polish pack в рамках vNext.

Фокус:
1. splash / first-session onboarding
2. улучшение HUD
3. усиление tap feedback
4. более явное отображение уровня и прогресса

Предпочтительные файлы:
- frontend/src/main.jsx
- frontend/src/hooks/useGameState.js
- frontend/src/components/StatsBar.jsx
- frontend/src/components/TapArea.jsx
- frontend/src/game/scenes/GameScene.js

Можно добавить новые небольшие компоненты в `frontend/src/components/`.

Не делать:
- не переписывать Phaser сцену с нуля
- не тянуть новые тяжёлые библиотеки
- не добавлять battle pass, teams, daily battle
- не строить большую дизайн-систему

Ожидаемый результат:
1. минимальный patch
2. список изменённых файлов
3. короткое объяснение UX-эффекта
```

## Task 2 — Shop / Referral Shell

```text
Проект: Coder Survival Telegram Mini App.

Контекст:
- Источник истины: VNEXT_SPEC.md.
- Текущий payment confirm flow уже существует и работает.
- Нельзя ломать существующие `purchases` и `star_payments`.

Задача:
Подготовь минимальный shell для:
1. shop catalog
2. referral link / referral stats
3. context offer placeholders

Фокус:
- low-risk backend shell
- простой frontend surface
- совместимость с текущей архитектурой

Можно делать:
- GET /api/shop/products
- GET /api/referral/link
- GET /api/referral/stats
- простые frontend panels/modals

Не делать:
- не внедрять battle pass
- не внедрять full growth platform
- не добавлять Redis
- не менять радикально payment pipeline

Ожидаемый результат:
1. минимальный patch
2. список новых endpoint'ов и файлов
3. отдельно перечислить спорные решения, которые надо отдать архитектору
```

## Task 3 — Docs Cleanup After vNext

```text
Проект: Coder Survival Telegram Mini App.

Контекст:
- Источник истины: VNEXT_SPEC.md.

Задача:
После чтения README.md, HANDOFF.md, project-status.json и VNEXT_SPEC.md
обнови docs так, чтобы было ясно:
1. что входит в ближайший спринт
2. что сознательно отложено
3. что уже сделано

Не трогать код приложения.

Ожидаемый результат:
1. короткий patch только по docs
2. чёткое разделение: now / later / done
```
