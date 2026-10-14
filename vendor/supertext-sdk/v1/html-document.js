/**
 * Packs texts into the HTML document sent to Supertext and reads them back.
 *
 * Each segment becomes one `<div data-st-id="N">`. Supertext translates every
 * such element on its own, so a whole paragraph (with its inline formatting and
 * links) must be one segment: splitting it at formatting breaks the sentences.
 */
const HEAD = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n';
const TAIL = '</body></html>\n';
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** What goes between `<div data-st-id>` and `</div>` for a segment. */
export function packSegment(segment) {
    if (segment.html)
        return segment.text;
    return segment.text
        .replace(/\r\n?/g, '\n')
        .replace(/[&<>"']/g, (c) => ESCAPES[c])
        .replace(/\n/g, '<br>');
}
/** The HTML document for the segments; ids are the positions. */
export function build(segments) {
    let html = HEAD;
    segments.forEach((segment, index) => {
        html += `<div data-st-id="${index}">${packSegment(segment)}</div>\n`;
    });
    return html + TAIL;
}
// A start tag carrying data-st-id, on any element (Supertext may rewrite the div).
const START = /<([a-zA-Z][a-zA-Z0-9]*)(?=[\s>/])[^>]*?\sdata-st-id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))[^>]*>/g;
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text) {
    return text.replace(ENTITY, (match, entity) => {
        if (entity[0] !== '#')
            return NAMED[entity];
        const hex = entity[1] === 'x' || entity[1] === 'X';
        const n = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        // Only real code points; surrogates would produce broken strings.
        const valid = n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
        return valid ? String.fromCodePoint(n) : match;
    });
}
/** Plain text back from a translated segment: line breaks from <br>, tags removed, whitespace collapsed. */
function toPlainText(inner) {
    const text = inner
        .replace(/<br\s*\/?>/gi, '\u001e') // keep line breaks through the whitespace collapse
        .replace(/<[^>]*>/g, '')
        .replace(/[ \t\n\r\f]+/g, ' ')
        .replace(/ ?\u001e ?/g, '\n')
        .replace(/^ +| +$/g, '');
    // Decode last, so decoded markup (`&lt;b&gt;`) stays text.
    return decodeEntities(text);
}
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Reads the translated texts back, one per segment in the same order as
 * `build` got them (`null`: missing from the answer). The segments' `html`
 * flags decide how each is read; their texts are not used.
 */
export function parse(html, segments) {
    const out = segments.map(() => null);
    const start = new RegExp(START.source, 'g');
    let m;
    while ((m = start.exec(html))) {
        const tag = m[1].toLowerCase();
        const id = Number(m[2] ?? m[3] ?? m[4]);
        const contentStart = start.lastIndex;
        // Count nested elements with the same name to find the matching closing tag.
        const tags = new RegExp(`<(/?)${escapeRegExp(tag)}(?=[\\s>/])[^>]*?(/?)>`, 'gi');
        tags.lastIndex = contentStart;
        let depth = 1;
        let end = -1;
        let after = -1;
        let t;
        while ((t = tags.exec(html))) {
            if (t[1])
                depth--;
            else if (!t[2])
                depth++;
            if (depth === 0) {
                end = t.index;
                after = tags.lastIndex;
                break;
            }
        }
        if (end < 0)
            continue; // no closing tag: ignore, keep scanning after the start tag
        const segment = segments[id];
        if (segment && out[id] === null) {
            const inner = html.slice(contentStart, end);
            out[id] = segment.html ? inner.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '') : toPlainText(inner);
        }
        start.lastIndex = after;
    }
    return out;
}
/** The HTML document helpers as one object: `HtmlDocument.build(segments)`. */
export const HtmlDocument = Object.freeze({ build, parse });
