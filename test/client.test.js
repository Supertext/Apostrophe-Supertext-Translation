'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SupertextClient, normalizeKey, retryDelayMs, statusError, baseUrlFor } = require('../lib/client');

function fakeApi({ statuses = [ 'done' ], failFirst = 0, failStatus = 429 } = {}) {
  const calls = [];
  let n = 0;
  let polls = 0;
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (n++ < failFirst) {
      return new Response('slow down', { status: failStatus, headers: { 'retry-after': '0' } });
    }
    if (url.endsWith('translate/ai/file') && init.method === 'POST') {
      return Response.json({ file_id: 'f1' });
    }
    if (url.endsWith('/status')) {
      return Response.json({ status: statuses[Math.min(polls++, statuses.length - 1)] });
    }
    if (url.endsWith('/translation')) {
      return new Response('<div data-st-id="0">Hallo</div>');
    }
    return new Response('{}');
  };
  return { calls, fetch };
}
const client = (api, extra = {}) => new SupertextClient({ apiKey: 'Supertext-Auth-Key k1', baseUrl: 'https://api.test/v1', fetch: api.fetch, sleep: async () => {}, ...extra });

test('upload, poll, download, delete with the auth header', async () => {
  const api = fakeApi({ statuses: [ 'translating', 'done' ] });
  const html = await client(api).translateHtml({ html: '<div data-st-id="0">Hello</div>', targetLang: 'de-CH', sourceLang: 'en', politeness: 'more' });
  assert.equal(html, '<div data-st-id="0">Hallo</div>');
  assert.deepEqual(api.calls.map((c) => `${c.method} ${c.url.replace('https://api.test/v1/', '')}`), [
    'POST translate/ai/file',
    'GET translate/ai/file/f1/status',
    'GET translate/ai/file/f1/status',
    'GET translate/ai/file/f1/translation',
    'DELETE translate/ai/file/f1'
  ]);
  assert.equal(api.calls[0].headers.Authorization, 'Supertext-Auth-Key k1');
  const form = api.calls[0].body;
  assert.equal(form.get('target_lang'), 'de-CH');
  assert.equal(form.get('source_lang'), 'en');
  assert.equal(form.get('politeness'), 'more');
  assert.equal(form.get('file').type, 'text/html');
});

test('default politeness and no source are not sent', async () => {
  const api = fakeApi();
  await client(api).translateHtml({ html: 'x', targetLang: 'fr', politeness: 'default' });
  assert.equal(api.calls[0].body.has('politeness'), false);
  assert.equal(api.calls[0].body.has('source_lang'), false);
});

test('retries HTTP 429 up to four times', async () => {
  const api = fakeApi({ failFirst: 4 });
  await client(api).validateApiKey();
  assert.equal(api.calls.length, 5);
  const api2 = fakeApi({ failFirst: 5 });
  await assert.rejects(client(api2).validateApiKey(), { code: 'too_many_requests' });
});

test('maps terminal statuses and still deletes the file', async () => {
  for (const [ status, code ] of [ [ 'error', 'translation_error' ], [ 'limit_exceeded', 'quota_exceeded' ], [ 'deleted', 'file_deleted' ] ]) {
    const api = fakeApi({ statuses: [ status ] });
    await assert.rejects(client(api).translateHtml({ html: 'x', targetLang: 'de' }), { code });
    assert.equal(api.calls.at(-1).method, 'DELETE');
  }
});

test('HTTP errors and missing key', async () => {
  const api = fakeApi({ failFirst: 1, failStatus: 401 });
  await assert.rejects(client(api).validateApiKey(), { code: 'authentication_failure' });
  await assert.rejects(new SupertextClient({ apiKey: '' }).validateApiKey(), { code: 'missing_api_key' });
  assert.equal(statusError(503).code, 'service_unavailable');
  assert.equal(statusError(413).code, 'payload_too_large');
});

test('helpers', () => {
  assert.equal(normalizeKey('  Supertext-Auth-Key abc '), 'abc');
  assert.equal(retryDelayMs(0, '3'), 3000);
  assert.ok(retryDelayMs(2, null) >= 4000);
  assert.equal(baseUrlFor('staging'), 'https://api.staging.supertext.com/v1/');
  assert.equal(baseUrlFor('live', 'http://x/v1'), 'http://x/v1/');
});
