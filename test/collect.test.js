'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectUnits } = require('../lib/collect');
const { translateUnits, languageCode, politeness, sourceCode } = require('../lib/translate');

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

test('language mapping', () => {
  assert.equal(politeness('de', { de: { politeness: 'less' } }), 'less');
  assert.equal(politeness('fr'), 'default');
});

test('source: bare language stays bare', () => {
  assert.equal(sourceCode('en'), 'en');
});

test('source: regional code becomes the bare language', () => {
  assert.equal(sourceCode('pt-BR'), 'pt');
  assert.equal(sourceCode('en_GB'), 'en');
  assert.equal(sourceCode(languageCode('DE-ch')), 'de');
});

test('target: bare language gets its default region', () => {
  assert.equal(languageCode('de'), 'de-DE');
  assert.equal(languageCode('en'), 'en-US');
  assert.equal(languageCode('sl'), 'sl-SI');
  assert.equal(languageCode('ZH'), 'zh-CN');
});

test('target: regional code is kept and normalized', () => {
  assert.equal(languageCode('de-CH'), 'de-CH');
  assert.equal(languageCode('de_CH'), 'de-CH');
  assert.equal(languageCode('fr-ch'), 'fr-CH');
  assert.equal(languageCode('zh-hant'), 'zh-Hant');
  assert.equal(languageCode('es-419'), 'es-419');
});

test('target: configured code wins (source uses its language)', () => {
  assert.equal(languageCode('de', { de: { code: 'de-CH' } }), 'de-CH');
  assert.equal(languageCode('ch', { ch: { code: 'de_ch' } }), 'de-CH');
  assert.equal(sourceCode(languageCode('ch', { ch: { code: 'de-CH' } })), 'de');
});

test('target: unknown bare code is sent unchanged', () => {
  assert.equal(languageCode('xx'), 'xx');
});
