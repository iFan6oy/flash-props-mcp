import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppEnv } from './app-env.js';
import { env } from './env.js';
import { ensureSchema } from './db/client.js';
import { seedLineSnapshots, snapshotsEnabled } from './data/snapshots.js';
import { getUnderdogSnapshot } from './data/underdog.js';
import { v1 } from './routes/v1.js';
import { meta } from './routes/meta.js';
import { mcpApp } from './mcp/http.js';
import { billing } from './billing/routes.js';
import { admin } from './admin/routes.js';

ensureSchema();
seedLineSnapshots();

// Keep the line-movement archive accruing even with zero traffic: warm the board
// once, then refresh on a fixed cadence. Each fresh fetch archives changed lines
// (a no-op when nothing moved). Best-effort — failures never affect serving.
if (snapshotsEnabled()) {
	void getUnderdogSnapshot().catch(() => {});
	setInterval(() => void getUnderdogSnapshot().catch(() => {}), env.SNAPSHOT_POLL_MS);
}

const app = new OpenAPIHono<AppEnv>();

app.use('*', logger());
app.use('/api/*', cors());

app.get('/health', (c) => c.json({ ok: true, service: 'flash-props-api', ts: Date.now() }));

// API v1
app.route('/api/v1', v1);

// Model Context Protocol endpoint (streamable HTTP)
app.route('/mcp', mcpApp);

// Billing: Stripe checkout, success, self-serve free key, webhook
app.route('/billing', billing);

// Admin dashboard + gated API (revoke/issue keys, view sales)
app.route('/admin', admin);

// Security scheme for the generated spec
app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
	type: 'http',
	scheme: 'bearer',
	description: 'Your Flash Props API key. Send it as `Authorization: Bearer flash_live_...`.'
});

// OpenAPI 3.1 document
app.doc31('/openapi.json', {
	openapi: '3.1.0',
	info: {
		title: 'Flash Props API',
		version: '0.1.0',
		description:
			'Player-prop lines (over/under) from the props board, unified into one clean REST + MCP feed. ' +
			'Pre-game props across MLB, NFL, NBA, NHL, NCAA, soccer, tennis, and esports (CS2, Valorant, Dota 2, Call of Duty). ' +
			'Coverage varies by sport, season, and upstream availability. Built by Flash AI Solutions.'
	},
	servers: [{ url: env.PUBLIC_BASE_URL, description: env.NODE_ENV }],
	security: [{ BearerAuth: [] }]
});

// Interactive docs (Scalar)
app.get(
	'/docs',
	Scalar({
		url: '/openapi.json',
		pageTitle: 'Flash Props API — Reference',
		theme: 'purple'
	})
);

// Public landing page + agent-discovery files (/, /skill.md, /llms.txt)
app.route('/', meta);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`\nflash-props-api listening on http://localhost:${info.port}`);
	console.log(`  landing: ${env.PUBLIC_BASE_URL}/`);
	console.log(`  docs:    ${env.PUBLIC_BASE_URL}/docs`);
	console.log(`  openapi: ${env.PUBLIC_BASE_URL}/openapi.json`);
	console.log(`  api:     ${env.PUBLIC_BASE_URL}/api/v1/games?sport=mlb\n`);
});

// Graceful shutdown for pm2 / Ctrl-C
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		server.close();
		process.exit(0);
	});
}

export { app };
