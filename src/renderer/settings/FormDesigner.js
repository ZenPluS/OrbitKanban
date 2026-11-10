// Visual designer of the task form.
import { Component } from '../core/Component.js';
import { ColumnSchema, RequiredFields, TaskLayout } from '../shared.js';

export class FormDesigner extends Component {
  redrawColumnDefinitions = () => {};
  #DESIGNER_TYPE_ICONS = { text: '<b>Abc</b>', richtext: '<b>¶</b>', number: '<b>123</b>', date: 'calendar', select: 'chevron-down', multiselect: 'tag', url: 'external', platform: 'link', effort: 'clock', boolean: 'check', parent: 'arrow-up', child: 'arrow-down', matches: 'link', attachments: 'paperclip' };
  #designerTypeIcon = type => { const icon = this.#DESIGNER_TYPE_ICONS[type] || 'list'; return icon.startsWith('<') ? icon : this.ico(icon); };
  #designerTypeName = field => this.t(field.id === 'hidden' ? "Checkbox" : field.id === 'matches' ? "Automatic" : this.app.columns.fieldTypeNames[field.type] || field.type);
  // Inert copy of the editor controls: same classes as the real form, so sizes in the designer match the task editor.
  #designerControl(field, settings, required) {
    const mark = required ? '<span class="required-mark" aria-hidden="true">*</span>' : '';
    const name = `<span>${this.esc(this.app.taskLayout.layoutFieldName(field))}${mark}</span>`;
    if (field.type === 'richtext') return `<div class="field"><span class="field-label">${name}</span><div class="rich-editor"><div class="rich-toolbar"><button type="button"><b>B</b></button><button type="button"><i>I</i></button><button type="button"><u>U</u></button><button type="button">• List</button><button type="button">1. List</button><button type="button">Tx</button></div><div class="editable"></div></div></div>`;
    if (field.type === 'attachments') return `<section class="task-attachment-section designer-attachment-preview"><h3 class="task-form-section-title">${this.esc(this.app.taskLayout.layoutFieldName(field))}</h3><div class="attachment-dropzone"><span class="attachment-drop-icon">${this.ico('transfer')}</span><strong>${this.esc(this.t("Drop files here or choose files"))}</strong><small>${this.esc(this.t("TXT, JSON, PDF, DOCX, PPTX, CSV, HTML, JS, SQL and XLSX · up to 100 MB per file"))}</small></div><div class="attachment-files"><p class="muted">${this.esc(this.t("No attachments yet. Drop files here or choose them from your device."))}</p></div></section>`;
    if (field.builtin && field.id === 'effort') return `<div class="form-grid task-effort-fields"><div class="field"><span class="task-effort-label"><span>${this.esc(this.t("Effort in days"))}${mark}</span> <small>${this.esc(this.app.transfer.fillText("1 day = {0} hours", settings.hoursPerDay))}</small></span><input type="number" value="0" tabindex="-1"></div><div class="field">${this.esc(this.t("Additional effort in hours"))}<input type="number" value="0" tabindex="-1"></div></div>`;
    if (field.id === 'hidden') return `<div class="field checkbox-field"><input type="checkbox" tabindex="-1"> ${this.esc(this.t("Hide from the task list only (still visible in milestones and kanban)"))}</div>`;
    if (field.id === 'matches') return `<div class="auto-match"><span>${this.ico('link')}${this.esc(this.t("Automatic link by portal code"))}</span><div>Incident: <strong>—</strong> Problem: <strong>—</strong></div></div>`;
    let control;
    if (field.type === 'child') return `<div class="field reference-field"><span class="field-label">${name}</span><div class="reference-chips"><span class="muted">${this.esc(this.t("No successors yet"))}</span></div></div>`;
    if (field.type === 'multiselect' || field.type === 'parent') control = `<button type="button" class="task-tags-button" tabindex="-1"><span class="tag-chips"><span class="muted">+ ${this.esc(field.type === 'parent' ? this.t("Choose predecessors") : this.app.taskLayout.layoutFieldName(field))}</span></span>${this.ico('chevron-down')}</button>`;
    else if (['select', 'boolean'].includes(field.type)) control = `<select tabindex="-1"><option>${this.esc(field.builtin ? this.t("Unassigned") : '—')}</option></select>`;
    else control = `<input tabindex="-1" type="${field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text'}">`;
    return `<div class="field">${name}${control}${field.type === 'effort' ? `<small>${this.esc(this.t("Value in hours"))}</small>` : field.type === 'platform' ? `<small>${this.esc(this.t(field.template ? "Enter the code on this platform or a full link." : "Enter the full web address."))}</small>` : ''}</div>`;
  }
  #designerBackdrop() {
    const tasks = this.app.taskList.sortedRows(this.app.presenter.visibleTasks()).slice(0, 16);
    const rows = tasks.length ? tasks.map(task => { const status = this.statusOf(task); return `<div class="designer-ghost-row"><b>${this.esc(task.code || '—')}</b><span>${this.esc(this.app.richText.plain(task.description || '').slice(0, 90))}</span>${this.app.presenter.pill(status.name, status.color)}<span>${this.esc(this.app.presenter.formatDate(task.releaseDate))}</span></div>`; }).join('')
      : Array.from({ length: 10 }, () => '<div class="designer-ghost-row"><i></i><i></i><i></i><i></i></div>').join('');
    return `<div class="designer-ghost-app"><div class="designer-ghost-rail">${this.icons.map(icon => `<span>${icon}</span>`).join('')}</div><div class="designer-ghost-main"><div class="designer-ghost-heading"><strong>${this.esc(this.app.sections.nameOf('tasks'))}</strong><span class="button primary">${this.ico('plus')}</span></div><div class="designer-ghost-table">${rows}</div></div></div>`;
  }
  #LAYOUT_PRESETS = [[100], [50, 50], [40, 60], [60, 40], [33, 67], [67, 33], [33, 34, 33], [25, 50, 25]];
  openFormDesigner() {
    const self = this;
    if (!this.state.settingsDraft || document.getElementById('form-designer')) return;
    const organizationId = this.state.activeOrganizationId, fields = TaskLayout.taskEditorFields(this.state.settingsDraft), byId = new Map(fields.map(field => [field.id, field]));
    const state = { layout: structuredClone(TaskLayout.normalizeTaskEditorLayout(this.state.settingsDraft)), required: RequiredFields.requiredOf(this.state.settingsDraft, 'tasks') };
    const initial = JSON.stringify(state), undoStack = [], redoStack = [];
    let selection = { type: 'form' }, lastKey = '', scale = 1, frozen = false, approved = false, drag = null, paletteQuery = '', unusedOnly = false;
    const dialog = document.createElement('dialog');
    dialog.id = 'form-designer';
    dialog.className = 'form-designer';
    dialog.setAttribute('aria-labelledby', 'form-designer-title');
    dialog.innerHTML = `<header class="designer-bar"><div class="designer-title"><span class="eyebrow">${this.esc(this.t("Form designer"))} · ${this.esc(this.state.organizations.find(o => o.id === organizationId)?.name || '')}</span><h2 id="form-designer-title">${this.esc(this.t("Task editor layout"))}</h2></div><div class="designer-tools"><button type="button" class="icon-button" id="designer-undo" title="${this.esc(this.t("Undo (Ctrl+Z)"))}" aria-label="${this.esc(this.t("Undo (Ctrl+Z)"))}">${this.ico('undo')}</button><button type="button" class="icon-button" id="designer-redo" title="${this.esc(this.t("Redo (Ctrl+Y)"))}" aria-label="${this.esc(this.t("Redo (Ctrl+Y)"))}">${this.ico('redo')}</button><button type="button" class="button" id="designer-reset">${this.ico('reset')}${this.esc(this.t("Restore default layout"))}</button><span class="designer-divider" aria-hidden="true"></span><button type="button" class="button" id="designer-cancel">${this.esc(this.t("Cancel"))}</button><button type="button" class="button primary" id="designer-save">${this.ico('check')}${this.esc(this.t("Save"))}</button></div></header>
    <div class="designer-body"><aside class="designer-palette" aria-labelledby="designer-fields-title"><div class="designer-palette-head"><h3 id="designer-fields-title">${this.esc(this.t("Fields"))}</h3><span class="tiny-count" id="designer-field-count"></span></div><label class="designer-search"><span aria-hidden="true">${this.ico('search')}</span><input type="search" id="designer-search" placeholder="${this.esc(this.t("Search fields…"))}" aria-label="${this.esc(this.t("Search fields…"))}" autocomplete="off" spellcheck="false"></label><label class="toggle-label"><input type="checkbox" id="designer-unused"> ${this.esc(this.t("Only fields not on the form"))}</label><ul class="designer-field-list" id="designer-fields" aria-labelledby="designer-fields-title"></ul><h3>${this.esc(this.t("Components"))}</h3><div class="designer-components">${[1, 2, 3, 4].map(count => `<button type="button" class="designer-component" data-add-section="${count}"><span class="designer-component-icon" aria-hidden="true">${'<i></i>'.repeat(count)}</span>${this.esc(this.app.transfer.fillText(count === 1 ? "Section with 1 column" : "Section with {0} columns", count))}</button>`).join('')}</div><p class="muted designer-hint">${this.esc(this.t("Drag fields and sections onto the form. With the keyboard: Enter adds the field to the selected section, the arrow keys move the selected item and Delete removes it."))}</p></aside>
    <div class="designer-canvas"><div class="designer-ghost" aria-hidden="true" inert>${this.#designerBackdrop()}</div><div class="designer-stage" id="designer-stage"><div class="designer-frame" id="designer-frame"><div class="task-form designer-modal" id="designer-modal"><div class="modal-heading" inert><div><div class="eyebrow">TASK</div><h2>${this.esc(this.t("Edit task"))}</h2></div><span class="icon-button">${this.ico('close')}</span></div><div class="task-edit-layout" id="designer-layout" role="group" aria-label="${this.esc(this.t("Form preview"))}"></div><div class="modal-actions" inert><span class="button danger">${this.esc(this.t("Delete"))}</span><span class="spacer"></span><span class="button">${this.esc(this.t("Cancel"))}</span><span class="button primary">${this.esc(this.t("Save task"))}</span></div></div>
      <div class="designer-grip designer-grip-e" data-grip="e" tabindex="0" role="separator" aria-orientation="vertical" aria-label="${this.esc(this.t("Window width"))}"></div><div class="designer-grip designer-grip-s" data-grip="s" tabindex="0" role="separator" aria-orientation="horizontal" aria-label="${this.esc(this.t("Window height"))}"></div><div class="designer-grip designer-grip-se" data-grip="se" aria-hidden="true"></div></div><p class="designer-size" id="designer-size" aria-live="polite"></p></div></div>
    <aside class="designer-props" id="designer-props" aria-label="${this.esc(this.t("Properties"))}"></aside></div>`;
    document.body.append(dialog);
    const $d = selector => dialog.querySelector(selector), stage = $d('#designer-stage'), frame = $d('#designer-frame'), modal = $d('#designer-modal'), body = $d('#designer-layout');
    const allSections = () => state.layout.columns.flatMap((column, columnIndex) => column.sections.map((section, index) => ({ section, column, columnIndex, index })));
    const findSection = id => allSections().find(entry => entry.section.id === id);
    const locate = id => { for (const entry of allSections()) { const fieldIndex = entry.section.fields.findIndex(field => field.id === id); if (fieldIndex >= 0) return { ...entry, fieldIndex }; } return null; };
    const placedIds = () => new Set(allSections().flatMap(entry => entry.section.fields.map(field => field.id)));
    const required = id => state.required.includes(id);
    const announce = message => this.app.sortable.announceOrder(body, message);
    const snapshot = () => JSON.stringify(state);
    const dirty = () => snapshot() !== initial;
    function mutate(change, key = '', options = {}) {
      const before = snapshot();
      change();
      if (snapshot() === before) return false;
      if (!key || key !== lastKey) { undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); }
      redoStack.length = 0;
      lastKey = key;
      draw(options);
      return true;
    }
    function restore(from, to) {
      if (!from.length) return;
      to.push(snapshot());
      const saved = JSON.parse(from.pop());
      state.layout = saved.layout; state.required = saved.required; lastKey = '';
      if (selection.type === 'section' && !findSection(selection.id)) selection = { type: 'form' };
      draw();
    }
    const unplace = id => { if (!state.layout.unplaced.includes(id)) state.layout.unplaced.push(id); };
    function detachField(id) {
      const where = locate(id);
      if (where) return where.section.fields.splice(where.fieldIndex, 1)[0];
      state.layout.unplaced = state.layout.unplaced.filter(fieldId => fieldId !== id);
      return { id, span: byId.get(id).span };
    }
    function placeField(id, sectionId, index) {
      const target = findSection(sectionId)?.section;
      if (!target || !byId.has(id)) return;
      const field = detachField(id);
      target.fields.splice(Math.max(0, Math.min(index, target.fields.length)), 0, { id, span: Math.min(field.span, target.columns) });
    }
    function removeField(id) {
      if (!locate(id)) return;
      detachField(id); unplace(id);
    }
    function newSection(columnCount) {
      if (allSections().length >= TaskLayout.TASK_LAYOUT.sections) throw new Error(self.app.transfer.fillText("A form can have up to {0} sections.", TaskLayout.TASK_LAYOUT.sections));
      let id;
      do id = `section-${self.uid().slice(0, 8)}`; while (findSection(id));
      return { id, name: self.t("New section").slice(0, TaskLayout.TASK_LAYOUT.sectionName), showName: true, columns: columnCount, fields: [] };
    }
    function insertSection(section, columnIndex, index) {
      const column = state.layout.columns[Math.min(columnIndex, state.layout.columns.length - 1)];
      column.sections.splice(Math.max(0, Math.min(index, column.sections.length)), 0, section);
    }
    function moveSection(id, columnIndex, index) {
      const where = findSection(id);
      if (!where) return;
      where.column.sections.splice(where.index, 1);
      insertSection(where.section, columnIndex, index);
    }
    function deleteSection(id) {
      const where = findSection(id);
      if (!where) return;
      where.section.fields.forEach(field => unplace(field.id));
      where.column.sections.splice(where.index, 1);
    }
    function setLayoutColumns(widths) {
      const columns = state.layout.columns, kept = widths.map((width, index) => ({ width, sections: columns[index]?.sections || [] }));
      kept.at(-1).sections.push(...columns.slice(widths.length).flatMap(column => column.sections));
      state.layout.columns = kept;
    }
    // Target section for keyboard and click additions: the selection, else the first section, else a new one.
    function targetSection() {
      if (selection.type === 'section' && findSection(selection.id)) return selection.id;
      if (selection.type === 'field' && locate(selection.id)) return locate(selection.id).section.id;
      const first = allSections()[0];
      if (first) return first.section.id;
      const section = newSection(2);
      insertSection(section, 0, 0);
      return section.id;
    }
    function addFieldToForm(id) {
      let sectionId;
      mutate(() => { sectionId = targetSection(); placeField(id, sectionId, findSection(sectionId).section.fields.length); });
      selection = { type: 'field', id };
      draw();
      focusCanvas('field', id);
      announce(self.app.transfer.fillText("“{0}” added to {1}.", self.app.taskLayout.layoutFieldName(byId.get(id)), self.app.taskLayout.layoutSectionLabel(findSection(sectionId).section, allSections().findIndex(entry => entry.section.id === sectionId))));
    }
    function addSection(columnCount, columnIndex, index) {
      const section = newSection(columnCount);
      mutate(() => {
        if (columnIndex === undefined) {
          const anchor = selection.type === 'section' ? findSection(selection.id) : selection.type === 'field' ? locate(selection.id) : null;
          if (anchor) { columnIndex = anchor.columnIndex; index = anchor.index + 1; }
          else { columnIndex = state.layout.columns.length - 1; index = state.layout.columns.at(-1).sections.length; }
        }
        insertSection(section, columnIndex, index);
      });
      selection = { type: 'section', id: section.id };
      draw();
      focusCanvas('section', section.id);
      announce(self.t("Section added."));
    }
    function moveFieldBy(id, step) {
      const where = locate(id);
      if (!where) return;
      const entries = allSections(), position = entries.findIndex(entry => entry.section.id === where.section.id);
      mutate(() => {
        const next = where.fieldIndex + step;
        if (next >= 0 && next < where.section.fields.length) where.section.fields.splice(next, 0, ...where.section.fields.splice(where.fieldIndex, 1));
        else if (entries[position + step]) { const target = entries[position + step].section; placeField(id, target.id, step < 0 ? target.fields.length : 0); }
      });
      focusCanvas('field', id);
      const now = locate(id);
      announce(self.app.transfer.fillText("Position {0} of {1} in {2}.", now.fieldIndex + 1, now.section.fields.length, self.app.taskLayout.layoutSectionLabel(now.section, allSections().findIndex(entry => entry.section.id === now.section.id))));
    }
    function moveSectionBy(id, step, across = false) {
      const where = findSection(id);
      if (!where) return;
      mutate(() => {
        if (across) { const columnIndex = where.columnIndex + step; if (columnIndex >= 0 && columnIndex < state.layout.columns.length) moveSection(id, columnIndex, state.layout.columns[columnIndex].sections.length); }
        else if (where.index + step >= 0 && where.index + step < where.column.sections.length) moveSection(id, where.columnIndex, where.index + step);
      });
      focusCanvas('section', id);
      const now = findSection(id);
      announce(self.app.transfer.fillText("Column {0}, position {1} of {2}.", now.columnIndex + 1, now.index + 1, now.column.sections.length));
    }
    function toggleRequired(id, value) {
      const chosen = new Set(state.required);
      if (value) chosen.add(id); else chosen.delete(id);
      state.required = ColumnSchema.schemaOf(self.state.settingsDraft, 'tasks').map(field => field.id).filter(fieldId => chosen.has(fieldId));
    }
    // ---- Drawing ----
    function designerItem(field) {
      const item = document.createElement('div');
      item.className = 'designer-item';
      item.dataset.designerField = field.id;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', self.app.taskLayout.layoutFieldName(field) + (required(field.id) ? ` (${self.t("Required")})` : ''));
      item.innerHTML = `<div class="designer-item-body" inert>${self.#designerControl(field, self.state.settingsDraft, required(field.id))}</div>`;
      return item;
    }
    function decorateSection(element, section) {
      const entries = allSections(), index = entries.findIndex(entry => entry.section.id === section.id);
      element.classList.add('designer-section');
      element.dataset.designerSection = section.id;
      element.tabIndex = 0;
      element.setAttribute('aria-label', `${self.t("Section")}: ${self.app.taskLayout.layoutSectionLabel(section, index)}`);
      const tab = document.createElement('span');
      tab.className = 'designer-section-tab';
      tab.innerHTML = `<span class="designer-grab" aria-hidden="true"></span>${self.esc(self.app.taskLayout.layoutSectionLabel(section, index))} · ${self.esc(self.app.transfer.fillText(section.columns === 1 ? "1 column" : "{0} columns", section.columns))}`;
      element.prepend(tab);
      if (!section.fields.length) element.querySelector('.task-form-grid').innerHTML = `<p class="designer-empty-section">${self.esc(self.t("Drag fields here"))}</p>`;
    }
    function drawCanvas() {
      const focused = document.activeElement, focusField = focused?.dataset?.designerField, focusSection = focused?.dataset?.designerSection;
      modal.style.setProperty('--task-form-width', `${state.layout.width}px`);
      modal.style.setProperty('--task-form-height', `${state.layout.height || 720}px`);
      modal.classList.toggle('fixed-height', state.layout.height > 0);
      const items = new Map();
      const columns = self.app.taskForm.buildTaskLayoutColumns(state.layout, self.state.settingsDraft, id => {
        if (!byId.has(id)) return null;
        if (!items.has(id)) items.set(id, designerItem(byId.get(id)));
        return items.get(id);
      }, { keepEmpty: true, decorate: decorateSection });
      body.replaceChildren(...columns.map(column => column.element));
      body.style.gridTemplateColumns = self.app.taskForm.taskLayoutTemplate(columns);
      for (const column of body.querySelectorAll('.task-form-column')) {
        if (!column.children.length) column.innerHTML = `<p class="designer-empty-column" data-empty-column="${column.dataset.layoutColumn}">${self.esc(self.t("Drag a field or a section here"))}</p>`;
      }
      markSelection();
      if (focusField) focusCanvas('field', focusField);
      else if (focusSection) focusCanvas('section', focusSection);
      fit();
    }
    function markSelection() {
      dialog.querySelectorAll('.is-selected').forEach(element => element.classList.remove('is-selected'));
      dialog.querySelectorAll('[aria-pressed]').forEach(element => element.matches('.designer-item, .designer-palette-field') && element.setAttribute('aria-pressed', 'false'));
      const selector = selection.type === 'field' ? `[data-designer-field="${CSS.escape(selection.id)}"], [data-palette-field="${CSS.escape(selection.id)}"]` : selection.type === 'section' ? `[data-designer-section="${CSS.escape(selection.id)}"]` : '#designer-modal';
      dialog.querySelectorAll(selector).forEach(element => { element.classList.add('is-selected'); if (element.matches('.designer-item, .designer-palette-field')) element.setAttribute('aria-pressed', 'true'); });
    }
    function focusCanvas(type, id) {
      const element = body.querySelector(type === 'field' ? `[data-designer-field="${CSS.escape(id)}"]` : `[data-designer-section="${CSS.escape(id)}"]`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function fit() {
      const width = state.layout.width + 2, height = modal.offsetHeight;
      if (!frozen) {
        const room = { width: stage.clientWidth - 56, height: stage.clientHeight - 90 };
        scale = Math.max(0.3, Math.min(1, room.width / width, room.height / Math.max(height, 1)));
      }
      modal.style.transform = `scale(${scale})`;
      frame.style.width = `${Math.round(width * scale)}px`;
      frame.style.height = `${Math.round(height * scale)}px`;
      // The real task window is capped at 94% of the app window and scrolls beyond that.
      const limited = height > Math.floor(window.innerHeight * 0.94);
      $d('#designer-size').textContent = `${state.layout.width} × ${state.layout.height ? `${state.layout.height}` : self.t("automatic height")} px · ${Math.round(scale * 100)}%` + (limited ? ` · ${self.t("limited to the window height")}` : '');
    }
    function drawPalette() {
      const placed = placedIds(), needle = paletteQuery.trim().toLocaleLowerCase();
      $d('#designer-field-count').textContent = `${placed.size}/${fields.length}`;
      const shown = fields.filter(field => (!unusedOnly || !placed.has(field.id)) && (!needle || self.app.taskLayout.layoutFieldName(field).toLocaleLowerCase().includes(needle)));
      $d('#designer-fields').innerHTML = shown.map(field => {
        const on = placed.has(field.id), warn = required(field.id) && !on;
        return `<li><button type="button" class="designer-palette-field ${on ? 'is-placed' : ''}" data-palette-field="${self.esc(field.id)}" aria-pressed="false" title="${self.esc(on ? self.t("On the form: click to select it") : self.t("Drag onto the form or press Enter to add it"))}"><span class="designer-type" title="${self.esc(self.#designerTypeName(field))}">${self.#designerTypeIcon(field.type)}</span><span class="designer-palette-name">${self.esc(self.app.taskLayout.layoutFieldName(field))}${required(field.id) ? '<i class="required-mark" aria-hidden="true">*</i>' : ''}<small>${self.esc(self.#designerTypeName(field))}${required(field.id) ? ` · ${self.esc(self.t("Required"))}` : ''}</small></span><span class="designer-palette-state ${warn ? 'is-warning' : ''}" title="${self.esc(warn ? self.t("Required but not on the form: it will not be checked.") : '')}">${warn ? self.ico('warning') : on ? self.ico('check') : ''}<span class="sr-only">${self.esc(self.t(on ? "On the form" : "Not on the form"))}</span></span></button></li>`;
      }).join('') || `<li class="muted designer-palette-empty">${self.esc(self.t(needle ? "No results." : "All fields are on the form."))}</li>`;
      markSelection();
    }
    function drawProps() {
      const pane = $d('#designer-props'), entries = allSections();
      const sectionOptions = selected => entries.map((entry, index) => `<option value="${self.esc(entry.section.id)}" ${entry.section.id === selected ? 'selected' : ''}>${self.esc((state.layout.columns.length > 1 ? `${self.app.transfer.fillText("Column {0}", entry.columnIndex + 1)} › ` : '') + self.app.taskLayout.layoutSectionLabel(entry.section, index))}</option>`).join('');
      if (selection.type === 'field' && byId.has(selection.id)) {
        const field = byId.get(selection.id), where = locate(field.id), allowed = RequiredFields.canRequire(self.state.settingsDraft, 'tasks', field.id);
        pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${self.esc(self.t("Field properties"))}</span><h3>${self.esc(self.app.taskLayout.layoutFieldName(field))}</h3><span class="muted">${self.esc(self.#designerTypeName(field))}</span></div>
        <label class="field">${self.esc(self.t("Section"))}<select id="designer-field-section"><option value="">${self.esc(self.t("Not on the form"))}</option>${sectionOptions(where?.section.id)}</select></label>
        <label class="field">${self.esc(self.t("Width"))}<select id="designer-field-span" ${where ? '' : 'disabled'}>${Array.from({ length: where?.section.columns || 1 }, (_, index) => `<option value="${index + 1}" ${where && where.section.fields[where.fieldIndex].span === index + 1 ? 'selected' : ''}>${self.esc(self.app.transfer.fillText(index ? "{0} columns" : "1 column", index + 1))}</option>`).join('')}</select></label>
        <label class="checkbox-field designer-check"><input type="checkbox" id="designer-field-required" ${required(field.id) ? 'checked' : ''} ${allowed ? '' : 'disabled'}> ${self.esc(self.t("Required"))}</label>
        <p class="muted designer-note">${self.esc(self.t(!allowed ? "This field cannot be required." : required(field.id) && !where ? "Required but not on the form: it will not be checked." : "Required fields must be filled in to save the task."))}</p>
        ${where ? `<div class="designer-prop-actions"><button type="button" class="button small" id="designer-field-up">${self.ico('arrow-up')}${self.esc(self.t("Move up"))}</button><button type="button" class="button small" id="designer-field-down">${self.ico('arrow-down')}${self.esc(self.t("Move down"))}</button></div><button type="button" class="button danger" id="designer-field-remove">${self.ico('minus')}${self.esc(self.t("Remove from the form"))}</button>` : `<button type="button" class="button primary" id="designer-field-add">${self.ico('plus')}${self.esc(self.t("Add to the form"))}</button>`}`;
        $d('#designer-field-section').onchange = event => mutate(() => {
          if (!event.target.value) removeField(field.id);
          else placeField(field.id, event.target.value, findSection(event.target.value).section.fields.length);
        });
        $d('#designer-field-span').onchange = event => mutate(() => { locate(field.id).section.fields[locate(field.id).fieldIndex].span = Number(event.target.value); });
        $d('#designer-field-required').onchange = event => mutate(() => toggleRequired(field.id, event.target.checked));
        if (where) {
          $d('#designer-field-up').onclick = () => moveFieldBy(field.id, -1);
          $d('#designer-field-down').onclick = () => moveFieldBy(field.id, 1);
          $d('#designer-field-remove').onclick = () => { mutate(() => removeField(field.id)); announce(self.app.transfer.fillText("“{0}” removed from the form.", self.app.taskLayout.layoutFieldName(field))); };
        } else $d('#designer-field-add').onclick = () => addFieldToForm(field.id);
        return;
      }
      if (selection.type === 'section' && findSection(selection.id)) {
        const where = findSection(selection.id), section = where.section, index = entries.findIndex(entry => entry.section.id === section.id);
        pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${self.esc(self.t("Section properties"))}</span><h3>${self.esc(self.app.taskLayout.layoutSectionLabel(section, index))}</h3><span class="muted">${self.esc(self.app.transfer.fillText(section.fields.length === 1 ? "1 field" : "{0} fields", section.fields.length))}</span></div>
        <label class="field">${self.esc(self.t("Section name"))}<input id="designer-section-name" maxlength="${TaskLayout.TASK_LAYOUT.sectionName}" value="${self.esc(section.name)}"></label>
        <label class="checkbox-field designer-check"><input type="checkbox" id="designer-section-show" ${section.showName ? 'checked' : ''}> ${self.esc(self.t("Show the name on the form"))}</label>
        <label class="field">${self.esc(self.t("Columns"))}<select id="designer-section-columns">${[1, 2, 3, 4].map(count => `<option value="${count}" ${section.columns === count ? 'selected' : ''}>${count}</option>`).join('')}</select></label>
        ${state.layout.columns.length > 1 ? `<label class="field">${self.esc(self.t("Layout column"))}<select id="designer-section-column">${state.layout.columns.map((_, columnIndex) => `<option value="${columnIndex}" ${columnIndex === where.columnIndex ? 'selected' : ''}>${self.esc(self.app.transfer.fillText("Column {0}", columnIndex + 1))}</option>`).join('')}</select></label>` : ''}
        <div class="designer-prop-actions"><button type="button" class="button small" id="designer-section-up" ${where.index ? '' : 'disabled'}>${self.ico('arrow-up')}${self.esc(self.t("Move up"))}</button><button type="button" class="button small" id="designer-section-down" ${where.index < where.column.sections.length - 1 ? '' : 'disabled'}>${self.ico('arrow-down')}${self.esc(self.t("Move down"))}</button></div>
        <button type="button" class="button danger" id="designer-section-delete">${self.ico('minus')}${self.esc(self.t("Delete section"))}</button><p class="muted designer-note">${self.esc(self.t("The fields of a deleted section go back to the field list."))}</p>`;
        $d('#designer-section-name').oninput = event => mutate(() => { section.name = event.target.value.slice(0, TaskLayout.TASK_LAYOUT.sectionName); }, `name:${section.id}`, { props: false });
        $d('#designer-section-show').onchange = event => mutate(() => { section.showName = event.target.checked; });
        $d('#designer-section-columns').onchange = event => mutate(() => { section.columns = Number(event.target.value); section.fields.forEach(field => { field.span = Math.min(field.span, section.columns); }); });
        if ($d('#designer-section-column')) $d('#designer-section-column').onchange = event => mutate(() => moveSection(section.id, Number(event.target.value), state.layout.columns[Number(event.target.value)].sections.length));
        $d('#designer-section-up').onclick = () => moveSectionBy(section.id, -1);
        $d('#designer-section-down').onclick = () => moveSectionBy(section.id, 1);
        $d('#designer-section-delete').onclick = () => { mutate(() => deleteSection(section.id)); selection = { type: 'form' }; draw(); announce(self.t("Section deleted.")); };
        return;
      }
      selection = { type: 'form' };
      const layout = state.layout, current = layout.columns.map(column => column.width).join('-');
      pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${self.esc(self.t("Form properties"))}</span><h3>${self.esc(self.t("Task window"))}</h3><span class="muted">${self.esc(self.t("Drag the edges of the window or enter its size."))}</span></div>
      <label class="field">${self.esc(self.t("Width (px)"))}<input type="number" id="designer-width" min="${TaskLayout.TASK_LAYOUT.width.min}" max="${TaskLayout.TASK_LAYOUT.width.max}" step="10" value="${layout.width}"></label>
      <label class="checkbox-field designer-check"><input type="checkbox" id="designer-auto-height" ${layout.height ? '' : 'checked'}> ${self.esc(self.t("Automatic height (fits the content)"))}</label>
      <label class="field">${self.esc(self.t("Height (px)"))}<input type="number" id="designer-height" min="${TaskLayout.TASK_LAYOUT.height.min}" max="${TaskLayout.TASK_LAYOUT.height.max}" step="10" value="${layout.height || Math.max(TaskLayout.TASK_LAYOUT.height.min, Math.round((modal.offsetHeight - 2) / 10) * 10)}" ${layout.height ? '' : 'disabled'}></label>
      <fieldset class="designer-presets"><legend>${self.esc(self.t("Layout columns"))}</legend>${self.#LAYOUT_PRESETS.map(widths => `<button type="button" class="designer-preset" data-preset="${widths.join('-')}" aria-pressed="${widths.join('-') === current}" title="${self.esc(widths.join(' : '))}" aria-label="${self.esc(self.app.transfer.fillText(widths.length === 1 ? "1 column" : "{0} columns", widths.length) + ' ' + widths.join(' : '))}">${widths.map(width => `<i style="flex:${width}"></i>`).join('')}</button>`).join('')}</fieldset>
      <div class="designer-column-widths">${layout.columns.map((column, index) => `<label class="field">${self.esc(self.app.transfer.fillText("Column {0}", index + 1))}<input type="number" data-column-width="${index}" min="${TaskLayout.TASK_LAYOUT.columnWidth.min}" max="${TaskLayout.TASK_LAYOUT.columnWidth.max}" step="1" value="${column.width}"></label>`).join('')}</div>
      <p class="muted designer-note">${self.esc(self.t("Column widths are proportional. On narrow windows the columns are stacked."))}</p>`;
      const number = (input, { min, max }) => { const value = Math.round(Number(input.value)); return Number.isFinite(value) && value >= min && value <= max ? value : null; };
      $d('#designer-width').oninput = event => { const value = number(event.target, TaskLayout.TASK_LAYOUT.width); if (value) mutate(() => { layout.width = value; }, 'width', { props: false }); };
      $d('#designer-height').oninput = event => { const value = number(event.target, TaskLayout.TASK_LAYOUT.height); if (value) mutate(() => { layout.height = value; }, 'height', { props: false }); };
      for (const id of ['#designer-width', '#designer-height']) $d(id).onchange = () => { lastKey = ''; drawProps(); };
      $d('#designer-auto-height').onchange = event => mutate(() => { layout.height = event.target.checked ? 0 : Number($d('#designer-height').value) || TaskLayout.TASK_LAYOUT.height.min; });
      dialog.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => mutate(() => setLayoutColumns(button.dataset.preset.split('-').map(Number))));
      dialog.querySelectorAll('[data-column-width]').forEach(input => {
        input.oninput = () => { const value = number(input, TaskLayout.TASK_LAYOUT.columnWidth); if (value) mutate(() => { layout.columns[Number(input.dataset.columnWidth)].width = value; }, `column:${input.dataset.columnWidth}`, { props: false }); };
        input.onchange = () => { lastKey = ''; drawProps(); };
      });
    }
    function draw({ props = true } = {}) {
      drawCanvas(); drawPalette();
      if (props) drawProps();
      $d('#designer-undo').disabled = !undoStack.length;
      $d('#designer-redo').disabled = !redoStack.length;
    }
    function select(type, id, { focus = false } = {}) {
      selection = type === 'form' ? { type } : { type, id };
      markSelection(); drawProps();
      if (focus && type !== 'form') focusCanvas(type, id);
    }
    // ---- Pointer: drag fields, sections and components; resize the window from its edges ----
    const indicator = document.createElement('div'), ghost = document.createElement('div');
    indicator.className = 'designer-drop-indicator'; ghost.className = 'designer-drag-ghost';
    indicator.hidden = ghost.hidden = true;
    dialog.append(indicator, ghost);
    function showIndicator(rect, horizontal) {
      if (!rect) { indicator.hidden = true; return; }
      indicator.hidden = false;
      indicator.classList.toggle('is-horizontal', horizontal);
      Object.assign(indicator.style, horizontal ? { left: `${rect.left}px`, top: `${rect.top - 2}px`, width: `${rect.width}px`, height: '4px' } : { left: `${rect.left - 2}px`, top: `${rect.top}px`, width: '4px', height: `${rect.height}px` });
    }
    function fieldTarget(x, y, id) {
      const element = document.elementFromPoint(x, y);
      if (!element || !dialog.contains(element)) return null;
      if (element.closest('.designer-palette')) return locate(id) ? { type: 'palette' } : null;
      const empty = element.closest('[data-empty-column]');
      if (empty) { const box = empty.getBoundingClientRect(); return { type: 'new-section', column: Number(empty.dataset.emptyColumn), rect: { left: box.left, top: box.top + box.height / 2, width: box.width }, horizontal: true }; }
      let section = element.closest('[data-designer-section]');
      if (!section) {
        const column = element.closest('.task-form-column');
        if (!column) return null;
        const sections = [...column.querySelectorAll(':scope > [data-designer-section]')];
        section = sections.find(item => y <= item.getBoundingClientRect().bottom) || sections.at(-1);
        if (!section) return null;
      }
      const items = [...section.querySelectorAll(':scope > .task-form-grid > .designer-item')].filter(item => item.dataset.designerField !== id);
      let index = items.findIndex(item => { const box = item.getBoundingClientRect(); return y < box.top || (y <= box.bottom && x < box.left + box.width / 2); });
      if (index < 0) index = items.length;
      let rect, horizontal = false;
      if (items[index]) { const box = items[index].getBoundingClientRect(); rect = { left: box.left - 5 * scale, top: box.top, height: box.height }; }
      else if (items.length) { const box = items.at(-1).getBoundingClientRect(); rect = { left: box.right + 5 * scale, top: box.top, height: box.height }; }
      else { const box = section.querySelector('.task-form-grid').getBoundingClientRect(); rect = { left: box.left, top: box.top + box.height / 2, width: box.width }; horizontal = true; }
      return { type: 'section', id: section.dataset.designerSection, index, rect, horizontal };
    }
    function sectionTarget(x, y, id) {
      const element = document.elementFromPoint(x, y), column = element && dialog.contains(element) && element.closest('.task-form-column');
      if (!column) return null;
      const sections = [...column.querySelectorAll(':scope > [data-designer-section]')].filter(item => item.dataset.designerSection !== id);
      let index = sections.findIndex(item => { const box = item.getBoundingClientRect(); return y < box.top + box.height / 2; });
      if (index < 0) index = sections.length;
      const columnBox = column.getBoundingClientRect(), gap = 9 * scale;
      const top = sections[index] ? sections[index].getBoundingClientRect().top - gap : sections.length ? sections.at(-1).getBoundingClientRect().bottom + gap : columnBox.top + 12;
      return { type: 'column', column: Number(column.dataset.layoutColumn), index, rect: { left: columnBox.left, top, width: columnBox.width }, horizontal: true };
    }
    function autoScroll() {
      if (!drag?.active) return;
      const box = stage.getBoundingClientRect(), edge = 48;
      const dy = drag.y < box.top + edge ? -12 : drag.y > box.bottom - edge ? 12 : 0, dx = drag.x < box.left + edge && drag.x > box.left ? -12 : drag.x > box.right - edge && drag.x < box.right ? 12 : 0;
      if (dx || dy) { stage.scrollBy(dx, dy); updateDrag(); }
      drag.frame = requestAnimationFrame(autoScroll);
    }
    function updateDrag() {
      ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 12}px)`;
      drag.target = drag.source.type === 'field' ? fieldTarget(drag.x, drag.y, drag.source.id) : sectionTarget(drag.x, drag.y, drag.source.id);
      dialog.classList.toggle('is-removing', drag.target?.type === 'palette');
      showIndicator(drag.target?.rect, drag.target?.horizontal);
    }
    function endDrag(apply) {
      const current = drag;
      drag = null;
      cancelAnimationFrame(current.frame);
      for (const [type, listener] of Object.entries(current.listeners)) window.removeEventListener(type, listener, true);
      indicator.hidden = ghost.hidden = true;
      dialog.classList.remove('is-dragging', 'is-removing');
      dialog.querySelectorAll('.is-drag-source').forEach(element => element.classList.remove('is-drag-source'));
      if (!current.active) { current.click?.(); return; }
      const { source, target } = current;
      if (!apply || !target) return;
      if (source.type === 'field') {
        const name = self.app.taskLayout.layoutFieldName(byId.get(source.id));
        if (target.type === 'palette') { mutate(() => removeField(source.id)); announce(self.app.transfer.fillText("“{0}” removed from the form.", name)); return; }
        if (target.type === 'new-section') {
          const section = newSection(byId.get(source.id).type === 'richtext' ? 1 : 2);
          mutate(() => { insertSection(section, target.column, 0); placeField(source.id, section.id, 0); });
        } else mutate(() => placeField(source.id, target.id, target.index));
        select('field', source.id, { focus: true });
        announce(self.app.transfer.fillText("“{0}” moved.", name));
        return;
      }
      if (source.type === 'new-section') { addSection(source.columns, target.column, target.index); return; }
      mutate(() => moveSection(source.id, target.column, target.index));
      select('section', source.id, { focus: true });
      announce(self.t("Section moved."));
    }
    function beginPointer(event, source, click) {
      if (drag || event.button !== 0 || !event.isPrimary) return;
      const listeners = {
        pointermove: move => {
          if (move.pointerId !== event.pointerId) return;
          drag.x = move.clientX; drag.y = move.clientY;
          if (!drag.active && Math.hypot(drag.x - event.clientX, drag.y - event.clientY) < 4) return;
          move.preventDefault();
          if (!drag.active) {
            drag.active = true;
            dialog.classList.add('is-dragging');
            source.element?.classList.add('is-drag-source');
            ghost.textContent = source.label;
            ghost.hidden = false;
            drag.frame = requestAnimationFrame(autoScroll);
          }
          updateDrag();
        },
        pointerup: up => { if (up.pointerId === event.pointerId) endDrag(true); },
        pointercancel: () => endDrag(false),
        keydown: key => { if (key.key === 'Escape' && drag?.active) { key.preventDefault(); key.stopPropagation(); endDrag(false); announce(self.t("Move cancelled.")); } }
      };
      drag = { source, click, listeners, active: false, x: event.clientX, y: event.clientY, frame: 0, target: null };
      for (const [type, listener] of Object.entries(listeners)) window.addEventListener(type, listener, true);
    }
    function beginResize(event, edge) {
      if (drag || event.button !== 0) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY, width: state.layout.width, height: state.layout.height || Math.round((modal.offsetHeight - 2) / 10) * 10 };
      const before = snapshot();
      frozen = true;
      dialog.classList.add('is-resizing');
      const clamp = (value, { min, max }) => Math.max(min, Math.min(max, Math.round(value / 10) * 10));
      const move = pointer => {
        if (edge.includes('e')) state.layout.width = clamp(start.width + 2 * (pointer.clientX - start.x) / scale, TaskLayout.TASK_LAYOUT.width);
        if (edge.includes('s')) state.layout.height = clamp(start.height + (pointer.clientY - start.y) / scale, TaskLayout.TASK_LAYOUT.height);
        drawCanvas();
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        frozen = false;
        dialog.classList.remove('is-resizing');
        if (snapshot() !== before) { undoStack.push(before); redoStack.length = 0; lastKey = ''; }
        selection = { type: 'form' };
        draw();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    }
    dialog.addEventListener('pointerdown', event => {
      const grip = event.target.closest('[data-grip]');
      if (grip) { beginResize(event, grip.dataset.grip); return; }
      const item = event.target.closest('.designer-item'), palette = event.target.closest('[data-palette-field]'), component = event.target.closest('[data-add-section]');
      const section = !item && event.target.closest('[data-designer-section]');
      if (item) beginPointer(event, { type: 'field', id: item.dataset.designerField, element: item, label: this.app.taskLayout.layoutFieldName(byId.get(item.dataset.designerField)) }, () => select('field', item.dataset.designerField, { focus: true }));
      else if (palette) beginPointer(event, { type: 'field', id: palette.dataset.paletteField, element: palette, label: this.app.taskLayout.layoutFieldName(byId.get(palette.dataset.paletteField)) }, () => {
        const id = palette.dataset.paletteField;
        if (placedIds().has(id)) select('field', id, { focus: true }); else select('field', id);
      });
      else if (component) beginPointer(event, { type: 'new-section', columns: Number(component.dataset.addSection), label: component.textContent.trim() }, () => addSection(Number(component.dataset.addSection)));
      else if (section) beginPointer(event, { type: 'section', id: section.dataset.designerSection, element: section, label: section.querySelector('.designer-section-tab').textContent }, () => select('section', section.dataset.designerSection, { focus: true }));
      else if (event.target.closest('.designer-canvas') && !event.target.closest('.designer-size')) select('form');
    });
    dialog.addEventListener('keydown', event => {
      const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase(), typing = event.target.closest('input, select, textarea');
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!drag) requestClose(); return; }
      event.stopPropagation();
      if (command && !typing && (key === 'z' || key === 'y')) { event.preventDefault(); if (key === 'y' || event.shiftKey) restore(redoStack, undoStack); else restore(undoStack, redoStack); return; }
      if (command || event.altKey || drag) return;
      const grip = event.target.closest('[data-grip]');
      if (grip && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = (event.shiftKey ? 50 : 10) * (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
        if (grip.dataset.grip === 'e') mutate(() => { state.layout.width = Math.max(TaskLayout.TASK_LAYOUT.width.min, Math.min(TaskLayout.TASK_LAYOUT.width.max, state.layout.width + step)); }, 'width');
        else mutate(() => { state.layout.height = Math.max(TaskLayout.TASK_LAYOUT.height.min, Math.min(TaskLayout.TASK_LAYOUT.height.max, (state.layout.height || Math.round((modal.offsetHeight - 2) / 10) * 10) + step)); }, 'height');
        return;
      }
      const item = event.target.closest('.designer-item'), section = !item && event.target.matches('[data-designer-section]') && event.target, palette = event.target.closest('[data-palette-field]');
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (item) {
        const id = item.dataset.designerField;
        if (step) { event.preventDefault(); moveFieldBy(id, step); }
        else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); const next = item.nextElementSibling?.dataset.designerField || item.previousElementSibling?.dataset.designerField; mutate(() => removeField(id)); announce(this.app.transfer.fillText("“{0}” removed from the form.", this.app.taskLayout.layoutFieldName(byId.get(id)))); if (next) select('field', next, { focus: true }); else select('form'); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select('field', id); $d('#designer-field-section')?.focus(); }
      } else if (section) {
        const id = section.dataset.designerSection;
        if (step) { event.preventDefault(); moveSectionBy(id, step, event.key === 'ArrowLeft' || event.key === 'ArrowRight'); }
        else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); mutate(() => deleteSection(id)); select('form'); announce(this.t("Section deleted.")); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select('section', id); $d('#designer-section-name')?.focus(); }
      } else if (palette && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        const id = palette.dataset.paletteField;
        if (placedIds().has(id)) select('field', id, { focus: true }); else addFieldToForm(id);
      }
    });
    dialog.addEventListener('focusin', event => {
      const item = event.target.closest?.('.designer-item'), section = event.target.matches?.('[data-designer-section]') && event.target;
      if (item && !(selection.type === 'field' && selection.id === item.dataset.designerField)) select('field', item.dataset.designerField);
      else if (section && !(selection.type === 'section' && selection.id === section.dataset.designerSection)) select('section', section.dataset.designerSection);
    });
    $d('#designer-search').oninput = event => { paletteQuery = event.target.value; drawPalette(); };
    $d('#designer-unused').onchange = event => { unusedOnly = event.target.checked; drawPalette(); };
    $d('#designer-undo').onclick = () => restore(undoStack, redoStack);
    $d('#designer-redo').onclick = () => restore(redoStack, undoStack);
    $d('#designer-reset').onclick = () => { mutate(() => { state.layout = TaskLayout.defaultTaskEditorLayout(this.state.settingsDraft); }); select('form'); announce(this.t("Default layout restored.")); };
    function applyDesign() {
      if (self.state.view !== 4 || self.state.activeOrganizationId !== organizationId || !self.$('#task-layout-mini')) throw new Error(self.t("The settings page was reloaded: open the form designer again."));
      self.state.settingsDraft.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(self.state.settingsDraft, structuredClone(state.layout));
      self.state.settingsDraft.requiredTaskColumns = [...state.required];
      approved = true;
      dialog.close();
      self.app.taskLayout.drawTaskLayoutSettings(); self.redrawColumnDefinitions(); self.app.settings.refreshSettingsState();
    }
    function requestClose() {
      if (!dirty()) { approved = true; dialog.close(); return; }
      self.app.modal.confirmDialog("Discard the form changes?", "The changes made in the form designer have not been saved.", () => { approved = true; dialog.close(); });
    }
    $d('#designer-cancel').onclick = requestClose;
    // One step, like the rest of the settings: the design goes into the draft and the whole draft is saved.
    $d('#designer-save').onclick = this.app.notifier.action(async () => { applyDesign(); await this.app.settings.saveSettings(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Settings saved."); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!drag) requestClose(); });
    const observer = new ResizeObserver(() => fit());
    const onResize = () => fit();
    dialog.addEventListener('close', () => {
      if (!approved && dirty()) { dialog.showModal(); return; }
      if (drag) endDrag(false);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      dialog.remove();
      this.app.themePainter.syncWindowChrome();
      this.$('#open-form-designer')?.focus();
    });
    dialog.showModal();
    this.app.themePainter.syncWindowChrome();
    observer.observe(modal);
    window.addEventListener('resize', onResize);
    draw();
    dialog.querySelector('.designer-palette-field')?.focus();
  }
}
