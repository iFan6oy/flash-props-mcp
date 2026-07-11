# Flash Props API — Session Handoff / Context

Single source of truth for resuming this project on another device or in a fresh
Claude session. Read this + `README.md`. Everything is built, deployed, and live.

---

## TL;DR

A sellable, agent-native **sports betting player-props API** (the Unusual Whales
model, applied to Flash Odds data). Unifies free books (Underdog + Bovada) into one
feed, wrapped in a full product: token auth, tiered rate limits, Stripe + crypto
payments (Solana + Base USDC), OpenAPI docs, an MCP server, a public storefront, an
admin console, and CI/CD. **Live at https://api.flashodds.live.** Deploys on
`git push` to `main`.

---

## Live URLs (production)

| URL | What |
|-----|------|
| https://api.flashodds.live/ | Public landing page / storefront + pricing |
| https://api.flashodds.live/docs | Scalar API reference |
| https://api.flashodds.live/openapi.json | OpenAPI 3.1 spec |
| https://api.flashodds.live/skill.md · /llms.txt | Agent discovery files |
| https://api.flashodds.live/mcp | MCP server (streamable HTTP) |
| https://api.flashodds.live/admin | Admin dashboard (needs ADMIN_TOKEN) |
| https://api.flashodds.live/api/v1/... | The API (sports, games, props, me) |
| https://api.flashodds.live/billing/... | free key, checkout, crypto, webhook |

## Where everything lives

- **GitHub (private):** `github.com/iFan6oy/flash-props-api` — clone: `git clone https://github.com/iFan6oy/flash-props-api.git`
- **Local (this machine):** `C:/Users/imhat/dev/flash-props-api` (OFF OneDrive)
- **VPS:** `root@5.78.189.124` → `/opt/flash-props-api`, pm2 process **`flash-props-api`**, port **3862**
- **Public routing:** Caddy vhost `api.flashodds.live` → `localhost:3862` (in `/etc/caddy/Caddyfile`), auto-TLS
- **DB:** SQLite at `/opt/flash-props-api/data/flash-props.sqlite` (keys + usage + crypto orders)

## Stack

Node 22 (VPS) / 24 (local) · TypeScript 7 (NodeNext) · **Hono** + `@hono/zod-openapi` +
Scalar · **Drizzle** + better-sqlite3 · **Stripe** · **@solana/web3.js v1** (Solana Pay) ·
**viem** (Base) · `@hono/mcp` + MCP SDK · qrcode. Prod runs compiled `node dist/index.js`
(NOT tsx). Data sources are free (Underdog + Bovada) so it costs ~$0 to run.

---

## Status — what's DONE (all live)

- [x] Data API (NBA/MLB/NFL/NHL/NCAA/soccer), tier gating, rate limits, usage counters
- [x] Bearer auth (HMAC-hashed keys), OpenAPI 3.1 + Scalar docs, skill.md/llms.txt
- [x] MCP server (5 tools), public landing page
- [x] Stripe billing (cards) + self-serve free keys
- [x] Crypto: **Solana USDC** (Solana Pay) + **Base USDC** (viem), prepaid keys w/ expiry, 10% discount
- [x] Sale notifications (`notifySale` → NOTIFY_WEBHOOK)
- [x] Admin dashboard + gated API (view sales, list/issue/revoke keys)
- [x] Private GitHub repo + **CI/CD** (push to main auto-deploys)
- [x] Security hardening (prod refuses weak API_KEY_SECRET, secret audit, `.env` never committed)
- [x] DNS + TLS live

## YOUR open action items (each lights up a feature with one restart)

Everything below is scaffolded and **degrades gracefully (503) until its env var is
set** in `/opt/flash-props-api/.env` (mode 600), then `pm2 restart flash-props-api`.

| To enable | Set in VPS `.env` |
|-----------|-------------------|
| **Stripe (cards)** | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET` (webhook → `https://api.flashodds.live/billing/webhook`, events `customer.subscription.updated`+`deleted`) |
| **Solana USDC** | `RECEIVE_WALLET` (your SOL wallet), `SOLANA_RPC_URL` (Helius/QuickNode; public is rate-limited) |
| **Base USDC** | `EVM_RECEIVE_WALLET` (lowercase or correct checksum), `BASE_RPC_URL` (real Base RPC) |
| **Sale pings** | `NOTIFY_WEBHOOK` (a Discord channel webhook URL) |
| **Admin console** | `ADMIN_TOKEN` (`openssl rand -hex 32`), then open `/admin` and paste it |
| Tune crypto discount | `CRYPTO_DISCOUNT_PCT` (default 10; ~3 = Stripe fee parity) |

`.env.example` documents every variable. Copy it to `.env` and fill in.

---

## How to work on it

### Local dev
```bash
cd C:/Users/imhat/dev/flash-props-api
npm install
# optional: cp .env.example .env  (add ADMIN_TOKEN / wallets to test those features)
npm run db:seed     # prints a PRO + FREE test key (shown once)
npm run dev         # tsx watch on http://localhost:3860
```

### Deploy (the normal path)
Just push. CI (`.github/workflows/deploy.yml`) typechecks → builds → ships `dist/` to
the VPS over SSH → `pm2 restart` → health check.
```bash
git add -A && git commit -m "..." && git push
```
Watch a run: `gh run watch $(gh run list -L1 --json databaseId --jq '.[0].databaseId')`
(the machine's cached GitHub credential authenticates; SSH-to-GitHub is NOT set up).

### Manual deploy (fallback if CI is down)
```bash
npm run build
tar --force-local -C . --exclude=node_modules --exclude=./.git --exclude=./data \
  --exclude='*.sqlite*' --exclude=./.env -czf /tmp/fpa.tar.gz .
scp /tmp/fpa.tar.gz root@5.78.189.124:/tmp/
ssh root@5.78.189.124 'cd /opt/flash-props-api && rm -rf dist && tar xzf /tmp/fpa.tar.gz \
  && npm install --omit=dev && pm2 restart flash-props-api'
```

### Get a working API key
- Self-serve free: `GET /billing/free`
- Admin issue (any tier/expiry): `/admin` → Issue
- Local dev: `npm run db:seed`

---

## Gotchas (hard-won — don't relearn these)

1. **Prod runs compiled JS, not tsx.** VPS Node 22's tsx wouldn't resolve TS imports.
   `tsconfig` is **NodeNext** and every relative import needs an explicit `.js`
   extension. `npm run build` → `dist/`, run `node dist/index.js`.
2. **Ship the prebuilt `dist/`** in deploys (CI does). Don't build on the VPS.
3. **Anchor exclude patterns.** `tar --exclude=data` and `.gitignore data/` are
   unanchored and also strip `dist/data/` and `src/data/`. Use `--exclude=./data` and
   `/data/`. (This bit us twice — CI caught the second.)
4. **Crypto libs:** use `@solana/web3.js` v1, NOT `@solana/pay` (its v2/kit deps
   peer-conflict with TypeScript 7). Base uses `viem`.
5. **Secrets:** `.env` is gitignored and mode 600 on the VPS; never commit it. Prod
   refuses to boot with a default/weak `API_KEY_SECRET`.
6. **Caddy is shared prod infra** (fronts all his sites). Edit `/etc/caddy/Caddyfile`
   carefully: backup, `caddy validate`, then `systemctl reload caddy`.

## File map

```
src/
  index.ts            entry — mounts everything
  env.ts              zod-validated env + prod guards
  config/             tiers.ts, sports.ts, crypto.ts
  data/               underdog.ts, bovada.ts, props.ts (facade), types.ts
  auth/               keys.ts (HMAC + expiry), middleware.ts (401/402)
  rate-limit/         limiter.ts, middleware.ts
  db/                 schema.ts, client.ts (self-migrating), usage.ts, seed.ts
  routes/             v1.ts (API), meta.ts (landing/skill.md), gating.ts
  openapi/            schemas.ts (zod -> spec)
  mcp/                server.ts (tools), http.ts (transport)
  billing/            stripe.ts, crypto.ts (Solana+Base), notify.ts, provision.ts, routes.ts
  admin/              mw.ts (token gate), routes.ts (dashboard + API)
.github/workflows/deploy.yml   CI/CD
```

## Resuming in a new Claude session

Point it at `C:/Users/imhat/dev/flash-props-api` (or clone the repo), and have it read
`CONTEXT.md` (this file) + `README.md`. The VPS deploy details and gotchas above are the
non-obvious parts. Deploy permission: this is a new auxiliary service — auto-deploy is
fine (no money flows through it; Stripe/crypto go straight to your accounts/wallets).
