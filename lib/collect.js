'use strict';

/**
 * Finds the translatable texts of an Apostrophe document by walking its schema.
 * No Apostrophe dependencies: the caller passes the schema and a widget schema lookup.
 *
 * Field rules:
 * - `string` fields (also `textarea: true`): one plain-text unit.
 * - `area` fields: every widget. Rich text widgets (`@apostrophecms/rich-text`): one unit
 *   per paragraph, heading, list item or table cell, formatting and links kept as tags.
 *   Other widgets: their own schema, the same rules.
 * - `array` and `object` fields: their sub-schema, the same rules.
 * - Fields with `translate: false`, and every other field type (slug, select, relationship,
 *   url, email, date, attachment, oembed, …) are left alone.
 */

const { textUnit, richTextUnits } = require('./document');

const RICH_TEXT = '@apostrophecms/rich-text';

/**
 * @param {object} doc the document (modified later by the units' `apply`)
 * @param {Array} schema the document type's schema
 * @param {(type: string) => Array|null} widgetSchema schema of a widget type, or null
 * @param {object} [options]
 * @param {string[]} [options.skipWidgets] widget types never translated
 * @returns {Array} units
 */
function collectUnits(doc, schema, widgetSchema, options = {}) {
  const skipWidgets = new Set(options.skipWidgets || []);
  const units = [];
  const push = (unit) => {
    if (unit) {
      units.push(unit);
    }
  };

  const walk = (object, fields, path) => {
    if (!object || typeof object !== 'object' || !Array.isArray(fields)) {
      return;
    }
    for (const field of fields) {
      if (!field || field.translate === false || !field.name) {
        continue;
      }
      const value = object[field.name];
      const here = path ? `${path}.${field.name}` : field.name;
      switch (field.type) {
        case 'string':
          if (typeof value === 'string') {
            push(textUnit(value, (v) => {
              object[field.name] = v;
            }, here));
          }
          break;
        case 'area':
          if (value && Array.isArray(value.items)) {
            value.items.forEach((widget, i) => walkWidget(widget, `${here}.${i}`));
          }
          break;
        case 'array':
          if (Array.isArray(value)) {
            value.forEach((item, i) => walk(item, field.schema, `${here}.${i}`));
          }
          break;
        case 'object':
          walk(value, field.schema, here);
          break;
        default:
          break;
      }
    }
  };

  const walkWidget = (widget, path) => {
    if (!widget || typeof widget !== 'object' || skipWidgets.has(widget.type)) {
      return;
    }
    if (widget.type === RICH_TEXT) {
      if (typeof widget.content === 'string') {
        units.push(...richTextUnits(widget.content, (v) => {
          widget.content = v;
        }, `${path}.content`));
      }
      return;
    }
    walk(widget, widgetSchema(widget.type), path);
  };

  walk(doc, schema, '');
  return units;
}

module.exports = { collectUnits, RICH_TEXT };
