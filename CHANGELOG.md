# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-26

### Added — MVP Ship

- **Core Loop 2.0:** depression scale, affliction/heart attack, generator matrix + FTUE acceleration, passive LOC, daily farm log
- **Offline Recovery:** passive energy regeneration, dynamic recovery intervals, offline LOC catch-up
- **Monetization:** contextual offers, coffee_break 25⭐, rewarded ads with canonical events + FTUE + callbacks + idempotency
- **LiveOps:** battle pass with catch-up + weekend x2, weekly sprint, streak saver
- **Viral/Social:** premium referral backend, squad passive multiplier, social obligation, team panel UX
- **Random Events:** server-authoritative state machine with PostgreSQL persistence, FTUE suppression, timeout handling
- **Daily Quests v1.0:** rolling 7-day average farm-based rewards, front-loading for new users, full-clear bonus
- **Anti-cheat L1 + persisted:** policy layer, ban_score persisted, sanctions (tap/generator/ad/quest/leaderboard), appeal flow
- **Observation:** internal observation slices (daily farm, anti-cheat, generator economy, premium referral, appeals, burnout, random event state)
- **iOS Compatibility:** Phaser.CANVAS renderer, visibilitychange audio suspension, passive depression recovery

### Notes

- Daily Quests v1.0 is locked; v2.0 (source-aware balancing, richer bonus layer) is scheduled post-MVP
- Anti-cheat L2/L3 full pipelines are deferred to post-MVP
- Premium Referral UX polish is deferred to post-MVP
