# Coder Survival — Manual Release Checklist

**Date:** ___________  
**Operator:** ___________  
**Git commit:** ___________  

---

## Pre-flight (do not skip)

- [ ] `git status` is clean (or `-AllowDirty` is intentional and documented)
- [ ] No `.env` / `backend/.env*` files in repo workspace (`release-prod.ps1` will block)
- [ ] `docker-compose.backend.yml` passes `docker compose config` without errors
- [ ] `node --check bot/index.js` passes (syntax sanity)
- [ ] `npm --prefix frontend ci && npm --prefix frontend run build` passes locally
- [ ] `project-status.json` `last_updated` will be bumped after release
- [ ] `HANDOFF.md` does not need edits for this release

---

## Release Steps

Run the hardened release script from a PowerShell operator environment:

```powershell
pwsh -File scripts/release-prod.ps1
```

Optional flags (use only when the scope is intentionally reduced):

```powershell
# Backend-only hotfix (skip Vercel redeploy)
pwsh -File scripts/release-prod.ps1 -SkipVercel

# Frontend+bot only (skip VM backend)
pwsh -File scripts/release-prod.ps1 -SkipBackend

# Skip post-deploy smoke (not recommended)
pwsh -File scripts/release-prod.ps1 -SkipSmoke

# Allow uncommitted changes (emergency only)
pwsh -File scripts/release-prod.ps1 -AllowDirty
```

What the script does:
1. Validates git cleanliness (unless `-AllowDirty`).
2. Scans for forbidden secret files.
3. Builds a filesystem-whitelist payload for the backend.
4. Prints the payload manifest.
5. Deploys frontend + bot to Vercel production (unless skipped).
6. Uploads and extracts backend payload on VM.
7. Builds immutable `coder-survival-backend:git-<candidate-sha>` and the
   `latest` alias locally on the VM.
8. Runs migrations via `docker-compose.backend.yml`.
9. Force-recreates the backend container.
10. Waits for Docker healthcheck (up to 20 s).
11. Runs `smoke-prod.ps1` and `smoke-offers.ps1`.

---

## Post-Release Verification

- [ ] `smoke-prod.ps1` passed (all assertions green)
- [ ] `smoke-offers.ps1` passed
- [ ] VM container healthy:
  ```bash
  ssh $env:CODER_SURVIVAL_VM_SSH_TARGET
  docker compose -f docker-compose.backend.yml ps
  docker compose -f docker-compose.backend.yml logs --tail=20 backend
  ```
- [ ] Public health endpoints respond:
  ```bash
  curl -I https://frontend-ashy-alpha-77.vercel.app/health
  curl -I https://coder-survival-api.duckdns.org/health
  ```
- [ ] Bot webhook responds with 401/405 (confirms public function alive):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://coder-survival-bot.vercel.app/api/webhook
  ```
- [ ] Telegram `/start` opens Mini App without errors (manual spot-check)

---

## Documentation Update

- [ ] `project-status.json` `last_updated` bumped to release date/time
- [ ] `project-status.json` `last_deploy` fields updated for changed components
- [ ] `project-status.json` `latest_applied_migration` updated if new migrations ran
- [ ] `HANDOFF.md` "Current state" and "Verified behavior" updated if new features shipped
- [ ] `RELEASE_OPS_RISKS_AUDIT.md` updated if any operational risks changed

---

## Rollback Plan (if smoke fails)

1. Backend: check out the recorded accepted rollback commit and run the same
   guarded `scripts/release-prod.ps1` path. Do not pull an image from an
   obsolete registry or substitute an arbitrary VM target.
2. Frontend / bot: Vercel rollback via dashboard or `npx vercel rollback`.
3. Notify team in chat and mark release as failed in `project-status.json`.

---

*This checklist is a companion to `scripts/release-prod.ps1`. If the script changes, update this doc.*
