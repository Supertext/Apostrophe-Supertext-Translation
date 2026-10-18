'use strict';
// Translation files (lib/files.js): export with the collector's keys and the mapping, import
// through the module's write-back, the glue's errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectUnits } = require('../lib/collect');
const {
  FilesError, MAX_UPLOAD_BYTES, PLUGIN, TranslationFileError, applyTranslations, buildExport,
  formatReference, importFile, parseReference
} = require('../lib/files');

const schema = [
  { name: 'title', type: 'string' },
  { name: 'main', type: 'area' }
];
const doc = () => ({
  title: 'Hello',
  main: { items: [ { type: '@apostrophecms/rich-text', content: '<p>One <b>bold</b></p><p>Two</p>' } ] }
});
const unitsOf = (d) => collectUnits(d, schema, () => null);

// Puts a <target> into the trans-unit `id` of an exported XLIFF file.
const withTarget = (xliff, id, target) => xliff.replace(
  new RegExp(`(<trans-unit id="${id.replace(/[[\]().]/g, '\\$&')}"[^>]*>\\s*<source>[\\s\\S]*?</source>)`),
  `$1<target>${target}</target>`
);

const exportXliff = (d = doc(), targets = [ 'de' ]) => buildExport({
  docId: 'ck1', source: 'en', targets, format: 'xliff', units: unitsOf(d)
}).content;

// A fake site: one document `ck1` in `en`, written translations recorded.
function site({ current = doc(), locales = [ 'en', 'de', 'fr' ], exists = false } = {}) {
  const written = [];
  return {
    written,
    options: (extra = {}) => ({
      locales,
      load: async (ref) => (ref.docId === 'ck1' && ref.source === 'en' ? { title: current.title, units: unitsOf(current) } : null),
      write: async (ref, translations) => {
        if (exists && !extra.overwrite) {
          throw new FilesError('exists', { language: ref.target });
        }
        const copy = structuredClone(current);
        applyTranslations(unitsOf(copy), translations);
        written.push({ ref, translations, doc: copy });
      },
      ...extra
    })
  };
}

test('reference: format and parse round trip, anything else is null', () => {
  const ref = { docId: 'clx3k2abc', source: 'en', target: 'de-CH' };
  assert.equal(formatReference(ref), 'doc:clx3k2abc:en:de-CH');
  assert.deepEqual(parseReference(formatReference(ref)), ref);
  for (const bad of [ '', 'page:12', 'doc:a:en', 'doc:a:en:de:x', 'doc::en:de', 'doc:a b:en:de', null ]) {
    assert.equal(parseReference(bad), null, String(bad));
  }
});

test('export: the collector\'s keys, the mapping, unmapped locales with - and the file name', () => {
  const file = buildExport({
    docId: 'ck1',
    source: 'en',
    targets: [ 'de', 'xx_YY' ],
    format: 'xliff',
    units: unitsOf(doc()),
    languages: { de: { code: 'de-CH' } }
  });
  assert.equal(file.filename, 'apostrophe-ck1.xlf');
  assert.equal(file.contentType, 'application/x-xliff+xml');
  const { TranslationFiles } = require('../vendor/supertext-sdk/index.js');
  const jobs = TranslationFiles.read(file.content);
  assert.deepEqual(jobs.map((j) => [ j.plugin, j.reference, j.sourceLanguage, j.targetLanguage ]), [
    [ PLUGIN, 'doc:ck1:en:de', 'en', 'de-CH' ],
    [ PLUGIN, 'doc:ck1:en:xx_YY', 'en', 'xx-YY' ]
  ]);
  assert.deepEqual(jobs[0].units.map((u) => u.key), unitsOf(doc()).map((u) => u.path));
  assert.deepEqual(jobs[0].units.map((u) => u.key), [ 'title', 'main.0.content[0]', 'main.0.content[1]' ]);
});

test('export: HTML with exactly one target, the SDK default without a mapping', () => {
  const file = buildExport({ docId: 'ck1', source: 'en', targets: [ 'de' ], format: 'html', units: unitsOf(doc()) });
  assert.equal(file.filename, 'apostrophe-ck1-de.html');
  assert.equal(file.contentType, 'text/html; charset=utf-8');
  assert.match(file.content, /<meta name="supertext:target-language" content="de-DE">/);
  assert.throws(() => buildExport({ docId: 'ck1', source: 'en', targets: [ 'de', 'fr' ], format: 'html', units: unitsOf(doc()) }), { code: 'one_target' });
  assert.throws(() => buildExport({ docId: 'ck1', source: 'en', targets: [ 'en' ], format: 'xliff', units: unitsOf(doc()) }), { code: 'no_targets' });
  assert.throws(() => buildExport({ docId: 'ck1', source: 'en', targets: [ 'de' ], format: 'xliff', units: [] }), { code: 'nothing_to_translate' });
});

test('import: ok written through the write-back; untranslated, invalid and missing not', async () => {
  let xliff = exportXliff();
  xliff = withTarget(xliff, 'title', 'Hallo');
  // The translation drops the <ept> of the source's <b>: invalid markup.
  xliff = withTarget(xliff, 'main.0.content[0]', 'Eins <bpt id="1">&lt;b&gt;</bpt>fett');
  const current = doc();
  current.main.items.push({ type: '@apostrophecms/rich-text', content: '<p>Added later</p>' });
  const s = site({ current });
  const [ job ] = await importFile(xliff, s.options());
  assert.equal(job.error, null);
  assert.equal(job.title, 'Hello');
  assert.equal(job.locale, 'de');
  assert.deepEqual(job.counts, { ok: 1, source_changed: 0, untranslated: 1, invalid_markup: 1, missing: 1 });
  assert.equal(job.imported, 1);
  assert.equal(job.saved, true);
  assert.equal(s.written.length, 1);
  assert.deepEqual([ ...s.written[0].translations.keys() ], [ 'title' ]);
  assert.equal(s.written[0].doc.title, 'Hallo');
  assert.equal(s.written[0].doc.main.items[0].content, '<p>One <b>bold</b></p><p>Two</p>');
});

test('import: rich text written back, markup from the source', async () => {
  const xliff = withTarget(exportXliff(), 'main.0.content[0]', 'Eins <bpt id="1">&lt;i onclick=x&gt;</bpt>fett<ept id="1">&lt;/i&gt;</ept>');
  const s = site();
  const [ job ] = await importFile(xliff, s.options());
  assert.equal(job.counts.ok, 1);
  assert.equal(s.written[0].doc.main.items[0].content, '<p>Eins <b>fett</b></p><p>Two</p>');
});

test('import: source_changed only with includeChanged', async () => {
  const xliff = withTarget(withTarget(exportXliff(), 'title', 'Hallo'), 'main.0.content[1]', 'Zwei');
  const current = doc();
  current.title = 'Hello world';
  let s = site({ current });
  let [ job ] = await importFile(xliff, s.options());
  assert.equal(job.counts.source_changed, 1);
  assert.equal(job.skippedChanged, 1);
  assert.deepEqual([ ...s.written[0].translations.keys() ], [ 'main.0.content[1]' ]);
  s = site({ current });
  [ job ] = await importFile(xliff, s.options({ includeChanged: true }));
  assert.equal(job.skippedChanged, 0);
  assert.equal(job.imported, 2);
  assert.equal(s.written[0].doc.title, 'Hallo');
});

test('import: an HTML file imported unchanged writes the source text back', async () => {
  const html = buildExport({ docId: 'ck1', source: 'en', targets: [ 'de' ], format: 'html', units: unitsOf(doc()) }).content;
  const s = site();
  const [ job ] = await importFile(html.replace('>Hello<', '>Hallo<'), s.options());
  assert.equal(job.counts.ok, 3);
  assert.equal(s.written[0].doc.title, 'Hallo');
});

test('import: nothing written when nothing is accepted', async () => {
  const s = site();
  const [ job ] = await importFile(exportXliff(), s.options());
  assert.equal(job.counts.untranslated, 3);
  assert.equal(job.saved, false);
  assert.equal(s.written.length, 0);
});

test('import: another plugin, unknown reference, missing language, missing document, existing draft', async () => {
  const base = withTarget(exportXliff(), 'title', 'Hallo');
  const cases = [
    [ base.replace(`product-name="${PLUGIN}"`, 'product-name="Contao-Supertext-Translation"'), 'other_system', { plugin: 'Contao-Supertext-Translation' } ],
    [ base.replace('original="doc:ck1:en:de"', 'original="page:12"'), 'not_found', {} ],
    [ base.replace('original="doc:ck1:en:de"', 'original="doc:ck1:en:it"'), 'no_language', { language: 'it' } ],
    [ base.replace('original="doc:ck1:en:de"', 'original="doc:gone:en:de"'), 'not_found', {} ]
  ];
  for (const [ content, code, params ] of cases) {
    const s = site();
    const [ job ] = await importFile(content, s.options());
    assert.deepEqual(job.error, { code, params }, code);
    assert.equal(s.written.length, 0);
  }
  const existing = site({ exists: true });
  let [ job ] = await importFile(base, existing.options());
  assert.deepEqual(job.error, { code: 'exists', params: { language: 'de' } });
  assert.equal(job.saved, false);
  [ job ] = await importFile(base, existing.options({ overwrite: true }));
  assert.equal(job.saved, true);
});

test('import: several jobs in one XLIFF file', async () => {
  let xliff = exportXliff(doc(), [ 'de', 'fr' ]);
  xliff = xliff.replace(/(<file original="doc:ck1:en:fr"[\s\S]*?<source>Hello<\/source>)/, '$1<target>Bonjour</target>');
  const s = site();
  const jobs = await importFile(xliff, s.options());
  assert.deepEqual(jobs.map((j) => [ j.locale, j.imported ]), [ [ 'de', 0 ], [ 'fr', 1 ] ]);
  assert.equal(s.written[0].ref.target, 'fr');
});

test('import: too large refused before reading, read errors thrown with the SDK codes', async () => {
  await assert.rejects(importFile('x'.repeat(MAX_UPLOAD_BYTES + 1), site().options()), (e) => e instanceof FilesError && e.code === 'too_large');
  await assert.rejects(importFile('hello', site().options()), (e) => e instanceof TranslationFileError && e.code === 'invalid_file');
  await assert.rejects(importFile('<!DOCTYPE html><html><body><p>x</p></body></html>', site().options()), (e) => e instanceof TranslationFileError && e.code === 'missing_metadata');
});
