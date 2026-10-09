'use strict';
// Every UI language has the same keys, placeholders and URLs as English.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const ns of [ 'supertext', 'apostrophe' ]) {
  const dir = path.join(__dirname, '..', 'i18n', ns);
  const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
  for (const lang of [ 'de', 'fr', 'it' ]) {
    test(`${ns}/${lang} matches en`, () => {
      const other = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
      assert.deepEqual(Object.keys(other).sort(), Object.keys(en).sort());
      for (const [ key, value ] of Object.entries(en)) {
        const tokens = (s) => (s.match(/\{\{\s*\w+\s*\}\}|https?:\/\/\S+|SUPERTEXT_API_KEY|apiKey/g) || []).sort();
        assert.deepEqual(tokens(other[key]), tokens(value), `${lang}:${key}`);
      }
    });
  }
}
