// Demo piece type: articles with a localized title, summary and body.
export default {
  extend: '@apostrophecms/piece-type',
  options: {
    label: 'Article',
    pluralLabel: 'Articles'
  },
  fields: {
    add: {
      summary: {
        type: 'string',
        label: 'Summary',
        textarea: true
      },
      body: {
        type: 'area',
        label: 'Body',
        options: {
          widgets: {
            '@apostrophecms/rich-text': {},
            '@apostrophecms/image': {}
          }
        }
      }
    },
    group: {
      basics: {
        label: 'Basics',
        fields: [ 'title', 'summary', 'body' ]
      }
    }
  }
};
