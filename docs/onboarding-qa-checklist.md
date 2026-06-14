# Onboarding QA Checklist

A short manual smoke test for the Telegram Mini App onboarding flow.

---

## Pre-requisites

- [ ] A test Telegram user is available and does **not** already have a `progression` row, or its `onboarding_status` is reset to `not_started`.
- [ ] The backend, frontend, and bot are running and reachable from the test device.
- [ ] The test user can open the Mini App via the bot menu or a direct link.

---

## New player flow

- [ ] Open the Mini App with the clean test user.
  - **Expected:** The onboarding/FTUE screen appears before the main game UI.
- [ ] Verify the onboarding screen shows a primary action (e.g., "Start coding") and a skip option.
  - **Expected:** Both controls are visible and tappable.

---

## Skip flow

- [ ] Tap the skip option on the onboarding screen.
  - **Expected:** The onboarding screen closes and the main game UI loads.
- [ ] Check the user state (`/api/state`).
  - **Expected:** `onboardingStatus` is `skipped`, `onboardingCompleted` is `true`, `onboardingSkippedAt` is set, `onboardingCompletedAt` is `null`, and no onboarding reward was granted.

---

## Complete flow

- [ ] Reset the test user to `not_started` and reopen the Mini App.
- [ ] Tap the primary completion action on the onboarding screen.
  - **Expected:** The onboarding screen closes and the main game UI loads.
- [ ] Check the user state (`/api/state`).
  - **Expected:** `onboardingStatus` is `completed`, `onboardingCompleted` is `true`, `onboardingCompletedAt` is set, and the configured completion reward is present in `inventory`.
- [ ] Tap the completion action again.
  - **Expected:** The request succeeds, but no additional reward is granted.

---

## Bad network / repeated tap

- [ ] With network throttling enabled, rapidly tap the skip or complete button.
  - **Expected:** Only one state transition occurs; the UI does not show multiple rewards or error toasts.
- [ ] After the network recovers, check `/api/state`.
  - **Expected:** `onboardingStatus` matches the first successful action and remains stable.

---

## Re-entry after skip/complete

- [ ] Close the Mini App completely and reopen it after skipping onboarding.
  - **Expected:** The onboarding screen does not reappear.
- [ ] Repeat the same check after completing onboarding.
  - **Expected:** The onboarding screen does not reappear.

---

## Compact viewport check

- [ ] Open the onboarding screen on the smallest supported device or browser preset (e.g., 320 x 568 logical pixels).
  - **Expected:** The title, description, primary action, and skip option are fully visible without horizontal scrolling.
- [ ] Tap each control in the compact viewport.
  - **Expected:** All taps register and the correct action fires.
