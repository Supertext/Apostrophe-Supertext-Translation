/**
 * Language codes for the Supertext AI file API: the source is a bare language
 * (`en`), the target a regional code (`de-DE`). Anything else is answered with
 * HTTP 400 INVALID_LANGUAGE_PAIR, the most common integration bug.
 */
/** The region used for a bare target language. */
export const DEFAULT_REGIONS = Object.freeze({
    ar: 'ar-SA', bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR',
    en: 'en-US', es: 'es-ES', et: 'et-EE', fi: 'fi-FI', fr: 'fr-FR', hr: 'hr-HR',
    hu: 'hu-HU', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', lt: 'lt-LT', lv: 'lv-LV',
    nb: 'nb-NO', nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT', ro: 'ro-RO', ru: 'ru-RU',
    sk: 'sk-SK', sl: 'sl-SI', sr: 'sr-RS', sv: 'sv-SE', th: 'th-TH', tr: 'tr-TR',
    uk: 'uk-UA', vi: 'vi-VN', zh: 'zh-CN',
});
const SCRIPT = /^[A-Za-z]{4}$/;
const REGION = /^([A-Za-z]{2}|[0-9]{3})$/;
/**
 * `de_ch` → `de-CH`, `ZH_HANT_TW` → `zh-Hant-TW`, `es-419` stays. Variants and extensions after a
 * script or region are dropped (`de_DE_formal` → `de-DE`, `en-US-x-twain` → `en-US`); a code whose
 * second subtag is neither a script nor a region is kept (`de-CHE`) and isn't valid.
 */
export function normalize(code) {
    const [language = '', ...subtags] = code.trim().replace(/_/g, '-').split('-');
    const out = [language.toLowerCase()];
    let next = 0;
    if (next < subtags.length && SCRIPT.test(subtags[next]))
        out.push(titleCase(subtags[next++]));
    if (next < subtags.length && REGION.test(subtags[next]))
        out.push(subtags[next++].toUpperCase());
    if (next > 0)
        return out.join('-');
    return [
        out[0],
        ...subtags.map((tag) => {
            if (/^[A-Za-z]{2}$/.test(tag))
                return tag.toUpperCase(); // region
            if (SCRIPT.test(tag))
                return titleCase(tag); // script
            return tag; // anything else
        }),
    ].join('-');
}
function titleCase(tag) {
    return tag[0].toUpperCase() + tag.slice(1).toLowerCase();
}
/** The non-blank override for `code`; keys are compared normalized (`de_AT` matches `de-at`). */
function override(code, overrides) {
    if (!overrides)
        return undefined;
    const wanted = normalize(code);
    for (const [key, value] of Object.entries(overrides)) {
        if (normalize(key) === wanted && value.trim() !== '')
            return value;
    }
    return undefined;
}
/** The source code to send: the bare language (`en-US` → `en`). `''` stays `''` (auto-detect). */
export function source(code, overrides) {
    return normalize(override(code, overrides) ?? code).split('-')[0];
}
/** The target code to send: the override, else the code; bare languages get their default region. */
export function target(code, overrides) {
    const normalized = normalize(override(code, overrides) ?? code);
    if (normalized === '' || normalized.includes('-'))
        return normalized;
    return DEFAULT_REGIONS[normalized] ?? normalized;
}
const VALID = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
/** A plausible language code (after normalizing): `de`, `de-CH`, `zh-Hant-TW`, `es-419`, `fil`. */
export function isValid(code) {
    return VALID.test(normalize(code));
}
/** The language-code helpers as one object: `LanguageCodes.target('de')`. */
export const LanguageCodes = Object.freeze({ DEFAULT_REGIONS, normalize, source, target, isValid });
