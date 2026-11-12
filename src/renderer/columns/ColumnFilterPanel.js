// Per-column filters, their bar and their dialog.
import { Component } from '../core/Component.js';
import { ColumnFilters, ColumnSchema, CsvImporter, TaskOrder } from '../shared.js';

export class ColumnFilterPanel extends Component {
  #filterSpec(id, kind) {
    if (id === 'linked') return { type: 'number' };
    const key = { status: 'statusId', urgency: 'urgencyId', highlight: 'highlightId', tags: 'tagIds', effort: 'effortHours' }[id] || id;
    return CsvImporter.destinations(this.state.data, kind).find(field => field.id === key) || { type: 'text' };
  }
  columnValue(record, id, kind, context) {
    const field = this.app.columns.columnDef(id, kind)?.field;
    if (field) return field.type === 'richtext' ? this.app.richText.plain(record.customFields?.[id] || '') : ColumnSchema.REFERENCE_TYPES.includes(field.type) ? this.app.cells.referenceTasks(this.app.cells.customValue(record, field)).map(this.app.cells.referenceName) : record.customFields?.[id];
    if (kind === 'issues') return id === 'linked' ? context.get(record.code.trim().toUpperCase()) || 0 : record[id];
    if (id === 'highlight') return this.app.presenter.taskHighlights(record).map(highlight => highlight.id);
    if (id === 'incident' || id === 'problem') return this.matchIssues(record, context)[id === 'incident' ? 'incidents' : 'problems'];
    if (id === 'description' || id === 'notes') return this.app.richText.plain(record[id]);
    return record[{ status: 'statusId', urgency: 'urgencyId', highlight: 'highlightId', tags: 'tagIds', effort: 'effortHours' }[id] || id];
  }
  passesColumnFilters(record, kind, context) {
    return Object.entries(this.state.columnFilters[kind]).every(([id, filter]) => ColumnFilters.matchesFilter(this.columnValue(record, id, kind, context), filter, this.app.columns.columnDef(id, kind)?.type || ({ sequence: 'number', effort: 'effort', releaseDate: 'date', linked: 'number' }[id] || 'text')));
  }
  filterHeader(id, kind) {
    const active = ColumnFilters.activeFilter(this.state.columnFilters[kind][id]);
    return `<button type="button" class="column-filter-button ${active ? 'active' : ''}" data-filter-column="${this.esc(id)}" aria-haspopup="dialog" aria-label="${this.esc(this.t("Filter column") + ': ' + this.app.columns.columnName(id, kind))}" title="${this.esc(this.t("Filter column"))}">${this.ico('filter')}</button>`;
  }
  columnFilterBar(kind) {
    const ids = Object.keys(this.state.columnFilters[kind]);
    return ids.length ? `<div class="column-filter-bar">${ids.map(id => {
      const summary = this.filterSummary(id, kind, this.state.columnFilters[kind][id]), short = summary.length > 48 ? `${summary.slice(0, 47)}…` : summary;
      return `<button class="button small" data-filter-column="${this.esc(id)}" title="${this.esc(`${this.app.columns.columnName(id, kind)}: ${summary}`)}">${this.esc(this.app.columns.columnName(id, kind))}${short ? `: <span class="filter-summary">${this.esc(short)}</span>` : ''}${this.ico('chevron-down')}</button>`;
    }).join('')}<button class="button small subtle" data-clear-column-filters>${this.esc(this.t("Clear column filters"))}</button></div>` : '';
  }
  // Readable text of one column filter, shared by the filter bar and the Excel summary.
  filterSummary(id, kind, filter) {
    const spec = this.#filterSpec(id, kind), empty = ColumnFilters.EMPTY_VALUE;
    if (spec.type === 'date') {
      if (filter.empty === 'empty') return this.t("Unassigned");
      const dates = filter.values.filter(value => value !== empty).sort().map(this.app.presenter.formatDate);
      const range = filter.min || filter.max ? `${filter.min ? this.app.presenter.formatDate(filter.min) : '…'} → ${filter.max ? this.app.presenter.formatDate(filter.max) : '…'}` : '';
      const parts = [...dates, filter.values.includes(empty) && this.t("Unassigned"), range].filter(Boolean);
      return parts.length ? parts.join(', ') : filter.empty === 'filled' ? this.t("All dates") : '';
    }
    const values = filter.values.map(value => value === empty ? this.t("Unassigned") : spec.type === 'boolean' ? this.t(value === 'true' ? "Yes" : 'No') : spec.options?.find(option => String(option.value) === value)?.name || value);
    return [filter.text && `${this.t("Contains")}: ${filter.text}`, filter.min && `${this.t("From")}: ${filter.min}`, filter.max && `${this.t("To")}: ${filter.max}`, values.join(', '), filter.empty !== 'any' && this.t(filter.empty === 'empty' ? "Empty only" : "Non-empty only")].filter(Boolean).join(', ');
  }
  // Rows the other filters would show, so a column's choices and counts match what applying it would give.
  #filterCandidates(id, kind) {
    const all = this.state.columnFilters[kind];
    this.state.columnFilters[kind] = Object.fromEntries(Object.entries(all).filter(([key]) => key !== id));
    try { return kind === 'issues' ? this.app.issues.filteredIssues() : this.app.taskFilter.filteredTasks(); } finally { this.state.columnFilters[kind] = all; }
  }
  #dateFilterChoices(id, kind) {
    const counts = new Map();
    let empty = 0;
    for (const record of this.#filterCandidates(id, kind)) {
      const value = this.columnValue(record, id, kind);
      if (value) counts.set(value, (counts.get(value) || 0) + 1); else empty++;
    }
    return { dates: [...counts.keys()].sort(), counts, empty };
  }
  // Dates are picked from the ones in the list instead of typed, because the native date input follows the browser's locale (mm/dd in English).
  #dateFilterFields(filter, choices) {
    const empty = ColumnFilters.EMPTY_VALUE, onlyEmpty = filter.empty === 'empty';
    const anyDate = filter.empty === 'filled' && !filter.values.length && !filter.min && !filter.max;
    const checked = new Set(onlyEmpty ? [empty] : anyDate ? choices.dates : filter.values);
    const min = onlyEmpty ? '' : filter.min, max = onlyEmpty ? '' : filter.max;
    const dates = [...new Set([...choices.dates, ...filter.values.filter(value => value !== empty)])].sort();
    const bounds = [...new Set([...choices.dates, min, max].filter(Boolean))].sort();
    const option = (value, label, color, count) => `<label class="date-filter-option"><input type="checkbox" name="values" value="${this.esc(value)}" ${checked.has(value) ? 'checked' : ''}><span class="date-pill" style="--date:${color}">${this.ico('calendar')}${this.esc(label)}</span><span class="tiny-count">${count}</span></label>`;
    const bound = (name, selected) => `<select name="${name}"><option value="">—</option>${bounds.map(date => `<option value="${date}" ${date === selected ? 'selected' : ''}>${this.esc(this.app.presenter.formatDate(date))}</option>`).join('')}</select>`;
    return `<fieldset class="field full filter-options date-filter-options"><legend>${this.esc(this.t("Dates in the list"))}</legend>
      <div class="filter-option-tools"><button type="button" class="button small" data-check-dates="all">${this.esc(this.t("Select all"))}</button><button type="button" class="button small subtle" data-check-dates="none">${this.esc(this.t("Deselect all"))}</button></div>
      ${option(empty, this.t("Unassigned"), '#929bb2', choices.empty)}${dates.map(date => option(date, this.app.presenter.formatDate(date), TaskOrder.dateColor(date), choices.counts.get(date) || 0)).join('')}</fieldset>
    <label class="field">${this.esc(this.t("From"))}${bound('min', min)}</label><label class="field">${this.esc(this.t("To"))}${bound('max', max)}</label>
    <p class="full filter-note">${this.esc(this.t("Ticked dates and the range add up: a row is shown when it matches at least one of them."))}</p>`;
  }
  #dateFilterFromForm(fields, choices) {
    const values = fields.getAll('values').map(String), min = String(fields.get('min') || ''), max = String(fields.get('max') || '');
    const dates = values.filter(value => value !== ColumnFilters.EMPTY_VALUE), withEmpty = values.includes(ColumnFilters.EMPTY_VALUE), filter = ColumnFilters.emptyFilter();
    if (!min && !max && withEmpty && !dates.length) return { ...filter, empty: 'empty' };
    if (!min && !max && choices.dates.length && choices.dates.every(date => dates.includes(date))) return withEmpty ? filter : { ...filter, empty: 'filled' };
    return { ...filter, min, max, values };
  }
  wireColumnFilters(kind) {
    document.querySelectorAll('#content [data-filter-column]').forEach(button => button.onclick = () => this.columnFilterDialog(button.dataset.filterColumn, kind));
    const clear = this.$('#content [data-clear-column-filters]');
    if (clear) clear.onclick = () => { this.state.columnFilters[kind] = {}; this.app.savedViews.clearActiveSavedView(); this.app.shell.rerenderPreservingView(); };
  }
  columnFilterDialog(id, kind) {
    const filter = structuredClone(this.state.columnFilters[kind][id] || ColumnFilters.emptyFilter()), spec = this.#filterSpec(id, kind), isDate = spec.type === 'date';
    const range = ['number', 'effort'].includes(spec.type), options = spec.type === 'boolean' ? [{ value: 'true', name: this.t("Yes") }, { value: 'false', name: this.t('No') }] : ['select', 'multiselect'].includes(spec.type) ? spec.options : undefined;
    const choices = isDate && this.#dateFilterChoices(id, kind);
    this.app.modal.openModal(`<form id="column-filter-form"><div class="modal-heading"><h2>${this.esc(this.t("Filter column") + ': ' + this.app.columns.columnName(id, kind))}</h2></div><div class="form-grid">
    ${isDate ? this.#dateFilterFields(filter, choices) :
        range ? `<label class="field">${this.esc(this.t("From"))}<input name="min" type="number" step="any" value="${this.esc(filter.min)}"></label><label class="field">${this.esc(this.t("To"))}<input name="max" type="number" step="any" value="${this.esc(filter.max)}"></label>` :
        options ? `<fieldset class="field full filter-options"><legend>${this.esc(this.t("Allowed values"))}</legend>${options.map(option => `<label><input type="checkbox" name="values" value="${this.esc(option.value)}" ${filter.values.includes(String(option.value)) ? 'checked' : ''}> ${this.esc(option.name)}</label>`).join('')}</fieldset>` :
          `<label class="field full">${this.esc(this.t("Contains"))}<input name="text" maxlength="200" value="${this.esc(filter.text)}"></label>`}
    ${isDate ? '' : `<label class="field full">${this.esc(this.t("Empty cells"))}<select name="empty">${[['any', "All"], ['empty', "Empty only"], ['filled', "Non-empty only"]].map(([value, label]) => `<option value="${value}" ${value === filter.empty ? 'selected' : ''}>${this.esc(this.t(label))}</option>`).join('')}</select></label>`}
    </div><div class="modal-actions"><button type="button" class="button" id="clear-one-filter">${this.esc(this.t("Remove filter"))}</button><span class="spacer"></span><button type="button" class="button" data-close>${this.esc(this.t("Cancel"))}</button><button class="button primary" type="submit">${this.esc(this.t("Apply"))}</button></div></form>`);
    const apply = value => { if (ColumnFilters.activeFilter(value)) this.state.columnFilters[kind][id] = value; else delete this.state.columnFilters[kind][id]; this.app.savedViews.clearActiveSavedView(); this.$('#modal').close(); this.app.shell.rerenderPreservingView(); };
    this.$('#clear-one-filter').onclick = () => apply(ColumnFilters.emptyFilter());
    document.querySelectorAll('#column-filter-form [data-check-dates]').forEach(button => button.onclick = () => {
      document.querySelectorAll('#column-filter-form input[name="values"]').forEach(box => { box.checked = button.dataset.checkDates === 'all'; });
    });
    this.$('#column-filter-form').onsubmit = this.app.notifier.action(event => {
      event.preventDefault();
      const fields = new FormData(event.target), next = isDate ? this.#dateFilterFromForm(fields, choices) : { text: String(fields.get('text') || '').trim(), min: String(fields.get('min') || ''), max: String(fields.get('max') || ''), values: fields.getAll('values'), empty: fields.get('empty') };
      if (next.min && next.max && (spec.type === 'date' ? next.min > next.max : Number(next.min) > Number(next.max))) throw new Error(this.t("The minimum exceeds the maximum."));
      if (!ColumnFilters.validFilters({ [id]: next }, [id], { [id]: spec.type })) throw new Error(this.t("Invalid column filter."));
      apply(next);
    });
  }
}
