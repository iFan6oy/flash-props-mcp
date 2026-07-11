import { Hono } from 'hono';
import { env } from '../env.js';
import { TIERS } from '../config/tiers.js';
import { headlineSport } from '../config/sports.js';
import { cryptoEnabled, cryptoPerMonthUsdc, discountPct } from '../config/crypto.js';

export const meta = new Hono();

const BASE = env.PUBLIC_BASE_URL;

// --- Agent-native discovery -------------------------------------------------
// skill.md: instructions an LLM/agent fetches to learn the API (UW-style).
function skillMarkdown(): string {
	const hl = headlineSport(); // sport the free tier can query right now
	return `# Flash Props API — Agent Guide

Sports betting **player-prop lines** (over/under) unified across free books
(Underdog, Bovada) into one clean feed. NBA, MLB, NFL, NHL, NCAA, soccer.
Pre-game and live in-game. American odds. Built by Flash AI Solutions.

- **Base URL:** ${BASE}
- **Auth:** \`Authorization: Bearer <key>\` (also accepts \`X-API-Key:\` or \`?api_key=\`)
- **Spec:** ${BASE}/openapi.json (OpenAPI 3.1)
- **MCP server:** ${BASE}/mcp (streamable HTTP; send your key as \`Authorization: Bearer\`). Tools: \`list_sports\`, \`list_games\`, \`get_game_props\`, \`scan_props\`, \`find_game\`.
- **Get a key:** ${BASE}/ (free tier self-serve; paid via Stripe card or discounted USDC/crypto)

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | \`/api/v1/sports\` | Supported sports + which your tier can access |
| GET | \`/api/v1/games?sport=${hl}\` | Today's games with props (live first) |
| GET | \`/api/v1/games/{eventId}/props?stats=points,rebounds\` | Props for one game |
| GET | \`/api/v1/props?sport=${hl}&limit=50\` | Market-wide scan ("flow" feed) |
| GET | \`/api/v1/me\` | Your tier, limits, and usage |

## Quickstart

\`\`\`bash
curl -H "Authorization: Bearer $FLASH_PROPS_KEY" \\
  "${BASE}/api/v1/props?sport=${hl}&limit=10"
\`\`\`

## Notes for agents

- Event ids are prefixed \`ud-\` (Underdog) or \`bv-\` (Bovada). Get them from \`/games\`.
- **Stat keys** — NBA: \`points, rebounds, assists, threes, pra\`. MLB: \`strikeouts, hits, total_bases, home_runs, rbis\`. NFL: \`passing_yards, rushing_yards, receiving_yards, receptions, touchdowns\`. NHL: \`goals, shots, saves\`.
- **Odds** are American (e.g. \`-115\`, \`+130\`). \`overOdds\` = higher/over, \`underOdds\` = lower/under.
- **Free tier**: the in-season sport only (currently \`${hl}\`), delayed ~5 min, no live in-game props. Paid tiers unlock realtime, live lines, and all sports.
- **Rate limits**: read \`X-RateLimit-Remaining\` (per minute) and \`X-RateLimit-Daily-Remaining\`. On HTTP 429, honor \`Retry-After\`.
- Responses carry \`delayed: true\` when served on the free-tier delay.
`;
}

// llms.txt: emerging discovery convention pointing agents at the good stuff.
function llmsTxt(): string {
	return `# Flash Props API

> Sports betting player-prop lines (over/under) across free books, unified into one API. NBA/MLB/NFL/NHL/NCAA/soccer, pre-game + live.

## Docs
- [Agent guide](${BASE}/skill.md): how to call the API, endpoints, stat keys
- [OpenAPI spec](${BASE}/openapi.json): machine-readable, OpenAPI 3.1
- [Interactive reference](${BASE}/docs): Scalar API explorer

## Auth
- Get a key at ${BASE}/ then send \`Authorization: Bearer <key>\`.
`;
}

meta.get('/skill.md', (c) => c.text(skillMarkdown(), 200, { 'content-type': 'text/markdown; charset=utf-8' }));
meta.get('/llms.txt', (c) => c.text(llmsTxt(), 200, { 'content-type': 'text/plain; charset=utf-8' }));

// --- Public landing page ("storefront") ------------------------------------
function tierCard(id: keyof typeof TIERS): string {
	const t = TIERS[id];
	const price =
		t.priceMonthly === null
			? 'Custom'
			: t.priceMonthly === 0
				? 'Free'
				: `$${t.priceMonthly}<span>/mo</span>`;
	const featured = id === 'pro' ? ' featured' : '';
	const cta = t.priceMonthly === null ? 'Contact' : t.priceMonthly === 0 ? 'Start free' : 'Subscribe';
	const href =
		id === 'free'
			? '/billing/free'
			: id === 'enterprise'
				? 'mailto:malone.jaylon@gmail.com?subject=Flash%20Props%20API%20Enterprise'
				: `/billing/checkout?tier=${id}`;
	return `<div class="tier${featured}">
    ${id === 'pro' ? '<div class="badge">Most popular</div>' : ''}
    <h3>${t.name}</h3>
    <div class="price">${price}</div>
    <p class="blurb">${t.blurb}</p>
    <ul>${t.features.map((f) => `<li>${f}</li>`).join('')}</ul>
    <a class="tier-cta" href="${href}">${cta}</a>
    ${
			(id === 'starter' || id === 'pro') && cryptoEnabled()
				? `<a class="tier-crypto" href="/billing/crypto?tier=${id}&period=month">Pay with USDC · $${cryptoPerMonthUsdc(id)}/mo <b>save ${discountPct()}%</b></a>`
				: ''
		}
  </div>`;
}

function landingHtml(): string {
	const hl = headlineSport(); // sport a fresh free key can query right now
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Flash Props API — sports betting props, one clean feed</title>
<meta name="description" content="Player-prop lines across free books, unified into one fast API. NBA, MLB, NFL, NHL, NCAA, soccer. Pre-game and live. Built for apps, bots, and AI agents." />
<style>
  :root{
    --bg:#0b0d12; --panel:#12151d; --panel2:#171b26; --line:#232838;
    --ink:#eef1f7; --muted:#9aa3b6; --flash:#f58426; --flash2:#ff9d47; --green:#35d07f;
    --radius:16px; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:radial-gradient(1200px 600px at 70% -10%,rgba(245,132,38,.14),transparent 60%),var(--bg);
    color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}
  nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.2px}
  .logo .dot{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--flash),var(--flash2));
    display:grid;place-items:center;color:#1a1206;font-weight:900}
  nav .links{display:flex;gap:26px;align-items:center;color:var(--muted);font-size:14px}
  nav .links a:hover{color:var(--ink)}
  .btn{background:linear-gradient(135deg,var(--flash),var(--flash2));color:#1a1206;font-weight:700;
    padding:10px 16px;border-radius:10px;font-size:14px;border:0;cursor:pointer}
  .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
  header.hero{padding:70px 0 40px;text-align:center}
  .pill{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);background:var(--panel);
    color:var(--muted);padding:6px 12px;border-radius:999px;font-size:13px;margin-bottom:22px}
  .pill .g{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green)}
  h1{font-size:clamp(34px,6vw,60px);line-height:1.04;margin:0 0 18px;letter-spacing:-1.5px;font-weight:850}
  h1 .accent{background:linear-gradient(135deg,var(--flash),var(--flash2));-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:var(--muted);font-size:clamp(16px,2.4vw,20px);max-width:620px;margin:0 auto 30px}
  .cta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .cta .btn{padding:13px 22px;font-size:15px}
  section{padding:40px 0}
  .code{background:#0a0c11;border:1px solid var(--line);border-radius:var(--radius);padding:0;margin:36px auto 0;max-width:760px;text-align:left;overflow:hidden}
  .code .bar{display:flex;gap:7px;padding:12px 16px;border-bottom:1px solid var(--line);align-items:center}
  .code .bar i{width:11px;height:11px;border-radius:50%;background:#2a3040;display:inline-block}
  .code .bar span{margin-left:auto;color:var(--muted);font:12px var(--mono)}
  .code pre{margin:0;padding:18px 20px;overflow-x:auto;font:13.5px/1.7 var(--mono);color:#d7deee}
  .code .k{color:var(--flash2)} .code .s{color:var(--green)} .code .c{color:#5f6b82}
  h2{font-size:clamp(24px,4vw,34px);letter-spacing:-.5px;margin:0 0 8px;text-align:center}
  .lead{color:var(--muted);text-align:center;max-width:560px;margin:0 auto 34px}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
  .card h4{margin:0 0 6px;font-size:16px}
  .card p{margin:0;color:var(--muted);font-size:14px}
  .card code{font:12.5px var(--mono);color:var(--flash2);background:#0a0c11;border:1px solid var(--line);
    padding:2px 7px;border-radius:6px;display:inline-block;margin-bottom:10px}
  .agent{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);
    border-radius:20px;padding:34px;text-align:center}
  .agent .chips{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px}
  .chip{border:1px solid var(--line);background:#0a0c11;border-radius:12px;padding:12px 18px;font-size:14px}
  .chip b{color:var(--flash2)}
  .tiers{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-items:stretch}
  .tier{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:26px 22px;display:flex;flex-direction:column}
  .tier.featured{border-color:var(--flash);box-shadow:0 0 0 1px var(--flash),0 20px 60px -30px rgba(245,132,38,.6)}
  .tier .badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--flash),var(--flash2));
    color:#1a1206;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;letter-spacing:.4px;text-transform:uppercase}
  .tier h3{margin:0 0 6px;font-size:18px}
  .tier .price{font-size:32px;font-weight:850;margin-bottom:6px}
  .tier .price span{font-size:14px;color:var(--muted);font-weight:600}
  .tier .blurb{color:var(--muted);font-size:13.5px;min-height:38px;margin:0 0 14px}
  .tier ul{list-style:none;padding:0;margin:0 0 20px;flex:1;font-size:14px}
  .tier li{padding:6px 0 6px 24px;position:relative;color:#cdd4e4}
  .tier li:before{content:"";position:absolute;left:0;top:11px;width:12px;height:7px;border-left:2px solid var(--green);
    border-bottom:2px solid var(--green);transform:rotate(-45deg)}
  .tier-cta{display:block;text-align:center;padding:11px;border-radius:10px;border:1px solid var(--line);font-weight:700;font-size:14px}
  .tier.featured .tier-cta{background:linear-gradient(135deg,var(--flash),var(--flash2));color:#1a1206;border:0}
  .tier-crypto{display:block;text-align:center;margin-top:9px;font-size:12.5px;color:var(--muted);text-decoration:none}
  .tier-crypto b{color:var(--green)} .tier-crypto:hover{color:var(--ink)}
  footer{border-top:1px solid var(--line);margin-top:40px;padding:30px 0 50px;color:var(--muted);
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:14px}
  @media(max-width:640px){nav .links a.hideM{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <nav>
    <div class="logo"><span class="dot">F</span> Flash Props API</div>
    <div class="links">
      <a class="hideM" href="/docs">Docs</a>
      <a class="hideM" href="#pricing">Pricing</a>
      <a class="hideM" href="/skill.md">For agents</a>
      <a class="btn" href="/docs">Get API key</a>
    </div>
  </nav>

  <header class="hero">
    <div class="pill"><span class="g"></span> Live now · NBA · MLB · NFL · NHL · NCAA · Soccer</div>
    <h1>Sports betting props,<br><span class="accent">one clean feed.</span></h1>
    <p class="sub">Player prop lines across free books — Underdog, Bovada and more — unified, normalized, and served over a fast REST API. Pre-game and live in-game. Built for apps, bots, and AI agents.</p>
    <div class="cta">
      <a class="btn" href="/docs">Get your API key</a>
      <a class="btn ghost" href="/docs">Read the docs →</a>
    </div>

    <div class="code">
      <div class="bar"><i></i><i></i><i></i><span>bash</span></div>
<pre><span class="c"># Market-wide prop scan — the "flow" feed</span>
curl -H <span class="s">"Authorization: Bearer $KEY"</span> \\
  <span class="k">"${BASE}/api/v1/props?sport=${hl}&limit=10"</span></pre>
    </div>
  </header>

  <section>
    <h2>Everything you need to build</h2>
    <p class="lead">A small, honest surface. Clean JSON, American odds, consistent shapes across every sport.</p>
    <div class="grid">
      <div class="card"><code>GET /api/v1/games</code><h4>Today's games</h4><p>Every matchup with props posted, live games first.</p></div>
      <div class="card"><code>GET /games/{id}/props</code><h4>Props for a game</h4><p>All player lines for one matchup, filterable by stat.</p></div>
      <div class="card"><code>GET /api/v1/props</code><h4>Market-wide scan</h4><p>Every prop across the slate, flattened into one flow feed.</p></div>
      <div class="card"><code>GET /api/v1/me</code><h4>Key &amp; usage</h4><p>Your tier, limits, and live request counts.</p></div>
    </div>
  </section>

  <section>
    <div class="agent">
      <h2>Built for AI agents</h2>
      <p class="lead">Not an afterthought. Point Claude or any agent at the discovery files and it knows how to use the API — no glue code.</p>
      <div class="chips">
        <div class="chip"><b>OpenAPI 3.1</b> · <a href="/openapi.json">/openapi.json</a></div>
        <div class="chip"><b>Agent guide</b> · <a href="/skill.md">/skill.md</a></div>
        <div class="chip"><b>llms.txt</b> · <a href="/llms.txt">/llms.txt</a></div>
        <div class="chip"><b>MCP server</b> · <a href="/mcp">/mcp</a></div>
      </div>
    </div>
  </section>

  <section id="pricing">
    <h2>Simple, honest pricing</h2>
    <p class="lead">Free data sources under the hood, so the free tier is genuinely free. Upgrade for realtime, live in-game lines, and every sport.${
			cryptoEnabled() ? ` <strong style="color:var(--flash2)">Pay with USDC and save ${discountPct()}%.</strong>` : ''
		}</p>
    <div class="tiers">
      ${tierCard('free')}
      ${tierCard('starter')}
      ${tierCard('pro')}
      ${tierCard('enterprise')}
    </div>
  </section>

  <footer>
    <div>© Flash AI Solutions · Flash Props API</div>
    <div><a href="/docs">Docs</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/skill.md">Agents</a> · <a href="/health">Status</a></div>
  </footer>
</div>
</body>
</html>`;
}

meta.get('/', (c) => c.html(landingHtml()));
