// Canonical data shapes for the Flash Props API.
//
// Mirrors the flash-odds hub `PlayerProp` shape, widened to string stats
// because Bovada carries multi-sport props (NFL/NHL/MLB), not just the five
// NBA stats. Odds are American (e.g. -110, +145) to match the hub convention.

export type Sport = 'nba' | 'nfl' | 'nhl' | 'mlb' | 'ncaab' | 'ncaaf' | 'soccer';
export const SPORTS: Sport[] = ['nba', 'nfl', 'nhl', 'mlb', 'ncaab', 'ncaaf', 'soccer'];

// Canonical NBA stat vocabulary. Other sports pass their stats through as
// strings (passing_yards, goals, hits, ...).
export const NBA_STATS = ['points', 'rebounds', 'assists', 'threes', 'pra'] as const;
export type NbaStat = (typeof NBA_STATS)[number];
export type PropStat = string;

export type GameState = 'pre' | 'live' | 'final';

export interface PlayerProp {
	player: string;
	stat: PropStat;
	line: number; // e.g. 24.5
	overOdds?: number; // American odds
	underOdds?: number; // American odds
	bookCount: number; // # of books contributing (consensus confidence)
	photoUrl?: string;
	playerId?: string;
	liveValue?: number; // current in-game stat count, when live
	gameClock?: string; // "Q2 7:23"
	gameState?: GameState;
}

export interface GameRef {
	id: string; // our event id — "ud-<n>" (Underdog) or "bv-<id>" (Bovada)
	sport: string;
	homeTeam: string;
	awayTeam: string;
	startTime: string; // ISO
	live: boolean;
	source: 'underdog' | 'bovada';
}

export interface PropsResult {
	eventId: string;
	sport: string;
	homeTeam: string;
	awayTeam: string;
	startTime: string;
	props: PlayerProp[];
	sources: string[]; // which upstream book(s) contributed
	fetchedAt: number; // epoch ms
}

// One flattened row for the market-wide scan endpoint (the "flow" feed).
export interface ScanRow extends PlayerProp {
	eventId: string;
	sport: string;
	homeTeam: string;
	awayTeam: string;
	startTime: string;
	source: string;
}

// Normalize a name/team for matching: strip diacritics, punctuation, case.
export function normName(s: string): string {
	return String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// Decimal odds → American odds
export function toAmerican(d: number): number | undefined {
	if (!Number.isFinite(d) || d <= 1) return undefined;
	return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1));
}

export const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
