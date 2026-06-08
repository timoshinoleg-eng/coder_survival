# Coder Survival — Research-to-Code Implementation Plan
> Generated from full research corpus: Product Bible, 9 sections, 8 dimensions, 7 wide facets

## 1. Current State Inventory (Post-4 Phases)

| Domain | Already Implemented | Gap Severity |
|--------|---------------------|--------------|
| **Backend** | Express + PostgreSQL, 33 routes, auth, rate limiting, anti-cheat L1, zod validation, PM2 | MEDIUM |
| **Frontend** | Preact + Vite + Phaser 3, onboarding, career ladder, rank badge, shop, skins, team battle, minigames | MEDIUM |
| **CI/CD** | GitHub Actions (test, deploy, security, preview), Vercel connected | LOW |
| **Analytics** | Amplitude SDK, 9 events tracked, AdsGram rewarded video | MEDIUM |
| **Monetization** | Stars payments table, AdsGram integration, basic shop | HIGH |
| **Social/Viral** | Referral system, teams, squad leaderboards, meme generator | MEDIUM |
| **Anti-cheat** | Rate limiting, initData validation, in-memory antiCheat | HIGH |

## 2. Critical Gaps vs Research Requirements

### P0 — Must Build (Blocks retention & monetization)
| # | Feature | Research Source | Why Critical |
|---|---------|-----------------|--------------|
| 1 | **Prestige System (μ-currency)** | sec03, dim03, Product Bible | Long-term retention driver; first prestige ~90 min |
| 2 | **8 Random Events Engine** | sec03, dim03, wide05 | Engagement maintenance (every 30–90s); 46% neutral/39% neg/15% pos |
| 3 | **Burnout Meter UI (0–200)** | sec03, dim02, wide05 | Core differentiator; Darkest Dungeon style HP |
| 4 | **Telegram Stories Integration** | sec05, dim02, dim05 | Viral K-factor target 1.5–2.5; 512×512 score cards |
| 5 | **5 Viral Shareable Cards** | sec02, sec05, dim05 | UGC loop; Burnout card, Standup GIF, Commit graph, Squad LB, Referral |
| 6 | **Death Screen "Share Shame"** | sec05, dim05 | Meme + roast + invite pattern; viral loop |
| 7 | **Offline Progress Cap (2h)** | sec03, dim03, wide05 | Retention driver; FOMO mechanic |
| 8 | **20 Analytics Events** | sec06, dim06, Product Bible | Only 9/20 implemented; missing session_end, wallet_connected, etc. |
| 9 | **3-Layer Anti-Cheat (ML L2)** | sec06, dim06, wide04 | Currently only L1 (rate limiting); L2 behavioral ML missing |
| 10 | **Ban Score System (0–100)** | sec06, dim06, wide04 | Graduated sanctions; WARNING→RESTRICT→BAN→PERMANENT |

### P1 — High Impact (Weeks 5–8)
| # | Feature | Research Source |
|---|---------|-----------------|
| 11 | **Programming Language Unlocks** | sec01, sec03, dim01 (Python/JS/Rust/Go bonuses) |
| 12 | **8 Monetizable Boosters** | sec03, dim03, dim04 (Espresso, Red Bull, Git Push --Force, etc.) |
| 13 | **Season Pass (50 levels)** | sec05, dim07 (Free + Premium tracks) |
| 14 | **Daily Battle / Daily Deploy** | sec05, dim05 (Bug tickets, deadlines, severity P0/P1/P2) |
| 15 | **Flash Sales & Daily Deals** | sec05, dim05 (2×/week, 2h, urgency +8–25% conversion) |
| 16 | **Friday Deploy Event** | sec05, dim05 (Fri 17:00–Sun 00:00 UTC) |
| 17 | **Closed Beta Waitlist** | sec07, dim07 (2,000 spots, public counter, referral queue) |
| 18 | **TON Connect / Wallet** | sec04, dim04, dim06 (Built-in wallet 92% success vs 40% external) |
| 19 | **Multi-currency Payments** | sec04, dim04 (Stars + TON + USDT; +60% conversion) |
| 20 | **Sentry Crash Monitoring** | sec08, dim08 (<1% crash rate target) |

### P2 — Growth & LiveOps (Weeks 9–12+)
| # | Feature | Research Source |
|---|---------|-----------------|
| 21 | **PWA Fallback** | sec00, sec08 (Service workers, offline caching) |
| 22 | **Desktop Fullscreen Mode** | sec04, dim04 (Bot API 8.0, horizontal layout) |
| 23 | **Haptic Feedback System** | sec06, dim06 (impact, notification, selection) |
| 24 | **Safe Area Insets** | sec06, dim06 (Bot API 8.0) |
| 25 | **Developer Office Customization** | sec02, sec03 (Monitors, keyboards, plants, posters) |
| 26 | **Wall of Fame** | sec02, sec03 (Collected memes, whispers, stickers) |
| 27 | **Firebase Analytics + Telemetree** | sec06, dim06 (Cohort analysis, TMA-specific metrics) |
| 28 | **A/B Testing Framework** | sec07, dim07 (Onboarding variants, paywall variants) |
| 29 | **Advanced Localization** | sec04, dim04 (Tier-3 pricing: India, Nigeria, Brazil, Pakistan) |
| 30 | **Smart Contract Audit Prep** | sec08, dim08 (Hacken/QuillAudits readiness) |

## 3. Tech Stack Divergence Analysis

| Research Prescription | Current Stack | Decision |
|-----------------------|---------------|----------|
| React 18+ | Preact 10 | **Keep Preact** (smaller bundle, compatible); migrate to React only if bundle >3MB |
| TypeScript strict | JS/JSX | **Gradual migration** — new files in TS, existing stays JS |
| Tailwind + shadcn/ui | Custom pixel-theme.css | **Add Tailwind** for new UI components; keep pixel-theme for game screens |
| Zustand | Custom hooks | **Add Zustand** for new global state (wallet, prestige, events) |
| Cloudflare Workers | Express + YC VM | **Keep Express** for now; Workers migration = P2 (requires full rewrite) |
| Cloudflare D1 | PostgreSQL | **Keep PostgreSQL**; proven, migrations work, no rewrite needed |
| Framer Motion | None | **Add for new components** (RankBadge, BurnoutMeter, ShareCards) |

## 4. 90-Day Roadmap

### Phase A: Core Loop Hardening (Weeks 1–2)
- Prestige system backend + frontend
- Random events engine (8 types, scheduler, weights)
- Burnout meter UI + backend (0–200 scale, affliction at 100, heart attack at 200)
- Offline progress cap (2h)
- Complete 20 analytics events

### Phase B: Viral Engine (Weeks 3–4)
- Telegram Stories integration (`shareToStory` API)
- 5 viral shareable cards (backend PNG render + frontend)
- Death screen "Share Shame"
- UGC Meme Generator hardening (5 templates, dynamic text)
- Referral Premium tier (20× multiplier)

### Phase C: Monetization & Payments (Weeks 5–6)
- 8 monetizable boosters with exact Stars pricing
- Season Pass (50 levels, Free + Premium)
- TON Connect integration
- Multi-currency checkout (Stars + TON + USDT)
- Flash Sales / Daily Deals engine

### Phase D: Anti-cheat & Stability (Weeks 7–8)
- Anti-cheat Layer 2 (behavioral ML: Random Forest / Gradient Boosting)
- Ban Score System (0–100)
- Appeal process backend
- Sentry integration
- PWA fallback (service worker + manifest)

### Phase E: LiveOps & Scale (Weeks 9–12)
- Daily Battle / Daily Deploy
- Friday Deploy Event
- Closed Beta waitlist
- Programming language unlocks
- A/B testing framework
- Firebase + Telemetree integration
- Localization expansion

## 5. Immediate Next Steps (This Week)

1. **Prestige System** — migration + routes + UI modal
2. **Random Events** — scheduler job + event handlers + UI overlays
3. **Burnout Meter** — HUD component + backend depression logic
4. **Stories / Share Cards** — `shareToStory` hook + canvas render
5. **Analytics Gap Fill** — add missing 11 events across frontend/backend
