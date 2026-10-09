# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Supertext as a translation provider for Apostrophe's own *Localize…* step: with *Translate text content* ticked, pages and pieces (single or batch, and their related documents) are translated by Supertext AI before Apostrophe saves them as drafts.
- Translates string fields, rich text (one paragraph, heading, list item or table cell at a time, formatting and links kept), the fields of other widgets, arrays and objects at any depth. `translate: false` fields and HTML widgets are skipped.
- New localizations get a slug from the translated title; re-translating keeps the existing slug.
- Options `languages` (Supertext language and formal/informal address per locale), `translateSlugs`, `skipWidgets`, `environment`, `apiUrl`, `timeout`, `pollInterval`; API key from `SUPERTEXT_API_KEY` or `apiKey`.
- *Supertext* status screen for administrators (version, API key, API address, connection test, languages), with links to create a Supertext account and to generate the API key.
- Tasks `supertext-apostrophe-translation:check` and `supertext-apostrophe-translation:translate`.
- Interface in English, German, French and Italian.
- Retries when Supertext's per-second rate limit is hit; the API key works with or without the `Supertext-Auth-Key ` prefix.
