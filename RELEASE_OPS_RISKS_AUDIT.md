# Coder Survival — Release Path Ops Risks Audit

**Audit date:** 2026-05-07  
**Scope:** release scripts, smoke tests, docker-compose, Dockerfile, git state, readiness gaps.  
**Constraint:** no infra changes, only audit + minimal safe hardening ideas.

---

## 1. Release Payload — New Files Leakage

### Risk 1.1 — Untracked / unignored files leak into VM payload
- **Code:** `scripts/release-prod.ps1` lines 90–98
  ```powershell
  $files = @(git -C $repoRoot ls-files) + @(git -C $repoRoot ls-files --others --exclude-standard)
  $filtered = $files | Where-Object {
    $_ -and
    $_ -notmatch '(^|/)(node_modules|dist|\.git|\.vercel)(/|$)' -and
    $_ -notmatch '^bot/(bot-local\.log|bot-local\.err\.log)$' -and
    $_ -notmatch '^backend/\.env$' -and
    $_ -notmatch '^backend/\.env\.production$' -and
    $_ -ne 'coder-survival-deploy.tgz'
  }
  ```
- **What gets through:**
  - `backend/.env.local` — **not excluded** (root `.gitignore` has `*.local`, but `git ls-files --others --exclude-standard` respects `.gitignore`; however if `.env.local` is tracked it goes through).
  - Any `.sql` dumps, `.log`, `.md`, editor backups in `backend/` — no exclusion.
  - Entire `scripts/`, `ads/`, `analytics/`, `payments/` directories — copied to VM even though not needed for runtime.
  - Planning docs (`VNEXT_SPEC.md`, `BOT_RUNTIME_PLAN.md`, etc.) — land on production VM.
  - `AUDIT_*.md`, `DRIFT_*.md` files created during audits — untracked and not ignored, so they leak.
- **Impact:** Increased attack surface, potential secret leakage if operator drops files into repo.

### Risk 1.2 — No backend/.gitignore exists
- **Evidence:** `Glob backend/.gitignore` → no match. `frontend/.gitignore` and `bot/.gitignore` only contain `.vercel`.
- **Impact:** Any file created in `backend/` (e.g., `backend/debug.sql`, `backend/dump.pg`, `backend/notes.md`) is not ignored by default and will be included in payload if untracked.

### Risk 1.3 — Uncommitted changes in tracked files are deployed silently
- **Code:** `release-prod.ps1` line 100–109 copies files from disk by path, not from git index.
- **Impact:** Operator may deploy WIP/hotfix code that is not committed. Rollback becomes impossible because there is no tag/commit associated with the deployed state.

---

## 2. Git State Dependency

### Risk 2.1 — Release payload depends on local git state, not a clean commit
- **Code:** `release-prod.ps1` does **not** run `git status --porcelain`, `git diff --stat`, or `git rev-parse HEAD` before building payload.
- **Impact:**
  - Non-reproducible releases: two operators running release from the same branch may produce different payloads if one has local changes.
  - No audit trail: cannot correlate a running backend image with a specific git SHA.

### Risk 2.2 — No git SHA tag on Docker image
- **Code:** `release-prod.ps1` line 128:
  ```powershell
  docker build --no-cache -t cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest ./backend
  ```
- **Impact:** Only `latest` tag is pushed. No immutable reference. If rollback is needed, previous image is untagged and may be garbage-collected by registry or overwritten.

---

## 3. Readiness Gaps After Backend Recreate

### Risk 3.1 — No wait/poll between `up -d` and health check
- **Code:** `release-prod.ps1` remote script lines 128–131:
  ```bash
  docker-compose -f docker-compose.backend.yml up -d --force-recreate backend
  # Note: release-prod.ps1 now polls container health before marking success.
  ```
- **Impact:** `curl` runs immediately. If container cold-start takes >1s (npm module cache, DB pool init), `curl` fails and release aborts even though container is starting normally.

### Risk 3.2 — Health check is single endpoint, not readiness probe
- **Code:** `curl -fsS http://localhost:3000/health` checks `/health` only.
- **What is NOT verified before smoke:**
  - All API endpoints are routable (`/api/state`, `/api/tap`, etc.).
  - Nginx upstream has picked up the new backend container.
  - First complex query (e.g., `ensurePlayerLevel` with `ON CONFLICT UPDATE`) does not fail due to migration mismatch.
  - Bot webhook handler is reachable (smoke runs separately, but not as a readiness gate).
- **Impact:** Release may be marked successful while backend is still warming up or partially broken.

### Risk 3.3 — `force-recreate` kills old container before new one is healthy
- **Code:** `docker-compose up -d --force-recreate backend` (line 130).
- **Impact:** Zero-downtime deployment is not guaranteed. Old container is killed immediately. If new container fails health check or crashes on start, there is no running backend until operator intervenes. No automatic rollback.

### Risk 3.4 — Migration failure leaves VM in partial state
- **Code:** remote script line 129:
  ```bash
  docker-compose -f docker-compose.backend.yml run --rm backend node src/migrate.js
  ```
- **Impact:** If migration fails, `set -euo pipefail` stops the script. The zip is already extracted to `/opt/coder-survival/app`. Old container may still be running (if `up -d` hasn't run yet), but source code on disk is now newer. If operator manually restarts container later, it will run new code against old DB schema.

### Risk 3.5 — Frontend Vercel deploy and backend deploy are not synchronized
- **Code:** `release-prod.ps1` deploys frontend to Vercel (async) and backend to VM (sequential) in the same script. No coordination point.
- **Impact:** If frontend deploy finishes first and references new API contracts that backend hasn't received yet, users see broken UI. Reverse scenario: backend has new API, but Vercel edge cache still serves old frontend.

### Risk 3.6 — `docker-compose.prod.yml` contains unused services
- **Evidence:**
  - `frontend` service (lines 4–13) with `ports: "80:80"` — frontend is hosted on Vercel, not on VM. If operator runs `docker-compose up`, it will bind port 80 and conflict with host nginx. A header comment was added to clarify this is legacy reference only.
  - `bot` service (lines 38–48) — bot runs on Vercel webhook. VM cannot reach `api.telegram.org`. Starting this service on VM will fail polling.
- **Impact:** Confusion for operators. Risk of accidental `docker-compose up` on VM bringing up conflicting/unusable services.

---

## 4. Smoke Script Brittleness

### Risk 4.1 — Smoke cannot start if backend container is unhealthy
- **Code:** `smoke-prod.ps1` line 51:
  ```powershell
  $botToken = ssh $VmHost "cd $RemoteAppDir && docker-compose -f docker-compose.backend.yml run --rm -T backend printenv BOT_TOKEN" | Select-Object -Last 1
  ```
- **Impact:** Smoke requires a working backend container just to read `BOT_TOKEN`. If backend is in restart loop or migration failed, smoke cannot even generate auth headers. Operator is blind.

### Risk 4.2 — Persistent smoke user creates dirty state
- **Code:** `smoke-prod.ps1` uses fixed `SmokeTelegramId = 900000001` (line 7). `smoke-offers.ps1` uses random ID (line 17), but both create users in production DB.
- **Impact:**
  - Smoke user accumulates state: team memberships, offer cooldowns, quest progress, pass XP.
  - Next smoke run may fail because energy is already 0, quests already claimed, or team already exists.
  - No cleanup: smoke scripts do not delete the smoke user or reset its state after run.

### Risk 4.3 — `team/leave` failure poisons `team/my` test result
- **Code:** `smoke-prod.ps1` lines 170–178:
  ```powershell
  try {
    $teamMine = Invoke-RestMethod "$BaseUrl/api/team/my" ...
    if ($null -ne $teamMine.team) {
      [void](Invoke-RestMethod "$BaseUrl/api/team/leave" ...)
    }
    Add-Result ... Ok=$true
  } catch {
    Add-Result ... Ok=$false
  }
  ```
- **Impact:** If `team/leave` returns 404 (user not in a team, which is normal if `team/my` returned no team), the **entire** `team/my` test is marked failed, even though `team/my` itself succeeded.

### Risk 4.4 — Hardcoded thresholds in smoke-offers break on balance changes
- **Code:** `smoke-offers.ps1` line 82: `if ([int]$state.game.energy -le 25)`.
- **Impact:** If `balance.js` changes `energyPercentThreshold` for `low_energy` from 25% to 30%, smoke breaks even though offer logic is correct.

### Risk 4.5 — Global offer cooldown causes intermittent smoke failures
- **Code:** `smoke-offers.ps1` does not check global cooldown (90s) before driving taps.
- **Impact:** If smoke is run twice within 90 seconds, the second run may never see an offer and fail after 120 attempts.

### Risk 4.6 — No assertions on concrete economy values
- **Evidence:**
  - `smoke-prod.ps1` checks `event/active` response structure, but **never** asserts `targetCommits == 650`.
  - `smoke-prod.ps1` checks `shop/products` count, but **never** asserts prices match catalog.
  - `smoke-prod.ps1` checks `pass/status` level/XM, but **never** asserts XP curve values.
- **Impact:** Smoke can pass while backend is running stale economy constants (e.g., old migration 004 defaults).

### Risk 4.7 — `curl.exe` dependency on Windows-only
- **Code:** `smoke-prod.ps1` line 203: `$botResponse = curl.exe -s -o NUL -w "%{http_code}" $BotWebhookUrl`.
- **Impact:** If smoke script is ever run from PowerShell on Linux/mac, `curl.exe` will not be found. Script fails at final step.

### Risk 4.8 — Smoke tests public Vercel endpoint, not direct backend
- **Code:** `smoke-prod.ps1` uses `$BaseUrl = "https://frontend-ashy-alpha-77.vercel.app"` (line 5). All API calls go through Vercel rewrite proxy.
- **Impact:** If Vercel edge caching or rewrite rules are stale, smoke may test old backend through proxy while direct backend is already updated. False positive.

---

## 5. Other Operational Risks

### Risk 5.1 — `backend/Dockerfile` lacks `.dockerignore`
- **Evidence:** No `backend/.dockerignore` file exists.
- **Impact:** `COPY src/ ./src/` copies everything from `backend/src/`, including any local temp files, editor swap files, or accidentally dropped secrets.

### Risk 5.2 — Hardcoded YCR registry ID
- **Code:** `release-prod.ps1` line 128: `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest`.
- **Impact:** If registry ID changes (e.g., new YC folder), release script breaks. No env var override.

### Risk 5.3 — `.env` files exclusion is incomplete
- **Evidence:** `release-prod.ps1` excludes `backend/.env` and `backend/.env.production`, but **not** `backend/.env.local`, `backend/.env.development`, or `.env` files in other subdirectories.
- **Impact:** Operator may have `backend/.env.local` with local DB credentials. It will be copied to VM and potentially committed into Docker image if not ignored.

### Risk 5.4 — Zip extraction overwrites without atomicity
- **Code:** remote script extracts zip directly into `$RemoteAppDir` (`/opt/coder-survival/app`).
- **Impact:** If extraction is interrupted (SSH disconnect, disk full), VM repo is left in partially overwritten state. No atomic swap (e.g., extract to `/opt/coder-survival/app.next`, then `mv`).

### Risk 5.5 — No rollback mechanism
- **Evidence:** Neither `release-prod.ps1` nor `docker-compose.prod.yml` define a rollback strategy.
- **Impact:** If smoke fails after deploy, operator must manually revert by rebuilding old image or restoring old code. No one-command rollback.

---

## 6. Minimal Safe Hardening Ideas (no infra changes)

### 6.1 Release script hardening
1. **Add `git status --porcelain` guard** at start of `release-prod.ps1`: abort if uncommitted changes or untracked files exist.
2. **Tag Docker image with git SHA** in addition to `latest`:
   ```powershell
   $gitSha = git -C $repoRoot rev-parse --short HEAD
   docker build --no-cache -t cr.yandex/.../coder-survival-backend:$gitSha -t cr.yandex/.../coder-survival-backend:latest ./backend
   ```
3. **Add sleep/poll between `up -d` and health check**:
   ```bash
   docker-compose up -d --force-recreate backend
   for i in {1..10}; do
     curl -fsS http://localhost:3000/health && break
     sleep 2
   done
   ```
4. **Use explicit file whitelist** for backend payload instead of blacklist regex (copy only `backend/`, `docker-compose.backend.yml`, `nginx/`, and necessary configs; exclude `scripts/`, `ads/`, `analytics/`, `payments/`, `*.md` planning docs).
5. **Add `backend/.dockerignore`**:
   ```
   *.test.js
   *.spec.js
   .env*
   !.env.example
   local/
   tmp/
   ```

### 6.2 Smoke script hardening
6. **Cleanup phase** at end of `smoke-prod.ps1`: delete smoke user from DB (`DELETE FROM users WHERE telegram_id = $SmokeTelegramId`) and any created teams.
7. **Separate try-catch for `team/leave`** so 404 on leave does not fail `team/my` result.
8. **Add concrete value assertions**:
   - After `event/active`: `if ($event.event.targetCommits -ne 650) { throw }`
   - After `shop/products`: verify each product ID and price match expected catalog.
9. **Parameterize URLs** via env vars or small `smoke-config.json` instead of hardcoded strings in script headers.
10. **Replace `curl.exe` with `Invoke-RestMethod`** for cross-platform consistency in bot webhook check.

### 6.3 docker-compose / deployment hardening
11. **Comment out or remove unused `frontend` and `bot` services** from `docker-compose.prod.yml` to prevent accidental startup on VM.
12. **Add `docker-compose logs --tail=20 backend`** after health check in remote script so operator sees startup errors immediately.
13. **Atomic extraction**: change remote script to extract zip to temp dir, then `rsync -a --delete` or `mv` into place.

---
*End of audit. No code or infra was changed.*
