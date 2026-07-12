import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPTransport } from '@hono/mcp';
import type { Context } from 'hono';
import { authenticateKey } from '../auth/keys.js';
import { tierOf } from '../config/tiers.js';
import { checkPerMinute, sweep } from '../rate-limit/limiter.js';
import { bumpUsage } from '../db/usage.js';
import { buildMcpServer } from './server.js';

export const mcpApp = new Hono();

// Active MCP sessions keyed by the SDK-issued session id. A session is created
// on the initialize request and reused (via the mcp-session-id header) for all
// following tool calls — the stateful Streamable-HTTP pattern real clients use.
const sessions = new Map<string, StreamableHTTPTransport>();

function extractKey(c: Context): string | null {
	const auth = c.req.header('authorization');
	if (auth && /^bearer\s+/i.test(auth)) return auth.slice(auth.indexOf(' ') + 1).trim();
	return c.req.header('x-api-key') || c.req.query('api_key') || null;
}

mcpApp.all('/', async (c) => {
	// Same validity + prepaid-expiry enforcement as REST (shared authenticateKey),
	// so an expired crypto key no longer keeps working over MCP.
	const auth = authenticateKey(extractKey(c));
	if (!auth.ok) return c.json(auth.body, auth.status);
	const key = auth.key;
	const tier = tierOf(key.tier);

	// Meter actual JSON-RPC calls (POST), not SSE stream opens / session closes.
	if (c.req.method === 'POST') {
		sweep();
		const rl = checkPerMinute(key.id, tier.requestsPerMinute);
		if (!rl.ok) {
			c.header('Retry-After', String(rl.retryAfter ?? 60));
			return c.json({ error: 'rate_limited', message: `Rate limit exceeded (${tier.requestsPerMinute}/min).` }, 429);
		}
		bumpUsage(key.id);
	}

	// Reuse an established session.
	const sessionId = c.req.header('mcp-session-id');
	if (sessionId) {
		const existing = sessions.get(sessionId);
		if (existing) return existing.handleRequest(c);
		return c.json({ error: 'unknown_session', message: 'MCP session not found. Re-initialize.' }, 404);
	}

	// New session (the initialize request). Tier is bound at creation.
	const transport = new StreamableHTTPTransport({
		sessionIdGenerator: () => randomUUID(),
		enableJsonResponse: true,
		onsessioninitialized: (sid) => {
			sessions.set(sid, transport);
		}
	});
	transport.onclose = () => {
		if (transport.sessionId) sessions.delete(transport.sessionId);
	};
	const server = buildMcpServer(tier);
	await server.connect(transport);
	return transport.handleRequest(c);
});
