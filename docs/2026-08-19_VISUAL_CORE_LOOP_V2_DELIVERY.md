# Coder Survival — Visual Core Loop v2 Delivery

**Date:** 2026-08-19
**Scope:** visual-only core-loop remediation based on `docs/ART_SPEC_V2.md` and the production audit.
**Branch:** `manus/visual-core-loop-v2`
**Game-integrity boundary:** no tap economics, server authority, energy/stress calculation, leaderboard, Coffee Coin value, ad reward logic, or event-resolution contract was changed.

## Delivered changes

| Audit priority | Implementation | Runtime result |
|---|---|---|
| P0 — visual hierarchy | The top HUD exposes only **Tasks**, **Shop/Energy**, and **Menu**. All former secondary destinations remain reachable through a labelled bottom sheet with 44px-or-larger controls. | The gameplay surface no longer contains the former 17-button emoji toolbar. |
| P0 — semantic system | `tokens.css` now implements the binding ink/cyan/green/amber/red semantic palette with compatibility aliases; high-visibility HUD, CTA, event card, and onboarding use the v2 meanings. | Green indicates safe control, amber indicates energy/care, and red is reserved for incident/danger context. |
| P0 — event runtime contract | `RandomEventToast` no longer references legacy `*_keyart_780.jpg` or CSS `background-cover`. It uses a text-first, safe-zone-aware, fixed mobile card with an explicit countdown and full-size choices. | Runtime no longer ships the unapproved JPEG master path as event art. |
| P1 — tap surface | `TapArea` is a wide terminal/keyboard action zone rather than a green radial square. Existing pointer, haptic, audio, server delta, and Phaser event flow are preserved. | One obvious, readable action occupies the bottom safe zone. |
| P1 — onboarding grammar | The real onboarding modal now uses a hard pixel frame, square technical controls, semantic colours, and readable companion body type. | First-use UI better matches the game HUD/scene language. |
| P1 — motion | A global CSS reduced-motion fallback and Phaser `matchMedia` handling suppress decorative loops, particle emitters, flash, and shake while retaining state legibility. | Reduced-motion mode has a stable static scene. |
| P0 — deterministic evidence | Development-only `?visual-fixture=` states render without calling the backend. The bootstrap fallback is removed once Preact mounts so it cannot overlay UI. | Reproducible 390×844 and 360×800 capture paths are available without modifying production flow. |

## Asset integrity decision

The repository contains only the three v1 integrated hero PNGs. Their local checks passed: each is a 128×128 RGBA PNG, has transparent pixels, and has **zero visible magenta pixels in the outer 4px border**. SHA-256 values are recorded below.

| Asset ID | Bytes | SHA-256 | Alpha / magenta gate |
|---|---:|---|---|
| `hero_coder_focus` | 28,753 | `3eb239da5ee31ac128112afd33b8183dd021e1aee0c54aee0cbc461c509b4992` | Pass / Pass |
| `hero_coder_strained` | 27,344 | `a2e3c5c4b8913d50e6d9db3676a7370a9f2f70df4fdea6819fe452304b5e2175` | Pass / Pass |
| `hero_coder_collapsed` | 25,649 | `f852abb782686c04b3afac9278d1df70885dd513cefcfd9cb8fd7d8b3763ed09` | Pass / Pass |

The approved Luna P1 binary archive is **not in this bundle**. Therefore the approved `hero_coder_coffee`, `hero_coder_incident`, `hero_coder_recovery`, and the 12 icons were intentionally **not invented, copied from a candidate, or integrated without re-verification**. The two event JPEGs were `APPROVED_MASTER`, not `APPROVED_RUNTIME`; their legacy runtime use was removed rather than promoted.

## Screenshot evidence

The deterministic fixture accepts: `core`, `low-energy`, `high-stress`, `incident`, `recovery`, `burnout`, and `onboarding`. It is gated with `import.meta.env.DEV` and does not become a production route.

| Capture | Result |
|---|---|
| `docs/evidence/visual-fixtures/core_390x844.png` | Pass: header, desk focus, state bars, and terminal CTA fit. |
| `docs/evidence/visual-fixtures/low-energy_390x844.png` | Pass: low-energy state is readable without changing gameplay state. |
| `docs/evidence/visual-fixtures/high-stress_390x844.png` | Pass: high-stress visual state is readable. |
| `docs/evidence/visual-fixtures/incident_390x844.png` | Pass: title, 19-second timer, choices, hero, and CTA remain readable. |
| `docs/evidence/visual-fixtures/recovery_390x844.png` | Pass: recovery state retains the safe/control palette. |
| `docs/evidence/visual-fixtures/onboarding_390x844.png` | Pass: modal action and body copy remain inside the viewport. |
| `docs/evidence/visual-fixtures/core_360x800.png` | Pass: primary CTA remains unclipped. |
| `docs/evidence/visual-fixtures/incident_360x800.png` | Pass: incident choices stack vertically; title, timer, actions, hero, meters, and CTA remain visible. |

## Validation

The following commands passed in the isolated branch:

```text
cd frontend && npm test
cd frontend && npm run build
```

`npm test` completed the frontend smoke checks and **14/14** Node tests. `npm run build` completed successfully. `git diff --check` passed. Static acceptance checks also confirmed that the old `background-cover` event art contract is absent, the fixture is development-gated, both CSS and Phaser reduced-motion fallbacks exist, and the bootstrap fallback is removed after mount.

## Required follow-up before release

| Blocker | Required evidence | Owner / safe next step |
|---|---|---|
| P0 approved hero/icon integration | Exact raw archive files; SHA-256, bytes, dimensions, alpha, outer-edge magenta check; 390px evidence. | Copy only from the verified Luna P1 archive into a separate `manus/*` integration branch. |
| P0 runtime event art | Approved vertical WebP runtime export (≤280KB) plus mobile safe-zone proof. | Do not restore the current JPEG masters; integrate only `APPROVED_RUNTIME` WebP assets. |
| P0 real-runtime QA | Screenshots from a compatible authenticated game-state fixture or device session for actual core loop, no-backend failure, onboarding, and live events. | Verify Telegram WebView and Canvas scene before merge. |
| Delivery | Pull Request, CI, review. | The supplied bundle has only a local bundle remote, so a PR cannot be created from this environment. Push this branch to the canonical repository, then open the required PR. |

## References

1. [`Art Spec v2`](ART_SPEC_V2.md)
2. [`Approved Assets Register`](../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md)
3. [`Visual System v2`](../visual_assets/first_pack/VISUAL_SYSTEM_V2.md)
4. [`Fixture visual-check notes`](evidence/VISUAL_FIXTURE_NOTES.md)
