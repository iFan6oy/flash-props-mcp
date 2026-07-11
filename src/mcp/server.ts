import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sportAllowed, effectiveSports, type Tier } from '../config/tiers.js';
import { SPORT_CATALOG, headlineSport } from '../config/sports.js';
import { listGames, getProps, scanProps, resolveEvent } from '../data/props.js';
import { gateGames, gateProps, gateScan } from '../routes/gating.js';

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });

const denySport = (sport: string, tier: Tier) => {
	const eff = effectiveSports(tier);
	return fail(
		`Sport '${sport}' is not included in your ${tier.name} tier (covers: ${
			eff === 'all' ? 'all sports' : eff.join(', ')
		}). Upgrade to unlock it.`
	);
};

// An unspecified sport resolves to today's in-season league, so a bare tool
// call always lands on a live slate (mirrors the HTTP API's default-swap).
const resolveSport = (sport: string | undefined) => sport ?? headlineSport();

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
			inputSchema: { sport: z.string().optional().describe('Sport id, e.g. nba or mlb. Defaults to the in-season sport.') }
		},
		async ({ sport }) => {
			const s = resolveSport(sport);
			if (!sportAllowed(tier, s)) return denySport(s, tier);
			const games = gateGames(tier, await listGames(s));
			return ok({ sport: s, count: games.length, games });
		}
	);

	server.registerTool(
		'get_game_props',
		{
			title: 'Get props for a game',
			description: 'Get player props for one game by event id (from list_games; ids are prefixed ud- or bv-).',
			inputSchema: {
				eventId: z.string().describe('Event id, e.g. bv-26839935'),
				sport: z.string().optional().describe('Sport id. Defaults to the in-season sport.'),
				stats: z.string().optional().describe('Comma-separated stat filter, e.g. points,rebounds')
			}
		},
		async ({ eventId, sport, stats }) => {
			const s = resolveSport(sport);
			if (!sportAllowed(tier, s)) return denySport(s, tier);
			const statList = stats ? stats.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
			const r = await getProps(eventId, statList, s);
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
				sport: z.string().optional().describe('Sport id. Defaults to the in-season sport.'),
				stat: z.string().optional().describe('Filter to one stat, e.g. strikeouts'),
				limit: z.number().int().min(1).max(500).optional().describe('Max rows (capped by your tier)')
			}
		},
		async ({ sport, stat, limit }) => {
			const s = resolveSport(sport);
			if (!sportAllowed(tier, s)) return denySport(s, tier);
			const requested = limit ?? tier.scanLimit;
			const rows = gateScan(tier, await scanProps({ sport: s, stat, limit: Math.min(requested, tier.scanLimit) }));
			return ok({ sport: s, stat: stat ?? null, count: rows.length, rows });
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
				sport: z.string().optional().describe('Sport id. Defaults to the in-season sport.')
			}
		},
		async ({ home, away, sport }) => {
			const s = resolveSport(sport);
			if (!sportAllowed(tier, s)) return denySport(s, tier);
			const id = await resolveEvent({ home, away, sport: s });
			return id ? ok({ eventId: id }) : fail(`No game found for ${away} @ ${home} (${s}).`);
		}
	);

	return server;
}
