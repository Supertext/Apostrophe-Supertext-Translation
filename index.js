'use strict';

/**
 * Supertext Translation for ApostropheCMS.
 *
 * Registers Supertext as a translation provider for Apostrophe's own "Localize…" workflow
 * (`@apostrophecms/translation`): the wizard then offers "Translate text with Supertext",
 * and every document copied into another locale (single or batch localization) is
 * translated before it is saved as a draft. Adds a Supertext status screen for
 * administrators and the tasks `check` and `translate`.
 */

const { SupertextClient, SupertextError, baseUrlFor, normalizeKey } = require('./lib/client');
const { collectUnits } = require('./lib/collect');
const { languageCode, politeness, translateUnits } = require('./lib/translate');
const { version } = require('./package.json');

const SIGNUP_URL = 'https://www.supertext.com/person/en/account/signin';
const API_KEY_URL = 'https://www.supertext.com/en/integrations/api';
const RELEASES_URL = 'https://github.com/Supertext/Apostrophe-Supertext-Translation/releases/tag/';
const KEY_HELP = `No Supertext account yet? Create one at ${SIGNUP_URL}. ` +
  `Generate your API key at supertext.com → Integrations → API (requires the Admin role): ${API_KEY_URL}`;
const PROVIDER = 'supertext';
const ADMIN_PERMISSION = {
  action: 'edit',
  type: '@apostrophecms/user'
};

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
    // Per locale: { code: 'de-CH', politeness: 'more' | 'less' }
    languages: {},
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
        return new SupertextClient({
          apiKey: self.apiKey(),
          baseUrl: self.baseUrl(),
          timeoutMs: Number(self.options.timeout || 180) * 1000,
          pollIntervalMs: Number(self.options.pollInterval ?? 2) * 1000
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
        let missing;
        try {
          missing = await translateUnits(self.client(), units, source, target, self.options.languages);
        } catch (e) {
          const message = e instanceof SupertextError && e.code === 'authentication_failure'
            ? `${e.message} ${KEY_HELP}`
            : e.message;
          self.apos.util.error(`[supertext] ${draft.title || draft._id} (${source} → ${target}): ${message}`);
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

      // Translation provider interface: Supertext translates between all the site's
      // locales (codes are mapped with the `languages` option).
      async getSupportedLanguages(req, { source, target } = {}) {
        const all = Object.keys(self.apos.i18n.locales);
        const list = (codes) => (codes || all).map((code) => ({
          code,
          supported: true
        }));
        return {
          source: list(source),
          target: list(target)
        };
      },

      status(req) {
        return {
          version: self.version,
          releaseUrl: self.releaseUrl(),
          configured: Boolean(self.apiKey()),
          apiKeySource: self.apiKeySource(),
          apiUrl: self.baseUrl(),
          providerActive: self.apos.translation.providers.some((p) => p.name === PROVIDER),
          signupUrl: SIGNUP_URL,
          apiKeyUrl: API_KEY_URL,
          languages: Object.entries(self.apos.i18n.locales).map(([ locale, options ]) => ({
            locale,
            label: options.label ? req.t(options.label) : locale,
            code: languageCode(locale, self.options.languages),
            politeness: politeness(locale, self.options.languages)
          }))
        };
      },

      getBrowserData(req) {
        return { action: self.action };
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
          return self.status(req);
        }
      },
      post: {
        // POST /api/v1/supertext-apostrophe-translation/test (administrators): checks the
        // API key without translating anything.
        async test(req) {
          if (!self.apos.permission.can(req, ADMIN_PERMISSION.action, ADMIN_PERMISSION.type)) {
            throw self.apos.error('forbidden');
          }
          if (!self.apiKey()) {
            return {
              ok: false,
              message: req.t('supertext:noApiKey')
            };
          }
          try {
            await self.client().validateApiKey();
            return {
              ok: true,
              message: req.t('supertext:connected')
            };
          } catch (e) {
            return {
              ok: false,
              message: e.message
            };
          }
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
          if (!self.apiKey()) {
            console.log('No API key. Set the SUPERTEXT_API_KEY environment variable.');
            console.log(KEY_HELP);
            process.exitCode = 1;
            return;
          }
          try {
            await self.client().validateApiKey();
            console.log('Connected. The API key works.');
          } catch (e) {
            console.log(e.code === 'authentication_failure' ? `${e.message} ${KEY_HELP}` : e.message);
            process.exitCode = 1;
          }
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
