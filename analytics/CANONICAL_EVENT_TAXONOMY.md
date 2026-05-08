# Canonical Event Taxonomy — Sprint 1

Минимальный canonical taxonomy для live MVP после стабилизации production.

Цель Sprint 1:
- согласовать названия событий между docs, frontend analytics планом и backend observation;
- не выдумывать события, которые сейчас не пишутся;
- явно отделить `canonical names`, `backend storage actions` и `future events`.

## Принципы

1. `canonical event name` — это продуктовый язык, которым пользуемся в аналитике и документации.
2. Backend может хранить технический alias, если он уже есть в коде.
3. `offer_type` и `item_type` — это свойства событий, а не отдельные top-level namespaces.
4. Если событие не пишется в runtime, оно не должно притворяться "уже доступным" в live reporting.

## Canonical Sprint 1 events

| Canonical name | Где нужен сейчас | Основные свойства |
|---|---|---|
| `first_open` | frontend analytics | `source` |
| `session_start` | frontend analytics | `time_since_last` |
| `app_close` | frontend analytics | `session_duration` |
| `purchase_attempt` | product analytics / purchase funnel | `item_type`, `stars_amount`, `source` |
| `purchase_success` | product analytics / purchase funnel | `item_type`, `stars_amount`, `purchase_id` |
| `purchase_fail` | product analytics / purchase funnel | `item_type`, `reason` |
| `offer_impression` | offer funnel / observation | `offer_type`, `source` |
| `offer_dismiss` | offer funnel / observation | `offer_type`, `source` |
| `offer_action` | future frontend analytics | `offer_type`, `action`, `source` |
| `share` | social analytics | `surface`, `channel` |

## Canonical dimensions

### `offer_type`
- `low_energy`
- `near_rank`
- `high_stress`

### `offer source`
- `state`
- `tap`

### `item_type`
- `energy_refill`
- `depression_cure`
- `tier_boost`
- `premium_pass`

## Current runtime mapping

| Canonical name | Current runtime source | Status |
|---|---|---|
| `first_open` | `analytics/events.js` | planned helper exists |
| `session_start` | `analytics/events.js` | planned helper exists |
| `app_close` | `analytics/events.js` | planned helper exists |
| `purchase_attempt` | backend `audit_logs.action = 'purchase_intent'` | **legacy alias in runtime** |
| `purchase_success` | `purchases.status = 'completed'` + `star_payments.status = 'completed'` | derived in observation |
| `purchase_fail` | `purchases.status = 'failed'` | derived in observation when present |
| `offer_impression` | table `offer_impressions` | live runtime source |
| `offer_dismiss` | backend `audit_logs.action = 'offer_dismiss'` | live runtime source |
| `share` | not wired yet in runtime | future |

## Legacy / alias names to keep in mind

| Current name | Meaning | Canonical interpretation |
|---|---|---|
| `purchase_intent` | backend audit log on `POST /api/buy` | `purchase_attempt` |
| `offer_impressions` | DB table of shown offers | `offer_impression` |
| `pass_premium_unlock` | backend audit on premium unlock | keep as backend-specific action, not base Sprint 1 canonical event |

## Explicit non-goals for Sprint 1

Не считать canonical live events, если они пока не wired end-to-end:
- `tutorial_complete`
- `tutorial_skip`
- `tap`
- `code_written`
- `level_up`
- `purchase_restore`
- ad events
- settings events
- error events

Они могут остаться в broader analytics plan, но не должны путаться с текущим live observation truth.

## Recommended naming rules

1. Использовать `snake_case`.
2. Использовать глагол/действие, а не UI-копию.
3. Не кодировать `offer_type` или `item_type` в имени события — передавать их как properties.
4. Для funnel-отчётов считать шаги отдельно:
   - `purchase_attempt`
   - `purchase_row_created`
   - `purchase_success`
   - `purchase_fail`
5. Для offers считать отдельно:
   - `offer_impression`
   - `offer_dismiss`
   - `offer_action`
   - `purchase_success` with `offer_type` attribution when available

## Sprint 1 practical outcome

После этого шага команда должна одинаково понимать:
- что такое `purchase_attempt`;
- почему backend пока хранит `purchase_intent`;
- почему `offer_type` — это dimension, а не event name;
- какие события уже доступны для observation без новой миграции.
