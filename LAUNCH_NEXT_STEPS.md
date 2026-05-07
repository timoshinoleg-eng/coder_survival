# Coder Survival Launch Next Steps

## Situation summary

- MVP is already working in a real Telegram client.
- Current live frontend:
  - `https://frontend-ashy-alpha-77.vercel.app`
- Current public API:
  - `https://frontend-ashy-alpha-77.vercel.app/api`
- Current VM upstream backend:
  - `https://111-88-247-195.sslip.io`
- Current live bot webhook:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- User flow already verified:
  - `/start`
  - open Mini App
  - tap loop
  - leaderboard

The remaining problem is no longer "launch the game". The remaining problem is "clean up the temporary public URLs and residual infra debt".

## What is still temporary

- backend upstream still uses a temporary `sslip.io` hostname
- VM still cannot reliably reach `api.telegram.org`
- the bot is stable now, but it lives outside the VM because of that defect

## Immediate priority

1. Verify the webhook cutover with a fresh `/start` test.
2. Replace temporary public URLs with a permanent primary domain.
3. Rotate secrets and close remaining production hygiene items.

## Operator-owned tasks

### 1. Verify webhook production path

Definition of done:
- `/start` works without any local machine process
- `getWebhookInfo` points to the Vercel endpoint
- bot survives independently from the operator machine

### 2. Re-run Telegram smoke under the permanent bot runtime

Must pass:
- `/start`
- Mini App open
- state load
- tap loop
- leaderboard

### 3. Replace temporary public URLs

When DNS access is available:
- replace `sslip.io` backend URL with the final primary domain
- update frontend config if API base changes
- verify BotFather menu button points to the intended frontend URL

### 4. Secrets hygiene

Before broader rollout:
- rotate `BOT_TOKEN` if it was exposed during ops work
- rotate PostgreSQL password if it was shared outside the normal operator boundary

## Practical launch gate

Treat the system as stable production only when all of these are true:

- bot runtime is no longer local
- frontend URL is stable
- public API URL is stable
- `/start` works after bot runtime restart
- Telegram Mini App flow works end-to-end from a clean client
- secrets are rotated or explicitly confirmed safe

## Related docs

- [README.md](README.md)
- [DEPLOY.md](DEPLOY.md)
- [HANDOFF.md](HANDOFF.md)
- [BOT_RUNTIME_PLAN.md](BOT_RUNTIME_PLAN.md)
