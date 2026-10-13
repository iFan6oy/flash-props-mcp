import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, getJson, summarize } from './first-request.mjs';

const ok = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });

test('safe first request reads real contract shapes without putting keys in URLs', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return url.endsWith('/sports')
      ? ok({ sports: [{ id: 'cs2', projectionCapability: 'posted_lines_only' }, { id: 'nfl' }] })
      : ok({ sport: 'cs2', count: 1, markets: [{ stat: 'kills_on_maps_1_2', label: 'Maps 1–2 Kills', family: 'kills' }] });
  };
  const data = await discover({ apiKey: 'test_only_key', fetchImpl });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, 'https://api.flashodds.live/api/v1/sports');
  assert.equal(seen[1].url, 'https://api.flashodds.live/api/v1/markets?sport=cs2');
  for (const call of seen) {
    assert.equal(call.options.headers.Authorization, 'Bearer test_only_key');
    assert.ok(!call.url.includes('test_only_key'));
    assert.equal(call.options.method, 'GET');
  }
  assert.deepEqual(summarize(data).availableSports, ['cs2', 'nfl']);
  assert.equal(summarize(data).selectedSportMarkets, 1);
});

test('no key means no network request', async () => {
  let called = false;
  await assert.rejects(
    discover({ apiKey: '', fetchImpl: async () => { called = true; return ok({}); } }),
    /Set FLASH_PROPS_API_KEY/
  );
  assert.equal(called, false);
});

test('rejects unknown sport before second request', async () => {
  let calls = 0;
  await assert.rejects(
    discover({ apiKey: 'test', sport: 'unlisted', fetchImpl: async () => {
      calls++;
      return ok({ sports: [{ id: 'cs2' }] });
    } }),
    /not returned by \/sports/
  );
  assert.equal(calls, 1);
});

test('429 obeys user action and never retries or exposes server response text', async () => {
  let calls = 0;
  await assert.rejects(
    getJson('/api/v1/sports', { apiKey: 'test', fetchImpl: async () => {
      calls++;
      return ok({ private: 'avoid_echoing' }, 429, { 'Retry-After': '60' });
    } }),
    /429:.*Retry-After: 60/
  );
  assert.equal(calls, 1);
});

test('401 error does not reveal the API key', async () => {
  await assert.rejects(
    getJson('/api/v1/sports', { apiKey: 'secret_value', fetchImpl: async () => ok({}, 401) }),
    (error) => !error.message.includes('secret_value') && /401/.test(error.message)
  );
});

test('rejects arbitrary off-host URLs without sending a credential', async () => {
  let called = false;
  await assert.rejects(
    getJson('https://another.example/data', {
      apiKey: 'test',
      fetchImpl: async () => { called = true; return ok({}); }
    }),
    /cross-origin/
  );
  assert.equal(called, false);
});

test('requires array response contracts rather than inventing a sports list', async () => {
  await assert.rejects(
    discover({ apiKey: 'test', fetchImpl: async () => ok({ message: 'outage' }) }),
    /missing sports array/
  );
});
