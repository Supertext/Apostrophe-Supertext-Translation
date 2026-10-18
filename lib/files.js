'use strict';

/**
 * Translation files: "Export for translation" (XLIFF 1.2 or HTML) and "Import translation"
 * on top of the Supertext SDK's `TranslationFiles` (SDK 0.5.0, vendor/supertext-sdk).
 * No Apostrophe dependencies: index.js passes in the units (lib/collect.js), the language
 * mapping and the functions that load and write documents.
 *
 * Reference (the job's `reference`, how an import finds the document again):
 *   doc:<aposDocId>:<source locale>:<target locale>     e.g. doc:clx3k2…:en:de
 * Segment keys are the units' paths (`title`, `main.0.content[1]`, …), the same the API
 * translation uses, so an import writes back exactly what a translation would.
 */

const { TranslationFiles, TranslationFileError } = require('../vendor/supertext-sdk/index.js');
const { Languages } = require('./sdk');
const { mapping } = require('./translate');

const PLUGIN = 'Apostrophe-Supertext-Translation';
const SHORT_NAME = 'apostrophe';
/** Uploads above this size (bytes) are refused before they are read. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FORMATS = Object.freeze({
  xliff: {
    extension: 'xlf',
    contentType: 'application/x-xliff+xml'
  },
  html: {
    extension: 'html',
    contentType: 'text/html; charset=utf-8'
  }
});

/** An error of the export/import glue; `code` picks the message (`files_error_<code>`), `params` fill it. */
class FilesError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = 'FilesError';
    this.code = code;
    this.params = params;
  }
}

const LOCALE = /^[^\s:]+$/;

function formatReference({ docId, source, target }) {
  return `doc:${docId}:${source}:${target}`;
}

/** `{ docId, source, target }`, or null for anything else. */
function parseReference(reference) {
  const parts = String(reference || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'doc' || !parts.slice(1).every((p) => LOCALE.test(p))) {
    return null;
  }
  return {
    docId: parts[1],
    source: parts[2],
    target: parts[3]
  };
}

/**
 * The Supertext code the mapping resolves for a locale (`Languages.source` / `.target`);
 * a locale without one keeps its own name with `_` as `-`: a file may go to any translator,
 * so unmapped locales don't block the export.
 */
function languageCode(locale, languages, direction) {
  try {
    return direction === 'source'
      ? Languages.source(locale, mapping(languages))
      : Languages.target(locale, mapping(languages));
  } catch (e) {
    return String(locale).replace(/_/g, '-');
  }
}

/** The units as the SDK's segments: key = unit path. */
function segmentsOf(units) {
  return units.map((unit) => ({
    key: unit.path,
    text: unit.text,
    html: Boolean(unit.html)
  }));
}

const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');

/**
 * The file for one document: XLIFF with one job per target locale, or HTML for exactly one.
 * Throws FilesError `nothing_to_translate`, `no_targets` or `one_target`.
 * @returns {{ filename: string, contentType: string, content: string }}
 */
function buildExport({ docId, source, targets, format, units, languages = {} }) {
  const kind = FORMATS[format];
  if (!kind) {
    throw new FilesError('invalid_format');
  }
  const list = [ ...new Set((targets || []).filter((t) => t && t !== source)) ];
  if (!list.length) {
    throw new FilesError('no_targets');
  }
  if (format === 'html' && list.length !== 1) {
    throw new FilesError('one_target');
  }
  if (!units.length) {
    throw new FilesError('nothing_to_translate');
  }
  const segments = segmentsOf(units);
  const jobs = list.map((target) => ({
    plugin: PLUGIN,
    reference: formatReference({ docId, source, target }),
    sourceLanguage: languageCode(source, languages, 'source'),
    targetLanguage: languageCode(target, languages, 'target'),
    segments
  }));
  let content;
  try {
    content = format === 'html' ? TranslationFiles.exportHtml(jobs[0]) : TranslationFiles.exportXliff(jobs);
  } catch (e) {
    if (e instanceof TranslationFileError && e.code === 'invalid_job') {
      throw new FilesError('nothing_to_translate');
    }
    throw e;
  }
  const suffix = list.length === 1 ? `-${list[0]}` : '';
  return {
    filename: safeName(`${SHORT_NAME}-${docId}${suffix}.${kind.extension}`),
    contentType: kind.contentType,
    content
  };
}

const emptyCounts = () => ({
  ok: 0,
  source_changed: 0,
  untranslated: 0,
  invalid_markup: 0,
  missing: 0
});

/**
 * What to write for one job: `apply` maps unit paths to translations (`ok`, and
 * `source_changed` only with `includeChanged`); `counts` per SDK status.
 */
function planImport(file, units, includeChanged = false) {
  const counts = emptyCounts();
  const apply = new Map();
  for (const result of TranslationFiles.importTranslations(file, segmentsOf(units))) {
    counts[result.status]++;
    if (result.status === 'ok' || (result.status === 'source_changed' && includeChanged)) {
      apply.set(result.key, result.text);
    }
  }
  return {
    counts,
    apply
  };
}

/** Writes translations into units (their `apply`); returns how many were written. */
function applyTranslations(units, translations) {
  let written = 0;
  for (const unit of units) {
    if (translations.has(unit.path) && unit.apply(translations.get(unit.path))) {
      written++;
    }
  }
  return written;
}

/**
 * Imports an uploaded file. `read` errors (TranslationFileError: invalid_file,
 * missing_metadata, too_large) and a too large upload (FilesError too_large) are thrown;
 * everything else is reported per job.
 * @param {string} content the file
 * @param {object} options
 * @param {string[]} options.locales the site's locales
 * @param {boolean} [options.includeChanged] also write `source_changed` translations
 * @param {(ref) => Promise<{ title: string, units: Array }|null>} options.load the source
 *   document's current units (null: not found; throw FilesError for other problems)
 * @param {(ref, translations: Map, item) => Promise<void>} options.write writes the
 *   translations through the module's write-back (throw FilesError to report a problem)
 * @returns {Promise<Array>} one summary per job
 */
async function importFile(content, { locales, includeChanged = false, load, write }) {
  if (Buffer.byteLength(String(content), 'utf8') > MAX_UPLOAD_BYTES) {
    throw new FilesError('too_large');
  }
  const files = TranslationFiles.read(String(content));
  const out = [];
  for (const file of files) {
    const summary = {
      reference: file.reference,
      plugin: file.plugin,
      targetLanguage: file.targetLanguage,
      locale: null,
      title: null,
      counts: emptyCounts(),
      imported: 0,
      skippedChanged: 0,
      saved: false,
      error: null
    };
    out.push(summary);
    try {
      if (file.plugin !== PLUGIN) {
        throw new FilesError('other_system', { plugin: file.plugin });
      }
      const ref = parseReference(file.reference);
      if (!ref) {
        throw new FilesError('not_found');
      }
      summary.locale = ref.target;
      if (ref.source === ref.target) {
        throw new FilesError('not_found');
      }
      for (const locale of [ ref.source, ref.target ]) {
        if (!locales.includes(locale)) {
          throw new FilesError('no_language', { language: locale });
        }
      }
      const item = await load(ref);
      if (!item) {
        throw new FilesError('not_found');
      }
      summary.title = item.title || null;
      const plan = planImport(file, item.units, includeChanged);
      summary.counts = plan.counts;
      summary.skippedChanged = includeChanged ? 0 : plan.counts.source_changed;
      if (plan.apply.size) {
        await write(ref, plan.apply, item);
        summary.imported = plan.apply.size;
        summary.saved = true;
      }
    } catch (e) {
      if (!(e instanceof FilesError)) {
        throw e;
      }
      summary.error = {
        code: e.code,
        params: e.params
      };
    }
  }
  return out;
}

module.exports = {
  FORMATS,
  FilesError,
  MAX_UPLOAD_BYTES,
  PLUGIN,
  TranslationFileError,
  applyTranslations,
  buildExport,
  formatReference,
  importFile,
  languageCode,
  parseReference,
  planImport,
  segmentsOf
};
