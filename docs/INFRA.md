# INFRA — инфраструктура Coder Survival

**Статус: 2026-08-17 — хостинг бэкенда в миграции.** Прошлые размещения (Yandex Cloud, Vultr)
выведены из эксплуатации; целевая площадка будет выбрана перед soft launch. Этот документ —
единственный канонический источник по топологии. Устаревшие описания в `AGENT_HANDOFF.md`,
`LAUNCH_NEXT_STEPS.md`, `project-status.json`, `RENDER_SETUP.md` и Yandex-миграционных доках
считаются историческими.

## Текущее состояние компонентов

| Компонент | Где сейчас | Статус |
|---|---|---|
| Frontend (Preact+Phaser) | Vercel, alias `frontend-ashy-alpha-77.vercel.app` | жив |
| Bot (Grammy, webhook) | Vercel, `coder-survival-bot.vercel.app/api/webhook` | жив; `API_URL` указывает на бэкенд |
| Backend API (Node 20, Docker) | **временно** — текущий инстанс за `coder-survival-api.duckdns.org` (проверено 2026-08-16: `/health` = 200, db connected) | жив до переезда |
| PostgreSQL | управляемый/самостоятельный, версия 14+ | переезжает вместе с бэкендом |

> При закрытии Yandex-аккаунта **сначала** выгрузить значения из Lockbox (`cs-prod-secrets`),
> затем удалять ресурсы. Секреты хранить только в новом secret store целевого хостинга.

## Требования к целевому хостингу бэкенда

1. Docker (образ собирается из `backend/Dockerfile`; пуш в любой registry).
2. HTTPS с валидным сертификатом на публичном домене — обязательное требование Telegram WebApp.
3. Один долгоживущий инстанс: cron-задачи (`node-cron`) выполняются **внутри процесса** —
   несколько реплик = задвоенные сезон-ротации/баттлы. Скейл — только после выноса крона.
4. Стартовая нагрузка: 1–2 vCPU, 2–4 GB RAM, 20+ GB диск под БД.
5. Локация EU (низкий латенси для RU/CIS-аудитории, нет проблем с выдачей сертификатов).

### Кандидаты (решение — за владельцем, до конца недели 3)

| Вариант | Плюсы | Минусы |
|---|---|---|
| VPS (Hetzner CX22 и т.п.) + Caddy | ~5€/мес, полный контроль, уже отработанный паттерн (docker + Caddy TLS) | ручное обслуживание, бэкапы сами |
| Render (`render.yaml` уже в репо) | PaaS из коробки, превью-окружения | цена выше, cron через их планировщик |
| Railway / Fly.io | простой деплой из repo | оплата по потреблению, латенси зависит от региона |
| Managed Postgres рядом с хостом | бэкапы/мониторинг из коробки | +$ |

## Нейтральный деплой-ранбук

```bash
# 1. Сборка образа (локально или в CI)
cd backend
docker build -t coder-survival-backend:latest .

# 2. Env: заполнить по backend/.env.example (имена ниже — весь обязательный набор)
#    BOT_TOKEN, DATABASE_URL/DB_*, BOT_BACKEND_SECRET, ADMIN_API_SECRET,
#    WEBAPP_URL, INIT_DATA_MAX_AGE_SECONDS=3600,
#    PAYMENTS_ENABLED (только после Stars-smoke!), ADSGRAM_SECRET, PROPELLER_SECRET

# 3. Миграции (идемпотентны)
docker run --rm --env-file .env coder-survival-backend:latest npm run migrate

# 4. Запуск за HTTPS-прокси (Caddy/Nginx/платформенный TLS)
docker compose -f ../docker-compose.backend.yml up -d backend

# 5. Проверка
curl -f https://<домен>/health   # {"status":"ok","db":"connected"}
```

## Чеклист переезда (когда хостинг выбран)

- [ ] Выгрузить секреты из старого хостинга/Lockbox → новый secret store
- [ ] Развернуть БД, прогнать миграции, восстановить дамп (если нужен перенос данных)
- [ ] Развернуть бэкенд, `/health` = ok
- [ ] Переправить DNS `coder-survival-api.duckdns.org` (или новый домен) на новый IP
- [ ] Обновить `API_URL` бота на Vercel и перередеплоить бота
- [ ] Обновить `frontend/vercel.json` (rewrites) и перередеплоить фронт
- [ ] Смоук: `/api/state` с подписанным initData, meme-картинка, инвойс-линк (ожидаемо 403 до включения платежей)
- [ ] Старые ресурсы — погасить только после 48 ч стабильной работы новых

## Безопасность (без изменений, независимо от хостинга)

- Секреты, когда-либо попадавшие в git-историю, считать скомпрометированными и ротировать
  (BOT_TOKEN, DB-пароль, BOT_BACKEND_SECRET; задать ADMIN_API_SECRET).
- IP/SSH-метаданные/cloud-ID не публиковать в отчётах и Drive-синках.
