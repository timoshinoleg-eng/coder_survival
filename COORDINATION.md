# Coordination — Coder Survival

> **Last updated:** 2026-06-03 12:45 UTC+3
> **Project:** Coder Survival Telegram Mini App
> **Repo:** `coder_survival_fresh` (main branch: `main`)

---

## Active Tasks

| Task | Agent | Status | Branch | ETA |
|------|-------|--------|--------|-----|
| Infra setup (coordination files + worktrees) | kimi-openclaw | ✅ Done | `main` | 2026-06-03 |
| Team Battle Fix (rebalance weights) | kimi-openclaw | 🔵 In Progress | `fix/team-battle` | 2026-06-04 |
| Backend documentation drift audit | hermes | ⚪ Icebox | — | — |
| Frontend splash onboarding | kimi-desktop | 🟢 Ready | `feat/splash-onboarding` | 2026-06-05 |
| SQL injection security pass | kimi-openclaw | 🟢 Ready | `fix/sql-injection` | 2026-06-05 |

---

## Active Branches

| Branch | Owner | Purpose | Merged? |
|--------|-------|---------|---------|
| `main` | — | Production source of truth | — |
| `origin/codex/black-screen-hotfix` | codex | Black screen hotfix (merged?) | Check |
| `origin/rescue/local-fixes` | rescue | Local rescue fixes | No |
| `fix/team-battle` | kimi-openclaw | Team battle weight rebalance | No |
| `feat/shop-referral` | kimi-openclaw | Shop + referral shell | No |
| `feat/splash-onboarding` | kimi-desktop | Splash + HUD | No |
| `feat/career-ladder` | kimi-desktop | Career ladder UI | No |
| `fix/sql-injection` | kimi-openclaw | Security audit | No |
| `feat/cron-jobs` | kimi-openclaw | Cron job infrastructure | No |
| `feat/analytics` | kimi-openclaw | Analytics pipeline | No |
| `feat/antifraud` | kimi-openclaw | Anti-fraud improvements | No |
| `feat/skin-equip` | kimi-desktop | Skin equip flow | No |
| `feat/ad-sdk` | kimi-desktop | Ad SDK integration | No |

---

## Who Is Working on What

| Agent | Current Task | Next Task | Blocked By |
|-------|------------|-----------|------------|
| **kimi-openclaw** | Infra setup ✅ → Team Battle Fix | SQL Injection Fix | — |
| **kimi-desktop** | — (ready to pick up FEAT-01) | Splash / Onboarding | — |
| **hermes** | — | Docs drift audit | Waiting for vNext freeze |
| **codex** | Black screen hotfix (completed) | — | — |
| **rescue** | Local fixes branch | — | Needs review |

---

## Git Worktrees

| Worktree | Path | Branch | Owner | Status |
|----------|------|--------|-------|--------|
| `coder-survival-kimi` | `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder-survival-kimi` | `feat/kimi/backend-work` | kimi-openclaw | ✅ Created |
| `coder-survival-desktop` | `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder-survival-desktop` | `feat/desktop/frontend-work` | kimi-desktop | ✅ Created |
| `coder-survival-hermes` | `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder-survival-hermes` | `feat/hermes/docs-work` | hermes | ✅ Created |

---

## CI / CD Status

| Service | Status | Last Check |
|---------|--------|------------|
| Docker Desktop | ✅ Running | 2026-06-03 |
| Backend (local) | ⚠️ Needs restart | 2026-06-03 |
| Git (main) | 7 commits ahead of origin | 2026-06-03 |

---

## Blockers & Risks

| Risk | Severity | Mitigation | Owner |
|------|----------|------------|-------|
| Docker Desktop offline | ✅ Resolved | Started by user | kimi-openclaw |
| `main` 7 commits ahead of `origin` | Low | Push to origin after review | kimi-openclaw |
| FEAT-09 Antifraud blocked on FEAT-10 Analytics | Medium | Do FEAT-10 before FEAT-09 | hermes |
| `origin/rescue/local-fixes` unmerged | Low | Review and merge or delete | rescue |

---

## Communication Rules

1. **Before starting a new task:** update this file + `TASK_QUEUE.md` with agent + branch name.
2. **After completing a task:** move to "Done" in `TASK_QUEUE.md`, update this file.
3. **Branch naming:** `feat/…` for features, `fix/…` for fixes, `docs/…` for docs.
4. **PR size:** frontend ≤400 lines, backend ≤300 lines, docs ≤200 lines.
5. **Merge policy:** 1 approval required for `feat/*`, 2 for `main`.

---

## Quick Links

- [TASK_QUEUE.md](./TASK_QUEUE.md)
- [API_CONTRACTS.md](./API_CONTRACTS.md)
- [FINAL_PLAN.md](./FINAL_PLAN.md)
- [VNEXT_SPEC.md](./VNEXT_SPEC.md)
- [HANDOFF.md](./HANDOFF.md)
