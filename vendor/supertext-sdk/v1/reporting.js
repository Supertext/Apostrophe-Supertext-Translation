/**
 * Version reporting to the Supertext Commando Center, the automatic API key check
 * and the callback ping (spec/reporting.json; protocol: Commando-Center-Supertext-Translation
 * → docs/DEVELOPER.md → Report protocol).
 *
 * The reporter is stateless: the plugin loads its `ReporterState` (a plain JSON
 * object), passes it in, and stores the state it gets back.
 */
import { apiKeyFingerprint, isoSeconds } from './api-key-check.js';
import { SupertextClient } from './client.js';
import { SDK_VERSION } from '../version.js';
export const DEFAULT_REPORT_URL = 'https://commandocenter-production.up.railway.app/api/v1/report';
export const REPORT_TIMEOUT_MS = 3_000;
export const FAILURE_BACKOFF_MS = 3_600_000;
export const EMPTY_REPORTER_STATE = Object.freeze({ reportedVersions: null, reportedKeyStatus: null, lastFailureAt: null, keyCheck: null });
/** A stored state (parsed JSON, or anything) as a `ReporterState`; unknown or broken values become empty. */
export function reporterState(value) {
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        }
        catch {
            value = null;
        }
    }
    const o = value && typeof value === 'object' ? value : {};
    const s = (v) => (typeof v === 'string' ? v : null);
    const k = o.keyCheck && typeof o.keyCheck === 'object' ? o.keyCheck : null;
    const keyCheck = k && typeof k.status === 'string' && typeof k.checkedAt === 'string'
        ? {
            status: k.status,
            checkedAt: k.checkedAt,
            httpStatus: typeof k.httpStatus === 'number' ? k.httpStatus : null,
            errorCode: s(k.errorCode),
            fingerprint: s(k.fingerprint) ?? '',
        }
        : null;
    return { reportedVersions: s(o.reportedVersions), reportedKeyStatus: s(o.reportedKeyStatus), lastFailureAt: s(o.lastFailureAt), keyCheck };
}
/**
 * Whether version reports are on: `SUPERTEXT_VERSION_REPORTS` (0/false/off/no, 1/true/on/yes)
 * wins over the setting; the setting defaults to on.
 */
export function reportsEnabled(setting, env = processEnv('SUPERTEXT_VERSION_REPORTS')) {
    const value = (env ?? '').trim().toLowerCase();
    if (['0', 'false', 'off', 'no'].includes(value))
        return false;
    if (['1', 'true', 'on', 'yes'].includes(value))
        return true;
    return setting ?? true;
}
const CHALLENGE = /^[A-Za-z0-9_-]{16,64}$/;
/**
 * The answer of the plugin's public ping endpoint (`GET <callback>?challenge=<c>`).
 * Only while reporting is on (else 404). Nothing a caller sends is reflected unless it matches the pattern.
 */
export function pingResponse(challenge, options) {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    if (!options.enabled)
        return { status: 404, headers, body: '{"ok":false}' };
    if (typeof challenge !== 'string' || !CHALLENGE.test(challenge))
        return { status: 400, headers, body: '{"ok":false}' };
    return { status: 200, headers, body: JSON.stringify({ ok: true, plugin: options.plugin, challenge }) };
}
export class InstallationReporter {
    #options;
    #now;
    #fetch;
    reportUrl;
    constructor(options) {
        this.#options = options;
        this.#now = options.now ?? Date.now;
        this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
        this.reportUrl = options.reportUrl || processEnv('SUPERTEXT_REPORT_URL') || DEFAULT_REPORT_URL;
    }
    /** Whether reports are sent (the ping endpoint answers only then). */
    get enabled() {
        return this.#options.enabled;
    }
    /** `<plugin>|<system>|<runtime>` versions. */
    get versions() {
        return [this.#options.plugin.version, this.#options.system.version ?? '', this.#runtime().version ?? ''].join('|');
    }
    /** After the plugin's settings were saved: checks the key, reports `installed` or `settings_saved`. */
    async afterSettingsSaved(state, apiKey) {
        const current = { ...(state ?? EMPTY_REPORTER_STATE), keyCheck: await this.#check(apiKey) };
        return this.#reportIfDue(current, current.reportedVersions === null ? 'installed' : 'settings_saved');
    }
    /** On back-end requests that run the plugin's code: checks a changed key, reports what changed. */
    async onRequest(state, apiKey) {
        let current = state ?? EMPTY_REPORTER_STATE;
        if (current.keyCheck === null || current.keyCheck.fingerprint !== apiKeyFingerprint(apiKey))
            current = { ...current, keyCheck: await this.#check(apiKey) };
        return this.#reportIfDue(current, this.#dueEvent(current));
    }
    /** A translation was rejected with 401/403: the key is invalid (no request to Supertext). */
    async authenticationFailed(state, apiKey, httpStatus = 401) {
        const keyCheck = { status: 'invalid', checkedAt: isoSeconds(this.#now()), httpStatus, errorCode: null, fingerprint: apiKeyFingerprint(apiKey) };
        const current = { ...(state ?? EMPTY_REPORTER_STATE), keyCheck };
        return this.#reportIfDue(current, this.#dueEvent(current));
    }
    /** The "Test connection" button: checks the key, reports a change. */
    async testConnection(state, apiKey) {
        const current = { ...(state ?? EMPTY_REPORTER_STATE), keyCheck: await this.#check(apiKey) };
        return this.#reportIfDue(current, this.#dueEvent(current));
    }
    /** Sends a `check` report now (commands, tests), even after a recent failure. */
    async reportCheck(state) {
        return this.#send(state ?? EMPTY_REPORTER_STATE, 'check');
    }
    /** The report body for an event and state. */
    buildReport(event, state) {
        const o = this.#options;
        const runtime = this.#runtime();
        const body = {
            schema: 1,
            event,
            site_url: o.siteUrl,
            plugin: { name: o.plugin.name, version: o.plugin.version },
            system: nameVersion(o.system),
            runtime: nameVersion(runtime),
            sdk_version: o.sdkVersion ?? SDK_VERSION,
        };
        const check = state.keyCheck;
        if (check) {
            body.api_key_configured = check.fingerprint !== '';
            const c = { status: check.status, checked_at: check.checkedAt };
            if (check.httpStatus !== null)
                c.http_status = check.httpStatus;
            if (check.errorCode !== null)
                c.error_code = check.errorCode;
            body.api_key_check = c;
        }
        if (o.callbackUrl)
            body.callback = { url: o.callbackUrl };
        return body;
    }
    #runtime() {
        return this.#options.runtime ?? detectRuntime();
    }
    #dueEvent(state) {
        if (state.reportedVersions === null)
            return 'installed';
        if (state.reportedVersions !== this.versions)
            return 'upgraded';
        if (state.keyCheck !== null && state.keyCheck.status !== state.reportedKeyStatus)
            return 'api_key_check';
        return null;
    }
    async #check(apiKey) {
        return new SupertextClient(apiKey, { ...this.#options.clientOptions, now: this.#now }).checkApiKey();
    }
    async #reportIfDue(state, event) {
        const idle = { state, check: state.keyCheck, event: null, sent: false };
        if (event === null || !this.#options.enabled)
            return idle;
        if (state.lastFailureAt !== null) {
            const failed = Date.parse(state.lastFailureAt);
            if (!Number.isNaN(failed) && this.#now() - failed < FAILURE_BACKOFF_MS)
                return idle;
        }
        return this.#send(state, event);
    }
    async #send(state, event) {
        if (!this.#options.enabled)
            return { state, check: state.keyCheck, event: null, sent: false };
        let ok = false;
        try {
            const response = await this.#fetch(this.reportUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': `supertext-sdk-typescript ${this.#options.plugin.name}/${this.#options.plugin.version}` },
                body: JSON.stringify(this.buildReport(event, state)),
                signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
            });
            ok = response.status >= 200 && response.status < 300;
            await response.body?.cancel().catch(() => undefined);
        }
        catch {
            ok = false; // never fails the caller: the center is optional
        }
        const next = ok
            ? { ...state, reportedVersions: this.versions, reportedKeyStatus: state.keyCheck?.status ?? state.reportedKeyStatus, lastFailureAt: null }
            : { ...state, lastFailureAt: isoSeconds(this.#now()) };
        return { state: next, check: next.keyCheck, event, sent: ok };
    }
}
function nameVersion(value) {
    return value.version ? { name: value.name, version: value.version } : { name: value.name };
}
function detectRuntime() {
    const g = globalThis;
    if (g.Deno?.version?.deno)
        return { name: 'Deno', version: g.Deno.version.deno };
    if (g.Bun?.version)
        return { name: 'Bun', version: g.Bun.version };
    return { name: 'Node.js', version: g.process?.versions?.node ?? null };
}
function processEnv(name) {
    return globalThis.process?.env?.[name];
}
