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
		createdAt: integer('created_at').notNull(),
		lastUsedAt: integer('last_used_at')
	},
	(t) => [index('api_keys_hash_idx').on(t.keyHash)]
);

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
