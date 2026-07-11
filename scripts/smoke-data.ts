// Quick smoke test of the data layer against live upstreams.
// Run: npx tsx scripts/smoke-data.ts
import { listGames, getProps, scanProps } from '../src/data/props';

async function probe(sport: string) {
	console.log(`\n=== ${sport.toUpperCase()} ===`);
	try {
		const games = await listGames(sport);
		console.log(`games: ${games.length}`);
		if (games[0]) {
			const g = games[0];
			console.log(`  first: ${g.awayTeam} @ ${g.homeTeam} [${g.source}] live=${g.live} id=${g.id}`);
			const props = await getProps(g.id, undefined, sport);
			console.log(`  props for ${g.id}: ${props?.props.length ?? 0}`);
			if (props?.props[0]) {
				const p = props.props[0];
				console.log(`    e.g. ${p.player} ${p.stat} ${p.line} (o ${p.overOdds} / u ${p.underOdds})`);
			}
		}
		const scan = await scanProps({ sport, limit: 3 });
		console.log(`scan rows: ${scan.length}`);
		for (const r of scan) console.log(`  • ${r.player} ${r.stat} ${r.line}  [${r.source}] ${r.awayTeam}@${r.homeTeam}`);
	} catch (err) {
		console.log(`  ERROR: ${err instanceof Error ? err.message : err}`);
	}
}

for (const s of ['nba', 'mlb', 'soccer']) {
	await probe(s);
}
console.log('\ndone');
