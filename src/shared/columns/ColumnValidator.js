'use strict';
// Validates custom field definitions and the values stored in records.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const PlatformLinks = typeof module !== 'undefined' ? require('./PlatformLinks') : globalThis.OrbitKanban.Columns.PlatformLinks;

class ColumnValidator {
  static validateFields(fields, kind) {
    ColumnSchema.assert(Array.isArray(fields) && fields.length <= ColumnSchema.FIELD_LIMIT, "Invalid custom column list.");
    const ids = new Set(), names = new Set();
    for (const field of fields) {
      ColumnSchema.assert(field && /^custom-[a-z0-9-]{1,80}$/i.test(field.id) && typeof field.name === 'string' && field.name.trim() && field.name.length <= 60 && ColumnSchema.TYPES.includes(field.type), "Invalid custom column.");
      ColumnSchema.assert(!ids.has(field.id) && !names.has(ColumnSchema.key(field.name)), "Column names and identifiers must be unique.");
      ids.add(field.id); names.add(ColumnSchema.key(field.name));
      ColumnSchema.assert(Array.isArray(field.options) && field.options.length <= 100, "Invalid column options.");
      const options = ColumnSchema.choices(field);
      ColumnSchema.assert(options.every(option => option && typeof option.id === 'string' && option.id.trim() && option.id.length <= 200 && typeof option.name === 'string' && option.name.trim() && option.name.length <= 60 && /^#[0-9a-f]{6}$/i.test(option.color)) && new Set(options.map(option => option.id)).size === options.length && new Set(options.map(option => ColumnSchema.key(option.name))).size === options.length, "Invalid column options.");
      ColumnSchema.assert(field.type === 'platform' ? field.template === undefined || PlatformLinks.validTemplate(field.template) : field.template === undefined, "The platform link template must be a valid web address containing {code}.");
      ColumnSchema.assert(kind !== 'issues' || !ColumnSchema.REFERENCE_TYPES.includes(field.type), "Invalid custom column.");
    }
    const sources = new Set();
    for (const field of fields) {
      if (field.type !== 'child') { ColumnSchema.assert(field.source === undefined, "Invalid custom column."); continue; }
      ColumnSchema.assert(typeof field.source === 'string' && fields.some(item => item.id === field.source && item.type === 'parent') && !sources.has(field.source), "Each successor column must belong to a different predecessor column.");
      sources.add(field.source);
    }
    return fields;
  }
  static validateValue(value, field, optionIds) {
    if (value === undefined || value === null || value === '') return;
    if (['select', 'multiselect'].includes(field.type)) optionIds ||= new Set(ColumnSchema.choices(field).map(option => option.id));
    let valid;
    switch (field.type) {
      case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
      case 'effort': valid = typeof value === 'number' && Number.isFinite(value) && value >= 0; break;
      case 'date': valid = ColumnSchema.validDate(value); break;
      case 'boolean': valid = typeof value === 'boolean'; break;
      case 'select': valid = optionIds.has(value); break;
      case 'multiselect': valid = Array.isArray(value) && value.every(item => optionIds.has(item)) && new Set(value).size === value.length; break;
      case 'url':
        try { const url = new URL(value); valid = typeof value === 'string' && value.length <= 2000 && /^https?:\/\/\S+$/i.test(value) && Boolean(url.hostname); }
        catch { valid = false; }
        break;
      case 'platform': valid = typeof value === 'string' && value.length <= 2000 && value === value.trim() && !/[\u0000-\u001f]/.test(value); break;
      case 'parent': valid = Array.isArray(value) && value.length <= ColumnSchema.REFERENCE_MAX && value.every(item => typeof item === 'string' && item && item.length <= 200) && new Set(value).size === value.length; break;
      case 'child': valid = false; break;
      default: valid = typeof value === 'string' && value.length <= 200000;
    }
    ColumnSchema.assert(valid, "Invalid custom column value.");
  }
  static validateCustomData(data) {
    for (const kind of ['tasks', 'issues']) {
      const fields = ColumnValidator.validateFields(ColumnSchema.fieldsOf(data.settings, kind), kind), known = new Map(fields.map(field => [field.id, field]));
      const options = new Map(fields.map(field => [field.id, new Set(ColumnSchema.choices(field).map(option => option.id))]));
      for (const record of data[kind]) {
        for (const field of ColumnSchema.BUILTIN_FIELDS[kind]) if (field.property && ColumnSchema.deletedOf(data.settings, kind).includes(field.id)) {
          ColumnSchema.assert(record[field.property] === undefined || JSON.stringify(record[field.property]) === JSON.stringify(field.empty), "Deleted columns cannot contain values. Reopen the editor.");
        }
        if (record.customFields === undefined) continue;
        ColumnSchema.assert(ColumnSchema.ownObject(record.customFields), "Invalid custom column values.");
        for (const [id, value] of Object.entries(record.customFields)) {
          ColumnSchema.assert(known.has(id), "A custom column is missing from settings.");
          ColumnValidator.validateValue(value, known.get(id), options.get(id));
          ColumnSchema.assert(known.get(id).type !== 'parent' || !value?.includes(record.id), "A task cannot depend on itself.");
        }
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = ColumnValidator;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnValidator = ColumnValidator;
})();
