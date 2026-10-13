// Flash Props API: first successful REST request (Node 20+, no dependencies).
// Do not place API keys in URLs, public commits, logs, or error messages.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const API_BASE = 'https://api.flashodds.live';

export async function getJson(path, { apiKey, fetchImpl = fetch, baseUrl = API_BASE } = {}) {
  if (!apiKey || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
    throw new Error('Set FLASH_PROPS_API_KEY to your own free API key before running.');
  }
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) throw new Error('Refusing a cross-origin API request.');
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('401: key missing, expired, or invalid. Check your Flash Props key.');
    if (response.status === 403) throw new Error('403: your key/plan cannot access this resource.');
    if (response.status === 429) {
      const wait = response.headers.get('retry-after');
      throw new Error('429: rate or daily quota reached.' + (wait ? ' Retry-After: ' + wait + ' seconds.' : ' Wait or review usage.'));
    }
    throw new Error('Flash Props returned HTTP ' + response.status + '. Check https://api.flashodds.live/status');
  }
  return response.json();
}

export async function discover({ apiKey = process.env.FLASH_PROPS_API_KEY, sport = 'cs2', fetchImpl = fetch, baseUrl = API_BASE } = {}) {
  const options = { apiKey, fetchImpl, baseUrl };
  // /sports describes provider capabilities at request time. Do not hard-code
  // which leagues have projections or pretend all sports are in season.
  const catalog = await getJson('/api/v1/sports', options);
  if (!Array.isArray(catalog?.sports)) throw new Error('Unexpected /sports response: missing sports array.');
  const known = catalog.sports.some((entry) => (entry.sport ?? entry.id) === sport);
  if (!known) throw new Error('Sport "' + sport + '" was not returned by /sports. Choose an available sport id.');
  const markets = await getJson('/api/v1/markets?sport=' + encodeURIComponent(sport), options);
  if (!Array.isArray(markets?.markets)) throw new Error('Unexpected /markets response: missing markets array.');
  return { catalog: catalog.sports, sport, markets: markets.markets };
}

export function summarize(result) {
  const sports = result.catalog.map((entry) => entry.sport ?? entry.id).filter(Boolean);
  const firstMarkets = result.markets.slice(0, 5).map((entry) => ({
    key: entry.stat ?? entry.key ?? entry.statKey ?? null,
    label: entry.label ?? null,
    family: entry.family ?? null,
    scope: entry.scope ?? null
  }));
  return {
    sportsCount: result.catalog.length,
    availableSports: sports,
    selectedSport: result.sport,
    selectedSportMarkets: result.markets.length,
    firstMarkets,
    note: 'Market and projection coverage varies by sport, provider, and season. An empty board is not proof the API is broken.'
  };
}

// Importing this module is inert; only executing it starts the two requests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  discover({ sport: process.argv[2] || 'cs2' })
    .then((result) => console.log(JSON.stringify(summarize(result), null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Unexpected API error.');
      process.exitCode = 1;
    });
}
