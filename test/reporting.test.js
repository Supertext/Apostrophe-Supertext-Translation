'use strict';
// Commando Center glue (lib/reporting.js) with a fake transport: never reaches the live center.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Reporting, PLUGIN_NAME, siteUrl, absoluteUrl, versionReportsEnabled } = require('../lib/reporting');
const { SDK_VERSION } = require('../lib/sdk');

function setup({ apiKey = 'secret-key', versionReports, features = 200 } = {}) {
  let stored = null;
  const reports = [];
  const keyChecks = [];
  const fetch = async (url, init = {}) => {
    if (String(url).startsWith('http://center.test/')) {
      reports.push(JSON.parse(init.body));
      return new Response('{"ok":true}', { status: 202 });
    }
    keyChecks.push(String(url));
    return new Response('{}', { status: features });
  };
  const reporting = new Reporting({
    storage: {
      get: async () => stored,
      set: async (value) => {
        stored = JSON.parse(JSON.stringify(value));
      }
    },
    settings: () => ({
      apiKey,
      apiUrl: 'http://stand-in.test/v1/',
      versionReports
    }),
    pluginVersion: () => '1.2.3',
    systemVersion: () => '4.33.0',
    actionPath: () => '/api/v1/supertext-apostrophe-translation',
    logger: { debug: () => {} },
    reporterOverrides: {
      fetch,
      reportUrl: 'http://center.test/api/v1/report',
      clientOptions: {
        baseUrl: 'http://stand-in.test/v1/',
        fetch,
        sleep: async () => {}
      }
    }
  });
  return { reporting, reports, keyChecks, stored: () => stored };
}

test('site URL: Apostrophe baseUrl and prefix, else the request origin', () => {
  assert.equal(siteUrl('https://www.example.ch/', ''), 'https://www.example.ch');
  assert.equal(siteUrl('https://www.example.ch', '/cms'), 'https://www.example.ch/cms');
  assert.equal(siteUrl(undefined, '', 'http://localhost:3000'), 'http://localhost:3000');
  assert.equal(siteUrl('', '', null), null);
  assert.equal(absoluteUrl('/relative'), null);
});

test('the setting: on by default, SUPERTEXT_VERSION_REPORTS wins', () => {
  assert.equal(versionReportsEnabled(undefined, undefined), true);
  assert.equal(versionReportsEnabled(false, undefined), false);
  assert.equal(versionReportsEnabled(true, '0'), false);
  assert.equal(versionReportsEnabled(false, '1'), true);
});

test('first back-end request: key check and an installed report with the callback URL', async () => {
  const { reporting, reports, keyChecks, stored } = setup();
  const result = await reporting.run('onRequest', 'https://www.example.ch');
  assert.equal(result.event, 'installed');
  assert.equal(result.sent, true);
  assert.equal(keyChecks.length, 1);
  assert.equal(reports.length, 1);
  const report = reports[0];
  assert.equal(report.plugin.name, PLUGIN_NAME);
  assert.equal(report.plugin.version, '1.2.3');
  assert.deepEqual(report.system, { name: 'ApostropheCMS', version: '4.33.0' });
  assert.equal(report.site_url, 'https://www.example.ch');
  assert.equal(report.callback.url, 'https://www.example.ch/api/v1/supertext-apostrophe-translation/ping');
  assert.equal(report.api_key_check.status, 'ok');
  assert.equal(report.sdk_version, SDK_VERSION);
  assert.ok(!JSON.stringify(report).includes('secret-key'), 'the key is never sent');
  assert.equal(stored().keyCheck.status, 'ok');

  // Nothing changed: nothing sent, no new key check.
  const again = await reporting.run('onRequest', 'https://www.example.ch');
  assert.equal(again.event, null);
  assert.equal(reports.length, 1);
  assert.equal(keyChecks.length, 1);
});

test('the vendored Plugin Health copy says where it comes from', () => {
  const dir = path.join(__dirname, '../vendor/supertext-plugin-health');
  assert.match(fs.readFileSync(path.join(dir, 'VERSION'), 'utf8'), /^\d+\.\d+\.\d+\n$/);
  assert.match(fs.readFileSync(path.join(dir, 'COMMIT'), 'utf8'), /^[0-9a-f]{40}\n$/);
});

test('state stored by the SDK 0.2 reporter is kept: no new installed report', async () => {
  const { reporting, reports, keyChecks, stored } = setup();
  const versions = `1.2.3|4.33.0|${process.version.replace(/^v/, '')}`;
  const fingerprint = require('../lib/sdk').apiKeyFingerprint('secret-key');
  await reporting.ctx.storage.set({
    reportedVersions: versions,
    reportedKeyStatus: 'ok',
    lastFailureAt: null,
    keyCheck: { status: 'ok', checkedAt: '2026-10-01T08:00:00Z', httpStatus: 200, errorCode: null, fingerprint }
  });
  const result = await reporting.run('onRequest', 'https://www.example.ch');
  assert.equal(result.event, null);
  assert.equal(reports.length, 0);
  assert.equal(keyChecks.length, 0);
  assert.equal(stored().reportedVersions, versions);
});

test('a 401 during a translation marks the key invalid once', async () => {
  const { reporting, reports } = setup();
  await reporting.run('onRequest', 'https://www.example.ch');
  const first = await reporting.run('authenticationFailed', 'https://www.example.ch', 401);
  assert.equal(first.event, 'api_key_check');
  assert.equal(first.check.status, 'invalid');
  const second = await reporting.run('authenticationFailed', 'https://www.example.ch', 401);
  assert.equal(second.event, null);
  assert.equal(reports.length, 2);
  assert.equal((await reporting.lastCheck()).status, 'invalid');
});

test('Test connection: a rejected key', async () => {
  const { reporting } = setup({ features: 403 });
  const result = await reporting.run('testConnection', 'https://www.example.ch');
  assert.equal(result.check.status, 'invalid');
  assert.equal(result.check.httpStatus, 403);
});

test('no key: missing, nothing sent to Supertext', async () => {
  const { reporting, keyChecks } = setup({ apiKey: '' });
  const result = await reporting.run('testConnection', 'https://www.example.ch');
  assert.equal(result.check.status, 'missing');
  assert.equal(keyChecks.length, 0);
});

test('off means off: no report, ping answers 404', async () => {
  const { reporting, reports } = setup({ versionReports: false });
  await reporting.run('onRequest', 'https://www.example.ch');
  assert.equal(reports.length, 0);
  assert.equal(reporting.ping('abcdefghijklmnop1234').status, 404);
});

test('ping: echoes a valid challenge, refuses anything else', () => {
  const { reporting } = setup();
  const ok = reporting.ping('abcdefghijklmnop1234');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(ok.body), {
    ok: true,
    plugin: PLUGIN_NAME,
    challenge: 'abcdefghijklmnop1234'
  });
  assert.equal(reporting.ping('<script>').status, 400);
  assert.equal(reporting.ping(undefined).status, 400);
  assert.equal(reporting.ping([ 'abcdefghijklmnop1234' ]).status, 400);
});

test('never throws: broken storage and no site URL', async () => {
  const { reporting } = setup();
  reporting.ctx.storage.get = async () => {
    throw new Error('db down');
  };
  assert.equal(await reporting.run('onRequest', 'https://www.example.ch'), null);
  assert.equal(await reporting.run('onRequest', null), null);
  assert.equal(await reporting.lastCheck(), null);
});
