import { Hono } from 'hono';
import type { Context } from 'hono';
import QRCode from 'qrcode';
import { env } from '../env.js';
import { utcDay } from '../db/usage.js';
import { TIERS, type TierId } from '../config/tiers.js';
import { headlineSport } from '../config/sports.js';
import { createApiKey } from '../auth/keys.js';
import { getStripe } from './stripe.js';
import { provisionForCustomer, revokeForCustomer, setTierForCustomer, customerIdForKey } from './provision.js';
import { stashReveal, takeReveal } from './reveal.js';
import { sendKeyEmail } from '../email.js';
import { shell } from '../routes/shell.js';
import {
	cryptoEnabled,
	enabledChains,
	defaultChain,
	chainEnabled,
	CHAIN_LABEL,
	type CryptoChain
} from '../config/crypto.js';
import {
	createCryptoOrder,
	getOrder,
	findPayment,
	provisionCryptoKey,
	expireIfStale,
	payTarget,
	monthsForPeriod,
	type CryptoOrder
} from './crypto.js';
import { notifySale } from './notify.js';

export const billing = new Hono();

const BASE = env.PUBLIC_BASE_URL;

// --- shared HTML shell (premium chrome from routes/shell.ts) ---------------
function page(title: string, inner: string): string {
	return shell(title, inner, { layout: 'center' });
}

function keyPage(o: { tier: TierId; key?: string; prefix: string; created: boolean }): string {
	const t = TIERS[o.tier];
	if (!o.created) {
		return page(
			'Your key',
			`<h1>You're on ${t.name}</h1>
       <p class="mut">A key was already issued for this account: <code>${o.prefix}…</code></p>
       <div class="warn">We only store a hash of your key, so it can't be shown again. Lost it? Rotate from your dashboard (coming soon) or contact support.</div>
       <a class="b" href="/docs">Go to the docs →</a>`
		);
	}
	return page(
		'Your API key',
		`<h1>You're on ${t.name} 🎉</h1>
     <p class="mut">Here's your API key. Copy it now — it's shown once.</p>
     <div class="key"><code id="k">${o.key}</code><button id="c" onclick="cp()">Copy</button></div>
     <p class="mut">Use it as a bearer token:</p>
     <pre>curl -H "Authorization: Bearer ${o.key}" \\
  "${BASE}/api/v1/props?sport=${headlineSport()}&limit=10"</pre>
     <a class="b" href="/docs">Open the API reference →</a>`
	);
}

function notConfigured(tier: string): string {
	return page(
		'Checkout unavailable',
		`<h1>Card checkout is temporarily unavailable</h1>
     <p class="mut">The <b>${tier}</b> plan can't be purchased by card right now.</p>
     <div class="warn">You can still start with a free key or contact support for help.</div>
     <a class="b" href="/billing/free">Get a free key →</a><br/>
     <a class="b" href="mailto:malone.jaylon@gmail.com?subject=Flash%20Props%20API%20Checkout">Contact support →</a>`
	);
}

// --- self-serve free key ---------------------------------------------------
// Was an unauthenticated GET that minted a DB row on EVERY hit (a crawler could
// spam keys just by following the link). Now: GET renders a tiny form, POST
// mints — behind a honeypot and a soft per-IP daily cap. Still one form + one
// click for a real person.
const FREE_KEYS_PER_IP_PER_DAY = 3;
const freeMintByIp = new Map<string, { day: string; count: number }>();

function clientIp(c: Context): string {
	const xff = c.req.header('x-forwarded-for'); // Caddy sets this in prod
	if (xff) return xff.split(',')[0]!.trim();
	return c.req.header('x-real-ip') || 'unknown';
}

function freeKeyForm(src = '', err = ''): string {
	const safeSrc = src.replace(/"/g, '&quot;').slice(0, 60);
	return page(
		'Get a free key',
		`<h1>Get a free API key</h1>
     <p class="mut">Free tier: 250 requests/day on the in-season sport. Enter your email and we'll show your key. We use it only for key delivery and critical service notices.</p>
     ${err ? `<div class="warn">${err}</div>` : ''}
     <form method="POST" action="/billing/free" style="margin-top:16px">
       <input type="email" name="email" required placeholder="you@example.com" autocomplete="email"
         style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #232838;background:#0a0c11;color:#eef1f7;font:15px -apple-system,system-ui,sans-serif;margin-bottom:12px"/>
       <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0"/>
       <input type="hidden" name="src" value="${safeSrc}"/>
       <button type="submit" style="width:100%;padding:12px 16px;cursor:pointer">Create my free key →</button>
     </form>
     <p class="mut" style="margin-top:12px;font-size:13px">No card required. For informational use only.</p>`
	);
}

billing.get('/free', (c) => c.html(freeKeyForm(c.req.query('src') || '')));

billing.post('/free', async (c) => {
	const form = await c.req.parseBody();
	// Honeypot: a real user never sees/fills the offscreen "website" field; bots do.
	if (String(form.website || '').trim()) return c.html(freeKeyForm('', 'Something went wrong. Please try again.'), 400);

	const email = String(form.email || '').trim();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		return c.html(freeKeyForm(String(form.src || ''), 'Enter a valid email so we can deliver your key.'), 400);
	}

	// Soft per-IP daily cap (in-memory throttle, not a hard wall). Deters casual
	// spam; the per-key daily request quota is the real abuse ceiling.
	const ip = clientIp(c);
	const day = utcDay();
	const seen = freeMintByIp.get(ip);
	const used = seen && seen.day === day ? seen.count : 0;
	if (used >= FREE_KEYS_PER_IP_PER_DAY) {
		return c.html(
			freeKeyForm(
				'',
				`You've created the maximum free keys for today (${FREE_KEYS_PER_IP_PER_DAY}). Reuse an existing key, or email support if you need more.`
			),
			429
		);
	}
	freeMintByIp.set(ip, { day, count: used + 1 });

	const { record, key } = createApiKey({
		tier: 'free',
		label: 'self-serve-free',
		mode: env.NODE_ENV === 'production' ? 'live' : 'test',
		email,
		source: String(form.src || '').slice(0, 60) || null
	});
	void sendKeyEmail({ to: email, key, tier: 'free', paid: false }); // no-op unless RESEND_API_KEY set
	return c.html(keyPage({ tier: 'free', key, prefix: record.keyPrefix, created: true }));
});

// --- Stripe Checkout -------------------------------------------------------
billing.get('/checkout', async (c) => {
	const tier = (c.req.query('tier') || '') as TierId;
	if (tier !== 'starter' && tier !== 'pro') {
		return c.json({ error: 'bad_tier', message: 'tier must be starter or pro' }, 400);
	}
	const stripe = getStripe();
	const plan = TIERS[tier];
	if (!stripe || !plan.priceMonthly) return c.html(notConfigured(tier), 503);

	const session = await stripe.checkout.sessions.create({
		mode: 'subscription',
		line_items: [
			{
				price_data: {
					currency: 'usd',
					unit_amount: plan.priceMonthly * 100,
					recurring: { interval: 'month' },
					product_data: { name: `Flash Props API — ${plan.name}` }
				},
				quantity: 1
			}
		],
		metadata: { tier },
		subscription_data: { metadata: { tier } },
		allow_promotion_codes: true,
		success_url: `${BASE}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${BASE}/#pricing`
	});
	return c.redirect(session.url ?? `${BASE}/#pricing`, 303);
});

// --- Checkout success: provision + show key --------------------------------
billing.get('/success', async (c) => {
	const stripe = getStripe();
	const sid = c.req.query('session_id');
	if (!stripe || !sid) return c.redirect('/');
	const session = await stripe.checkout.sessions.retrieve(sid);
	if (session.status !== 'complete' && session.payment_status !== 'paid') {
		return c.html(page('Processing', `<h1>Payment processing…</h1><p class="mut">Refresh in a moment.</p>`));
	}
	const customerId = String(session.customer);
	const tier = ((session.metadata?.tier as TierId) || 'starter') as TierId;
	const email = session.customer_details?.email ?? null;
	const result = provisionForCustomer(customerId, tier, email);
	if (result.created) {
		notifySale({
			channel: 'stripe',
			tier,
			amount: TIERS[tier].priceMonthly ?? 0,
			currency: 'USD',
			period: '1 mo'
		});
		if (result.key) void sendKeyEmail({ to: email ?? '', key: result.key, tier, paid: true });
	}
	// Reveal the plaintext once. If the webhook already provisioned (created:false)
	// it will have stashed the fresh key for a one-time reveal here — so the buyer
	// still gets their key on this page even when the webhook won the race.
	const shownKey = result.key ?? takeReveal(customerId) ?? undefined;
	return c.html(
		keyPage({
			tier,
			key: shownKey,
			prefix: result.prefix,
			created: !!shownKey
		})
	);
});

// --- Stripe webhook: subscription lifecycle --------------------------------
billing.post('/webhook', async (c) => {
	const stripe = getStripe();
	if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
		return c.json({ error: 'webhook_not_configured' }, 503);
	}
	const sig = c.req.header('stripe-signature') || '';
	const body = await c.req.text(); // raw body required for signature check
	let event: import('stripe').Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
	} catch {
		return c.json({ error: 'bad_signature' }, 400);
	}

	switch (event.type) {
		case 'checkout.session.completed': {
			// The trust-critical path: provision the key here, from the webhook, so a
			// paid buyer gets their product even if they close the Stripe tab before
			// /billing/success loads. Idempotent (provisionForCustomer no-ops if the
			// key already exists), and Stripe delivers this event at-least-once.
			const session = event.data.object;
			const paid = session.status === 'complete' || session.payment_status === 'paid';
			const customerId = session.customer ? String(session.customer) : '';
			if (paid && customerId) {
				const tier = ((session.metadata?.tier as TierId) || 'starter') as TierId;
				const email = session.customer_details?.email ?? null;
				const result = provisionForCustomer(customerId, tier, email);
				if (result.created && result.key) {
					stashReveal(customerId, result.key); // let /success reveal it once
					void sendKeyEmail({
						to: email ?? '',
						key: result.key,
						tier,
						paid: true
					});
					notifySale({
						channel: 'stripe',
						tier,
						amount: TIERS[tier].priceMonthly ?? 0,
						currency: 'USD',
						period: '1 mo'
					});
				}
			}
			break;
		}
		case 'customer.subscription.deleted': {
			const sub = event.data.object;
			revokeForCustomer(String(sub.customer));
			break;
		}
		case 'customer.subscription.updated': {
			const sub = event.data.object;
			const tier = sub.metadata?.tier as TierId | undefined;
			if (tier) setTierForCustomer(String(sub.customer), tier);
			break;
		}
		default:
			break;
	}
	return c.json({ received: true });
});

// --- Stripe billing portal (self-serve manage / cancel) --------------------
billing.get('/portal', (c) =>
	c.html(
		page(
			'Manage billing',
			`<h1>Manage your subscription</h1>
     <p class="mut">Paste your Flash Props API key to open the Stripe billing portal — update your card, download invoices, or cancel.</p>
     <input id="k" placeholder="flash_live_…" autocomplete="off" spellcheck="false"
       style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #232838;background:#0a0c11;color:#ff9d47;font:14px ui-monospace,Menlo,Consolas,monospace;margin:14px 0"/>
     <button onclick="go()" style="width:100%;padding:12px 16px">Open billing portal →</button>
     <p id="err" class="warn" style="display:none;margin-top:12px"></p>
     <script>
       async function go(){
         var key=(document.getElementById('k').value||'').trim();
         var e=document.getElementById('err'); e.style.display='none';
         if(!key){ e.textContent='Paste your API key first.'; e.style.display='block'; return; }
         try{
           var r=await fetch('/billing/portal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:key})});
           var d=await r.json();
           if(d.url){ location.href=d.url; return; }
           e.textContent=d.message||'Could not open the billing portal.'; e.style.display='block';
         }catch(_){ e.textContent='Network error. Please try again.'; e.style.display='block'; }
       }
     </script>`
		)
	)
);

billing.post('/portal', async (c) => {
	const stripe = getStripe();
	if (!stripe) return c.json({ error: 'not_configured', message: 'Billing is not configured.' }, 503);
	const body = (await c.req.json().catch(() => ({}))) as { key?: string };
	const rawKey = (body.key || '').trim();
	if (!rawKey) return c.json({ error: 'missing_key', message: 'Paste your Flash Props API key.' }, 400);
	const customerId = customerIdForKey(rawKey);
	if (!customerId) {
		return c.json(
			{
				error: 'no_subscription',
				message: 'That key is not linked to a card subscription. Free and crypto keys have no billing portal.'
			},
			404
		);
	}
	try {
		const portal = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: `${BASE}/`
		});
		return c.json({ url: portal.url });
	} catch {
		return c.json(
			{
				error: 'portal_failed',
				message: 'Could not open the billing portal. Please contact support.'
			},
			502
		);
	}
});

// --- Crypto checkout (Solana Pay / USDC) -----------------------------------
async function cryptoPayPage(order: CryptoOrder): Promise<string> {
	const tgt = payTarget(order);
	const qr = await QRCode.toString(tgt.url, {
		type: 'svg',
		margin: 1,
		width: 220
	});
	const t = TIERS[order.tier as TierId];
	const periodId = order.months >= 12 ? 'year' : 'month';
	const chainName = CHAIN_LABEL[tgt.chain];
	const wallets = tgt.chain === 'base' ? 'MetaMask / Coinbase Wallet / Rainbow' : 'Phantom / Solflare';
	const switcher = enabledChains()
		.filter((ch) => ch !== order.chain)
		.map(
			(ch) =>
				`<a class="b" style="margin-right:14px" href="/billing/crypto?tier=${order.tier}&period=${periodId}&chain=${ch}">Pay on ${CHAIN_LABEL[ch]} instead</a>`
		)
		.join('');
	return page(
		'Pay with crypto',
		`<h1>Pay ${tgt.amount} USDC</h1>
     <p class="mut">${t.name} · ${order.months} month${order.months > 1 ? 's' : ''} prepaid · on <b>${chainName}</b>. Send the exact amount:</p>
     <div style="font-size:34px;font-weight:850;margin:4px 0 14px">${tgt.amount} <span style="font-size:15px;color:#9aa3b6">USDC</span></div>
     <div style="background:#fff;border-radius:12px;padding:10px;width:240px;margin:0 auto 14px">${qr}</div>
     <p class="mut">Scan with ${wallets}, or send USDC on ${chainName} to:</p>
     <div class="key"><code id="addr">${tgt.address}</code><button id="c" onclick="navigator.clipboard.writeText(document.getElementById('addr').innerText);this.innerText='Copied';">Copy</button></div>
     <div id="status" class="warn">Waiting for payment… (order expires in 30 min)</div>
     <div id="done" style="display:none"></div>
     ${switcher ? `<div style="margin-top:12px">${switcher}</div>` : ''}
     <script>
       const oid=${JSON.stringify(order.id)};
       async function poll(){
         try{
           const r=await fetch('/billing/crypto/status?order='+encodeURIComponent(oid));
           const d=await r.json();
           if(d.status==='paid'){
             document.getElementById('status').style.display='none';
             const done=document.getElementById('done'); done.style.display='block';
             done.innerHTML = d.key
               ? '<h3>Paid ✓ — your API key (shown once)</h3><div class="key"><code>'+d.key+'</code></div><p class="mut">Access expires '+(d.expiresAt||'')+'. Renew any time.</p><a class="b" href="/docs">Open the docs →</a>'
               : '<h3>Paid ✓</h3><p class="mut">A key was already issued for this order.</p><a class="b" href="/docs">Docs →</a>';
             return;
           }
           if(d.status==='expired'){ document.getElementById('status').innerHTML='This order expired. <a class="b" href="/#pricing">Start over</a>'; return; }
         }catch(e){}
         setTimeout(poll,5000);
       }
       setTimeout(poll,4000);
     </script>`
	);
}

billing.get('/crypto', async (c) => {
	if (!cryptoEnabled()) {
		return c.html(
			page(
				'Crypto not configured',
				`<h1>Crypto checkout isn't enabled yet</h1><p class="mut">Set <code>RECEIVE_WALLET</code> (and a Solana RPC) on the server to accept USDC.</p><a class="b" href="/#pricing">← Back to pricing</a>`
			),
			503
		);
	}
	const tier = (c.req.query('tier') || '') as TierId;
	const periodId = c.req.query('period') || 'month';
	const chainParam = c.req.query('chain');
	if (tier !== 'starter' && tier !== 'pro') {
		return c.json({ error: 'bad_tier', message: 'tier must be starter or pro' }, 400);
	}
	const months = monthsForPeriod(periodId);
	if (!months) return c.json({ error: 'bad_period', message: 'period must be month or year' }, 400);
	const chain: CryptoChain | null = chainParam && chainEnabled(chainParam) ? chainParam : defaultChain();
	if (!chain) {
		return c.html(page('Crypto not configured', `<h1>Crypto checkout isn't enabled yet</h1>`), 503);
	}
	const order = await createCryptoOrder(tier, months, chain);
	if ('error' in order) {
		return c.html(page('Unavailable', `<h1>Can't create the order</h1><p class="mut">${order.error}</p>`), 503);
	}
	return c.html(await cryptoPayPage(order));
});

billing.get('/crypto/status', async (c) => {
	const id = c.req.query('order');
	if (!id) return c.json({ error: 'missing_order' }, 400);
	let order = getOrder(id);
	if (!order) return c.json({ error: 'not_found' }, 404);
	if (order.status === 'paid') return c.json({ status: 'paid', tier: order.tier, created: false });
	order = expireIfStale(order);
	if (order.status === 'expired') return c.json({ status: 'expired' });
	try {
		const sig = await findPayment(order);
		if (!sig) return c.json({ status: 'pending' });
		const prov = provisionCryptoKey(order, sig);
		if (prov.created) {
			notifySale({
				channel: 'crypto',
				tier: order.tier,
				amount: order.amountUsdc,
				currency: 'USDC',
				period: `${order.months} mo`,
				chain: order.chain
			});
		}
		return c.json({
			status: 'paid',
			tier: order.tier,
			key: prov.key ?? null,
			prefix: prov.prefix,
			created: prov.created,
			expiresAt: new Date(prov.expiresAt).toISOString(),
			signature: sig
		});
	} catch {
		// Transient RPC error — tell the client to keep polling.
		return c.json({ status: 'pending', note: 'verifying' });
	}
});
