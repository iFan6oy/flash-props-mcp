// Underdog Fantasy adapter — free public API, reachable from datacenter IPs
// (unlike PrizePicks / DraftKings). NBA player props in More/Less format.
// Underdog posts PRE-GAME lines only. Ported from the flash-odds hub.
//
// Feed: https://api.underdogfantasy.com/beta/v5/over_under_lines
//   players[]           — id → name, headshot, sport
//   appearances[]       — id → player_id + match_id
//   games[]             — id → matchup + start time
//   over_under_lines[]  — the props; the REAL appearance link lives on
//                         line.over_under.appearance_stat.appearance_id
//                         (options[].appearance_id is always null here).

import { BROWSER_UA, normName, toAmerican } from './types.js';
import type { GameRef, PlayerProp, PropsResult, PropStat } from './types.js';

const UNDERDOG_URL = 'https://api.underdogfantasy.com/beta/v5/over_under_lines';
const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 min — props update frequently
const PHOTO_TTL_MS = 10 * 60 * 1000;

// Underdog display_stat → our canonical PropStat.
const STAT_MAP: Record<string, PropStat> = {
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
	'points, rebounds + assists': 'pra'
};

interface Bundle {
	gameId: number;
	homeTeam: string;
	awayTeam: string;
	startTime: string;
	props: PlayerProp[];
}
interface Snapshot {
	byGameId: Map<number, Bundle>;
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

	// players: id → name / headshot / sport
	const players = new Map<string, { fullName: string; imageUrl: string; sportId: string }>();
	const photoMap = new Map<string, string>();
	for (const p of data.players || []) {
		const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
		const imageUrl = p.image_url || p.light_image_url || '';
		players.set(p.id, { fullName, imageUrl, sportId: (p.sport_id || '').toUpperCase() });
		if (fullName && imageUrl) photoMap.set(normName(fullName), imageUrl);
	}
	photoCache = { map: photoMap, fetchedAt: Date.now() };

	// appearances: id → player_id + numeric match_id
	const appearances = new Map<string, { playerId: string; matchId: number }>();
	for (const a of data.appearances || []) appearances.set(a.id, { playerId: a.player_id, matchId: a.match_id });

	// games: numeric id → matchup ("Away Full @ Home Full")
	const games = new Map<number, { homeTeam: string; awayTeam: string; startTime: string; sportId: string }>();
	const splitAt = (s: string) => {
		const parts = String(s || '').split(/\s+@\s+/);
		return parts.length === 2 ? { away: parts[0]!.trim(), home: parts[1]!.trim() } : null;
	};
	for (const g of data.games || []) {
		const parsed = splitAt(g.full_team_names_title) || splitAt(g.short_title);
		games.set(g.id, {
			homeTeam: parsed?.home || '',
			awayTeam: parsed?.away || '',
			startTime: g.scheduled_at || g.start_time || '',
			sportId: (g.sport_id || '').toUpperCase()
		});
	}

	const byGameId = new Map<number, Bundle>();
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
		if (!player || player.sportId !== 'NBA') continue;
		const game = games.get(app.matchId);
		if (!game) continue;

		const displayStat = String(appStat.display_stat || '').toLowerCase().trim();
		const stat = STAT_MAP[displayStat];
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

		let bundle = byGameId.get(app.matchId);
		if (!bundle) {
			bundle = {
				gameId: app.matchId,
				homeTeam: game.homeTeam,
				awayTeam: game.awayTeam,
				startTime: game.startTime,
				props: []
			};
			byGameId.set(app.matchId, bundle);
		}
		// Dedupe per (player, stat) — Underdog has goblin/demon line variants.
		if (!bundle.props.find((p) => p.player === prop.player && p.stat === prop.stat)) {
			bundle.props.push(prop);
		}
	}

	cache = { byGameId, fetchedAt: Date.now() };
	return cache;
}

export async function listUnderdogGames(): Promise<GameRef[]> {
	const snap = await getUnderdogSnapshot();
	return Array.from(snap.byGameId.values()).map((b) => ({
		id: `ud-${b.gameId}`,
		sport: 'nba',
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
	const bundle = snap.byGameId.get(numericId);
	if (!bundle) return null;
	const props = stats && stats.length ? bundle.props.filter((p) => stats.includes(p.stat)) : bundle.props;
	return {
		eventId,
		sport: 'nba',
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
