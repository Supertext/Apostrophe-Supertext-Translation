import { packSegment } from './html-document.js';
/** Below the API's limit of 1,000,000 characters per document, leaving room for the markup. */
export const DEFAULT_MAX_CHARACTERS = 900_000;
/** Empty or only ASCII whitespace: not sent, comes back unchanged. */
export const isBlank = (text) => /^[ \t\r\n\f]*$/.test(text);
/** Length in Unicode code points (what the API counts), without allocating an array. */
export function codePointLength(text) {
    let n = 0;
    for (let i = 0; i < text.length; i++, n++) {
        const c = text.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
            const d = text.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff)
                i++;
        }
    }
    return n;
}
/**
 * Splits segments into documents (spec/batching.json): input order kept, blank
 * segments skipped, a document holds segments while their packed lengths add up
 * to at most `maxCharacters`; a longer segment goes alone.
 */
export function planBatches(segments, maxCharacters = DEFAULT_MAX_CHARACTERS) {
    const batches = [];
    let current = [];
    let size = 0;
    for (const segment of segments) {
        if (isBlank(segment.text))
            continue;
        const length = codePointLength(packSegment(segment));
        if (current.length > 0 && size + length > maxCharacters) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push(segment);
        size += length;
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}
