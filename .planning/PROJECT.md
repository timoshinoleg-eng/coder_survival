# Coder Survival

## What This Is

Coder Survival — Telegram Mini App для программистов, где "тап = строки кода". Игрок управляет двумя ресурсами (энергией и депрессией), прокачивает уровни, проходит IT-тематические мини-игры, генерирует мемы из игрового состояния и соревнуется с коллегами в рабочих чатах. Основная цель — дать разработчику 5 минут веселья и возможность посмеяться над собственным выгоранием.

## Core Value

«Coder Survival – это место, где программист приходит поржать над своим выгоранием, устроить мини‑баттл с коллегой и на 5 минут забыть про дедлайны.»

## Requirements

### Validated

- ✓ Базовая механика «тап = строки кода» (коммиты) — existing
- ✓ Два ресурса: энергия (расходуется на тапы) и депрессия (растёт со временем и при низкой энергии) — existing
- ✓ Система уровней (Tier 1–10) с открытием зон и мини-игр (зачатки) — existing
- ✓ Простейшие бустеры (кофе, редбулл, антидепрессанты) — existing
- ✓ Реферальная система (базовая, без глубоких наград) — existing
- ✓ Ежедневные квесты (3 шт., шаблонные) — existing
- ✓ Battle Pass (20 уровней, частично реализован) — existing
- ✓ Telegram Mini App интеграция (initData auth) — existing
- ✓ Backend: Express + PostgreSQL — existing
- ✓ Frontend: Preact + Phaser 3.60 — existing
- ✓ Bot: grammy framework на Vercel — existing

### v1.0 Shipped (2026-05-22)

All 38 v1 requirements delivered across 10 phases:

- ✅ Встроенный мемогенератор (5 шаблонов) с реальными игровыми переменными и шерингом в чат
- ✅ Эмоциональные GIF-анимации «пять стадий дебаггинга» и «менеджер NPC +1 дедлайн»
- ✅ Ироничные достижения (ачивки) с кнопкой «Позориться»
- ✅ Мини-игра «Hello World» (QTE, уровень 2)
- ✅ Мини-игра «Code Review» (визуальный поиск багов, уровень 4)
- ✅ Мини-игра «Собеседование мечты» (IT-викторина, уровень 6)
- ✅ Мини-игра «Архитектурный комитет» (карточный выбор, Reigns-like, уровень 8)
- ✅ Мини-игра «IPO» (симуляция питча, уровень 10)
- ✅ Случайные события каждые 30–90 секунд
- ✅ Daily Battle (PvP в рабочем чате) с ежедневной сводкой в 18:00
- ✅ Командные цели (Team weekly hackathon) до 5 человек
- ✅ Реферальная система с двусторонней выгодой и антифермой
- ✅ Пиксель-арт визуальный стиль (16-bit) с живыми реакциями персонажа
- ✅ Скины с функциональными бонусами (без pay-to-win)
- ✅ Ежедневные квесты (3 + 1 бонусный) с автоматическим отслеживанием
- ✅ Еженедельный квест «Спринт» (лёгкий / средний / хард)
- ✅ Система стриков «Дни без выгорания» (7 / 14 / 30 дней)
- ✅ Battle Pass — бесплатный трек, фронт-лоудинг первых 3 уровней
- ✅ Фикс восстановления энергии (таймер не сбрасывается при открытии)
- ✅ Активация «мёртвого» оффера по стрессу (порог 55% → 20%)
- ✅ Числовой прогресс квестов и Battle Pass с анимацией конфетти
- ✅ Обратная связь на каждый тап (вибрация, печать строк)

### Active (v1.1+ candidates)

- [ ] Telegram Stories интеграция (native Stories post, MVP fallback = chat poll)
- [ ] Мемы в формате 9:16 (Stories)
- [ ] Зона «Legacy» как отдельный геймплейный слой
- [ ] Пермадез / Game Over механика
- [ ] Платформа Web (вне Telegram)
- [ ] Таблица лидеров глобальная

### Out of Scope

- Агрессивные пейволлы — монетизация потом, сначала любовь. Отложено до v2.
- Копирование механик Hamster Kombat — они уже надоели аудитории. Явно отклонено.
- Токеномика / «заработай токены» — сознательно отказались, путь выбран правильно. Явно отклонено.
- «Серьёзное лицо» — игра без юмора не имеет смысла для целевой аудитории. Явно отклонено.

## Context

- **Brownfield проект:** кодовая база существует, есть backend (Express/PostgreSQL), frontend (Preact/Phaser), bot (grammy/Vercel).
- **Target audience:** программисты, использующие Telegram (рабочие чаты, IT-команды).
- **Платформа:** Telegram Mini App (WebApp SDK), бот для публикаций в чатах.
- **Визуальный стиль:** пиксель-арт 16-bit, ностальгия по эпохе, когда программисты были «магами».
- **Социальный контекст:** игра живёт в рабочих чатах — Daily Battle, шеринг мемов, реферальные ссылки.
- **Известные технические проблемы:** залипание восстановления энергии, неактивный стресс-оффер, отсутствие тестов на фронтенде и боте, SQL-инъекция в leaderboard.js, unrestricted CORS, hardcoded IP и URL.
- **Монетизация:** Telegram Stars (XTR) для покупок, без агрессивных пейволлов. Ad integrations (AdsGram/AdMob/Yandex) — proof verification существует.

## Constraints

- **Tech stack:** Node.js 20, Express 4, PostgreSQL, Preact 10, Phaser 3.60, grammy, Vite 5. Сохраняем текущий стек.
- **Timeline:** дорожная карта рассчитана на 2–3 месяца (9 недель).
- **Platform:** Telegram Mini App — ограничения WebView, работа через initData.
- **Compatibility:** должен работать на мобильных устройствах (основная платформа Mini App).
- **Performance:** бэкенд на Express + PostgreSQL без кэширующего слоя — нужно держать горячие пути лёгкими.
- **Security:** нельзя допустить подделку игровых переменных — мемы и ачивки формируются на бэкенде.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Отказ от токеномики и агрессивных пейволлов | Любовь аудитории важнее быстрой монетизации | — Pending |
| Юмор и мемогенерация как приоритет №1 | Дифференциация от других тапалок, виральность | — Pending |
| Пиксель-арт 16-bit вместо современного 3D | Ностальгия, низкий вес ассетов, узнаваемый стиль | — Pending |
| Battle Pass только бесплатный трек | Вовлечение без давления, монетизация через Stars позже | — Pending |
| Сохранение текущего трёхуровневого стека | Ускорение разработки, команда знает стек | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state (users, feedback, metrics)

---
*Last updated: 2026-05-20 after initialization*
