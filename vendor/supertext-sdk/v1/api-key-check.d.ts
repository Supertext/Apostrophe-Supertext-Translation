export type ApiKeyCheckStatus = 'ok' | 'invalid' | 'missing' | 'unreachable' | 'error';
export interface ApiKeyCheck {
    /** `ok` (2xx), `invalid` (401/403), `missing` (no key, nothing sent), `unreachable` (no answer, 5xx), `error` (anything else). */
    status: ApiKeyCheckStatus;
    /** When the check ran: UTC ISO 8601 without fractions (`2026-10-13T08:00:00Z`). */
    checkedAt: string;
    /** The HTTP status Supertext answered with; null without an answer. */
    httpStatus: number | null;
    /** The body's JSON `error_code` (at most 100 characters); null if none. */
    errorCode: string | null;
    /** SHA-256 of the key (lower-case hex), to notice a changed key. Kept locally, never sent. '' for a blank key. */
    fingerprint: string;
}
export declare const KEY_CHECK_TIMEOUT_MS = 10000;
/** SHA-256 (hex) of the key as `authHeader()` would send it; '' for a blank key. */
export declare function apiKeyFingerprint(apiKey: string | null | undefined): string;
/** Status, HTTP status and error code of a failed check (`checkedAt` and `fingerprint` are added by the caller). */
export declare function apiKeyCheckFromError(error: unknown): Pick<ApiKeyCheck, 'status' | 'httpStatus' | 'errorCode'>;
/** `2026-10-13T08:00:00Z` for a time in milliseconds. */
export declare function isoSeconds(ms: number): string;
