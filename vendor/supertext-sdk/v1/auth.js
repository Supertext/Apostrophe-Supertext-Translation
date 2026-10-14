import { SupertextError } from './errors.js';
/**
 * The `Authorization` header value for an API key as an administrator pasted it.
 * Supertext shows the key *with* the `Supertext-Auth-Key ` prefix, so a pasted
 * prefix is stripped and exactly one is sent (no prefix: HTTP 400, two: 401).
 */
export function authHeader(apiKey) {
    const key = apiKey.trim().replace(/^Supertext-Auth-Key(?:\s+|$)/i, '').trim();
    if (key === '')
        throw new SupertextError('missing_api_key');
    return `Supertext-Auth-Key ${key}`;
}
/**
 * Wait in milliseconds before retrying an HTTP 429 (`attempt` is 0-based).
 * A Retry-After that is a plain number of seconds wins; otherwise 1, 2, 4, 8 s …
 * plus 0–249 ms jitter, so parallel clients don't retry in lockstep. Either way
 * at most 30 s. HTTP-date Retry-After values fall back to the backoff (rare, and clocks differ).
 */
export function retryDelayMs(attempt, retryAfter, random = Math.random) {
    const value = (retryAfter ?? '').replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
    const ms = /^[0-9]+(?:\.[0-9]+)?$/.test(value)
        ? Math.round(Number(value) * 1000)
        : 1000 * 2 ** attempt + Math.min(249, Math.floor(random() * 250));
    return Math.min(30_000, ms);
}
