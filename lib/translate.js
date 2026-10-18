'use strict';

/**
 * Language codes and sending text units to Supertext through the SDK.
 * No Apostrophe dependencies.
 *
 * Language codes: the mapping (one combo box per locale on the Supertext screen, stored in
 * `aposCache`; a locale listed in the `languages` module option is set there instead) gives
 * an Apostrophe locale its Supertext code (one mapping for both directions); else the locale
 * name is used if it is exactly one of Supertext's codes (case and `_`/`-` ignored); else the
 * SDK's default (`de` -> `de-DE`, `en` -> `en-US`, `zh` -> `zh-Hans`, `es-ES` -> `es`, ...);
 * else the SDK throws `unsupported_language` and nothing is sent (the SDK's `Languages`,
 * spec/languages.json).
 *
 * Translation review: `review: true` in a locale's settings (the checkbox on the Supertext
 * screen, or `languages.<locale>.review` in the module option, which wins) sends translations
 * into that locale through Supertext's review service (lib/sdk.js `createClient`).
 */

const { Languages, SupertextError } = require('./sdk');

/** The configured code of a locale: `{ de: { code: 'de-CH' } }` or the short form `{ de: 'de-CH' }`. */
function configuredCode(settings) {
  if (typeof settings === 'string') {
    return settings.trim();
  }
  return settings && typeof settings.code === 'string' ? settings.code.trim() : '';
}

/** The `languages` option as the SDK's mapping: `{ de: { code: 'de-CH' } }` -> `{ de: 'de-CH' }`. */
function mapping(languages = {}) {
  const out = {};
  for (const [ locale, settings ] of Object.entries(languages || {})) {
    const code = configuredCode(settings);
    if (code) {
      out[locale] = code;
    }
  }
  return out;
}

/** Supertext target code for an Apostrophe locale; throws `unsupported_language` if there is none. */
function targetCode(locale, languages = {}) {
  return Languages.target(locale, mapping(languages));
}

/** Supertext source code for an Apostrophe locale (`de-CH` -> `de`); throws `unsupported_language`. */
function sourceCode(locale, languages = {}) {
  return Languages.source(locale, mapping(languages));
}

/** The target code, or null if the locale has none (instead of throwing). */
function targetOrNull(locale, languages = {}) {
  try {
    return targetCode(locale, languages);
  } catch (e) {
    if (e instanceof SupertextError && e.code === 'unsupported_language') {
      return null;
    }
    throw e;
  }
}

/** The configured form of address: `more` (formal), `less` (informal) or `default`. */
function configuredPoliteness(locale, languages = {}) {
  const settings = (languages || {})[locale];
  const value = settings && typeof settings === 'object' ? settings.politeness : null;
  return value === 'more' || value === 'less' ? value : 'default';
}

/** Whether translations into a locale go through the review service (`review: true`). */
function reviewFor(locale, languages = {}) {
  const settings = (languages || {})[locale];
  return Boolean(settings && typeof settings === 'object' && settings.review === true);
}

/**
 * Form of address sent for a locale: the configured one, but only where Supertext offers
 * formal/informal for the target code (`Languages.supportsPoliteness`); else `default`
 * (nothing is sent).
 */
function politeness(locale, languages = {}, code = targetOrNull(locale, languages)) {
  const value = configuredPoliteness(locale, languages);
  return value !== 'default' && code && Languages.supportsPoliteness(code) === true ? value : 'default';
}

/**
 * What the status screen shows for a locale: its target code (null: unsupported), whether it
 * comes from the mapping, whether Supertext lists that code, whether it can be a source, and
 * the form of address (with `politenessIgnored` when one is configured but not offered),
 * `defaulted` when the code is the SDK's default (no mapping, no exact match) and `suggestion`
 * (what the combo box preselects without a saved choice: `Languages.suggestTarget`).
 */
function languageStatus(locale, languages = {}) {
  const code = targetOrNull(locale, languages);
  const mapped = Boolean(mapping(languages)[locale]);
  let source = null;
  try {
    source = sourceCode(locale, languages);
  } catch (e) {
    source = null;
  }
  const configured = configuredPoliteness(locale, languages);
  const offered = Boolean(code && Languages.supportsPoliteness(code) === true);
  return {
    locale,
    code,
    mapped,
    supported: Boolean(code),
    known: Boolean(code && Languages.isSupportedTarget(code)),
    defaulted: Boolean(code && !mapped && !Languages.matchTarget(locale)),
    suggestion: Languages.suggestTarget(locale),
    source,
    politeness: offered ? configured : 'default',
    politenessAvailable: offered,
    politenessIgnored: configured !== 'default' && !offered,
    review: reviewFor(locale, languages)
  };
}

/**
 * The mapping in effect: the one saved on the Supertext screen, with the `languages` module
 * option winning per locale (for automated setups). `overridden` lists the locales whose code
 * the option sets, `reviewOverridden` those whose *Translation review* it sets (`review: true`
 * or `false`), so the screen can say so (and doesn't let them be changed there).
 */
function mergeLanguages(stored, option) {
  const fromOption = option && typeof option === 'object' ? option : {};
  const overridden = Object.keys(mapping(fromOption));
  const reviewOverridden = Object.entries(fromOption)
    .filter(([ , settings ]) => settings && typeof settings === 'object' && typeof settings.review === 'boolean')
    .map(([ locale ]) => locale);
  const languages = {};
  for (const [ locale, settings ] of Object.entries(stored && typeof stored === 'object' ? stored : {})) {
    if (configuredCode(settings) || (settings && settings.review === true)) {
      languages[locale] = settings;
    }
  }
  for (const locale of overridden) {
    // The option's code and politeness; *Translation review* stays the screen's unless the
    // option sets it too (below).
    const storedReview = Boolean(languages[locale] && languages[locale].review === true);
    languages[locale] = storedReview
      ? {
        ...(typeof fromOption[locale] === 'string' ? { code: fromOption[locale] } : fromOption[locale]),
        review: true
      }
      : fromOption[locale];
  }
  for (const locale of reviewOverridden) {
    const current = languages[locale];
    languages[locale] = {
      ...(typeof current === 'string' ? { code: current } : current || {}),
      review: fromOption[locale].review
    };
  }
  return {
    languages,
    overridden,
    reviewOverridden
  };
}

/**
 * Checks what the Supertext screen saves: `{ <locale>: { code, politeness, review } }` for the
 * site's locales only, `code` one of Supertext's target codes or empty ("— choose —": the
 * default applies), `politeness` `more`, `less` or `default` (stored as `default` where the
 * target offers no formal/informal address), `review` a boolean (*Translation review*, off when
 * missing). A locale with neither a code nor review isn't stored. Throws an error with
 * `invalid` (the bad locales).
 * @returns {Record<string, { code: string, politeness: string, review: boolean }>}
 */
function validateLanguages(input, locales) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('languages must be an object'), { invalid: [] });
  }
  const out = {};
  const invalid = [];
  for (const [ locale, settings ] of Object.entries(input)) {
    const value = typeof settings === 'string' ? { code: settings } : settings;
    if (!locales.includes(locale) || !value || typeof value !== 'object') {
      invalid.push(locale);
      continue;
    }
    const code = typeof value.code === 'string' ? value.code.trim() : '';
    const polite = value.politeness == null || value.politeness === '' ? 'default' : value.politeness;
    const review = value.review == null ? false : value.review;
    if ((code && !Languages.isSupportedTarget(code)) || ![ 'default', 'more', 'less' ].includes(polite) || typeof review !== 'boolean') {
      invalid.push(locale);
      continue;
    }
    if (code || review) {
      out[locale] = {
        code,
        politeness: code && Languages.supportsPoliteness(code) === true ? polite : 'default',
        review
      };
    }
  }
  if (invalid.length) {
    throw Object.assign(new Error(`Invalid Supertext language for: ${invalid.join(', ')}`), { invalid });
  }
  return out;
}

/**
 * Translates `units` from `source` to `target` (Apostrophe locale names) with one
 * `translateTexts` call: the SDK packs them into documents below the size limit. Language
 * codes are resolved first, so an unsupported locale sends nothing.
 * @returns {Promise<string[]>} paths of units whose translation came back empty (left as they were)
 */
async function translateUnits(client, units, source, target, languages = {}) {
  if (!units.length) {
    return [];
  }
  const targetLang = targetCode(target, languages);
  const sourceLang = sourceCode(source, languages);
  const segments = new Map(units.map((unit, i) => [ String(i), {
    text: unit.text,
    html: unit.html
  } ]));
  const translated = await client.translateTexts(segments, targetLang, {
    sourceLang,
    politeness: politeness(target, languages, targetLang)
  });
  const missing = [];
  units.forEach((unit, i) => {
    const value = translated.get(String(i));
    if (typeof value !== 'string' || !unit.apply(value)) {
      missing.push(unit.path);
    }
  });
  return missing;
}

module.exports = {
  languageStatus,
  mapping,
  mergeLanguages,
  politeness,
  reviewFor,
  sourceCode,
  targetCode,
  targetOrNull,
  translateUnits,
  validateLanguages
};
