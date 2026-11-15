'use strict';
// Portable CSV mappings use header names (or positions without headers) and stable destination IDs.
(() => {
const CsvParser = typeof module !== 'undefined' ? require('./CsvParser') : globalThis.OrbitKanban.Interop.CsvParser;
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
class CsvImportProfiles {
  static LIMIT = 30;
  static validate(profiles = []) {
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    CsvParser.assert(Array.isArray(profiles) && profiles.length <= CsvImportProfiles.LIMIT && profiles.every(profile =>
      profile && text(profile.id, 200) && profile.id && text(profile.name, 60) && profile.name.trim() &&
      ['tasks', 'issues'].includes(profile.kind) && ['utf-8', 'windows-1252', 'utf-16le'].includes(profile.encoding) &&
      ['', ';', ',', 'tab'].includes(profile.separator) && typeof profile.firstRowHeader === 'boolean' &&
      Array.isArray(profile.columns) && profile.columns.length > 0 && profile.columns.length <= 100 &&
      profile.columns.every(column => column && text(column.header, 2000) && text(column.target, 200) &&
        (column.target ? ColumnSchema.TYPES.includes(column.type) && !ColumnSchema.REFERENCE_TYPES.includes(column.type) : column.type === '')) &&
      profile.columns.some(column => column.target) &&
      new Set(profile.columns.filter(column => column.target).map(column => column.target)).size === profile.columns.filter(column => column.target).length
    ) && new Set(profiles.map(profile => profile.id)).size === profiles.length &&
      new Set(profiles.map(profile => `${profile.kind}:${profile.name.trim().toLocaleLowerCase()}`)).size === profiles.length, "Invalid CSV import profiles.");
    return profiles;
  }
  static create(options, headers, mapping, fields) {
    CsvParser.assert(headers.length === mapping.length && mapping.some(Boolean), "Map at least one existing column.");
    const columns = mapping.map((target, index) => {
      const field = target && fields.find(field => field.id === target);
      CsvParser.assert(!target || field, "The CSV destination fields changed. Review the mapping.");
      return { header: options.firstRowHeader ? headers[index] : '', target, type: field ? field.type : '' };
    });
    const profile = { ...options, name: options.name.trim(), columns };
    CsvImportProfiles.validate([profile]);
    return profile;
  }
  static apply(profile, headers, fields, firstRowHeader = profile.firstRowHeader) {
    CsvImportProfiles.validate([profile]);
    const used = new Set(), targets = new Set(), byId = new Map(fields.map(field => [field.id, field]));
    let needsReview = headers.length !== profile.columns.length || firstRowHeader !== profile.firstRowHeader;
    const names = headers.map(CsvParser.normalized);
    if (firstRowHeader && new Set(names).size !== names.length) needsReview = true;
    const mapping = headers.map((header, index) => {
      if (firstRowHeader !== profile.firstRowHeader) return '';
      const savedIndex = firstRowHeader ? profile.columns.findIndex((column, i) => !used.has(i) && CsvParser.normalized(column.header) === names[index]) : index;
      const column = profile.columns[savedIndex];
      if (!column) { needsReview = true; return ''; }
      used.add(savedIndex);
      if (!column.target) return '';
      const field = byId.get(column.target);
      if (!field || field.type !== column.type || targets.has(column.target)) { needsReview = true; return ''; }
      targets.add(column.target);
      return column.target;
    });
    if (used.size !== profile.columns.length) needsReview = true;
    return { mapping, needsReview };
  }
  static remap(profiles, maps) {
    return profiles.map(profile => ({ ...profile, columns: profile.columns.map(column => ({
      ...column, target: maps[profile.kind].mapping.get(column.target) || column.target
    })) }));
  }
}
if (typeof module !== 'undefined') module.exports = CsvImportProfiles;
else ((globalThis.OrbitKanban ??= {}).Interop ??= {}).CsvImportProfiles = CsvImportProfiles;
})();
