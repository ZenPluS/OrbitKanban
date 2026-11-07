// Task list view: sorting and rendering.
import { Component } from '../core/Component.js';
import { ColumnLayout, ColumnSchema, TaskOrder } from '../shared.js';

export class TaskList extends Component {
  sortedRows(tasks) {
    const highlights = this.app.presenter.highlightsOf();
    const ranked = tasks.map(t => {
      const highlightRank = highlights.findIndex(h => h.id === t.highlightId);
      return { ...t,
        ...Object.fromEntries(ColumnSchema.fieldsOf(this.state.data.settings, 'tasks').map(field => [field.id, field.type === 'select' ? (t.customFields?.[field.id] ? ColumnSchema.choices(field).findIndex(option => option.id === t.customFields[field.id]) : '') : t.customFields?.[field.id] ?? ''])),
        urgencyRank: this.state.data.settings.urgencies.findIndex(s => s.id === t.urgencyId),
        statusRank: this.state.data.settings.statuses.findIndex(s => s.id === t.statusId),
        highlightRank: highlightRank < 0 ? '' : highlightRank
      };
    });
    const keys = { urgencyId: 'urgencyRank', statusId: 'statusRank', highlightId: 'highlightRank' };
    return TaskOrder.sortTasks(ranked, this.state.sort.map(s => ({ ...s, key: keys[s.key] || s.key })));
  }
  renderTasks() {
    const hidden = this.state.data.tasks.filter(t => t.hidden).length, highlights = this.app.presenter.highlightsOf(), columns = this.app.columns.shownColumns(), duplicateCount = this.app.taskFilter.duplicatesOf().tasks.size;
    const savedViews = this.state.data.settings.savedViews || [];
    if (this.state.activeSavedViewId && !savedViews.some(saved => saved.id === this.state.activeSavedViewId) && !this.app.savedViews.releaseViewIds().includes(this.state.activeSavedViewId)) this.state.activeSavedViewId = '';
    if (this.state.duplicatesOnly && !duplicateCount) this.state.duplicatesOnly = false;
    if (this.state.highlightFilter && !['__any', '__none'].includes(this.state.highlightFilter) && !highlights.some(h => h.id === this.state.highlightFilter)) this.state.highlightFilter = '';
    if (this.state.highlighter && this.state.highlighter !== 'erase' && !highlights.some(h => h.id === this.state.highlighter)) this.state.highlighter = '';
    if (this.state.highlighter === 'erase' && !highlights.length) this.state.highlighter = '';
    const sortable = [...columns.map(id => this.app.columns.columnDef(id).sort).filter(Boolean), ...(this.hasColumn('sequence') ? ['sequence'] : [])];
    this.state.sort = this.state.sort.filter(s => sortable.includes(s.key));
    if (!this.state.sort.length) this.state.sort = ColumnLayout.defaultSort(this.state.data.settings);
    const highlightOptions = [['', "All highlights"], ['__any', "Highlighted only"], ['__none', "Not highlighted"]].map(([value, label]) => `<option value="${value}" ${value === this.state.highlightFilter ? 'selected' : ''}>${this.esc(this.t(label))}</option>`).join('') +
      highlights.map(h => `<option value="${this.esc(h.id)}" ${h.id === this.state.highlightFilter ? 'selected' : ''}>● ${this.esc(h.name)}</option>`).join('');
    const savedViewOptions = `<option value="">${this.esc(this.t("Choose a view…"))}</option>` + (savedViews.length ? `<optgroup label="${this.esc(this.t("Saved views"))}">${savedViews.map(saved => `<option value="${this.esc(saved.id)}" ${saved.id === this.state.activeSavedViewId ? 'selected' : ''}>${this.esc(saved.name)}</option>`).join('')}</optgroup>` : '') + this.app.savedViews.releaseViewOptions();
    const headers = columns.map(id => {
      const def = this.app.columns.columnDef(id), label = this.esc(def.header || (def.field ? def.name : this.t(def.name))), current = def.sort && this.state.sort.find(s => s.key === def.sort);
      const title = def.header ? ` title="${this.esc(this.t(def.name))}"` : '';
      return `<th data-column="${id}"${title}><div class="column-heading">${def.sort ? this.ui`<button data-sort="${def.sort}" title="Click to sort; Shift+click for multi-column sorting">${label} <span>${current ? this.ico(current.direction === 'asc' ? 'arrow-up' : 'arrow-down') + (this.state.sort.length > 1 ? this.state.sort.indexOf(current) + 1 : '') : this.ico('sort')}</span></button>` : `<span>${label}</span>`}${this.app.columnFilterPanel.filterHeader(id, 'tasks')}</div></th>`;
    }).join('');
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('tasks'), "All tasks, one direction. Plan your work and focus on upcoming releases.",
      this.app.csvImport.csvButton('tasks') + this.app.excel.excelButton() + this.ui`<button class="button primary" id="new-task">${this.ico('plus')}New task</button>`) + this.app.columns.stats() +
      this.ui`<section class="panel"><div class="table-toolbar"><div class="search-wrap"><span>${this.ico('search')}</span><input id="search" aria-label="Search tasks" placeholder="Search code, description, incident…" value="${this.esc(this.state.search)}"></div><div class="filters"><select id="status-filter" aria-label="Filter status">${this.app.presenter.optionList(this.state.data.settings.statuses, this.state.statusFilter, "All statuses")}</select><select id="highlight-filter" aria-label="Filter by highlight">${highlightOptions}</select><label class="toggle-label"><input id="show-hidden" type="checkbox" ${this.state.showHidden ? 'checked' : ''}> Hidden <span class="tiny-count">${hidden}</span></label><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Show only tasks whose incident is also linked to other tasks, hidden ones included"><input id="duplicates-only" type="checkbox" ${this.state.duplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicates <span class="tiny-count">${duplicateCount}</span></label><div class="saved-view-tools"><select id="saved-view-select" aria-label="Load a saved view">${savedViewOptions}</select><button type="button" class="button subtle" id="saved-view-manage" aria-haspopup="dialog">Views</button></div><button class="button subtle" id="columns-button" aria-haspopup="dialog" title="Choose which columns to show and in what order">${this.ico('columns')}Columns</button><button class="button subtle" id="reset-sort" title="Reset to ascending release date">${this.ico('sort')}Release</button></div></div><div class="highlighter-bar"></div><div class="table-scroll"><table class="activity-table"><thead><tr><th class="select-col"><input type="checkbox" id="select-all" aria-label="Select all shown tasks" title="Select all shown tasks"></th>${headers}<th><span class="sr-only">Actions</span></th></tr></thead><tbody id="task-rows"></tbody></table></div><div class="table-footer"><span id="row-count"></span><span id="footer-hint">Shift + click a column for multi-column sorting</span><div class="bulk-bar" id="bulk-bar" role="toolbar" aria-label="Actions on the selected tasks" hidden><strong id="bulk-count"></strong><button type="button" class="button small primary" id="bulk-edit">${this.ico('edit')}Bulk edit…</button><button type="button" class="button small" id="bulk-excel">${this.ico('excel')}Export to Excel</button><button type="button" class="button small subtle" id="bulk-clear">Deselect</button></div></div></section><div class="hint"><span>${this.ico('sparkle')}</span> One archive, four perspectives. Issues, milestones and kanban update automatically.</div>`;
    this.app.rowMarks.drawHighlighter();
    this.app.taskRows.drawTaskRows();
    this.$('.table-scroll').insertAdjacentHTML('beforebegin', this.app.columnFilterPanel.columnFilterBar('tasks'));
    this.app.columnFilterPanel.wireColumnFilters('tasks');
    this.app.csvImport.wireCsvImport('tasks');
    this.$('#new-task').onclick = () => this.app.taskDialog.taskDialog();
    this.$('#search').oninput = event => { this.state.search = event.target.value; this.app.savedViews.clearActiveSavedView(); this.app.taskRows.drawTaskRows(); };
    this.$('#status-filter').onchange = event => { this.state.statusFilter = event.target.value; this.app.savedViews.clearActiveSavedView(); this.app.taskRows.drawTaskRows(); };
    this.$('#highlight-filter').onchange = event => { this.state.highlightFilter = event.target.value; this.app.savedViews.clearActiveSavedView(); this.app.taskRows.drawTaskRows(); };
    this.$('#show-hidden').onchange = event => { this.state.showHidden = event.target.checked; this.app.savedViews.clearActiveSavedView(); this.app.taskRows.drawTaskRows(); };
    this.$('#duplicates-only').onchange = event => { this.state.duplicatesOnly = event.target.checked; this.app.savedViews.clearActiveSavedView(); this.app.taskRows.drawTaskRows(); };
    this.$('#saved-view-select').onchange = this.app.notifier.action(async event => {
      const id = event.target.value;
      if (!id) return;
      if ((this.state.data.settings.savedViews || []).some(saved => saved.id === id) || !id.startsWith(this.app.savedViews.RELEASE_VIEW)) await this.app.savedViews.applySavedView(id);
      else this.app.savedViews.applyReleaseView(id);
    });
    this.$('#saved-view-manage').onclick = () => this.app.savedViews.openSavedViews();
    this.$('#columns-button').onclick = () => this.app.columnEditor.columnsDialog();
    this.$('#reset-sort').onclick = () => { this.state.sort = [{ key: 'releaseDate', direction: 'asc' }]; this.app.savedViews.clearActiveSavedView(); this.renderTasks(); };
    document.querySelectorAll('[data-sort]').forEach(button => button.onclick = event => {
      const key = button.dataset.sort, old = this.state.sort.find(s => s.key === key);
      const entry = { key, direction: old?.direction === 'asc' ? 'desc' : 'asc' };
      this.state.sort = event.shiftKey ? [...this.state.sort.filter(s => s.key !== key), entry] : [entry];
      this.app.savedViews.clearActiveSavedView();
      this.renderTasks();
    });
    // While a highlighter is active, a click anywhere on a row colors it instead of opening links or the task.
    this.$('#task-rows').addEventListener('click', event => {
      const row = this.state.highlighter && event.target.closest('tr[data-task-row]');
      if (!row || event.target.closest('.select-cell, [data-task-tags], [data-choice-picker]')) return;
      event.preventDefault();
      event.stopPropagation();
      this.app.rowMarks.paintRow(row);
    }, true);
    this.$('#task-rows').addEventListener('click', event => {
      const box = event.target.closest('input[data-select-task]');
      if (box) this.app.taskRows.selectTaskRows(box, event.shiftKey);
    });
    this.$('#select-all').onchange = event => {
      for (const box of document.querySelectorAll('#task-rows input[data-select-task]')) {
        if (event.target.checked) this.state.selectedTasks.add(box.dataset.selectTask); else this.state.selectedTasks.delete(box.dataset.selectTask);
      }
      this.state.selectionAnchor = '';
      this.app.taskRows.drawSelection();
    };
    this.$('#bulk-edit').onclick = () => this.app.bulkEdit.bulkDialog([...this.state.selectedTasks]);
    this.$('#bulk-excel').onclick = () => this.app.excel.excelDialog({ scope: 'selected' });
    this.$('#bulk-clear').onclick = () => this.app.taskRows.clearSelection();
    if (!this.hasColumn('status')) this.$('#status-filter').remove();
    if (!this.hasColumn('highlight')) this.$('#highlight-filter').remove();
    if (!this.hasColumn('releaseDate')) this.$('#reset-sort').remove();
    if (!this.hasColumn('incident') || !this.hasColumn('code') || !this.hasColumn('incident', 'issues') || !this.hasColumn('code', 'issues')) this.$('#duplicates-only').closest('label').hidden = true;
    const statCards = document.querySelectorAll('.stats > .stat');
    statCards[1].hidden = !this.hasColumn('releaseDate');
    statCards[2].hidden = !this.hasColumn('effort');
    statCards[3].hidden = !this.hasColumn('highlight') && !this.hasColumn('status');
  }
}
