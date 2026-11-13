// Base class of the interface components: DOM, text, icon and column helpers shared by every view.
import { ColumnLayout, ColumnSchema, IconLibrary, IssueMatcher, Translator } from '../shared.js';

export class Component {
  constructor(app) {
    this.app = app;
    this.state = app?.state;
  }
  $ = selector => document.querySelector(selector);
  esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  uid = () => crypto.randomUUID();
  hasColumn = (id, kind = 'tasks', settings = this.state.data.settings) => ColumnSchema.hasColumn(settings, kind, id);
  configuredColumns = (kind = 'tasks', settings = this.state.data.settings, input) => ColumnLayout.listColumns(settings, kind, input);
  unassignedOption = () => ({ id: '', name: this.t("Unassigned"), color: '#929bb2', highlight: false });
  statusOf = task => this.hasColumn('status') && this.state.data.settings.statuses.find(option => option.id === task.statusId) || this.unassignedOption();
  urgencyOf = task => this.hasColumn('urgency') && this.state.data.settings.urgencies.find(option => option.id === task.urgencyId) || this.unassignedOption();
  workflowStatuses = () => this.hasColumn('status') ? [...this.state.data.settings.statuses, ...(this.state.data.tasks.some(task => !task.statusId) ? [this.unassignedOption()] : [])] : [];
  matchIssues(task, issues) {
    const links = IssueMatcher.matchIssues(task, issues);
    if (!this.hasColumn('incident')) links.incidents = [];
    if (!this.hasColumn('problem')) links.problems = [];
    return links;
  }
  unwrap(value) {
    if (value && value.__error) { const error = new Error(value.message); error.code = value.code; throw error; }
    return value;
  }
  workspaceApi = new Proxy({}, { get: (_, name) => { const member = window.workspace?.[name]; return typeof member === 'function' ? async (...args) => this.unwrap(await member(...args)) : member; } });
  browserMode = () => window.workspace?.mode === 'browser';
  currentLanguage = () => this.state.data?.settings.language || 'it';
  t = text => Translator.translate(text, this.currentLanguage());
  tr = this.t;
  ui = (strings, ...values) => Translator.translateTemplate(strings, values, this.currentLanguage());
  locale = () => Translator.locale(this.currentLanguage());
  term = text => Translator.term(text, this.currentLanguage());
  plural = (count, key) => Translator.plural(count, key, this.currentLanguage());
  ico = (name, family) => IconLibrary.icon(name, family);
  get icons() { return ['tasks', 'link', 'flag', 'kanban'].map(name => this.ico(name)); }
}
