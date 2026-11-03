'use strict';
(() => {
const core = typeof module !== 'undefined' ? require('./core') : globalThis.OrbitaCore;
const C = typeof module !== 'undefined' ? require('./columns') : globalThis.OrbitaColumns;
const MAX_BYTES = 16 * 1024 * 1024, MAX_ROWS = 10000;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const normalized = value => String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function detectDelimiter(text) {
  text = text.replace(/^(?:[ \t]*(?:\r\n|[\r\n]))+/, '');
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(text[i])) break;
    else if (!quoted && counts.has(text[i])) counts.set(text[i], counts.get(text[i]) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
function parseCsv(input, delimiter = '') {
  assert(typeof input === 'string' && input.length <= MAX_BYTES, "The CSV exceeds the 16 MB limit.");
  const text = input.replace(/^\uFEFF/, '');
  delimiter ||= detectDelimiter(text);
  assert([';', ',', '\t'].includes(delimiter), "Invalid CSV delimiter.");
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false, skipped = 0;
  const endCell = () => { row.push(cell); cell = ''; closed = false; assert(row.length <= 100, "The CSV has too many columns."); };
  const endRow = () => { endCell(); if (row.some(value => value.trim())) rows.push(row); else skipped++; row = []; assert(rows.length <= MAX_ROWS + 1, "The CSV exceeds the 10000-row limit."); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (closed && char === ' ') continue;
    else if (char === '"' && !cell && !closed) quoted = true;
    else { assert(char !== '"' && !closed, "Invalid CSV quotes."); cell += char; }
  }
  assert(!quoted, "The CSV contains an unclosed quoted field.");
  if (cell || row.length || closed) endRow();
  assert(rows.length > 0, "The CSV is empty.");
  return { rows, delimiter, skipped };
}
function destinations(data, kind) {
  assert(['tasks', 'issues'].includes(kind), "Invalid import list.");
  const s = data.settings;
  const options = items => items.map(item => ({ value: item.id, name: item.name }));
  const base = kind === 'tasks' ? [
    { id: 'code', name: "Portal code", type: 'text' }, { id: 'sequence', name: "Sequence", type: 'number' },
    { id: 'url', name: "Specific link", type: 'url' }, { id: 'description', name: "Description", type: 'richtext' },
    { id: 'statusId', name: "Status", type: 'select', options: options(s.statuses) },
    { id: 'urgencyId', name: "Urgency", type: 'select', options: options(s.urgencies) },
    { id: 'effortHours', name: "Effort (hours)", type: 'effort' }, { id: 'effortDays', name: "Effort in days", type: 'effort' },
    { id: 'releaseDate', name: 'Release date', type: 'date' }, { id: 'notes', name: "Notes", type: 'richtext' },
    { id: 'highlightId', name: "Highlight", type: 'select', options: options(s.highlights || []) },
    { id: 'tagIds', name: 'Tags', type: 'multiselect', options: options(s.tags || []) }, { id: 'hidden', name: "Hidden", type: 'boolean' }
  ] : ['code', 'incident', 'problem'].map((id, i) => ({ id, name: ["Portal code", 'Incident', 'Problem'][i], type: 'text' }));
  return [...base, ...C.fieldsOf(s, kind).map(field => ({ ...field, custom: true, options: C.choices(field).map(option => ({ ...option, value: option.id })) }))];
}
// Italian headers stay as aliases so CSV files made with the Italian interface still map automatically.
const aliases = {
  code: ['key', 'issue key', 'codice', 'codice portale', 'portal code'], sequence: ['sequence'], url: ['url', 'link'],
  description: ['description'], notes: ['notes'], statusId: ['status'], urgencyId: ['urgency', 'priority', 'priorità'],
  effortHours: ['effort', 'hours', 'ore'], effortDays: ['days', 'giorni'], releaseDate: ['release', 'data release'], hidden: ['hidden']
};
function suggestMapping(headers, fields) {
  const used = new Set();
  return headers.map(header => {
    const matches = fields.filter(field => [field.id, field.name, ...(aliases[field.id] || [])].some(name => normalized(name) === normalized(header)));
    if (matches.length !== 1 || used.has(matches[0].id)) return '';
    used.add(matches[0].id); return matches[0].id;
  });
}
function convertCell(input, field) {
  const value = input.trim();
  if (!value) return undefined;
  if (['number', 'effort'].includes(field.type)) {
    assert(/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value), "Invalid number: use a decimal point or comma, without thousands separators.");
    const number = Number(value.replace(',', '.'));
    assert(Number.isFinite(number) && (field.type !== 'effort' || number >= 0) && (field.id !== 'sequence' || Number.isSafeInteger(number) && number >= 0), "Number out of range.");
    return number;
  }
  if (field.type === 'date') {
    const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : value;
    assert(C.validDate(date), "Invalid date: use YYYY-MM-DD or DD/MM/YYYY.");
    return date;
  }
  if (field.type === 'boolean') {
    const word = normalized(value);
    assert(['si', 'yes', 'true', '1', 'no', 'false', '0'].includes(word), "Invalid boolean: use yes/no, true/false or 1/0.");
    return ['si', 'yes', 'true', '1'].includes(word);
  }
  if (['select', 'multiselect'].includes(field.type)) {
    const choice = value => {
      const matches = field.options.filter(option => normalized(option.name) === normalized(value) || option.value === value.trim());
      assert(matches.length === 1, "Missing or ambiguous catalog option: configure it before importing.");
      return matches[0].value;
    };
    return field.type === 'select' ? choice(value) : [...new Set(value.split('|').map(choice))];
  }
  if (field.type === 'url') {
    const url = core.normalizeUrl(value);
    assert(core.isWebUrl(url) && url.length <= 2000, "The link must start with http:// or https://.");
    return url;
  }
  assert(value.length <= 200000, "Text is too long.");
  assert(field.custom || !['code', 'incident', 'problem'].includes(field.id) || value.length <= 200, "Codes can contain up to 200 characters.");
  if (field.type === 'richtext') return `<p>${input.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])).replace(/\r\n?|\n/g, '<br>')}</p>`;
  return value;
}
function prepareImport(data, kind, rows, mapping) {
  const fields = destinations(data, kind), byId = new Map(fields.map(field => [field.id, field]));
  assert(Array.isArray(mapping) && Array.isArray(rows), "Invalid or duplicate column mapping.");
  const mapped = mapping.filter(Boolean);
  assert(rows.length > 0 && rows.length <= MAX_ROWS, "Select a CSV with at least one data row and up to 10000 rows.");
  assert(mapped.includes('code') && (kind === 'tasks' || mapped.includes('incident') || mapped.includes('problem')), "Map the portal code and, for issues, at least incident or problem.");
  assert(new Set(mapped).size === mapped.length && mapped.every(id => byId.has(id)), "Invalid or duplicate column mapping.");
  const records = [], errors = [];
  let errorCount = 0, sequence = data.tasks.reduce((max, task) => Math.max(max, task.sequence), 0);
  const error = (row, column, message, custom = false) => { errorCount++; if (errors.length < 100) errors.push({ row, column, message, custom }); };
  rows.forEach((row, rowIndex) => {
    const before = errorCount;
    if (row.length !== mapping.length) { error(rowIndex + 1, '', "The cell count does not match the file columns."); return; }
    const record = kind === 'tasks' ? {
      id: globalThis.crypto.randomUUID(), code: '', sequence: ++sequence, url: '', description: '', notes: '', statusId: data.settings.statuses[0].id,
      urgencyId: data.settings.urgencies[Math.min(2, data.settings.urgencies.length - 1)].id, effortHours: 0, releaseDate: '', highlightId: '', hidden: false, tagIds: []
    } : { id: globalThis.crypto.randomUUID(), code: '', incident: '', problem: '' };
    let days = 0;
    mapping.forEach((id, index) => {
      if (!id) return;
      const field = byId.get(id);
      try {
        const value = convertCell(row[index], field);
        if (value === undefined) return;
        if (field.custom) {
          C.validateValue(value, C.fieldsOf(data.settings, kind).find(item => item.id === id));
          (record.customFields ||= {})[id] = value;
        } else if (id === 'effortDays') days = value;
        else record[id] = value;
      } catch (failure) { error(rowIndex + 1, field.name, failure.message, field.custom); }
    });
    if (!record.code) error(rowIndex + 1, "Portal code", "Enter the portal code.");
    if (kind === 'issues' && !record.incident && !record.problem) error(rowIndex + 1, '', "Enter at least an incident or problem.");
    if (kind === 'tasks') {
      record.effortHours = Math.round((record.effortHours + days * data.settings.hoursPerDay) * 100) / 100;
      if (!Number.isFinite(record.effortHours) || !Number.isSafeInteger(record.sequence)) error(rowIndex + 1, '', "Number out of range.");
      sequence = Math.max(sequence, record.sequence);
    }
    if (errorCount === before) records.push(record);
  });
  if (!errorCount) core.validateData({ ...data, [kind]: [...data[kind], ...records] });
  return { records, errors, errorCount };
}
const api = { MAX_BYTES, MAX_ROWS, parseCsv, detectDelimiter, destinations, suggestMapping, convertCell, prepareImport };
if (typeof module !== 'undefined') module.exports = api;
else globalThis.OrbitaCsv = api;
})();
