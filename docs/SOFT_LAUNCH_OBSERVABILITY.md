# Soft-Launch Observability: 24h / 72h

**Статус:** P0 operator guidance. Этот документ задаёт наблюдаемые сигналы и решения soft launch; он не разрешает production deploy и не содержит секретов, IP-адресов или provider identifiers.

## Принцип

> **Сначала наблюдаемость, затем масштабирование.** До выделения durable anti-cheat state и внешнего scheduler backend остаётся single-instance service. Метрики должны позволять отличить недоступность API, ошибку Telegram auth, отказ provider callback и штатный product guard (FTUE, cooldown, daily cap).

| Signal | Источник | Нормальная интерпретация | Ненормальная интерпретация |
|---|---|---|---|
| API health / DB connectivity | `GET /health`, reverse-proxy error rate, backend logs | `200` с подключённой DB | timeout, `5xx`, loss of DB connection |
| Telegram initData | structured auth outcome category, без raw header | valid / invalid / expired категории отдельно | sudden rise valid-user `403`, clock drift |
| Rewarded flow | `/api/rewards/ad-session`, callback, claim status categories | FTUE/cooldown/daily cap — expected product guards | callback signature failure, claim `5xx`, duplicate `200` |
| Coffee Coin integrity | `ad_rewards`, `ad_reward_sessions`, progression inventory | один approved claim = один coin | multiple rewards for one nonce or ledger/session mismatch |
| Runtime singleton | deployment inventory and cron logs | exactly one backend instance | overlapping cron/rotation job evidence |

Raw initData, nonce, secret, database DSN, IP and cloud IDs **не являются telemetry** и не попадают в dashboards, release tickets или Drive.

## 0–24 часа: controlled cohort

Начинайте с ограниченной аудитории и одной backend instance. Владелец release фиксирует только sanitized timestamp, release SHA, environment label и status aggregates.

| Window | Green | Amber: pause new acquisition | Red / NO-GO: stop rollout and investigate |
|---|---|---|---|
| 5-minute rolling | `/health` healthy; no unexplained DB loss | API `5xx` ≥ 1% при ≥ 50 requests | API `5xx` ≥ 5% или health/DB outage |
| 15-minute rolling | rewarded claim server errors = 0 | claim/callback `5xx` ≥ 1% при ≥ 20 relevant requests | any evidence of two successful claims for one nonce |
| 1 hour | valid initData requests pass; expected `403/409/429` remain categorised | valid signed initData `403` ≥ 2% | systemic valid initData rejection or clock-freshness regression |
| first 24 h | no ledger anomaly; one runtime instance | provider callback signature rejects increase unexpectedly | credit granted without verified session, payment kill switch observed enabled |

`403`/`409`/`429` не суммируются с platform failure rate без классификации. Для rewarded flow `403` может быть signature/ownership/FTUE, `409` — replay/provider state, `429` — cooldown/daily cap. Каждое ожидаемое guard outcome должно быть размечено отдельно от `5xx`.

## 24–72 часа: controlled expansion

Расширение аудитории допустимо только при зелёном 24h window и закрытом owner review staging smoke. Следите за тем, чтобы operational response не превращался в ослабление security controls.

| Condition | Decision |
|---|---|
| 24 h без Red, completed local signed smoke `9/9`, staging owner checks documented | Можно постепенно расширить cohort; продолжать 15-minute и hourly review. |
| Всплеск callback failures после provider change | Приостановить rewarded entry point для нового cohort; не отключать signature verification; сверить provider secret/callback signing configuration в secret store. |
| Рост expired initData | Проверить server clock и release config `INIT_DATA_MAX_AGE_SECONDS`; не расширять freshness window выше 3600 s как workaround. |
| Любой duplicate reward / nonce mismatch | NO-GO для расширения, сохранить sanitized evidence, проверить DB locks and ledger/session rows в защищённом incident workspace. |
| Cron double-run / second replica | Вернуть single instance перед дальнейшим rollout; scheduler extraction — отдельная P1 задача. |

## Review cadence и owner hand-off

На 24h и 72h owner проводит короткий review с четырьмя вопросами: API/DB доступен ли; соблюдается ли Telegram signature/freshness contract; выдаётся ли ровно один Coffee Coin за approved claim; остаётся ли `PAYMENTS_ENABLED=false`. Ответы фиксируются как `GREEN`, `AMBER`, `RED` с агрегированными counts, без идентификаторов пользователя или секретов.

Если любое условие RED, работа ограничивается diagnostic branch/PR и staging/local reproduction. Production configuration не меняется автоматически, payments не включаются, а схема не откатывается destructive SQL без отдельно подтверждённого backup/recovery plan.
