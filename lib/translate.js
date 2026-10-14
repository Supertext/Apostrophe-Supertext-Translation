'use strict';

/**
 * Language codes and sending text units to Supertext through the SDK.
 * No Apostrophe dependencies.
 *
 * Language codes: no guessing. The `languages` module option maps an Apostrophe locale to a
 * Supertext code (one mapping for both directions); else the locale name is used if it is
 * exactly one of Supertext's codes (case and `_`/`-` ignored); else the SDK throws
 * `unsupported_language` and nothing is sent (the SDK's `Languages`, spec/languages.json).
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
 * the form of address (with `politenessIgnored` when one is configured but not offered).
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
    source,
    politeness: offered ? configured : 'default',
    politenessAvailable: offered,
    politenessIgnored: configured !== 'default' && !offered
  };
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
  politeness,
  sourceCode,
  targetCode,
  targetOrNull,
  translateUnits
};
