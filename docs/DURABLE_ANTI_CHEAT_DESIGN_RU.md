# Durable Anti-Cheat — Design Preservation (P1, Implementation Deferred)

**Статус:** accepted design direction; **не является реализацией или разрешением на migration**.
**Решение до отдельного review:** controlled soft launch возможен только при одном long-lived backend instance. Horizontal scale остаётся заблокированным.

## Problem statement

Текущий tap-pattern контроль хранит историю, cooldown и ban score в process-local `Map`. Поэтому restart очищает историю, а несколько backend replicas принимают независимые решения. Существующий JSONB column `progression.anti_cheat_state` сам по себе не образует durable enforcement contract и не устраняет race между конкурентными replicas. [1] [2]

> **Design principle.** Evidence capture, risk scoring and player-affecting enforcement must have durable, idempotent and independently observable records. A suspicious action must not become untraceable лишь потому, что бизнес-транзакция откатилась или процесс завершился.

## Target design

| Layer | Durable responsibility | Required property | Implementation status |
|---|---|---|---|
| Event capture | Append immutable, sanitized anti-cheat signal for a request/action correlation ID. | Idempotent uniqueness; no raw token, initData or unnecessary IP storage. | Deferred |
| Subject state | Maintain current score, cooldown/ban expiry, rule version and last processed event. | Row-level concurrency control and monotonic state transition. | Deferred |
| Decision record | Persist allow/soft-flag/hard-block decision, reason code and rule version. | Reviewable without reconstructing process memory. | Deferred |
| Audit delivery | Emit redacted evidence to a durable audit/outbox path after the decision. | Failure must be observable and must not silently erase a hard-block signal. | Deferred |
| Operations | Provide retention, escalation and integrity metrics. | Single-instance and multi-instance semantics are explicit. | Deferred |

## Required invariants for a later implementation

A later design review must approve a transaction boundary in which player writes and enforcement decision are consistent, while audit capture cannot be silently lost by an unrelated rollback. Every event needs an idempotency key; state transitions must use database locking or equivalent compare-and-set semantics; a replay must not inflate score twice. The rule version and sanitized reason code must accompany every decision so false-positive review remains possible after a deployment.

The design must distinguish a temporary rate/pattern suppression from a durable account restriction. It must define expiry, appeals/review policy, observability thresholds and a fail-safe outcome if the durable store is unavailable. It must not store Telegram secrets, raw initData or credential-bearing request headers in the evidence path.

## Non-goals and release boundary

No runtime code, database migration, queue, scheduler, secret, payment setting or production topology is changed by this document. Migration `038_anticheat_state.sql` and the existing process-local middleware are recorded as current-state inputs, not as approval to extend them. [1] [2]

Until a separate architecture/security review approves an implementation plan and rollout, the release path must keep one backend instance and one cron owner. No horizontal replicas or durable anti-cheat migration may begin as a side effect of PR #32.

## Review package required before implementation

| Required artifact | Decision it supports |
|---|---|
| Schema and retention proposal | Whether personal/sensitive data minimization and deletion policy are adequate. |
| Transaction and idempotency sequence diagram | Whether retry, rollback and multi-replica races preserve evidence and score correctness. |
| Threat model and false-positive policy | Whether enforcement decisions are proportionate and reversible. |
| Load and failure-mode test plan | Whether the design remains safe during DB latency, restart and concurrent requests. |
| Rollout and rollback plan | Whether a single-instance shadow phase precedes any enforcement or scale change. |

## References

[1]: ../backend/src/middleware/antiCheat.js "Current process-local tap-pattern middleware"
[2]: ../backend/migrations/038_anticheat_state.sql "Existing anti-cheat JSONB column"
[3]: ./MIGRATION_RUNBOOK_059_061.md "Current single-instance release constraint"
