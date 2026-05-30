# Phase 3: Meme Engine MVP - Discussion Log

> Audit trail only. Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 3-Meme Engine MVP
**Areas discussed:** Backend rendering, Sharing mechanism, Trigger flow, Visual style, Image formats

---

## Backend rendering & variable security (MEME-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Server renders full image (canvas/Puppeteer) | Backend generates PNG with all variables baked in. Client cannot forge. | ✓ |
| Server signs variables with JWT | Client renders canvas but variables are HMAC-signed. Lighter but theoretically forgeable. | |

**User's choice:** Server renders full image (canvas/Puppeteer)
**Notes:** 100% protection against forgery. Higher server load but acceptable for MVP with rate limiting.

---

## Sharing mechanism (MEME-02)

| Option | Description | Selected |
|--------|-------------|----------|
| navigator.share() with Blob | Native image sharing. Not reliable in all Telegram WebView environments. | |
| Bot posts image to chat | Backend instructs bot to send photo via Telegram Bot API. Reliable, native feel. | ✓ |
| Download + manual share | User downloads image file. High friction, lowest implementation cost. | |

**User's choice:** Bot posts image to chat
**Notes:** Requires backend→bot integration. Bot sends photo with inline keyboard ("Играть" button).

---

## Trigger flow for "Share shame"

| Option | Description | Selected |
|--------|-------------|----------|
| Always manual | 🎨 button always available. No event triggers. | |
| Event-triggered only | Share button appears only after achievements/level-up/etc. | |
| Both manual + triggered | Manual always available + auto-prompt after key events. | ✓ |

**User's choice:** Both manual + triggered
**Notes:** Triggers: achievement unlock, level/rank up, Daily Battle result, streak milestone. Banner uses pixel-toast styling, auto-dismiss 10s.

---

## Visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Keep canvas gradients | Dark gradients + text. Consistent but less "meme-y". | |
| Real meme images as background | Popular meme templates. More viral but copyright risk. | |
| Pixel-art frames + game stats | Original pixel-art compositions matching game theme. | ✓ |

**User's choice:** Pixel-art frames + game stats
**Notes:** Avoids copyright issues. Maintains brand consistency. Placeholder frames for MVP, final art in Phase 9–10.

---

## Image formats

| Option | Description | Selected |
|--------|-------------|----------|
| 1:1 only (chat) | Single 400×400 render. Simpler. | |
| 1:1 chat + 9:16 Stories | Two separate renders for different platforms. | ✓ |

**User's choice:** 1:1 chat + 9:16 Stories
**Notes:** Stories format is 400×800 vertical with larger text and CTA at bottom.

---

## Claude's Discretion

- Exact pixel-art frame rendering parameters — implementer decides.
- Stats layout per template — implementer decides for visual balance.
- canvas vs Puppeteer — implementer decides based on environment.
- Temporary image cleanup — implementer decides.

## Deferred Ideas

- GIF memes (Phase 10)
- Final pixel-art frames (Phase 9–10)
- Additional templates beyond 5 (v2)
- Persistent meme gallery (v2)
- Meme reactions/likes (v2)
- CDN storage (v2)
