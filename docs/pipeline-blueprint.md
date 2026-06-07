# Coder Survival — Production Pipeline & Multi-Agent Coordination Blueprint

## Executive Summary: 5 Главных Решений

1. **Pipeline — чёткий git-flow с git worktrees.** Каждый агент работает в изолированном `git worktree` с feature-веткой `feat/{agent}/FEAT-XX-desc`. Прямые пуши в `main` запрещены через GitHub Branch Protection. Мерж выполняет человек (Kimi Desktop или Hermes) после кросс-ревью. Это устраняет race conditions и конфликты при параллельной работе трёх автономных агентов на одной машине.

2. **Docker Desktop не нужен.** 31 интеграционный тест с PostgreSQL решается через **локальный PostgreSQL в WSL2** (порт 5432) с Docker-паттерном через `docker-compose.yml` в backend. Альтернатива — туннель к Yandex Cloud test-instance через SSH. CI запускает все тесты в GitHub Actions с сервисным контейнером postgres:15 — это уже работает (см. `backend-tests.yml`).

3. **Инструменты — роли фиксированы, избыточные удалены.** Kimi (OpenClaw) — backend + миграции + тесты. Kimi Desktop — frontend + UI. Hermes — архитектурный надзор + документация. OpenCode — дополнительный CLI-агент для скриптов. Claude Code и Codex — избыточны, временно удаляются из pipeline до стабилизации Codex.

4. **Координация — файловый планировщик.** `TASK_QUEUE.md` ( backlog → in-progress → review → done ) + `COORDINATION.md` (блокировки, конфликты, эскалация). Никакого API между агентами — только git + markdown. Git-commit в `TASK_QUEUE.md` триггерит всех агентов через `git pull`.

5. **Роадмап — три волны с жёсткими зависимостями.** Волна 1 (must-have): CI/CD + антифрод + аналитика — блокирует всё остальное. Волна 2: core gameplay (UX Polish, Career Ladder). Волна 3: монетизация (Ad SDK). Никаких склеек волн — без security-инфраструктуры нет смысла в новых фичах.

---

## 1. Tool Audit

### 1.1 Распределение инструментов по ролям

| Инструмент | Оптимальная роль | Решение | Обоснование |
|------------|-----------------|---------|-------------|
| **Kimi (OpenClaw runtime)** | Backend API, миграции БД, интеграционные тесты, Docker-файлы | **Оставить** | Единственный агент с доступом к PostgreSQL, CLI, Docker. Subagents (8 шт.) — для параллельных тестов. Идеален для Node.js/Express. |
| **Kimi Desktop (GUI)** | Frontend UI (Preact + Phaser), верстка, анимации, Haptic feedback | **Оставить** | GUI-режим позволяет визуально верифицировать Phaser-сцены и Preact-компоненты. Может делать финальный мерж в `main`. |
| **Hermes (ChatGPT 5.5)** | Архитектурный надзор, генерация документации, ревью сложной логики, OpenAPI-спеки | **Оставить** | Бывший координатор. Теперь — стратегический архитектор. Пишет промты и документацию лучше всех. |
| **OpenCode (npm)** | Вспомогательный CLI-агент: генерация скриптов, утилиты, boilerplate-код | **Добавить** | Легковесный, ставится через `npm i -g @anthropics/opencode-cli`. Хорош для мелких backend-задач. Не заменяет Kimi, а дополняет. |
| **Codex (ChatGPT 5.5, GUI)** | Ранее: координация всех агентов | **Удалить (временно)** | Стал работать нестабильно. Блокирует pipeline. Вернуть после стабилизации или заменить на Kimi Desktop для финального мержа. |
| **Claude Code (Anthropic)** | Альтернативный CLI-агент | **Заменить** | Дублирует Kimi. Использовать только если Kimi недоступен. Убрать из основного pipeline. |
| **OpenClaw Gateway** | Мост между Kimi runtime и внешними триггерами | **Оставить** | Gateway watch — основа MCP-моста для Kimi Desktop / Hermes. |
| **Kimi WebBridge** | Веб-интерфейс для Kimi Desktop | **Оставить** | Используется Kimi Desktop для GUI-взаимодействия. |
| **VS Code** | IDE для ручного ревью | **Оставить** | Человек использует для финальной проверки перед мержем. |
| **Git** | Единственный канал координации | **Оставить** | Центральное звено pipeline. |
| **PowerShell** | Скрипты развёртывания (уже используется) | **Оставить** | `scripts/*.ps1` — production release, smoke tests, DNS update. |
| **Yandex Cloud CLI (yc)** | Управление VM, DNS, базами данных | **Оставить** | Деплой на production VM. |
| **SSH** | Деплой через GitHub Actions + прямой доступ к VM | **Оставить** | `appleboy/ssh-action` в workflow. |

### 1.2 Docker Desktop: установить или найти альтернативу

**Решение: Docker Desktop НЕ устанавливать.**

| Сценарий | Подход | Команды |
|---------|--------|---------|
| **Интеграционные тесты (31 шт.)** | Локальный PostgreSQL через WSL2 + `docker-compose.yml` backend | `cd backend && docker-compose up` (если Docker в WSL2) или `sudo service postgresql start` + psql |
| **Без Docker вообще** | Нативный PostgreSQL 15 for Windows + pgAdmin | `choco install postgresql` или установщик с официального сайта |
| **CI-тесты** | GitHub Actions с сервисным postgres:15 | Уже работает: `backend-tests.yml` с `services.postgres` |
| **Production БД** | Yandex Cloud Managed PostgreSQL | Уже настроено |

**Рекомендация:** Установить **PostgreSQL 15** нативно для Windows через `choco install postgresql15` или скачать с [postgresql.org/download/windows/](https://www.postgresql.org/download/windows/). Это даст локальный порт 5432 без Docker. CI-прогон всех 31 теста через GitHub Actions остаётся primary source of truth.

```powershell
# PowerShell — установка PostgreSQL 15
choco install postgresql15 -y
# Или через winget
winget install PostgreSQL.PostgreSQL.15

# Проверка
psql --version
# Создание test-базы
createdb coder_survival_test
# Запуск тестов
$env:NODE_ENV="test"
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coder_survival_test"
cd backend
npm test -- --runInBand
```

### 1.3 VS Code расширения

| Расширение | Команда установки | Зачем |
|-----------|------------------|-------|
| ESLint | Встроено | Линтинг JS/JSX |
| Prettier | `ext install esbenp.prettier-vscode` | Форматирование |
| GitLens | `ext install eamodio.gitlens` | Git history, blame, diff |
| PostgreSQL (ckolkman) | `ext install ckolkman.vscode-postgres` | Работа с БД без pgAdmin |
| Thunder Client | `ext install rangav.vscode-thunder-client` | Тестирование API endpoints |
| Error Lens | `ext install usernamehw.errorlens` | Ошибки inline |
| npm Intellisense | `ext install christian-kohler.npm-intellisense` | Автокомплит импортов |
| Docker (опционально) | `ext install ms-azuretools.vscode-docker` | Если Docker Desktop вернётся |

### 1.4 npm-пакеты (root devDependencies)

```bash
# Установить в корне репозитория
npm init -y
npm install --save-dev concurrently husky lint-staged

# concurrently — параллельный запуск dev-серверов (backend + frontend)
# husky — git hooks
# lint-staged — lint только staged файлов
```

```json
// package.json (root)
{
  "name": "coder-survival",
  "version": "1.0.0",
  "scripts": {
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "prepare": "husky install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0"
  }
}
```

---

## 2. Pipeline Architecture

### 2.1 Полный цикл от задачи до деплоя

| Этап | Кто | Ветка | Команды / Действия | Выход |
|------|-----|-------|-------------------|-------|
| **1. Идея** | Human (Oleg) | — | Пополняет `KIMI_TASKS_VNEXT.md`, преобразует задачу в `TASK_QUEUE.md` | Запись в планировщике |
| **2. Назначение задачи** | Human / Hermes | — | Hermes назначает агента на задачу в `TASK_QUEUE.md` | `status: assigned` |
| **3. Реализация** | Агент (см. таблицу ролей) | `feat/{agent}/FEAT-XX-desc` | `git worktree add`, кодирование, self-check | Коммиты в feature-ветку |
| **4. Самопроверка** | Агент | Та же | `npm test`, `npm run lint`, `npm run build` | Зелёные чеки |
| **5. Кросс-ревью** | Другой агент | — | Агент-ревьювер проверяет изменения, оставляет notes в `COORDINATION.md` | `status: review` |
| **6. Мерж** | Kimi Desktop / Hermes | `main` | `git checkout main && git pull && git merge --no-ff feat/...` | `main` обновлён |
| **7. Деплой** | GitHub Actions | — | CI/CD pipeline: тесты → сборка → деплой | Сайт обновлён |
| **8. Smoke-тест** | Kimi Desktop + Human | `main` | Проверка `/health`, smoke-скрипты | `status: done` |

### 2.2 Git worktree — изоляция для параллельной работы

```powershell
# PowerShell: создание worktree для Kimi (backend)
git worktree add ..\coder_survival-kimi feat/kimi/FEAT-03-antifraud

# Создание worktree для Kimi Desktop (frontend)
git worktree add ..\coder_survival-desktop feat/desktop/FEAT-01-ux-polish

# Создание worktree для Hermes (docs/architecture)
git worktree add ..\coder_survival-hermes feat/hermes/FEAT-09-analytics

# Каждый агент работает в своём каталоге
# Kimi:     ..\coder_survival-kimi\backend\
# Desktop:  ..\coder_survival-desktop\frontend\
# Hermes:   ..\coder_survival-hermes\.planning\

# Удаление worktree после мержа
git worktree remove ..\coder_survival-kimi
```

**Ключевое правило:** Каждый агент трогает **только свои директории** — см. таблицу владения кодом (секция 4).

### 2.3 Соглашение об именах веток

| Тип | Шаблон | Пример |
|-----|--------|--------|
| Feature (Kimi) | `feat/kimi/FEAT-XX-short-desc` | `feat/kimi/FEAT-03-antifraud` |
| Feature (Desktop) | `feat/desktop/FEAT-XX-short-desc` | `feat/desktop/FEAT-01-ux-polish` |
| Feature (Hermes) | `feat/hermes/FEAT-XX-short-desc` | `feat/hermes/FEAT-09-analytics` |
| Hotfix | `hotfix/FEAT-XX-critical-fix` | `hotfix/FEAT-00-payment-bug` |
| Release | `release/vX.Y.Z` | `release/v1.2.0` |

### 2.4 Staging: Vercel + Yandex Cloud

| Компонент | Staging | Production |
|-----------|---------|------------|
| **Frontend** | Vercel Preview (уже настроен, `vercel.json` в репо) | Vercel Production или S3 + CloudFront |
| **Backend** | Отдельный инстанс на Yandex Cloud VM (`staging.` поддомен) | Основной YC VM (`api.` поддомен) |
| **БД** | Отдельная БД `coder_survival_staging` на том же сервере | `coder_survival_production` |
| **Бот** | Тестовый бот (@coder_survival_test_bot) | @coder_survival_bot |

```yaml
# .github/workflows/deploy-staging.yml (новый файл)
name: Deploy Staging
on:
  push:
    branches: [develop]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging VM
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /var/www/coder_survival
            git pull origin develop
            cd backend && npm ci && npx knex migrate:latest
            pm2 restart coder-staging
```

### 2.5 CI/CD Gates

| Gate | Этап | Что проверяет | Блокирует мерж? |
|------|------|---------------|-----------------|
| **Lint** | PR | ESLint для backend + frontend | Да |
| **Unit Tests** | PR | Все unit-тесты (`npm test -- --testPathIgnorePatterns=integration`) | Да |
| **Integration Tests** | PR | 31 интеграционный тест с PostgreSQL | Да |
| **Build** | PR | `npm run build` (frontend) | Да |
| **Security Scan** | PR | `npm audit` — high/critical | Да |
| **Smoke Test** | Deploy | `/health`, `/api/state`, tap endpoint | Да (откат) |

```yaml
# .github/workflows/full-ci.yml (объединённый)
name: Full CI Pipeline
on:
  pull_request:
    branches: [main, develop]
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: coder_survival_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: cd backend && npm ci
      - run: cd backend && npm run lint
      - run: cd backend && npm test -- --runInBand
      - run: cd frontend && npm ci
      - run: cd frontend && npm run build
      - run: npm audit --audit-level=high
```

### 2.6 Диаграмма pipeline

![Pipeline Architecture](pipeline_architecture.png)

---

## 3. Agent Roles & Ownership

### 3.1 Таблица владения модулями

| Модуль / Директория | Владелец | Второй ревьювер | Тип задач |
|--------------------|----------|----------------|-----------|
| `backend/src/routes/*.js` | Kimi (OpenClaw) | Hermes | API endpoints, CRUD |
| `backend/src/middleware/*.js` | Kimi | Hermes | Auth, rate limiting, validation |
| `backend/migrations/` | **Kimi единолично** | — | Миграции БД — никто другой не трогает |
| `backend/src/config/` | Kimi | Hermes | Конфигурация, env vars |
| `backend/src/jobs/` | Kimi | Hermes | Cron-задачи, background jobs |
| `backend/tests/` | Kimi | — | Все тесты backend |
| `backend/src/utils/` | Kimi | Hermes | Утилиты, хелперы |
| `backend/package.json` | Kimi | — | Зависимости backend |
| `frontend/src/components/*.jsx` | Kimi Desktop | Kimi | UI-компоненты Preact |
| `frontend/src/game/scenes/*.js` | Kimi Desktop | — | Phaser-сцены |
| `frontend/src/hooks/*.js` | Kimi Desktop | Kimi | Custom hooks |
| `frontend/src/assets/` | Kimi Desktop | — | CSS, спрайты, анимации |
| `frontend/src/App.jsx` | Kimi Desktop | Kimi | Корневой компонент |
| `frontend/package.json` | Kimi Desktop | — | Зависимости frontend |
| `bot/` | Kimi | Hermes | Telegram bot (grammy) |
| `.github/workflows/` | Hermes | Kimi | CI/CD конфигурации |
| `AGENTS.md` | Hermes | — | Документация агентов |
| `TASK_QUEUE.md` | Human + Hermes | — | Планировщик |
| `COORDINATION.md` | Все агенты | — | Блокировки, конфликты |
| `nginx/` | Kimi | — | Nginx конфигурация |
| `scripts/*.ps1` | Kimi | — | PowerShell деплой-скрипты |
| `docker-compose.*.yml` | Kimi | — | Docker конфигурации |
| `payments/` | Kimi | Hermes | Payment integration |
| `analytics/` | Kimi + Kimi Desktop | — | Analytics tracking |
| `ads/` | Kimi Desktop | Kimi | Ad SDK integration |

### 3.2 Распределение vNext фич по агентам

| Фича | Приоритет | Назначенный агент | Ветка |
|------|-----------|-------------------|-------|
| UX Polish Pack | High | Kimi Desktop | `feat/desktop/FEAT-01-ux-polish` |
| Career Ladder | High | Kimi Desktop | `feat/desktop/FEAT-04-career` |
| Shop/Referral Shell | Medium | Kimi | `feat/kimi/FEAT-02-shop` |
| Skin Equip Endpoint | High | Kimi | `feat/kimi/FEAT-05-skins` |
| Team Battle Contribution Tracking fix | High | Kimi | `feat/kimi/FEAT-06-team-battle` |
| Ad SDK Integration (rewarded video) | Medium | Kimi Desktop | `feat/desktop/FEAT-07-ads` |
| Cron Jobs (Daily Battle rewards) | Medium | Kimi | `feat/kimi/FEAT-08-cron` |
| Antifraud | **Critical** | Kimi | `feat/kimi/FEAT-03-antifraud` |
| Analytics (Amplitude/кастомные события) | **Critical** | Hermes + Kimi Desktop | `feat/hermes/FEAT-09-analytics` |
| Documentation cleanup | Low | Hermes | `feat/hermes/FEAT-10-docs` |

---

## 4. Coordination Protocol

### 4.1 TASK_QUEUE.md — файловый планировщик

```markdown
<!-- TASK_QUEUE.md — живой документ, правится только Human или Hermes -->
# Task Queue — Coder Survival vNext

## Legend
- Status: `[planned]` → `[assigned]` → `[in-progress]` → `[review]` → `[done]`
- Agent: `Kimi` | `KimiDesktop` | `Hermes`

## Active Tasks

### FEAT-03: Antifraud System
- **Status:** `[in-progress]`
- **Agent:** Kimi (OpenClaw)
- **Branch:** `feat/kimi/FEAT-03-antifraud`
- **Worktree:** `..\coder_survival-kimi`
- **Deadline:** 2026-06-10
- **Depends on:** —
- **Blocks:** FEAT-08 (Cron Jobs)
- **Description:** Rate limiting, initData validation, anomaly detection
- **Files touched:** `backend/src/middleware/antifraud.js`, `backend/src/middleware/rateLimit.js`, `backend/src/config/security.js`
- **Last update:** 2026-06-03 — структура middleware создана

### FEAT-01: UX Polish Pack
- **Status:** `[assigned]`
- **Agent:** Kimi Desktop
- **Branch:** `feat/desktop/FEAT-01-ux-polish`
- **Worktree:** `..\coder_survival-desktop`
- **Deadline:** 2026-06-08
- **Depends on:** —
- **Blocks:** —
- **Description:** Splash, HUD улучшение, tap feedback, progress display
- **Files touched:** `frontend/src/components/`, `frontend/src/game/scenes/GameScene.js`, `frontend/src/hooks/useGameState.js`
- **Last update:** 2026-06-03 — назначен агенту

### FEAT-09: Analytics Integration
- **Status:** `[planned]`
- **Agent:** Hermes
- **Branch:** `feat/hermes/FEAT-09-analytics`
- **Worktree:** `..\coder_survival-hermes`
- **Deadline:** 2026-06-12
- **Depends on:** FEAT-03 (Antifraud — для rate limiting на analytics endpoints)
- **Blocks:** —
- **Description:** Amplitude SDK, кастомные события, tracking plan
- **Files touched:** `analytics/`, `frontend/src/utils/analytics.js`, `backend/src/routes/analytics.js`
- **Last update:** 2026-06-03 — ждёт завершения FEAT-03

## Completed Tasks
*None yet in this cycle*

## Archive
<!-- Переносится в CHANGELOG.md после релиза -->
```

### 4.2 COORDINATION.md — протокол конфликтов и блокировок

```markdown
<!-- COORDINATION.md — все агенты читают перед началом работы -->
# Coordination Log — Coder Survival

## Current Blocks

### BLOCK-001: featureFlags захардкожены в tap.js
- **Discovered:** 2026-05-13 (из CONFLICT_MATRIX.md C-002)
- **Severity:** P0 — блокирует монетизацию
- **Affected agents:** Kimi (backend), Kimi Desktop (frontend)
- **Root cause:** `tap.js:192` — `featureFlags: {}` всегда пустой
- **Resolution plan:** Kimi в рамках FEAT-03 добавит конфигурацию фича-флагов через БД
- **ETA:** 2026-06-05
- **Status:** `in-progress` (Kimi)

### BLOCK-002: Codex instability
- **Discovered:** 2026-06-01
- **Severity:** P1 — блокирует координацию
- **Affected agents:** All
- **Root cause:** Codex (ChatGPT 5.5 GUI) нестабилен
- **Resolution plan:** Human выполняет мерж через Kimi Desktop или Hermes
- **ETA:** Постоянное решение — перейти на Kimi Desktop как primary мержер
- **Status:** `resolved-workaround`

## Conflict Resolution Protocol
1. Агент обнаруживает конфликт → записывает в `COORDINATION.md`
2. Если конфликт в файлах: агент с правом владения (см. секцию 4) имеет приоритет
3. Если конфликт в архитектуре: Hermes принимает решение, Human подтверждает
4. Если блокер > P1: все агенты переключаются на разблокировку
5. Escalation: Human принимает финальное решение при споре агентов

## Communication Rules
- Агенты НЕ имеют API друг к другу
- Единственный канал: git + markdown файлы
- Каждый агент делает `git pull origin main` перед началом работы
- Каждый агент делает `git pull origin main` перед push'ем
- Commit в `TASK_QUEUE.md` или `COORDINATION.md` = broadcast всем агентам
```

### 4.3 Git-flow: branch-per-agent с feature branches

```
main (protected) ← только PR, только после review
  │
  ├── feat/kimi/FEAT-XX-*    (Kimi's worktrees)
  ├── feat/desktop/FEAT-XX-* (Kimi Desktop's worktrees)
  ├── feat/hermes/FEAT-XX-*  (Hermes's worktrees)
  └── develop (staging branch) ← интеграция перед main
```

**Правила синхронизации общих модулей (API-контракты):**

1. **Kimi** создаёт/изменяет API endpoint → обновляет `backend/src/routes/` + добавляет JSDoc
2. **Hermes** генерирует OpenAPI-спеку из JSDoc → сохраняет в `docs/openapi.yml`
3. **Kimi Desktop** читает `docs/openapi.yml` для понимания контрактов
4. Любое изменение API требует обновления `docs/openapi.yml` + записи в `COORDINATION.md`

### 4.4 Conventions

**Conventional Commits:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

| Тип | Когда | Пример |
|-----|-------|--------|
| `feat` | Новая фича | `feat(antifraud): add rate limiting middleware` |
| `fix` | Исправление бага | `fix(tap): correct featureFlags read from config` |
| `test` | Тесты | `test(api): add integration tests for /buy endpoint` |
| `docs` | Документация | `docs(agents): update TASK_QUEUE for FEAT-03` |
| `refactor` | Рефакторинг | `refactor(middleware): extract auth to separate module` |
| `chore` | Рутина | `chore(deps): update express to 4.19` |

**Scope:** `antifraud`, `analytics`, `shop`, `ui`, `game`, `bot`, `deploy`, `docs`

**PR-шаблон:** Создать `.github/pull_request_template.md`:

```markdown
## What
<!-- Описание изменений -->

## Agent
<!-- Какой агент выполнил работу -->
- [ ] Kimi (OpenClaw)
- [ ] Kimi Desktop
- [ ] Hermes

## Tests
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build successful

## Files changed
<!-- Список изменённых файлов -->

## Related
<!-- Ссылки на TASK_QUEUE.md, CONFLICT_MATRIX.md -->
```

**Кросс-ревью матрица:**

| Агент пишет код | Ревьювер |
|----------------|----------|
| Kimi | Hermes |
| Kimi Desktop | Kimi |
| Hermes | Kimi Desktop |

---

## 5. Skills & Tools to Install

### 5.1 OpenClaw skills с ClawHub

| Skill | Установка | Назначение | Уверенность |
|-------|-----------|-----------|-------------|
| `github` | `clawhub install github` | Управление issues, PRs, CI через gh CLI | Доступен, 24.8K загрузок |
| `n8n-workflow` | `clawhub install n8n-workflow` | Автоматизация cron-задач, уведомления | Доступен |
| `agent-autopilot` | `clawhub install agent-autopilot` | Автономное выполнение задач по расписанию | Доступен, популярен |
| `clawdbot` | `clawhub install clawdbot` | Security audit перед установкой скиллов | Рекомендуется |
| `mcporter` | `clawhub install mcporter` | Управление MCP-серверами | Доступен, 11.1K |
| **gamedev-phaser** | Кастомный | Специфичные паттерны для Phaser 3.60 | **Создать** |
| **telegram-mini-app** | Кастомный | Паттерны для Telegram WebApp SDK | **Создать** |

**Кастомные скиллы для создания:**

```markdown
<!-- ~/.claw/skills/gamedev-phaser/SKILL.md -->
---
name: gamedev-phaser
description: Patterns for Phaser 3.60 game development in Coder Survival
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: [node, npm]
---

# Phaser 3.60 Patterns for Coder Survival

## Scene Lifecycle
1. preload() → load assets
2. create() → initialize game objects
3. update() → game loop

## Tap Feedback Patterns
- Use tweens for visual feedback
- Haptic feedback via Telegram WebApp SDK
- Particle effects for tap burst

## Performance Rules
- Max 100 particles per effect
- Pool reusable game objects
- Use object pooling for bullets/taps

## Anti-patterns
- Don't create new objects in update()
- Don't use setInterval, use scene.time
```

### 5.2 MCP-мост между Kimi Desktop / Hermes и OpenClaw Runtime

**Проблема:** Kimi Desktop и Hermes не имеют прямого API к OpenClaw Runtime (Kimi).

**Решение: Файловый триггер через OpenClaw Gateway Watch**

```javascript
// scripts/mcp-bridge.js — запускается Kimi (OpenClaw)
const chokidar = require('chokidar');
const { execSync } = require('child_process');

// Watch для TASK_QUEUE.md и COORDINATION.md
const watcher = chokidar.watch([
  '../TASK_QUEUE.md',
  '../COORDINATION.md'
], {
  persistent: true,
  ignoreInitial: true
});

watcher.on('change', (path) => {
  console.log(`[MCP Bridge] ${path} changed, pulling updates...`);
  try {
    execSync('git pull origin main', { cwd: '..' });
    // Уведомление через OpenClaw Gateway
    // Kimi получает уведомление и может начать работу
  } catch (e) {
    console.error('[MCP Bridge] Git pull failed:', e.message);
  }
});

console.log('[MCP Bridge] Watching for coordination file changes...');
```

**Установка:**
```powershell
# Установить chokidar (если ещё не установлен)
cd backend
npm install --save-dev chokidar

# Запуск моста
node scripts/mcp-bridge.js
```

**Поток:**
1. Kimi Desktop меняет `TASK_QUEUE.md` → commit → push
2. OpenClaw Gateway Watch обнаруживает изменение
3. Kimi (OpenClaw) получает уведомление и начинает работу
4. Обратный поток: Kimi пушит результаты → Kimi Desktop/Hermes видит через `git pull`

### 5.3 Дополнительные MCP-серверы

| MCP-сервер | Установка | Зачем |
|-----------|-----------|-------|
| **PostgreSQL MCP** | Через `mcporter` | Прямой SQL-запросы из агента |
| **GitHub MCP** | Через `mcporter` | Issues, PRs из CLI агента |
| **File System MCP** | Встроен в OpenClaw | Чтение/запись файлов |

---

## 6. Risk Mitigation

### 6.1 Конфигурация git hooks

```javascript
// .husky/pre-commit (создаётся через husky)
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "[pre-commit] Running lint-staged..."
npx lint-staged

echo "[pre-commit] Running backend unit tests..."
cd backend && npm test -- --testPathIgnorePatterns=integration --passWithNoTests

echo "[pre-commit] Checking for merge conflicts..."
if grep -r "<<<<<<< HEAD" . --include="*.js" --include="*.jsx" --include="*.md"; then
  echo "ERROR: Merge conflicts found!"
  exit 1
fi

echo "[pre-commit] All checks passed!"
```

```json
// package.json (root)
{
  "lint-staged": {
    "backend/**/*.js": ["eslint --fix", "git add"],
    "frontend/**/*.{js,jsx}": ["eslint --fix", "git add"],
    "*.md": ["prettier --write", "git add"]
  }
}
```

### 6.2 Pre-push hook (защита от race conditions)

```bash
# .husky/pre-push
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "[pre-push] Checking for conflicts with origin/main..."
git fetch origin main

# Проверка на несовместимые изменения
if git merge-tree $(git merge-base HEAD origin/main) origin/main HEAD | grep -q "changed in both"; then
  echo "WARNING: Potential merge conflicts detected. Pull latest main first."
  echo "Run: git pull origin main --rebase"
  exit 1
fi

echo "[pre-push] Running full test suite..."
cd backend && npm test -- --runInBand
if [ $? -ne 0 ]; then
  echo "ERROR: Tests failed! Fix before pushing."
  exit 1
fi

echo "[pre-push] All checks passed!"
```

### 6.3 GitHub Branch Protection (обязательные настройки)

| Правило | Настройка | Зачем |
|---------|-----------|-------|
| **Require pull request** | ✅ Enabled | Запрет прямых пушей в `main` |
| **Required approvals** | 1 | Минимум 1 ревью (агент или человек) |
| **Dismiss stale reviews** | ✅ Enabled | Новый комит = новое ревью |
| **Require status checks** | ✅ `Backend Tests`, `Frontend Build`, `Security Scan` | CI блокирует мерж при падении |
| **Require branches up to date** | ✅ Enabled | Force rebase перед мержем |
| **Restrict pushes** | Only Kimi Desktop / Hermes accounts | Только designated агенты могут мержить |
| **Block force pushes** | ✅ Enabled | Защита истории |

```yaml
# .github/settings.yml (для probot/settings)
branches:
  - name: main
    protection:
      required_pull_request_reviews:
        required_approving_review_count: 1
        dismiss_stale_reviews: true
      required_status_checks:
        strict: true
        contexts:
          - "Backend Tests"
          - "Frontend Build"
          - "Security Scan"
      enforce_admins: false
      restrictions:
        users: [timoshinoleg-eng]
```

### 6.4 Единый реестр миграций

```
backend/migrations/
├── 001_create_users.sql
├── 002_create_game_state.sql
├── 003_create_purchases.sql
├── ...
└── 023_add_social_state.sql  # последняя
```

**Правила:**
- **Только Kimi** создаёт миграции
- Нумерация строго последовательная
- Каждая миграция имеет `up` и `down`
- Перед созданием: `git pull origin main` чтобы узнать последний номер
- Никогда не редактировать существующие миграции — только новые

### 6.5 OpenAPI-контракты

```yaml
# docs/openapi.yml (генерируется Hermes, используется всеми)
openapi: 3.0.0
info:
  title: Coder Survival API
  version: 1.0.0
paths:
  /api/tap:
    post:
      summary: Process tap
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                userId: { type: string }
                timestamp: { type: integer }
      responses:
        200:
          description: Tap processed
          content:
            application/json:
              schema:
                type: object
                properties:
                  lines: { type: integer }
                  energy: { type: number }
                  depression: { type: number }
```

**Валидация на CI:**
```yaml
# Добавить в GitHub Actions
- name: Validate OpenAPI spec
  run: npx swagger-cli validate docs/openapi.yml
```

---

## 7. Technical Roadmap

### 7.1 Три волны

```mermaid
gantt
    title Coder Survival vNext Roadmap
    dateFormat  YYYY-MM-DD
    section Wave 1 (Must-Have)
    CI/CD Pipeline       :a1, 2026-06-03, 3d
    Antifraud            :a2, after a1, 4d
    Analytics (Amplitude):a3, after a2, 3d
    Docker-less Tests    :a4, 2026-06-03, 2d
    
    section Wave 2 (Core Gameplay)
    UX Polish            :b1, after a3, 5d
    Career Ladder        :b2, after b1, 4d
    Skin Equip           :b3, after b1, 3d
    Team Battle Fix      :b4, after a3, 3d
    
    section Wave 3 (Growth)
    Ad SDK (Monetag)     :c1, after b2, 4d
    Shop/Referral Shell  :c2, after b2, 3d
    Cron Jobs            :c3, after c2, 2d
    Documentation        :c4, after c3, 2d
```

### 7.2 Обоснование порядка

**Волна 1 (Must-Have):** Без антифрода любая монетизация уязвима к накрутке. Без аналитики невозможно измерить эффект от последующих фич. Без CI/CD каждый деплой — ручная операция с риском ошибки. Эти три задачи — фундамент, без которого строить дальше нет смысла.

**Волна 2 (Core Gameplay):** UX Polish и Career Ladder увеличивают retention — но это важно только если есть метрики (Волна 1) для измерения эффекта. Skin Equip зависит от Shop Shell (Волна 3), но может быть реализован как endpoint раньше. Team Battle Fix — критичный баг, но не блокирует остальное.

**Волна 3 (Growth):** Ad SDK и Shop/Referral Shell приносят деньги — но только если в Волне 1 настроена аналитика для отслеживания ARPPU и конверсий. Cron Jobs зависят от антифрода (Волна 1), чтобы награды не накручивались.

### 7.3 Зависимости между фичами

| Фича | Зависит от | Блокирует |
|------|-----------|-----------|
| Analytics | Antifraud | — |
| Ad SDK | Analytics | — |
| Shop/Referral Shell | Analytics | — |
| Cron Jobs | Antifraud | — |
| Career Ladder | UX Polish | — |
| Skin Equip | Shop Shell | — |

---

## 8. Monetization, Analytics & Security

### 8.1 Ad SDK — выбор и интеграция

**Выбор: Monetag** для международного рынка + **Yandex Ads** для РФ.

| Параметр | Monetag | Yandex Ads |
|----------|---------|------------|
| SDK | `monetag-tg-sdk` (npm) | Yandex Mobile Ads SDK |
| Форматы | Rewarded Interstitial, Rewarded Pop, In-App Interstitial | Rewarded video |
| Интеграция | `<script>` или `npm install monetag-tg-sdk` | Нативный JS SDK |
| CPM | $3–6 | ₽100–300 |
| Минималка | Низкая | Средняя |
| Telegram Mini App | ✅ Нативная поддержка | ⚠️ Через WebView |

**Интеграция Monetag:**
```javascript
// frontend/src/utils/ads.js
import createAdHandler from 'monetag-tg-sdk';

const REWARDED_ZONE_ID = 'YOUR_REWARDED_ZONE_ID';

export const showRewardedAd = async () => {
  try {
    const adHandler = createAdHandler(REWARDED_ZONE_ID);
    await adHandler();
    // Пользователь досмотрел рекламу → начисляем награду
    return { success: true };
  } catch (error) {
    console.error('Ad failed:', error);
    return { success: false, error: error.message };
  }
};

// Использование в Preact-компоненте
import { showRewardedAd } from '../utils/ads';

const handleWatchAd = async () => {
  const result = await showRewardedAd();
  if (result.success) {
    // Вызвать backend endpoint для начисления награды
    await api.post('/api/rewards/ad-watch', { type: 'energy_refill' });
  }
};
```

### 8.2 Analytics — обязательные события

**Установка Amplitude:**
```bash
cd frontend
npm install @amplitude/analytics-browser
```

```javascript
// frontend/src/utils/analytics.js
import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_KEY;

export const initAnalytics = () => {
  amplitude.init(AMPLITUDE_API_KEY, {
    defaultTracking: {
      sessions: true,
      pageViews: true,
      formInteractions: true,
    },
  });
};

export const trackEvent = (eventName, properties = {}) => {
  amplitude.track(eventName, properties);
};

// 10+ обязательных событий
export const Events = {
  SESSION_START: 'session_start',
  TAP: 'tap',
  LEVEL_UP: 'level_up',
  PURCHASE_STARTED: 'purchase_started',
  PURCHASE_COMPLETED: 'purchase_completed',
  AD_WATCHED: 'ad_watched',
  BATTLE_JOINED: 'battle_joined',
  REFERRAL_USED: 'referral_used',
  SKIN_EQUIPPED: 'skin_equipped',
  STRESS_OFFER_SHOWN: 'stress_offer_shown',
  STRESS_OFFER_ACCEPTED: 'stress_offer_accepted',
  DAILY_REWARD_CLAIMED: 'daily_reward_claimed',
  LEADERBOARD_VIEWED: 'leaderboard_viewed',
  MINIGAME_COMPLETED: 'minigame_completed',
};
```

### 8.3 Метрики — дашборд

| Метрика | Формула | Цель (30 дней) |
|---------|---------|----------------|
| DAU | Уникальные пользователей / день | 500+ |
| Retention D1 | Вернулись на день 2 / Установки | 40%+ |
| Retention D7 | Вернулись на день 8 / Установки | 15%+ |
| Retention D30 | Вернулись на день 31 / Установки | 5%+ |
| ARPPU | Выручка / Платящие пользователи | $2+ |
| Средняя сессия | Общее время / Кол-во сессий | 3+ мин |
| Конверсия в оплату | Платежи / Уникальные пользователи | 2%+ |
| CTR рекламы | Клики по рекламе / Показы | 5%+ |

### 8.4 Rate limiting на Express

```javascript
// backend/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

// Общий лимит: 100 запросов / 15 минут
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// Строгий лимит для auth: 5 попыток / 15 минут
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts' }
});

// Лимит для tap: 60 taps / минуту
export const tapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.body.userId || req.ip,
  message: { error: 'Tap rate limit exceeded' }
});

// Применение в app.js
app.use(generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/tap', tapLimiter);
```

```bash
npm install express-rate-limit
```

### 8.5 Валидация initData Telegram

```javascript
// backend/src/middleware/telegramAuth.js
import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;

export const validateTelegramInitData = (req, res, next) => {
  const initData = req.headers['x-telegram-init-data'];
  
  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram init data' });
  }
  
  // Парсинг initData
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  // Сортировка и создание data_check_string
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // Вычисление HMAC
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  if (computedHash !== hash) {
    return res.status(401).json({ error: 'Invalid Telegram init data' });
  }
  
  // Проверка срока действия (24 часа)
  const authDate = parseInt(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) {
    return res.status(401).json({ error: 'Init data expired' });
  }
  
  req.telegramUser = JSON.parse(params.get('user'));
  next();
};
```

### 8.6 CORS — строго под домен бота

```javascript
// backend/src/middleware/cors.js
import cors from 'cors';

const allowedOrigins = [
  'https://t.me',           // Telegram WebView
  'https://*.telegram.org', // Telegram CDN
  'https://your-domain.com', // Production domain
  'http://localhost:5173',   // Vite dev server
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace('*', '.*'));
        return regex.test(origin);
      }
      return allowed === origin;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  credentials: true
});
```

### 8.7 Ротация секретов

| Секрет | Где хранится | Ротация |
|--------|-------------|---------|
| BOT_TOKEN | GitHub Environment Secret | При компрометации |
| DATABASE_URL | GitHub Environment Secret | Квартально |
| SSH_KEY | GitHub Secret | Квартально |
| AMPLITUDE_API_KEY | GitHub Environment + frontend env | При компрометации |
| Monetag ZONE_ID | GitHub Environment + frontend env | При компрометации |

### 8.8 Бэкапы БД и откат

```bash
# scripts/backup-db.ps1
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_${timestamp}.sql"

# pg_dump через SSH на Yandex Cloud VM
ssh $env:PROD_USER@$env:PROD_HOST "pg_dump -U postgres coder_survival > /tmp/${backupFile}"
scp "${env:PROD_USER}@${env:PROD_HOST}:/tmp/${backupFile}" "backups/"

# Хранение последних 30 бэкапов
Get-ChildItem "backups/" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item
```

**Cron на VM (daily at 3 AM):**
```bash
0 3 * * * /var/www/coder_survival/scripts/backup-db.sh
```

**Откат через PM2 + Docker image tags:**
```bash
# Быстрый откат к предыдущей версии
pm2 save
pm2 reload coder-survival --update-env
# Или через git
cd /var/www/coder_survival && git revert HEAD && pm2 reload all
```

---

## 9. Action Plan — Первые 7 дней

### Day 1 (June 3) — Фундамент

| Время | Кто | Действие | Инструмент | Файлы |
|-------|-----|----------|-----------|-------|
| 09:00 | Human | Создать `TASK_QUEUE.md` и `COORDINATION.md` в корне | VS Code | Новые файлы |
| 09:30 | Human | Установить root devDependencies | PowerShell | `package.json` |
| 10:00 | Human | Настроить husky + lint-staged | PowerShell | `.husky/`, `package.json` |
| 10:30 | Kimi | Проверить PostgreSQL локально, запустить 31 интеграционный тест | PowerShell, psql | `backend/tests/` |
| 11:00 | Hermes | Сгенерировать OpenAPI-спеку из текущих routes | VS Code | `docs/openapi.yml` |
| 12:00 | Kimi Desktop | Создать `feat/desktop/FEAT-01-ux-polish` ветку и worktree | PowerShell | `..\coder_survival-desktop` |
| 13:00 | Kimi | Создать `feat/kimi/FEAT-03-antifraud` ветку и worktree | PowerShell | `..\coder_survival-kimi` |
| 14:00 | Human | Настроить GitHub Branch Protection для `main` | GitHub Web | Settings → Branches |
| 15:00 | Human | Добавить GitHub Secrets (BOT_TOKEN, DATABASE_URL, SSH_KEY) | GitHub Web | Settings → Secrets |
| 16:00 | Hermes | Обновить `AGENTS.md` с новыми ролями | VS Code | `AGENTS.md` |
| 17:00 | Kimi | Начать FEAT-03: rate limiting middleware | OpenClaw | `backend/src/middleware/` |

### Day 2 (June 4) — CI/CD + Antifraud

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Hermes | Создать `.github/workflows/full-ci.yml` | VS Code |
| 10:00 | Kimi | Продолжить FEAT-03: initData validation | OpenClaw |
| 11:00 | Kimi Desktop | Начать FEAT-01: splash screen | Kimi Desktop GUI |
| 12:00 | Human | Проверить CI pipeline на тестовом PR | GitHub Actions |
| 14:00 | Kimi | Добавить helmet + CORS middleware | OpenClaw |
| 15:00 | Hermes | Ревью кода FEAT-03 | VS Code |
| 16:00 | Kimi Desktop | Self-check: `npm run build` | PowerShell |
| 17:00 | Kimi | Self-check: `npm test -- --runInBand` | PowerShell |

### Day 3 (June 5) — Analytics + Интеграция

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Hermes | Начать FEAT-09: Amplitude integration | ChatGPT 5.5 |
| 10:00 | Kimi | Завершить FEAT-03, создать PR | PowerShell, Git |
| 11:00 | Kimi Desktop | Завершить FEAT-01, создать PR | Kimi Desktop |
| 12:00 | Human | Кросс-ревью обоих PR | VS Code |
| 14:00 | Hermes | Ревью PR FEAT-03 и FEAT-01 | VS Code |
| 15:00 | Kimi Desktop | Мерж FEAT-03 в `main` (если CI проходит) | PowerShell |
| 16:00 | Hermes | Обновить `docs/openapi.yml` после мержа | VS Code |
| 17:00 | Kimi | Начать FEAT-09: backend endpoints для analytics | OpenClaw |

### Day 4 (June 6) — Деплой + Smoke Test

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Kimi | Настроить PM2 ecosystem на production VM | SSH, PowerShell |
| 10:00 | Kimi Desktop | Задеплоить frontend на Vercel | Vercel CLI |
| 11:00 | Kimi | Деплой backend через GitHub Actions | GitHub Actions |
| 12:00 | Human | Smoke test: `/health`, `/api/state`, tap | Telegram, Browser |
| 14:00 | Kimi | Начать FEAT-08: Cron jobs для Daily Battle | OpenClaw |
| 15:00 | Kimi Desktop | Начать FEAT-04: Career Ladder UI | Kimi Desktop GUI |
| 16:00 | Hermes | Создать `docs/tracking-plan.md` — список analytics событий | VS Code |
| 17:00 | Human | Обновить `TASK_QUEUE.md` — отметить завершённые задачи | VS Code |

### Day 5 (June 7) — Ad SDK + Shop Shell

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Kimi Desktop | Начать FEAT-07: Monetag SDK integration | Kimi Desktop GUI |
| 10:00 | Kimi | Начать FEAT-02: Shop/Referral Shell backend | OpenClaw |
| 12:00 | Kimi Desktop | Интегрировать Amplitude SDK в frontend | Kimi Desktop GUI |
| 14:00 | Hermes | Ревью Shop Shell API design | VS Code |
| 15:00 | Kimi | Добавить antifraud checks для shop endpoints | OpenClaw |
| 16:00 | Kimi Desktop | Реализовать rewarded video flow | Kimi Desktop GUI |
| 17:00 | Human | Smoke test рекламы + проверка начисления награды | Telegram |

### Day 6 (June 8) — Рефакторинг + Тесты

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Kimi | Написать интеграционные тесты для shop endpoints | OpenClaw |
| 10:00 | Kimi Desktop | Написать unit-тесты для новых компонентов | Kimi Desktop GUI |
| 12:00 | Hermes | Full code review всех open PRs | VS Code |
| 14:00 | Kimi | Завершить FEAT-08: Cron jobs | OpenClaw |
| 15:00 | Kimi Desktop | Завершить FEAT-04: Career Ladder | Kimi Desktop GUI |
| 16:00 | Human | Финальный мерж всех готовых PRs | PowerShell |
| 17:00 | Kimi | Production deploy с PM2 zero-downtime | SSH, PowerShell |

### Day 7 (June 9) — Мониторинг + Документация

| Время | Кто | Действие | Инструмент |
|-------|-----|----------|-----------|
| 09:00 | Hermes | Написать `docs/deployment-guide.md` | VS Code |
| 10:00 | Kimi | Настроить `pm2-logrotate` для production логов | SSH |
| 11:00 | Kimi Desktop | Проверить Amplitude events в real-time | Amplitude Dashboard |
| 12:00 | Human | Проверить метрики: DAU, Retention (Amplitude) | Amplitude Dashboard |
| 14:00 | Kimi | Настроить `npm audit` в CI pipeline | GitHub Actions |
| 15:00 | Hermes | Обновить `AGENTS.md` с итогами недели | VS Code |
| 16:00 | Human | Обновить `ROADMAP.md` — перенести завершённые задачи | VS Code |
| 17:00 | Все | Планирование недели 2 — обновление `TASK_QUEUE.md` | — |

### 9.1 Конфигурационные файлы — priority checklist

| Приоритет | Файл | Создатель | Зачем |
|-----------|------|-----------|-------|
| P0 | `TASK_QUEUE.md` | Human | Единый планировщик |
| P0 | `COORDINATION.md` | Human | Протокол конфликтов |
| P0 | `.github/workflows/full-ci.yml` | Hermes | Объединённый CI/CD |
| P0 | `.husky/pre-commit` | Human | Pre-commit hooks |
| P0 | `.husky/pre-push` | Human | Pre-push hooks |
| P1 | `docs/openapi.yml` | Hermes | API-контракты |
| P1 | `backend/src/middleware/rateLimit.js` | Kimi | Rate limiting |
| P1 | `backend/src/middleware/telegramAuth.js` | Kimi | InitData validation |
| P1 | `frontend/src/utils/analytics.js` | Kimi Desktop | Amplitude SDK |
| P2 | `docs/tracking-plan.md` | Hermes | Analytics events |
| P2 | `scripts/mcp-bridge.js` | Kimi | MCP-файловый мост |
| P2 | `backend/ecosystem.config.js` | Kimi | PM2 production config |

---

## Приложение A: PM2 Ecosystem Config

```javascript
// backend/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'coder-survival',
    script: './src/index.js',
    cwd: '/var/www/coder_survival/backend',
    instances: 1, // или 'max' для cluster mode
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '512M',
    autorestart: true,
    kill_timeout: 5000,
    listen_timeout: 3000,
    // Zero-downtime reload
    wait_ready: true,
    listen_timeout: 10000,
    // Health check
    health_check_grace_period: 30000
  }],
  
  deploy: {
    production: {
      user: 'deploy',
      host: process.env.PROD_HOST,
      ref: 'origin/main',
      repo: 'https://github.com/timoshinoleg-eng/coder_survival.git',
      path: '/var/www/coder_survival',
      'post-deploy': 'cd backend && npm ci && npx knex migrate:latest && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
```

---

## Приложение B: Пример TASK_QUEUE.md для старта

```markdown
# Task Queue — Coder Survival vNext
## Cycle: 2026-06-03 — 2026-06-09 (Week 1)

### FEAT-03: Antifraud [IN-PROGRESS]
- Agent: Kimi (OpenClaw)
- Branch: feat/kimi/FEAT-03-antifraud
- Deadline: 2026-06-05
- Files: backend/src/middleware/rateLimit.js, backend/src/middleware/telegramAuth.js
- Status: Rate limiting готово, initData validation в процессе

### FEAT-01: UX Polish [ASSIGNED]
- Agent: Kimi Desktop
- Branch: feat/desktop/FEAT-01-ux-polish
- Deadline: 2026-06-07
- Files: frontend/src/components/, frontend/src/game/scenes/
- Status: Назначен, ожидает начала

### FEAT-09: Analytics [PLANNED]
- Agent: Hermes
- Branch: feat/hermes/FEAT-09-analytics
- Deadline: 2026-06-09
- Depends: FEAT-03
- Files: analytics/, frontend/src/utils/analytics.js
- Status: Заблокирован FEAT-03
```
