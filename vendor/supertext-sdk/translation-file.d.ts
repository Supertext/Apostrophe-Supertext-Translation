export interface FileSegment {
    /** The integration's own key for the text (unique in the job), e.g. `title` or `body.3`. */
    key: string;
    /** The text, or an HTML fragment when `html` is true. */
    text: string;
    html?: boolean;
}
export interface FileJob {
    /** The integration's name (its repository name), e.g. `Contao-Supertext-Translation`. */
    plugin: string;
    /** What the integration needs to find the item again, e.g. `page:12`. Opaque to the SDK. */
    reference: string;
    sourceLanguage: string;
    targetLanguage: string;
    segments: readonly FileSegment[];
}
export type FileFormat = 'xliff' | 'html';
export interface FileUnit {
    key: string;
    /** The source's checksum at export time, or null when the file doesn't carry one. */
    checksum: string | null;
}
/** One job read back from a file (an XLIFF file can hold several). */
export interface TranslationFile {
    format: FileFormat;
    plugin: string;
    reference: string;
    sourceLanguage: string;
    targetLanguage: string;
    units: FileUnit[];
}
/**
 * ok: translated, source unchanged. source_changed: translated, but the source
 * changed since the export (or the file has no checksum): the integration decides.
 * untranslated: no translation in the file. invalid_markup: the translation uses
 * markup the current source doesn't have. missing: the file has no such key.
 */
export type ImportStatus = 'ok' | 'source_changed' | 'untranslated' | 'invalid_markup' | 'missing';
export interface ImportedSegment {
    key: string;
    status: ImportStatus;
    /** The translation (plain text or HTML, like the segment) for ok and source_changed, else null. */
    text: string | null;
}
export type TranslationFileErrorCode = 'invalid_job' | 'invalid_file' | 'missing_metadata' | 'too_large';
export declare class TranslationFileError extends Error {
    readonly code: TranslationFileErrorCode;
    readonly name = "TranslationFileError";
    constructor(code: TranslationFileErrorCode, message: string);
}
/** Larger files are refused by `read` (counted as the language's string length). */
export declare const MAX_FILE_CHARACTERS = 10000000;
/** FNV-1a (32 bit) of the packed segment's UTF-8 bytes, 8 lowercase hex digits. Detects changed sources; not a security check. */
export declare function checksum(segment: Pick<FileSegment, 'text' | 'html'>): string;
/** One XLIFF 1.2 file with one `<file>` per job. Blank segments are left out; a job with only blank segments is refused. */
export declare function exportXliff(jobs: readonly FileJob[]): string;
/** The HTML document for one job (what HtmlDocument.build makes) with the job's metadata in its head. Blank segments are left out; a job with only blank segments is refused. */
export declare function exportHtml(job: FileJob): string;
/**
 * Reads an exported file after translation: XLIFF (one result per `<file>`) or
 * HTML (one result). Throws TranslationFileError: too_large, invalid_file (not
 * XLIFF or HTML, not well-formed, a DTD), missing_metadata.
 */
export declare function read(content: string): TranslationFile[];
/**
 * The translations for the integration's current segments (collected again from
 * the item the file's `reference` names), one per non-blank segment in their
 * order. Markup comes from the current source only: XLIFF codes are replaced by
 * the source's tags; HTML translations may only use the source's tags,
 * attributes and comments, and safe URLs.
 */
export declare function importTranslations(file: TranslationFile, current: readonly FileSegment[]): ImportedSegment[];
/** The translation file helpers as one object: `TranslationFiles.exportXliff(jobs)`. */
export declare const TranslationFiles: Readonly<{
    checksum: typeof checksum;
    exportXliff: typeof exportXliff;
    exportHtml: typeof exportHtml;
    read: typeof read;
    importTranslations: typeof importTranslations;
    MAX_FILE_CHARACTERS: 10000000;
}>;
