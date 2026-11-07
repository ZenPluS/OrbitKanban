// Task form layout and required fields.
import { Component } from '../core/Component.js';
import { ColumnSchema, RequiredFields, TaskLayout } from '../shared.js';

export class TaskForm extends Component {
  // Marks each editor control's container with the field id, so layouts, designers and required checks can find it.
  tagFormFields(form, kind) {
    for (const field of ColumnSchema.schemaOf(this.state.data.settings, kind)) {
      const element = field.type === 'richtext' ? document.getElementById(field.builtin ? `${field.id}-editor` : `editor-${field.id}`) :
        field.property ? form.elements[field.property] : form.querySelector(`[data-choice-field="${CSS.escape(field.id)}"], [data-reference-field="${CSS.escape(field.id)}"], [name="${CSS.escape(field.id)}"]`);
      const container = element?.closest?.('.field');
      if (container) container.dataset.formField = field.id;
    }
    if (kind !== 'tasks') return;
    const effort = form.elements.days?.closest('.field');
    if (effort) {
      const group = document.createElement('div');
      group.className = 'form-grid task-effort-fields';
      group.dataset.formField = 'effort';
      effort.before(group);
      group.append(effort, form.elements.hours.closest('.field'));
    }
    form.elements.hidden.closest('.field').dataset.formField = 'hidden';
    const matches = form.querySelector('#match-preview');
    if (matches) matches.dataset.formField = 'matches';
  }
  // Fields flow row by row like grid auto placement; explicit rows let rich-text rows take the spare height.
  #placeSectionFields(fields, columnCount, isRich) {
    let row = 0, column = 0;
    const richRows = new Set(), placed = fields.map(field => {
      const span = Math.min(field.span, columnCount);
      if (column + span > columnCount) { row++; column = 0; }
      if (isRich(field.id)) richRows.add(row);
      const place = { ...field, span, column: column + 1, row: row + 1 };
      column += span;
      return place;
    });
    const rows = fields.length ? row + 1 : 0;
    return { placed, rows: Array.from({ length: rows }, (_, index) => richRows.has(index) ? 'minmax(min-content, 1fr)' : 'auto').join(' ') };
  }
  taskLayoutTemplate = columns => columns.map(column => `minmax(0, ${column.width}fr)`).join(' ');
  #richTaskFields = settings => new Set(TaskLayout.taskEditorFields(settings).filter(field => field.type === 'richtext').map(field => field.id));
  // Shared by the task editor and the form designer preview, so the designer is what you get.
  buildTaskLayoutColumns(layout, settings, elementFor, { keepEmpty = false, decorate } = {}) {
    const rich = this.#richTaskFields(settings), shown = [];
    for (const [columnIndex, column] of layout.columns.entries()) {
      const columnElement = document.createElement('div');
      columnElement.className = 'task-form-column';
      columnElement.dataset.layoutColumn = String(columnIndex);
      for (const section of column.sections) {
        const fields = section.fields.filter(field => elementFor(field.id));
        if (!fields.length && !keepEmpty) continue;
        const titled = section.showName && section.name.trim();
        const sectionElement = document.createElement(titled ? 'section' : 'div');
        sectionElement.className = 'task-form-section';
        sectionElement.dataset.section = section.id;
        if (titled) {
          const title = document.createElement('h3');
          title.className = 'task-form-section-title';
          title.id = `task-section-${section.id}-${this.uid().slice(0, 8)}`;
          title.textContent = section.name;
          sectionElement.setAttribute('aria-labelledby', title.id);
          sectionElement.append(title);
        }
        const grid = document.createElement('div'), { placed, rows } = this.#placeSectionFields(fields, section.columns, id => rich.has(id));
        grid.className = 'task-form-grid';
        grid.style.gridTemplateColumns = `repeat(${section.columns}, minmax(0, 1fr))`;
        grid.style.gridTemplateRows = rows;
        for (const field of placed) {
          const element = elementFor(field.id);
          element.style.gridColumn = `${field.column} / span ${field.span}`;
          element.style.gridRow = String(field.row);
          element.classList.toggle('is-rich-field', rich.has(field.id));
          grid.append(element);
        }
        sectionElement.classList.toggle('has-rich', placed.some(field => rich.has(field.id)));
        sectionElement.append(grid);
        decorate?.(sectionElement, section, columnIndex);
        columnElement.append(sectionElement);
      }
      if (columnElement.children.length || keepEmpty) shown.push({ width: column.width, element: columnElement });
    }
    return shown;
  }
  applyTaskEditorLayout(form) {
    const layout = TaskLayout.normalizeTaskEditorLayout(this.state.data.settings), body = form.querySelector('.task-edit-layout'), pool = form.querySelector('.task-edit-pool');
    this.tagFormFields(form, 'tasks');
    const elements = new Map([...pool.querySelectorAll('[data-form-field]')].map(element => [element.dataset.formField, element]));
    const columns = this.buildTaskLayoutColumns(layout, this.state.data.settings, id => elements.get(id));
    body.append(...columns.map(column => column.element));
    body.style.gridTemplateColumns = this.taskLayoutTemplate(columns);
    // Fields kept off the form stay in the hidden pool, so their values are saved unchanged.
    pool.hidden = true;
    form.style.setProperty('--task-form-width', `${layout.width}px`);
    if (layout.height) form.style.setProperty('--task-form-height', `${layout.height}px`);
    form.classList.toggle('fixed-height', layout.height > 0);
    if (!columns.length) body.insertAdjacentHTML('afterbegin', `<p class="muted task-form-empty">${this.esc(this.t("No fields are on this form. Add them with the form designer in Settings › Task editor layout."))}</p>`);
  }
  #REQUIRED_CONTROLS = 'input:not([type="hidden"]):not([type="checkbox"]), select, [contenteditable="true"], [data-choice-field]';
  markRequiredFields(form, kind) {
    for (const id of RequiredFields.requiredOf(this.state.data.settings, kind)) {
      const container = form.querySelector(`[data-form-field="${CSS.escape(id)}"]`);
      if (!container || container.closest('.task-edit-pool')) continue;
      container.dataset.required = 'true';
      const host = container.querySelector('.field-label, .task-effort-label, label[for], legend') || container;
      const text = [...host.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const mark = document.createElement('span');
      mark.className = 'required-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.title = this.t("Required");
      mark.textContent = '*';
      if (text) { const label = document.createElement('span'); text.replaceWith(label); label.append(text, mark); } else host.prepend(mark);
      container.querySelectorAll(this.#REQUIRED_CONTROLS).forEach(control => control.setAttribute('aria-required', 'true'));
    }
    const clear = event => this.#clearRequiredError(event.target.closest?.('[data-required]'));
    form.addEventListener('input', clear);
    form.addEventListener('change', clear);
  }
  #clearRequiredError(container) {
    if (!container?.classList.contains('is-invalid')) return;
    container.classList.remove('is-invalid');
    container.querySelectorAll('.field-error').forEach(error => error.remove());
    container.querySelectorAll('[aria-invalid]').forEach(control => { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); });
  }
  // Mandatory fields are checked only where they appear on the form, like business-required fields in a model-driven form.
  checkRequiredFields(form, kind, emptyWhen = {}) {
    const entries = new FormData(form), schema = ColumnSchema.schemaOf(this.state.data.settings, kind), missing = [];
    const isEmpty = (id, container) => {
      if (emptyWhen[id]) return emptyWhen[id]();
      const rich = container.querySelector('.editable');
      if (rich) return !this.app.richText.plain(rich.innerHTML) && !rich.querySelector('img');
      if (['multiselect', 'parent'].includes(schema.find(field => field.id === id)?.type)) return !entries.getAll(id).length;
      return [...container.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select')].every(control => !control.value.trim());
    };
    for (const container of form.querySelectorAll('[data-required="true"]')) {
      this.#clearRequiredError(container);
      if (!isEmpty(container.dataset.formField, container)) continue;
      missing.push(container);
      const error = document.createElement('small');
      error.className = 'field-error';
      error.id = `required-error-${this.uid()}`;
      error.textContent = this.t("This field is required.");
      container.classList.add('is-invalid');
      container.append(error);
      container.querySelectorAll(this.#REQUIRED_CONTROLS).forEach(control => {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', error.id);
      });
    }
    if (!missing.length) return;
    const names = missing.map(container => {
      const field = schema.find(item => item.id === container.dataset.formField);
      return field.builtin ? this.t(field.name) : field.name;
    });
    missing[0].scrollIntoView({ block: 'nearest' });
    missing[0].querySelector(this.#REQUIRED_CONTROLS)?.focus();
    throw new Error(this.app.transfer.fillText("Fill in the required fields: {0}.", names.join(', ')));
  }
}
