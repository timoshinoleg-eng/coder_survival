# Subagent Task: Инфраструктура + Координация

## Задача
Создать все координационные файлы для проекта Coder Survival и настроить git worktrees.

## Рабочая директория
C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh

## Конкретные действия

1. Создать TASK_QUEUE.md в корне с таблицей:
   - ID | Фича | Приоритет | Lane | Агент | Статус | Ветка | Notes
   - Заполнить 10 задачами из vNext (FEAT-01 Splash/Onboarding, FEAT-02 Career Ladder, FEAT-03 SQL Injection Fix, FEAT-04 Skin Equip, FEAT-05 Shop/Referral, FEAT-06 Team Battle Fix, FEAT-07 Ad SDK, FEAT-08 Cron Jobs, FEAT-09 Antifraud, FEAT-10 Analytics)

2. Создать API_CONTRACTS.md с текущими endpoints:
   - POST /api/auth/telegram
   - POST /api/user/tap
   - POST /api/user/upgrade-booster
   - GET /api/user/profile
   - GET /api/leaderboard
   - GET /api/quests
   - GET /api/shop/products
   - POST /api/payment/create
   - POST /api/payment/verify
   - Для каждого: method, path, request body, response format, auth requirements

3. Создать COORDINATION.md:
   - Current active tasks
   - Active branches
   - Who is working on what
   - Last updated timestamp

4. Создать .github/CODEOWNERS:
   - backend/* @timoshinoleg-eng (Kimi OpenClaw)
   - frontend/* @kimi-desktop
   - docs/* @hermes
   - .github/* @timoshinoleg-eng
   - *.md @hermes

5. Настроить git worktrees (3 штуки):
   - coder-survival-kimi (для backend работы)
   - coder-survival-desktop (для frontend работы)
   - coder-survival-hermes (для docs/architecture)
   - Каждый с отдельной веткой

6. Проверить Docker Desktop:
   - docker ps (должен работать)
   - docker run hello-world

## Ограничения
- НЕ изменять существующий код (backend/src/, frontend/src/)
- Только создавать новые файлы и настраивать инфраструктуру
- git worktrees создавать рядом с основной папкой (в coder_survival_repo/)
- Все файлы в UTF-8, LF line endings

## Результат
По завершении отчитаться:
- Какие файлы созданы и где
- Статус git worktrees (ветки, пути)
- Docker статус (работает/нет)
- Любые проблемы или блокеры