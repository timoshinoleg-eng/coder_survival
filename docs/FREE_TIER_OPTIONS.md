# Free-tier upgrade matrix — evidence-based

**Purpose.** Record what each candidate platform officially offers, so migration
decisions rest on primary sources rather than recollection or marketing copy.

**Method.** Every quota below was read from the vendor's own documentation or
pricing page on the verification date shown. Anything not stated on a page that
was actually read is marked **UNKNOWN** rather than inferred.

**Verification date for all entries: 2026-07-27.**

Two facts are deliberately *not* asserted anywhere in this document, because no
official page states them and neither can be established from a desk:

- whether a given provider requires a **payment card** for its free tier;
- whether a given provider is **reachable or registerable from Russia**.

Both are marked **OWNER TEST REQUIRED** or **UNKNOWN** throughout. They depend on
the owner's own account state, jurisdiction and network, and change without
notice.

---

## Repository constraints that decide suitability

These are properties of *this* codebase, and they eliminate several otherwise
attractive options:

| Requirement | Where it comes from | Consequence |
|---|---|---|
| Native Node addon `@napi-rs/canvas` | `backend/package.json`; used by `utils/memeRenderer.js`, `utils/gifRenderer.js` | Needs a real Node process that can load `.node` binaries |
| Long-running Node process | Express app in `backend/src/index.js` | Rules out request-scoped-only runtimes for the API |
| `node-cron` scheduled jobs | 8 cron jobs in `backend/src/jobs/` | Needs either a persistent process or platform cron |
| PostgreSQL transactions | `BEGIN`/`COMMIT` + `FOR UPDATE` row locks throughout, e.g. `routes/internalPayments.js` | Needs real PostgreSQL, not a SQL-ish substitute |
| Connection pooling | `pg.Pool`, `DB_POOL_MAX` default 50 | Needs a pooler or a persistent connection |

---

## 1. Baseline — Vercel (frontend) + Vultr (backend), CURRENT LIVE

| Field | Finding |
|---|---|
| Role | Vercel serves the static frontend and rewrites `/api` → Vultr; Vultr runs Express + PostgreSQL |
| Free quota | Vercel Hobby is free for non-commercial use; **Vultr is a paid VPS** — this baseline is not zero-cost today |
| Card requirement | Vultr: card already on file (it is a paid VPS). Vercel Hobby: **UNKNOWN** from official pages |
| Access from Russia | **OWNER TEST REQUIRED** — this is precisely the open question motivating the pilot |
| Long-running Node | Yes (Vultr VPS) |
| Native `@napi-rs/canvas` | Yes (ordinary Linux Node process) |
| Cron jobs | Yes (`node-cron` in-process) |
| PostgreSQL transactions | Yes (self-hosted PostgreSQL) |
| Connection pooling | Yes (`pg.Pool` in-process) |
| Data/export path | Full filesystem and `pg_dump` access |
| Vendor lock-in | Low — plain Docker/Node/PostgreSQL, portable to any VPS |
| Free-quota failure mode | N/A (paid) |
| Migration effort | None — this is the status quo |
| Rollback path | N/A — this *is* the rollback target |
| **Verdict** | **KEEP.** Remains production and the rollback path for the Pages pilot. |

---

## 2. Cloudflare Pages — static frontend · **RECOMMENDED, PHASE 1 (this PR)**

Source: <https://developers.cloudflare.com/pages/platform/limits/> (page last
updated 2026-07-16), verified 2026-07-27.

| Field | Finding |
|---|---|
| Free quota | **500 builds/month**; **1 concurrent build**; **100 custom domains/project**; **20,000 files/deployment**; **25 MiB max single file** |
| Bandwidth | **UNKNOWN.** The limits page does not state a bandwidth cap, nor does it state that static asset bandwidth is unmetered. Widely repeated claims of "unlimited bandwidth" were **not** found on the official limits page and are therefore not asserted here. |
| Card requirement | **UNKNOWN** — neither the limits page nor the linked pricing page addresses whether signup requires a card. **OWNER TEST REQUIRED.** |
| Access from Russia | **OWNER TEST REQUIRED** — the entire point of the pilot's manual network testing |
| Long-running Node | No — and not needed; Pages serves static assets only |
| Native `@napi-rs/canvas` | Not applicable (no server-side rendering in this pilot) |
| Cron jobs | Not applicable |
| PostgreSQL transactions | Not applicable — Pages never touches the database |
| Connection pooling | Not applicable |
| Data/export path | Source of truth is this Git repository; the build is reproducible anywhere |
| Vendor lock-in | **Very low.** Plain Vite static output. Migrating away means pointing another static host at the same `frontend/dist`. |
| Free-quota failure mode | Exceeding 500 builds/month blocks further **builds**; the existing deployment keeps serving. Behaviour on any bandwidth limit is **UNKNOWN** (see above). |
| Migration effort | **Low.** Already prepared: `VITE_API_BASE_URL` is now honoured on every host, plus one backend CORS entry. No code rewrite. |
| Rollback path | **Immediate.** Vercel stays live and untouched; revert the Mini App URL and drop the CORS entry. |
| **Verdict** | **ADOPT AS PILOT.** Fits the repository's actual shape: the frontend is genuinely static, so nothing about the backend, database, canvas rendering or cron has to change. |

Repository fit check (measured on this commit): `frontend/public/` contains 8
files, the largest being `audio/bgm_hackathon.ogg` at **0.28 MiB** — two orders of
magnitude below the 25 MiB per-file limit. Vite bundles `frontend/src/` into a
small number of hashed chunks, so the deployment is far below the 20,000-file
limit. The Phaser-inclusive JS chunk is the largest build artefact; its exact
size was **not measured here** (the sandbox cannot install dependencies, so no
production build was produced) — but at 25 MiB the headroom is not in question.

---

## 3. Cloudflare Workers — possible future bot webhook or thin API gateway · **DEFER**

Sources: <https://developers.cloudflare.com/workers/platform/limits/> (updated
2026-07-05), <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
(updated 2026-07-01),
<https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/>,
<https://developers.cloudflare.com/workers/configuration/cron-triggers/>.
Verified 2026-07-27.

| Field | Finding |
|---|---|
| Free quota | **100,000 requests/day**, reset at midnight UTC; **10 ms CPU time per invocation** on Free; **5 cron triggers/account** on Free |
| Card requirement | **UNKNOWN** from official pages. **OWNER TEST REQUIRED.** |
| Access from Russia | **OWNER TEST REQUIRED** |
| Long-running Node | **No.** Workers are V8 isolates, not Node processes. There is no persistent process between requests. |
| Native `@napi-rs/canvas` | **No.** `nodejs_compat` provides a *subset of Node.js APIs* as built-ins/polyfills; the docs describe JS-level compatibility only and no `.node` binary execution. This rules out the meme/GIF renderers on Workers under **any** plan. |
| Cron jobs | Yes — 5 cron triggers on Free |
| PostgreSQL transactions | Possible in principle via `connect()` from `cloudflare:sockets` (the TCP docs use port 5432 as their example), but **not practical on Free**: sockets "cannot be created in global scope and shared across requests", so every invocation pays a fresh TCP+TLS handshake inside a 10 ms CPU budget. Cloudflare's own recommendation is Hyperdrive, which **requires the Workers Paid plan**. |
| Connection pooling | Not on Free — Hyperdrive is paid |
| Data/export path | Source stays in Git; no data stored in the Worker |
| Vendor lock-in | **Medium.** Worker-specific request/response idioms and `wrangler` config, though a thin allowlisted proxy would stay small and portable. |
| Free-quota failure mode | Requests beyond 100k/day are rejected until the UTC reset — a hard outage for whatever depends on it |
| Migration effort | Low for a *bot webhook* (the bot is already a stateless HTTP handler). Medium for an API gateway. **Very high / infeasible** for the API itself, because of canvas and the persistent-connection model. |
| Rollback path | Bot: re-point the Telegram webhook at the existing Vercel handler |
| **Verdict** | **DEFER.** Plausible later for the bot webhook or a closed allowlisted gateway. **Rejected outright as a host for the Express API** — native canvas cannot run there, and Free lacks a usable PostgreSQL pooling story. Not part of this PR. |

Explicitly **not** asserted: that a Worker proxy would reliably reach Telegram, or
that cold starts are zero. Neither is stated officially and neither has been
measured here.

---

## 4. Neon PostgreSQL — isolated future staging database · **DEFER (most promising deferred item)**

Sources: <https://neon.tech/pricing>, <https://neon.tech/docs/introduction/plans>,
<https://neon.tech/docs/import/import-from-postgres>. Verified 2026-07-27.

| Field | Finding |
|---|---|
| Free quota | **0.5 GB storage/project**; **100 CU-hours compute/project/month**; **100 projects**; **10 branches/project** |
| Card requirement | **VERIFIED: no card required.** Neon's pricing page states the Free plan is "Build and learn free with no time limits and no credit card required." *(The only card-requirement fact in this document that is officially verified.)* |
| Access from Russia | **OWNER TEST REQUIRED** |
| Long-running Node | Not applicable — Neon is the database, not the app host |
| Native `@napi-rs/canvas` | Not applicable |
| Cron jobs | Not applicable (would remain wherever the app runs) |
| PostgreSQL transactions | **Yes — real PostgreSQL.** Supports PostgreSQL 14–18; standard transactions, `FOR UPDATE` row locks and the wire protocol all work, so the existing SQL needs no rewrite. |
| Connection pooling | **Yes on all plans**, pgBouncer-based, up to 10,000 connections via a separate pooled endpoint |
| Scale to zero | **Suspends after 5 minutes idle** on Free and **cannot be disabled**. First query after a suspend pays a cold start — acceptable for staging, a real consideration for production. |
| Data/export path | **Good.** `pg_dump`/`pg_restore` officially documented. Caveat from the docs: don't run `pg_dump` over a *pooled* connection string — use the unpooled one. `pg_dumpall` is not supported. |
| Vendor lock-in | **Low.** Standard PostgreSQL; `pg_dump` moves the data to any PostgreSQL host. |
| Free-quota failure mode | Exceeding 0.5 GB or 100 CU-hours restricts the project until the next cycle — a staging outage, not a production one, if scoped to staging |
| Migration effort | **Low for staging** (point `DATABASE_URL` at Neon and run the existing migrations). **Not attempted here.** |
| Rollback path | Change `DATABASE_URL` back to the Vultr PostgreSQL instance |
| **Verdict** | **DEFER to a separate PR.** Genuinely compatible with this codebase's SQL, and the strongest deferred candidate — but a database change needs its own migration rehearsal and owner approval. 0.5 GB and the 5-minute suspend suit staging, not production. |

---

## 5. Explicitly deferred candidates

### Cloudflare D1 — **REJECTED for this codebase**

Source: <https://developers.cloudflare.com/d1/>,
<https://developers.cloudflare.com/d1/platform/pricing/> (updated 2026-04-21).
Verified 2026-07-27.

- Free tier: **5 million rows read/day**, **100,000 rows written/day**, **5 GB
  total storage**, **500 MB max per database**, **10 databases**.
- **D1 is SQLite-based, not PostgreSQL-compatible.** Official description: *"D1 is
  Cloudflare's managed, serverless database with SQLite's SQL semantics."*
- **Verdict: REJECTED.** This repository has 58+ PostgreSQL migrations using
  PostgreSQL-specific features (`JSONB` with `jsonb_set`, `SERIAL`, `TIMESTAMPTZ`,
  `FOR UPDATE`, `ON CONFLICT`, `INTERVAL` arithmetic). Adopting D1 means rewriting
  the schema and every query, not configuring a connection string. The claim that
  "D1 is PostgreSQL-compatible" is false and is not repeated here.

### Cloudflare R2 — **DEFER, no current need**

Source: <https://developers.cloudflare.com/r2/pricing/> (updated 2026-05-28).
Verified 2026-07-27.

- Free tier: **10 GB-month storage**, **1 million Class A ops/month**, **10 million
  Class B ops/month**. Egress: officially **free** ("There are no charges for
  egress bandwidth for any storage class").
- Card requirement: the docs say R2 is "free to get started with included free
  monthly usage" but also require completing a checkout flow to add an R2
  subscription. Whether that flow demands a card is **UNKNOWN**.
- **Verdict: DEFER.** This app's static assets are small and already served by the
  frontend host; generated memes/GIFs are rendered on demand rather than stored.
  There is no asset-storage problem for R2 to solve today. No claim is made that
  R2 or Cloudflare Polish is automatically beneficial on Free.

### Upstash Redis — **DEFER**

Source: <https://upstash.com/pricing>. Verified 2026-07-27.

- Free tier: **500,000 commands/month**, **256 MB data**, **10 GB bandwidth/month**,
  **1 free database**.
- Card requirement: the FAQ states entering a card *upgrades* to pay-as-you-go.
  Whether initial Free signup requires one is **UNKNOWN**.
- **Verdict: DEFER.** Leaderboards are currently PostgreSQL queries and work. A
  Redis layer is a performance optimisation with no measured need — and it would
  add a second source of truth for ranking data.

### Cloudflare Web Analytics — **DEFER**

- **Verdict: DEFER.** Not evaluated in depth because it is out of scope for this
  PR. Note for the record: Cloudflare Web Analytics is **not** claimed here to work
  without client-side JavaScript; the beacon-based product requires a script, and
  no official statement to the contrary was found.

---

## 6. Summary and recommended sequencing

| Phase | Change | Status |
|---|---|---|
| **1** | Cloudflare Pages pilot for the static frontend | **This PR prepares it. Not deployed.** |
| 2 | Worker bot-webhook pilot, *or* closed allowlisted API gateway | Deferred — separate PR + owner approval |
| 3 | Neon staging database + migration rehearsal | Deferred — separate PR + owner approval |
| — | D1 | **Rejected** — SQLite, not PostgreSQL |
| — | R2, Upstash, Web Analytics | Deferred — no demonstrated need |
| — | Any production PostgreSQL cutover | Deferred — requires its own risk review |

**Why Phase 1 is the right first step:** it is the only change where the workload
already matches the platform. The frontend is genuinely static, so nothing about
the Express API, PostgreSQL, native canvas rendering or cron jobs has to move,
and the rollback is "keep using Vercel". Every other candidate either requires
rewriting working code (D1), cannot run this code at all (Workers + native
canvas), or solves a problem this project does not currently have (R2, Upstash).

## 7. What is *not* claimed in this document

- Not claimed: that any provider makes this stack "Russia-Proof" or "sovereign".
- Not claimed: that no card is required for the whole stack. Only **Neon** is
  officially verified card-free; every other provider is **UNKNOWN** or
  **OWNER TEST REQUIRED**.
- Not claimed: guaranteed zero cold start anywhere. Neon Free explicitly suspends
  after 5 minutes idle.
- Not claimed: that D1 is PostgreSQL-compatible. It is SQLite.
- Not claimed: that R2 or Polish is automatically useful on Free.
- Not claimed: that Cloudflare Web Analytics works without client JavaScript.
- Not claimed: that a Worker proxy "always" reaches Telegram.
- Not claimed: that Cloudflare Pages bandwidth is unlimited — the official limits
  page does not say so.
