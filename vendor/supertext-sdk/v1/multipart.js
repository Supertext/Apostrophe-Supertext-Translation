// Uniqueness only matters against the content; a random hex string is plenty.
function randomBoundary() {
    let hex = '';
    for (let i = 0; i < 32; i++)
        hex += Math.floor(Math.random() * 16).toString(16);
    return `----supertext-${hex}`;
}
/** Fields in the given order, then the file (UTF-8). Names and values are short ASCII (field names, language codes). */
export function encodeMultipart(fields, file, boundary = randomBoundary()) {
    let head = '';
    for (const [name, value] of fields) {
        head += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    }
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`;
    const bytes = new TextEncoder().encode(`${head}${file.content}\r\n--${boundary}--\r\n`);
    // An ArrayBuffer is a body in every runtime; copy only if the view doesn't span its whole buffer.
    const body = (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
