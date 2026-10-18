'use strict';

/**
 * The Supertext SDK (https://github.com/Supertext/Supertext-API-SDK-and-Guide), vendored
 * in vendor/supertext-sdk by scripts/vendor-sdk.sh (sites install only this module). It does
 * the API protocol: upload, polling, download and cleanup, the auth header, HTTP 429
 * retries, language codes, packing the texts into one HTML document, and the API key check
 * (`checkApiKey()`, `apiKeyFingerprint`) that Supertext Plugin Health reports to the Commando
 * Center (lib/reporting.js). Everything API-bound is in its `v1` folder.
 * No Apostrophe dependencies.
 *
 * Translation review: locales with *Translation review* on are translated through Supertext's
 * review service (the translation proxy of Supertext Localization Review). It speaks the same
 * API v1, forwards to the live Supertext API with the plugin's key and keeps every translation,
 * so reviewers can correct them on the website; corrections come back with the next upload.
 * `createClient(..., { review: true })` builds a second client with the same key and settings
 * whose base URL is the review URL. The key check, the Commando Center reports and anything
 * else never use it.
 */

// ES modules, loaded with require() (Node 22.12+).
const sdk = require('../vendor/supertext-sdk/v1/index.js');
const { SDK_VERSION } = require('../vendor/supertext-sdk/version.js');

const ENVIRONMENTS = Object.freeze({
  live: sdk.LIVE_BASE_URL,
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/'
});

/** Supertext's review service (translation proxy of Supertext Localization Review). */
const REVIEW_URL = 'https://localizationreview-production.up.railway.app/v1/';

/** API address: a custom URL wins, else the environment's (default: live). */
function baseUrlFor(environment, customUrl) {
  const url = String(customUrl || '').trim() || ENVIRONMENTS[environment] || ENVIRONMENTS.live;
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Review service address: the `SUPERTEXT_REVIEW_URL` environment variable when it is set and
 * not empty, else the `reviewUrl` option (default: Supertext's review service). An empty
 * option turns review off for every locale: returns ''.
 */
function reviewUrlFor(option = REVIEW_URL, env = '') {
  const fromEnv = String(env || '').trim();
  const url = fromEnv || (option == null ? REVIEW_URL : String(option).trim());
  if (!url) {
    return '';
  }
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * The SDK client for one translation: `baseUrl` (directly to Supertext), or `reviewUrl` when
 * `review` is on and a review URL is set that differs from `baseUrl`. Same key, timeouts,
 * transport and User-Agent either way. One client does a whole translation (upload, status,
 * download, delete), so a job is always collected with the client that submitted it.
 */
function createClient({ apiKey, baseUrl, reviewUrl = '', review = false, ...options }) {
  const direct = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const viaReview = Boolean(review && reviewUrl && reviewUrl.replace(/\/+$/, '') !== direct.replace(/\/+$/, ''));
  return new sdk.SupertextClient(apiKey, {
    ...options,
    baseUrl: viaReview ? reviewUrl : direct
  });
}

/** Strips a pasted `Supertext-Auth-Key ` prefix (the SDK does too; used for "is a key set"). */
function normalizeKey(apiKey) {
  return String(apiKey || '').trim().replace(/^Supertext-Auth-Key\s+/i, '');
}

module.exports = {
  ...sdk,
  ENVIRONMENTS,
  REVIEW_URL,
  SDK_VERSION,
  baseUrlFor,
  createClient,
  normalizeKey,
  reviewUrlFor
};
