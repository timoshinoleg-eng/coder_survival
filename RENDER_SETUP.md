# Render Setup Guide — Coder Survival Test

## Текущий статус
- **Service URL:** https://coder-survival.onrender.com
- **Service ID:** srv-d8jal2kvikkc73beagp0
- **Status:** ⚠️ 404 на все endpoints — нужна настройка

## Что нужно сделать (пошагово)

### 1. Проверить деплой на Dashboard
1. Зайди на https://dashboard.render.com
2. Найди сервис `coder-survival`
3. Проверь вкладку **Events** — есть ли ошибки деплоя?

### 2. Добавить Environment Variables (критично!)
В дашборде сервиса → **Environment** → **Add Environment Variable**:

| Variable | Value | Где взять |
|---|---|---|
| `BOT_TOKEN` | `123456789:ABC...` | @BotFather в Telegram |
| `BOT_BACKEND_SECRET` | `coder-test-secret-2024` | Придумай любую строку |
| `WEBAPP_URL` | `https://frontend-ashy-alpha-77.vercel.app` | Текущий фронтенд |

### 3. Перезапустить деплой
После добавления env vars:
- **Manual Deploy** → **Clear build cache & deploy**
- Жди 3-5 минут

### 4. Накатить миграции
В дашборде сервиса → **Shell** tab:
```bash
cd backend
npm run migrate
```

### 5. Проверить health
Открой в браузере:
```
https://coder-survival.onrender.com/health
```
Должен вернуть:
```json
{"status":"ok","db":"connected","timestamp":"..."}
```

## Что я настроил через IaC

В репозитории запушено:
- `render.yaml` — конфигурация сервиса и БД
- `.github/workflows/render-setup.yml` — проверка статуса
- `.github/workflows/render-health.yml` — мониторинг каждые 30 мин

## Известные проблемы Render Free

| Проблема | Решение |
|---|---|
| База удалится через 30 дней | Только для тестов! Перед продакшеном — paid plan |
| Cold start 30-60 сек | UptimeRobot пинг каждые 10 мин (или upgrade) |
| Cron jobs не работают | Для тестов ок, для продакшена — upgrade |
| 750 часов/мес | ~31 день 24/7, потом sleep |

## Проверка через GitHub Actions

Зайди в репозиторий → **Actions** → **Render Deploy Status & Setup**:
- Можно запустить вручную с параметром `check-status`
- Покажет текущий статус сервиса

## Контакты / Помощь

Если что-то не работает — скопируй логи деплоя из Render Dashboard (вкладка Logs) и пришли мне.
