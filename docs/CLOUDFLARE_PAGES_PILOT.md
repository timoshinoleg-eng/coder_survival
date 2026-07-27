# Cloudflare Pages pilot — operator runbook

**Status: PREPARED, NOT DEPLOYED.** This document and the accompanying code
changes prepare the repository for a Cloudflare Pages pilot of the static
frontend. **This PR did not create a Cloudflare project**, deployed nothing, and
changed no provider, DNS, Telegram or backend setting. (Whether some Cloudflare
project already exists in the owner's account is not something this repository can
observe, so no claim is made about that.)

> **Read §2 before merging.** The API-origin refactor changes how the **existing
> Vercel production deployment** routes API traffic, because that deployment has
> `VITE_API_BASE_URL` set. §3a describes the owner decision required.

Everything below marked **OWNER STEP** must be performed manually by the
repository owner, who holds the accounts and credentials.

---

## 1. Topology: CURRENT LIVE vs CANDIDATE

### CURRENT LIVE (unchanged by this PR)

| Component | Where | Notes |
|---|---|---|
| Frontend | **Vercel** — `https://frontend-ashy-alpha-77.vercel.app` | project `prj_6HewqIVhYFQFgim5yQPJjvz6ucHa`, team `olegs-projects-bfc4e11a` |
| Frontend → API routing | `frontend/vercel.json` rewrites (**today**) | `/api/*` and `/health` → `https://coder-survival-api.duckdns.org`. `VITE_API_BASE_URL` **is set** in the project but is currently suppressed by the old hostname check — see §2/§3a |
| Backend API | **Vultr** — `https://coder-survival-api.duckdns.org` | Express + PostgreSQL |
| Bot | **Vercel** webhook | `https://coder-survival-bot.vercel.app/api/invoice-link` |
| Payments | **Disabled** (fail-closed) | `PAYMENTS_ENABLED` / `VITE_PAYMENTS_ENABLED` absent |

### CANDIDATE / PILOT (not deployed)

| Component | Where | Notes |
|---|---|---|
| Frontend | **Cloudflare Pages** — stable `*.pages.dev` project URL | additional, parallel deployment |
| Frontend → API routing | **direct cross-origin** to `https://coder-survival-api.duckdns.org` | Pages has no rewrite layer; requires `VITE_API_BASE_URL` **and** a backend CORS entry |
| Backend API | **unchanged** — still Vultr | no rewrite, no migration, no Worker |
| Bot | **unchanged** — still the Vercel webhook | explicitly out of scope |
| Payments | **still disabled** | pilot is non-commercial |

**Vercel remains production and the rollback path for the entire pilot.** The
Pages deployment is additive: adding it does not remove or modify the Vercel
deployment.

### What this pilot deliberately does NOT do

No Cloudflare Worker, no Pages Function, no D1, no R2, no Upstash, no Neon, no
custom domain, no DNS change, no Telegram webhook or Mini App URL change, no
backend or database rewrite. API traffic is **not** proxied through a Worker.

---

## 2. Why the frontend code needed one change

Before this PR, `frontend/src/utils/api.js` chose the API origin by hostname: any
`*.vercel.app` host was forced to same-origin and `VITE_API_BASE_URL` was
ignored. That is correct for Vercel (the rewrites do the routing) but means the
same build cannot talk to the API from any other host.

Resolution is now based only on the configured value:

| `VITE_API_BASE_URL` | Behaviour | Correct for |
|---|---|---|
| empty / absent / whitespace-only | same-origin (`/api/...`) | Vercel (rewrites), local `npm run dev` (Vite proxy) |
| `https://coder-survival-api.duckdns.org` | that exact origin, on every host | **Cloudflare Pages pilot** |

Trailing slashes are stripped, so a configured origin can never produce `//api`.
There is no Cloudflare-specific branch — there is no hostname input at all, which
is what stops the two providers from drifting apart.

### ⚠️ This refactor DOES change Vercel's API routing — action required

**Vercel is not unaffected, and its `VITE_API_BASE_URL` is not empty.** The live
production bundle at `https://frontend-ashy-alpha-77.vercel.app` was inspected
(read-only) and contains the API origin baked in at build time:

```js
// live /assets/index-DyLBtWZN.js, minified:
const nm = "https://coder-survival-api.duckdns.org",
      rm = typeof window < "u" && window.location.hostname.endsWith(".vercel.app") ? "" : nm;
```

So today `VITE_API_BASE_URL` **is set** in the Vercel project, and the old
hostname check is the only thing suppressing it — on a `*.vercel.app` host the
origin collapses to `""` and the `vercel.json` rewrites do the routing.

**Removing that hostname check means the variable will be honoured.** The next
Vercel build after this PR merges will therefore send API requests **directly
cross-origin** to `https://coder-survival-api.duckdns.org` instead of through the
same-origin rewrites. That is a real behavioural change to production, not a
no-op.

Consequences to weigh:

- The rewrites in `frontend/vercel.json` stop being used for `/api/*`.
- Requests become cross-origin, so the Vercel origin **must** be present in the
  backend CORS allowlist (see §4 — and note the `*.vercel.app` fallback side
  effect there, which becomes load-bearing rather than incidental).
- `Origin` headers and browser preflights now apply to production traffic that
  previously had none.

### OWNER STEP §3a — decide Vercel's `VITE_API_BASE_URL` before/with merge

Pick one, deliberately:

| Option | Action | Result |
|---|---|---|
| **A — preserve today's routing (lower risk)** | **Delete / clear `VITE_API_BASE_URL`** in the Vercel project (Production **and** Preview), then redeploy | Same-origin `/api/...` via `vercel.json` rewrites, exactly as production behaves today |
| **B — accept direct cross-origin** | Leave the variable set | Vercel joins Pages in calling the API directly; requires the Vercel origin in `CORS_ALLOWED_ORIGINS` and a CORS/`initData` re-test of production |

Option **A** is recommended for merging this PR, because it keeps the frontend
refactor and any production routing change as two separate, independently
reversible decisions.

This is an **owner action in the Vercel dashboard**; it was not performed by
automation, and no Vercel setting was read or written beyond fetching the public
production bundle over HTTPS.

---

## 3. OWNER STEP — create the Pages project

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.

| Setting | Exact value |
|---|---|
| Provider | Cloudflare Pages **Git integration** |
| Repository | `timoshinoleg-eng/coder_survival` |
| Production branch | `main` |
| Project root directory | `frontend` |
| Framework preset | None / Vite (either; the build command below is what matters) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | **20** (set env var `NODE_VERSION=20` if the UI offers no picker) |

### Environment variables (Production **and** Preview)

| Variable | Value | Why |
|---|---|---|
| `VITE_API_BASE_URL` | `https://coder-survival-api.duckdns.org` | Pages has no rewrite layer, so the API origin must be explicit |
| `VITE_PAYMENTS_ENABLED` | **absent / empty** | keeps the pilot non-commercial and fail-closed |
| `VITE_ENABLE_REWARDED_ADS` | `false` | ad rewards are monetisation-adjacent |
| `NODE_VERSION` | `20` | only if the dashboard has no Node selector |

**Do not set any secret as a frontend variable.** Vite inlines every `VITE_*`
value into the shipped bundle, where anyone can read it. `BOT_TOKEN`,
`JWT_SECRET`, `BOT_BACKEND_SECRET`, `ADMIN_API_SECRET`, database URLs and Telegram
tokens must never appear in Pages frontend variables.

**Do not attach a custom domain for this pilot.** Use the stable
`*.pages.dev` project URL. A custom domain would mean DNS changes, which are out
of scope, and it is not needed to evaluate reachability or performance.

Record the resulting stable project URL — it is needed for the CORS step. Note
that Pages also generates a *per-deployment* preview URL
(`<hash>.<project>.pages.dev`); those change every build. Use the **stable
project URL** for the CORS allowlist, not a per-deployment one.

---

## 4. OWNER STEP — backend CORS (one exact origin)

The backend allowlist is built in `backend/src/index.js` from `FRONTEND_URL` and
`CORS_ALLOWED_ORIGINS` (comma-separated). Entries are compared by **exact string
match**, so the Pages origin must be added verbatim.

Add the stable Pages origin while keeping the existing Vercel origin:

```
CORS_ALLOWED_ORIGINS=https://frontend-ashy-alpha-77.vercel.app,https://PROJECT.pages.dev
```

- **Do not** add a broad `*.pages.dev` pattern or regex. Any Cloudflare user can
  create a `pages.dev` subdomain, so a wildcard would let attacker-controlled
  sites make credentialed cross-origin requests to this API.
- **Do not** use a trailing slash — the origin in a browser's `Origin` header has
  none, and the match is exact.
- Only restart/redeploy the backend during the owner-operated pilot window, not
  as part of merging this PR.

### Important side effect to be aware of

`backend/src/index.js` allows `*.vercel.app` as a **fallback only when no
explicit origin is configured** (it logs a warning on boot when it does). Once
`CORS_ALLOWED_ORIGINS` is set, that fallback switches off. So the Vercel origin
must be listed **explicitly** in the same variable, exactly as shown above —
otherwise the current production frontend loses CORS access. Telegram
(`t.me`, `telegram.org`) origins are always allowed and are unaffected.

### Rollback: removing the Pages origin

Set the variable back to the Vercel origin alone and restart the backend:

```
CORS_ALLOWED_ORIGINS=https://frontend-ashy-alpha-77.vercel.app
```

The Pages deployment then simply loses API access. It can be left in place
(harmless) or deleted from the Cloudflare dashboard.

---

## 5. Deployment acceptance sequence

1. **Build.** Confirm CI is green on `main`, or run `npm ci && npm run build` in
   `frontend/` locally. Output goes to `frontend/dist`.
2. **OWNER STEP — create the Pages project** per §3. Wait for the first build,
   then note the stable `*.pages.dev` project URL.
3. **OWNER STEP — configure and restart the backend CORS allowlist** per §4,
   using the URL from step 2, **before** running the smoke script.

   This ordering matters: the smoke script's CORS check requires the API to
   authorise the exact Pages origin. Running it first would produce a guaranteed
   CORS failure that says nothing about the deployment — and inviting the
   operator to "expect one failure" is exactly how a real CORS regression gets
   waved through later.

4. **OWNER STEP — decide the Vercel `VITE_API_BASE_URL` question** per §3a, if it
   has not been settled already. This is independent of the Pages pilot but is
   triggered by the same refactor, so settle it before treating any smoke result
   as a baseline.

5. **Run the smoke script** (repeatable, dependency-free, read-only):

   ```
   cd frontend
   npm run smoke:cloudflare -- \
     --frontend https://PROJECT.pages.dev \
     --api https://coder-survival-api.duckdns.org
   ```

   It verifies: HTML 200 and the real app shell (mount point `#app`); every
   same-origin JS/CSS asset returns 200 **with a JS/CSS `Content-Type`**;
   `/tonconnect-manifest.json` is valid JSON **with real absolute HTTPS URLs**;
   API `/health` returns `ok`; and a browser-like CORS preflight (with
   `content-type` and `x-telegram-init-data`) returns **HTTP 2xx** and authorises
   the **exact** Pages origin. Exit code 0 means all checks passed. It never
   calls an authenticated economy or payment endpoint.

   Three deliberate strictness rules, each closing a false-pass:

   - A wildcard `Access-Control-Allow-Origin: *` is **FAIL**, not a pass — the
     exact origin must be allowlisted, and a wildcard cannot be used with
     credentialed requests.
   - A **non-2xx preflight is FAIL even when its CORS headers look correct**.
     Browsers reject a non-2xx preflight regardless of headers, so a 401/404/500
     carrying permissive headers is a broken API, not working CORS.
   - An asset answering **HTTP 200 with `text/html`** is **FAIL**. That is the
     SPA-fallback signature: the host rewrote a missing bundle to `index.html`,
     which a status-only check would report as success.

   The same script can be pointed at the **current Vercel deployment** to
   establish a control baseline before the pilot:

   ```
   npm run smoke:cloudflare -- \
     --frontend https://frontend-ashy-alpha-77.vercel.app \
     --api https://coder-survival-api.duckdns.org
   ```

6. **Manual network testing.** The smoke script runs from wherever you invoke it;
   it cannot tell you what a user on a given network sees. Test the Pages URL in
   a browser from at least:
   - one fixed Russian ISP;
   - two mobile operators, if available;
   - one VPN route;
   - Telegram **Android** client;
   - Telegram **Desktop** client.

7. **Record for each network/client:**
   - initial HTML load (success/failure, and any interstitial or challenge page);
   - static asset failures (count and which);
   - API + CORS result;
   - Telegram `initData` authentication (does the app actually load your state?);
   - browser console and network errors;
   - approximate first-load time.

   Compare against the Vercel URL from the **same** network as a control —
   otherwise a general network problem is indistinguishable from a
   provider-specific one.

8. **Only after static and browser acceptance passes** may the owner *temporarily*
   point the Telegram Mini App URL at the Pages deployment. That is a separate,
   deliberate, owner-only action — not part of this PR.

9. **Keep the Vercel URL live and reachable throughout**, so reverting the Mini
   App URL is an immediate rollback with no rebuild.

---

## 5a. PRE-EXISTING BLOCKER — tonconnect-manifest.json placeholders

`frontend/public/tonconnect-manifest.json` ships placeholder URLs on `main`
today. This is **not** caused by this PR and is **not** fixed by it:

```json
{"url":"https://t.me/CoderSurvivalBot","name":"Coder Survival",
 "iconUrl":"https://coder-survival.example.com/icon.png",
 "termsOfUseUrl":"https://coder-survival.example.com/terms",
 "privacyPolicyUrl":"https://coder-survival.example.com/privacy"}
```

`coder-survival.example.com` is an RFC 2606 reserved domain that resolves
nowhere. TON Connect reads this manifest, so wallet connect cannot work correctly
from **any** host — Vercel today included. The smoke script therefore reports it
as **FAIL** on both the Pages pilot and the Vercel control baseline.

**This is a genuine pilot blocker for anything involving TON wallet connect, and
it is deliberately left unfixed here.** Inventing a production URL would be
fabricating infrastructure the owner has not confirmed, and this PR must not
change providers or domains.

**OWNER DECISION required** (separate from this PR):
- supply the real hosted URLs for `iconUrl`, `termsOfUseUrl`, `privacyPolicyUrl`
  and update the manifest, **or**
- accept that TON wallet connect is out of scope for the pilot and evaluate only
  the non-wallet paths, treating this one smoke failure as a known, documented
  exception rather than a Pages regression.

Do not paper over it by relaxing the smoke check: the check exists so this is
visible rather than silently broken.

**How the smoke script scopes this.** A manifest placeholder is a *repository*
defect, not a deployment defect — it fails identically on Vercel and on Pages. The
script therefore labels it `[pre-existing repo defect]`, reports it separately, and
still **exits 0** when every deployment-level check passes. Two reasons:

- treating it as a deployment failure would make a healthy Pages deployment
  indistinguishable from a broken one for as long as the manifest stays unfixed,
  which trains the operator to ignore the exit code;
- the pilot's whole purpose is comparing Pages against a Vercel control, and a
  defect present in both tells you nothing about either.

A **deployment**-scoped failure (HTML, assets, `/health`, CORS) still exits 1.

Measured baseline against current production on 2026-07-27:
`5/5 deployment checks passed, exit 0`, with this manifest defect reported
separately.

---

## 6. Stop / rollback conditions

Abort the pilot and revert to Vercel if any of the following is observed:

- repeated Cloudflare throttling, CAPTCHA challenges or blocks from tested
  Russian networks;
- any CORS or `initData` authentication regression;
- static assets or `/tonconnect-manifest.json` unavailable or intermittently
  failing;
- API error rate measurably worse than the Vercel control on the same network;
- **any payment UI appearing in the pilot build** — this is a hard stop; the
  build must be non-commercial and payments fail-closed;
- any requirement to add a credit card, which would violate the owner's
  zero-cost rule.

**Rollback procedure:** revert the Telegram Mini App URL to the Vercel URL (if it
was changed), remove the Pages origin from `CORS_ALLOWED_ORIGINS` and restart the
backend (§4), and optionally delete the Pages project. Because Vercel was never
modified, no redeploy or rebuild of production is required.

---

## 7. Language discipline

Do **not** describe the outcome of this pilot as "Russia-Proof", "sovereign", or
otherwise guaranteed. What a pilot can establish is a measurement: whether these
specific networks, at this specific time, reached this specific deployment.
Reachability can change without notice and is not a property this repository
controls. Record observations with dates and network names, and let the data
stand on its own.

---

## 8. Deferred — requires separate PRs and owner approval

Worker/Hono bot webhook pilot · Worker API gateway · Neon staging database and
migration rehearsal · any PostgreSQL production cutover · D1 schema/query
rewrite · R2 asset migration · Upstash leaderboard · Cloudflare Web Analytics ·
custom domain or DNS changes · Telegram webhook or Mini App URL changes ·
production CORS/environment mutation.

If a Worker gateway is later approved it must be a **closed, allowlisted** proxy
— never an open proxy — and must preserve `initData`/auth headers, HTTP methods,
request bodies, status codes, timeouts and size limits unchanged. It must not
contain any new payment business logic.

See `docs/FREE_TIER_OPTIONS.md` for the evidence behind these deferrals.
