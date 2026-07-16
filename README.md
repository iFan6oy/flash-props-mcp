# Flash Props MCP

Live sports player-prop data for AI agents, over the [Model Context Protocol](https://modelcontextprotocol.io). Player-prop lines (over/under), market metadata, Flash projections, evidence, and line movement across 14 sports including esports (CS2, Valorant, Dota 2, Call of Duty).

This repo is the **connector** for the hosted Flash Props MCP server. The server runs at `https://api.flashodds.live/mcp` and is operated by Flash AI Solutions. There is no server to install: point your MCP client at the remote endpoint and go.

## Connect

Streamable HTTP endpoint:

```
https://api.flashodds.live/mcp
```

Send your API key as a bearer token:

```
Authorization: Bearer <your_api_key>
```

Anonymous access works for **capability discovery** (`list_sports`, `get_market_metadata`) so a client can see what's available on first run. Retrieving actual board data requires a key. Get a free one (250 requests/day, every active sport) at **https://api.flashodds.live/**.

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

| Tool | What it returns | Tier |
| --- | --- | --- |
| `list_sports` | Every sport with live status + projection/context capability | Anonymous |
| `get_market_metadata` | The stat vocabulary for a sport (labels, families, scope) | Anonymous |
| `list_games` | Today's games with props for a sport | Free+ |
| `get_game_props` | All player props for one game | Free+ |
| `scan_props` | Market-wide prop scan across the slate (row-capped by tier) | Free+ |
| `find_game` | Resolve team names to an event id | Free+ |
| `find_player_props` | Every active prop for one player | Free+ |
| `get_player_context` | Season baselines, recent form, splits | Pro |
| `get_prop_evidence` | One prop's full story: book line, Flash line, gap, form, movement | Pro |
| `get_prop_history` | Chronological line/odds history for a prop | Pro |
| `scan_movers` | Biggest line movers in a window | Pro |
| `get_leaders` | Ranked boards: top gaps, form, sample strength | Pro |

Data is informational only. Not affiliated with any league, team, or sportsbook. 21+.

## Tiers

Free (250/day, 25-row scans), Starter, Pro (full evidence, movement, leaders, 500-row scans), and Enterprise. See pricing and full REST docs at **https://api.flashodds.live/**.

## Links

- API + pricing: https://api.flashodds.live/
- REST reference: https://api.flashodds.live/docs
- Built by [Flash AI Solutions](https://flashaisolutions.org)
