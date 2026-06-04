# Финальный план: Оптимизация разработки Coder Survival

> Синтез двух исследований + альтернативного мнения + реальная проверка ClawHub

---

## 1. Разрешение ключевых споров (синтез)

| Спорный пункт | Решение | Обоснование |
|---------------|---------|-------------|
| **Docker** | ✅ Использовать Docker Desktop (уже установлен) | WSL2 backend для идентичности с CI. Для тестов — PostgreSQL контейнер. Fallback — нативный PostgreSQL через choco только если WSL2 не работает |
| **OpenCode** | ❌ Не добавлять | Kimi CLI + OpenClaw runtime полностью покрывают. Лишний инструмент = friction |
| **Codex** | ⚠️ Оставить только для GitHub PR review | `@Codex` tag в PR — уникальная фича. Не использовать для прямого кодинга — нестабилен |
| **Claude Code** | ✅ Оставить | 87.6% SWE-bench, 1M токенов контекста — лучший для сложных многофайловых рефакторингов |
| **Формат веток** | `feat/{agent}/FEAT-XX-desc` | Сразу видно владельца. Важно при 3+ агентах |
| **Ad SDK** | Начать с **AdsGram** | Нативная интеграция для Telegram Mini App. Monetag — fallback для международного рынка |
| **Волны** | 4 фазы (Tech Debt → Core → Polish → Monetization) | Tech Debt отдельно — правильно, security блокирует всё остальное |
| **MCP Bridge** | ❌ Не делать сейчас | Claude Bootstrap v3.6 — не проверен, может не существовать. Файловый протокол + git — надёжно и работает сейчас |
| **Координация** | Файловый протокол (TASK_QUEUE.md + API_CONTRACTS.md + COORDINATION.md) + Git worktrees | Проверено, не требует дополнительных инструментов |

---

## 2. Фазы работы (последовательно, не параллельно вначале)

### Фаза 0: Инфраструктура (День 1–2) — P0, блокирует всё

| # | Задача | Инструмент | Результат |
|---|--------|------------|-----------|
| 0.1 | Проверить/настроить Docker Desktop + WSL2 | PowerShell | `docker ps` работает, PostgreSQL контейнер на 5432 |
| 0.2 | Создать TASK_QUEUE.md, API_CONTRACTS.md, COORDINATION.md | VS Code | Три файла в корне репозитория |
| 0.3 | Настроить branch protection для main | GitHub Web | PR-only, required review, CI checks |
| 0.4 | Создать .github/CODEOWNERS | VS Code | Разделение: backend → Kimi, frontend → Kimi Desktop, docs → Hermes |
| 0.5 | Настроить git worktrees для 3 lanes | PowerShell | `coder-survival-kimi`, `coder-survival-desktop`, `coder-survival-hermes` |
| 0.6 | Установить root devDependencies | PowerShell | `concurrently`, `husky`, `lint-staged` в корне |
| 0.7 | Настроить GitHub Actions: full-ci.yml | VS Code | Lint + unit tests + integration tests с PostgreSQL service container |

### Фаза 1: Tech Debt + Security (День 2–3) — P0

| # | Задача | Агент | Результат |
|---|--------|-------|-----------|
| 1.1 | Исправить SQL injection → parameterized queries | Kimi (OpenClaw) | Все `db.query` используют `$1`, `$2` |
| 1.2 | Добавить zod-валидацию для всех API endpoints | Kimi (OpenClaw) | Валидация body/params/query |
| 1.3 | Добавить express-rate-limit + helmet + CORS | Kimi (OpenClaw) | Rate limit: 100/15min общий, 5/15min auth, 60/мин tap |
| 1.4 | Валидация Telegram initData (HMAC) | Kimi (OpenClaw) | `backend/src/middleware/telegramAuth.js` |
| 1.5 | Настроить GitHub Actions: security-scan.yml | Kimi (OpenClaw) | `npm audit`, CodeQL, TruffleHog |

### Фаза 2: Core Gameplay (День 3–6) — P0/P1

| # | Задача | Агент | Зависимость |
|---|--------|-------|-------------|
| 2.1 | UX Polish: Splash + Onboarding | Kimi Desktop | — |
| 2.2 | Career Ladder: XP + ранги (Junior/Middle/Senior) | Kimi Desktop | 2.1 (shared UI) |
| 2.3 | Skin Equip endpoint `POST /api/user/equip-skin` | Kimi (OpenClaw) | — |
| 2.4 | Shop/Referral Shell backend | Kimi (OpenClaw) | 2.3 |
| 2.5 | Team Battle Contribution Tracking fix | Kimi (OpenClaw) | — |
| 2.6 | Analytics: Amplitude SDK + 15 обязательных событий | Hermes + Kimi Desktop | 1.1–1.5 (security) |

### Фаза 3: Polish + Growth (День 6–9) — P1/P2

| # | Задача | Агент | Зависимость |
|---|--------|-------|-------------|
| 3.1 | Ad SDK: AdsGram rewarded video | Kimi Desktop | 2.6 (analytics) |
| 3.2 | Cron jobs: Daily Battle auto-rewards | Kimi (OpenClaw) | 1.3 (rate limiting) |
| 3.3 | Antifraud: anomaly detection | Kimi (OpenClaw) | 1.3 |
| 3.4 | Documentation cleanup + CHANGELOG | Hermes | — |

### Фаза 4: Monetization + A/B (День 9–12) — P2

| # | Задача | Агент |
|---|--------|-------|
| 4.1 | Shop: Telegram Stars integration | Kimi (OpenClaw) |
| 4.2 | A/B Tests: onboarding variants | Kimi Desktop + Hermes |
| 4.3 | Viral mechanics: sharing achievements | Kimi Desktop |

---

## 3. Скиллы для установки (проверено на ClawHub)

### Уже доступные (встроенные в OpenClaw)

| Скилл | Зачем нужен | Когда использовать |
|-------|-------------|-------------------|
| **github** | PR, issues, CI через `gh` CLI | При каждом PR и CI проверке |
| **healthcheck** | Безопасность конфигурации | Раз в неделю аудит |
| **agent-browser** | Браузерная автоматизация | Тестирование Telegram Mini App в реальном браузере |
| **frontend-design** | UI мокапы | При проектировании новых экранов |
| **zen-review** | Экспертный код-ревью | Перед merge в main |
| **plan** | Планирование задач | При разбивке больших фич |
| **research** | Исследование кодовой базы | Перед рефакторингом |
| **skill-creator** | Создание кастомных скиллов | Для создания специфичных скиллов под проект |

### Рекомендуется скачать с ClawHub

> Установка: `clawhub install <skill-slug>` или вручную в `~/.openclaw/skills/`

| Скилл (slug) | Категория | Зачем | Приоритет |
|--------------|-----------|-------|-----------|
| **api-security** | Security | Secure API design patterns: auth, authorization, input validation, rate limiting | P0 — нужен для фазы 1 |
| **n8n** | Automation | Автоматизация cron-уведомлений, workflow orchestration | P1 — для фазы 3 (cron jobs) |
| **cron-scheduling** | Automation | Управление cron jobs через чат | P1 — альтернатива n8n, проще |
| **agent-orchestrator** | DevOps | Meta-agent для оркестрации сложных задач | P2 — когда subagents станут не хватать |
| **github** (уже есть) | DevOps | Уже встроен, но проверить обновления | — |

### ⚠️ Что НЕ скачивать (проверено, нет или не подходит)

| Что искали | Результат | Почему не подходит |
|------------|-----------|-------------------|
| "telegram mini app" | ❌ Нет специфичных скиллов | Нет готовых скиллов для TMA. Использовать `agent-browser` + custom research |
| "phaser" / "gamedev" | ❌ Нет специфичных скиллов | 35 скиллов в Gaming — это для AI-игр, не для разработки. Создать кастомный |
| "postgres" / "postgresql" | ❌ Нет специфичных скиллов | Docker + raw SQL достаточно. ORM — если решим добавить |
| "ci/cd" / "pipeline" | ⚠️ Есть `cicd-pipeline` | Слишком generic, лучше настроить GitHub Actions вручную |
| "claude-code" | ❌ Нет | Claude Code — отдельное приложение, не скилл OpenClaw |

### Кастомные скиллы (создать через skill-creator)

| Скилл | Путь | Содержимое | Приоритет |
|-------|------|------------|-----------|
| **coder-survival-gamedev** | `~/.openclaw/skills/coder-survival-gamedev/` | Паттерны Phaser 3.60: scene lifecycle, tap feedback, object pooling, sprite animation, anti-patterns | P1 |
| **coder-survival-telegram** | `~/.openclaw/skills/coder-survival-telegram/` | WebApp SDK: initData, viewport, haptic feedback, ClosingConfirmation API, viewport.expand(), ready() | P1 |
| **coder-survival-deploy** | `~/.openclaw/skills/coder-survival-deploy/` | Deploy на Yandex Cloud: SSH, Docker compose, DB migration, rollback | P2 |
| **coder-survival-smoke** | `~/.openclaw/skills/coder-survival-smoke/` | Прод-чеки: health endpoints, критичные фичи, API availability | P2 |

---

## 4. Распределение агентов (финальная версия)

| Агент | Роль | Что делает | Что НЕ делает |
|-------|------|------------|---------------|
| **Kimi (OpenClaw)** | Backend + DevOps + Coordination | Express endpoints, PostgreSQL миграции, тесты, CI/CD, security, antifraud, cron jobs | Frontend UI компоненты, Preact компоненты |
| **Kimi Desktop** | Frontend + UX | Preact компоненты, Phaser сцены, анимации, onboarding, Ad SDK, UI полировка | Backend endpoints, миграции БД, security |
| **Hermes** | Архитектура + Docs + Analytics | OpenAPI-спеки, ADR, analytics tracking plan, CHANGELOG, README, код-ревью архитектуры | Прямое редактирование кода, имплементация |
| **Codex** | Automated PR review | `@Codex` tag в PR — review комментарии | Не для прямого кодинга, нестабилен |
| **Claude Code** | Критичные рефакторинги | Сложная многофайловая логика, архитектурные рефакторинги | Не для рутинных задач, требует PTY |
| **Human (ты)** | Мерж + Решение споров | Approve PR, deploy production, финальные архитектурные решения | — |

---

## 5. Чек-лист «Что сделать сегодня» (если начинаем сейчас)

### Блок 1: Инфра (30 мин)
- [ ] Проверить Docker Desktop: `docker ps` в PowerShell
- [ ] Запустить PostgreSQL контейнер: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=... postgres:15`
- [ ] Создать `TASK_QUEUE.md` в корне (таблица: ID | Фича | Приоритет | Lane | Агент | Статус | Ветка)
- [ ] Создать `API_CONTRACTS.md` (текущие endpoints + форматы)
- [ ] Создать `COORDINATION.md` (кто сейчас работает, какие ветки активны)
- [ ] Создать `.github/CODEOWNERS` (backend → @timoshinoleg-eng, frontend → @kimi-desktop, docs → @hermes)
- [ ] Настроить branch protection на GitHub (Settings → Branches → main)

### Блок 2: Git Worktrees (10 мин)
```powershell
cd "C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh"
git worktree add ..\coder-survival-kimi -b feat/kimi/FEAT-03-antifraud
git worktree add ..\coder-survival-desktop -b feat/desktop/FEAT-01-ux-polish
git worktree add ..\coder-survival-hermes -b feat/hermes/FEAT-00-docs
```

### Блок 3: Скиллы (10 мин)
- [ ] Установить `api-security`: `clawhub install api-security` (или скачать с GitHub в `~/.openclaw/skills/`)
- [ ] Установить `cron-scheduling`: `clawhub install cron-scheduling`
- [ ] Проверить, что `github`, `healthcheck`, `agent-browser` уже есть
- [ ] Создать кастомный скилл `coder-survival-telegram` через `skill-creator` (или вручную)

### Блок 4: Запуск (10 мин)
- [ ] Запустить Kimi Desktop в worktree `coder-survival-desktop` → начать Splash screen
- [ ] Запустить Hermes в worktree `coder-survival-hermes` → начать API_CONTRACTS + CHANGELOG
- [ ] Kimi (OpenClaw) в основном репо → начать SQL injection fix (фаза 1.1)

---

## 6. Координационный протокол (файловый)

### Файлы и их назначение

| Файл | Кто пишет | Кто читает | Обновление |
|------|-----------|------------|------------|
| `TASK_QUEUE.md` | Human (начальное) + Агенты (статус) | Все | Каждый агент обновляет статус своих задач |
| `API_CONTRACTS.md` | Hermes (спецификация) | Kimi (backend), Kimi Desktop (frontend) | При изменении API — BEFORE implementation |
| `COORDINATION.md` | Все | Все | Каждый агент пишет: "Я работаю над X, ветка Y, ожидаю Z" |
| `.github/CODEOWNERS` | Human | GitHub | Статичный, обновляется при смене владельцев |

### Conventions (все агенты)

- **Commits:** `feat(AGENT): FEAT-XX description` (e.g., `feat(kimi): FEAT-03 fix SQL injection in leaderboard`)
- **Branches:** `feat/{agent}/FEAT-XX-short-desc`
- **PR:** В title указать `FEAT-XX`, в description — чек-лист проверок
- **Перед push:** `git fetch origin` → проверить конфликты → `git rebase origin/main` → push
- **Lane protection:** UX lane не трогает backend файлы (и наоборот) — проверяется через CODEOWNERS

---

## 7. Risk Mitigation (конкретные safeguards)

| Риск | Safeguard | Когда срабатывает |
|------|-----------|-----------------|
| Конфликты при редактировании | Git worktrees + CODEOWNERS | На уровне файловой системы |
| Race conditions при Git push | Branch protection + CI checks | На уровне GitHub |
| Несогласованные миграции БД | API_CONTRACTS.md + sequential фазы | Перед миграцией — review Hermes |
| Нарушение API contracts | API_CONTRACTS.md + PR template | Каждый PR backend |
| Тестовый хаос | CI gates (lint + unit + integration) | Каждый PR, blocking |
| Секреты в коде | TruffleHog + pre-commit hooks | Каждый commit, blocking |
| Попадание багов в prod | Branch protection + 1 review + CI | Каждый PR, blocking |

---

## 8. Почему этот план лучше обоих исследований

| Аспект | Исследование 1 | Исследование 2 | **Финальный план** |
|--------|---------------|---------------|-------------------|
| Docker | Нативный PostgreSQL | WSL2 | **Docker Desktop (уже установлен)** — лучшее из обоих |
| Codex | Удалить | Оставить | **PR-only** — реалистичный компромисс |
| OpenCode | Добавить | Удалить | **Не добавлять** — консенсус |
| MCP Bridge | chokidar | Claude Bootstrap | **Не делать сейчас** — файловый протокол надёжнее |
| Волны | 3 | 4 | **4 фазы** — Tech Debt отдельно, правильно |
| Скиллы | Generic | Не конкретно | **Конкретные slugs с ClawHub** — проверено |
| Риски | Есть | Нет | **8 конкретных safeguards** — системно |
| Action Plan | Есть | Есть | **Чек-лист «сегодня» с командами** — готов к выполнению |

---

## 9. Первый шаг прямо сейчас

Ты сказал "не забивай память до deep research". Deep research получен и проанализирован. Время действовать.

**Варианты:**

**A. Начать с инфраструктуры (рекомендую)**
- Я создаю все координационные файлы (TASK_QUEUE.md, API_CONTRACTS.md, COORDINATION.md, CODEOWNERS)
- Настраиваю git worktrees
- Подготавливаю CI/CD
- Время: 30-40 минут

**B. Начать с security (если хочешь быстрый win)**
- Я беру SQL injection fix в leaderboard.js
- Parameterized queries + zod validation
- Время: 20-30 минут

**C. Запустить всё параллельно (aggressive)**
- Subagent 1: Инфраструктура + координация
- Subagent 2: SQL injection fix
- Subagent 3: Git worktrees + Docker проверка
- Время: 20 минут (параллельно), но риск конфликтов

**Какой вариант? Или сразу A — стабильный фундамент?**
