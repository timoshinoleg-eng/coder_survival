---
phase: "01"
name: "Critical Fixes & Core Loop Polish"
mode: mvp
tdd_mode: enabled
walking_skeleton: enabled
wave_count: 4
task_count: 13
depends_on: []
files_modified:
  - backend/src/utils/progression.js
  - backend/src/routes/state.js
  - backend/src/routes/tap.js
  - backend/src/config/balance.js
  - backend/src/utils/pass.js
  - frontend/src/hooks/useTelegram.js
  - frontend/src/hooks/useGameState.js
  - frontend/src/game/scenes/GameScene.js
  - frontend/src/components/PassPanel.jsx
  - frontend/src/components/DailyQuestsPanel.jsx
  - frontend/src/components/Confetti.jsx
  - backend/tests/phase1.energyThreshold.test.js
  - backend/tests/phase1.stressV2.test.js
  - backend/tests/phase1.routesSmoke.test.js
autonomous: false
---

# Phase 01 Plan: Critical Fixes & Core Loop Polish

**Цель:** Исправить критические баги и восстановить доверие к core gameplay loop перед добавлением новых фич. В scope: энергия, депрессия/economy, обратная связь при тапе, прогресс квестов.

**Требования:** TECH-01, TECH-02, TECH-03, TECH-04

**TDD Mode:** Все изменения бизнес-логики и API endpoint сначала покрываются фейлящимся тестом (RED), затем реализацией (GREEN), затем рефакторингом (REFACTOR).

**Walking Skeleton:** См. `01-SKELETON.md` — описание минимального end-to-end скелета проекта.

---

## Wave 1: TDD Foundation + Energy Recovery Fix (TECH-01)

### Зависимости
- Нет upstream-зависимостей.
- Блокирует Wave 2 (state-контракты), Wave 3 (useGameState toast).

---

<task id="P01-W1-T1">
  <type>tdd</type>
  <title>RED: Написать фейлящиеся тесты для 5-минутного порога восстановления энергии</title>
  <requirement>TECH-01</requirement>
  <read_first>
    - backend/src/utils/progression.js (строки 70–154)
    - backend/tests/helpers/testDb.js
    - backend/tests/helpers/testServer.js
    - backend/tests/smoke.idleEnergyRegen.test.js (reference)
  </read_first>
  <acceptance_criteria>
    1. Файл backend/tests/phase1.energyThreshold.test.js создан.
    2. Тест «idle < 5 minutes does not recover energy» падает (RED) — energy остаётся неизменной, checkpoint_at не сдвигается.
    3. Тест «idle >= 5 minutes recovers energy and advances checkpoint» падает (RED) — ожидает recovered > 0.
    4. Тест «idle >= 5 minutes returns idleRecovery in response» падает (RED) — ожидает поле idleRecovery.energy в JSON /api/state.
    5. Тест «multiple rapid visits do not double-recover» падает (RED).
    6. Все тесты используют describeIfDb и паттерн beforeAll/beforeEach/afterAll из существующих тестов.
  </acceptance_criteria>
  <action>
    Создать backend/tests/phase1.energyThreshold.test.js с 4 тест-кейсами.
    Seed-логика: INSERT INTO progression (user_id, energy, energy_recovery_checkpoint_at) VALUES (900000001, 50, NOW() - INTERVAL '3 minutes').
    Запустить `cd backend && npm test -- --testPathPattern="phase1.energyThreshold"` — убедиться, что ≥2 теста падают.
  </action>
</task>

<task id="P01-W1-T2">
  <type>implementation</type>
  <title>GREEN: Реализовать 5-минутный порог в recoverProgression()</title>
  <requirement>TECH-01</requirement>
  <read_first>
    - backend/src/utils/progression.js (строки 70–154)
    - backend/src/config/balance.js (STRESS_V2, ENERGY_RECOVERY_INTERVAL_SECONDS)
  </read_first>
  <acceptance_criteria>
    1. Константа MIN_RECOVERY_THRESHOLD_SECONDS = 300 добавлена в начало backend/src/utils/progression.js.
    2. Переменная shouldRecoverEnergy = secondsPassed >= MIN_RECOVERY_THRESHOLD_SECONDS.
    3. energyRecovered вычисляется только при shouldRecoverEnergy === true, иначе 0.
    4. Passive depression decay (STRESS_V2.DEPRESSION_PASSIVE_DECAY_PER_HOUR) применяется независимо от порога (сохраняется существующее поведение для idle >= 1 часа).
    5. При energyRecovered <= 0 функция возвращает текущую progression без сдвига checkpoint_at для случаев < 5 минут.
    6. Возвращаемый объект содержит поле _idleRecovery: { energy: actualRecovered, secondsIdle: secondsPassed } | null.
    7. Тесты из P01-W1-T1 проходят (GREEN).
  </acceptance_criteria>
  <action>
    Внести изменения в backend/src/utils/progression.js:
    - Добавить const MIN_RECOVERY_THRESHOLD_SECONDS = 300;
    - После вычисления secondsPassed добавить shouldRecoverEnergy gate;
    - energyRecovered = shouldRecoverEnergy ? Math.floor(secondsPassed / interval) : 0;
    - При раннем возврате (energyRecovered <= 0) для случаев < 5 минут — НЕ обновлять checkpoint_at;
    - При обычном recovery добавить _idleRecovery в return-объект.
    Перезапустить тесты P01-W1-T1.
  </action>
</task>

<task id="P01-W1-T3">
  <type>implementation</type>
  <title>REFACTOR: Вернуть idleRecovery в ответе /api/state и прокинуть во фронтенд</title>
  <requirement>TECH-01</requirement>
  <read_first>
    - backend/src/routes/state.js (строки 275–280, 376–477)
    - frontend/src/hooks/useGameState.js (applyServerState, строки 131–254)
  </read_first>
  <acceptance_criteria>
    1. В backend/src/routes/state.js поле _idleRecovery из recoverProgression() прокидывается в JSON-ответ как idleRecovery (без подчёркивания).
    2. Если idleRecovery.energy > 0, ответ содержит idleRecovery с полями energy, secondsIdle.
    3. В frontend/src/hooks/useGameState.js, внутри applyServerState(), при payload.idleRecovery?.energy > 0 вызывается showToast(`⚡ Восстановлено +${payload.idleRecovery.energy} энергии за время отсутствия`, 'success', 1500).
    4. Тост неблокирующий; игрок может тапать сразу.
  </acceptance_criteria>
  <action>
    backend/src/routes/state.js:
    - После вызова recoverProgression() извлечь _idleRecovery;
    - Добавить в response-объект idleRecovery: recovered || null.

    frontend/src/hooks/useGameState.js:
    - В applyServerState после обновления state проверить payload.idleRecovery?.energy;
    - Вызвать showToast с фиксированным сообщением.

    Запустить backend-тесты из P01-W1-T1 + ручной smoke frontend.
  </action>
</task>

---

## Wave 2: Stress V2 Activation (TECH-02)

### Зависимости
- Wave 1 (T01-W1-T1..T3) — стабильный recoverProgression и state-контракт.
- Может выполняться параллельно с Wave 3 после завершения Wave 1.

---

<task id="P01-W2-T1">
  <type>tdd</type>
  <title>RED: Написать фейлящиеся тесты для активации stress_v2 и порога 20%</title>
  <requirement>TECH-02</requirement>
  <read_first>
    - backend/src/routes/state.js (строка 226)
    - backend/src/routes/tap.js (строка 215)
    - backend/src/utils/offers.js (строки 99–101)
    - backend/src/config/balance.js (CONTEXT_OFFER_RULES.high_stress)
  </read_first>
  <acceptance_criteria>
    1. Файл backend/tests/phase1.stressV2.test.js создан.
    2. Тест «GET /api/state sets featureFlags.stress_v2 = true» падает (RED) — ожидает true вместо A/B-modulus.
    3. Тест «high_stress offer triggers at depression 20%» падает (RED) — seed user с depression=20, ожидает contextOffer.type === 'high_stress'.
    4. Тест «high_stress offer does NOT trigger at depression 19%» падает (RED).
    5. Тест «passive depression decay applies after 1 hour idle» падает (RED) — ожидает depression < initial после 2 часов idle.
  </acceptance_criteria>
  <action>
    Создать backend/tests/phase1.stressV2.test.js.
    Использовать testDb seed: INSERT progression (user_id, depression_level, energy_recovery_checkpoint_at) с нужными значениями.
    Запустить `cd backend && npm test -- --testPathPattern="phase1.stressV2"` — убедиться, что тесты падают.
  </action>
</task>

<task id="P01-W2-T2">
  <type>implementation</type>
  <title>GREEN: Активировать stress_v2 universally и понизить порог до 20%</title>
  <requirement>TECH-02</requirement>
  <read_first>
    - backend/src/routes/state.js (строки 226, 234)
    - backend/src/routes/tap.js (строка 215)
    - backend/src/config/balance.js (CONTEXT_OFFER_RULES.high_stress.depressionThreshold)
  </read_first>
  <acceptance_criteria>
    1. backend/src/routes/state.js:226 — JSON.stringify({ stress_v2: true }) вместо telegramUser.id % 100 < 50.
    2. backend/src/routes/tap.js:215 — featureFlags: { stress_v2: true } вместо userId % 100 < STRESS_V2.AB_TEST_PERCENTAGE.
    3. backend/src/config/balance.js: depressionThreshold изменён с 55 на 20 (ключ CONTEXT_OFFER_RULES.high_stress.depressionThreshold).
    4. STRESS_V2.DEPRESSION_PASSIVE_DECAY_PER_HOUR остаётся 5.
    5. Тесты P01-W2-T1 проходят (GREEN).
  </acceptance_criteria>
  <action>
    Изменить 3 файла:
    - backend/src/routes/state.js: заменить A/B на stress_v2: true.
    - backend/src/routes/tap.js: заменить A/B на stress_v2: true.
    - backend/src/config/balance.js: depressionThreshold: 20.
    Перезапустить phase1.stressV2.test.js.
  </action>
</task>

<task id="P01-W2-T3">
  <type>refactor</type>
  <title>REFACTOR: Удалить dead A/B-переменные и проверить balance-консистентность</title>
  <requirement>TECH-02</requirement>
  <read_first>
    - backend/src/config/balance.js (все STRESS_V2 ключи)
    - CONFLICT_MATRIX.md (C-002, C-003)
  </read_first>
  <acceptance_criteria>
    1. Если STRESS_V2.AB_TEST_PERCENTAGE больше нигде не используется — удалить из balance.js.
    2. Проверить, что CONTEXT_OFFER_RULES.low_energy.threshold соответствует актуальному дизайну (оставить как есть, не менять в рамках TECH-02).
    3. Нет warning'ов в консоли при `npm test`.
  </acceptance_criteria>
  <action>
    Запустить `grep -r "AB_TEST_PERCENTAGE" backend/src/`; если только в balance.js — удалить ключ.
    Запустить полный backend test suite: `cd backend && npm test`.
  </action>
</task>

---

## Wave 3: Quest & Battle Pass Progress + Confetti (TECH-03)

### Зависимости
- Wave 1 (state-контракт stable).
- Может выполняться параллельно с Wave 2.

---

<task id="P01-W3-T1">
  <type>tdd</type>
  <title>RED: Написать фейлящийся тест для numeric XP в pass status</title>
  <requirement>TECH-03</requirement>
  <read_first>
    - backend/src/utils/pass.js (функции calculatePassLevel, normalizePassStatus, строки 192–218, 305–327)
    - backend/tests/stage2.oracles.test.js (reference)
  </read_first>
  <acceptance_criteria>
    1. Файл backend/tests/phase1.passXp.test.js создан (или расширен phase1.stressV2.test.js describe-блоком).
    2. Тест «normalizePassStatus includes nextLevelXp and remainingXp» падает (RED) — ожидает поля nextLevelXp, remainingXp в ответе.
    3. Тест использует seed progression с known current_xp и проверяет математику уровня.
  </acceptance_criteria>
  <action>
    Создать тестовый файл с beforeAll/beforeEach/afterAll.
    Seed: INSERT player_pass (user_id, current_xp) VALUES (900000002, 450) при уровне, где nextLevelXp = 500.
    Запустить тест — убедиться, что падает из-за отсутствия полей.
  </action>
</task>

<task id="P01-W3-T2">
  <type>implementation</type>
  <title>GREEN: Добавить nextLevelXp и remainingXp в normalizePassStatus</title>
  <requirement>TECH-03</requirement>
  <read_first>
    - backend/src/utils/pass.js (строки 305–327)
    - backend/src/routes/pass.js (формат ответа)
  </read_first>
  <acceptance_criteria>
    1. В backend/src/utils/pass.js, функция normalizePassStatus вызывает calculatePassLevel({ currentXp: status.playerPass.current_xp }).
    2. Результат включает nextLevelXp и remainingXp в нормализованный объект.
    3. Поля присутствуют в JSON-ответе /api/pass.
    4. Тест P01-W3-T1 проходит (GREEN).
  </acceptance_criteria>
  <action>
    В backend/src/utils/pass.js, внутри normalizePassStatus:
    - const levelMeta = calculatePassLevel(status.playerPass ? { currentXp: status.playerPass.current_xp } : {});
    - return { ..., nextLevelXp: levelMeta.nextLevelXp, remainingXp: levelMeta.remainingXp }.
    Перезапустить phase1.passXp.test.js.
  </action>
</task>

<task id="P01-W3-T3">
  <type>implementation</type>
  <title>Извлечь reusable компонент Confetti из LevelUpModal</title>
  <requirement>TECH-03</requirement>
  <read_first>
    - frontend/src/components/LevelUpModal.jsx (строки 7–36)
    - frontend/src/assets/animations.css (@keyframes confetti-fall)
  </read_first>
  <acceptance_criteria>
    1. Создан файл frontend/src/components/Confetti.jsx.
    2. Компонент экспортирует Confetti({ pieceCount = 18, duration = 1.2 }) с CSS-анимацией confetti-fall.
    3. LevelUpModal.jsx импортирует Confetti вместо inline-реализации.
    4. Нет регрессий в отображении LevelUpModal.
  </acceptance_criteria>
  <action>
    Скопировать логику выпадающих частиц из LevelUpModal.jsx в Confetti.jsx.
    Обновить LevelUpModal.jsx: заменить inline-код на <Confetti />.
    Проверить сборку frontend: `cd frontend && npm run build`.
  </action>
</task>

<task id="P01-W3-T4">
  <type>implementation</type>
  <title>Добавить numeric XP label и confetti при level-up в PassPanel</title>
  <requirement>TECH-03</requirement>
  <read_first>
    - frontend/src/components/PassPanel.jsx (строки 13–104)
    - frontend/src/hooks/useGameState.js (pass-объект, строка 213)
  </read_first>
  <acceptance_criteria>
    1. В PassPanel.jsx отображается строка вида «450 / 500 XP» (или аналогичная) с использованием pass.nextLevelXp и pass.remainingXp.
    2. При изменении pass.currentLevel вверх (useEffect, отслеживающий prevLevel !== currentLevel) рендерится <Confetti /> на 1.2 секунды.
    3. Анимация не блокирует взаимодействие с панелью.
  </acceptance_criteria>
  <action>
    PassPanel.jsx:
    - Добавить import Confetti from './Confetti.jsx';
    - Добавить локальный state [showConfetti, setShowConfetti] = useState(false);
    - Добавить useEffect(() => { ... }, [pass.currentLevel]);
    - Рендерить {showConfetti && <Confetti />} абсолютно позиционированным внутри панели.
    - Добавить <span> с XP-математикой: `${(pass.nextLevelXp || 0) - (pass.remainingXp || 0)} / ${pass.nextLevelXp || 0} XP`.
  </action>
</task>

<task id="P01-W3-T5">
  <type>implementation</type>
  <title>Добавить confetti при завершении daily-quest в DailyQuestsPanel</title>
  <requirement>TECH-03</requirement>
  <read_first>
    - frontend/src/components/DailyQuestsPanel.jsx (строки 1–269)
    - frontend/src/components/Confetti.jsx
  </read_first>
  <acceptance_criteria>
    1. В DailyQuestsPanel.jsx добавлен локальный state justCompletedQuestId.
    2. useEffect отслеживает изменение daily.quests: если quest переходит из completed === false в completed === true, устанавливается justCompletedQuestId = quest.id.
    3. При justCompletedQuestId !== null рендерится <Confetti /> на 1.2 секунды, затем state сбрасывается.
    4. Не конфликтует с существующим отображением ${quest.progressValue}/${quest.targetValue}.
  </acceptance_criteria>
  <action>
    DailyQuestsPanel.jsx:
    - import Confetti from './Confetti.jsx';
    - const [justCompletedQuestId, setJustCompletedQuestId] = useState(null);
    - useEffect(() => {
        const newlyCompleted = daily.quests.find(q => q.completed && prevQuests.find(p => p.id === q.id && !p.completed));
        if (newlyCompleted) { setJustCompletedQuestId(newlyCompleted.id); setTimeout(() => setJustCompletedQuestId(null), 1200); }
      }, [daily.quests]);
    - В JSX: {justCompletedQuestId && <Confetti />}
  </action>
</task>

---

## Wave 4: Tap Feedback — Haptic & Code Line Print (TECH-04)

### Зависимости
- Wave 1 (стабильный state / tap pipeline).
- Может выполняться параллельно с Wave 2 и Wave 3.

---

<task id="P01-W4-T1">
  <type>implementation</type>
  <title>Добавить navigator.vibrate fallback в useTelegram haptic()</title>
  <requirement>TECH-04</requirement>
  <read_first>
    - frontend/src/hooks/useTelegram.js (строки 9–19)
    - frontend/src/hooks/useGameState.js (вызов haptic при tap)
  </read_first>
  <acceptance_criteria>
    1. В frontend/src/hooks/useTelegram.js после блока tg?.HapticFeedback добавлен else-if с navigator.vibrate(10) для type === 'light'.
    2. Для medium → 15 мс, heavy → 20 мс (хотя в tap используется light).
    3. Проверка typeof navigator !== 'undefined' && navigator.vibrate присутствует.
    4. Существующий Telegram haptic не затронут.
  </acceptance_criteria>
  <action>
    StrReplaceFile в frontend/src/hooks/useTelegram.js:
    - После закрывающей скобки Telegram-блока добавить:
      else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(type === 'light' ? 10 : type === 'medium' ? 15 : 20);
      }
  </action>
</task>

<task id="P01-W4-T2">
  <type>implementation</type>
  <title>Добавить floating code-line text в GameScene.onTap()</title>
  <requirement>TECH-04</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js (строки 112–157, onTap)
    - frontend/src/game/PhaserGame.js (эмиттер событий 'tap')
  </read_first>
  <acceptance_criteria>
    1. В GameScene.js добавлен массив codeSnippets (≥8 строк: 'git commit -m "fix"', 'console.log("debug")', 'npm install hope', '/* TODO: sleep */', 'await coffee()', 'rm -rf node_modules', 'git push --force', '// it works on my machine').
    2. В onTap(data) после существующей particle-логики создаётся Phaser.Text с рандомным snippet.
    3. Текст: fontFamily 'monospace', fontSize '10px', color '#4ade80', alpha 0.9, origin 0.5.
    4. Tween поднимает текст на 50 px вверх и уводит alpha → 0 за 900 мс с destroy() onComplete.
    5. Позиция текста: cx + random(-60, 60), cy - 20 + random(-20, 20).
    6. Производительность: ≤1 text + 1 tween per tap, <0.1 ms на 60 fps.
  </acceptance_criteria>
  <action>
    В frontend/src/game/scenes/GameScene.js:
    - Добавить this.codeSnippets в create() или как module-level константу.
    - В onTap(data) добавить:
      const snippet = codeSnippets[Phaser.Math.Between(0, codeSnippets.length - 1)];
      const text = this.add.text(...).setOrigin(0.5);
      this.tweens.add({ targets: text, y: text.y - 50, alpha: 0, duration: 900, ease: 'Power1', onComplete: () => text.destroy() });
  </action>
</task>

<task id="P01-W4-T3">
  <type>tdd</type>
  <title>RED/GREEN: Написать smoke-тесты для защиты от регрессий tap-механики</title>
  <requirement>TECH-01, TECH-02, TECH-03, TECH-04</requirement>
  <read_first>
    - backend/src/routes/tap.js
    - backend/tests/smoke.idleEnergyRegen.test.js
    - backend/src/middleware/rateLimit.js
  </read_first>
  <acceptance_criteria>
    1. Файл backend/tests/phase1.routesSmoke.test.js создан.
    2. Тест «POST /api/tap still commits and decrements energy» проходит — убедиться, что 1 tap = -1 energy, +N commits.
    3. Тест «POST /api/tap respects rate limits» проходит — быстрая серия тапов не превышает RATE_LIMIT_MAX_TAPS_PER_SECOND.
    4. Тест «GET /api/state returns updated progression after tap» проходит.
    5. Все smoke-тесты GREEN после выполнения Wave 1–4.
  </acceptance_criteria>
  <action>
    Создать backend/tests/phase1.routesSmoke.test.js с 3 тест-кейсами.
    Seed: createInitData() + progression с energy=100.
    Запустить `cd backend && npm test -- --testPathPattern="phase1"` — все 3 файла тестов должны быть зелёными.
  </action>
</task>

---

## Verification Criteria (Общие критерии приёмки фазы)

1. **TECH-01:**
   - `npm test -- phase1.energyThreshold` — 4/4 теста зелёные.
   - Ручной smoke: открыть приложение, подождать <5 минут, energy не изменилась; подождать ≥5 минут, energy восстановилась, появился тост.

2. **TECH-02:**
   - `npm test -- phase1.stressV2` — 4/4 теста зелёные.
   - Ручной smoke: depression ≥20% → появляется high_stress offer; depression <20% → не появляется.

3. **TECH-03:**
   - `npm test -- phase1.passXp` — 1/1 тест зелёный.
   - Ручной smoke: в PassPanel видна строка XP «X / Y»; при level-up — конфетти; при завершении квеста — конфетти.

4. **TECH-04:**
   - Ручной smoke на устройстве: каждый tap даёт haptic (Telegram WebView) или vibration (браузер).
   - В GameScene при каждом tap падает зелёная строка кода с анимацией исчезновения.

5. **Zero Regression:**
   - `cd backend && npm test` — полный suite проходит (включая существующие smoke, oracles, stage2–4).
   - `cd frontend && npm run build` — сборка без ошибок.

---

## must_haves (Goal-Backward Verification)

| Goal | must_have | Как проверить |
|------|-----------|---------------|
| Энергия не сбрасывается при открытии | recoverProgression() не сдвигает checkpoint_at при idle < 300 сек | phase1.energyThreshold.test.js: test 1 |
| Энергия восстанавливается после 5+ минут | secondsPassed >= 300 → energyRecovered > 0 | phase1.energyThreshold.test.js: test 2 |
| Игрок видит восстановленную энергию | /api/state содержит idleRecovery; toast показывается | phase1.energyThreshold.test.js: test 3 + ручной QA |
| Стресс-оффер активен на 20% | featureFlags.stress_v2 === true; threshold === 20 | phase1.stressV2.test.js: test 1, 2 |
| Стресс-оффер не мisfires на 19% | threshold gate строгий | phase1.stressV2.test.js: test 3 |
| Пассивная депрессия decay работает | DEPRESSION_PASSIVE_DECAY_PER_HOUR = 5 применяется при idle >= 1 час | phase1.stressV2.test.js: test 4 |
| Battle Pass показывает числа | normalizePassStatus возвращает nextLevelXp, remainingXp | phase1.passXp.test.js |
| Конфетти на завершении квеста | DailyQuestsPanel рендерит Confetti при completed → true | Ручной QA / dev-tools |
| Конфетти на level-up пасса | PassPanel рендерит Confetti при currentLevel++ | Ручной QA / dev-tools |
| Haptic на каждый tap | useTelegram.haptic() вызывается с fallback | Ручной QA на устройстве |
| Печать строк на каждый tap | GameScene.onTap создаёт Phaser.Text + tween | Ручной QA / dev-tools |
| Нет регрессий | phase1.routesSmoke + полный suite проходят | CI / npm test |

---

## Dependencies & Waves (Parallel Execution)

```
Wave 1: TDD Foundation + Energy Recovery (TECH-01)
├── P01-W1-T1 [tdd] RED tests energy threshold
├── P01-W1-T2 [impl] GREEN recoverProgression() gate
└── P01-W1-T3 [impl] REFACTOR idleRecovery in /api/state + toast

Wave 2: Stress V2 Activation (TECH-02)        [parallel with Wave 3 after W1]
├── P01-W2-T1 [tdd] RED tests stress_v2
├── P01-W2-T2 [impl] GREEN activate flags + threshold 20%
└── P01-W2-T3 [refactor] Remove dead A/B vars

Wave 3: Quest & Pass Progress + Confetti (TECH-03) [parallel with Wave 2 after W1]
├── P01-W3-T1 [tdd] RED test pass numeric XP
├── P01-W3-T2 [impl] GREEN normalizePassStatus XP
├── P01-W3-T3 [impl] Extract Confetti component
├── P01-W3-T4 [impl] PassPanel numeric XP + confetti
└── P01-W3-T5 [impl] DailyQuestsPanel confetti

Wave 4: Tap Feedback (TECH-04)                [parallel with Wave 2 & 3 after W1]
├── P01-W4-T1 [impl] Haptic fallback navigator.vibrate
├── P01-W4-T2 [impl] Phaser floating code line
└── P01-W4-T3 [tdd] GREEN smoke tests regression
```

**Execution Order Recommendation:**
1. Start Wave 1 (T1→T2→T3 sequentially).
2. После T2 (GREEN energy gate) можно параллельно запускать Wave 2, Wave 3, Wave 4.
3. Wave 4-T3 (smoke) запускать последним, после завершения всех имплементаций.

**Risk Mitigation:**
- Если `calculatePassLevel` в pass.js не экспортирует `nextLevelXp` / `remainingXp` — расширить return-объект функции.
- Если frontend build ломается из-за Confetti.jsx — проверить, что @keyframes confetti-fall существует в animations.css.
- Если Phaser.Text вызывает perf-проблемы на слабых устройствах — снизить duration до 600 мс или ограничить max одновременных текстов до 5 (pool).
