'use strict';
// Task editor form layout: modal size, layout columns, sections and field placement.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class TaskLayout {
  // Task editor form: a modal of chosen size split into layout columns, each holding titled sections with their own field grid.
  static TASK_LAYOUT = {
    width: { min: 480, max: 2000, default: 1260 }, height: { min: 360, max: 1600 },
    columns: 3, columnWidth: { min: 10, max: 100 }, sections: 30, sectionColumns: 4, sectionName: 60, fields: 100
  };
  static taskEditorFields(settings) {
    const schema = ColumnSchema.schemaOf(settings, 'tasks');
    const order = ['code', 'sequence', 'urgency', 'status', 'releaseDate', 'highlight', 'effort'];
    const field = definition => ({
      id: definition.id, name: definition.name, builtin: Boolean(definition.builtin), type: definition.type,
      section: definition.type === 'richtext' ? 'text' : 'properties', span: ['richtext', 'url', 'platform', 'effort', 'parent', 'child'].includes(definition.type) ? 2 : 1
    });
    const available = id => schema.find(item => item.id === id), custom = ColumnSchema.fieldsOf(settings, 'tasks');
    const linked = ColumnSchema.hasColumn(settings, 'tasks', 'code') && ColumnSchema.hasColumn(settings, 'issues', 'code') &&
      ['incident', 'problem'].some(id => ColumnSchema.hasColumn(settings, 'tasks', id) && ColumnSchema.hasColumn(settings, 'issues', id));
    return [
      ...order.filter(available).map(id => field(available(id))),
      { id: 'hidden', name: 'Hide from the task list', builtin: true, type: 'boolean', section: 'properties', span: 2 },
      ...(linked ? [{ id: 'matches', name: 'Linked issues', builtin: true, type: 'matches', section: 'properties', span: 2 }] : []),
      ...custom.filter(item => item.type !== 'richtext').map(field),
      ...['description', 'notes'].filter(available).map(id => field(available(id))),
      { id: 'attachments', name: 'Attachments', builtin: true, type: 'attachments', section: 'text', span: 1 },
      ...custom.filter(item => item.type === 'richtext').map(field)
    ];
  }
  static #layoutName = (text, settings) => { const value = Common.term(text, settings.language || 'it').trim(); return value && value.length <= TaskLayout.TASK_LAYOUT.sectionName ? value : text; };
  static #layoutSection = (settings, sectionId, name, columnCount, fields = []) => ({ id: sectionId, name: TaskLayout.#layoutName(name, settings), showName: false, columns: columnCount, fields });
  static defaultTaskEditorLayout(settings) {
    const fields = TaskLayout.taskEditorFields(settings);
    const pick = (group, columnCount) => fields.filter(field => field.section === group).map(({ id, span }) => ({ id, span: Math.min(span, columnCount) }));
    const properties = TaskLayout.#layoutSection(settings, 'section-properties', "Properties", 2, pick('properties', 2));
    const text = TaskLayout.#layoutSection(settings, 'section-text', "Text panels", 1, pick('text', 1));
    const layoutColumns = text.fields.length ? [{ width: 40, sections: [properties] }, { width: 60, sections: [text] }] : [{ width: 100, sections: [properties] }];
    return { width: TaskLayout.TASK_LAYOUT.width.default, height: 0, columns: layoutColumns, unplaced: [] };
  }
  // 2.50 stored { mode, columns, fields: [{ id, section, span, visible }] }: rebuild it as the equivalent sections.
  static migrateLegacyTaskLayout(settings, legacy) {
    const properties = TaskLayout.#layoutSection(settings, 'section-properties', "Properties", legacy.columns);
    const text = TaskLayout.#layoutSection(settings, 'section-text', "Text panels", 1);
    const unplaced = [];
    for (const field of legacy.fields) {
      if (!field.visible) unplaced.push(field.id);
      else (field.section === 'text' ? text : properties).fields.push({ id: field.id, span: field.span });
    }
    const layoutColumns = legacy.mode === 'stacked' ? [{ width: 100, sections: [properties, text] }]
      : legacy.mode === 'text-first' ? [{ width: 60, sections: [text] }, { width: 40, sections: [properties] }]
      : [{ width: 40, sections: [properties] }, { width: 60, sections: [text] }];
    return { width: TaskLayout.TASK_LAYOUT.width.default, height: 0, columns: layoutColumns, unplaced };
  }
  static #layoutInteger = (value, { min, max }) => Number.isInteger(value) && value >= min && value <= max;
  static #layoutFieldId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
  static #validLegacyTaskLayout(layout) {
    return ['split', 'text-first', 'stacked'].includes(layout.mode) && [1, 2].includes(layout.columns) &&
      Array.isArray(layout.fields) && layout.fields.length <= TaskLayout.TASK_LAYOUT.fields &&
      layout.fields.every(field => Common.plainObject(field) && TaskLayout.#layoutFieldId(field.id) &&
        ['properties', 'text'].includes(field.section) && [1, 2].includes(field.span) && typeof field.visible === 'boolean') &&
      new Set(layout.fields.map(field => field.id)).size === layout.fields.length;
  }
  static validTaskEditorLayout(layout) {
    if (!Common.plainObject(layout)) return false;
    if (layout.mode !== undefined) return TaskLayout.#validLegacyTaskLayout(layout);
    const fieldIds = [], sectionIds = [];
    const validSection = section => Common.plainObject(section) && typeof section.id === 'string' && /^section-[\w-]{1,80}$/.test(section.id) &&
      typeof section.name === 'string' && section.name.length <= TaskLayout.TASK_LAYOUT.sectionName && typeof section.showName === 'boolean' &&
      TaskLayout.#layoutInteger(section.columns, { min: 1, max: TaskLayout.TASK_LAYOUT.sectionColumns }) && Array.isArray(section.fields) &&
      section.fields.every(field => Common.plainObject(field) && TaskLayout.#layoutFieldId(field.id) && TaskLayout.#layoutInteger(field.span, { min: 1, max: TaskLayout.TASK_LAYOUT.sectionColumns }) && fieldIds.push(field.id)) &&
      sectionIds.push(section.id) > 0;
    return TaskLayout.#layoutInteger(layout.width, TaskLayout.TASK_LAYOUT.width) && (layout.height === 0 || TaskLayout.#layoutInteger(layout.height, TaskLayout.TASK_LAYOUT.height)) &&
      Array.isArray(layout.columns) && layout.columns.length >= 1 && layout.columns.length <= TaskLayout.TASK_LAYOUT.columns &&
      layout.columns.every(column => Common.plainObject(column) && TaskLayout.#layoutInteger(column.width, TaskLayout.TASK_LAYOUT.columnWidth) && Array.isArray(column.sections) && column.sections.every(validSection)) &&
      Array.isArray(layout.unplaced) && layout.unplaced.every(fieldId => TaskLayout.#layoutFieldId(fieldId) && fieldIds.push(fieldId)) &&
      sectionIds.length <= TaskLayout.TASK_LAYOUT.sections && new Set(sectionIds).size === sectionIds.length &&
      fieldIds.length <= TaskLayout.TASK_LAYOUT.fields && new Set(fieldIds).size === fieldIds.length;
  }
  // Unknown fields are dropped and fields added later (new custom columns) join the section that holds fields of the same kind.
  static normalizeTaskEditorLayout(settings, input = settings.taskEditorLayout) {
    Common.assert(input === undefined || TaskLayout.validTaskEditorLayout(input), "Invalid task editor layout.");
    if (input === undefined) return TaskLayout.defaultTaskEditorLayout(settings);
    const source = input.mode !== undefined ? TaskLayout.migrateLegacyTaskLayout(settings, input) : input;
    const available = TaskLayout.taskEditorFields(settings), known = new Map(available.map(field => [field.id, field])), seen = new Set();
    const layoutColumns = source.columns.map(column => ({
      width: column.width,
      sections: column.sections.map(section => ({
        id: section.id, name: section.name, showName: section.showName, columns: section.columns,
        fields: section.fields.filter(field => known.has(field.id)).map(field => { seen.add(field.id); return { id: field.id, span: Math.min(field.span, section.columns) }; })
      }))
    }));
    const unplaced = source.unplaced.filter(fieldId => known.has(fieldId) && !seen.has(fieldId));
    unplaced.forEach(fieldId => seen.add(fieldId));
    const sections = () => layoutColumns.flatMap(column => column.sections);
    for (const field of available.filter(item => !seen.has(item.id))) {
      let target = sections().find(section => section.fields.some(item => known.get(item.id).section === field.section)) || sections()[0];
      if (!target) {
        target = TaskLayout.#layoutSection(settings, sections().some(section => section.id === 'section-properties') ? `section-${Common.id()}` : 'section-properties', "Properties", 2);
        layoutColumns[0].sections.push(target);
      }
      target.fields.push({ id: field.id, span: Math.min(field.span, target.columns) });
    }
    return { width: source.width, height: source.height, columns: layoutColumns, unplaced };
  }
  // Imported layouts may name custom columns with ids that were remapped while merging the column definitions.
  static remapTaskEditorLayout(settings, layout, mapping) {
    const source = layout.mode !== undefined ? TaskLayout.migrateLegacyTaskLayout(settings, layout) : structuredClone(layout), seen = new Set();
    const map = fieldId => { const target = mapping.get(fieldId) || fieldId; if (seen.has(target)) return ''; seen.add(target); return target; };
    for (const column of source.columns) for (const section of column.sections) section.fields = section.fields.map(field => ({ ...field, id: map(field.id) })).filter(field => field.id);
    source.unplaced = source.unplaced.map(map).filter(Boolean);
    return TaskLayout.normalizeTaskEditorLayout(settings, source);
  }
}

if (typeof module !== 'undefined') module.exports = TaskLayout;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TaskLayout = TaskLayout;
})();
