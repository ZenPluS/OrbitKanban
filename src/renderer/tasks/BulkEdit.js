// Bulk edit of the selected tasks.
import { Component } from '../core/Component.js';
import { ColumnCleanup, ColumnSchema, ColumnValidator, PlatformLinks, RequiredFields, TaskOrder } from '../shared.js';

export class BulkEdit extends Component {
  #shiftDate = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  };
  #required = id => RequiredFields.isRequired(this.state.data.settings, 'tasks', id);
  // Successor columns are computed from the predecessors of the other tasks, so they cannot be edited.
  #customFields = () => ColumnSchema.fieldsOf(this.state.data.settings, 'tasks').filter(field => field.type !== 'child');
  #isEmpty = value => value === undefined || value === null || value === '' || Array.isArray(value) && !value.length;
  #setCustom(task, id, value) {
    if (value !== undefined) (task.customFields ||= {})[id] = value;
    else if (task.customFields) delete task.customFields[id];
  }
  // A task cannot follow itself or any of its direct or indirect successors.
  #blocked(tasks, taskId, fieldId) {
    const successors = ColumnCleanup.successorIndex(tasks, fieldId), blocked = new Set([taskId]), queue = [taskId];
    while (queue.length) for (const id of successors.get(queue.shift()) || []) if (!blocked.has(id)) { blocked.add(id); queue.push(id); }
    return blocked;
  }
  #richStep(mode, editorId, name, read, write) {
    if (mode === 'clear') return task => write(task, '');
    const html = this.app.richText.sanitize(this.$(`#${editorId}`)?.innerHTML || '');
    if (!this.app.richText.plain(html)) throw new Error(this.app.transfer.fillText("Write the text to apply to {0}.", name));
    if (mode === 'replace') return task => write(task, html);
    return task => { const current = read(task) || ''; write(task, this.app.richText.plain(current) ? `${current}<div>${html}</div>` : html); };
  }
  #customValue(field, raw) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error(this.app.transfer.fillText("Enter the new value of {0}.", field.name));
    const value = ['number', 'effort'].includes(field.type) ? Number(text) : field.type === 'url' ? PlatformLinks.normalizeUrl(text) : field.type === 'platform' ? PlatformLinks.platformValue(field, text) : field.type === 'text' ? String(raw) : text;
    ColumnValidator.validateValue(value, field);
    return value;
  }
  // Turns the bulk form into a list of edits; fields left on "do not change" are skipped.
  #bulkPlan(form, order) {
    const fields = new FormData(form), steps = [], required = [], modeOf = id => fields.get(`mode:${id}`) || '';
    const add = (id, name, step, empty) => { steps.push(step); if (this.#required(id)) required.push({ name, empty }); };
    const status = fields.get('statusId'), urgency = fields.get('urgencyId'), mode = fields.get('releaseMode'), mark = fields.get('highlightId'), hidden = fields.get('hidden');
    if (modeOf('code') === 'set') {
      const code = String(fields.get('value:code') || '').trim();
      if (!code) throw new Error("Enter the new portal code.");
      add('code', this.app.columns.columnName('code'), task => { task.code = code; }, task => !task.code.trim());
    } else if (modeOf('code') === 'clear') add('code', this.app.columns.columnName('code'), task => { task.code = ''; }, task => !task.code.trim());
    if (modeOf('sequence') === 'renumber') {
      const raw = String(fields.get('value:sequence') ?? '').trim(), start = Number(raw), position = new Map(order.map((id, index) => [id, index]));
      if (!raw || !Number.isInteger(start) || start < 0) throw new Error("Enter the first sequence number: a whole number from 0.");
      steps.push(task => { task.sequence = start + position.get(task.id); });
    }
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
    if (mark) steps.push(task => { ColumnSchema.setTaskHighlightIds(task, mark === '__none' ? [] : [mark]); });
    if (modeOf('effort') === 'set') {
      const days = Number(fields.get('effortDays') || 0), hours = Number(fields.get('effortHours') || 0);
      if (![days, hours].every(value => Number.isFinite(value) && value >= 0)) throw new Error("Enter a valid effort: days and hours from 0.");
      const total = Math.round((days * this.state.data.settings.hoursPerDay + hours) * 100) / 100;
      add('effort', this.app.columns.columnName('effort'), task => { task.effortHours = total; }, task => task.effortHours <= 0);
    } else if (modeOf('effort') === 'clear') add('effort', this.app.columns.columnName('effort'), task => { task.effortHours = 0; }, task => task.effortHours <= 0);
    if (hidden) steps.push(task => { task.hidden = hidden === 'hide'; });
    for (const [id, editor, name] of [['description', 'bulk-description-editor', this.app.columns.columnName('description')], ['notes', 'bulk-notes-editor', this.app.columns.columnName('notes')]]) {
      if (modeOf(id)) add(id, name, this.#richStep(modeOf(id), editor, name, task => task[id], (task, html) => { task[id] = html; }), task => !this.app.richText.plain(task[id]));
    }
    const tags = this.state.data.settings.tags || [], addTags = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'add').map(tag => tag.id), removeTags = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'remove').map(tag => tag.id);
    if (addTags.length || removeTags.length) steps.push(task => {
      const current = task.tagIds || [];
      task.tagIds = [...current.filter(id => !removeTags.includes(id)), ...addTags.filter(id => !current.includes(id))];
    });
    for (const field of this.#customFields()) {
      const id = field.id, choice = modeOf(id);
      const empty = task => field.type === 'richtext' ? !this.app.richText.plain(task.customFields?.[id] || '') : this.#isEmpty(task.customFields?.[id]);
      let step;
      if (field.type === 'richtext') step = choice && this.#richStep(choice, `bulk-editor-${id}`, field.name, task => task.customFields?.[id], (task, html) => this.#setCustom(task, id, html || undefined));
      else if (field.type === 'multiselect') {
        const added = [], removed = [];
        ColumnSchema.choices(field).forEach((option, index) => {
          const action = fields.get(`choice:${id}:${index}`);
          if (action === 'add') added.push(option.id);
          if (action === 'remove') removed.push(option.id);
        });
        if (added.length || removed.length) step = task => {
          const current = task.customFields?.[id] || [], value = [...current.filter(item => !removed.includes(item)), ...added.filter(item => !current.includes(item))];
          this.#setCustom(task, id, value.length ? value : undefined);
        };
      } else if (field.type === 'parent') {
        const chosen = fields.getAll(`ref:${id}`);
        if (choice && choice !== 'clear' && !chosen.length) throw new Error(this.app.transfer.fillText("Choose the tasks for {0}.", field.name));
        if (choice) step = (task, next) => {
          const current = task.customFields?.[id] || [], blocked = ['add', 'replace'].includes(choice) ? this.#blocked(next.tasks, task.id, id) : new Set();
          const value = choice === 'add' ? [...current, ...chosen.filter(item => !current.includes(item) && !blocked.has(item))] : choice === 'replace' ? chosen.filter(item => !blocked.has(item)) : choice === 'remove' ? current.filter(item => !chosen.includes(item)) : [];
          this.#setCustom(task, id, value.length ? value : undefined);
        };
      } else if (['select', 'boolean'].includes(field.type)) {
        const raw = fields.get(`value:${id}`);
        if (raw) { const value = raw === '__clear' ? undefined : field.type === 'boolean' ? raw === 'true' : raw; step = task => this.#setCustom(task, id, value); }
      } else if (choice) {
        const value = choice === 'clear' ? undefined : this.#customValue(field, fields.get(`value:${id}`));
        step = task => this.#setCustom(task, id, value);
      }
      if (step) add(id, field.name, step, empty);
    }
    const groups = this.state.data.groups || [], joinGroups = groups.filter(group => fields.get(`group:${group.id}`) === 'add').map(group => group.id), leaveGroups = groups.filter(group => fields.get(`group:${group.id}`) === 'remove').map(group => group.id);
    if (joinGroups.length || leaveGroups.length) steps.push((task, next) => {
      for (const group of next.groups || []) {
        const member = group.taskIds.includes(task.id);
        if (joinGroups.includes(group.id) && !member) group.taskIds.push(task.id);
        if (leaveGroups.includes(group.id) && member) group.taskIds = group.taskIds.filter(id => id !== task.id);
      }
    });
    return { steps, required, highlight: Boolean(mark) };
  }
  #modeField(id, label, options, controls, full = false) {
    const key = this.esc(id);
    return `<div class="field ${full ? 'full ' : ''}bulk-mode-field"><label for="bulk-mode-${key}">${this.esc(label)}</label><div class="bulk-inline"><select id="bulk-mode-${key}" name="mode:${key}" data-bulk-mode><option value="">${this.esc(this.t("— Keep unchanged —"))}</option>${options.map(([value, text]) => `<option value="${value}">${this.esc(this.t(text))}</option>`).join('')}</select>${controls}</div></div>`;
  }
  #clearOption = id => this.#required(id) ? [] : [['clear', "Clear"]];
  #richField(id, label, editorId) {
    const key = this.esc(id);
    return `<div class="field full bulk-rich"><label for="bulk-mode-${key}">${this.esc(label)}</label><select id="bulk-mode-${key}" name="mode:${key}" data-bulk-mode><option value="">${this.esc(this.t("— Keep unchanged —"))}</option><option value="replace">${this.esc(this.t("Replace the text"))}</option><option value="append">${this.esc(this.t("Add at the end"))}</option>${this.#required(id) ? '' : `<option value="clear">${this.esc(this.t("Clear"))}</option>`}</select><div class="bulk-rich-editor" data-bulk-show="replace append" hidden>${this.app.fieldEditors.editor(editorId, "Text to apply", '')}</div></div>`;
  }
  #choiceRows(rows) {
    return rows.map(({ name, html, label }) => `<label class="bulk-tag">${html}<select name="${this.esc(name)}" aria-label="${this.esc(label)}"><option value="">—</option><option value="add">${this.esc(this.t("＋ Add"))}</option><option value="remove">${this.esc(this.t("− Remove"))}</option></select></label>`).join('');
  }
  #customControl(field) {
    const id = this.esc(field.id), keep = `<option value="">${this.esc(this.t("— Keep unchanged —"))}</option>`, clear = `<option value="__clear">${this.esc(this.t("Clear"))}</option>`;
    if (field.type === 'select') return `<label class="field">${this.esc(field.name)}<select name="value:${id}">${keep}${this.#required(field.id) ? '' : clear}${ColumnSchema.choices(field).map(option => `<option value="${this.esc(option.id)}">${this.esc(option.name)}</option>`).join('')}</select></label>`;
    if (field.type === 'boolean') return `<label class="field">${this.esc(field.name)}<select name="value:${id}">${keep}<option value="true">${this.esc(this.t("Yes"))}</option><option value="false">${this.esc(this.t('No'))}</option>${clear}</select></label>`;
    const type = field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text';
    const attributes = type === 'number' ? `step="any"${field.type === 'effort' ? ' min="0"' : ''}` : type === 'text' ? 'maxlength="2000" autocomplete="off" spellcheck="false"' : '';
    const hint = field.type === 'effort' ? this.t("Value in hours") : this.app.transfer.fillText("New value of {0}", field.name);
    return this.#modeField(field.id, field.name, [['set', "Set a value"], ...this.#clearOption(field.id)], `<input name="value:${id}" type="${type}" ${attributes} aria-label="${this.esc(hint)}" title="${this.esc(hint)}" data-bulk-show="set" hidden>`);
  }
  #referenceButton(field, values) {
    const chips = this.app.cells.referenceChips(this.app.cells.referenceTasks(values), false);
    return `<button type="button" class="task-tags-button reference-picker" data-choice-picker="bulk:${this.esc(field.id)}" data-own-picker data-bulk-reference="${this.esc(field.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${this.esc(field.name)}"><span class="tag-chips">${chips || `<span class="muted">+ ${this.esc(this.t("Choose tasks"))}</span>`}</span>${this.ico('chevron-down')}</button>` + values.map(id => `<input type="hidden" name="ref:${this.esc(field.id)}" value="${this.esc(id)}">`).join('');
  }
  #referenceField(field) {
    return this.#modeField(field.id, field.name, [['add', "Add predecessors"], ['remove', "Remove predecessors"], ['replace', "Replace predecessors"], ...this.#clearOption(field.id)], `<div class="bulk-reference-picker" data-bulk-show="add remove replace" hidden>${this.#referenceButton(field, [])}</div>`, true);
  }
  #wireReferencePickers(form) {
    form.querySelectorAll('[data-bulk-reference]').forEach(button => button.onclick = () => {
      const field = this.#customFields().find(field => field.id === button.dataset.bulkReference);
      if (!field) return;
      this.app.tagMenu.openTagMenu(button, {
        field, form, values: new FormData(form).getAll(`ref:${field.id}`), emptyLabel: this.t("No tasks available."),
        options: this.state.data.tasks.map(task => ({ id: task.id, html: `<span class="reference-option">${this.app.cells.referenceChips([task], false)}<span>${this.esc(this.app.richText.plain(task.description))}</span></span>`, search: [this.app.cells.referenceName(task), task.code, this.app.richText.plain(task.description)].join(' ').toLowerCase() })),
        apply: async (added, removed, chosen) => {
          const container = button.parentElement;
          container.innerHTML = this.#referenceButton(field, chosen);
          this.#wireReferencePickers(form);
          form.dispatchEvent(new Event('change'));
        }
      });
    });
  }
  bulkDialog(ids, context = '') {
    const settings = this.state.data.settings, wanted = new Set(ids), tasks = this.app.taskList.sortedRows(this.state.data.tasks.filter(task => wanted.has(task.id))), tags = settings.tags || [];
    if (!tasks.length) { this.app.notifier.notify("Select at least one task.", true); return; }
    const keep = `<option value="">${this.esc(this.t("— Keep unchanged —"))}</option>`;
    const statuses = settings.statuses.filter(status => tasks.some(task => task.statusId === status.id));
    const items = tasks.map(task => {
      const status = this.statusOf(task);
      return `<label class="bulk-item ${task.hidden ? 'is-hidden' : ''}"><input type="checkbox" name="taskIds" value="${this.esc(task.id)}" data-status="${this.esc(task.statusId)}" checked><strong>${this.esc(this.app.taskFilter.recordLabel(task))}</strong><span class="bulk-desc">${this.esc(this.app.richText.plain(task.description))}</span>${this.app.presenter.pill(status.name, status.color)}<span class="bulk-date" style="--date:${task.releaseDate ? TaskOrder.dateColor(task.releaseDate) : '#929bb2'}">${this.ico('calendar')}${this.app.presenter.formatDate(task.releaseDate)}</span></label>`;
    }).join('');
    const tagRows = this.#choiceRows(tags.map(tag => ({ name: `tag:${tag.id}`, html: this.app.presenter.pill(tag.name, tag.color, 'tag-pill'), label: this.app.transfer.fillText('Tag {0}', tag.name) })));
    const custom = this.#customFields(), groups = this.state.data.groups || [];
    const code = this.hasColumn('code') ? this.#modeField('code', this.app.columns.columnName('code'), [['set', "Set a value"], ...this.#clearOption('code')], `<input name="value:code" maxlength="200" autocomplete="off" spellcheck="false" aria-label="${this.esc(this.t("New portal code"))}" title="${this.esc(this.t("New portal code"))}" data-bulk-show="set" hidden>`) : '';
    const sequence = this.hasColumn('sequence') ? this.#modeField('sequence', this.app.columns.columnName('sequence'), [['renumber', "Renumber in list order"]], `<input name="value:sequence" type="number" min="0" step="1" value="${Math.min(...tasks.map(task => task.sequence))}" aria-label="${this.esc(this.t("First number"))}" title="${this.esc(this.t("First number"))}" data-bulk-show="renumber" hidden>`) : '';
    const unit = (name, label) => `<label class="bulk-unit" data-bulk-show="set" hidden><input name="${name}" type="number" min="0" step="0.01" value="0"><span>${this.esc(this.t(label))}</span></label>`;
    const effort = this.hasColumn('effort') ? this.#modeField('effort', this.app.columns.columnName('effort'), [['set', "Set a value"], ...this.#clearOption('effort')], `${unit('effortDays', "Days")}${unit('effortHours', "Hours")}<small class="bulk-unit-hint" data-bulk-show="set" hidden>${this.esc(this.app.transfer.fillText("1 day = {0} hours", settings.hoursPerDay))}</small>`, true) : '';
    const compact = custom.filter(field => !['richtext', 'multiselect', 'parent'].includes(field.type)).map(field => this.#customControl(field)).join('');
    const rich = (this.hasColumn('description') ? this.#richField('description', this.app.columns.columnName('description'), 'bulk-description-editor') : '') + (this.hasColumn('notes') ? this.#richField('notes', this.app.columns.columnName('notes'), 'bulk-notes-editor') : '') + custom.filter(field => field.type === 'richtext').map(field => this.#richField(field.id, field.name, `bulk-editor-${field.id}`)).join('');
    const references = custom.filter(field => field.type === 'parent').map(field => this.#referenceField(field)).join('');
    const choices = custom.filter(field => field.type === 'multiselect').map(field => `<fieldset class="field full bulk-tags bulk-choices"><legend>${this.esc(field.name)}</legend><div class="bulk-tag-grid">${this.#choiceRows(ColumnSchema.choices(field).map((option, index) => ({ name: `choice:${field.id}:${index}`, html: this.app.presenter.pill(option.name, option.color, 'tag-pill'), label: `${field.name}: ${option.name}` })))}</div></fieldset>`).join('');
    const groupRows = groups.length ? `<fieldset class="field full bulk-tags bulk-groups"><legend>${this.esc(this.app.sections.nameOf('groups'))}</legend><div class="bulk-tag-grid">${this.#choiceRows(groups.map(group => ({ name: `group:${group.id}`, html: this.app.presenter.pill(group.name, group.color, 'tag-pill'), label: this.app.transfer.fillText("Group {0}", group.name) })))}</div></fieldset>` : '';
    this.app.modal.openModal(this.ui`<form id="bulk-form" novalidate><div class="modal-heading"><div><div class="eyebrow">${this.esc(this.app.sections.nameOf('tasks'))}</div><h2>${this.esc(this.t("Bulk edit"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>${context ? `<p class="section-description">${this.esc(context)}</p>` : ''}
    <section class="bulk-targets" aria-labelledby="bulk-targets-title"><div class="bulk-targets-head"><strong id="bulk-targets-title">Tasks involved</strong><span class="bulk-quick">${statuses.length > 1 ? statuses.map(status => `<button type="button" class="bulk-status-chip" data-bulk-status="${this.esc(status.id)}" style="--pill:${this.esc(status.color)}" title="${this.esc(this.app.transfer.fillText("Select only: {0}", status.name))}">${this.esc(status.name)}</button>`).join('') : ''}<button type="button" class="unsaved-link" data-bulk-all="1">Select all</button><button type="button" class="unsaved-link" data-bulk-all="0">Deselect all</button></span></div><div class="bulk-list">${items}</div></section>
    <div class="form-grid bulk-fields">
      ${code}${sequence}
      ${this.hasColumn('status') ? this.ui`<label class="field">Status<select name="statusId">${keep}${this.app.presenter.optionList(settings.statuses, '')}</select></label>` : ''}
      ${this.hasColumn('urgency') ? this.ui`<label class="field">Urgency<select name="urgencyId">${keep}${this.app.presenter.optionList(settings.urgencies, '')}</select></label>` : ''}
      ${this.hasColumn('releaseDate') ? this.ui`<div class="field"><label for="bulk-release-mode">${this.esc(this.app.columns.columnName('releaseDate'))}</label><div class="bulk-inline"><select id="bulk-release-mode" name="releaseMode">${keep}<option value="set">Set a date</option><option value="shift">Move by N days</option><option value="clear">Remove the date (unscheduled)</option></select><input type="date" name="releaseDate" aria-label="New release date" hidden><input type="number" name="shiftDays" step="1" value="7" aria-label="Days to move (negative to bring forward)" title="Days to move (negative to bring forward)" hidden></div><small id="bulk-release-hint"></small></div>` : ''}
      ${this.hasColumn('highlight') ? this.ui`<label class="field">Highlight<select name="highlightId">${keep}<option value="__none">No highlight</option>${this.app.presenter.optionList(this.app.presenter.highlightsOf(), '')}</select></label>` : ''}
      ${effort}
      <label class="field">Visibility in the list<select name="hidden">${keep}<option value="hide">Hide from the list</option><option value="show">Show in the list</option></select></label>
      ${compact}${rich}${references}
      ${tags.length && this.hasColumn('tags') ? this.ui`<fieldset class="field full bulk-tags"><legend>Tags</legend><div class="bulk-tag-grid">${tagRows}</div></fieldset>` : ''}
      ${choices}${groupRows}
    </div><p class="bulk-summary" id="bulk-summary" aria-live="polite"></p>
    <div class="modal-actions"><button type="button" class="button danger" id="bulk-delete">Delete…</button><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="bulk-apply">Apply</button></div></form>`);
    const form = this.$('#bulk-form'), boxes = [...form.querySelectorAll('input[name="taskIds"]')];
    this.app.fieldEditors.wireEditors();
    this.#wireReferencePickers(form);
    // Bulk edit cannot empty a mandatory field.
    if (RequiredFields.isRequired(settings, 'tasks', 'releaseDate')) form.querySelector('#bulk-release-mode option[value="clear"]')?.remove();
    if (RequiredFields.isRequired(settings, 'tasks', 'highlight')) form.querySelector('select[name="highlightId"] option[value="__none"]')?.remove();
    if (!this.hasColumn('releaseDate')) form.querySelectorAll('.bulk-date').forEach(element => element.remove());
    if (!this.hasColumn('status')) form.querySelectorAll('.bulk-item .pill, [data-bulk-status]').forEach(element => element.remove());
    if (!this.hasColumn('description')) form.querySelectorAll('.bulk-desc').forEach(element => element.remove());
    const chosen = () => new Set(boxes.filter(box => box.checked).map(box => box.value));
    const order = () => boxes.filter(box => box.checked).map(box => box.value);
    const summarize = () => {
      const ids = chosen(), mode = form.elements.releaseMode?.value;
      let pending = 0;
      try { pending = this.#bulkPlan(form, order()).steps.length; } catch { pending = 1; }
      if (form.elements.releaseDate) form.elements.releaseDate.hidden = mode !== 'set';
      if (form.elements.shiftDays) form.elements.shiftDays.hidden = mode !== 'shift';
      form.querySelectorAll('[data-bulk-mode]').forEach(select => select.closest('.field').querySelectorAll('[data-bulk-show]').forEach(element => { element.hidden = !element.dataset.bulkShow.split(' ').includes(select.value); }));
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
      const ids = chosen(), plan = this.#bulkPlan(form, order());
      if (!ids.size) throw new Error("Select at least one task.");
      if (!plan.steps.length) throw new Error("Choose at least one field to change.");
      let changed = 0;
      await this.app.history.commit(next => {
        changed = 0;
        const membership = id => (next.groups || []).filter(group => group.taskIds.includes(id)).map(group => group.id).join();
        for (const task of next.tasks) {
          if (!ids.has(task.id)) continue;
          const before = JSON.stringify(task) + membership(task.id), emptyBefore = plan.required.map(check => check.empty(task));
          plan.steps.forEach(step => step(task, next));
          // Bulk edit cannot empty a mandatory field, even by removing values.
          plan.required.forEach((check, index) => { if (!emptyBefore[index] && check.empty(task)) throw new Error(this.app.transfer.fillText("{0} is required: bulk edit cannot leave it empty.", check.name)); });
          if (JSON.stringify(task) + membership(task.id) !== before) changed++;
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
