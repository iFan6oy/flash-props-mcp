// Underdog Fantasy adapter — free public API, reachable from datacenter IPs
// (unlike Bovada, which self-redirect-blocks the VPS, and PrizePicks/DraftKings).
// One feed carries EVERY sport Underdog posts (MLB, NFL, NBA, soccer, ...) in
// More/Less format, PRE-GAME lines only. We parse it once and index by sport,
// so the API can serve whatever league is in season without depending on Bovada.
// Ported from the flash-odds hub.
//
// Feed: https://api.underdogfantasy.com/beta/v5/over_under_lines
//   players[]           — id → name, headshot, sport_id ("MLB","NFL","NBA",...)
//   appearances[]       — id → player_id + match_id
//   games[]             — id → matchup + start time + sport_id
//   over_under_lines[]  — the props; the REAL appearance link lives on
//                         line.over_under.appearance_stat.appearance_id
//                         (options[].appearance_id is always null here).

import { BROWSER_UA, normName, toAmerican } from './types.js';
import type { GameRef, PlayerProp, PropsResult } from './types.js';

const UNDERDOG_URL = 'https://api.underdogfantasy.com/beta/v5/over_under_lines';
const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 min — props update frequently
const PHOTO_TTL_MS = 10 * 60 * 1000;

// Underdog sport_id (uppercased) → our catalog sport id. Only leagues we sell
// are mapped; anything else (tennis, PGA, MMA, esports, NPB, CFL) is skipped.
// Underdog labels Summer League + WNBA under one "BASKETBALL" sport_id — we
// surface that as its OWN `basketball` id (NOT `nba`, to avoid mislabeling), so
// summer hoops props are live year-round instead of dropped.
const UD_SPORT: Record<string, string> = {
	NBA: 'nba',
	BASKETBALL: 'basketball',
	WNBA: 'basketball',
	NFL: 'nfl',
	MLB: 'mlb',
	NHL: 'nhl',
	NCAAF: 'ncaaf',
	CFB: 'ncaaf',
	NCAAB: 'ncaab',
	CBB: 'ncaab',
	FIFA: 'soccer',
	SOCCER: 'soccer'
};

// Canonical stat aliases so common lines match our documented vocabulary
// (NBA: points/rebounds/assists/threes/pra; plus a few multi-sport favorites).
// Anything not listed passes through as a normalized snake_case key rather than
// being dropped — PropStat is a free string, so we never lose a real prop.
const CANON: Record<string, string> = {
	points: 'points',
	rebounds: 'rebounds',
	assists: 'assists',
	'3-pointers made': 'threes',
	'three-pointers made': 'threes',
	'3pt made': 'threes',
	threes: 'threes',
	'pts + rebs + asts': 'pra',
	'pts+rebs+asts': 'pra',
	'points + rebounds + assists': 'pra',
	'points, rebounds + assists': 'pra',
	// MLB
	'home runs': 'home_runs',
	'total bases': 'total_bases',
	'stolen bases': 'stolen_bases',
	'hits + runs + rbis': 'hits_runs_rbis',
	'batter walks': 'batter_walks',
	// NFL
	'pass yards': 'passing_yards',
	'passing yards': 'passing_yards',
	'rush yards': 'rushing_yards',
	'rushing yards': 'rushing_yards',
	'receiving yards': 'receiving_yards',
	'rush + rec tds': 'rush_rec_tds',
	'pass tds': 'passing_tds'
};

function normStat(displayStat: string): string {
	const d = displayStat.toLowerCase().trim();
	if (CANON[d]) return CANON[d];
	// "hits + runs + rbis" → "hits_runs_rbis", "1st inn. strikeouts" → "1st_inn_strikeouts"
	return d
		.replace(/\s*\+\s*/g, '_')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

interface Bundle {
	gameId: number;
	sport: string;
	homeTeam: string;
	awayTeam: string;
	startTime: string;
	props: PlayerProp[];
}
interface Snapshot {
	// sport id → (numeric game id → bundle)
	bySport: Map<string, Map<number, Bundle>>;
	fetchedAt: number;
}

let cache: Snapshot | null = null;
let photoCache: { map: Map<string, string>; fetchedAt: number } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFeed(): Promise<any> {
	const res = await fetch(UNDERDOG_URL, {
		headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' }
	});
	if (!res.ok) throw new Error(`Underdog ${res.status}`);
	return res.json();
}

export async function getUnderdogSnapshot(): Promise<Snapshot> {
	if (cache && Date.now() - cache.fetchedAt < SNAPSHOT_TTL_MS) return cache;
	const data = await fetchFeed();

	// players: id → name / headshot / mapped sport (null = league we don't serve)
	const players = new Map<string, { fullName: string; imageUrl: string; sport: string | null }>();
	const photoMap = new Map<string, string>();
	for (const p of data.players || []) {
		const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
		const imageUrl = p.image_url || p.light_image_url || '';
		const sport = UD_SPORT[(p.sport_id || '').toUpperCase()] ?? null;
		players.set(p.id, { fullName, imageUrl, sport });
		if (fullName && imageUrl) photoMap.set(normName(fullName), imageUrl);
	}
	photoCache = { map: photoMap, fetchedAt: Date.now() };

	// appearances: id → player_id + numeric match_id
	const appearances = new Map<string, { playerId: string; matchId: number }>();
	for (const a of data.appearances || []) appearances.set(a.id, { playerId: a.player_id, matchId: a.match_id });

	// games: numeric id → matchup ("Away Full @ Home Full")
	const games = new Map<number, { homeTeam: string; awayTeam: string; startTime: string }>();
	const splitAt = (s: string) => {
		const parts = String(s || '').split(/\s+@\s+/);
		return parts.length === 2 ? { away: parts[0]!.trim(), home: parts[1]!.trim() } : null;
	};
	for (const g of data.games || []) {
		const parsed = splitAt(g.full_team_names_title) || splitAt(g.short_title);
		games.set(g.id, {
			homeTeam: parsed?.home || '',
			awayTeam: parsed?.away || '',
			startTime: g.scheduled_at || g.start_time || ''
		});
	}

	const bySport = new Map<string, Map<number, Bundle>>();
	for (const line of data.over_under_lines || []) {
		if (line.status && line.status !== 'active') continue;
		const options = line.options || [];
		if (options.length < 2) continue;
		const first = options[0];

		const appStat = line.over_under && line.over_under.appearance_stat;
		const appId = appStat && appStat.appearance_id;
		if (!appId) continue;
		const app = appearances.get(appId);
		if (!app) continue;
		const player = players.get(app.playerId);
		if (!player || !player.sport) continue; // unmapped league → skip
		const game = games.get(app.matchId);
		if (!game) continue;

		const stat = normStat(String(appStat.display_stat || ''));
		if (!stat) continue;

		const subMatch = String(first.selection_subheader || '').match(/([\d.]+)/);
		const lineNum = subMatch ? Number(subMatch[1]) : Number(line.stat_value);
		if (!Number.isFinite(lineNum)) continue;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const higher = options.find((o: any) => String(o.choice || '').toLowerCase() === 'higher');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const lower = options.find((o: any) => String(o.choice || '').toLowerCase() === 'lower');
		const prop: PlayerProp = {
			player: player.fullName,
			stat,
			line: lineNum,
			overOdds: higher ? toAmerican(Number(higher.decimal_price)) : undefined,
			underOdds: lower ? toAmerican(Number(lower.decimal_price)) : undefined,
			bookCount: 1,
			photoUrl: player.imageUrl,
			playerId: app.playerId,
			gameState: 'pre'
		};

		let sportMap = bySport.get(player.sport);
		if (!sportMap) {
			sportMap = new Map<number, Bundle>();
			bySport.set(player.sport, sportMap);
		}
		let bundle = sportMap.get(app.matchId);
		if (!bundle) {
			bundle = {
				gameId: app.matchId,
				sport: player.sport,
				homeTeam: game.homeTeam,
				awayTeam: game.awayTeam,
				startTime: game.startTime,
				props: []
			};
			sportMap.set(app.matchId, bundle);
		}
		// Dedupe per (player, stat) — Underdog has goblin/demon line variants.
		if (!bundle.props.find((p) => p.player === prop.player && p.stat === prop.stat)) {
			bundle.props.push(prop);
		}
	}

	cache = { bySport, fetchedAt: Date.now() };
	return cache;
}

export async function listUnderdogGames(sport = 'nba'): Promise<GameRef[]> {
	const snap = await getUnderdogSnapshot();
	const sportMap = snap.bySport.get(sport.toLowerCase());
	if (!sportMap) return [];
	return Array.from(sportMap.values()).map((b) => ({
		id: `ud-${b.gameId}`,
		sport: b.sport,
		homeTeam: b.homeTeam,
		awayTeam: b.awayTeam,
		startTime: b.startTime,
		live: false,
		source: 'underdog' as const
	}));
}

export async function getUnderdogProps(eventId: string, stats?: string[]): Promise<PropsResult | null> {
	if (!eventId.startsWith('ud-')) return null;
	const numericId = Number(eventId.slice(3));
	if (!Number.isFinite(numericId)) return null;
	const snap = await getUnderdogSnapshot();
	// Game ids are unique across sports; find the bundle in whichever sport holds it.
	let bundle: Bundle | undefined;
	for (const sportMap of snap.bySport.values()) {
		const b = sportMap.get(numericId);
		if (b) {
			bundle = b;
			break;
		}
	}
	if (!bundle) return null;
	const props = stats && stats.length ? bundle.props.filter((p) => stats.includes(p.stat)) : bundle.props;
	return {
		eventId,
		sport: bundle.sport,
		homeTeam: bundle.homeTeam,
		awayTeam: bundle.awayTeam,
		startTime: bundle.startTime,
		props,
		sources: ['underdog'],
		fetchedAt: snap.fetchedAt
	};
}

// Name → headshot map, reused by the Bovada adapter (Underdog has broad
// player-photo coverage). Populated as a side effect of the snapshot fetch.
export async function getUnderdogPhotoMap(): Promise<Map<string, string>> {
	if (photoCache && Date.now() - photoCache.fetchedAt < PHOTO_TTL_MS) return photoCache.map;
	try {
		await getUnderdogSnapshot();
	} catch {
		/* keep stale map if we have one */
	}
	return photoCache?.map ?? new Map();
}
