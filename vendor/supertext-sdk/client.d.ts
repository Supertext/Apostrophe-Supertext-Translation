import { type Segment } from './html-document.js';
export declare const LIVE_BASE_URL = "https://api.supertext.com/v1/";
/** `more`: formal address (Sie, vous, Lei). `less`: informal (du, tu). `default`: Supertext decides. */
export type Politeness = 'default' | 'more' | 'less';
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export interface SupertextClientOptions {
    /** Default: the live API. A trailing slash is added if missing. */
    baseUrl?: string;
    /** Wait between status polls. Default 2000 ms. */
    pollIntervalMs?: number;
    /** Give up waiting for a translation after this long. Default 180000 ms. */
    timeoutMs?: number;
    /** Timeout of a single HTTP request. Default 30000 ms. */
    requestTimeoutMs?: number;
    /** Retries after HTTP 429 (the API limits requests per second). Default 4. */
    maxRetries?: number;
    /** Appended to the User-Agent, e.g. `Payload-Supertext-Translation/1.2.0`. */
    userAgent?: string;
    /** HTTP implementation (proxies, tests). Default: the global `fetch`. */
    fetch?: FetchLike;
    /** Sleep implementation (tests). */
    sleep?: (ms: number) => Promise<void>;
    /** Clock in milliseconds (tests). Default `Date.now`. */
    now?: () => number;
}
export interface TranslateOptions {
    /** Source language; any form (`en`, `en-US`, `en_GB`), sent bare. Omitted or empty: auto-detect. */
    sourceLang?: string | null;
    politeness?: Politeness;
}
export interface TranslateTextsOptions extends TranslateOptions {
    /** Maximum packed characters per document. Default 900000. */
    maxCharacters?: number;
}
/** Segments for `translateTexts`: a Map or a plain object, key → segment (a string is plain text). */
export type SegmentInput = Segment | string;
export type Segments = ReadonlyMap<string, SegmentInput> | Readonly<Record<string, SegmentInput>>;
export declare class SupertextClient {
    #private;
    readonly baseUrl: string;
    readonly pollIntervalMs: number;
    readonly timeoutMs: number;
    readonly requestTimeoutMs: number;
    readonly maxRetries: number;
    /** A blank key doesn't throw here: the first request throws `missing_api_key` without sending anything. */
    constructor(apiKey: string, options?: SupertextClientOptions);
    /** Cost-free check that the API key is accepted (`GET features`). */
    validateApiKey(): Promise<void>;
    /** Uploads an HTML document; returns the file id. Language codes are normalized (`de` → `de-DE`, `en-US` → `en`). */
    submit(html: string, targetLang: string, options?: TranslateOptions): Promise<string>;
    /** The file's status: `translating`, `done`, `error`, `limit_exceeded`, `deleted` (others are possible). */
    getStatus(fileId: string): Promise<string>;
    /** Polls until the file is `done`; throws on `error`, `limit_exceeded`, `deleted` or after `timeoutMs`. */
    waitUntilDone(fileId: string): Promise<void>;
    /** The translated HTML document. */
    download(fileId: string): Promise<string>;
    /** Deletes the file. Never throws: files expire after 24 h anyway. */
    delete(fileId: string): Promise<void>;
    /** Full round trip for one HTML document: upload, wait, download, and always delete. */
    translateHtml(html: string, targetLang: string, options?: TranslateOptions): Promise<string>;
    /**
     * Translates texts and HTML fragments, keyed by your own ids. Returns the
     * same keys in the same order (a Map for a Map, an object for an object).
     * Blank texts come back unchanged; segments are packed into as few documents
     * as possible, translated one after the other (the API limits requests per second).
     */
    translateTexts(segments: ReadonlyMap<string, SegmentInput>, targetLang: string, options?: TranslateTextsOptions): Promise<Map<string, string>>;
    translateTexts(segments: Readonly<Record<string, SegmentInput>>, targetLang: string, options?: TranslateTextsOptions): Promise<Record<string, string>>;
}
