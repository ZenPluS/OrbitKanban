// View headings and the built-in and custom column definitions.
import { Component } from '../core/Component.js';
import { ColumnSchema } from '../shared.js';

export class ColumnCatalog extends Component {
  heading(title, subtitle, buttons = '') {
    return `<section class="page-heading"><div><h1>${this.esc(title)}<span class="title-dot">.</span></h1><p>${this.esc(this.t(subtitle))}</p></div><div class="heading-actions">${buttons}</div></section>`;
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
