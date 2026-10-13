/**
 * Packs texts into the HTML document sent to Supertext and reads them back.
 *
 * Each segment becomes one `<div data-st-id="N">`. Supertext translates every
 * such element on its own, so a whole paragraph (with its inline formatting and
 * links) must be one segment: splitting it at formatting breaks the sentences.
 */
export interface Segment {
    /** The text, or an HTML fragment when `html` is true. */
    text: string;
    /** True: `text` is HTML and goes as it is. False (default): plain text, escaped. */
    html?: boolean;
}
/** What goes between `<div data-st-id>` and `</div>` for a segment. */
export declare function packSegment(segment: Segment): string;
/** The HTML document for the segments; ids are the positions. */
export declare function build(segments: readonly Segment[]): string;
/**
 * Reads the translated texts back, one per segment in the same order as
 * `build` got them (`null`: missing from the answer). The segments' `html`
 * flags decide how each is read; their texts are not used.
 */
export declare function parse(html: string, segments: readonly Pick<Segment, 'html'>[]): (string | null)[];
/** The HTML document helpers as one object: `HtmlDocument.build(segments)`. */
export declare const HtmlDocument: Readonly<{
    build: typeof build;
    parse: typeof parse;
}>;
