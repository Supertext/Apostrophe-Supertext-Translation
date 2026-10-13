'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { textUnit, richTextUnits } = require('../lib/document');

test('plain text keeps surrounding whitespace and line breaks', () => {
  let out;
  const unit = textUnit('  Line one\nLine <two> & more ', (v) => {
    out = v;
  }, 'summary');
  assert.equal(unit.text, 'Line one\nLine <two> & more');
  assert.equal(unit.html, false);
  assert.equal(unit.apply('Zeile eins\nZeile <zwei> & mehr'), true);
  assert.equal(out, '  Zeile eins\nZeile <zwei> & mehr ');
  assert.equal(textUnit('   ', () => {}, 'x'), null);
});

test('rich text: one unit per paragraph, heading and list item', () => {
  let out;
  const html = '<h2>Title</h2><p>Made in <strong>Bern</strong>, see <a href="https://x.ch">site</a>.</p><ul><li>One</li><li>Two</li></ul><p> </p>';
  const units = richTextUnits(html, (v) => {
    out = v;
  }, 'main');
  assert.ok(units.every((u) => u.html === true));
  assert.deepEqual(units.map((u) => u.text), [ 'Title', 'Made in <strong>Bern</strong>, see <a href="https://x.ch">site</a>.', 'One', 'Two' ]);
  units[0].apply('Titel');
  units[1].apply('Hergestellt in <strong>Bern</strong>, siehe <a href="https://x.ch">Website</a>.');
  units[2].apply('Eins');
  units[3].apply('Zwei');
  assert.equal(out, '<h2>Titel</h2><p>Hergestellt in <strong>Bern</strong>, siehe <a href="https://x.ch">Website</a>.</p><ul><li>Eins</li><li>Zwei</li></ul><p> </p>');
});

test('rich text with loose text is one unit', () => {
  let out;
  const units = richTextUnits('Hello <b>world</b>', (v) => {
    out = v;
  }, 'x');
  assert.equal(units.length, 1);
  units[0].apply('Hallo <b>Welt</b>');
  assert.equal(out, 'Hallo <b>Welt</b>');
});
