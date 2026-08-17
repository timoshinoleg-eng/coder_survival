# P0 Release Engineering — GO/NO-GO

**Дата:** 2026-08-17
**Ревьюер:** Manus — release engineering, art direction & verification
**Scope:** migration tail `059`–`061`, signed rewarded-ads smoke, production configuration guard, soft-launch observability и Luna P1 art-governance sync.

## Решение

> **Production deploy: NO-GO в автономном режиме.** P0 implementation и local verification готовы к review, но production launch требует owner-controlled release gates: защищённый secret-store preflight, проверенный backup, staging smoke с реальной Telegram/provider подписью, CI/PR review и явное подтверждение single-instance topology.

> **Review candidate: CONDITIONAL GO.** Ветка `manus/p0-release-engineering` содержит обратимые и проверенные изменения. Она может быть передана в GitHub review; merge разрешается только после зелёных CI и закрытия таблицы owner gates ниже.

## Выполненные и проверенные элементы

| Workstream | Evidence | Результат |
|---|---|---|
| Migration rehearsal | Полный repository set из 62 migration применён штатным runner на disposable local PostgreSQL DB; runner повторён; `059`–`061` replayed транзакционно. | PASS: 9 event definitions, partial starter-pack index, `league_placements` table и 2 indexes; invariants не изменились при replay. |
| Migration operator procedure | [`MIGRATION_RUNBOOK_059_061.md`](../docs/MIGRATION_RUNBOOK_059_061.md) | Готовы pre-flight, sequential apply, post-check SQL, non-destructive rollback boundary и single-runner constraint. |
| Signed rewarded ads | Local self-hosted HMAC harness: valid/invalid/expired initData, ownership, owner reward, sequential replay, concurrent duplicate, cooldown, daily cap. | PASS: **9/9** checks. Staging mutation/provider segment остаётся owner-gated. |
| Coffee Coin regression | Existing secure rewarded video suite plus new harness. | PASS: expected one-coin reward, non-owner protection, concurrent claim protection, cosmetic spend atomicity. |
| Production configuration | Fail-closed preflight checks named secret presence, HTTPS CORS allowlist, DB configuration, Telegram freshness policy, provider declaration and disabled payments; values never printed. | PASS: 5 dedicated tests; CLI success output verified without secret values. |
| Observability | [`SOFT_LAUNCH_OBSERVABILITY.md`](../docs/SOFT_LAUNCH_OBSERVABILITY.md) | 5m / 15m / 1h / 24h / 72h thresholds distinguish product guards from platform failure. |
| Art governance | [`APPROVED_ASSETS_REGISTER.md`](../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md) | 3 Luna hero states and 12 atomized icons recorded as `APPROVED_RUNTIME`; binaries deliberately excluded from this governance PR. |
| Regression | Full backend suite against local test DB. | PASS: **45 suites, 435 tests**. |

## Release gates

| Gate | Owner / role | State | Required evidence to move to GO |
|---|---|---|---|
| Review branch and CI | Manus / repository reviewer | Pending GitHub publication and CI | Open PR from `manus/p0-release-engineering`, CI green, no unresolved review comments. |
| Production config preflight | Release owner | Not run against production secrets | `node scripts/release_config_preflight.mjs` returns zero errors from secret-store environment; output retained only as sanitized status codes. |
| Database readiness | Release owner / DBA | Not executed | Fresh backup and known restore owner; one migration runner; post-check SQL from migration runbook passes. |
| CORS closure | Release owner | Not verified | Explicit HTTPS `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS`; no wildcard and no implicit Vercel preview fallback. |
| Telegram signed smoke | Release owner | Not executed on staging | Fresh valid initData accepted; tampered and expired fixtures rejected on HTTPS staging. Raw fixtures remain outside Git/Drive. |
| Ads provider callback | Release owner / provider operator | Not executed on staging | Disposable staging account, signed S2S callback and one claim; ownership/replay/cooldown/daily-cap evidence retained only in sanitized form. |
| Runtime topology | Release owner | Not verified | Exactly one long-lived backend instance and no overlapping migration/cron runner. |
| Payments kill switch | Release owner | Required at release | `PAYMENTS_ENABLED=false` confirmed. This P0 does not introduce card/Stars activation. |
| Durable anti-cheat state | ZCode P1 / owner | Deferred by accepted scope | Does not block controlled soft launch only if single-instance constraint is maintained; blocks horizontal scale. |

## Explicit non-actions

No production deployment, database migration against production, secret rotation, provider secret disclosure, payment enablement or direct commit to `main` occurred in this workstream. The report contains no DB URL, IP, SSH/cloud identifier, raw initData, nonce, token or provider secret.

## Immediate release sequence after approvals

The release owner first merges only after PR/CI review. Then, with the target secret store attached, they execute config preflight, create/confirm the backup, run a **single** migration runner, execute SQL post-checks, start one backend instance, confirm `/health`, and perform signed staging smoke. Cohort expansion follows the 24h/72h thresholds; a security or duplicate-reward Red condition halts rollout rather than relaxing validation.

## References

1. [`docs/MIGRATION_RUNBOOK_059_061.md`](../docs/MIGRATION_RUNBOOK_059_061.md)
2. [`docs/REWARDED_ADS_SIGNED_SMOKE.md`](../docs/REWARDED_ADS_SIGNED_SMOKE.md)
3. [`docs/SOFT_LAUNCH_OBSERVABILITY.md`](../docs/SOFT_LAUNCH_OBSERVABILITY.md)
4. [`docs/INFRA.md`](../docs/INFRA.md)
5. [`reports/2026-08-17_LUNA_P1_V01_RAW_FILE_REVIEW_RU.md`](2026-08-17_LUNA_P1_V01_RAW_FILE_REVIEW_RU.md) — source review exists in the main workspace/Drive package; it is intentionally not duplicated in this P0 worktree.
