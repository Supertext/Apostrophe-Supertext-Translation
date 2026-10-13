/**
 * The `Authorization` header value for an API key as an administrator pasted it.
 * Supertext shows the key *with* the `Supertext-Auth-Key ` prefix, so a pasted
 * prefix is stripped and exactly one is sent (no prefix: HTTP 400, two: 401).
 */
export declare function authHeader(apiKey: string): string;
/**
 * Wait in milliseconds before retrying an HTTP 429 (`attempt` is 0-based).
 * A Retry-After that is a plain number of seconds wins; otherwise 1, 2, 4, 8 s …
 * plus 0–249 ms jitter, so parallel clients don't retry in lockstep. Either way
 * at most 30 s. HTTP-date Retry-After values fall back to the backoff (rare, and clocks differ).
 */
export declare function retryDelayMs(attempt: number, retryAfter: string | null | undefined, random?: () => number): number;
