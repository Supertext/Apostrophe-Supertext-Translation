'use strict';

/**
 * Version reports to the Supertext Commando Center, the automatic API key check and the
 * callback ping (Commando-Center-Supertext-Translation → docs/DEVELOPER.md → Report protocol).
 * The protocol is the SDK's (`InstallationReporter`, `pingResponse`, `reportsEnabled`); this
 * file only gives it what Apostrophe knows: the site URL, the versions, and a place to keep
 * the reporter's state (index.js stores it in Apostrophe's cache collection, `aposCache`).
 *
 * The module is configured with options and the environment (key from SUPERTEXT_API_KEY), so
 * there is no "settings saved": the key check runs on back-end requests when the key changed
 * (fingerprint), on "Test connection" and after a 401/403 from Supertext. Nothing here ever
 * throws into a request. No Apostrophe dependencies (tested on its own).
 */

const { InstallationReporter, pingResponse, reporterState, reportsEnabled } = require('./sdk');

/** The GitHub repository name: the center reads the latest release from it. */
const PLUGIN_NAME = 'Apostrophe-Supertext-Translation';
/** The ping route below the module's API path (`/api/v1/supertext-apostrophe-translation`). */
const PING_ROUTE = 'ping';

/**
 * Whether version reports are on: the `versionReports` option (default on);
 * SUPERTEXT_VERSION_REPORTS (0/false/off/no, 1/true/on/yes) wins.
 */
function versionReportsEnabled(option, env = process.env.SUPERTEXT_VERSION_REPORTS) {
  return reportsEnabled(typeof option === 'boolean' ? option : null, env);
}

/** An absolute http(s) URL without trailing slash, else null. */
function absoluteUrl(value) {
  const url = String(value ?? '').trim();
  return /^https?:\/\/[^/]/i.test(url) ? url.replace(/\/+$/, '') : null;
}

/**
 * The site's base URL: Apostrophe's `baseUrl` (APOS_BASE_URL) if it is absolute, else the
 * origin the request came in on; Apostrophe's `prefix` is added either way.
 */
function siteUrl(baseUrl, prefix = '', requestOrigin = null) {
  const origin = absoluteUrl(baseUrl) || absoluteUrl(requestOrigin);
  if (!origin) {
    return null;
  }
  const path = String(prefix || '').replace(/\/+$/, '');
  return `${origin}${path && !path.startsWith('/') ? '/' : ''}${path}`;
}

class Reporting {
  /**
   * @param {object} ctx
   * @param {{ get(): Promise<unknown>, set(value: unknown): Promise<void> }} ctx.storage
   * @param {() => { apiKey: string, apiUrl: string, versionReports?: boolean }} ctx.settings read on every call
   * @param {() => string} ctx.pluginVersion from package.json
   * @param {() => string | null} ctx.systemVersion Apostrophe's version
   * @param {() => string} ctx.actionPath the module's API path including Apostrophe's prefix handling (`/api/v1/<module>`)
   * @param {string} [ctx.userAgent]
   * @param {{ debug(message: string): void }} ctx.logger
   * @param {object} [ctx.reporterOverrides] for tests: fetch, reportUrl, now, clientOptions
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.queue = Promise.resolve();
  }

  get enabled() {
    try {
      return versionReportsEnabled(this.ctx.settings().versionReports);
    } catch (e) {
      return false;
    }
  }

  /** The ping route's answer (status, headers and body exactly as the SDK gives them). */
  ping(challenge) {
    return pingResponse(typeof challenge === 'string' ? challenge : null, {
      plugin: PLUGIN_NAME,
      enabled: this.enabled
    });
  }

  /** The full ping URL for a site URL (also shown on the status screen). */
  callbackUrl(url) {
    return url ? `${url}${this.ctx.actionPath()}/${PING_ROUTE}` : null;
  }

  reporter(url) {
    const settings = this.ctx.settings();
    return new InstallationReporter({
      enabled: versionReportsEnabled(settings.versionReports),
      siteUrl: url,
      plugin: {
        name: PLUGIN_NAME,
        version: this.ctx.pluginVersion() || '0.0.0'
      },
      system: {
        name: 'ApostropheCMS',
        version: this.ctx.systemVersion()
      },
      callbackUrl: this.callbackUrl(url),
      clientOptions: {
        baseUrl: settings.apiUrl,
        ...(this.ctx.userAgent ? { userAgent: this.ctx.userAgent } : {})
      },
      ...this.ctx.reporterOverrides
    });
  }

  async load() {
    return reporterState(await this.ctx.storage.get());
  }

  /**
   * Runs one reporter action (`onRequest`, `testConnection`, `authenticationFailed`,
   * `reportCheck`) with the stored state and stores the result. Calls are serialized, so two
   * requests don't report twice. Never throws; null when it couldn't run.
   */
  run(action, url, httpStatus) {
    const task = this.queue.then(async () => {
      if (!url) {
        return null;
      }
      try {
        const reporter = this.reporter(url);
        const apiKey = this.ctx.settings().apiKey || '';
        const state = await this.load();
        let result;
        if (action === 'authenticationFailed') {
          result = await reporter.authenticationFailed(state, apiKey, httpStatus || 401);
        } else if (action === 'testConnection') {
          result = await reporter.testConnection(state, apiKey);
        } else if (action === 'reportCheck') {
          result = await reporter.reportCheck(state);
        } else {
          result = await reporter.onRequest(state, apiKey);
        }
        await this.ctx.storage.set(result.state);
        if (result.event) {
          this.ctx.logger.debug(`[supertext] version report ${result.event}: ${result.sent ? 'sent' : 'not sent'}`);
        }
        return result;
      } catch (e) {
        this.ctx.logger.debug(`[supertext] version report skipped: ${(e && e.message) || e}`);
        return null;
      }
    });
    this.queue = task;
    return task;
  }

  /** For back-end requests: runs after the current request's work, so it never waits for Supertext or the center. */
  inBackground(action, url, httpStatus) {
    setImmediate(() => {
      this.run(action, url, httpStatus).catch(() => {});
    });
  }

  /** The latest stored key check (for the status screen), or null. */
  async lastCheck() {
    try {
      return (await this.load()).keyCheck;
    } catch (e) {
      return null;
    }
  }
}

module.exports = {
  PING_ROUTE,
  PLUGIN_NAME,
  Reporting,
  absoluteUrl,
  siteUrl,
  versionReportsEnabled
};
