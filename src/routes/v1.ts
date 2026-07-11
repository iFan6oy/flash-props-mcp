import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { AppEnv } from '../app-env.js';
import { authMiddleware } from '../auth/middleware.js';
import { rateLimitMiddleware } from '../rate-limit/middleware.js';
import { listGames, getProps, scanProps } from '../data/props.js';
import { sportAllowed, type Tier } from '../config/tiers.js';
import { SPORT_CATALOG } from '../config/sports.js';
import { getUsageToday } from '../db/usage.js';
import { gateGames, gateProps, gateScan } from './gating.js';
import {
	jsonContent,
	GamesResponseSchema,
	PropsResultSchema,
	ScanResponseSchema,
	SportsResponseSchema,
	KeyInfoSchema,
	ErrorSchema,
	SportQuery,
	EventIdParam,
	PropsQuery,
	ScanQuery
} from '../openapi/schemas.js';

export const v1 = new OpenAPIHono<AppEnv>({
	defaultHook: (result, c) => {
		if (!result.success) {
			return c.json(
				{
					error: 'invalid_request',
					message: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
				},
				400
			);
		}
	}
});

// Auth + rate limiting guard every v1 endpoint.
v1.use('*', authMiddleware, rateLimitMiddleware);

// Common error responses, inlined per route (jsonContent captures each schema
// type so createRoute infers the full response union).
const errBad = jsonContent(ErrorSchema, 'Invalid request');
const errAuth = jsonContent(ErrorSchema, 'Missing or invalid API key');
const errTier = jsonContent(ErrorSchema, 'Not permitted on your tier');
const errRate = jsonContent(ErrorSchema, 'Rate limit or daily quota exceeded');

function forbidSport(sport: string, tier: Tier) {
	const allowed = tier.sports === 'all' ? 'all sports' : tier.sports.join(', ');
	return {
		error: 'tier_forbidden',
		message: `The ${sport} feed is not included in your ${tier.name} tier (covers: ${allowed}). Upgrade to unlock it.`
	};
}

// GET /sports ---------------------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/sports',
		tags: ['Meta'],
		summary: 'List supported sports',
		description: 'Returns the sport catalog and whether each is enabled on your tier.',
		security: [{ BearerAuth: [] }],
		responses: {
			200: jsonContent(SportsResponseSchema, 'Sport catalog'),
			400: errBad,
			401: errAuth,
			403: errTier,
			429: errRate
		}
	}),
	(c) => {
		const tier = c.get('tier');
		const sports = SPORT_CATALOG.map((s) => ({ ...s, enabled: sportAllowed(tier, s.id) }));
		return c.json({ sports }, 200);
	}
);

// GET /games ----------------------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/games',
		tags: ['Props'],
		summary: "List today's games",
		description: 'Games with player props posted for the given sport, merged across free books. Live games first.',
		security: [{ BearerAuth: [] }],
		request: { query: SportQuery },
		responses: {
			200: jsonContent(GamesResponseSchema, 'Games list'),
			400: errBad,
			401: errAuth,
			403: errTier,
			429: errRate
		}
	}),
	async (c) => {
		const tier = c.get('tier');
		const { sport } = c.req.valid('query');
		if (!sportAllowed(tier, sport)) return c.json(forbidSport(sport, tier), 403);
		const games = gateGames(tier, await listGames(sport));
		return c.json({ sport, count: games.length, games }, 200);
	}
);

// GET /games/{eventId}/props ------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/games/{eventId}/props',
		tags: ['Props'],
		summary: 'Player props for one game',
		security: [{ BearerAuth: [] }],
		request: { params: EventIdParam, query: PropsQuery },
		responses: {
			200: jsonContent(PropsResultSchema, 'Props for the game'),
			400: errBad,
			401: errAuth,
			403: errTier,
			404: jsonContent(ErrorSchema, 'No props for this event'),
			429: errRate
		}
	}),
	async (c) => {
		const tier = c.get('tier');
		const { eventId } = c.req.valid('param');
		const { stats, sport } = c.req.valid('query');
		if (!sportAllowed(tier, sport)) return c.json(forbidSport(sport, tier), 403);
		const statList = stats ? stats.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
		const result = await getProps(eventId, statList, sport);
		if (!result) {
			return c.json(
				{ error: 'not_found', message: `No props available for event ${eventId}. It may have ended or not posted lines yet.` },
				404
			);
		}
		return c.json(gateProps(tier, result), 200);
	}
);

// GET /props (market-wide scan / "flow") ------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/props',
		tags: ['Props'],
		summary: 'Market-wide props scan',
		description:
			'Every player prop across today\'s games for a sport, flattened into rows — the "flow" feed. Live props first. Row count is capped by your tier.',
		security: [{ BearerAuth: [] }],
		request: { query: ScanQuery },
		responses: {
			200: jsonContent(ScanResponseSchema, 'Flattened prop rows'),
			400: errBad,
			401: errAuth,
			403: errTier,
			429: errRate
		}
	}),
	async (c) => {
		const tier = c.get('tier');
		const { sport, stat, limit } = c.req.valid('query');
		if (!sportAllowed(tier, sport)) return c.json(forbidSport(sport, tier), 403);
		const requested = limit ?? tier.scanLimit;
		const rows = gateScan(tier, await scanProps({ sport, stat, limit: Math.min(requested, tier.scanLimit) }));
		return c.json({ sport, stat: stat ?? null, count: rows.length, rows }, 200);
	}
);

// GET /me -------------------------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/me',
		tags: ['Meta'],
		summary: 'Your key, tier, and usage',
		security: [{ BearerAuth: [] }],
		responses: {
			200: jsonContent(KeyInfoSchema, 'Key info'),
			400: errBad,
			401: errAuth,
			429: errRate
		}
	}),
	(c) => {
		const key = c.get('apiKey');
		const tier = c.get('tier');
		const today = getUsageToday(key.id);
		return c.json(
			{
				keyPrefix: key.keyPrefix,
				tier: tier.id,
				label: key.label,
				limits: {
					requestsPerMinute: tier.requestsPerMinute,
					requestsPerDay: tier.requestsPerDay,
					realtime: tier.realtime,
					sports: tier.sports,
					scanLimit: tier.scanLimit
				},
				usage: { today, dailyRemaining: Math.max(0, tier.requestsPerDay - today) }
			},
			200
		);
	}
);
