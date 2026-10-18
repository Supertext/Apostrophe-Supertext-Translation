/**
 * Translation files: export segments as XLIFF 1.2 or HTML, translate them outside
 * the API (a CAT tool, a translator, Supertext's web app), import them again
 * (spec/translation-file.json, integration guide → Translation files).
 *
 * Not tied to an API version: nothing here talks to the API. The HTML file is the
 * same document `HtmlDocument.build` makes, plus metadata in its head.
 *
 * Imported files are untrusted. `read` refuses DTDs and files over
 * MAX_FILE_CHARACTERS; `importTranslations` takes markup only from the
 * integration's current source, never from the file.
 */
import { decodeEntities, packSegment, readSegments, toPlainText } from './v1/html-document.js';
export class TranslationFileError extends Error {
    code;
    name = 'TranslationFileError';
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Larger files are refused by `read` (counted as the language's string length). */
export const MAX_FILE_CHARACTERS = 10_000_000;
const fail = (code, message) => {
    throw new TranslationFileError(code, message);
};
const isBlank = (text) => /^[ \t\r\n\f]*$/.test(text);
/** FNV-1a (32 bit) of the packed segment's UTF-8 bytes, 8 lowercase hex digits. Detects changed sources; not a security check. */
export function checksum(segment) {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(packSegment(segment))) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
const TAG = /<(?:!--[\s\S]*?-->|\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>|([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>)/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function tokenize(html) {
    const tokens = [];
    const tag = new RegExp(TAG.source, 'g');
    let last = 0;
    let m;
    while ((m = tag.exec(html))) {
        if (m.index > last)
            tokens.push({ kind: 'text', text: html.slice(last, m.index) });
        const raw = m[0];
        if (raw.startsWith('<!--'))
            tokens.push({ kind: 'comment', raw });
        else if (m[1] !== undefined)
            tokens.push({ kind: 'end', name: m[1].toLowerCase(), raw });
        else {
            const attrs = [];
            const attr = new RegExp(ATTR.source, 'g');
            let a;
            while ((a = attr.exec(m[3] ?? '')))
                attrs.push([a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? null]);
            tokens.push({ kind: 'start', name: m[2].toLowerCase(), raw, selfClosing: m[4] === '/', attrs });
        }
        last = tag.lastIndex;
    }
    if (last < html.length)
        tokens.push({ kind: 'text', text: html.slice(last) });
    return tokens;
}
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
const KNOWN_ENTITY = /^(amp|lt|gt|quot|apos|nbsp|#[xX][0-9a-fA-F]+|#[0-9]+)$/;
const isXmlChar = (cp) => cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
/**
 * The inline codes of an HTML segment (integration guide → Translation files):
 * a start tag with its matching end tag becomes bpt/ept, everything else
 * (void and self-closing tags, unmatched tags, comments, entities XML can't hold)
 * a ph. Ids count from 1 in order of appearance; an ept has its bpt's id.
 * Text has the known entities decoded.
 */
function segmentParts(html) {
    const tokens = tokenize(html);
    const endOf = new Map();
    const startOf = new Map();
    const stack = [];
    tokens.forEach((t, i) => {
        if (t.kind === 'start' && !t.selfClosing && !VOID.has(t.name))
            stack.push({ name: t.name, index: i });
        else if (t.kind === 'end' && stack.length > 0 && stack[stack.length - 1].name === t.name) {
            const start = stack.pop().index;
            endOf.set(start, i);
            startOf.set(i, start);
        }
    });
    const parts = [];
    const ids = new Map();
    let next = 1;
    const text = (s) => {
        if (typeof parts[parts.length - 1] === 'string')
            parts[parts.length - 1] += s;
        else
            parts.push(s);
    };
    tokens.forEach((t, i) => {
        if (t.kind === 'text') {
            let last = 0;
            for (const m of t.text.matchAll(ENTITY)) {
                if (m.index > last)
                    text(t.text.slice(last, m.index));
                const decoded = KNOWN_ENTITY.test(m[1]) ? decodeEntities(m[0]) : m[0];
                const cp = decoded.codePointAt(0);
                if (decoded !== m[0] && isXmlChar(cp))
                    text(decoded);
                else
                    parts.push({ code: 'ph', id: next++, raw: m[0] });
                last = m.index + m[0].length;
            }
            if (last < t.text.length)
                text(t.text.slice(last));
        }
        else if (t.kind === 'start' && endOf.has(i)) {
            const id = next++;
            ids.set(i, id);
            parts.push({ code: 'bpt', id, raw: t.raw });
        }
        else if (t.kind === 'end' && startOf.has(i)) {
            parts.push({ code: 'ept', id: ids.get(startOf.get(i)), raw: t.raw });
        }
        else {
            parts.push({ code: 'ph', id: next++, raw: t.raw });
        }
    });
    return parts;
}
// ---------------------------------------------------------------------------
// Export
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const xmlText = (s) => s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
const xmlAttr = (s) => xmlText(s).replace(/"/g, '&quot;');
const htmlAttr = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const CONTROL = /[\u0000-\u001F\u007F]/;
function checkJob(job) {
    for (const field of ['plugin', 'reference', 'sourceLanguage', 'targetLanguage']) {
        const value = job[field];
        if (typeof value !== 'string' || value.trim() === '' || CONTROL.test(value))
            fail('invalid_job', `${field} must be a non-empty string without control characters`);
    }
    const keys = new Set();
    for (const segment of job.segments) {
        if (typeof segment.key !== 'string' || segment.key === '' || CONTROL.test(segment.key))
            fail('invalid_job', 'segment keys must be non-empty strings without control characters');
        if (keys.has(segment.key))
            fail('invalid_job', `duplicate segment key ${JSON.stringify(segment.key)}`);
        keys.add(segment.key);
    }
    const segments = job.segments.filter((s) => !isBlank(s.text));
    if (segments.length === 0)
        fail('invalid_job', 'the job has nothing to translate (all segments blank)');
    return segments;
}
function xliffSource(segment) {
    if (!segment.html)
        return xmlText(segment.text.replace(/\r\n?/g, '\n'));
    return segmentParts(segment.text)
        .map((p) => (typeof p === 'string' ? xmlText(p) : `<${p.code} id="${p.id}">${xmlText(p.raw)}</${p.code}>`))
        .join('');
}
/** One XLIFF 1.2 file with one `<file>` per job. Blank segments are left out; a job with only blank segments is refused. */
export function exportXliff(jobs) {
    if (jobs.length === 0)
        fail('invalid_job', 'at least one job is needed');
    let out = '<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n';
    for (const job of jobs) {
        const segments = checkJob(job);
        out +=
            `  <file original="${xmlAttr(job.reference)}" source-language="${xmlAttr(job.sourceLanguage)}" target-language="${xmlAttr(job.targetLanguage)}"` +
                ` datatype="html" product-name="${xmlAttr(job.plugin)}" tool-id="supertext-sdk">\n` +
                '    <header>\n      <tool tool-id="supertext-sdk" tool-name="Supertext SDK"/>\n    </header>\n    <body>\n';
        for (const segment of segments) {
            const datatype = segment.html ? '' : ' datatype="plaintext"';
            out +=
                `      <trans-unit id="${xmlAttr(segment.key)}"${datatype} extradata="${checksum(segment)}" xml:space="preserve">\n` +
                    `        <source>${xliffSource(segment)}</source>\n      </trans-unit>\n`;
        }
        out += '    </body>\n  </file>\n';
    }
    return out + '</xliff>\n';
}
/** The HTML document for one job (what HtmlDocument.build makes) with the job's metadata in its head. Blank segments are left out; a job with only blank segments is refused. */
export function exportHtml(job) {
    const segments = checkJob(job);
    let out = `<!DOCTYPE html>\n<html lang="${htmlAttr(job.sourceLanguage)}"><head><meta charset="utf-8">\n` +
        `<meta name="supertext:plugin" content="${htmlAttr(job.plugin)}">\n` +
        `<meta name="supertext:reference" content="${htmlAttr(job.reference)}">\n` +
        `<meta name="supertext:source-language" content="${htmlAttr(job.sourceLanguage)}">\n` +
        `<meta name="supertext:target-language" content="${htmlAttr(job.targetLanguage)}">\n`;
    segments.forEach((segment, i) => {
        out += `<meta name="supertext:segment" content="${i} ${checksum(segment)} ${htmlAttr(segment.key)}">\n`;
    });
    out += '</head><body>\n';
    segments.forEach((segment, i) => {
        out += `<div data-st-id="${i}">${packSegment(segment)}</div>\n`;
    });
    return out + '</body></html>\n';
}
const XML_NAME = /^[A-Za-z_:][-A-Za-z0-9_:.]*/;
const XML_REF = /^&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/;
const PREDEFINED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const localName = (name) => name.slice(name.lastIndexOf(':') + 1);
function decodeXml(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const amp = text.indexOf('&', i);
        if (amp < 0)
            return out + text.slice(i);
        out += text.slice(i, amp);
        const m = XML_REF.exec(text.slice(amp, amp + 12));
        if (!m)
            fail('invalid_file', 'not a well-formed XML file (unknown entity)');
        if (m[3])
            out += PREDEFINED[m[3]];
        else {
            const cp = parseInt(m[1] ?? m[2], m[1] ? 16 : 10);
            if (!isXmlChar(cp))
                fail('invalid_file', 'not a well-formed XML file (character reference)');
            out += String.fromCodePoint(cp);
        }
        i = amp + m[0].length;
    }
    return out;
}
/** A small XML parser: elements, attributes, text, CDATA; comments and processing instructions skipped; no DTD. */
function parseXml(source) {
    const s = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const bad = (what) => fail('invalid_file', `not a well-formed XML file (${what})`);
    let i = 0;
    let root = null;
    const stack = [];
    while (i < s.length) {
        const lt = s.indexOf('<', i);
        const textEnd = lt < 0 ? s.length : lt;
        if (textEnd > i) {
            const text = s.slice(i, textEnd);
            if (stack.length > 0)
                stack[stack.length - 1].children.push(decodeXml(text));
            else if (!isBlank(text))
                bad('text outside the root element');
            if (text.includes(']]>'))
                bad(']]> in text');
        }
        if (lt < 0)
            break;
        if (s.startsWith('<!--', lt)) {
            const end = s.indexOf('-->', lt + 4);
            if (end < 0)
                bad('unclosed comment');
            i = end + 3;
        }
        else if (s.startsWith('<![CDATA[', lt)) {
            const end = s.indexOf(']]>', lt + 9);
            if (end < 0 || stack.length === 0)
                bad('CDATA');
            stack[stack.length - 1].children.push(s.slice(lt + 9, end));
            i = end + 3;
        }
        else if (s.startsWith('<?', lt)) {
            const end = s.indexOf('?>', lt + 2);
            if (end < 0)
                bad('unclosed processing instruction');
            i = end + 2;
        }
        else if (s.startsWith('<!', lt)) {
            return bad('declarations are not allowed');
        }
        else if (s.startsWith('</', lt)) {
            const name = XML_NAME.exec(s.slice(lt + 2))?.[0];
            const end = s.indexOf('>', lt);
            if (!name || end < 0 || s.slice(lt + 2 + name.length, end).trim() !== '')
                bad('end tag');
            const open = stack.pop();
            if (!open || open.name !== name)
                bad('mismatched end tag');
            i = end + 1;
        }
        else {
            const name = XML_NAME.exec(s.slice(lt + 1))?.[0];
            if (!name)
                return bad('start tag');
            let j = lt + 1 + name.length;
            const element = { name: name, attrs: {}, children: [] };
            const seen = new Set();
            for (;;) {
                const ws = /^\s*/.exec(s.slice(j, j + 200))[0].length;
                j += ws;
                if (s.startsWith('/>', j) || s[j] === '>')
                    break;
                if (ws === 0)
                    bad('attribute');
                const attr = XML_NAME.exec(s.slice(j, j + 200))?.[0];
                if (!attr)
                    return bad('attribute');
                j += attr.length;
                const eq = /^\s*=\s*(["'])/.exec(s.slice(j, j + 200));
                if (!eq)
                    return bad('attribute value');
                j += eq[0].length;
                const close = s.indexOf(eq[1], j);
                if (close < 0)
                    return bad('attribute value');
                const raw = s.slice(j, close);
                if (raw.includes('<'))
                    bad('< in attribute value');
                if (seen.has(attr))
                    bad('duplicate attribute');
                seen.add(attr);
                element.attrs[localName(attr)] = decodeXml(raw.replace(/[\t\n]/g, ' '));
                j = close + 1;
            }
            const selfClosing = s[j] === '/';
            i = j + (selfClosing ? 2 : 1);
            if (stack.length > 0)
                stack[stack.length - 1].children.push(element);
            else if (root)
                bad('more than one root element');
            else
                root = element;
            if (!selfClosing)
                stack.push(element);
        }
    }
    if (!root || stack.length > 0)
        bad('unclosed element');
    return root;
}
const internals = new WeakMap();
const CHECKSUM = /^[0-9a-f]{8}$/;
const element = (node, name) => typeof node !== 'string' && localName(node.name) === name;
function targetParts(nodes) {
    const out = [];
    const pending = [...nodes].reverse();
    while (pending.length > 0) {
        const node = pending.pop();
        if (typeof node === 'string') {
            if (typeof out[out.length - 1] === 'string')
                out[out.length - 1] += node;
            else
                out.push(node);
        }
        else {
            const name = localName(node.name);
            if (name === 'mrk')
                for (let i = node.children.length - 1; i >= 0; i--)
                    pending.push(node.children[i]);
            else if ((name === 'bpt' || name === 'ept' || name === 'ph') && /^[1-9][0-9]{0,8}$/.test(node.attrs.id ?? ''))
                out.push({ code: name, id: Number(node.attrs.id) });
            else
                out.push({ code: 'invalid' });
        }
    }
    return out;
}
function readXliff(content) {
    const root = parseXml(content);
    if (localName(root.name) !== 'xliff')
        fail('invalid_file', 'not an XLIFF file');
    const files = root.children.filter((c) => element(c, 'file'));
    if (files.length === 0)
        fail('invalid_file', 'the XLIFF file has no <file> element');
    return files.map((file) => {
        const { original, 'source-language': sourceLanguage, 'target-language': targetLanguage, 'product-name': plugin } = file.attrs;
        if (!original || !sourceLanguage || !targetLanguage || !plugin)
            fail('missing_metadata', 'the <file> element lacks original, source-language, target-language or product-name');
        const units = new Map();
        const pending = [];
        for (const body of file.children)
            if (element(body, 'body'))
                pending.push(...[...body.children].reverse());
        while (pending.length > 0) {
            const node = pending.pop();
            if (element(node, 'group'))
                for (let i = node.children.length - 1; i >= 0; i--)
                    pending.push(node.children[i]);
            else if (element(node, 'trans-unit')) {
                const key = node.attrs.id;
                if (!key || units.has(key))
                    continue;
                const target = node.children.find((c) => element(c, 'target'));
                const extradata = node.attrs.extradata ?? '';
                units.set(key, { key, checksum: CHECKSUM.test(extradata) ? extradata : null, target: target ? targetParts(target.children) : null });
            }
        }
        return register({ format: 'xliff', plugin: plugin, reference: original, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, units: [] }, units);
    });
}
const META = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
function readHtml(content) {
    const meta = {};
    const segments = [];
    for (const m of content.matchAll(META)) {
        const attrs = {};
        for (const a of m[1].matchAll(new RegExp(ATTR.source, 'g'))) {
            const name = a[1].toLowerCase();
            if (!(name in attrs))
                attrs[name] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
        }
        const name = (attrs.name ?? '').toLowerCase();
        if (!name.startsWith('supertext:') || attrs.content === undefined)
            continue;
        if (name === 'supertext:segment') {
            const s = /^([0-9]{1,9}) ([0-9a-f]{8}) ([\s\S]+)$/.exec(attrs.content);
            if (s)
                segments.push({ position: Number(s[1]), checksum: s[2], key: s[3] });
        }
        else if (!(name in meta))
            meta[name] = attrs.content;
    }
    const plugin = meta['supertext:plugin'];
    const reference = meta['supertext:reference'];
    const sourceLanguage = meta['supertext:source-language'];
    const targetLanguage = meta['supertext:target-language'];
    if (!plugin || !reference || !sourceLanguage || !targetLanguage || segments.length === 0) {
        fail('missing_metadata', 'the HTML file lacks the supertext:* metadata in its head');
    }
    const wanted = new Set(segments.map((s) => s.position));
    const inner = readSegments(content, (id) => (wanted.has(id) ? true : null));
    const units = new Map();
    const positions = new Set();
    for (const s of [...segments].sort((a, b) => a.position - b.position)) {
        if (units.has(s.key) || positions.has(s.position))
            continue;
        positions.add(s.position);
        units.set(s.key, { key: s.key, checksum: s.checksum, target: inner.get(s.position) ?? null });
    }
    return register({ format: 'html', plugin: plugin, reference: reference, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, units: [] }, units);
}
function register(file, units) {
    file.units = [...units.values()].map((u) => ({ key: u.key, checksum: u.checksum }));
    internals.set(file, units);
    return file;
}
/**
 * Reads an exported file after translation: XLIFF (one result per `<file>`) or
 * HTML (one result). Throws TranslationFileError: too_large, invalid_file (not
 * XLIFF or HTML, not well-formed, a DTD), missing_metadata.
 */
export function read(content) {
    if (content.length > MAX_FILE_CHARACTERS)
        fail('too_large', `the file is larger than ${MAX_FILE_CHARACTERS} characters`);
    const start = content.replace(/^﻿/, '').trimStart().slice(0, 200).toLowerCase();
    if (start.startsWith('<?xml') || start.startsWith('<xliff'))
        return readXliff(content);
    if (start.startsWith('<!doctype html') || /^<html[\s>]/.test(start))
        return [readHtml(content)];
    return fail('invalid_file', 'neither an XLIFF nor an HTML file');
}
// ---------------------------------------------------------------------------
// Importing
const escapeHtmlText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Rebuilds an HTML segment from XLIFF target parts with the current source's codes; null if the target uses codes the source doesn't have. */
function rebuildHtml(parts, source) {
    const codes = new Map();
    for (const p of segmentParts(source))
        if (typeof p !== 'string')
            codes.set(`${p.code}:${p.id}`, p.raw);
    const open = [];
    const used = new Set();
    let out = '';
    for (const p of parts) {
        if (typeof p === 'string') {
            out += escapeHtmlText(p);
            continue;
        }
        if (p.code === 'invalid')
            return null;
        const raw = codes.get(`${p.code}:${p.id}`);
        if (raw === undefined)
            return null;
        if (p.code === 'bpt') {
            if (used.has(p.id))
                return null;
            used.add(p.id);
            open.push(p.id);
        }
        else if (p.code === 'ept') {
            if (open.pop() !== p.id)
                return null;
        }
        out += raw;
    }
    return open.length === 0 ? out : null;
}
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'xlink:href']);
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
function safeUrl(value) {
    const v = decodeEntities(value).replace(/[\u0000- \u007F]/g, '').toLowerCase();
    const head = v.split(/[/?#]/)[0];
    if (head.includes('&'))
        return false;
    const colon = head.indexOf(':');
    return colon < 0 || SAFE_SCHEMES.has(head.slice(0, colon));
}
/** A translated HTML segment from an HTML file, rebuilt; null if it has tags, attributes, comments or URLs the source doesn't allow. */
function sanitizeHtml(inner, source) {
    const allowed = new Map();
    const comments = new Set();
    for (const t of tokenize(source)) {
        if (t.kind === 'comment')
            comments.add(t.raw);
        else if (t.kind !== 'text') {
            const names = allowed.get(t.name) ?? new Set();
            if (t.kind === 'start')
                for (const [name] of t.attrs)
                    names.add(name);
            allowed.set(t.name, names);
        }
    }
    let out = '';
    for (const t of tokenize(inner)) {
        if (t.kind === 'text')
            out += t.text.replace(/</g, '&lt;');
        else if (t.kind === 'comment') {
            if (!comments.has(t.raw))
                return null;
            out += t.raw;
        }
        else {
            const names = allowed.get(t.name);
            if (!names)
                return null;
            if (t.kind === 'start') {
                for (const [name, value] of t.attrs) {
                    if (!names.has(name))
                        return null;
                    if (value !== null && URL_ATTRIBUTES.has(name) && !safeUrl(value))
                        return null;
                    if (value !== null && name === 'srcset' && !value.split(',').every((c) => safeUrl(c.trim().split(/\s+/)[0] ?? '')))
                        return null;
                }
            }
            out += t.raw;
        }
    }
    return out;
}
/**
 * The translations for the integration's current segments (collected again from
 * the item the file's `reference` names), one per non-blank segment in their
 * order. Markup comes from the current source only: XLIFF codes are replaced by
 * the source's tags; HTML translations may only use the source's tags,
 * attributes and comments, and safe URLs.
 */
export function importTranslations(file, current) {
    const units = internals.get(file);
    if (!units)
        return fail('invalid_file', 'not a file returned by read()');
    const out = [];
    for (const segment of current) {
        if (isBlank(segment.text))
            continue;
        const unit = units.get(segment.key);
        if (!unit) {
            out.push({ key: segment.key, status: 'missing', text: null });
            continue;
        }
        let text;
        const target = unit.target;
        if (target === null)
            text = undefined;
        else if (typeof target === 'string') {
            if (segment.html)
                text = isBlank(target) ? undefined : sanitizeHtml(target, segment.text);
            else {
                const plain = toPlainText(target);
                text = plain === '' ? undefined : plain;
            }
        }
        else {
            const hasCode = target.some((p) => typeof p !== 'string');
            if (!hasCode && target.every((p) => isBlank(p)))
                text = undefined;
            else if (segment.html)
                text = rebuildHtml(target, segment.text);
            else
                text = hasCode ? null : target.join('');
        }
        if (text === undefined)
            out.push({ key: segment.key, status: 'untranslated', text: null });
        else if (text === null)
            out.push({ key: segment.key, status: 'invalid_markup', text: null });
        else
            out.push({ key: segment.key, status: unit.checksum === checksum(segment) ? 'ok' : 'source_changed', text });
    }
    return out;
}
/** The translation file helpers as one object: `TranslationFiles.exportXliff(jobs)`. */
export const TranslationFiles = Object.freeze({ checksum, exportXliff, exportHtml, read, importTranslations, MAX_FILE_CHARACTERS });
