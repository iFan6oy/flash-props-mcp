// Catalog of sports the API can serve. Availability per request still depends
// on (a) the caller's tier and (b) whether upstream books have games posted.
export const SPORT_CATALOG: { id: string; name: string }[] = [
	{ id: 'nba', name: 'NBA Basketball' },
	{ id: 'basketball', name: 'Basketball (Summer League / WNBA)' },
	{ id: 'mlb', name: 'MLB Baseball' },
	{ id: 'nfl', name: 'NFL Football' },
	{ id: 'nhl', name: 'NHL Hockey' },
	{ id: 'ncaab', name: 'NCAA Basketball' },
	{ id: 'ncaaf', name: 'NCAA Football' },
	{ id: 'soccer', name: 'Soccer' },
	{ id: 'tennis', name: 'Tennis' },
	{ id: 'cs2', name: 'Counter-Strike 2' },
	{ id: 'valorant', name: 'Valorant' },
	{ id: 'dota2', name: 'Dota 2' },
	{ id: 'esports', name: 'Esports (other)' }
];

export const SPORT_IDS = SPORT_CATALOG.map((s) => s.id);

// --- Season awareness -------------------------------------------------------
// Rough season windows by calendar month (1-12). Used ONLY to decide which
// sport the free tier features right now, so the storefront demo is never stuck
// on an out-of-season league (e.g. NBA in July). Paid tiers are date-independent
// and the DATA served is always real — this just picks which door free opens.
const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SEASON_MONTHS: Record<string, number[]> = {
	nba: [10, 11, 12, 1, 2, 3, 4, 5, 6],
	basketball: [5, 6, 7, 8, 9], // WNBA (May–Sep) + NBA Summer League (Jul)
	mlb: [3, 4, 5, 6, 7, 8, 9, 10],
	nfl: [9, 10, 11, 12, 1, 2],
	nhl: [10, 11, 12, 1, 2, 3, 4, 5, 6],
	ncaab: [11, 12, 1, 2, 3, 4],
	ncaaf: [8, 9, 10, 11, 12, 1],
	soccer: ALL_YEAR,
	// Tennis tours (ATP/WTA) and the major esports circuits run essentially
	// year-round, so they never gate on calendar month.
	tennis: ALL_YEAR,
	cs2: ALL_YEAR,
	valorant: ALL_YEAR,
	dota2: ALL_YEAR,
	esports: ALL_YEAR
};

// When several leagues overlap, the free tier features the first one in this
// priority order that is in season. NBA is the marquee; summer-league/WNBA
// basketball carries the hoops-hungry summer when the NBA is dark; NFL takes the
// early-fall gap; MLB anchors otherwise.
const HEADLINE_PRIORITY = ['nba', 'basketball', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer', 'tennis', 'esports'];

export function isInSeason(sport: string, now: Date = new Date()): boolean {
	const month = now.getMonth() + 1; // getMonth() is 0-indexed (0 = January)
	return SEASON_MONTHS[sport]?.includes(month) ?? false;
}

// The single sport the free tier features right now: the highest-priority league
// in season today. Falls back to nba if somehow nothing matches.
export function headlineSport(now: Date = new Date()): string {
	return HEADLINE_PRIORITY.find((s) => isInSeason(s, now)) ?? 'nba';
}
