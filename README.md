# Coder Survival — Telegram Mini App

Игра-кликер "Выживание программиста" для Telegram Mini Apps.

## Структура проекта

```
├── frontend/          # Preact 10 + Phaser 3.60 (Mini App UI)
├── backend/           # Node.js 20 + Express + PostgreSQL (API)
├── payments/          # Telegram Stars интеграция
├── analytics/         # Amplitude events
├── ads/               # Rewarded video research
├── calculator/        # Revenue model
└── project-status.json # Текущий статус
```

## Быстрый старт

### Фронтенд
```bash
cd frontend
npm install
npm run build
# dist/ → deploy to static hosting
```

### Бэкенд
```bash
cd backend
docker-compose up
# API на http://localhost:3000
```

## Инфраструктура

| Компонент | Статус | Детали |
|-----------|--------|--------|
| VM | ✅ Running | 111.88.254.2 (preemptible) |
| PostgreSQL | ✅ Running | rc1a-rt2j8d332gf773ap.mdb.yandexcloud.net |
| Container Registry | ✅ Active | crpduv7gci2puq300f38 |

## Документация

- [Product Document v2](docs/product-v2.md)
- [Tech Stack](docs/tech-stack.md)
- [Monetization](payments/stars-flow.md)

## Лицензия

MIT