# Coder Survival — План деплоя

## Текущее состояние
- **GitHub:** https://github.com/timoshinoleg-eng/coder_survival
- **Коммит:** c5d3ce3 (Initial commit with all fixes)
- **Все компоненты:** frontend, backend, bot, nginx, deploy скрипты — готовы
- **Безопасность:** Пароль БД сменен, .env в .gitignore

## Шаги деплоя

### 1. Git push (если есть новые изменения)
```bash
cd /root/.openclaw/workspace/coder-survival
git add -A
git commit -m "Add bot, nginx, deploy scripts"
git push origin main
```

### 2. Сборка и пуш Docker образов
```bash
cd /root/.openclaw/workspace/coder-survival
export REGISTRY=cr.yandex/crpduv7gci2puq300f38
export TAG=v1.0.0

# Backend
docker build -t $REGISTRY/coder-survival-backend:$TAG ./backend
docker push $REGISTRY/coder-survival-backend:$TAG

# Frontend (сборка + nginx)
docker build -t $REGISTRY/coder-survival-frontend:$TAG ./frontend
docker push $REGISTRY/coder-survival-frontend:$TAG

# Bot
docker build -t $REGISTRY/coder-survival-bot:$TAG ./bot
docker push $REGISTRY/coder-survival-bot:$TAG

# Nginx
docker build -t $REGISTRY/coder-survival-nginx:$TAG ./nginx
docker push $REGISTRY/coder-survival-nginx:$TAG
```

### 3. Деплой на VM
```bash
# SSH на VM
ssh ubuntu@111.88.254.2

# Создать docker-compose.prod.yml и .env
cd /opt/coder-survival
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Настройка Telegram BotFather
- Отправить `/setinline` → выбрать бота
- Отправить `/setwebapp` → указать URL: `https://codersurvival.ru`

### 5. Проверка
- Открыть бота в Telegram
- Нажать /start
- Проверить тап, таблицу лидеров, рефералку

## Риски
- VM preemptible — может быть прервана. Для production: сделать regular.
- PostgreSQL 10% — достаточно для теста, для production: увеличить.

## Стоимость
- VM: ~2,500 ₽/мес (preemptible)
- PostgreSQL: ~300 ₽/мес (10%)
- Registry: ~100 ₽/мес
- **Итого: ~2,900 ₽/мес**
