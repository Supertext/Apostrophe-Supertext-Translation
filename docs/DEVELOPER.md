# Developer guide

Architecture, the Supertext API protocol, local development, tests, the demo, CI and releasing. Setup for site administrators is in the [installation guide](INSTALLATION.md); editing in the [user guide](USER_GUIDE.md).

## Architecture

The package is one Apostrophe module, `supertext-apostrophe-translation` (alias `supertext`), extending `@apostrophecms/module`.

```
index.js                     the module: provider, status screen, API routes, tasks
lib/sdk.js                   loads the vendored Supertext SDK (its v1 API: client, API key check); API addresses per environment
lib/document.js              text units: one per plain-text field, one per rich-text paragraph
lib/collect.js               field rules: finds the texts of a document by its schema
lib/translate.js             language codes (saved mapping + languages option), validation, form of address, sends units through the SDK
lib/files.js                 translation files: export (XLIFF/HTML) and import glue on the SDK's TranslationFiles
lib/reporting.js             Commando Center glue: version reports, API key check, ping (Plugin Health's InstallationReporter)
vendor/supertext-sdk/        the Supertext TypeScript SDK (built JavaScript), copied by scripts/vendor-sdk.sh
vendor/supertext-plugin-health/  Supertext Plugin Health (built JavaScript), copied by scripts/vendor-plugin-health.sh
scripts/vendor-sdk.sh          updates vendor/supertext-sdk from the SDK repository
scripts/vendor-plugin-health.sh  updates vendor/supertext-plugin-health from the Commando Center repository
i18n/supertext/<lang>.json   UI strings (en, de, fr, it), namespace "supertext"
i18n/apostrophe/<lang>.json  overrides Apostrophe's automaticTranslationDisclaimer
ui/apos/components/SupertextStatusModal.vue   admin status screen with the language combo boxes
ui/apos/components/SupertextFilesModal.vue    "Export for translation" / "Import translation" dialog (document menu)
test/                        unit tests (node --test), no Apostrophe needed
tests/docs/                  stand-in API, sample translations, screenshot script
tests/demo-check.sh          CI check of the demo image
demo/                        Railway demo site (Apostrophe starter kit + this module)
```

Keep `lib/` free of Apostrophe imports: the unit tests run without Apostrophe.

### Supertext SDK (`vendor/supertext-sdk`)

All talking to Supertext goes through the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (`sdk/typescript`, npm name `supertext-sdk`), the shared client of all Supertext plugins: it provides the client and the API key check (`checkApiKey()`, `apiKeyFingerprint`, `SDK_VERSION`); version reports and the ping are in *Supertext Plugin Health* (below). The module ships its own copy of the SDK's built JavaScript in `vendor/supertext-sdk/` (sites install only the module, also once the SDK is on npm; Apostrophe modules have no build step that could bundle it) (ES modules, loaded with `require()`, which Node 22.12+ supports). `COMMIT` names the SDK commit, `VERSION` the SDK version, and the copy's `package.json` only marks the files as ES modules. Since SDK 0.2.0 everything API-bound is in `v1/` (`lib/sdk.js` loads `vendor/supertext-sdk/v1/index.js`; `version.js` has `SDK_VERSION`); a later API version would get `v2/` next to it. Never edit those files: fix the SDK repository and copy it again with `scripts/vendor-sdk.sh [ref]` (it builds the SDK and replaces the copy entirely):

```bash
scripts/vendor-sdk.sh                  # latest main of the SDK repository (also: npm run vendor-sdk)
scripts/vendor-sdk.sh <commit|branch>  # a tag, branch or commit
SDK_DIR=/path/to/Supertext-API-SDK-and-Guide scripts/vendor-sdk.sh   # a local clone, as it is
```

Then run the tests and the demo check, and note the new SDK version in `CHANGELOG.md`. `check` prints the SDK version.

### Supertext Plugin Health (`vendor/supertext-plugin-health`)

[Supertext Plugin Health](https://github.com/Supertext/Commando-Center-Supertext-Translation/tree/main/plugin-health) (`plugin-health/typescript` in the Commando Center repository, package name `supertext-plugin-health`) sends the version reports and the API key check result to the Supertext Commando Center and answers its reachability ping (`InstallationReporter`, `reportsEnabled()`, `reporterState()`, `pingResponse()`; see *Commando Center* below). It has no dependencies and doesn't need the SDK: `lib/reporting.js` passes in the SDK's `SDK_VERSION` and a key checker built from the SDK's `checkApiKey()` and `apiKeyFingerprint`. The module ships the built JavaScript in `vendor/supertext-plugin-health/`, next to the SDK copy and loaded the same way (ES modules via `require()`); `COMMIT` and `VERSION` say where it comes from, the copy's `package.json` only marks the files as ES modules. Never edit those files: fix Plugin Health in Commando-Center-Supertext-Translation/plugin-health and copy it again with `scripts/vendor-plugin-health.sh` (it builds it and replaces the copy entirely):

```bash
scripts/vendor-plugin-health.sh plugin-health-v0.1.0   # a release tag (also: npm run vendor-plugin-health -- <tag>)
scripts/vendor-plugin-health.sh                        # latest main of the Commando Center repository
PLUGIN_HEALTH_DIR=/path/to/Commando-Center-Supertext-Translation scripts/vendor-plugin-health.sh   # a local clone, as it is
```

Then run the tests and the demo check, and note the new Plugin Health version in `CHANGELOG.md`.

### Hook point: Apostrophe's translation provider API

Apostrophe 4.13+ has a core module `@apostrophecms/translation` (used by ApostropheCMS's commercial automatic-translation extension). A module registers itself with

```js
self.apos.translation.addProvider(self, { name: 'supertext', label: 'Supertext' });
```

and implements two methods:

- `translate(req, provider, draft, source, target, { existing })`: called by `doc-type.localize()` (its `beforeLocalize` step) for every document copied into another locale when the request carries `aposTranslateTargets` and `aposTranslateProvider` (the *Localize…* wizard sends them when *Translate text content* is ticked). It changes `draft` in place before Apostrophe inserts or updates it.
- `getSupportedLanguages(req, { source, target })`: the wizard asks which locales the provider supports. A locale is supported when it has a Supertext code (see *Language codes*); the wizard names the unsupported ones itself ("automatic translation isn't available for …") and doesn't send them.

The module registers the provider only when an API key is set, so without a key the wizard doesn't offer translation at all. The admin-bar item (`supertext-apostrophe-translation:status`) and its modal are registered regardless.

Details that matter:

- **Shallow copy.** `localize()` copies the source's schema fields shallowly, so areas, arrays and objects of the copy are the source's own objects. `detach()` deep-clones them before translating; otherwise translating into German would change the source document in memory and the French copy would be made from German.
- **Slugs.** The copy gets the source slug. For a new localization (`existing` false) `translateSlug()` makes one from the translated title with `apos.util.slugify` (honours `stripUrlAccents`); pages keep their parent's path and the home page keeps `/`. Apostrophe makes slugs unique on save. On re-translation (`existing` true) `keepSlug()` restores the slug the localized document already has. Option `translateSlugs: false` turns both off.
- **Errors.** A Supertext error logs `[supertext] …` (English, the SDK's message), sends the editor a danger notification (`supertext:translationFailed`) and throws `apos.error('error')`, so Apostrophe doesn't save an untranslated copy and lists the locale as failed. The notification's text is `supertext:error_<code>` for every SDK error code (`ERROR_CODES` in `index.js`; `errorMessage()`), in the editor's language, with the locale's label (`unsupported_language` names the source locale when the source is the problem) and both API key links on `missing_api_key` / `authentication_failure`. A new SDK error code needs a key in `ERROR_CODES` and an `error_<code>` string in all four languages.
- **i18n.** Module UI strings live in the top-level `i18n` property (not in `options`): `supertext` (browser: true) for the status screen and messages, `apostrophe` to override the wizard's disclaimer text. Apostrophe's admin UI follows the user's UI locale.

### Field rules (`lib/collect.js`)

Units are collected by walking the document type's schema (`apos.doc.getManager(type).schema`) and, for widgets, the widget type's schema (`apos.area.getWidgetManager(type).schema`):

| Field | Units |
| --- | --- |
| `string` (also `textarea: true`) | one plain-text unit; line breaks are sent as `<br>` and restored |
| `area` | each widget; `@apostrophecms/rich-text`: one unit per innermost block element (`p`, `h1`–`h6`, `li`, `blockquote`, `td`, `th`, `dt`, `dd`, `figcaption`, `caption`, `pre`, `div`, `summary`) with inline formatting and links as tags; rich text without block elements is one unit. Other widgets: their schema, same rules |
| `array`, `object` | their sub-schema, same rules, any depth |
| field with `translate: false` | skipped |
| everything else (`slug`, `select`, `checkboxes`, `boolean`, `integer`, `float`, `date`, `time`, `url`, `email`, `color`, `relationship`, `attachment`, `oembed`, …) | skipped |
| widget types in `skipWidgets` (default `@apostrophecms/html`) | skipped |

Keep this table and "What is translated" in `docs/USER_GUIDE.md` in sync with `lib/collect.js`.

### Supertext API protocol (the SDK)

AI file translation API v1, the same as the WordPress plugin. The SDK does all of it; `lib/translate.js` calls `client.translateTexts()` once per document and locale with one segment per text unit (`{ text, html }`: plain-text fields as plain text, rich-text paragraphs as HTML):

1. `POST {base}translate/ai/file` (multipart: `file` = `content.html` with content type exactly `text/html`, `target_lang`, `source_lang` = bare language of the source, `politeness` = `more`/`less` when set) → `{ file_id }`.
2. Poll `GET {base}translate/ai/file/{id}/status` every `pollInterval` seconds until `done` (or `error` / `limit_exceeded` / `deleted`, or `timeout`).
3. `GET {base}translate/ai/file/{id}/translation` → translated HTML.
4. `DELETE {base}translate/ai/file/{id}` (also after errors).

`check` calls `validateApiKey()` (`GET {base}features`), which costs nothing; *Test connection* runs the same check through the reporter (see *Commando Center*).

- **Auth:** `Authorization: Supertext-Auth-Key <key>`. A pasted `Supertext-Auth-Key ` prefix is stripped, so exactly one is sent.
- **Rate limit:** HTTP 429 is retried up to 4 times (`Retry-After`, else 1/2/4/8 s plus jitter). Locales are translated one after the other (Apostrophe's wizard does that already).
- **Document:** one `<div data-st-id="n">` per segment in a UTF-8 HTML document. Each `data-st-id` element is translated on its own, so a whole paragraph is one unit with its formatting as inline tags; never one unit per formatted run. More than 900,000 characters go into several documents, translated one after the other.
- **Errors:** a `SupertextError` with a stable `code` (`authentication_failure`, `unsupported_language`, `quota_exceeded`, `too_many_requests`, `timeout`, …) and an English message; the API key never appears in it. The module logs the English message and notifies the editor with its own translated message for the code.
- Base URLs (`lib/sdk.js`): `live` `https://api.supertext.com/v1/`, `staging` `https://api.staging.supertext.com/v1/`, `testing` `https://api.testing.supertext.com/v1/`; `SUPERTEXT_API_URL` / `apiUrl` override them. The User-Agent is `supertext-sdk-typescript supertext-apostrophe-translation/<version>`.

### Language codes (`lib/translate.js`)

**Defaults only where obvious.** Supertext accepts only the codes its `GET features` lists (the SDK's `Languages`, `vendor/supertext-sdk/v1/languages.js`; spec `spec/languages.json` in the SDK repository): 28 bare sources (`en`, `de`, …); 37 targets, regional only for de/en/fr/it/pt (`de-CH`, `en-US`, `pt-BR`), with a script for zh/sr (`zh-Hans`, `sr-Latn`), `gsw-u-sd-chzh` / `gsw-u-sd-chbe`, bare for all others (`es`, `nl`, `sl`). Anything else: HTTP 404 `INVALID_LANGUAGE_PAIR`. Politeness on a target without it (en, gsw, rm, sq, sr): HTTP 400 `FEATURE_ERROR`.

- The mapping is chosen on the status screen: one `AposSelect` per locale (all of `apos.i18n.locales`) with `Languages.targetOptions()` as *Name (code)* (the name from `Intl.DisplayNames` in the admin's language, Supertext's English name for the `gsw-u-sd-…` dialects and as fallback), preselected with the saved code, else `Languages.suggestTarget(locale)`, else *— choose —* (`''`), plus a form-of-address select where `supportsPoliteness`. `POST …/languages` (administrators; Apostrophe's CSRF check applies to every session POST, `apos.http.post` handles it) stores `{ <locale>: { code, politeness } }` in `aposCache` (namespace `supertext-apostrophe-translation`, key `languages`, no expiry) after `validateLanguages()`: only the site's locales, only Supertext's target codes, `''` not stored (the default applies), politeness stored as `default` where not offered; anything else → HTTP 400 `invalid` with `supertext:languagesInvalid`.
- The module option `languages` (`{ de: { code: 'de-CH', politeness: 'more' } }`, or `{ de: 'de-CH' }`) overrides the saved mapping per locale (`mergeLanguages()`; those selects are read-only, `overridden`). The result is turned into the SDK's `LanguageMapping` by `mapping()`. One mapping serves both directions. Upgrading from 0.1.0 needs no migration: the option, then the only mapping, keeps working as the override.
- `targetCode(locale, languages)` = `Languages.target(locale, mapping)`: the mapped code (sent as it is), else an exact match of the locale name (case and `_`/`-` ignored: `de_ch` → `de-CH`), else the SDK's default (`de` → `de-DE`, `en` → `en-US`, `fr` → `fr-FR`, `it` → `it-IT`, `pt` → `pt-PT`, `zh` → `zh-Hans`, `sr` → `sr-Latn`, `zh-TW` → `zh-Hant`, `es-ES` → `es`, …), else `SupertextError('unsupported_language')` (`en-IE`, `de-LI`, `gsw`, `sr-RS` need a mapping).
- `sourceCode(locale, languages)` = `Languages.source(locale, mapping)`: the mapped code's language (`de-CH` → `de`), else the locale's language if Supertext offers it as source, else `unsupported_language`.
- `translateUnits()` resolves both codes before calling the client, so an unsupported locale sends nothing.
- `politeness()` sends the configured `more` / `less` only when `Languages.supportsPoliteness(target)` is true; otherwise nothing.
- `languageStatus()` is what the status screen, `getSupportedLanguages()` and the `check` task show per locale: code (or none), mapped, `known` (in Supertext's list; a mapped code that isn't is still sent, and Supertext then answers `invalid_language_pair`), `defaulted` (the code is the SDK's default), `suggestion` (what the select preselects), source code, form of address and `politenessIgnored`. The status route adds `label`, `overridden`, `saved`, `selected` and `selectedPoliteness` per locale and `targetOptions`.

The stand-in (`tests/docs/stand-in.mjs`) rejects bare targets and regional sources like the real API.

## Translation files: export and import (`lib/files.js`)

*Export for translation* and *Import translation* use the SDK's `TranslationFiles` (Supertext SDK 0.5.0, `vendor/supertext-sdk/translation-file.js`, imported from the copy's root `index.js`, not from `v1/`: it doesn't talk to the API). They are an alternative to the API: the file is translated elsewhere and imported again.

- **UI:** two context operations registered with `apos.doc.addContextOperation` (`supertext-export`, `supertext-import`, context `update`, condition `canLocalize`), so they appear in the More Options menu of every localized page and piece next to *Localize…*. Both open `SupertextFilesModal` with `mode` `export` or `import`.
- **Routes** (`routes` in `index.js`, logged in; Apostrophe checks the CSRF token, or a bearer token for API calls):
  - `POST /api/v1/supertext-apostrophe-translation/export`, JSON `{ _id, format: 'xliff' | 'html', targets: [locale…] }`: loads the document's draft in its locale (permission *edit*), collects the units with `self.units()` (`lib/collect.js`, the same units and keys as an API translation) and returns the file with `Content-Type` `application/x-xliff+xml` / `text/html; charset=utf-8` and `Content-Disposition: attachment; filename="apostrophe-<aposDocId>-<locale>.xlf"` (`apostrophe-<aposDocId>.xlf` for several targets). XLIFF: one job per target locale in one file; HTML: exactly one target.
  - `POST /api/v1/supertext-apostrophe-translation/import?includeChanged=1&overwrite=1`, body: the file as text. Refused above 10 MB by `Content-Length` before reading, and while reading (`readBody` in `index.js`); kept in memory only. Returns `{ jobs: [summary…] }` (`counts` per SDK status, `imported`, `skippedChanged`, `saved`, `error`, `message`).
- **Job metadata:** `plugin` = `Apostrophe-Supertext-Translation`; `reference` = `doc:<aposDocId>:<source locale>:<target locale>` (e.g. `doc:clx3k2…:en:de`; ids and locale names only, `formatReference`/`parseReference`); `sourceLanguage`/`targetLanguage` = `Languages.source`/`Languages.target` with the module's mapping, else the locale name with `_` → `-`. Segment keys are the units' paths (`title`, `main.0.content[1]`).
- **Import** (`importFile` in `lib/files.js`, Apostrophe parts injected by `importTranslationFile` in `index.js`): `TranslationFiles.read(content)`; per job: `plugin` must be ours (else `other_system`), the reference must parse (else `not_found`), both locales must exist (else `no_language`), the source draft is loaded by `aposDocId` with the editor's permissions (else `not_found`; no *edit* permission: `forbidden`), its units are collected again and `TranslationFiles.importTranslations(file, current)` decides per segment. `ok` results (and `source_changed` with *includeChanged*) are written; `untranslated`, `invalid_markup` and `missing` aren't.
- **Write-back:** the same path as an API translation: Apostrophe's own `manager.localize(req, sourceDraft, target, { update })`, with the translations on the request (`req.supertextImport`); the module's `@apostrophecms/doc-type:beforeLocalize` handler (`applyImport`) detaches the copy, applies the translations to its units (`applyTranslations`) and applies the slug rules (`translateSlug`/`keepSlug`). So imports land as drafts, keep the source's structure, and Apostrophe checks the target locale's permissions (and that a page's parent exists there). An existing localization is only replaced with *overwrite* (else the job reports `exists`), like the `translate` task's `--overwrite`.
- **Errors:** `FilesError` (glue: `nothing_to_translate`, `no_targets`, `one_target`, `not_found`, `other_system`, `no_language`, `forbidden`, `exists`, `localize_failed`, `too_large`) and the SDK's `TranslationFileError` (`invalid_file`, `missing_metadata`, `too_large`) are shown with `supertext:files_error_<code>`.
- **Security:** the import trusts nothing in the file: the SDK refuses DTDs and oversized files and takes markup only from the current source (XLIFF codes replaced by the source's tags; HTML only with the source's tags, attributes and safe links).

## Commando Center: version reports, key check, ping

Protocol: [Commando-Center-Supertext-Translation](https://github.com/Supertext/Commando-Center-Supertext-Translation) → `docs/DEVELOPER.md` → *Report protocol*. Supertext Plugin Health's `InstallationReporter`, `reportsEnabled()`, `reporterState()` and `pingResponse()` implement it (the key check is the SDK's `checkApiKey()`, passed in as the reporter's key checker with `apiKeyFingerprint`; the SDK client gets the module's API address and User-Agent); `lib/reporting.js` (no Apostrophe imports) loads the state, runs one reporter action and stores the new state, serialized and never throwing; `index.js` (`reporting()`, `siteUrl()`, `reportInBackground()`) gives it what Apostrophe knows.

- **Setting:** module option `versionReports` (*Send version information to Supertext*, default `true`). `SUPERTEXT_VERSION_REPORTS` (`0/false/off/no`, `1/true/on/yes`) wins (`reportsEnabled()`). Off: no reports, ping 404, no ping address on the status screen. `SUPERTEXT_REPORT_URL` sends reports elsewhere (CI, screenshots: the stand-in's `POST /report`, which `GET /reports` lists). Settings live in options and the environment, so there is no `afterSettingsSaved`: the reporter's `onRequest` checks the key when its fingerprint changed.
- **Report fields:** `site_url` = Apostrophe's `baseUrl` (`APOS_BASE_URL`) if absolute, else the request's origin, plus Apostrophe's `prefix` (tasks without `APOS_BASE_URL` report nothing; the key check still runs in `check`); plugin `Apostrophe-Supertext-Translation` with `package.json`'s version; system `ApostropheCMS` with `apostrophe/package.json`'s version; runtime Node.js (Plugin Health's default); `sdk_version` = the bundled SDK's `SDK_VERSION`; `callback.url` = `<site URL>/api/v1/supertext-apostrophe-translation/ping`.
- **When:**
  - `onRequest`: the status route, every `translate()` call (the *Localize…* step), the `translate` task. On web requests in the background (`setImmediate`, after the route's work), so neither Supertext nor the center slows the request down; in tasks awaited.
  - `authenticationFailed`: a translation failed with `authentication_failure` (HTTP 401/403).
  - `testConnection`: *Test connection* (`POST …/test`, returns `{ ok, status, checkedAt, message }`, the message being the center's key-check text in the admin's language).
  - `check` task: `testConnection`, then `reportCheck` if that sent nothing.
- **State:** Plugin Health's JSON state (the same format the SDK 0.1–0.2 reporter stored, so updating kept the history: no new `installed` report) in Apostrophe's cache collection (`aposCache`, namespace `supertext-apostrophe-translation`, key `reporter`, no expiry), via `apos.cache.get/set`, which works on every database Apostrophe supports. Load and save errors are swallowed. The API key is never stored, logged or sent; only the SDK's fingerprint (`apiKeyFingerprint`) is kept.
- **Ping:** a plain `routes` GET route (`ping`, not `apiRoutes`, so Plugin Health's status, headers and body go out unchanged: `Cache-Control: no-store`, 400 for a bad challenge, 404 when off). GET routes need no CSRF token or login in Apostrophe.
- **Messages:** `supertext:keyCheck_<status>` (the center's five texts in four languages). The status screen links *supertext.com* and *supertext.com → Integrations → API* inside them (`linkParts()`, new tab), and shows the last check with its time.
- **Tests:** `test/reporting.test.js` runs the glue with a fake transport (never the live center); `tests/demo-check.sh` checks the ping and the reports the stand-in received in the demo image.

## Local development

Requirements: Node.js 22.12+. The demo runs on SQLite locally, no database server needed.

```bash
npm install                     # module dependencies (and Apostrophe as peer, for editors)
npm test                        # unit tests

# The demo with the module from this checkout
demo/stage-module.sh            # copies the module into demo/module
cd demo && npm install
cat > .env <<'EOF'
APOS_DB_URI=sqlite://./data/dev.db
SUPERTEXT_API_KEY=anything
SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/
SUPERTEXT_REPORT_URL=http://127.0.0.1:8765/report
EOF
node ../tests/docs/stand-in.mjs &   # the stand-in API on :8765 (or run it in another terminal)
node app @apostrophecms/migration:migrate
DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… node app supertext-demo:setup
node app                        # http://localhost:3000
```

Use the live API instead of the stand-in by setting your own `SUPERTEXT_API_KEY` and leaving `SUPERTEXT_API_URL` empty. Add `SUPERTEXT_REPORT_URL=http://127.0.0.1:8765/report` to `.env` so local runs never report to the live Commando Center. After changing the module run `demo/stage-module.sh` and `npm install` in `demo/` again (the demo installs a copy, `install-links=true`). If npm says "up to date" and the change doesn't show, delete `demo/node_modules/supertext-apostrophe-translation` and `demo/apos-build/` first (the copy and the built admin UI are cached).

The stand-in (`tests/docs/stand-in.mjs`) answers like the Supertext API: texts found in `tests/docs/samples.json` (real Supertext output for the demo content in de, fr, it) come back translated; anything else comes back as `[<target>] text`. When the demo's content changes, add its translations to `samples.json` (translate them once with the live API).

## Tests

- `npm test`: unit tests for the text units (rich text split into paragraphs, formatting and links kept), the field rules and the translation through a fake client, the vendored SDK (it loads, sends the auth header, the language codes and deletes the file), the vendored Plugin Health copy (it loads, keeps state stored by the old SDK reporter), the language mapping (mapping → exact match → SDK default → `unsupported_language`, which sends nothing; the option overriding the saved mapping; server-side validation of what the screen saves; politeness only where offered), the Commando Center glue with a fake transport, the translation files glue (`test/files.test.js`: reference round trip, export with the collector's keys and the mapping, import of `ok` only, `source_changed` only with the option, `untranslated`/`invalid_markup`/`missing` not written, other plugin, unknown reference, missing language, existing localization, too large files) and the UI strings (every language has the same keys, placeholders and URLs as English). The SDK's own tests and conformance scenarios run in the SDK repository, Plugin Health's in the Commando Center repository.
- `tests/demo-check.sh` (CI): builds on the demo image, starts it twice against PostgreSQL and the stand-in, checks the demo accounts (created once, never duplicated, no password in the log), runs `check` (key check and a version report to the stand-in), checks the public ping, the language route (editors get 403, invalid codes or locales 400, the status lists the saved choice and Supertext's codes), translates the sample page and article with the `translate` task into de/fr/it, checks that a second run skips existing locales, reads the German page and Italian article back through Apostrophe's REST API as the editor, and does one export → import round trip (the article as HTML for French, title edited, imported once without and once with *overwrite*).

```bash
docker build -f demo/Dockerfile -t supertext-apostrophe-demo .
node tests/docs/stand-in.mjs &
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres ./tests/demo-check.sh
```

The script drops nothing: run it against a fresh database (it uses `supertext_apostrophe`).

## Docs screenshots

`npm run docs:screenshots` (script `tests/docs/screenshots.mjs`, Playwright) logs in to a **fresh** demo (nothing localized yet) whose module talks to the stand-in, localizes the sample page as the editor and captures the wizard, the German result, the *Export for translation* dialog and an *Import translation* summary (a French XLIFF file filled from `samples.json`), the status screen and its language section (after **Save languages**) as the administrator. Set `BASE_URL` and the `DEMO_*` accounts; `CHROMIUM_PATH` if Playwright's own browser isn't installed. The status screenshot shows the live API address instead of the stand-in's and `https://www.example.ch` in the ping address. Point the demo's `SUPERTEXT_REPORT_URL` at the stand-in. `RESUME=1` skips the first localization (for a demo that has it already). Regenerate the images whenever the UI they show changes.

## Demo

`demo/` is the public demo on Railway (project *supertext-cms-demos*, service *Apostrophe*, <https://apostrophe-production-986f.up.railway.app>): Apostrophe's essentials starter kit (MIT, see `demo/LICENSE-starter-kit`) with four locales (en, de, fr, it), a simple layout with a language switcher, an *article* piece type and this module (no `languages` option: the mapping `en-GB`, and `de-CH`, `fr-CH`, `it-CH` formal, is saved by `supertext-demo:setup` like the Supertext screen does, so the combo boxes stay editable).

- `demo/Dockerfile` (build context: repository root) installs the demo with the module copied in and builds the admin assets.
- `demo/docker/entrypoint.sh` creates the demo's own database `APOSTROPHE_DB_NAME` (default `supertext_apostrophe`) on the Postgres server in `DATABASE_URL` if needed, runs Apostrophe's migrations and `supertext-demo:setup`, then starts Apostrophe. `demo/app.js` derives `APOS_DB_URI` from the same variables, so `docker exec demo node app <task>` works too.
- `demo/modules/supertext-demo` (`setup` task) runs on every start and only creates what's missing: the demo accounts, the English home page text, the sample page *Swiss chocolate, shipped worldwide* and the sample article *Handmade in Bern*, all published, and the Supertext language mapping (only when none is saved, so choices made on the screen survive restarts).

### Demo accounts

| Variables | Account |
| --- | --- |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` | Apostrophe role *admin* |
| `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` | Apostrophe role *editor*: edits, publishes and localizes all content in every locale (Apostrophe has no per-locale permissions) |

The user name is the e-mail address (lower case); people log in with it. Existing accounts are never changed (no password reset, no duplicates). Apostrophe's only password rule is "not empty"; an account whose insert fails is skipped with a warning and the demo still starts. The log names the variable, never the password. Apostrophe has no first-run admin screen; without `DEMO_*` nobody can log in until an account is added with `node app @apostrophecms/user:add`.

All demo variables are listed in `demo/.env.example`. On Railway they are service variables only (never in the repo):

| Variable | Value on Railway |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (shared Postgres; the demo uses its own database on it) |
| `APOSTROPHE_DB_NAME` | `supertext_apostrophe` |
| `APOS_SESSION_SECRET` | long random string, kept stable |
| `SUPERTEXT_API_KEY` | Supertext's demo key |
| `SUPERTEXT_VERSION_REPORTS` | not set (version reports on); `0` turns them off |
| `DEMO_*` | see above |

Railway settings (set on the service; `railway.json` is ignored): Dockerfile path `demo/Dockerfile`, healthcheck `/health` (a static file), restart on failure, region `ams`. Uploads live in the container, so images added in the demo disappear on redeploy.

## CI

`.github/workflows/ci.yml`: unit tests on Node 22, 24 and 26; then builds the demo image and runs `tests/demo-check.sh` against a PostgreSQL service and the stand-in.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

`vendor/supertext-sdk` and `vendor/supertext-plugin-health` aren't watched by Dependabot: update them with `npm run vendor-sdk` and `npm run vendor-plugin-health -- <tag>` (see *Supertext SDK* and *Supertext Plugin Health*).

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). Lift an ignore rule when the plugin moves to the new version.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Third-party actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- JavaScript and TypeScript are analysed by CodeQL (see below), so this repo runs no separate static analyser.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).
- `.github/workflows/support-triage.yml`: support requests from the Supertext integrations website arrive as issues labelled `support` (contact details stay in the Supertext CMS). Claude classifies each one: answers questions (marked `<!-- supertext:reply -->`, emailed to the sender by the CMS) and closes them, fixes bugs as pull requests for review (never merged automatically), labels feature requests `feature-request`. Only people with triage rights can add labels, so outsiders can't start it. Needs the organisation secret `ANTHROPIC_API_KEY`; the workflow is the same in every Supertext repo.

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

## Releasing

Releases are published by `.github/workflows/release.yml`; never tag or create a release by hand.

1. Move the *Unreleased* entries in `CHANGELOG.md` into a new section `## [X.Y.Z] - YYYY-MM-DD` and leave an empty *Unreleased* above it.
2. Set the same version in `package.json` (the official version: the status screen and `check` read it at runtime and link to the release).
3. Push to `main`. The workflow tags `vX.Y.Z` and creates the GitHub release with the changelog section as notes (0.x as pre-release). A push without a new version releases nothing.

Publishing to npm (`npm publish`) is a separate, manual step by Supertext.

## Known limitations and roadmap

- `@apostrophecms/translation` is marked "may change" by Apostrophe; the module follows its interface as of Apostrophe 4.33.
- Translation goes through the provider API: apart from *Export for translation* / *Import translation*, there is no Supertext-specific UI in the editor, and Apostrophe gives no overwrite warning when localizing into a locale that already has the document.
- Translation files are exported one document at a time (no batch export from the list yet). An import writes the whole localization again from the current source: texts not imported keep the source text.
- Rich text is split into block elements; inline-only rich text is sent as one unit. Tables are translated cell by cell.
- Translations run during the localize request; very long documents can make the wizard wait until `timeout`.
- Professional (human) translation orders are not supported yet.
