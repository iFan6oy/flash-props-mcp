import { z } from '@hono/zod-openapi';

// Generic response-content helper. Capturing the schema as generic `T` keeps
// its exact type through createRoute inference (a shared `as const` object
// spread loses it, which breaks handler return typing).
export function jsonContent<T extends z.ZodType>(schema: T, description: string) {
	return { description, content: { 'application/json': { schema } } };
}

// Shared field map so PlayerProp and ScanRow stay in lockstep.
const playerPropFields = {
	player: z.string().openapi({ example: 'Aaron Judge' }),
	stat: z.string().openapi({
		example: 'points',
		description:
			'Stat key. NBA: points | rebounds | assists | threes | pra. Other sports use descriptive keys (strikeouts, total_bases, passing_yards, goals, ...).'
	}),
	line: z.number().openapi({ example: 24.5, description: 'The posted over/under line.' }),
	overOdds: z.number().optional().openapi({ example: -115, description: 'American odds for the over / higher.' }),
	underOdds: z.number().optional().openapi({ example: -105, description: 'American odds for the under / lower.' }),
	bookCount: z.number().int().openapi({ example: 1, description: 'Number of sources contributing this line (currently 1).' }),
	photoUrl: z.string().optional().openapi({ example: 'https://cdn.underdogfantasy.com/....png' }),
	playerId: z.string().optional(),
	liveValue: z.number().optional().openapi({ description: 'Current in-game stat count (live games only).' }),
	gameClock: z.string().optional().openapi({ example: 'Q2 7:23' }),
	gameState: z.enum(['pre', 'live', 'final']).optional()
};

export const PlayerPropSchema = z.object(playerPropFields).openapi('PlayerProp');

export const GameSchema = z
	.object({
		id: z.string().openapi({ example: 'bv-26839935', description: 'Event id. Prefix ud- (Underdog) or bv- (Bovada).' }),
		sport: z.string().openapi({ example: 'mlb' }),
		homeTeam: z.string().openapi({ example: 'Detroit Tigers' }),
		awayTeam: z.string().openapi({ example: 'Philadelphia Phillies' }),
		startTime: z.string().openapi({ example: '2026-07-11T23:10:00.000Z', description: 'ISO 8601 start time.' }),
		live: z.boolean().openapi({ description: 'Game is currently in progress.' }),
		source: z.enum(['underdog', 'bovada'])
	})
	.openapi('Game');

export const PropsResultSchema = z
	.object({
		eventId: z.string().openapi({ example: 'bv-26839935' }),
		sport: z.string().openapi({ example: 'mlb' }),
		homeTeam: z.string(),
		awayTeam: z.string(),
		startTime: z.string(),
		props: z.array(PlayerPropSchema),
		sources: z.array(z.string()).openapi({ example: ['underdog'] }),
		fetchedAt: z.number().openapi({ description: 'Epoch ms when the upstream snapshot was taken.' }),
		delayed: z.boolean().openapi({ description: 'Reserved. Always false today — every tier serves the same live snapshot.' })
	})
	.openapi('PropsResult');

export const ScanRowSchema = z
	.object({
		...playerPropFields,
		eventId: z.string(),
		sport: z.string(),
		homeTeam: z.string(),
		awayTeam: z.string(),
		startTime: z.string(),
		source: z.string()
	})
	.openapi('ScanRow');

export const GamesResponseSchema = z
	.object({ sport: z.string(), count: z.number().int(), games: z.array(GameSchema) })
	.openapi('GamesResponse');

export const ScanResponseSchema = z
	.object({ sport: z.string(), stat: z.string().nullable(), count: z.number().int(), rows: z.array(ScanRowSchema) })
	.openapi('ScanResponse');

export const SportsResponseSchema = z
	.object({
		sports: z.array(
			z.object({
				id: z.string().openapi({ example: 'nba' }),
				name: z.string().openapi({ example: 'NBA Basketball' }),
				enabled: z.boolean().openapi({ description: 'Allowed on your current tier.' })
			})
		)
	})
	.openapi('SportsResponse');

export const KeyInfoSchema = z
	.object({
		keyPrefix: z.string().openapi({ example: 'flash_live_ab12' }),
		tier: z.string().openapi({ example: 'pro' }),
		label: z.string().openapi({ example: 'production' }),
		limits: z.object({
			requestsPerMinute: z.number().int(),
			requestsPerDay: z.number().int(),
			realtime: z.boolean(),
			sports: z.union([z.array(z.string()), z.literal('all')]),
			scanLimit: z.number().int()
		}),
		usage: z.object({
			today: z.number().int().openapi({ description: 'Requests used today (UTC).' }),
			dailyRemaining: z.number().int()
		})
	})
	.openapi('KeyInfo');

export const ErrorSchema = z
	.object({
		error: z.string().openapi({ example: 'invalid_api_key' }),
		message: z.string().openapi({ example: 'API key is invalid, revoked, or inactive.' })
	})
	.openapi('Error');

// ---- request param schemas ----

export const SportQuery = z.object({
	sport: z
		.string()
		.optional()
		.default('nba')
		.openapi({ param: { name: 'sport', in: 'query' }, example: 'mlb', description: 'Sport id. See GET /sports.' })
});

export const EventIdParam = z.object({
	eventId: z
		.string()
		.openapi({ param: { name: 'eventId', in: 'path' }, example: 'bv-26839935', description: 'Event id from GET /games.' })
});

export const PropsQuery = z.object({
	stats: z
		.string()
		.optional()
		.openapi({ param: { name: 'stats', in: 'query' }, example: 'points,rebounds', description: 'Comma-separated stat filter.' }),
	sport: z.string().optional().default('nba').openapi({ param: { name: 'sport', in: 'query' }, example: 'mlb' })
});

export const ScanQuery = z.object({
	sport: z.string().optional().default('nba').openapi({ param: { name: 'sport', in: 'query' }, example: 'mlb' }),
	stat: z
		.string()
		.optional()
		.openapi({ param: { name: 'stat', in: 'query' }, example: 'strikeouts', description: 'Filter to a single stat.' }),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(5000)
		.optional()
		.openapi({ param: { name: 'limit', in: 'query' }, example: 50, description: 'Max rows (capped by your tier).' })
});
