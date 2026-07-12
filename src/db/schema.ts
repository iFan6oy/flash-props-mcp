import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

// API keys. We store only the HMAC-SHA256 hash of the key, never the key
// itself — the plaintext is shown to the user exactly once, at creation.
export const apiKeys = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey(), // key_<nanoid>
		keyHash: text('key_hash').notNull().unique(),
		keyPrefix: text('key_prefix').notNull(), // flash_live_ab12 — safe to display
		tier: text('tier').notNull().default('free'),
		label: text('label').notNull().default('default'),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		customerId: text('customer_id'), // Stripe customer, when billed
		email: text('email'), // customer email (Stripe checkout / free-key form) for delivery + recovery
		source: text('source'), // attribution: ?src= channel, or 'stripe' / 'crypto'
		expiresAt: integer('expires_at'), // prepaid crypto keys expire; null = no expiry
		createdAt: integer('created_at').notNull(),
		lastUsedAt: integer('last_used_at')
	},
	(t) => [index('api_keys_hash_idx').on(t.keyHash)]
);

// Prepaid crypto payment orders (Solana Pay / USDC).
export const cryptoOrders = sqliteTable('crypto_orders', {
	id: text('id').primaryKey(), // ord_<nanoid>
	chain: text('chain').notNull().default('solana'), // solana | base
	reference: text('reference').notNull().unique(), // solana: pubkey marker; base: order nonce
	tier: text('tier').notNull(),
	months: integer('months').notNull(),
	amountUsdc: text('amount_usdc').notNull(), // decimal string; base uses a unique micro-amount
	fromBlock: integer('from_block'), // base: block at order creation to scan from
	status: text('status').notNull().default('pending'), // pending | paid | expired
	keyId: text('key_id'), // set once provisioned
	signature: text('signature'), // paying tx signature / hash
	createdAt: integer('created_at').notNull(),
	expiresAt: integer('expires_at').notNull(), // order (payment window) expiry
	paidAt: integer('paid_at')
});

// Per-key, per-day request counter — backs the daily quota + basic analytics.
export const usageDaily = sqliteTable(
	'usage_daily',
	{
		keyId: text('key_id').notNull(),
		day: text('day').notNull(), // YYYY-MM-DD (UTC)
		count: integer('count').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.keyId, t.day] })]
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type UsageDailyRow = typeof usageDaily.$inferSelect;
