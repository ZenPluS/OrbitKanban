'use strict';
// Merges imported custom fields into an organization and remaps their values.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const ColumnValidator = typeof module !== 'undefined' ? require('./ColumnValidator') : globalThis.OrbitKanban.Columns.ColumnValidator;

class ColumnMerger {
  static mergeFields(target, source, preferIncoming = false) {
    const fields = structuredClone(target), mapping = new Map(), valueMappings = new Map(), added = new Set();
    for (const incoming of source) {
      // Columns migrated from the old portal link share a fixed id, so they match even when their names were translated.
      let field = fields.find(field => ColumnSchema.key(field.name) === ColumnSchema.key(incoming.name))
        || (incoming.type === 'platform' && incoming.id === ColumnSchema.LEGACY_LINK_ID ? fields.find(field => field.id === ColumnSchema.LEGACY_LINK_ID && field.type === 'platform') : undefined);
      if (field) {
        ColumnSchema.assert(field.type === incoming.type, "A column with the same name has a different type.");
        const options = ColumnSchema.choices(field), values = new Map();
        for (const option of ColumnSchema.choices(incoming)) {
          let match = (preferIncoming && options.find(existing => existing.id === option.id)) || options.find(existing => ColumnSchema.key(existing.name) === ColumnSchema.key(option.name));
          if (match && preferIncoming) { match.name = option.name; match.color = option.color; }
          if (!match) {
            match = { ...option };
            if (options.some(existing => existing.id === match.id)) match.id = globalThis.crypto.randomUUID();
            options.push(match);
          }
          values.set(option.id, match.id);
        }
        field.options = options;
        if (field.type === 'platform' && incoming.template !== undefined && (preferIncoming || !field.template)) field.template = incoming.template;
        valueMappings.set(incoming.id, values);
      } else {
        field = structuredClone(incoming);
        if (fields.some(item => item.id === field.id)) field.id = `custom-${globalThis.crypto.randomUUID()}`;
        fields.push(field);
        added.add(field);
      }
      mapping.set(incoming.id, field.id);
    }
    // New successor columns follow their predecessor column; when it already has one, the existing column is reused.
    for (const field of [...added].filter(field => field.type === 'child')) {
      field.source = mapping.get(field.source) || field.source;
      const existing = fields.find(item => item !== field && item.type === 'child' && item.source === field.source);
      if (!existing) continue;
      fields.splice(fields.indexOf(field), 1);
      for (const [from, to] of mapping) if (to === field.id) mapping.set(from, existing.id);
    }
    ColumnValidator.validateFields(fields);
    return { fields, mapping, valueMappings };
  }
  static remapValues(values, mapping, valueMappings = new Map(), filters = false) {
    return Object.fromEntries(Object.entries(values || {}).map(([id, value]) => {
      const choices = valueMappings.get(id), remap = item => choices?.get(item) || item;
      const result = filters ? { ...value, values: value.values.map(remap) } : Array.isArray(value) ? value.map(remap) : remap(value);
      return [mapping.get(id) || id, structuredClone(result)];
    }));
  }
  static valuesKey = values => JSON.stringify(Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b)));
}

if (typeof module !== 'undefined') module.exports = ColumnMerger;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnMerger = ColumnMerger;
})();
