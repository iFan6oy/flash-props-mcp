import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiKeys, cryptoOrders } from '../db/schema.js';
import { getUsageToday } from '../db/usage.js';
import { revokeKey, createApiKey } from '../auth/keys.js';
import { TIERS, type TierId } from '../config/tiers.js';
import { adminAuth } from './mw.js';

export const admin = new Hono();

// Dashboard shell — loads without auth; it prompts for the token client-side
// and calls the gated /admin/api/* endpoints with it.
admin.get('/', (c) => c.html(dashboardHtml()));

const api = new Hono();
api.use('*', adminAuth);

api.get('/stats', (c) => {
	const keys = db.select({ tier: apiKeys.tier, active: apiKeys.active, customerId: apiKeys.customerId }).from(apiKeys).all();
	const byTier: Record<string, number> = {};
	let active = 0;
	let subs = 0;
	for (const k of keys) {
		if (k.active) active++;
		if (k.active && k.customerId) subs++;
		byTier[k.tier] = (byTier[k.tier] ?? 0) + 1;
	}
	const paid = db.select({ amount: cryptoOrders.amountUsdc }).from(cryptoOrders).where(eq(cryptoOrders.status, 'paid')).all();
	const cryptoRevenue = paid.reduce((s, o) => s + Number(o.amount), 0);
	return c.json({
		totalKeys: keys.length,
		activeKeys: active,
		activeStripeSubs: subs,
		byTier,
		cryptoSales: paid.length,
		cryptoRevenueUsdc: Math.round(cryptoRevenue * 100) / 100
	});
});

api.get('/keys', (c) => {
	const rows = db
		.select({
			id: apiKeys.id,
			keyPrefix: apiKeys.keyPrefix,
			tier: apiKeys.tier,
			label: apiKeys.label,
			active: apiKeys.active,
			customerId: apiKeys.customerId,
			expiresAt: apiKeys.expiresAt,
			createdAt: apiKeys.createdAt,
			lastUsedAt: apiKeys.lastUsedAt
		})
		.from(apiKeys)
		.orderBy(desc(apiKeys.createdAt))
		.limit(300)
		.all();
	return c.json({ count: rows.length, keys: rows.map((r) => ({ ...r, usageToday: getUsageToday(r.id) })) });
});

api.get('/sales', (c) => {
	const rows = db
		.select()
		.from(cryptoOrders)
		.where(eq(cryptoOrders.status, 'paid'))
		.orderBy(desc(cryptoOrders.paidAt))
		.limit(300)
		.all();
	const revenue = rows.reduce((s, o) => s + Number(o.amountUsdc), 0);
	return c.json({
		count: rows.length,
		revenueUsdc: Math.round(revenue * 100) / 100,
		sales: rows.map((o) => ({
			id: o.id,
			chain: o.chain,
			tier: o.tier,
			months: o.months,
			amountUsdc: o.amountUsdc,
			paidAt: o.paidAt,
			signature: o.signature,
			keyId: o.keyId
		}))
	});
});

api.post('/keys/:id/revoke', (c) => {
	const id = c.req.param('id');
	return c.json({ ok: revokeKey(id), id });
});

api.post('/keys', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { tier?: string; label?: string; expiresDays?: number };
	const tier = (['free', 'starter', 'pro', 'enterprise'].includes(body.tier ?? '') ? body.tier : 'free') as TierId;
	const expiresAt = body.expiresDays && body.expiresDays > 0 ? Date.now() + body.expiresDays * 86_400_000 : null;
	const { record, key } = createApiKey({ tier, label: body.label || 'admin-issued', mode: 'live', expiresAt });
	return c.json({ key, id: record.id, tier: record.tier, keyPrefix: record.keyPrefix, expiresAt });
});

admin.route('/api', api);

// ---------------------------------------------------------------------------
function dashboardHtml(): string {
	const tierOpts = (Object.keys(TIERS) as TierId[]).map((t) => `<option value="${t}">${TIERS[t].name}</option>`).join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>Flash Props · Admin</title>
<style>
  :root{--bg:#0b0d12;--panel:#12151d;--line:#232838;--ink:#eef1f7;--mut:#9aa3b6;--flash:#f58426;--green:#35d07f;--red:#ff5c6c}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:22px}
  h1{font-size:20px;margin:0 0 2px}.mut{color:var(--mut)}
  .gate{max-width:420px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:26px}
  input,select{background:#0a0c11;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:9px 11px;font:inherit;width:100%}
  button{background:linear-gradient(135deg,var(--flash),#ff9d47);color:#1a1206;font-weight:700;border:0;border-radius:9px;padding:9px 14px;cursor:pointer;font:inherit}
  button.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
  button.danger{background:transparent;border:1px solid var(--red);color:var(--red);padding:5px 10px;font-size:12px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
  .card .n{font-size:24px;font-weight:800}.card .l{color:var(--mut);font-size:12px}
  section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:14px 0;overflow-x:auto}
  h2{font-size:15px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600}
  code{font:12px ui-monospace,Menlo,Consolas,monospace;color:#ff9d47}
  .pill{padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid var(--line)}
  .on{color:var(--green);border-color:#1c3a2a}.off{color:var(--red);border-color:#3a1c22}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
</style></head><body>
<div id="gate" class="gate">
  <h1>Flash Props · Admin</h1><p class="mut">Enter your admin token.</p>
  <div class="row" style="margin-top:12px"><input id="tok" type="password" placeholder="ADMIN_TOKEN" autofocus/><button onclick="unlock()">Unlock</button></div>
  <p id="gerr" class="mut" style="color:var(--red);display:none">Invalid token.</p>
</div>
<div id="app" class="wrap" style="display:none">
  <div class="toolbar"><h1 style="flex:1">Flash Props · Admin</h1><button class="ghost" onclick="load()">Refresh</button><button class="ghost" onclick="logout()">Lock</button></div>
  <div id="cards" class="cards"></div>
  <section><div class="row" style="margin-bottom:10px"><h2 style="flex:1;margin:0">Issue a key</h2></div>
    <div class="row"><select id="itier" style="width:auto">${tierOpts}</select>
      <input id="ilabel" placeholder="label (e.g. comp: acme)" style="width:auto;flex:1"/>
      <input id="idays" type="number" placeholder="expires in N days (blank = never)" style="width:auto"/>
      <button onclick="issue()">Issue</button></div>
    <p id="issued" class="mut" style="margin:10px 0 0"></p>
  </section>
  <section><h2>Sales <span id="rev" class="mut"></span></h2><table><thead><tr><th>When</th><th>Tier</th><th>Chain</th><th>Months</th><th>USDC</th><th>Tx</th></tr></thead><tbody id="sales"></tbody></table></section>
  <section><h2>API keys</h2><table><thead><tr><th>Prefix</th><th>Tier</th><th>Label</th><th>Status</th><th>Today</th><th>Expires</th><th>Last used</th><th></th></tr></thead><tbody id="keys"></tbody></table></section>
</div>
<script>
  const KEY='fp_admin_tok';
  let tok = sessionStorage.getItem(KEY) || '';
  const $=id=>document.getElementById(id);
  function hdr(){return {Authorization:'Bearer '+tok}}
  async function api(path,opts={}){const r=await fetch('/admin/api'+path,{...opts,headers:{...hdr(),...(opts.headers||{})}});if(r.status===401){logout();throw new Error('401')}return r.json()}
  function fmtDate(ms){return ms?new Date(ms).toLocaleString():'—'}
  function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
  async function unlock(){tok=$('tok').value.trim();sessionStorage.setItem(KEY,tok);try{await load();$('gate').style.display='none';$('app').style.display='block'}catch(e){$('gerr').style.display='block'}}
  function logout(){sessionStorage.removeItem(KEY);tok='';$('app').style.display='none';$('gate').style.display='block'}
  async function load(){
    const [s,sales,keys]=await Promise.all([api('/stats'),api('/sales'),api('/keys')]);
    $('cards').innerHTML=[['Total keys',s.totalKeys],['Active',s.activeKeys],['Stripe subs',s.activeStripeSubs],['Crypto sales',s.cryptoSales],['Crypto rev','$'+s.cryptoRevenueUsdc]].map(([l,n])=>'<div class=card><div class=n>'+n+'</div><div class=l>'+l+'</div></div>').join('');
    $('rev').textContent='· '+sales.count+' paid · $'+sales.revenueUsdc+' USDC';
    $('sales').innerHTML=sales.sales.map(o=>'<tr><td>'+fmtDate(o.paidAt)+'</td><td>'+esc(o.tier)+'</td><td>'+esc(o.chain)+'</td><td>'+o.months+'</td><td>'+esc(o.amountUsdc)+'</td><td><code>'+esc((o.signature||'').slice(0,14))+'</code></td></tr>').join('')||'<tr><td colspan=6 class=mut>No sales yet.</td></tr>';
    $('keys').innerHTML=keys.keys.map(k=>'<tr><td><code>'+esc(k.keyPrefix)+'</code></td><td>'+esc(k.tier)+'</td><td>'+esc(k.label)+'</td><td>'+(k.active?'<span class="pill on">active</span>':'<span class="pill off">revoked</span>')+'</td><td>'+k.usageToday+'</td><td>'+(k.expiresAt?fmtDate(k.expiresAt):'—')+'</td><td class=mut>'+fmtDate(k.lastUsedAt)+'</td><td>'+(k.active?'<button class=danger onclick="revoke(\\''+k.id+'\\')">Revoke</button>':'')+'</td></tr>').join('')||'<tr><td colspan=8 class=mut>No keys.</td></tr>';
  }
  async function revoke(id){if(!confirm('Revoke this key?'))return;await api('/keys/'+id+'/revoke',{method:'POST'});load()}
  async function issue(){const body={tier:$('itier').value,label:$('ilabel').value,expiresDays:Number($('idays').value)||undefined};const r=await api('/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});$('issued').innerHTML='Issued (copy now): <code>'+esc(r.key)+'</code>';$('ilabel').value='';$('idays').value='';load()}
  if(tok){unlock()}
</script></body></html>`;
}
