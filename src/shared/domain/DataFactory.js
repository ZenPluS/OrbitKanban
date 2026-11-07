'use strict';
// Creates empty, demo and initial workspaces and new organizations.
(() => {
const RequiredFields = typeof module !== 'undefined' ? require('../columns/RequiredFields') : globalThis.OrbitKanban.Columns.RequiredFields;
const ColumnLayout = typeof module !== 'undefined' ? require('../columns/ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;
const Typography = typeof module !== 'undefined' ? require('./Typography') : globalThis.OrbitKanban.Domain.Typography;
const TaskColumns = typeof module !== 'undefined' ? require('./TaskColumns') : globalThis.OrbitKanban.Domain.TaskColumns;
const TaskLayout = typeof module !== 'undefined' ? require('./TaskLayout') : globalThis.OrbitKanban.Domain.TaskLayout;
const ThemeCatalog = typeof module !== 'undefined' ? require('./ThemeCatalog') : globalThis.OrbitKanban.Domain.ThemeCatalog;
const ArchiveValidator = typeof module !== 'undefined' ? require('./ArchiveValidator') : globalThis.OrbitKanban.Domain.ArchiveValidator;

class DataFactory {
  static baseData(language = 'it') {
    const T = (text, max = 60) => { const value = Common.term(text, language).trim(); return value && value.length <= max ? value : text; };
    const statuses = [
      { id: Common.id(), name: T("To do"), color: '#8190aa', highlight: false },
      { id: Common.id(), name: T("In progress"), color: '#7c6aef', highlight: false },
      { id: Common.id(), name: T("In review"), color: '#e5aa4a', highlight: true },
      { id: Common.id(), name: T("Done"), color: '#42b899', highlight: false }
    ];
    const urgencies = [
      { id: Common.id(), name: T("Critical"), color: '#ec7086' },
      { id: Common.id(), name: T("High"), color: '#eda36b' },
      { id: Common.id(), name: T("Medium"), color: '#9e8af7' },
      { id: Common.id(), name: T("Low"), color: '#77a6c9' }
    ];
    const settings = {
      language, logo: '', tabNames: ["Tasks", "Linked issues", "Milestones", 'Kanban'].map(name => T(name)),
      hoursPerDay: 8, fontSizes: Typography.defaultFontSizes(), fontFamily: Typography.DEFAULT_FONT_FAMILY, statuses, urgencies, highlights: ThemeCatalog.defaultHighlights(language), tags: [], taskColumns: TaskColumns.defaultTaskColumns(), themeId: 'midnight',
      themes: ThemeCatalog.defaultThemes(), savedViews: [], taskFields: [], issueFields: [], issueColumns: ColumnLayout.normalizeIssueColumns(),
      requiredTaskColumns: [...RequiredFields.DEFAULT_REQUIRED.tasks], requiredIssueColumns: [...RequiredFields.DEFAULT_REQUIRED.issues]
    };
    settings.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(settings);
    return { version: 1, settings, tasks: [], issues: [] };
  }
  static #DEMO_FIRST_RELEASE = '2025-01-01';
  static demoReleaseDates(now = new Date()) {
    const todayIso = Common.localIsoDate(now), past = [];
    for (let date = DataFactory.#DEMO_FIRST_RELEASE; date <= todayIso; date = Common.addDays(date, 14)) past.push(date);
    return { past, next: past.length ? Common.addDays(past[past.length - 1], 14) : DataFactory.#DEMO_FIRST_RELEASE };
  }
  static demoData(language = 'it', now = new Date()) {
    const data = DataFactory.baseData(language), L = text => Common.term(text, language);
    const format = (text, value) => text.replaceAll('{0}', value);
    const [todo, doing, review, done] = data.settings.statuses.map(status => status.id);
    const [critical, high, medium, low] = data.settings.urgencies.map(urgency => urgency.id);
    const field = (fieldId, name, type, extra = {}) => ({ id: fieldId, name: Common.term(name, language).trim().slice(0, 60) || name, type, options: [], ...extra });
    const ticketPlatform = field('custom-ticket-platform', "Ticket platform", 'platform', { template: 'https://tickets.example.com/browse/{code}' });
    const changePlatform = field('custom-change-platform', "Change platform", 'platform', { template: 'https://changes.example.com/change/{code}' });
    const predecessors = field('custom-predecessors', "Predecessors", 'parent'), successors = field('custom-successors', "Successors", 'child', { source: predecessors.id });
    data.settings.taskFields = [ticketPlatform, changePlatform, predecessors, successors];
    data.settings.tags = [
      { id: 'tag-frontend', name: 'Frontend', color: '#5aa9f6' },
      { id: 'tag-backend', name: 'Backend', color: '#b18cff' },
      { id: 'tag-bug', name: 'Bug', color: '#f0647a' },
      { id: 'tag-security', name: 'Security', color: '#f2c94c' }
    ];
    let seed = 0x20250101;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const pick = list => list[Math.floor(random() * list.length)];
    const areas = [
      "Operations dashboard", "Login and authentication", "Finance report", "Orders API", "Product catalog", "Push notifications",
      "Checkout and payments", "Mobile app", "Advanced search", "SAP integration", "User management", "Customer portal",
      "Promotion engine", "Warehouse", "E-invoicing", 'Audit log', 'Single sign-on', 'Data warehouse'
    ];
    // The flag marks fixes that are always critical and linked to incidents.
    const actions = [
      ["performance optimization"], ["production bug fix", true], ["new filters and sorting"], ["interface redesign"],
      ["security library upgrade", true], ["regulatory compliance update"], ["migration to the new database"], ["automated end-to-end tests"],
      ["error handling and retries"], ["WCAG 2.2 accessibility"], ["Excel data export"], ["monitoring and alerting"],
      ["faster load times"], ["multi-language support"], ["session timeout hotfix", true], ["new approval workflow"]
    ];
    const teams = ['Finance', 'Customer Care', "Logistics", 'Marketing', "IT Security", "Sales"];
    const displayDate = date => date.split('-').reverse().join('/');
    const { past, next } = DataFactory.demoReleaseDates(now);
    const hideBefore = Common.addDays(Common.localIsoDate(now), -56);
    const tasks = [], issues = [];
    let incident = 4810, problem = 310, sharedProblem = '';
    const numbered = (prefix, value) => `${prefix}${String(value).padStart(7, '0')}`;
    function linkIssues(code, forceMany) {
      if (!sharedProblem || random() < 0.55) sharedProblem = numbered('PRB', ++problem);
      const count = forceMany ? 2 + Math.floor(random() * 2) : random() < 0.3 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        issues.push({ id: Common.id(), code: i === 1 && random() < 0.5 ? code.toLowerCase() : code, incident: numbered('INC', ++incident), problem: random() < 0.85 ? sharedProblem : '' });
      }
      if (random() < 0.12) issues.push({ id: Common.id(), code, incident: '', problem: numbered('PRB', ++problem) });
    }
    function addTask(releaseDate, statusId, urgencyId) {
      const n = tasks.length, area = pick(areas), action = pick(actions), team = L(pick(teams));
      const title = `${L(area)}: ${L(action[0])}`;
      const external = n % 13 === 7;
      const code = external ? numbered('CHG', 41000 + n) : `ORB-${1001 + n}`;
      const descriptions = [
        `<p>${title}</p>`,
        `<p><strong>${title}</strong></p><ul><li>${L("Analysis and estimate")}</li><li>${L("Development and code review")}</li><li>${L("Production release")}</li></ul>`,
        `<p>${title}</p><p><em>${format(L("Requested by the {0} team"), team)}</em></p>`,
        `<p><u>${title}</u></p><ol><li>${L("Requirements gathering")}</li><li>${L("Implementation")}</li><li>${L("User acceptance testing")}</li></ol>`
      ];
      const notesByStatus = {
        [done]: [`<p>${L("Released to production on")} <strong>${displayDate(releaseDate || '')}</strong>.</p>`, `<ul><li>${L("Logs checked after release")}</li><li>${L("Service desk notified")}</li></ul>`],
        [review]: [`<p><strong>${L("Verification in progress")}</strong>: ${L("check the metrics during the first 48 hours.")}</p>`],
        [doing]: [`<p><em>${L("Waiting for business sign-off.")}</em></p>`, `<ul><li>${L("Backend development completed")}</li><li>${L("Design review pending")}</li></ul>`],
        [todo]: [`<ol><li>${L("Define acceptance criteria")}</li><li>${L("Estimate with the team")}</li></ol>`]
      };
      tasks.push({
        id: Common.id(), code, sequence: n + 1,
        description: pick(descriptions),
        urgencyId: urgencyId || (action[1] ? critical : pick([critical, high, high, high, medium, medium, medium, medium, low, low])),
        statusId, effortHours: pick([2, 4, 6, 8, 12, 16, 20, 24, 32, 40]) + pick([0, 0, 0, 2, 4]),
        releaseDate, notes: random() < 0.45 || statusId === review ? pick(notesByStatus[statusId]) : '',
        hidden: statusId === done && Boolean(releaseDate) && releaseDate < hideBefore, highlightId: '',
        tagIds: n % 5 === 0 ? [] : [n % 2 ? 'tag-frontend' : 'tag-backend', ...(action[1] ? ['tag-bug', 'tag-security'] : [])],
        customFields: { [external ? changePlatform.id : ticketPlatform.id]: code }
      });
      if (action[1] || random() < 0.2) linkIssues(code, action[1] && random() < 0.6);
    }
    past.forEach((date, index) => {
      const latest = index === past.length - 1, count = 3 + Math.floor(random() * 4);
      for (let i = 0; i < count; i++) addTask(date, latest && i < 2 ? review : done);
    });
    [doing, doing, doing, review, todo, todo].forEach(status => addTask(next, status));
    for (let i = 0; i < 6; i++) addTask('', todo, pick([medium, low, low, high]));
    linkIssues(tasks[0].code, true);
    for (let i = 1; i <= 3; i++) issues.push({ id: Common.id(), code: `ORB-${1000 + tasks.length + i}`, incident: numbered('INC', ++incident), problem: numbered('PRB', problem) });
    const [attention, blocker, discuss, ready] = data.settings.highlights.map(highlight => highlight.id);
    const markers = [attention, '', blocker, discuss, '', ready, '', attention];
    tasks.filter(task => task.statusId !== done).forEach((task, index) => { task.highlightId = markers[index % markers.length]; });
    tasks.filter(task => task.statusId === done && !task.hidden).slice(-3).forEach(task => { task.highlightId = ready; });
    // Dependencies between the next release and the backlog show both sides of the reference columns.
    const upcoming = tasks.filter(task => task.releaseDate === next), backlog = tasks.filter(task => !task.releaseDate);
    const dependsOn = (task, ...parents) => { task.customFields[predecessors.id] = parents.map(parent => parent.id); };
    dependsOn(upcoming[1], upcoming[0]);
    dependsOn(upcoming[2], upcoming[0]);
    backlog.slice(0, 3).forEach((task, index) => dependsOn(task, upcoming[index + 3]));
    dependsOn(backlog[3], backlog[0], upcoming[1]);
    data.settings.taskColumns = ColumnLayout.listColumns(data.settings, 'tasks').map(column => [ticketPlatform.id, changePlatform.id].includes(column.id) ? { ...column, visible: false } : column);
    data.settings.taskEditorLayout = TaskLayout.defaultTaskEditorLayout(data.settings);
    data.tasks = tasks;
    data.issues = issues;
    return ArchiveValidator.validateData(data);
  }
  static initialData() { return DataFactory.demoData('it'); }
  static createOrganization(name, language = 'it', logo = '', palette, demo = false) {
    Common.assert(typeof name === 'string' && name.trim() && name.trim().length <= 100, "Invalid organization name.");
    Common.assert(Common.validLanguage(language), "Unsupported language.");
    const data = demo ? DataFactory.demoData(language) : DataFactory.baseData(language);
    data.settings.logo = logo;
    if (logo) {
      Common.assert(palette && ['background', 'surface', 'text', 'accent'].every(key => /^#[0-9a-f]{6}$/i.test(palette[key])), "Invalid themes.");
      const theme = { id: 'organization-logo', name: Common.term("Theme from logo", language).trim().slice(0, 100) || "Theme from logo" };
      for (const key of ['background', 'surface', 'text', 'accent']) theme[key] = palette[key];
      data.settings.themes.push(theme);
      data.settings.themeId = theme.id;
    }
    ArchiveValidator.validateData(data);
    return { id: Common.id(), name: name.trim(), data };
  }
}

if (typeof module !== 'undefined') module.exports = DataFactory;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).DataFactory = DataFactory;
})();
