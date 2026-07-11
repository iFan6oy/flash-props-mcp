import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../env.js';
import * as schema from './schema.js';

// Ensure the data directory exists before opening the file.
const dir = dirname(env.DATABASE_URL);
if (dir && dir !== '.') mkdirSync(dir, { recursive: true });

const sqlite = new Database(env.DATABASE_URL);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

// Self-bootstrapping schema so deploy needs no migration step. Idempotent.
export function ensureSchema(): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS api_keys (
			id TEXT PRIMARY KEY,
			key_hash TEXT NOT NULL UNIQUE,
			key_prefix TEXT NOT NULL,
			tier TEXT NOT NULL DEFAULT 'free',
			label TEXT NOT NULL DEFAULT 'default',
			active INTEGER NOT NULL DEFAULT 1,
			customer_id TEXT,
			created_at INTEGER NOT NULL,
			last_used_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);
		CREATE TABLE IF NOT EXISTS usage_daily (
			key_id TEXT NOT NULL,
			day TEXT NOT NULL,
			count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (key_id, day)
		);
		CREATE TABLE IF NOT EXISTS crypto_orders (
			id TEXT PRIMARY KEY,
			reference TEXT NOT NULL UNIQUE,
			tier TEXT NOT NULL,
			months INTEGER NOT NULL,
			amount_usdc TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			key_id TEXT,
			signature TEXT,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			paid_at INTEGER
		);
	`);
	// Additive migration for the prepaid-expiry column on existing databases.
	try {
		sqlite.exec('ALTER TABLE api_keys ADD COLUMN expires_at INTEGER');
	} catch {
		/* column already exists */
	}
}

export { sqlite };
