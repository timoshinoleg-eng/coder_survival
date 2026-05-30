# Phase 3: Meme Engine MVP — PLAN.md

> Status: Draft → Ready for review
> Requirements: MEME-01, MEME-02, MEME-03
> Context: 03-CONTEXT.md, 03-DISCUSSION-LOG.md

---

## Goal
Ship the viral core — a backend-secured meme generator that players can share instantly. Server renders tamper-proof PNGs; bot posts them to chats; frontend offers one-tap sharing.

---

## Architecture

```
┌─────────────┐     GET /api/meme?template&format     ┌─────────────┐
│  Frontend   │ ─────────────────────────────────────→│   Backend   │
│  (Preact)   │  ← image/png (200) or 429/500        │  (Express)  │
└─────────────┘                                       └──────┬──────┘
                                                             │
                                                    ┌────────▼────────┐
                                                    │ @napi-rs/canvas │
                                                    │  pixel-art draw │
                                                    └─────────────────┘
┌─────────────┐     GET /api/meme (signed URL)      ┌─────────────┐
│ Telegram    │ ─────────────────────────────────────→│   Backend   │
│   Bot       │  ← image/png                         │  (same API) │
│ (grammy)    │                                       └─────────────┘
└─────────────┘
```

**Rendering library:** `@napi-rs/canvas` (zero system deps, Canvas 2D API, works in Docker).

---

## Work Breakdown

### W1: Backend Meme Renderer

#### 1.1 Install dependency
```bash
cd backend && npm install @napi-rs/canvas
```

#### 1.2 Create `backend/src/utils/memeRenderer.js`
- **Templates**: 5 templates from existing `MEME_TEMPLATES` (works_on_my_machine, deploy_friday, this_is_fine, wtf_per_minute, stack_overflow).
- **Data source**: accepts `{ username, rankName, commits, streakDays, depression, energy, maxEnergy }`.
- **Visual style**:
  - Pixel-art 2px border in `accentColor`.
  - 4px 4px 0 block shadow (simulated via filled rects behind).
  - Background: linear gradient drawn with Canvas `createLinearGradient`.
  - Top text: bold 28px white with `shadowBlur`.
  - Stats block: rank + commits, streak, stress, energy.
  - Bottom text: bold 22px accent color.
  - Watermark: "Coder Survival" bottom-right, 12px, 15% opacity.
- **Formats**:
  - `1:1` → 400×400
  - `9:16` → 400×800 (taller, stats block centered vertically, more padding)
- **Fonts**: register system sans-serif bold; fallback to default.
- **Output**: `canvas.encode('png')` → Buffer.

#### 1.3 Create `backend/src/routes/meme.js`
```
GET /api/meme?templateId=<id>&format=<1:1|9:16>
```
- Auth: `initDataMiddleware` (same as all game endpoints).
- Validation:
  - `templateId` ∈ known set.
  - `format` ∈ `{1:1, 9:16}` (default `1:1`).
- Fetch user progression from DB (same query pattern as `state.js`).
- Render via `memeRenderer.js`.
- **Cache**: in-memory LRU (max 100 entries, TTL 5 min). Key = `userId:templateId:format`.
- **Rate limit**: reuse `checkTapRateLimit` middleware or custom simple in-memory bucket (10 req/min per user).
- Response headers:
  - `Content-Type: image/png`
  - `Cache-Control: public, max-age=300`
  - `X-Meme-Template: <id>`
- Error responses: JSON `{ error }` with status 400/429/500.

#### 1.4 Register route in `backend/src/index.js`
```js
import memeRouter from './routes/meme.js';
app.use('/api/meme', initDataMiddleware, memeRouter);
```

#### 1.5 DB migration
```sql
-- migrations/NNN_add_meme_shares.sql
CREATE TABLE IF NOT EXISTS meme_shares (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  template_id VARCHAR(32) NOT NULL,
  format VARCHAR(8) NOT NULL,
  shared_to VARCHAR(16) CHECK (shared_to IN ('chat','story','copy')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_meme_shares_user ON meme_shares(user_id, created_at DESC);
CREATE INDEX idx_meme_shares_template ON meme_shares(template_id, created_at DESC);
```

#### 1.6 Analytics helper
- `recordMemeShare(client, userId, templateId, format, sharedTo)` in `backend/src/utils/memeAnalytics.js`.
- POST endpoint `/api/meme/share` to record share action (called by frontend after user clicks Share).

---

### W2: Bot Share Flow

#### 2.1 Add `/meme` command to `bot/src/createBot.js`
```js
bot.command('meme', async (ctx) => {
  // Inline keyboard with template list
  const keyboard = new InlineKeyboard()
    .text('Works on my machine', 'meme_template:works_on_my_machine')
    .text('Deploy on Friday', 'meme_template:deploy_friday')
    .row()
    .text('This is fine', 'meme_template:this_is_fine')
    .text('WTF/min', 'meme_template:wtf_per_minute')
    .row()
    .text('Stack Overflow', 'meme_template:stack_overflow');
  await ctx.reply('Выбери шаблон мема:', { reply_markup: keyboard });
});
```

#### 2.2 Callback handler
```js
bot.callbackQuery(/^meme_template:(.+)$/, async (ctx) => {
  const templateId = ctx.match[1];
  const photoUrl = `${API_URL}/api/meme?templateId=${templateId}&format=1:1`;
  const playKeyboard = new InlineKeyboard().webApp('Играть в Coder Survival', WEBAPP_URL);
  await ctx.replyWithPhoto(photoUrl, {
    caption: `Coder Survival — ${templateId}\nА ты сколько накодил? 👇`,
    reply_markup: playKeyboard
  });
  await ctx.answerCallbackQuery();
});
```
- **Signed URL concern**: The GET endpoint requires `x-telegram-init-data` header. Telegram Bot API `sendPhoto` can't set custom headers.
- **Resolution**: Create an **unauthenticated** public endpoint `GET /api/meme/public/:token` where `token` is a short-lived signed JWT (or HMAC hash) containing `userId`, `templateId`, `format`, `exp`. Bot generates this token and sends the public URL. This keeps the main endpoint auth-protected while allowing bot sharing.
- Implementation:
  - `backend/src/utils/memeToken.js`: `signMemeToken(payload)` / `verifyMemeToken(token)` using `BOT_BACKEND_SECRET` as key. Expiry: 10 minutes.
  - `backend/src/routes/meme.js` add `GET /api/meme/public/:token` — verifies token, renders PNG, no initData required.
  - Bot uses public URL for `replyWithPhoto`.

#### 2.3 Add `/meme` to bot help text

---

### W3: Frontend Refactor

#### 3.1 Rewrite `frontend/src/components/MemeGenerator.jsx`
- **Remove**: all `drawMeme` canvas logic, `canvasRef`, `handleCopy` text copy.
- **Add**:
  - `templateId` state (default `'works_on_my_machine'`).
  - `format` state (`'1:1'` | `'9:16'`, default `'1:1'`).
  - `imgSrc` = `/api/meme?templateId=${templateId}&format=${format}`.
  - `<img>` tag with loading skeleton (pixel-art pulse).
  - Template selector: horizontal scrollable list of pixel buttons (reuse `.pixel-button`).
  - Format toggle: «Квадрат» / «Stories» toggle.
  - **Share button**: calls Telegram `shareUrl` (if available) or falls back to `shareText` with meme URL. Also records share via POST `/api/meme/share`.
  - **Download button**: `fetch(imgSrc)` → `blob()` → `URL.createObjectURL` → `<a download>`.
- **Props**: `open`, `onClose` (same interface — StatsBar needs no change).

#### 3.2 Pixel-art styling
- `.meme-preview`: `.pixel-panel` wrapper.
- `.meme-preview img`: `image-rendering: pixelated`.
- Template selector buttons: active state accent border.

#### 3.3 Auto-prompt triggers
- In `useGameState.js`:
  - After `applyServerState` detects `levelUp` → set `memePrompt: { trigger: 'levelUp', rankName }`.
  - After battle win → set `memePrompt: { trigger: 'battleWin' }`.
  - After streak milestone (7, 30 days) → set `memePrompt: { trigger: 'streak', days }`.
- In `AppInner.jsx`:
  - Listen for `memePrompt` → show `MemeGenerator` modal automatically (single-use, dismissed on close).

#### 3.4 StatsBar 🎨 button
- Already imported `MemeGenerator` and has `memeOpen` state. Ensure button is visible and styled with `.pixel-button`.
- Add `haptic('light')` on open.

---

### W4: Analytics, Cache & Polish

#### 4.1 Amplitude events (`frontend/src/analytics/events.js`)
```js
export const MEME_EVENTS = {
  MEME_OPENED: 'meme_opened',
  MEME_TEMPLATE_CHANGED: 'meme_template_changed',
  MEME_FORMAT_CHANGED: 'meme_format_changed',
  MEME_SHARED: 'meme_shared',
  MEME_DOWNLOADED: 'meme_downloaded',
  MEME_AUTO_PROMPT_SHOWN: 'meme_auto_prompt_shown',
};
```
- Fire on corresponding user actions.

#### 4.2 Backend cache
- Simple Map + setTimeout eviction (100 entries, 5 min TTL).
- Or use `lru-cache` if already in deps; else plain Map to avoid new dep.

#### 4.3 Rate limit middleware
- Reuse existing `checkTapRateLimit` if generic enough; otherwise create lightweight `memeRateLimit.js` (10 req/min per user).

#### 4.4 Error handling
- Frontend: if image fails to load, show error state with retry button.
- Backend: if canvas throws, return 500 with JSON error (or transparent PNG fallback? No — explicit error).

#### 4.5 Testing
- **Backend**: test `memeRenderer.js` with dummy data → assert PNG buffer > 0, correct dimensions.
- **Backend**: test `GET /api/meme` returns 401 without auth, 200 with auth, 429 on burst.
- **Backend**: test public token endpoint — valid token returns PNG, expired returns 403.
- **Frontend**: visual smoke test — open modal, switch templates, image loads.

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/src/utils/memeRenderer.js` | Canvas 2D rendering engine |
| `backend/src/utils/memeToken.js` | Signed URL token (HMAC) for bot sharing |
| `backend/src/utils/memeAnalytics.js` | DB helper for meme_shares |
| `backend/src/routes/meme.js` | Express router for meme endpoints |
| `backend/src/middleware/memeRateLimit.js` | Rate limiting for meme generation |
| `backend/migrations/NNN_add_meme_shares.sql` | New table |
| `frontend/src/components/MemeGenerator.jsx` | Overwrite — new server-rendered UI |
| `frontend/src/analytics/events.js` *(append)* | MEME_EVENTS constants |

## Files to Modify

| File | Change |
|------|--------|
| `backend/package.json` | Add `@napi-rs/canvas` |
| `backend/src/index.js` | Import & register `memeRouter` |
| `bot/src/createBot.js` | Add `/meme` command + callback handler |
| `frontend/src/hooks/useGameState.js` | Add `memePrompt` state + auto-trigger logic |
| `frontend/src/App.jsx` | Handle `memePrompt` auto-open |
| `frontend/src/components/StatsBar.jsx` | Ensure 🎨 button visible + pixel styling |

## Verification

- [ ] `npm install` in backend succeeds, Docker build passes.
- [ ] `GET /api/meme?templateId=works_on_my_machine&format=1:1` with valid initData returns PNG 400×400.
- [ ] Same with `format=9:16` returns PNG 400×800.
- [ ] Invalid templateId → 400 JSON error.
- [ ] 11th request within 60s → 429.
- [ ] Public token URL works in browser/incognito.
- [ ] Bot `/meme` → inline keyboard → selection → photo posted in chat with «Играть» button.
- [ ] Frontend: open modal → image loads → switch template → image updates → share triggers Telegram native share.
- [ ] Level-up triggers auto-prompt once.
- [ ] Amplitude events fire in browser console/network.
- [ ] All existing backend tests still pass.
- [ ] Frontend build: 0 errors.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `@napi-rs/canvas` fails in Docker (Alpine/musl) | Use `@napi-rs/canvas` linux-x64-musl target; test in Dockerfile build step. Fallback: install `python3`, `build-base`, `libpng-dev` for `canvas`. |
| Public token endpoint abused | Short expiry (10 min), single-use nonce stored in memory Set (optional), IP-based rate limit via `express-rate-limit` if needed. |
| Canvas text rendering differs from HTML | Define explicit font size/family in renderer; test output visually. |
| Bot `replyWithPhoto` URL size limit | URL < 2KB (token is short); use query params, not body. |

## Estimation

- W1: Backend renderer + route — ~3h
- W2: Bot share flow — ~1.5h
- W3: Frontend refactor + auto-prompt — ~2.5h
- W4: Analytics, cache, polish, tests — ~2h
- **Total: ~9h**
