'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SupertextClient, SupertextError, Languages, SDK_VERSION, baseUrlFor, normalizeKey } = require('../lib/sdk');

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
