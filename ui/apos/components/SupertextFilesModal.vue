<template>
  <AposModal
    class="supertext-files"
    :modal="modal"
    :modal-title="$t(mode === 'export' ? 'supertext:files_exportAction' : 'supertext:files_importAction')"
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
    <template #primaryControls>
      <AposButton
        v-if="mode === 'export'"
        type="primary"
        class="supertext-files-download"
        label="supertext:files_download"
        :disabled="busy || !targets.length"
        @click="download"
      />
      <AposButton
        v-else
        type="primary"
        class="supertext-files-import"
        label="supertext:files_importAction"
        :disabled="busy || !file"
        @click="upload"
      />
    </template>
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <div class="supertext-files__body">
            <p class="supertext-files__intro">
              {{ $t(mode === 'export' ? 'supertext:files_exportIntro' : 'supertext:files_importIntro') }}
            </p>
            <template v-if="mode === 'export'">
              <p
                v-if="title"
                class="supertext-files__item"
              >
                <strong>{{ title }}</strong>
                <span class="supertext-files__muted"> ({{ localeLabel(source) }})</span>
              </p>
              <fieldset class="supertext-files__group supertext-files-format">
                <legend>{{ $t('supertext:files_format') }}</legend>
                <label
                  v-for="option in formats"
                  :key="option.value"
                  class="supertext-files__choice"
                >
                  <input
                    v-model="format"
                    type="radio"
                    name="supertext-format"
                    :value="option.value"
                    @change="formatChanged"
                  >
                  {{ $t(option.label) }}
                </label>
              </fieldset>
              <fieldset class="supertext-files__group supertext-files-targets">
                <legend>{{ $t('supertext:files_targets') }}</legend>
                <label
                  v-for="locale in targetLocales"
                  :key="locale.name"
                  class="supertext-files__choice"
                >
                  <input
                    :type="format === 'html' ? 'radio' : 'checkbox'"
                    name="supertext-target"
                    :value="locale.name"
                    :checked="targets.includes(locale.name)"
                    @change="(event) => toggleTarget(locale.name, event.target.checked)"
                  >
                  {{ locale.label }} <span class="supertext-files__muted">({{ locale.name }})</span>
                </label>
              </fieldset>
            </template>
            <template v-else>
              <label class="supertext-files__group supertext-files__field">
                <span class="supertext-files__label">{{ $t('supertext:files_file') }}</span>
                <input
                  class="supertext-files-file"
                  type="file"
                  accept=".xlf,.xliff,.xml,.html,.htm"
                  @change="chooseFile"
                >
              </label>
              <label class="supertext-files__choice">
                <input
                  v-model="includeChanged"
                  class="supertext-files-include-changed"
                  type="checkbox"
                >
                {{ $t('supertext:files_includeChanged') }}
              </label>
              <label class="supertext-files__choice">
                <input
                  v-model="overwrite"
                  class="supertext-files-overwrite"
                  type="checkbox"
                >
                {{ $t('supertext:files_overwrite') }}
              </label>
            </template>
            <p
              v-if="error"
              class="supertext-files__warn supertext-files-error"
            >
              {{ error }}
            </p>
            <div
              v-if="jobs"
              class="supertext-files-summary"
            >
              <div
                v-for="(job, i) in jobs"
                :key="i"
                class="supertext-files__job"
              >
                <p class="supertext-files__heading">
                  {{ job.title || job.reference }}
                  <span
                    v-if="job.locale"
                    class="supertext-files__muted"
                  >→ {{ job.localeLabel || job.locale }} ({{ job.locale }})</span>
                </p>
                <p
                  v-if="job.message"
                  class="supertext-files__warn"
                >
                  {{ job.message }}
                </p>
                <ul class="supertext-files__counts">
                  <li :class="{ 'supertext-files__ok': job.imported }">
                    {{ $t('supertext:files_summaryOk', { count: job.imported }) }}
                  </li>
                  <li v-if="job.skippedChanged">
                    {{ $t('supertext:files_summaryChanged', { count: job.skippedChanged }) }}
                  </li>
                  <li v-if="job.counts.untranslated">
                    {{ $t('supertext:files_summaryUntranslated', { count: job.counts.untranslated }) }}
                  </li>
                  <li v-if="job.counts.invalid_markup">
                    {{ $t('supertext:files_summaryInvalid', { count: job.counts.invalid_markup }) }}
                  </li>
                  <li v-if="job.counts.missing">
                    {{ $t('supertext:files_summaryMissing', { count: job.counts.missing }) }}
                  </li>
                </ul>
                <p
                  v-if="job.saved"
                  class="supertext-files__muted"
                >
                  {{ $t('supertext:files_savedAsDraft', { locale: job.localeLabel || job.locale }) }}
                </p>
              </div>
            </div>
          </div>
        </template>
      </AposModalBody>
    </template>
  </AposModal>
</template>

<script>
// "Export for translation" and "Import translation" (document menu): one modal, `mode`
// picks which. Server side: the routes export and import of the module (lib/files.js).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default {
  name: 'SupertextFilesModal',
  props: {
    moduleName: {
      type: String,
      required: true
    },
    mode: {
      type: String,
      default: 'export'
    },
    doc: {
      type: Object,
      default: null
    }
  },
  emits: [ 'safe-close' ],
  data() {
    return {
      modal: {
        active: false,
        type: 'slide',
        showModal: false,
        width: 'half'
      },
      format: 'xliff',
      targets: [],
      file: null,
      includeChanged: false,
      overwrite: false,
      busy: false,
      error: null,
      jobs: null
    };
  },
  computed: {
    action() {
      return apos.modules[this.moduleName].action;
    },
    title() {
      return this.doc?.title || '';
    },
    source() {
      return String(this.doc?.aposLocale || apos.i18n.locale || '').split(':')[0];
    },
    formats() {
      return [
        {
          value: 'xliff',
          label: 'supertext:files_formatXliff'
        },
        {
          value: 'html',
          label: 'supertext:files_formatHtml'
        }
      ];
    },
    targetLocales() {
      return Object.entries(apos.i18n.locales || {})
        .filter(([ name ]) => name !== this.source)
        .map(([ name, options ]) => ({
          name,
          label: this.localeLabel(name, options)
        }));
    }
  },
  mounted() {
    this.modal.active = true;
  },
  methods: {
    localeLabel(name, options = (apos.i18n.locales || {})[name]) {
      return options?.label ? this.$t(options.label) : name;
    },
    formatChanged() {
      if (this.format === 'html' && this.targets.length > 1) {
        this.targets = this.targets.slice(0, 1);
      }
    },
    toggleTarget(name, checked) {
      if (this.format === 'html') {
        this.targets = checked ? [ name ] : [];
      } else if (checked) {
        this.targets = [ ...new Set([ ...this.targets, name ]) ];
      } else {
        this.targets = this.targets.filter((t) => t !== name);
      }
    },
    async download() {
      this.busy = true;
      this.error = null;
      try {
        const response = await apos.http.post(`${this.action}/export`, {
          body: {
            _id: this.doc?._id,
            format: this.format,
            targets: this.targets
          },
          fullResponse: true,
          busy: true
        });
        const disposition = response.headers?.['content-disposition'] || '';
        const name = (disposition.match(/filename="([^"]+)"/) || [])[1] ||
          `apostrophe.${this.format === 'html' ? 'html' : 'xlf'}`;
        const type = response.headers?.['content-type'] || 'application/octet-stream';
        const url = URL.createObjectURL(new Blob([ response.body ], { type }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        this.error = e.body?.message || e.message || String(e);
      } finally {
        this.busy = false;
      }
    },
    chooseFile(event) {
      this.file = event.target.files?.[0] || null;
      this.error = null;
      this.jobs = null;
    },
    async upload() {
      if (!this.file) {
        return;
      }
      this.error = null;
      this.jobs = null;
      // Refused before reading, like on the server.
      if (this.file.size > MAX_UPLOAD_BYTES) {
        this.error = this.$t('supertext:files_error_too_large');
        return;
      }
      this.busy = true;
      try {
        const content = await this.file.text();
        const result = await apos.http.post(`${this.action}/import`, {
          qs: {
            includeChanged: this.includeChanged ? '1' : '0',
            overwrite: this.overwrite ? '1' : '0'
          },
          body: content,
          busy: true
        });
        this.jobs = result.jobs || [];
      } catch (e) {
        this.error = e.body?.message || e.message || String(e);
      } finally {
        this.busy = false;
      }
    },
    close() {
      this.modal.showModal = false;
    }
  }
};
</script>

<style lang="scss" scoped>
.supertext-files__body {
  @include type-base;

  max-width: 640px;
  padding: 10px 0;
}

.supertext-files__intro {
  margin: 0 0 16px;
  line-height: 1.5;
}

.supertext-files__item {
  margin: 0 0 16px;
}

.supertext-files__group {
  margin: 0 0 16px;
  padding: 0;
  border: 0;

  legend {
    margin-bottom: 6px;
    font-weight: var(--a-weight-bold);
  }
}

.supertext-files__field {
  display: block;
}

.supertext-files__label {
  display: block;
  margin-bottom: 6px;
  font-weight: var(--a-weight-bold);
}

.supertext-files__choice {
  display: block;
  margin: 4px 0;
  line-height: 1.5;

  input {
    margin-right: 6px;
  }
}

.supertext-files__heading {
  margin: 20px 0 6px;
  font-weight: var(--a-weight-bold);
}

.supertext-files__counts {
  margin: 0 0 6px;
  padding-left: 18px;
  line-height: 1.6;
}

.supertext-files__muted {
  color: var(--a-base-4);
}

.supertext-files__ok {
  color: var(--a-success);
}

.supertext-files__warn {
  color: var(--a-danger);
}
</style>
