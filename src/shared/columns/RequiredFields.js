'use strict';
// Which columns are mandatory in the task and issue forms.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('./ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;

class RequiredFields {
  // Columns without an editor control (or with an always-valid one) cannot be mandatory.
  static #UNREQUIRABLE = { tasks: ['tags', 'incident', 'problem'], issues: ['linked'] };
  static DEFAULT_REQUIRED = { tasks: ['sequence'], issues: [] };
  static requiredKey = kind => kind === 'tasks' ? 'requiredTaskColumns' : 'requiredIssueColumns';
  static canRequire = (settings, kind, id) => !RequiredFields.#UNREQUIRABLE[kind].includes(id) && ColumnSchema.schemaOf(settings, kind).some(field => field.id === id && !['boolean', 'child'].includes(field.type));
  static requiredOf = (settings, kind) => (settings[RequiredFields.requiredKey(kind)] ?? RequiredFields.DEFAULT_REQUIRED[kind]).filter(id => RequiredFields.canRequire(settings, kind, id));
  static isRequired = (settings, kind, id) => RequiredFields.requiredOf(settings, kind).includes(id);
  static validateRequired(settings) {
    for (const kind of ['tasks', 'issues']) {
      const list = settings[RequiredFields.requiredKey(kind)];
      ColumnSchema.assert(list === undefined || (Array.isArray(list) && list.length <= 100 && list.every(id => typeof id === 'string' && id && id.length <= 200) && new Set(list).size === list.length), "Invalid required columns.");
    }
  }
}

if (typeof module !== 'undefined') module.exports = RequiredFields;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).RequiredFields = RequiredFields;
})();
