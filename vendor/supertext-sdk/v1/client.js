/**
 * Client for the Supertext AI file translation API v1:
 *
 *   1. POST   translate/ai/file                   multipart upload of an HTML file → { file_id }
 *   2. GET    translate/ai/file/{id}/status       poll until `done`
 *   3. GET    translate/ai/file/{id}/translation  download the translated HTML
 *   4. DELETE translate/ai/file/{id}              always, best effort (files expire after 24 h)
 */
import { authHeader, retryDelayMs } from './auth.js';
import { DEFAULT_MAX_CHARACTERS, isBlank, planBatches } from './batching.js';
import { errorForFileStatus, errorForStatus, SupertextError } from './errors.js';
import { build, parse } from './html-document.js';
import { encodeMultipart } from './multipart.js';
import { apiKeyCheckFromError, apiKeyFingerprint, isoSeconds, KEY_CHECK_TIMEOUT_MS } from './api-key-check.js';
export const LIVE_BASE_URL = 'https://api.supertext.com/v1/';
const SDK_USER_AGENT = 'supertext-sdk-typescript';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class SupertextClient {
    // A #private field: never shows up in console.log, util.inspect or JSON.
    #apiKey;
    #fetch;
    #userAgent;
    baseUrl;
    pollIntervalMs;
    timeoutMs;
    requestTimeoutMs;
    maxRetries;
    #sleep;
    #now;
    /** A blank key doesn't throw here: the first request throws `missing_api_key` without sending anything. */
    constructor(apiKey, options = {}) {
        this.#apiKey = apiKey ?? '';
        const base = options.baseUrl ?? LIVE_BASE_URL;
        this.baseUrl = base.endsWith('/') ? base : `${base}/`;
        this.pollIntervalMs = options.pollIntervalMs ?? 2000;
        this.timeoutMs = options.timeoutMs ?? 180_000;
        this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
        this.maxRetries = options.maxRetries ?? 4;
        this.#userAgent = options.userAgent ? `${SDK_USER_AGENT} ${options.userAgent}` : SDK_USER_AGENT;
        this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
        this.#sleep = options.sleep ?? defaultSleep;
        this.#now = options.now ?? Date.now;
    }
    /**
     * The language pairs the API offers right now, with their features (`supports_politeness`, …):
     * the live version of `Languages.SOURCES`/`TARGETS`, e.g. for a settings page. Cost-free.
     */
    async getFeatures() {
        const list = jsonObject(await this.#request('GET', 'features'))?.supported_features;
        if (!Array.isArray(list))
            return [];
        return list.flatMap((item) => {
            const o = item && typeof item === 'object' ? item : {};
            if (typeof o.source_lang !== 'string' || typeof o.target_lang !== 'string')
                return [];
            const features = Array.isArray(o.features) ? o.features.filter((f) => typeof f === 'string') : [];
            return [{ sourceLang: o.source_lang, targetLang: o.target_lang, features }];
        });
    }
    /** Cost-free check that the API key is accepted (`GET features`). Throws a `SupertextError` if not. */
    async validateApiKey() {
        await this.#request('GET', 'features');
    }
    /**
     * The automatic API key check (Commando Center protocol): `GET features` with a
     * 10 s timeout, mapped to `ok`, `invalid`, `missing`, `unreachable` or `error`.
     * Never throws. A blank key gives `missing` without a request.
     */
    async checkApiKey() {
        const checkedAt = isoSeconds(this.#now());
        const fingerprint = apiKeyFingerprint(this.#apiKey);
        if (fingerprint === '')
            return { status: 'missing', checkedAt, httpStatus: null, errorCode: null, fingerprint };
        try {
            const status = await this.#request('GET', 'features', undefined, Math.min(KEY_CHECK_TIMEOUT_MS, this.requestTimeoutMs), true);
            return { status: 'ok', checkedAt, httpStatus: Number(status), errorCode: null, fingerprint };
        }
        catch (error) {
            return { ...apiKeyCheckFromError(error), checkedAt, fingerprint };
        }
    }
    /**
     * Uploads an HTML document; returns the file id. The language codes are sent as given
     * (trimmed): resolve CMS languages with `Languages.target()` / `Languages.source()` first.
     */
    async submit(html, targetLang, options = {}) {
        const target = targetLang.trim();
        if (target === '')
            throw new SupertextError('unsupported_language');
        const fields = [['target_lang', target]];
        const source = (options.sourceLang ?? '').trim();
        if (source !== '')
            fields.push(['source_lang', source]); // omitted: auto-detect
        const politeness = options.politeness;
        if (politeness === 'more' || politeness === 'less')
            fields.push(['politeness', politeness]);
        // The part's Content-Type must be exactly "text/html": the API rejects a charset
        // parameter with HTTP 415. The document declares UTF-8 in <meta charset>.
        const form = encodeMultipart(fields, { name: 'file', filename: 'content.html', contentType: 'text/html', content: html });
        const data = jsonObject(await this.#request('POST', 'translate/ai/file', form));
        const fileId = data?.file_id;
        if (typeof fileId !== 'string' || fileId === '')
            throw new SupertextError('no_file_id');
        return fileId;
    }
    /** The file's status: `translating`, `done`, `error`, `limit_exceeded`, `deleted` (others are possible). */
    async getStatus(fileId) {
        const status = jsonObject(await this.#request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/status`))?.status;
        return typeof status === 'string' ? status : '';
    }
    /** Polls until the file is `done`; throws on `error`, `limit_exceeded`, `deleted` or after `timeoutMs`. */
    async waitUntilDone(fileId) {
        const started = this.#now();
        for (;;) {
            const status = await this.getStatus(fileId);
            if (status === 'done')
                return;
            const error = errorForFileStatus(status);
            if (error)
                throw error;
            // Unknown statuses (e.g. `queued`) keep polling.
            if (this.#now() - started + this.pollIntervalMs > this.timeoutMs)
                throw new SupertextError('timeout');
            await this.#sleep(this.pollIntervalMs);
        }
    }
    /** The translated HTML document. */
    async download(fileId) {
        const body = await this.#request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/translation`);
        if (body.trim() === '')
            throw new SupertextError('incomplete_response', { detail: 'empty document' });
        return body;
    }
    /** Deletes the file. Never throws: files expire after 24 h anyway. */
    async delete(fileId) {
        try {
            await this.#request('DELETE', `translate/ai/file/${encodeURIComponent(fileId)}`);
        }
        catch {
            // Best effort.
        }
    }
    /** Full round trip for one HTML document: upload, wait, download, and always delete. */
    async translateHtml(html, targetLang, options = {}) {
        const fileId = await this.submit(html, targetLang, options);
        try {
            await this.waitUntilDone(fileId);
            return await this.download(fileId);
        }
        finally {
            await this.delete(fileId);
        }
    }
    async translateTexts(segments, targetLang, options = {}) {
        const isMap = segments instanceof Map;
        const entries = isMap ? [...segments] : Object.entries(segments);
        const keyed = entries.map(([key, s]) => typeof s === 'string' ? { key, text: s, html: false } : { key, text: s.text, html: s.html ?? false });
        const translated = new Map();
        for (const batch of planBatches(keyed, options.maxCharacters ?? DEFAULT_MAX_CHARACTERS)) {
            const html = await this.translateHtml(build(batch), targetLang, options);
            const results = parse(html, batch);
            const missing = batch.filter((_, i) => results[i] === null).map((s) => s.key);
            if (missing.length > 0)
                throw new SupertextError('incomplete_response', { detail: `missing: ${missing.join(', ')}` });
            batch.forEach((s, i) => translated.set(s.key, results[i]));
        }
        const out = keyed.map((s) => [s.key, isBlank(s.text) ? s.text : translated.get(s.key)]);
        return isMap ? new Map(out) : Object.fromEntries(out);
    }
    /** One HTTP request with auth, retries on 429 and error mapping. Returns the body text of a 2xx answer. */
    async #request(method, path, form, timeoutMs = this.requestTimeoutMs, returnStatus = false) {
        const authorization = authHeader(this.#apiKey); // throws missing_api_key before anything is sent
        // Never let the key reach a message, even if a proxy echoes the request back.
        const key = authorization.slice('Supertext-Auth-Key '.length);
        const scrub = (text) => text.split(key).join('***');
        const headers = { Authorization: authorization, Accept: 'application/json', 'User-Agent': this.#userAgent };
        if (form)
            headers['Content-Type'] = form.contentType;
        for (let attempt = 0;; attempt++) {
            let response;
            let text;
            try {
                const init = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
                if (form)
                    init.body = form.body;
                response = await this.#fetch(this.baseUrl + path, init);
                text = await response.text();
            }
            catch (error) {
                throw new SupertextError('transport_error', { detail: scrub(errorMessage(error)), cause: error });
            }
            if (response.status === 429 && attempt < this.maxRetries) {
                await this.#sleep(retryDelayMs(attempt, response.headers.get('retry-after')));
                continue;
            }
            if (!response.ok)
                throw errorForStatus(response.status, scrub(text));
            return returnStatus ? String(response.status) : text;
        }
    }
}
function errorMessage(error) {
    if (error instanceof Error) {
        // fetch wraps the real reason (ECONNREFUSED, DNS, TLS) in `cause`.
        const cause = error.cause;
        return cause instanceof Error && cause.message ? `${error.message}: ${cause.message}` : error.message;
    }
    return String(error);
}
function jsonObject(text) {
    try {
        const value = JSON.parse(text);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
