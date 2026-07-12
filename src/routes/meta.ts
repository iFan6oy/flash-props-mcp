import { Hono } from 'hono';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { TIERS } from '../config/tiers.js';
import { headlineSport } from '../config/sports.js';
import { cryptoEnabled, cryptoPerMonthUsdc, discountPct } from '../config/crypto.js';

export const meta = new Hono();

const BASE = env.PUBLIC_BASE_URL;
const BRAND_LOGO = 'data:image/png;base64,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';

// --- Static hero assets (video + poster) -----------------------------------
// Live in /opt/flash-props-api/assets (OUTSIDE dist, so CI deploys that only
// replace dist/ never wipe them). Resolved relative to this compiled module.
const ASSET_TYPES: Record<string, string> = { 'hero.mp4': 'video/mp4', 'hero-poster.jpg': 'image/jpeg' };
function assetPath(name: string): string {
	return fileURLToPath(new URL('../../assets/' + name, import.meta.url));
}
function heroVideoReady(): boolean {
	try {
		return existsSync(assetPath('hero.mp4'));
	} catch {
		return false;
	}
}

// Range-aware static serving (Safari refuses to play a video without 206 range
// support). Whitelisted names only — no path traversal.
meta.get('/assets/:name', (c) => {
	const name = c.req.param('name');
	if (!name) return c.notFound();
	const type = ASSET_TYPES[name];
	if (!type) return c.notFound();
	const path = assetPath(name);
	if (!existsSync(path)) return c.notFound();
	const size = statSync(path).size;
	c.header('Content-Type', type);
	c.header('Accept-Ranges', 'bytes');
	c.header('Cache-Control', 'public, max-age=604800');
	const range = c.req.header('range');
	if (range) {
		const m = /bytes=(\d+)-(\d*)/.exec(range);
		let start = m && m[1] ? parseInt(m[1], 10) : 0;
		let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
		if (!Number.isFinite(start) || start < 0 || start >= size) start = 0;
		if (!Number.isFinite(end) || end >= size) end = size - 1;
		c.header('Content-Range', `bytes ${start}-${end}/${size}`);
		c.header('Content-Length', String(end - start + 1));
		return c.body(Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream, 206);
	}
	c.header('Content-Length', String(size));
	return c.body(Readable.toWeb(createReadStream(path)) as unknown as ReadableStream, 200);
});

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
- **MCP server:** ${BASE}/mcp (streamable HTTP; send your key as \`Authorization: Bearer\`). Tools: \`list_sports\`, \`list_games\`, \`get_game_props\`, \`scan_props\`, \`find_game\`. Copy-paste client setup (Claude Code / Cursor / Claude Desktop / any): ${BASE}/connect
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

// --- "Connect to Claude" page (MCP onboarding) -----------------------------
function connectHtml(): string {
	const MCP = `${BASE}/mcp`;
	const claudeCode = `claude mcp add --transport http flash-props ${MCP} --header "Authorization: Bearer YOUR_KEY"`;
	const cursor = `{
  "mcpServers": {
    "flash-props": {
      "url": "${MCP}",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}`;
	const desktop = `{
  "mcpServers": {
    "flash-props": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP}", "--header", "Authorization: Bearer YOUR_KEY"]
    }
  }
}`;
	const universal = `npx -y mcp-remote ${MCP} --header "Authorization: Bearer YOUR_KEY"`;
	const block = (id: string, code: string, note = '') =>
		`<div class="cfg" id="cfg-${id}"${id === 'code' ? '' : ' style="display:none"'}>
       <div class="codewrap"><button class="copy" onclick="copy(this)">Copy</button><pre><code>${code
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')}</code></pre></div>${note ? `<p class="note">${note}</p>` : ''}</div>`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Connect Flash Props to Claude · MCP</title>
<meta name="description" content="Put live sports betting props inside Claude, Cursor, or any MCP client in 30 seconds."/>
<meta name="theme-color" content="#0b0d12"/><link rel="icon" type="image/png" href="${BRAND_LOGO}"/>
<style>
  :root{--bg:#0b0d12;--panel:#12151d;--line:#232838;--ink:#eef1f7;--mut:#9aa3b6;--flash:#f58426;--flash2:#ff9d47;--green:#35d07f;--mono:ui-monospace,Menlo,Consolas,monospace}
  *{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 560px at 72% -10%,rgba(245,132,38,.14),transparent 60%),var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif}
  a{color:inherit;text-decoration:none}.wrap{max-width:820px;margin:0 auto;padding:0 22px}
  nav{display:flex;justify-content:space-between;align-items:center;padding:18px 0}
  .logo{display:flex;gap:9px;align-items:center;font-weight:800}.logo img{width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(245,132,38,.35))}
  .btn{background:linear-gradient(135deg,var(--flash),var(--flash2));color:#1a1206;font-weight:700;padding:10px 16px;border-radius:10px;font-size:14px;display:inline-block}
  header{padding:44px 0 10px;text-align:center}
  h1{font-size:clamp(30px,5vw,46px);letter-spacing:-1px;margin:0 0 14px}h1 .a{background:linear-gradient(135deg,var(--flash),var(--flash2));-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:var(--mut);font-size:18px;max-width:560px;margin:0 auto 22px}
  .step{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;margin:16px 0}
  .step h2{font-size:18px;margin:0 0 4px;display:flex;gap:10px;align-items:center}
  .num{width:26px;height:26px;border-radius:50%;background:#0a0c11;border:1px solid var(--line);display:grid;place-items:center;font-size:14px;color:var(--flash2)}
  .step p{color:var(--mut);margin:6px 0 14px}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .tab{background:#0a0c11;border:1px solid var(--line);color:var(--mut);border-radius:9px;padding:7px 13px;font-size:13px;cursor:pointer}
  .tab.on{border-color:var(--flash);color:var(--ink)}
  .codewrap{position:relative}
  pre{margin:0;background:#0a0c11;border:1px solid var(--line);border-radius:11px;padding:15px 16px;overflow-x:auto;font:13px/1.7 var(--mono);color:#d7deee}
  .copy{position:absolute;top:9px;right:9px;background:#171b26;border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer}
  .note{color:var(--mut);font-size:13px;margin:10px 0 0}.note code{color:var(--flash2);font-family:var(--mono);font-size:12px}
  .prompts li{color:#cdd4e4;margin:6px 0}.prompts code{color:var(--flash2)}
  .tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.chip{background:#0a0c11;border:1px solid var(--line);border-radius:8px;padding:6px 11px;font:12.5px var(--mono);color:var(--flash2)}
  footer{border-top:1px solid var(--line);margin-top:30px;padding:26px 0 46px;color:var(--mut);font-size:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
</style></head><body>
<div class="wrap">
  <nav><a class="logo" href="/"><img src="${BRAND_LOGO}" alt=""/> Flash Props API</a><a class="btn" href="/billing/free">Get a free key</a></nav>
  <header>
    <h1>Put live props <span class="a">inside Claude.</span></h1>
    <p class="sub">Connect the Flash Props MCP server and ask Claude (or Cursor, or any MCP client) about tonight's board in plain English. 30 seconds, no code.</p>
    <a class="btn" href="/billing/free">Get a free key →</a>
  </header>

  <div class="step">
    <h2><span class="num">1</span> Get an API key</h2>
    <p>Grab a <a style="color:var(--flash2)" href="/billing/free">free key</a> (NBA, delayed) or a <a style="color:var(--flash2)" href="/#pricing">paid key</a> (realtime, all sports, live in-game). You'll paste it into the config below in place of <code style="color:var(--flash2);font-family:var(--mono)">YOUR_KEY</code>.</p>
  </div>

  <div class="step">
    <h2><span class="num">2</span> Add the server to your client</h2>
    <p>Pick your client:</p>
    <div class="tabs">
      <button class="tab on" id="tab-code" onclick="tab('code')">Claude Code</button>
      <button class="tab" id="tab-cursor" onclick="tab('cursor')">Cursor</button>
      <button class="tab" id="tab-desktop" onclick="tab('desktop')">Claude Desktop</button>
      <button class="tab" id="tab-any" onclick="tab('any')">Any client</button>
    </div>
    ${block('code', claudeCode, 'One command. Restart Claude Code and the tools appear.')}
    ${block('cursor', cursor, 'Add to <code>~/.cursor/mcp.json</code> (global) or <code>.cursor/mcp.json</code> (project).')}
    ${block('desktop', desktop, 'Add to <code>claude_desktop_config.json</code>, then fully restart Claude Desktop. Uses the <code>mcp-remote</code> bridge (needs Node).')}
    ${block('any', universal, 'Works with any MCP client that supports stdio servers (Windsurf, Cline, Zed, etc.) via <code>mcp-remote</code>.')}
  </div>

  <div class="step">
    <h2><span class="num">3</span> Ask away</h2>
    <p>Claude now has these tools:</p>
    <div class="tools"><span class="chip">list_sports</span><span class="chip">list_games</span><span class="chip">get_game_props</span><span class="chip">scan_props</span><span class="chip">find_game</span></div>
    <ul class="prompts" style="margin-top:16px">
      <li>"<code>What are tonight's NBA points props?</code>"</li>
      <li>"<code>Scan MLB strikeout props and show the top lines.</code>"</li>
      <li>"<code>Pull the props for Lakers vs Nuggets.</code>"</li>
      <li>"<code>Which players have assist props over 8.5 tonight?</code>"</li>
    </ul>
  </div>

  <footer>
    <div>© Flash AI Solutions · Flash Props API</div>
    <div><a href="/">Home</a> · <a href="/docs">Docs</a> · <a href="/skill.md">skill.md</a> · <a href="/#pricing">Pricing</a></div>
  </footer>
</div>
<script>
  function tab(n){document.querySelectorAll('.cfg').forEach(e=>e.style.display='none');document.querySelectorAll('.tab').forEach(e=>e.classList.remove('on'));document.getElementById('cfg-'+n).style.display='block';document.getElementById('tab-'+n).classList.add('on')}
  function copy(b){const t=b.parentElement.querySelector('code').innerText;navigator.clipboard.writeText(t);b.innerText='Copied';setTimeout(()=>b.innerText='Copy',1500)}
</script></body></html>`;
}

meta.get('/connect', (c) => c.html(connectHtml()));

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
				? `<a class="tier-crypto" href="/billing/crypto?tier=${id}&amp;period=month">Pay with USDC · $${cryptoPerMonthUsdc(id)}/mo <b>save ${discountPct()}%</b></a>`
				: ''
		}
  </div>`;
}

function landingHtml(): string {
	const hl = headlineSport(); // sport a fresh free key can query right now
	const sportCount = 6; // real leagues covered (basketball/mlb/nfl/nhl/ncaa/soccer)
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Flash Props API — the real-deal sports props API</title>
<meta name="description" content="Live sports betting player-prop lines, unified into one fast API and a real MCP server. NBA, MLB, NFL, NHL, NCAA, soccer. Built for apps, bots, and AI agents." />
<meta name="theme-color" content="#07080c" />
<meta property="og:type" content="website" /><meta property="og:url" content="${BASE}/" />
<meta property="og:title" content="Flash Props API — every player prop, one API" />
<meta property="og:description" content="Realtime and live player props across major sports, normalized for apps, bots, and AI agents." />
<meta name="twitter:card" content="summary" /><link rel="canonical" href="${BASE}/" /><link rel="icon" type="image/png" href="${BRAND_LOGO}" />
<style>
  :root{
    --bg:#07080c; --bg2:#0b0d12; --panel:#11141c; --panel2:#161a24; --line:#222838;
    --ink:#eef1f7; --muted:#9aa3b6; --flash:#f58426; --flash2:#ff9d47; --green:#35d07f;
    --hoops:#f97316; --pigskin:#8b5e34; --baseball:#e11d48;
    --radius:16px; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  html,body{margin:0}
  body{background:var(--bg);color:var(--ink);
    font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  a:focus-visible,button:focus-visible{outline:2px solid var(--flash2);outline-offset:4px}
  .wrap{max-width:1140px;margin:0 auto;padding:0 24px;position:relative;z-index:2}

  /* --- world canvas + video hero layers --- */
  #fx{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;display:block;pointer-events:none}
  #herovid{position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:0;display:none}
  .veil{position:fixed;inset:0;z-index:1;pointer-events:none;
    background:
      radial-gradient(1200px 680px at 72% 8%,rgba(245,132,38,.16),transparent 58%),
      radial-gradient(900px 500px at 12% 22%,rgba(59,130,246,.10),transparent 60%),
      linear-gradient(180deg,rgba(7,8,12,.30) 0%,rgba(7,8,12,.72) 62%,var(--bg) 100%)}
  .grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.05;mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
  body.no3d #fx{background:
      radial-gradient(60% 60% at 30% 20%,rgba(249,115,22,.22),transparent 60%),
      radial-gradient(50% 50% at 78% 30%,rgba(225,29,72,.16),transparent 60%),
      radial-gradient(60% 60% at 60% 80%,rgba(59,130,246,.14),transparent 60%),var(--bg)}

  /* --- nav --- */
  nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;
    padding:16px 24px;max-width:1140px;margin:0 auto;
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  nav.solid{background:rgba(7,8,12,.7);border-bottom:1px solid var(--line)}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.2px}
  .logo img{width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 0 14px rgba(245,132,38,.38))}
  .logo-copy{line-height:1.05}.logo-copy small{display:block;margin-top:4px;color:var(--muted);font:600 8px var(--mono);letter-spacing:1.8px;text-transform:uppercase}
  nav .links{display:flex;gap:24px;align-items:center;color:var(--muted);font-size:14px}
  nav .links a:hover{color:var(--ink)}
  .btn{background:linear-gradient(135deg,var(--flash),var(--flash2));color:#1a1206;font-weight:700;
    padding:10px 16px;border-radius:11px;font-size:14px;border:0;cursor:pointer;display:inline-block;
    transition:transform .15s ease,box-shadow .15s ease;box-shadow:0 8px 30px -12px rgba(245,132,38,.7)}
  .btn:hover{transform:translateY(-2px);box-shadow:0 14px 40px -12px rgba(245,132,38,.9)}
  .btn.ghost{background:rgba(255,255,255,.03);border:1px solid var(--line);color:var(--ink);box-shadow:none}
  .btn.ghost:hover{border-color:var(--flash);color:var(--ink)}

  /* --- hero --- */
  header.hero{min-height:92vh;display:flex;flex-direction:column;justify-content:center;
    align-items:center;text-align:center;padding:40px 0 60px;position:relative}
  .pill{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);
    background:rgba(17,20,28,.6);color:var(--muted);padding:7px 14px;border-radius:999px;
    font-size:13px;margin-bottom:26px;backdrop-filter:blur(8px)}
  .pill .g{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);
    animation:pulse 2.4s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  h1.big{font-size:clamp(40px,8.2vw,84px);line-height:.98;margin:0 0 20px;letter-spacing:-2.5px;font-weight:860;
    text-shadow:0 2px 40px rgba(0,0,0,.6)}
  h1.big .accent{background:linear-gradient(120deg,var(--hoops),var(--flash2) 45%,var(--baseball));
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .kicker{font:600 13px var(--mono);letter-spacing:3px;text-transform:uppercase;color:var(--flash2);
    margin-bottom:18px;opacity:.9}
  .kicker b{color:var(--ink)}
  .sub{color:#c3cad9;font-size:clamp(16px,2.3vw,21px);max-width:640px;margin:0 auto 32px;line-height:1.5}
  .cta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .cta .btn{padding:14px 24px;font-size:15.5px}
  .scrollcue{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);color:var(--muted);
    font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.7;animation:bob 2.2s ease-in-out infinite}
  @keyframes bob{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,7px)}}

  .depth-card{position:absolute;z-index:-1;width:190px;padding:14px 16px;border:1px solid rgba(255,255,255,.11);border-radius:15px;background:rgba(10,12,18,.46);backdrop-filter:blur(13px);box-shadow:0 24px 80px rgba(0,0,0,.42);text-align:left;transform-style:preserve-3d;animation:drift 6s ease-in-out infinite}
  .depth-card.left{left:2%;top:31%;transform:perspective(700px) rotateY(13deg) rotateZ(-3deg)}
  .depth-card.right{right:2%;top:48%;transform:perspective(700px) rotateY(-13deg) rotateZ(3deg);animation-delay:-3s}
  .depth-card .dtop{display:flex;justify-content:space-between;color:#7f899b;font:10px var(--mono);letter-spacing:1px;text-transform:uppercase}.depth-card .live{color:var(--green)}
  .depth-card strong{display:block;margin:9px 0 2px;font-size:14px}.depth-card .market{color:var(--flash2);font:700 13px var(--mono)}
  @keyframes drift{0%,100%{translate:0 0}50%{translate:0 -12px}}

  .code{background:rgba(8,10,15,.72);border:1px solid var(--line);border-radius:var(--radius);
    margin:34px auto 0;max-width:720px;text-align:left;overflow:hidden;backdrop-filter:blur(10px);
    box-shadow:0 30px 80px -40px rgba(0,0,0,.9)}
  .code .bar{display:flex;gap:7px;padding:12px 16px;border-bottom:1px solid var(--line);align-items:center}
  .code .bar i{width:11px;height:11px;border-radius:50%;background:#2a3040;display:inline-block}
  .code .bar span{margin-left:auto;color:var(--muted);font:12px var(--mono)}
  .code pre{margin:0;padding:18px 20px;overflow-x:auto;font:13.5px/1.7 var(--mono);color:#d7deee}
  .code .k{color:var(--flash2)} .code .s{color:var(--green)} .code .c{color:#5f6b82}

  /* --- generic sections --- */
  section{padding:64px 0;position:relative;z-index:2}
  .band{background:linear-gradient(180deg,transparent,rgba(11,13,18,.6) 20%,rgba(11,13,18,.6) 80%,transparent)}
  h2{font-size:clamp(26px,4.3vw,40px);letter-spacing:-1px;margin:0 0 10px;text-align:center;font-weight:820}
  .lead{color:var(--muted);text-align:center;max-width:600px;margin:0 auto 40px;font-size:16.5px}
  .reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}
  .reveal.in{opacity:1;transform:none}

  /* proof strip */
  .proof{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;max-width:1000px;margin:0 auto}
  .proof .p{background:rgba(17,20,28,.55);border:1px solid var(--line);border-radius:14px;padding:20px 18px;
    text-align:center;backdrop-filter:blur(6px)}
  .proof .n{font-size:26px;font-weight:850;background:linear-gradient(135deg,var(--flash),var(--flash2));
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .proof .l{color:var(--muted);font-size:13px;margin-top:4px}

  .coverage{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;max-width:1000px;margin:0 auto 22px;padding:0;list-style:none}.coverage li{display:inline-flex;align-items:center;gap:8px;background:rgba(12,14,20,.72);border:1px solid var(--line);border-radius:999px;padding:8px 13px;color:#cbd2df;font:700 11px var(--mono);letter-spacing:.7px;backdrop-filter:blur(8px)}.coverage i{width:7px;height:7px;border:1px solid var(--flash2);border-radius:50%;box-shadow:inset 0 0 0 2px rgba(245,132,38,.18)}

  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));max-width:1000px;margin:0 auto}
  .card{background:rgba(17,20,28,.6);border:1px solid var(--line);border-radius:var(--radius);padding:24px;
    transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;backdrop-filter:blur(6px)}
  .card:hover{transform:translateY(-4px);border-color:rgba(245,132,38,.5);box-shadow:0 24px 60px -30px rgba(245,132,38,.5)}
  .card code{font:12.5px var(--mono);color:var(--flash2);background:#0a0c11;border:1px solid var(--line);
    padding:3px 8px;border-radius:6px;display:inline-block;margin-bottom:12px}
  .card h4{margin:0 0 6px;font-size:16px}
  .card p{margin:0;color:var(--muted);font-size:14px}

  .schema-demo{display:grid;grid-template-columns:.9fr 1.1fr;gap:24px;align-items:center;max-width:1000px;margin:0 auto 26px;background:linear-gradient(135deg,rgba(22,26,36,.7),rgba(9,11,16,.72));border:1px solid var(--line);border-radius:22px;padding:28px;backdrop-filter:blur(8px)}
  .schema-copy h3{font-size:24px;letter-spacing:-.5px;margin:0 0 8px}.schema-copy p{color:var(--muted);margin:0 0 16px}.schema-points{display:grid;gap:9px;color:#cdd4e4;font-size:13px}.schema-points span:before{content:'✓';color:var(--green);font-weight:800;margin-right:9px}
  .response{background:#080a0f;border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 28px 70px -38px rgba(0,0,0,.95)}.response .rbar{display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--line);color:var(--muted);font:11px var(--mono)}.response .ok{color:var(--green)}.response pre{margin:0;padding:16px;overflow:auto;font:12px/1.65 var(--mono);color:#cfd7e7}.response .rk{color:var(--flash2)}.response .rv{color:#83e6ab}.response .rn{color:#7dddf0}

  .agent{background:linear-gradient(180deg,rgba(22,26,36,.7),rgba(17,20,28,.7));border:1px solid var(--line);
    border-radius:22px;padding:40px 28px;text-align:center;max-width:920px;margin:0 auto;
    box-shadow:0 40px 90px -50px rgba(0,0,0,.9);backdrop-filter:blur(8px)}
  .agent .chips{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:22px 0 8px}
  .chip{border:1px solid var(--line);background:#0a0c11;border-radius:12px;padding:11px 16px;font-size:14px}
  .chip b{color:var(--flash2)}
  .askbox{background:#0a0c11;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:6px auto 22px;
    max-width:560px;text-align:left;font:14px/1.6 var(--mono);color:#c3cad9}
  .askbox .u{color:var(--flash2)}

  .tiers{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:stretch;max-width:1060px;margin:0 auto}
  .tier{position:relative;background:rgba(17,20,28,.62);border:1px solid var(--line);border-radius:var(--radius);
    padding:28px 22px;display:flex;flex-direction:column;backdrop-filter:blur(6px);
    transition:transform .18s ease,border-color .18s ease}
  .tier:hover{transform:translateY(-4px)}
  .tier.featured{border-color:var(--flash);box-shadow:0 0 0 1px var(--flash),0 30px 80px -40px rgba(245,132,38,.7)}
  .tier .badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--flash),var(--flash2));
    color:#1a1206;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;letter-spacing:.4px;text-transform:uppercase}
  .tier h3{margin:0 0 6px;font-size:18px}
  .tier .price{font-size:34px;font-weight:850;margin-bottom:6px}
  .tier .price span{font-size:14px;color:var(--muted);font-weight:600}
  .tier .blurb{color:var(--muted);font-size:13.5px;min-height:38px;margin:0 0 16px}
  .tier ul{list-style:none;padding:0;margin:0 0 20px;flex:1;font-size:14px}
  .tier li{padding:6px 0 6px 24px;position:relative;color:#cdd4e4}
  .tier li:before{content:"";position:absolute;left:0;top:11px;width:12px;height:7px;border-left:2px solid var(--green);
    border-bottom:2px solid var(--green);transform:rotate(-45deg)}
  .tier-cta{display:block;text-align:center;padding:12px;border-radius:11px;border:1px solid var(--line);font-weight:700;font-size:14px;transition:transform .15s ease}
  .tier-cta:hover{transform:translateY(-2px)}
  .tier.featured .tier-cta{background:linear-gradient(135deg,var(--flash),var(--flash2));color:#1a1206;border:0}
  .tier-crypto{display:block;text-align:center;margin-top:9px;font-size:12.5px;color:var(--muted)}
  .tier-crypto b{color:var(--green)} .tier-crypto:hover{color:var(--ink)}

  .involve{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));max-width:1000px;margin:0 auto}
  .inv{background:rgba(17,20,28,.6);border:1px solid var(--line);border-radius:var(--radius);padding:24px;
    transition:transform .18s ease,border-color .18s ease}
  .inv:hover{transform:translateY(-4px);border-color:rgba(245,132,38,.45)}
  .inv .ic{font-size:22px;margin-bottom:10px}
  .inv h4{margin:0 0 6px;font-size:16px}
  .inv p{margin:0 0 14px;color:var(--muted);font-size:14px}
  .inv a{color:var(--flash2);font-weight:600;font-size:14px}

  .final-cta{max-width:1000px;margin:0 auto;text-align:center;padding:54px 24px;border:1px solid rgba(245,132,38,.3);border-radius:24px;background:radial-gradient(600px 220px at 50% 0,rgba(245,132,38,.15),transparent 70%),rgba(12,14,20,.65)}.final-cta h2{margin-bottom:12px}.final-cta .lead{margin-bottom:24px}
  .disclaimer{max-width:900px;margin:28px auto 0;color:#687286;text-align:center;font-size:11px;line-height:1.6}

  footer{border-top:1px solid var(--line);margin-top:30px;padding:30px 24px 50px;color:var(--muted);
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:14px;max-width:1140px;
    margin-left:auto;margin-right:auto;position:relative;z-index:2}
  @media(max-width:900px){.depth-card{display:none}.schema-demo{grid-template-columns:1fr}}
  @media(max-width:660px){nav .links a.hideM{display:none}nav{padding:14px 18px}.logo-copy small{display:none}.schema-demo{padding:20px}.response pre{font-size:10.5px}}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.scrollcue,.pill .g{animation:none}}
</style>
</head>
<body>
<canvas id="fx" aria-hidden="true"></canvas>
<video id="herovid" autoplay muted loop playsinline preload="auto" poster="/assets/hero-poster.jpg" aria-hidden="true"></video>
<div class="veil"></div>
<div class="grain"></div>

<nav id="nav" aria-label="Primary navigation">
  <a class="logo" href="/"><img src="${BRAND_LOGO}" alt=""/><span class="logo-copy">Flash Props API<small>by Flash AI Solutions</small></span></a>
  <div class="links">
    <a class="hideM" href="/docs">Docs</a>
    <a class="hideM" href="#pricing">Pricing</a>
    <a class="hideM" href="/connect">Connect</a>
    <a class="btn" href="/billing/free">Get a free key</a>
  </div>
</nav>

<header class="hero wrap">
  <div class="depth-card left" aria-hidden="true"><div class="dtop"><span>Normalized line</span><span class="live">● live</span></div><strong>Player points</strong><div class="market">O 24.5&nbsp;&nbsp; −115</div></div>
  <div class="depth-card right" aria-hidden="true"><div class="dtop"><span>Market pulse</span><span class="live">● live</span></div><strong>Pitcher strikeouts</strong><div class="market">U 6.5&nbsp;&nbsp; +105</div></div>
  <div class="kicker" id="kicker">Jumper. <b>Catch.</b> Base hit.</div>
  <div class="pill"><span class="g"></span> Live now · basketball · MLB · NFL · NHL · NCAA · soccer</div>
  <h1 class="big">Every player prop.<br><span class="accent">One API. Zero scraping.</span></h1>
  <p class="sub">Live player props across NBA, MLB, NFL, NHL, NCAA and soccer, unified from real books into clean JSON and a real MCP server. Free tier, no card. Ship your feature instead of babysitting scrapers.</p>
  <div class="cta">
    <a class="btn" href="/billing/free">Get a free key</a>
    <a class="btn ghost" href="/connect">Connect to Claude →</a>
  </div>
  <div class="code">
    <div class="bar"><i></i><i></i><i></i><span>bash</span></div>
<pre><span class="c"># One call. Tonight's whole board.</span>
curl -H <span class="s">"Authorization: Bearer $KEY"</span> \\
  <span class="k">"${BASE}/api/v1/props?sport=${hl}&amp;limit=10"</span></pre>
  </div>
  <div class="scrollcue">scroll</div>
</header>

<section class="band">
  <div class="wrap">
    <ul class="coverage reveal" aria-label="Supported sports"><li><i></i>NBA</li><li><i></i>MLB</li><li><i></i>NFL</li><li><i></i>NHL</li><li><i></i>NCAA</li><li><i></i>SOCCER</li></ul>
    <div class="proof reveal">
      <div class="p"><div class="n">${sportCount}</div><div class="l">leagues, one shape</div></div>
      <div class="p"><div class="n">MCP</div><div class="l">+ OpenAPI 3.1</div></div>
      <div class="p"><div class="n">$0</div><div class="l">free tier, no card</div></div>
      <div class="p"><div class="n">Live</div><div class="l">pre-game + in-game</div></div>
      <div class="p"><div class="n">REST</div><div class="l">clean JSON, American odds</div></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2 class="reveal">Everything you need to build</h2>
    <p class="lead reveal">A small, honest surface. Clean JSON, American odds, the same shape across every sport.</p>
    <div class="schema-demo reveal">
      <div class="schema-copy"><h3>One shape across every sport.</h3><p>Stop writing a different parser for every book and league. Ask for a board, get predictable fields back.</p><div class="schema-points"><span>Normalized players, stats, lines, and odds</span><span>Pregame and live markets in the same response</span><span>Source and freshness included for every record</span></div></div>
      <div class="response"><div class="rbar"><span>example response</span><span class="ok">200 OK · application/json</span></div><pre>{
  <span class="rk">"sport"</span>: <span class="rv">"${hl}"</span>,
  <span class="rk">"player"</span>: <span class="rv">"Sample Player"</span>,
  <span class="rk">"stat"</span>: <span class="rv">"points"</span>,
  <span class="rk">"line"</span>: <span class="rn">24.5</span>,
  <span class="rk">"overOdds"</span>: <span class="rn">-115</span>,
  <span class="rk">"live"</span>: <span class="rn">true</span>,
  <span class="rk">"source"</span>: <span class="rv">"book"</span>
}</pre></div>
    </div>
    <div class="grid reveal">
      <div class="card"><code>GET /api/v1/games</code><h4>Today's games</h4><p>Every matchup with props posted, live games first.</p></div>
      <div class="card"><code>GET /games/{id}/props</code><h4>Props for a game</h4><p>All player lines for one matchup, filterable by stat.</p></div>
      <div class="card"><code>GET /api/v1/props</code><h4>Market-wide scan</h4><p>Every prop across the slate, flattened into one flow feed.</p></div>
      <div class="card"><code>GET /api/v1/me</code><h4>Key &amp; usage</h4><p>Your tier, limits, and live request counts.</p></div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="agent reveal">
      <h2>Built for AI agents, not just apps</h2>
      <p class="lead">A real MCP server, not just docs. Point Claude, Cursor, or any MCP client at it and ask about the board in plain English. No glue code.</p>
      <div class="askbox"><span class="u">you ›</span> what are the best strikeout props tonight?<br><span style="color:#6b7688">flash-props · scan_props → 5 tools, live data</span></div>
      <div class="chips">
        <div class="chip"><b>MCP server</b> · <a href="/connect">connect →</a></div>
        <div class="chip"><b>OpenAPI 3.1</b> · <a href="/openapi.json">/openapi.json</a></div>
        <div class="chip"><b>Agent guide</b> · <a href="/skill.md">/skill.md</a></div>
        <div class="chip"><b>llms.txt</b> · <a href="/llms.txt">/llms.txt</a></div>
      </div>
      <div style="margin-top:22px"><a class="btn" href="/connect">One-step setup →</a></div>
    </div>
  </div>
</section>

<section id="pricing">
  <div class="wrap">
    <h2 class="reveal">Free to start. Cheap to scale.</h2>
    <p class="lead reveal">Free data sources under the hood, so the free tier is genuinely free. Upgrade for realtime, live in-game lines, and every sport.${
			cryptoEnabled() ? ` <strong style="color:var(--flash2)">Pay with USDC and save ${discountPct()}%.</strong>` : ''
		}</p>
    <div class="tiers reveal">
      ${tierCard('free')}
      ${tierCard('starter')}
      ${tierCard('pro')}
      ${tierCard('enterprise')}
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2 class="reveal">Get involved</h2>
    <p class="lead reveal">However you build, there's a lane in.</p>
    <div class="involve reveal">
      <div class="inv"><div class="ic">⚡</div><h4>Ship an app or bot</h4><p>Grab a free key and hit the REST API. Upgrade when you outgrow it.</p><a href="/billing/free">Get a free key →</a></div>
      <div class="inv"><div class="ic">🤖</div><h4>Give your agent eyes</h4><p>Connect the MCP server to Claude, Cursor, or your own agent in one step.</p><a href="/connect">Connect →</a></div>
      <div class="inv"><div class="ic">📈</div><h4>Go pro</h4><p>Realtime, live in-game props, and every sport for serious volume.</p><a href="/billing/checkout?tier=pro">See Pro →</a></div>
      <div class="inv"><div class="ic">🤝</div><h4>Partner or redistribute</h4><p>Custom volume, SLAs, a redistribution license, or something new. Let's talk.</p><a href="mailto:malone.jaylon@gmail.com?subject=Flash%20Props%20API%20Partnership">Email us →</a></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap"><div class="final-cta reveal"><h2>Make your first call tonight.</h2><p class="lead">A free key, a live endpoint, and no card. The fastest way to judge the product is to use it.</p><div class="cta"><a class="btn" href="/billing/free">Get a free key</a><a class="btn ghost" href="/docs">Read the docs →</a></div></div><p class="disclaimer">League and sport names identify data coverage only. Flash Props API is independent and is not sponsored by, endorsed by, or affiliated with the NBA, MLB, NFL, NHL, NCAA, their teams, or any governing body.</p></div>
</section>

<footer>
  <div>© Flash AI Solutions · Flash Props API</div>
  <div><a href="/docs">Docs</a> · <a href="/connect">Connect</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/skill.md">Agents</a> · <a href="/health">Status</a> · <a href="mailto:malone.jaylon@gmail.com?subject=Flash%20Props%20API%20Support">Support</a></div>
</footer>

<script>
(function(){
  var nav=document.getElementById('nav');
  var reveals=[].slice.call(document.querySelectorAll('.reveal'));
  function onScroll(){ if(nav) nav.classList.toggle('solid', window.scrollY>40); }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
    reveals.forEach(function(el){io.observe(el);});
  } else { reveals.forEach(function(el){el.classList.add('in');}); }

  var HERO_VIDEO_SRC = "${heroVideoReady() ? '/assets/hero.mp4?v=1' : ''}";
  if(HERO_VIDEO_SRC){
    var v=document.getElementById('herovid');
    v.src=HERO_VIDEO_SRC; v.style.display='block';
    document.getElementById('fx').style.display='none';
    var hero=document.querySelector('header.hero');
    if('IntersectionObserver' in window && hero){
      var vio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!document.hidden){v.play().catch(function(){});}else{v.pause();}});},{threshold:.08});
      vio.observe(hero);
    }
    document.addEventListener('visibilitychange',function(){if(document.hidden){v.pause();}else if(hero&&hero.getBoundingClientRect().bottom>0){v.play().catch(function(){});}});
    return;
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fallback(){ document.body.classList.add('no3d'); }
  function hasWebGL(){ try{ var c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl')||c.getContext('experimental-webgl'))); }catch(e){ return false; } }
  if(reduce || !hasWebGL()){ fallback(); return; }

  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
  s.onerror=fallback;
  s.onload=function(){ try{ initScene(); }catch(e){ fallback(); } };
  document.head.appendChild(s);

  function tex(kind){
    var c=document.createElement('canvas'); c.width=c.height=256; var x=c.getContext('2d');
    if(kind==='basketball'){
      x.fillStyle='#e2762b'; x.fillRect(0,0,256,256);
      x.strokeStyle='#140d05'; x.lineWidth=7;
      x.beginPath(); x.moveTo(128,0); x.lineTo(128,256); x.stroke();
      x.beginPath(); x.moveTo(0,128); x.lineTo(256,128); x.stroke();
      x.beginPath(); x.arc(-40,128,120,-1.0,1.0); x.stroke();
      x.beginPath(); x.arc(296,128,120,Math.PI-1.0,Math.PI+1.0); x.stroke();
    } else if(kind==='baseball'){
      x.fillStyle='#f4f4f2'; x.fillRect(0,0,256,256);
      x.strokeStyle='#d21f47'; x.lineWidth=4;
      x.beginPath(); x.arc(30,128,150,-0.8,0.8); x.stroke();
      x.beginPath(); x.arc(226,128,150,Math.PI-0.8,Math.PI+0.8); x.stroke();
      x.lineWidth=2;
      for(var i=0;i<16;i++){var t=-0.8+i*(1.6/15);x.beginPath();x.moveTo(30+Math.cos(t)*150,128+Math.sin(t)*150);x.lineTo(30+Math.cos(t)*138,128+Math.sin(t)*138);x.stroke();}
    } else {
      x.fillStyle='#6a3d24'; x.fillRect(0,0,256,256);
      x.strokeStyle='#efe7da'; x.lineWidth=8;
      x.beginPath(); x.moveTo(128,84); x.lineTo(128,172); x.stroke();
      x.lineWidth=4;
      for(var j=0;j<5;j++){var yy=92+j*18;x.beginPath();x.moveTo(116,yy);x.lineTo(140,yy);x.stroke();}
      x.lineWidth=7; x.beginPath(); x.moveTo(40,60);x.lineTo(40,196);x.moveTo(216,60);x.lineTo(216,196);x.stroke();
    }
    return new THREE.CanvasTexture(c);
  }
  function glowSprite(hex){
    var c=document.createElement('canvas'); c.width=c.height=128; var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,255,255,.9)'); g.addColorStop(.25,hex); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.fillRect(0,0,128,128);
    var m=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.55});
    return new THREE.Sprite(m);
  }

  function initScene(){
    var canvas=document.getElementById('fx');
    var renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
    var scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(48,window.innerWidth/window.innerHeight,.1,100);
    camera.position.set(0,0,7);

    scene.add(new THREE.AmbientLight(0xffffff,.55));
    var key=new THREE.DirectionalLight(0xffffff,.9); key.position.set(3,4,5); scene.add(key);
    var rim=new THREE.PointLight(0xf97316,60,40); rim.position.set(-4,2,3); scene.add(rim);

    var group=new THREE.Group(); scene.add(group);
    var specs=[
      {kind:'basketball',pos:[-2.6,.35,0],r:1.02,glow:'rgba(249,115,22,.85)'},
      {kind:'football',  pos:[.15,-.55,.7],r:1.15,glow:'rgba(139,94,52,.8)'},
      {kind:'baseball',  pos:[2.7,.6,-.3],r:.78,glow:'rgba(225,29,72,.7)'}
    ];
    var balls=[];
    for(var i=0;i<specs.length;i++){
      var sp=specs[i];
      var geo=new THREE.SphereGeometry(sp.r,48,48);
      var mat=new THREE.MeshStandardMaterial({map:tex(sp.kind),roughness:.62,metalness:.12});
      var mesh=new THREE.Mesh(geo,mat);
      mesh.position.set(sp.pos[0],sp.pos[1],sp.pos[2]);
      if(sp.kind==='football') mesh.scale.set(1,.62,.62);
      var gl=glowSprite(sp.glow); gl.scale.set(sp.r*6,sp.r*6,1); gl.position.copy(mesh.position); gl.position.z-=.6;
      group.add(gl); group.add(mesh);
      balls.push({mesh:mesh,base:mesh.position.clone(),spin:.12+i*.06,phase:i*2.1});
    }

    var N=Math.min(window.innerWidth<700?420:820,900), pg=new THREE.BufferGeometry(), arr=new Float32Array(N*3);
    for(var p=0;p<N;p++){arr[p*3]=(Math.random()-.5)*22;arr[p*3+1]=(Math.random()-.5)*13;arr[p*3+2]=(Math.random()-.5)*10-2;}
    pg.setAttribute('position',new THREE.BufferAttribute(arr,3));
    var pm=new THREE.PointsMaterial({color:0xffb477,size:.03,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
    var pts=new THREE.Points(pg,pm); scene.add(pts);

    var accents=[new THREE.Color(0xf97316),new THREE.Color(0x8b5e34),new THREE.Color(0xe11d48)];
    var mx=0,my=0, running=true, clock=new THREE.Clock();
    window.addEventListener('pointermove',function(e){mx=(e.clientX/window.innerWidth-.5);my=(e.clientY/window.innerHeight-.5);},{passive:true});
    document.addEventListener('visibilitychange',function(){running=!document.hidden; if(running){clock.start();loop();}});
    window.addEventListener('resize',function(){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
    renderer.setSize(window.innerWidth,window.innerHeight);

    function loop(){
      if(!running) return;
      requestAnimationFrame(loop);
      var t=clock.getElapsedTime();
      for(var i=0;i<balls.length;i++){var b=balls[i];b.mesh.rotation.y+=b.spin*0.03;b.mesh.rotation.x=Math.sin(t*.4+b.phase)*.12;b.mesh.position.y=b.base.y+Math.sin(t*.7+b.phase)*.18;}
      var seg=(t/3.2)%3, idx=Math.floor(seg), nxt=(idx+1)%3, f=seg-idx;
      rim.color.copy(accents[idx]).lerp(accents[nxt],f);
      rim.position.x=Math.cos(t*.3)*4; rim.position.y=Math.sin(t*.4)*2+1;
      group.rotation.y = mx*0.35; group.rotation.x = my*0.2;
      camera.position.x += (mx*0.7 - camera.position.x)*0.05;
      camera.position.y += (-my*0.5 - camera.position.y)*0.05;
      camera.lookAt(0,0,0);
      pts.rotation.y=t*.02; pts.rotation.x=t*.01;
      renderer.render(scene,camera);
    }
    loop();

    var kick=document.getElementById('kicker');
    var lines=['Jumper. <b>Catch.</b> Base hit.','<b>Jumper.</b> Catch. Base hit.','Jumper. Catch. <b>Base hit.</b>'];
    var ki=0; setInterval(function(){ki=(ki+1)%lines.length; if(kick) kick.innerHTML=lines[ki];},1400);
  }
})();
</script>
</body>
</html>`;
}

meta.get('/', (c) => c.html(landingHtml()));
