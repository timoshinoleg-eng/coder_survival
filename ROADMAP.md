# Coder Survival Roadmap

Конкретный execution-plan на ближайшие 2–4 недели после стабилизации MVP и production release path.

Источники истины:
- `HANDOFF.md`
- `README.md`
- `project-status.json`
- `observation/README.md`
- `TASK_BACKLOG.md`

## Цель этапа

Следующий этап проекта — не "собрать MVP", а превратить текущий live MVP в управляемый live-ops продукт.

Фокус этого roadmap:
1. сделать баланс и монетизацию измеримыми;
2. усилить удержание без риска сломать рабочий core loop;
3. завершить production hardening;
4. снизить риск регрессий между frontend / backend / bot / payments.

## Приоритеты

### P0 — не ломать уже подтверждённые инварианты

Перед любыми изменениями сохранять правила из `HANDOFF.md`:
- не возвращать economy hardcodes на frontend;
- не заменять truthful energy countdown клиентскими догадками;
- не возвращать `window.__openShop` seam;
- не возвращать optimistic exact tap feedback;
- не писать audit в per-tap hot path;
- не использовать `docker-compose.prod.yml` как production truth;
- не размывать release path вне `scripts/release-prod.ps1` и `docker-compose.backend.yml`.

## Sprint 1 — Analytics & control loop

Цель: перестать принимать продуктовые решения вслепую.

### Backend / data
- Расширить live observation/reporting по воронке:
  - `shop_open -> buy_request -> invoice_link -> confirm_success`
  - `offer_impression -> dismiss / click / purchase`
  - `daily quest shown -> completed -> claimed`
  - `pass progression distribution by level`
  - `weekly event participation / completion`
- Добавить breakdown по SKU и offer type.
- Проверить, что критичные timestamps и statuses есть в БД для отчётов без ручной реконструкции.

### Frontend / bot
- Убедиться, что все ключевые product surfaces порождают наблюдаемые события:
  - открытие shop;
  - клик по context offer action;
  - открытие pass panel;
  - открытие event panel;
  - share actions.
- Сверить названия событий между `analytics/`, frontend и backend.

### Ops / analytics
- Собрать минимальный weekly balance review template:
  - DAU / D1 retention;
  - offer CTR / dismiss rate;
  - daily full-clear rate;
  - event completion rate;
  - pass completion pacing;
  - purchase conversion by SKU.
- Зафиксировать единый операторский путь:
  - быстрый путь: `scripts/observe-economy.ps1`
  - deep-dive путь: SQL в `observation/`.

### Definition of done
- Любой weekly balance review можно сделать без ручного SQL-расследования с нуля.
- Есть видимость по основным conversion bottlenecks.
- Названия событий и метрик согласованы между кодом и docs.

## Sprint 2 — Monetization hardening

Цель: поднять надёжность и понятность платёжного контура, не меняя рабочий Telegram Stars flow.

### Backend
- Ввести явную seasonal entitlement model для premium pass:
  - entitlement привязывается к сезону;
  - повторный confirm не создаёт повторную выдачу;
  - статус premium корректно восстанавливается после релога и смены клиента;
  - история entitlement доступна для поддержки.
- Подготовить операторскую проверку premium entitlement в support/debug сценариях.

### Frontend
- Добавить явный post-purchase success UX:
  - что куплено;
  - что открылось;
  - какой эффект применён сейчас.
- Улучшить premium pass presentation:
  - что даёт premium;
  - какие rewards уже разблокированы;
  - какой следующий заметный milestone.
- Проверить, что shop recommendations остаются backend-driven.

### Product
- Протестировать мягкие monetization triggers:
  - low energy;
  - near rank-up;
  - event almost complete;
  - almost completed daily clear.

### Definition of done
- Premium entitlement живёт по сезонам, а не как разовый флаг без истории.
- Поддержка может объяснить пользователю, почему premium активен или не активен.
- После покупки игрок видит понятный результат, а не только факт успешного confirm.

## Sprint 3 — Retention & social depth

Цель: увеличить причины вернуться в игру без тяжёлого feature creep.

### Frontend / backend
- Углубить `daily quests` без ломки текущего баланса:
  - добавить controlled variability;
  - добавить reroll или альтернативный слот, если это дешево по реализации;
  - сделать UI понятнее по статусам `in progress / ready to claim / claimed`.
- Усилить `sprint pass` UX:
  - блок следующей награды;
  - более явный прогресс до milestone;
  - более заметные claimable states.
- Подготовить 1 дополнительный тип weekly event поверх текущей config-driven схемы.

### Social
- Развить `teams` из чистой агрегации в лёгкий совместный loop:
  - weekly team goal;
  - общий milestone reward;
  - вклад игрока в командный результат.
- Усилить `referral` как retention loop:
  - более явный прогресс до milestone;
  - ясная ценность приглашения;
  - безопасный серверный flow без возврата frontend sync.

### Definition of done
- У игрока есть минимум 2–3 понятные причины вернуться в течение дня/недели.
- Команда и referral дают не только vanity, но и практическую мотивацию.
- Новые retention hooks не требуют радикальной перестройки core loop.

## Sprint 4 — Release hardening & safety net

Цель: уменьшить операционный риск перед ростом аудитории.

### Ops
- Довести `.github/workflows/manual-release.yml` до реально полезного manual wrapper:
  - явные inputs;
  - preflight;
  - release summary;
  - smoke summary.
- Провести ревизию и ротацию секретов, если они выходили за normal secret boundary.
- Подготовить migration plan с DuckDNS на primary domain:
  - DNS;
  - TLS;
  - webhook checks;
  - rollback path.
- Добавить минимальные alerts:
  - backend health;
  - 5xx spike;
  - payment confirm failures;
  - observation route failure.

### QA / contracts
- Добавить contract/regression coverage для payloads:
  - `GET /api/state`
  - `POST /api/tap`
  - `GET /api/shop/*`
  - `GET /api/daily/*`
  - `GET /api/event/active`
  - `GET /api/pass/status`
- Зафиксировать smoke expectations для economy constants, которые уже считаются source-of-truth.

### Definition of done
- Release path воспроизводим не только вручную в shell, но и через controlled manual entrypoint.
- Команда узнаёт о проблемах раньше игроков.
- Критичные frontend/backend контракты защищены от тихих регрессий.

## Top 10 задач в рабочем порядке

1. Согласовать canonical event taxonomy для analytics / observation / frontend / backend.
2. Расширить observation route и/или SQL pack по purchase/offer funnel breakdown.
3. Добавить weekly balance review шаблон в docs.
4. Реализовать seasonal premium entitlement model.
5. Добавить post-purchase success UX и premium visibility в pass UI.
6. Улучшить pass/event/quest return hooks.
7. Добавить weekly team goal + простой shared reward.
8. Довести manual release workflow wrapper.
9. Провести secret audit + rotation decision.
10. Добавить contract/regression checks на ключевые API payloads.

## Что сознательно НЕ делать в этом цикле

- не переписывать Phaser сцену с нуля;
- не добавлять тяжёлую новую дизайн-систему;
- не строить сложный multi-season meta-platform beyond entitlement basics;
- не переносить bot runtime обратно на VM до решения egress-проблемы;
- не внедрять advanced anti-cheat в hot path до появления базовой anomaly visibility;
- не расширять feature set быстрее, чем появляется наблюдаемость и supportability.

## Критерии успеха через 2–4 недели

Считать этап успешным, если выполнено большинство пунктов:
- weekly balance review делается быстро и по реальным данным;
- есть ясность по offer funnel и purchase funnel;
- premium pass работает как сезонная entitlement-сущность;
- post-purchase UX стал понятнее для игрока;
- появились новые return hooks без регрессии core loop;
- release path и alerts уменьшили операционный риск;
- критичные API payloads защищены regression/contract проверками.

## Если ресурсов мало

Минимально обязательный срез:
1. analytics + observation expansion;
2. seasonal premium entitlement;
3. post-purchase UX;
4. manual release wrapper;
5. contract checks на `state`, `tap`, `pass`, `event`, `shop`.
