'use strict';

/**
 * Sends units to Supertext and writes the translations back. No Apostrophe dependencies.
 */

const { buildDocument, parseDocument, chunks } = require('./document');

/**
 * Regional default for a bare target language. Supertext rejects bare targets (`de`)
 * with INVALID_LANGUAGE_PAIR, so `de` is sent as `de-DE`. Same table in every
 * Supertext plugin.
 */
const DEFAULT_REGIONS = Object.freeze({
  ar: 'ar-SA', bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR', en: 'en-US',
  es: 'es-ES', et: 'et-EE', fi: 'fi-FI', fr: 'fr-FR', hr: 'hr-HR', hu: 'hu-HU', it: 'it-IT',
  ja: 'ja-JP', ko: 'ko-KR', lt: 'lt-LT', lv: 'lv-LV', nb: 'nb-NO', nl: 'nl-NL', pl: 'pl-PL',
  pt: 'pt-PT', ro: 'ro-RO', ru: 'ru-RU', sk: 'sk-SK', sl: 'sl-SI', sr: 'sr-RS', sv: 'sv-SE',
  th: 'th-TH', tr: 'tr-TR', uk: 'uk-UA', vi: 'vi-VN', zh: 'zh-CN'
});

/** `de_ch` / `DE-ch` -> `de-CH`; scripts and numeric regions keep their form (`zh-Hant`, `es-419`). */
function normalizeTag(code) {
  const [ language, ...rest ] = String(code || '').trim().split(/[-_]+/).filter(Boolean);
  if (!language) {
    return '';
  }
  const subtags = rest.map((part) => {
    if (/^[a-z]{2}$/i.test(part)) {
      return part.toUpperCase();
    }
    if (/^[a-z]{4}$/i.test(part)) {
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    }
    return part;
  });
  return [ language.toLowerCase(), ...subtags ].join('-');
}

/**
 * Supertext target language for an Apostrophe locale: the configured code wins, else the
 * locale name. Always regional: normalized (`de_ch` -> `de-CH`), and a bare language gets
 * its default region (`de` -> `de-DE`); unknown bare codes are sent unchanged.
 */
function languageCode(locale, languages = {}) {
  const configured = languages[locale] && languages[locale].code;
  const tag = normalizeTag(configured || locale);
  return tag.includes('-') ? tag : (DEFAULT_REGIONS[tag] || tag);
}

/** Form of address for a locale: `more` (formal), `less` (informal) or `default`. */
function politeness(locale, languages = {}) {
  const value = languages[locale] && languages[locale].politeness;
  return value === 'more' || value === 'less' ? value : 'default';
}

/** Source language for the API: the bare language only (`de-CH` -> `de`). */
const sourceCode = (code) => normalizeTag(code).split('-')[0];

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

module.exports = { DEFAULT_REGIONS, languageCode, normalizeTag, politeness, sourceCode, translateUnits };
