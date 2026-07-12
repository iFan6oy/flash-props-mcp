import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { createApiKey, hashKey } from '../auth/keys.js';
import type { TierId } from '../config/tiers.js';

export function keysForCustomer(customerId: string) {
	return db.select().from(apiKeys).where(eq(apiKeys.customerId, customerId)).all();
}

// Map a presented raw key back to its Stripe customer id (for the billing
// portal). Returns null for unknown keys or keys with no linked customer
// (free / crypto keys have no Stripe subscription to manage).
export function customerIdForKey(rawKey: string): string | null {
	if (!rawKey) return null;
	const row = db.select({ customerId: apiKeys.customerId }).from(apiKeys).where(eq(apiKeys.keyHash, hashKey(rawKey))).get();
	return row?.customerId ?? null;
}

// Idempotently ensure a customer has an active key at the given tier. Returns
// the plaintext key ONLY when freshly created (we never store plaintext, so a
// pre-existing key can't be re-shown — only its prefix). Safe to call from BOTH
// the checkout.session.completed webhook and the /billing/success redirect: the
// first one wins and creates; the second sees the existing key and no-ops.
export function provisionForCustomer(
	customerId: string,
	tier: TierId,
	email?: string | null
): { key?: string; prefix: string; created: boolean; keyId?: string } {
	const active = keysForCustomer(customerId).filter((k) => k.active);
	const existing = active[0];
	if (existing) {
		const set: { tier?: TierId; email?: string } = {};
		if (existing.tier !== tier) set.tier = tier;
		if (email && !existing.email) set.email = email; // backfill email if we learned it later
		if (Object.keys(set).length) db.update(apiKeys).set(set).where(eq(apiKeys.id, existing.id)).run();
		return { prefix: existing.keyPrefix, created: false, keyId: existing.id };
	}
	const { record, key } = createApiKey({
		tier,
		label: 'subscription',
		mode: 'live',
		customerId,
		email: email ?? null,
		source: 'stripe'
	});
	return { key, prefix: record.keyPrefix, created: true, keyId: record.id };
}

export function revokeForCustomer(customerId: string): number {
	return db.update(apiKeys).set({ active: false }).where(eq(apiKeys.customerId, customerId)).run().changes;
}

export function setTierForCustomer(customerId: string, tier: TierId): number {
	return db.update(apiKeys).set({ tier }).where(eq(apiKeys.customerId, customerId)).run().changes;
}
