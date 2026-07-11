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
