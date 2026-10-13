'use strict';

/**
 * The Supertext SDK (https://github.com/Supertext/Supertext-API-SDK-and-Guide), vendored
 * in vendor/supertext-sdk by scripts/sync-sdk.sh until it is published on npm. It does
 * the API protocol: upload, polling, download and cleanup, the auth header, HTTP 429
 * retries, language codes and packing the texts into one HTML document.
 * No Apostrophe dependencies.
 */

// An ES module, loaded with require() (Node 22.12+).
const sdk = require('../vendor/supertext-sdk/index.js');

const ENVIRONMENTS = Object.freeze({
  live: sdk.LIVE_BASE_URL,
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/'
});

/** API address: a custom URL wins, else the environment's (default: live). */
function baseUrlFor(environment, customUrl) {
  const url = String(customUrl || '').trim() || ENVIRONMENTS[environment] || ENVIRONMENTS.live;
  return url.endsWith('/') ? url : `${url}/`;
}

/** Strips a pasted `Supertext-Auth-Key ` prefix (the SDK does too; used for "is a key set"). */
function normalizeKey(apiKey) {
  return String(apiKey || '').trim().replace(/^Supertext-Auth-Key\s+/i, '');
}

const { version: SDK_VERSION } = require('../vendor/supertext-sdk/package.json');

module.exports = {
  ...sdk,
  ENVIRONMENTS,
  SDK_VERSION,
  baseUrlFor,
  normalizeKey
};
