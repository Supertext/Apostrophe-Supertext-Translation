'use strict';

/**
 * Sends text units to Supertext through the SDK and writes the translations back.
 * No Apostrophe dependencies.
 */

const { LanguageCodes } = require('./sdk');

/** `{ de: { code: 'de-CH' } }` -> `{ de: 'de-CH' }` for the SDK's LanguageCodes. */
function overrides(languages = {}) {
  const out = {};
  for (const [ locale, settings ] of Object.entries(languages || {})) {
    if (settings && settings.code) {
      out[locale] = settings.code;
    }
  }
  return out;
}

/**
 * Supertext target language for an Apostrophe locale: the configured code wins, else the
 * locale name, always regional (`de` -> `de-DE`, `de_ch` -> `de-CH`; see the SDK's
 * LanguageCodes).
 */
function languageCode(locale, languages = {}) {
  return LanguageCodes.target(locale, overrides(languages));
}

/** Form of address for a locale: `more` (formal), `less` (informal) or `default`. */
function politeness(locale, languages = {}) {
  const value = languages[locale] && languages[locale].politeness;
  return value === 'more' || value === 'less' ? value : 'default';
}

/** Source language for the API: the bare language only (`de-CH` -> `de`). */
const sourceCode = (code) => LanguageCodes.source(code);

/**
 * Translates `units` from `source` to `target` (Apostrophe locale names) with one
 * `translateTexts` call: the SDK packs them into documents below the size limit.
 * @returns {Promise<string[]>} paths of units whose translation came back empty (left as they were)
 */
async function translateUnits(client, units, source, target, languages = {}) {
  if (!units.length) {
    return [];
  }
  const segments = new Map(units.map((unit, i) => [ String(i), { text: unit.text, html: unit.html } ]));
  const translated = await client.translateTexts(segments, languageCode(target, languages), {
    sourceLang: sourceCode(languageCode(source, languages)),
    politeness: politeness(target, languages)
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

module.exports = { languageCode, overrides, politeness, sourceCode, translateUnits };
