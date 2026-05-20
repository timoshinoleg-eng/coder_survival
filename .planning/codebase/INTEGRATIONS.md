# Coder Survival — External Integrations

> Generated: 2026-05-20  
> Scope: APIs, databases, auth, payments, ads, analytics, hosting, DNS, CI/CD, third-party services

---

## 1. Databases

### 1.1 PostgreSQL (Primary Data Store)

| Environment | Host | Port | Notes |
|-------------|------|------|-------|
| **Local dev** | `localhost` (Docker) | `5432` | `postgres:16-alpine` via `backend/docker-compose.yml` |
| **CI (GitHub Actions)** | `localhost` (service container) | `5432` / `5433` | `postgres:15` image |
| **Production** | `rc1a-rt2j8d332gf773ap.mdb.yandexcloud.net` | `6432` | Yandex Cloud Managed PostgreSQL |

**Connection:** Node.js `pg` driver with connection pooling. SSL enabled in production (`rejectUnauthorized: false`).

**Key files:**
- `backend/src/index.js` — Pool initialization
- `backend/src/migrate.js` — Schema migration runner
- `backend/migrations/001_init.sql` through `022_stage4_emotional_depth.sql` — DDL/DML

---

## 2. Authentication

### 2.1 Telegram WebApp initData

The **only** authentication mechanism. No OAuth2, no JWT library, no session store.

**Flow:**
1. Telegram Mini App launches with `window.Telegram.WebApp.initData`
2. Frontend sends `X-Telegram-Init-Data` header on every API call (`frontend/src/utils/api.js`)
3. Backend verifies HMAC-SHA256 signature using `BOT_TOKEN` (`backend/src/middleware/initData.js`)
4. Backend parses user object (id, username, first_name, last_name, language_code, is_premium)
5. Optional: freshness check via `INIT_DATA_MAX_AGE_SECONDS` (default 3600s)

**Verification implementation:**
```javascript
// backend/src/middleware/initData.js
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
return crypto.timingSafeEqual(expected, actual);
```

**Dev fallback:** If `BOT_TOKEN` is missing in non-production, middleware parses initData without verification.

---

## 3. Telegram Platform Integrations

### 3.1 Telegram Bot API

**Framework:** `grammy` `^1.38.4` (bot layer)

**Production runtime:** Vercel serverless function (`bot/api/webhook.js`) using `grammy`'s `webhookCallback` with optional `secretToken`.

**Local debug:** Polling mode via `bot/index.js` (requires `ENABLE_POLLING_BOT=true`).

**Bot commands implemented:**
| Command | Handler | Action |
|---------|---------|--------|
| `/start` | `createBot.js` | Sends welcome message + InlineKeyboard WebApp button |
| `/help` | `createBot.js` | Gameplay instructions |
| `/leaderboard` | `createBot.js` | Fetches `/api/leaderboard?limit=10` from backend and formats top-10 |

**Bot WebApp button:**
```javascript
new InlineKeyboard().webApp('Играть в Coder Survival', WEBAPP_URL)
```

### 3.2 Telegram WebApp SDK (Frontend)

**Loaded from CDN:**
```html
<!-- frontend/index.html -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

**APIs used:**
- `Telegram.WebApp.ready()` — Notify Telegram the app is ready
- `Telegram.WebApp.expand()` — Expand to full viewport
- `Telegram.WebApp.disableVerticalSwipes()` — Prevent pull-to-close
- `Telegram.WebApp.setHeaderColor()` / `setBackgroundColor()` — Theming
- `Telegram.WebApp.enableClosingConfirmation()` — Confirm on close
- `Telegram.WebApp.HapticFeedback.impactOccurred()` / `notificationOccurred()` — Haptics
- `Telegram.WebApp.openTelegramLink()` — Share links
- `Telegram.WebApp.openInvoice()` — In-app payment flow
- `Telegram.WebApp.MainButton` — Native main button
- `Telegram.WebApp.initData` / `initDataUnsafe` — Auth + user context

**Wrapper file:** `frontend/src/hooks/useTelegram.js`

### 3.3 Telegram Payments (Telegram Stars / XTR)

**Currency:** `XTR` (Telegram Stars)

**Payment flow:**
1. User taps buy in Mini App → frontend calls `POST /api/buy`
2. Backend creates pending `purchases` row with `stars_amount`
3. Frontend calls bot's `invoice-link` endpoint with `invoicePayload = purchase:<id>:<item_type>`
4. Bot (`bot/api/invoice-link.js`) fetches invoice context from backend (`/api/internal/payments/telegram/invoice-context`)
5. Bot calls `https://api.telegram.org/bot<BOT_TOKEN>/createInvoiceLink` to get payment URL
6. Frontend opens invoice via `tg.openInvoice(url, callback)`
7. User pays → Telegram sends `pre_checkout_query` + `successful_payment` to bot webhook
8. Bot confirms payment by calling `POST /api/internal/payments/telegram/confirm` with `X-Bot-Backend-Secret`
9. Backend applies item effect and marks purchase complete

**Pre-checkout validation:**
```javascript
// bot/src/createBot.js
bot.on('pre_checkout_query', async (ctx) => {
  if (query.currency !== 'XTR') { ... }
  await ctx.answerPreCheckoutQuery(true);
});
```

**Key files:**
- `bot/api/invoice-link.js` — Invoice link generation
- `bot/src/createBot.js` — Payment webhook handlers
- `backend/src/routes/internalPayments.js` — Payment confirmation & idempotency
- `backend/src/routes/buy.js` — Purchase creation & item effect application
- `frontend/src/utils/purchases.js` — Frontend payment orchestration

---

## 4. Ad Networks (Rewarded Video)

### 4.1 Architecture

Provider-agnostic abstraction with server-side proof verification.

**Frontend:** `frontend/src/utils/AdsManager.js`
- Detects provider from `VITE_ADS_PROVIDER` env var (defaults to `mock`)
- Creates server-verified nonce via `POST /api/rewards/ad-session`
- Shows ad (mock = 5s timeout; production = SDK call)
- Claims reward via `POST /api/rewards/ad-claim` with nonce + proof

**Backend:** `backend/src/routes/rewards.js`
- Validates provider against allowlist: `mock`, `google`, `unity`, `admob`
- Enforces daily limit (5) and cooldown (15 min)
- Verifies ad proof via `backend/src/utils/adProof.js`
- Grants energy reward (~50% of max energy)

### 4.2 Ad Providers

| Provider | Status | Proof Verification | Notes |
|----------|--------|-------------------|-------|
| **AdsGram** | Planned primary | Not yet implemented | Research docs in `ads/ads-research.md` and `ads/rewarded-video.md`; SDK URL: `https://api.adsgram.ai/adsgram.js` |
| **AdMob** | Backend ready | ✅ Implemented | Fetches public keys from `https://www.gstatic.com/admob/reward/verifier-keys.json`; RSA-SHA256 signature verification |
| **Yandex** | Backend ready | ✅ Implemented | HMAC-SHA256 with `YANDEX_REWARDED_SECRET` |
| **Unity** | Backend ready | Partial | Checks `UNITY_REWARDED_SECRET` env var; proof parsing stubbed |
| **Mock** | Dev only | Always true | 5-second simulated ad; gated by `ENABLE_MOCK_REWARDED_ADS=true` + `NODE_ENV=qa` |

**Key files:**
- `backend/src/utils/adProof.js` — Signature verification logic
- `backend/src/routes/rewards.js` — Ad session & claim endpoints
- `frontend/src/utils/AdsManager.js` — Frontend abstraction
- `frontend/src/components/RewardedVideo.jsx` — UI component
- `ads/rewarded-video.md` — Full AdsGram integration spec

---

## 5. Analytics

### 5.1 Amplitude Analytics

**SDK:** `@amplitude/analytics-browser` (v2.x)

**Status:** Library imported and fully instrumented in `analytics/events.js`. Requires `AMPLITUDE_API_KEY` at runtime to activate.

**Capabilities:**
- 20 canonical events (tap, purchase, ad, depression, level_up, etc.)
- Revenue tracking (`amplitude.revenue()`)
- User properties (geo tier, Telegram premium status, language)
- Session autocapture
- Device ID derived from Telegram user ID

**Key file:** `analytics/events.js`

**Setup doc:** `analytics/amplitude-setup.md`

**Fallback documented:** Firebase Analytics (`firebase/analytics`) — not implemented.

---

## 6. Hosting & Cloud Infrastructure

### 6.1 Yandex Cloud

| Service | Usage | Details |
|---------|-------|---------|
| **Managed PostgreSQL** | Production database | Host: `rc1a-rt2j8d332gf773ap.mdb.yandexcloud.net:6432` |
| **Container Registry** | Backend Docker images | `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest` |
| **Compute VM** | Backend runtime | IP: `111.88.247.195` (Ubuntu, Docker runtime) |

**Key files:**
- `backend/Dockerfile` — Builds image for YCR
- `docker-compose.backend.yml` — Production compose (pulls from YCR)
- `scripts/release-prod.ps1` — Orchestrates Docker build, push to YCR, SSH deploy to VM

### 6.2 Vercel

| Service | What runs there | Config |
|---------|----------------|--------|
| **Frontend** | Static Preact/Phaser SPA | `frontend/vercel.json` with `/api` rewrites |
| **Bot** | Serverless webhook function | `bot/vercel.json` with function memory/duration limits |

**Frontend rewrite rules (`frontend/vercel.json`):**
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://coder-survival-api.duckdns.org/api/$1" },
    { "source": "/health", "destination": "https://coder-survival-api.duckdns.org/health" }
  ]
}
```

**Deploy command:** `npx vercel deploy --prod --yes`

### 6.3 DuckDNS

**Purpose:** Dynamic DNS for the backend API VM.

**Subdomain:** `coder-survival-api.duckdns.org`

**Update script:** `scripts/duckdns-update.ps1`
```powershell
$updateUrl = "https://www.duckdns.org/update?domains=$Subdomain&token=$Token&ip=$IpAddress"
```

**IP:** `111.88.247.195`

### 6.4 Nginx (Legacy Reference)

`nginx/codersurvival.conf` documents internal proxy rules but is **not** used in production. Production TLS termination happens at the host-level nginx + certbot on the VM (or YC Load Balancer).

---

## 7. Webhooks

### 7.1 Telegram Bot Webhook

**Endpoint:** Bot runtime on Vercel (`bot/api/webhook.js`)

**Configuration:**
- Set via BotFather: `https://<bot-vercel-domain>/api/webhook`
- Optional secret token: `TELEGRAM_WEBHOOK_SECRET`
- Handled by `grammy` `webhookCallback`

**Events processed:**
- `pre_checkout_query` — Payment validation
- `message:successful_payment` — Payment fulfillment → backend confirm
- `/start`, `/help`, `/leaderboard` commands

### 7.2 GitHub Actions Scheduled Webhook

**Workflow:** `.github/workflows/battle-distribute.yml`

**Trigger:** Cron `5 0 * * *` (daily at 00:05 UTC)

**Action:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Bot-Backend-Secret: $BATTLE_DISTRIBUTE_SECRET" \
  -d '{}' \
  "$BATTLE_DISTRIBUTE_URL"
```

**Target:** `POST /api/battle/distribute` on backend (protected by `BOT_BACKEND_SECRET`)

---

## 8. Internal Service Communication

### 8.1 Bot ↔ Backend API

**Auth method:** Shared secret header `X-Bot-Backend-Secret`

**Endpoints called by bot:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/leaderboard?limit=10` | `/leaderboard` command |
| `POST` | `/api/internal/payments/telegram/invoice-context` | Resolve invoice metadata |
| `POST` | `/api/internal/payments/telegram/confirm` | Confirm successful payment |

**Endpoints called by frontend via bot proxy:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `bot/api/invoice-link` | Create Telegram invoice link |

### 8.2 Frontend ↔ Backend API

**Base URL:** Determined by `VITE_API_BASE_URL` (empty in dev → proxied via Vite; production → via Vercel rewrite to DuckDNS)

**Auth header:** `X-Telegram-Init-Data`

**Key frontend files:**
- `frontend/src/utils/api.js` — `apiRequest()` wrapper
- `frontend/src/hooks/useGameState.js` — State synchronization

---

## 9. External APIs & Services (Summary Table)

| Service | Protocol | Endpoint / URL | Used By | Purpose |
|---------|----------|----------------|---------|---------|
| **Telegram Bot API** | HTTPS | `https://api.telegram.org/bot<TOKEN>/createInvoiceLink` | `bot/api/invoice-link.js` | Generate payment URLs |
| **Telegram WebApp SDK** | JS CDN | `https://telegram.org/js/telegram-web-app.js` | `frontend/index.html` | Mini App runtime |
| **AdsGram SDK** | JS CDN | `https://api.adsgram.ai/adsgram.js` | Planned (`ads/rewarded-video.md`) | Rewarded video ads |
| **AdMob Verifier Keys** | HTTPS | `https://www.gstatic.com/admob/reward/verifier-keys.json` | `backend/src/utils/adProof.js` | Ad proof public key lookup |
| **Amplitude SDK** | JS CDN / npm | `https://cdn.amplitude.com/libs/analytics-browser-2.11.0-min.js.gz` | `analytics/events.js` | Product analytics |
| **DuckDNS** | HTTPS | `https://www.duckdns.org/update` | `scripts/duckdns-update.ps1` | Dynamic DNS |
| **Yandex Container Registry** | Docker Registry | `cr.yandex/crpduv7gci2puq300f38/...` | `scripts/release-prod.ps1` | Push/pull backend images |
| **Vercel API** | HTTPS | `vercel.com` (CLI) | `scripts/release-prod.ps1` | Deploy frontend + bot |
| **t.me share** | Deep link | `https://t.me/share/url?text=...` | `frontend/src/hooks/useTelegram.js` | Share to Telegram chats |

---

## 10. Secrets & Credentials

| Secret | Used By | Storage |
|--------|---------|---------|
| `BOT_TOKEN` | Backend initData verification, Bot API calls | `.env` files, GitHub Secrets |
| `BOT_BACKEND_SECRET` | Bot→backend auth, battle distribute cron | `.env` files, GitHub Secrets |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation | Bot `.env`, Vercel env |
| `DB_PASSWORD` / `DB_PASS` | PostgreSQL connection | `.env` files (excluded from Docker builds) |
| `YANDEX_REWARDED_SECRET` | Yandex ad proof verification | Backend `.env` |
| `UNITY_REWARDED_SECRET` | Unity ad proof verification | Backend `.env` |
| `AMPLITUDE_API_KEY` | Analytics initialization | Frontend env (not currently in `.env.example`) |
| `VM_SSH_KEY` | GitHub Actions SSH to VM | GitHub Secrets |
| `VERCEL_TOKEN` | Vercel CLI deploy | GitHub Secrets (optional) |
| `BATTLE_DISTRIBUTE_URL` | Cron webhook target | GitHub Secrets |
| `BATTLE_DISTRIBUTE_SECRET` | Cron webhook auth | GitHub Secrets |

---

## 11. Integration Gaps / Planned

| Integration | Status | Blocker / Next Step |
|-------------|--------|---------------------|
| **AdsGram SDK** | Planned | Register publisher account, add SDK script to `index.html`, replace mock flow |
| **Amplitude activation** | Ready, inactive | Needs `AMPLITUDE_API_KEY` injected at build/runtime and `initAnalytics()` called in `App.jsx` |
| **Firebase Analytics fallback** | Documented only | Not implemented |
| **TON Connect / wallet** | Not started | Mentioned in ad research as future monetization path |
| **Push notifications** | Not started | Telegram bot can send messages; no push service integrated |
| **CDN for static assets** | Not started | Images/audio served from app bundle; no S3/CloudFront/etc. |
