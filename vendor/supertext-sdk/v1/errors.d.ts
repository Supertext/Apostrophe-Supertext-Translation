/**
 * Errors thrown by the SDK. Every failure is a `SupertextError` with a stable
 * `code`; integrations translate the code for their users and may append
 * `detail` (the API's or the network's own explanation, untranslated).
 */
/** Stable error codes. The string values are shared by all Supertext SDKs. */
export declare const ErrorCode: {
    readonly MissingApiKey: "missing_api_key";
    readonly AuthenticationFailure: "authentication_failure";
    readonly InvalidLanguagePair: "invalid_language_pair";
    readonly UnsupportedLanguage: "unsupported_language";
    readonly UnsupportedFeature: "unsupported_feature";
    readonly NotFound: "not_found";
    readonly PayloadTooLarge: "payload_too_large";
    readonly TooManyRequests: "too_many_requests";
    readonly ServiceUnavailable: "service_unavailable";
    readonly UnexpectedStatus: "unexpected_status";
    readonly TransportError: "transport_error";
    readonly NoFileId: "no_file_id";
    readonly TranslationError: "translation_error";
    readonly QuotaExceeded: "quota_exceeded";
    readonly FileDeleted: "file_deleted";
    readonly Timeout: "timeout";
    readonly IncompleteResponse: "incomplete_response";
};
export type SupertextErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export interface SupertextErrorDetails {
    /** HTTP status, when the error comes from an HTTP answer. */
    status?: number;
    /** The API's (or the network's) own explanation: body without tags, at most 200 characters. */
    detail?: string;
    /** The JSON body's `error_code`, e.g. `INVALID_LANGUAGE_PAIR`. */
    apiErrorCode?: string;
    /** For `invalid_language_pair`: the codes the API reports, when it does. */
    sourceLang?: string;
    targetLang?: string;
    /** For `unsupported_feature`: the option the API names, e.g. `politeness`. */
    feature?: string;
    cause?: unknown;
}
export declare class SupertextError extends Error {
    readonly code: SupertextErrorCode;
    readonly status?: number;
    readonly detail?: string;
    readonly apiErrorCode?: string;
    readonly sourceLang?: string;
    readonly targetLang?: string;
    readonly feature?: string;
    constructor(code: SupertextErrorCode, details?: SupertextErrorDetails);
}
/**
 * Maps a non-2xx HTTP answer to a `SupertextError` (spec/errors.json).
 * HTTP 429 lands here only after the retries are used up.
 */
export declare function errorForStatus(status: number, body: string): SupertextError;
/** The error for a file status, or `null` when the status is not a failure. */
export declare function errorForFileStatus(status: string): SupertextError | null;
