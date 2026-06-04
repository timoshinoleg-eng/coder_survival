# Анализ и план: Оптимизация pipeline для Coder Survival

## Итоговый вердикт по двум исследованиям

Оба исследования пришли к **одним и тем же выводам** — это хороший знак консенсуса. Различия в деталях, не в стратегии. Ниже — синтез обоих в единый план.

---

## 1. Что сходится (100% консенсус)

| Решение | Исследование 1 | Исследование 2 | Вердикт |
|---------|----------------|------------------|---------|
| **Git worktrees + branch-per-feature** | ✅ | ✅ | **Делать** |
| **CODEOWNERS + branch protection** | ✅ | ✅ | **Делать** |
| **Docker Desktop не нужен** | ✅ (PostgreSQL нативно) | ✅ (Docker Engine в WSL2) | **Docker Engine в WSL2** — конкретнее |
| **3 lanes разработки** | ✅ | ✅ (Lane A/B/C) | **Делать** |
| **Файловый планировщик (TASK_QUEUE.md)** | ✅ | ✅ | **Делать** |
| **API_CONTRACTS.md** | ✅ (OpenAPI) | ✅ | **Делать** |
| **Antifraud → Analytics → Gameplay → Monetization** | ✅ (3 волны) | ✅ (4 фазы) | **Делать** |
| **Zod для валидации** | — | ✅ | **Добавить** |
| **AdsGram для rewarded video** | Monetag | AdsGram | **AdsGram** — проще для Telegram |

## 2. Что расходится (разрешённые конфликты)

### 2.1 Docker: нативный PostgreSQL vs WSL2 Docker Engine
**Исследование 1:** предлагает `choco install postgresql15`.  
**Исследование 2:** предлагает Docker Engine в WSL2.

**Решение:** Docker Engine в WSL2. Почему:
- PostgreSQL нативно на Windows = боль при обновлениях и миграциях
- Docker Engine в WSL2 даёт тот же контейнер, что на CI (GitHub Actions)
- Можно запускать не только PostgreSQL, но и Redis, nginx для тестов
- Не нужен GUI Docker Desktop, только CLI

### 2.2 OpenCode: оставить или удалить
**Исследование 1:** оставить как вспомогательный CLI.  
**Исследование 2:** удалить (лишний инструмент = friction).

**Решение:** удалить из основного pipeline. OpenCode дублирует Kimi CLI + OpenClaw subagents. Если Kimi CLI недоступен — используем OpenClaw `sessions_spawn` с `runtime="acp"`. OpenCode не нужен.

### 2.3 Codex: удалить или оставить для PR review
**Исследование 1:** удалить временно (нестабилен).  
**Исследование 2:** оставить для automated PR review (`@Codex` tag).

**Решение:** удалить из основного pipeline. Codex GUI — это отдельное приложение, не CLI. Нет доказательств, что `@Codex` tag работает лучше, чем OpenClaw `zen-review` или `cross-review` skill. Если нужен автоматический review — используем `zen-review` через OpenClaw (уже доступен). Codex возвращаем только если появится стабильный CLI-режим.

### 2.4 Агентские роли: кто мержит
**Исследование 1:** Kimi Desktop или Hermes выполняет мерж.  
**Исследование 2:** Human (пользователь) выполняет мерж.

**Решение:** Human мержит. Почему: branch protection требует approving review, а репозиторий с одним maintainer (`timoshinoleg-eng`) не может автоматически назначить reviewer. CODEOWNERS работает как документация, но enforced review требует второго человека. Мерж делает пользователь после проверки. Kimi Desktop и Hermes — ревьюверы, не мержеры.

### 2.5 MCP Bridge: файловый watcher vs Claude Bootstrap
**Исследование 1:** файловый watcher через `chokidar` + `scripts/mcp-bridge.js`.  
**Исследование 2:** Claude Bootstrap v3.6.

**Решение:** файловый watcher (Вариант B из исследования 2). Claude Bootstrap v3.6 — это гипотетический фреймворк без подтверждённого существования. Файловый watcher на `chokidar` реализуем за 30 минут и работает без внешних зависимостей.

---

## 3. Финальная архитектура pipeline

### 3.1 Распределение ролей

| Агент | Роль | Что делает | Что НЕ делает |
|-------|------|------------|---------------|
| **Kimi (#1, OpenClaw)** | Backend + DevOps + GitHub Actions | Express endpoints, PostgreSQL миграции, тесты, CI/CD, deploy scripts | Не трогает frontend JSX/Phaser |
| **Kimi Desktop (#2)** | Frontend + UI | Preact компоненты, Phaser сцены, скины, анимации, UX | Не трогает backend routes, не создаёт миграции |
| **Гермес (#3, ChatGPT 5.5)** | Архитектор + планировщик | ADR, roadmaps, промпты, сложные алгоритмы, документация | Не редактирует код напрямую, не мержит |
| **Человек (Олег)** | Product Owner + мержер | Принимает решения, мержит PR, проверяет smoke, управляет задачами | Не пишет код (делегирует агентам) |

### 3.2 Lane separation (владение файлами)

```
Lane A: UX & Engagement (Kimi Desktop)
  /frontend/src/components/
  /frontend/src/game/scenes/
  /frontend/src/hooks/
  /frontend/src/assets/
  /analytics/frontend/

Lane B: Backend & API (Kimi + subagents)
  /backend/src/routes/
  /backend/src/middleware/
  /backend/migrations/
  /backend/tests/
  /bot/
  /scripts/
  /.github/workflows/

Lane C: Operations & Docs (Гермес)
  *.md
  /.planning/
  /docs/
  /API_CONTRACTS.md
  /TASK_QUEUE.md
  /COORDINATION.md

Shared (требуют согласования):
  /package.json (root)
  /README.md
  /docker-compose.*.yml
  /nginx/
```

### 3.3 Git workflow

```
main (protected) ← только PR, только после review
  │
  ├── feature/ux-*          (Kimi Desktop)
  ├── feature/api-*         (Kimi)
  ├── feature/ops-*         (Гермес)
  └── hotfix/*              (срочные исправления)
```

**Правила:**
1. Прямой push в `main` — запрещён (branch protection)
2. Каждый агент работает в своём git worktree (изолированная директория)
3. Conventional commits: `feat(scope): description`
4. Перед началом работы: `git pull origin main`
5. Перед push: `git pull origin main --rebase`
6. Мерж делает человек после review

### 3.4 Координационные файлы (4 штуки)

| Файл | Назначение | Кто обновляет | Когда обновлять |
|------|------------|---------------|-----------------|
| `TASK_QUEUE.md` | Задачи vNext со статусами | Человек / Гермес | При назначении, старте, завершении задачи |
| `API_CONTRACTS.md` | API endpoints, request/response | Агент, меняющий API | В каждом PR, трогающем backend routes |
| `COORDINATION.md` | Блокировки, конфликты, активные worktree | Все агенты | При обнаружении конфликта или блокера |
| `CHANGELOG.md` | Что изменилось в релизе | OpenClaw (auto) | После каждого merge в main |

---

## 4. Инструменты: что установить, что удалить

### 4.1 Установить (однократно, 1-2 часа)

| Инструмент | Команда | Зачем | Приоритет |
|------------|---------|-------|-----------|
| **Docker Engine в WSL2** | `wsl --update` + `sudo apt install docker-ce` | PostgreSQL для интеграционных тестов | P0 |
| **VS Code extensions** | `ext install ...` | ESLint, Prettier, GitLens, PostgreSQL, Thunder Client | P0 |
| **Root devDependencies** | `npm install -D concurrently husky lint-staged` | Параллельный dev, git hooks, lint staged | P0 |
| **OpenClaw skills** | `openclaw skills install ...` | composio, n8n-workflow, exa-search, self-improving-agent | P1 |
| **NPM packages** | `npm install ...` | zustand, @telegram-apps/sdk, @adsgram/react, express-rate-limit, helmet, zod, node-cron, amplitude-js | P1 (по мере нужды) |

### 4.2 Удалить из pipeline (не удалять с ПК, просто не использовать)

| Инструмент | Почему | Чем заменить |
|------------|--------|--------------|
| **OpenCode** | Дублирует Kimi CLI + OpenClaw subagents | OpenClaw `sessions_spawn` |
| **Codex GUI** | Нестабилен, не в PATH | OpenClaw `zen-review` / `cross-review` |
| **Claude Code** | Дублирует Kimi для рутинных задач | Kimi для рутины, Claude Code — только для критичных рефакторингов по запросу |

### 4.3 Оставить как есть

| Инструмент | Роль |
|------------|------|
| **Kimi (OpenClaw)** | Primary — всё, что требует ФС, Git, CLI, PostgreSQL |
| **Kimi Desktop** | Frontend specialist |
| **Гермес** | Архитектурный надзор |
| **Git + GitHub** | Единственный канал координации |
| **PowerShell** | Скрипты деплоя |
| **Yandex Cloud CLI** | Управление VM |
| **Kimi WebBridge** | Тестирование в реальном браузере |
| **VS Code** | IDE для ручного ревью |

---

## 5. Технический роадмап (итоговый, синтез)

### Фаза 1: Инфраструктура (Неделя 1) — P0
**Без этого строить дальше нет смысла.**

| # | Задача | Кто | Результат |
|---|--------|-----|-----------|
| 1.1 | Docker Engine в WSL2 + PostgreSQL контейнер | Человек | 31 интеграционный тест работает локально |
| 1.2 | Создать `TASK_QUEUE.md`, `API_CONTRACTS.md`, `COORDINATION.md` | Kimi (OpenClaw) | 4 координационных файла в корне |
| 1.3 | Настроить branch protection для `main` | Человек | PR-only merge, CI gates обязательны |
| 1.4 | Создать `.github/CODEOWNERS` | Kimi (OpenClaw) | Разделение файлов по lanes |
| 1.5 | Настроить GitHub Actions: `ci.yml` + `integration-tests.yml` | Kimi (OpenClaw) | Lint + unit + integration tests на каждый PR |
| 1.6 | Настроить GitHub Actions: `security-scan.yml` | Kimi (OpenClaw) | CodeQL + npm audit на каждый PR |
| 1.7 | Написать `scripts/create-worktree.ps1` | Kimi (OpenClaw) | Автоматизация создания worktree |
| 1.8 | Исправить SQL injection (parameterized queries) | Kimi (OpenClaw) | Все `db.query` используют `$1, $2` |
| 1.9 | Добавить `zod`-валидацию для API endpoints | Kimi (OpenClaw) | Все endpoints валидируют входные данные |
| 1.10 | Добавить `express-rate-limit` | Kimi (OpenClaw) | Rate limit: 500 req/15min глобально |

### Фаза 2: Core Gameplay (Неделя 2-3) — P0/P1
**Фичи, влияющие на retention.**

| # | Задача | Кто | Зависит от |
|---|--------|-----|------------|
| 2.1 | UX Polish: Splash + Onboarding | Kimi Desktop | — |
| 2.2 | Career Ladder: XP + ранги (Junior/Middle/Senior) | Kimi (OpenClaw) + Kimi Desktop | 2.1 (shared UI) |
| 2.3 | Skin Equip endpoint (`POST /api/user/equip-skin`) | Kimi (OpenClaw) | — |
| 2.4 | Shop/Referral Shell | Kimi (OpenClaw) | 2.3 |
| 2.5 | Team Battle Contribution Tracking fix | Kimi (OpenClaw) | — |
| 2.6 | Analytics: Amplitude SDK + 10+ событий | Kimi (OpenClaw) + Kimi Desktop | 1.8 (security) |

### Фаза 3: Polish + Monetization (Неделя 4-5) — P1/P2
**Монетизация и рост.**

| # | Задача | Кто | Зависит от |
|---|--------|-----|------------|
| 3.1 | Antifraud: anomaly detection + initData validation | Kimi (OpenClaw) | 1.8 (SQL fix) |
| 3.2 | Cron Jobs: auto-rewards Daily Battle | Kimi (OpenClaw) | 1.10 (rate limit) |
| 3.3 | Ad SDK: AdsGram rewarded video | Kimi Desktop | 2.1 (UX) |
| 3.4 | Documentation cleanup | Гермес | — |
| 3.5 | Staging environment на YC VM | Kimi (OpenClaw) | 1.3 (CI/CD) |

### Таблица зависимостей (итоговая)

| Задача | Зависит от | Блокирует | Параллелится с |
|--------|-----------|-----------|----------------|
| 1.1 Docker WSL2 | — | 1.2-1.10 | — |
| 1.2-1.7 Инфраструктура | — | — | Да, между собой |
| 1.8 SQL fix | — | 2.6, 3.1 | 1.2-1.7 |
| 1.9 Zod | — | 2.3-2.5 | 1.8 |
| 1.10 Rate limit | — | 3.2 | 1.9 |
| 2.1 UX Onboarding | 1.2-1.7 | 2.2 | 1.8-1.10 |
| 2.2 Career Ladder | 2.1 | — | 2.3-2.5 |
| 2.3 Skin Equip | — | 2.4 | 2.1-2.2 |
| 2.4 Shop/Referral | 2.3 | — | 2.5, 2.6 |
| 2.5 Team Battle fix | — | — | 2.1-2.4 |
| 2.6 Analytics | 1.8 | 3.2 | 2.1-2.5 |
| 3.1 Antifraud | 1.8 | — | 2.1-2.6 |
| 3.2 Cron Jobs | 1.10 | — | 2.1-2.6 |
| 3.3 Ad SDK | 2.1 | — | 2.2-2.6 |
| 3.4 Docs | — | — | Всё |
| 3.5 Staging | 1.3 | — | 2.1-2.6 |

---

## 6. Чек-лист первых 3 дней (что делать прямо сейчас)

### День 1: Инфраструктура (2-3 часа)

- [ ] Установить Docker Engine в WSL2 (PowerShell + Ubuntu)
- [ ] Создать `TASK_QUEUE.md`, `API_CONTRACTS.md`, `COORDINATION.md` в корне репо
- [ ] Настроить branch protection для `main` на GitHub (Settings → Branches)
- [ ] Создать `.github/CODEOWNERS` (Kimi / Kimi Desktop / Гермес)
- [ ] Создать `.github/pull_request_template.md`

### День 2: CI/CD + Worktrees (2-3 часа)

- [ ] Написать `scripts/create-worktree.ps1` (автоматизация worktree)
- [ ] Настроить GitHub Actions: `ci.yml` (lint + unit tests + build)
- [ ] Настроить GitHub Actions: `integration-tests.yml` (PostgreSQL service container)
- [ ] Настроить GitHub Actions: `security-scan.yml` (CodeQL + npm audit)
- [ ] Создать 3 worktrees: `coder-survival-ux`, `coder-survival-backend`, `coder-survival-ops`

### День 3: Security + Начало фич (3-4 часа)

- [ ] Исправить SQL injection (parameterized queries) — `backend/src/routes/`
- [ ] Добавить `zod`-валидацию для API endpoints
- [ ] Добавить `express-rate-limit` (глобальный + auth)
- [ ] Начать UX Onboarding: Splash screen (Kimi Desktop в worktree `coder-survival-ux`)
- [ ] Начать Career Ladder: XP service (Kimi в worktree `coder-survival-backend`)
- [ ] Первый PR → review → merge (человек проверяет, мержит)

---

## 7. Рекомендации по скиллам

### 7.1 Установить из ClawHub (приоритет P1)

```bash
# Установить через OpenClaw CLI
openclaw skills install composio      # 1000+ интеграций (GitHub, Slack)
openclaw skills install n8n-workflow  # Автоматизация cron, уведомлений
openclaw skills install exa-search    # Поиск по документации и GitHub
openclaw skills install self-improving-agent  # Запоминание ошибок между сессиями
```

### 7.2 Создать кастомные скиллы (приоритет P2)

```bash
# Создать через skill-creator
openclaw skills create gamedev-phaser      # Паттерны для Phaser 3.60
openclaw skills create telegram-mini-app   # Паттерны для Telegram WebApp SDK
openclaw skills create coder-survival-deploy  # Деплой на YC VM (специфично для проекта)
```

### 7.3 Уже доступные (использовать активно)

- `github` — PR, issues, CI через `gh CLI`
- `healthcheck` — security audit конфигурации
- `zen-review` — код-ревью перед мержем
- `cross-review` — ревью указанной моделью
- `frontend-design` — UI мокапы для новых экранов
- `plan` — планирование сложных задач
- `research` — исследование кодовой базы
- `kimi-webbridge` — тестирование в реальном браузере

---

## 8. Ключевые метрики для отслеживания (итоговая таблица)

| Метрика | Цель (30 дней) | Benchmark (TMA gaming) | Как измерить |
|---------|----------------|----------------------|--------------|
| DAU | 500+ | — | Amplitude |
| D1 Retention | 40%+ | 15-20% | Amplitude cohorts |
| D7 Retention | 15%+ | 8-10% | Amplitude cohorts |
| Средняя сессия | 3+ мин | 2-5 мин | Amplitude |
| ARPPU | $2+ | — | Telegram Bot API + Amplitude |
| Ad Completion Rate | 85%+ | 90%+ (rewarded) | AdsGram dashboard |

---

## 9. Риски и как их избежать

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| **Конфликты при редактировании** | Средняя | Высокое | Lane separation + CODEOWNERS + worktrees |
| **Race conditions при push** | Низкая | Среднее | Branch protection + PR-only merge |
| **Конфликт миграций БД** | Средняя | Высокое | Только Kimi создаёт миграции + timestamp naming |
| **Нарушение API contracts** | Средняя | Высокое | API_CONTRACTS.md + CI проверка |
| **Тесты пропускаются** | Высокая | Среднее | Docker WSL2 + CI gates (без прохождения тестов — нет мержа) |
| **Агенты работают в хаосе** | Средняя | Высокое | TASK_QUEUE.md + COORDINATION.md + ежедневный sync |
| **Secrets leak** | Низкая | Критическое | `.env` в .gitignore, TruffleHog в CI, no secrets in code |

---

## 10. Следующий шаг

**Рекомендация:** Начать с **Дня 1** (инфраструктура). Это 2-3 часа работы, которые разблокируют всё остальное. После этого — параллельная разработка фич в 3 lanes без конфликтов.

Хочешь, чтобы я начал выполнять День 1 прямо сейчас? Или хочешь отдать часть задач Гермесу / Kimi Desktop?
