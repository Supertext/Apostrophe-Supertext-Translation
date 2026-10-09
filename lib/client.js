'use strict';

/**
 * Client for the Supertext AI file translation API (v1), shared protocol with the other
 * Supertext plugins:
 *   1. POST   translate/ai/file                     multipart upload of an HTML file -> { file_id }
 *   2. GET    translate/ai/file/{id}/status         poll until `done`
 *   3. GET    translate/ai/file/{id}/translation    download the translated HTML
 *   4. DELETE translate/ai/file/{id}                best effort (files expire after 24 h)
 *
 * Auth header: `Authorization: Supertext-Auth-Key <key>`. No Apostrophe dependencies.
 */

const ENVIRONMENTS = {
  live: 'https://api.supertext.com/v1/',
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/'
};

/** Retries after HTTP 429 (the API limits requests per second per key). */
const RATE_LIMIT_RETRIES = 4;

class SupertextError extends Error {
  /**
   * @param {string} code e.g. `authentication_failure`, `quota_exceeded`, `timeout`
   * @param {string} message English message (logs, editors)
   * @param {number} [status] HTTP status
   * @param {string} [detail] the API's or network's own explanation
   */
  constructor(code, message, status, detail) {
    super(message);
    this.name = 'SupertextError';
    this.code = code;
    this.status = status;
    this.detail = detail || undefined;
  }
}

/** Wait before retry `attempt` (0-based): Retry-After if sent, else 1, 2, 4, 8 s plus jitter. */
function retryDelayMs(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30000, seconds * 1000);
  }
  return 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
}

/** Strips a pasted `Supertext-Auth-Key ` prefix. */
function normalizeKey(apiKey) {
  return String(apiKey || '').trim().replace(/^Supertext-Auth-Key\s+/i, '');
}

function baseUrlFor(environment, customUrl) {
  const url = String(customUrl || '').trim() || ENVIRONMENTS[environment] || ENVIRONMENTS.live;
  return url.endsWith('/') ? url : `${url}/`;
}

function statusError(status, detail = '') {
  let code;
  let message;
  if (status === 401 || status === 403) {
    code = 'authentication_failure';
    message = 'Authentication failed. Please check the Supertext API key.';
  } else if (status === 404) {
    code = 'not_found';
    message = 'The requested Supertext resource was not found.';
  } else if (status === 413) {
    code = 'payload_too_large';
    message = 'The content is too large for Supertext to translate in one go.';
  } else if (status === 429) {
    code = 'too_many_requests';
    message = 'Too many requests to Supertext. Please try again shortly.';
  } else if (status >= 500) {
    code = 'service_unavailable';
    message = 'The Supertext service is currently unavailable.';
  } else {
    code = 'unexpected_status';
    message = `Supertext answered with HTTP ${status}.`;
  }
  return new SupertextError(code, detail ? `${message} (${detail})` : message, status, detail);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class SupertextClient {
  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {string} [options.baseUrl]
   * @param {Function} [options.fetch]
   * @param {number} [options.pollIntervalMs=2000]
   * @param {number} [options.timeoutMs=180000]
   * @param {number} [options.requestTimeoutMs=60000]
   * @param {Function} [options.sleep]
   */
  constructor(options) {
    this.apiKey = normalizeKey(options.apiKey);
    this.baseUrl = baseUrlFor('live', options.baseUrl);
    this.fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 2000);
    this.timeoutMs = Math.max(this.pollIntervalMs, options.timeoutMs ?? 180000);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60000;
    this.sleep = options.sleep || defaultSleep;
  }

  /** Upload, wait, download, delete. Returns the translated HTML. */
  async translateHtml({ html, targetLang, sourceLang, politeness }) {
    const fileId = await this.submit({ html, targetLang, sourceLang, politeness });
    try {
      await this.waitUntilDone(fileId);
      return await this.download(fileId);
    } finally {
      await this.remove(fileId);
    }
  }

  /** Cost-free check that the key is accepted. */
  async validateApiKey() {
    await this.request('GET', 'features');
  }

  async submit({ html, targetLang, sourceLang, politeness }) {
    const form = new FormData();
    form.append('target_lang', targetLang);
    if (sourceLang) {
      form.append('source_lang', sourceLang);
    }
    if (politeness === 'more' || politeness === 'less') {
      form.append('politeness', politeness);
    }
    // The part's Content-Type must be exactly "text/html" (a charset suffix gets 415);
    // the document declares UTF-8 itself.
    form.append('file', new Blob([ html ], { type: 'text/html' }), 'content.html');
    const res = await this.request('POST', 'translate/ai/file', form);
    const data = await res.json().catch(() => null);
    if (!data || typeof data.file_id !== 'string' || data.file_id === '') {
      throw new SupertextError('no_file_id', 'Supertext did not return a file id.');
    }
    return data.file_id;
  }

  async waitUntilDone(fileId) {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const res = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/status`);
      const data = await res.json().catch(() => null);
      switch (data && data.status) {
        case 'done':
          return;
        case 'error':
          throw new SupertextError('translation_error', 'Supertext could not translate the content.');
        case 'limit_exceeded':
          throw new SupertextError('quota_exceeded', 'Your Supertext translation limit is exceeded. Please upgrade your subscription.');
        case 'deleted':
          throw new SupertextError('file_deleted', 'The content was deleted at Supertext before it could be downloaded.');
      }
      if (Date.now() + this.pollIntervalMs >= deadline) {
        throw new SupertextError('timeout', 'Timed out waiting for the Supertext translation.');
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  async download(fileId) {
    const res = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/translation`);
    const body = await res.text();
    if (body.trim() === '') {
      throw new SupertextError('incomplete_response', 'The translated content was empty.');
    }
    return body;
  }

  /** Best effort, never throws. */
  async remove(fileId) {
    try {
      await this.request('DELETE', `translate/ai/file/${encodeURIComponent(fileId)}`);
    } catch (e) {
      // Files expire after 24 h anyway.
    }
  }

  async request(method, path, body) {
    if (!this.apiKey) {
      throw new SupertextError('missing_api_key', 'No Supertext API key is configured.');
    }
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await this.fetchImpl(this.baseUrl + path, {
          method,
          body,
          headers: {
            Accept: 'application/json',
            Authorization: `Supertext-Auth-Key ${this.apiKey}`
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs)
        });
      } catch (err) {
        const detail = err && err.message ? err.message : String(err);
        throw new SupertextError('transport_error', `Could not reach Supertext: ${detail}`, undefined, detail);
      }
      if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) {
        break;
      }
      if (res.body) {
        await res.body.cancel().catch(() => {});
      }
      await this.sleep(retryDelayMs(attempt, res.headers.get('retry-after')));
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).replace(/<[^>]*>/g, '').trim().slice(0, 200);
      throw statusError(res.status, detail);
    }
    return res;
  }
}

module.exports = {
  ENVIRONMENTS,
  RATE_LIMIT_RETRIES,
  SupertextClient,
  SupertextError,
  baseUrlFor,
  normalizeKey,
  retryDelayMs,
  statusError
};
