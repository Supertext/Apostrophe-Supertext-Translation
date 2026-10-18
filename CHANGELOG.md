# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Export for translation (XLIFF 1.2 or HTML) and import of translated files; Supertext SDK 0.5.0. *Export for translation* and *Import translation* in the More Options menu of pages and pieces: download a document's texts for one or more locales, have them translated in a translation tool, by a translator or in Supertext's web app, and import the file again as drafts (with a summary: imported, skipped because the source changed, untranslated, formatting changed, not in the file).

- Supertext as a translation provider for Apostrophe's own *Localize…* step: with *Translate text content* ticked, pages and pieces (single or batch, and their related documents) are translated by Supertext AI before Apostrophe saves them as drafts.
- An unknown language (e.g. `xx-YY`) is now reported as an unsupported language pair too, not as "resource not found" (Supertext answers it with HTTP 404).
- Translates string fields, rich text (one paragraph, heading, list item or table cell at a time, formatting and links kept), the fields of other widgets, arrays and objects at any depth. `translate: false` fields and HTML widgets are skipped.
- New localizations get a slug from the translated title; re-translating keeps the existing slug.
- Options `languages` (Supertext language and formal/informal address per locale), `translateSlugs`, `skipWidgets`, `environment`, `apiUrl`, `timeout`, `pollInterval`; API key from `SUPERTEXT_API_KEY` or `apiKey`.
- *Supertext* status screen for administrators (version, API key, API address, connection test, languages), with links to create a Supertext account and to generate the API key.
- Tasks `supertext-apostrophe-translation:check` and `supertext-apostrophe-translation:translate`.
- Interface in English, German, French and Italian.
- Retries when Supertext's per-second rate limit is hit; the API key works with or without the `Supertext-Auth-Key ` prefix.
- Tested on Node.js 26 as well (CI runs the unit tests on Node 22, 24 and 26).

### Changed

- **Language mapping on the Supertext screen** (admin bar → Supertext → Languages): one combo box per locale with Supertext's languages (*Name (code)*, names in the admin's language) and, where Supertext offers it, the form of address; **Save languages** stores the choice in the database (checked against Supertext's list on the server) and applies it without a restart. The module option `languages` stays as an override for automated setups (those locales are read-only on the screen); existing `languages` options keep working unchanged.
- **Default target languages** (Supertext SDK 0.4.0): a locale nobody mapped uses the obvious default (`de` → `de-DE`, `en` → `en-US`, `fr` → `fr-FR`, `it` → `it-IT`, `pt` → `pt-PT`, `zh` → `zh-Hans`, `es-ES` → `es`, …) instead of being unsupported; the combo box preselects it. Locales without a default (`en-IE`, `de-LI`, `gsw`, …) show *— choose —* and stay unsupported until a language is chosen. The *unsupported language* message now points to Supertext → Languages.
- Version reports, the API key check result and the reachability ping now use [Supertext Plugin Health](https://github.com/Supertext/Commando-Center-Supertext-Translation/tree/main/plugin-health) 0.1.0 (bundled in `vendor/supertext-plugin-health`); Supertext SDK updated to 0.3.0. No change for sites: settings and stored state stay as they are.
- The connection to Supertext now uses the shared [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (TypeScript SDK 0.3.0, shipped with the module in `vendor/supertext-sdk`, so nothing else needs installing; its API is in the `v1` folder). The file at Supertext is also deleted after errors, and `check` shows the SDK version.
- **Language codes are no longer guessed.** Each locale's Supertext language comes from the `languages` option (`code`, used as target and, without region, as source), else from the locale name if it is exactly a Supertext code (`es`, `nl`, `de-CH`), else the locale is unsupported and nothing is sent. There are no default regions any more: locales such as `de`, `fr`, `it`, `en` or `pt` need a `code` (e.g. `de: { code: 'de-CH' }`). The *Localize…* wizard says automatic translation isn't available for unsupported locales, and the editor gets *The locale … has no Supertext language* naming where to map it. `languages` also takes the short form `{ de: 'de-CH' }`.
- The form of address (`politeness`) is only sent for languages where Supertext offers it (not for English, for example); the status screen says when it is ignored.
- Error messages for editors are now in their interface language (English, German, French, Italian) for every Supertext error, including the new *unsupported language* and *unsupported form of address*.

### Added (Commando Center)

- **Send version information to Supertext** (option `versionReports`, on by default; `SUPERTEXT_VERSION_REPORTS=0` turns it off): the site URL and the versions of the module, ApostropheCMS and Node.js go to Supertext after an update and when the API key changes. No content, no API key, no personal data.
- **Automatic API key check** (free, nothing translated): when the key changes, on *Test connection* and when Supertext rejects a translation. The status screen shows the last result with its time, the account and API key links where they help, the ping address and whether version information is sent.
- Public ping address `GET /api/v1/supertext-apostrophe-translation/ping` (only while version reports are on), so Supertext can see whether the site is reachable.
- The status screen and `check` show per locale whether it has a Supertext language (and mark codes Supertext doesn't list); `check` also sends a version report.
