# Flash Props API + MCP

**Flash Props API is a player-props API and MCP server by [Flash AI Solutions](https://www.flashaisolutions.org) for posted lines, Flash projections, evidence, context, and line movement across sports and esports.**

This repository is the **public connector and metadata surface** for the hosted Flash Props API and MCP service. There is no proprietary Flash Props backend server to install from this repository. Point your client at the hosted endpoint and authenticate with a Flash Props API key for board data.

<a href="https://glama.ai/mcp/servers/iFan6oy/flash-props-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/iFan6oy/flash-props-mcp/badge" alt="Flash Props API MCP server" />
</a>

## Canonical Flash Props links

- Website: https://api.flashodds.live/
- Documentation: https://api.flashodds.live/docs
- OpenAPI: https://api.flashodds.live/openapi.json
- Public contract: https://api.flashodds.live/contract.json
- MCP endpoint: https://api.flashodds.live/mcp
- Free API key: https://api.flashodds.live/billing/free
- Publisher: https://www.flashaisolutions.org

## Connect

Streamable HTTP endpoint:

```
https://api.flashodds.live/mcp
```

Send your API key in the Authorization header:

```
Authorization: Bearer <your_api_key>
```

Anonymous access works for **capability discovery** (`list_sports`, `get_market_metadata`) so a client can inspect current coverage on first run. Retrieving board data requires at least a free key. Get one at **https://api.flashodds.live/billing/free**.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flash-props": {
      "type": "streamable-http",
      "url": "https://api.flashodds.live/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## Tools

The access ladder below is generated from the hosted contract. Do not edit it by hand.

<!-- contract:tools:start -->
| Tool | Access |
| --- | --- |
| `list_sports` | Anonymous capability discovery |
| `get_market_metadata` | Anonymous capability discovery |
| `list_games` | Free+ |
| `get_game_props` | Free+ |
| `scan_props` | Free+; rows capped per tier (Free 25 rows, Builder 100, Pro 500, Enterprise 5,000) |
| `find_game` | Free+ |
| `find_player_props` | Free+ |
| `get_player_context` | Free/Builder basic; Pro full |
| `get_prop_evidence` | Free teaser; Builder basic; Pro full |
| `get_prop_history` | Builder limited (latest 25 points); Pro full |
| `scan_movers` | Builder limited (top 25 movers); Pro full |
| `get_leaders` | Free top 3; Builder top 10; Pro top 100 |
<!-- contract:tools:end -->

What each tool returns:

- `list_sports`: every sport with live status, data freshness, and projection/context capability
- `get_market_metadata`: market labels, families, scope, and whether a market is modeled
- `list_games`: games with props for a sport
- `get_game_props`: all player props for one game
- `scan_props`: market-wide prop scan across the slate
- `find_game`: resolve team names to an event id
- `find_player_props`: every active prop for one player
- `get_player_context`: season baselines, recent form, and deeper context
- `get_prop_evidence`: book line, Flash line, gap, form, confidence, splits, movement
- `get_prop_history`: chronological line and odds history for a prop
- `scan_movers`: biggest line movers in a window
- `get_leaders`: ranked boards for gap, form, and sample strength

REST and MCP share the same entitlement shaping, so a key sees the same product tier regardless of transport.

## Provider-driven coverage

Do not hard-code a list of sports with Flash projections. Coverage is resolved from the server's registered model providers and can vary by **sport + market**.

Use `list_sports` (or `GET /api/v1/sports`) to inspect `projectionCapability`, `effectiveProjection`, and `contextCapability`, then use `get_market_metadata` to determine whether a specific market is modeled. A partially modeled sport can legitimately expose Flash projections for one stat while keeping another stat posted-lines-only.

Missing analysis is reported explicitly. Flash Props does not fabricate a projection to fill an unsupported market.

### Reading projections and board snapshots

- **Check `basis` on every projection.** `current_season` is built from this season. `prior_season` is a prior-season baseline and must never be presented as current form; `basisNote` and `seasonId` explain which season it came from.
- **Use `snapshotId` to tell whether numbers describe the same board.** Equal `snapshotId` values on sports, games, and props responses mean counts and rows came from the same logical board. A `mixed` consistency value means the response is partial, so do not compare its counts against rows from another snapshot.

## Tiers

Generated from the hosted contract. Do not edit by hand.

<!-- contract:tiers:start -->
- **Free**: $0, 1,000 requests/day, 30 requests/minute, 25-row scans, evidence teaser, context basic, history none, movement none, top 3 leaders
- **Builder** (internal id `starter`): $19/mo, 25,000 requests/day, 120 requests/minute, 100-row scans, evidence basic, context basic, history limited, movement limited, top 10 leaders
- **Pro**: $49/mo, 150,000 requests/day, 600 requests/minute, 500-row scans, evidence full, context full, history full, movement full, top 100 leaders
- **Enterprise**: custom limits
<!-- contract:tiers:end -->

See current pricing and the REST reference at **https://api.flashodds.live/**.

## Contract

Tier limits, entitlements, and the MCP tool ladder in this README are **generated**, not written by hand. The hosted API publishes a keyless, machine-readable contract, and this repository vendors a copy at [`contract/flash-props-contract.json`](contract/flash-props-contract.json).

Machine sources, in order of authority:

- `GET https://api.flashodds.live/contract.json`: tiers, quotas, entitlements, MCP tools and access, sports vocabulary, projection and snapshot rules. Static per API release.
- `GET https://api.flashodds.live/api/v1/sports`: runtime state. Which sports are modeled, live, or fresh right now lives here, never in the contract or this README.

Maintainers:

```
node scripts/contract.mjs sync          # regenerate README blocks and server.json version
node scripts/contract.mjs check         # offline drift gate (runs on every push and PR)
node scripts/contract.mjs check --live  # also compare the vendored copy to the hosted contract
node scripts/contract.mjs links         # check every https link in this README
```

CI fails when the generated blocks are stale, when prose quotes a quota or price the contract does not contain, when a retired tier name appears, when a frozen list of modeled sports appears, when `server.json` disagrees with the contract version or MCP endpoint, or when the README and contract disagree about which tools exist. A daily scheduled job also compares the vendored contract against the hosted one, so drift is caught even when this repository does not change.

## Disclaimer

Data is informational only. Flash Props is not a sportsbook and is not affiliated with any league, team, player, sportsbook, or DFS operator.

## Links

- API + pricing: https://api.flashodds.live/
- REST reference: https://api.flashodds.live/docs
- Public contract: https://api.flashodds.live/contract.json
- Built by [Flash AI Solutions](https://www.flashaisolutions.org)
