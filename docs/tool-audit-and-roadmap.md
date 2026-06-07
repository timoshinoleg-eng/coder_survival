# Оптимизация Production Pipeline для "Coder Survival"

## 1. Executive Summary

Проект **Coder Survival** находится на критическом переходе от MVP к полноценной монетизируемой игре. Текущий процесс разработки — ручное копирование задач между тремя независимыми агентами через ChatGPT 5.5 (Гермес) — создаёт **координационный bottleneck**, который будет экспоненциально тормозить рост по мере усложнения кодовой базы. Анализ показывает, что основные риски сосредоточены не в технологическом стеке (он проверен и работает), а в **отсутствии процессов**: нет разделения владения файлами, нет автоматического code review, нет staging-окружения, интеграционные тесты пропускаются.

**Три главных изменения, которые нужно внедрить в первую очередь:**

**Git worktrees + branch-per-feature** — единственный реалистичный способ параллельной работы трёх агентов без конфликтов. Вместо того чтобы все агенты редактировали файлы в одной директории, каждый агент получает изолированный worktree со своей веткой. Это устраняет race conditions при редактировании и делает контекст переключения мгновенным — без `git stash`, без потери состояния IDE. [^33^][^109^]

**CODEOWNERS + branch protection + CI gates** — три слоя защиты, которые автоматически направляют PR нужным агентам на review и блокируют merge, если тесты не прошли. Файл `.github/CODEOWNERS` разделит backend (`/backend/`), frontend (`/frontend/`), бота (`/bot/`) и документацию между агентами, а branch protection на `main` потребует хотя бы один approving review перед merge. [^86^][^101^]

**Docker Engine в WSL2 вместо Docker Desktop** — позволит запускать PostgreSQL-контейнер локально для интеграционных тестов без установки Docker Desktop (который пользователь не хочет или не может ставить). Это разблокирует 31 пропускаемый тест и даст уверенность перед deploy. [^73^]

Приоритет фич для ближайшего релиза: **UX Polish (onboarding)** и **Career Ladder** — обе напрямую влияют на D1/D7 retention, который для Telegram Mini Apps в среднем составляет **15–20% на Day 1** и **8–10% на Day 7**. [^129^] Улучшенный onboarding может поднять эти цифры на **30–50%** за счёт сокращения time-to-value. [^44^]

---

## 2. Tool Audit: Что оставить, что удалить, что добавить

### 2.1 Анализ текущего набора инструментов

Проект располагает восемью основными инструментами для разработки и координации. Ниже — систематический аудит с рекомендациями по каждому.

| Инструмент | Текущая роль | Частота использования | Дублирование | Рекомендация | Обоснование |
|---|---|---|---|---|---|
| **Kimi (OpenClaw runtime)** | Основной агент: ФС, Git, CLI, subagents | Ежедневно | — | **Оставить как primary** | Единственный агент с доступом к ФС и Git. Subagents через `sessions_spawn` дают параллелизм. 24/7 доступ. [^48^] |
| **Kimi Desktop** | GUI-версия, параллельный доступ к папке | Ежедневно | Дублирует Kimi runtime | **Перевести в роль "frontend specialist"** | Нет API для связи с агентом #1. Использовать только для frontend-компонентов (UX Polish, скины), не трогать backend. |
| **Гермес (ChatGPT 5.5)** | Связующее звено, пишет промпты для других | Ежедневно | Создаёт bottleneck | **Перевести в роль "architect / planner"** | Ручное копирование промптов — главный источник задержек. Использовать для архитектурных решений и планирования, не для рутинной передачи задач. |
| **OpenCode** | CLI AI-ассистент, PTY-режим | Редко | Kimi CLI + Codex дублируют | **Удалить** | Не даёт уникальных возможностей по сравнению с Kimi CLI. Лишний инструмент = лишний выбор = friction. |
| **Kimi CLI** | Coding agent через терминал | По запросу | Частично дублирует OpenClaw runtime | **Интегрировать с OpenClaw** | Тот же агент, но другой интерфейс. Использовать как fallback, если OpenClaw runtime недоступен. |
| **Codex (OpenAI)** | GUI, git-based, `--full-auto` | Иногда | Kimi + Claude дублируют | **Оставить для GitHub PR review** | Уникальная интеграция с GitHub (`@Codex` tag на PR). Использовать для automated PR review. [^48^] |
| **Claude Code** | Архитектурное ревью, сложная логика | По запросу | — | **Оставить для критичных рефакторингов** | 87.6% SWE-bench — лучший показатель для сложных многофайловых рефакторингов. [^48^] Дорогой, но оправдан для критичных задач. |
| **OpenClaw Gateway** | Локальный сервер, скиллы, cron | Постоянно | — | **Расширить: добавить task scheduler** | Центральная точка управления. Добавить cron для auto-rewards Daily Battle и авто-апдейта документации. |
| **Kimi WebBridge** | Реальный браузер, скриншоты | Для отладки | — | **Оставить** | Незаменим для тестирования Telegram Mini App в реальном WebView. |

### 2.2 Оптимальное распределение задач по инструментам

| Тип задачи | Рекомендуемый инструмент | Почему именно он |
|---|---|---|
| Backend endpoint (Express + PostgreSQL) | Kimi (OpenClaw) + subagents | Доступ к БД, миграциям, тестам. Может породить до 8 параллельных subagents для разных эндпоинтов. |
| Frontend компонент (Preact + Phaser) | Kimi Desktop | GUI-режим удобен для визуальных компонентов. Можно параллельно с основным агентом. |
| Рефакторинг сложной логики | Claude Code | 87.6% SWE-bench, 1M токенов контекста — лучший для многофайловых изменений. [^48^] |
| Архитектурное решение | Гермес (ChatGPT 5.5) | Сильный в системном мышлении. Писать ADR (Architecture Decision Records) и планы имплементации. |
| Code review на PR | Codex CLI (`@Codex` tag) | Нативная интеграция с GitHub. Автоматический review перед мержем. [^48^] |
| Bugfix / hotfix | Kimi (OpenClaw) | Быстрый доступ к production VM через SSH, логам, БД. |
| Документация, планы | OpenClaw Gateway + автоматизация | Генерация отчётов, авто-апдейт CHANGELOG, обновление AGENTS.md. |

### 2.3 Docker Engine в WSL2: решение для интеграционных тестов

Отсутствие Docker Desktop блокирует запуск 31 интеграционного теста. Альтернатива — установить **Docker Engine прямо в WSL2 Ubuntu** без Docker Desktop GUI. [^73^]

```powershell
# В PowerShell (администратор)
wsl --update
wsl --set-default-version 2

# Внутри WSL2 Ubuntu
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io
sudo service docker start
sudo usermod -aG docker $USER
```

После этого можно запускать PostgreSQL-контейнер для тестов:

```bash
# В WSL2 — запуск PostgreSQL для тестов
docker run -d --name coder-survival-test-db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=coder_survival_test \
  -p 5433:5432 postgres:16-alpine
```

Преимущества: **zero GUI overhead**, работает в фоне, потребляет меньше RAM (~200MB для PostgreSQL-контейнера), интеграционные тесты запускаются локально перед push. [^73^][^67^]

---

## 3. Pipeline Architecture: От задачи до deploy

### 3.1 Общая схема workflow

![Production Pipeline](pipeline_diagram.png)

Pipeline состоит из **пяти стадий**, каждая с чётко определёнными входом, выходом и ответственной стороной. Ключевой принцип — **автоматизация всего, что не требует человеческого суждения**: линтинг, тесты, деплой preview, smoke-тесты — всё выполняется автоматически. Человек нужен только для принятия архитектурных решений, approve PR и проверки smoke в production.

### 3.2 Детализация каждой стадии

**Stage 1 — Ideation (Инициация).** Источник задачи — vNext-роадмап или баг-репорт. Kimi (OpenClaw runtime) совместно с пользователем формулирует задачу в формате, пригодном для делегирования: заголовок, описание, acceptance criteria, затронутые файлы, зависимости. Результат — запись в `TASK_QUEUE.md` и создание GitHub Issue.

**Stage 2 — Assignment (Назначение).** OpenClaw Gateway определяет, какой агент и в какой lane (см. §4) будет работать над задачей. Создаётся feature-branch `feature/XX-description` и соответствующий git worktree. Обновляется `TASK_QUEUE.md` — статус меняется на `in_progress`, проставляется assignee.

**Stage 3 — Implementation (Реализация).** Назначенный агент работает в своём worktree. Обязательные шаги перед commit: self-test (`npm test` для затронутого модуля), lint (`npm run lint`), обновление документации если меняется API. Коммиты следуют conventional commits format: `feat(ux): add splash screen onboarding` или `fix(api): validate initData HMAC`.

**Stage 4 — Review (Ревью).** При создании PR автоматически запускаются: (а) GitHub Actions — CI pipeline с unit + integration тестами, lint, security scan; (б) CODEOWNERS — автоматическое назначение reviewer на основе затронутых файлов; (в) Codex CLI — automated code review через `@Codex` tag. PR нельзя merge, пока не пройдены все CI checks и нет хотя бы одного approve.

**Stage 5 — Merge & Deploy (Мерж и деплой).** После approve пользователь (или автоматика при зелёных чеках) мержит PR в `main`. Триггерится GitHub Actions: frontend деплоится на Vercel (production), backend — через SSH на YC VM с Docker, бот — на Vercel (webhook). После деплоя — автоматический smoke-тест: healthcheck API, проверка bot webhook, базовый сценарий в Mini App через Kimi WebBridge.

### 3.3 Git worktrees: практическая настройка

Git worktrees позволяют работать с несколькими ветками одновременно в изолированных директориях. [^109^][^106^] Для Coder Survival рекомендуется следующая структура:

```powershell
# Основная директория — main (только для reference)
cd C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh

# Создание worktrees для параллельной разработки
git worktree add ..\coder-survival-ux       -b feature/ux-onboarding
git worktree add ..\coder-survival-career   -b feature/career-ladder
git worktree add ..\coder-survival-backend  -b feature/skin-equip-api
git worktree add ..\coder-survival-hotfix   -b hotfix/initdata-validation

# Каждый агент работает в своей директории — нет конфликтов при редактировании
cd ..\coder-survival-ux       # Kimi Desktop — UX/Onboarding
cd ..\coder-survival-career   # Kimi runtime — Career Ladder
cd ..\coder-survival-backend  # Kimi subagent — Backend API
```

Преимущества для multi-agent workflow: **ноль конфликтов** при одновременном редактировании — каждый агент работает в своей директории; **мгновенное переключение контекста** — `cd` вместо `git stash` + `git checkout`; **сохранение состояния IDE** — открытые файлы, breakpoints, терминальные сессии не теряются; **параллельные dev-серверы** — можно запускать `npm run dev` в нескольких worktrees одновременно на разных портах. [^111^][^116^]

### 3.4 Staging-окружения

Для безопасного тестирования перед production нужно два промежуточных окружения:

| Окружение | Инфраструктура | Назначение | Как деплоить |
|---|---|---|---|
| **Preview** | Vercel (auto preview per PR) | Тестирование frontend-изменений | Автоматически при PR через `vercel deploy --prebuilt` [^70^] |
| **Staging** | YC VM (отдельный Docker-контейнер) | Интеграционное тестирование full stack | Вручную через GitHub Actions workflow_dispatch |

Vercel preview генерирует уникальный URL для каждого PR — идеально для frontend-тестирования. [^70^] Staging на YC VM позволяет проверить полный цикл: frontend → backend → PostgreSQL → bot webhook перед production deploy.

---

## 4. Agent Roles & File Ownership

### 4.1 Распределение ролей между агентами

| Агент | Первичная роль | Вторичная роль | Не делает |
|---|---|---|---|
| **Kimi (#1, OpenClaw runtime)** | Backend (Express + PostgreSQL), DevOps, GitHub Actions, тестирование | Архитектурные решения через subagents | Frontend UI/UX компоненты — отдаёт агенту #2 |
| **Kimi Desktop (#2)** | Frontend (Preact + Phaser), UI/UX, скины, анимации | Тестирование визуальных компонентов | Backend endpoints, миграции БД, конфигурация сервера |
| **Гермес (#3, ChatGPT 5.5)** | Архитектурное планирование, ADR, roadmaps, документация | Code review сложных алгоритмов | Прямое редактирование кода, ручная передача промптов |

### 4.2 CODEOWNERS: разделение файлов

Файл `.github/CODEOWNERS` автоматически назначает reviewer на PR в зависимости от изменённых файлов. [^86^][^101^] Для Coder Survival:

```
# Global fallback — любые изменения требуют approve от владельца репозитория
* @timoshinoleg-eng

# Backend — агент #1 (Kimi OpenClaw)
/backend/ @timoshinoleg-eng
/backend/migrations/ @timoshinoleg-eng
/backend/routes/ @timoshinoleg-eng
/backend/tests/ @timoshinoleg-eng

# Frontend — агент #2 (Kimi Desktop)
/frontend/ @timoshinoleg-eng
/frontend/src/components/ @timoshinoleg-eng
/frontend/src/assets/ @timoshinoleg-eng

# Bot — агент #1 (Kimi OpenClaw)
/bot/ @timoshinoleg-eng

# Infrastructure и CI/CD — агент #1
/.github/workflows/ @timoshinoleg-eng
/nginx/ @timoshinoleg-eng
/scripts/ @timoshinoleg-eng

# Documentation — агент #3 (Гермес)
*.md @timoshinoleg-eng
/.planning/ @timoshinoleg-eng
/reports/ @timoshinoleg-eng

# Security-sensitive files — требуют двойного review
/.env.example @timoshinoleg-eng
/payments/ @timoshinoleg-eng
```

> **Примечание:** Поскольку в репозитории один maintainer (`timoshinoleg-eng`), CODEOWNERS работает как **документация владения**, а не как enforced review. Когда появятся дополнительные collaborators, правила начнут автоматически назначать reviewer. Сейчас главная ценность — **визуальная индикация** в GitHub UI: «этот PR трогает frontend — значит, Kimi Desktop должен его проверить».

### 4.3 Lane-based разработка

Три параллельных "lane" (полосы) разработки, каждая со своим набором фич и ответственным агентом:

| Lane | Фичи | Ответственный агент | Git prefix |
|---|---|---|---|
| **Lane A: UX & Engagement** | Splash/Onboarding, Career Ladder (XP, ранги), скины с бонусами, HUD | Kimi (#1) + Kimi Desktop (#2) | `feature/ux-*`, `feature/career-*` |
| **Lane B: Backend & API** | Skin Equip endpoint, Shop/Referral, Team Battle fix, Antifraud, Rate limiting | Kimi (#1) + subagents | `feature/api-*`, `feature/security-*` |
| **Lane C: Operations & Docs** | Cron jobs, Analytics (Amplitude), Documentation cleanup, CI/CD | Гермес (#3) + OpenClaw Gateway | `feature/ops-*`, `feature/docs-*` |

Каждый lane работает в своём git worktree. Lane A и Lane B могут работать параллельно — Lane A меняет frontend, Lane B меняет backend, конфликтов нет. Если Lane A меняет API-контракт (например, новое поле в `/api/user`), это координируется через `API_CONTRACTS.md` (см. §5).

---

## 5. Coordination Protocol: Как работать без API между агентами

### 5.1 Файловый координационный механизм

Поскольку прямой API между агентами отсутствует, координация происходит через **файлы в репозитории** — единственное общее пространство, доступное всем трём агентам. Это ограничение можно превратить в преимущество: файловый протокол создаёт **аудируемый след** всех решений, который остаётся в Git history.

Рекомендуется создать четыре координационных файла в корне репозитория:

| Файл | Назначение | Кто обновляет | Формат |
|---|---|---|---|
| `TASK_QUEUE.md` | Список всех задач vNext со статусами | OpenClaw Gateway / User | Markdown-таблица |
| `API_CONTRACTS.md` | Актуальные API endpoints, request/response форматы | Агент, меняющий API | Markdown + JSON examples |
| `COORDINATION.md` | Кто над чем работает прямо сейчас, какие worktree активны | Все агенты (через commit) | Markdown-список |
| `CHANGELOG.md` | Что изменилось в каждом релизе | OpenClaw Gateway (auto) | Keep a Changelog format |

### 5.2 Формат TASK_QUEUE.md

```markdown
# Task Queue — Coder Survival vNext

| ID | Фича | Приоритет | Lane | Агент | Статус | Ветка | Блокируется |
|---|---|---|---|---|---|---|---|
| CS-01 | Splash + Onboarding (UX) | P0 | A | Kimi Desktop | in_progress | feature/ux-onboarding | — |
| CS-02 | Career Ladder (XP, ранги) | P0 | A | Kimi | pending | — | CS-01 |
| CS-03 | Skin Equip endpoint | P1 | B | Kimi subagent | in_progress | feature/api-skin-equip | — |
| CS-04 | Shop/Referral Shell | P1 | B | — | pending | — | CS-03 |
| CS-05 | Team Battle bug fix | P1 | B | — | pending | — | — |
| CS-06 | Rate limiting + Antifraud | P1 | B | — | pending | — | — |
| CS-07 | Ad SDK (AdsGram) | P1 | C | — | pending | — | — |
| CS-08 | Analytics (Amplitude) | P2 | C | — | pending | — | — |
| CS-09 | Cron jobs (auto-rewards) | P2 | C | — | pending | — | — |
| CS-10 | Documentation cleanup | P2 | C | Гермес | pending | — | — |

## Правила обновления
- Агент меняет статус на `in_progress` при начале работы
- Агент создаёт ветку и указывает её в поле "Ветка"
- Статус `completed` ставится после merge в main
- Поле "Блокируется" указывает зависимость — задачу нельзя начать, пока блокер не completed
```

### 5.3 Git workflow: branch-per-feature + worktrees

**Conventional Commits** обязательны для всех агентов. Формат: `<type>(<scope>): <description>`.

| Type | Когда использовать | Пример |
|---|---|---|
| `feat` | Новая фича | `feat(ux): add onboarding splash screen` |
| `fix` | Исправление бага | `fix(api): validate initData HMAC signature` |
| `refactor` | Переписывание без изменения поведения | `refactor(career): extract XP calculation to service` |
| `test` | Добавление/исправление тестов | `test(api): add rate limit integration tests` |
| `docs` | Изменение документации | `docs: update API_CONTRACTS for skin equip` |
| `chore` | Рутинные задачи (lint, форматирование) | `chore: update eslint config` |

**Branch naming convention:**
- `feature/xx-short-desc` — новые фичи (например, `feature/ux-onboarding`)
- `hotfix/xx-short-desc` — срочные исправления (например, `hotfix/initdata-validation`)
- `refactor/xx-short-desc` — рефакторинг (например, `refactor/career-xp-calc`)

**Pull Request template** (файл `.github/pull_request_template.md`):
```markdown
## Что изменилось
<!-- Краткое описание изменений -->

## Затронутые Lane
- [ ] Lane A (UX/Engagement)
- [ ] Lane B (Backend/API)
- [ ] Lane C (Operations/Docs)

## Тесты
- [ ] Unit tests проходят (`npm test`)
- [ ] Integration tests проходят (если применимо)
- [ ] Ручное тестирование в Mini App

## API Changes
- [ ] Нет изменений API
- [ ] Изменения задокументированы в `API_CONTRACTS.md`

## Чеклист перед merge
- [ ] Self-review выполнен
- [ ] CODEOWNERS reviewer назначен
- [ ] CI checks проходят
```

### 5.4 MCP Bridge: возможность интеграции CLI-агентов

MCP (Model Context Protocol) — стандартизованный протокол для подключения AI-агентов к инструментам. [^35^] В 2026 году он достиг **97 миллионов загрузок** и поддерживается Anthropic, OpenAI, Google, Microsoft. [^35^] Для Coder Survival MCP может стать мостом между агентами:

**Вариант A: OpenClaw Gateway как MCP Hub.** OpenClaw Gateway запускается как MCP server, предоставляя другим агентам доступ к общим файлам (`TASK_QUEUE.md`, `API_CONTRACTS.md`) через стандартизованный API. Kimi Desktop и Гермес подключаются как MCP clients. [^133^]

**Вариант B: Файловый MCP-прокси.** Простой Node.js-сервер, запущенный на OpenClaw Gateway, отслеживает изменения в координационных файлах через `fs.watch` и рассылает уведомления подключённым агентам через MCP notifications. Это устраняет необходимость вручную проверять `TASK_QUEUE.md` — агент получает push-уведомление, когда статус задачи изменился.

**Вариант C: Claude Bootstrap v3.6.** Готовый фреймворк для cross-tool интеграции Claude Code, Kimi CLI и Codex CLI. [^92^] Синхронизирует skills, hooks и project instructions между агентами из единого источника. Включает "Cross-Agent Intelligence" — автоматическое делегирование и review.

> **Рекомендация:** Начать с Варианта C (Claude Bootstrap v3.6) — он уже существует, не требует написания кода, и решает проблему фрагментации конфигураций. Если интеграция окажется сложной — откатиться на Вариант B (файловый MCP-прокси) как самый простой в реализации.

---

## 6. Skills & Tools to Install

### 6.1 OpenClaw skills с ClawHub

ClawHub содержит **52,700+ скиллов** и **180,000+ пользователей**. [^121^] Для Coder Survival рекомендуется установить следующие skills через `openclaw skills install <slug>`: [^133^]

| Skill | Источник | Зачем нужен | Приоритет |
|---|---|---|---|
| `github` | Bundled (OpenClaw) | PR, code review, issues через CLI | P0 |
| `healthcheck` | Bundled (OpenClaw) | Автоматическая проверка безопасности конфигурации | P0 |
| `clawhub` | Bundled (OpenClaw) | Поиск и установка skills из ClawHub | P0 |
| `session-logs` | Bundled (OpenClaw) | Анализ прошлых сессий, восстановление контекста | P1 |
| `composio` | ClawHub [^132^] | Доступ к 1000+ интеграциям (GitHub, Slack, Gmail) без кастомной auth | P1 |
| `n8n-workflow` | ClawHub [^132^] | Автоматизация cron jobs, уведомлений, отчётов | P1 |
| `exa-search` | ClawHub [^132^] | Поиск по технической документации, GitHub, форумам (лучше, чем обычный web search для разработки) | P2 |
| `self-improving-agent` | ClawHub [^132^] | Запоминание ошибок и предпочтений между сессиями | P2 |

### 6.2 VS Code extensions

| Extension | Назначение | Приоритет |
|---|---|---|
| **ESLint** | Линтинг JavaScript/Preact | P0 |
| **Prettier** | Автоформатирование кода | P0 |
| **GitLens** | Улучшенная работа с Git (blame, history) | P0 |
| **PostgreSQL** (ckolkman.vscode-postgres) | Просмотр и редактирование БД из IDE | P1 |
| **Thunder Client** | Тестирование API endpoints без Postman | P1 |
| **Docker** (ms-vscode-remote.remote-wsl) | Работа с Docker в WSL2 | P1 |
| **Telegram Mini App Debugger** | Отладка Mini App в WebView | P2 |

### 6.3 GitHub Actions workflows

| Workflow | Триггер | Что делает | Приоритет |
|---|---|---|---|
| `ci.yml` | Push, PR | Lint, unit tests, build frontend | P0 |
| `integration-tests.yml` | PR | Integration tests с PostgreSQL service container | P0 |
| `security-scan.yml` | Push, PR | CodeQL, `npm audit`, TruffleHog (secrets) | P0 |
| `deploy-frontend.yml` | Push to `main` | Deploy frontend на Vercel production | P0 |
| `deploy-backend.yml` | Push to `main` | Deploy backend на YC VM через SSH + Docker | P0 |
| `preview.yml` | PR | Deploy preview на Vercel для тестирования | P1 |
| `dependency-audit.yml` | Ежедневно (cron) | Проверка уязвимостей зависимостей | P1 |

Пример `integration-tests.yml` с PostgreSQL service container: [^125^][^128^]

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: coder_survival_test
        ports: [5432:5432]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/coder_survival_test
```

### 6.4 NPM-пакеты для vNext

| Пакет | Зачем нужен | Где использовать |
|---|---|---|
| `zustand` | State management для Preact (~1KB) [^54^] | Frontend — глобальное состояние игры |
| `@telegram-apps/sdk` | Telegram Mini App SDK (initData, viewport, etc.) | Frontend — взаимодействие с Telegram |
| `@adsgram/react` | AdsGram SDK для rewarded video [^94^] | Frontend — монетизация |
| `express-rate-limit` + `rate-limit-redis` | Rate limiting для production [^123^] | Backend — защита от abuse |
| `helmet` | Security headers | Backend — CSP, HSTS, X-Frame-Options |
| `zod` | Schema validation для API | Backend + Bot — валидация входных данных |
| `node-cron` | Cron jobs для auto-rewards | Backend — Daily Battle распределение |
| `amplitude-js` | Analytics tracking | Frontend — события для Amplitude |

---

## 7. Risk Mitigation: Safeguards для параллельной работы

### 7.1 Конфликты при редактировании файлов

**Проблема:** Два агента одновременно меняют один и тот же файл (например, `backend/routes/user.js` — один добавляет endpoint для Career Ladder, другой для Skin Equip).

**Решение — CODEOWNERS + lane separation:** Каждый файл закреплён за конкретным lane (см. §4.2). Если Lane A меняет `/frontend/` а Lane B меняет `/backend/` — конфликтов не бывает. Пересечение возможно только в shared-файлах (`package.json`, `README.md`) — для них CODEOWNERS требует review от обоих агентов. [^86^]

**Дополнительный safeguard — pre-commit hook:**

```bash
#!/bin/sh
# .git/hooks/pre-commit
# Проверка: не редактирует ли агент чужой lane?

CHANGED_FILES=$(git diff --cached --name-only)
CURRENT_BRANCH=$(git branch --show-current)

# Lane A (UX) не должен менять backend без предупреждения
if echo "$CURRENT_BRANCH" | grep -q "feature/ux-" && echo "$CHANGED_FILES" | grep -q "^backend/"; then
    echo "WARNING: UX lane изменяет backend файлы. Убедитесь, что API_CONTRACTS.md обновлён."
    echo "Нажмите Ctrl+C для отмены, или Enter для продолжения..."
    read
fi
```

### 7.2 Race conditions при Git push

**Проблема:** Два агента одновременно push-ат в свои feature-ветки — это безопасно. Но если оба одновременно пытаются обновить `main` через merge — возникает race.

**Решение — branch protection + PR-only merge:** Запретить прямой push в `main`. Все изменения — только через PR. GitHub serializes merge operations, race condition невозможен. [^51^]

Настройка branch protection для `main`:
- ✅ Require a pull request before merging
- ✅ Required approving reviews: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging (CI)
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ❌ Allow force pushes — **UNTICKED**
- ❌ Allow deletions — **UNTICKED** [^51^]

### 7.3 Несогласованные миграции БД

**Проблема:** Два агента одновременно создают migration файлы с одинаковыми номерами версий.

**Решение — timestamp-based naming + coordinator:**

```
backend/migrations/
  20260603120000_add_career_xp_table.sql
  20260603150000_add_skin_equip_columns.sql
```

Префикс — Unix timestamp (или `YYYYMMDDhhmmss`). Конфликт номеров невозможен при разнице > 1 минуты. Дополнительно: перед созданием migration агент проверяет `TASK_QUEUE.md` — если другой агент уже в статусе `in_progress` с задачей, трогающей БД — ждать. [^40^]

Для production миграций рекомендуется **Flyway** или **node-pg-migrate** с transactional lock: [^49^]

```javascript
// Использование pg_advisory_lock для атомарных миграций
await db.query('SELECT pg_advisory_lock(12345)');
try {
  // выполнить миграцию
} finally {
  await db.query('SELECT pg_advisory_unlock(12345)');
}
```

### 7.4 Нарушение API contracts

**Проблема:** Backend меняет формат ответа endpoint'а, frontend продолжает ожидать старый формат.

**Решение — `API_CONTRACTS.md` + версионирование:**

```markdown
## GET /api/user/:id

**Версия:** 1.2.0 (обновлено 2026-06-03)

### Response 200
```json
{
  "id": 123,
  "username": "dev_user",
  "level": 5,
  "xp": 1250,           // добавлено в v1.2.0 (Career Ladder)
  "rank": "Middle",      // добавлено в v1.2.0
  "energy": 75,
  "depression": 20,
  "equipped_skin": null  // добавлено в v1.3.0 (Skin Equip)
}
```

### Breaking Changes
- v1.2.0: добавлены поля `xp`, `rank` (nullable для backward compatibility)
- v1.3.0: добавлено поле `equipped_skin`
```

Перед каждым PR, меняющим API — обязательное обновление `API_CONTRACTS.md`. CI проверяет, что документация обновлена (через `grep` в changed files).

### 7.5 Тестовый хаос

**Проблема:** Неясно, кто и когда запускает какие тесты. Backend тесты пропускаются без PostgreSQL. Frontend тестов нет.

**Решение — трёхуровневая стратегия тестирования:**

| Уровень | Что тестируется | Кто запускает | Когда | Инструмент |
|---|---|---|---|---|
| **Unit** | Отдельные функции, utilities | Агент перед commit | Локально | Jest / Vitest |
| **Integration** | API endpoints + БД | GitHub Actions | На каждый PR | Jest + PostgreSQL container [^125^] |
| **E2E / Smoke** | Полный сценарий Mini App | GitHub Actions после deploy | После merge в main | Kimi WebBridge / Playwright |

**Frontend testing для Phaser:** Phaser 3 сложно тестировать напрямую из-за зависимости от Canvas/WebGL. [^83^] Рекомендуется изолировать game logic от Phaser — перенести расчёты (XP, баланс, прогресс) в чистые JavaScript-модули без зависимостей от Phaser. Эти модули можно unit-тестировать стандартным Jest. Phaser-специфичный код (отрисовка, анимации) тестировать визуально через Kimi WebBridge. [^71^]

---

## 8. Technical Roadmap: Приоритеты и зависимости

![Roadmap Timeline](roadmap_timeline.png)

### 8.1 Фаза 1: Tech Debt (Неделя 1–2) — P0

Фаза tech debt критична, потому что текущие проблемы **блокируют новые фичи** и создают риск для production.

**SQL injection fix + Input validation.** Любой endpoint, принимающий user input, должен использовать parameterized queries или ORM. Для Express + PostgreSQL без ORM это означает: заменить все `db.query(`SELECT * FROM users WHERE id = ${userId}`)` на `db.query('SELECT * FROM users WHERE id = $1', [userId])`. [^141^] Добавить `zod`-валидацию для всех API endpoints — body, params, query. [^118^]

**Docker Engine в WSL2.** Установка описана в §2.3. После этого 31 пропускаемый тест начинают работать. Интеграционные тесты с PostgreSQL запускаются локально перед каждым push — это меняет культуру разработки с "надеюсь, в CI не сломается" на "я знаю, что работает, прежде чем push-ить".

**Git worktrees setup.** Создать шаблонные worktrees для трёх lanes. Написать PowerShell-скрипт `scripts/create-worktree.ps1`, который автоматизирует создание: `.

### 8.2 Фаза 2: Core Features (Неделя 2–5) — P0/P1

**UX Polish: Splash + Onboarding.** Реализация должна следовать best practices для Telegram Mini Apps: [^42^][^44^]
- **ClosingConfirmation API** — защита от случайного закрытия во время onboarding
- **Contextual opt-in** — запрос разрешений (notifications) не при первом запуске, а при значимом событии ("Уведомить, когда энергия восполнится?")
- **Progressive profiling** — не запрашивать всё сразу, минимум полей для старта
- **Gamify setup** — прогресс-бар, ачивки за прохождение шагов onboarding
- **Time-to-value < 60 секунд** — первый tap и первый визуальный feedback должны произойти в течение минуты после открытия

**Career Ladder: XP + Ранги (Junior/Middle/Senior).** Система прогрессии напрямую влияет на retention — у пользователя появляется долгосрочная цель. Ключевые решения:
- XP начисляется за: taps (1 XP), мини-игры (10-50 XP), ежедневные квесты (25-100 XP), streak (бонус множитель)
- Ранги: Junior (0-999 XP), Middle (1000-4999 XP), Senior (5000-14999 XP), Lead (15000+ XP) — с визуальными отличиями в HUD
- Каждый ранг даёт бонусы: +5% к скорости энергии (Middle), +10% к XP от мини-игр (Senior), уникальные скины (Lead)

**Skin Equip Endpoint + Shop/Referral Shell.** Backend endpoint `POST /api/user/equip-skin` с валидацией через `zod`. Shop — каталог скинов с ценами в Telegram Stars. Referral — уникальные ссылки с отслеживанием приглашённых и бонусами за достижения (3/5/10 приглашённых).

### 8.3 Фаза 3: Polish (Неделя 5–7) — P1/P2

**Team Battle Bug Fix + Antifraud.** Исправление бага tracking contribution в Team Battles. Antifraud: rate limiting (`express-rate-limit` + Redis), проверка на аномальные паттерны (слишком много taps в секунду, поддельные initData), блокировка подозрительных аккаунтов. [^123^]

**Analytics: Amplitude.** Интеграция Amplitude SDK для отслеживания ключевых событий: `onboarding_started`, `onboarding_completed`, `first_tap`, `level_up`, `mini_game_completed`, `purchase_initiated`, `purchase_completed`, `ad_watched`. [^77^] Behavioral cohorts позволят ответить на вопрос: "Пользователи, прошедшие onboarding за < 2 минуты, имеют retention на 3x выше?"

**Cron Jobs: Auto-rewards Daily Battle.** Настройка cron на OpenClaw Gateway для автоматического распределения наград Daily Battle по расписанию (00:00 UTC).

### 8.4 Фаза 4: Monetization (Неделя 7–9) — P1/P2

**Ad SDK: AdsGram.** Интеграция `@adsgram/react` для rewarded video. [^94^] Пользователь добровольно смотрит 15-30 секундный ролик в обмен на: +50 энергии, 2x XP на 10 минут, пропуск мини-игры. CTR rewarded video — **20-40%** против 0.5-2% у обычных баннеров. [^1^] eCPM в tier-1 рынках — **$15-40**. [^60^]

**A/B Tests для Retention.** Тестирование двух версий onboarding, двух вариантов первого paywall, разных placement'ов для rewarded video. Метрики: D1 retention, D7 retention, session length.

### 8.5 Таблица зависимостей

| Задача | Зависит от | Блокирует | Параллелится с |
|---|---|---|---|
| UX Onboarding | — | Career Ladder | SQL fix, Docker setup |
| Career Ladder | UX Onboarding (shared UI) | — | Skin Equip API |
| Skin Equip API | — | Shop/Referral | Career Ladder |
| Shop/Referral | Skin Equip API | — | Team Battle fix |
| Ad SDK | — | — | Analytics |
| Antifraud | — | — | Analytics |
| Analytics | — | A/B Tests | Cron jobs |

---

## 9. Action Plan: Чек-лист первых 3–7 дней

### День 1: Инфраструктура

| # | Задача | Кто | Инструмент | Результат |
|---|---|---|---|---|
| 1.1 | Установить Docker Engine в WSL2 | User | PowerShell + WSL2 | PostgreSQL-контейнер работает, `docker ps` показывает контейнер |
| 1.2 | Создать `TASK_QUEUE.md`, `API_CONTRACTS.md`, `COORDINATION.md` | Kimi (OpenClaw) | VS Code | Три координационных файла в корне репозитория |
| 1.3 | Настроить branch protection для `main` | User | GitHub Settings | PR-only merge, required review, CI checks обязательны |
| 1.4 | Создать `CODEOWNERS` файл | Kimi (OpenClaw) | VS Code | `.github/CODEOWNERS` с разделением по директориям |

### День 2: Git Worktrees + CI/CD

| # | Задача | Кто | Инструмент | Результат |
|---|---|---|---|---|
| 2.1 | Создать worktrees для 3 lanes | User | PowerShell (`git worktree add`) | 3 директории: `coder-survival-ux`, `coder-survival-backend`, `coder-survival-ops` |
| 2.2 | Написать `scripts/create-worktree.ps1` | Kimi (OpenClaw) | VS Code | PowerShell-скрипт для быстрого создания worktree |
| 2.3 | Настроить GitHub Actions: `ci.yml` | Kimi (OpenClaw) | VS Code | CI pipeline: lint + unit tests на каждый push/PR |
| 2.4 | Настроить GitHub Actions: `integration-tests.yml` | Kimi (OpenClaw) | VS Code | Integration tests с PostgreSQL service container |

### День 3: Security + Tech Debt

| # | Задача | Кто | Инструмент | Результат |
|---|---|---|---|---|
| 3.1 | Исправить SQL injection: parameterized queries | Kimi (OpenClaw) | VS Code | Все `db.query` используют `$1, $2` параметры |
| 3.2 | Добавить `zod`-валидацию для API endpoints | Kimi (OpenClaw) | VS Code | Все endpoints валидируют входные данные |
| 3.3 | Добавить `express-rate-limit` | Kimi (OpenClaw) | VS Code | Rate limit: 500 req/15min глобально, 10 req/15min на auth |
| 3.4 | Настроить GitHub Actions: `security-scan.yml` | Kimi (OpenClaw) | VS Code | CodeQL + npm audit + TruffleHog на каждый PR |

### День 4–5: Начало разработки фич

| # | Задача | Кто | Инструмент | Результат |
|---|---|---|---|---|
| 4.1 | UX Onboarding: Splash screen | Kimi Desktop | VS Code (worktree ux) | Компонент SplashScreen.jsx с анимацией |
| 4.2 | Career Ladder: XP calculation service | Kimi (OpenClaw) | VS Code (worktree backend) | `services/xpCalculator.js` с unit tests |
| 4.3 | Career Ladder: DB migration (XP, rank columns) | Kimi (OpenClaw) | VS Code + WSL2 PostgreSQL | Миграция `20260605_add_xp_rank.sql` |
| 4.4 | Skin Equip: API endpoint `POST /api/user/equip-skin` | Kimi subagent | VS Code (worktree backend) | Endpoint с валидацией и tests |

### День 6–7: Review + Merge первых PR

| # | Задача | Кто | Инструмент | Результат |
|---|---|---|---|---|
| 5.1 | Создать PR для UX Onboarding | Kimi Desktop | GitHub | PR с описанием, screenshots |
| 5.2 | Создать PR для Career Ladder (backend) | Kimi (OpenClaw) | GitHub | PR с тестами, API_CONTRACTS.md обновлён |
| 5.3 | Code review через Codex (`@Codex` tag) | Автоматически | GitHub + Codex | Automated review comments на PR |
| 5.4 | Merge approved PR в `main` | User | GitHub | Auto-deploy на Vercel + YC VM |
| 5.5 | Smoke-тест production | Kimi WebBridge | Browser | Splash screen работает, API отвечает |

---

## 10. Монетизация и рост (кратко)

### 10.1 Каналы привлечения

| Канал | CAC | Ожидаемый эффект | Когда запускать |
|---|---|---|---|
| **Referral (встроенный)** | $0 | Основной канал для indie | Сейчас (уже реализовано) |
| **Telegram Ads** | $0.02–0.50 | Масштабирование | После D1 retention > 25% |
| **Вирусные механики** | $0 | Шеринг achievements, мемов | Вместе с UX Polish |
| **TON / Stars** | Низкий | Крипто-аудитория | После Ad SDK |

### 10.2 Monetization stack

| Метод | Платформа | Revenue potential | Сложность |
|---|---|---|---|
| **Telegram Stars** | Telegram native | High | Medium (уже реализовано) |
| **Rewarded video** | AdsGram [^94^] | Medium-High | Low — npm install `@adsgram/react` |
| **Offer walls** | AdsGram / RichAds | Medium | Low |

Рекомендуемая стратегия: **Stars + rewarded video** — Stars для платящих пользователей (прямая монетизация), rewarded video для всех остальных (ad revenue). Эта комбинация покрывает оба сегмента аудитории. [^1^]

### 10.3 Ключевые метрики

| Метрика | Текущий target | Benchmark (TMA gaming) [^129^] | Как измерить |
|---|---|---|---|
| DAU/MAU (Stickiness) | > 20% | 5–10% | Amplitude |
| D1 Retention | > 25% | 15–20% | Amplitude cohorts |
| D7 Retention | > 12% | 8–10% | Amplitude cohorts |
| Session Length | > 3 min | 2–5 min | Amplitude |
| Paying User Rate | > 1.5% | 1–1.5% | Telegram Bot API + Amplitude |
| Ad Completion Rate | > 85% | 90%+ (rewarded) | AdsGram dashboard |

### 10.4 Analytics stack

| Инструмент | Для чего | Приоритет |
|---|---|---|
| **Amplitude** | Product analytics, cohorts, retention, funnel | P1 |
| **Telegram Mini App Analytics** (встроенная) | Base metrics: DAU, retention (бесплатно) | P0 (уже доступно) |
| **AdsGram Dashboard** | Ad revenue, fill rate, eCPM | P1 (после интеграции AdsGram) |

> **Ключевой инсайт:** Для Telegram Mini Apps критически важен **первый опыт**. 90% покупок происходят в первой сессии («Monetization Rule of 90»). [^1^] Это означает, что onboarding должен не только обучать, но и **показывать ценность покупки** — первый paywall, первое предложение Stars, первый rewarded video — всё это должно быть спроектировано как часть onboarding flow, а не добавлено потом.

---

**Итог:** Проект Coder Survival обладает сильным технологическим фундаментом и уникальной концепцией. Главный вызов не в коде, а в **процессе**: переход от ручной координации через копирование промптов к автоматизированному pipeline с git worktrees, CODEOWNERS и CI gates. Этот переход займёт 3–5 дней настройки, но окупится в первую же неделю параллельной разработки — когда три агента смогут работать одновременно без конфликтов, а каждый merge в `main` будет гарантированно проходить тесты и деплоиться автоматически.
