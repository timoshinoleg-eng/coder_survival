# Coder Survival — Phased Execution Roadmap

**Granularity:** Fine (10 phases)  
**Mode:** MVP (each phase delivers a minimal viable playable slice)  
**Timeline:** 10 weeks (1 phase per week)  
**Reference:** [PROJECT.md](./PROJECT.md) | [REQUIREMENTS.md](./REQUIREMENTS.md) | [STATE.md](./STATE.md)

---

## Phase 1: Critical Fixes & Core Loop Polish

**Goal:** Fix existing critical bugs and restore trust in the core gameplay loop before adding new features.  
**Mode:** mvp  
**Duration:** Week 1

### Requirements Mapped
- TECH-01, TECH-02, TECH-03, TECH-04

### Success Criteria
1. Energy recovery timer no longer resets on app open; 5-minute minimum threshold is respected.
2. Stress offer activates at 20% depression (down from 55%); UI prompt appears reliably.
3. Quest and Battle Pass progress display numeric values with confetti animation on completion.
4. Every tap triggers haptic feedback and prints a visible code line.
5. Zero regression in existing commit/tap mechanics verified by smoke test.

---

## Phase 2: Visual Foundation & Atmosphere

**Goal:** Establish the 16-bit pixel art identity and bring the world to life with ambient random events.  
**Mode:** mvp  
**Duration:** Week 2

### Requirements Mapped
- VISU-01, VISU-02, VISU-03, TECH-05

### Success Criteria
1. All primary UI screens render in a consistent 16-bit pixel-art style.
2. Character displays 3 distinct poses based on depression range (0–30% energetic, 30–70% tired, 70–100% collapsed on keyboard).
3. Resource animations play: code sparks (high energy), tremor (low energy), bug-report rain (75%+ depression), crash effect (100%).
4. Random event fires every 30–90 seconds with at least 4 distinct event types visible to the player.

---

## Phase 3: Meme Engine MVP

**Goal:** Ship the viral core — a backend-secured meme generator that players can share instantly.  
**Mode:** mvp  
**Duration:** Week 3

### Requirements Mapped
- MEME-01, MEME-02, MEME-03

### Success Criteria
1. Meme generator produces 5 distinct templates using real backend variables.
2. "Share shame" button appears immediately after trigger events in 1:1 (chat) and 9:16 (Stories) formats.
3. Variables (username, commits_today, depression_level, level, days_without_burnout, skin_equipped) are rendered server-side; client cannot forge.
4. At least one shared meme successfully opens the Telegram native share dialog.

---

## Phase 4: Daily Progression Overhaul

**Goal:** Make daily engagement rewarding through auto-tracked quests and a friction-free Battle Pass.  
**Mode:** mvp  
**Duration:** Week 4

### Requirements Mapped
- PROG-01, PROG-05, PROG-06

### Success Criteria
1. 3 daily quests + 1 bonus quest auto-track and complete without manual refresh.
2. Daily chest unlocks when all 4 quests are finished; reward is granted automatically.
3. Battle Pass shows 20 levels with a free track only; first 3 levels are front-loaded for quick wins.
4. XP breakdown is visible to the player: quests 60%, mini-games 20%, social actions 20%.

---

## Phase 5: Streaks, Achievements & Social Seeds

**Goal:** Introduce long-term retention mechanics and the first social/referral hooks.  
**Mode:** mvp  
**Duration:** Week 5

### Requirements Mapped
- PROG-03, PROG-04, PROG-07, SOCL-06, SOCL-07

### Success Criteria
1. Streak counter tracks "Days without burnout" and awards milestones at 7, 14, and 30 days.
2. Streak can be restored for 5 Stars with a humorous interruption message displayed.
3. At least 10 ironic achievements are earnable; each has a "Shame" share button.
4. Referral link gives +100 commits and espresso to the invitee; inviter gets tiered rewards (+50 / +200 / "Team Lead" skin).
5. Anti-farm rule is enforced: referral reward unlocks only after 2 days in-game and 20 commits.

---

## Phase 6: Mini-Games Tier 1 (Early Levels)

**Goal:** Launch the first two mini-games to validate engagement, reward pacing, and cooldown mechanics.  
**Mode:** mvp  
**Duration:** Week 6

### Requirements Mapped
- MINI-01, MINI-02

### Success Criteria
1. "Hello World" QTE accepts 5 keys within 3 seconds; on success awards +50 commits and –10 depression.
2. "Code Review" bug hunt presents 3 bugs to find in 15 seconds; on success awards +100 commits, –20 depression, and +10% tap boost for 10 minutes.
3. Cooldown timers are enforced (4 hours / 6 hours respectively) and visible to the player.
4. Both games are gated by player level (2 and 4) and block under-leveled players with a clear message.

---

## Phase 7: Daily Battle & Referral Rewards

**Goal:** Activate the competitive social loop with a daily leaderboard summary posted in work chats.  
**Mode:** mvp  
**Duration:** Week 7

### Requirements Mapped
- SOCL-01, SOCL-02

### Success Criteria
1. Daily Battle calculates score from productivity (40%), depression (30%), social activity (20%), and referrals (10%).
2. Summary posts automatically at 18:00 to the bound work chat.
3. Three statuses are awarded: "Productive Genius", "Burnt Out of the Day", "Depression Savior".
4. Titles and tap-bonus rewards are granted and visible on the player profile within 1 minute of battle close.

---

## Phase 8: Mini-Games Tier 2 & Team Features

**Goal:** Expand content for mid-level players and introduce collaborative team goals.  
**Mode:** mvp  
**Duration:** Week 8

### Requirements Mapped
- MINI-03, SOCL-04, SOCL-05, VISU-05

### Success Criteria
1. "Dream Interview" quiz asks 5 IT questions with 10 seconds each; on success awards +200 commits, –30 depression, and a rare skin fragment.
2. Team weekly hackathon supports groups up to 5 members with a progress widget posted in chat.
3. Exclusive team skin is granted on goal completion; a humorous failure status is posted on miss.
4. "Team Lead" skin (+15% team energy in Daily Battle) is unlockable after inviting 5 friends.

---

## Phase 9: Advanced Content & Endgame Skins

**Goal:** Deliver high-level mini-games and deepen the skin collection for endgame players.  
**Mode:** mvp  
**Duration:** Week 9

### Requirements Mapped
- MINI-04, MINI-05, VISU-04, VISU-06, VISU-07, PROG-02

### Success Criteria
1. "Architectural Committee" Reigns-like card game runs 3 scales; on success awards +500 commits, –40 depression, and an achievement.
2. "IPO" pitch simulator plays 3 rounds requiring >80% confidence; on success awards +1000 commits, –50 depression, and the "CTO" skin.
3. Weekly sprint quest offers easy / medium / hard tiers with progressive rewards.
4. Skins "Senior Pajamas" (+5% energy recovery), "Legacy Archaeologist" (+20% commits in Legacy zone), and "Heroically Fired" (+10% tap on next level) are equippable with stated bonuses.

---

## Phase 10: Viral Polish & Final Social

**Goal:** Ship GIF reactions, remaining premium skins, and Telegram Stories integration.  
**Mode:** mvp  
**Duration:** Week 10

### Requirements Mapped
- MEME-04, MEME-05, VISU-08, VISU-09, SOCL-03

### Success Criteria
1. "Five stages of debugging" GIF (3.5s pixel-art) auto-sends after 10 failed bug-hunt attempts.
2. "Manager NPC: +1 deadline" GIF (2.8s) can be sent via a reply button in chat.
3. "Office Cat" skin (–10 depression every 5 min) is purchasable with Telegram Stars.
4. "Rubber Duck" skin (hides random mini-game errors) unlocks via a secret achievement.
5. Telegram Stories pedestal with an interactive poll is published after Daily Battle closes.

---

## Coverage Summary

- **v1 Requirements Total:** 38
- **Mapped to Phases:** 38
- **Unmapped:** 0 ✓

### Distribution by Phase

| Phase | Count | Categories |
|-------|-------|------------|
| 1 | 4 | TECH |
| 2 | 4 | VISU, TECH |
| 3 | 3 | MEME |
| 4 | 3 | PROG |
| 5 | 5 | PROG, SOCL |
| 6 | 2 | MINI |
| 7 | 2 | SOCL |
| 8 | 4 | MINI, SOCL, VISU |
| 9 | 6 | MINI, VISU, PROG |
| 10 | 5 | MEME, VISU, SOCL |

---

*Roadmap defined: 2026-05-20*  
*Granularity: fine | Mode: mvp | Phases: 10*
