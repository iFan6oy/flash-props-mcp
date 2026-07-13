// Subscription tiers. Tiers differ by REQUEST VOLUME, SCAN SIZE, and SPORT
// BREADTH — not by data freshness (every tier gets the same live snapshot).
// The free tier is capped to the current in-season headline sport; paid tiers
// unlock all active sports (traditional leagues + tennis + esports).

import { headlineSport } from './sports.js';

export type TierId = 'free' | 'starter' | 'pro' | 'enterprise';

// How a tier's sport access is expressed: an explicit list, everything, or the
// dynamic "whatever league is in season today" (free tier).
export type SportsAccess = string[] | 'all' | 'in-season';

export interface Tier {
	id: TierId;
	name: string;
	priceMonthly: number | null; // USD; null = custom / contact sales
	requestsPerDay: number;
	requestsPerMinute: number;
	realtime: boolean; // reserved; every tier currently serves the same live snapshot
	sports: SportsAccess; // allowed sports (or 'in-season' for the free tier)
	scanLimit: number; // max rows returned by the /props scan
	blurb: string;
	features: string[];
}

export const TIERS: Record<TierId, Tier> = {
	free: {
		id: 'free',
		name: 'Free',
		priceMonthly: 0,
		requestsPerDay: 250,
		requestsPerMinute: 15,
		realtime: true,
		sports: 'in-season',
		scanLimit: 25,
		blurb: 'Test the current live board with the active sports available today.',
		features: [
			'Current in-season sport',
			'250 requests/day',
			'Small scans (25 rows)',
			'REST + MCP',
			'Community support'
		]
	},
	starter: {
		id: 'starter',
		name: 'Starter',
		priceMonthly: 15,
		requestsPerDay: 10_000,
		requestsPerMinute: 120,
		realtime: true,
		sports: 'all',
		scanLimit: 100,
		blurb: 'For side projects, Discord bots, and small dashboards.',
		features: [
			'All active sports (incl. tennis + esports)',
			'10,000 requests/day',
			'Market-wide scan (100 rows)',
			'REST + MCP',
			'Email support'
		]
	},
	pro: {
		id: 'pro',
		name: 'Pro',
		priceMonthly: 39,
		requestsPerDay: 100_000,
		requestsPerMinute: 600,
		realtime: true,
		sports: 'all',
		scanLimit: 500,
		blurb: 'For heavier board scans, prop history, movement tracking, and production prototypes.',
		features: [
			'Everything in Starter',
			'100,000 requests/day',
			'Full market scan (500 rows)',
			'Higher burst limits',
			'Priority support'
		]
	},
	enterprise: {
		id: 'enterprise',
		name: 'Enterprise',
		priceMonthly: null,
		requestsPerDay: 5_000_000,
		requestsPerMinute: 3_000,
		realtime: true,
		sports: 'all',
		scanLimit: 5_000,
		blurb: 'For higher limits, custom support, or larger usage patterns.',
		features: ['Everything in Pro', 'Custom volume + rate limits', 'Dedicated support', 'SLA discussion']
	}
};

export function tierOf(id: string): Tier {
	return TIERS[id as TierId] ?? TIERS.free;
}

// Resolve a tier's access to a concrete value for right now. The dynamic
// 'in-season' access (free tier) collapses to today's headline sport, so the
// sentinel never leaks out to API consumers (/me, /sports, error messages).
export function effectiveSports(tier: Tier, now: Date = new Date()): string[] | 'all' {
	if (tier.sports === 'all') return 'all';
	if (tier.sports === 'in-season') return [headlineSport(now)];
	return tier.sports;
}

export function sportAllowed(tier: Tier, sport: string, now: Date = new Date()): boolean {
	const eff = effectiveSports(tier, now);
	return eff === 'all' || eff.includes(sport.toLowerCase());
}
