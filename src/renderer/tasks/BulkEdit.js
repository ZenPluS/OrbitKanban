// Bulk edit of the selected tasks.
import { Component } from '../core/Component.js';
import { RequiredFields, TaskOrder } from '../shared.js';

export class BulkEdit extends Component {
  #shiftDate = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  };
  // Turns the bulk form into a list of edits; fields left on "do not change" are skipped.
  #bulkPlan(fields) {
    const steps = [], status = fields.get('statusId'), urgency = fields.get('urgencyId'), mode = fields.get('releaseMode'), mark = fields.get('highlightId'), hidden = fields.get('hidden');
    if (status) steps.push(task => { task.statusId = status; });
    if (urgency) steps.push(task => { task.urgencyId = urgency; });
    if (mode === 'set') {
      const date = fields.get('releaseDate');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose the new release date.");
      steps.push(task => { task.releaseDate = date; });
    } else if (mode === 'shift') {
      const days = Number(fields.get('shiftDays'));
      if (!Number.isInteger(days) || !days || Math.abs(days) > 3650) throw new Error("Enter how many days to move the release: a whole number other than zero.");
      steps.push(task => { if (task.releaseDate) task.releaseDate = this.#shiftDate(task.releaseDate, days); });
    } else if (mode === 'clear') steps.push(task => { task.releaseDate = ''; });
    if (mark) steps.push(task => { task.highlightId = mark === '__none' ? '' : mark; });
    if (hidden) steps.push(task => { task.hidden = hidden === 'hide'; });
    const tags = this.state.data.settings.tags || [], add = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'add').map(tag => tag.id), remove = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'remove').map(tag => tag.id);
    if (add.length || remove.length) steps.push(task => {
      const current = task.tagIds || [];
      task.tagIds = [...current.filter(id => !remove.includes(id)), ...add.filter(id => !current.includes(id))];
    });
    return { steps, highlight: Boolean(mark) };
  }
  bulkDialog(ids, context = '') {
    const settings = this.state.data.settings, wanted = new Set(ids), tasks = this.app.taskList.sortedRows(this.state.data.tasks.filter(task => wanted.has(task.id))), tags = settings.tags || [];
    if (!tasks.length) { this.app.notifier.notify("Select at least one task.", true); return; }
    const keep = `<option value="">${this.esc(this.t("— Keep unchanged —"))}</option>`;
    const statuses = settings.statuses.filter(status => tasks.some(task => task.statusId === status.id));
    const items = tasks.map(task => {
      const status = this.statusOf(task);
      return `<label class="bulk-item ${task.hidden ? 'is-hidden' : ''}"><input type="checkbox" name="taskIds" value="${this.esc(task.id)}" data-status="${this.esc(task.statusId)}" checked><strong>${this.esc(this.app.taskFilter.recordLabel(task))}</strong><span class="bulk-desc">${this.esc(this.app.richText.plain(task.description) || this.t("No description"))}</span>${this.app.presenter.pill(status.name, status.color)}<span class="bulk-date" style="--date:${task.releaseDate ? TaskOrder.dateColor(task.releaseDate) : '#929bb2'}">${this.ico('calendar')}${this.app.presenter.formatDate(task.releaseDate)}</span></label>`;
    }).join('');
    const tagRows = tags.map(tag => `<label class="bulk-tag">${this.app.presenter.pill(tag.name, tag.color, 'tag-pill')}<select name="tag:${this.esc(tag.id)}" aria-label="${this.esc(this.app.transfer.fillText('Tag {0}', tag.name))}"><option value="">—</option><option value="add">${this.esc(this.t("＋ Add"))}</option><option value="remove">${this.esc(this.t("− Remove"))}</option></select></label>`).join('');
    this.app.modal.openModal(this.ui`<form id="bulk-form" novalidate><div class="modal-heading"><div><div class="eyebrow">${this.esc(this.state.data.settings.tabNames[0])}</div><h2>${this.esc(this.t("Bulk edit"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>${context ? `<p class="section-description">${this.esc(context)}</p>` : ''}
    <section class="bulk-targets" aria-labelledby="bulk-targets-title"><div class="bulk-targets-head"><strong id="bulk-targets-title">Tasks involved</strong><span class="bulk-quick">${statuses.length > 1 ? statuses.map(status => `<button type="button" class="bulk-status-chip" data-bulk-status="${this.esc(status.id)}" style="--pill:${this.esc(status.color)}" title="${this.esc(this.app.transfer.fillText("Select only: {0}", status.name))}">${this.esc(status.name)}</button>`).join('') : ''}<button type="button" class="unsaved-link" data-bulk-all="1">Select all</button><button type="button" class="unsaved-link" data-bulk-all="0">Deselect all</button></span></div><div class="bulk-list">${items}</div></section>
    <div class="form-grid bulk-fields">
      <label class="field">Status<select name="statusId">${keep}${this.app.presenter.optionList(settings.statuses, '')}</select></label>
      <label class="field">Urgency<select name="urgencyId">${keep}${this.app.presenter.optionList(settings.urgencies, '')}</select></label>
      <div class="field"><label for="bulk-release-mode">Release date</label><div class="bulk-inline"><select id="bulk-release-mode" name="releaseMode">${keep}<option value="set">Set a date</option><option value="shift">Move by N days</option><option value="clear">Remove the date (unscheduled)</option></select><input type="date" name="releaseDate" aria-label="New release date" hidden><input type="number" name="shiftDays" step="1" value="7" aria-label="Days to move (negative to bring forward)" title="Days to move (negative to bring forward)" hidden></div><small id="bulk-release-hint"></small></div>
      <label class="field">Highlight<select name="highlightId">${keep}<option value="__none">No highlight</option>${this.app.presenter.optionList(this.app.presenter.highlightsOf(), '')}</select></label>
      <label class="field">Visibility in the list<select name="hidden">${keep}<option value="hide">Hide from the list</option><option value="show">Show in the list</option></select></label>
      ${tags.length ? this.ui`<fieldset class="field full bulk-tags"><legend>Tags</legend><div class="bulk-tag-grid">${tagRows}</div></fieldset>` : ''}
    </div><p class="bulk-summary" id="bulk-summary" aria-live="polite"></p>
    <div class="modal-actions"><button type="button" class="button danger" id="bulk-delete">Delete…</button><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="bulk-apply">Apply</button></div></form>`);
    const form = this.$('#bulk-form'), boxes = [...form.querySelectorAll('input[name="taskIds"]')];
    for (const [id, name] of [['status', 'statusId'], ['urgency', 'urgencyId'], ['highlight', 'highlightId'], ['releaseDate', 'releaseMode']]) {
      if (!this.hasColumn(id)) form.elements[name].closest('.field').remove();
    }
    if (!this.hasColumn('tags')) form.querySelector('.bulk-tags')?.remove();
    // Bulk edit cannot empty a mandatory field.
    if (RequiredFields.isRequired(settings, 'tasks', 'releaseDate')) form.querySelector('#bulk-release-mode option[value="clear"]')?.remove();
    if (RequiredFields.isRequired(settings, 'tasks', 'highlight')) form.querySelector('select[name="highlightId"] option[value="__none"]')?.remove();
    if (!this.hasColumn('releaseDate')) form.querySelectorAll('.bulk-date').forEach(element => element.remove());
    if (!this.hasColumn('status')) form.querySelectorAll('.bulk-item .pill, [data-bulk-status]').forEach(element => element.remove());
    if (!this.hasColumn('description')) form.querySelectorAll('.bulk-desc').forEach(element => element.remove());
    const chosen = () => new Set(boxes.filter(box => box.checked).map(box => box.value));
    const summarize = () => {
      const ids = chosen(), mode = form.elements.releaseMode?.value;
      let pending = 0;
      try { pending = this.#bulkPlan(new FormData(form)).steps.length; } catch { pending = 1; }
      if (form.elements.releaseDate) form.elements.releaseDate.hidden = mode !== 'set';
      if (form.elements.shiftDays) form.elements.shiftDays.hidden = mode !== 'shift';
      const dated = tasks.filter(task => ids.has(task.id) && task.releaseDate).length;
      if (this.$('#bulk-release-hint')) this.$('#bulk-release-hint').textContent = mode === 'shift' ? this.app.transfer.fillText("Only tasks with a date: {0} of {1}.", dated, ids.size) : '';
      this.$('#bulk-summary').textContent = !ids.size ? this.t("Select at least one task.") : pending ? this.app.transfer.fillText("Changes will be applied to {0}.", this.plural(ids.size, "tasks")) : this.app.transfer.fillText("{0} ready: choose what to change.", this.plural(ids.size, "tasks"));
      this.$('#bulk-apply').disabled = !ids.size || !pending;
      this.$('#bulk-delete').disabled = !ids.size;
      form.querySelectorAll('[data-bulk-status]').forEach(chip => chip.setAttribute('aria-pressed', String(boxes.every(box => box.checked === (box.dataset.status === chip.dataset.bulkStatus)))));
    };
    form.addEventListener('input', summarize);
    form.addEventListener('change', summarize);
    form.querySelectorAll('[data-bulk-all]').forEach(button => button.onclick = () => { boxes.forEach(box => { box.checked = button.dataset.bulkAll === '1'; }); summarize(); });
    form.querySelectorAll('[data-bulk-status]').forEach(chip => chip.onclick = () => { boxes.forEach(box => { box.checked = box.dataset.status === chip.dataset.bulkStatus; }); summarize(); });
    summarize();
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const ids = chosen(), plan = this.#bulkPlan(new FormData(form));
      if (!ids.size) throw new Error("Select at least one task.");
      if (!plan.steps.length) throw new Error("Choose at least one field to change.");
      let changed = 0;
      await this.app.history.commit(next => {
        changed = 0;
        for (const task of next.tasks) {
          if (!ids.has(task.id)) continue;
          const before = JSON.stringify(task);
          plan.steps.forEach(step => step(task));
          if (JSON.stringify(task) !== before) changed++;
        }
      });
      if (plan.highlight) ids.forEach(id => this.app.rowMarks.pendingMarks.delete(id));
      this.$('#modal').close();
      this.app.shell.rerenderPreservingView();
      this.app.notifier.notify(this.app.transfer.fillText("Bulk edit applied: {0} updated.", this.plural(changed, "tasks")));
    });
    this.$('#bulk-delete').onclick = () => {
      const ids = chosen(), codes = tasks.filter(task => ids.has(task.id)).map(task => task.code);
      if (!ids.size) return;
      this.app.modal.confirmDialog("Delete the chosen tasks?", this.app.transfer.fillText("{0} will be permanently deleted: {1}. Issue associations will remain available.", this.plural(ids.size, "tasks"), codes.slice(0, 10).join(', ') + (codes.length > 10 ? '…' : '')), async () => {
        let removed = 0;
        await this.app.history.commit(next => {
          const before = next.tasks.length;
          next.tasks = next.tasks.filter(task => !ids.has(task.id));
          removed = before - next.tasks.length;
        });
        ids.forEach(id => { this.state.selectedTasks.delete(id); this.app.rowMarks.pendingMarks.delete(id); });
        this.app.shell.rerenderPreservingView();
        this.app.notifier.notify(this.app.transfer.fillText("Tasks deleted: {0}.", removed));
      });
    };
  }
}
