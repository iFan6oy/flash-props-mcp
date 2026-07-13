# MCP Godlike UX — Notes for Flash Props

Working notes on making the Flash Props MCP experience *godlike* for users, not just functional. The MCP surface is the single highest-leverage acquisition channel we have: a developer connects once, and every teammate who sees the bot answer in their editor becomes a lead. This is the "MCP website for users."

Date: 2026-07-13. Owner: Flash Props. Status: living doc.

---

## 1. The thesis: what "godlike" means for an MCP data product

An MCP integration is godlike when the distance between *"I heard about this"* and *"holy shit, it just answered my question in my editor"* is measured in seconds, and the answer is something the user could not easily get anywhere else.

Three levers, in order of impact:

1. **Time-to-first-magic-query (TTFMQ).** The only number that matters. From landing on `/connect` to Claude returning a real prop in the user's own client. Target: **under 60 seconds**. Everything else is in service of this.
2. **The magic itself.** The first answer has to be a *wow*, not a *huh*. For us that means the esports/CoD line nobody else serves, or a line-movement read, not "here are 5 NBA points props" (generic, and empty in July).
3. **Zero dead ends.** Every failure state (no key, wrong sport on free tier, expired key, empty slate) returns a *next action*, never a raw error. An agent that hits a wall and says nothing is the opposite of godlike.

If we optimize only one thing: **TTFMQ**.

---

## 2. The user journey, and what godlike looks like at each stage

| Stage | Reality today | Godlike |
|---|---|---|
| **Discover** | MCP Registry listing; a link on the landing page | Registry listing with a killer one-line pitch + the esports hook; a "Connect" CTA that is above the fold everywhere |
| **Get a key** | `/billing/free` form, email required | One field, one click, key on screen *and* in inbox. Pre-filled `?src=mcp` so we know the channel |
| **Connect** | `/connect` with copy-paste per client (Code, Cursor, Desktop, Any) | Copy button that copies the command *with the key already substituted*; a "detect my client" nicety; a single canonical `mcp-remote` fallback |
| **First query** | User invents a prompt; tools return JSON | We hand them 3 prompts that are guaranteed non-empty *right now* (server knows the in-season slate), and the first one shows the esports edge |
| **Habit** | Nothing pulls them back | A daily "what moved" hook; the movement tool that rewards re-querying; usage visible in the dashboard |

The gap is concentrated in **Connect** and **First query**. Discover and Get-a-key are close.

---

## 3. Best-in-class patterns worth stealing

- **One command, key inlined.** The gold standard is a single `claude mcp add ... --header "Authorization: Bearer <THEIR_KEY>"` where the page has already put *their* key in the string. No "replace YOUR_KEY" step. This alone can halve TTFMQ. (Requires the user to be signed in / have a key in session so we can inline it. See roadmap.)
- **`mcp-remote` as the universal escape hatch.** Every non-native client (Windsurf, Cline, Zed) works through `npx -y mcp-remote <url> --header ...`. We already document this; make it the visible default, not the last tab.
- **Machine-readable discovery.** `skill.md` + `llms.txt` so an *agent* can onboard itself. We have both. Godlike: make `skill.md` lead with the copy-paste connect block and the 3 guaranteed-live prompts, so a coding agent wiring us up does it right the first time.
- **Registry as distribution, not vanity.** Being in the MCP Registry means aggregators (Glama, PulseMCP, Smithery) ingest us. Godlike: the registry description itself carries the esports wedge, because that snippet is what users see in those directories.
- **The "it works" receipt.** After connecting, the best integrations show a tool list and a sample response inline so the user believes it before they even query. We have the tool chips; add a *rendered sample answer*.

---

## 4. Audit: current Flash Props MCP surfaces vs the bar

What exists:
- `GET /mcp` — streamable-HTTP MCP server, key via `Authorization: Bearer`. 5 tools: `list_sports`, `list_games`, `get_game_props`, `scan_props`, `find_game`. Per-key tier + expiry enforced (now identical to REST).
- `GET /connect` — hero + numbered steps + per-client config tabs (Claude Code / Cursor / Claude Desktop / Any) + tool chips + example prompts. Registry + client-breadth trust line added 2026-07-13.
- `skill.md`, `llms.txt` — agent discovery, honest, list the tools + stat keys.
- MCP Registry listing `io.github.iFan6oy/flash-props-api` v1.0.0.

Gaps against godlike, ranked:
1. **Key is not inlined in the connect command.** Users still paste `YOUR_KEY` by hand. Biggest single TTFMQ cost.
2. **No guaranteed-live first prompts.** Example prompts are static (`CS2 kills`, `CoD props`). Great when those slates exist, empty otherwise. The server *knows* what is live right now (`/status`); the connect page should surface "ask this, it has data tonight."
3. **No rendered magic moment.** We tell users what to ask; we do not *show* the payoff. A mock answer card would sell it.
4. **Free-tier one-sport trap bites MCP too.** On a free key, `scan_props sport:nfl` denies with "covers: basketball." An MCP user's first exploratory call can dead-end. (Same root issue flagged for the bot: consider free = all-sports, low-volume.)
5. **`skill.md` buries the connect block.** An agent reading it has to assemble the setup; lead with it.

---

## 5. Roadmap (prioritized)

**Quick wins (hours):**
- [ ] Inline the key into every `/connect` code block when the visitor has a key in session (or a `?key=` after signup redirect). Add a "Copy with my key" button. *Biggest TTFMQ win.*
- [ ] Pull the in-season headline sport into the connect page's example prompts server-side, so the first suggested prompt always has data tonight. Lead with the esports one when esports is live.
- [ ] Add a rendered "magic moment" card to `/connect`: a mock Claude answer to "best CS2 kills props tonight" using a real current row.
- [ ] Reorder `skill.md` to lead with the one-line connect command + the 3 live prompts.
- [ ] Make the registry description carry the esports wedge (re-publish).

**Bets (days):**
- [ ] Reconsider free tier = all active sports at low volume, so no first-call dead-ends (product/pricing call; also helps the Discord bot).
- [ ] A `/connect` "test my connection" widget: user pastes key, we call `/api/v1/me` and show tier + a live sample, before they leave the page.
- [ ] Post the server to Smithery / Glama / PulseMCP directly (not just via registry ingest) with the esports angle in each.
- [ ] A `whats_live` MCP tool (or make `list_sports` return per-sport counts) so an agent can self-select a non-empty sport without trial and error.

**Metric to watch:** TTFMQ, proxied by `?src=mcp` free keys that make a first authenticated `/api/v1/*` or `/mcp` call within their first session.

---

## 6. One-liner to keep us honest

> A user should be able to go from the `/connect` page to Claude naming tonight's top CoD kills prop, in their own editor, in under a minute, without editing a single placeholder.

Everything in section 5 is in service of that sentence.
