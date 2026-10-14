/**
 * Languages of the Supertext AI file translation API v1 (spec/languages.json, from the live
 * `GET features`, October 2026). There is no default region and no guessing: an integration
 * maps its CMS languages to these codes; a CMS code that equals a Supertext code (apart from
 * case and `_`/`-`) is used as it is, anything else is an `unsupported_language` error until
 * the administrator maps it. For the live list, use `SupertextClient.getFeatures()`.
 */
import { SupertextError } from './errors.js';
const freeze = (list) => Object.freeze(list.map((item) => Object.freeze(item)));
/** Source languages (bare codes). */
export const SOURCE_LANGUAGES = freeze([
    { code: 'bg', name: 'Bulgarian' }, { code: 'cs', name: 'Czech' }, { code: 'da', name: 'Danish' }, { code: 'de', name: 'German' },
    { code: 'el', name: 'Greek' }, { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fi', name: 'Finnish' },
    { code: 'fr', name: 'French' }, { code: 'gsw', name: 'Swiss German' }, { code: 'hr', name: 'Croatian' }, { code: 'hu', name: 'Hungarian' },
    { code: 'it', name: 'Italian' }, { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' }, { code: 'nb', name: 'Norwegian Bokmål' },
    { code: 'nl', name: 'Dutch' }, { code: 'pl', name: 'Polish' }, { code: 'pt', name: 'Portuguese' }, { code: 'rm', name: 'Romansh' },
    { code: 'ru', name: 'Russian' }, { code: 'sk', name: 'Slovak' }, { code: 'sl', name: 'Slovenian' }, { code: 'sq', name: 'Albanian' },
    { code: 'sr', name: 'Serbian' }, { code: 'sv', name: 'Swedish' }, { code: 'tr', name: 'Turkish' }, { code: 'zh', name: 'Chinese' },
]);
/** Target languages, exactly as Supertext expects them. */
export const TARGET_LANGUAGES = freeze([
    { code: 'bg', name: 'Bulgarian', politeness: true },
    { code: 'cs', name: 'Czech', politeness: true },
    { code: 'da', name: 'Danish', politeness: true },
    { code: 'de-AT', name: 'German (Austria)', politeness: true },
    { code: 'de-CH', name: 'German (Switzerland)', politeness: true },
    { code: 'de-DE', name: 'German (Germany)', politeness: true },
    { code: 'el', name: 'Greek', politeness: true },
    { code: 'en-GB', name: 'English (United Kingdom)', politeness: false },
    { code: 'en-US', name: 'English (United States)', politeness: false },
    { code: 'es', name: 'Spanish', politeness: true },
    { code: 'fi', name: 'Finnish', politeness: true },
    { code: 'fr-CH', name: 'French (Switzerland)', politeness: true },
    { code: 'fr-FR', name: 'French (France)', politeness: true },
    { code: 'gsw-u-sd-chbe', name: 'Swiss German (Bern)', politeness: false },
    { code: 'gsw-u-sd-chzh', name: 'Swiss German (Zurich)', politeness: false },
    { code: 'hr', name: 'Croatian', politeness: true },
    { code: 'hu', name: 'Hungarian', politeness: true },
    { code: 'it-CH', name: 'Italian (Switzerland)', politeness: true },
    { code: 'it-IT', name: 'Italian (Italy)', politeness: true },
    { code: 'ja', name: 'Japanese', politeness: true },
    { code: 'ko', name: 'Korean', politeness: true },
    { code: 'nb', name: 'Norwegian Bokmål', politeness: true },
    { code: 'nl', name: 'Dutch', politeness: true },
    { code: 'pl', name: 'Polish', politeness: true },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', politeness: true },
    { code: 'pt-PT', name: 'Portuguese (Portugal)', politeness: true },
    { code: 'rm', name: 'Romansh', politeness: false },
    { code: 'ru', name: 'Russian', politeness: true },
    { code: 'sk', name: 'Slovak', politeness: true },
    { code: 'sl', name: 'Slovenian', politeness: true },
    { code: 'sq', name: 'Albanian', politeness: false },
    { code: 'sr-Cyrl', name: 'Serbian (Cyrillic)', politeness: false },
    { code: 'sr-Latn', name: 'Serbian (Latin)', politeness: false },
    { code: 'sv', name: 'Swedish', politeness: true },
    { code: 'tr', name: 'Turkish', politeness: true },
    { code: 'zh-Hans', name: 'Chinese (Simplified)', politeness: true },
    { code: 'zh-Hant', name: 'Chinese (Traditional)', politeness: true },
]);
/** Case, `_` vs `-` and surrounding spaces don't matter when comparing codes. */
const key = (code) => code.trim().replace(/_/g, '-').toLowerCase();
const SOURCES = new Map(SOURCE_LANGUAGES.map((l) => [key(l.code), l]));
const TARGETS = new Map(TARGET_LANGUAGES.map((l) => [key(l.code), l]));
/** The supported target that equals `code` (apart from case and `_`/`-`), else null. `de` → null, `de_ch` → `de-CH`. */
export function matchTarget(code) {
    return TARGETS.get(key(code))?.code ?? null;
}
/** The supported source for `code`: exact match, else its first subtag (`en-US` → `en`), else null. */
export function matchSource(code) {
    const k = key(code);
    if (k === '')
        return null;
    return SOURCES.get(k)?.code ?? SOURCES.get(k.split('-')[0])?.code ?? null;
}
function mapped(code, mapping) {
    if (!mapping)
        return null;
    const wanted = key(code);
    for (const [from, to] of Object.entries(mapping)) {
        if (key(from) === wanted && typeof to === 'string' && to.trim() !== '')
            return to.trim();
    }
    return null;
}
/**
 * The target code to send: the mapping's value (sent as it is, even if not in the list), else an
 * exact match, else `SupertextError('unsupported_language')` (nothing is sent).
 */
export function target(code, mapping) {
    const result = mapped(code, mapping) ?? matchTarget(code);
    if (result === null)
        throw new SupertextError('unsupported_language', { targetLang: code.trim() || undefined });
    return result;
}
/**
 * The source code to send: the mapping's value in its source form (`de-CH` → `de`; an unknown value as it is),
 * else `matchSource`, else `unsupported_language`. `''` stays `''` (auto-detect).
 */
export function source(code, mapping) {
    if (code.trim() === '')
        return '';
    // One mapping serves both directions: a mapped target code is sent in its source form (de-CH → de).
    const fromMapping = mapped(code, mapping);
    const result = fromMapping !== null ? (matchSource(fromMapping) ?? fromMapping) : matchSource(code);
    if (result === null)
        throw new SupertextError('unsupported_language', { sourceLang: code.trim() });
    return result;
}
/** Whether a supported target offers formal/informal; null for a code that isn't in the list. */
export function supportsPoliteness(targetCode) {
    return TARGETS.get(key(targetCode))?.politeness ?? null;
}
export function isSupportedTarget(code) {
    return matchTarget(code) !== null;
}
export function isSupportedSource(code) {
    return SOURCES.has(key(code));
}
/** The language helpers as one object: `Languages.target('de', { de: 'de-CH' })`. */
export const Languages = Object.freeze({
    SOURCES: SOURCE_LANGUAGES,
    TARGETS: TARGET_LANGUAGES,
    matchTarget,
    matchSource,
    target,
    source,
    supportsPoliteness,
    isSupportedTarget,
    isSupportedSource,
});
