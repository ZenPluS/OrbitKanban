// Group activities page: cards with the description, progress and tasks of every group.
import { Component } from '../core/Component.js';
import { TaskOrder } from '../shared.js';

export class GroupsPage extends Component {
  query = '';
  #tasksOf = group => {
    const byId = new Map(this.state.data.tasks.map(task => [task.id, task]));
    return this.app.taskList.sortedRows(group.taskIds.map(id => byId.get(id)).filter(Boolean));
  };
  #matches(group, words) {
    if (!words.length) return true;
    const text = [group.name, this.app.richText.plain(group.description), ...this.#tasksOf(group).flatMap(task => [this.app.taskFilter.recordLabel(task), this.app.richText.plain(task.description)])].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  }
  #progress(tasks) {
    if (!this.hasColumn('status') || !tasks.length) return '';
    const counts = [...this.state.data.settings.statuses, this.unassignedOption()].map(status => ({ status, count: tasks.filter(task => this.statusOf(task).id === status.id).length })).filter(entry => entry.count);
    const label = counts.map(({ status, count }) => `${status.name}: ${count}`).join(', ');
    return `<div class="group-progress" role="img" aria-label="${this.esc(label)}" title="${this.esc(label)}">${counts.map(({ status, count }) => `<span style="--segment:${this.esc(status.color)};flex-grow:${count}"></span>`).join('')}</div><div class="group-legend">${counts.map(({ status, count }) => `<span class="group-legend-item">${this.app.presenter.pill(status.name, status.color)}<b>${count}</b></span>`).join('')}</div>`;
  }
  #facts(tasks) {
    const facts = [this.plural(tasks.length, 'tasks')];
    if (this.hasColumn('effort') && tasks.length) facts.push(this.app.presenter.effort(tasks.reduce((sum, task) => sum + task.effortHours, 0)));
    const dates = this.hasColumn('releaseDate') ? tasks.map(task => task.releaseDate).filter(Boolean).sort() : [];
    if (dates.length) facts.push(dates[0] === dates[dates.length - 1] ? this.app.presenter.formatDate(dates[0]) : `${this.app.presenter.formatDate(dates[0])} – ${this.app.presenter.formatDate(dates[dates.length - 1])}`);
    return facts.join(' · ');
  }
  #taskRow(task) {
    const status = this.statusOf(task), label = this.app.taskFilter.recordLabel(task), description = this.hasColumn('description') ? this.app.richText.plain(task.description) : '';
    const date = this.hasColumn('releaseDate') && task.releaseDate ? `<span class="group-task-date" style="color:${TaskOrder.dateColor(task.releaseDate)}">${this.esc(this.app.presenter.formatDate(task.releaseDate))}</span>` : '';
    const hidden = task.hidden ? `<span class="group-task-hidden" title="${this.esc(this.t("Hidden from the task list"))}">${this.ico('eye-off')}<span class="sr-only">${this.esc(this.t("Hidden"))}</span></span>` : '';
    return `<li class="group-task ${task.hidden ? 'is-hidden' : ''}"><button type="button" class="code-link" data-group-task="${this.esc(task.id)}" title="${this.esc(this.t("Edit task"))}">${this.esc(label)}</button><span class="group-task-desc" title="${this.esc(description)}">${hidden}${this.esc(description)}</span>${date}${this.hasColumn('status') ? this.app.presenter.pill(status.name, status.color) : ''}</li>`;
  }
  #card(group) {
    const tasks = this.#tasksOf(group), id = this.esc(group.id), description = this.app.richText.sanitize(group.description);
    const action = (attribute, icon, label, extra = '') => `<button type="button" class="icon-button ${extra}" ${attribute}="${id}" title="${this.esc(label)}" aria-label="${this.esc(`${label}: ${group.name}`)}">${this.ico(icon)}</button>`;
    return `<article class="group-card" data-group="${id}" style="--group:${this.esc(group.color)}" tabindex="-1"><header class="group-card-head"><span class="group-swatch" aria-hidden="true">${this.ico('groups')}</span><div class="group-title"><h2>${this.esc(group.name)}</h2><small>${this.esc(this.#facts(tasks))}</small></div><div class="group-actions">` +
      (tasks.length ? action('data-group-bulk', 'columns', this.t("Bulk edit the tasks of this group")) : '') + action('data-group-edit', 'edit', this.t("Edit group")) + action('data-group-delete', 'close', this.t("Delete group"), 'delete-option') +
      `</div></header>${this.app.richText.plain(description) ? `<div class="group-description">${description}</div>` : ''}${this.#progress(tasks)}` +
      (tasks.length ? `<ul class="group-tasks">${tasks.map(task => this.#taskRow(task)).join('')}</ul>` : `<p class="muted group-empty">${this.esc(this.t("No tasks in this group yet. Edit the group to add them."))}</p>`) + '</article>';
  }
  renderGroups() {
    const groups = this.state.data.groups || [], words = this.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean), visible = groups.filter(group => this.#matches(group, words));
    const buttons = `<span class="view-label">${this.esc(this.plural(groups.length, 'group'))}</span><button type="button" class="button primary" id="new-group">${this.ico('plus')}${this.esc(this.t("New group"))}</button>`;
    const empty = groups.length ? this.t("No groups match the search.") : this.t("No groups yet. Create one to collect related tasks under a name and a description.");
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('groups'), "Collect related tasks under a name and a description, and follow their progress together.", buttons) +
      `<div id="groups-page"><label class="group-search"><span aria-hidden="true">${this.ico('search')}</span><input id="group-search" type="search" autocomplete="off" value="${this.esc(this.query)}" placeholder="${this.esc(this.t("Search groups and their tasks…"))}" aria-label="${this.esc(this.t("Search groups and their tasks…"))}"></label>` +
      (visible.length ? `<div class="group-grid">${visible.map(group => this.#card(group)).join('')}</div>` : `<section class="panel empty"><p>${this.esc(empty)}</p></section>`) + '</div>';
    const search = this.$('#group-search');
    search.oninput = () => {
      this.query = search.value;
      const position = search.selectionStart;
      this.renderGroups();
      const next = this.$('#group-search');
      next.focus();
      next.setSelectionRange(position, position);
    };
    this.$('#new-group').onclick = () => this.app.groupEditor.groupDialog();
    this.$('#groups-page').onclick = event => {
      const find = attribute => { const button = event.target.closest(`[${attribute}]`); return button && (this.state.data.groups || []).find(group => group.id === button.getAttribute(attribute)); };
      const taskButton = event.target.closest('[data-group-task]');
      if (taskButton) {
        const task = this.state.data.tasks.find(task => task.id === taskButton.dataset.groupTask);
        if (task) this.app.taskDialog.taskDialog(task); else this.app.notifier.notify("This item no longer exists.", true);
        return;
      }
      const edit = find('data-group-edit'), remove = find('data-group-delete'), bulk = find('data-group-bulk');
      if (edit) this.app.groupEditor.groupDialog(edit);
      if (remove) this.app.groupEditor.deleteGroup(remove);
      if (bulk) this.app.bulkEdit.bulkDialog(bulk.taskIds.filter(id => this.state.data.tasks.some(task => task.id === id)), this.app.transfer.fillText("Tasks of the group {0}, hidden ones included.", bulk.name));
    };
  }
  // Brings a group into view, for example after choosing it in the global search.
  focusGroup(id) {
    if (!(this.state.data.groups || []).some(group => group.id === id)) return;
    if (!this.$(`[data-group="${CSS.escape(id)}"]`)) { this.query = ''; this.renderGroups(); }
    const card = this.$(`[data-group="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('is-focused');
    card.focus({ preventScroll: true });
    setTimeout(() => card.classList.remove('is-focused'), 1600);
  }
}
