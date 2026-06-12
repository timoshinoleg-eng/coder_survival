# Промпт для новой сессии: починка backend-тестов

## Контекст

Ты продолжаешь работу над проектом **Coder Survival** — Telegram Mini App clicker-игра. Стек backend: Node.js 20, Express 4, PostgreSQL, raw SQL через `pg`, ESM (`"type": "module"`).

В предыдущей сессии были починены два тестовых файла:
- `backend/tests/tap.test.js` — 7/7 ✅
- `backend/tests/buy.internalPayments.test.js` — 8/8 ✅

Однако весь бэкенд-сьют всё ещё красный. Нужно довести его до зелёного состояния, после чего перейти к чеклисту готовности к продакшену.

## Обязательно прочти перед стартом

1. `.planning/SESSION_HANDOFF_TEST_FIXES.md` — полное состояние дел, категории упавших тестов, playbook диагностики.
2. `.planning/HANDOFF.json` — краткая сводка и список изменённых файлов.
3. `backend/tests/tap.test.js` и `backend/tests/buy.internalPayments.test.js` — образцы правильного паттерна моков после фикса.

## Главный паттерн, который нужно применять

Большинство падений — из-за хрупкого SQL-матчинга в моках. Роуты используют многострочные template literals, а тесты проверяют `s.includes('select ... from ...')` с одним пробелом. Из-за `\n` между ключевыми словами совпадения не происходит.

**Решение:** нормализовать SQL перед матчингом:

```js
function normalizeSql(sql) {
  const s = (typeof sql === 'string' ? sql : sql?.text || '').toLowerCase();
  return s.replace(/\s+/g, ' ');
}
```

Использовать во всех `mockQuery.mockImplementation((sql) => { const s = normalizeSql(sql); ... })`.

## План работы на сессию

### Шаг 1. Подтверди базовую картину

Запусти полный сьют и убедись, что цифры совпадают с handoff (~19 failed suites, ~65 failed tests):

```powershell
cd backend
npm test
```

### Шаг 2. Чини по приоритету

Выбирай одну категорию за раз. Для каждого упавшего сьюта:

1. Запусти его изолированно:
   ```powershell
   cd backend
   npm test -- tests/ИМЯ_ФАЙЛА.test.js
   ```
2. Найди первую упавшую проверку. Определи, возвращает ли мок пустой `rows` там, где не должен.
3. Временно добавь внутрь `mockQuery.mockImplementation`:
   ```js
   console.log('SQL RAW:', JSON.stringify(sql));
   ```
4. Если SQL многострочный — примени `normalizeSql()`.
5. Если SQL-матчинг уже нормализован, а тест всё равно падает — сравни ожидания теста с текущими значениями в `backend/src/config/balance.js` (`STAGE2.PASS`, `STRESS_V2`, веса random events). Возможно, конфиг менялся, а тесты — нет.
6. После фикса удали/не оставляй отладочные `console.log`.

### Шаг 3. Проверяй ширину после каждого фикса

После починки каждого сьюта перезапускай **полный** сьют:

```powershell
cd backend
npm test
```

Цель: поймать side-effects и interaction failures.

### Шаг 4. Целевое состояние

Все backend-тесты должны быть зелёными:

```
Test Suites: 35 passed, 35 total
Tests:       342 passed, 342 total
```

## Приоритет категорий (от высокого к низкому)

1. **Pass / sprint-pass** — `stage2.oracles.test.js`, `phase1.passXp.test.js`, `phase2.integration.test.js`, `phase4.unit.test.js`, `mvp.performanceStatic.test.js`, `loginReward.timezone.test.js`, `stage2.routes.test.js`.
   - Подозрение: дрейф конфига `STAGE2.PASS` (количество уровней, XP, длительность сезона).
2. **Random events / stage4 oracles** — `stage4.oracles.test.js`, `mvp.randomEvents.test.js`.
   - Подозрение: веса ивентов изменились (ожидалось 40/45/15, получено 47/38/15).
3. **Depression / energy decay** — `progression.passiveDecay.test.js`, `phase1.stressV2.test.js`, `phase1.energyThreshold.test.js`, `smoke.idleEnergyRegen.test.js`.
   - Подозрение: формула `recoverProgression` или константы `STRESS_V2`.
4. **Login reward sync + achievements** — `loginQuestSync.test.js`, `achievements.integration.test.js`.
   - Подозрение: тот же SQL-матчинг.

## Чего избегать

- **Не** переписывай логику роутов ради тестов без явной необходимости. Минимальные изменения — только в тестах и, если однозначно нужно, в конфиге.
- **Не** запускай git commit / push без явного запроса пользователя.
- **Не** добавляй новые зависимости.
- **Не** меняй API-контракты.

## Чекпоинты перед завершением сессии

- [ ] Полный `npm test` в `backend/` показывает 0 failed suites / 0 failed tests.
- [ ] Все добавленные для отладки `console.log` удалены.
- [ ] Изменённые файлы задокументированы в конце сессии.
- [ ] Обновлён `.planning/HANDOFF.json` и/или создан `.planning/SESSION_HANDOFF_*.md` с описанием того, что осталось (если сьют ещё не полностью зелёный).

## Полезные команды

```powershell
# Один сьют
npm test -- tests/progression.passiveDecay.test.js

# Один тест по имени
npm test -- tests/stage4.oracles.test.js --testNamePattern "weight sum"

# Вербозный вывод
npm test -- tests/phase1.passXp.test.js --verbose

# Полный сьют
npm test
```

## Контакты / эскалация

Если обнаружишь, что падение теста связано не с моками и не с конфигом, а с реальной багой в бизнес-логике — зафиксируй это отдельно в handoff и сообщи пользователю перед тем, как менять код в `src/routes/` или `src/utils/`.
