'use strict';

/**
 * Supertext Translation for ApostropheCMS.
 *
 * Registers Supertext as a translation provider for Apostrophe's own "Localize…" workflow
 * (`@apostrophecms/translation`): the wizard then offers "Translate text with Supertext",
 * and every document copied into another locale (single or batch localization) is
 * translated before it is saved as a draft. Adds a Supertext status screen for
 * administrators, "Export for translation" / "Import translation" (XLIFF or HTML files,
 * lib/files.js) in the document menu, and the tasks `check` and `translate`.
 */

const { Languages, SupertextClient, SupertextError, SDK_VERSION, baseUrlFor, normalizeKey } = require('./lib/sdk');
const { collectUnits } = require('./lib/collect');
const { languageStatus, mergeLanguages, translateUnits, validateLanguages } = require('./lib/translate');
const { Reporting, siteUrl, versionReportsEnabled } = require('./lib/reporting');
const { FilesError, MAX_UPLOAD_BYTES, TranslationFileError, applyTranslations, buildExport, importFile } = require('./lib/files');
const { version } = require('./package.json');

const SIGNUP_URL = 'https://www.supertext.com/person/en/account/signin';
const API_KEY_URL = 'https://www.supertext.com/en/integrations/api';
const RELEASES_URL = 'https://github.com/Supertext/Apostrophe-Supertext-Translation/releases/tag/';
const KEY_HELP = `No Supertext account yet? Create one at ${SIGNUP_URL}. ` +
  `Generate your API key at supertext.com → Integrations → API (requires the Admin role): ${API_KEY_URL}`;
const PROVIDER = 'supertext';
// Where the Commando Center reporter keeps its state: Apostrophe's cache collection
// (`aposCache`), stored without expiry.
const STATE_NAMESPACE = 'supertext-apostrophe-translation';
const STATE_KEY = 'reporter';
// The language mapping saved on the Supertext screen (same namespace, without expiry).
const LANGUAGES_KEY = 'languages';
// SDK error codes with their own message (i18n/supertext: `error_<code>`); others show the SDK's text.
const ERROR_CODES = [
  'missing_api_key', 'authentication_failure', 'invalid_language_pair', 'unsupported_language',
  'unsupported_feature', 'not_found', 'payload_too_large', 'too_many_requests', 'service_unavailable',
  'unexpected_status', 'transport_error', 'no_file_id', 'translation_error', 'quota_exceeded',
  'file_deleted', 'timeout', 'incomplete_response'
];
const ADMIN_PERMISSION = {
  action: 'edit',
  type: '@apostrophecms/user'
};

/**
 * The request body as text, refused (FilesError too_large) above `limit` bytes: by its
 * Content-Length before anything is read, else while reading. Kept in memory only.
 */
function readBody(req, limit) {
  if (typeof req.body === 'string') {
    return Buffer.byteLength(req.body) > limit ? Promise.reject(new FilesError('too_large')) : Promise.resolve(req.body);
  }
  if (Number(req.get('content-length') || 0) > limit) {
    return Promise.reject(new FilesError('too_large'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) {
        return;
      }
      size += chunk.length;
      if (size > limit) {
        done = true;
        req.pause();
        reject(new FilesError('too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

module.exports = {
  extend: '@apostrophecms/module',
  options: {
    alias: 'supertext',
    // API key; the SUPERTEXT_API_KEY environment variable wins.
    apiKey: '',
    // live | staging | testing
    environment: 'live',
    // Custom API address; the SUPERTEXT_API_URL environment variable wins.
    apiUrl: '',
    // Seconds to wait for one translation.
    timeout: 180,
    // Seconds between status checks.
    pollInterval: 2,
    // Per locale: { code: 'de-CH', politeness: 'more' | 'less' }. Overrides, for automated
    // setups, the Supertext language chosen on the Supertext screen (one mapping for both
    // directions). Locales in neither use an exact match of their name, else the SDK's default
    // (de -> de-DE, en -> en-US, ...), else they are unsupported.
    languages: {},
    // "Send version information to Supertext" (Commando Center); SUPERTEXT_VERSION_REPORTS=0 wins.
    versionReports: true,
    // New localizations get a slug made from the translated title.
    translateSlugs: true,
    // Widget types that are never translated.
    skipWidgets: [ '@apostrophecms/html' ]
  },

  // UI strings: i18n/supertext/<lang>.json (English, German, French, Italian), and
  // i18n/apostrophe/<lang>.json for the note under Apostrophe's "Translate text content".
  i18n: {
    supertext: { browser: true },
    apostrophe: { browser: true }
  },

  init(self) {
    self.version = version;
    self.enableBrowserData();
    self.apos.modal.add(`${self.__meta.name}:status`, 'SupertextStatusModal', {
      moduleName: self.__meta.name
    });
    self.apos.adminBar.add(`${self.__meta.name}:status`, 'supertext:menuLabel', ADMIN_PERMISSION);
    // Translation files: two entries in the menu of every localized page and piece (next to
    // "Localize..."), for editors who may localize it. Both open SupertextFilesModal.
    for (const mode of [ 'export', 'import' ]) {
      self.apos.doc.addContextOperation({
        action: `supertext-${mode}`,
        context: 'update',
        label: `supertext:files_${mode}Action`,
        modal: 'SupertextFilesModal',
        moduleName: self.__meta.name,
        conditions: [ 'canLocalize' ],
        props: { mode }
      });
    }
    if (self.apiKey()) {
      self.apos.translation.addProvider(self, {
        name: PROVIDER,
        label: 'Supertext'
      });
    } else {
      self.apos.util.warn(`[supertext] No Supertext API key: set SUPERTEXT_API_KEY. Automatic translation stays off. ${KEY_HELP}`);
    }
  },

  methods(self) {
    return {
      apiKey() {
        return normalizeKey(process.env.SUPERTEXT_API_KEY || self.options.apiKey || '');
      },

      apiKeySource() {
        if (normalizeKey(process.env.SUPERTEXT_API_KEY || '')) {
          return 'environment';
        }
        return normalizeKey(self.options.apiKey || '') ? 'option' : '';
      },

      baseUrl() {
        return baseUrlFor(self.options.environment, process.env.SUPERTEXT_API_URL || self.options.apiUrl);
      },

      client() {
        return new SupertextClient(self.apiKey(), {
          baseUrl: self.baseUrl(),
          timeoutMs: Number(self.options.timeout || 180) * 1000,
          pollIntervalMs: Number(self.options.pollInterval ?? 2) * 1000,
          userAgent: `supertext-apostrophe-translation/${self.version}`
        });
      },

      // Commando Center glue (lib/reporting.js): one per process.
      reporting() {
        if (!self.reportingInstance) {
          self.reportingInstance = new Reporting({
            storage: {
              get: () => self.apos.cache.get(STATE_NAMESPACE, STATE_KEY),
              set: (value) => self.apos.cache.set(STATE_NAMESPACE, STATE_KEY, value)
            },
            settings: () => ({
              apiKey: self.apiKey(),
              apiUrl: self.baseUrl(),
              versionReports: self.options.versionReports
            }),
            pluginVersion: () => self.version,
            systemVersion: () => self.apostropheVersion(),
            actionPath: () => self.action,
            userAgent: `supertext-apostrophe-translation/${self.version}`,
            logger: { debug: (message) => (self.apos.util.debug ? self.apos.util.debug(message) : null) }
          });
        }
        return self.reportingInstance;
      },

      // The mapping saved on the Supertext screen (aposCache), {} if none or unreadable.
      async storedLanguages() {
        try {
          const value = await self.apos.cache.get(STATE_NAMESPACE, LANGUAGES_KEY);
          return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (e) {
          return {};
        }
      },

      // The mapping in effect: the screen's, with the `languages` option winning per locale.
      async languages() {
        return mergeLanguages(await self.storedLanguages(), self.options.languages);
      },

      // Saves the screen's choices for the site's locales (validated against Supertext's
      // target codes). Locales set by the `languages` option keep their stored value.
      async saveLanguages(input) {
        const locales = Object.keys(self.apos.i18n.locales);
        const { overridden } = mergeLanguages({}, self.options.languages);
        const editable = Object.fromEntries(Object.entries(input || {}).filter(([ locale ]) => !overridden.includes(locale)));
        const valid = validateLanguages(editable, locales);
        const stored = await self.storedLanguages();
        const next = {};
        for (const locale of overridden) {
          if (stored[locale]) {
            next[locale] = stored[locale];
          }
        }
        Object.assign(next, valid);
        await self.apos.cache.set(STATE_NAMESPACE, LANGUAGES_KEY, next);
        return next;
      },

      versionReports() {
        return versionReportsEnabled(self.options.versionReports);
      },

      apostropheVersion() {
        try {
          return require('apostrophe/package.json').version;
        } catch (e) {
          return null;
        }
      },

      // The site's base URL: Apostrophe's baseUrl (APOS_BASE_URL), else the request's origin;
      // plus Apostrophe's prefix. Null without either (e.g. a task without APOS_BASE_URL).
      siteUrl(req) {
        let origin = null;
        try {
          if (req && typeof req.get === 'function' && req.get('host')) {
            origin = `${req.protocol || 'http'}://${req.get('host')}`;
          }
        } catch (e) {
          origin = null;
        }
        return siteUrl(self.apos.baseUrl, self.apos.prefix, origin);
      },

      // Back-end requests that run the module's code: report an update or a changed key in
      // the background (never on front-end page views; never fails the request).
      reportInBackground(req, action = 'onRequest', httpStatus) {
        try {
          self.reporting().inBackground(action, self.siteUrl(req), httpStatus);
        } catch (e) {
          // Reporting never breaks a request.
        }
      },

      // The key-check message (Commando Center wording) for a stored check.
      keyCheckMessage(req, check) {
        if (!check) {
          return null;
        }
        return req.t(`supertext:keyCheck_${check.status}`, {
          status: check.httpStatus ? `HTTP ${check.httpStatus}` : (check.errorCode || check.status)
        });
      },

      // An SDK error in the editor's language; `locale` / `sourceLocale` name the Apostrophe
      // locales. Other errors keep their own message.
      errorMessage(req, e, { locale = '', sourceLocale = '' } = {}) {
        if (!(e instanceof SupertextError) || !ERROR_CODES.includes(e.code)) {
          return e && e.message ? e.message : String(e);
        }
        const unsupportedSource = e.code === 'unsupported_language' && e.sourceLang && !e.targetLang;
        return req.t(`supertext:error_${e.code}`, {
          locale: unsupportedSource ? sourceLocale : locale,
          detail: e.detail || e.apiErrorCode || '',
          status: e.status || ''
        });
      },

      releaseUrl() {
        return /^\d+\.\d+\.\d+$/.test(self.version) ? `${RELEASES_URL}v${self.version}` : null;
      },

      localeLabel(req, locale) {
        const label = self.apos.i18n.locales[locale]?.label;
        return label ? req.t(label) : locale;
      },

      detach(draft) {
        const manager = self.apos.doc.getManager(draft.type);
        for (const field of manager?.schema || []) {
          const value = draft[field.name];
          if ([ 'area', 'array', 'object' ].includes(field.type) && value && typeof value === 'object') {
            draft[field.name] = structuredClone(value);
          }
        }
      },

      // Units of a document: see lib/collect.js for the field rules.
      units(doc) {
        const manager = self.apos.doc.getManager(doc.type);
        if (!manager) {
          return [];
        }
        return collectUnits(
          doc,
          manager.schema,
          (type) => self.apos.area.getWidgetManager(type)?.schema || null,
          { skipWidgets: self.options.skipWidgets }
        );
      },

      // Translation provider interface (@apostrophecms/translation): translate the copy of
      // a document for the target locale in place, before Apostrophe saves it as a draft.
      async translate(req, provider, draft, source, target, { existing } = {}) {
        // Apostrophe copies the source's fields shallowly: give this copy its own areas,
        // arrays and objects so translating it never changes the source document.
        self.detach(draft);
        const units = self.units(draft);
        if (!units.length) {
          return;
        }
        self.reportInBackground(req);
        let missing;
        try {
          const { languages } = await self.languages();
          missing = await translateUnits(self.client(), units, source, target, languages);
        } catch (e) {
          const auth = e instanceof SupertextError && e.code === 'authentication_failure';
          if (auth) {
            self.reportInBackground(req, 'authenticationFailed', e.status);
          }
          // English for the log, the editor's language for the notification.
          self.apos.util.error(`[supertext] ${draft.title || draft._id} (${source} → ${target}): ${e.message}${auth ? ` ${KEY_HELP}` : ''}`);
          const message = self.errorMessage(req, e, {
            locale: `${self.localeLabel(req, target)} (${target})`,
            sourceLocale: `${self.localeLabel(req, source)} (${source})`
          });
          await self.apos.notify(req, 'supertext:translationFailed', {
            type: 'danger',
            dismiss: true,
            interpolate: {
              title: draft.title || '',
              locale: self.localeLabel(req, target),
              message
            }
          });
          throw self.apos.error('error', message);
        }
        if (missing.length) {
          self.apos.util.warn(`[supertext] ${draft.title} (${target}): no translation returned for ${missing.join(', ')}`);
        }
        if (!existing) {
          self.translateSlug(draft);
        } else {
          await self.keepSlug(draft);
        }
      },

      // Retranslating an existing localization: Apostrophe copies the source's slug; keep
      // the URL the localized document already has.
      async keepSlug(draft) {
        if (!self.options.translateSlugs || !draft._id) {
          return;
        }
        const current = await self.apos.doc.db.findOne({ _id: draft._id }, { projection: { slug: 1 } });
        if (current && typeof current.slug === 'string' && current.slug) {
          draft.slug = current.slug;
        }
      },

      // New localizations: a slug from the translated title. Pages keep their parent's
      // part of the slug; the home page keeps "/". Apostrophe makes slugs unique on save.
      translateSlug(draft) {
        if (!self.options.translateSlugs || !draft.title || typeof draft.slug !== 'string') {
          return;
        }
        const slug = self.apos.util.slugify(draft.title);
        if (!slug) {
          return;
        }
        if (self.apos.page.isPage(draft)) {
          if (draft.slug === '/' || !draft.slug.startsWith('/') || draft.level === 0) {
            return;
          }
          draft.slug = draft.slug.replace(/[^/]*$/, slug);
        } else {
          draft.slug = slug;
        }
      },

      // Translation provider interface: a locale is supported when it has a Supertext code
      // (the mapping, else an exact match, else the SDK's default). Apostrophe's wizard names
      // the others.
      async getSupportedLanguages(req, { source, target } = {}) {
        const all = Object.keys(self.apos.i18n.locales);
        const { languages } = await self.languages();
        const list = (codes, direction) => (codes || all).map((code) => {
          const status = languageStatus(code, languages);
          return {
            code,
            supported: direction === 'source' ? Boolean(status.source) : status.supported
          };
        });
        return {
          source: list(source, 'source'),
          target: list(target, 'target')
        };
      },

      async status(req) {
        const reporting = self.reporting();
        const url = self.siteUrl(req);
        const check = await reporting.lastCheck();
        const stored = await self.storedLanguages();
        const { languages, overridden } = await self.languages();
        return {
          version: self.version,
          releaseUrl: self.releaseUrl(),
          configured: Boolean(self.apiKey()),
          apiKeySource: self.apiKeySource(),
          apiUrl: self.baseUrl(),
          providerActive: self.apos.translation.providers.some((p) => p.name === PROVIDER),
          signupUrl: SIGNUP_URL,
          apiKeyUrl: API_KEY_URL,
          versionReports: self.versionReports(),
          pingUrl: self.versionReports() ? reporting.callbackUrl(url) : null,
          keyCheck: check
            ? {
              status: check.status,
              checkedAt: check.checkedAt,
              message: self.keyCheckMessage(req, check)
            }
            : null,
          // One combo box per locale: the saved code (or the option's, when it overrides),
          // else the SDK's suggestion, else '' ("— choose —").
          languages: Object.entries(self.apos.i18n.locales).map(([ locale, options ]) => {
            const status = languageStatus(locale, languages);
            const isOverridden = overridden.includes(locale);
            const saved = stored[locale] && typeof stored[locale] === 'object' ? stored[locale] : null;
            return {
              ...status,
              label: options.label ? req.t(options.label) : locale,
              overridden: isOverridden,
              saved: Boolean(saved && saved.code),
              selected: isOverridden ? status.code : ((saved && saved.code) || status.suggestion || ''),
              selectedPoliteness: isOverridden
                ? status.politeness
                : (saved && [ 'more', 'less' ].includes(saved.politeness) ? saved.politeness : 'default')
            };
          }),
          targetOptions: Languages.targetOptions().map(({ code, name, politeness }) => ({
            code,
            name,
            politeness
          }))
        };
      },

      // A translation-file error in the editor's language: the glue's FilesError
      // (`files_error_<code>`) or the SDK's TranslationFileError (`files_error_<code>`).
      filesErrorMessage(req, error) {
        const code = error && error.code;
        const params = { ...(error && error.params) };
        if (params.language) {
          params.language = `${self.localeLabel(req, params.language)} (${params.language})`;
        }
        return req.t(`supertext:files_error_${code}`, params);
      },

      // "Export for translation": the file for a document (draft) into one or more locales.
      // Same units as an API translation (self.units), same language mapping.
      async exportFile(req, { _id, format, targets }) {
        // `<aposDocId>:<locale>:<mode>`: look it up in its own locale.
        const id = self.apos.launder.string(_id);
        const [ docId, locale ] = id.split(':');
        const doc = docId && self.apos.i18n.locales[locale]
          ? await self.apos.doc.find(req.clone({
            locale,
            mode: 'draft'
          }), { aposDocId: docId }).toObject()
          : null;
        if (!doc || !doc.aposLocale) {
          throw new FilesError('not_found');
        }
        if (!self.apos.permission.can(req.clone({ locale }), 'edit', doc)) {
          throw new FilesError('forbidden', { language: locale });
        }
        const source = doc.aposLocale.split(':')[0];
        const locales = Object.keys(self.apos.i18n.locales);
        const list = (Array.isArray(targets) ? targets : [ targets ]).map((t) => self.apos.launder.string(t)).filter(Boolean);
        for (const target of list) {
          if (!locales.includes(target)) {
            throw new FilesError('no_language', { language: target });
          }
        }
        const { languages } = await self.languages();
        return buildExport({
          docId: doc.aposDocId,
          source,
          targets: list,
          format: self.apos.launder.select(format, [ 'xliff', 'html' ], 'xliff'),
          units: self.units(structuredClone(doc)),
          languages
        });
      },

      // "Import translation": reads the file, finds each job's document by its reference and
      // writes the accepted translations as a draft in the target locale, through Apostrophe's
      // own localize() like a translation from "Localize..." (beforeLocalize handler below).
      // An existing localization is only replaced with `overwrite`.
      async importTranslationFile(req, content, { includeChanged = false, overwrite = false } = {}) {
        const sources = new Map();
        const results = await importFile(content, {
          locales: Object.keys(self.apos.i18n.locales),
          includeChanged,
          load: async (ref) => {
            const sourceReq = req.clone({
              locale: ref.source,
              mode: 'draft'
            });
            const doc = await self.apos.doc.find(sourceReq, { aposDocId: ref.docId }).toObject();
            if (!doc) {
              return null;
            }
            if (!self.apos.permission.can(sourceReq, 'edit', doc)) {
              throw new FilesError('forbidden', { language: ref.source });
            }
            sources.set(ref, {
              doc,
              req: sourceReq
            });
            return {
              title: doc.title || '',
              units: self.units(structuredClone(doc))
            };
          },
          write: async (ref, translations) => {
            const { doc, req: sourceReq } = sources.get(ref);
            const manager = self.apos.doc.getManager(doc.type);
            if (!manager || typeof manager.isLocalized !== 'function' || !manager.isLocalized()) {
              throw new FilesError('not_found');
            }
            const exists = await self.apos.doc.db.findOne(
              { _id: doc._id.replace(`:${ref.source}:`, `:${ref.target}:`) },
              { projection: { _id: 1 } }
            );
            if (exists && !overwrite) {
              throw new FilesError('exists', { language: ref.target });
            }
            const localizeReq = sourceReq.clone({
              query: {},
              supertextImport: translations
            });
            try {
              await manager.localize(localizeReq, doc, ref.target, { update: Boolean(exists) });
            } catch (e) {
              if (e && e.name === 'forbidden') {
                throw new FilesError('forbidden', { language: ref.target });
              }
              throw new FilesError('localize_failed', { message: e && e.message ? e.message : String(e) });
            }
          }
        });
        return results.map((r) => ({
          ...r,
          localeLabel: r.locale ? self.localeLabel(req, r.locale) : null,
          message: r.error ? self.filesErrorMessage(req, r.error) : null
        }));
      },

      // The localized copy during an import: write the file's translations (unit paths ->
      // text) like `translate()` writes Supertext's, then the same slug rules.
      async applyImport(req, draft, { existing } = {}) {
        self.detach(draft);
        applyTranslations(self.units(draft), req.supertextImport);
        if (!existing) {
          self.translateSlug(draft);
        } else {
          await self.keepSlug(draft);
        }
      },

      getBrowserData(req) {
        return { action: self.action };
      }
    };
  },

  handlers(self) {
    return {
      '@apostrophecms/doc-type:beforeLocalize': {
        // Only for "Import translation" (the request carries the file's translations).
        async supertextImport(req, doc, options) {
          if (req.supertextImport instanceof Map) {
            await self.applyImport(req, doc, options);
          }
        }
      }
    };
  },

  apiRoutes(self) {
    return {
      get: {
        // GET /api/v1/supertext-apostrophe-translation/status (administrators)
        async status(req) {
          if (!self.apos.permission.can(req, ADMIN_PERMISSION.action, ADMIN_PERMISSION.type)) {
            throw self.apos.error('forbidden');
          }
          self.reportInBackground(req);
          return self.status(req);
        }
      },
      post: {
        // POST /api/v1/supertext-apostrophe-translation/languages (administrators; Apostrophe
        // checks the CSRF token of every logged-in POST): saves the language mapping,
        // `{ languages: { <locale>: { code, politeness } } }`, codes checked against
        // Supertext's list. Returns the status screen's data.
        async languages(req) {
          if (!self.apos.permission.can(req, ADMIN_PERMISSION.action, ADMIN_PERMISSION.type)) {
            throw self.apos.error('forbidden');
          }
          try {
            await self.saveLanguages(req.body && req.body.languages);
          } catch (e) {
            if (Array.isArray(e.invalid)) {
              throw self.apos.error('invalid', req.t('supertext:languagesInvalid', { locales: e.invalid.join(', ') || '?' }));
            }
            throw e;
          }
          return self.status(req);
        },
        // POST /api/v1/supertext-apostrophe-translation/test (administrators): checks the
        // API key without translating anything.
        async test(req) {
          if (!self.apos.permission.can(req, ADMIN_PERMISSION.action, ADMIN_PERMISSION.type)) {
            throw self.apos.error('forbidden');
          }
          // The SDK's key check (free: GET features); stored and reported when it changed.
          const result = await self.reporting().run('testConnection', self.siteUrl(req));
          const check = result && result.check;
          if (!check) {
            return {
              ok: false,
              status: 'error',
              message: req.t('supertext:keyCheck_error', { status: '?' })
            };
          }
          return {
            ok: check.status === 'ok',
            status: check.status,
            checkedAt: check.checkedAt,
            message: self.keyCheckMessage(req, check)
          };
        }
      }
    };
  },

  routes(self) {
    // Errors of the file routes as Apostrophe's JSON errors (`message` shown in the modal).
    const fail = (res, status, message) => res.status(status).json({
      name: status === 403 ? 'forbidden' : 'invalid',
      message
    });
    const filesFailure = (req, res, e) => {
      if (e instanceof FilesError || e instanceof TranslationFileError) {
        const status = e.code === 'forbidden' ? 403 : (e.code === 'too_large' ? 413 : 400);
        return fail(res, status, self.filesErrorMessage(req, e));
      }
      self.apos.util.error(`[supertext] translation file: ${e && e.stack ? e.stack : e}`);
      return fail(res, 500, e && e.message ? e.message : String(e));
    };
    return {
      post: {
        // POST /api/v1/supertext-apostrophe-translation/export, JSON
        // `{ _id, format: 'xliff'|'html', targets: [locale…] }` (logged in; Apostrophe checks
        // the CSRF token): the file as a download (Content-Disposition: attachment).
        async export(req, res) {
          if (!req.user) {
            return fail(res, 403, 'forbidden');
          }
          try {
            self.reportInBackground(req);
            const file = await self.exportFile(req, req.body || {});
            res.set({
              'Content-Type': file.contentType,
              'Content-Disposition': `attachment; filename="${file.filename}"`,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff'
            });
            return res.send(file.content);
          } catch (e) {
            return filesFailure(req, res, e);
          }
        },
        // POST /api/v1/supertext-apostrophe-translation/import?includeChanged=1&overwrite=1,
        // body: the file itself (text, at most 10 MB; refused before reading when larger).
        // Parsed in memory, never stored. Returns `{ jobs: [summary…] }`.
        async import(req, res) {
          if (!req.user) {
            return fail(res, 403, 'forbidden');
          }
          try {
            self.reportInBackground(req);
            const content = await readBody(req, MAX_UPLOAD_BYTES);
            const jobs = await self.importTranslationFile(req, content, {
              includeChanged: self.apos.launder.boolean(req.query.includeChanged),
              overwrite: self.apos.launder.boolean(req.query.overwrite)
            });
            return res.json({ jobs });
          } catch (e) {
            return filesFailure(req, res, e);
          }
        }
      },
      get: {
        // GET /api/v1/supertext-apostrophe-translation/ping?challenge=… : the Commando
        // Center's reachability check. Public (no login, session or CSRF token), never cached,
        // answers only while version reports are on (404 otherwise). Body and headers come
        // from Plugin Health's pingResponse: nothing but the plugin name and a valid challenge.
        ping(req, res) {
          let answer;
          try {
            answer = self.reporting().ping(req.query && req.query.challenge);
          } catch (e) {
            answer = {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
              },
              body: '{"ok":false}'
            };
          }
          res.status(answer.status);
          res.set(answer.headers);
          res.send(answer.body);
        }
      }
    };
  },

  tasks(self) {
    return {
      check: {
        usage: 'Shows the version and API address and checks the Supertext API key (no cost).\nUsage: node app supertext-apostrophe-translation:check',
        async task() {
          const release = self.releaseUrl();
          console.log(`Supertext Translation for Apostrophe ${self.version}${release ? ` (${release})` : ''}`);
          console.log(`API address: ${self.baseUrl()}`);
          console.log(`Supertext SDK: ${SDK_VERSION}`);
          const { languages, overridden } = await self.languages();
          for (const [ locale ] of Object.entries(self.apos.i18n.locales)) {
            const language = languageStatus(locale, languages);
            const origin = overridden.includes(locale) ? ' (module option languages)' : (language.defaulted ? ' (default)' : '');
            console.log(`Locale ${locale}: ${language.code
              ? `${language.code}${origin}${language.politeness !== 'default' ? ` (politeness ${language.politeness})` : ''}${language.known ? '' : ' (not in Supertext\'s list)'}`
              : language.source
                ? `source only (${language.source}); to translate into it, choose its Supertext language on the Supertext screen (admin bar)`
                : 'no Supertext language: choose one on the Supertext screen (admin bar)'}`);
          }
          const url = self.siteUrl(null);
          if (!self.apiKey()) {
            console.log('No API key. Set the SUPERTEXT_API_KEY environment variable.');
            console.log(KEY_HELP);
            process.exitCode = 1;
          } else {
            try {
              await self.client().validateApiKey();
              console.log('Connected. The API key works.');
            } catch (e) {
              console.log(e.code === 'authentication_failure' ? `${e.message} ${KEY_HELP}` : e.message);
              process.exitCode = 1;
            }
          }
          // Commando Center: store the key check and send a `check` report.
          if (!self.versionReports()) {
            console.log('Version reports: off (versionReports: false or SUPERTEXT_VERSION_REPORTS=0).');
            return;
          }
          if (!url) {
            console.log('Version reports: on, but not sent from this task: set APOS_BASE_URL (Apostrophe\'s baseUrl).');
            return;
          }
          const reporting = self.reporting();
          let result = await reporting.run('testConnection', url);
          if (!result || !result.sent) {
            result = await reporting.run('reportCheck', url);
          }
          console.log(`Version report: ${result && result.sent ? `sent (${result.event})` : 'not sent'}, ping address ${reporting.callbackUrl(url)}`);
        }
      },
      translate: {
        usage: 'Localizes a page or piece into other locales and translates it with Supertext (as drafts).\n' +
          'Usage: node app supertext-apostrophe-translation:translate --slug=/about [--type=article] [--from=en] [--to=de,fr] [--overwrite]',
        async task(argv) {
          const locales = Object.keys(self.apos.i18n.locales);
          const from = argv.from || self.apos.i18n.defaultLocale;
          const to = argv.to ? String(argv.to).split(',').map((s) => s.trim()).filter(Boolean) : locales.filter((l) => l !== from);
          const req = self.apos.task.getReq({
            locale: from,
            mode: 'draft'
          });
          const criteria = { slug: String(argv.slug || '') };
          if (argv.type) {
            criteria.type = String(argv.type);
          }
          await self.reporting().run('onRequest', self.siteUrl(null));
          const doc = await self.apos.doc.find(req, criteria).toObject();
          if (!doc) {
            console.log(`Not found: ${JSON.stringify(criteria)} in ${from}. Use --slug (and --type for pieces).`);
            process.exitCode = 1;
            return;
          }
          const manager = self.apos.doc.getManager(doc.type);
          let failed = false;
          for (const target of to) {
            if (!locales.includes(target) || target === from) {
              console.log(`${target}: skipped (not another locale of this site)`);
              continue;
            }
            const localeReq = req.clone({
              query: {
                aposTranslateTargets: [ target ],
                aposTranslateProvider: PROVIDER
              }
            });
            try {
              const exists = await self.apos.doc.db.findOne({ _id: doc._id.replace(`:${from}:`, `:${target}:`) });
              if (exists && !argv.overwrite) {
                console.log(`${target}: skipped (already localized; use --overwrite)`);
                continue;
              }
              const result = await manager.localize(localeReq, doc, target, { update: Boolean(argv.overwrite) });
              console.log(`${target}: translated ${result.slug}`);
            } catch (e) {
              failed = true;
              console.log(`${target}: error (${e.message})`);
            }
          }
          if (failed) {
            process.exitCode = 1;
          }
        }
      }
    };
  }
};
