// Task table rows, duplicates and row selection.
import { Component } from '../core/Component.js';
import { IssueMatcher, TaskLinks, TaskOrder } from '../shared.js';

export class TaskRows extends Component {
  #taskCell(column, task, status, urgency, links, duplicateGroups = []) {
    const none = '<span class="muted">—</span>';
    switch (column) {
      case 'sequence': return `<td class="sequence">${task.sequence}</td>`;
      case 'code': return `<td><button class="code-link" data-edit-task="${task.id}">${this.esc(task.code)}</button>${this.app.presenter.portalAnchor(TaskLinks.platformUrl(task, this.state.data.settings), task.code)}</td>`;
      case 'description': { const text = this.app.richText.plain(task.description); return `<td class="description-col"><button class="description-cell" data-edit-task="${task.id}" title="${this.esc(text)}"${text ? '' : ` aria-label="${this.esc(this.t("Edit task"))}"`}>${this.esc(text)}</button></td>`; }
      case 'urgency': return `<td>${this.app.presenter.pill(urgency.name, urgency.color)}</td>`;
      case 'status': return `<td>${this.app.presenter.pill(status.name, status.color, 'status-pill')}</td>`;
      case 'highlight': { const mark = this.app.presenter.highlightOf(task); return `<td>${mark ? this.app.presenter.pill(mark.name, mark.color, 'mark-pill') : none}</td>`; }
      case 'tags': return `<td class="tags-cell"><button type="button" class="task-tags-button" data-task-tags="${this.esc(task.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${this.esc(this.t("Edit tags"))}" title="${this.esc(this.t("Edit tags"))}">${this.app.presenter.tagsOf(task).length ? this.app.presenter.tagChips(task) : `<span class="muted">+ ${this.esc(this.t('Tags'))}</span>`}${this.ico('chevron-down')}</button></td>`;
      case 'effort': return `<td class="effort-cell">${this.app.presenter.effort(task.effortHours)}</td>`;
      case 'incident': {
        const groups = new Map(duplicateGroups.map(group => [group.key, group]));
        return `<td class="references">${links.incidents.map(incident => {
          const group = groups.get(incident.trim().toUpperCase());
          return group ? `<button type="button" class="dup-ref" data-dup-incident="${this.esc(group.incident)}" title="${this.esc(this.app.taskFilter.taskDuplicateLines(task.id, [group])[0] + '\n' + this.t("Click to see only the tasks involved."))}">${this.ico('copy')}${this.esc(incident)}</button>` : this.esc(incident);
        }).join('<br>') || none}</td>`;
      }
      case 'problem': return `<td class="references">${links.problems.map(this.esc).join('<br>') || none}</td>`;
      case 'releaseDate': return `<td><span class="date-pill" style="--date:${task.releaseDate ? TaskOrder.dateColor(task.releaseDate) : '#929bb2'}">${this.ico('calendar')}${this.app.presenter.formatDate(task.releaseDate)}</span></td>`;
      case 'notes': { const text = this.app.richText.plain(task.notes); return `<td class="notes-col"><button class="description-cell notes-cell" data-edit-task="${task.id}" title="${this.esc(text || this.t("Add notes"))}"${text ? '' : ` aria-label="${this.esc(this.t("Add notes"))}"`}>${this.esc(text)}</button></td>`; }
      default: return this.app.columns.columnDef(column)?.field ? this.app.cells.customCell(task, this.app.columns.columnDef(column).field) : '<td></td>';
    }
  }
  drawTaskRows() {
    const duplicates = this.app.taskFilter.duplicatesOf(), issues = IssueMatcher.indexIssues(this.state.data.issues), tasks = this.app.taskList.sortedRows(this.app.taskFilter.filteredTasks(duplicates, issues)), columns = this.app.columns.shownColumns();
    this.$('#task-rows').innerHTML = tasks.map(task => {
      const status = this.statusOf(task), urgency = this.urgencyOf(task);
      const links = this.matchIssues(task, issues), mark = this.app.presenter.highlightOf(task), duplicateGroups = duplicates.tasks.get(task.id) || [];
      const classes = [status.highlight ? 'highlighted' : '', mark ? 'marked' : '', task.hidden ? 'hidden-row' : '', duplicateGroups.length ? 'duplicate-row' : '', this.state.selectedTasks.has(task.id) ? 'selected' : ''].filter(Boolean).join(' ');
      const markLabel = mark ? this.app.transfer.fillText("Highlight: {0}", mark.name) : this.t("Highlight row");
      const duplicateLabel = duplicateGroups.length ? [this.t("Possible duplicate"), ...this.app.taskFilter.taskDuplicateLines(task.id, duplicateGroups)].join('\n') : '';
      const duplicateFlag = duplicateGroups.length ? `<button type="button" class="icon-button dup-flag" data-dup-incident="${this.esc(duplicateGroups[0].incident)}" title="${this.esc(duplicateLabel + '\n' + this.t("Click to see only the tasks involved."))}" aria-label="${this.esc(duplicateLabel.replaceAll('\n', '. '))}">${this.ico('copy')}</button>` : '';
      const selectLabel = this.app.transfer.fillText("Select {0}", this.app.taskFilter.recordLabel(task));
      return `<tr data-task-row="${this.esc(task.id)}" title="${this.esc(this.t("Double-click the row to edit."))}" class="${classes}" style="--row-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><td class="select-cell"><label class="select-hit" title="${this.esc(selectLabel + '\n' + this.t("Shift + click to select a range."))}"><input type="checkbox" data-select-task="${this.esc(task.id)}" ${this.state.selectedTasks.has(task.id) ? 'checked' : ''} aria-label="${this.esc(selectLabel)}"></label></td>${columns.map(column => this.#taskCell(column, task, status, urgency, links, duplicateGroups)).join('')}<td class="row-actions">${duplicateFlag}<button type="button" class="icon-button mark-button ${mark ? 'is-marked' : ''}" data-mark-task="${this.esc(task.id)}" title="${this.esc(markLabel)}" aria-label="${this.esc(markLabel)}" aria-haspopup="menu" aria-expanded="false"><i class="mark-dot"></i></button><button class="icon-button" data-toggle-task="${task.id}" title="${this.esc(this.t(task.hidden ? "Show task" : "Hide task"))}">${this.ico(task.hidden ? 'eye' : 'eye-off')}</button><button class="icon-button" data-edit-task="${task.id}" title="${this.esc(this.t("Edit task"))}">${this.ico('more')}</button></td></tr>`;
    }).join('') || `<tr><td colspan="${columns.length + 2}" class="empty">${this.esc(this.t("No tasks found. Create a new task or change the filters."))}</td></tr>`;
    if (this.hasColumn('sequence')) document.querySelectorAll('#task-rows .select-cell').forEach((cell, index) => cell.insertAdjacentHTML('afterbegin', this.app.sortable.dragHandle(this.app.taskFilter.recordLabel(tasks[index]))));
    if (this.hasColumn('sequence')) this.app.sortable.sortable(this.$('#task-rows'), 'tr[data-task-row]', async (from, to) => {
      try {
        await this.app.history.commit(next => TaskOrder.reorderTaskSequences(next.tasks, tasks.map(task => task.id), from, to));
        this.state.sort = [{ key: 'sequence', direction: 'asc' }];
        this.app.savedViews.clearActiveSavedView();
        this.app.notifier.notify("Order saved. Sequence updated.");
      } finally { this.app.shell.rerenderPreservingView(); }
      document.querySelector(`[data-task-row="${CSS.escape(tasks[from].id)}"] [data-drag-handle]`)?.focus({ preventScroll: true });
    }, true);
    this.$('#row-count').textContent = this.ui`${tasks.length} tasks shown · ${this.state.data.tasks.length} total`;
    this.drawSelection();
    document.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => {
      this.app.taskDialog.taskDialog(this.state.data.tasks.find(t => t.id === b.dataset.editTask));
    });
    document.querySelectorAll('[data-task-tags]').forEach(button => button.onclick = () => this.app.tagMenu.openTagMenu(button));
    this.app.cells.wireChoicePickers();
    document.querySelectorAll('[data-toggle-task]').forEach(b => b.onclick = this.app.notifier.action(async () => {
      const id = b.dataset.toggleTask, hidden = !this.state.data.tasks.find(t => t.id === id).hidden;
      await this.app.history.commit(next => { const task = next.tasks.find(t => t.id === id); if (task) task.hidden = hidden; }); this.app.shell.rerenderPreservingView();
    }));
    document.querySelectorAll('[data-mark-task]').forEach(b => b.onclick = () => this.app.rowMarks.openMarkMenu(b));
    if (!this.hasColumn('highlight')) document.querySelectorAll('[data-mark-task]').forEach(button => button.remove());
    document.querySelectorAll('#task-rows [data-dup-incident]').forEach(b => b.onclick = () => this.#showTaskDuplicates(b.dataset.dupIncident));
  }
  // Lists every task sharing the incident, hidden ones included, so duplicates can be compared side by side.
  #showTaskDuplicates(incident) {
    this.state.search = incident;
    this.state.duplicatesOnly = true;
    this.app.taskList.renderTasks();
    this.app.notifier.notify(this.app.transfer.fillText("Tasks sharing incident {0}.", incident));
  }
  // Selection for bulk edit and export. Shift+click extends from the last ticked row over the rows as currently shown.
  selectTaskRows(box, extend) {
    const boxes = [...document.querySelectorAll('#task-rows input[data-select-task]')];
    const from = boxes.findIndex(input => input.dataset.selectTask === this.state.selectionAnchor), to = boxes.indexOf(box);
    const range = extend && from >= 0 && to >= 0 ? boxes.slice(Math.min(from, to), Math.max(from, to) + 1) : [box];
    for (const input of range) {
      if (box.checked) this.state.selectedTasks.add(input.dataset.selectTask); else this.state.selectedTasks.delete(input.dataset.selectTask);
    }
    this.state.selectionAnchor = box.dataset.selectTask;
    this.drawSelection();
  }
  clearSelection() {
    this.state.selectedTasks.clear();
    this.state.selectionAnchor = '';
    this.drawSelection();
  }
  drawSelection() {
    for (const id of this.state.selectedTasks) if (!this.state.data.tasks.some(task => task.id === id)) this.state.selectedTasks.delete(id);
    const boxes = [...document.querySelectorAll('#task-rows input[data-select-task]')], all = this.$('#select-all');
    if (!all) return;
    let shown = 0;
    for (const box of boxes) {
      const selected = this.state.selectedTasks.has(box.dataset.selectTask);
      box.checked = selected;
      box.closest('tr').classList.toggle('selected', selected);
      if (selected) shown++;
    }
    all.disabled = !boxes.length;
    all.checked = boxes.length > 0 && shown === boxes.length;
    all.indeterminate = shown > 0 && shown < boxes.length;
    const count = this.state.selectedTasks.size, outside = count - shown;
    this.$('.table-footer').classList.toggle('has-selection', count > 0);
    this.$('#bulk-bar').hidden = !count;
    this.$('#footer-hint').hidden = count > 0;
    this.$('#bulk-count').textContent = count ? this.app.transfer.fillText("{0} selected", count) + (outside ? ` · ${this.app.transfer.fillText("{0} not visible with the current filters", outside)}` : '') : '';
  }
}
