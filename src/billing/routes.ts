import { Hono } from 'hono';
import QRCode from 'qrcode';
import { env } from '../env.js';
import { TIERS, type TierId } from '../config/tiers.js';
import { headlineSport } from '../config/sports.js';
import { createApiKey } from '../auth/keys.js';
import { getStripe, priceIdForTier, tierForPrice } from './stripe.js';
import { provisionForCustomer, revokeForCustomer, setTierForCustomer } from './provision.js';
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

// --- shared HTML shell -----------------------------------------------------
function page(title: string, inner: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title>
<style>
  body{margin:0;background:radial-gradient(1000px 500px at 70% -10%,rgba(245,132,38,.14),transparent 60%),#0b0d12;
    color:#eef1f7;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
    min-height:100vh;display:grid;place-items:center;padding:24px}
  .box{max-width:560px;width:100%;background:#12151d;border:1px solid #232838;border-radius:18px;padding:34px}
  h1{margin:0 0 6px;font-size:24px}.mut{color:#9aa3b6}
  .key{display:flex;gap:8px;margin:18px 0}
  code{font:14px ui-monospace,Menlo,Consolas,monospace;background:#0a0c11;border:1px solid #232838;color:#ff9d47;
    padding:12px 14px;border-radius:10px;flex:1;overflow-x:auto;white-space:nowrap}
  button{background:linear-gradient(135deg,#f58426,#ff9d47);color:#1a1206;font-weight:700;border:0;
    padding:0 16px;border-radius:10px;cursor:pointer}
  a.b{display:inline-block;margin-top:10px;color:#ff9d47;text-decoration:none}
  .warn{background:#1a130a;border:1px solid #3a2a12;color:#ffbf80;padding:12px 14px;border-radius:10px;font-size:14px}
  pre{background:#0a0c11;border:1px solid #232838;border-radius:10px;padding:14px;overflow-x:auto;font-size:13px;color:#d7deee}
</style></head><body><div class="box">${inner}</div>
<script>function cp(){const k=document.getElementById('k').innerText;navigator.clipboard.writeText(k);
  const b=document.getElementById('c');b.innerText='Copied';setTimeout(()=>b.innerText='Copy',1500);}</script>
</body></html>`;
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
		'Billing not configured',
		`<h1>Checkout isn't wired yet</h1>
     <p class="mut">Stripe isn't configured on this instance, so the <b>${tier}</b> plan can't be purchased here yet.</p>
     <div class="warn">Set <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_STARTER</code>, <code>STRIPE_PRICE_PRO</code> and <code>STRIPE_WEBHOOK_SECRET</code> to enable it.</div>
     <a class="b" href="/#pricing">← Back to pricing</a>`
	);
}

// --- self-serve free key ---------------------------------------------------
billing.get('/free', (c) => {
	const { record, key } = createApiKey({
		tier: 'free',
		label: 'self-serve-free',
		mode: env.NODE_ENV === 'production' ? 'live' : 'test'
	});
	return c.html(keyPage({ tier: 'free', key, prefix: record.keyPrefix, created: true }));
});

// --- Stripe Checkout -------------------------------------------------------
billing.get('/checkout', async (c) => {
	const tier = (c.req.query('tier') || '') as TierId;
	if (tier !== 'starter' && tier !== 'pro') {
		return c.json({ error: 'bad_tier', message: 'tier must be starter or pro' }, 400);
	}
	const stripe = getStripe();
	const priceId = priceIdForTier(tier);
	if (!stripe || !priceId) return c.html(notConfigured(tier), 503);

	const session = await stripe.checkout.sessions.create({
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
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
	const result = provisionForCustomer(customerId, tier);
	if (result.created) {
		notifySale({ channel: 'stripe', tier, amount: TIERS[tier].priceMonthly ?? 0, currency: 'USD', period: '1 mo' });
	}
	return c.html(keyPage({ tier, ...result }));
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
		case 'customer.subscription.deleted': {
			const sub = event.data.object;
			revokeForCustomer(String(sub.customer));
			break;
		}
		case 'customer.subscription.updated': {
			const sub = event.data.object;
			const tier = tierForPrice(sub.items.data[0]?.price?.id);
			if (tier) setTierForCustomer(String(sub.customer), tier);
			break;
		}
		default:
			break;
	}
	return c.json({ received: true });
});

// --- Crypto checkout (Solana Pay / USDC) -----------------------------------
async function cryptoPayPage(order: CryptoOrder): Promise<string> {
	const tgt = payTarget(order);
	const qr = await QRCode.toString(tgt.url, { type: 'svg', margin: 1, width: 220 });
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
