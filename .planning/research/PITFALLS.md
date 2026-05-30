# Coder Survival — Critical Pitfalls Research

**Date:** 2026-05-20  
**Scope:** Telegram Mini App (TMA) with PvP mini-games, meme/GIF generation, energy economy, team competitions, and UGC.  
**Existing codebase context:** SQL injection in `backend/src/routes/leaderboard.js`, unrestricted CORS (`app.use(cors())`), disabled TLS verification (`rejectUnauthorized: false`), hardcoded infrastructure IPs, zero frontend/bot test coverage.

---

## Table of Contents

1. [Existing Critical Issues (Fix Immediately)](#1-existing-critical-issues-fix-immediately)
2. [Social / Viral Features in Telegram Mini Apps](#2-social--viral-features-in-telegram-mini-apps)
3. [Mini-Games in WebView](#3-mini-games-in-webview)
4. [Meme / GIF Generation Pipelines](#4-meme--gif-generation-pipelines)
5. [Energy / Currency Economy Design](#5-energy--currency-economy-design)
6. [PvP Leaderboards & Team Competitions](#6-pvp-leaderboards--team-competitions)
7. [User-Generated Content (Memes) Moderation](#7-user-generated-content-memes-moderation)

---

## 1. Existing Critical Issues (Fix Immediately)

These are not theoretical — they exist in the current codebase and represent exploitable vulnerabilities or structural debt.

### 1.1 SQL Injection in `leaderboard.js`

**Current state:** `backend/src/routes/leaderboard.js` interpolates user-controlled `rankFilter` values directly into SQL via `getRankXpBounds(rankFilter)` → `bounds.min` / `bounds.max` injected into `rankWhere`, which is then concatenated into the query string.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | String concatenation inside SQL builders; `client.query(query, params)` where `query` is assembled with template literals containing variables; missing input whitelist for `rank` query param. |
| **Prevention strategy** | Replace all dynamic SQL fragments with parameterized queries. If `rankJoin` must be conditional, build a static whitelist of allowed rank IDs and use `ANY($2)` or separate prepared statements per rank tier. Run `semgrep` or `eslint-plugin-sql` in CI. Add integration tests that attempt injection payloads (`1 OR 1=1`, `1; DROP TABLE users; --`). |
| **Phase** | **Alpha** (must be fixed before any public leaderboard exposure). |

### 1.2 Unrestricted CORS

**Current state:** `backend/src/index.js:71` uses `app.use(cors())` without origin whitelisting.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | CORS middleware applied globally with no `origin` callback; `Access-Control-Allow-Origin: *` visible in API responses; frontend can be iframed by arbitrary domains. |
| **Prevention strategy** | Configure `cors({ origin: (origin, cb) => { const whitelist = [process.env.FRONTEND_URL, 'https://t.me']; cb(null, whitelist.includes(origin)); }, credentials: true })`. Reject requests with no `Origin` header for sensitive endpoints. |
| **Phase** | **Alpha** (before first external user testing). |

### 1.3 Disabled TLS Verification (`rejectUnauthorized: false`)

**Current state:** `backend/src/index.js:57` sets `ssl: { rejectUnauthorized: false }` in production.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Production DB connections allow self-signed certificates; man-in-the-middle attacks possible on untrusted networks; compliance auditors flag this immediately. |
| **Prevention strategy** | Provision proper CA-signed certificates (e.g., via RDS/Scaleway managed PostgreSQL). Mount the CA cert into the container and use `ssl: { ca: fs.readFileSync('/path/to/ca.crt'), rejectUnauthorized: true }`. Never disable TLS verification in production. |
| **Phase** | **Alpha** (before production deployment). |

### 1.4 Hardcoded Infrastructure IPs

**Current state:** Found in `backend/tests/helpers/testServer.js` and `backend/src/middleware/rateLimit.js`.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | IP addresses or hostnames committed to Git; environment-specific configs hardcoded in source; tests failing when run outside the original network. |
| **Prevention strategy** | Move all IPs, hostnames, and ports to environment variables (`.env` / secrets manager). Use `docker-compose` service names for internal networking. Add a pre-commit hook (`git-secrets` or `truffleHog`) to block IP patterns and API keys. |
| **Phase** | **MVP → Alpha** (before expanding team or CI runners). |

### 1.5 Zero Frontend / Bot Test Coverage

**Current state:** No `.test.*` or `.spec.*` files in `frontend/src/` or `bot/src/`.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | No test scripts in `package.json` for frontend/bot; regressions caught only in production; Mini App WebView bugs discovered by users. |
| **Prevention strategy** | Frontend: add Vitest + `@testing-library/vue/react` (match existing framework). Test critical paths: initData parsing, energy countdown, shop purchase flows. Bot: add unit tests for command handlers and webhook validation. Enforce coverage gates in CI (`--coverage --threshold=60` to start). |
| **Phase** | **MVP** (start immediately; critical for stable Alpha). |

---

## 2. Social / Viral Features in Telegram Mini Apps

### 2.1 Broken or Abused Referral Loops

**Problem:** TMA viral mechanics (invite links, referral bonuses) are prime targets for Sybil attacks and bot farms. Hamster Kombat and Notcoin clones show that unchecked referrals inflate DAU with zero retention.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Referral conversion rate > 80% (indicates bots); spike in new users with sequential Telegram IDs; invited users never return after Day 0; referral rewards claimed faster than organic growth curves predict. |
| **Prevention strategy** | **Progressive verification:** Require invited users to complete a meaningful action (e.g., reach Level 2, complete a mini-game) before the referrer receives the reward. **Device fingerprinting + heuristics:** Track `initData` hash consistency, Telegram `start_param` reuse patterns, and time-to-complete onboarding. **Cap rewards:** Daily/weekly referral earning caps prevent farm exploitation. **Delay payouts:** Hold referral currency in escrow for 48–72 hours; claw back if the invited user churns immediately. |
| **Phase** | **Design → Alpha** (architect during Design; enforce before public Beta). |

### 2.2 Share-to-Unlock Fatigue & Policy Violations

**Problem:** Aggressive "share to 5 groups to continue" mechanics violate Telegram's Terms of Service for Mini Apps and trigger user churn.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | High share impression count but low return rate; users reporting the bot/app; Telegram BotFather warnings; app store / platform review flags. |
| **Prevention strategy** | Use **rewarded sharing** instead of gated sharing: sharing is optional but grants a bonus (e.g., +10 energy). Limit shares to 1–3 per day. Use Telegram's native `shareGameScore` or `shareUrl` APIs rather than forcing manual copy-paste. Track `share` analytics events to detect drop-off. |
| **Phase** | **Design** (define sharing philosophy before coding). |

### 2.3 Privacy Leaks via Social Graph

**Problem:** Exposing friend leaderboards or "who invited you" data without consent can leak social graphs and violate GDPR / Telegram policies.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | API responses include `telegram_id` or `username` of other users without aggregation/anonymization; privacy complaints; data-processing impact assessment failures. |
| **Prevention strategy** | Never expose raw `telegram_id` to clients for other users. Use opaque internal `user_id` or hashed identifiers. Make friend leaderboards opt-in. Anonymize usernames in global leaderboards (e.g., `Player#1234` or first name + obfuscated last name). |
| **Phase** | **Alpha** (before any social features go live). |

---

## 3. Mini-Games in WebView

### 3.1 WebView Memory Leaks & Crashes

**Problem:** Telegram's WebView on iOS (WKWebView) and Android is resource-heavy. Each Mini App session spawns multiple OS processes. Unmanaged game loops, unremoved event listeners, and retained DOM nodes cause freezes and OOM kills.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | App freezes after 3–5 minutes of play; increasing JS heap in Chrome DevTools Memory tab; blank white screens on return from background; high crash rates on iOS 15–16 devices. |
| **Prevention strategy** | **Explicit cleanup:** Remove all `requestAnimationFrame` loops, WebSocket listeners, and `setInterval` timers in a `beforeunload` / `visibilitychange` handler. **Object pooling:** Reuse canvas sprites and DOM elements instead of creating/destroying them. **Limit offscreen canvases:** Use a single shared canvas context where possible. **Test on real devices:** Budget Android devices (≤ 4GB RAM) and older iPhones are the canary. Profile with Safari Web Inspector and Chrome DevTools. |
| **Phase** | **MVP → Alpha** (performance baseline before Beta). |

### 3.2 State Desync Between Client and Server

**Problem:** Mini-games often compute score client-side and submit final results. Network latency, backgrounding, or tampering leads to inconsistent game states.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Scores submitted that exceed theoretical maxima per game duration; leaderboards showing impossible values; players complaining that progress was lost after switching apps; race conditions in multiplayer. |
| **Prevention strategy** | **Server-authoritative state:** Send player inputs (taps, moves) to the server; server simulates and returns the authoritative state. For latency-sensitive games, use client-side prediction with server reconciliation. **Checksums / HMAC:** If client must submit a score, attach a signed payload of game events (timestamped, hashed) that the server can replay or validate against statistical models. **Periodic sync:** Auto-save every 10–15 seconds, not just at game end. Handle `visibilitychange` to force a sync when the user backgrounds the app. |
| **Phase** | **Alpha** (before any competitive scoring is tracked). |

### 3.3 Ignoring WebView Platform Quirks

**Problem:** Telegram WebView !== Chrome Desktop. Features like WebGL 2.0, `localStorage`, `Notification`, and vibration behave differently or are missing.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Black canvas on older Android WebViews; `localStorage` cleared unpredictably; vibration API crashes the Mini App on some iOS versions; `Telegram.WebApp.ready()` called too late causing blank screens. |
| **Prevention strategy** | **Feature detection:** Always check `if (window.Telegram?.WebApp)` before using TMA APIs. Wrap `localStorage` with a fallback to `memoryStorage` or server-side session storage. **Graceful degradation:** If WebGL fails, fallback to 2D canvas or pre-rendered sprites. **Call `ready()` early:** Invoke `Telegram.WebApp.ready()` immediately after DOM load, before heavy asset loading. Test inside the actual Telegram app on iOS, Android, and Desktop — never rely on browser emulation alone. |
| **Phase** | **MVP** (from first UI prototype). |

---

## 4. Meme / GIF Generation Pipelines

### 4.1 Client-Side Generation Memory Explosions

**Problem:** Generating GIFs in the browser (e.g., with `gifshot` or custom canvas frame capture) converts images to base64, ballooning memory usage. A 30-frame 500×500 animation can exceed 2–3MB and crash mobile browsers.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Browser tab crashes during GIF export; frame drops during capture; `out of memory` errors in Sentry; generation time > 5 seconds on mid-tier phones. |
| **Prevention strategy** | **Server-side rendering:** Offload GIF/video generation to the backend (Node.js + `sharp`/`ffmpeg`, or Python + `moviepy`). Client uploads source images/text; server returns a CDN URL. If client-side is mandatory, use WebWorkers to avoid blocking the main thread, and stream frames to an IndexedDB buffer instead of holding them in RAM. **Limit dimensions:** Cap input at 480px wide; reduce color palette to 64–128 colors; limit frames to 15–20. |
| **Phase** | **MVP** (before meme feature ships). |

### 4.2 Unbounded Storage & CDN Costs

**Problem:** Every generated meme is stored forever. Viral usage leads to exponential storage growth and egress bills.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Storage bucket growing > 10% week-over-week; high percentage of assets with < 10 views; cost alerts from cloud provider. |
| **Prevention strategy** | **Deduplication:** Hash uploaded/combined assets; serve existing file if hash matches. **Lifecycle policies:** Auto-delete unreferenced memes after 30 days; move rarely accessed files to cold storage (S3 Glacier / Backblaze B2). **Rate limits:** Cap generations per user per hour (e.g., 10/hour). **Compression pipeline:** Run all outputs through `mozjpeg` / `gifsicle` optimization before storing. |
| **Phase** | **Alpha → Beta** (before viral scaling). |

### 4.3 Synchronous Blocking in Generation Queue

**Problem:** Running `ffmpeg` or image compositing synchronously in the request handler causes request timeouts and cascading failures under load.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | 504 Gateway Timeouts during peak usage; request queue backing up; CPU pegged at 100% on single core; dropped generation requests. |
| **Prevention strategy** | **Async job queue:** Use BullMQ / Redis to queue generation jobs. Return a `jobId` immediately; client polls or receives a webhook when complete. **Dedicated workers:** Run generation in separate containers/processes (e.g., `ffmpeg-worker` service) isolated from the API tier. **Timeouts & circuit breakers:** Kill jobs exceeding 30 seconds; return a fallback static image if generation fails. |
| **Phase** | **Alpha** (before load testing). |

---

## 5. Energy / Currency Economy Design

### 5.1 Pay-to-Win Perception

**Problem:** If premium currency directly purchases power (e.g., energy refills that give more taps = more commits), free players feel they cannot compete, leading to churn and negative reviews.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Conversion rate of free → paid is high but retention of free players drops sharply after Day 3; social sentiment mentions "P2W"; free players stop engaging with leaderboards; whale-only leaderboards. |
| **Prevention strategy** | **Cosmetic / convenience monetization:** Sell skins, name colors, emoji reactions, and profile frames for hard currency. Keep energy refills capped (e.g., max 3 per day) and offer free refill paths via ads or daily quests. **Skill-based matchmaking:** In PvP, match players by skill/rank, not by spend. **Transparent value:** Show free players exactly how much they can earn daily via quests vs. purchasing. **A/B test economy health:** Run cohort analysis (`observation/07_economy_health.sql`) weekly; alarm if free-player 7-day retention drops below 25%. |
| **Phase** | **Design** (before first economy model is coded). |

### 5.2 Economy Inflation (Faucets > Sinks)

**Problem:** Too many ways to earn currency (daily rewards, referrals, events) without enough ways to spend it devalues the currency and breaks progression pacing.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Average player currency balance grows exponentially week-over-week; shop items feel "cheap" because everyone can afford them; players hoard currency instead of spending; new content releases are instantly bought out. |
| **Prevention strategy** | **Taps-and-sinks modeling:** Define explicit faucets (daily quests, taps, PvP rewards) and sinks (shop purchases, energy refills, leaderboard entry fees, crafting). Use the `calculator/revenue-model.js` to simulate currency flow. **Seasonal resets / sinks:** Introduce limited-time shops, consumable boosts, and vanity items that expire. **Soft caps:** Diminishing returns on farming (e.g., energy recharge slows after 3 refills). **Weekly balance audit:** Use the existing `observation/07_economy_health.sql` and `WEEKLY_BALANCE_REVIEW_TEMPLATE.md` process. |
| **Phase** | **Design → Alpha** (model during Design; monitor from first Alpha cohort). |

### 5.3 Energy Countdown UX Frustration

**Problem:** Energy systems that force players to wait (or pay) to continue playing create friction. If the countdown is opaque or feels punishing, players churn.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Support tickets asking "when does energy refill?"; players quitting at 0 energy instead of engaging with other features; low rewarded-video watch rates; negative feedback about "timer games." |
| **Prevention strategy** | **Multiple energy sources:** Aside from time, offer energy via daily quests, social shares, PvP participation, and rewarded ads. **Clear UI:** Show exact time until next energy unit and total refill time. Provide a "next energy in 2m 14s" countdown. **Alternative activities at 0 energy:** Allow meme creation, shop browsing, team chat, or leaderboard viewing without energy cost. |
| **Phase** | **Design → MVP** (UX defined before implementation). |

---

## 6. PvP Leaderboards & Team Competitions

### 6.1 Cheating & Score Manipulation

**Problem:** Client-submitted scores, lack of server validation, and absence of anti-cheat render leaderboards meaningless. This is the #1 cited failure in leaderboard design.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Scores that exceed theoretical maximums; identical scores from distinct users (copycat submissions); sudden leaderboard jumps at 3 AM; player reports of "impossible" scores; identical device fingerprints for top 10 players. |
| **Prevention strategy** | **Server-side validation:** All PvP outcomes must be computed server-side. Client sends only player inputs; server simulates and persists results. **Rate limiting + anomaly detection:** Flag users with > 3 standard deviations from mean performance; auto-quarantine suspicious scores for manual review. **Anti-cheat middleware:** The existing `backend/src/middleware/antiCheat.js` should be wired into *every* score-modifying route, not just battles. **HMAC-signed payloads:** If client-side scoring is unavoidable, sign a game-session digest with a server-secret rotated daily. **Swift penalties:** Remove cheaters from leaderboards retroactively and publish a transparency report (even if small) to build trust. |
| **Phase** | **Alpha** (before first competitive season). |

### 6.2 Leaderboard Exclusion & Motivation Collapse

**Problem:** A single global top-100 leaderboard means 99.9% of players never see themselves ranked, killing motivation.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Low DAU engagement with leaderboard tab; players stop competing after first week; feedback that "I have no chance"; high churn among mid-tier players. |
| **Prevention strategy** | **Tiered leaderboards:** Rank players within their skill bracket (Junior, Middle, Senior, Lead, CTO) — matching the existing `tier` system. **Time-boxed boards:** Daily, weekly, and monthly leaderboards give everyone a fresh start. **Friend-only rankings:** "Beat your friends" is more motivating than "Beat the world." **Percentile badges:** Show "Top 10%" or "Top 5% in your region" instead of raw rank for non-elite players. **Around-me queries:** The existing `aroundMe=1` parameter is good — ensure it performs efficiently (window functions, not loading the entire board into memory as currently done in `leaderboard.js`). |
| **Phase** | **Design** (leaderboard taxonomy before development). |

### 6.3 Win-Trading & Team Matchmaking Abuse

**Problem:** In team competitions (hackathons, team battles), alt accounts and collusion distort results. Players queue simultaneously to guarantee wins or trade victories.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Teams with 90%+ win rates but low individual skill metrics; synchronized match start times for opposing teams; repeated matchups between the same two teams; alt accounts created just before tournament deadlines. |
| **Prevention strategy** | **Matchmaking randomization:** Add jitter to queue times; pair teams by hidden ELO, not just registration order. **Alt detection:** Require minimum account age (e.g., 3 days) to join tournaments. Track device fingerprints and IP overlaps. **Individual contribution weighting:** Team scores should weight individual performance (commits earned, accuracy) more than binary win/loss to reduce the impact of a single alt. **Shadowbanned matchmaking:** Suspected alts are quarantined into a separate matchmaking pool without notification. |
| **Phase** | **Beta** (before first public team tournament). |

### 6.4 Leaderboard Performance Bottlenecks

**Problem:** The current `leaderboard.js` loads the entire player list into memory for `aroundMe` queries (`query.replace('LIMIT $1', '')`), which is O(n) and will collapse at scale.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Leaderboard API P95 latency > 500ms; database CPU spikes during leaderboard refreshes; memory usage climbing on API nodes; timeouts on `/api/leaderboard?aroundMe=1`. |
| **Prevention strategy** | **Database window functions:** Use `RANK() OVER (ORDER BY commits_total DESC)` and `WHERE rank BETWEEN $2 AND $3` instead of loading all rows. **Materialized views:** Pre-compute daily/weekly leaderboards in a `leaderboard_cache` table refreshed every 5 minutes. **Redis sorted sets:** Maintain real-time ranks in Redis (`ZADD`, `ZREVRANGE`) for O(log n) lookups. **Pagination:** Replace `aroundMe` with explicit cursor-based pagination if possible. |
| **Phase** | **Alpha → Beta** (before scale exceeds 10k players). |

---

## 7. User-Generated Content (Memes) Moderation

### 7.1 The Viral Harm Window

**Problem:** Unmoderated UGC can spread illegal or harmful content (CSAM, hate speech, graphic violence) in the minutes or hours before human review catches it. Brand damage and legal liability are irreversible.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | Memes shared to public channels before platform review; user reports spiking; media inquiries; law enforcement takedown requests; app store delisting threats. |
| **Prevention strategy** | **Pre-publish scanning:** Every image/GIF must pass automated moderation *before* becoming publicly accessible. Use AWS Rekognition, Google Vision, or Azure Content Moderator for nudity/violence/CSAM detection. **Hash matching:** Integrate with PhotoDNA or GIFCT hash databases to block known illegal content at upload time. **Quarantine queue:** New UGC is stored in a private bucket; public URL is only generated after passing both AI and a random-sample human review. **Time-to-visible SLA:** Target < 5 seconds for AI scan; < 5 minutes for human escalation. |
| **Phase** | **Alpha** (before any UGC can be shared publicly). |

### 7.2 False Positives Killing Creator Engagement

**Problem:** Overly aggressive AI moderation flags satire, coding memes with "violent" terminology ("kill process", "crash"), or culturally specific humor. Creators abandon the platform.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | High appeal rate (> 15% of takedowns); creator churn after first meme removal; social complaints about "broken AI"; memes with benign coding terms blocked. |
| **Prevention strategy** | **Context-aware LLM moderation:** Use an LLM prompt grounded in the platform's specific context (coding, gaming, tech humor) rather than generic hate-speech classifiers. Distinguish between educational/discussion nudity and sexual content. **Human-in-the-loop for edge cases:** Route low-confidence AI decisions (0.4–0.7 score) to human moderators. **Transparent appeals:** One-click appeal button on every takedown; target 24-hour human review SLA. Track reversal rates to tune AI thresholds. **Custom allow-lists:** Whitelist common coding terminology that generic models flag incorrectly. |
| **Phase** | **Beta** (refine after first 1,000 user-generated memes). |

### 7.3 Moderator Burnout & Legal Liability

**Problem:** Human moderators exposed to graphic content suffer PTSD. Platforms without clear CSAM reporting pipelines face criminal liability.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | High moderator turnover; mandatory wellness breaks; missed SLA times; no documented CSAM escalation path. |
| **Prevention strategy** | **Mandatory reporting:** Any CSAM detection must auto-report to NCMEC (US) or local law enforcement via API. Do not rely on manual emailing. **Moderator wellness:** Limit exposure time to 4 hours/day; provide counseling resources; use AI pre-filtering to remove the worst content before human eyes see it. **Audit trails:** Log every moderation decision (who, what, when, why) for regulatory review. |
| **Phase** | **Design** (policy and legal framework before launch). |

### 7.4 Copyright & Meme Template Abuse

**Problem:** Users upload copyrighted images, movie clips, or trademarked characters. DMCA takedowns and cease-and-desist letters follow.

| Aspect | Detail |
|--------|--------|
| **Warning signs** | DMCA notices in support inbox; brand-holder complaints; app store rejection due to IP infringement; viral memes using recognizable characters. |
| **Prevention strategy** | **Content ID fingerprinting:** Use Audible Magic or YouTube Content ID-style systems to match uploaded media against copyrighted databases. **Terms of Service clarity:** Explicitly state that users must own rights to uploaded content; require acceptance before first upload. **Takedown workflow:** Implement a DMCA-compliant notice-and-takedown process with counter-notification support. **Safe harbor:** Ensure the platform qualifies for Section 230 (US) or EU Digital Services Act safe-harbor provisions by not proactively selecting/curating UGC without a license. |
| **Phase** | **Beta → Launch** (before public UGC scale). |

---

## Appendix: Quick-Reference Phase Mapping

| Phase | Key Deliverables |
|-------|------------------|
| **Design** | Economy model (taps/sinks), leaderboard taxonomy, sharing policy, moderation policy, privacy impact assessment. |
| **MVP** | Core loop functional, WebView tested on real devices, basic parameterization of SQL, CORS restricted, TLS fixed, first unit tests for frontend + bot. |
| **Alpha** | Server-authoritative PvP, anti-cheat wired, async meme generation, AI moderation pipeline, leaderboard window functions / Redis caching, progressive referral verification. |
| **Beta** | Team tournament anti-collusion, appeal workflows, economy balance audits, load testing for GIF pipeline, hash-based UGC deduplication. |
| **Launch** | DMCA workflow live, CSAM auto-reporting active, transparency reports published, full test coverage gates in CI. |
| **Post-Launch** | Weekly economy health reviews, seasonal content resets, continuous anti-cheat model retraining, moderator wellness audits. |
