// Shared premium chrome for every customer-facing page (billing, dashboard,
// status, legal, connect). One cinematic shell so the whole product feels like
// the landing page, not a set of bare utility forms. Pages pass inner HTML and
// keep using the class names below (.box / .card / .btn / .pill / etc.).

const BOLT = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2L4.5 13.2c-.4.5 0 1.3.6 1.3H11l-1.4 7.2c-.1.7.8 1.1 1.3.5L19.5 11c.4-.5 0-1.3-.6-1.3H13l1.3-6.9c.1-.7-.8-1.1-1.3-.6z" fill="url(#g)"/><defs><linearGradient id="g" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#ff9d47"/><stop offset="1" stop-color="#f58426"/></linearGradient></defs></svg>`;

const CSS = `
:root{
  --bg:#07080c;--bg2:#0b0d12;--panel:#12151d;--glass:rgba(20,24,33,.66);--line:#222838;--line2:#2b3346;
  --ink:#eef1f7;--mut:#9aa3b6;--dim:#6b7688;--flash:#f58426;--flash2:#ff9d47;--glow:rgba(245,132,38,.35);
  --green:#35d07f;--red:#ff5c6c;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r:15px
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif;
  background:
   radial-gradient(1200px 640px at 82% -12%,rgba(245,132,38,.16),transparent 60%),
   radial-gradient(900px 520px at 8% 108%,rgba(245,132,38,.07),transparent 60%),
   var(--bg);
  background-attachment:fixed}
a{color:var(--flash2);text-decoration:none}a:hover{color:#ffb469}
.mut{color:var(--mut)}.dim{color:var(--dim)}.small{font-size:13px}b{color:var(--ink)}
/* header */
.hd{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);background:linear-gradient(180deg,rgba(7,8,12,.86),rgba(7,8,12,.5));border-bottom:1px solid rgba(255,255,255,.05)}
.hd-in{max-width:1000px;margin:0 auto;padding:13px 22px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.brand{display:flex;align-items:center;gap:9px;color:var(--ink);font-weight:800;letter-spacing:-.01em}
.brand svg{filter:drop-shadow(0 2px 10px var(--glow))}
.brand small{color:var(--dim);font-weight:600;font-size:12px;margin-left:2px}
.hd nav{display:flex;align-items:center;gap:20px}
.hd nav a{color:var(--mut);font-size:14px;font-weight:500}.hd nav a:hover{color:var(--ink)}
.hd nav a.on{color:var(--flash2)}
.hd .cta{padding:8px 15px;border-radius:10px;font-weight:700;font-size:14px;color:#1a1206;background:linear-gradient(135deg,var(--flash),var(--flash2));box-shadow:0 6px 20px -8px var(--glow)}
.hd .cta:hover{color:#1a1206}
@media(max-width:640px){.hd nav .hide{display:none}}
/* layout */
main{max-width:1000px;margin:0 auto;padding:34px 22px 80px}
main.narrow{max-width:820px}
h1{font-size:27px;line-height:1.15;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:17px;margin:28px 0 10px;letter-spacing:-.01em}
h3{font-size:16px;margin:0 0 8px}
/* centered card (auth / key pages) */
.box{max-width:480px;margin:7vh auto 0;background:var(--glass);border:1px solid var(--line);border-radius:20px;padding:34px;
  box-shadow:0 30px 80px -40px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.04) inset}
.wrap{width:100%}
/* cards */
.card{background:var(--glass);border:1px solid var(--line);border-radius:var(--r);padding:20px 22px;margin:16px 0;
  box-shadow:0 20px 60px -44px rgba(0,0,0,.85)}
.card.hoverable{transition:border-color .2s,transform .2s}.card.hoverable:hover{border-color:var(--line2);transform:translateY(-1px)}
/* buttons */
button,.btn{font:inherit;font-weight:700;border:0;border-radius:11px;padding:11px 17px;cursor:pointer;color:#1a1206;
  background:linear-gradient(135deg,var(--flash),var(--flash2));box-shadow:0 8px 22px -10px var(--glow);transition:transform .15s,box-shadow .15s,filter .15s}
button:hover,.btn:hover{transform:translateY(-1px);box-shadow:0 12px 30px -10px var(--glow);filter:brightness(1.04)}
button:active,.btn:active{transform:translateY(0)}
button.ghost,.btn.ghost{background:transparent;border:1px solid var(--line2);color:var(--ink);box-shadow:none;font-weight:600}
button.ghost:hover{border-color:var(--flash2);color:var(--flash2);transform:none;filter:none}
button.danger,.btn.danger{background:transparent;border:1px solid #45242b;color:var(--red);box-shadow:none;font-weight:600}
button.danger:hover{background:rgba(255,92,108,.08);transform:none;filter:none}
/* inputs */
input,select{width:100%;padding:12px 14px;border-radius:11px;border:1px solid var(--line);background:#0a0c11;color:var(--ink);font:15px inherit;transition:border-color .15s,box-shadow .15s}
input:focus,select:focus{outline:0;border-color:var(--flash);box-shadow:0 0 0 3px rgba(245,132,38,.15)}
/* code */
code{font:13.5px var(--mono);color:var(--flash2)}
pre{background:#0a0c11;border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow-x:auto;font:13px/1.55 var(--mono);color:#d7deee}
.key{display:flex;gap:10px;align-items:stretch;margin:16px 0}
.key code{flex:1;background:#0a0c11;border:1px solid var(--line);border-radius:11px;padding:13px 15px;color:var(--flash2);overflow-x:auto;white-space:nowrap}
/* pills */
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--line2);color:var(--mut)}
.pill.on,.pill.ok{color:var(--green);border-color:#1c3a2a;background:rgba(53,208,127,.06)}
.pill.off,.pill.bad{color:var(--red);border-color:#3a1c22;background:rgba(255,92,108,.05)}
/* misc from existing pages */
.warn{background:linear-gradient(180deg,rgba(58,42,18,.5),rgba(26,19,10,.5));border:1px solid #3a2a12;color:#ffbf80;padding:12px 15px;border-radius:12px;font-size:14px;margin:14px 0}
.row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px}
.meta{color:var(--mut);font-size:13px;margin:8px 0}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.bar{height:7px;background:#0a0c11;border:1px solid var(--line);border-radius:999px;overflow:hidden;margin:7px 0}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--flash),var(--flash2));box-shadow:0 0 12px var(--glow)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line)}
th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
.legal p,.legal li{color:#c6cddd}.legal ul{padding-left:20px}.legal li{margin:6px 0}.legal h2{color:var(--ink)}
a.b{display:inline-block;margin-top:12px;font-weight:600}
/* footer */
footer{border-top:1px solid rgba(255,255,255,.05);margin-top:40px}
.ft-in{max-width:1000px;margin:0 auto;padding:26px 22px 50px;color:var(--mut);font-size:13px;display:flex;flex-direction:column;gap:12px}
.ft-links{display:flex;gap:8px 16px;flex-wrap:wrap}.ft-links a{color:var(--mut)}.ft-links a:hover{color:var(--flash2)}
.ft-dis{color:var(--dim);font-size:12px;line-height:1.55;max-width:760px}
`;

export function brandHeader(active = ''): string {
	const link = (href: string, label: string, cls = 'hide') =>
		`<a class="${cls}${active === label.toLowerCase() ? ' on' : ''}" href="${href}">${label}</a>`;
	return `<header class="hd"><div class="hd-in">
    <a class="brand" href="/">${BOLT} Flash Props <small>API</small></a>
    <nav>
      ${link('/docs', 'Docs')}
      ${link('/dashboard', 'Dashboard')}
      ${link('/status', 'Status')}
      ${link('/#pricing', 'Pricing')}
      <a class="cta" href="/billing/free">Get a key</a>
    </nav>
  </div></header>`;
}

export function brandFooter(): string {
	return `<footer><div class="ft-in">
    <div class="ft-links">
      <a href="/docs">Docs</a><a href="/connect">Connect (MCP)</a><a href="/dashboard">Dashboard</a>
      <a href="/status">Status</a><a href="/openapi.json">OpenAPI</a>
      <a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/aup">Acceptable Use</a>
      <a href="mailto:malone.jaylon@gmail.com?subject=Flash%20Props%20API%20Support">Support</a>
    </div>
    <div class="ft-dis">© Flash AI Solutions · Flash Props API. Data is for informational use only. Flash Props does not accept wagers and is not a sportsbook. Not affiliated with any league, team, sportsbook, or DFS operator. 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.</div>
  </div></footer>`;
}

// The full premium page. `layout:'center'` wraps inner in a centered card slot;
// `layout:'page'` gives a wide content area. Pages keep their own .box/.wrap/.card.
export function shell(
	title: string,
	inner: string,
	opts: { active?: string; layout?: 'center' | 'page'; narrow?: boolean } = {}
): string {
	const mainCls = opts.narrow ? 'narrow' : '';
	const body = opts.layout === 'center' ? `<div class="box">${inner}</div>` : inner;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#07080c"/>
<title>${title} · Flash Props API</title>
<style>${CSS}</style></head><body>
${brandHeader(opts.active)}
<main class="${mainCls}">${body}</main>
${brandFooter()}
<script>function cp(){var k=document.getElementById('k');if(!k)return;navigator.clipboard.writeText(k.innerText);var b=document.getElementById('c');if(b){b.innerText='Copied';setTimeout(function(){b.innerText='Copy'},1500)}}</script>
</body></html>`;
}
