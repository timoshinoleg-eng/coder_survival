# Coder Survival — Telegram Mini App

Кликер-игра для программистов внутри Telegram.

## Стек

- **Preact 10** — ~10KB, вместо React ~40KB
- **Phaser 3.60** — пиксель-арт рендеринг, WebGL/Canvas 2D fallback
- **Vite** — сборка, tree-shaking, code splitting
- **Telegram Web App SDK** — haptic feedback, viewport, safe areas

## Формулы игры

> **Source of truth:** [`GAME_RULES.md`](../GAME_RULES.md) в корне репозитория.  
> Нижеследующая таблица — краткая сводка; если возникает расхождение, правятся `GAME_RULES.md` и код бэкенда.

| Параметр | Краткое описание |
|----------|-----------------|
| Коммиты за тап | Зависят от ранга (1–8), текущей энергии, стресса и стрика. Серверная формула в `backend/src/routes/tap.js` |
| Энергия | −1 за тап, +1 каждые `recoveryIntervalSeconds` (default 60 с) **простоя** |
| Депрессия | +1/2 за тап при низкой энергии (<20/<10); −1 на каждые 5 восстановленных единиц энергии |
| Shop | `energy_refill`, `depression_cure`, `tier_boost`, `premium_pass` (Telegram Stars) |
| Level up | По XP thresholds из `backend/src/utils/vnext.js`; 10 уровней в ранге |

## Установка

```bash
cd frontend
npm install
```

## Разработка

```bash
npm run dev
# http://localhost:5173
```

## Сборка

```bash
npm run build
# dist/ — должен быть <10MB
```

## Анализ бандла

```bash
npm run analyze
# откроет визуализацию в браузере
```

## Структура

```
frontend/
├── index.html              # Telegram WebApp meta, viewport-fit=cover
├── vite.config.js          # Preact alias, Phaser chunk, analyzer
├── package.json
├── src/
│   ├── main.jsx            # Entry: Telegram init + providers
│   ├── hooks/
│   │   ├── useTelegram.js  # SDK wrapper, haptic feedback
│   │   └── useGameState.js # State + сервер-авторитарный sync
│   ├── components/
│   │   ├── StatsBar.jsx    # Коммиты, энергия, депрессия, countdown
│   │   └── TapArea.jsx     # Tap zone, ripple feedback, float texts
│   ├── game/
│   │   ├── PhaserGame.js   # Phaser config, resize handling
│   │   └── scenes/
│   │       ├── BootScene.js # Procedural pixel-art textures
│   │       └── GameScene.js # Desk, monitor, avatar, particles
│   └── assets/
│       └── animations.css  # Ripple, float, pulse keyframes
```

## Telegram Mini App требования

- `viewport-fit=cover` + safe areas через CSS
- `user-scalable=no`, `touch-action: manipulation`
- `Telegram.WebApp.ready()` + `.expand()`
- Haptic: `impactOccurred('light')`, `notificationOccurred('success')`

## Бандл size

| Chunk | Ориентировочно |
|-------|---------------|
| Preact | ~10KB |
| Phaser | ~800KB (gzipped ~200KB) |
| App code | ~15KB |
| **Total** | **~850KB** — well under 10MB limit |

## Fallback

- Phaser слишком тяжёлый → Canvas 2D напрямую
- Preact проблемы → vanilla JS + Web Components

## Локализация

Весь UI на русском. Тексты в компонентах, формулы в `useGameState.js`.
