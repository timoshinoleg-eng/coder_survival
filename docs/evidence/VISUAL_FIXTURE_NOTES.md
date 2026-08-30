# Fixture visual check notes

## Core state — 2026-08-19

The `/?visual-fixture=core` development-only route rendered the intended 390px-style hierarchy: compact rank/commits header, one desk/monitor/hero focal scene, readable energy and stress bars, and a single terminal-styled primary action. The visible viewport did not require scrolling.

A temporary-looking `Загрузка…` spinner appeared in the browser screenshot near the centre of the scene, but a direct DOM text query did not find a corresponding standalone text node. This requires a follow-up rendering check after the app has settled; it is not accepted as production evidence.

The fixture route itself is development-gated and intentionally contains no backend request, player data, game mutation, or production runtime branch.

## Core state — clean render follow-up

After the Preact mount now removes `#boot-fallback`, the repeated core fixture render no longer showed the bootstrap spinner or `Загрузка…` text. The screenshot retained a compact top hierarchy, a single central desk/hero focus, semantically differentiated energy/stress bars, and one wide terminal CTA fully inside the viewport.

## Screenshot review — representative 390×844 captures

The core fixture passes the immediate composition check: no clipped header metrics, no overflow of the terminal CTA, clear desk/hero focal area, and meters with distinct green/amber meaning.

The incident fixture did **not** display its expected event card in the headless capture. This is a blocking visual-fixture defect, so the incident acceptance gate is not yet passed and requires a targeted correction before final validation.

## Incident screenshot review — corrected captures

The regenerated 390×844 incident fixture shows a readable two-line title, explicit 19-second countdown, full-width timer, and two actionable controls without clipping the primary terminal CTA. The regenerated 360×800 variant switches the two choices to a vertical stack as designed; title, timer, action labels, hints, hero, resource bars, and CTA remain inside the viewport.
