'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { textUnit, richTextUnits, buildDocument, parseDocument, chunks } = require('../lib/document');

test('plain text keeps surrounding whitespace and line breaks', () => {
  let out;
  const unit = textUnit('  Line one\nLine <two> & more ', (v) => {
    out = v;
  }, 'summary');
  assert.equal(unit.html, 'Line one<br>Line &lt;two&gt; &amp; more');
  assert.equal(unit.apply('Zeile eins<br>Zeile &lt;zwei&gt; &amp; mehr'), true);
  assert.equal(out, '  Zeile eins\nZeile <zwei> & mehr ');
  assert.equal(textUnit('   ', () => {}, 'x'), null);
});

test('rich text: one unit per paragraph, heading and list item', () => {
  let out;
  const html = '<h2>Title</h2><p>Made in <strong>Bern</strong>, see <a href="https://x.ch">site</a>.</p><ul><li>One</li><li>Two</li></ul><p> </p>';
  const units = richTextUnits(html, (v) => {
    out = v;
  }, 'main');
  assert.deepEqual(units.map((u) => u.html), [ 'Title', 'Made in <strong>Bern</strong>, see <a href="https://x.ch">site</a>.', 'One', 'Two' ]);
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

test('document round trip and chunks', () => {
  const units = [ { html: 'A' }, { html: 'B &amp; C' } ];
  const doc = buildDocument(units);
  assert.match(doc, /<div data-st-id="1">B &amp; C<\/div>/);
  const back = parseDocument(doc.replace('>A<', '>Ä<'));
  assert.equal(back.get(0), 'Ä');
  assert.equal(back.get(1), 'B &amp; C');
  assert.equal(chunks([ { html: 'x'.repeat(60) }, { html: 'y'.repeat(60) } ], 120).length, 2);
});
