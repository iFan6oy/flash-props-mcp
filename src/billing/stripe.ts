import Stripe from 'stripe';
import { env } from '../env.js';

// Lazily construct the Stripe client. Returns null when STRIPE_SECRET_KEY is
// unset so the rest of the app degrades gracefully (billing endpoints return a
// "not configured" page instead of crashing).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
	if (!env.STRIPE_SECRET_KEY) return null;
	if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY);
	return _stripe;
}
