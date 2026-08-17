# Signed Rewarded-Ads Smoke Harness

**Статус:** local deterministic harness готов; staging mode ограничен read-only authentication checks и требует действия владельца для provider callback/экономических мутаций. В рамках этой задачи staging и production не затрагивались.

## Назначение и границы

`scripts/smoke_rewarded_ads_harness.mjs` проверяет security contract rewarded-ads flow с HMAC-signed Telegram initData. Local mode запускает isolated backend на disposable PostgreSQL test DB, поэтому может безопасно проверить выдачу Coffee Coin, nonce ownership, replay, cooldown и daily cap без реального рекламного провайдера.

> **Никогда не запускайте local mode с production/staging database.** Harness fail-closed принимает только local-host URL с marker `test`, `smoke` или `rehearsal` в имени DB, затем очищает тестовые runtime tables стандартным `resetTestDatabase()`.

| Check | Local harness | Staging mode | Expected result |
|---|---:|---:|---|
| Valid signed initData | Yes | Yes | `200` |
| Invalid signature | Yes | Yes | `403 Invalid initData signature` |
| Expired signed initData | Yes | Owner-provided fixture | `403 Expired initData` |
| Non-owner nonce | Yes | Owner action | `403 Nonce does not belong to user` |
| Owner claim | Yes | Owner action | `200`, exactly one Coffee Coin |
| Sequential replay | Yes | Owner action | `409 Nonce already used` |
| Concurrent duplicate claim | Yes | Owner action | one `200`, one `409` |
| Cooldown | Yes | Owner action | `429 Ad reward cooldown active` |
| Daily cap | Yes | Owner action | `429 Daily ad reward limit reached` |

## Local execution

Понадобятся Node.js dependencies backend и доступный disposable local PostgreSQL test DB. Значения ниже — только шаблон; не добавляйте DSN, bot token или log output с ними в Git/Drive.

```bash
cd <repository-root>/backend
npm ci

cd ..
SMOKE_LOCAL_DATABASE_URL='postgresql://<local-user>:<local-password>@localhost:5432/coder_survival_smoke_test' \
  node scripts/smoke_rewarded_ads_harness.mjs --mode=local
```

Для local mode не требуется real Telegram credential: harness генерирует synthetic test HMAC token только внутри процесса. При необходимости явного тестового значения можно задать `SMOKE_LOCAL_BOT_TOKEN`; это не production `BOT_TOKEN` и не должно совпадать с ним. Mock rewarded provider активируется только при `NODE_ENV=test`.

Успешный итог содержит `9/9 checks passed`. Любой `FAIL` выставляет non-zero exit code. `SKIP` допустим только в staging mode для явно owner-gated checks.

## Staging: owner-gated read-only execution

Staging mode не создаёт ad sessions и не вызывает provider callback. Он проверяет только signature/auth freshness contract на HTTPS staging endpoint. Это ограничение исключает случайную выдачу reward или использование реального provider secret без владельца.

```bash
SMOKE_STAGING_BASE_URL='https://<staging-domain>' \
SMOKE_STAGING_INIT_DATA='<fresh real initData from operator-owned staging account>' \
SMOKE_STAGING_EXPIRED_INIT_DATA='<optional separately-generated expired signed fixture>' \
  node scripts/smoke_rewarded_ads_harness.mjs --mode=staging
```

`SMOKE_STAGING_EXPIRED_INIT_DATA` не обязателен для запуска, но без него freshness check будет показан как `SKIP — OWNER ACTION`. Значения initData являются bearer-like authentication material для короткого replay window: не передавайте их через чат, PR, shell history, GitHub Actions logs или Drive.

### Owner procedure для mutation/provider portion

После зелёного local run и только на staging disposable account владелец может провести оставшиеся checks. Используйте provider test sandbox и отдельные short-lived secrets в secret store; реальные secrets не логируются. Последовательность: создать session, подтвердить server-to-server callback, claim как owner, повторить claim, попытаться claim от другой staging test account, затем проверить cooldown и seeded daily-cap state. После проверки удалить/rotate staging fixtures согласно credential policy. `PAYMENTS_ENABLED` остаётся `false` на всём пути: Coffee Coin rewarded flow не требует card/Stars payment.

## Интерпретация сбоев

| Failure | Первое действие |
|---|---|
| `403 Invalid initData signature` на valid fixture | Проверить, что backend secret store использует ожидаемый bot token и initData не был URL-decoded/re-encoded между Telegram и header. Не ослаблять signature verification. |
| `403 Expired initData` на fresh fixture | Проверить clock skew, `INIT_DATA_MAX_AGE_SECONDS` и источник fixture; не расширять window выше approved policy ради smoke. |
| `403 Nonce does not belong to user` на owner claim | Проверить Telegram user identity в signed initData и session owner mapping; это блокирующий security result. |
| Два `200` в duplicate check | Немедленный NO-GO: остановить rollout и расследовать ledger/session locking. |
| Claim проходит в обход cooldown/daily cap | NO-GO: проверить `ad_rewards` seed-and-lock path и DB uniqueness/transaction isolation. |
| `503 Ads not configured` | Не маскировать; подтвердить staging provider secret/callback configuration и вернуться к smoke после owner action. |

## Evidence to retain

Сохраните только sanitized summary: commit SHA, environment label (`local`/`staging`), timestamp, PASS/FAIL count и HTTP status categories. Не сохраняйте database URL, IP, cloud IDs, raw initData, bot/provider secret, nonce или user identifiers в Git/Drive. Перед Drive upload выполните repository safety check.
