'use strict';

/**
 * Text units and the HTML document sent to Supertext. No Apostrophe dependencies.
 *
 * A unit is one piece of text Supertext translates on its own, as one `data-st-id`
 * element: a whole plain-text field, or one paragraph, heading, list item or table cell
 * of rich text with its formatting and links as inline tags.
 */

const { parse } = require('node-html-parser');

const ATTR = 'data-st-id';

/** Rich-text elements whose content is one unit when they contain no other such element. */
const BLOCKS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th', 'dt', 'dd',
  'figcaption', 'caption', 'pre', 'div', 'summary'
]);

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Plain text of an HTML fragment: `<br>` becomes a line break, entities are decoded. */
function htmlToText(html) {
  return parse(String(html).replace(/<br\s*\/?>/gi, '\n')).text;
}

const hasText = (html) => htmlToText(html).trim() !== '';

/**
 * A unit for a plain-text value. `write(text)` receives the translated text with the
 * value's leading and trailing whitespace restored; returns null for blank values.
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
    html: escapeHtml(trimmed).replace(/\r?\n/g, '<br>'),
    apply(translated) {
      const out = htmlToText(translated).trim();
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
      html: String(html).trim(),
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
      html: inner.trim(),
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

/** One HTML document with one `<div data-st-id="n">` per unit. */
function buildDocument(units) {
  const body = units.map((u, i) => `<div ${ATTR}="${i}">${u.html}</div>\n`).join('');
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n${body}</body></html>`;
}

/** Translated inner HTML per unit index. */
function parseDocument(html) {
  const out = new Map();
  for (const el of parse(String(html)).querySelectorAll(`[${ATTR}]`)) {
    const id = Number(el.getAttribute(ATTR));
    if (Number.isInteger(id)) {
      out.set(id, el.innerHTML);
    }
  }
  return out;
}

/**
 * Splits units into chunks whose document stays below `limit` characters, so a very
 * long document goes to Supertext in several requests.
 */
function chunks(units, limit = 900000) {
  const out = [];
  let current = [];
  let size = 0;
  for (const unit of units) {
    const length = unit.html.length + 40;
    if (current.length && size + length > limit) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(unit);
    size += length;
  }
  if (current.length) {
    out.push(current);
  }
  return out;
}

module.exports = {
  ATTR,
  buildDocument,
  chunks,
  escapeHtml,
  htmlToText,
  parseDocument,
  richTextUnits,
  textUnit
};
