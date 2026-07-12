import { createHmac, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import type { TierId } from '../config/tiers.js';

export interface KeyRecord {
	id: string;
	tier: TierId;
	label: string;
	keyPrefix: string;
	expiresAt: number | null; // epoch ms; null = never expires
}

// Key format: flash_<live|test>_<~32 url-safe chars>. Only the prefix is ever
// stored/displayed in plaintext; the full key is HMAC-hashed at rest.
export function generateKey(mode: 'live' | 'test' = 'live'): { key: string; prefix: string } {
	const secret = randomBytes(24).toString('base64url');
	const key = `flash_${mode}_${secret}`;
	return { key, prefix: key.slice(0, 16) };
}

export function hashKey(key: string): string {
	return createHmac('sha256', env.API_KEY_SECRET).update(key).digest('hex');
}

export function createApiKey(
	opts: {
		tier?: TierId;
		label?: string;
		mode?: 'live' | 'test';
		customerId?: string;
		email?: string | null;
		source?: string | null;
		expiresAt?: number | null;
	} = {}
): { record: KeyRecord; key: string } {
	const mode = opts.mode ?? (env.NODE_ENV === 'production' ? 'live' : 'test');
	const { key, prefix } = generateKey(mode);
	const id = `key_${nanoid(16)}`;
	const tier = opts.tier ?? 'free';
	const label = opts.label ?? 'default';
	const expiresAt = opts.expiresAt ?? null;
	db.insert(apiKeys)
		.values({
			id,
			keyHash: hashKey(key),
			keyPrefix: prefix,
			tier,
			label,
			active: true,
			customerId: opts.customerId ?? null,
			email: opts.email ?? null,
			source: opts.source ?? null,
			expiresAt,
			createdAt: Date.now()
		})
		.run();
	return { record: { id, tier, label, keyPrefix: prefix, expiresAt }, key };
}

// Resolve a presented key to its record. Returns null for unknown/revoked keys.
export function resolveKey(rawKey: string): KeyRecord | null {
	if (!rawKey) return null;
	const row = db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashKey(rawKey))).get();
	if (!row || !row.active) return null;
	db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, row.id)).run();
	return { id: row.id, tier: row.tier as TierId, label: row.label, keyPrefix: row.keyPrefix, expiresAt: row.expiresAt };
}

export function revokeKey(id: string): boolean {
	const res = db.update(apiKeys).set({ active: false }).where(eq(apiKeys.id, id)).run();
	return res.changes > 0;
}

export type AuthResult =
	| { ok: true; key: KeyRecord }
	| { ok: false; status: 401 | 402; body: { error: string; message: string; expiredAt?: string } };

// Single source of truth for authenticating a presented key: presence → validity
// → prepaid expiry. BOTH the REST middleware and the MCP handler call this so the
// two transports enforce identical rules. (They diverged before: REST checked
// `expiresAt` but MCP called `resolveKey` directly, so an expired prepaid crypto
// key kept working forever over MCP. Centralizing here closes that gap for good.)
export function authenticateKey(raw: string | null): AuthResult {
	if (!raw) {
		return {
			ok: false,
			status: 401,
			body: {
				error: 'missing_api_key',
				message:
					'Provide your key via `Authorization: Bearer <key>`, the `X-API-Key` header, or `?api_key=`. Get one at /.'
			}
		};
	}
	const key = resolveKey(raw);
	if (!key) {
		return { ok: false, status: 401, body: { error: 'invalid_api_key', message: 'API key is invalid, revoked, or inactive.' } };
	}
	if (key.expiresAt !== null && Date.now() > key.expiresAt) {
		return {
			ok: false,
			status: 402,
			body: {
				error: 'key_expired',
				message: 'This prepaid key has expired. Renew with crypto at /billing/crypto or subscribe at /.',
				expiredAt: new Date(key.expiresAt).toISOString()
			}
		};
	}
	return { ok: true, key };
}
