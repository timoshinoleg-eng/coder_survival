# Bot Runtime Stabilization Plan

## Current state

Сейчас bot runtime уже стабилизирован вне VM:
- bot работает через Vercel webhook
- backend и данные остаются на VM
- frontend живет на Vercel

Причина:
- VM не имеет надежного исходящего доступа к `api.telegram.org`

## Цель

Текущая цель уже достигнута частично: бот больше не зависит от локальной машины.

Оставшаяся цель:
- автоматически переживает рестарты
- имеет понятные логи
- стабильно достукивается до Telegram API

## Current production path

- webhook URL:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- Telegram webhook уже выставлен на этот endpoint
- локальный polling workaround больше не нужен

## Предпочтительный дальнейший вариант

### Вариант A: вернуть бота на VM

Что проверить на VM:
1. DNS resolution для `api.telegram.org`
2. TCP/TLS доступ на `443`
3. отсутствие egress-блокировок со стороны cloud/firewall/NAT
4. `curl https://api.telegram.org` и простой Node HTTPS/fetch smoke

Если проблема устраняется:
1. обновить `.env` на VM
2. убедиться, что `WEBAPP_URL` указывает на актуальный frontend URL
3. поднять `bot` в `docker-compose.prod.yml`
4. переключить Telegram webhook обратно или удалить webhook и вернуть polling
5. проверить `/start`

Definition of done:
- VM bot сам отвечает на `/start`
- Vercel webhook runtime больше не нужен, если принято решение вернуть бот на VM

## Рабочий fallback

### Вариант B: оставить бота вне VM

Подойдет любая стабильная среда, где есть:
- Node.js runtime
- постоянный процесс
- доступ к `api.telegram.org`
- возможность хранить `BOT_TOKEN`, `WEBAPP_URL`, `API_URL`

Примеры:
- Vercel webhook runtime
- отдельная VM/VPS
- Render / Railway / Fly.io / другой always-on process hosting

Что важно:
- это должен быть стабильный always-on runtime
- нельзя запускать одновременно polling и webhook path для одного и того же production routing без осознанного переключения

## Что не делать

- не возвращать локальную машину как production bot runtime
- не запускать одновременно два polling-процесса с одним `BOT_TOKEN`
- не считать Vercel frontend решением проблемы bot runtime

## Минимальная проверка после перевода

1. `/start`
2. открыть Mini App
3. сделать несколько тапов
4. открыть leaderboard
5. перезапустить bot runtime
6. повторить `/start`
