import Stripe from 'stripe';
import { env } from '../env.js';
import type { TierId } from '../config/tiers.js';

// Lazily construct the Stripe client. Returns null when STRIPE_SECRET_KEY is
// unset so the rest of the app degrades gracefully (billing endpoints return a
// "not configured" page instead of crashing).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
	if (!env.STRIPE_SECRET_KEY) return null;
	if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY);
	return _stripe;
}

export function isStripeEnabled(): boolean {
	return !!env.STRIPE_SECRET_KEY;
}

// Paid tier → Stripe Price id (from env). Free/enterprise have no self-serve price.
export function priceIdForTier(tier: TierId): string | null {
	if (tier === 'starter') return env.STRIPE_PRICE_STARTER || null;
	if (tier === 'pro') return env.STRIPE_PRICE_PRO || null;
	return null;
}

// Reverse lookup for webhook subscription events.
export function tierForPrice(priceId: string | undefined | null): TierId | null {
	if (!priceId) return null;
	if (env.STRIPE_PRICE_STARTER && priceId === env.STRIPE_PRICE_STARTER) return 'starter';
	if (env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return 'pro';
	return null;
}
