import 'dotenv/config';
import apostrophe from 'apostrophe';

// Railway: DATABASE_URL points at the shared Postgres server; the demo uses its own
// database APOSTROPHE_DB_NAME there (docker/entrypoint.sh creates it). APOS_DB_URI wins.
if (!process.env.APOS_DB_URI && process.env.DATABASE_URL) {
  const name = process.env.APOSTROPHE_DB_NAME || 'supertext_apostrophe';
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error('APOSTROPHE_DB_NAME: lower-case letters, digits and _ only');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  process.env.APOS_DB_URI = url.toString();
}

apostrophe({
  root: import.meta,
  shortName: 'supertext-apostrophe-demo',
  baseUrl: process.env.APOS_BASE_URL,
  modules: {
    // Apostrophe module configuration
    // *******************************
    //
    // NOTE: most configuration occurs in the respective modules' directories.
    // See modules/@apostrophecms/page/index.js for an example.
    //
    // Any modules that are not present by default in Apostrophe must at least
    // have a minimal configuration here to turn them on: `moduleName: {}`
    // ***********************************************************************
    // `className` options set custom CSS classes for Apostrophe core widgets.
    // NOTE: Changing this className will break global style selectors
    // configured in modules/@apostrophecms/styles/index.js
    '@apostrophecms/rich-text-widget': {
      options: {
        className: 'bp-rich-text'
      }
    },
    '@apostrophecms/image-widget': {
      options: {
        className: 'bp-image-widget'
      }
    },
    '@apostrophecms/video-widget': {
      options: {
        className: 'bp-video-widget'
      }
    },
    // `asset` supports the project's build for client-side assets.
    asset: {},
    // use vite for asset bundling and hot module reloading
    '@apostrophecms/vite': {},
    // The project's first custom page type.
    'default-page': {},
    article: {},
    'supertext-demo': {},
    'supertext-apostrophe-translation': {
      options: {
        languages: {
          de: { code: 'de-CH', politeness: 'more' },
          fr: { code: 'fr-CH', politeness: 'more' },
          it: { code: 'it-CH', politeness: 'more' }
        }
      }
    },
    'nested-layout-widget': {},
    'nested-column-widget': {}
  }
});
