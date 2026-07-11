// Tier gating applied to data before it leaves the API. The sellable
// difference: paid tiers get realtime + live in-game props; the free tier gets
// pre-game lines only, flagged `delayed`.
import type { Tier } from '../config/tiers.js';
import type { GameRef, PropsResult, ScanRow } from '../data/types.js';

export function gateGames(tier: Tier, games: GameRef[]): GameRef[] {
	return tier.realtime ? games : games.filter((g) => !g.live);
}

export function gateProps(tier: Tier, r: PropsResult): PropsResult & { delayed: boolean } {
	if (tier.realtime) return { ...r, delayed: false };
	return { ...r, props: r.props.filter((p) => p.gameState !== 'live'), delayed: true };
}

export function gateScan(tier: Tier, rows: ScanRow[]): ScanRow[] {
	const filtered = tier.realtime ? rows : rows.filter((r) => r.gameState !== 'live');
	return filtered.slice(0, tier.scanLimit);
}
