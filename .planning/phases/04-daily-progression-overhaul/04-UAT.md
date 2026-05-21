---
status: testing
phase: 04-daily-progression-overhaul
source: [04-SUMMARY.md]
started: "2026-05-21T19:30:00.000Z"
updated: "2026-05-21T19:38:00.000Z"
---

## Current Test

number: 4
name: Battle Pass — Front-Loaded Rewards
expected: |
  Opening Sprint Pass shows rewards for levels 1, 2, and 3 (not just 5/10/15/20). Level 1 free track shows +25 energy.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Backend starts cleanly, migrations apply, API responds
result: pass

### 2. Daily Quests — 3+1 Display
expected: Opening the quest panel shows exactly 4 quests — 3 regular (login, tap, commit) and 1 bonus with gold border/"⭐ Бонус" label. No time-window labels shown.
result: pass

### 3. Full Clear Chest
expected: When all 4 quests are completed, the "🎁 Full Clear бонус" chest button appears. Tapping it grants the bonus reward.
result: pass

### 4. Battle Pass — Front-Loaded Rewards
expected: Opening Sprint Pass shows rewards for levels 1, 2, and 3 (not just 5/10/15/20). Level 1 free track shows +25 energy.
result: [pending]

### 5. Sprint Pass — Claim Without Reload
expected: Claiming a pass reward updates the UI immediately without a full page reload. The claim button changes to ✅.
result: [pending]

### 6. Sprint Pass — XP Source Breakdown
expected: Below the level progress bar, there are chips showing XP sources (Квесты, Мини-игры, Соц., Тапы, Другое) with correct amounts.
result: [pending]

### 7. Quest Modal from Stats Bar
expected: Tapping the 📋 quest button in StatsBar opens the quest modal overlay. The close button (×) dismisses it.
result: [pending]

### 8. Quest Auto-Tracking
expected: Tapping in the game automatically progresses the "tap_count" quest. Making commits progresses "commit_count". Opening the app marks "login" as complete.
result: issue
reported: "при нажатии кнопки тапать- появляется надпись 'не удалось сохранить тап'"
severity: blocker

## Summary

total: 8
passed: 3
issues: 1
pending: 4
skipped: 0

## Gaps

- truth: "Tapping in the game works and saves to the server"
  status: failed
  reason: "User reported: при нажатии кнопки тапать- появляется надпись 'не удалось сохранить тап'"
  severity: blocker
  test: 8
  artifacts: []
  missing: []
