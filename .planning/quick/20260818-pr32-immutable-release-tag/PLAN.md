# PR #32 — Immutable backend image tag release-path fix

## Objective

Resolve the independent P1 finding on `manus/p0-release-engineering`: the exact reviewed immutable `BACKEND_IMAGE_TAG` must be validated and propagated through every active release-path invocation. The release path comprises the manual workflow, the preflight script, the production release script, all standalone Compose calls, and the post-deploy core smoke script. The result must prove that preflight, build, restart, and smoke use one reviewed tag and never rely on mutable `latest`.

## Scope and safety boundaries

This quick workflow is limited to branch-local source, tests, reports, manifests, and operational documentation. It must not deploy to production, run a production migration, change or rotate secrets, enable payments, force-push, merge either PR, or modify the durable anti-cheat runtime implementation. The anti-cheat work is documentation/design preservation only, pending a separate review.

## Planned changes

| Workstream | Deliverable | Acceptance condition |
|---|---|---|
| Immutable tag propagation | Workflow/script contract and regression coverage | A single exact tag is derived once, validated as immutable, and passed to every Compose invocation in preflight, build/restart, and smoke. No active path interpolates a fallback `latest`. |
| Operator cleanup | `backend/.env.example` and migration runbook | The example template matches the production compose/preflight contract; the runbook waits for backend health before a health curl. |
| Release evidence | GO/NO-GO report, source manifest, ledger | Current head and test counts are factual; MERGE GO and PRODUCTION GO remain separate; assets/reviews/status/next action are traceable. |
| Anti-cheat preservation | Durable design documentation only | Luna P1 raw-review/immutable identity and anti-cheat design have repository-based references; no migration or runtime implementation is started. |

## Validation plan

Static contract tests will assert exact tag propagation and reject mutable/fallback tags. Relevant unit tests and the complete available CI-equivalent test suite will run locally. Evidence will record commands, outcomes, actual test counts, exact commit heads, and remaining owner-controlled production gates.

## Handoff rule

After PR #31 is actually merged, refresh `main`, merge or rebase it into this branch without force-push, rerun the full CI, request a new independent Codex review, and do not merge PR #32 directly.
