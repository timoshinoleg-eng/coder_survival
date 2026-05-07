# Coder Survival — Backend

Telegram Mini App API для игры "Выживание программиста".

## Быстрый старт

```bash
# Локальная разработка
cd backend
docker-compose up

# API будет доступен на http://localhost:3000
```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Health check |
| GET | `/api/state` | Состояние игрока |
| POST | `/api/tap` | Тап (клик) |
| POST | `/api/buy` | Покупка предмета |
| GET | `/api/leaderboard` | Топ игроков |

## Заголовки

Все защищенные эндпоинты требуют:
```
X-Telegram-Init-Data: <initData из Telegram WebApp>
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `PORT` | Порт сервера | 3000 |
| `DB_HOST` | Хост PostgreSQL | localhost |
| `DB_PORT` | Порт PostgreSQL | 5432 |
| `DB_NAME` | Имя базы | coder_survival |
| `DB_USER` | Пользователь | postgres |
| `DB_PASSWORD` | Пароль | задаётся локально |
| `BOT_TOKEN` | Токен Telegram бота | — |

## Деплой

```bash
# Сборка и пуш в Yandex Container Registry
npm run deploy

# На сервере:
docker pull cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest
docker run -d -p 3000:3000 --env-file .env cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest
```
