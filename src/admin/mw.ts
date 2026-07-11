import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

// Gate: requires ADMIN_TOKEN via `Authorization: Bearer` or `X-Admin-Token`.
// Admin is disabled entirely (503) unless a strong token is configured.
export const adminAuth = createMiddleware(async (c, next) => {
	if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16) {
		return c.json({ error: 'admin_disabled', message: 'Set a strong ADMIN_TOKEN (>=16 chars) to enable admin.' }, 503);
	}
	const auth = c.req.header('authorization');
	const bearer = auth && /^bearer\s+/i.test(auth) ? auth.slice(auth.indexOf(' ') + 1).trim() : '';
	const token = bearer || c.req.header('x-admin-token') || '';
	if (!token || !safeEqual(token, env.ADMIN_TOKEN)) {
		return c.json({ error: 'unauthorized', message: 'Invalid admin token.' }, 401);
	}
	await next();
});
