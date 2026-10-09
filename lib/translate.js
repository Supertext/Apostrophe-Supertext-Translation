'use strict';

/**
 * Sends units to Supertext and writes the translations back. No Apostrophe dependencies.
 */

const { buildDocument, parseDocument, chunks } = require('./document');

/**
 * Supertext language for an Apostrophe locale: the configured code, else the locale name
 * in BCP 47 form (`de_CH` -> `de-CH`).
 */
function languageCode(locale, languages = {}) {
  const configured = languages[locale] && languages[locale].code;
  return String(configured || locale).trim().replace(/_/g, '-');
}

/** Form of address for a locale: `more` (formal), `less` (informal) or `default`. */
function politeness(locale, languages = {}) {
  const value = languages[locale] && languages[locale].politeness;
  return value === 'more' || value === 'less' ? value : 'default';
}

/** Source language for the API: the primary subtag only (`de-CH` -> `de`). */
const sourceCode = (code) => String(code).split('-')[0].toLowerCase();

/**
 * Translates `units` from `source` to `target` (Apostrophe locale names).
 * @returns {Promise<string[]>} paths of units Supertext returned nothing for (left as they were)
 */
async function translateUnits(client, units, source, target, languages = {}) {
  const missing = [];
  for (const chunk of chunks(units)) {
    const html = await client.translateHtml({
      html: buildDocument(chunk),
      targetLang: languageCode(target, languages),
      sourceLang: sourceCode(languageCode(source, languages)),
      politeness: politeness(target, languages)
    });
    const translated = parseDocument(html);
    chunk.forEach((unit, i) => {
      const value = translated.get(i);
      if (value === undefined || !unit.apply(value)) {
        missing.push(unit.path);
      }
    });
  }
  return missing;
}

module.exports = { languageCode, politeness, sourceCode, translateUnits };
