/**
 * Version reporting to the Supertext Commando Center, the automatic API key check
 * and the callback ping (spec/reporting.json; protocol: Commando-Center-Supertext-Translation
 * → docs/DEVELOPER.md → Report protocol).
 *
 * The reporter is stateless: the plugin loads its `ReporterState` (a plain JSON
 * object), passes it in, and stores the state it gets back.
 */
import { type ApiKeyCheck } from './api-key-check.js';
import { type FetchLike, type SupertextClientOptions } from './client.js';
export declare const DEFAULT_REPORT_URL = "https://commandocenter-production.up.railway.app/api/v1/report";
export declare const REPORT_TIMEOUT_MS = 3000;
export declare const FAILURE_BACKOFF_MS = 3600000;
export type ReportEvent = 'installed' | 'settings_saved' | 'upgraded' | 'api_key_check' | 'check';
/** What the plugin stores between requests (as JSON, unchanged). */
export interface ReporterState {
    /** `<plugin>|<system>|<runtime>` versions last reported successfully. */
    reportedVersions: string | null;
    /** The key status last reported successfully. */
    reportedKeyStatus: string | null;
    /** When the last report failed (no new attempt for an hour). */
    lastFailureAt: string | null;
    /** The latest key check. */
    keyCheck: ApiKeyCheck | null;
}
export interface NameVersion {
    name: string;
    version?: string | null;
}
export interface ReporterOptions {
    /** The "Send version information to Supertext" setting combined with the environment: see `reportsEnabled()`. */
    enabled: boolean;
    /** Base URL of the installation, as the system knows it. */
    siteUrl: string;
    /** `name` = the plugin's GitHub repository name; `version` from its official version source. */
    plugin: {
        name: string;
        version: string;
    };
    /** The CMS, PIM, shop or application, in its own spelling. */
    system: NameVersion;
    /** Default: Node.js (or Deno/Bun) and its version. */
    runtime?: NameVersion;
    /** Default: this SDK's version. */
    sdkVersion?: string;
    /** The plugin's public ping endpoint; null for hosted apps without one. */
    callbackUrl?: string | null;
    /** Default: `SUPERTEXT_REPORT_URL` from the environment, else the live center. */
    reportUrl?: string;
    /** For the key check (base URL, fetch, sleep for tests). */
    clientOptions?: SupertextClientOptions;
    /** HTTP for the report (tests). Default: the global `fetch`. */
    fetch?: FetchLike;
    /** Clock in milliseconds (tests). */
    now?: () => number;
}
export interface ReporterResult {
    /** Store this. */
    state: ReporterState;
    /** The latest key check (show it on the settings or status page). */
    check: ApiKeyCheck | null;
    /** The event that was reported (or tried); null when nothing was due. */
    event: ReportEvent | null;
    /** Whether the center accepted the report. */
    sent: boolean;
}
export declare const EMPTY_REPORTER_STATE: ReporterState;
/** A stored state (parsed JSON, or anything) as a `ReporterState`; unknown or broken values become empty. */
export declare function reporterState(value: unknown): ReporterState;
/**
 * Whether version reports are on: `SUPERTEXT_VERSION_REPORTS` (0/false/off/no, 1/true/on/yes)
 * wins over the setting; the setting defaults to on.
 */
export declare function reportsEnabled(setting?: boolean | null, env?: string | null | undefined): boolean;
export interface PingResponse {
    status: 200 | 400 | 404;
    headers: Record<string, string>;
    body: string;
}
/**
 * The answer of the plugin's public ping endpoint (`GET <callback>?challenge=<c>`).
 * Only while reporting is on (else 404). Nothing a caller sends is reflected unless it matches the pattern.
 */
export declare function pingResponse(challenge: string | null | undefined, options: {
    plugin: string;
    enabled: boolean;
}): PingResponse;
export declare class InstallationReporter {
    #private;
    readonly reportUrl: string;
    constructor(options: ReporterOptions);
    /** Whether reports are sent (the ping endpoint answers only then). */
    get enabled(): boolean;
    /** `<plugin>|<system>|<runtime>` versions. */
    get versions(): string;
    /** After the plugin's settings were saved: checks the key, reports `installed` or `settings_saved`. */
    afterSettingsSaved(state: ReporterState | null, apiKey: string): Promise<ReporterResult>;
    /** On back-end requests that run the plugin's code: checks a changed key, reports what changed. */
    onRequest(state: ReporterState | null, apiKey: string): Promise<ReporterResult>;
    /** A translation was rejected with 401/403: the key is invalid (no request to Supertext). */
    authenticationFailed(state: ReporterState | null, apiKey: string, httpStatus?: number): Promise<ReporterResult>;
    /** The "Test connection" button: checks the key, reports a change. */
    testConnection(state: ReporterState | null, apiKey: string): Promise<ReporterResult>;
    /** Sends a `check` report now (commands, tests), even after a recent failure. */
    reportCheck(state: ReporterState | null): Promise<ReporterResult>;
    /** The report body for an event and state. */
    buildReport(event: ReportEvent, state: ReporterState): Record<string, unknown>;
}
