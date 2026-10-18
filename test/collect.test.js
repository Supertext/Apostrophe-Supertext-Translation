'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectUnits } = require('../lib/collect');
const { translateUnits, languageStatus, mapping, mergeLanguages, politeness, reviewFor, sourceCode, targetCode, targetOrNull, validateLanguages } = require('../lib/translate');
const { SupertextError } = require('../lib/sdk');

const schema = [
  { name: 'title', type: 'string' },
  { name: 'slug', type: 'slug' },
  { name: 'code', type: 'string', translate: false },
  { name: 'summary', type: 'string', textarea: true },
  { name: 'color', type: 'select' },
  { name: 'main', type: 'area' },
  { name: 'faq', type: 'array', schema: [ { name: 'q', type: 'string' }, { name: 'url', type: 'url' } ] },
  { name: 'seo', type: 'object', schema: [ { name: 'description', type: 'string' } ] }
];
const widgetSchemas = {
  'card': [ { name: 'heading', type: 'string' }, { name: 'inner', type: 'area' } ]
};
const doc = () => ({
  title: 'Hello',
  slug: 'hello',
  code: 'ABC',
  summary: 'Short',
  color: 'red',
  main: {
    metaType: 'area',
    items: [
      { type: '@apostrophecms/rich-text', content: '<p>One</p><p>Two</p>' },
      { type: 'card', heading: 'Card', inner: { items: [ { type: '@apostrophecms/rich-text', content: '<p>Inner</p>' } ] } },
      { type: '@apostrophecms/html', code: '<b>raw</b>' },
      { type: '@apostrophecms/image', _image: [] }
    ]
  },
  faq: [ { q: 'Why?', url: 'https://x' } ],
  seo: { description: 'Desc' }
});

test('collects the translatable fields only', () => {
  const units = collectUnits(doc(), schema, (t) => widgetSchemas[t] || null, { skipWidgets: [ '@apostrophecms/html' ] });
  assert.deepEqual(units.map((u) => u.path), [
    'title', 'summary', 'main.0.content[0]', 'main.0.content[1]', 'main.1.heading', 'main.1.inner.0.content[0]', 'faq.0.q', 'seo.description'
  ]);
});

test('translates and writes back through a client', async () => {
  const d = doc();
  const units = collectUnits(d, schema, (t) => widgetSchemas[t] || null);
  const fakeClient = {
    async translateTexts(segments, target, { sourceLang, politeness: p }) {
      assert.ok(segments instanceof Map);
      assert.equal(target, 'de-CH');
      assert.equal(sourceLang, 'en');
      assert.equal(p, 'more');
      assert.deepEqual(segments.get('0'), { text: 'Hello', html: false });
      assert.deepEqual(segments.get('2'), { text: 'One', html: true });
      return new Map([ ...segments ].map(([ key, s ]) => [ key, `DE ${s.text}` ]));
    }
  };
  const missing = await translateUnits(fakeClient, units, 'en', 'de', { de: { code: 'de-CH', politeness: 'more' } });
  assert.deepEqual(missing, []);
  assert.equal(d.title, 'DE Hello');
  assert.equal(d.code, 'ABC');
  assert.equal(d.main.items[0].content, '<p>DE One</p><p>DE Two</p>');
  assert.equal(d.main.items[1].inner.items[0].content, '<p>DE Inner</p>');
  assert.equal(d.faq[0].url, 'https://x');
});

test('mapping: the languages option, long and short form', () => {
  assert.deepEqual(mapping({ de: { code: 'de-CH' }, fr: 'fr-CH', it: { politeness: 'more' } }), { de: 'de-CH', fr: 'fr-CH' });
  assert.deepEqual(mapping(), {});
});

test('target: the mapping wins, else an exact match, else the SDK default, else unsupported_language', () => {
  assert.equal(targetCode('de', { de: { code: 'de-CH' } }), 'de-CH');
  assert.equal(targetCode('ch', { ch: { code: 'de-CH' } }), 'de-CH');
  assert.equal(targetCode('de-ch'), 'de-CH');
  assert.equal(targetCode('de_CH'), 'de-CH');
  assert.equal(targetCode('zh-hant'), 'zh-Hant');
  assert.equal(targetCode('es'), 'es');
  assert.equal(targetCode('nl'), 'nl');
  // The SDK's defaults where they are obvious.
  assert.equal(targetCode('de'), 'de-DE');
  assert.equal(targetCode('en'), 'en-US');
  assert.equal(targetCode('fr'), 'fr-FR');
  assert.equal(targetCode('es-ES'), 'es');
  assert.equal(targetCode('zh'), 'zh-Hans');
  // Nothing else is guessed.
  for (const locale of [ 'xx', 'de-XX', 'en-IE', 'de-LI', 'gsw', 'sr-RS' ]) {
    assert.throws(() => targetCode(locale), (e) => e instanceof SupertextError && e.code === 'unsupported_language', locale);
  }
  assert.equal(targetOrNull('en-IE'), null);
});

test('mergeLanguages: the module option wins per locale', () => {
  const merged = mergeLanguages(
    { de: { code: 'de-DE', politeness: 'less' }, fr: { code: 'fr-CH', politeness: 'default' } },
    { de: { code: 'de-CH', politeness: 'more' }, it: 'it-CH' }
  );
  assert.deepEqual(merged.languages, {
    de: { code: 'de-CH', politeness: 'more' },
    fr: { code: 'fr-CH', politeness: 'default' },
    it: 'it-CH'
  });
  assert.deepEqual(merged.overridden.sort(), [ 'de', 'it' ]);
  assert.deepEqual(mergeLanguages(undefined, undefined), { languages: {}, overridden: [], reviewOverridden: [] });
});

test('mergeLanguages: Translation review from the screen, the module option wins', () => {
  const merged = mergeLanguages(
    { de: { code: 'de-DE', review: true }, fr: { code: 'fr-CH', review: true }, it: { code: '', review: true }, nl: { code: '', review: false } },
    { de: { code: 'de-CH' }, fr: { review: false }, es: { review: true } }
  );
  assert.deepEqual(merged.languages, {
    // The option sets the code; review stays the screen's.
    de: { code: 'de-CH', review: true },
    fr: { code: 'fr-CH', review: false },
    // Review without a Supertext language of its own (the default code applies).
    it: { code: '', review: true },
    es: { review: true }
  });
  assert.deepEqual(merged.overridden, [ 'de' ]);
  assert.deepEqual(merged.reviewOverridden.sort(), [ 'es', 'fr' ]);
  assert.equal(reviewFor('de', merged.languages), true);
  assert.equal(reviewFor('fr', merged.languages), false);
  assert.equal(reviewFor('it', merged.languages), true);
  assert.equal(reviewFor('nl', merged.languages), false);
  assert.equal(reviewFor('xx', merged.languages), false);
  assert.equal(targetCode('it', merged.languages), 'it-IT');
});

test('validateLanguages: only the site\'s locales and Supertext\'s target codes', () => {
  const locales = [ 'en', 'de', 'gsw' ];
  assert.deepEqual(validateLanguages({
    en: { code: 'en-GB', politeness: 'more' },
    de: { code: 'de-CH', politeness: 'more' },
    gsw: { code: '' }
  }, locales), {
    // English has no formal/informal address: stored as default.
    en: { code: 'en-GB', politeness: 'default', review: false },
    de: { code: 'de-CH', politeness: 'more', review: false }
  });
  // Translation review is kept, also without a chosen code.
  assert.deepEqual(validateLanguages({ de: { code: 'de-CH', review: true }, gsw: { code: '', review: true }, en: { code: '', review: false } }, locales), {
    de: { code: 'de-CH', politeness: 'default', review: true },
    gsw: { code: '', politeness: 'default', review: true }
  });
  for (const bad of [ { de: { code: 'de' } }, { xx: { code: 'de-CH' } }, { de: { code: 'de-CH', politeness: 'very' } }, { de: { code: 'de-CH', review: 'yes' } } ]) {
    assert.throws(() => validateLanguages(bad, locales), (e) => Array.isArray(e.invalid) && e.invalid.length === 1);
  }
  assert.throws(() => validateLanguages([], locales));
});

test('source: one mapping for both directions', () => {
  assert.equal(sourceCode('en'), 'en');
  assert.equal(sourceCode('de', { de: { code: 'de-CH' } }), 'de');
  assert.equal(sourceCode('en-US'), 'en');
  assert.throws(() => sourceCode('xx'), (e) => e.code === 'unsupported_language');
});

test('politeness only where Supertext offers it', () => {
  assert.equal(politeness('de', { de: { code: 'de-CH', politeness: 'less' } }), 'less');
  assert.equal(politeness('fr', { fr: { code: 'fr-CH' } }), 'default');
  // English has no formal/informal address: not sent.
  assert.equal(politeness('en', { en: { code: 'en-US', politeness: 'more' } }), 'default');
  assert.equal(politeness('xx', { xx: { politeness: 'more' } }), 'default');
});

test('languageStatus for the status screen', () => {
  const languages = { de: { code: 'de-CH', politeness: 'more' }, en: { code: 'en-GB', politeness: 'more' }, ko: { code: 'ko-KR' } };
  assert.deepEqual(languageStatus('de', languages), {
    locale: 'de', code: 'de-CH', mapped: true, supported: true, known: true, defaulted: false,
    suggestion: 'de-DE', source: 'de', politeness: 'more', politenessAvailable: true, politenessIgnored: false, review: false
  });
  assert.equal(languageStatus('de', { de: { code: 'de-CH', review: true } }).review, true);
  const en = languageStatus('en', languages);
  assert.equal(en.politeness, 'default');
  assert.equal(en.politenessIgnored, true);
  const fr = languageStatus('fr', languages);
  assert.equal(fr.supported, true);
  assert.equal(fr.code, 'fr-FR');
  assert.equal(fr.defaulted, true);
  assert.equal(fr.source, 'fr');
  const ie = languageStatus('en-IE', languages);
  assert.equal(ie.supported, false);
  assert.equal(ie.code, null);
  assert.equal(ie.suggestion, null);
  assert.equal(ie.source, 'en');
  // A mapped code is sent as it is, but flagged when Supertext doesn't list it.
  assert.equal(languageStatus('ko', languages).known, false);
});

test('an unsupported locale sends nothing', async () => {
  let called = false;
  const client = { translateTexts: async () => { called = true; return new Map(); } };
  const units = [ { text: 'Hello', html: false, path: 'title', apply: () => true } ];
  await assert.rejects(translateUnits(client, units, 'en', 'en-IE'), (e) => e.code === 'unsupported_language');
  await assert.rejects(translateUnits(client, units, 'xx', 'de', { de: 'de-CH' }), (e) => e.code === 'unsupported_language');
  assert.equal(called, false);
});

test('codes and politeness passed to the client', async () => {
  let args;
  const client = { translateTexts: async (...a) => { args = a; return new Map([ [ '0', 'Hallo' ] ]); } };
  const units = [ { text: 'Hello', html: false, path: 'title', apply: () => true } ];
  await translateUnits(client, units, 'en', 'de', { de: { code: 'de-CH', politeness: 'more' }, en: { code: 'en-GB', politeness: 'less' } });
  assert.equal(args[1], 'de-CH');
  assert.deepEqual(args[2], { sourceLang: 'en', politeness: 'more' });
});
