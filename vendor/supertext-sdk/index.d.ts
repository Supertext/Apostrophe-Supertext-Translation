/**
 * Supertext SDK. Everything that talks to the API is versioned with it:
 *
 *   import { v1 } from 'supertext-sdk'          // or: import { SupertextClient } from 'supertext-sdk/v1'
 *   const client = new v1.SupertextClient(apiKey)
 *
 * A later API version gets `v2` next to `v1`.
 */
export * as v1 from './v1/index.js';
export { SDK_VERSION } from './version.js';
