// Task filtering by search, status, highlight and duplicated incidents.
import { Component } from '../core/Component.js';
import { IssueMatcher } from '../shared.js';

export class TaskFilter extends Component {
  #matchesHighlightFilter(task) {
    if (!this.state.highlightFilter) return true;
    if (this.state.highlightFilter === '__any') return Boolean(this.app.presenter.highlightOf(task));
    if (this.state.highlightFilter === '__none') return !this.app.presenter.highlightOf(task);
    return this.app.presenter.taskHighlights(task).some(highlight => highlight.id === this.state.highlightFilter);
  }
  duplicatesOf = () => {
    const duplicates = IssueMatcher.findDuplicates(this.state.data.tasks, this.state.data.issues);
    if (!this.hasColumn('incident')) duplicates.tasks.clear();
    return duplicates;
  };
  recordLabel = (record, kind = 'tasks') => this.hasColumn('code', kind) && record.code || (kind === 'tasks' && this.hasColumn('description') && this.app.richText.plain(record.description)) || `${this.t(kind === 'tasks' ? "Task" : "Issue")} ${record.id.slice(0, 8)}`;
  #taskLabel = task => `${this.hasColumn('sequence') ? '#' + task.sequence + ' ' : ''}${this.recordLabel(task)}${task.hidden ? ` (${this.t("hidden")})` : ''}`;
  // One line per duplicated incident, naming the other tasks or associations that share it.
  taskDuplicateLines(taskId, groups) {
    return groups.map(group => this.app.transfer.fillText("{0} is also linked to: {1}", group.incident, group.taskIds.filter(id => id !== taskId).map(id => this.#taskLabel(this.state.data.tasks.find(task => task.id === id))).join(', ')));
  }
  issueDuplicateLine(issueId, group, issues = this.state.data.issues) {
    const others = group.issueIds.filter(id => id !== issueId).map(id => issues.find(issue => issue.id === id)).map(issue => issue.problem.trim() ? `${issue.code} · ${issue.problem}` : issue.code);
    return this.app.transfer.fillText("{0} also appears in: {1}", group.incident, others.join(', '));
  }
  filteredTasks(duplicates = this.duplicatesOf(), issues = this.state.search || Object.keys(this.state.columnFilters.tasks).length ? IssueMatcher.indexIssues(this.state.data.issues) : this.state.data.issues) {
    const needle = this.state.search.toLowerCase();
    return this.state.data.tasks.filter(t => (this.state.duplicatesOnly ? duplicates.tasks.has(t.id) : this.state.showHidden || !t.hidden) && (!this.state.statusFilter || t.statusId === this.state.statusFilter) && this.#matchesHighlightFilter(t) && this.app.columnFilterPanel.passesColumnFilters(t, 'tasks', issues) && (
      !this.state.search || this.app.cells.searchableValues(t, 'tasks', issues).some(value => value.toLocaleLowerCase().includes(needle))
    ));
  }
  // Tasks a saved view would show, without touching the filters of the task list; boards keep hidden tasks unless asked otherwise.
  tasksOfView(saved, includeHidden = true) {
    const keys = ['search', 'statusFilter', 'highlightFilter', 'showHidden', 'duplicatesOnly'], previous = Object.fromEntries(keys.map(key => [key, this.state[key]])), previousColumns = this.state.columnFilters.tasks;
    Object.assign(this.state, {
      search: saved.search || '', statusFilter: this.state.data.settings.statuses.some(item => item.id === saved.statusFilter) ? saved.statusFilter : '',
      highlightFilter: ['__any', '__none'].includes(saved.highlightFilter) || this.app.presenter.highlightsOf().some(item => item.id === saved.highlightFilter) ? saved.highlightFilter : '',
      showHidden: includeHidden || Boolean(saved.showHidden), duplicatesOnly: Boolean(saved.duplicatesOnly)
    });
    this.state.columnFilters.tasks = Object.fromEntries(Object.entries(saved.columnFilters || {}).filter(([id]) => this.app.columns.columnDef(id, 'tasks')));
    try { return this.filteredTasks(); } finally { Object.assign(this.state, previous); this.state.columnFilters.tasks = previousColumns; }
  }
}
