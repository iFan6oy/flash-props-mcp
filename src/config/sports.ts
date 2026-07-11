// Catalog of sports the API can serve. Availability per request still depends
// on (a) the caller's tier and (b) whether upstream books have games posted.
export const SPORT_CATALOG: { id: string; name: string }[] = [
	{ id: 'nba', name: 'NBA Basketball' },
	{ id: 'mlb', name: 'MLB Baseball' },
	{ id: 'nfl', name: 'NFL Football' },
	{ id: 'nhl', name: 'NHL Hockey' },
	{ id: 'ncaab', name: 'NCAA Basketball' },
	{ id: 'ncaaf', name: 'NCAA Football' },
	{ id: 'soccer', name: 'Soccer' }
];

export const SPORT_IDS = SPORT_CATALOG.map((s) => s.id);

// --- Season awareness -------------------------------------------------------
// Rough season windows by calendar month (1-12). Used ONLY to decide which
// sport the free tier features right now, so the storefront demo is never stuck
// on an out-of-season league (e.g. NBA in July). Paid tiers are date-independent
// and the DATA served is always real — this just picks which door free opens.
const SEASON_MONTHS: Record<string, number[]> = {
	nba: [10, 11, 12, 1, 2, 3, 4, 5, 6],
	mlb: [3, 4, 5, 6, 7, 8, 9, 10],
	nfl: [9, 10, 11, 12, 1, 2],
	nhl: [10, 11, 12, 1, 2, 3, 4, 5, 6],
	ncaab: [11, 12, 1, 2, 3, 4],
	ncaaf: [8, 9, 10, 11, 12, 1],
	soccer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
};

// When several leagues overlap, the free tier features the first one in this
// priority order that is in season. NBA is the marquee; MLB anchors the summer
// when NBA is dark; NFL takes the early-fall gap before NBA tips off.
const HEADLINE_PRIORITY = ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer'];

export function isInSeason(sport: string, now: Date = new Date()): boolean {
	const month = now.getMonth() + 1; // getMonth() is 0-indexed (0 = January)
	return SEASON_MONTHS[sport]?.includes(month) ?? false;
}

// The single sport the free tier features right now: the highest-priority league
// in season today. Falls back to nba if somehow nothing matches.
export function headlineSport(now: Date = new Date()): string {
	return HEADLINE_PRIORITY.find((s) => isInSeason(s, now)) ?? 'nba';
}
