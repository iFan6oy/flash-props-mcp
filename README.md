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

Anonymous access works for **capability discovery** (`list_sports`, `get_market_metadata`) so a client can inspect current coverage on first run. Retrieving board data requires at least a free key. Get one at **https://api.flashodds.live/**.

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

| Tool | What it returns | Access |
| --- | --- | --- |
| `list_sports` | Every sport with live status + projection/context capability | Anonymous |
| `get_market_metadata` | Market labels, families, scope, and projectability | Anonymous |
| `list_games` | Today's games with props for a sport | Free+ |
| `get_game_props` | All player props for one game | Free+ |
| `scan_props` | Market-wide prop scan across the slate | Free+; row cap by tier |
| `find_game` | Resolve team names to an event id | Free+ |
| `find_player_props` | Every active prop for one player | Free+ |
| `get_player_context` | Season baselines, recent form, and deep context | Free/Starter basic; Pro deep |
| `get_prop_evidence` | Book line, Flash line, gap, form, confidence, splits, movement | Free teaser; Starter basic; Pro full |
| `get_prop_history` | Chronological line/odds history for a prop | Starter limited; Pro full |
| `scan_movers` | Biggest line movers in a window | Starter limited; Pro full |
| `get_leaders` | Ranked boards for gap, form, and sample strength | Free top 3; Starter top 10; Pro full |

REST and MCP share the same entitlement shaping, so a key sees the same product tier regardless of transport.

## Provider-driven coverage

Do not hard-code a list of sports with Flash projections. Coverage is resolved from the server's registered model providers and can vary by **sport + market**.

Use `list_sports` to inspect `projectionCapability`, `effectiveProjection`, and `contextCapability`, then use `get_market_metadata` to determine whether a specific market is modeled. A partially modeled sport can legitimately expose Flash projections for one stat while keeping another stat posted-lines-only.

Missing analysis is reported explicitly. Flash Props does not fabricate a projection to fill an unsupported market.

## Tiers

- **Free:** 250 requests/day, 25-row scans, evidence teaser, basic player context, top-3 leaders
- **Starter:** 10k requests/day, 100-row scans, basic evidence, limited history/movement, top-10 leaders
- **Pro:** 100k requests/day, 500-row scans, full evidence/context/history/movement/leaders
- **Enterprise:** custom limits

See current pricing and the REST reference at **https://api.flashodds.live/**.

Data is informational only. Flash Props is not a sportsbook and is not affiliated with any league, team, player, sportsbook, or DFS operator.

## Links

- API + pricing: https://api.flashodds.live/
- REST reference: https://api.flashodds.live/docs
- Built by [Flash AI Solutions](https://www.flashaisolutions.org)
