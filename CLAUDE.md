# Working on this repository

Part of Supertext's translation plugins project: Supertext AI translation for the top open source CMS, plus PIM, shop and design-file systems. Each system has its own repo named `Supertext/<System>-Supertext-Translation`. This one is the **ApostropheCMS** module (Node.js, npm package `supertext-apostrophe-translation`, a translation provider for Apostrophe's own *Localize…* step).

## Documentation rule (always)

Every plugin repo keeps three guides, and **every change that affects behaviour, settings, installation or the code structure updates them in the same commit**:

| File | Audience | Must cover |
| --- | --- | --- |
| `docs/INSTALLATION.md` | Administrators | Requirements, install/update/uninstall, API key, language setup, all settings, troubleshooting |
| `docs/USER_GUIDE.md` | Editors | How to translate and review in the CMS's own UI, what is and isn't translated, what errors mean |
| `docs/DEVELOPER.md` | Developers | Architecture, Supertext API protocol, local setup, tests, CI/deploy, releasing, known limitations/roadmap |

Also: `README.md` stays a short overview linking the three guides, and `CHANGELOG.md` gets an entry under *Unreleased* for every user-visible change. Before finishing any task, check the docs still match the code.

## Supertext account and API key links (always)

Everywhere an administrator enters or is told about the API key — the settings field's help text, the "no API key" / "authentication failed" messages, `docs/INSTALLATION.md`, `README.md` and the demo's `.env.example` — show both links (same as the WordPress plugin):

- Create a Supertext account (or log in): https://www.supertext.com/person/en/account/signin
- Generate the AI API key: https://www.supertext.com/en/integrations/api (supertext.com → Integrations → API; requires the **Admin** role)

Wording: "No Supertext account yet? Create one at supertext.com. Generate your API key at supertext.com → Integrations → API (requires the Admin role)." In the UI, links open in a new tab (`target="_blank" rel="noopener"`); where the CMS shows plain text only, use the bare URLs.

## UI languages (always)

The plugin's own UI (buttons, panels, dialogs, settings, permissions, messages) is available in English, German, French and Italian through the CMS's own translation mechanism, so it follows the user's back-end language. New or changed strings get all four languages in the same commit. Formal address (Sie, vous, Lei), the CMS's own terms in each language, "Supertext", placeholders and URLs never translated. A test checks that every language has the same keys, placeholders and URLs as English. Where the CMS has no extension i18n (Directus, Ghost), the plugin carries a small dictionary and picks the language the CMS or browser reports.

## Plugin version on the settings screen (always)

Where the CMS doesn't show the plugin's version itself, the plugin's own settings or status screen does (CLI-only plugins print it in their check command). It is read at runtime from the official version source (see *Releases*), never a second hardcoded copy, and links to the GitHub release when it is an X.Y.Z version.

## Repo setup (always)

Every Supertext plugin repo has, and a new one gets from the start:

- `LICENSE` matching the license its manifest declares (`composer.json`, `package.json`, `pyproject.toml`, `.csproj`, plugin header). Don't pick a license for a repo that declares none: ask Remy.
- `SECURITY.md`: report vulnerabilities privately through GitHub's private vulnerability reporting or support@supertext.com, never in public issues.
- `.github/dependabot.yml`: weekly updates for its package ecosystem and GitHub Actions, minor and patch updates grouped into one pull request.
- `.github/workflows/checks.yml` (actionlint + zizmor on every push and PR, dependency review on PRs) and `.github/workflows/links.yml` (lychee weekly and on docs changes; broken links open the issue "Broken links in the docs"). Third-party actions are pinned to commit SHAs.
- On GitHub: the About box filled in (one-sentence description, website https://www.supertext.com, topics), `main` protected by the ruleset "Protect main" (no force-pushes, no deletion), Wiki and Projects off, Dependabot alerts and private vulnerability reporting on, secret scanning with push protection and CodeQL default setup on, and a social preview image (1280×640, same design as the others: "AI translation for <System>").
- A row in the plugin list (see *Plugin list*), which is also the org profile page (`Supertext/.github` → `profile/README.md`).

Claude sessions can't change GitHub repo settings or push to `Supertext/.github` (HTTP 403 / dot-repos can't be attached): add the new repo to Remy's setup script (`set-github-about.sh` / `.ps1`, one `setup` line with repo, description and topics) and hand him the profile change.

## Checks and alerts (always)

Before starting work in a repo, look at its open findings and fix what the task touches or what is quick: code scanning alerts (`gh api 'repos/Supertext/Apostrophe-Supertext-Translation/code-scanning/alerts?state=open'`), secret scanning alerts (`…/secret-scanning/alerts?state=open`), open Dependabot PRs and the issue "Broken links in the docs". New workflows and workflow changes must pass actionlint and zizmor; PHP code must pass PHPStan at the repo's level. See `docs/DEVELOPER.md` → *Code quality and security checks*.

## Plugin list (always)

Every plugin repo's `README.md` ends with the same list of all Supertext plugins, between the `<!-- supertext-plugins:start -->` and `<!-- supertext-plugins:end -->` markers (just before *License* if there is one). It has four tables — **CMS**, **PIM**, **E-commerce** and **Design files** — sorted alphabetically. Each row has the system, the link, one sentence on the **type of integration** (plugin, extension, module, bundle, package, app, connector service, scripts, …, and how it's installed or hooked in) and what it does. Plugins still being built are listed with *In development*; replace that with the real description when the plugin works.

When a plugin is added, renamed or its description changes, update the list here, in every plugin repo and on the org profile page (`Supertext/.github` → `profile/README.md`, same tables). A new plugin adds its own row and gets the list in its README from the start. Drupal's module lives on drupal.org (maintained by MD Systems), so it is listed but doesn't carry the list.

The current block is in this repo's `README.md` and in the project's `plugin-conventions.md`.

## Releases (always)

Every CMS plugin repo has `.github/workflows/release.yml` (since v0.1.0, October 2026). It publishes a GitHub release only when the version is officially bumped: a new `## X.Y.Z — YYYY-MM-DD` (or `## [X.Y.Z] - YYYY-MM-DD` in Keep-a-Changelog repos) section at the top of `CHANGELOG.md`, below an empty *Unreleased*, with every file in the workflow's `VERSION_FILES` carrying the same number. Then it tags `vX.Y.Z`, creates the release with that CHANGELOG section as notes (0.x as pre-releases) and attaches the installable zip where there is one (Joomla `plg_system_supertext-X.Y.Z.zip` via `./build.sh`, Grav `supertext-translation-X.Y.Z.zip`). Pushes without a new version release nothing; released versions are skipped; a mismatching version file fails the run. Never tag or create releases by hand (Claude sessions can't anyway: HTTP 403). Each repo's `docs/DEVELOPER.md` → *Releasing* lists its steps. New plugins copy the workflow from an existing repo and set `VERSION_FILES`.

Official version files (where each CMS reads the version):

| Plugin | Version file(s) | Notes |
| --- | --- | --- |
| TYPO3 | `ext_emconf.php` | shown in the extension manager |
| Joomla | `plugin/supertext.xml`, `plugin/media/joomla.asset.json` | XML version shown in the extension manager |
| Grav | `blueprints.yaml` | shown in the admin's plugin list |
| Umbraco | `.csproj` (NuGet), `umbraco-package.json` | package version shown under Settings → Packages |
| Orchard Core | `.csproj` (NuGet), `Manifest.cs` | also shown on the Supertext settings page |
| Apostrophe, Directus, Strapi, Payload, Ghost | `package.json` | Apostrophe, Directus, Strapi and Ghost show it on their Supertext page (Apostrophe also in `check`) |
| django CMS, Wagtail | `<package>/__init__.py` `__version__` | shown on the Supertext settings page |
| Contao, Craft CMS, Neos, Pimcore, Silverstripe | none: the Git tag | Composer takes the version from the tag; don't add `version` to `composer.json`. Silverstripe shows it in the Supertext section, Neos and Pimcore in `supertext:check` (Pimcore via `Composer\InstalledVersions`) |

## Demo accounts rule (always)

Every demo must be usable right after deployment, without anyone registering in a browser. On **every start**, the demo creates these accounts if they don't exist yet:

| Variables | Account |
| --- | --- |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` | Full administrator (for Supertext staff) |
| `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` | Editor-level account that can translate content in every demo language; used for automated tests and screenshots. Where the CMS has no editor role that works out of the box, use the closest role and document it. |

- Existing accounts are never modified: no password resets from variables, no duplicates on restart.
- A password that doesn't meet the CMS's own password rules skips that account with a clear warning in the log. The demo still starts.
- Values live only in the hosting platform's variables (Railway). Never in the repo, in chat or in logs. Log the variable name, never the password.
- If the CMS has a first-run "create admin" screen, these accounts replace it. Document that once `DEMO_*` is set, the screen no longer appears.
- If a demo already used CMS-specific names (e.g. `TYPO3_ADMIN_*`, `PAYLOAD_ADMIN_*`), keep them as fallbacks for `DEMO_ADMIN_*`.
- The demo also seeds its target languages and at least one sample entry in the source language, and makes sure the editor account can access every target language.
- Document the variables in `docs/DEVELOPER.md` (demo section) and in the demo's `.env.example`.

## Screenshots rule (always)

The user guide and installation guide of every plugin include screenshots of the real UI: at least the translate action before and after translating, a translated result, the overwrite or retranslate warning if there is one, the plugin's settings or configuration screen, and the CMS's language setup. Screenshots are taken from the repo's own demo with the headless browser, by a committed script (e.g. `npm run docs:screenshots`), against a stand-in API that returns real translations for the sample content, so the guides never show placeholder text. Use no real customer data, no secrets, no local URLs (show the live API endpoint). Keep the images small (1× scale, cropped to the relevant part), store them in `docs/images/`, give each one descriptive alt text, and regenerate them in the same commit whenever the UI they show changes.

## Shared Supertext protocol

AI file translation API v1, same as the WordPress plugin: POST HTML file → poll status → GET translation → DELETE. Details in `docs/DEVELOPER.md`. Never commit API keys; use the `SUPERTEXT_API_KEY` environment variable or the CMS's settings.

Lessons from testing against the live API (October 2026), to apply in every plugin:

- **Auth header:** `Authorization: Supertext-Auth-Key <key>`. The header name must be `Authorization` (`Authentication` gets 403; no prefix gets 400). Supertext shows the key with the prefix, so strip a pasted `Supertext-Auth-Key ` and always send exactly one.
- **Rate limit:** the API limits requests per second per key (HTTP 429, `RATE_LIMIT_EXCEEDED`). Translating into several languages at once hits it. Retry a 429 up to 4 times (`Retry-After`, else 1/2/4/8 s with jitter).
- **Rich text:** each element carrying `data-st-id` is translated on its own. Send a whole paragraph (heading, list item) as **one** `data-st-id` element with formatting and links as inline tags (`<b>`, `<i>`, `<a href>`), and map them back to the CMS's rich-text nodes. Never give each formatted run its own `data-st-id`: sentences break at the formatting (lower-case starts, words moved outside the tags).

## Demo and CI lessons

- **Railway ignores `railway.json`**: set the Dockerfile path (`demo/Dockerfile`), the healthcheck (`/health`, a static file; paths allow only letters, digits, `/` and `_`) and the restart policy on the service. New services may land in `sfo`: the demos run in `ams`.
- **Railway builds from a `git archive` snapshot**: never `export-ignore` `demo/` or anything the Dockerfile copies.
- **Railway databases:** the Postgres service is shared; this demo uses its own database on it (`APOSTROPHE_DB_NAME`, default `supertext_apostrophe`). Variables can reference other services (`${{Postgres.DATABASE_URL}}`).
- **Demo-check scripts with `set -o pipefail`:** never `docker logs … | grep -q`; capture the log first.
- **Docker builds in a Claude session:** `npm ci` inside `docker build` needs the proxy: build a local `node:22-bookworm-slim` from `mirror.gcr.io/library/node:22-bookworm-slim` with the proxy CA (`/root/.ccr/ca-bundle.crt`, `NODE_EXTRA_CA_CERTS`) and run `docker build --network host --build-arg HTTPS_PROXY=$HTTPS_PROXY …`.
- **Checking releases from a Claude session:** use `gh api repos/<owner>/<repo>/releases/tags/<tag>` (GraphQL and the Actions API are blocked). Remy sets CI secrets and GitHub settings himself.

## This repo

- Before committing: `npm test` (unit tests, no Apostrophe needed). CI also builds the demo image and runs `tests/demo-check.sh` against PostgreSQL and the stand-in (`tests/docs/stand-in.mjs`).
- The module is `index.js` (provider, status screen, API routes, tasks). Keep `lib/` free of Apostrophe imports.
- New options go in `index.js` (`options`) **and** the settings table in `docs/INSTALLATION.md`.
- Field rules live in `lib/collect.js`; keep "Field rules" in `docs/DEVELOPER.md` and "What is translated" in `docs/USER_GUIDE.md` in sync.
- UI strings: `i18n/supertext/{en,de,fr,it}.json` (and `i18n/apostrophe/*.json` for the wizard's disclaimer); `test/i18n.test.js` checks they match. Module i18n goes in the top-level `i18n` property, not in `options`.
- `localize()` copies fields shallowly: never mutate shared objects of `draft` without `detach()` first.
- The module name `supertext-apostrophe-translation` (the `apostrophe-` prefix is reserved for Apostrophe) and the provider name `supertext` are used in users' `app.js` and requests; renaming them is a breaking change.
- Test UI changes in the demo against the stand-in (see `docs/DEVELOPER.md` → Local development) and regenerate the screenshots they affect (`npm run docs:screenshots` against a fresh demo). New demo content needs entries in `tests/docs/samples.json`.
- `demo/` is the Railway demo (project *supertext-cms-demos*, service *Apostrophe*; `demo/Dockerfile`, context = repo root; the module is copied to `demo/module` by `demo/stage-module.sh` locally and by the Dockerfile). Demo-only setup is `demo/modules/supertext-demo` (`setup` task); it only creates what's missing. Demo secrets live only in Railway variables.
