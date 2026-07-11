import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { createApiKey } from '../auth/keys.js';
import type { TierId } from '../config/tiers.js';

export function keysForCustomer(customerId: string) {
	return db.select().from(apiKeys).where(eq(apiKeys.customerId, customerId)).all();
}

// Idempotently ensure a customer has an active key at the given tier. Returns
// the plaintext key ONLY when freshly created (we never store plaintext, so a
// pre-existing key can't be re-shown — only its prefix).
export function provisionForCustomer(
	customerId: string,
	tier: TierId
): { key?: string; prefix: string; created: boolean } {
	const active = keysForCustomer(customerId).filter((k) => k.active);
	const existing = active[0];
	if (existing) {
		if (existing.tier !== tier) db.update(apiKeys).set({ tier }).where(eq(apiKeys.id, existing.id)).run();
		return { prefix: existing.keyPrefix, created: false };
	}
	const { record, key } = createApiKey({ tier, label: 'subscription', mode: 'live', customerId });
	return { key, prefix: record.keyPrefix, created: true };
}

export function revokeForCustomer(customerId: string): number {
	return db.update(apiKeys).set({ active: false }).where(eq(apiKeys.customerId, customerId)).run().changes;
}

export function setTierForCustomer(customerId: string, tier: TierId): number {
	return db.update(apiKeys).set({ tier }).where(eq(apiKeys.customerId, customerId)).run().changes;
}
