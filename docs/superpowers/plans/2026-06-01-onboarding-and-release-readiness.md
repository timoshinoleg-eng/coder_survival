# Onboarding And Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the next Coder Survival iteration understandable for new players, verify the meme fix in the real product path, and prepare a low-risk release.

**Architecture:** Split work into three independent streams: product/UI implementation, independent review, and release verification. Codex owns code integration and final verification; Kimi Code handles repo/documentation consistency and low-risk support copy; Claude Opus 4.8 reviews product clarity and failure modes.

**Tech Stack:** Preact 10, Vite 5, Phaser 3.60, Node.js 20, Express 4, PostgreSQL, Jest.

---

## Current Baseline

- Active repo: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh`
- Current local branch after backend/meme fixes: `main`, ahead of `origin/main` by 5 commits.
- Required guardrails:
  - Backend: `$env:NODE_ENV='test'; $env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/coder_survival_test'; npm --prefix backend test -- --runInBand`
  - Frontend build: `npm --prefix frontend run build`
  - Frontend static smoke: `npm --prefix frontend run smoke`

## Work Allocation

### Codex Stream: Implementation And Final Integration

**Files likely touched:**
- Modify: `frontend/src/components/Onboarding.jsx` or current onboarding component if named differently.
- Modify: `frontend/src/hooks/useGameState.js` only if onboarding state needs existing context fields.
- Modify: `frontend/src/App.jsx` if onboarding modal routing lives there.
- Modify: `frontend/scripts/frontend-smoke.mjs` to guard imports/state regressions.
- Test: add or extend frontend smoke checks; use backend tests only if API contracts change.

- [ ] **Step 1: Confirm current onboarding entry points**

Run:
```powershell
Select-String -Path 'frontend/src/**/*.jsx','frontend/src/**/*.js' -Pattern 'showOnboarding|Onboarding|localStorage|memePrompt' -Context 2,2
```

Expected: identify the existing first-session onboarding component and localStorage key.

- [ ] **Step 2: Design a minimal First Sprint flow**

Use existing UI style. Do not add a marketing landing page. The first screen must explain:
- goal: write commits, level up, survive stress, complete quests, eventually prestige;
- resources: energy is tap fuel, stress lowers efficiency, quests give direction;
- first action: tap 5 times and claim/notice login quest;
- help fallback: a small `?`/help button in HUD or onboarding footer.

- [ ] **Step 3: Add frontend guardrail before implementation**

Extend `frontend/scripts/frontend-smoke.mjs` with static checks that:
- onboarding still has a persisted localStorage/version key;
- onboarding copy contains goal/resource concepts;
- no component reference is rendered without import.

Run:
```powershell
npm --prefix frontend run smoke
```

Expected before implementation: fail on missing new onboarding goal/resource copy checks.

- [ ] **Step 4: Implement onboarding UI**

Implement in the existing onboarding component. Keep it compact:
- 3-4 steps maximum;
- buttons must be short and mobile-safe;
- no wall of text;
- use existing pixel panel/button styles;
- do not block returning users who already completed onboarding unless version changes.

- [ ] **Step 5: Verify frontend**

Run:
```powershell
npm --prefix frontend run build
npm --prefix frontend run smoke
```

Expected: both pass.

- [ ] **Step 6: Verify meme path locally or against prod/staging**

At minimum, regenerate server PNG and inspect it visually:
```powershell
@'
import fs from 'node:fs';
import path from 'node:path';
import { renderMeme } from './backend/src/utils/memeRenderer.js';
const stats={username:'test_coder',rankName:'Senior',commits:1337,streakDays:42,depression:33,energy:65,maxEnergy:100};
const out=path.resolve('reports/meme-this-is-fine-after.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await renderMeme('this_is_fine','1:1',stats));
console.log(out);
'@ | node --input-type=module
```

Expected: image has a visible illustrated scene and readable text, not a black/empty card.

- [ ] **Step 7: Full backend regression**

Run:
```powershell
$env:NODE_ENV='test'
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/coder_survival_test'
npm --prefix backend test -- --runInBand
```

Expected: all backend suites pass.

- [ ] **Step 8: Commit**

Commit message:
```powershell
git add frontend/src frontend/scripts
git commit -m "feat: add first sprint onboarding"
```

### Kimi Code Stream: Docs, Support, And Repo Consistency

**Scope:** low-risk docs/status/support work only. Kimi should not change production logic unless it finds a clearly isolated typo in docs or copy.

**Status:** completed in `dc16ef0 docs: update gameplay support handoff`.

**Files likely touched:**
- Modify: `HANDOFF.md`
- Modify or create: `support/GAMEPLAY_FAQ.md`
- Modify or create: `support/SUPPORT_TRIAGE_CHECKLIST.md`
- Modify: `project-status.json` only if it exists and clearly drifts from `HANDOFF.md`.

- [x] **Step 1: Reconcile docs with current repo**

Check latest commits and ensure `HANDOFF.md` says the local branch has backend/meme fixes pending push/deploy.

- [x] **Step 2: Add player-support explanations**

Add concise FAQ entries for:
- what is the goal;
- energy;
- stress/depression;
- quests;
- random events;
- meme generator.

- [x] **Step 3: Add release note bullets**

Document:
- login reward timezone guard;
- legacy random event lifecycle fix;
- passive stress idle persistence cleanup;
- test DB reset cleanup;
- meme cards now render illustrated scenes.

- [x] **Step 4: Commit**

Commit message:
```powershell
git add HANDOFF.md project-status.json support
git commit -m "docs: update gameplay support handoff"
```

### Claude Opus 4.8 Stream: Independent Product/Code Review

**Scope:** review only unless explicitly asked to patch. Claude should inspect diffs and produce findings with severity.

**Focus:**
- onboarding comprehension;
- user-facing copy clarity;
- meme visual regression risk;
- whether new backend fixes have hidden behavior regressions;
- release-readiness risk.

- [ ] **Step 1: Review the 5 backend/meme commits**

Command:
```powershell
git show --stat --oneline ba60665..HEAD
git diff 93f3afc..HEAD -- backend/src backend/tests
```

- [ ] **Step 2: Review onboarding implementation after Codex commits it**

Command:
```powershell
git diff HEAD~1..HEAD -- frontend
```

- [ ] **Step 3: Return findings first**

Output format:
- Findings ordered by severity with `file:line`.
- Open questions.
- Verification gaps.
- Short approval/blocker decision.

## Release Gate

- [ ] Backend full suite passes.
- [ ] Frontend build passes.
- [ ] Frontend smoke passes.
- [ ] Meme PNG visually verified.
- [ ] Kimi docs/support pass merged or explicitly deferred.
- [ ] Claude review has no P0/P1 blockers.
- [ ] Real Telegram Mini App smoke from phone/account:
  - open bot;
  - tap once;
  - inspect onboarding/help;
  - open meme generator;
  - open shop;
  - open prestige preview/shop;
  - confirm no auth loop or blank screen.

## Suggested Execution Order

1. Push current 5 committed fixes to a branch or keep local until onboarding is added.
2. Codex implements onboarding and verifies build/smoke/full backend.
3. Kimi updates docs/support from current diffs.
4. Claude reviews combined diff.
5. Fix any review blockers.
6. Final production release/smoke.
