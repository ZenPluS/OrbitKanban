// Custom column cells: references between tasks, platform links, websites and choices.
import { Component } from '../core/Component.js';
import { ColumnCleanup, ColumnSchema, PlatformLinks, TaskOrder } from '../shared.js';

export class CustomCells extends Component {
  // Reference columns: the parent column stores predecessor ids, the paired child column lists the tasks that point back.
  #referenceCache = new WeakMap();
  #referenceIndex() {
    let entry = this.#referenceCache.get(this.state.data.tasks);
    if (!entry) this.#referenceCache.set(this.state.data.tasks, entry = { tasks: new Map(this.state.data.tasks.map(task => [task.id, task])), successors: new Map() });
    return entry;
  }
  referenceIds(record, field) {
    const index = this.#referenceIndex();
    if (field.type === 'child') {
      if (!index.successors.has(field.source)) index.successors.set(field.source, ColumnCleanup.successorIndex(this.state.data.tasks, field.source));
      return index.successors.get(field.source).get(record.id) || [];
    }
    return (record.customFields?.[field.id] || []).filter(id => index.tasks.has(id));
  }
  referenceTasks = ids => ids.map(id => this.#referenceIndex().tasks.get(id)).filter(Boolean);
  referenceName = task => this.hasColumn('code') && task.code.trim() || this.hasColumn('sequence') && `#${task.sequence}` || this.app.taskFilter.recordLabel(task);
  #referenceLabel = task => { const label = this.referenceName(task); return label.length > 40 ? `${label.slice(0, 39)}…` : label; };
  referenceChips(tasks, interactive = true) {
    return tasks.map(task => {
      const status = this.statusOf(task), title = [this.referenceName(task), this.app.richText.plain(task.description)].filter(Boolean).join(' — ');
      return interactive ? `<button type="button" class="reference-chip" data-open-reference="${this.esc(task.id)}" style="--pill:${this.esc(status.color)}" title="${this.esc(title)}">${this.esc(this.#referenceLabel(task))}</button>`
        : `<span class="reference-chip" style="--pill:${this.esc(status.color)}" title="${this.esc(title)}">${this.esc(this.#referenceLabel(task))}</span>`;
    }).join('');
  }
  customValue = (record, field) => ColumnSchema.REFERENCE_TYPES.includes(field.type) ? this.referenceIds(record, field) : record.customFields?.[field.id];
  #platformAnchor(field, value) {
    const url = PlatformLinks.platformLink(field, value), text = /^https?:\/\//i.test(value) ? value.replace(/^https?:\/\//i, '') : value;
    return url ? `<a class="portal-link" href="${this.esc(url)}" data-open-url title="${this.esc(this.t("Open in the default browser") + ': ' + url)}">${this.esc(text)}${this.ico('external')}</a>` : this.esc(value);
  }
  customText(value, field) {
    if (value === undefined || value === null || value === '') return '';
    if (ColumnSchema.REFERENCE_TYPES.includes(field.type)) return this.referenceTasks(value).map(this.referenceName).join(', ');
    if (field.type === 'richtext') return this.app.richText.plain(value);
    if (field.type === 'date') return this.app.presenter.formatDate(value);
    if (field.type === 'boolean') return this.t(value ? "Yes" : 'No');
    if (field.type === 'effort') return value === 0 ? '0h' : this.app.presenter.effort(value);
    if (['select', 'multiselect'].includes(field.type)) return ColumnSchema.choices(field).filter(option => Array.isArray(value) ? value.includes(option.id) : value === option.id).map(option => option.name).join(', ');
    return Array.isArray(value) ? value.join(', ') : String(value);
  }
  searchableValues(record, kind, context) {
    return ColumnSchema.schemaOf(this.state.data.settings, kind).flatMap(field => {
      const value = field.builtin ? this.app.columnFilterPanel.columnValue(record, field.id, kind, context) : this.customValue(record, field);
      if (value === undefined || value === null || value === '') return [];
      if (field.type === 'date') return [String(value), this.app.presenter.formatDate(value)];
      return [this.customText(value, field)];
    });
  }
  choiceButton(record, field, kind, values = record.customFields?.[field.id] || []) {
    const chips = ColumnSchema.choices(field).filter(option => values.includes(option.id)).map(option => this.app.presenter.pill(option.name, option.color, 'tag-pill')).join('');
    return `<button type="button" class="task-tags-button" data-choice-picker="${this.esc(`${kind}:${record.id}:${field.id}`)}" data-choice-kind="${kind}" data-choice-record="${this.esc(record.id)}" data-choice-field="${field.id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${this.esc(field.name)}"><span class="tag-chips">${chips || `<span class="muted">+ ${this.esc(field.name)}</span>`}</span>${this.ico('chevron-down')}</button>`;
  }
  referenceButton(record, field, values) {
    const chips = this.referenceChips(this.referenceTasks(values.filter(id => this.#referenceIndex().tasks.has(id))), false);
    return `<button type="button" class="task-tags-button reference-picker" data-choice-picker="${this.esc(`tasks:${record.id}:${field.id}`)}" data-choice-kind="tasks" data-choice-record="${this.esc(record.id)}" data-choice-field="${this.esc(field.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${this.esc(field.name)}"><span class="tag-chips">${chips || `<span class="muted">+ ${this.esc(this.t("Choose predecessors"))}</span>`}</span>${this.ico('chevron-down')}</button>`;
  }
  // A task cannot follow itself or any task that already follows it, so the chain never loops.
  #referenceOptions(recordId, field) {
    const successors = ColumnCleanup.successorIndex(this.state.data.tasks, field.id), blocked = new Set([recordId]), queue = [recordId];
    while (queue.length) for (const id of successors.get(queue.shift()) || []) if (!blocked.has(id)) { blocked.add(id); queue.push(id); }
    return this.state.data.tasks.filter(task => !blocked.has(task.id)).map(task => ({ id: task.id, html: `<span class="reference-option">${this.referenceChips([task], false)}<span>${this.esc(this.app.richText.plain(task.description) || '')}</span></span>`, search: [this.referenceName(task), task.code, this.app.richText.plain(task.description)].join(' ').toLowerCase() }));
  }
  wirePlatformPreviews(form, kind = 'tasks') {
    form.querySelectorAll('[data-platform-field]').forEach(input => {
      const field = ColumnSchema.fieldsOf(this.state.data.settings, kind).find(field => field.id === input.dataset.platformField), preview = input.parentElement.querySelector('.platform-preview');
      if (!field || !preview) return;
      const update = () => {
        const text = input.value.trim(), url = text && PlatformLinks.platformLink(field, /^[a-z][a-z\d+.-]*:\/\//i.test(text) || field.template ? text : PlatformLinks.normalizeUrl(text));
        const code = form.elements.code?.value.trim();
        preview.innerHTML = url ? `<a class="portal-link" href="${this.esc(url)}" data-open-url>${this.esc(url)}${this.ico('external')}</a>` : text ? `<span class="portal-error">${this.esc(this.t(field.template ? "The link must start with http:// or https://." : "Enter a valid web address."))}</span>` : field.template && code ? `<button type="button" class="button small subtle" data-use-code>${this.esc(this.app.transfer.fillText("Use the portal code {0}", code))}</button>` : this.esc(this.t(field.template ? "Enter the code on this platform or a full link." : "Enter the full web address."));
        preview.querySelector('[data-use-code]')?.addEventListener('click', () => { input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); });
      };
      input.addEventListener('input', update);
      form.elements.code?.addEventListener('input', update);
      update();
    });
  }
  // Pickers marked data-own-picker (task groups, bulk edit) are wired by their own component.
  wireChoicePickers() {
    document.querySelectorAll('[data-choice-picker]:not([data-own-picker])').forEach(button => button.onclick = () => {
      const kind = button.dataset.choiceKind, id = button.dataset.choiceRecord, fieldId = button.dataset.choiceField, form = button.closest('#task-form, #issue-form');
      const field = ColumnSchema.fieldsOf(this.state.data.settings, kind).find(field => field.id === fieldId);
      const record = this.state.data[kind].find(record => record.id === id);
      if (!field || !record && !form) { this.app.notifier.notify("This item no longer exists.", true); return; }
      const values = form ? new FormData(form).getAll(fieldId) : record.customFields?.[fieldId] || [];
      const reference = field.type === 'parent';
      this.app.tagMenu.openTagMenu(button, { field, values, form, options: reference ? this.#referenceOptions(id, field) : undefined, apply: async (added, removed, chosen) => {
        if (form) {
          const container = button.parentElement;
          container.innerHTML = (reference ? this.referenceButton({ id }, field, chosen) : this.choiceButton({ id }, field, kind, chosen)) + chosen.map(value => `<input type="hidden" name="${fieldId}" value="${this.esc(value)}">`).join('');
          container.dispatchEvent(new Event('change', { bubbles: true }));
          this.wireChoicePickers();
        } else await this.app.history.commit(next => {
          const row = next[kind].find(row => row.id === id), current = ColumnSchema.fieldsOf(next.settings, kind).find(field => field.id === fieldId);
          if (!row || !current) throw new Error(this.t("This item no longer exists."));
          const known = ColumnSchema.choices(current).map(option => option.id);
          if (added.some(id => !known.includes(id))) throw new Error(this.t("The catalog has changed. Reopen the labels menu."));
          (row.customFields ||= {})[fieldId] = [...new Set([...(row.customFields[fieldId] || []).filter(id => !removed.includes(id)), ...added])];
        });
      } });
    });
  }
  customCell(record, field, kind = 'tasks') {
    const value = this.customValue(record, field), text = this.customText(value, field);
    if (field.type === 'multiselect') return `<td class="tags-cell custom-cell">${this.choiceButton(record, field, kind)}</td>`;
    if (field.type === 'select') { const option = ColumnSchema.choices(field).find(option => option.id === value); return `<td class="custom-cell">${option ? this.app.presenter.pill(option.name, option.color, 'tag-pill') : '—'}</td>`; }
    if (ColumnSchema.REFERENCE_TYPES.includes(field.type)) return `<td class="custom-cell reference-cell" title="${this.esc(text)}">${value.length ? `<span class="reference-chips">${this.referenceChips(this.referenceTasks(value))}</span>` : '—'}</td>`;
    const html = field.type === 'url' && value ? `<a class="portal-link" href="${this.esc(value)}" data-open-url title="${this.esc(this.t("Open in the default browser") + ': ' + value)}">${this.esc(value.replace(/^https?:\/\//i, ''))}${this.ico('external')}</a>` :
      field.type === 'platform' && value ? this.#platformAnchor(field, value) :
      field.type === 'date' && value ? `<span class="date-pill" style="--date:${TaskOrder.dateColor(value)}">${this.esc(text)}</span>` : this.esc(text || '—');
    return `<td class="custom-cell" title="${this.esc(text)}"><span>${html}</span></td>`;
  }
  install() {
    document.addEventListener('click', event => {
      const chip = event.target.closest('[data-open-reference]');
      if (!chip || chip.closest('#modal')) return;
      const task = this.state.data.tasks.find(task => task.id === chip.dataset.openReference);
      if (task) this.app.taskDialog.taskDialog(task); else this.app.notifier.notify("This item no longer exists.", true);
    });
  }
}
