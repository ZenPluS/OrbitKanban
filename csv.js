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
  assert(typeof input === 'string' && input.length <= MAX_BYTES, 'Il CSV supera il limite di 16 MB.');
  const text = input.replace(/^\uFEFF/, '');
  delimiter ||= detectDelimiter(text);
  assert([';', ',', '\t'].includes(delimiter), 'Separatore CSV non valido.');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false, skipped = 0;
  const endCell = () => { row.push(cell); cell = ''; closed = false; assert(row.length <= 100, 'Il CSV contiene troppe colonne.'); };
  const endRow = () => { endCell(); if (row.some(value => value.trim())) rows.push(row); else skipped++; row = []; assert(rows.length <= MAX_ROWS + 1, 'Il CSV supera il limite di 10000 righe.'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (closed && char === ' ') continue;
    else if (char === '"' && !cell && !closed) quoted = true;
    else { assert(char !== '"' && !closed, 'Virgolette CSV non valide.'); cell += char; }
  }
  assert(!quoted, 'Il CSV contiene un campo tra virgolette non chiuso.');
  if (cell || row.length || closed) endRow();
  assert(rows.length > 0, 'Il CSV è vuoto.');
  return { rows, delimiter, skipped };
}
function destinations(data, kind) {
  assert(['tasks', 'issues'].includes(kind), 'Lista di importazione non valida.');
  const s = data.settings;
  const options = items => items.map(item => ({ value: item.id, name: item.name }));
  const base = kind === 'tasks' ? [
    { id: 'code', name: 'Codice portale', type: 'text' }, { id: 'sequence', name: 'Progressivo', type: 'number' },
    { id: 'url', name: 'Link specifico', type: 'url' }, { id: 'description', name: 'Descrizione', type: 'richtext' },
    { id: 'statusId', name: 'Stato', type: 'select', options: options(s.statuses) },
    { id: 'urgencyId', name: 'Urgenza', type: 'select', options: options(s.urgencies) },
    { id: 'effortHours', name: 'Effort (ore)', type: 'effort' }, { id: 'effortDays', name: 'Effort in giorni', type: 'effort' },
    { id: 'releaseDate', name: 'Release date', type: 'date' }, { id: 'notes', name: 'Note', type: 'richtext' },
    { id: 'highlightId', name: 'Evidenziazione', type: 'select', options: options(s.highlights || []) },
    { id: 'tagIds', name: 'Tags', type: 'multiselect', options: options(s.tags || []) }, { id: 'hidden', name: 'Nascosta', type: 'boolean' }
  ] : ['code', 'incident', 'problem'].map((id, i) => ({ id, name: ['Codice portale', 'Incident', 'Problem'][i], type: 'text' }));
  return [...base, ...C.fieldsOf(s, kind).map(field => ({ ...field, custom: true, options: field.options.map(name => ({ value: name, name })) }))];
}
const aliases = {
  code: ['key', 'issue key', 'codice', 'portal code'], sequence: ['sequence'], url: ['url', 'link'],
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
    assert(/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value), 'Numero non valido: usare il punto o la virgola decimale, senza separatori delle migliaia.');
    const number = Number(value.replace(',', '.'));
    assert(Number.isFinite(number) && (field.type !== 'effort' || number >= 0) && (field.id !== 'sequence' || Number.isSafeInteger(number) && number >= 0), 'Numero fuori intervallo.');
    return number;
  }
  if (field.type === 'date') {
    const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : value;
    assert(C.validDate(date), 'Data non valida: usare AAAA-MM-GG oppure GG/MM/AAAA.');
    return date;
  }
  if (field.type === 'boolean') {
    const word = normalized(value);
    assert(['si', 'yes', 'true', '1', 'no', 'false', '0'].includes(word), 'Valore booleano non valido: usare sì/no, true/false oppure 1/0.');
    return ['si', 'yes', 'true', '1'].includes(word);
  }
  if (['select', 'multiselect'].includes(field.type)) {
    const choice = value => {
      const matches = field.options.filter(option => normalized(option.name) === normalized(value) || option.value === value.trim());
      assert(matches.length === 1, 'Opzione assente o ambigua nel catalogo: configurarla prima di importare.');
      return matches[0].value;
    };
    return field.type === 'select' ? choice(value) : [...new Set(value.split('|').map(choice))];
  }
  if (field.type === 'url') {
    const url = core.normalizeUrl(value);
    assert(core.isWebUrl(url) && url.length <= 2000, 'Il link deve iniziare con http:// o https://.');
    return url;
  }
  assert(value.length <= 200000, 'Testo troppo lungo.');
  assert(field.custom || !['code', 'incident', 'problem'].includes(field.id) || value.length <= 200, 'I codici possono contenere al massimo 200 caratteri.');
  if (field.type === 'richtext') return `<p>${input.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])).replace(/\r\n?|\n/g, '<br>')}</p>`;
  return value;
}
function prepareImport(data, kind, rows, mapping) {
  const fields = destinations(data, kind), byId = new Map(fields.map(field => [field.id, field]));
  assert(Array.isArray(mapping) && Array.isArray(rows), 'Mappatura colonne non valida o duplicata.');
  const mapped = mapping.filter(Boolean);
  assert(rows.length > 0 && rows.length <= MAX_ROWS, 'Selezionare un CSV con almeno una riga dati e al massimo 10000 righe.');
  assert(mapped.includes('code') && (kind === 'tasks' || mapped.includes('incident') || mapped.includes('problem')), 'Mappare il codice portale e, per le issue, almeno incident o problem.');
  assert(new Set(mapped).size === mapped.length && mapped.every(id => byId.has(id)), 'Mappatura colonne non valida o duplicata.');
  const records = [], errors = [];
  let errorCount = 0, sequence = data.tasks.reduce((max, task) => Math.max(max, task.sequence), 0);
  const error = (row, column, message, custom = false) => { errorCount++; if (errors.length < 100) errors.push({ row, column, message, custom }); };
  rows.forEach((row, rowIndex) => {
    const before = errorCount;
    if (row.length !== mapping.length) { error(rowIndex + 1, '', 'Il numero di celle non corrisponde alle colonne del file.'); return; }
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
    if (!record.code) error(rowIndex + 1, 'Codice portale', 'Indicare il codice portale.');
    if (kind === 'issues' && !record.incident && !record.problem) error(rowIndex + 1, '', 'Indicare almeno un incident o problem.');
    if (kind === 'tasks') {
      record.effortHours = Math.round((record.effortHours + days * data.settings.hoursPerDay) * 100) / 100;
      if (!Number.isFinite(record.effortHours) || !Number.isSafeInteger(record.sequence)) error(rowIndex + 1, '', 'Numero fuori intervallo.');
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
