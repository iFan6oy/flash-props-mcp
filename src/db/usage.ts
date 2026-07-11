import { and, eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { usageDaily } from './schema.js';

export function utcDay(ts = Date.now()): string {
	return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Atomically increment today's counter for a key and return the new total.
export function bumpUsage(keyId: string): number {
	const day = utcDay();
	db.insert(usageDaily)
		.values({ keyId, day, count: 1 })
		.onConflictDoUpdate({
			target: [usageDaily.keyId, usageDaily.day],
			set: { count: sql`${usageDaily.count} + 1` }
		})
		.run();
	const row = db
		.select({ count: usageDaily.count })
		.from(usageDaily)
		.where(and(eq(usageDaily.keyId, keyId), eq(usageDaily.day, day)))
		.get();
	return row?.count ?? 0;
}

export function getUsageToday(keyId: string): number {
	const row = db
		.select({ count: usageDaily.count })
		.from(usageDaily)
		.where(and(eq(usageDaily.keyId, keyId), eq(usageDaily.day, utcDay())))
		.get();
	return row?.count ?? 0;
}
