// Minimal self-serve customer dashboard. Auth is a passwordless magic link sent
// to the email captured at key creation (api_keys.email). No passwords, no new
// account model — just "prove you own this email, then manage the keys under it."
import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env, isProd } from '../env.js';
import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { createApiKey, revokeKey } from '../auth/keys.js';
import { getUsageToday } from '../db/usage.js';
import { TIERS, tierOf, type TierId } from '../config/tiers.js';
import { getStripe } from '../billing/stripe.js';
import { sendMagicLink } from '../email.js';
import { shell } from './shell.js';

export const dashboard = new Hono();

const BASE = env.PUBLIC_BASE_URL;
const COOKIE = 'fp_dash';
const LINK_TTL = 30 * 60 * 1000; // magic link: 30 min
const SESSION_TTL = 2 * 60 * 60 * 1000; // dashboard session: 2 h

// --- signed tokens (magic link + session cookie) ---------------------------
function sign(payload: string): string {
	return createHmac('sha256', env.API_KEY_SECRET).update(payload).digest('base64url');
}
function makeToken(email: string, ttlMs: number): string {
	const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + ttlMs })).toString('base64url');
	return `${payload}.${sign(payload)}`;
}
function readToken(token: string | undefined): string | null {
	if (!token) return null;
	const dot = token.indexOf('.');
	if (dot < 0) return null;
	const payload = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = sign(payload);
	if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
	try {
		const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString());
		if (typeof e !== 'string' || typeof x !== 'number' || Date.now() > x) return null;
		return e;
	} catch {
		return null;
	}
}

// --- data ------------------------------------------------------------------
function keysByEmail(email: string) {
	return db.select().from(apiKeys).where(eq(apiKeys.email, email)).all();
}
function sessionEmail(c: Context): string | null {
	return readToken(getCookie(c, COOKIE));
}
function esc(s: string): string {
	return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}
function fmtDate(ms: number | null): string {
	return ms ? new Date(ms).toISOString().slice(0, 10) : '—';
}

// --- shared shell (premium chrome from routes/shell.ts) --------------------
function page(title: string, inner: string): string {
	return shell(title, inner, { active: 'dashboard', narrow: true });
}

// --- login (email form) ----------------------------------------------------
function loginPage(msg = ''): string {
	return page(
		'Dashboard',
		`<div class="box">
      <h1>Your Flash Props dashboard</h1>
      <p class="mut">Enter the email on your account and we'll send a one-click sign-in link.</p>
      ${msg ? `<div class="warn">${esc(msg)}</div>` : ''}
      <form method="POST" action="/dashboard/login">
        <input type="email" name="email" required placeholder="you@example.com" autocomplete="email"/>
        <button type="submit" style="width:100%">Email me a sign-in link</button>
      </form>
      <p class="mut small" style="margin-top:12px">No account yet? <a href="/billing/free">Get a free key</a>.</p>
    </div>`
	);
}

dashboard.get('/', (c) => c.html(loginPage()));

dashboard.post('/login', async (c) => {
	const form = await c.req.parseBody();
	const email = String(form.email || '')
		.trim()
		.toLowerCase();
	// Only send if this email actually has a key — but never reveal which do (no enumeration).
	if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && keysByEmail(email).length) {
		const link = `${BASE}/dashboard/view?token=${encodeURIComponent(makeToken(email, LINK_TTL))}`;
		void sendMagicLink(email, link);
		if (!isProd) console.log('[dashboard] magic link:', link); // dev convenience
	}
	return c.html(
		page(
			'Check your email',
			`<div class="box"><h1>Check your email</h1><p class="mut">If <b>${esc(email)}</b> has a Flash Props key, a sign-in link is on its way. It expires in 30 minutes.</p><a href="/dashboard">← Back</a></div>`
		)
	);
});

// --- magic-link landing: verify token, set session cookie ------------------
dashboard.get('/view', (c) => {
	const email = readToken(c.req.query('token'));
	if (!email) return c.html(loginPage('That sign-in link is invalid or expired. Request a new one.'), 400);
	setCookie(c, COOKIE, makeToken(email, SESSION_TTL), {
		httpOnly: true,
		secure: isProd,
		sameSite: 'Lax',
		path: '/dashboard',
		maxAge: SESSION_TTL / 1000
	});
	return c.redirect('/dashboard/home');
});

dashboard.get('/logout', (c) => {
	deleteCookie(c, COOKIE, { path: '/dashboard' });
	return c.redirect('/dashboard');
});

// --- the dashboard ---------------------------------------------------------
function dashboardHome(email: string): string {
	const keys = keysByEmail(email).sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);
	const hasPaid = keys.some((k) => k.active && k.customerId);
	const cards = keys.length
		? keys
				.map((k) => {
					const t = tierOf(k.tier);
					const used = getUsageToday(k.id);
					const pct = Math.min(100, Math.round((used / Math.max(1, t.requestsPerDay)) * 100));
					const remaining = Math.max(0, t.requestsPerDay - used);
					const status = k.active ? '<span class="pill on">active</span>' : '<span class="pill off">revoked</span>';
					const actions = k.active
						? `<div class="actions">
                 <form method="POST" action="/dashboard/rotate"><input type="hidden" name="keyId" value="${esc(k.id)}"/><button class="ghost" onclick="return confirm('Rotate this key? The old one stops working immediately.')">Rotate</button></form>
                 <form method="POST" action="/dashboard/revoke"><input type="hidden" name="keyId" value="${esc(k.id)}"/><button class="danger" onclick="return confirm('Revoke this key? This cannot be undone.')">Revoke</button></form>
               </div>`
						: '';
					return `<div class="card">
            <div class="row"><div><code>${esc(k.keyPrefix)}…</code> &nbsp; ${status}</div><div class="meta">${t.name}</div></div>
            <div class="meta">Created ${fmtDate(k.createdAt)}${k.expiresAt ? ` · expires ${fmtDate(k.expiresAt)}` : ''}${k.lastUsedAt ? ` · last used ${fmtDate(k.lastUsedAt)}` : ''}</div>
            <div class="meta">Today: <b style="color:var(--ink)">${used.toLocaleString()}</b> / ${t.requestsPerDay.toLocaleString()} requests · ${remaining.toLocaleString()} left</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
            ${actions}
          </div>`;
				})
				.join('')
		: `<div class="card mut">No keys found for this email.</div>`;
	return page(
		'Dashboard',
		`<div class="wrap">
      <header class="top"><h1>Dashboard</h1><a href="/dashboard/logout" class="small">Sign out</a></header>
      <p class="mut">Signed in as <b>${esc(email)}</b></p>
      ${cards}
      ${
				hasPaid
					? `<form method="POST" action="/dashboard/portal" style="margin-top:8px"><button>Manage billing (update card / cancel)</button></form>`
					: ''
			}
      <p class="mut small" style="margin-top:22px"><a href="/docs">Docs</a> · <a href="/status">Status</a> · <a href="/#pricing">Pricing</a></p>
    </div>`
	);
}

dashboard.get('/home', (c) => {
	const email = sessionEmail(c);
	if (!email) return c.redirect('/dashboard');
	return c.html(dashboardHome(email));
});

// --- actions (session-cookie auth + ownership check) -----------------------
function ownedKey(email: string, keyId: string) {
	if (!keyId) return null;
	const row = db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).get();
	return row && row.email === email ? row : null;
}

dashboard.post('/revoke', async (c) => {
	const email = sessionEmail(c);
	if (!email) return c.redirect('/dashboard');
	const form = await c.req.parseBody();
	const key = ownedKey(email, String(form.keyId || ''));
	if (key) revokeKey(key.id);
	return c.redirect('/dashboard/home');
});

dashboard.post('/rotate', async (c) => {
	const email = sessionEmail(c);
	if (!email) return c.redirect('/dashboard');
	const form = await c.req.parseBody();
	const old = ownedKey(email, String(form.keyId || ''));
	if (!old || !old.active) return c.redirect('/dashboard/home');
	revokeKey(old.id);
	const { record, key } = createApiKey({
		tier: old.tier as TierId,
		label: old.label,
		mode: 'live',
		customerId: old.customerId ?? undefined,
		email,
		source: 'rotated',
		expiresAt: old.expiresAt
	});
	return c.html(
		page(
			'New key',
			`<div class="box">
        <h1>Your new ${TIERS[old.tier as TierId]?.name ?? ''} key</h1>
        <p class="mut">Copy it now — it's shown once. The old key (<code>${esc(old.keyPrefix)}…</code>) is now revoked.</p>
        <pre>${esc(key)}</pre>
        <p class="mut small">New prefix: <code>${esc(record.keyPrefix)}</code></p>
        <a href="/dashboard/home">← Back to dashboard</a>
      </div>`
		)
	);
});

dashboard.post('/portal', async (c) => {
	const email = sessionEmail(c);
	if (!email) return c.redirect('/dashboard');
	const stripe = getStripe();
	const paid = keysByEmail(email).find((k) => k.active && k.customerId);
	if (!stripe || !paid?.customerId) return c.html(loginPage('No card subscription found for this email.'), 404);
	try {
		const portal = await stripe.billingPortal.sessions.create({
			customer: paid.customerId,
			return_url: `${BASE}/dashboard/home`
		});
		return c.redirect(portal.url);
	} catch {
		return c.html(
			page(
				'Error',
				`<div class="box"><h1>Couldn't open billing</h1><p class="mut">Please try again or contact support.</p><a href="/dashboard/home">← Back</a></div>`
			),
			502
		);
	}
});
