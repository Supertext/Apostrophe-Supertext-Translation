# Developer guide

Architecture, the Supertext API protocol, local development, tests, the demo, CI and releasing. Setup for site administrators is in the [installation guide](INSTALLATION.md); editing in the [user guide](USER_GUIDE.md).

## Architecture

The package is one Apostrophe module, `supertext-apostrophe-translation` (alias `supertext`), extending `@apostrophecms/module`.

```
index.js                     the module: provider, status screen, API routes, tasks
lib/client.js                Supertext AI file API v1 client (no Apostrophe imports)
lib/document.js              HTML document with one data-st-id element per text unit
lib/collect.js               field rules: finds the texts of a document by its schema
lib/translate.js             language codes, form of address, sends units and applies results
i18n/supertext/<lang>.json   UI strings (en, de, fr, it), namespace "supertext"
i18n/apostrophe/<lang>.json  overrides Apostrophe's automaticTranslationDisclaimer
ui/apos/components/SupertextStatusModal.vue   admin status screen
test/                        unit tests (node --test), no Apostrophe needed
tests/docs/                  stand-in API, sample translations, screenshot script
tests/demo-check.sh          CI check of the demo image
demo/                        Railway demo site (Apostrophe starter kit + this module)
```

Keep `lib/` free of Apostrophe imports: the unit tests run without Apostrophe.

### Hook point: Apostrophe's translation provider API

Apostrophe 4.13+ has a core module `@apostrophecms/translation` (used by ApostropheCMS's commercial automatic-translation extension). A module registers itself with

```js
self.apos.translation.addProvider(self, { name: 'supertext', label: 'Supertext' });
```

and implements two methods:

- `translate(req, provider, draft, source, target, { existing })`: called by `doc-type.localize()` (its `beforeLocalize` step) for every document copied into another locale when the request carries `aposTranslateTargets` and `aposTranslateProvider` (the *Localize…* wizard sends them when *Translate text content* is ticked). It changes `draft` in place before Apostrophe inserts or updates it.
- `getSupportedLanguages(req, { source, target })`: the wizard asks which locales the provider supports. Supertext supports all; codes are mapped with the `languages` option.

The module registers the provider only when an API key is set, so without a key the wizard doesn't offer translation at all. The admin-bar item (`supertext-apostrophe-translation:status`) and its modal are registered regardless.

Details that matter:

- **Shallow copy.** `localize()` copies the source's schema fields shallowly, so areas, arrays and objects of the copy are the source's own objects. `detach()` deep-clones them before translating; otherwise translating into German would change the source document in memory and the French copy would be made from German.
- **Slugs.** The copy gets the source slug. For a new localization (`existing` false) `translateSlug()` makes one from the translated title with `apos.util.slugify` (honours `stripUrlAccents`); pages keep their parent's path and the home page keeps `/`. Apostrophe makes slugs unique on save. On re-translation (`existing` true) `keepSlug()` restores the slug the localized document already has. Option `translateSlugs: false` turns both off.
- **Errors.** A Supertext error logs `[supertext] …`, sends the editor a danger notification (`supertext:translationFailed`, with both API key links on authentication failures) and throws `apos.error('error')`, so Apostrophe doesn't save an untranslated copy and lists the locale as failed.
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

### Supertext API protocol (`lib/client.js`)

AI file translation API v1, the same as the WordPress plugin:

1. `POST {base}translate/ai/file` (multipart: `file` = `content.html` with content type exactly `text/html`, `target_lang`, `source_lang` = primary subtag of the source, `politeness` = `more`/`less` when set) → `{ file_id }`.
2. Poll `GET {base}translate/ai/file/{id}/status` every `pollInterval` seconds until `done` (or `error` / `limit_exceeded` / `deleted`, or `timeout`).
3. `GET {base}translate/ai/file/{id}/translation` → translated HTML.
4. `DELETE {base}translate/ai/file/{id}` (best effort).

`check` and *Test connection* call `GET {base}features`, which costs nothing.

- **Auth:** `Authorization: Supertext-Auth-Key <key>`. A pasted `Supertext-Auth-Key ` prefix is stripped, so exactly one is sent.
- **Rate limit:** HTTP 429 is retried up to 4 times (`Retry-After`, else 1/2/4/8 s plus jitter). Locales are translated one after the other (Apostrophe's wizard does that already).
- **Document:** one `<div data-st-id="n">` per unit in a UTF-8 HTML document (`lib/document.js`). Each `data-st-id` element is translated on its own, so a whole paragraph is one unit with its formatting as inline tags; never one unit per formatted run. Very large documents are split into several files below 900,000 characters.
- Base URLs: `live` `https://api.supertext.com/v1/`, `staging` `https://api.staging.supertext.com/v1/`, `testing` `https://api.testing.supertext.com/v1/`; `SUPERTEXT_API_URL` / `apiUrl` override them.

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
EOF
node ../tests/docs/stand-in.mjs &   # the stand-in API on :8765 (or run it in another terminal)
node app @apostrophecms/migration:migrate
DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… node app supertext-demo:setup
node app                        # http://localhost:3000
```

Use the live API instead of the stand-in by setting your own `SUPERTEXT_API_KEY` and leaving `SUPERTEXT_API_URL` empty. After changing the module run `demo/stage-module.sh` and `npm install` in `demo/` again (the demo installs a copy, `install-links=true`).

The stand-in (`tests/docs/stand-in.mjs`) answers like the Supertext API: texts found in `tests/docs/samples.json` (real Supertext output for the demo content in de, fr, it) come back translated; anything else comes back as `[<target>] text`. When the demo's content changes, add its translations to `samples.json` (translate them once with the live API).

## Tests

- `npm test`: unit tests for the client (auth header, prefix stripping, 429 retries, polling, errors), the HTML document (rich text units, round trip of formatting and links), the field rules and the UI strings (every language has the same keys, placeholders and URLs as English).
- `tests/demo-check.sh` (CI): builds on the demo image, starts it twice against PostgreSQL and the stand-in, checks the demo accounts (created once, never duplicated, no password in the log), runs `check`, translates the sample page and article with the `translate` task into de/fr/it, checks that a second run skips existing locales, and reads the German page and Italian article back through Apostrophe's REST API as the editor.

```bash
docker build -f demo/Dockerfile -t supertext-apostrophe-demo .
node tests/docs/stand-in.mjs &
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres ./tests/demo-check.sh
```

The script drops nothing: run it against a fresh database (it uses `supertext_apostrophe`).

## Docs screenshots

`npm run docs:screenshots` (script `tests/docs/screenshots.mjs`, Playwright) logs in to a **fresh** demo (nothing localized yet) whose module talks to the stand-in, localizes the sample page as the editor and captures the wizard, the German result and the status screen as the administrator. Set `BASE_URL` and the `DEMO_*` accounts; `CHROMIUM_PATH` if Playwright's own browser isn't installed. The status screenshot shows the live API address instead of the stand-in's. Regenerate the images whenever the UI they show changes.

## Demo

`demo/` is the public demo on Railway (project *supertext-cms-demos*, service *Apostrophe*): Apostrophe's essentials starter kit (MIT, see `demo/LICENSE-starter-kit`) with four locales (en, de, fr, it), a simple layout with a language switcher, an *article* piece type and this module (`de-CH`, `fr-CH`, `it-CH`, formal).

- `demo/Dockerfile` (build context: repository root) installs the demo with the module copied in and builds the admin assets.
- `demo/docker/entrypoint.sh` creates the demo's own database `APOSTROPHE_DB_NAME` (default `supertext_apostrophe`) on the Postgres server in `DATABASE_URL` if needed, runs Apostrophe's migrations and `supertext-demo:setup`, then starts Apostrophe. `demo/app.js` derives `APOS_DB_URI` from the same variables, so `docker exec demo node app <task>` works too.
- `demo/modules/supertext-demo` (`setup` task) runs on every start and only creates what's missing: the demo accounts, the English home page text, the sample page *Swiss chocolate, shipped worldwide* and the sample article *Handmade in Bern*, all published.

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
| `DEMO_*` | see above |

Railway settings (set on the service; `railway.json` is ignored): Dockerfile path `demo/Dockerfile`, healthcheck `/health` (a static file), restart on failure, region `ams`. Uploads live in the container, so images added in the demo disappear on redeploy.

## CI

`.github/workflows/ci.yml`: unit tests on Node 22 and 24; then builds the demo image and runs `tests/demo-check.sh` against a PostgreSQL service and the stand-in.

## Releasing

Releases are published by `.github/workflows/release.yml`; never tag or create a release by hand.

1. Move the *Unreleased* entries in `CHANGELOG.md` into a new section `## [X.Y.Z] - YYYY-MM-DD` and leave an empty *Unreleased* above it.
2. Set the same version in `package.json` (the official version: the status screen and `check` read it at runtime and link to the release).
3. Push to `main`. The workflow tags `vX.Y.Z` and creates the GitHub release with the changelog section as notes (0.x as pre-release). A push without a new version releases nothing.

Publishing to npm (`npm publish`) is a separate, manual step by Supertext.

## Known limitations and roadmap

- `@apostrophecms/translation` is marked "may change" by Apostrophe; the module follows its interface as of Apostrophe 4.33.
- Only the provider API is used: there is no Supertext-specific UI in the editor, and Apostrophe gives no overwrite warning when localizing into a locale that already has the document.
- Rich text is split into block elements; inline-only rich text is sent as one unit. Tables are translated cell by cell.
- Translations run during the localize request; very long documents can make the wizard wait until `timeout`.
- Professional (human) translation orders are not supported yet.
