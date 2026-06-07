# Drift: HANDOFF.md + project-status.json vs Current Repo Code

**Audit date:** 2026-05-07  
**Scope:** только факты из repo — никаких предложений изменений.

---

## 1. Latest Migration

### Drift 1.1 — HANDOFF.md перечисляет неполный набор миграций
- **HANDOFF.md строки 7–9:** "Production PostgreSQL now has: `003_referral_milestones.sql`, `004_stage4_retention.sql`"
- **Код:** в `backend/migrations/` 6 файлов: `001_init.sql`, `002_vnext_core.sql`, `003_referral_milestones.sql`, `004_stage4_retention.sql`, `005_offer_cooldowns.sql`, `006_balance_tuning.sql`.
- **Подтверждение:** `ls backend/migrations/*.sql` → 6 миграций. Утверждение обрезает `005` и `006`.

### Drift 1.2 — project-status.json release notes устарели
- **project-status.json строка 52 (в `deploy.last_release_notes`):** "Migrations `003_referral_milestones.sql` and `004_stage4_retention.sql` applied on production PostgreSQL"
- **Код:** тот же список из 6 миграций. Поле `latest_applied_migration` (строка 24) корректно говорит `006_balance_tuning.sql`, но release notes не упоминают `005` и `006`.
- **Подтверждение:** `project-status.json:24` vs `backend/migrations/`.

---

## 2. Live Balance Values

### Drift 2.1 — Offer dismiss cooldowns в HANDOFF.md не совпадают с кодом
- **HANDOFF.md строка 177:** "dismissed offers stay hidden for **4h** (per type) / **2m** (global)"
- **Код:** global cooldown = **90 с**, per-type: low_energy = **90 м**, near_rank = **2 ч**, high_stress = **3 ч**.
- **Подтверждение:** `backend/src/config/balance.js` строки 1, 6, 15, 24.

### Drift 2.2 — Три разных прайс-каталога в repo (invoice-link ≠ backend catalog)
- **HANDOFF.md строки 36–37:** "shop opens Telegram Stars invoice flow" (единый flow).
- **project-status.json строка 57:** "Premium pass purchase flow now reuses the live Telegram Stars invoice + confirm path".
- **Код — `bot/api/invoice-link.js` (строки 5–26):**
  - `depression_cure`: **50⭐**
  - `tier_boost`: **100⭐**
- **Код — `backend/src/utils/shopCatalog.js` (строки 10–25) — backend source-of-truth:**
  - `depression_cure`: **40⭐**
  - `tier_boost`: **75⭐**
- **Код — `payments/prices.json` — legacy webhook catalog:**
  - `antidepressant` (аналог depression_cure): **100⭐**
  - `premium_skin` (отсутствует в backend): **300⭐**
- **Подтверждение:** сравнение `bot/api/invoice-link.js`, `backend/src/utils/shopCatalog.js`, `payments/prices.json`.

### Drift 2.3 — Invoice-link descriptions ≠ backend catalog descriptions
- **`bot/api/invoice-link.js` строка 13:** depression_cure description = "Снижает стресс на **50%**"
- **`backend/src/utils/shopCatalog.js` строка 13:** "Снижает стресс на **60%**"
- **`bot/api/invoice-link.js` строка 18:** tier_boost description = "**+100 коммитов** к прогрессу"
- **`backend/src/utils/shopCatalog.js` строка 21:** "**+40 XP и +50 прогресса** к текущему рангу"
- **Подтверждение:** сравнение файлов выше.

### Drift 2.4 — Расхождение цен invoice/backend ломает payment confirm
- **`backend/src/routes/internalPayments.js` строки 95–98:** `if (purchase.stars_amount !== totalAmount)` → `Amount mismatch`.
- **Логика:** `POST /api/buy` создаёт purchase record из `shopCatalog.js` (40⭐ / 75⭐). Invoice-link создаёт счёт на 50⭐ / 100⭐. При callback `successful_payment` totalAmount будет 50/100, а purchase record — 40/75. Confirm провалится.
- **Подтверждение:** `backend/src/routes/buy.js:67` (берёт `item.stars` из shopCatalog) + `backend/src/routes/internalPayments.js:95-98` + `bot/api/invoice-link.js:14,19`.

---

## 3. Pass XP Source

### ✅ Нет дрифта — Pass XP берётся из tap XP curve
- **HANDOFF.md строки 229–230:** "XP now advances from the normal tap XP curve instead of raw commit delta"
- **Код:** `backend/src/routes/tap.js` строка 120: `await addPassXp(client, userId, levelAfter.xpDelta)`.
- **Цепочка:** `levelAfter.xpDelta` → `addTapXp()` в `vnext.js` → `computeTapXp()` → `round(1 * (1 + 0.1 * (levelInRank - 1)))`. Это tap XP, не commits.
- **Подтверждение:** `backend/src/routes/tap.js:120`, `backend/src/utils/vnext.js:94-97`.

---

## 4. Offer Rules

### ✅ Нет дрифта по thresholds / priorities / cooldowns (кроме 2.1)
- **HANDOFF.md строки 181–191:**
  - priority: low_energy → near_rank → high_stress
  - thresholds: ≤25%, ≥72%, ≥55
  - cooldowns: global 90s, low 90m, near 2h, high 3h
- **Код:** `backend/src/config/balance.js` строки 1–31 полностью совпадает.
- **Подтверждение:** `backend/src/config/balance.js`.

---

## 5. Smoke / Release Reality

### Drift 5.1 — Smoke tests не проверяют заявленные числа
- **project-status.json verified_flows строка 102:** "public smoke shows weekly hackathon target **650**"
- **Код `scripts/smoke-prod.ps1` строки 133–138:** вызывает `/api/event/active`, но проверяет только успешность ответа (`$event.event.type`), **не** валидирует `targetCommits == 650`.
- **Подтверждение:** `scripts/smoke-prod.ps1:133-138`.

### Drift 5.2 — Smoke offers не проверяет energy=19
- **project-status.json verified_flows строка 101:** "low_energy appears at **energy=19**"
- **Код `scripts/smoke-offers.ps1` строка 82:** скрипт останавливает тапы когда `energy -le 25`, не ассертит конкретное значение 19. Значение 19 — наблюдение из ручного теста, не автоматизировано.
- **Подтверждение:** `scripts/smoke-offers.ps1:82`.

### Drift 5.3 — Premium pass purchase flow не покрыт smoke
- **HANDOFF.md строки 103–106:** "premium pass purchase flow verified through: `/api/buy`, `bot/api/invoice-link`, `/api/internal/payments/telegram/confirm`"
- **Код `scripts/smoke-prod.ps1`:** не содержит вызовов `/api/buy`, `invoice-link`, `internal/payments/telegram/confirm`.
- **Подтверждение:** полное содержимое `scripts/smoke-prod.ps1`.

### Drift 5.4 — Team commits from rewards не покрыт smoke
- **project-status.json verified_flows строка 100:** "`team.total_commits` increases from non-tap reward commits (verified with `tier_boost` confirm)"
- **Код `scripts/smoke-prod.ps1`:** не тестирует покупку `tier_boost`, не проверяет `team.total_commits` после reward.
- **Подтверждение:** `scripts/smoke-prod.ps1` (team тесты только на create/join/leave/leaderboard).

### Drift 5.5 — Список operator scripts в project-status.json неполный
- **HANDOFF.md строки 23–29:** 7 скриптов, включая `scripts/domain-cutover-check.ps1`.
- **project-status.json `deploy.operator_scripts` (строки 41–47):** 6 скриптов, **нет** `scripts/domain-cutover-check.ps1`.
- **Подтверждение:** `project-status.json:41-47` vs `HANDOFF.md:23-29`.

### Drift 5.6 — В repo остался polling entry point, хотя topology — webhook-only
- **project-status.json строка 29:** "runtime: **Vercel webhook function**"
- **HANDOFF.md строки 61–72:** "VM polling bot is not the production path" (runtime reality = Vercel webhook).
- **Код `bot/index.js` строки 4–11:** запускает `bot.start()` — **polling mode**. Файл не удалён из repo.
- **Код `bot/api/webhook.js`:** Vercel webhook handler — это production path.
- **Подтверждение:** `bot/index.js:4-11` (polling) vs `bot/api/webhook.js` (webhook) vs `project-status.json:29`.

### Drift 5.7 — Nginx config в repo не терминирует TLS
- **HANDOFF.md строка 280:** "host nginx on VM terminates TLS for the upstream path"
- **Код `nginx/codersurvival.conf`:** `listen 80;` только. Блок `server { listen 443 ssl ... }` **закомментирован** (строки 46–54).
- **Подтверждение:** `nginx/codersurvival.conf:1-54`. TLS termination на VM использует конфиг вне repo (host-level), либо repo config устарел.

---

## 6. Other Code-Level Drift

### Drift 6.1 — Bot WebApp URL fallback указывает на старый домен
- **`bot/src/createBot.js` строка 4:** `const WEBAPP_URL = process.env.WEBAPP_URL || 'https://codersurvival.ru';`
- **HANDOFF.md / project-status.json:** production frontend = `frontend-ashy-alpha-77.vercel.app`.
- **Риск:** если `WEBAPP_URL` не задан в env на Vercel, бот отправляет пользователей на `codersurvival.ru`, а не на актуальный Vercel домен.
- **Подтверждение:** `bot/src/createBot.js:4` vs `HANDOFF.md:48` / `project-status.json:10`.

### Drift 6.2 — `payments/bot-webhook.js` — мёртвый legacy path с критичными багами
- Не упомянут ни в HANDOFF.md, ни в project-status.json как production path.
- Содержит `MOCK_MODE = ... || true` (всегда mock) и пустую `grantItemToUser`.
- Находится в `payments/`, но активный webhook handler — `bot/api/webhook.js`.
- **Подтверждение:** `payments/bot-webhook.js` не импортируется нигде в repo (grep только self-reference + docs).

---

## Summary Table

| # | Area | Claim (HANDOFF/status) | Reality (code) | Evidence File(s) |
|---|------|------------------------|----------------|------------------|
| 1.1 | Migration | PG has 003, 004 | PG has 001–006 | `backend/migrations/` |
| 1.2 | Release notes | Applied 003, 004 | Latest is 006; notes omit 005, 006 | `project-status.json:24,52` |
| 2.1 | Offer cooldowns | 4h per-type / 2m global | 90m/2h/3h per-type / 90s global | `backend/src/config/balance.js:1-31` |
| 2.2 | Shop prices | "единый invoice flow" | Invoice: 50/100⭐; Backend: 40/75⭐ | `bot/api/invoice-link.js` vs `backend/src/utils/shopCatalog.js` |
| 2.3 | Shop descriptions | — | Invoice "50%"/"+100 коммитов" ≠ Backend "60%"/"+40 XP +50 прогресса" | Те же файлы |
| 2.4 | Payment confirm | — | Amount mismatch из-за 2.2 → провал confirm для tier_boost / depression_cure | `backend/src/routes/internalPayments.js:95-98` |
| 5.1 | Smoke | "shows target 650" | Не ассертит targetCommits | `scripts/smoke-prod.ps1:133-138` |
| 5.2 | Smoke | "low_energy at energy=19" | Ждёт energy ≤ 25, не ассертит 19 | `scripts/smoke-offers.ps1:82` |
| 5.3 | Smoke | "premium pass purchase flow verified" | Smoke не трогает buy/invoice/confirm | `scripts/smoke-prod.ps1` (полный файл) |
| 5.4 | Smoke | "team.total_commits from tier_boost verified" | Smoke не покупает tier_boost | `scripts/smoke-prod.ps1` |
| 5.5 | Ops scripts | 7 scripts (HANDOFF) | 6 scripts в status.json (нет domain-cutover-check) | `project-status.json:41-47` |
| 5.6 | Bot runtime | "Vercel webhook function" | В repo остался polling (`bot/index.js`) | `bot/index.js:4-11` |
| 5.7 | Nginx TLS | "host nginx terminates TLS" | Repo nginx только listen 80, 443 закомментирован | `nginx/codersurvival.conf` |
| 6.1 | Bot URL | production frontend = vercel | Fallback `codersurvival.ru` если env не задан | `bot/src/createBot.js:4` |
| 6.2 | Legacy code | — | `payments/bot-webhook.js` мёртв, всегда mock | `payments/bot-webhook.js:17` |

---
## 7. Resolved Since Audit

| # | Area | Resolution | Date |
|---|------|------------|------|
| 1.1/1.2 | Migration docs | HANDOFF.md and project-status.json now list 001–007 correctly | 2026-05-07 |
| 2.1 | Offer cooldowns | HANDOFF.md Stage 3 status updated to 90m/2h/3h per-type and 90s global | 2026-05-07 |
| 2.2/2.3/2.4 | Invoice-link drift | Bot invoice-link now resolves invoice context from backend internal route; amount comes from stored purchase record instead of a second bot-side price map | 2026-05-07 |
| 5.5 | Ops scripts | project-status.json now includes domain-cutover-check.ps1 | 2026-05-07 |

Remaining open drifts:
- **5.1 / 5.2 / 5.3 / 5.4** — Smoke coverage gaps remain by design (smoke tests verify endpoint availability + key economy values; full purchase-flow and tier-boost reward smoke is manual).
- **5.6 / 5.7 / 6.1 / 6.2** — Legacy files and config divergence remain documented as expected.

## 8. Observation Docs Expansion (Not a Drift — Enhancement)

**Status:** Added on 2026-05-07 as support-layer docs only. No code changes.

**What was added:**
- `observation/README.md` now explicitly documents the two-path model:
  - Operator path: `scripts/observe-economy.ps1` → `GET /api/internal/observation/economy`
  - Deep-dive path: `observation/01..07_*.sql`
  - Parity mapping between API `sqlSlices` and manual SQL files
- `observation/OPERATOR_CHEATSHEET.md` provides thresholds and quick-reference checks.
- `HANDOFF.md`, `project-status.json`, `DEPLOY.md` updated to reference the two-path model.

**Why this matters:** prevents operators from treating the SQL pack as obsolete or the API as the only source of truth. Both paths are intentionally kept in parity.

*Файл создан отдельно. Код не изменялся.*
