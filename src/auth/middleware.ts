import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { AppEnv } from '../app-env.js';
import { resolveKey } from './keys.js';
import { tierOf } from '../config/tiers.js';

function extractKey(c: Context): string | null {
	const auth = c.req.header('authorization');
	if (auth && /^bearer\s+/i.test(auth)) return auth.slice(auth.indexOf(' ') + 1).trim();
	const xkey = c.req.header('x-api-key');
	if (xkey) return xkey.trim();
	const q = c.req.query('api_key');
	if (q) return q.trim();
	return null;
}

// Resolves the presented API key and stashes {apiKey, tier} on the context.
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const raw = extractKey(c);
	if (!raw) {
		return c.json(
			{
				error: 'missing_api_key',
				message:
					'Provide your key via `Authorization: Bearer <key>`, the `X-API-Key` header, or `?api_key=`. Get one at ' +
					'/.'
			},
			401
		);
	}
	const key = resolveKey(raw);
	if (!key) {
		return c.json({ error: 'invalid_api_key', message: 'API key is invalid, revoked, or inactive.' }, 401);
	}
	c.set('apiKey', key);
	c.set('tier', tierOf(key.tier));
	await next();
});
