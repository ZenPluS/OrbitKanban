'use strict';
(() => {
const TYPES = ['text', 'richtext', 'number', 'date', 'select', 'multiselect', 'url', 'effort', 'boolean'];
const FIELD_LIMIT = 30;
const ownObject = value => value && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const key = value => value.trim().toLocaleLowerCase();
const fieldsOf = (settings, kind) => settings[kind === 'tasks' ? 'taskFields' : 'issueFields'] === undefined ? [] : settings[kind === 'tasks' ? 'taskFields' : 'issueFields'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const choices = field => field.options.map(option => typeof option === 'string' ? { id: option, name: option, color: '#a392ff' } : { ...option });
const BUILTIN_FIELDS = {
  tasks: [
    { id: 'sequence', name: 'Sequence', type: 'number', property: 'sequence', sort: 'sequence', empty: 0 },
    { id: 'code', name: 'Portal code', type: 'text', property: 'code', sort: 'code', empty: '' },
    { id: 'link', name: 'Portal link', type: 'url', property: 'url', visible: false, empty: '' },
    { id: 'description', name: 'Description', type: 'richtext', property: 'description', empty: '' },
    { id: 'urgency', name: 'Urgency', type: 'select', property: 'urgencyId', catalog: 'urgencies', sort: 'urgencyId', empty: '' },
    { id: 'status', name: 'Status', type: 'select', property: 'statusId', catalog: 'statuses', sort: 'statusId', empty: '' },
    { id: 'highlight', name: 'Highlight', type: 'select', property: 'highlightId', catalog: 'highlights', sort: 'highlightId', visible: false, empty: '' },
    { id: 'tags', name: 'Tags', type: 'multiselect', property: 'tagIds', catalog: 'tags', empty: [] },
    { id: 'effort', name: 'Effort', type: 'effort', property: 'effortHours', sort: 'effortHours', empty: 0 },
    { id: 'incident', name: 'Incident', type: 'text' },
    { id: 'problem', name: 'Problem', type: 'text' },
    { id: 'releaseDate', name: 'Release date', type: 'date', property: 'releaseDate', sort: 'releaseDate', empty: '' },
    { id: 'notes', name: 'Notes', type: 'richtext', property: 'notes', empty: '' }
  ],
  issues: [
    { id: 'code', name: 'Portal code', type: 'text', property: 'code', empty: '' },
    { id: 'incident', name: 'Incident', type: 'text', property: 'incident', empty: '' },
    { id: 'problem', name: 'Problem', type: 'text', property: 'problem', empty: '' },
    { id: 'linked', name: 'Link', type: 'number' }
  ]
};
const deletedKey = kind => kind === 'tasks' ? 'deletedTaskColumns' : 'deletedIssueColumns';
const deletedOf = (settings, kind) => settings[deletedKey(kind)] || [];
const hasColumn = (settings, kind, id) => BUILTIN_FIELDS[kind].some(field => field.id === id)
  ? !deletedOf(settings, kind).includes(id) : fieldsOf(settings, kind).some(field => field.id === id);
const schemaOf = (settings, kind) => [
  ...BUILTIN_FIELDS[kind].filter(field => hasColumn(settings, kind, field.id)).map(field => ({ ...field, builtin: true, options: field.catalog ? settings[field.catalog] || [] : [] })),
  ...fieldsOf(settings, kind)
];
const valueOf = (record, field) => field.builtin ? record[field.property] : record.customFields?.[field.id];
function setValue(record, field, value) {
  if (field.builtin) record[field.property] = value;
  else (record.customFields ||= {})[field.id] = value;
}
const defaultColumns = (kind, fields = []) => [...BUILTIN_FIELDS[kind].map(field => ({ id: field.id, visible: field.visible !== false })), ...fields.map(field => ({ id: field.id, visible: true }))];
const listColumns = (settings, kind, input = settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns']) =>
  normalizeColumns(input, defaultColumns(kind), fieldsOf(settings, kind), deletedOf(settings, kind));
const sortKeys = settings => schemaOf(settings, 'tasks').map(field => field.builtin ? field.sort : ['number', 'date', 'effort', 'boolean', 'select'].includes(field.type) ? field.id : undefined).filter(Boolean);
const defaultSort = settings => {
  const keys = sortKeys(settings), key = keys.includes('releaseDate') ? 'releaseDate' : keys[0];
  return key ? [{ key, direction: 'asc' }] : [];
};
function validateDeleted(settings) {
  for (const kind of ['tasks', 'issues']) {
    const deleted = settings[deletedKey(kind)];
    assert(deleted === undefined || Array.isArray(deleted) && new Set(deleted).size === deleted.length && deleted.every(id => BUILTIN_FIELDS[kind].some(field => field.id === id)), "Invalid deleted columns.");
  }
}
function cleanViews(settings) {
  const ids = listColumns(settings, 'tasks').map(column => column.id), keys = sortKeys(settings);
  for (const view of settings.savedViews || []) {
    view.columns = view.columns.filter(column => ids.includes(column.id));
    if (ids.length && !view.columns.some(column => column.visible)) {
      if (!view.columns.length) view.columns = listColumns(settings, 'tasks');
      else view.columns[0].visible = true;
    }
    view.sort = view.sort.filter(entry => keys.includes(entry.key));
    if (!view.sort.length) view.sort = defaultSort(settings);
    if (!hasColumn(settings, 'tasks', 'status')) view.statusFilter = '';
    if (!hasColumn(settings, 'tasks', 'highlight')) view.highlightFilter = '';
    if (view.columnFilters) view.columnFilters = Object.fromEntries(Object.entries(view.columnFilters).filter(([id]) => ids.includes(id)));
  }
}
function removeColumn(settings, kind, id) {
  assert(hasColumn(settings, kind, id), "This column no longer exists.");
  if (BUILTIN_FIELDS[kind].some(field => field.id === id)) (settings[deletedKey(kind)] ||= []).push(id);
  else {
    const key = kind === 'tasks' ? 'taskFields' : 'issueFields';
    settings[key] = fieldsOf(settings, kind).filter(field => field.id !== id);
  }
  settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = listColumns(settings, kind);
  cleanViews(settings);
}
function cleanData(data) {
  const settings = data.settings;
  for (const kind of ['tasks', 'issues']) {
    const fields = schemaOf(settings, kind), customIds = new Set(fieldsOf(settings, kind).map(field => field.id));
    const removed = BUILTIN_FIELDS[kind].filter(field => field.property && !hasColumn(settings, kind, field.id));
    const catalogs = fields.filter(field => ['select', 'multiselect'].includes(field.type)).map(field => ({ field, known: new Set(choices(field).map(option => option.id)) }));
    for (const record of data[kind]) {
      for (const field of removed) record[field.property] = structuredClone(field.empty);
      if (record.customFields) record.customFields = Object.fromEntries(Object.entries(record.customFields).filter(([id]) => customIds.has(id)));
      for (const { field, known } of catalogs) {
        const value = valueOf(record, field);
        if (value !== undefined) setValue(record, field, Array.isArray(value) ? value.filter(id => known.has(id)) : known.has(value) ? value : '');
      }
    }
    settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = listColumns(settings, kind);
  }
  cleanViews(settings);
  for (const view of settings.savedViews || []) {
    if (!settings.statuses.some(option => option.id === view.statusFilter)) view.statusFilter = '';
    if (!['__any', '__none'].includes(view.highlightFilter) && !(settings.highlights || []).some(option => option.id === view.highlightFilter)) view.highlightFilter = '';
    for (const field of schemaOf(settings, 'tasks').filter(field => ['select', 'multiselect'].includes(field.type))) {
      const filter = view.columnFilters?.[field.id], known = new Set(choices(field).map(option => option.id));
      if (filter) filter.values = filter.values.filter(id => id === EMPTY_VALUE || known.has(id));
    }
  }
  return data;
}
function validateFields(fields) {
  assert(Array.isArray(fields) && fields.length <= FIELD_LIMIT, "Invalid custom column list.");
  const ids = new Set(), names = new Set();
  for (const field of fields) {
    assert(field && /^custom-[a-z0-9-]{1,80}$/i.test(field.id) && typeof field.name === 'string' && field.name.trim() && field.name.length <= 60 && TYPES.includes(field.type), "Invalid custom column.");
    assert(!ids.has(field.id) && !names.has(key(field.name)), "Column names and identifiers must be unique.");
    ids.add(field.id); names.add(key(field.name));
    assert(Array.isArray(field.options) && field.options.length <= 100, "Invalid column options.");
    const options = choices(field);
    assert(options.every(option => option && typeof option.id === 'string' && option.id.trim() && option.id.length <= 200 && typeof option.name === 'string' && option.name.trim() && option.name.length <= 60 && /^#[0-9a-f]{6}$/i.test(option.color)) && new Set(options.map(option => option.id)).size === options.length && new Set(options.map(option => key(option.name))).size === options.length, "Invalid column options.");
  }
  return fields;
}
function validateValue(value, field, optionIds) {
  if (value === undefined || value === null || value === '') return;
  if (['select', 'multiselect'].includes(field.type)) optionIds ||= new Set(choices(field).map(option => option.id));
  let valid;
  switch (field.type) {
    case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
    case 'effort': valid = typeof value === 'number' && Number.isFinite(value) && value >= 0; break;
    case 'date': valid = validDate(value); break;
    case 'boolean': valid = typeof value === 'boolean'; break;
    case 'select': valid = optionIds.has(value); break;
    case 'multiselect': valid = Array.isArray(value) && value.every(item => optionIds.has(item)) && new Set(value).size === value.length; break;
    case 'url':
      try { const url = new URL(value); valid = typeof value === 'string' && value.length <= 2000 && /^https?:\/\/\S+$/i.test(value) && Boolean(url.hostname); }
      catch { valid = false; }
      break;
    default: valid = typeof value === 'string' && value.length <= 200000;
  }
  assert(valid, "Invalid custom column value.");
}
function validateCustomData(data) {
  for (const kind of ['tasks', 'issues']) {
    const fields = validateFields(fieldsOf(data.settings, kind)), known = new Map(fields.map(field => [field.id, field]));
    const options = new Map(fields.map(field => [field.id, new Set(choices(field).map(option => option.id))]));
    for (const record of data[kind]) {
      for (const field of BUILTIN_FIELDS[kind]) if (field.property && deletedOf(data.settings, kind).includes(field.id)) {
        assert(record[field.property] === undefined || JSON.stringify(record[field.property]) === JSON.stringify(field.empty), "Deleted columns cannot contain values. Reopen the editor.");
      }
      if (record.customFields === undefined) continue;
      assert(ownObject(record.customFields), "Invalid custom column values.");
      for (const [id, value] of Object.entries(record.customFields)) {
        assert(known.has(id), "A custom column is missing from settings.");
        validateValue(value, known.get(id), options.get(id));
      }
    }
  }
}
function normalizeColumns(columns, defaults, fields = [], deleted = []) {
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
const normalizeIssueColumns = (columns, fields = [], deleted = []) => normalizeColumns(columns, defaultColumns('issues'), fields, deleted);
// Filter value that selects the cells without a value, next to the real values of the column.
const EMPTY_VALUE = '__empty__';
const FILTER_VALUES_MAX = 1000;
function validFilters(filters, ids, types = {}) {
  const bound = (value, type) => value === '' || (type === 'date' ? validDate(value) : ['number', 'effort'].includes(type) && value.trim() !== '' && Number.isFinite(Number(value)));
  return filters === undefined || (ownObject(filters) && Object.entries(filters).every(([id, filter]) => ids.includes(id) && ownObject(filter)
    && typeof filter.text === 'string' && filter.text.length <= 200 && ['any', 'empty', 'filled'].includes(filter.empty)
    && typeof filter.min === 'string' && filter.min.length <= 40 && typeof filter.max === 'string' && filter.max.length <= 40
    && bound(filter.min, types[id]) && bound(filter.max, types[id])
    && (!filter.min || !filter.max || (types[id] === 'date' ? filter.min <= filter.max : Number(filter.min) <= Number(filter.max)))
    && Array.isArray(filter.values) && filter.values.length <= FILTER_VALUES_MAX && filter.values.every(value => typeof value === 'string' && value.length <= 200)
    && (types[id] !== 'date' || filter.values.every(value => value === EMPTY_VALUE || validDate(value)))));
}
const emptyFilter = () => ({ text: '', min: '', max: '', values: [], empty: 'any' });
const activeFilter = filter => filter && Boolean(filter.text || filter.min || filter.max || filter.values.length || filter.empty !== 'any');
function matchesFilter(value, filter, type) {
  if (!activeFilter(filter)) return true;
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
  if (filter.empty === 'empty') return empty;
  if (filter.empty === 'filled' && empty) return false;
  if (type === 'date') {
    // Ticked dates, the From/To range and "without date" add up: a row passes when it matches any of them.
    const dates = filter.values.filter(item => item !== EMPTY_VALUE), range = Boolean(filter.min || filter.max);
    if (!dates.length && !range && !filter.values.includes(EMPTY_VALUE)) return true;
    if (empty) return filter.values.includes(EMPTY_VALUE);
    return dates.includes(value) || (range && (!filter.min || value >= filter.min) && (!filter.max || value <= filter.max));
  }
  if (empty) return filter.values.includes(EMPTY_VALUE) || (!filter.text && !filter.min && !filter.max && !filter.values.length);
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  if (filter.values.length && !values.some(value => filter.values.includes(value))) return false;
  if (filter.text && !values.some(value => value.toLocaleLowerCase().includes(filter.text.toLocaleLowerCase()))) return false;
  if (filter.min || filter.max) {
    const actual = type === 'date' ? value : Number(value), min = type === 'date' ? filter.min : Number(filter.min), max = type === 'date' ? filter.max : Number(filter.max);
    if (filter.min && actual < min || filter.max && actual > max) return false;
  }
  return true;
}
function mergeFields(target, source, preferIncoming = false) {
  const fields = structuredClone(target), mapping = new Map(), valueMappings = new Map();
  for (const incoming of source) {
    let field = fields.find(field => key(field.name) === key(incoming.name));
    if (field) {
      assert(field.type === incoming.type, "A column with the same name has a different type.");
      const options = choices(field), values = new Map();
      for (const option of choices(incoming)) {
        let match = (preferIncoming && options.find(existing => existing.id === option.id)) || options.find(existing => key(existing.name) === key(option.name));
        if (match && preferIncoming) { match.name = option.name; match.color = option.color; }
        if (!match) {
          match = { ...option };
          if (options.some(existing => existing.id === match.id)) match.id = globalThis.crypto.randomUUID();
          options.push(match);
        }
        values.set(option.id, match.id);
      }
      field.options = options;
      valueMappings.set(incoming.id, values);
    } else {
      field = structuredClone(incoming);
      if (fields.some(item => item.id === field.id)) field.id = `custom-${globalThis.crypto.randomUUID()}`;
      fields.push(field);
    }
    mapping.set(incoming.id, field.id);
  }
  validateFields(fields);
  return { fields, mapping, valueMappings };
}
function remapValues(values, mapping, valueMappings = new Map(), filters = false) {
  return Object.fromEntries(Object.entries(values || {}).map(([id, value]) => {
    const choices = valueMappings.get(id), remap = item => choices?.get(item) || item;
    const result = filters ? { ...value, values: value.values.map(remap) } : Array.isArray(value) ? value.map(remap) : remap(value);
    return [mapping.get(id) || id, structuredClone(result)];
  }));
}
const valuesKey = values => JSON.stringify(Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b)));
const api = { TYPES, FIELD_LIMIT, EMPTY_VALUE, FILTER_VALUES_MAX, BUILTIN_FIELDS, deletedKey, deletedOf, hasColumn, schemaOf, valueOf, setValue, defaultColumns, listColumns, sortKeys, defaultSort, validateDeleted, cleanViews, removeColumn, cleanData, fieldsOf, choices, validateFields, validateValue, validateCustomData, normalizeColumns, normalizeIssueColumns, validDate, validFilters, emptyFilter, activeFilter, matchesFilter, mergeFields, remapValues, valuesKey };
if (typeof module !== 'undefined') module.exports = api;
else globalThis.OrbitaColumns = api;
})();
