// Line movement archive. Change-based: recordSnapshot appends a row only when a
// prop's line/odds differ from what we last saw, so the table is a compact
// movement log (open + each move) instead of a full board re-dump every cycle.
// Archiving is best-effort and NEVER throws into the live API path.

import { and, eq, gte, asc, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { lineSnapshots } from '../db/schema.js';
import { env } from '../env.js';

export function snapshotsEnabled(): boolean {
	return env.LINE_SNAPSHOTS !== '0' && env.LINE_SNAPSHOTS.toLowerCase() !== 'false';
}

export interface SnapshotInput {
	sport: string;
	eventId: string;
	player: string;
	playerId?: string;
	team?: string | null;
	stat: string;
	line: number;
	overOdds?: number;
	underOdds?: number;
	startTime?: string;
}

// in-memory "last seen" per prop: key = sport|eventId|player|stat, value = signature
const lastSig = new Map<string, string>();
const keyOf = (r: { sport: string; eventId: string; player: string; stat: string }) =>
	`${r.sport}|${r.eventId}|${r.player}|${r.stat}`;
const sigOf = (r: SnapshotInput) => `${r.line}|${r.overOdds ?? ''}|${r.underOdds ?? ''}`;

// Seed the last-seen map from the newest row per prop at boot, so a restart
// doesn't re-snapshot the whole board as if every line just moved.
export function seedLineSnapshots(): void {
	if (!snapshotsEnabled()) return;
	try {
		// SQLite returns the row matching MAX(captured_at) for the bare columns.
		const rows = db
			.select({
				sport: lineSnapshots.sport,
				eventId: lineSnapshots.eventId,
				player: lineSnapshots.player,
				stat: lineSnapshots.stat,
				line: lineSnapshots.line,
				overOdds: lineSnapshots.overOdds,
				underOdds: lineSnapshots.underOdds,
				last: sql<number>`max(${lineSnapshots.capturedAt})`
			})
			.from(lineSnapshots)
			.groupBy(lineSnapshots.sport, lineSnapshots.eventId, lineSnapshots.player, lineSnapshots.stat)
			.all();
		for (const r of rows) lastSig.set(keyOf(r), `${r.line}|${r.overOdds ?? ''}|${r.underOdds ?? ''}`);
	} catch {
		/* empty table on first boot — nothing to seed */
	}
}

// Append a row for every prop whose line/odds changed since we last saw it.
// Returns how many rows were written. Never throws.
export function recordSnapshot(fetchedAt: number, source: string, rows: SnapshotInput[]): number {
	if (!snapshotsEnabled() || !rows.length) return 0;
	try {
		const changed: SnapshotInput[] = [];
		for (const r of rows) {
			const k = keyOf(r);
			const sig = sigOf(r);
			if (lastSig.get(k) !== sig) {
				changed.push(r);
				lastSig.set(k, sig);
			}
		}
		if (!changed.length) return 0;
		const values = changed.map((r) => ({
			capturedAt: fetchedAt,
			source,
			sport: r.sport,
			eventId: r.eventId,
			player: r.player,
			playerId: r.playerId ?? null,
			team: r.team ?? null,
			stat: r.stat,
			line: r.line,
			overOdds: r.overOdds ?? null,
			underOdds: r.underOdds ?? null,
			startTime: r.startTime ?? null,
			status: 'active'
		}));
		// Chunk to stay well under SQLite's bound-variable limit on any build.
		for (let i = 0; i < values.length; i += 100) db.insert(lineSnapshots).values(values.slice(i, i + 100)).run();
		return changed.length;
	} catch {
		return 0; // archiving must never break the live response
	}
}

// ---- read side: history + movement ----------------------------------------

interface RawRow {
	capturedAt: number;
	line: number;
	overOdds: number | null;
	underOdds: number | null;
	sport: string;
	eventId: string;
	player: string;
	playerId: string | null;
	team: string | null;
	stat: string;
	startTime: string | null;
}

interface Series {
	sport: string;
	eventId: string;
	player: string;
	playerId: string | null;
	team: string | null;
	stat: string;
	startTime: string | null;
	points: { capturedAt: number; line: number; overOdds: number | null; underOdds: number | null }[];
}

// Group flat rows (already ordered by captured_at asc) into per-prop series.
function groupSeries(rows: RawRow[]): Series[] {
	const map = new Map<string, Series>();
	for (const r of rows) {
		const k = `${r.eventId}|${r.player}|${r.stat}`;
		let s = map.get(k);
		if (!s) {
			s = {
				sport: r.sport,
				eventId: r.eventId,
				player: r.player,
				playerId: r.playerId,
				team: r.team,
				stat: r.stat,
				startTime: r.startTime,
				points: []
			};
			map.set(k, s);
		}
		s.points.push({ capturedAt: r.capturedAt, line: r.line, overOdds: r.overOdds, underOdds: r.underOdds });
	}
	return [...map.values()];
}

function summarize(s: Series) {
	const first = s.points[0];
	const last = s.points[s.points.length - 1];
	return {
		sport: s.sport,
		eventId: s.eventId,
		player: s.player,
		playerId: s.playerId,
		team: s.team,
		stat: s.stat,
		startTime: s.startTime,
		openedLine: first?.line ?? null,
		currentLine: last?.line ?? null,
		movement: first && last ? Math.round((last.line - first.line) * 100) / 100 : null,
		lastChangedAt: last?.capturedAt ?? null,
		points: s.points.length
	};
}

const SELECT_COLS = {
	capturedAt: lineSnapshots.capturedAt,
	line: lineSnapshots.line,
	overOdds: lineSnapshots.overOdds,
	underOdds: lineSnapshots.underOdds,
	sport: lineSnapshots.sport,
	eventId: lineSnapshots.eventId,
	player: lineSnapshots.player,
	playerId: lineSnapshots.playerId,
	team: lineSnapshots.team,
	stat: lineSnapshots.stat,
	startTime: lineSnapshots.startTime
};

// History for a specific prop (player + optional stat/event). Resolves to the
// single most-recently-active matching prop and returns its full change-log.
export function getPropHistory(opts: { sport?: string; player: string; stat?: string; eventId?: string; limit?: number }) {
	const conds: SQL[] = [];
	if (opts.sport) conds.push(eq(lineSnapshots.sport, opts.sport.toLowerCase()));
	conds.push(sql`lower(${lineSnapshots.player}) LIKE ${'%' + opts.player.toLowerCase() + '%'}`);
	if (opts.stat) conds.push(eq(lineSnapshots.stat, opts.stat));
	if (opts.eventId) conds.push(eq(lineSnapshots.eventId, opts.eventId));
	const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
	const rows = db
		.select(SELECT_COLS)
		.from(lineSnapshots)
		.where(and(...conds))
		.orderBy(asc(lineSnapshots.capturedAt))
		.limit(limit)
		.all() as RawRow[];
	const groups = groupSeries(rows);
	if (!groups.length) return { found: false as const, matchedProps: 0 };
	// Pick the group with the most recent activity (handles multi-day / ambiguous filters).
	groups.sort((a, b) => (b.points.at(-1)?.capturedAt ?? 0) - (a.points.at(-1)?.capturedAt ?? 0));
	const chosen = groups[0]!;
	return {
		found: true as const,
		matchedProps: groups.length,
		...summarize(chosen),
		history: chosen.points // chronological
	};
}

// Board-wide movers within a window. `sinceMs` = lookback in ms (capped upstream).
export function getMovement(opts: { sport?: string; stat?: string; sinceMs: number; limit?: number }) {
	const from = Date.now() - opts.sinceMs;
	const conds = [gte(lineSnapshots.capturedAt, from)];
	if (opts.sport) conds.push(eq(lineSnapshots.sport, opts.sport.toLowerCase()));
	if (opts.stat) conds.push(eq(lineSnapshots.stat, opts.stat));
	const rows = db
		.select(SELECT_COLS)
		.from(lineSnapshots)
		.where(and(...conds))
		.orderBy(asc(lineSnapshots.capturedAt))
		.limit(50000)
		.all() as RawRow[];
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
	const movers = groupSeries(rows)
		.map(summarize)
		.filter((m) => m.movement !== null && m.movement !== 0 && m.points > 1)
		.sort((a, b) => Math.abs(b.movement ?? 0) - Math.abs(a.movement ?? 0))
		.slice(0, limit);
	return { since: new Date(from).toISOString(), count: movers.length, movers };
}

// Total archived rows — handy for the status/health surfaces.
export function snapshotCount(): number {
	try {
		const row = db.select({ n: sql<number>`count(*)` }).from(lineSnapshots).get();
		return row?.n ?? 0;
	} catch {
		return 0;
	}
}
