// View headings, statistics and the built-in and custom column definitions.
import { Component } from '../core/Component.js';
import { ColumnSchema } from '../shared.js';

export class ColumnCatalog extends Component {
  heading(title, subtitle, buttons = '') {
    return `<section class="page-heading"><div><h1>${this.esc(title)}<span class="title-dot">.</span></h1><p>${this.esc(this.t(subtitle))}</p></div><div class="heading-actions">${buttons}</div></section>`;
  }
  stats() {
    const tasks = this.app.presenter.visibleTasks();
    const releases = new Set(tasks.map(t => t.releaseDate).filter(Boolean));
    const hours = tasks.reduce((sum, t) => sum + t.effortHours, 0);
    const highlighted = tasks.filter(t => this.app.presenter.highlightOf(t) || this.state.data.settings.statuses.find(s => s.id === t.statusId)?.highlight).length;
    return this.ui`<div class="stats"><div class="stat"><span>Visible tasks <span class="stat-icon">${this.ico('tasks')}</span></span><strong>${tasks.length}<small>in your workspace</small></strong></div><div class="stat"><span>Planned releases <span class="stat-icon mint">${this.ico('diamond')}</span></span><strong>${releases.size}<small>upcoming destinations</small></strong></div><div class="stat"><span>Total effort <span class="stat-icon peach">${this.ico('clock')}</span></span><strong title="${hours.toLocaleString(this.locale())} total hours">${this.app.presenter.effort(hours)}<small>${hours.toLocaleString(this.locale())} total hours</small></strong></div><div class="stat"><span>Highlighted <span class="stat-icon pink">${this.ico('flame')}</span></span><strong>${highlighted}<small>keep an eye on these</small></strong></div></div>`;
  }
  taskColumnDefs = {
    sequence: { name: "Sequence", header: '#', sort: 'sequence' },
    code: { name: "Portal code", sort: 'code' },
    description: { name: "Description" },
    urgency: { name: "Urgency", sort: 'urgencyId' },
    status: { name: "Status", sort: 'statusId' },
    highlight: { name: "Highlight", sort: 'highlightId' },
    tags: { name: 'Tags' },
    effort: { name: 'Effort', sort: 'effortHours' },
    incident: { name: 'Incident' },
    problem: { name: 'Problem' },
    releaseDate: { name: 'Release date', sort: 'releaseDate' },
    notes: { name: "Notes" }
  };
  #issueColumnDefs = { code: { name: "Portal code" }, incident: { name: 'Incident' }, problem: { name: 'Problem' }, linked: { name: "Link", type: 'number' } };
  fieldTypeNames = { text: "Text", richtext: "Rich text", number: "Number", date: "Date", select: "Single choice", multiselect: "Multiple choice", url: "Website", platform: "Link to platform", effort: "Effort (hours)", boolean: "Yes / No", parent: "Reference parent", child: "Reference child" };
  columnDef(id, kind = 'tasks', settings = this.state.data.settings) {
    if (!this.hasColumn(id, kind, settings)) return undefined;
    const base = (kind === 'tasks' ? this.taskColumnDefs : this.#issueColumnDefs)[id];
    if (base) return base;
    const field = ColumnSchema.fieldsOf(settings, kind).find(field => field.id === id);
    return field ? { name: field.name, type: field.type, field, sort: kind === 'tasks' && ['number', 'date', 'effort', 'boolean', 'select'].includes(field.type) ? field.id : undefined } : undefined;
  }
  columnName(id, kind = 'tasks') {
    const def = this.columnDef(id, kind);
    return def?.field ? def.name : this.t(def?.name || id);
  }
  shownColumns = () => this.configuredColumns().filter(column => column.visible).map(column => column.id);
  shownIssueColumns = () => this.configuredColumns('issues').filter(column => column.visible).map(column => column.id);
}
