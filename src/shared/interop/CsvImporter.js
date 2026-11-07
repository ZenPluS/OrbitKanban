'use strict';
// Maps CSV columns onto task and issue fields and converts the rows into records.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const PlatformLinks = typeof module !== 'undefined' ? require('../columns/PlatformLinks') : globalThis.OrbitKanban.Columns.PlatformLinks;
const ColumnValidator = typeof module !== 'undefined' ? require('../columns/ColumnValidator') : globalThis.OrbitKanban.Columns.ColumnValidator;
const ArchiveValidator = typeof module !== 'undefined' ? require('../domain/ArchiveValidator') : globalThis.OrbitKanban.Domain.ArchiveValidator;
const CsvParser = typeof module !== 'undefined' ? require('./CsvParser') : globalThis.OrbitKanban.Interop.CsvParser;

class CsvImporter {
  static destinations(data, kind) {
    CsvParser.assert(['tasks', 'issues'].includes(kind), "Invalid import list.");
    const s = data.settings;
    const options = items => items.map(item => ({ value: item.id, name: item.name }));
    const base = kind === 'tasks' ? [
      { id: 'code', name: "Portal code", type: 'text' }, { id: 'sequence', name: "Sequence", type: 'number' },
      { id: 'description', name: "Description", type: 'richtext' },
      { id: 'statusId', name: "Status", type: 'select', options: options(s.statuses) },
      { id: 'urgencyId', name: "Urgency", type: 'select', options: options(s.urgencies) },
      { id: 'effortHours', name: "Effort (hours)", type: 'effort' }, { id: 'effortDays', name: "Effort in days", type: 'effort' },
      { id: 'releaseDate', name: 'Release date', type: 'date' }, { id: 'notes', name: "Notes", type: 'richtext' },
      { id: 'highlightId', name: "Highlight", type: 'select', options: options(s.highlights || []) },
      { id: 'tagIds', name: 'Tags', type: 'multiselect', options: options(s.tags || []) }, { id: 'hidden', name: "Hidden", type: 'boolean' }
    ] : ['code', 'incident', 'problem'].map((id, i) => ({ id, name: ["Portal code", 'Incident', 'Problem'][i], type: 'text' }));
    const columnId = id => ({ statusId: 'status', urgencyId: 'urgency', highlightId: 'highlight', tagIds: 'tags', effortHours: 'effort', effortDays: 'effort' })[id] || id;
    return [...base.filter(field => field.id === 'hidden' || ColumnSchema.hasColumn(s, kind, columnId(field.id))), ...ColumnSchema.fieldsOf(s, kind).filter(field => !ColumnSchema.REFERENCE_TYPES.includes(field.type)).map(field => ({ ...field, custom: true, options: ColumnSchema.choices(field).map(option => ({ ...option, value: option.id })) }))];
  }
  // Italian headers stay as aliases so CSV files made with the Italian interface still map automatically.
  static #aliases = {
    code: ['key', 'issue key', 'codice', 'codice portale', 'portal code'], sequence: ['sequence'],
    description: ['description'], notes: ['notes'], statusId: ['status'], urgencyId: ['urgency', 'priority', 'priorità'],
    effortHours: ['effort', 'hours', 'ore'], effortDays: ['days', 'giorni'], releaseDate: ['release', 'data release'], hidden: ['hidden']
  };
  static suggestMapping(headers, fields) {
    const used = new Set();
    return headers.map(header => {
      const matches = fields.filter(field => [field.id, field.name, ...(CsvImporter.#aliases[field.id] || [])].some(name => CsvParser.normalized(name) === CsvParser.normalized(header)));
      if (matches.length !== 1 || used.has(matches[0].id)) return '';
      used.add(matches[0].id); return matches[0].id;
    });
  }
  static convertCell(input, field) {
    const value = input.trim();
    if (!value) return undefined;
    if (['number', 'effort'].includes(field.type)) {
      CsvParser.assert(/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value), "Invalid number: use a decimal point or comma, without thousands separators.");
      const number = Number(value.replace(',', '.'));
      CsvParser.assert(Number.isFinite(number) && (field.type !== 'effort' || number >= 0) && (field.id !== 'sequence' || Number.isSafeInteger(number) && number >= 0), "Number out of range.");
      return number;
    }
    if (field.type === 'date') {
      const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const date = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : value;
      CsvParser.assert(ColumnSchema.validDate(date), "Invalid date: use YYYY-MM-DD or DD/MM/YYYY.");
      return date;
    }
    if (field.type === 'boolean') {
      const word = CsvParser.normalized(value);
      CsvParser.assert(['si', 'yes', 'true', '1', 'no', 'false', '0'].includes(word), "Invalid boolean: use yes/no, true/false or 1/0.");
      return ['si', 'yes', 'true', '1'].includes(word);
    }
    if (['select', 'multiselect'].includes(field.type)) {
      const choice = value => {
        const matches = field.options.filter(option => CsvParser.normalized(option.name) === CsvParser.normalized(value) || option.value === value.trim());
        CsvParser.assert(matches.length === 1, "Missing or ambiguous catalog option: configure it before importing.");
        return matches[0].value;
      };
      return field.type === 'select' ? choice(value) : [...new Set(value.split('|').map(choice))];
    }
    if (field.type === 'url') {
      const url = PlatformLinks.normalizeUrl(value);
      CsvParser.assert(PlatformLinks.isWebUrl(url) && url.length <= 2000, "The link must start with http:// or https://.");
      return url;
    }
    if (field.type === 'platform') return PlatformLinks.platformValue(field, value);
    CsvParser.assert(value.length <= 200000, "Text is too long.");
    CsvParser.assert(field.custom || !['code', 'incident', 'problem'].includes(field.id) || value.length <= 200, "Codes can contain up to 200 characters.");
    if (field.type === 'richtext') return `<p>${input.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])).replace(/\r\n?|\n/g, '<br>')}</p>`;
    return value;
  }
  static prepareImport(data, kind, rows, mapping) {
    const fields = CsvImporter.destinations(data, kind), byId = new Map(fields.map(field => [field.id, field]));
    CsvParser.assert(Array.isArray(mapping) && Array.isArray(rows), "Invalid or duplicate column mapping.");
    const mapped = mapping.filter(Boolean);
    CsvParser.assert(rows.length > 0 && rows.length <= CsvParser.MAX_ROWS, "Select a CSV with at least one data row and up to 10000 rows.");
    CsvParser.assert(mapped.length > 0, "Map at least one existing column.");
    CsvParser.assert((!ColumnSchema.hasColumn(data.settings, kind, 'code') || mapped.includes('code')) &&
      (kind === 'tasks' || !['incident', 'problem'].some(id => ColumnSchema.hasColumn(data.settings, kind, id)) || mapped.includes('incident') || mapped.includes('problem')), "Map the portal code and, for issues, at least incident or problem.");
    CsvParser.assert(new Set(mapped).size === mapped.length && mapped.every(id => byId.has(id)), "Invalid or duplicate column mapping.");
    const records = [], errors = [];
    let errorCount = 0, sequence = data.tasks.reduce((max, task) => Math.max(max, task.sequence), 0);
    const error = (row, column, message, custom = false) => { errorCount++; if (errors.length < 100) errors.push({ row, column, message, custom }); };
    rows.forEach((row, rowIndex) => {
      const before = errorCount;
      if (row.length !== mapping.length) { error(rowIndex + 1, '', "The cell count does not match the file columns."); return; }
      const record = kind === 'tasks' ? {
        id: globalThis.crypto.randomUUID(), code: '', sequence: ColumnSchema.hasColumn(data.settings, kind, 'sequence') ? ++sequence : 0, description: '', notes: '', statusId: ColumnSchema.hasColumn(data.settings, kind, 'status') ? data.settings.statuses[0]?.id || '' : '',
        urgencyId: ColumnSchema.hasColumn(data.settings, kind, 'urgency') ? data.settings.urgencies[Math.min(2, data.settings.urgencies.length - 1)]?.id || '' : '', effortHours: 0, releaseDate: '', highlightId: '', hidden: false, tagIds: []
      } : { id: globalThis.crypto.randomUUID(), code: '', incident: '', problem: '' };
      let days = 0;
      mapping.forEach((id, index) => {
        if (!id) return;
        const field = byId.get(id);
        try {
          const value = CsvImporter.convertCell(row[index], field);
          if (value === undefined) return;
          if (field.custom) {
            ColumnValidator.validateValue(value, ColumnSchema.fieldsOf(data.settings, kind).find(item => item.id === id));
            (record.customFields ||= {})[id] = value;
          } else if (id === 'effortDays') days = value;
          else record[id] = value;
        } catch (failure) { error(rowIndex + 1, field.name, failure.message, field.custom); }
      });
      if (ColumnSchema.hasColumn(data.settings, kind, 'code') && !record.code) error(rowIndex + 1, "Portal code", "Enter the portal code.");
      if (kind === 'issues' && ['incident', 'problem'].some(id => ColumnSchema.hasColumn(data.settings, kind, id)) && !record.incident && !record.problem) error(rowIndex + 1, '', "Enter at least an incident or problem.");
      if (kind === 'tasks') {
        record.effortHours = Math.round((record.effortHours + days * data.settings.hoursPerDay) * 100) / 100;
        if (!Number.isFinite(record.effortHours) || !Number.isSafeInteger(record.sequence)) error(rowIndex + 1, '', "Number out of range.");
        sequence = Math.max(sequence, record.sequence);
      }
      if (errorCount === before) records.push(record);
    });
    if (!errorCount) ArchiveValidator.validateData({ ...data, [kind]: [...data[kind], ...records] });
    return { records, errors, errorCount };
  }
}

if (typeof module !== 'undefined') module.exports = CsvImporter;
else ((globalThis.OrbitKanban ??= {}).Interop ??= {}).CsvImporter = CsvImporter;
})();
