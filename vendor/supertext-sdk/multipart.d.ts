/**
 * A minimal multipart/form-data encoder.
 *
 * Why not FormData: the API compares the file part's Content-Type verbatim and
 * answers HTTP 415 to anything but `text/html`, and some runtimes rewrite a
 * Blob's type (Bun sends `text/html;charset=utf-8`). Writing the bytes
 * ourselves gives the same request on Node, Deno, Bun and in browsers.
 */
export interface MultipartFile {
    name: string;
    filename: string;
    contentType: string;
    content: string;
}
export interface MultipartBody {
    body: ArrayBuffer;
    contentType: string;
}
/** Fields in the given order, then the file (UTF-8). Names and values are short ASCII (field names, language codes). */
export declare function encodeMultipart(fields: readonly (readonly [string, string])[], file: MultipartFile, boundary?: string): MultipartBody;
