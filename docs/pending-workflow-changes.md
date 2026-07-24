# Pending CI workflow changes (apply manually)

> The automation used to open this PR authenticates via an integration that
> lacks the GitHub `workflow` permission, so it **cannot commit changes under
> `.github/workflows/`**. The changes below are part of this prod-readiness pass
> but must be applied by a maintainer with workflow write access (commit them to
> the `hyperagent/prod-readiness` branch, or apply on merge). Each is small and
> low-risk.

## 0. `deploy-preview` check (VERCEL_TOKEN) — optional, cosmetic

`.github/workflows/preview.yml` runs `vercel --token=${{ secrets.VERCEL_TOKEN }}`.
Without that secret the step fails, so the `deploy-preview` check shows red.
Read its status precisely:

- The job is `continue-on-error: true`, so it **does not block merge** — and,
  symmetrically, **a green workflow run does NOT prove a Vercel preview was
  actually created** (the deploy step may have failed inside a green run).
- Without `VERCEL_TOKEN` the deploy should either **skip cleanly** (guard below)
  or remain explicitly optional as it is now.
- **Production deployment must not depend on this preview job** — the production
  path is the manual backend deploy plus Vercel's own Git integration for the
  frontend. Do not add the secret to code.

To make the check meaningful, either:

- **Add the secret** (preferred): set repo secret `VERCEL_TOKEN`, and confirm the
  hard-coded `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` env values in `preview.yml`
  match the current Vercel project; **or**
- **Guard the deploy step** so it skips cleanly when the token is absent:

```diff
       - name: Deploy to Vercel
         working-directory: frontend
+        if: ${{ env.VERCEL_TOKEN != '' }}
+        env:
+          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
         run: vercel --yes --token=${{ secrets.VERCEL_TOKEN }}
```

## 1. `.github/workflows/backend-tests.yml` — add migration bootstrap gate
```diff
@@ -49,5 +49,13 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Migration bootstrap gate (fresh DB + idempotent re-run)
+        # Uses the job-level NODE_ENV=test + TEST_DATABASE_URL. Applies every
+        # migration to the fresh postgres service, then re-runs to prove the
+        # sequence is idempotent (guards the achievements slug-ordering fix).
+        run: |
+          node src/migrate.js
+          node src/migrate.js
+
       - name: Run backend tests
         run: npm test -- --runInBand
```

## 2. `.github/workflows/claude-agent.yml` — disable auto-triggers + least privilege
```diff
@@ -26,16 +26,25 @@ on:
         required: false
         default: 'gpt-5.4'
         type: string
-  schedule:
-    - cron: '0 */6 * * *'
-  workflow_run:
-    workflows: ["CI", "Test", "Build", "full-ci"]
-    types:
-      - completed
+  # SECURITY: automatic triggers are DISABLED. This job downloads and executes an
+  # unpinned script from an external repository (timoshinoleg-eng/Jules) with
+  # write access to code and pull requests. Running it unattended every 6h and on
+  # every CI completion is a supply-chain risk and produced the unreviewed
+  # auto-PRs #2–#6. It remains available via manual workflow_dispatch only.
+  # Re-enable scheduling only after pinning the remote script to a reviewed commit
+  # SHA (or vendoring it) and narrowing permissions.
+  # schedule:
+  #   - cron: '0 */6 * * *'
+  # workflow_run:
+  #   workflows: ["CI", "Test", "Build", "full-ci"]
+  #   types:
+  #     - completed
 
+# Least privilege: manual dispatch does not need write scopes by default. Elevate
+# deliberately if/when the agent is intentionally run to open a PR.
 permissions:
-  contents: write
-  pull-requests: write
+  contents: read
+  pull-requests: read
   actions: read
 
 jobs:
```

## 3. `.github/workflows/deploy-backend.yml` — tests must gate deploy
```diff
@@ -17,10 +17,11 @@ jobs:
 
       - name: Run backend tests
         working-directory: backend
+        # Tests MUST gate the deploy. Do not re-add continue-on-error — a failing
+        # suite has to stop the deploy job (needs: test).
         run: |
           npm ci
           npm test
-        continue-on-error: true
 
   deploy:
     needs: test
```
