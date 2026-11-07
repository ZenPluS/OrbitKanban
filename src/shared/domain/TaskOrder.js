'use strict';
// Task sorting, release date colors and sequence numbering.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class TaskOrder {
  static sortTasks(tasks, sort = [{ key: 'releaseDate', direction: 'asc' }]) {
    return [...tasks].sort((a, b) => {
      for (const { key, direction } of sort) {
        const av = a[key], bv = b[key];
        if (av === bv) continue;
        if (av === '') return 1;
        if (bv === '') return -1;
        const result = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'it', { numeric: true });
        if (result) return direction === 'desc' ? -result : result;
      }
      return a.sequence - b.sequence;
    });
  }
  static dateColor(date) {
    let hash = 0;
    for (const c of date) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 65% 68%)`;
  }
  static reorderTaskSequences(tasks, visibleIds, from, to) {
    const byId = new Map(tasks.map(task => [task.id, task]));
    Common.assert(new Set(visibleIds).size === visibleIds.length && visibleIds.every(id => byId.has(id))
      && Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= 0 && from < visibleIds.length && to < visibleIds.length,
    "The list has changed. Try reordering again.");
    if (from === to) return;
    const ids = [...visibleIds], visible = new Set(ids);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    let index = 0;
    // Filtered-out tasks keep their slots; visible tasks take those slots in the requested order.
    TaskOrder.sortTasks(tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => visible.has(task.id) ? byId.get(ids[index++]) : task)
      .forEach((task, position) => { task.sequence = position + 1; });
  }
  static nextReleaseDate(tasks, referenceDate = Common.today()) {
    return tasks.reduce((next, task) => {
      const date = task.releaseDate;
      return date && date >= referenceDate && (!next || date < next) ? date : next;
    }, '');
  }
}

if (typeof module !== 'undefined') module.exports = TaskOrder;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TaskOrder = TaskOrder;
})();
