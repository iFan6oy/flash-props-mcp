import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app-env.js';
import { checkPerMinute, sweep } from './limiter.js';
import { bumpUsage } from '../db/usage.js';

// Enforces per-minute burst + per-day quota for the authed key's tier, and
// sets standard rate-limit response headers. Runs AFTER authMiddleware.
export const rateLimitMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const key = c.get('apiKey');
	const tier = c.get('tier');
	sweep();

	// Per-minute burst limit
	const rl = checkPerMinute(key.id, tier.requestsPerMinute);
	c.header('X-RateLimit-Limit', String(tier.requestsPerMinute));
	c.header('X-RateLimit-Remaining', String(rl.remaining));
	c.header('X-RateLimit-Reset', String(Math.floor(rl.resetAt / 1000)));
	if (!rl.ok) {
		c.header('Retry-After', String(rl.retryAfter ?? 60));
		return c.json(
			{
				error: 'rate_limited',
				message: `Rate limit exceeded: ${tier.requestsPerMinute} requests/minute on the ${tier.name} tier.`,
				retryAfterSeconds: rl.retryAfter
			},
			429
		);
	}

	// Per-day quota (persisted)
	const used = bumpUsage(key.id);
	c.header('X-RateLimit-Daily-Limit', String(tier.requestsPerDay));
	c.header('X-RateLimit-Daily-Remaining', String(Math.max(0, tier.requestsPerDay - used)));
	if (used > tier.requestsPerDay) {
		return c.json(
			{
				error: 'quota_exceeded',
				message: `Daily quota exceeded: ${tier.requestsPerDay} requests/day on the ${tier.name} tier. Upgrade your plan or wait for the UTC daily reset.`
			},
			429
		);
	}

	await next();
});
