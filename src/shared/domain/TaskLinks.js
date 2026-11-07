'use strict';
// Task addresses on their platforms, and the upgrade of the legacy portal link column.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const PlatformLinks = typeof module !== 'undefined' ? require('../columns/PlatformLinks') : globalThis.OrbitKanban.Columns.PlatformLinks;
const ColumnLayout = typeof module !== 'undefined' ? require('../columns/ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class TaskLinks {
  // Address of the task on its platform: the first "Link to platform" column, in list order, that gives a valid address.
  static platformUrl(task, settings) {
    const fields = new Map(ColumnSchema.fieldsOf(settings, 'tasks').filter(field => field.type === 'platform').map(field => [field.id, field]));
    for (const column of ColumnLayout.listColumns(settings, 'tasks')) {
      const field = fields.get(column.id), url = field ? PlatformLinks.platformLink(field, task.customFields?.[field.id]) : '';
      if (url) return url;
    }
    return '';
  }
  static #LEGACY_LINK = 'link';
  // Up to 2.60 every task had a built-in "Portal link" column (task.url) filled from one organization template.
  // It becomes an ordinary "Link to platform" column: the template moves to the column, a specific link or the code becomes its value.
  static upgradeLegacyLink(settings, tasks, { language = 'it', template, fillCodes = false } = {}) {
    if (!Common.plainObject(settings)) return false;
    const list = Array.isArray(tasks) ? tasks.filter(Common.plainObject) : [];
    const columnIds = value => Array.isArray(value) && value.some(column => column?.id === TaskLinks.#LEGACY_LINK);
    const layout = settings.taskEditorLayout;
    const inLayout = Common.plainObject(layout) && (Array.isArray(layout.fields) ? layout.fields.some(field => field?.id === TaskLinks.#LEGACY_LINK)
      : (Array.isArray(layout.columns) && layout.columns.some(column => Array.isArray(column?.sections) && column.sections.some(section => Array.isArray(section?.fields) && section.fields.some(field => field?.id === TaskLinks.#LEGACY_LINK)))) || (Array.isArray(layout.unplaced) && layout.unplaced.includes(TaskLinks.#LEGACY_LINK)));
    const deletedList = Array.isArray(settings.deletedTaskColumns) ? settings.deletedTaskColumns : [];
    const legacy = 'portalUrlTemplate' in settings || list.some(task => 'url' in task) || deletedList.includes(TaskLinks.#LEGACY_LINK) || columnIds(settings.taskColumns)
      || (Array.isArray(settings.requiredTaskColumns) && settings.requiredTaskColumns.includes(TaskLinks.#LEGACY_LINK)) || inLayout
      || (Array.isArray(settings.savedViews) && settings.savedViews.some(view => columnIds(view?.columns) || (Common.plainObject(view?.columnFilters) && TaskLinks.#LEGACY_LINK in view.columnFilters)));
    if (!legacy) return false;
    const deleted = deletedList.includes(TaskLinks.#LEGACY_LINK);
    let fieldId = '';
    if (!deleted) {
      const fields = Array.isArray(settings.taskFields) ? settings.taskFields : (settings.taskFields = []);
      const rawTemplate = typeof (template ?? settings.portalUrlTemplate) === 'string' ? (template ?? settings.portalUrlTemplate).trim() : '';
      const validTemplate = rawTemplate && PlatformLinks.validTemplate(rawTemplate) ? rawTemplate : '';
      const names = new Set(fields.map(field => typeof field?.name === 'string' ? field.name.trim().toLocaleLowerCase() : ''));
      const base = Common.term("Link to platform", language).trim().slice(0, 56) || "Link to platform";
      let name = base;
      for (let index = 2; names.has(name.toLocaleLowerCase()); index++) name = `${base} ${index}`;
      fieldId = fields.some(field => field?.id === ColumnSchema.LEGACY_LINK_ID) ? `custom-${Common.id()}` : ColumnSchema.LEGACY_LINK_ID;
      fields.push({ id: fieldId, name, type: 'platform', options: [], template: validTemplate });
      for (const task of list) {
        const url = typeof task.url === 'string' ? task.url.trim() : '', code = typeof task.code === 'string' ? task.code.replace(/\s+/g, ' ').replace(/[\u0000-\u001f]/g, '').trim() : '';
        const value = url && url.length <= 2000 && PlatformLinks.isWebUrl(url) ? url : (validTemplate || fillCodes) && code.length <= 2000 ? code : '';
        if (!value || (task.customFields !== undefined && !Common.plainObject(task.customFields))) continue;
        task.customFields = { ...(task.customFields || {}), [fieldId]: value };
      }
    }
    const swap = ids => Array.isArray(ids) ? ids.flatMap(item => item === TaskLinks.#LEGACY_LINK ? (fieldId ? [fieldId] : []) : [item]) : ids;
    const swapColumns = items => Array.isArray(items) ? items.flatMap(item => item?.id === TaskLinks.#LEGACY_LINK ? (fieldId ? [{ ...item, id: fieldId }] : []) : [item]) : items;
    settings.taskColumns = swapColumns(settings.taskColumns);
    settings.requiredTaskColumns = swap(settings.requiredTaskColumns);
    if (Array.isArray(settings.savedViews)) for (const view of settings.savedViews.filter(Common.plainObject)) {
      view.columns = swapColumns(view.columns);
      if (Common.plainObject(view.columnFilters) && TaskLinks.#LEGACY_LINK in view.columnFilters) {
        view.columnFilters = Object.fromEntries(Object.entries(view.columnFilters).flatMap(([key, value]) => key === TaskLinks.#LEGACY_LINK ? (fieldId ? [[fieldId, value]] : []) : [[key, value]]));
      }
    }
    if (Common.plainObject(layout)) {
      if (Array.isArray(layout.fields)) layout.fields = swapColumns(layout.fields);
      if (Array.isArray(layout.columns)) for (const column of layout.columns) if (Array.isArray(column?.sections)) for (const section of column.sections) if (Common.plainObject(section)) section.fields = swapColumns(section.fields);
      layout.unplaced = swap(layout.unplaced);
    }
    if (deleted) settings.deletedTaskColumns = deletedList.filter(item => item !== TaskLinks.#LEGACY_LINK);
    delete settings.portalUrlTemplate;
    for (const task of list) delete task.url;
    return true;
  }
}

if (typeof module !== 'undefined') module.exports = TaskLinks;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TaskLinks = TaskLinks;
})();
