/**
 * Language codes for the Supertext AI file API: the source is a bare language
 * (`en`), the target a regional code (`de-DE`). Anything else is answered with
 * HTTP 400 INVALID_LANGUAGE_PAIR, the most common integration bug.
 */
/** The region used for a bare target language. */
export declare const DEFAULT_REGIONS: Readonly<Record<string, string>>;
/** CMS locale → Supertext code, e.g. `{ no: 'nb-NO', de: 'de-CH' }`. */
export type LanguageOverrides = Readonly<Record<string, string>>;
/** `de_ch` → `de-CH`, `ZH_HANT_TW` → `zh-Hant-TW`, `es-419` stays. */
export declare function normalize(code: string): string;
/** The source code to send: the bare language (`en-US` → `en`). `''` stays `''` (auto-detect). */
export declare function source(code: string, overrides?: LanguageOverrides): string;
/** The target code to send: the override, else the code; bare languages get their default region. */
export declare function target(code: string, overrides?: LanguageOverrides): string;
/** A plausible language code (after normalizing): `de`, `de-CH`, `zh-Hant-TW`, `es-419`, `fil`. */
export declare function isValid(code: string): boolean;
/** The language-code helpers as one object: `LanguageCodes.target('de')`. */
export declare const LanguageCodes: Readonly<{
    DEFAULT_REGIONS: Readonly<Record<string, string>>;
    normalize: typeof normalize;
    source: typeof source;
    target: typeof target;
    isValid: typeof isValid;
}>;
