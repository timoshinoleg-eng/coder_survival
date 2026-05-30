# Telegram Mini App Game Stack — Research Report 2025

**Date:** 2026-05-20  
**Research scope:** Standard 2025 stack for Telegram Mini Apps with game mechanics (tap games, mini-games, social features, meme generation).  
**Existing project baseline:** Node.js 20, Express 4, PostgreSQL, Preact 10, Phaser 3.60, grammy, Vite 5, Yandex Cloud VM + Vercel.

---

## 1. Telegram Mini App SDK & WebApp APIs

### 1.1 Primary SDK — `@telegram-apps/sdk` (v3.x) or `@tma.js/sdk` (v3.2.0)

| Option | Version | Confidence |
|--------|---------|------------|
| `@telegram-apps/sdk` | `^3.0.0` | **HIGH** |
| `@tma.js/sdk` | `^3.2.0` | **HIGH** |

**Rationale:**  
The official Telegram SDK (`telegram-web-app.js`) is a single global script injected by Telegram. In 2025, community-maintained TypeScript-first wrappers have become the de-facto standard because the official SDK lacks tree-shaking, has no NPM package, and its types are incomplete.

- **`@telegram-apps/sdk`** (Telegram Mini Apps GitHub org) — actively maintained, React/Vue/Solid bindings available (`@telegram-apps/sdk-react`), covers Bot API 9.1 features (July 2025), includes `initData` validation helpers, mock environments for local development, and supports `miniApp`, `backButton`, `closingBehavior`, `viewport`, `themeParams`, `cloudStorage`, `secureStorage`, `deviceStorage`.
- **`@tma.js/sdk`** — mature alternative with identical coverage. Both are interchangeable; `@telegram-apps/*` is slightly better aligned with official docs and has more template repos.

**Server-side validation:** Use `@telegram-apps/init-data-node` (or `@tma.js/init-data-node`) to validate `initData` HMAC on your backend. Do NOT roll your own HMAC validation.

**What NOT to use:**
- ❌ Raw `window.Telegram.WebApp` without a wrapper — leads to untyped code, no tree-shaking, harder testing.
- ❌ Older `@vkruglikov/react-telegram-web-app` — not updated for Bot API 8.x/9.x, missing SecureStorage/DeviceStorage, full-screen, safe area insets.
- ❌ `@twa-dev/sdk` — superseded by `@telegram-apps/sdk`.

**Key Bot API features to target (2025):**
| Feature | API Version | Why it matters for games |
|---------|-------------|--------------------------|
| `requestFullscreen()` / `exitFullscreen()` | Bot API 8.0 | Essential for immersive game experience |
| `safeAreaInset` / `contentSafeAreaInset` | Bot API 8.0 | Handle notches, dynamic island, home bars |
| `CloudStorage` | 7.x+ | Cross-device save state (5 MB limit) |
| `DeviceStorage` | Bot API 9.0 | Persistent local storage (5 MB, device-only) |
| `SecureStorage` | Bot API 9.0 | Encrypted local storage (iOS Keychain / Android Keystore, 10 items) |
| `shareMessage()` / `shareToStory()` | 7.8–8.0 | Viral sharing of meme/game results |
| `lockOrientation()` | Bot API 8.0 | Lock to portrait for tap games |
| `setEmojiStatus()` | Bot API 8.0 | Social rewards / achievements |
| `hideKeyboard()` | Bot API 9.1 | Clean UI during gameplay |
| `SecondaryButton` | Bot API 7.10 | Dual CTA (e.g., "Play" + "Share") |

**Authentication pattern (2025 best practice):**
```
Frontend: useLaunchParams() → rawInitData → Authorization header
Backend: @telegram-apps/init-data-node → isValid(rawInitData, BOT_TOKEN)
```
Store validated user identity in your DB; do not trust client-sent `user_id` without `initData` validation.

---

## 2. Game Engines / Frameworks for 2D Pixel-Art in WebView

### 2.1 Decision Matrix

| Engine | Bundle Size | Best For | Confidence |
|--------|-------------|----------|------------|
| **Phaser 3.80+** | ~500 KB | Full 2D games, pixel-art, arcade physics, existing code | **HIGH** |
| **PixiJS 8.x** | ~200 KB | Custom 2D rendering, UI-heavy, particle effects | **HIGH** |
| **Excalibur.js 0.30+** | ~300 KB | TypeScript-first 2D games, entity-component | **MEDIUM** |
| **Defold (HTML5)** | ~1.14 MB | Casual mobile-first, fast load | **MEDIUM** |
| **Godot 4.4+ (Web export)** | ~9 MB | Complex 2D/3D, native + web dual target | **LOW** |

### 2.2 Recommendation: Stay with Phaser, upgrade to 3.80+

**Rationale:**  
Your codebase already uses Phaser 3.60. Phaser 3.80 (released 2024) and 3.85+ (2025) bring:
- WebGL 2 batching improvements (fewer draw calls)
- Better Spine support
- Improved iOS Safari/WebView stability
- Smaller bundle via tree-shaking when used with Vite

For Telegram Mini Apps specifically, Phaser is the dominant choice because:
1. **Web-first** — designed for browsers, no WASM bootstrap overhead.
2. **Instant load** — 500 KB vs Godot’s 9–24 MB Web export.
3. **Pixel-art native** — `pixelArt: true` in game config enables nearest-neighbor scaling, crisp sprites.
4. **Arcade Physics** — built-in, fast, perfect for tap games and simple mini-games.
5. **Texture atlases** — critical for minimizing draw calls in WebView; Phaser has deep tooling support (TexturePacker, free alternatives).

**Migration path from 3.60:**
```bash
npm install phaser@^3.85.0
```
No breaking API changes expected for 2D pixel-art usage. Review release notes for Spine/Tilemap changes if used.

### 2.3 Alternative: PixiJS 8.x for hybrid UI + light game

If your app is 70% UI (menus, leaderboards, meme editor) and 30% light gameplay, consider **PixiJS 8.x** as the renderer and build your own game loop on top. PixiJS 8 added WebGPU support (experimental) and has a smaller footprint. However, you lose built-in physics, scene manager, and sprite animation utilities — only worth it if bundle size is the absolute top priority.

### 2.4 What NOT to use

- ❌ **Unity WebGL** — Minimum ~8 MB empty build, slow load in Telegram WebView, memory pressure on low-end Android, poor iOS Safari support. Overkill for 2D pixel-art mini-games.
- ❌ **Godot Web export** for primary target — Godot 4 is excellent for desktop/mobile native, but its HTML5 export (~9 MB compressed, 24 MB uncompressed) causes long blank screens in Telegram. SharedArrayBuffer headers are required and can break on some hosts. Use only if you plan a native app store release alongside the Mini App.
- ❌ **Three.js / Babylon.js** — These are 3D engines. For 2D pixel-art they add unnecessary complexity and bundle size.
- ❌ **Cocos Creator** — Strong in Asia/WeChat mini-games, but smaller community in Telegram ecosystem, heavier tooling.

---

## 3. Backend Patterns for Real-Time Leaderboards, Social, Mini-Games

### 3.1 Keep Express, add strategic upgrades

Your Express 4 + PostgreSQL stack is still viable for 2025, but real-time features need additions.

| Layer | Recommendation | Version | Confidence |
|-------|----------------|---------|------------|
| Runtime | **Node.js** | `20.x LTS` (current: 20.18+) | **HIGH** |
| Framework | **Express 5** (or stay on 4) | `^5.0.0` | **MEDIUM-HIGH** |
| Real-time | **Socket.IO** | `^4.8.0` | **HIGH** |
| ORM/Query | **Kysely** or stay raw `pg` | `^0.27.0` | **HIGH** |
| Caching / PubSub | **Redis** | `7.x` | **HIGH** |
| Job Queue | **BullMQ** | `^5.x` | **HIGH** |

### 3.2 Real-Time Architecture

**Pattern: Socket.IO + Redis Adapter + PostgreSQL as source of truth**

```
[Client Mini App] ←→ [Socket.IO server] ←→ [Redis pub/sub adapter]
                             ↓
                      [PostgreSQL] (leaderboard, game state)
```

**Why Socket.IO over raw WebSockets:**
- Automatic fallback to HTTP long-polling (critical for Telegram WebView on restrictive networks).
- Built-in reconnection with exponential backoff.
- Rooms/namespaces for leaderboards scoped by `chat_instance`, friends lists, or global rankings.
- Redis adapter (`@socket.io/redis-adapter`) scales horizontally across multiple Node.js processes.

**Why NOT SSE alone for games:**  
SSE is server→client only. For leaderboards that need occasional client→server actions (submit score, invite friend), SSE forces a parallel HTTP POST, adding latency and complexity. Socket.IO handles both directions in one abstraction.

**Leaderboard pattern:**
```javascript
// On score submission
await db.insert(scoreTable).values({ userId, score, gameMode });
// Invalidate cache + broadcast top-10
await redis.zadd(`leaderboard:${gameMode}`, score, userId);
const top10 = await redis.zrevrange(`leaderboard:${gameMode}`, 0, 9, 'WITHSCORES');
io.to(`leaderboard:${gameMode}`).emit('update', top10);
```

### 3.3 Social Features

| Feature | Implementation |
|---------|----------------|
| Friend referrals | `start_param` in `initData` + DB referral tree |
| Friend leaderboards | PostgreSQL `user_referrals` table + Redis sorted set |
| Invite rewards | BullMQ job to process reward payouts asynchronously |
| Share results | `shareMessage()` or `shareToStory()` (Bot API 7.8+) |

### 3.4 What NOT to use

- ❌ **GraphQL subscriptions** for real-time games — adds complexity, overhead, and poorer tooling for binary/game state sync compared to Socket.IO.
- ❌ **Firebase / Firestore** — Vendor lock-in, unpredictable costs at scale, limited querying for complex leaderboards. Not suitable for a PostgreSQL-centric team.
- ❌ **Pusher / Ably hosted** — Fine for prototypes, but at Telegram Mini App scale (potentially millions of users), self-hosted Socket.IO + Redis is cheaper and more controllable.
- ❌ **Express 4 with `body-parser` defaults** — Upgrade to Express 5 or ensure `express.json()` limits are set; default body sizes can be exploited.

---

## 4. Image Generation / Meme Generation

### 4.1 Client-Side (Browser / WebView)

| Library | Version | Use Case | Confidence |
|---------|---------|----------|------------|
| **html2canvas** | `^1.4.1` | DOM → canvas screenshot, meme templates | **HIGH** |
| **dom-to-image-more** | `^3.5.0` | Lighter alternative, SVG foreignObject | **HIGH** |
| **Fabric.js** | `^6.0.0` | Interactive meme editor, drag/resize/rotate text & images | **HIGH** |

**Recommendation:**
- For **simple meme generation** (text overlay on fixed templates): `dom-to-image-more` → lighter than html2canvas, uses SVG `foreignObject`, better font rendering.
- For **interactive meme editors** (users drag text, add stickers): `Fabric.js 6.x` + export to canvas → PNG/WebP. Fabric has a full scene graph, object selection, and serialization.
- For **screenshotting React/Preact UI** (e.g., game result cards): `html2canvas` is battle-tested but heavier; use only if you need exact CSS replication.

**Performance note:** In Telegram WebView, client-side canvas rendering can freeze the UI for >100ms on low-end Android. Offload to `requestIdleCallback` or Web Workers where possible. For high-resolution exports (1080x1920 for Stories), use a temporary off-screen canvas.

### 4.2 Server-Side (Node.js)

| Library | Version | Use Case | Confidence |
|---------|---------|----------|------------|
| **Sharp** | `^0.33.0` | Resize, composite, format conversion, text-on-image via SVG | **HIGH** |
| **Jimp** | `^1.6.0` | Pure-JS fallback, no native deps | **MEDIUM** |

**Server-side meme pipeline (Sharp + SVG):**
```javascript
const svgText = `
<svg width="1080" height="1080">
  <style>.meme { font: bold 60px sans-serif; fill: white; stroke: black; stroke-width: 2px; }</style>
  <text x="50%" y="90%" text-anchor="middle" class="meme">${escapedCaption}</text>
</svg>`;
await sharp(baseImageBuffer)
  .composite([{ input: Buffer.from(svgText), top: 0, left: 0 }])
  .webp({ quality: 85 })
  .toBuffer();
```

**Why Sharp:**
- 4–5× faster than ImageMagick/GraphicsMagick (libvips backend).
- Supports JPEG, PNG, WebP, GIF, AVIF, SVG input.
- No runtime dependencies on most platforms (prebuilt binaries).

**What NOT to use:**
- ❌ **ImageMagick / GraphicsMagick (`gm`)** — Slow, heavy dependencies, security history of buffer overflows. Only use if you need exotic operations Sharp doesn't support.
- ❌ **Server-side `node-canvas` / Cairo** — Native compilation hell, painful on Windows, larger Docker images.
- ❌ **Cloudinary/Imgix for real-time meme gen** — Latency is too high for in-game flows; fine for post-processing or CDN caching layer.

---

## 5. Animation Libraries for GIF Generation

### 5.1 The Reality Check

Generating animated GIFs in a browser is **CPU-intensive and produces large files**. In 2025, the better UX pattern for Telegram Mini Apps is:
1. **Generate MP4/WebM** from canvas via `MediaRecorder` API.
2. **Share as video** to Telegram Story (`shareToStory()` accepts media).
3. **Server-side GIF** only if the platform explicitly requires GIF (rare).

### 5.2 Client-Side Options

| Library | Version | Approach | Confidence |
|---------|---------|----------|------------|
| **MediaRecorder API** (native) | N/A | Canvas → WebM/MP4 | **HIGH** |
| **gif.js** | `^0.2.0` | Canvas frames → GIF (Web Workers) | **MEDIUM** |
| **gifshot** | `^0.4.5` | Wraps gif.js, video-to-GIF | **MEDIUM** |

**Recommendation:**
- Use **native `MediaRecorder`** to capture canvas animations as WebM, then convert server-side to GIF/MP4 with Sharp/ffmpeg if needed.
- If GIF is absolutely required client-side: `gif.js` with Web Workers enabled. Limit to short clips (<2 sec, <10 fps, <300px width) to avoid freezing low-end devices.

### 5.3 Server-Side Video/GIF Pipeline

| Tool | Version | Use Case | Confidence |
|------|---------|----------|------------|
| **FFmpeg (fluent-ffmpeg)** | `^2.1.2` | Video encoding, GIF generation | **HIGH** |
| **Sharp** | `^0.33.0` | Multi-page GIF from frames | **HIGH** |

**What NOT to use:**
- ❌ **jsgif / custom LZW encoders** — Unmaintained, single-threaded, poor color quantization.
- ❌ **CCapture.js** — Wraps gif.js with more overhead; not actively maintained.
- ❌ **Generating GIFs client-side at full resolution** — Will OOM on mid-range phones in Telegram WebView.

---

## 6. State Management for Complex Game Progression

### 6.1 Frontend (Preact) State

| Library | Version | Bundle Size | Pattern | Confidence |
|---------|---------|-------------|---------|------------|
| **Zustand** | `^5.0.0` | ~0.6 KB | Hook-based store, selectors | **HIGH** |
| **Jotai** | `^2.10.0` | ~3.5 KB | Atomic, fine-grained | **HIGH** |
| **Valtio** | `^2.1.0` | ~2.7 KB | Proxy-based mutable | **MEDIUM** |

**Recommendation for your stack: Zustand 5.x**

**Rationale:**
- Your project uses Preact (not React). Zustand is framework-agnostic enough to work cleanly with Preact, while Redux Toolkit and Recoil are React-centric.
- Zero providers needed — no "Provider Hell".
- Selector-based subscriptions prevent unnecessary re-renders of UI components.
- Persistence middleware (`zustand/middleware/persist`) can sync to `localStorage` or Telegram `CloudStorage`.
- Redux DevTools middleware available for time-travel debugging.

**Telegram-specific pattern:**
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const tgStorage = {
  getItem: (name) => new Promise((resolve) =>
    window.Telegram.WebApp.CloudStorage.getItem(name, (_, v) => resolve(v))
  ),
  setItem: (name, value) => new Promise((resolve) =>
    window.Telegram.WebApp.CloudStorage.setItem(name, value, resolve)
  ),
  removeItem: (name) => new Promise((resolve) =>
    window.Telegram.WebApp.CloudStorage.removeItem(name, resolve)
  ),
};

const useGameStore = create(persist(
  (set, get) => ({
    energy: 100,
    level: 1,
    tapCount: 0,
    decrementEnergy: () => set((s) => ({ energy: Math.max(0, s.energy - 1) })),
  }),
  { name: 'game-save', storage: createJSONStorage(() => tgStorage) }
));
```

### 6.2 Backend State / Game Logic

For server-authoritative game state (anti-cheat, competitive leaderboards), keep state in **PostgreSQL** with a **Redis** cache layer. For turn-based mini-games, a simple Express + PostgreSQL transaction model is sufficient.

**What NOT to use:**
- ❌ **Redux / Redux Toolkit** — Massive boilerplate for a mini-app; bundle size ~12.7 KB; overkill unless you have complex middleware chains.
- ❌ **Recoil** — Still marked "experimental" by Meta, bundle size ~23.5 KB, poor SSR/Preact support.
- ❌ **MobX** — Powerful but adds learning curve; proxy-based reactivity is harder to debug in Telegram WebView.
- ❌ **Context + useReducer alone** — Fine for small apps, but as soon as you have cross-screen game progression (energy, inventory, quests), prop drilling becomes painful.

---

## 7. Deployment & Infrastructure (Refined)

Your current Yandex Cloud VM + Vercel split is sensible. Recommendations:

| Component | Current | Recommendation | Confidence |
|-----------|---------|----------------|------------|
| Frontend static | Vercel | **Keep Vercel** + enable Edge caching | **HIGH** |
| Frontend framework | Preact + Vite 5 | **Upgrade Vite to 6.x**, keep Preact 10 | **HIGH** |
| Backend API | Yandex VM | **Keep VM**, add Docker Compose for local parity | **HIGH** |
| Real-time | — | Add **Redis** (Yandex Managed Redis or containerized) | **HIGH** |
| Bot | Vercel / VM | **Keep grammy**, ensure webhook health | **HIGH** |
| Database | PostgreSQL | **Keep**, ensure connection pooling (`pg-pool`) | **HIGH** |

**Vite 6 upgrade note:** Vite 6 (late 2024/2025) improves pre-bundling, better CSS handling, and maintains compatibility with `@preact/preset-vite`. Low-risk upgrade.

---

## 8. Summary Cheat Sheet

| Concern | Recommended Stack | Confidence |
|---------|-------------------|------------|
| Telegram SDK | `@telegram-apps/sdk-react` `^3.x` | HIGH |
| Bot framework | `grammy` `^1.40+` (keep) | HIGH |
| Game engine | `phaser` `^3.85.0` (upgrade from 3.60) | HIGH |
| UI framework | `preact` `^10.25+` (keep) | HIGH |
| Build tool | `vite` `^6.0.0` (upgrade from 5) | HIGH |
| Backend runtime | `node` `20.x LTS` (keep) | HIGH |
| API framework | `express` `^5.0.0` (upgrade from 4) | MEDIUM-HIGH |
| Real-time | `socket.io` `^4.8.0` + `redis` `7.x` | HIGH |
| ORM/Query builder | `kysely` `^0.27.0` (optional) | HIGH |
| Job queue | `bullmq` `^5.x` | HIGH |
| DB | `PostgreSQL` (keep) | HIGH |
| Client state | `zustand` `^5.0.0` | HIGH |
| Client meme gen | `dom-to-image-more` `^3.5.0` or `fabric` `^6.0.0` | HIGH |
| Server image processing | `sharp` `^0.33.0` | HIGH |
| Video/GIF capture | Native `MediaRecorder` → server `ffmpeg` | HIGH |
| Cache / PubSub | `redis` `7.x` | HIGH |

---

## 9. Risk Register

| Risk | Mitigation |
|------|------------|
| Telegram WebView memory limits (~100–200 MB on older Android) | Keep Phaser scenes small, unload unused atlases, use object pooling |
| iOS Safari WebView canvas size limits (16 MB pixel buffer) | Limit canvas to 4096×4096, use `pixelArt: true` to reduce VRAM |
| `initData` spoofing | Always server-validate with `@telegram-apps/init-data-node` |
| CloudStorage 5 MB limit | Compress save data (msgpack), shard across keys, fallback to backend |
| Low-end device GIF generation OOM | Move GIF gen to server, or use MP4/WebM client-side |
| Socket.IO connection drops in background | Implement reconnection jitter, persist critical state to CloudStorage |

---

*Document generated by research on 2026-05-20. Recommendations are based on publicly available documentation, npm registry state, and Telegram Bot API changelog as of Bot API 9.1 (July 2025).*
