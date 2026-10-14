import { type Segment } from './html-document.js';
/** Below the API's limit of 1,000,000 characters per document, leaving room for the markup. */
export declare const DEFAULT_MAX_CHARACTERS = 900000;
export interface KeyedSegment extends Segment {
    key: string;
}
/** Empty or only ASCII whitespace: not sent, comes back unchanged. */
export declare const isBlank: (text: string) => boolean;
/** Length in Unicode code points (what the API counts), without allocating an array. */
export declare function codePointLength(text: string): number;
/**
 * Splits segments into documents (spec/batching.json): input order kept, blank
 * segments skipped, a document holds segments while their packed lengths add up
 * to at most `maxCharacters`; a longer segment goes alone.
 */
export declare function planBatches<T extends KeyedSegment>(segments: Iterable<T>, maxCharacters?: number): T[][];
