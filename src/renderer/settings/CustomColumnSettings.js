// Custom column settings.
import { Component } from '../core/Component.js';
import { ColumnCleanup, ColumnSchema, ColumnValidator, Limits, PlatformLinks, RequiredFields, TaskLayout } from '../shared.js';

export class CustomColumnSettings extends Component {
  pendingCustomColumns() {
    return [...document.querySelectorAll('[data-add-field]')].filter(form => form.elements.name.value.trim());
  }
  // A predecessor column always comes with its successor column, which lists the tasks pointing back.
  #freeColumnName(base, fields) {
    const taken = new Set(fields.map(field => field.name.trim().toLocaleLowerCase()));
    let name = base, index = 2;
    while (taken.has(name.toLocaleLowerCase())) name = `${base} ${index++}`;
    return name;
  }
  newCustomFields(form, existing) {
    const values = new FormData(form), type = values.get('type'), id = `custom-${this.uid()}`;
    const field = { id, name: values.get('name').trim(), type, options: ['select', 'multiselect'].includes(type) ? [{ id: this.uid(), name: `${this.t("Option")} 1`, color: '#a392ff' }] : [], ...(type === 'platform' && { template: '' }) };
    if (type !== 'parent') return [field];
    return [field, { id: `custom-${this.uid()}`, name: String(values.get('childName') || '').trim() || this.#freeColumnName(this.t("Successors"), [...existing, field]), type: 'child', options: [], source: id }];
  }
  addableTypes = kind => Object.keys(this.app.columns.fieldTypeNames).filter(type => type !== 'child' && (kind === 'tasks' || !ColumnSchema.REFERENCE_TYPES.includes(type)));
  #platformTemplatePreview(template) {
    const value = PlatformLinks.normalizeUrl(template), sample = this.state.data.tasks.find(task => task.code.trim())?.code.trim() || 'PRJ-1042';
    if (!value) return { text: this.t("No template: enter the full link in each task.") };
    if (!PlatformLinks.hasPlaceholder(value)) return { invalid: true, text: this.t("Add the {code} placeholder where the code on the platform must be inserted.") };
    if (!PlatformLinks.validTemplate(value)) return { invalid: true, text: this.t("Invalid address: use a web address, for example https://tickets.example.com/browse/{code}.") };
    const url = PlatformLinks.fillTemplate(value, sample);
    return { html: `${this.esc(this.t("Preview with"))} <strong>${this.esc(sample)}</strong>: <a class="portal-link" href="${this.esc(url)}" data-open-url>${this.esc(url)}${this.ico('external')}</a>` };
  }
  customColumnsPanel() {
    return `<section class="panel settings-section" id="custom-columns-panel"><h2>${this.esc(this.t("Column management"))}</h2><p class="section-description">${this.esc(this.t("Default and custom columns share the same controls. Deleting a column removes its values and related controls when settings are saved. Hiding only changes the table."))}</p><p class="section-description">${this.esc(this.t("Up to 40 custom columns per list. Deleted default columns can be restored below, without their old values."))}</p><p class="section-description">${this.esc(this.t("Save settings also includes new columns entered below. Use Add column to configure labels and colors immediately or prepare more columns before saving."))}</p>${['tasks', 'issues'].map((kind, index) => `<section class="custom-schema"><h3>${this.esc(this.state.data.settings.tabNames[index])}</h3><div id="custom-definitions-${kind}"></div><div id="restore-columns-${kind}" class="storage-actions"></div><form class="custom-add-form" data-add-field="${kind}"><label class="field">${this.esc(this.t("Column name"))}<input name="name" maxlength="60" required></label><label class="field">${this.esc(this.t("Type"))}<select name="type">${this.addableTypes(kind).map(type => `<option value="${type}">${this.esc(this.t(this.app.columns.fieldTypeNames[type]))}</option>`).join('')}</select></label>${kind === 'tasks' ? `<label class="field" data-child-name hidden>${this.esc(this.t("Successors column name"))}<input name="childName" maxlength="60" placeholder="${this.esc(this.t("Successors"))}"></label>` : ''}<button type="submit" class="button">${this.esc(this.t("Add column"))}</button></form></section>`).join('')}<h3>${this.esc(this.t("Visible issue columns"))}</h3><div id="issue-columns-editor"></div></section>`;
  }
  #refreshChoiceSettings() {
    let panels = this.$('#choice-settings-panels');
    if (!panels) { panels = document.createElement('div'); panels.id = 'choice-settings-panels'; this.$('.settings-panels').append(panels); }
    panels.innerHTML = this.app.settings.choiceSettingsTabs().map(tab => `<section class="panel settings-section" id="${tab.panel}"><h2>${this.esc(tab.label)}</h2><p class="section-description">${this.esc(this.t("Manage labels, colors and order. Deleted labels are removed from rows when settings are saved; single choices become unassigned."))}</p>${tab.field.id === 'status' && tab.field.builtin ? `<p class="section-description">${this.esc(this.t("This order becomes the kanban order. Use the star to highlight tasks with this status."))}</p>` : ''}<div id="${tab.id}-list"></div><button type="button" class="button" data-add-choice="${tab.id}" ${tab.field.builtin ? `data-add-option="${tab.id}"` : ''}>${this.ico('plus')}${this.esc(this.t("Add label"))}</button></section>`).join('');
    this.$('.settings-nav').outerHTML = this.app.settings.settingsNav();
    document.querySelectorAll('[data-add-choice]').forEach(button => button.onclick = () => {
      const tab = this.app.settings.choiceSettingsTabs().find(tab => tab.id === button.dataset.addChoice), list = this.app.optionLists.optionCatalog(tab.id);
      if (list.length >= (tab.id === 'highlights' ? Limits.HIGHLIGHT_LIMIT : Limits.TAG_LIMIT)) { this.app.notifier.notify("Invalid column options.", true); return; }
      let index = 1;
      while (list.some(option => option.name.trim().toLocaleLowerCase() === `${this.t("Option")} ${index}`.toLocaleLowerCase())) index++;
      const color = this.app.optionLists.highlightPalette.find(color => !list.some(option => option.color.toLowerCase() === color)) || '#a392ff';
      list.push({ id: this.uid(), name: `${this.t("Option")} ${index}`, color, ...(tab.id === 'statuses' ? { highlight: false } : {}) });
      this.app.optionLists.drawOptionLists(); this.app.settings.refreshSettingsState();
    });
    this.app.optionLists.drawOptionLists(); this.app.settings.showSettingsTab(this.state.settingsTab); this.app.settings.refreshSettingsState();
  }
  wireCustomColumns() {
    const syncColumns = () => {
      this.state.settingsDraft.taskColumns = this.configuredColumns('tasks', this.state.settingsDraft);
      this.state.settingsDraft.issueColumns = this.configuredColumns('issues', this.state.settingsDraft);
      this.state.settingsDraft.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(this.state.settingsDraft);
      this.app.taskLayout.drawTaskLayoutSettings();
      this.$('#hours-per-day').closest('.field').hidden = !['tasks', 'issues'].some(kind => ColumnSchema.schemaOf(this.state.settingsDraft, kind).some(field => field.type === 'effort'));
      this.app.columnEditor.columnEditor(this.$('#columns-editor'), this.state.settingsDraft.taskColumns, 'tasks', this.state.settingsDraft);
      this.app.columnEditor.columnEditor(this.$('#issue-columns-editor'), this.state.settingsDraft.issueColumns, 'issues', this.state.settingsDraft);
      this.#refreshChoiceSettings();
      this.app.settings.refreshSettingsState();
    };
    const draws = [];
    this.app.formDesigner.redrawColumnDefinitions = () => draws.forEach(draw => draw());
    for (const kind of ['tasks', 'issues']) {
      const key = kind === 'tasks' ? 'taskFields' : 'issueFields', columnKey = kind === 'tasks' ? 'taskColumns' : 'issueColumns', container = this.$(`#custom-definitions-${kind}`);
      const draw = () => {
        const schema = ColumnSchema.schemaOf(this.state.settingsDraft, kind);
        // Only the task editor has a configurable form: a required task field left off it is not checked.
        const placed = kind === 'tasks' ? new Set(TaskLayout.normalizeTaskEditorLayout(this.state.settingsDraft).columns.flatMap(column => column.sections.flatMap(section => section.fields.map(field => field.id)))) : null;
        const requiredControl = field => {
          const allowed = RequiredFields.canRequire(this.state.settingsDraft, kind, field.id), on = allowed && RequiredFields.isRequired(this.state.settingsDraft, kind, field.id);
          return `<label class="toggle-label required-toggle" ${allowed ? '' : `title="${this.esc(this.t("This field cannot be required."))}"`}><input type="checkbox" data-field-required ${on ? 'checked' : ''} ${allowed ? '' : 'disabled'}> ${this.esc(this.t("Required"))}</label>${on && placed && !placed.has(field.id) ? `<small class="required-off">${this.ico('warning')}${this.esc(this.t("not on the form: not checked"))}</small>` : ''}`;
        };
        container.innerHTML = this.configuredColumns(kind, this.state.settingsDraft).map(column => {
          const field = schema.find(field => field.id === column.id), name = field.builtin ? this.t(field.name) : field.name;
          return `<article class="custom-definition" data-field-id="${field.id}" ${field.builtin ? 'data-builtin' : ''}>${this.app.sortable.dragHandle(name)}<div class="custom-definition-fields">${field.builtin ? `<strong>${this.esc(name)}</strong>` : `<label class="field">${this.esc(this.t("Column name"))}<input data-field-name maxlength="60" value="${this.esc(name)}"></label>`}<span class="muted">${this.esc(this.t(this.app.columns.fieldTypeNames[field.type]))}${field.type === 'child' ? ' · ' + this.esc(this.app.transfer.fillText("Filled from {0}", schema.find(item => item.id === field.source)?.name || '—')) : ''}</span>${requiredControl(field)}${['select', 'multiselect'].includes(field.type) ? `<button type="button" class="button small" data-goto-settings-tab="${field.catalog || `choice-${kind}-${field.id}`}">${this.esc(this.t("Manage labels and colors"))}</button>` : ''}${field.type === 'platform' ? `<label class="field platform-template">${this.esc(this.t("Link template"))}<input data-field-template maxlength="2000" spellcheck="false" autocomplete="off" inputmode="url" placeholder="https://tickets.example.com/browse/{code}" value="${this.esc(field.template || '')}"><small>${this.esc(this.t("Put {code} where the code entered in the task goes. Leave empty to enter full links."))}</small><span class="portal-preview" data-template-preview aria-live="polite"></span></label>` : ''}</div><button type="button" class="button small danger" data-delete-field>${this.esc(this.t("Delete"))}</button></article>`;
        }).join('');
        container.querySelectorAll('[data-field-id]').forEach(row => {
          const field = schema.find(field => field.id === row.dataset.fieldId), input = row.querySelector('[data-field-name]');
          if (input) input.oninput = event => { field.name = event.target.value; syncColumns(); };
          const template = row.querySelector('[data-field-template]'), preview = row.querySelector('[data-template-preview]');
          const showTemplate = () => {
            const result = this.#platformTemplatePreview(template.value);
            preview.classList.toggle('invalid', Boolean(result.invalid));
            if (result.html) preview.innerHTML = result.html; else preview.textContent = result.text;
          };
          if (template) { template.oninput = () => { field.template = PlatformLinks.normalizeUrl(template.value); showTemplate(); this.app.settings.refreshSettingsState(); }; showTemplate(); }
          row.querySelector('[data-field-required]').onchange = event => {
            this.app.taskLayout.setRequiredColumn(this.state.settingsDraft, kind, field.id, event.target.checked);
            draw(); this.app.taskLayout.drawTaskLayoutSettings(); this.app.settings.refreshSettingsState();
            container.querySelector(`[data-field-id="${CSS.escape(field.id)}"] [data-field-required]`)?.focus();
          };
          const paired = ColumnSchema.REFERENCE_TYPES.includes(field.type) && schema.find(item => item.id !== field.id && (item.source === field.id || field.source === item.id));
          row.querySelector('[data-delete-field]').onclick = () => this.app.modal.confirmDialog("Delete this column?", this.t("Column values will be deleted when settings are saved.") + ` (${field.builtin ? this.t(field.name) : field.name})` + (paired ? ' ' + this.app.transfer.fillText("The linked column {0} is deleted too.", paired.name) : ''), async () => {
            ColumnCleanup.removeColumn(this.state.settingsDraft, kind, field.id);
            draw(); syncColumns();
          });
        });
        this.app.sortable.sortable(container, '.custom-definition', (from, to) => {
          this.state.settingsDraft[columnKey].splice(to, 0, ...this.state.settingsDraft[columnKey].splice(from, 1));
          this.state.settingsDraft[key].sort((a, b) => this.state.settingsDraft[columnKey].findIndex(column => column.id === a.id) - this.state.settingsDraft[columnKey].findIndex(column => column.id === b.id));
          draw(); syncColumns();
        });
        const restore = this.$(`#restore-columns-${kind}`);
        restore.innerHTML = ColumnSchema.BUILTIN_FIELDS[kind].filter(field => !this.hasColumn(field.id, kind, this.state.settingsDraft)).map(field => `<button type="button" class="button small" data-restore-column="${field.id}">${this.ico('reset')}${this.esc(this.t("Restore column") + ': ' + this.t(field.name))}</button>`).join('');
        restore.querySelectorAll('[data-restore-column]').forEach(button => button.onclick = () => {
          const deletedKey = ColumnSchema.deletedKey(kind);
          this.state.settingsDraft[deletedKey] = this.state.settingsDraft[deletedKey].filter(id => id !== button.dataset.restoreColumn);
          syncColumns(); draw();
        });
      };
      const form = document.querySelector(`[data-add-field="${kind}"]`);
      form.onsubmit = this.app.notifier.action(event => {
        event.preventDefault();
        const fields = this.newCustomFields(form, this.state.settingsDraft[key]);
        ColumnValidator.validateFields([...this.state.settingsDraft[key], ...fields], kind);
        this.state.settingsDraft[key].push(...fields); form.reset(); form.querySelector('[data-child-name]')?.toggleAttribute('hidden', true); syncColumns(); draw();
      });
      form.elements.type.onchange = () => {
        const reference = form.elements.type.value === 'parent';
        form.querySelector('[data-child-name]')?.toggleAttribute('hidden', !reference);
        if (reference && !form.elements.name.value.trim()) form.elements.name.value = this.#freeColumnName(this.t("Predecessors"), this.state.settingsDraft[key]);
      };
      draws.push(draw);
      draw();
    }
    syncColumns();
  }
}
