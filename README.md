# Flash Props API

Sellable, agent-native sports-betting **player-props** data API by Flash AI Solutions.
Unifies free books (Underdog Fantasy + Bovada) into one clean feed — pre-game and
live in-game props for NBA, MLB, NFL, NHL, NCAA and soccer. American odds.

Modeled on what Unusual Whales did: a real product with token auth, tiered rate
limits, Stripe billing, an OpenAPI spec, a public storefront, and an MCP server so
AI agents can consume it directly.

## Stack

- **Hono** + `@hono/zod-openapi` — routes and auto-generated OpenAPI 3.1 spec
- **Scalar** — interactive API reference at `/docs`
- **Drizzle + better-sqlite3** — API keys (HMAC-hashed) + usage counters
- **Stripe** — Checkout + webhook subscription lifecycle
- **@hono/mcp + @modelcontextprotocol/sdk** — Streamable-HTTP MCP server at `/mcp`
- Data: free upstreams only (Underdog + Bovada), so it costs $0 to run.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Public landing page (storefront + pricing) |
| GET | `/docs` | Scalar API reference |
| GET | `/openapi.json` | OpenAPI 3.1 spec |
| GET | `/skill.md`, `/llms.txt` | Agent-discovery files |
| GET | `/health` | Liveness |
| GET | `/api/v1/sports` | Sports + tier access |
| GET | `/api/v1/games?sport=` | Today's games |
| GET | `/api/v1/games/{eventId}/props?stats=` | Props for one game |
| GET | `/api/v1/props?sport=&stat=&limit=` | Market-wide scan ("flow" feed) |
| GET | `/api/v1/me` | Key, tier, usage |
| ALL | `/mcp` | MCP server (tools: list_sports, list_games, get_game_props, scan_props, find_game) |
| GET | `/billing/free` | Self-serve free key |
| GET | `/billing/checkout?tier=starter\|pro` | Stripe Checkout |
| GET | `/billing/success` | Provision + show key after payment |
| POST | `/billing/webhook` | Stripe subscription lifecycle |

Auth: `Authorization: Bearer <key>` (also `X-API-Key:` or `?api_key=`).

## Tiers

`src/config/tiers.ts` — Free (NBA, delayed, 250/day) · Starter ($29, NBA+MLB realtime,
10k/day) · Pro ($99, all sports + live, 100k/day) · Enterprise (custom). Free tier gets
pre-game only and data flagged `delayed`; paid unlocks realtime + live in-game lines.

## Run locally

```bash
npm install
npm run db:seed        # prints a PRO + FREE test key (shown once)
npm run dev            # tsx watch on :3860
```

Then: `curl -H "Authorization: Bearer <key>" "http://localhost:3860/api/v1/props?sport=mlb&limit=10"`

## Build & deploy (VPS)

Production runs the **compiled** output (`node dist/index.js`) — not tsx — to stay
independent of Node/tsx versions. Deploy = build locally, ship the artifact:

```bash
npm run build          # tsc -> dist/ (NodeNext, .js extensions required)
# tar excluding node_modules/.git/data/.env (anchor data exclude: --exclude=./data
# so dist/data is NOT stripped), scp to /opt/flash-props-api, extract
ssh root@5.78.189.124 'cd /opt/flash-props-api && npm install --omit=dev && pm2 restart flash-props-api'
```

- pm2 process: `flash-props-api` on port **3862** (`pm2 start dist/index.js`)
- Fronted by Caddy: `api.flashodds.live { reverse_proxy localhost:3862 }`
- Env in `/opt/flash-props-api/.env` (mode 600): PORT, PUBLIC_BASE_URL, API_KEY_SECRET, DATABASE_URL, Stripe keys.

**To enable billing**: set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`,
`STRIPE_WEBHOOK_SECRET` in `.env` and restart. Until then, checkout returns a friendly 503.

## Layout

```
src/
  index.ts          entry: mounts everything, serves openapi + docs
  env.ts            zod-validated env
  config/           tiers.ts, sports.ts
  data/             underdog.ts, bovada.ts, props.ts (facade), types.ts
  auth/             keys.ts (HMAC), middleware.ts
  rate-limit/       limiter.ts (per-minute), middleware.ts (+ per-day quota)
  db/               schema.ts, client.ts (self-bootstrapping), usage.ts, seed.ts
  routes/           v1.ts (API), meta.ts (landing + skill.md), gating.ts
  openapi/          schemas.ts (zod -> spec)
  mcp/              server.ts (tools), http.ts (streamable transport)
  billing/          stripe.ts, provision.ts, routes.ts
```
