import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { AppEnv } from '../app-env.js';
import { authMiddleware } from '../auth/middleware.js';
import { rateLimitMiddleware } from '../rate-limit/middleware.js';
import { listGames, getProps, scanProps } from '../data/props.js';
import { getPropHistory, getMovement } from '../data/snapshots.js';
import { sportAllowed, effectiveSports, type Tier } from '../config/tiers.js';
import { SPORT_CATALOG, headlineSport } from '../config/sports.js';
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
	ScanQuery,
	PropHistorySchema,
	MovementResponseSchema,
	HistoryQuery,
	MovementQuery
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
	const eff = effectiveSports(tier);
	const allowed = eff === 'all' ? 'all sports' : eff.join(', ');
	return {
		error: 'tier_forbidden',
		message: `The ${sport} feed is not included in your ${tier.name} tier (covers: ${allowed}). Upgrade to unlock it.`
	};
}

// Resolve the sport for a request against the caller's tier.
//   - EXPLICIT ?sport=x  → honor it exactly; 403 if it's outside the tier.
//   - BARE call (no ?sport=) → land on today's in-season headline sport so a
//     first request always hits a live slate (never "NBA in July" empties).
//     Fall back to the schema default, then to any sport the tier allows.
// The schema default (nba) is only a last resort, never the silent default —
// that was the seasonal empty-response trap.
function pickSport(tier: Tier, defaulted: string, explicit: string | undefined): string | null {
	if (explicit) return sportAllowed(tier, explicit) ? explicit : null;
	const headline = headlineSport();
	if (sportAllowed(tier, headline)) return headline;
	if (sportAllowed(tier, defaulted)) return defaulted;
	const eff = effectiveSports(tier);
	return eff === 'all' ? headline : (eff[0] ?? null);
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
		const picked = pickSport(tier, sport, c.req.query('sport'));
		if (!picked) return c.json(forbidSport(sport, tier), 403);
		const games = gateGames(tier, await listGames(picked));
		return c.json({ sport: picked, count: games.length, games }, 200);
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
		const picked = pickSport(tier, sport, c.req.query('sport'));
		if (!picked) return c.json(forbidSport(sport, tier), 403);
		const statList = stats ? stats.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
		const result = await getProps(eventId, statList, picked);
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
			'All player props across today\'s games for a sport, flattened into rows — the "flow" feed. Row count is capped by your tier.',
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
		const picked = pickSport(tier, sport, c.req.query('sport'));
		if (!picked) return c.json(forbidSport(sport, tier), 403);
		const requested = limit ?? tier.scanLimit;
		const rows = gateScan(tier, await scanProps({ sport: picked, stat, limit: Math.min(requested, tier.scanLimit) }));
		return c.json({ sport: picked, stat: stat ?? null, count: rows.length, rows }, 200);
	}
);

// Line history + movement are Pro (and Enterprise) only.
function proOnly(feature: string) {
	return {
		error: 'tier_forbidden',
		message: `${feature} is a Pro feature. Upgrade at /#pricing to unlock line history and movement.`
	};
}
function isProPlus(tier: Tier): boolean {
	return tier.id === 'pro' || tier.id === 'enterprise';
}
// Parse a lookback like "6h", "24h", "3d" into ms, clamped to [1h, 7d].
function parseSinceMs(s: string | undefined): number {
	const m = /^(\d+)\s*([hd])$/i.exec((s || '24h').trim());
	const n = m ? parseInt(m[1]!, 10) : 24;
	const ms = m && m[2]!.toLowerCase() === 'd' ? n * 86_400_000 : n * 3_600_000;
	return Math.min(Math.max(ms, 3_600_000), 7 * 86_400_000);
}

// GET /props/history (Pro) --------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/props/history',
		tags: ['Props'],
		summary: 'Line history for a prop (Pro)',
		description:
			'Chronological line/odds history for a player prop, with opened/current/movement. Pro tier and above. History accrues from when archiving started, so early results may be short.',
		security: [{ BearerAuth: [] }],
		request: { query: HistoryQuery },
		responses: {
			200: jsonContent(PropHistorySchema, 'Prop line history'),
			400: errBad,
			401: errAuth,
			403: errTier,
			429: errRate
		}
	}),
	(c) => {
		const tier = c.get('tier');
		if (!isProPlus(tier)) return c.json(proOnly('Line history'), 403);
		const { player, sport, stat, event, limit } = c.req.valid('query');
		return c.json(getPropHistory({ player, sport, stat, eventId: event, limit }), 200);
	}
);

// GET /props/movement (Pro) -------------------------------------------------
v1.openapi(
	createRoute({
		method: 'get',
		path: '/props/movement',
		tags: ['Props'],
		summary: 'Biggest line movers (Pro)',
		description:
			'Props whose line moved most within a lookback window (default 24h, max 7d), sorted by absolute movement. Pro tier and above.',
		security: [{ BearerAuth: [] }],
		request: { query: MovementQuery },
		responses: {
			200: jsonContent(MovementResponseSchema, 'Line movers'),
			400: errBad,
			401: errAuth,
			403: errTier,
			429: errRate
		}
	}),
	(c) => {
		const tier = c.get('tier');
		if (!isProPlus(tier)) return c.json(proOnly('Line movement'), 403);
		const { sport, stat, since, limit } = c.req.valid('query');
		return c.json(getMovement({ sport, stat, sinceMs: parseSinceMs(since), limit }), 200);
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
					sports: effectiveSports(tier),
					scanLimit: tier.scanLimit
				},
				usage: { today, dailyRemaining: Math.max(0, tier.requestsPerDay - today) }
			},
			200
		);
	}
);
