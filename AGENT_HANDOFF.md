# Agent Handoff — Coder Survival

> ⚠️ **Устаревший статус-документ.** Каноничное текущее состояние:
> `docs/PRODUCTION_READINESS_REPORT.md` и `docs/CURRENT_ARCHITECTURE.md`.

Updated: 2026-06-17 21:45 +03

## Current Mode
- Next cycle completed through frontend/bot production deploy and backend deploy attempt.
- Code/workflow CI is green on GitHub.
- Frontend and bot were deployed to Vercel production.
- Backend production deploy is blocked by VM SSH connectivity from GitHub runner.
- Not executed: local SSH deploy, reset, clean, secret reads/prints.

## Repo Status Snapshot
- Repo: `/mnt/c/Users/Имярек/Downloads/Coder Survival/coder_survival_repo/coder_survival_fresh`.
- Branch: `main`.
- Current GitHub HEAD before this handoff update: `9534d9d`.
- Local repo was synced with `origin/main` before deploy cycle.
- GitHub push uses `GITHUB_TOKEN` from `/mnt/c/Users/Имярек/Downloads/token1706.txt` via temporary `GIT_ASKPASS`; token contents were not printed.

## Final GitHub Actions State Before Deploy Cycle
- On `9534d9d`:
  - `Full CI`: success.
  - `Security Scan`: success.
  - `Render Deploy Status & Setup`: success.
- On previous code/workflow HEAD `f2d8ace`:
  - `Full CI`: success.
  - `Backend Tests`: success.
  - `Integration Tests (Staging DB)`: success.
  - `Security Scan`: success.
  - `Render Deploy Status & Setup`: success.

## Production Target Facts
- Frontend Vercel production alias: `https://frontend-ashy-alpha-77.vercel.app`.
- Bot Vercel production alias: `https://coder-survival-bot.vercel.app`.
- API origin: `https://coder-survival-api.duckdns.org`.
- Active backend compose requires `BACKEND_IMAGE_TAG=git-<40-hex-reviewed-sha>`; mutable `latest` is forbidden for validation, migration, restart and smoke.
- Local release script default VM host: `root@185.92.221.219`.
- GitHub secrets present: `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `BOT_TOKEN`, `BOT_BACKEND_SECRET`, `WEBAPP_URL`, `TEST_DB_PASSWORD`.
- Public API health returned `status=ok`, `db=connected`.

## Deploys Completed
- Frontend Vercel production deploy: success.
  - New deployment: `https://frontend-4fy3f638x-olegs-projects-bfc4e11a.vercel.app`.
  - Alias updated: `https://frontend-ashy-alpha-77.vercel.app`.
  - Log: `/tmp/coder-survival-audit/vercel-frontend-prod-deploy.log`.
- Bot Vercel production deploy: success.
  - New deployment: `https://coder-survival-edrvprwnt-olegs-projects-bfc4e11a.vercel.app`.
  - Alias updated: `https://coder-survival-bot.vercel.app`.
  - Log: `/tmp/coder-survival-audit/vercel-bot-prod-deploy.log`.

## Post-Vercel Smoke
- Frontend root GET: `200`, saved to `/tmp/coder-survival-audit/frontend-root.html`.
- Frontend `/health` rewrite: returned API health ok/db connected.
- Direct API `/health`: returned ok/db connected.
- Bot webhook GET probe: returned `401`, expected for protected webhook endpoint.

## Backend Deploy Attempt
- `deploy-backend.yml` was dispatched manually via GitHub API at run `27711507855`.
- Test job: success.
- Deploy job: failure.
- Failure root cause: GitHub runner cannot reach VM SSH port 22.
  - Log path: `/tmp/coder-survival-audit/gh-deploy-9534d9d/81973538451.log`.
  - Error: `ssh: connect to host *** port 22: Connection timed out`; `rsync error: unexplained error (code 255)`.
- This is the same network/VM SSH blocker as the earlier auto-deploy failure.
- Backend deploy was not completed.

## Important Deploy Path Notes
- `.github/workflows/deploy-backend.yml` is manual-only now, but still uses the older rsync + docker-run deploy path and does not run migrations.
- `scripts/release-prod.ps1` is the hardened path: builds immutable `git-<shortsha>` image, tags `latest`, runs migrations, recreates backend via compose, and runs smoke.
- Local VM SSH also previously failed for `root@185.92.221.219`; GitHub runner failed by timeout to the secret VM host.
- Do not retry backend deploy blindly until VM SSH reachability/key/firewall are fixed or a runner inside the operator network is used.

## CI Fixes Already Included
- Achievement migrations updated to current slug-based catalog schema.
- Vulnerable `gifencoder -> canvas -> tar` chain removed; GIF helper now generates PNG preview buffers via `@napi-rs/canvas`.
- Production audits pass with `found 0 vulnerabilities`.
- Backend test isolation fixed for route smoke rate/anti-cheat state.
- Staging DB integration workflow skips neutrally when external staging DB is unreachable.

## Remaining Local Worktree State
- Expected after this handoff update: only `AGENT_HANDOFF.md` changed until committed/pushed.
- Untracked local-only files remain: `.claude/settings.local.json`, `smoke-check-01-auth-error.png`.
- Do not commit `.claude/`, screenshots, token file, logs, generated artifacts, `.env*`, credentials, secrets.

## Stop Point
- Frontend and bot production deploy are complete and smoked.
- Backend deploy is blocked by VM SSH connectivity from both local shell and GitHub runner.
- Next recommended action: fix VM SSH access/firewall or set up a self-hosted runner/operator-network deploy path, then use the hardened `scripts/release-prod.ps1` backend path or update GitHub deploy workflow to call it.
