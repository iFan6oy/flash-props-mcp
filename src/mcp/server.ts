import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sportAllowed, type Tier } from '../config/tiers.js';
import { SPORT_CATALOG } from '../config/sports.js';
import { listGames, getProps, scanProps, resolveEvent } from '../data/props.js';
import { gateGames, gateProps, gateScan } from '../routes/gating.js';

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });

const denySport = (sport: string, tier: Tier) =>
	fail(
		`Sport '${sport}' is not included in your ${tier.name} tier (covers: ${
			tier.sports === 'all' ? 'all sports' : tier.sports.join(', ')
		}). Upgrade to unlock it.`
	);

// Build a per-request MCP server with the caller's tier baked in, so every
// tool respects that key's sport access, realtime/live gating, and scan caps.
export function buildMcpServer(tier: Tier): McpServer {
	const server = new McpServer({ name: 'flash-props-api', version: '0.1.0' });

	server.registerTool(
		'list_sports',
		{
			title: 'List sports',
			description: 'List supported sports and whether your API key tier can access each.'
		},
		async () => ok({ sports: SPORT_CATALOG.map((s) => ({ ...s, enabled: sportAllowed(tier, s.id) })) })
	);

	server.registerTool(
		'list_games',
		{
			title: "List today's games",
			description:
				"List today's games with player props for a sport (nba, mlb, nfl, nhl, ncaab, ncaaf, soccer). Live games first.",
			inputSchema: { sport: z.string().default('nba').describe('Sport id, e.g. nba or mlb') }
		},
		async ({ sport }) => {
			if (!sportAllowed(tier, sport)) return denySport(sport, tier);
			const games = gateGames(tier, await listGames(sport));
			return ok({ sport, count: games.length, games });
		}
	);

	server.registerTool(
		'get_game_props',
		{
			title: 'Get props for a game',
			description: 'Get player props for one game by event id (from list_games; ids are prefixed ud- or bv-).',
			inputSchema: {
				eventId: z.string().describe('Event id, e.g. bv-26839935'),
				sport: z.string().default('nba').describe('Sport id'),
				stats: z.string().optional().describe('Comma-separated stat filter, e.g. points,rebounds')
			}
		},
		async ({ eventId, sport, stats }) => {
			if (!sportAllowed(tier, sport)) return denySport(sport, tier);
			const statList = stats ? stats.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
			const r = await getProps(eventId, statList, sport);
			if (!r) return fail(`No props available for event ${eventId}. It may have ended or not posted lines yet.`);
			return ok(gateProps(tier, r));
		}
	);

	server.registerTool(
		'scan_props',
		{
			title: 'Scan props (flow feed)',
			description:
				"Market-wide scan: every player prop across today's games for a sport, flattened into rows. Optionally filter by a single stat.",
			inputSchema: {
				sport: z.string().default('nba').describe('Sport id'),
				stat: z.string().optional().describe('Filter to one stat, e.g. strikeouts'),
				limit: z.number().int().min(1).max(500).optional().describe('Max rows (capped by your tier)')
			}
		},
		async ({ sport, stat, limit }) => {
			if (!sportAllowed(tier, sport)) return denySport(sport, tier);
			const requested = limit ?? tier.scanLimit;
			const rows = gateScan(tier, await scanProps({ sport, stat, limit: Math.min(requested, tier.scanLimit) }));
			return ok({ sport, stat: stat ?? null, count: rows.length, rows });
		}
	);

	server.registerTool(
		'find_game',
		{
			title: 'Find a game by teams',
			description: 'Resolve a matchup to an event id by home and away team names.',
			inputSchema: {
				home: z.string().describe('Home team name'),
				away: z.string().describe('Away team name'),
				sport: z.string().default('nba').describe('Sport id')
			}
		},
		async ({ home, away, sport }) => {
			if (!sportAllowed(tier, sport)) return denySport(sport, tier);
			const id = await resolveEvent({ home, away, sport });
			return id ? ok({ eventId: id }) : fail(`No game found for ${away} @ ${home} (${sport}).`);
		}
	);

	return server;
}
