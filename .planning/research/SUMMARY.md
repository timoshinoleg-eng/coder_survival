# Project Research Summary

**Project:** Coder Survival
**Domain:** Telegram Mini App game (tap-based progression, mini-games, meme generation, social PvP)
**Researched:** 2026-05-20
**Confidence:** HIGH

## Executive Summary

Coder Survival is a Telegram Mini App game blending tap-based idle progression with IT-themed mini-games, meme generation, and social competition. Research into the 2024–2025 TMA gaming ecosystem (Hamster Kombat, Notcoin, Catizen, etc.) shows that **viral acquisition is easy but retention is hard**. The games that survive combine instant-load WebView performance, energy-based daily loops, genuine social friction, and transparent economies. For an IT-themed game, the core opportunity is **irony and identity** — devs play as devs — but the risk is overbuilding simulation depth in a channel where sessions are 90–180 seconds.

The recommended approach is to **evolve the existing Express + PostgreSQL + Preact + Phaser + grammy stack** rather than replace it. Key upgrades are limited to the Telegram SDK wrapper (`@telegram-apps/sdk`), Phaser 3.80+, Vite 6, and adding Redis + Socket.IO for real-time features. The architecture must preserve the **main tap loop as inviolable**: mini-games, social features, and meme generation must never block or corrupt core progression.

The top risks are **security vulnerabilities already present in the codebase** (SQL injection, unrestricted CORS, disabled TLS), **WebView performance and memory limits** on low-end devices, and **economy imbalance** (faucots exceeding sinks). These must be addressed before any public scaling.

## Key Findings

### Recommended Stack

Keep the existing Node.js/Express/PostgreSQL/Preact/Phaser foundation; it remains viable for 2025 TMA games. Make targeted upgrades and additions rather than sweeping changes. See [STACK.md](STACK.md) for full matrix.

**Keep:**
- **Node.js 20 LTS**, **Express** (upgrade to 5), **PostgreSQL**, **Preact 10**, **grammy** — existing baseline is sound.
- **Phaser 3.80+** — upgrade from 3.60 for WebGL 2 batching and iOS stability; dominant choice for 2D pixel-art in WebView.
- **Vite 6** — upgrade from 5 for better pre-bundling and CSS handling.

**Adopt:**
- **`@telegram-apps/sdk` v3.x** — TypeScript-first wrapper for Bot API 9.1 features (fullscreen, safe area insets, CloudStorage, SecureStorage). Avoid raw `window.Telegram.WebApp`.
- **Socket.IO 4.8+ + Redis 7.x** — for real-time leaderboards and social features; more reliable than raw WebSockets in Telegram WebView.
- **Zustand 5.x** — lightweight state management for Preact; zero providers, works with Telegram CloudStorage persistence.
- **Sharp** (server) + **dom-to-image-more / Fabric.js** (client) — meme generation pipeline.
- **BullMQ** — async job queue for bot notifications, reward payouts, and image generation workers.
- **Kysely** — optional type-safe SQL query builder over raw `pg`.

**Avoid:**
- Unity WebGL, Godot Web export, Three.js — massive bundle size and poor WebView performance.
- Redux / Recoil / MobX — overkill bundle and boilerplate for a mini-app.
- Firebase / Firestore, Pusher / Ably — vendor lock-in and unpredictable costs at TMA scale.
- ImageMagick / `node-canvas` — slow, heavy native deps; Sharp is superior.

### Key Feature Insights

See [FEATURES.md](FEATURES.md) for competitive benchmarks and per-feature deep dives.

**Table Stakes (must-have):**
- Energy system + 2× daily refill — controls pacing and creates habit loops.
- Daily login reward ladder — #1 retention mechanic in the ecosystem.
- Upgrade / progression tree — visible power growth prevents burnout.
- Referral link with 1-level reward — TMA games live or die by viral coefficient.
- Instant load (<2s) — bounce rate correlates directly with load time.
- Bot push notifications — ~100% reach vs. opt-in push on native apps.
- Clear Stars economy — opaque economies destroy trust (see Hamster Kombat "dust" backlash).

**Differentiators (competitive advantage):**
- Meme generator — IT humor is inherently shareable; export to Telegram Story = free viral loop. No major competitor has this.
- Ironic achievements — meta-humor builds identity and cross-platform sharing.
- Pixel-art skins — nostalgia + IT aesthetic; cosmetics monetize well in identity-driven games.
- Streak system ("Uptime Monitor") — reskin as GitHub-style commit graph for loss aversion.
- Daily Battle PvP — async score-attack on a daily seed; Hamster Kombat had no true PvP.
- Team hackathons — leverage Telegram group structure for weekly cohort competitions.
- 5 Mini-games — variety prevents tap fatigue; ship 2 in MVP, add 1 per season.
- Battle Pass — proven $35K/month case study; seasonal monetization + re-entry point for lapsed players.

**Anti-Features (deliberately avoid):**
- Real-time synchronous PvP — WebView latency and backgrounding make it frustrating.
- Pay-to-earn core loop — charging Stars to access daily earnings feels extractive and destroys trust.
- Complex 3D graphics — performance kill in WebView; battery drain = instant churn.
- Mandatory social sharing to progress — users ignore generic share buttons; reward sharing instead.
- Infinite global leaderboard — demotivates 99% of players; use tiered/friend/cohort leaderboards.
- NFT / blockchain gating for core play — adds wallet friction and massive funnel drop.
- Long tutorial (>60s) — teach by doing in <30 seconds.
- Landscape-only orientation — 30%+ session abort in portrait-first Telegram usage.

### Architecture Recommendations

See [ARCHITECTURE.md](ARCHITECTURE.md) for full topology, data flows, and schema proposals.

**Critical patterns:**
1. **EventBridge (Phaser ↔ Preact)** — typed `EventEmitter` boundary; no direct DOM/canvas manipulation across frameworks.
2. **Energy Sandbox Pattern** — mini-games run in a server-sealed sandbox (`rewardsHash` HMAC). Client is authoritative during play; server is authoritative on reward payout.
3. **Lazy-load non-core** — Phaser scenes, mini-game assets, and meme templates load on demand.
4. **Adaptive polling over WebSockets** — Telegram WebView throttles background JS and drops WS; REST + polling is more reliable. Use SSE only for optional live tournaments.
5. **Read replica + materialized views** — leaderboard queries read from `leaderboard_mv` refreshed every 5 min; avoid O(n) `aroundMe` queries.
6. **Bot notification queue** — decouple HTTP responses from Bot API calls via PostgreSQL `bot_outbox` + worker.

**Build Order:**
1. **Phase 1 (Foundation):** Typed EventBridge, mini-game scene loader/registry, offscreen canvas meme renderer.
2. **Phase 2 (Mini-Games Core):** QTE → Quiz → Card Choice → Pitch Sim scenes; `/api/minigame/complete` with HMAC validator.
3. **Phase 3 (Social):** Team goals backend, Daily Battle scheduler/cron, referral webhook v2, leaderboard SSE/polling.
4. **Phase 4 (Meme Pipeline):** Canvas → Blob export, bot publish endpoint, event-triggered meme generation.

### Top Risks and Pitfalls

See [PITFALLS.md](PITFALLS.md) for full register with warning signs and prevention strategies.

1. **Existing Security Vulnerabilities (Fix Immediately)** — SQL injection in `leaderboard.js`, unrestricted CORS, disabled TLS verification (`rejectUnauthorized: false`), and hardcoded infrastructure IPs are exploitable today. Replace dynamic SQL with parameterized queries, whitelist CORS origins, provision proper CA certs, and move all IPs to environment variables.

2. **WebView Memory Leaks & Crashes** — Telegram WebView on iOS/Android is resource-heavy. Unmanaged game loops and retained DOM nodes cause OOM kills. Implement explicit cleanup in `beforeunload`/`visibilitychange`, use object pooling, limit offscreen canvases, and test on real budget devices.

3. **Economy Inflation & Pay-to-Win Perception** — Faucets (daily rewards, referrals, events) must not exceed sinks (shop, energy refills, crafting). Run weekly balance audits using `observation/07_economy_health.sql`. Never gate core earning behind payment; monetize cosmetics, convenience, and Battle Pass only.

4. **Client-Side Score Manipulation** — Without server-authoritative validation, leaderboards become meaningless. Wire `antiCheat.js` into *every* score-modifying route. Use HMAC-signed game-session digests and plausible-bounds checking for mini-game scores.

5. **Referral Sybil Attacks & Bot Farms** — Unchecked referrals inflate DAU with zero retention. Require invited users to complete a meaningful action (e.g., reach Level 2) before referrer reward. Cap daily/weekly referral earnings and delay payouts 48–72h.

6. **UGC Moderation & Viral Harm Window** — Unmoderated memes can spread illegal content before human review. Implement pre-publish AI scanning (AWS Rekognition / Google Vision), hash matching (PhotoDNA), and quarantine queues. Target <5s AI scan SLA.

7. **Leaderboard Performance & Motivation Collapse** — Loading entire player lists for `aroundMe` is O(n) and will collapse at scale. Use `RANK() OVER` window functions, Redis sorted sets, and materialized views. Avoid global leaderboards; use tiered (Junior/Middle/Senior/Lead/CTO) and friend-only rankings.

8. **Zero Frontend / Bot Test Coverage** — No `.test.*` files in `frontend/src/` or `bot/src/`. Add Vitest + Testing Library for frontend and unit tests for bot command handlers. Enforce 60% coverage gates in CI before Alpha.

## Implications for Roadmap

### Phase 1: Secure Foundation
**Rationale:** The existing codebase has exploitable vulnerabilities and zero test coverage. No feature work is safe until these are fixed.
**Delivers:** Parameterized SQL queries, restricted CORS, TLS certs, env-var configs, Vitest setup, first unit tests for frontend + bot.
**Addresses:** Table-stakes hygiene (energy, login, referral) cannot ship on a broken foundation.
**Avoids:** SQL injection exploits, CORS attacks, TLS MITM, untested regressions in production.
**Research Flags:** None — standard security hardening.

### Phase 2: Core Loop + First Mini-Games
**Rationale:** The tap/energy/depression loop is the product. Mini-games add variety but must not corrupt the main loop.
**Delivers:** Energy Sandbox pattern, EventBridge, mini-game scene registry, 2 mini-games (QTE + Quiz), server reward validator (HMAC), Zustand state layer.
**Uses:** Phaser 3.80+, `@telegram-apps/sdk`, Zustand 5.x.
**Implements:** Architecture Phase 1 + 2 components.
**Avoids:** WebView memory leaks (explicit cleanup), state desync (server-authoritative rewards), pay-to-win (cosmetic-only monetization).
**Research Flags:** Phaser WebView performance on budget Android; validate with real-device profiling.

### Phase 3: Social & Viral Loop
**Rationale:** Social features need an engaged player base to function. They also have the highest abuse surface area.
**Delivers:** Async Daily Battle (score-attack), meme generator (client-side canvas), ironic achievements, streak system, pixel-art skins (initial 8–10), bot push notifications.
**Uses:** Sharp (server), dom-to-image-more (client), Socket.IO + Redis (leaderboards).
**Implements:** Architecture Phase 3 + 4 components.
**Avoids:** Real-time PvP, mandatory sharing, privacy leaks (opaque user IDs), global leaderboard demotivation.
**Research Flags:** AI moderation pipeline for memes needs vendor selection and integration testing; schedule spike in Phase 3.

### Phase 4: Monetization & Scale
**Rationale:** Monetize engaged users only after retention is proven. Economy balance is fragile and data-driven.
**Delivers:** Battle Pass Season 1, team hackathons, 4th + 5th mini-games, rewarded video ads, subscription tier, progressive referral verification.
**Uses:** BullMQ (reward payouts), materialized views (leaderboard caching).
**Avoids:** Economy inflation (weekly audits), win-trading (matchmaking randomization + alt detection), leaderboard O(n) collapse (Redis + window functions).
**Research Flags:** Ad network integration (rewarded video) needs API research; Stars payout flow needs end-to-end testing.

### Phase Ordering Rationale

- **Security before features:** The existing vulnerabilities are exploitable and would compound with every new route/feature added.
- **Core loop before social:** Viral mechanics need a sticky product to amplify. A broken core loop with great sharing is just a fast churn engine.
- **Social before monetization:** Battle Pass and team hackathons require an established player base and team formation. Monetizing too early on a small base produces unreliable economy data.
- **Mini-games validate architecture:** The Energy Sandbox and EventBridge patterns are tested under real load in Phase 2, de-risking the more complex social features in Phase 3.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Phaser 3.80+ WebView memory profiling on iOS 15–16 and budget Android (≤4GB RAM). Sparse public data on Telegram WebView limits.
- **Phase 3:** AI moderation vendor (AWS Rekognition vs. Google Vision vs. Azure) — cost and false-positive rates vary by coding-meme content. Needs prototype evaluation.
- **Phase 4:** Rewarded video ad network integration in TMA (Bot API 9.1 ads vs. third-party). Documentation is evolving; needs API spike.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Security hardening and test setup are well-documented, established patterns.
- **Phase 2 (backend):** Express + PostgreSQL transactional patterns and HMAC validation are standard Node.js practices.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on npm registry state, Telegram Bot API 9.1 changelog, and ecosystem consensus. Existing baseline reduces migration risk. |
| Features | HIGH | Strong competitive benchmarks from Hamster Kombat, Notcoin, Catizen, etc. Phase recommendations validated by retention data. |
| Architecture | HIGH | Patterns (EventBridge, sandbox, adaptive polling) are proven in Phaser + React/Preact production apps. |
| Pitfalls | HIGH | Existing vulnerabilities were identified by direct code inspection; prevention strategies are industry standard. |

**Overall confidence:** HIGH

### Gaps to Address

- **WebView performance limits:** Telegram does not publish explicit WebView memory/CPU limits. Need real-device profiling during Phase 2 to establish hard constraints.
- **Stars economy calibration:** F2P earning benchmarks (20–80 Stars/day) are community-sourced. Need A/B testing during Alpha to validate for this specific audience.
- **Moderation AI accuracy on coding memes:** Generic AI classifiers may false-positive on terms like "kill process" or "crash." Needs custom allow-list tuning during Beta.

## Sources

### Primary (HIGH confidence)
- [STACK.md](STACK.md) — npm registry analysis, Telegram Bot API 9.1 changelog, bundle-size benchmarks.
- [FEATURES.md](FEATURES.md) — Ecosystem analysis of Hamster Kombat, Notcoin, Catizen, Pixelverse, X Empire, Genopets: Pixelton, Scroo-G.
- [ARCHITECTURE.md](ARCHITECTURE.md) — Phaser + React integration patterns, TMA WebView behavior docs.
- [PITFALLS.md](PITFALLS.md) — Direct codebase inspection, CVE databases, Telegram Mini Apps platform policies.

### Secondary (MEDIUM confidence)
- Published TMA monetization case studies (Battle Pass $35K/month benchmark).
- Community retention benchmarks from public DAU/MAU reports (Q1–Q2 2026).

### Tertiary (LOW confidence)
- F2P Stars earning rate estimates (20–80/day) — community-sourced, needs validation.
- Telegram WebView memory ceiling estimates (~100–200MB on older Android) — inferred from crash reports, not official docs.

---
*Research completed: 2026-05-20*
*Ready for roadmap: yes*
