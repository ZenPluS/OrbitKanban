'use strict';
// Matches tasks with their incidents and problems and finds duplicated incidents.
(() => {
const ColumnMerger = typeof module !== 'undefined' ? require('../columns/ColumnMerger') : globalThis.OrbitKanban.Columns.ColumnMerger;

class IssueMatcher {
  static #referenceKey = value => String(value ?? '').trim().toUpperCase();
  static indexIssues(issues) {
    const index = new Map();
    for (const issue of issues) {
      const code = issue.code.trim().toUpperCase();
      if (!code) continue;
      if (!index.has(code)) index.set(code, { incidents: new Set(), problems: new Set() });
      const links = index.get(code), incident = issue.incident.trim(), problem = issue.problem.trim();
      if (incident) links.incidents.add(incident);
      if (problem) links.problems.add(problem);
    }
    return index;
  }
  static matchIssues(task, issues) {
    const code = task.code.trim().toUpperCase();
    if (!code) return { incidents: [], problems: [] };
    // Batch callers build the index once; return fresh arrays just like the single-task path.
    if (issues instanceof Map) {
      const links = issues.get(code);
      return { incidents: [...(links?.incidents || [])], problems: [...(links?.problems || [])] };
    }
    const matches = issues.filter(x => x.code.trim().toUpperCase() === code);
    return {
      incidents: [...new Set(matches.map(x => x.incident.trim()).filter(Boolean))],
      problems: [...new Set(matches.map(x => x.problem.trim()).filter(Boolean))]
    };
  }
  // The incident is the duplicate key: it is compared like portal codes, ignoring case and surrounding spaces.
  // An incident is duplicated in the issue list when it appears in more than one association, and among tasks
  // when, through its associations, it resolves to more than one task. Associations without incident are never duplicates.
  static findDuplicates(tasks, issues) {
    const tasksByCode = new Map(), groups = new Map();
    for (const task of tasks) {
      const code = IssueMatcher.#referenceKey(task.code);
      if (!code) continue;
      if (!tasksByCode.has(code)) tasksByCode.set(code, []);
      tasksByCode.get(code).push(task.id);
    }
    for (const issue of issues) {
      const key = IssueMatcher.#referenceKey(issue.incident);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { key, incident: issue.incident.trim(), issueIds: [], codes: [], taskIds: [] });
      const group = groups.get(key), code = IssueMatcher.#referenceKey(issue.code);
      group.issueIds.push(issue.id);
      if (!group.codes.includes(code)) {
        group.codes.push(code);
        group.taskIds.push(...(tasksByCode.get(code) || []));
      }
    }
    const result = { groups: [], issues: new Map(), tasks: new Map(), identical: [] };
    for (const group of groups.values()) {
      if (group.issueIds.length < 2 && group.taskIds.length < 2) continue;
      result.groups.push(group);
      if (group.issueIds.length > 1) for (const issueId of group.issueIds) result.issues.set(issueId, group);
      if (group.taskIds.length > 1) for (const taskId of group.taskIds) result.tasks.set(taskId, [...(result.tasks.get(taskId) || []), group]);
    }
    // Associations repeating code, incident and problem of an earlier one add nothing: the first of each set is kept.
    const seen = new Set();
    for (const issue of issues) {
      if (!IssueMatcher.#referenceKey(issue.incident)) continue;
      const triple = [...[issue.code, issue.incident, issue.problem].map(IssueMatcher.#referenceKey), ColumnMerger.valuesKey(issue.customFields)].join('\u0000');
      if (seen.has(triple)) result.identical.push(issue.id); else seen.add(triple);
    }
    return result;
  }
}

if (typeof module !== 'undefined') module.exports = IssueMatcher;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).IssueMatcher = IssueMatcher;
})();
