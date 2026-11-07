'use strict';
// Column filters: validation and matching of filter values.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;

class ColumnFilters {
  // Filter value that selects the cells without a value, next to the real values of the column.
  static EMPTY_VALUE = '__empty__';
  static FILTER_VALUES_MAX = 1000;
  static validFilters(filters, ids, types = {}) {
    const bound = (value, type) => value === '' || (type === 'date' ? ColumnSchema.validDate(value) : ['number', 'effort'].includes(type) && value.trim() !== '' && Number.isFinite(Number(value)));
    return filters === undefined || (ColumnSchema.ownObject(filters) && Object.entries(filters).every(([id, filter]) => ids.includes(id) && ColumnSchema.ownObject(filter)
      && typeof filter.text === 'string' && filter.text.length <= 200 && ['any', 'empty', 'filled'].includes(filter.empty)
      && typeof filter.min === 'string' && filter.min.length <= 40 && typeof filter.max === 'string' && filter.max.length <= 40
      && bound(filter.min, types[id]) && bound(filter.max, types[id])
      && (!filter.min || !filter.max || (types[id] === 'date' ? filter.min <= filter.max : Number(filter.min) <= Number(filter.max)))
      && Array.isArray(filter.values) && filter.values.length <= ColumnFilters.FILTER_VALUES_MAX && filter.values.every(value => typeof value === 'string' && value.length <= 200)
      && (types[id] !== 'date' || filter.values.every(value => value === ColumnFilters.EMPTY_VALUE || ColumnSchema.validDate(value)))));
  }
  static emptyFilter = () => ({ text: '', min: '', max: '', values: [], empty: 'any' });
  static activeFilter = filter => filter && Boolean(filter.text || filter.min || filter.max || filter.values.length || filter.empty !== 'any');
  static matchesFilter(value, filter, type) {
    if (!ColumnFilters.activeFilter(filter)) return true;
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    if (filter.empty === 'empty') return empty;
    if (filter.empty === 'filled' && empty) return false;
    if (type === 'date') {
      // Ticked dates, the From/To range and "without date" add up: a row passes when it matches any of them.
      const dates = filter.values.filter(item => item !== ColumnFilters.EMPTY_VALUE), range = Boolean(filter.min || filter.max);
      if (!dates.length && !range && !filter.values.includes(ColumnFilters.EMPTY_VALUE)) return true;
      if (empty) return filter.values.includes(ColumnFilters.EMPTY_VALUE);
      return dates.includes(value) || (range && (!filter.min || value >= filter.min) && (!filter.max || value <= filter.max));
    }
    if (empty) return filter.values.includes(ColumnFilters.EMPTY_VALUE) || (!filter.text && !filter.min && !filter.max && !filter.values.length);
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    if (filter.values.length && !values.some(value => filter.values.includes(value))) return false;
    if (filter.text && !values.some(value => value.toLocaleLowerCase().includes(filter.text.toLocaleLowerCase()))) return false;
    if (filter.min || filter.max) {
      const actual = type === 'date' ? value : Number(value), min = type === 'date' ? filter.min : Number(filter.min), max = type === 'date' ? filter.max : Number(filter.max);
      if (filter.min && actual < min || filter.max && actual > max) return false;
    }
    return true;
  }
}

if (typeof module !== 'undefined') module.exports = ColumnFilters;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnFilters = ColumnFilters;
})();
