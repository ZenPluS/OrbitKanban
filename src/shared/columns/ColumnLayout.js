'use strict';
// Column order and visibility of the lists, and the columns the task list can be sorted by.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;

class ColumnLayout {
  static defaultColumns = (kind, fields = []) => [...ColumnSchema.BUILTIN_FIELDS[kind].map(field => ({ id: field.id, visible: field.visible !== false })), ...fields.map(field => ({ id: field.id, visible: true }))];
  static listColumns = (settings, kind, input = settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns']) =>
    ColumnLayout.normalizeColumns(input, ColumnLayout.defaultColumns(kind), ColumnSchema.fieldsOf(settings, kind), ColumnSchema.deletedOf(settings, kind));
  static sortKeys = settings => ColumnSchema.schemaOf(settings, 'tasks').map(field => field.builtin ? field.sort : ['number', 'date', 'effort', 'boolean', 'select'].includes(field.type) ? field.id : undefined).filter(Boolean);
  static defaultSort = settings => {
    const keys = ColumnLayout.sortKeys(settings), key = keys.includes('releaseDate') ? 'releaseDate' : keys[0];
    return key ? [{ key, direction: 'asc' }] : [];
  };
  static normalizeColumns(columns, defaults, fields = [], deleted = []) {
    const all = [...defaults.filter(column => !deleted.includes(column.id)), ...fields.map(field => ({ id: field.id, visible: true }))], ids = all.map(column => column.id);
    if (!Array.isArray(columns)) return all;
    const result = [], seen = new Set();
    for (const column of columns) {
      if (!column || !ids.includes(column.id) || seen.has(column.id)) continue;
      result.push({ id: column.id, visible: column.visible !== false }); seen.add(column.id);
    }
    all.forEach((column, index) => {
      if (seen.has(column.id)) return;
      const previous = ids.slice(0, index).reverse().find(id => seen.has(id));
      result.splice(previous ? result.findIndex(item => item.id === previous) + 1 : 0, 0, { ...column });
      seen.add(column.id);
    });
    if (result.length && !result.some(column => column.visible)) (result.find(column => column.id === 'code') || result[0]).visible = true;
    return result;
  }
  static normalizeIssueColumns = (columns, fields = [], deleted = []) => ColumnLayout.normalizeColumns(columns, ColumnLayout.defaultColumns('issues'), fields, deleted);
}

if (typeof module !== 'undefined') module.exports = ColumnLayout;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnLayout = ColumnLayout;
})();
