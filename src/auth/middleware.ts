import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { AppEnv } from '../app-env.js';
import { authenticateKey } from './keys.js';
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
// Validity + expiry live in authenticateKey (shared with the MCP handler).
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const auth = authenticateKey(extractKey(c));
	if (!auth.ok) return c.json(auth.body, auth.status);
	c.set('apiKey', auth.key);
	c.set('tier', tierOf(auth.key.tier));
	await next();
});
