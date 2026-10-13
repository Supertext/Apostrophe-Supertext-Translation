/**
 * Supertext SDK: client for the Supertext AI file translation API v1.
 *
 * No Supertext account yet? Create one at https://www.supertext.com/person/en/account/signin.
 * Generate your API key at https://www.supertext.com/en/integrations/api
 * (supertext.com → Integrations → API; requires the Admin role).
 */
export { SupertextClient, LIVE_BASE_URL } from './client.js';
export type { FetchLike, Politeness, SegmentInput, Segments, SupertextClientOptions, TranslateOptions, TranslateTextsOptions } from './client.js';
export { authHeader, retryDelayMs } from './auth.js';
export { ErrorCode, SupertextError, errorForFileStatus, errorForStatus } from './errors.js';
export type { SupertextErrorCode, SupertextErrorDetails } from './errors.js';
export { LanguageCodes, DEFAULT_REGIONS } from './language-codes.js';
export type { LanguageOverrides } from './language-codes.js';
export { HtmlDocument } from './html-document.js';
export type { Segment } from './html-document.js';
export { DEFAULT_MAX_CHARACTERS, planBatches } from './batching.js';
export type { KeyedSegment } from './batching.js';
