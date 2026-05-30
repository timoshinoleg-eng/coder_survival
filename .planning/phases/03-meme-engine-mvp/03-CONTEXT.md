# Phase 3: Meme Engine MVP - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the viral core — a backend-secured meme generator that players can share instantly. In scope: backend image rendering (server-side canvas), 5 pixel-art-framed meme templates with real game variables, dual-format output (1:1 chat + 9:16 Stories), bot-based image sharing to Telegram chats, manual + event-triggered "Share shame" flow. Out of scope: GIF memes (Phase 10), final pixel-art assets (placeholders acceptable), more than 5 templates.

</domain>

<decisions>
## Implementation Decisions

### Backend Rendering & Security (MEME-03)
- **D-01:** Server renders full image using Node canvas (`canvas` npm package) or Puppeteer. Client receives ready PNG — 100% protection against variable forgery.
- **D-02:** No client-side variable injection. All variables (username, commits_today, depression_level, level, days_without_burnout, skin_equipped) are passed to backend, rendered into image, returned as base64/URL.
- **D-03:** Backend endpoint: `POST /api/meme/generate` accepts `{ templateId, format: '1:1' | '9:16', variables }`, returns `{ imageUrl, imageBase64, shareUrl }`.
- **D-04:** Image storage: temporary (in-memory or short-lived file). No persistent CDN for MVP. Images live ~1 hour.
- **D-05:** Rate limiting: max 10 meme generations per user per hour to prevent abuse.

### Sharing Mechanism (MEME-02)
- **D-06:** Bot posts image to chat via server-side API. User presses "Поделиться позором" → frontend calls backend → backend instructs bot to send image to current chat (via `chat_id` from initData).
- **D-07:** Fallback: if bot can't post (no chat, permissions), offer "Download image" via `canvas.toBlob()` + `URL.createObjectURL()`.
- **D-08:** Share formats: 1:1 (400×400, square) for regular chats; 9:16 (400×800, vertical) for Telegram Stories. Two separate renders from same template.
- **D-09:** Share caption includes playful text + referral link: «{username} накодил {commits} коммитов в Coder Survival. А ты? 👇 {refLink}»

### Visual Style (MEME-01)
- **D-10:** Pixel-art frames consistent with game theme. Each template has a pixel-art border/frame (code-drawn or placeholder image) with game stats inside.
- **D-11:** No real copyrighted meme images as backgrounds. Use original pixel-art compositions to avoid legal issues.
- **D-12:** 5 templates with distinct themes:
  1. "Works on my machine" — green frame, sarcastic
  2. "Deploy on Friday" — red frame, warning
  3. "This is fine" — orange frame, denial
  4. "WTF per minute" — purple frame, code review
  5. "Stack Overflow" — blue frame, copy-paste
- **D-13:** Stats displayed inside frame: username, rank, commits today, depression %, streak days, equipped skin. Layout varies per template.

### Trigger Flow
- **D-14:** Manual trigger: 🎨 button always available in StatsBar. Opens meme modal with template selector, preview, share button.
- **D-15:** Event triggers: after key events, a "Share shame" banner appears for 10 seconds:
  - Achievement unlocked
  - Level / Rank up
  - Daily Battle result published
  - Streak milestone (7/14/30 days)
- **D-16:** Event-triggered banner uses `.pixel-toast` styling with single "ПОДЕЛИТЬСЯ ПОЗОРОМ" button. Auto-dismiss after 10s.

### Frontend Changes
- **D-17:** Refactor `MemeGenerator.jsx`: replace client-side canvas rendering with server-rendered image display. Keep template selector UI.
- **D-18:** Add `MemeShareBanner.jsx` component for event-triggered share prompts.
- **D-19:** Update `useGameState.js` to track `lastMemeableEvent` (achievement, level-up, etc.) for trigger logic.

### Bot Integration
- **D-20:** New bot endpoint (or backend→bot webhook) to send photo to chat.
- **D-21:** Bot uses Telegram Bot API `sendPhoto` with inline keyboard ("Играть" button linking to Mini App).

### Claude's Discretion
- Exact pixel-art frame rendering parameters (border width, shadow depth, font sizes within meme) — implementer decides based on 400×400 / 400×800 canvas.
- Exact stats layout per template — implementer decides for visual balance.
- Whether to use `canvas` npm package or Puppeteer — implementer decides based on environment compatibility.
- Temporary image cleanup strategy (setInterval vs cron) — implementer decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria, requirements mapped (MEME-01..03)
- `.planning/REQUIREMENTS.md` — MEME-01, MEME-02, MEME-03 definitions
- `.planning/PROJECT.md` — Core Value, pixel-art 16-bit decision, security constraints

### Prior phase decisions
- `.planning/phases/02-visual-foundation-atmosphere/02-CONTEXT.md` — Pixel-art decisions, event system
- `.planning/phases/02-visual-foundation-atmosphere/02-UI-SPEC.md` — Visual contracts (colors, fonts, borders)

### Codebase maps
- `frontend/src/components/MemeGenerator.jsx` — Existing client-side meme generator (to be refactored)
- `bot/` — Bot structure for sharing integration
- `backend/src/` — Backend routes structure for new `/api/meme/*` endpoints

### Key source files
- `frontend/src/components/MemeGenerator.jsx` — Current canvas-based implementation
- `frontend/src/hooks/useGameState.js` — State management, need to add meme-related state
- `frontend/src/components/StatsBar.jsx` — 🎨 button location
- `bot/api/` or `bot/src/` — Bot API handlers for `sendPhoto`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MemeGenerator.jsx** — Already has 5 templates defined, modal structure, template selector UI. Can reuse UI shell, replace rendering logic.
- **Canvas rendering pattern** — Existing `drawMeme()` function shows how to render text + stats on canvas. Can be ported to backend.
- **Telegram share** — `useTelegram().shareText()` exists. For images, need bot-based approach.
- **Pixel-theme.css** — `.pixel-toast`, `.pixel-button`, `.pixel-panel` classes available for share banner.

### Established Patterns
- **API requests** — `apiRequest()` utility with `initData` auth. New `/api/meme/generate` follows same pattern.
- **Bot webhook** — Bot likely uses Vercel serverless functions. Need to add `sendPhoto` handler.
- **Event bridge** — `window.__PHASER_GAME__.events` pattern from Phase 2 can trigger meme banners.

### Integration Points
- **Backend → Bot** — New cross-service integration. Backend needs bot token or internal API to instruct bot posting.
- **Frontend → Backend** — `POST /api/meme/generate` returns image data.
- **Frontend → Bot (indirect)** — User action → frontend → backend → bot → Telegram chat.
- **GameState → Meme triggers** — Achievement/level-up detection in useGameState.js needs to set transient `lastMemeableEvent`.

### Phase 2 Outcomes (must not break)
- Pixel-art CSS theme active on all components.
- Event system (EventManager + RandomEventToast) working.
- StatsBar has 🎨 button that opens MemeGenerator.

</code_context>

<specifics>
## Specific Ideas

- Pixel-art frame examples: 8px border, 4px inner padding, hard shadows (4px 4px 0 #0f172a), Press Start 2P font for stats.
- Stats layout: username at top (14px), big commit number in center (28px), depression/energy/streak at bottom (10px).
- 9:16 Stories format: stats larger, more vertical spacing, bigger call-to-action at bottom.
- Share banner text: «🏆 Новый уровень! {username} теперь {rank}. Поделись позором?»
- Bot inline keyboard after photo: `[{ text: "Играть в Coder Survival", url: "https://t.me/coder_survival_bot/app" }]`
- Referral link in share caption: `t.me/coder_survival_bot?start=ref_{userId}`
</specifics>

<deferred>
## Deferred Ideas

- **GIF memes** — MEME-04, MEME-05 (Five stages of debugging, Manager NPC). Deferred to Phase 10.
- **Final pixel-art frames** — Real artist-drawn frames. Deferred to Phase 9–10. Phase 3 uses code-drawn placeholders.
- **Additional templates** — Beyond 5. Deferred to v2.
- **Persistent meme gallery** — User's meme history. Deferred to v2.
- **Meme reactions/likes** — Social engagement on shared memes. Deferred to v2.
- **CDN storage** — S3/CloudFront for images. Deferred; MVP uses temporary storage.
</deferred>

---

*Phase: 3-Meme Engine MVP*
*Context gathered: 2026-05-21*
