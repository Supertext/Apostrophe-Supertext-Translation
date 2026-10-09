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
              <dd><code>{{ status.apiUrl }}</code></dd>
              <dt>{{ $t('supertext:automaticTranslation') }}</dt>
              <dd>{{ $t(status.providerActive ? 'supertext:on' : 'supertext:off') }}</dd>
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
              >{{ result.message }}</span>
            </div>
            <h3 class="supertext-status__heading">
              {{ $t('supertext:languages') }}
            </h3>
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
                >
                  <td>{{ language.label }} <span class="supertext-status__muted">({{ language.locale }})</span></td>
                  <td><code>{{ language.code }}</code></td>
                  <td>{{ $t(addressKey(language.politeness)) }}</td>
                </tr>
              </tbody>
            </table>
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
      error: null,
      testing: false,
      result: null
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
    }
  },
  async mounted() {
    this.modal.active = true;
    try {
      this.status = await apos.http.get(`${this.action}/status`, { busy: true });
    } catch (e) {
      this.error = e.body?.message || e.message || String(e);
    }
  },
  methods: {
    close() {
      this.modal.showModal = false;
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
