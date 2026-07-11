import type { KeyRecord } from './auth/keys.js';
import type { Tier } from './config/tiers.js';

// Shared Hono generics: what auth/rate-limit middleware put on the context.
export type AppEnv = {
	Variables: {
		apiKey: KeyRecord;
		tier: Tier;
	};
};
