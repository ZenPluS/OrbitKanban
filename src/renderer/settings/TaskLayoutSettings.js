// Task form layout settings and required columns.
import { Component } from '../core/Component.js';
import { ColumnSchema, RequiredFields, TaskLayout } from '../shared.js';

export class TaskLayoutSettings extends Component {
  layoutFieldName = field => field.builtin ? this.term(field.name) : field.name;
  layoutSectionLabel = (section, index) => section.name.trim() || this.app.transfer.fillText("Section {0}", index + 1);
  #layoutSchematic(layout, settings) {
    const fields = new Map(TaskLayout.taskEditorFields(settings).map(field => [field.id, field])), required = new Set(RequiredFields.requiredOf(settings, 'tasks'));
    return `<div class="layout-mini-columns" style="grid-template-columns:${this.esc(this.app.taskForm.taskLayoutTemplate(layout.columns))}">${layout.columns.map(column => `<div class="layout-mini-column">${column.sections.map(section => `<div class="layout-mini-section">${section.showName && section.name.trim() ? `<b>${this.esc(section.name)}</b>` : ''}<div class="layout-mini-grid" style="grid-template-columns:repeat(${section.columns}, minmax(0, 1fr))">${section.fields.map(field => {
      const definition = fields.get(field.id);
      return `<span class="layout-mini-field ${definition.type === 'richtext' ? 'is-rich' : ''}" style="grid-column:span ${field.span}">${this.esc(this.layoutFieldName(definition))}${required.has(field.id) ? '<i class="required-mark">*</i>' : ''}</span>`;
    }).join('') || `<span class="layout-mini-empty">${this.esc(this.t("Empty section"))}</span>`}</div></div>`).join('')}</div>`).join('')}</div>`;
  }
  taskLayoutPanel() {
    return `<section class="panel settings-section full" id="task-layout-panel"><h2>${this.esc(this.t("Task editor layout"))}</h2><p class="section-description">${this.esc(this.t("Design the task form of this organization: drag fields into sections, create new sections and choose the size of the window. Fields left off the form keep their values; list columns are not changed."))}</p><div class="layout-overview"><div class="layout-mini" id="task-layout-mini" aria-hidden="true"></div><div class="layout-overview-side"><dl class="layout-summary" id="task-layout-summary"></dl><div class="storage-actions"><button type="button" class="button primary" id="open-form-designer">${this.ico('edit')}${this.esc(this.t("Open form designer"))}</button><button type="button" class="button" id="reset-task-layout">${this.ico('reset')}${this.esc(this.t("Restore default layout"))}</button></div></div></div><h3>${this.esc(this.t("Required fields"))}</h3><p class="muted">${this.esc(this.t("A required field must be filled in before saving, but only when it is on the form. Choose required fields in the form designer or in Column management."))}</p><div class="layout-required" id="task-required-summary"></div><button type="button" class="button small" data-goto-settings-tab="custom-columns">${this.ico('column-plus')}${this.esc(this.t("Column management"))}</button></section>`;
  }
  drawTaskLayoutSettings() {
    if (!this.$('#task-layout-mini')) return;
    const layout = this.state.settingsDraft.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(this.state.settingsDraft);
    const fields = TaskLayout.taskEditorFields(this.state.settingsDraft), names = new Map(fields.map(field => [field.id, this.layoutFieldName(field)]));
    const sections = layout.columns.flatMap(column => column.sections), placed = new Set(sections.flatMap(section => section.fields.map(field => field.id)));
    this.$('#task-layout-mini').innerHTML = this.#layoutSchematic(layout, this.state.settingsDraft);
    const item = (label, value) => `<div><dt>${this.esc(this.t(label))}</dt><dd>${this.esc(value)}</dd></div>`;
    this.$('#task-layout-summary').innerHTML = item("Window size", `${layout.width} × ${layout.height || this.t("automatic height")} px`) + item("Layout columns", layout.columns.map(column => `${column.width}`).join(' : ')) +
      item("Sections", sections.length) + item("Fields on the form", this.app.transfer.fillText("{0} of {1}", placed.size, fields.length));
    const required = RequiredFields.requiredOf(this.state.settingsDraft, 'tasks').filter(id => names.has(id));
    this.$('#task-required-summary').innerHTML = required.length ? required.map(id => `<span class="layout-required-chip ${placed.has(id) ? '' : 'is-off'}">${this.esc(names.get(id))}<i class="required-mark" aria-hidden="true">*</i>${placed.has(id) ? '' : `<small>${this.esc(this.t("not on the form: not checked"))}</small>`}</span>`).join('') : `<p class="muted">${this.esc(this.t("No required fields."))}</p>`;
    this.$('#open-form-designer').onclick = () => this.app.formDesigner.openFormDesigner();
    this.$('#reset-task-layout').onclick = () => {
      this.state.settingsDraft.taskEditorLayout = TaskLayout.defaultTaskEditorLayout(this.state.settingsDraft);
      this.drawTaskLayoutSettings(); this.app.settings.refreshSettingsState();
      this.app.notifier.notify("Default layout restored. Save the settings to apply it.");
    };
  }
  // Required flags live in a list ordered like the columns, so toggling back and forth does not leave unsaved changes.
  setRequiredColumn(settings, kind, id, required) {
    const chosen = new Set(RequiredFields.requiredOf(settings, kind));
    if (required) chosen.add(id); else chosen.delete(id);
    settings[RequiredFields.requiredKey(kind)] = ColumnSchema.schemaOf(settings, kind).map(field => field.id).filter(fieldId => chosen.has(fieldId));
  }
}
