// Bovada sportsbook adapter — free public endpoint, no auth, reachable from
// datacenter IPs. Carries LIVE in-progress props for NBA / NFL / NHL / MLB /
// NCAA / soccer — covers games (and in-game lines) Underdog does not.
// Ported from the flash-odds hub; ESPN photo enrichment dropped for latency
// (we keep Underdog's free headshot map only).
//
// Feed: https://www.bovada.lv/services/sports/event/coupon/events/A/description/<path>
//   [ { events[] } ]  →  event.displayGroups[].markets[].outcomes[]
//   market.description = "Total Points - Aaron Gordon (DEN)"
//   outcome.price = { handicap: "24.5", american: "-115" }

import { BROWSER_UA, normName } from './types.js';
import type { GameRef, PlayerProp, PropsResult, PropStat } from './types.js';
import { getUnderdogPhotoMap } from './underdog.js';

const SNAPSHOT_TTL_MS = 60 * 1000; // 1 min — live lines move fast

const SPORT_PATH: Record<string, string> = {
	nba: 'basketball/nba',
	ncaab: 'basketball/college-basketball',
	cbb: 'basketball/college-basketball',
	nfl: 'football/nfl',
	ncaaf: 'football/college-football',
	cfb: 'football/college-football',
	nhl: 'hockey/nhl',
	mlb: 'baseball/mlb',
	soccer: 'soccer'
};

export function bovadaSupportsSport(sport: string): boolean {
	return !!SPORT_PATH[sport.toLowerCase()];
}

// Bovada stat name → our vocabulary. NBA maps to canonical stats; other
// sports pass through as descriptive strings the UI can label generically.
function normalizeStat(raw: string): PropStat | null {
	const d = raw.toLowerCase();
	// NBA
	if (/\bpoint/.test(d) && !/3-point/.test(d)) return 'points';
	if (/\brebound/.test(d)) return 'rebounds';
	if (/\bassist/.test(d)) return 'assists';
	if (/(3-point|three-point|3 point|threes)/.test(d)) return 'threes';
	if (/pts\s*\+\s*rebs\s*\+\s*asts|points rebounds assists/.test(d)) return 'pra';
	// NFL
	if (/passing yards|pass yds/.test(d)) return 'passing_yards';
	if (/rushing yards|rush yds/.test(d)) return 'rushing_yards';
	if (/receiving yards|recv yds|rec yds/.test(d)) return 'receiving_yards';
	if (/passing tds?\b/.test(d)) return 'passing_tds';
	if (/touchdown/.test(d)) return 'touchdowns';
	if (/reception/.test(d)) return 'receptions';
	if (/interception/.test(d)) return 'interceptions';
	// NHL
	if (/\bgoals?\b/.test(d)) return 'goals';
	if (/\bshots?\b/.test(d)) return 'shots';
	if (/\bsaves?\b/.test(d)) return 'saves';
	// MLB
	if (/\bhits?\b/.test(d)) return 'hits';
	if (/\brbis?\b/.test(d)) return 'rbis';
	if (/\bstrikeouts?\b/.test(d)) return 'strikeouts';
	if (/home runs?/.test(d)) return 'home_runs';
	if (/total bases/.test(d)) return 'total_bases';
	return null;
}

// Bovada startTime is epoch milliseconds; convert to ISO, tolerate junk.
function isoFromEpoch(v: unknown): string {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return '';
	const d = new Date(n);
	return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// "Total Points - Aaron Gordon (DEN)" → { player, team }
function parsePlayerFromMarket(desc: string): { player: string; team: string } | null {
	const m = desc.match(/^(?:[A-Za-z0-9 +&/-]+?)\s*-\s*([^(]+?)\s*\(([A-Z0-9]{2,5})\)\s*$/);
	if (!m) return null;
	return { player: m[1]!.trim(), team: m[2]!.trim() };
}

interface Bundle {
	gameId: string;
	sport: string;
	homeTeam: string;
	awayTeam: string;
	startTime: string;
	props: PlayerProp[];
	isLive: boolean;
}
interface Snapshot {
	byGameId: Map<string, Bundle>;
	fetchedAt: number;
}

const snapshotCache = new Map<string, Snapshot>();

export async function getBovadaSnapshot(sport = 'nba'): Promise<Snapshot> {
	const path = SPORT_PATH[sport.toLowerCase()];
	if (!path) throw new Error(`unsupported sport: ${sport}`);
	const cached = snapshotCache.get(sport);
	if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) return cached;

	const url = `https://www.bovada.lv/services/sports/event/coupon/events/A/description/${path}`;
	const res = await fetch(url, {
		headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' }
	});
	if (!res.ok) throw new Error(`Bovada ${res.status}`);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const data: any = await res.json();

	const photoMap = await getUnderdogPhotoMap().catch(() => new Map<string, string>());
	const byGameId = new Map<string, Bundle>();

	for (const bucket of Array.isArray(data) ? data : []) {
		for (const e of bucket.events || []) {
			const desc = String(e.description || '');
			const matchup = desc.split(/\s+@\s+/);
			if (matchup.length !== 2) continue;
			const away = matchup[0]!.trim();
			const home = matchup[1]!.trim();
			const isLive = !!e.live;
			const props: PlayerProp[] = [];

			for (const g of e.displayGroups || []) {
				const groupDesc = String(g.description || '');
				for (const m of g.markets || []) {
					const marketDesc = String(m.description || '');
					const stat = normalizeStat(marketDesc + ' ' + groupDesc);
					if (!stat) continue;
					const parsed = parsePlayerFromMarket(marketDesc);
					if (!parsed) continue;
					const outcomes = m.outcomes || [];
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const over = outcomes.find((o: any) => /over/i.test(o.description));
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const under = outcomes.find((o: any) => /under/i.test(o.description));
					if (!over) continue;
					const handicap = Number((over.price || {}).handicap);
					if (!Number.isFinite(handicap)) continue;
					const overOdds = Number((over.price || {}).american);
					const underOdds = under ? Number((under.price || {}).american) : undefined;
					if (props.find((p) => p.player === parsed.player && p.stat === stat)) continue;
					props.push({
						player: parsed.player,
						stat,
						line: handicap,
						overOdds: Number.isFinite(overOdds) ? overOdds : undefined,
						underOdds: Number.isFinite(underOdds as number) ? (underOdds as number) : undefined,
						bookCount: 1,
						photoUrl: photoMap.get(normName(parsed.player)) || '',
						playerId: '',
						gameState: isLive ? 'live' : 'pre'
					});
				}
			}

			if (props.length === 0) continue;
			const bundle: Bundle = {
				gameId: `bv-${e.id}`,
				sport,
				homeTeam: home,
				awayTeam: away,
				startTime: isoFromEpoch(e.startTime),
				props,
				isLive
			};
			byGameId.set(bundle.gameId, bundle);
		}
	}

	const snap: Snapshot = { byGameId, fetchedAt: Date.now() };
	snapshotCache.set(sport, snap);
	return snap;
}

export async function listBovadaGames(sport = 'nba'): Promise<GameRef[]> {
	if (!bovadaSupportsSport(sport)) return [];
	const snap = await getBovadaSnapshot(sport);
	return Array.from(snap.byGameId.values()).map((b) => ({
		id: b.gameId,
		sport: b.sport,
		homeTeam: b.homeTeam,
		awayTeam: b.awayTeam,
		startTime: b.startTime,
		live: b.isLive,
		source: 'bovada' as const
	}));
}

export async function getBovadaProps(eventId: string, stats?: string[], sport = 'nba'): Promise<PropsResult | null> {
	if (!eventId.startsWith('bv-')) return null;
	// Search the requested sport first, then any other cached sports.
	const sportsToTry = [sport, ...Array.from(snapshotCache.keys()).filter((s) => s !== sport)];
	let bundle: Bundle | undefined;
	let fetchedAt = Date.now();
	for (const sp of sportsToTry) {
		if (!bovadaSupportsSport(sp)) continue;
		const snap = await getBovadaSnapshot(sp);
		const b = snap.byGameId.get(eventId);
		if (b) {
			bundle = b;
			fetchedAt = snap.fetchedAt;
			break;
		}
	}
	if (!bundle) return null;
	const filtered = stats && stats.length ? bundle.props.filter((p) => stats.includes(p.stat)) : bundle.props;
	return {
		eventId,
		sport: bundle.sport,
		homeTeam: bundle.homeTeam,
		awayTeam: bundle.awayTeam,
		startTime: bundle.startTime,
		props: filtered.length ? filtered : bundle.props,
		sources: ['bovada'],
		fetchedAt
	};
}
