// Task editor dialog.
import { Component } from '../core/Component.js';
import { IssueMatcher } from '../shared.js';

export class TaskDialog extends Component {
  taskDialog(existing) {
    const t = existing || {
      id: this.uid(), code: '', sequence: Math.max(0, ...this.state.data.tasks.map(t => t.sequence)) + 1, description: '',
      statusId: this.hasColumn('status') ? this.state.data.settings.statuses[0]?.id || '' : '', urgencyId: this.hasColumn('urgency') ? this.state.data.settings.urgencies[Math.min(2, this.state.data.settings.urgencies.length - 1)]?.id || '' : '',
      effortHours: 0, releaseDate: '', notes: '', hidden: false, highlightId: '', tagIds: []
    };
    const days = Math.floor(t.effortHours / this.state.data.settings.hoursPerDay), hours = Math.round((t.effortHours - days * this.state.data.settings.hoursPerDay) * 100) / 100;
    this.app.modal.openModal(this.ui`<form id="task-form" class="task-form"><div class="modal-heading"><div><div class="eyebrow">TASK</div><h2>${this.tr(existing ? "Edit task" : "A new direction")}</h2></div>${this.app.groupEditor.taskGroupsPicker(t.id)}<button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div><div class="task-edit-layout"></div><div class="task-edit-pool">
    <label class="field">Portal code<input name="code" maxlength="200" value="${this.esc(t.code)}" placeholder="es. PRJ-1042"></label>
    <label class="field">Sequence<input name="sequence" type="number" min="0" step="1" value="${t.sequence}"></label>
    <label class="field">Urgency<select name="urgencyId">${this.app.presenter.optionList(this.state.data.settings.urgencies, t.urgencyId, "Unassigned")}</select></label>
    <label class="field">Status<select name="statusId">${this.app.presenter.optionList(this.state.data.settings.statuses, t.statusId, "Unassigned")}</select></label>
    <label class="field">Release date<input name="releaseDate" type="date" value="${this.esc(t.releaseDate)}"></label>
    <label class="field" title="Colors the row in the task list. Colors are managed in Settings › Highlighters.">Highlight<select name="highlightId">${this.app.presenter.optionList(this.app.presenter.highlightsOf(), this.app.rowMarks.currentMark(t), "No highlight")}</select></label>
    <label class="field"><span class="task-effort-label">Effort in days <small>${this.esc(this.app.transfer.fillText("1 day = {0} hours", this.state.data.settings.hoursPerDay))}</small></span><input name="days" type="number" min="0" step="0.01" value="${days}"></label>
    <label class="field">Additional effort in hours<input name="hours" type="number" min="0" step="0.01" value="${hours}"></label>
    <label class="field full checkbox-field"><input type="checkbox" name="hidden" ${t.hidden ? 'checked' : ''}> Hide from the task list only (still visible in milestones and kanban)</label>
    <div class="auto-match full" id="match-preview"></div>
    ${this.app.fieldEditors.customEditors('tasks', t, false)}
    ${this.app.fieldEditors.editor('description-editor', "Description", t.description)}
    ${this.app.fieldEditors.editor('notes-editor', "Notes", t.notes)}
    </div><div class="modal-actions">${existing ? this.ui`<button type="button" class="button danger" id="delete-task">Delete</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary">Save task</button></div></form>`);
    const form = this.$('#task-form');
    this.app.csvImport.pruneColumnEditors(form, 'tasks');
    if (!this.hasColumn('code') || !this.hasColumn('code', 'issues') || !['incident', 'problem'].some(id => this.hasColumn(id) && this.hasColumn(id, 'issues'))) this.$('#match-preview').remove();
    this.app.taskForm.applyTaskEditorLayout(form);
    const attachmentTask = { id: t.id, code: t.code };
    const formLayout = this.$('.task-edit-layout');
    formLayout.insertAdjacentHTML('beforeend', this.app.attachments.editorSection(attachmentTask, Boolean(existing)));
    formLayout.style.gridTemplateRows = 'minmax(0, 1fr) auto';
    if (existing) this.app.attachments.loadEditorSection(attachmentTask);
    this.app.taskForm.markRequiredFields(form, 'tasks');
    const updateMatches = () => {
      if (!this.$('#match-preview')) return;
      const code = form.elements.code?.value || '', links = this.matchIssues({ code }, this.state.data.issues);
      if (!this.hasColumn('incident') || !this.hasColumn('incident', 'issues')) links.incidents = [];
      if (!this.hasColumn('problem') || !this.hasColumn('problem', 'issues')) links.problems = [];
      const groups = IssueMatcher.findDuplicates([...this.state.data.tasks.filter(task => task.id !== t.id), { ...t, code }], this.state.data.issues).tasks.get(t.id) || [];
      this.$('#match-preview').classList.toggle('has-duplicates', groups.length > 0);
      this.$('#match-preview').innerHTML = this.ui`<span>${this.ico('link')}Automatic link by portal code</span>` + `<div>${this.hasColumn('incident') && this.hasColumn('incident', 'issues') ? `Incident: <strong>${this.esc(links.incidents.join(', ') || '—')}</strong>` : ''} ${this.hasColumn('problem') && this.hasColumn('problem', 'issues') ? `Problem: <strong>${this.esc(links.problems.join(', ') || '—')}</strong>` : ''}</div>` +
        (groups.length ? `<p class="duplicate-warning"><strong>${this.ico('copy')}${this.esc(this.tr("Possible duplicate"))}</strong>${this.app.taskFilter.taskDuplicateLines(t.id, groups).map(line => `<span>${this.esc(line)}</span>`).join('')}</p>` : '');
    };
    form.elements.code?.addEventListener('input', updateMatches); updateMatches(); this.app.fieldEditors.wireEditors();
    this.app.cells.wirePlatformPreviews(form);
    this.app.groupEditor.wireTaskGroupsPicker(form);
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const fields = new FormData(form);
      this.app.taskForm.checkRequiredFields(form, 'tasks', {
        effort: () => Number(fields.get('days')) * this.state.data.settings.hoursPerDay + Number(fields.get('hours')) <= 0
      });
      const sequence = String(fields.get('sequence') ?? '').trim();
      const item = {
        ...t, code: (fields.get('code') || '').trim(), sequence: Number(sequence),
        description: this.app.richText.sanitize(this.$('#description-editor')?.innerHTML || ''), notes: this.app.richText.sanitize(this.$('#notes-editor')?.innerHTML || ''),
        urgencyId: fields.get('urgencyId') || '', statusId: fields.get('statusId') || '', releaseDate: fields.get('releaseDate') || '',
        effortHours: Math.round((Number(fields.get('days')) * this.state.data.settings.hoursPerDay + Number(fields.get('hours'))) * 100) / 100,
        hidden: fields.has('hidden'), highlightId: fields.get('highlightId') || '', customFields: this.app.fieldEditors.readCustomEditors(form, 'tasks')
      };
      this.app.rowMarks.pendingMarks.delete(item.id);
      await this.app.history.commit(next => {
        const index = next.tasks.findIndex(x => x.id === item.id);
        // An empty sequence takes the next free number, as for new tasks; a deleted sequence column stays empty.
        if (!sequence && this.hasColumn('sequence')) item.sequence = Math.max(0, ...next.tasks.filter(x => x.id !== item.id).map(x => x.sequence)) + 1;
        if (index >= 0) next.tasks[index] = { ...item, tagIds: next.tasks[index].tagIds }; else next.tasks.push(item);
        this.app.groupEditor.applyTaskGroups(next, item.id, form);
      });
      this.$('#modal').close(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Task saved.");
    });
    if (existing) this.$('#delete-task').onclick = () => this.app.modal.confirmDialog("Delete this task?", `${t.code} will be permanently deleted. Issue associations will remain available.`, async () => {
      await this.app.history.commit(next => { next.tasks = next.tasks.filter(x => x.id !== t.id); }); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Task deleted.");
    });
  }
  linkedCounts() {
    const counts = new Map();
    for (const task of this.state.data.tasks) { const code = task.code.trim().toUpperCase(); if (code) counts.set(code, (counts.get(code) || 0) + 1); }
    return counts;
  }
}
