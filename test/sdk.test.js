'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SupertextClient, SupertextError, Languages, SDK_VERSION, REVIEW_URL, baseUrlFor, createClient, normalizeKey, reviewUrlFor } = require('../lib/sdk');

test('the vendored SDK loads and says where it comes from', () => {
  assert.equal(typeof SupertextClient, 'function');
  assert.equal(typeof SupertextError, 'function');
  assert.equal(typeof SupertextClient.prototype.checkApiKey, 'function');
  assert.match(SDK_VERSION, /^\d+\.\d+\.\d+/);
  assert.equal(SDK_VERSION, fs.readFileSync(path.join(__dirname, '../vendor/supertext-sdk/VERSION'), 'utf8').trim());
  const source = fs.readFileSync(path.join(__dirname, '../vendor/supertext-sdk/COMMIT'), 'utf8');
  assert.match(source, /^[0-9a-f]{40}\n$/);
});

test('API address and key helpers', () => {
  assert.equal(baseUrlFor('live'), 'https://api.supertext.com/v1/');
  assert.equal(baseUrlFor('staging'), 'https://api.staging.supertext.com/v1/');
  assert.equal(baseUrlFor('live', 'http://127.0.0.1:8765/v1'), 'http://127.0.0.1:8765/v1/');
  assert.equal(normalizeKey('  Supertext-Auth-Key abc '), 'abc');
  assert.equal(Languages.target('de', { de: 'de-CH' }), 'de-CH');
});

test('the client sends the auth header, the user agent and the language codes', async () => {
  const calls = [];
  const responses = [
    { status: 200, body: { file_id: 'f1' } },
    { status: 200, body: { status: 'done' } },
    { status: 200, text: '<!DOCTYPE html><html><body><div data-st-id="0">Hallo</div></body></html>' },
    { status: 204, text: '' }
  ];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    return new Response(r.text ?? JSON.stringify(r.body), { status: r.status });
  };
  const client = new SupertextClient('Supertext-Auth-Key secret', {
    baseUrl: 'http://stand-in/v1/', fetch, sleep: async () => {}, userAgent: 'supertext-apostrophe-translation/test'
  });
  const out = await client.translateTexts(new Map([ [ 'a', { text: 'Hello' } ] ]), 'de-DE', { sourceLang: 'en' });
  assert.equal(out.get('a'), 'Hallo');
  assert.equal(calls[0].init.headers.Authorization ?? new Headers(calls[0].init.headers).get('authorization'), 'Supertext-Auth-Key secret');
  const body = Buffer.from(calls[0].init.body).toString();
  assert.match(body, /name="target_lang"\r\n\r\nde-DE/);
  assert.match(body, /name="source_lang"\r\n\r\nen\r\n/);
  assert.equal(calls.at(-1).init.method, 'DELETE');
});

// A fake Supertext: answers upload, status, download and delete, and records every call.
function fakeSupertext() {
  const calls = [];
  let gets = 0;
  const fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    calls.push({ url: String(url), method, auth: new Headers(init && init.headers).get('authorization'), ua: new Headers(init && init.headers).get('user-agent') });
    if (method === 'POST') {
      return new Response(JSON.stringify({ file_id: 'f1' }), { status: 200 });
    }
    if (method === 'DELETE') {
      return new Response('', { status: 204 });
    }
    // GET: first the status, then the download.
    gets += 1;
    if (gets % 2 === 1) {
      return new Response(JSON.stringify({ status: 'done' }), { status: 200 });
    }
    return new Response('<!DOCTYPE html><html><body><div data-st-id="0">Hallo</div></body></html>', { status: 200 });
  };
  return { calls, fetch };
}

test('Translation review: the review URL', () => {
  assert.equal(REVIEW_URL, 'https://localizationreview-production.up.railway.app/v1/');
  assert.equal(reviewUrlFor(), REVIEW_URL, 'Supertext\'s review service by default');
  assert.equal(reviewUrlFor(undefined, ''), REVIEW_URL);
  assert.equal(reviewUrlFor(null), REVIEW_URL);
  assert.equal(reviewUrlFor(''), '', 'empty option: review off for every locale');
  assert.equal(reviewUrlFor('  '), '');
  assert.equal(reviewUrlFor('http://review.test/v1'), 'http://review.test/v1/');
  assert.equal(reviewUrlFor('', 'http://env.test/v1'), 'http://env.test/v1/', 'SUPERTEXT_REVIEW_URL wins');
  assert.equal(reviewUrlFor('http://option.test/v1/', '  '), 'http://option.test/v1/', 'an empty variable keeps the option');
});

test('Translation review: a review locale goes through the review service, all four calls', async () => {
  const options = { apiKey: 'secret', baseUrl: 'http://api.test/v1/', reviewUrl: 'http://review.test/v1/', sleep: async () => {}, userAgent: 'Apostrophe-Supertext-Translation/1.2.3' };
  const review = fakeSupertext();
  const out = await createClient({ ...options, review: true, fetch: review.fetch })
    .translateTexts(new Map([ [ 'a', { text: 'Hello' } ] ]), 'de-CH', { sourceLang: 'en' });
  assert.equal(out.get('a'), 'Hallo');
  assert.deepEqual(review.calls.map((c) => c.method), [ 'POST', 'GET', 'GET', 'DELETE' ], 'upload, status, download, delete');
  assert.ok(review.calls.every((c) => c.url.startsWith('http://review.test/v1/')), JSON.stringify(review.calls));
  assert.ok(review.calls.every((c) => c.auth === 'Supertext-Auth-Key secret' && / Apostrophe-Supertext-Translation\/1\.2\.3$/.test(c.ua)), 'same key and User-Agent');

  const direct = fakeSupertext();
  await createClient({ ...options, review: false, fetch: direct.fetch })
    .translateTexts(new Map([ [ 'a', { text: 'Hello' } ] ]), 'fr-CH', { sourceLang: 'en' });
  assert.deepEqual(direct.calls.map((c) => c.method), [ 'POST', 'GET', 'GET', 'DELETE' ]);
  assert.ok(direct.calls.every((c) => c.url.startsWith('http://api.test/v1/')), 'other locales go directly to Supertext');
});

test('Translation review: off with an empty review URL or the API\'s own URL', async () => {
  for (const reviewUrl of [ '', 'http://api.test/v1', 'http://api.test/v1/' ]) {
    const fake = fakeSupertext();
    await createClient({ apiKey: 'k', baseUrl: 'http://api.test/v1/', reviewUrl, review: true, fetch: fake.fetch, sleep: async () => {} })
      .translateTexts(new Map([ [ 'a', { text: 'Hello' } ] ]), 'de-CH');
    assert.ok(fake.calls.every((c) => c.url.startsWith('http://api.test/v1/')), `reviewUrl ${JSON.stringify(reviewUrl)}`);
  }
  // Default: Supertext's review service.
  const fake = fakeSupertext();
  await createClient({ apiKey: 'k', baseUrl: 'http://api.test/v1/', reviewUrl: reviewUrlFor(), review: true, fetch: fake.fetch, sleep: async () => {} })
    .translateTexts(new Map([ [ 'a', { text: 'Hello' } ] ]), 'de-CH');
  assert.ok(fake.calls[0].url.startsWith(REVIEW_URL));
});
