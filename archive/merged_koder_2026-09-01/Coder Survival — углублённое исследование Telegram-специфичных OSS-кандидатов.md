# Coder Survival — углублённое исследование Telegram-специфичных OSS-кандидатов

**Дата проверки:** 20 августа 2026 г.  
**Автор:** Manus AI  
**Статус:** заменяет прежний обзор; в нём исключены общие fetch, Phaser, migration, React-template и visual-regression кандидаты, не закрывающие подтверждённый пробел Coder Survival.

## Executive summary

Повторный поиск был намеренно сужен до **Telegram Mini App / WebView lifecycle** и проверки `initData`: именно здесь ревью-копия Coder Survival имеет конкретные, проверяемые пробелы. В проекте уже существуют безопасный API-клиент с отменой, Preact DOM overlay поверх однократно создаваемого Phaser canvas, error boundary, static CSS safe area и server-authoritative middleware проверки Telegram `initData`. Поэтому общие retry-клиенты, Phaser/React starters, migration tools, полный SDK и графические тестовые платформы не являются улучшениями малого риска.

Из **15 Telegram-специфичных GitHub источников** два реальных улучшения проходят все архитектурные gates, однако оба должны быть приняты только как **PATTERN ONLY** — без новой production dependency и без копирования upstream source. На первом месте находится узкий lifecycle adapter для динамических `viewportChanged` и `themeChanged` contracts с guaranteed cleanup. Его доказательная база — изолированный event-emitter и глубокая viewport feature в активно сопровождаемом MIT `Telegram-Mini-Apps/tma.js`. [1] [2] [3] На втором месте — synthetic contract-test suite для уже существующего `initData` middleware, ориентированный на failure/expiry/Ed25519 branches, а не на замену server-side security logic. [4]

> **Решение.** Единственный следующий PR должен реализовать небольшой local adapter для динамических viewport/theme updates и его node tests. Он не добавляет зависимостей, не меняет API, игровую экономику, платежи, server authority или runtime assets. Контракты BackButton и closing confirmation намеренно не включены: в текущем UI не доказана потребность в app-level back navigation, поэтому их добавление было бы спекулятивным.

## Что фактически есть и чего не хватает

Локальный review показал, что `frontend/src/App.jsx` уже единожды вызывает `ready()`, `expand()`, `disableVerticalSwipes()`, `setHeaderColor()` и `setBackgroundColor()`. Однако этот mount effect не подписывается на изменение темы, viewport, safe area или content safe area. `frontend/src/hooks/useTelegram.js` поллит доступность `window.Telegram.WebApp`, выдаёт текущие haptics/share/initData/MainButton helpers, но не предоставляет capability model, lifecycle cleanup или отдельный test seam. В `frontend/tests/` есть только `api.test.mjs` и `payments.test.mjs`.

В то же время `frontend/index.html` уже использует `viewport-fit=cover`, `100dvh` и CSS `env(safe-area-inset-*)`. Это хорошая static baseline, но она не обновляет layout по Telegram WebView events. Наличие этой базы означает, что нужен не новый UI framework, а лишь узкий адаптер динамических данных. На backend `backend/src/middleware/initData.js` уже проверяет HMAC, Ed25519, `timingSafeEqual` и часовой replay window; в `backend/tests/` нет специализированного `initData` test file. Это даёт обоснованный P1 только для tests, не для replacement middleware.

| Подтверждённый gap | Владелец в Coder Survival | Из scope исключено | Причина |
|---|---|---|---|
| Динамические theme/viewport/safe-area lifecycle contracts | `App.jsx`, `useTelegram.js`, `index.html` | React/Next/Phaser templates | Потребуют миграции со связки Preact + Phaser, а не изолированной правки |
| Deterministic cleanup при Telegram events | `useTelegram.js` | Полный `@tma.js/sdk` и `@tma.js/bridge` runtime import | Новая dependency graph и дублирование уже загруженного official WebApp runtime |
| Security regression coverage `initData` | `backend/src/middleware/initData.js` | Python/Go validation libraries, server replacement | Node 20/Express server уже содержит authoritative validation; иной runtime меняет trust boundary |
| Mobile visual acceptance | dev-only visual fixtures | Generic screenshot SaaS/visual platforms | Уже есть 360×800 и 390×844 fixture evidence; нужен только WebView-specific manual gate |

## Воронка Telegram-специфичных кандидатов

Ниже перечислены все 15 источников второй воронки. Для каждого были проверены публичные GitHub metadata (license, archived, activity) и репозиторная применимость. Source/test review выполнялся только после прохождения hard gates. Эта последовательность предотвращает углублённый анализ проектов, которые нельзя законно либо технически принять.

| Источник | Релевантность к подтверждённому gap | License / состояние | Вердикт |
|---|---|---|---|
| [Telegram-Mini-Apps/tma.js](https://github.com/Telegram-Mini-Apps/tma.js) | Bridge events, viewport, init-data contracts | MIT; активен, latest repo release 2026-07-14 [1] [2] | **SHORTLIST** — только отдельные pattern/test targets |
| [TelegramMessenger/TGMiniAppsJsSDK](https://github.com/TelegramMessenger/TGMiniAppsJsSDK) | Official WebApp API reference | MIT, но 2 commits, последний 2024-02-01; тестов нет [5] | API reference only; не source candidate |
| [RAprogramm/telegram-webapp-sdk](https://github.com/RAprogramm/telegram-webapp-sdk) | Mock и wrapper | Root LICENSE не подтверждён metadata | REJECT: legal gate |
| [telegram-mini-apps-dev/vanilla-js-boilerplate](https://github.com/telegram-mini-apps-dev/vanilla-js-boilerplate) | Vanilla TMA example | MIT, но starter без проверенного test harness | REJECT: нет доказуемого малого component |
| [Farfosh/telegram-web-app-pro-bot](https://github.com/Farfosh/telegram-web-app-pro-bot) | API playground | MIT, но полный bot/example application | REJECT: не isolated component |
| [NekitCorp/telegram-web-app-playground](https://github.com/NekitCorp/telegram-web-app-playground) | Manual feature testing | Полный interactive playground | REJECT: не встраиваемый test harness |
| [revenkroz/telegram-web-app-bot-example](https://github.com/revenkroz/telegram-web-app-bot-example) | Plain JS WebApp example | Root LICENSE не подтверждён metadata | REJECT: legal gate |
| [Telegram-Mini-Apps/reactjs-template](https://github.com/Telegram-Mini-Apps/reactjs-template) | TMA lifecycle reference | MIT, но React template | REJECT: Preact migration surface |
| [Telegram-Mini-Apps/nextjs-template](https://github.com/Telegram-Mini-Apps/nextjs-template) | TMA lifecycle reference | Root LICENSE не подтверждён metadata; Next template | REJECT: legal + framework gate |
| [vkruglikov/react-telegram-web-app](https://github.com/vkruglikov/react-telegram-web-app) | React wrapper | MIT, archived | REJECT: archived + React dependency |
| [codedpro/react-telegram-miniapp](https://github.com/codedpro/react-telegram-miniapp) | React tools | Root LICENSE не подтверждён metadata | REJECT: legal + React gate |
| [wearevolt/test-telegram-webapp](https://github.com/wearevolt/test-telegram-webapp) | Test project | Root LICENSE не подтверждён; last push 2023-03-24 | REJECT: legal + stale gate |
| [iCodeCraft/telegram-init-data](https://github.com/iCodeCraft/telegram-init-data) | initData validation | MIT, но Python/FastAPI | REJECT: incompatible server runtime |
| [kirillNay/tg-mini-app](https://github.com/kirillNay/tg-mini-app) | Mini App client API | MIT, но Kotlin/Compose | REJECT: incompatible client runtime |
| [TelegramOrg/Telegram-web-z](https://github.com/TelegramOrg/Telegram-web-z) | Telegram Web reference | GPL-3.0 | REJECT: copyleft/license gate |

## Глубокий technical, license и security review

`@tma.js/bridge` v2.3.3 является ESM/CJS package с `sideEffects: false` и Vitest suite. Его `emitter.ts` явно обрабатывает несколько Telegram event ports и экспортирует `on`, `off`, `emit` и `offAll`; `emitter.test.ts` покрывает `viewport_changed`, `theme_changed`, `once`, explicit unsubscribe и coexistence с Telegram SDK. [2] [3] Это надёжное evidence именно для **idempotent subscription и cleanup pattern**.

Однако прямое подключение `@tma.js/bridge` неприемлемо: manifest объявляет девять runtime dependencies, включая собственные workspace packages, `fp-ts`, `mitt` и `valibot`. [3] Кроме bundle/license/SCA surface, runtime bridge вмешивается в Telegram ports (`TelegramGameProxy`, `Telegram.WebView.receiveEvent`), хотя Coder Survival уже загружает official script из `telegram.org`. Следовательно, `DEPENDENCY` и `ISOLATED ADAPTATION` source emitter отклоняются; небольшая самостоятельная реализация публичных `tg.onEvent`/`tg.offEvent` contracts — единственный безопасный режим.

Глубокая Viewport feature tma.js полезна как product pattern: она хранит stable height, реагирует на safe/content-safe area updates и может возвращать функцию остановки CSS-variable binding. Но `Viewport.ts` имеет 551 строку и зависит от bridge, signals, toolkit, async/state abstractions и `fp-ts`; feature-local `Viewport.test.ts` в tree отсутствует. [6] Поэтому её нельзя называть «малой библиотекой» или переносить в проект. Она лишь определяет точный набор ограничений будущего adapter: без state framework, без direct WebView port patching, с guarded handlers и cleanup.

Корневая лицензия tma.js — MIT, Copyright (c) 2025 Vladislav Kibenko; она допускает использование и модификацию при сохранении copyright и permission notice в копиях или substantial portions. [7] В рекомендуемом PR исходный код, fixtures и API implementation не копируются, поэтому third-party notice в product files не требуется. В PR description следует оставить URL, commit/review date и пометку `PATTERN ONLY`. Если review обнаружит даже частичное дословное заимствование, PR блокируется до добавления точного MIT notice и legal review.

GitHub security overview tma.js показывает отсутствие `SECURITY.md` и отсутствие опубликованных security advisories. Это **не доказательство отсутствия уязвимостей**. [8] Риск снижается тем, что в рекомендуемом PR нет новой dependency, import, network call или production server change; существующий dependency scanning/CI остаётся обязательным. Official `TGMiniAppsJsSDK` подтверждает, что WebApp runtime предоставляет `BackButton` и closing confirmation с version guards, но не имеет test tree и давно не обновлялся; его использовать только как API provenance reference, а не source implementation. [5] [9]

## Shortlist и решение по топ-3

Оценка дана по шкале 0–5 и вычислена по указанным весам. Hard gate важнее балла: кандидаты с неприемлемым dependency или behavior surface не разрешаются даже при высоком итоговом score.

| Место | Кандидат и режим | Architecture fit 25% | Mobile value 20% | Provenance/license 20% | Integration 15% | Testability 15% | Perf/security 5% | Итог | Решение |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Local lifecycle adapter, **PATTERN ONLY** по tma.js bridge + viewport | 5 | 5 | 5 | 4 | 4 | 5 | **4.70** | РЕКОМЕНДОВАТЬ следующий PR |
| 2 | `initData` synthetic contract tests, **PATTERN ONLY** по init-data-node | 5 | 2 | 4 | 5 | 4 | 5 | **4.05** | P1 после lifecycle PR |
| 3 | Direct `@tma.js/bridge` dependency | 4 | 5 | 4 | 2 | 5 | 3 | **4.00** | **REJECT**: 9 runtime dependencies и port rewiring |

**Первый кандидат** даёт измеримую mobile/WebView ценность: динамически корректирует container height/visual variables после host viewport/theme events, сохраняя current Phaser canvas + Preact overlay architecture. Он не трогает frontend API layer, tap queue или backend. **Второй** повышает trust в уже существующем security perimeter и добавляет только tests. **Третий** логически релевантен, но его выгода не оправдывает новый transitive dependency и возможное взаимодействие с уже подключённым Telegram script.

## Один рекомендуемый PR — только план

| Поле | План |
|---|---|
| Безопасная ветка | `manus/telegram-viewport-lifecycle-contracts` |
| Название PR | `feat(webview): синхронизировать Telegram viewport и theme lifecycle` |
| Режим | **PATTERN ONLY**. Никакого package install, vendoring, source copy, asset transfer, network change или upstream test fixture. |
| Existing files | `frontend/src/hooks/useTelegram.js`: добавить маленький capability-guarded lifecycle API и cleanup contract. `frontend/src/App.jsx`: вызывать один lifecycle mount/unmount path, сохранив существующие `ready`, `expand`, swipe и color calls. `frontend/index.html`: только если понадобится подключить уже вычисленные CSS custom properties к root height/padding с non-Telegram fallbacks. |
| New test file | `frontend/tests/telegramLifecycle.test.mjs`, основанный на существующем `node --test` подходе, с local mock `Telegram.WebApp`; имя до merge сверить с actual test scripts. |
| Разрешённое поведение | При наличии public `tg.onEvent` подписаться на `viewportChanged` и `themeChanged`; вычислить только локальные CSS properties из public WebApp state; проверить функции `offEvent`; безопасно no-op при отсутствии API/старом host. Не добавлять BackButton, closing confirmation, event-port patching, `initData` storage или new global state. |
| Test gates | Unit: отсутствующий `window.Telegram`; отсутствующий `onEvent/offEvent`; duplicate mount; explicit cleanup; event after cleanup; theme/viewport property update; `ready/expand` only under feature detection. Smoke: existing frontend tests and production build. |
| Visual/mobile gates | Сравнить existing dev-only fixtures на 360×800 и 390×844 до/после. Обязательная ручная evidence: Telegram Android и iOS — launch, dynamic theme change, keyboard/resize where supported, background/foreground, no clipped hero/CTA, no duplicate handlers. Browser-only evidence не заменяет этот gate. |
| Performance/security gates | Prove no new `dependencies`/lockfile changes; compare bundle artifacts; no new requests; no logging or retention of `initData`; server verification, rate limits, anti-cheat, payments и economy untouched. |
| Rollback | Revert один adapter module, один mount effect, test file и, если добавлена, CSS-variable binding. Нет schema/data migration, dependency removal или state repair. |
| Не менять | Баланс, anti-cheat, database, migrations, API contracts, authority server calculations, payments, ads, assets, audio, deployment, `main` и любые production credentials. |

## Явные неопределённости и ручные проверки

| Неопределённость | Почему нельзя утверждать автоматически | Gate перед merge |
|---|---|---|
| Telegram host/version capability matrix | Не исследовались реальные Android/iOS session data, а API доступны не всем hosts | Зафиксировать Telegram client/version и capability matrix на двух реальных устройствах |
| Семантика `safeAreaChanged`/`contentSafeAreaChanged` в целевых host versions | Static CSS `env()` уже работает; дополнительное dynamic binding может не дать выигрыша или вызвать layout churn | Добавлять эти handlers только после device evidence; MVP ограничить `viewportChanged`/`themeChanged` |
| Текущий frontend test runner и DOM mocking | В репозитории есть только два named frontend test files; новый test должен следовать их actual scripts | Открыть scripts/harness в PR preparation, не предполагать Vitest/JSDOM |
| initData test oracle | Negative vectors легко создать, но valid signed fixtures нельзя подменять сгенерированным суррогатом | P1 security review, synthetic fixtures без token; valid HMAC/Ed25519 cases только с independently verified expected result |
| Upstream security status | No advisories/SECURITY.md не доказывают безопасность | Keep CI/SCA; не устанавливать tma.js packages в этом PR |

## References

[1]: https://github.com/Telegram-Mini-Apps/tma.js "Telegram-Mini-Apps/tma.js repository and activity"
[2]: https://github.com/Telegram-Mini-Apps/tma.js/tree/master/packages/bridge "@tma.js/bridge README and source tree"
[3]: https://github.com/Telegram-Mini-Apps/tma.js/blob/master/packages/bridge/package.json "@tma.js/bridge v2.3.3 manifest"
[4]: https://github.com/Telegram-Mini-Apps/tma.js/tree/master/packages/init-data-node "tma.js init-data-node package"
[5]: https://github.com/TelegramMessenger/TGMiniAppsJsSDK "Official Telegram Mini Apps JavaScript SDK repository"
[6]: https://github.com/Telegram-Mini-Apps/tma.js/blob/master/packages/sdk/src/features/Viewport/Viewport.ts "tma.js Viewport feature source"
[7]: https://github.com/Telegram-Mini-Apps/tma.js/blob/master/LICENSE "tma.js MIT license"
[8]: https://github.com/Telegram-Mini-Apps/tma.js/security "tma.js security overview"
[9]: https://github.com/TelegramMessenger/TGMiniAppsJsSDK/blob/master/telegram-web-app.js "Official Telegram WebApp runtime source"
