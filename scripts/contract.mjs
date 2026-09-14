#!/usr/bin/env node
// Contract gate for the public Flash Props MCP connector repository.
//
// The hosted Flash Props API publishes a machine-readable public contract
// (tiers, MCP tool ladder, sports vocabulary, projection and snapshot rules).
// This repository vendors a copy at contract/flash-props-contract.json and
// generates the README tier list and tool table from it, so the public docs
// cannot drift from what the API actually enforces.
//
// Usage (Node 20+, no dependencies):
//   node scripts/contract.mjs sync          regenerate README blocks + server.json version
//   node scripts/contract.mjs check         offline drift checks (CI on push / PR)
//   node scripts/contract.mjs check --live  also compare against the hosted /contract.json
//   node scripts/contract.mjs links         check every https link in README.md

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
	contract: join(ROOT, 'contract', 'flash-props-contract.json'),
	readme: join(ROOT, 'README.md'),
	server: join(ROOT, 'server.json'),
	glama: join(ROOT, 'glama.json')
};
const LIVE_CONTRACT_URL = 'https://api.flashodds.live/contract.json';
const RETIRED_TIER_NAMES = ['Starter'];
const BLOCK_NAMES = ['tools', 'tiers'];
const FETCH_TIMEOUT_MS = 20_000;

// ---- io helpers -------------------------------------------------------------

/** Read as text with CRLF normalized, so Windows checkouts and Linux CI agree. */
const readText = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, '/');

function parseJsonFile(p) {
	let text;
	try {
		text = readText(p);
	} catch (e) {
		throw new GateError(`${rel(p)} could not be read: ${e.message}`);
	}
	try {
		return JSON.parse(text);
	} catch (e) {
		throw new GateError(`${rel(p)} is not valid JSON: ${e.message}`);
	}
}

class GateError extends Error {}

// ---- contract validation ----------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v) && v >= 0;

/** Returns a list of problems; empty means the contract has every key this gate relies on. */
function validateContract(c) {
	const errs = [];
	if (!isObj(c)) return ['contract root is not an object'];
	if (!isInt(c.contractVersion)) errs.push('contractVersion must be a non-negative integer');
	if (!isStr(c.apiVersion) || !/^\d+\.\d+\.\d+/.test(c.apiVersion)) errs.push('apiVersion must be a semver string');
	if (!isObj(c.links)) errs.push('links must be an object');
	else for (const k of ['website', 'docs', 'openapi', 'contract', 'mcp', 'freeKey']) {
		if (!isStr(c.links[k]) || !c.links[k].startsWith('https://')) errs.push(`links.${k} must be an https URL`);
	}
	if (!Array.isArray(c.tiers) || c.tiers.length === 0) errs.push('tiers must be a non-empty array');
	else c.tiers.forEach((t, i) => {
		const at = `tiers[${i}]`;
		if (!isObj(t)) return errs.push(`${at} must be an object`);
		if (!isStr(t.id)) errs.push(`${at}.id must be a string`);
		if (!isStr(t.name)) errs.push(`${at}.name must be a string`);
		if (!(t.priceMonthlyUsd === null || isInt(t.priceMonthlyUsd))) errs.push(`${at}.priceMonthlyUsd must be an integer or null`);
		for (const k of ['requestsPerDay', 'requestsPerMinute', 'scanRows']) if (!isInt(t[k])) errs.push(`${at}.${k} must be an integer`);
		if (!isObj(t.entitlements)) errs.push(`${at}.entitlements must be an object`);
		else {
			for (const k of ['evidence', 'context', 'history', 'movement']) if (!isStr(t.entitlements[k])) errs.push(`${at}.entitlements.${k} must be a string`);
			if (!isInt(t.entitlements.leadersLimit)) errs.push(`${at}.entitlements.leadersLimit must be an integer`);
		}
	});
	if (Array.isArray(c.tiers) && !c.tiers.some((t) => t?.priceMonthlyUsd === null)) errs.push('tiers must include a custom-priced (null price) tier');
	if (!isObj(c.mcp)) errs.push('mcp must be an object');
	else {
		if (!isStr(c.mcp.endpoint) || !c.mcp.endpoint.startsWith('https://')) errs.push('mcp.endpoint must be an https URL');
		if (c.mcp.transport !== 'streamable-http') errs.push('mcp.transport must be "streamable-http"');
		if (!isStr(c.mcp.auth)) errs.push('mcp.auth must be a string');
		if (!Array.isArray(c.mcp.anonymousTools)) errs.push('mcp.anonymousTools must be an array');
		if (!Array.isArray(c.mcp.tools) || c.mcp.tools.length === 0) errs.push('mcp.tools must be a non-empty array');
		else c.mcp.tools.forEach((t, i) => {
			if (!isObj(t) || !isStr(t.name) || !isStr(t.access)) errs.push(`mcp.tools[${i}] must have string name and access`);
		});
	}
	if (!isObj(c.sports) || !Array.isArray(c.sports.ids)) errs.push('sports.ids must be an array');
	if (!isObj(c.projection) || !Array.isArray(c.projection.bases) || !isStr(c.projection.rule)) errs.push('projection must have bases[] and rule');
	if (!isObj(c.snapshot) || !isStr(c.snapshot.field) || !isStr(c.snapshot.rule)) errs.push('snapshot must have field and rule');
	return errs;
}

function loadContract() {
	const c = parseJsonFile(PATHS.contract);
	const errs = validateContract(c);
	if (errs.length) throw new GateError(`${rel(PATHS.contract)} is missing required keys:\n  - ${errs.join('\n  - ')}`);
	return c;
}

// ---- rendering (mirrors renderToolsTable / renderTiersList in the API repo) --

/** en-US grouping without depending on ICU data being present. */
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ladderTiers = (c) => c.tiers.filter((t) => t.priceMonthlyUsd !== null);
const customTiers = (c) => c.tiers.filter((t) => t.priceMonthlyUsd === null);

function renderToolsTable(c) {
	const rows = c.mcp.tools.map((t) => `| \`${t.name}\` | ${t.access} |`);
	return ['| Tool | Access |', '| --- | --- |', ...rows].join('\n');
}

function renderTiersList(c) {
	const lines = ladderTiers(c).map((t) => {
		const e = t.entitlements;
		const price = t.priceMonthlyUsd === 0 ? '$0' : `$${t.priceMonthlyUsd}/mo`;
		const internal = t.name.toLowerCase() === t.id ? '' : ` (internal id \`${t.id}\`)`;
		return (
			`- **${t.name}**${internal}: ${price}, ${fmt(t.requestsPerDay)} requests/day, ` +
			`${fmt(t.requestsPerMinute)} requests/minute, ${fmt(t.scanRows)}-row scans, evidence ${e.evidence}, ` +
			`context ${e.context}, history ${e.history}, movement ${e.movement}, top ${fmt(e.leadersLimit)} leaders`
		);
	});
	for (const t of customTiers(c)) lines.push(`- **${t.name}**: custom limits`);
	return lines.join('\n');
}

const RENDERERS = { tools: renderToolsTable, tiers: renderTiersList };

const markers = (name) => [`<!-- contract:${name}:start -->`, `<!-- contract:${name}:end -->`];

/** Locate a generated block. Throws with a specific message when markers are missing or duplicated. */
function findBlock(text, name) {
	const [start, end] = markers(name);
	const a = text.indexOf(start);
	const b = text.indexOf(end);
	if (a < 0 || b < 0) throw new GateError(`README.md is missing the ${start} / ${end} markers`);
	if (b < a) throw new GateError(`README.md has ${end} before ${start}`);
	if (text.indexOf(start, a + 1) >= 0 || text.indexOf(end, b + 1) >= 0) throw new GateError(`README.md has duplicate ${name} contract markers`);
	return { innerStart: a + start.length, innerEnd: b, outerStart: a, outerEnd: b + end.length };
}

function applyBlocks(text, c) {
	let out = text;
	for (const name of BLOCK_NAMES) {
		const blk = findBlock(out, name);
		out = `${out.slice(0, blk.innerStart)}\n${RENDERERS[name](c)}\n${out.slice(blk.innerEnd)}`;
	}
	return out;
}

/** README text with every generated block removed, for claim scanning. */
function stripBlocks(text) {
	let out = text;
	for (const name of BLOCK_NAMES) {
		const blk = findBlock(out, name);
		out = `${out.slice(0, blk.outerStart)}\n${out.slice(blk.outerEnd)}`;
	}
	return out;
}

// ---- individual checks ------------------------------------------------------

function checkReadmeBlocks(readme, c, fail) {
	for (const name of BLOCK_NAMES) {
		const blk = findBlock(readme, name);
		const actual = readme.slice(blk.innerStart, blk.innerEnd).trim();
		const expected = RENDERERS[name](c);
		if (actual !== expected) {
			const a = actual.split('\n');
			const e = expected.split('\n');
			const i = e.findIndex((line, idx) => line !== a[idx]);
			const at = i < 0 ? e.length : i;
			fail(
				`README ${name} block is stale (run: node scripts/contract.mjs sync). First difference at block line ${at + 1}:\n` +
					`    expected: ${e[at] ?? '<end of block>'}\n` +
					`    actual:   ${a[at] ?? '<end of block>'}`
			);
		}
	}
}

const toNumber = (raw) => {
	const m = /^([\d,]+(?:\.\d+)?)([kKmM])?$/.exec(raw);
	if (!m) return NaN;
	const base = Number(m[1].replace(/,/g, ''));
	const mult = { k: 1e3, m: 1e6 }[m[2]?.toLowerCase()] ?? 1;
	return Math.round(base * mult);
};

/**
 * Quota and price claims outside the generated blocks must use numbers that
 * exist in the contract. Scoped to claim shapes only, so unrelated numbers pass.
 */
function checkFreeTextClaims(readme, c, fail) {
	const prose = stripBlocks(readme);
	const allowed = {
		'requests/day': new Set(c.tiers.map((t) => t.requestsPerDay)),
		'requests/minute': new Set(c.tiers.map((t) => t.requestsPerMinute)),
		'-row': new Set(c.tiers.map((t) => t.scanRows)),
		'$N/mo': new Set(c.tiers.map((t) => t.priceMonthlyUsd).filter((p) => p !== null))
	};
	const NUM = '(\\d[\\d,]*(?:\\.\\d+)?[kKmM]?)';
	const patterns = [
		{ kind: 'requests/day', re: new RegExp(`${NUM}\\s*(?:requests?|req|calls?)\\s*(?:/|per\\s+|a\\s+)\\s*(?:day|d)\\b`, 'gi') },
		{ kind: 'requests/minute', re: new RegExp(`${NUM}\\s*(?:requests?|req|calls?)\\s*(?:/|per\\s+|a\\s+)\\s*(?:minute|min|m)\\b`, 'gi') },
		{ kind: '-row', re: new RegExp(`${NUM}-rows?\\b`, 'gi') },
		{ kind: '$N/mo', re: new RegExp(`\\$${NUM}\\s*(?:/|per\\s+|a\\s+)\\s*(?:mo|month)\\b`, 'gi') }
	];
	for (const { kind, re } of patterns) {
		for (const m of prose.matchAll(re)) {
			const n = toNumber(m[1]);
			if (!allowed[kind].has(n)) {
				fail(`README text outside generated blocks claims "${m[0]}" but no contract tier has ${kind} = ${m[1]} (allowed: ${[...allowed[kind]].map(fmt).join(', ')})`);
			}
		}
	}
}

function checkRetiredNames(files, fail) {
	for (const [path, text] of files) {
		for (const name of RETIRED_TIER_NAMES) {
			const re = new RegExp(`\\b${name}\\b`, 'g');
			const hits = [...text.matchAll(re)];
			if (hits.length) {
				const line = text.slice(0, hits[0].index).split('\n').length;
				fail(`${rel(path)} uses retired tier display name "${name}" (${hits.length}x, first on line ${line}); the contract tier names are the only valid names`);
			}
		}
	}
}

/** A hard-coded "which sports are modeled" list goes stale; that is runtime state from /api/v1/sports. */
function checkFrozenSportLists(files, c, fail) {
	const names = [...new Set([...c.sports.ids, 'cod', 'call of duty', 'counter-strike', 'cs', 'val', 'dota', 'wnba', 'epl', 'ufc', 'mma', 'pga', 'golf'])]
		.sort((a, b) => b.length - a.length)
		.map((s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'));
	const sport = `(?:${names.join('|')})`;
	const joiner = `\\s*(?:\\+|&|,|/|\\band\\b)\\s*`;
	const list = `\\b${sport}(?:${joiner}${sport})+\\b`;
	const temporal = `(?:today|currently|right now|for now|at the moment|at launch|so far)`;
	const re = new RegExp(`${list}[^.\\n]{0,40}\\b${temporal}\\b|\\b${temporal}\\b[^.\\n]{0,40}${list}|\\b(?:modeled|projected|supported)\\s+sports?\\s*(?:are|:)\\s*${list}`, 'gi');
	for (const [path, text] of files) {
		for (const m of text.matchAll(re)) {
			fail(`${rel(path)} contains a frozen modeled-sport list "${m[0].trim()}"; coverage is runtime state, point readers at GET /api/v1/sports or list_sports instead`);
		}
	}
}

function checkServerJson(server, c, fail) {
	if (!isObj(server)) return fail('server.json root is not an object');
	if (!isStr(server.$schema) || !server.$schema.startsWith('https://')) fail('server.json $schema must be an https URL');
	if (!isStr(server.name)) fail('server.json name must be a non-empty string');
	if (!isStr(server.version)) fail('server.json version must be a non-empty string');
	else if (server.version !== c.apiVersion) fail(`server.json version is ${server.version} but contract apiVersion is ${c.apiVersion} (run: node scripts/contract.mjs sync)`);
	const remote = Array.isArray(server.remotes) ? server.remotes[0] : undefined;
	if (!isObj(remote)) return fail('server.json remotes[0] is missing');
	if (remote.type !== 'streamable-http') fail(`server.json remotes[0].type is ${JSON.stringify(remote.type)}, expected "streamable-http"`);
	if (!isStr(remote.url)) fail('server.json remotes[0].url must be a non-empty string');
	else if (remote.url !== c.mcp.endpoint) fail(`server.json remotes[0].url is ${remote.url} but contract mcp.endpoint is ${c.mcp.endpoint}`);
}

const TOOL_NAME_RE = /`((?:list|get|scan|find|search|fetch|lookup)_[a-z0-9_]+)`/g;

function checkToolCoverage(readme, c, fail) {
	const contractTools = new Set(c.mcp.tools.map((t) => t.name));
	const mentioned = new Set([...readme.matchAll(TOOL_NAME_RE)].map((m) => m[1]));
	// Any tool-shaped identifier in a table row's first cell counts as "listed".
	const tableListed = new Set([...readme.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|/gm)].map((m) => m[1]));
	for (const t of contractTools) if (!mentioned.has(t)) fail(`README.md omits MCP tool \`${t}\` that the contract exposes`);
	for (const t of new Set([...mentioned, ...tableListed])) if (!contractTools.has(t)) fail(`README.md lists tool \`${t}\` which is not in contract mcp.tools`);
}

// ---- commands ---------------------------------------------------------------

function sync() {
	const c = loadContract();
	const readme = readText(PATHS.readme);
	const next = applyBlocks(readme, c);
	const changed = [];
	if (next !== readme) {
		writeFileSync(PATHS.readme, next);
		changed.push('README.md');
	}
	const server = parseJsonFile(PATHS.server);
	if (server.version !== c.apiVersion) {
		server.version = c.apiVersion;
		writeFileSync(PATHS.server, `${JSON.stringify(server, null, '\t')}\n`);
		changed.push(`server.json (version -> ${c.apiVersion})`);
	}
	console.log(changed.length ? `sync: updated ${changed.join(', ')}` : 'sync: already up to date');
}

function checkOffline() {
	const failures = [];
	const fail = (msg) => failures.push(msg);
	let c;
	try {
		c = loadContract();
	} catch (e) {
		if (e instanceof GateError) return [e.message];
		throw e;
	}
	const readme = readText(PATHS.readme);
	const texts = [[PATHS.readme, readme]];
	for (const p of [PATHS.server, PATHS.glama]) {
		try {
			texts.push([p, readText(p)]);
		} catch (e) {
			fail(`${rel(p)} could not be read: ${e.message}`);
		}
	}
	const guard = (fn) => {
		try {
			fn();
		} catch (e) {
			if (e instanceof GateError) fail(e.message);
			else throw e;
		}
	};
	guard(() => checkReadmeBlocks(readme, c, fail));
	guard(() => checkFreeTextClaims(readme, c, fail));
	guard(() => checkServerJson(parseJsonFile(PATHS.server), c, fail));
	guard(() => {
		const g = parseJsonFile(PATHS.glama);
		if (!isObj(g)) fail('glama.json root is not an object');
	});
	checkRetiredNames(texts, fail);
	checkFrozenSportLists(texts, c, fail);
	checkToolCoverage(readme, c, fail);
	return failures;
}

async function fetchWithTimeout(url, init = {}) {
	return fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init, headers: { 'user-agent': 'flash-props-mcp-contract-gate', ...(init.headers ?? {}) } });
}

/** Returns { failures, warnings }. A 404 is a rollout warning, not a pass or a block. */
async function checkLive() {
	const vendored = parseJsonFile(PATHS.contract);
	let res;
	try {
		res = await fetchWithTimeout(LIVE_CONTRACT_URL, { headers: { accept: 'application/json' } });
	} catch (e) {
		return { failures: [`live contract fetch failed for ${LIVE_CONTRACT_URL}: ${e.cause?.code ?? e.name}: ${e.message}`], warnings: [] };
	}
	if (res.status === 404) {
		return {
			failures: [],
			warnings: [`WARNING: ${LIVE_CONTRACT_URL} returned 404. The hosted contract is not deployed yet, so live drift was NOT verified. This is expected only before the API rollout.`]
		};
	}
	if (!res.ok) return { failures: [`live contract ${LIVE_CONTRACT_URL} returned HTTP ${res.status}`], warnings: [] };
	let live;
	try {
		live = JSON.parse(await res.text());
	} catch (e) {
		return { failures: [`live contract ${LIVE_CONTRACT_URL} is not valid JSON: ${e.message}`], warnings: [] };
	}
	if (isDeepStrictEqual(live, vendored)) return { failures: [], warnings: [] };
	const diffs = [];
	const walk = (a, b, path) => {
		if (diffs.length >= 10) return;
		if (isDeepStrictEqual(a, b)) return;
		if (isObj(a) && isObj(b)) {
			for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`);
		} else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
			a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`));
		} else diffs.push(`${path}: vendored ${JSON.stringify(a)} vs live ${JSON.stringify(b)}`);
	};
	walk(vendored, live, '$');
	return {
		failures: [`vendored contract differs from ${LIVE_CONTRACT_URL} (update contract/flash-props-contract.json, then run sync):\n    ${diffs.join('\n    ')}`],
		warnings: []
	};
}

/**
 * A link is dead when it is missing (404/410), the server errors (5xx), or the
 * request fails. 400/401/403/405 mean the host answered but wants a key or a
 * POST (the MCP endpoint, authenticated REST routes), so they count as reachable.
 * The hosted contract URL 404ing is a rollout warning, matching check --live.
 */
async function checkLinks() {
	const readme = readText(PATHS.readme);
	const urls = [...new Set([...readme.matchAll(/https:\/\/[^\s)<>"'`\]*]+/g)].map((m) => m[0].replace(/[.,;:]+$/, '')))];
	const results = await Promise.all(
		urls.map(async (url) => {
			try {
				let res = await fetchWithTimeout(url, { method: 'HEAD' });
				if (res.status === 405 || res.status === 403 || res.status === 501 || res.status >= 500) res = await fetchWithTimeout(url, { method: 'GET' });
				const s = res.status;
				const state = res.ok ? 'ok' : s === 404 && url === LIVE_CONTRACT_URL ? 'warn' : s === 404 || s === 410 || s >= 500 ? 'fail' : 'reachable';
				return { url, state, detail: `HTTP ${s}` };
			} catch (e) {
				return { url, state: 'fail', detail: `${e.cause?.code ?? e.name}: ${e.message}` };
			}
		})
	);
	const label = { ok: 'ok       ', reachable: 'reachable', warn: 'WARN     ', fail: 'FAIL     ' };
	for (const r of results) console.log(`${label[r.state]} ${r.detail.padEnd(10)} ${r.url}`);
	for (const r of results.filter((x) => x.state === 'warn')) console.warn(`WARNING: ${r.url} returned 404; hosted contract not deployed yet.`);
	return results.filter((r) => r.state === 'fail').map((r) => `link check failed: ${r.url} (${r.detail})`);
}

function report(label, failures, warnings = []) {
	for (const w of warnings) console.warn(w);
	if (failures.length) {
		console.error(`${label}: FAIL (${failures.length} problem${failures.length === 1 ? '' : 's'})`);
		for (const f of failures) console.error(`  - ${f}`);
		return false;
	}
	console.log(`${label}: PASS`);
	return true;
}

async function main() {
	const [cmd, ...flags] = process.argv.slice(2);
	switch (cmd) {
		case 'sync':
			sync();
			return 0;
		case 'check': {
			let ok = report('contract check', checkOffline());
			if (flags.includes('--live')) {
				const { failures, warnings } = await checkLive();
				ok = report('contract check --live', failures, warnings) && ok;
			}
			return ok ? 0 : 1;
		}
		case 'links':
			return report('link check', await checkLinks()) ? 0 : 1;
		default:
			console.error('usage: node scripts/contract.mjs <sync | check [--live] | links>');
			return 2;
	}
}

// exitCode, not process.exit(): exiting while fetch timers are still closing
// trips a libuv assertion on Windows.
main().then(
	(code) => {
		process.exitCode = code;
	},
	(e) => {
		console.error(e instanceof GateError ? `contract gate: ${e.message}` : e);
		process.exitCode = 1;
	}
);
