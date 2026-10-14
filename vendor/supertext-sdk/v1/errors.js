/**
 * Errors thrown by the SDK. Every failure is a `SupertextError` with a stable
 * `code`; integrations translate the code for their users and may append
 * `detail` (the API's or the network's own explanation, untranslated).
 */
/** Stable error codes. The string values are shared by all Supertext SDKs. */
export const ErrorCode = {
    MissingApiKey: 'missing_api_key',
    AuthenticationFailure: 'authentication_failure',
    InvalidLanguagePair: 'invalid_language_pair',
    UnsupportedLanguage: 'unsupported_language',
    UnsupportedFeature: 'unsupported_feature',
    NotFound: 'not_found',
    PayloadTooLarge: 'payload_too_large',
    TooManyRequests: 'too_many_requests',
    ServiceUnavailable: 'service_unavailable',
    UnexpectedStatus: 'unexpected_status',
    TransportError: 'transport_error',
    NoFileId: 'no_file_id',
    TranslationError: 'translation_error',
    QuotaExceeded: 'quota_exceeded',
    FileDeleted: 'file_deleted',
    Timeout: 'timeout',
    IncompleteResponse: 'incomplete_response',
};
const MESSAGES = {
    missing_api_key: 'No Supertext API key is configured.',
    authentication_failure: 'Supertext rejected the API key. Please check it.',
    invalid_language_pair: 'Supertext does not support this language pair.',
    unsupported_language: 'This language has no Supertext language code. Map it to a Supertext language.',
    unsupported_feature: 'Supertext does not support this option for the language pair.',
    not_found: 'The Supertext file was not found (expired or already deleted).',
    payload_too_large: 'The document is too large for Supertext to translate.',
    too_many_requests: 'Too many requests to Supertext. Please try again shortly.',
    service_unavailable: 'The Supertext service is unavailable.',
    unexpected_status: 'Supertext sent an unexpected HTTP status.',
    transport_error: 'Could not reach Supertext.',
    no_file_id: 'Supertext did not return a file id.',
    translation_error: 'Supertext failed to translate the document.',
    quota_exceeded: 'Your Supertext translation limit is used up.',
    file_deleted: 'The Supertext file was deleted before it could be downloaded.',
    timeout: 'Timed out waiting for the Supertext translation to finish.',
    incomplete_response: 'The Supertext translation is incomplete.',
};
export class SupertextError extends Error {
    code;
    status;
    detail;
    apiErrorCode;
    sourceLang;
    targetLang;
    feature;
    constructor(code, details = {}) {
        let message = MESSAGES[code];
        if (details.status !== undefined)
            message += ` HTTP ${details.status}.`;
        if (details.detail)
            message += ` Details: ${details.detail}`;
        super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
        this.name = 'SupertextError';
        this.code = code;
        // Only set what is known, so `'status' in error` and JSON output stay clean.
        if (details.status !== undefined)
            this.status = details.status;
        if (details.detail)
            this.detail = details.detail;
        if (details.apiErrorCode)
            this.apiErrorCode = details.apiErrorCode;
        if (details.sourceLang)
            this.sourceLang = details.sourceLang;
        if (details.targetLang)
            this.targetLang = details.targetLang;
        if (details.feature)
            this.feature = details.feature;
    }
}
// Fields only count as strings: the API's JSON isn't trusted to have the documented types.
const str = (value) => (typeof value === 'string' && value !== '' ? value : undefined);
/**
 * Maps a non-2xx HTTP answer to a `SupertextError` (spec/errors.json).
 * HTTP 429 lands here only after the retries are used up.
 */
export function errorForStatus(status, body) {
    const detail = body.replace(/<[^>]*>/g, '').replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '').slice(0, 200) || undefined;
    let json;
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            json = parsed;
    }
    catch {
        // Not JSON: plain text or an HTML error page.
    }
    const apiErrorCode = str(json?.error_code);
    const details = { status };
    if (detail !== undefined)
        details.detail = detail;
    if (apiErrorCode !== undefined)
        details.apiErrorCode = apiErrorCode;
    let code;
    if ((status === 400 || status === 404) && body.includes('INVALID_LANGUAGE_PAIR')) {
        code = 'invalid_language_pair';
        const sourceLang = str(json?.source_lang);
        const targetLang = str(json?.target_lang);
        if (sourceLang !== undefined)
            details.sourceLang = sourceLang;
        if (targetLang !== undefined)
            details.targetLang = targetLang;
    }
    else if (status === 400 && apiErrorCode === 'FEATURE_ERROR') {
        code = 'unsupported_feature';
        const sourceLang = str(json?.source_lang);
        const targetLang = str(json?.target_lang);
        const feature = str(json?.feature);
        if (sourceLang !== undefined)
            details.sourceLang = sourceLang;
        if (targetLang !== undefined)
            details.targetLang = targetLang;
        if (feature !== undefined)
            details.feature = feature;
    }
    else if (status === 401 || status === 403) {
        code = 'authentication_failure';
    }
    else if (status === 404) {
        code = 'not_found';
    }
    else if (status === 413) {
        code = 'payload_too_large';
    }
    else if (status === 429) {
        code = 'too_many_requests';
    }
    else if (status >= 500 && status <= 599) {
        code = 'service_unavailable';
    }
    else {
        code = 'unexpected_status';
    }
    return new SupertextError(code, details);
}
/** The error for a file status, or `null` when the status is not a failure. */
export function errorForFileStatus(status) {
    switch (status) {
        case 'error':
            return new SupertextError('translation_error');
        case 'limit_exceeded':
            return new SupertextError('quota_exceeded');
        case 'deleted':
            return new SupertextError('file_deleted');
        default:
            return null;
    }
}
