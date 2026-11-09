'use strict';
// Group activities: named collections of related tasks with a color and a rich-text description.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class TaskGroups {
  static LIMIT = 200;
  static NAME_MAX = 80;
  static DESCRIPTION_MAX = 200000;
  static TASK_MAX = 10000;
  static PALETTE = ['#5aa9f6', '#b18cff', '#4fcf8f', '#ff9f5a', '#f0647a', '#3fd0c9', '#f2c94c', '#ff7ac6', '#7986cb', '#9ccc65'];
  static #key = name => name.trim().toLocaleLowerCase();
  static #validGroup(group) {
    return Common.plainObject(group) && typeof group.id === 'string' && group.id && group.id.length <= 200 &&
      typeof group.name === 'string' && group.name.trim() && group.name.length <= TaskGroups.NAME_MAX &&
      typeof group.color === 'string' && /^#[0-9a-f]{6}$/i.test(group.color) &&
      typeof group.description === 'string' && group.description.length <= TaskGroups.DESCRIPTION_MAX &&
      Array.isArray(group.taskIds) && group.taskIds.length <= TaskGroups.TASK_MAX && group.taskIds.every(id => typeof id === 'string' && id && id.length <= 200) && new Set(group.taskIds).size === group.taskIds.length;
  }
  static validateGroups(list) {
    Common.assert(Array.isArray(list) && list.length <= TaskGroups.LIMIT && list.every(group => TaskGroups.#validGroup(group)) && new Set(list.map(group => group.id)).size === list.length, "Invalid task groups.");
    Common.assert(new Set(list.map(group => TaskGroups.#key(group.name))).size === list.length, "Group names must be unique.");
    return list;
  }
  // Removes members that no longer exist; groups stay even when they become empty.
  static prune(data) {
    if (!Array.isArray(data?.groups)) return data;
    const ids = new Set(data.tasks.map(task => task.id));
    for (const group of data.groups) group.taskIds = [...new Set(group.taskIds)].filter(id => ids.has(id));
    return data;
  }
  static groupsOf = (groups, taskId) => (groups || []).filter(group => group.taskIds.includes(taskId));
  static uniqueName(name, groups, exceptId = '') {
    const base = String(name ?? '').trim().slice(0, TaskGroups.NAME_MAX).trim() || 'Group';
    const taken = new Set((groups || []).filter(group => group.id !== exceptId).map(group => TaskGroups.#key(group.name)));
    if (!taken.has(TaskGroups.#key(base))) return base;
    for (let counter = 2; ; counter++) {
      const suffix = ` (${counter})`, candidate = base.slice(0, TaskGroups.NAME_MAX - suffix.length).trimEnd() + suffix;
      if (!taken.has(TaskGroups.#key(candidate))) return candidate;
    }
  }
  static nameTaken = (name, groups, exceptId = '') => (groups || []).some(group => group.id !== exceptId && TaskGroups.#key(group.name) === TaskGroups.#key(name));
  static nextColor = groups => TaskGroups.PALETTE[(groups || []).length % TaskGroups.PALETTE.length];
  // Imported groups replace the ones with the same id; the others are added under a free name while there is room.
  static mergeGroups(current, incoming) {
    const result = structuredClone(current || []);
    for (const group of structuredClone(incoming || [])) {
      const index = result.findIndex(existing => existing.id === group.id);
      if (index >= 0) { result[index] = { ...group, name: TaskGroups.uniqueName(group.name, result, group.id) }; continue; }
      if (result.length >= TaskGroups.LIMIT) throw new Error("Too many groups: delete some before importing.");
      result.push({ ...group, name: TaskGroups.uniqueName(group.name, result) });
    }
    return result;
  }
}

if (typeof module !== 'undefined') module.exports = TaskGroups;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TaskGroups = TaskGroups;
})();
