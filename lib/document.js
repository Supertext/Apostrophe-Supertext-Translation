'use strict';

/**
 * Text units: the pieces of a document Supertext translates on its own (one SDK segment,
 * one `data-st-id` element each): a whole plain-text field, or one paragraph, heading,
 * list item or table cell of rich text with its formatting and links as inline tags.
 * No Apostrophe dependencies.
 */

const { parse } = require('node-html-parser');

/** Rich-text elements whose content is one unit when they contain no other such element. */
const BLOCKS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th', 'dt', 'dd',
  'figcaption', 'caption', 'pre', 'div', 'summary'
]);

/** Plain text of an HTML fragment: `<br>` becomes a line break, entities are decoded. */
function htmlToText(html) {
  return parse(String(html).replace(/<br\s*\/?>/gi, '\n')).text;
}

const hasText = (html) => htmlToText(html).trim() !== '';

/**
 * A unit for a plain-text value, sent as plain text (the SDK escapes it and keeps line
 * breaks). `write(text)` receives the translation with the value's leading and trailing
 * whitespace restored; returns null for blank values.
 */
function textUnit(value, write, path) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const start = text.indexOf(trimmed);
  const lead = text.slice(0, start);
  const trail = text.slice(start + trimmed.length);
  return {
    path,
    text: trimmed,
    html: false,
    apply(translated) {
      const out = String(translated).trim();
      if (out === '') {
        return false;
      }
      write(lead + out + trail);
      return true;
    }
  };
}

/**
 * Units for a rich-text (HTML) value: one per innermost block element with text.
 * `finish()` returns the HTML with the translations written in (call after applying).
 */
function richTextUnits(html, write, path) {
  const root = parse(String(html ?? ''), { comment: true });
  const blocks = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) {
        continue;
      }
      const tag = child.rawTagName ? child.rawTagName.toLowerCase() : '';
      if (BLOCKS.has(tag) && !child.querySelector([ ...BLOCKS ].join(','))) {
        blocks.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  // Text outside any block element (rare in Apostrophe's editor): translate the whole value.
  const looseText = root.childNodes.some((n) => n.nodeType === 3 && n.text.trim() !== '');
  if (looseText || blocks.length === 0) {
    if (!hasText(html)) {
      return [];
    }
    return [ {
      path,
      text: String(html).trim(),
      html: true,
      apply(translated) {
        if (!hasText(translated)) {
          return false;
        }
        write(translated.trim());
        return true;
      }
    } ];
  }
  const units = [];
  let pending = 0;
  blocks.forEach((block, i) => {
    const inner = block.innerHTML;
    if (!hasText(inner)) {
      return;
    }
    pending++;
    units.push({
      path: `${path}[${i}]`,
      text: inner.trim(),
      html: true,
      apply(translated) {
        if (!hasText(translated)) {
          return false;
        }
        block.set_content(translated.trim());
        // Write once all blocks of this value are in; partial results are written too.
        write(root.toString());
        return true;
      }
    });
  });
  return pending ? units : [];
}

module.exports = { htmlToText, richTextUnits, textUnit };
