/**
 * Supertext AI file translation API v1. A later API version gets its own namespace
 * (`supertext-sdk/v2`) next to this one, so integrations can move at their own pace.
 *
 * No Supertext account yet? Create one at https://www.supertext.com/person/en/account/signin.
 * Generate your API key at https://www.supertext.com/en/integrations/api
 * (supertext.com → Integrations → API; requires the Admin role).
 */
export { SupertextClient, LIVE_BASE_URL } from './client.js';
export type { FeatureSupport, FetchLike, Politeness, SegmentInput, Segments, SupertextClientOptions, TranslateOptions, TranslateTextsOptions } from './client.js';
export { authHeader, retryDelayMs } from './auth.js';
export { ErrorCode, SupertextError, errorForFileStatus, errorForStatus } from './errors.js';
export type { SupertextErrorCode, SupertextErrorDetails } from './errors.js';
export { Languages, SOURCE_LANGUAGES, TARGET_LANGUAGES, matchSource, matchTarget, supportsPoliteness } from './languages.js';
export type { LanguageMapping, SourceLanguage, TargetLanguage } from './languages.js';
export { HtmlDocument } from './html-document.js';
export type { Segment } from './html-document.js';
export { DEFAULT_MAX_CHARACTERS, planBatches } from './batching.js';
export type { KeyedSegment } from './batching.js';
export { apiKeyFingerprint, apiKeyCheckFromError, KEY_CHECK_TIMEOUT_MS } from './api-key-check.js';
export type { ApiKeyCheck, ApiKeyCheckStatus } from './api-key-check.js';
