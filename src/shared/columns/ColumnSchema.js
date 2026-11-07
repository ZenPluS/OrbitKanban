'use strict';
// Column catalog: built-in and custom field definitions and record values.
(() => {
class ColumnSchema {
  static TYPES = ['text', 'richtext', 'number', 'date', 'select', 'multiselect', 'url', 'platform', 'effort', 'boolean', 'parent', 'child'];
  // Reference columns only exist on tasks: a parent column stores the predecessors, its child column shows the successors.
  static REFERENCE_TYPES = ['parent', 'child'];
  static REFERENCE_MAX = 500;
  static FIELD_LIMIT = 40;
  static LEGACY_LINK_ID = 'custom-platform-link';
  static ownObject = value => value && typeof value === 'object' && !Array.isArray(value);
  static assert = (condition, message) => { if (!condition) throw new Error(message); };
  static key = value => value.trim().toLocaleLowerCase();
  static fieldsOf = (settings, kind) => settings[kind === 'tasks' ? 'taskFields' : 'issueFields'] === undefined ? [] : settings[kind === 'tasks' ? 'taskFields' : 'issueFields'];
  static validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  static choices = field => field.options.map(option => typeof option === 'string' ? { id: option, name: option, color: '#a392ff' } : { ...option });
  static BUILTIN_FIELDS = {
    tasks: [
      { id: 'sequence', name: 'Sequence', type: 'number', property: 'sequence', sort: 'sequence', empty: 0 },
      { id: 'code', name: 'Portal code', type: 'text', property: 'code', sort: 'code', empty: '' },
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
  static deletedKey = kind => kind === 'tasks' ? 'deletedTaskColumns' : 'deletedIssueColumns';
  static deletedOf = (settings, kind) => settings[ColumnSchema.deletedKey(kind)] || [];
  static hasColumn = (settings, kind, id) => ColumnSchema.BUILTIN_FIELDS[kind].some(field => field.id === id)
    ? !ColumnSchema.deletedOf(settings, kind).includes(id) : ColumnSchema.fieldsOf(settings, kind).some(field => field.id === id);
  static schemaOf = (settings, kind) => [
    ...ColumnSchema.BUILTIN_FIELDS[kind].filter(field => ColumnSchema.hasColumn(settings, kind, field.id)).map(field => ({ ...field, builtin: true, options: field.catalog ? settings[field.catalog] || [] : [] })),
    ...ColumnSchema.fieldsOf(settings, kind)
  ];
  static getValue = (record, field) => field.builtin ? record[field.property] : record.customFields?.[field.id];
  static setValue(record, field, value) {
    if (field.builtin) record[field.property] = value;
    else (record.customFields ||= {})[field.id] = value;
  }
}

if (typeof module !== 'undefined') module.exports = ColumnSchema;
else ((globalThis.OrbitKanban ??= {}).Columns ??= {}).ColumnSchema = ColumnSchema;
})();
