<template>
  <AposModal
    class="supertext-status"
    :modal="modal"
    :modal-title="$t('supertext:title')"
    @esc="close"
    @inactive="modal.active = false"
    @show-modal="modal.showModal = true"
  >
    <template #secondaryControls>
      <AposButton
        type="default"
        label="supertext:close"
        @click="close"
      />
    </template>
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <div
            v-if="status"
            class="supertext-status__body"
          >
            <p class="supertext-status__intro">
              {{ $t('supertext:intro') }}
            </p>
            <dl class="supertext-status__list">
              <dt>{{ $t('supertext:version') }}</dt>
              <dd>
                <a
                  v-if="status.releaseUrl"
                  :href="status.releaseUrl"
                  target="_blank"
                  rel="noopener"
                >{{ status.version }}</a>
                <span v-else>{{ status.version }}</span>
              </dd>
              <dt>{{ $t('supertext:apiKey') }}</dt>
              <dd :class="{ 'supertext-status__warn': !status.configured }">
                {{ keyText }}
              </dd>
              <dt>{{ $t('supertext:apiAddress') }}</dt>
              <dd><code class="supertext-api-url">{{ status.apiUrl }}</code></dd>
              <dt>{{ $t('supertext:automaticTranslation') }}</dt>
              <dd>{{ $t(status.providerActive ? 'supertext:on' : 'supertext:off') }}</dd>
              <dt>{{ $t('supertext:keyCheck') }}</dt>
              <dd class="supertext-key-check">
                <template v-if="keyCheck">
                  <span :class="keyCheck.status === 'ok' ? 'supertext-status__ok' : 'supertext-status__warn'">
                    <template
                      v-for="(part, i) in linkParts(keyCheck.message)"
                      :key="i"
                    >
                      <a
                        v-if="part.href"
                        :href="part.href"
                        target="_blank"
                        rel="noopener"
                      >{{ part.text }}</a>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                  <span
                    v-if="keyCheck.checkedAt"
                    class="supertext-status__muted supertext-status__block"
                  >{{ $t('supertext:keyCheckAt', { time: formatTime(keyCheck.checkedAt) }) }}</span>
                </template>
                <span
                  v-else
                  class="supertext-status__muted"
                >{{ $t('supertext:keyCheckNone') }}</span>
              </dd>
              <dt>{{ $t('supertext:versionReports') }}</dt>
              <dd class="supertext-version-reports">
                {{ $t(status.versionReports ? 'supertext:on' : 'supertext:versionReportsOff') }}
                <span class="supertext-status__muted supertext-status__block">{{ $t('supertext:versionReportsHelp') }}</span>
              </dd>
              <template v-if="status.pingUrl">
                <dt>{{ $t('supertext:pingUrl') }}</dt>
                <dd><code class="supertext-ping-url">{{ status.pingUrl }}</code></dd>
              </template>
            </dl>
            <p class="supertext-status__links">
              {{ $t('supertext:signupLead') }}
              <a
                :href="status.signupUrl"
                target="_blank"
                rel="noopener"
              >{{ $t('supertext:signup') }}</a>
              <a
                :href="status.apiKeyUrl"
                target="_blank"
                rel="noopener"
              >{{ $t('supertext:apiKeyLink') }}</a>
            </p>
            <div class="supertext-status__test">
              <AposButton
                type="primary"
                class="supertext-test"
                :label="testing ? 'supertext:testing' : 'supertext:test'"
                :disabled="testing || !status.configured"
                @click="test"
              />
              <span
                v-if="result"
                class="supertext-test-result"
                :class="result.ok ? 'supertext-status__ok' : 'supertext-status__warn'"
              >
                <template
                  v-for="(part, i) in linkParts(result.message)"
                  :key="i"
                >
                  <a
                    v-if="part.href"
                    :href="part.href"
                    target="_blank"
                    rel="noopener"
                  >{{ part.text }}</a>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
            </div>
            <h3 class="supertext-status__heading">
              {{ $t('supertext:languages') }}
            </h3>
            <p class="supertext-status__muted supertext-status__help supertext-status__lead">
              {{ $t('supertext:mappingHelp') }}
            </p>
            <form
              class="supertext-languages"
              @submit.prevent="saveLanguages"
            >
              <table class="supertext-status__table">
                <thead>
                  <tr>
                    <th>{{ $t('supertext:locale') }}</th>
                    <th>{{ $t('supertext:supertextLanguage') }}</th>
                    <th>{{ $t('supertext:formOfAddress') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="language in status.languages"
                    :key="language.locale"
                    :class="`supertext-language--${language.locale}`"
                  >
                    <td>{{ language.label }} <span class="supertext-status__muted">({{ language.locale }})</span></td>
                    <td>
                      <AposSelect
                        class="supertext-language-code"
                        :choices="codeChoices"
                        :selected="form[language.locale].code"
                        :disabled="language.overridden || saving"
                        @change="(value) => setCode(language.locale, value)"
                      />
                      <span
                        v-if="language.overridden"
                        class="supertext-status__muted supertext-status__block"
                      >{{ $t('supertext:overridden') }}</span>
                      <span
                        v-else-if="!form[language.locale].code"
                        class="supertext-status__warn supertext-status__block supertext-unmapped"
                      >{{ $t(language.source ? 'supertext:sourceOnly' : 'supertext:notMapped') }}</span>
                      <span
                        v-else-if="!language.saved && form[language.locale].code === language.suggestion"
                        class="supertext-status__muted supertext-status__block"
                      >{{ $t('supertext:suggested') }}</span>
                      <span
                        v-if="language.overridden && language.code && !language.known"
                        class="supertext-status__warn supertext-status__block"
                      >{{ $t('supertext:notInList') }}</span>
                    </td>
                    <td>
                      <AposSelect
                        v-if="offersPoliteness(form[language.locale].code)"
                        class="supertext-language-politeness"
                        :choices="politenessChoices"
                        :selected="form[language.locale].politeness"
                        :disabled="language.overridden || saving"
                        @change="(value) => form[language.locale].politeness = value"
                      />
                      <span v-else-if="language.politenessIgnored">{{ $t('supertext:politenessNotOffered') }}</span>
                      <span
                        v-else
                        class="supertext-status__muted"
                      >{{ $t('supertext:defaultAddress') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="supertext-status__test">
                <AposButton
                  type="primary"
                  class="supertext-save-languages"
                  :label="saving ? 'supertext:saving' : 'supertext:saveLanguages'"
                  :disabled="saving"
                  @click="saveLanguages"
                />
                <span
                  v-if="saveResult"
                  class="supertext-save-result"
                  :class="saveResult.ok ? 'supertext-status__ok' : 'supertext-status__warn'"
                >{{ saveResult.message }}</span>
              </div>
            </form>
          </div>
          <p
            v-else-if="error"
            class="supertext-status__warn"
          >
            {{ error }}
          </p>
        </template>
      </AposModalBody>
    </template>
  </AposModal>
</template>

<script>
export default {
  name: 'SupertextStatusModal',
  props: {
    moduleName: {
      type: String,
      required: true
    }
  },
  emits: [ 'safe-close' ],
  data() {
    return {
      modal: {
        active: false,
        type: 'slide',
        showModal: false,
        width: 'two-thirds'
      },
      status: null,
      keyCheck: null,
      error: null,
      testing: false,
      result: null,
      form: {},
      saving: false,
      saveResult: null
    };
  },
  computed: {
    action() {
      return apos.modules[this.moduleName].action;
    },
    keyText() {
      if (this.status.apiKeySource === 'environment') {
        return this.$t('supertext:keyFromEnvironment');
      }
      if (this.status.apiKeySource === 'option') {
        return this.$t('supertext:keyFromOption');
      }
      return this.$t('supertext:keyMissing');
    },
    // Supertext's target codes, "Name (code)" with the name in the interface language where
    // the browser knows it (Intl.DisplayNames), sorted by that name.
    codeChoices() {
      const lang = document.documentElement.lang || undefined;
      let names = null;
      try {
        names = new Intl.DisplayNames(lang ? [ lang ] : undefined, {
          type: 'language',
          fallback: 'none'
        });
      } catch (e) {
        names = null;
      }
      const label = (option) => {
        let name = null;
        // Dialect codes (gsw-u-sd-…) would lose the dialect: keep Supertext's name.
        if (names && !option.code.includes('-u-')) {
          try {
            name = names.of(option.code);
          } catch (e) {
            name = null;
          }
        }
        return `${name || option.name} (${option.code})`;
      };
      const choices = (this.status?.targetOptions || [])
        .map((option) => ({
          label: label(option),
          value: option.code
        }))
        .sort((a, b) => a.label.localeCompare(b.label, lang));
      return [ {
        label: this.$t('supertext:choose'),
        value: ''
      }, ...choices ];
    },
    politenessChoices() {
      return [
        {
          label: this.$t('supertext:defaultAddress'),
          value: 'default'
        },
        {
          label: this.$t('supertext:formal'),
          value: 'more'
        },
        {
          label: this.$t('supertext:informal'),
          value: 'less'
        }
      ];
    }
  },
  async mounted() {
    this.modal.active = true;
    try {
      this.setStatus(await apos.http.get(`${this.action}/status`, { busy: true }));
      this.keyCheck = this.status.keyCheck;
    } catch (e) {
      this.error = e.body?.message || e.message || String(e);
    }
  },
  methods: {
    setStatus(status) {
      this.status = status;
      this.form = Object.fromEntries(status.languages.map((language) => [ language.locale, {
        code: language.selected || '',
        politeness: language.selectedPoliteness || 'default'
      } ]));
    },
    offersPoliteness(code) {
      return Boolean(code && (this.status.targetOptions || []).find((option) => option.code === code)?.politeness);
    },
    setCode(locale, code) {
      this.form[locale].code = code;
      if (!this.offersPoliteness(code)) {
        this.form[locale].politeness = 'default';
      }
    },
    async saveLanguages() {
      this.saving = true;
      this.saveResult = null;
      const languages = {};
      for (const language of this.status.languages) {
        if (!language.overridden) {
          languages[language.locale] = { ...this.form[language.locale] };
        }
      }
      try {
        const keyCheck = this.keyCheck;
        this.setStatus(await apos.http.post(`${this.action}/languages`, { body: { languages } }));
        this.keyCheck = keyCheck;
        this.saveResult = {
          ok: true,
          message: this.$t('supertext:languagesSaved')
        };
      } catch (e) {
        this.saveResult = {
          ok: false,
          message: e.body?.message || e.message || String(e)
        };
      } finally {
        this.saving = false;
      }
    },
    close() {
      this.modal.showModal = false;
    },
    // Key-check messages name "supertext.com" and "supertext.com → Integrations → API"
    // (untranslated in every language): link them, in a new tab.
    linkParts(text) {
      const links = {
        'supertext.com → Integrations → API': this.status.apiKeyUrl,
        'supertext.com': this.status.signupUrl
      };
      return String(text || '')
        .split(/(supertext\.com → Integrations → API|supertext\.com(?![\w/-]|\.\w))/)
        .filter((part) => part !== '')
        .map((part) => ({
          text: part,
          href: links[part] || null
        }));
    },
    formatTime(iso) {
      try {
        return new Date(iso).toLocaleString(document.documentElement.lang || undefined);
      } catch (e) {
        return iso;
      }
    },
    addressKey(politeness) {
      if (politeness === 'more') {
        return 'supertext:formal';
      }
      if (politeness === 'less') {
        return 'supertext:informal';
      }
      return 'supertext:defaultAddress';
    },
    async test() {
      this.testing = true;
      this.result = null;
      try {
        this.result = await apos.http.post(`${this.action}/test`, { body: {} });
        if (this.result.checkedAt) {
          this.keyCheck = {
            status: this.result.status,
            checkedAt: this.result.checkedAt,
            message: this.result.message
          };
        }
      } catch (e) {
        this.result = {
          ok: false,
          message: e.body?.message || e.message || String(e)
        };
      } finally {
        this.testing = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.supertext-status__body {
  @include type-base;

  max-width: 720px;
  padding: 10px 0;
}

.supertext-status__intro {
  margin: 0 0 20px;
  line-height: 1.5;
}

.supertext-status__list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 10px 24px;
  margin: 0 0 20px;

  dt {
    font-weight: var(--a-weight-bold);
  }

  dd {
    margin: 0;
  }
}

.supertext-status__links a {
  display: block;
  margin-top: 4px;
  color: var(--a-primary);
}

.supertext-status__test {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 20px 0 30px;
}

.supertext-status__heading {
  @include type-title;

  margin: 0 0 10px;
}

.supertext-status__table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--a-base-9);
    text-align: left;
  }
}

.supertext-status__block {
  display: block;
  margin-top: 4px;
}

.supertext-status__help {
  margin: 12px 0 0;
  line-height: 1.5;
}

.supertext-status__lead {
  margin: 0 0 12px;
}

.supertext-status__table td {
  vertical-align: top;
}

.supertext-language-code {
  min-width: 260px;
}

.supertext-status__muted {
  color: var(--a-base-4);
}

.supertext-status__ok {
  color: var(--a-success);
}

.supertext-status__warn {
  color: var(--a-danger);
}
</style>
