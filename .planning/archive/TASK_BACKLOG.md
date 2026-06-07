# Coder Survival Task Backlog

Детализация `ROADMAP.md` в виде конкретного рабочего backlog.

Связанные документы:
- `ROADMAP.md`
- `HANDOFF.md`
- `README.md`
- `project-status.json`
- `SMOKE_COVERAGE.md`
- `observation/README.md`

## Как использовать этот backlog

- `P0` — делать в первую очередь; высокий продуктовый или операционный эффект.
- `P1` — делать сразу после `P0`; усиливает retention/monetization/reliability.
- `P2` — полезно, но не блокирует следующий шаг роста.
- Если задача меняет API payload, вместе с ней должны обновляться smoke/contract проверки и docs.
- Если задача касается экономики, frontend не должен вводить свои source-of-truth константы.

## Очередность по умолчанию

### Wave 1
1. Event taxonomy / analytics naming
2. Observation expansion
3. Weekly balance review template
4. Contract checks for `state` / `tap` / `pass` / `event` / `shop`

### Wave 2
5. Seasonal premium entitlement model
6. Post-purchase success UX
7. Premium pass visibility improvements

### Wave 3
8. Quest/pass/event return hooks
9. Team weekly goal
10. Manual release workflow wrapper + alerts + secret audit

---

# Analytics / Data

## A1. Canonical event taxonomy
- Priority: `P0`
- Area: `analytics`, `frontend`, `backend`, `bot`
- Goal: договориться о едином словаре событий и их полей.
- Scope:
  - список canonical event names;
  - список обязательных properties;
  - mapping старых/разрозненных названий в единый формат;
  - правила именования funnel events.
- Expected result:
  - один документ-источник истины для событий;
  - меньше расхождений между frontend analytics, backend observation и support/debug логикой.
- Definition of done:
  - есть утверждённый event matrix для `shop`, `offers`, `pass`, `event`, `quests`, `referral`, `teams`, `share`.

## A2. Purchase funnel visibility
- Priority: `P0`
- Area: `backend`, `analytics`, `observation`
- Goal: видеть конверсию покупок по шагам.
- Scope:
  - `shop_open`
  - `buy_request`
  - `invoice_link_created`
  - `payment_confirm_success`
  - `payment_confirm_duplicate`
  - `payment_confirm_failure`
- Expected result:
  - можно локализовать, где именно теряется пользователь или ломается flow.
- Definition of done:
  - funnel доступен через `observe-economy` и/или SQL slices;
  - breakdown доступен по SKU.

## A3. Offer funnel visibility
- Priority: `P0`
- Area: `backend`, `frontend`, `analytics`, `observation`
- Goal: измерять эффективность context offers.
- Scope:
  - impression;
  - dismiss;
  - action click;
  - shop open from offer;
  - purchase after offer.
- Expected result:
  - видно, какие offer types реально работают, а какие создают fatigue.
- Definition of done:
  - доступен breakdown по `low_energy`, `near_rank`, `high_stress`.

## A4. Weekly balance review template
- Priority: `P0`
- Area: `analytics`, `docs`, `ops`
- Goal: превратить наблюдаемость в рутинный weekly ritual.
- Scope:
  - шаблон review;
  - список обязательных метрик;
  - формат выводов `keep / tune / investigate`.
- Expected result:
  - продуктовые решения по балансу принимаются по данным, а не по ощущениям.
- Definition of done:
  - в repo есть markdown-шаблон weekly review;
  - оператор может заполнить его за один проход по observation path.

## A5. Pass progression distribution report
- Priority: `P1`
- Area: `backend`, `observation`
- Goal: понять, как игроки проходят текущую `915 XP` кривую.
- Scope:
  - распределение игроков по уровням pass;
  - rate of claim;
  - premium vs free progression visibility.
- Expected result:
  - можно решить, не слишком ли длинная или слишком короткая текущая pass curve.
- Definition of done:
  - отчёт доступен без ручной агрегации в несколько шагов.

## A6. Event participation / completion report
- Priority: `P1`
- Area: `backend`, `observation`
- Goal: проверить реальную доступность недельного ивента с target `650`.
- Scope:
  - started;
  - active participants;
  - completed;
  - reward claimed.
- Expected result:
  - видно, достижим ли weekly hackathon в реальной игре.
- Definition of done:
  - completion rate и drop-off видны в одном отчёте.

---

# Backend

## B1. Seasonal premium entitlement model
- Priority: `P0`
- Area: `backend`, `payments`, `support`
- Goal: убрать ограничение, где premium pass живёт как слишком плоское v1-состояние.
- Scope:
  - entitlement хранится по активному сезону;
  - повторный confirm не даёт повторную выдачу;
  - доступ восстанавливается по серверному состоянию;
  - support/debug путь позволяет проверить entitlement пользователя.
- Expected result:
  - premium устойчив к повторным запускам клиента и future multi-season model.
- Definition of done:
  - premium status корректен после relaunch;
  - есть понятная связь `purchase -> entitlement -> pass unlock`.

## B2. Premium entitlement support query / operator check
- Priority: `P0`
- Area: `backend`, `support`, `scripts`
- Goal: быстро проверять жалобы типа "купил, а premium не виден".
- Scope:
  - операторская команда/скрипт/SQL-путь;
  - понятный список полей для triage.
- Expected result:
  - саппорт не начинает расследование вслепую.
- Definition of done:
  - documented support path существует и покрывает entitlement state.

## B3. Offer attribution persistence
- Priority: `P1`
- Area: `backend`, `analytics`
- Goal: связать покупки и действия с offer source, если пользователь пришёл через offer.
- Scope:
  - безопасное хранение attribution на коротком окне;
  - привязка к purchase funnel отчётам.
- Expected result:
  - видно, какие offers реально двигают monetization.
- Definition of done:
  - purchase reports могут быть разбиты по source/offer type.

## B4. Quest variability foundation
- Priority: `P1`
- Area: `backend`, `gameplay`
- Goal: дать основу для более живого daily loop без хаоса в балансе.
- Scope:
  - 1 лёгкий механизм вариативности;
  - без резкого увеличения числа edge cases.
- Expected result:
  - daily quests меньше ощущаются как полностью статичный список.
- Definition of done:
  - механика реализуема без ломки current smoke coverage.

## B5. Additional weekly event type foundation
- Priority: `P1`
- Area: `backend`, `gameplay`
- Goal: подготовить минимум один новый event archetype поверх config-driven модели.
- Scope:
  - новый тип цели;
  - reward payload в общей схеме;
  - совместимость с текущим `GET /api/event/active`.
- Expected result:
  - weekly live-ops можно варьировать без новой системы с нуля.
- Definition of done:
  - второй тип weekly event можно включить конфигом.

## B6. Team weekly goal model
- Priority: `P1`
- Area: `backend`, `teams`, `rewards`
- Goal: превратить teams из pure aggregation в retention loop.
- Scope:
  - weekly team goal;
  - общий milestone reward;
  - учёт вклада игрока.
- Expected result:
  - team panel получает продуктовый смысл beyond leaderboard.
- Definition of done:
  - у команды появляется weekly objective и достижимая reward loop.

## B7. Anomaly visibility without hot-path anti-cheat
- Priority: `P2`
- Area: `backend`, `ops`
- Goal: начать видеть подозрительные паттерны без тяжёлого античита.
- Scope:
  - suspicious tap cadence;
  - abnormal XP growth;
  - repeated claim/payment anomalies.
- Expected result:
  - есть база для future anti-abuse scoring.
- Definition of done:
  - anomalous cases хотя бы логируются/сигнализируются вне hot path.

---

# Frontend

## F1. Post-purchase success UX
- Priority: `P0`
- Area: `frontend`, `payments`
- Goal: после покупки игрок должен сразу понимать, что произошло.
- Scope:
  - success state;
  - purchased item summary;
  - applied effect summary;
  - follow-up CTA.
- Expected result:
  - меньше путаницы после confirm;
  - выше perceived value покупки.
- Definition of done:
  - после успешной покупки UI объясняет результат без необходимости перезахода и догадок.

## F2. Premium pass value presentation
- Priority: `P0`
- Area: `frontend`, `pass`
- Goal: показать, зачем нужен premium и что уже доступно.
- Scope:
  - premium value summary;
  - clearer locked/unlocked states;
  - next notable reward preview.
- Expected result:
  - pass panel лучше конвертирует в покупку и лучше объясняет выгоду.
- Definition of done:
  - premium branch визуально понятнее без новых hardcoded economy maps.

## F3. Offer interaction instrumentation
- Priority: `P0`
- Area: `frontend`, `analytics`
- Goal: не терять frontend-side часть offer funnel.
- Scope:
  - impression render;
  - dismiss click;
  - action click;
  - open shop from offer.
- Expected result:
  - data по offers становится полной, а не фрагментарной.
- Definition of done:
  - все UI-действия offer flow наблюдаемы.

## F4. Pass return hooks
- Priority: `P1`
- Area: `frontend`, `pass`
- Goal: усилить ощущение прогресса и повод вернуться.
- Scope:
  - `next reward in X XP`;
  - claimable highlight;
  - clearer milestone states.
- Expected result:
  - pass становится retention loop, а не просто каталогом наград.
- Definition of done:
  - игрок понимает следующий полезный шаг в pass без изучения всей таблицы.

## F5. Quest state clarity
- Priority: `P1`
- Area: `frontend`, `quests`
- Goal: сделать daily flow очевиднее.
- Scope:
  - `in progress / ready to claim / claimed`;
  - clearer completion feedback;
  - если будет reroll — понятная affordance.
- Expected result:
  - меньше вопросов в духе "почему квест не засчитался / не выдался".
- Definition of done:
  - состояния квестов читаются без дополнительного объяснения support.

## F6. Team weekly goal UI
- Priority: `P1`
- Area: `frontend`, `teams`
- Goal: сделать командную цель видимой и мотивирующей.
- Scope:
  - progress widget;
  - вклад игрока;
  - reward preview.
- Expected result:
  - team panel получает регулярный повод для открытия.
- Definition of done:
  - командный прогресс и награда объясняются с первого взгляда.

## F7. Referral milestone clarity
- Priority: `P1`
- Area: `frontend`, `referral`
- Goal: сделать referral loop понятнее без изменения server-side binding rules.
- Scope:
  - progress to next milestone;
  - clearer reward messaging;
  - share CTA emphasis.
- Expected result:
  - referral перестаёт быть скрытой механикой.
- Definition of done:
  - пользователь видит, сколько осталось до следующего referral reward.

---

# Ops / QA / Release

## O1. Contract checks for source-of-truth payloads
- Priority: `P0`
- Area: `backend`, `frontend`, `qa`
- Goal: защитить критичные payloads от тихих регрессий.
- Scope:
  - `GET /api/state`
  - `POST /api/tap`
  - `GET /api/event/active`
  - `GET /api/pass/status`
  - `GET /api/shop/*`
- Expected result:
  - меньше случаев, когда frontend quietly drifts от backend contracts.
- Definition of done:
  - contract/assert coverage есть минимум на ключевые поля и economy metadata.

## O2. Manual release workflow wrapper
- Priority: `P1`
- Area: `ops`, `.github/workflows`, `scripts`
- Goal: превратить draft manual release в контролируемую entrypoint-процедуру.
- Scope:
  - `workflow_dispatch` inputs;
  - preflight;
  - smoke summary;
  - release summary.
- Expected result:
  - релиз становится воспроизводимее и прозрачнее.
- Definition of done:
  - workflow реально помогает, а не дублирует shell вслепую.

## O3. Secret audit and rotation decision
- Priority: `P1`
- Area: `ops`, `security`
- Goal: закрыть остаточный риск после ручных ops-работ.
- Scope:
  - inventory секретов;
  - boundary review;
  - список секретов на rotation;
  - порядок замены.
- Expected result:
  - меньше latent security debt.
- Definition of done:
  - есть документированное решение `rotate / confirmed safe` по каждому критичному секрету.

## O4. Minimal alerts
- Priority: `P1`
- Area: `ops`, `monitoring`
- Goal: узнавать о проблемах раньше игроков.
- Scope:
  - backend health;
  - 5xx spike;
  - payment confirm failure rate;
  - observation route availability.
- Expected result:
  - команда реагирует на инциденты раньше, чем приходит support wave.
- Definition of done:
  - базовые alert rules существуют и дают actionable сигнал.

## O5. Primary domain migration plan
- Priority: `P2`
- Area: `ops`, `infra`
- Goal: подготовить controlled migration с DuckDNS.
- Scope:
  - DNS/TLS checklist;
  - webhook verification;
  - frontend rewrite changes;
  - rollback.
- Expected result:
  - переход на primary domain станет операцией, а не импровизацией.
- Definition of done:
  - migration runbook complete и проверяем.

## O6. Support-ready premium/debug checklist
- Priority: `P1`
- Area: `support`, `ops`, `payments`
- Goal: сократить время triage по monetization вопросам.
- Scope:
  - premium not active;
  - purchase applied but not visible;
  - duplicate confirm confusion.
- Expected result:
  - support и operator действуют по одному сценарию.
- Definition of done:
  - существует короткая checklist/runbook для этих жалоб.

---

# Recommended ticket split by sprint

## Sprint 1
- A1. Canonical event taxonomy
- A2. Purchase funnel visibility
- A3. Offer funnel visibility
- A4. Weekly balance review template
- O1. Contract checks for source-of-truth payloads

## Sprint 2
- B1. Seasonal premium entitlement model
- B2. Premium entitlement support query / operator check
- F1. Post-purchase success UX
- F2. Premium pass value presentation
- F3. Offer interaction instrumentation

## Sprint 3
- B4. Quest variability foundation
- F4. Pass return hooks
- F5. Quest state clarity
- B6. Team weekly goal model
- F6. Team weekly goal UI
- F7. Referral milestone clarity

## Sprint 4
- O2. Manual release workflow wrapper
- O3. Secret audit and rotation decision
- O4. Minimal alerts
- O6. Support-ready premium/debug checklist
- B5. Additional weekly event type foundation

---

# Minimum viable cut if time is limited

Если времени мало, обязательный минимум такой:
1. `A1` canonical event taxonomy
2. `A2` purchase funnel visibility
3. `A3` offer funnel visibility
4. `O1` contract checks
5. `B1` seasonal premium entitlement
6. `F1` post-purchase success UX
7. `O2` manual release workflow wrapper

Это даст максимальный эффект на управляемость, monetization reliability и скорость следующих решений.
