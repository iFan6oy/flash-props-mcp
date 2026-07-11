// Subscription tiers. Numbers are starting points — tune freely. The free
// tier serves delayed data (staleness set by FREE_TIER_DELAY_MS) and is capped
// to NBA; paid tiers get realtime data and more sports/volume.

export type TierId = 'free' | 'starter' | 'pro' | 'enterprise';

export interface Tier {
	id: TierId;
	name: string;
	priceMonthly: number | null; // USD; null = custom / contact sales
	requestsPerDay: number;
	requestsPerMinute: number;
	realtime: boolean; // false → responses delayed by FREE_TIER_DELAY_MS
	sports: string[] | 'all'; // allowed sports
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
		realtime: false,
		sports: ['nba'],
		scanLimit: 25,
		blurb: 'Kick the tires. Delayed NBA props, low volume.',
		features: ['NBA props', 'Delayed data (~5 min)', '250 requests/day', 'Community support']
	},
	starter: {
		id: 'starter',
		name: 'Starter',
		priceMonthly: 29,
		requestsPerDay: 10_000,
		requestsPerMinute: 120,
		realtime: true,
		sports: ['nba', 'mlb'],
		scanLimit: 100,
		blurb: 'For a single app or bot. Realtime NBA + MLB.',
		features: ['NBA + MLB props', 'Realtime data', '10k requests/day', 'Market-wide scan', 'Email support']
	},
	pro: {
		id: 'pro',
		name: 'Pro',
		priceMonthly: 99,
		requestsPerDay: 100_000,
		requestsPerMinute: 600,
		realtime: true,
		sports: 'all',
		scanLimit: 500,
		blurb: 'All sports, realtime, live in-game lines, high volume.',
		features: [
			'All sports (NBA/MLB/NFL/NHL/NCAA/soccer)',
			'Realtime + live in-game props',
			'100k requests/day',
			'Full market scan (500 rows)',
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
		blurb: 'Redistribution, custom volume, SLAs.',
		features: ['Everything in Pro', 'Custom volume + rate limits', 'Redistribution license', 'SLA + dedicated support']
	}
};

export function tierOf(id: string): Tier {
	return TIERS[(id as TierId)] ?? TIERS.free;
}

export function sportAllowed(tier: Tier, sport: string): boolean {
	return tier.sports === 'all' || tier.sports.includes(sport.toLowerCase());
}
