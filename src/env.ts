import { z } from 'zod';

// Load .env if present (Node 20.12+/22+ builtin). No-op in prod where the
// environment is set directly by pm2 / the shell.
try {
	process.loadEnvFile();
} catch {
	/* no .env file — rely on the real environment */
}

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().int().positive().default(3860),
	PUBLIC_BASE_URL: z.string().url().default('http://localhost:3860'),
	DATABASE_URL: z.string().min(1).default('./data/flash-props.sqlite'),
	API_KEY_SECRET: z.string().min(1).default('dev-only-change-me-in-prod'),
	// Artificial staleness applied to free-tier responses (ms). 0 = realtime.
	FREE_TIER_DELAY_MS: z.coerce.number().int().nonnegative().default(300_000),
	// Stripe (phase 2)
	STRIPE_SECRET_KEY: z.string().default(''),
	STRIPE_WEBHOOK_SECRET: z.string().default(''),
	STRIPE_PRICE_STARTER: z.string().default(''),
	STRIPE_PRICE_PRO: z.string().default(''),
	// Crypto payments (Solana Pay, USDC). Crypto checkout is enabled only when
	// RECEIVE_WALLET is set. Revenue lands in RECEIVE_WALLET.
	SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
	RECEIVE_WALLET: z.string().default(''),
	USDC_MINT: z.string().default('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
	CRYPTO_DISCOUNT_PCT: z.coerce.number().min(0).max(90).default(10),
	// Base (EVM) USDC — enables when EVM_RECEIVE_WALLET is set.
	BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),
	EVM_RECEIVE_WALLET: z.string().default(''),
	USDC_BASE: z.string().default('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
	// Sale notifications — POSTed to this URL (Discord-compatible) on each paid key.
	NOTIFY_WEBHOOK: z.string().default('')
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
export const isProd = env.NODE_ENV === 'production';

// Production safety guards — fail fast rather than run insecurely.
const DEFAULT_SECRET = 'dev-only-change-me-in-prod';
if (isProd) {
	if (env.API_KEY_SECRET === DEFAULT_SECRET || env.API_KEY_SECRET.length < 32) {
		throw new Error(
			'Refusing to boot: API_KEY_SECRET must be a strong (>=32 char) value in production. Generate with: openssl rand -hex 32'
		);
	}
	if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
		console.warn('[warn] PUBLIC_BASE_URL is not https in production — keys/links will be shown over http.');
	}
	// Stripe: warn on partial config (silently-broken checkout is worse than off).
	if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
		console.warn('[warn] STRIPE_SECRET_KEY set but STRIPE_WEBHOOK_SECRET missing — subscription lifecycle webhooks will 503.');
	}
}
