# Handoff: Tap Freeze Investigation

## Current issue

Game launches, but taps feel broken: taps appear not to count and energy does not decrease.
Previous freeze mitigation helped only partially.

## Important context

- A lot of prompt work is already implemented: generator economy, daily farm log, pass catch-up, anti-cheat, premium referral, appeals, random events runtime, etc.
- The current likely regression is frontend performance / state churn, not one obvious backend syntax failure.

## Highest-priority audit findings

1. `frontend/src/App.jsx` has a two-way sync between local `runtimeEventState` and `useGameState.randomEventState`.
2. `frontend/src/App.jsx` rerenders every second unconditionally via `runtimeNow` timer.
3. `frontend/src/hooks/useGameState.js` `loadState()` still fires about 10 requests on initial mount.
4. The same active runtime event list is rendered twice.
5. The first screen mounts too many panels/components immediately.
6. The tap queue still triggers many global state updates per successful response.

## Files to inspect first

### Frontend

- `frontend/src/App.jsx`
- `frontend/src/hooks/useGameState.js`
- `frontend/src/components/StatsBar.jsx`
- `frontend/src/components/TapArea.jsx`
- `frontend/src/components/DailyQuests.jsx`
- `frontend/src/components/WeeklySprintPanel.jsx`
- `frontend/src/components/PassPanel.jsx`
- `frontend/src/components/TeamPanel.jsx`
- `frontend/src/components/RewardedVideo.jsx`

### Backend if needed

- `backend/src/routes/tap.js`
- `backend/src/routes/state.js`

## Do not start with more feature work

First objective:

- isolate and fix the interaction freeze / tap non-responsiveness.

## Suggested order

1. eliminate `App` / `useGameState` `runtimeEventState` loop
2. disable `App` 1-second timer unless event active
3. reduce initial `loadState()` fan-out
4. lazy-mount first-screen heavy panels
5. instrument tap queue and `/api/tap` roundtrip timing

## Likely root cause

The strongest suspicion is not one single backend bug, but render/update overload around the main app tree, especially:

1. `App.jsx` bi-directional `runtimeEventState` sync
2. `App.jsx` global 1-second rerender
3. `useGameState.loadState()` first-screen request fan-out
4. too many always-mounted first-screen components

That combination can make the app appear stuck and delay or effectively starve user-visible tap feedback.
