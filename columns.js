'use strict';
(() => {
const TYPES = ['text', 'richtext', 'number', 'date', 'select', 'multiselect', 'url', 'effort', 'boolean'];
const FIELD_LIMIT = 30;
const ownObject = value => value && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const key = value => value.trim().toLocaleLowerCase();
const fieldsOf = (settings, kind) => settings[kind === 'tasks' ? 'taskFields' : 'issueFields'] === undefined ? [] : settings[kind === 'tasks' ? 'taskFields' : 'issueFields'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function validateFields(fields) {
  assert(Array.isArray(fields) && fields.length <= FIELD_LIMIT, 'Elenco colonne personalizzate non valido.');
  const ids = new Set(), names = new Set();
  for (const field of fields) {
    assert(field && /^custom-[a-z0-9-]{1,80}$/i.test(field.id) && typeof field.name === 'string' && field.name.trim() && field.name.length <= 60 && TYPES.includes(field.type), 'Colonna personalizzata non valida.');
    assert(!ids.has(field.id) && !names.has(key(field.name)), 'Nomi e identificativi delle colonne devono essere univoci.');
    ids.add(field.id); names.add(key(field.name));
    assert(Array.isArray(field.options) && field.options.length <= 100 && field.options.every(option => typeof option === 'string' && option.trim() && option.length <= 60) && new Set(field.options.map(key)).size === field.options.length, 'Opzioni della colonna non valide.');
    assert(!['select', 'multiselect'].includes(field.type) || field.options.length > 0, 'Specificare almeno una opzione per la colonna.');
  }
  return fields;
}
function validateValue(value, field) {
  if (value === undefined || value === null || value === '') return;
  let valid;
  switch (field.type) {
    case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
    case 'effort': valid = typeof value === 'number' && Number.isFinite(value) && value >= 0; break;
    case 'date': valid = validDate(value); break;
    case 'boolean': valid = typeof value === 'boolean'; break;
    case 'select': valid = field.options.includes(value); break;
    case 'multiselect': valid = Array.isArray(value) && value.every(item => field.options.includes(item)) && new Set(value).size === value.length; break;
    case 'url':
      try { const url = new URL(value); valid = typeof value === 'string' && value.length <= 2000 && /^https?:\/\/\S+$/i.test(value) && Boolean(url.hostname); }
      catch { valid = false; }
      break;
    default: valid = typeof value === 'string' && value.length <= 200000;
  }
  assert(valid, 'Valore della colonna personalizzata non valido.');
}
function validateCustomData(data) {
  for (const kind of ['tasks', 'issues']) {
    const fields = validateFields(fieldsOf(data.settings, kind)), known = new Map(fields.map(field => [field.id, field]));
    for (const record of data[kind]) {
      if (record.customFields === undefined) continue;
      assert(ownObject(record.customFields), 'Valori delle colonne personalizzate non validi.');
      for (const [id, value] of Object.entries(record.customFields)) {
        assert(known.has(id), 'Colonna personalizzata mancante nella configurazione.');
        validateValue(value, known.get(id));
      }
    }
  }
}
function normalizeColumns(columns, defaults, fields = []) {
  const all = [...defaults, ...fields.map(field => ({ id: field.id, visible: true }))], ids = all.map(column => column.id);
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
  if (!result.some(column => column.visible)) (result.find(column => column.id === 'code') || result[0]).visible = true;
  return result;
}
const issueDefaults = () => ['code', 'incident', 'problem', 'linked'].map(id => ({ id, visible: true }));
const normalizeIssueColumns = (columns, fields = []) => normalizeColumns(columns, issueDefaults(), fields);
function validFilters(filters, ids, types = {}) {
  const bound = (value, type) => value === '' || (type === 'date' ? validDate(value) : ['number', 'effort'].includes(type) && value.trim() !== '' && Number.isFinite(Number(value)));
  return filters === undefined || (ownObject(filters) && Object.entries(filters).every(([id, filter]) => ids.includes(id) && ownObject(filter)
    && typeof filter.text === 'string' && filter.text.length <= 200 && ['any', 'empty', 'filled'].includes(filter.empty)
    && typeof filter.min === 'string' && filter.min.length <= 40 && typeof filter.max === 'string' && filter.max.length <= 40
    && bound(filter.min, types[id]) && bound(filter.max, types[id])
    && (!filter.min || !filter.max || (types[id] === 'date' ? filter.min <= filter.max : Number(filter.min) <= Number(filter.max)))
    && Array.isArray(filter.values) && filter.values.length <= 100 && filter.values.every(value => typeof value === 'string' && value.length <= 200)));
}
const emptyFilter = () => ({ text: '', min: '', max: '', values: [], empty: 'any' });
const activeFilter = filter => filter && Boolean(filter.text || filter.min || filter.max || filter.values.length || filter.empty !== 'any');
function matchesFilter(value, filter, type) {
  if (!activeFilter(filter)) return true;
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
  if (filter.empty === 'empty') return empty;
  if (filter.empty === 'filled' && empty) return false;
  if (empty) return !filter.text && !filter.min && !filter.max && !filter.values.length;
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  if (filter.values.length && !values.some(value => filter.values.includes(value))) return false;
  if (filter.text && !values.some(value => value.toLocaleLowerCase().includes(filter.text.toLocaleLowerCase()))) return false;
  if (filter.min || filter.max) {
    const actual = type === 'date' ? value : Number(value), min = type === 'date' ? filter.min : Number(filter.min), max = type === 'date' ? filter.max : Number(filter.max);
    if (filter.min && actual < min || filter.max && actual > max) return false;
  }
  return true;
}
function mergeFields(target, source) {
  const fields = structuredClone(target), mapping = new Map();
  for (const incoming of source) {
    let field = fields.find(field => key(field.name) === key(incoming.name));
    if (field) {
      assert(field.type === incoming.type, 'Una colonna con lo stesso nome ha un tipo diverso.');
      field.options = [...new Set([...field.options, ...incoming.options])];
    } else {
      field = structuredClone(incoming);
      if (fields.some(item => item.id === field.id)) field.id = `custom-${globalThis.crypto.randomUUID()}`;
      fields.push(field);
    }
    mapping.set(incoming.id, field.id);
  }
  validateFields(fields);
  return { fields, mapping };
}
function remapValues(values, mapping) {
  return Object.fromEntries(Object.entries(values || {}).map(([id, value]) => [mapping.get(id) || id, structuredClone(value)]));
}
const valuesKey = values => JSON.stringify(Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b)));
const api = { TYPES, FIELD_LIMIT, fieldsOf, validateFields, validateValue, validateCustomData, normalizeColumns, normalizeIssueColumns, validDate, validFilters, emptyFilter, activeFilter, matchesFilter, mergeFields, remapValues, valuesKey };
if (typeof module !== 'undefined') module.exports = api;
else globalThis.OrbitaColumns = api;
})();
