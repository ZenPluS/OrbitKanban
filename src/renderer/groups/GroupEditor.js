// Editor of the group activities: name, color, description and member tasks, plus the group picker of the task editor.
import { Component } from '../core/Component.js';
import { TaskGroups } from '../shared.js';

export class GroupEditor extends Component {
  #taskOption(task, checked) {
    const label = this.app.taskFilter.recordLabel(task), description = this.hasColumn('description') ? this.app.richText.plain(task.description) : '', status = this.statusOf(task);
    const search = [label, task.code, description, this.hasColumn('releaseDate') && task.releaseDate ? `${task.releaseDate} ${this.app.presenter.formatDate(task.releaseDate)}` : '', this.hasColumn('status') ? status.name : ''].join(' ').toLocaleLowerCase();
    return `<label class="group-task-option ${task.hidden ? 'is-hidden' : ''}" data-search="${this.esc(search)}"><input type="checkbox" name="taskIds" value="${this.esc(task.id)}" ${checked ? 'checked' : ''}><strong>${this.esc(label)}</strong><span class="group-task-desc">${this.esc(description)}</span>${this.hasColumn('status') ? this.app.presenter.pill(status.name, status.color) : ''}</label>`;
  }
  groupDialog(existing) {
    const groups = this.state.data.groups || [];
    if (!existing && groups.length >= TaskGroups.LIMIT) { this.app.notifier.notify(this.app.transfer.fillText("You can have up to {0} groups.", TaskGroups.LIMIT), true); return; }
    const group = existing ? structuredClone(existing) : { id: this.uid(), name: '', color: TaskGroups.nextColor(groups), description: '', taskIds: [] };
    const members = new Set(group.taskIds), tasks = this.app.taskList.sortedRows(this.state.data.tasks);
    this.app.modal.openModal(this.ui`<form id="group-form" class="group-form"><div class="modal-heading"><div><div class="eyebrow">GROUP</div><h2>${this.esc(this.t(existing ? "Edit group" : "New group"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>
    <div class="form-grid group-form-grid"><label class="field">Group name<input name="name" maxlength="${TaskGroups.NAME_MAX}" required autocomplete="off" value="${this.esc(group.name)}"></label><div class="field"><span class="field-label">Color</span>${this.app.colorPicker.colorControl(group.color, this.t("Group"), 'id="group-color"', true)}</div>
    ${this.app.fieldEditors.editor('group-description-editor', "Description", group.description)}
    <fieldset class="field full group-task-picker"><legend>Tasks of the group</legend><div class="group-task-tools"><label class="group-search"><span aria-hidden="true">${this.ico('search')}</span><input type="search" id="group-task-search" autocomplete="off" placeholder="Search tasks…" aria-label="Search tasks…"></label><label class="group-selected-only"><input type="checkbox" id="group-selected-only"> Selected only</label><output id="group-task-count" aria-live="polite"></output></div>
    <div class="group-task-options" id="group-task-options">${tasks.map(task => this.#taskOption(task, members.has(task.id))).join('') || `<p class="muted">${this.esc(this.t("No tasks available."))}</p>`}</div></fieldset></div>
    <div class="modal-actions">${existing ? this.ui`<button type="button" class="button danger" id="delete-group">Delete</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary">Save group</button></div></form>`);
    const form = this.$('#group-form'), search = this.$('#group-task-search'), selectedOnly = this.$('#group-selected-only');
    this.app.fieldEditors.wireEditors();
    const color = this.$('#group-color');
    color.onclick = () => this.app.colorPicker.openColorPicker(color);
    const filter = () => {
      const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      form.querySelectorAll('.group-task-option').forEach(option => { option.hidden = !words.every(word => option.dataset.search.includes(word)) || selectedOnly.checked && !option.querySelector('input').checked; });
      this.$('#group-task-count').textContent = this.app.transfer.fillText("{0} selected", form.querySelectorAll('[name="taskIds"]:checked').length);
    };
    search.oninput = filter;
    search.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    selectedOnly.onchange = filter;
    this.$('#group-task-options').onchange = filter;
    filter();
    if (existing) this.$('#delete-group').onclick = () => this.deleteGroup(existing);
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) throw new Error(this.t("Enter a group name."));
      const item = { id: group.id, name, color: color.value, description: this.app.richText.sanitize(this.$('#group-description-editor').innerHTML), taskIds: new FormData(form).getAll('taskIds') };
      if (!this.app.richText.plain(item.description)) item.description = '';
      await this.app.history.commit(next => {
        next.groups ??= [];
        if (TaskGroups.nameTaken(item.name, next.groups, item.id)) throw new Error(this.t("Group names must be unique."));
        const index = next.groups.findIndex(entry => entry.id === item.id);
        if (index >= 0) next.groups[index] = item;
        else if (next.groups.length >= TaskGroups.LIMIT) throw new Error(this.app.transfer.fillText("You can have up to {0} groups.", TaskGroups.LIMIT));
        else next.groups.push(item);
      });
      this.$('#modal').close(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Group saved.");
    });
    form.elements.name.focus();
  }
  deleteGroup(group) {
    this.app.modal.confirmDialog("Delete this group?", this.app.transfer.fillText("The group {0} will be deleted. Its tasks stay unchanged.", group.name), async () => {
      await this.app.history.commit(next => { next.groups = (next.groups || []).filter(entry => entry.id !== group.id); });
      this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Group deleted.");
    });
  }
  // The task editor lists the groups of the task in its heading, outside the configurable layout.
  #pickerButton(groupIds) {
    const chips = (this.state.data.groups || []).filter(group => groupIds.includes(group.id)).map(group => this.app.presenter.pill(group.name, group.color, 'tag-pill')).join('');
    return `<button type="button" class="task-tags-button" data-choice-picker="task-groups" data-own-picker aria-haspopup="dialog" aria-expanded="false" aria-label="${this.esc(this.t("Groups"))}"><span class="tag-chips">${chips || `<span class="muted">+ ${this.esc(this.t("Add to a group"))}</span>`}</span>${this.ico('chevron-down')}</button>` + groupIds.map(id => `<input type="hidden" name="groupIds" value="${this.esc(id)}">`).join('');
  }
  taskGroupsPicker(taskId) {
    const groups = this.state.data.groups || [];
    if (!groups.length) return '';
    return `<div class="task-groups-picker" data-task-groups-picker><span class="field-label">${this.ico('groups')}${this.esc(this.t("Groups"))}</span><div class="task-groups-control">${this.#pickerButton(TaskGroups.groupsOf(groups, taskId).map(group => group.id))}</div></div>`;
  }
  wireTaskGroupsPicker(form) {
    const container = form.querySelector('.task-groups-control');
    if (!container) return;
    const button = container.querySelector('[data-choice-picker]');
    button.onclick = () => this.app.tagMenu.openTagMenu(button, {
      field: { name: this.t("Groups") }, values: new FormData(form).getAll('groupIds'), form, searchLabel: this.t("Search groups…"), emptyLabel: this.t("No groups available."),
      options: (this.state.data.groups || []).map(group => ({ id: group.id, html: this.app.presenter.pill(group.name, group.color, 'tag-pill'), search: group.name.toLocaleLowerCase() })),
      apply: async (added, removed, chosen) => {
        container.innerHTML = this.#pickerButton(chosen);
        this.wireTaskGroupsPicker(form);
      }
    });
  }
  // Applies the groups chosen in the task editor to the data being saved.
  applyTaskGroups(next, taskId, form) {
    if (!form.querySelector('[data-task-groups-picker]')) return;
    const chosen = new Set(new FormData(form).getAll('groupIds'));
    for (const group of next.groups || []) {
      const member = group.taskIds.includes(taskId);
      if (chosen.has(group.id) && !member) group.taskIds.push(taskId);
      if (!chosen.has(group.id) && member) group.taskIds = group.taskIds.filter(id => id !== taskId);
    }
  }
}
