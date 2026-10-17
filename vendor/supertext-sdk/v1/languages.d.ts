export interface SourceLanguage {
    readonly code: string;
    /** English name. */
    readonly name: string;
}
export interface TargetLanguage extends SourceLanguage {
    /** Whether formal/informal (`politeness: more | less`) is offered. Otherwise the API answers FEATURE_ERROR. */
    readonly politeness: boolean;
}
/** Source languages (bare codes). */
export declare const SOURCE_LANGUAGES: readonly SourceLanguage[];
/** Target languages, exactly as Supertext expects them. */
export declare const TARGET_LANGUAGES: readonly TargetLanguage[];
/**
 * The default target of a bare language that Supertext offers only with a region or script.
 * Swiss German (`gsw`) has none: neither dialect is the obvious one.
 */
export declare const DEFAULT_TARGETS: Readonly<Record<string, string>>;
/** CMS language → Supertext code, e.g. `{ de: 'de-CH', no: 'nb' }` (the integration's language setting). */
export type LanguageMapping = Readonly<Record<string, string>>;
/** The supported target that equals `code` (apart from case and `_`/`-`), else null. `de` → null, `de_ch` → `de-CH`. */
export declare function matchTarget(code: string): string | null;
/**
 * The default target for a CMS code that has no exact match, else null: a bare language's
 * `DEFAULT_TARGETS` entry (`de` → `de-DE`), Chinese regions (`zh-TW` → `zh-Hant`, `zh-CN` → `zh-Hans`),
 * `language-Script-REGION` (`sr-Latn-RS` → `sr-Latn`) and `language-REGION` of a bare target
 * (`es-ES` → `es`). Never a guessed region: `en-IE`, `de-LI` → null.
 */
export declare function defaultTarget(code: string): string | null;
/** What a settings screen preselects for a CMS language: the exact match, else the default, else null. */
export declare function suggestTarget(code: string): string | null;
/**
 * The targets sorted by English name, for the language combo box. Show the name localized where
 * the platform can (e.g. `Intl.DisplayNames`) and the code next to it.
 */
export declare function targetOptions(): readonly TargetLanguage[];
/** The supported source for `code`: exact match, else its first subtag (`en-US` → `en`), else null. */
export declare function matchSource(code: string): string | null;
/**
 * The target code to send: the mapping's value (sent as it is, even if not in the list), else an
 * exact match, else the default (`defaultTarget`), else `SupertextError('unsupported_language')`
 * (nothing is sent).
 */
export declare function target(code: string, mapping?: LanguageMapping): string;
/**
 * The source code to send: the mapping's value in its source form (`de-CH` → `de`; an unknown value as it is),
 * else `matchSource`, else `unsupported_language`. `''` stays `''` (auto-detect).
 */
export declare function source(code: string, mapping?: LanguageMapping): string;
/** Whether a supported target offers formal/informal; null for a code that isn't in the list. */
export declare function supportsPoliteness(targetCode: string): boolean | null;
export declare function isSupportedTarget(code: string): boolean;
export declare function isSupportedSource(code: string): boolean;
/** The language helpers as one object: `Languages.target('de', { de: 'de-CH' })`. */
export declare const Languages: Readonly<{
    SOURCES: readonly SourceLanguage[];
    TARGETS: readonly TargetLanguage[];
    DEFAULT_TARGETS: Readonly<Record<string, string>>;
    matchTarget: typeof matchTarget;
    defaultTarget: typeof defaultTarget;
    suggestTarget: typeof suggestTarget;
    targetOptions: typeof targetOptions;
    matchSource: typeof matchSource;
    target: typeof target;
    source: typeof source;
    supportsPoliteness: typeof supportsPoliteness;
    isSupportedTarget: typeof isSupportedTarget;
    isSupportedSource: typeof isSupportedSource;
}>;
