// Excel export of the current situation.
import { Component } from '../core/Component.js';
import { ColumnSchema, Common, IssueMatcher, OrganizationTransfer, PlatformLinks, TaskLinks, TaskOrder, XlsxWriter } from '../shared.js';

export class ExcelExport extends Component {
  // ---- Excel export of the current situation ----
  excelButton = () => `<button type="button" class="button excel-button" data-excel-export title="${this.esc(this.t("Export the current situation to an Excel file"))}">${this.ico('excel')}Excel</button>`;
  #colorProbe;
  // Any CSS color (including the hsl() used for release dates) as #rrggbb, which is what Excel needs.
  hexColor(color, fallback = '#929bb2') {
    this.#colorProbe ||= document.createElement('canvas').getContext('2d');
    this.#colorProbe.fillStyle = fallback;
    this.#colorProbe.fillStyle = String(color || fallback);
    return /^#[0-9a-f]{6}$/i.test(this.#colorProbe.fillStyle) ? this.#colorProbe.fillStyle : fallback;
  }
  // Mixes a color with white: amount 1 keeps the color, 0 gives white. Keeps cell text readable on any palette.
  tint(color, amount) {
    const hex = this.hexColor(color);
    return '#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * amount).toString(16).padStart(2, '0')).join('');
  }
  // Rich text as plain text with real line breaks and list markers, for spreadsheet cells.
  richText(html) {
    const el = document.createElement('div');
    el.innerHTML = this.app.richText.sanitize(html);
    el.querySelectorAll('ol').forEach(list => [...list.children].forEach((item, i) => item.prepend(`${i + 1}. `)));
    el.querySelectorAll('ul > li').forEach(item => item.prepend('• '));
    el.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    el.querySelectorAll('p,div,li,blockquote').forEach(node => node.append('\n'));
    return el.textContent.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  EXCEL_SHEETS = [['summary', "Summary", "Totals, active filters and breakdown by status and urgency"], ['tasks', 0, "One row per task with colors, links, dates and incidents"], ['issues', 1, "Associations, custom columns and flagged duplicates"], ['milestones', 2, "One row per release with effort and statuses"], ['kanban', 3, "Tasks in columns, one per status"]];
  excelChoices = { scope: 'view', columns: 'visible', sheets: this.EXCEL_SHEETS.map(([id]) => id) };
  #excelTasks(scope) {
    if (scope === 'selected') return this.app.taskList.sortedRows(this.state.data.tasks.filter(task => this.state.selectedTasks.has(task.id)));
    return this.app.taskList.sortedRows(scope === 'all' ? this.state.data.tasks : this.app.taskFilter.filteredTasks());
  }
  #columnFilterDescriptions(kind) {
    return Object.entries(this.state.columnFilters[kind]).map(([id, filter]) => `${this.app.columns.columnName(id, kind)}: ${this.app.columnFilterPanel.filterSummary(id, kind, filter)}`);
  }
  #activeFilterText(kind = 'tasks') {
    if (kind === 'issues') return [this.state.issueSearch && `${this.t("Search")}: ${this.state.issueSearch}`, this.state.issueDuplicatesOnly && this.t("Duplicates only"), ...this.#columnFilterDescriptions(kind)].filter(Boolean).join(' · ') || this.t("None");
    const status = this.state.data.settings.statuses.find(s => s.id === this.state.statusFilter);
    const highlight = { __any: this.t("Highlighted only"), __none: this.t("Not highlighted") }[this.state.highlightFilter] || this.app.presenter.highlightsOf().find(h => h.id === this.state.highlightFilter)?.name;
    const parts = [this.state.search && `${this.t("Search")}: “${this.state.search}”`, status && `${this.t("Status")}: ${status.name}`, highlight && `${this.t("Highlight")}: ${highlight}`, this.state.showHidden && this.t("Hidden included"), this.state.duplicatesOnly && this.t("Duplicates only")].filter(Boolean);
    parts.push(...this.#columnFilterDescriptions('tasks'));
    return parts.join(' · ') || this.t("None");
  }
  #sortText() {
    return this.state.sort.map(entry => {
      const def = this.app.columns.columnDef(entry.key)?.field ? this.app.columns.columnDef(entry.key) : Object.values(this.app.columns.taskColumnDefs).find(column => column.sort === entry.key);
      return `${def?.field ? def.name : this.t(def?.name || entry.key)} ${entry.direction === 'asc' ? '↑' : '↓'}`;
    }).join(', ');
  }
  #customSpreadsheetCell(record, field, style) {
    const value = this.app.cells.customValue(record, field);
    if (value === undefined || value === null || value === '' || Array.isArray(value) && !value.length) return { v: '', style };
    if (field.type === 'platform') { const url = PlatformLinks.platformLink(field, value); return { v: value, ...(url && { link: url }), style }; }
    if (field.type === 'date') return { v: value, type: 'date', style: { ...style, fill: this.tint(TaskOrder.dateColor(value), 0.5) } };
    if (field.type === 'url') return { v: value, link: value, style };
    if (['number', 'effort'].includes(field.type)) return { v: value, type: 'number', style };
    if (field.type === 'select') {
      const option = ColumnSchema.choices(field).find(option => option.id === value);
      return { v: option?.name || '', style: { ...style, ...(option && { fill: this.tint(option.color, 0.35) }) } };
    }
    return { v: field.type === 'richtext' ? this.richText(value) : this.app.cells.customText(value, field), style: { ...style, wrap: true } };
  }
  async situationWorkbook(options, now = new Date()) {
    const settings = this.state.data.settings, tasks = this.#excelTasks(options.scope), duplicates = this.app.taskFilter.duplicatesOf(), wanted = new Set(options.sheets);
    const organization = this.state.organizations.find(o => o.id === this.state.activeOrganizationId)?.name || '';
    const header = { bold: true, color: '#ffffff', fill: '#2d3142', vertical: 'center', border: '#2d3142' }, grid = '#d9dce6', muted = '#7a8099';
    const section = text => [{ v: text, style: { bold: true, size: 12, color: '#2d3142', border: { color: '#2d3142', style: 'medium', sides: ['bottom'] } } }];
    const hours = list => list.reduce((sum, task) => sum + task.effortHours, 0);
    const statuses = this.workflowStatuses(), urgencies = this.hasColumn('urgency') ? [...settings.urgencies, ...(tasks.some(task => !task.urgencyId) ? [this.unassignedOption()] : [])] : [];
    if (wanted.has('milestones') && !this.hasColumn('releaseDate') || wanted.has('kanban') && !this.hasColumn('status')) throw new Error(this.t("Selected views need deleted columns. Restore the columns or choose other sheets."));
    const nextDate = TaskOrder.nextReleaseDate(tasks, Common.today());
    const sheets = [];
    if (wanted.has('summary')) {
      const scopeLabel = { view: this.t("As shown in the list"), all: this.t("All tasks"), selected: this.t("Selected only") }[options.scope];
      const label = text => ({ v: this.t(text), style: { color: muted } });
      const dated = tasks.filter(task => task.releaseDate), hidden = tasks.filter(task => task.hidden).length, total = hours(tasks);
      const highlighted = tasks.filter(task => this.app.presenter.highlightOf(task) || this.statusOf(task).highlight).length, duplicated = tasks.filter(task => duplicates.tasks.has(task.id)).length;
      const breakdown = (title, items, of) => [section(this.t(title)), [title, "Tasks", "Hours", 'Effort', '%'].map(text => ({ v: this.t(text), style: header })),
        ...items.map(item => {
          const group = tasks.filter(task => of(task) === item.id), cell = { border: grid };
          return [{ v: item.name, style: { ...cell, bold: true, fill: this.tint(item.color, 0.35) } }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? this.app.presenter.effort(hours(group)) : '', style: cell }, { v: tasks.length ? group.length / tasks.length : 0, type: 'number', style: { ...cell, numFmt: '0%' } }];
        })];
      const rows = [
        [{ v: `${Common.APP_NAME} · ${this.t("Current situation")}`, style: { bold: true, size: 16, color: '#2d3142' } }], [],
        [label("Organization"), { v: organization, style: { bold: true } }],
        [label("Exported on"), { v: now, type: 'datetime', style: { horizontal: 'left' } }],
        [label("App version"), this.state.appVersion || '—'],
        [label("Exported tasks"), scopeLabel],
        ...(options.scope === 'view' ? [[label("Active filters"), this.#activeFilterText()], [label("Issue filters"), this.#activeFilterText('issues')]] : []),
        [label("Sorting"), this.#sortText()],
        [label("Columns"), this.t(options.columns === 'all' ? "All columns" : "Columns visible in the list")],
        [], section(this.t("Totals")),
        [label("Tasks"), tasks.length], [label("Of which hidden"), hidden],
        ...(this.hasColumn('effort') ? [[label("Total effort"), total ? this.app.presenter.effort(total) : '—'], [label("Effort (hours)"), total]] : []),
        ...(this.hasColumn('releaseDate') ? [[label("Planned releases"), new Set(dated.map(task => task.releaseDate)).size], [label("Unscheduled"), tasks.length - dated.length],
          [label("Next release"), nextDate ? { v: nextDate, type: 'date', style: { horizontal: 'left', bold: true } } : '—', nextDate ? this.plural(tasks.filter(task => task.releaseDate === nextDate).length, "tasks") : '']] : []),
        ...(this.hasColumn('highlight') || this.hasColumn('status') ? [[label("Highlighted"), highlighted]] : []),
        ...(this.hasColumn('incident') ? [[label("With a duplicate incident"), duplicated]] : []),
        ...(this.hasColumn('status') ? [[], ...breakdown("Status", statuses, task => task.statusId)] : []),
        ...(this.hasColumn('urgency') ? [[], ...breakdown("Urgency", urgencies, task => task.urgencyId)] : [])
      ];
      sheets.push({ name: this.t("Summary"), columns: [{ width: 26 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 9 }], rows, gridLines: false, tabColor: '#2d3142', merges: [{ row: 0, col: 0, cols: 5 }] });
    }
    if (wanted.has('tasks')) {
      const issues = IssueMatcher.indexIssues(this.state.data.issues);
      const ids = options.columns === 'all' ? this.configuredColumns().map(column => column.id) : this.app.columns.shownColumns();
      const widths = { sequence: 7, code: 16, description: 56, urgency: 14, status: 18, highlight: 18, tags: 22, effort: 11, incident: 18, problem: 18, releaseDate: 14, notes: 48 };
      const defs = ids.flatMap(id => id === 'effort' ? [{ id, name: this.t('Effort'), width: 11 }, { id: 'effortHours', name: this.t("Effort (hours)"), width: 11 }] : [{ id, name: this.app.columns.columnDef(id).field ? this.app.columns.columnDef(id).name : this.t(this.app.columns.columnDef(id).name), width: widths[id] || 24 }]);
      if (tasks.some(task => task.hidden)) defs.push({ id: 'hidden', name: this.t("Hidden"), width: 11 });
      const rows = [defs.map(def => ({ v: def.name, style: { ...header, wrap: true } }))];
      for (const task of tasks) {
        const status = this.statusOf(task), urgency = this.urgencyOf(task), mark = this.app.presenter.highlightOf(task), links = this.matchIssues(task, issues), url = TaskLinks.platformUrl(task, settings);
        const fill = mark ? this.tint(mark.color, 0.22) : status.highlight ? this.tint(status.color, 0.14) : '';
        const base = { border: grid, vertical: 'top', ...(fill && { fill }), ...(task.hidden && { italic: true, color: muted }) };
        const cell = (v, style = {}, extra = {}) => ({ v, ...extra, style: { ...base, ...style } });
        rows.push(defs.map(def => {
          switch (def.id) {
            case 'sequence': return cell(task.sequence, { horizontal: 'right' });
            case 'code': return cell(task.code, { bold: true }, url ? { link: url } : {});
            case 'description': return cell(this.richText(task.description), { wrap: true });
            case 'notes': return cell(this.richText(task.notes), { wrap: true });
            case 'urgency': return cell(urgency.name, { fill: this.tint(urgency.color, 0.35) });
            case 'status': return cell(status.name, { fill: this.tint(status.color, 0.35), bold: Boolean(status.highlight) });
            case 'highlight': return cell(mark?.name || '', mark ? { fill: this.tint(mark.color, 0.45) } : {});
            case 'tags': return cell(this.app.presenter.tagsOf(task).map(tag => tag.name).join(', '), { wrap: true });
            case 'effort': return cell(task.effortHours ? this.app.presenter.effort(task.effortHours) : '');
            case 'effortHours': return cell(task.effortHours);
            case 'incident': return cell(links.incidents.join('\n'), { wrap: true, ...(duplicates.tasks.has(task.id) && { fill: this.tint('#f2b94a', 0.45) }) });
            case 'problem': return cell(links.problems.join('\n'), { wrap: true });
            case 'releaseDate': return task.releaseDate ? cell(task.releaseDate, { fill: this.tint(TaskOrder.dateColor(task.releaseDate), 0.5), horizontal: 'center' }, { type: 'date' }) : cell(this.t("Unscheduled"), { italic: true, color: muted, horizontal: 'center' });
            case 'hidden': return cell(task.hidden ? this.t("Yes") : '', { horizontal: 'center' });
            default: return this.app.columns.columnDef(def.id)?.field ? this.#customSpreadsheetCell(task, this.app.columns.columnDef(def.id).field, base) : cell('');
          }
        }));
      }
      const code = defs.findIndex(def => def.id === 'code');
      sheets.push({ name: this.app.sections.nameOf('tasks', settings), columns: defs.map(def => ({ width: def.width })), rows, freeze: { row: 1, col: code >= 0 && code < 3 ? code + 1 : 0 }, autoFilter: true, tabColor: settings.themes.find(theme => theme.id === settings.themeId)?.accent, print: { landscape: true, fitWidth: true } });
    }
    if (wanted.has('issues')) {
      const identical = new Set(duplicates.identical), cell = { border: grid, vertical: 'top' };
      const ids = options.columns === 'all' ? this.configuredColumns('issues').map(column => column.id) : this.app.columns.shownIssueColumns();
      const rows = [[...ids.map(id => ({ v: this.app.columns.columnDef(id, 'issues').field ? this.app.columns.columnDef(id, 'issues').name : this.t(id === 'linked' ? "Linked tasks" : this.app.columns.columnDef(id, 'issues').name), style: header })), { v: this.t("Duplicate"), style: header }],
        ...(options.scope === 'view' ? this.app.issues.filteredIssues() : this.state.data.issues).map(issue => {
          const linked = this.state.data.tasks.filter(task => task.code.trim() && task.code.trim().toUpperCase() === issue.code.trim().toUpperCase()), task = linked[0], url = task ? TaskLinks.platformUrl(task, settings) : '', group = duplicates.issues.get(issue.id);
          const values = { code: { v: issue.code, link: url, style: { ...cell, bold: true } }, incident: { v: issue.incident, style: { ...cell, ...(group && { fill: this.tint('#f2b94a', 0.45) }) } }, problem: { v: issue.problem, style: cell }, linked: { v: linked.length, style: cell } };
          return [...ids.map(id => values[id] || this.#customSpreadsheetCell(issue, this.app.columns.columnDef(id, 'issues').field, cell)), { v: group ? this.t(identical.has(issue.id) ? "identical" : "Yes") : '', style: { ...cell, horizontal: 'center' } }];
        })];
      sheets.push({ name: this.app.sections.nameOf('issues', settings), columns: [...ids.map(() => ({ width: 22 })), { width: 12 }], rows, freeze: { row: 1 }, autoFilter: true });
    }
    if (wanted.has('milestones')) {
      const dates = [...new Set(tasks.map(task => task.releaseDate).filter(Boolean))].sort(), day = Common.today();
      if (tasks.some(task => !task.releaseDate)) dates.push('');
      const rows = [["Milestone", 'Release date', 'Release', "Tasks", "Hours", 'Effort'].map(text => ({ v: this.t(text), style: header })).concat(statuses.map(status => ({ v: status.name, style: { ...header, fill: this.tint(status.color, 0.55), color: '#1d2030', wrap: true } })), { v: this.t("Codes"), style: header })];
      dates.forEach((date, index) => {
        const group = tasks.filter(task => task.releaseDate === date), next = Boolean(date && date === nextDate), fill = next ? '#fff1c2' : '';
        const state = !date ? this.t("Unscheduled") : next ? this.t(date === day ? "Today's release" : "Next release") : this.t(date < day ? "Past" : "Upcoming");
        const cell = { border: grid, vertical: 'top', ...(fill && { fill }), ...(next && { bold: true }) };
        rows.push([{ v: date ? index + 1 : '—', style: { ...cell, horizontal: 'center' } }, date ? { v: date, type: 'date', style: { ...cell, fill: fill || this.tint(TaskOrder.dateColor(date), 0.5), horizontal: 'center' } } : { v: this.t("Unscheduled"), style: { ...cell, italic: true } }, { v: state, style: cell }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? this.app.presenter.effort(hours(group)) : '', style: cell },
          ...statuses.map(status => ({ v: group.filter(task => task.statusId === status.id).length || '', style: { ...cell, horizontal: 'center' } })), { v: this.app.taskList.sortedRows(group).map(task => task.code).join(', '), style: { ...cell, wrap: true } }]);
      });
      const included = (_, index) => (this.hasColumn('effort') || ![4, 5].includes(index)) && (this.hasColumn('code') || index !== 6 + statuses.length);
      sheets.push({ name: this.app.sections.nameOf('milestones', settings), columns: [{ width: 8 }, { width: 14 }, { width: 17 }, { width: 10 }, { width: 9 }, { width: 11 }, ...statuses.map(() => ({ width: 12 })), { width: 60 }].filter(included), rows: rows.map(row => row.filter(included)), freeze: { row: 1, col: 2 } });
    }
    if (wanted.has('kanban')) {
      const columns = statuses.map(status => TaskOrder.sortTasks(tasks.filter(task => task.statusId === status.id)));
      const rows = [statuses.map((status, i) => ({ v: `${status.name} (${columns[i].length})`, style: { bold: true, fill: this.tint(status.color, 0.45), border: { color: this.hexColor(status.color), style: 'medium', sides: ['bottom'] }, horizontal: 'center' } }))];
      for (let r = 0; r < Math.max(0, ...columns.map(list => list.length)); r++) {
        rows.push(columns.map((list, i) => {
          const task = list[r];
          if (!task) return '';
          const text = this.app.richText.plain(task.description), url = TaskLinks.platformUrl(task, settings);
          return { v: `${this.app.taskFilter.recordLabel(task)}${text ? ` · ${text.length > 90 ? text.slice(0, 89) + '…' : text}` : ''}`, link: url, style: { wrap: true, vertical: 'top', border: grid, fill: this.tint(statuses[i].color, 0.12), ...(task.hidden ? { italic: true, color: muted } : url ? {} : { color: '#1d2030' }) } };
        }));
      }
      sheets.push({ name: this.app.sections.nameOf('kanban', settings), columns: statuses.map(() => ({ width: 34 })), rows, freeze: { row: 1 } });
    }
    return XlsxWriter.buildWorkbook({ title: `${Common.APP_NAME} · ${organization}`, creator: Common.APP_NAME, application: Common.APP_NAME, created: now, sheets });
  }
  async #exportExcel(options) {
    const organization = this.state.organizations.find(o => o.id === this.state.activeOrganizationId)?.name || '';
    const bytes = await this.situationWorkbook(options);
    const result = await this.workspaceApi.exportSpreadsheet(OrganizationTransfer.situationFileName(organization, this.currentLanguage()), bytes);
    if (result) this.app.notifier.notify("Excel exported:", false, result.fileName);
    return result;
  }
  excelDialog(preset = {}) {
    const selected = this.state.data.tasks.filter(task => this.state.selectedTasks.has(task.id)).length, choices = { ...this.excelChoices, ...preset };
    const enabledSheet = id => id !== 'milestones' && id !== 'kanban' || this.hasColumn(id === 'milestones' ? 'releaseDate' : 'status');
    if (choices.scope === 'selected' && !selected) choices.scope = 'view';
    const columns = this.configuredColumns();
    const radio = (name, value, title, detail, disabled = false) => `<label class="choice-card ${disabled ? 'is-disabled' : ''}"><input type="radio" name="${name}" value="${value}" ${choices[name] === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${this.esc(this.t(title))}</strong><small>${this.esc(detail)}</small></span></label>`;
    const sheetCards = this.EXCEL_SHEETS.map(([id, name, detail]) => `<label class="choice-card ${enabledSheet(id) ? '' : 'is-disabled'}"><input type="checkbox" name="sheets" value="${id}" ${choices.sheets.includes(id) && enabledSheet(id) ? 'checked' : ''} ${enabledSheet(id) ? '' : 'disabled'}><span><strong>${this.esc(typeof name === 'number' ? this.app.sections.nameOf(id) : this.t(name))}</strong><small>${this.esc(this.t(enabledSheet(id) ? detail : "Restore the required column to export this view."))}</small></span></label>`).join('');
    this.app.modal.openModal(this.ui`<form id="excel-form" novalidate><div class="modal-heading"><div><div class="eyebrow">EXCEL</div><h2>Export to Excel</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>
    <p class="section-description">Create an .xlsx workbook. Summary, milestones and kanban follow the selected tasks. “As shown” also applies issue filters; the other options export all issues.</p>
    <fieldset class="excel-group"><legend>Tasks to export</legend><div class="choice-grid">${radio('scope', 'view', "As shown in the list", this.app.transfer.fillText("{0} · current filters and sorting", this.plural(this.app.taskFilter.filteredTasks().length, "tasks")))}${radio('scope', 'all', "All tasks", this.app.transfer.fillText("{0}, hidden ones included", this.plural(this.state.data.tasks.length, "tasks")))}${radio('scope', 'selected', "Selected only", selected ? this.app.transfer.fillText("{0} selected", selected) : this.t("No task selected"), !selected)}</div></fieldset>
    <fieldset class="excel-group"><legend>Task and issue sheet columns</legend><div class="choice-grid">${radio('columns', 'visible', "Columns visible in the list", this.app.transfer.fillText("Tasks: {0} · Issues: {1}", this.app.columns.shownColumns().length, this.app.columns.shownIssueColumns().length))}${radio('columns', 'all', "All columns", this.app.transfer.fillText("Tasks: {0} · Issues: {1}", columns.length, this.configuredColumns('issues').length))}</div></fieldset>
    <fieldset class="excel-group"><legend>Sheets</legend><div class="choice-grid sheets">${sheetCards}</div></fieldset>
    <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="excel-save">${this.ico('excel')}${this.esc(this.t("Export"))}</button></div></form>`);
    const form = this.$('#excel-form');
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const fields = new FormData(form), options = { scope: fields.get('scope') || 'view', columns: fields.get('columns') || 'visible', sheets: fields.getAll('sheets') };
      if (!options.sheets.length) throw new Error("Choose at least one sheet to export.");
      if (options.scope === 'selected' && !this.state.selectedTasks.size) throw new Error("Select at least one task.");
      this.excelChoices = options;
      this.$('#excel-save').disabled = true;
      try {
        if (await this.#exportExcel(options) && this.$('#modal').open && this.$('#excel-form') === form) this.$('#modal').close();
      } finally { if (form.isConnected) this.$('#excel-save').disabled = false; }
    });
  }
  install() {
    document.addEventListener('click', event => { if (this.state.data && event.target.closest('[data-excel-export]')) this.excelDialog(); });
  }
}
