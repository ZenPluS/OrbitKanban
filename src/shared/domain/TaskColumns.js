'use strict';
// Order and default visibility of the task list columns.
(() => {
const ColumnLayout = typeof module !== 'undefined' ? require('../columns/ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;

class TaskColumns {
  // Order and default visibility of the task list columns: hidden ones can be enabled from the column chooser.
  static #TASK_COLUMNS = ColumnLayout.defaultColumns('tasks').map(column => [column.id, column.visible]);
  static TASK_COLUMN_IDS = TaskColumns.#TASK_COLUMNS.map(([columnId]) => columnId);
  static defaultTaskColumns = (fields = []) => [...TaskColumns.#TASK_COLUMNS.map(([columnId, visible]) => ({ id: columnId, visible })), ...fields.map(field => ({ id: field.id, visible: true }))];
  // Unknown or repeated columns are dropped and missing ones come back in their default place, so files from other versions stay usable.
  static normalizeTaskColumns(input, fields = [], deleted = []) {
    return ColumnLayout.normalizeColumns(input, TaskColumns.defaultTaskColumns(), fields, deleted);
  }
}

if (typeof module !== 'undefined') module.exports = TaskColumns;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TaskColumns = TaskColumns;
})();
