'use strict';
// Removes columns and every reference to them from settings, views and records.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const RequiredFields = typeof module !== 'undefined' ? require('./RequiredFields') : globalThis.OrbitKanban.Columns.RequiredFields;
const ColumnLayout = typeof module !== 'undefined' ? require('./ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;
const ColumnFilters = typeof module !== 'undefined' ? require('./ColumnFilters') : globalThis.OrbitKanban.Columns.ColumnFilters;

class ColumnCleanup {
  static validateDeleted(settings) {
    for (const kind of ['tasks', 'issues']) {
      const deleted = settings[ColumnSchema.deletedKey(kind)];
      ColumnSchema.assert(deleted === undefined || Array.isArray(deleted) && new Set(deleted).size === deleted.length && deleted.every(id => ColumnSchema.BUILTIN_FIELDS[kind].some(field => field.id === id)), "Invalid deleted columns.");
    }
  }
  static cleanViews(settings) {
    const ids = ColumnLayout.listColumns(settings, 'tasks').map(column => column.id), keys = ColumnLayout.sortKeys(settings);
    for (const view of settings.savedViews || []) {
      view.columns = view.columns.filter(column => ids.includes(column.id));
      if (ids.length && !view.columns.some(column => column.visible)) {
        if (!view.columns.length) view.columns = ColumnLayout.listColumns(settings, 'tasks');
        else view.columns[0].visible = true;
      }
      view.sort = view.sort.filter(entry => keys.includes(entry.key));
      if (!view.sort.length) view.sort = ColumnLayout.defaultSort(settings);
      if (!ColumnSchema.hasColumn(settings, 'tasks', 'status')) view.statusFilter = '';
      if (!ColumnSchema.hasColumn(settings, 'tasks', 'highlight')) view.highlightFilter = '';
      if (view.columnFilters) view.columnFilters = Object.fromEntries(Object.entries(view.columnFilters).filter(([id]) => ids.includes(id)));
    }
  }
  // A parent column and its child column only make sense together, so deleting either removes both.
  static pairedIds = (settings, kind, id) => {
    const fields = ColumnSchema.fieldsOf(settings, kind), field = fields.find(field => field.id === id);
    if (!field || !ColumnSchema.REFERENCE_TYPES.includes(field.type)) return [id];
    const parentId = field.type === 'parent' ? field.id : field.source;
    return [parentId, ...fields.filter(item => item.type === 'child' && item.source === parentId).map(item => item.id)].filter((value, index, list) => value && list.indexOf(value) === index);
  };
  static removeColumn(settings, kind, id) {
    ColumnSchema.assert(ColumnSchema.hasColumn(settings, kind, id), "This column no longer exists.");
    if (ColumnSchema.BUILTIN_FIELDS[kind].some(field => field.id === id)) (settings[ColumnSchema.deletedKey(kind)] ||= []).push(id);
    else {
      const key = kind === 'tasks' ? 'taskFields' : 'issueFields', removed = ColumnCleanup.pairedIds(settings, kind, id);
      settings[key] = ColumnSchema.fieldsOf(settings, kind).filter(field => !removed.includes(field.id) && !(field.type === 'child' && removed.includes(field.source)));
    }
    settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = ColumnLayout.listColumns(settings, kind);
    settings[RequiredFields.requiredKey(kind)] = RequiredFields.requiredOf(settings, kind);
    ColumnCleanup.cleanViews(settings);
  }
  // Successors are never stored: they are read from the parent column of the other tasks.
  static successorIndex(tasks, parentId) {
    const index = new Map();
    for (const task of tasks) for (const id of task.customFields?.[parentId] || []) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(task.id);
    }
    return index;
  }
  // Drops references to deleted tasks or to the task itself, and any value stored in a computed child column.
  static pruneReferences(data) {
    const fields = ColumnSchema.fieldsOf(data.settings, 'tasks').filter(field => ColumnSchema.REFERENCE_TYPES.includes(field.type));
    if (!fields.length) return data;
    const ids = new Set(data.tasks.map(task => task.id));
    for (const task of data.tasks) for (const field of fields) {
      const value = task.customFields?.[field.id];
      if (value === undefined) continue;
      const kept = field.type === 'parent' && Array.isArray(value) ? [...new Set(value)].filter(id => id !== task.id && ids.has(id)) : [];
      if (kept.length) task.customFields[field.id] = kept;
      else delete task.customFields[field.id];
    }
    return data;
  }
  static cleanData(data) {
    const settings = data.settings;
    for (const kind of ['tasks', 'issues']) {
      const fields = ColumnSchema.schemaOf(settings, kind), customIds = new Set(ColumnSchema.fieldsOf(settings, kind).map(field => field.id));
      const removed = ColumnSchema.BUILTIN_FIELDS[kind].filter(field => field.property && !ColumnSchema.hasColumn(settings, kind, field.id));
      const catalogs = fields.filter(field => ['select', 'multiselect'].includes(field.type)).map(field => ({ field, known: new Set(ColumnSchema.choices(field).map(option => option.id)) }));
      for (const record of data[kind]) {
        for (const field of removed) record[field.property] = structuredClone(field.empty);
        if (record.customFields) record.customFields = Object.fromEntries(Object.entries(record.customFields).filter(([id]) => customIds.has(id)));
        for (const { field, known } of catalogs) {
          const value = ColumnSchema.getValue(record, field);
          if (value !== undefined) ColumnSchema.setValue(record, field, Array.isArray(value) ? value.filter(id => known.has(id)) : known.has(value) ? value : '');
        }
      }
      settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = ColumnLayout.listColumns(settings, kind);
      settings[RequiredFields.requiredKey(kind)] = RequiredFields.requiredOf(settings, kind);
    }
    ColumnCleanup.pruneReferences(data);
    ColumnCleanup.cleanViews(settings);
    for (const view of settings.savedViews || []) {
      if (!settings.statuses.some(option => option.id === view.statusFilter)) view.statusFilter = '';
      if (!['__any', '__none'].includes(view.highlightFilter) && !(settings.highlights || []).some(option => option.id === view.highlightFilter)) view.highlightFilter = '';
      for (const field of ColumnSchema.schemaOf(settings, 'tasks').filter(field => ['select', 'multiselect'].includes(field.type))) {
        const filter = view.columnFilters?.[field.id], known = new Set(ColumnSchema.choices(field).map(option => option.id));
        if (filter) filter.values = filter.values.filter(id => id === ColumnFilters.EMPTY_VALUE || known.has(id));
      }
    }
    return data;
  }
}

if (typeof module !== 'undefined') module.exports = ColumnCleanup;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnCleanup = ColumnCleanup;
})();
