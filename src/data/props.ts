// Unified props facade over the upstream props board. This is the data engine
// the API endpoints call. The primary source (Underdog) carries PRE-GAME props
// across every supported sport (traditional leagues + tennis + esports). A
// secondary source (Bovada) can add live in-game lines where it's reachable —
// but it currently returns empty from the VPS, so responses are pre-game in
// practice. Nothing here fabricates data: no source = empty, never faked.

import { normName } from './types.js';
import type { GameRef, PropsResult, ScanRow } from './types.js';
import { listUnderdogGames, getUnderdogProps } from './underdog.js';
import { listBovadaGames, getBovadaProps, bovadaSupportsSport } from './bovada.js';

// List today's games for a sport, merged across free books. Underdog carries
// every sport it posts (pre-game) and is reachable from the VPS; Bovada adds
// live in-game lines where it isn't IP-blocked.
export async function listGames(sport = 'nba'): Promise<GameRef[]> {
	const tasks: Promise<GameRef[]>[] = [listUnderdogGames(sport).catch(() => [])];
	if (bovadaSupportsSport(sport)) tasks.push(listBovadaGames(sport).catch(() => []));
	const lists = await Promise.all(tasks);
	return dedupeGames(lists.flat());
}

// Collapse exact-duplicate ids only. Distinct sources for the same matchup are
// intentionally kept — their lines differ, which is the point (line shopping).
// Sort: live games first, then earliest start.
function dedupeGames(games: GameRef[]): GameRef[] {
	const seen = new Set<string>();
	const out: GameRef[] = [];
	for (const g of games) {
		if (seen.has(g.id)) continue;
		seen.add(g.id);
		out.push(g);
	}
	out.sort(
		(a, b) => Number(b.live) - Number(a.live) || (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0)
	);
	return out;
}

export async function getProps(eventId: string, stats?: string[], sport = 'nba'): Promise<PropsResult | null> {
	if (eventId.startsWith('ud-')) return getUnderdogProps(eventId, stats);
	if (eventId.startsWith('bv-')) return getBovadaProps(eventId, stats, sport);
	return null;
}

// Market-wide scan — the "flow" feed. Flattens every prop across today's games
// into rows, optionally filtered by stat, sorted (live first) and capped.
export async function scanProps(opts: { sport?: string; stat?: string; limit?: number } = {}): Promise<ScanRow[]> {
	const sport = opts.sport || 'nba';
	const games = await listGames(sport);
	const results = await Promise.all(games.map((g) => getProps(g.id, undefined, sport).catch(() => null)));

	const rows: ScanRow[] = [];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const g = games[i];
		if (!r || !g) continue;
		for (const p of r.props) {
			if (opts.stat && p.stat !== opts.stat) continue;
			rows.push({
				...p,
				eventId: r.eventId,
				sport: r.sport,
				homeTeam: r.homeTeam,
				awayTeam: r.awayTeam,
				startTime: r.startTime,
				source: g.source
			});
		}
	}

	rows.sort(
		(a, b) => Number(b.gameState === 'live') - Number(a.gameState === 'live') || a.player.localeCompare(b.player)
	);
	const limit = opts.limit && opts.limit > 0 ? opts.limit : rows.length;
	return rows.slice(0, limit);
}

// Resolve a matchup (by team names) to an event id — Bovada preferred.
export async function resolveEvent(query: { home?: string; away?: string; sport?: string }): Promise<string | null> {
	if (!query.home || !query.away) return null;
	const games = await listGames(query.sport || 'nba');
	const h = normName(query.home);
	const a = normName(query.away);
	const match = games.find((g) => {
		const gh = normName(g.homeTeam);
		const ga = normName(g.awayTeam);
		return (gh.includes(h) || h.includes(gh)) && (ga.includes(a) || a.includes(ga));
	});
	return match?.id ?? null;
}
