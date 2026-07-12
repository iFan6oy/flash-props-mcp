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
<style>
  :root{--bg:#0b0d12;--panel:#12151d;--line:#232838;--ink:#eef1f7;--mut:#9aa3b6;--flash:#f58426;--flash2:#ff9d47;--green:#35d07f;--mono:ui-monospace,Menlo,Consolas,monospace}
  *{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 560px at 72% -10%,rgba(245,132,38,.14),transparent 60%),var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif}
  a{color:inherit;text-decoration:none}.wrap{max-width:820px;margin:0 auto;padding:0 22px}
  nav{display:flex;justify-content:space-between;align-items:center;padding:18px 0}
  .logo{display:flex;gap:9px;align-items:center;font-weight:800}.logo .d{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,var(--flash),var(--flash2));display:grid;place-items:center;color:#1a1206;font-weight:900}
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
  <nav><div class="logo"><span class="d">F</span> Flash Props API</div><a class="btn" href="/billing/free">Get a free key</a></nav>
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
				? `<a class="tier-crypto" href="/billing/crypto?tier=${id}&period=month">Pay with USDC · $${cryptoPerMonthUsdc(id)}/mo <b>save ${discountPct()}%</b></a>`
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
  .logo .dot{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--flash),var(--flash2));
    display:grid;place-items:center;color:#1a1206;font-weight:900;box-shadow:0 0 22px rgba(245,132,38,.5)}
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

  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));max-width:1000px;margin:0 auto}
  .card{background:rgba(17,20,28,.6);border:1px solid var(--line);border-radius:var(--radius);padding:24px;
    transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;backdrop-filter:blur(6px)}
  .card:hover{transform:translateY(-4px);border-color:rgba(245,132,38,.5);box-shadow:0 24px 60px -30px rgba(245,132,38,.5)}
  .card code{font:12.5px var(--mono);color:var(--flash2);background:#0a0c11;border:1px solid var(--line);
    padding:3px 8px;border-radius:6px;display:inline-block;margin-bottom:12px}
  .card h4{margin:0 0 6px;font-size:16px}
  .card p{margin:0;color:var(--muted);font-size:14px}

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

  footer{border-top:1px solid var(--line);margin-top:30px;padding:30px 24px 50px;color:var(--muted);
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:14px;max-width:1140px;
    margin-left:auto;margin-right:auto;position:relative;z-index:2}
  @media(max-width:660px){nav .links a.hideM{display:none}nav{padding:14px 18px}}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}.scrollcue,.pill .g{animation:none}}
</style>
</head>
<body>
<canvas id="fx"></canvas>
<video id="herovid" autoplay muted loop playsinline preload="none"></video>
<div class="veil"></div>
<div class="grain"></div>

<nav id="nav">
  <div class="logo"><span class="dot">F</span> Flash Props API</div>
  <div class="links">
    <a class="hideM" href="/docs">Docs</a>
    <a class="hideM" href="#pricing">Pricing</a>
    <a class="hideM" href="/connect">Connect</a>
    <a class="btn" href="/billing/free">Get a free key</a>
  </div>
</nav>

<header class="hero wrap">
  <div class="kicker" id="kicker">Jumper. <b>Catch.</b> Base hit.</div>
  <div class="pill"><span class="g"></span> Live now · basketball · MLB · NFL · NHL · NCAA · soccer</div>
  <h1 class="big">The real-deal<br><span class="accent">sports props API.</span></h1>
  <p class="sub">Every player prop, every league, unified from real sportsbooks into one fast feed and a real MCP server. Pre-game and live. Built for apps, bots, and the agents that bet smarter than you.</p>
  <div class="cta">
    <a class="btn" href="/billing/free">Get a free key</a>
    <a class="btn ghost" href="/connect">Connect to Claude →</a>
  </div>
  <div class="code">
    <div class="bar"><i></i><i></i><i></i><span>bash</span></div>
<pre><span class="c"># One call. Tonight's whole board.</span>
curl -H <span class="s">"Authorization: Bearer $KEY"</span> \\
  <span class="k">"${BASE}/api/v1/props?sport=${hl}&limit=10"</span></pre>
  </div>
  <div class="scrollcue">scroll</div>
</header>

<section class="band">
  <div class="wrap">
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

<footer>
  <div>© Flash AI Solutions · Flash Props API</div>
  <div><a href="/docs">Docs</a> · <a href="/connect">Connect</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/skill.md">Agents</a> · <a href="/health">Status</a></div>
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

  var HERO_VIDEO_SRC = "";
  if(HERO_VIDEO_SRC){
    var v=document.getElementById('herovid');
    v.src=HERO_VIDEO_SRC; v.style.display='block';
    document.getElementById('fx').style.display='none';
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
