'use strict';
// Export and import of single organizations (settings, tasks, issues) as files.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const RequiredFields = typeof module !== 'undefined' ? require('../columns/RequiredFields') : globalThis.OrbitKanban.Columns.RequiredFields;
const ColumnLayout = typeof module !== 'undefined' ? require('../columns/ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;
const ColumnCleanup = typeof module !== 'undefined' ? require('../columns/ColumnCleanup') : globalThis.OrbitKanban.Columns.ColumnCleanup;
const ColumnValidator = typeof module !== 'undefined' ? require('../columns/ColumnValidator') : globalThis.OrbitKanban.Columns.ColumnValidator;
const ColumnMerger = typeof module !== 'undefined' ? require('../columns/ColumnMerger') : globalThis.OrbitKanban.Columns.ColumnMerger;
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;
const Typography = typeof module !== 'undefined' ? require('./Typography') : globalThis.OrbitKanban.Domain.Typography;
const Limits = typeof module !== 'undefined' ? require('./Limits') : globalThis.OrbitKanban.Domain.Limits;
const TaskColumns = typeof module !== 'undefined' ? require('./TaskColumns') : globalThis.OrbitKanban.Domain.TaskColumns;
const TaskLayout = typeof module !== 'undefined' ? require('./TaskLayout') : globalThis.OrbitKanban.Domain.TaskLayout;
const ThemeCatalog = typeof module !== 'undefined' ? require('./ThemeCatalog') : globalThis.OrbitKanban.Domain.ThemeCatalog;
const TaskLinks = typeof module !== 'undefined' ? require('./TaskLinks') : globalThis.OrbitKanban.Domain.TaskLinks;
const NavigationSections = typeof module !== 'undefined' ? require('./NavigationSections') : globalThis.OrbitKanban.Domain.NavigationSections;
const TaskGroups = typeof module !== 'undefined' ? require('./TaskGroups') : globalThis.OrbitKanban.Domain.TaskGroups;
const TodoLists = typeof module !== 'undefined' ? require('./TodoLists') : globalThis.OrbitKanban.Domain.TodoLists;
const ArchiveValidator = typeof module !== 'undefined' ? require('./ArchiveValidator') : globalThis.OrbitKanban.Domain.ArchiveValidator;
const DataFactory = typeof module !== 'undefined' ? require('./DataFactory') : globalThis.OrbitKanban.Domain.DataFactory;

class OrganizationTransfer {
  static #ORGANIZATION_FILE_FORMAT = 'orbitkanban-organization';
  static #ORGANIZATION_FILE_VERSION = 1;
  static ORGANIZATION_FILE_KINDS = ['themes', 'settings', 'data', 'organization'];
  static #ORGANIZATION_FILE_PARTS = { themes: ['themes'], settings: ['settings'], data: ['data'], organization: ['themes', 'settings', 'data'] };
  static #RECORD_KEYS = {
    theme: ['id', 'name', 'background', 'surface', 'text', 'accent'],
    status: ['id', 'name', 'color', 'highlight'],
    urgency: ['id', 'name', 'color'],
    highlight: ['id', 'name', 'color'],
    section: ['id', 'type', 'name', 'viewId'],
    column: ['id', 'visible'],
    task: ['id', 'code', 'sequence', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId', 'effortHours', 'hidden', 'highlightId', 'additionalHighlightIds', 'tagIds', 'customFields'],
    issue: ['id', 'code', 'incident', 'problem', 'customFields'],
    group: ['id', 'name', 'color', 'description', 'taskIds'],
    todo: ['id', 'title', 'text', 'textHtml', 'color', 'pinned', 'items']
  };
  static organizationExport(organization, kind, { appVersion = '', exportedAt = new Date().toISOString() } = {}) {
    Common.assert(OrganizationTransfer.ORGANIZATION_FILE_KINDS.includes(kind), "Unsupported export type.");
    const parts = OrganizationTransfer.#ORGANIZATION_FILE_PARTS[kind], settings = organization.data.settings;
    const file = { format: OrganizationTransfer.#ORGANIZATION_FILE_FORMAT, version: OrganizationTransfer.#ORGANIZATION_FILE_VERSION, kind, exportedAt, appVersion, organization: { name: organization.name } };
    if (parts.includes('themes')) file.themes = { themeId: settings.themeId, themes: structuredClone(settings.themes) };
    const highlights = structuredClone(settings.highlights ?? ThemeCatalog.defaultHighlights(settings.language || 'it'));
    if (parts.includes('settings')) {
      file.settings = {
        language: settings.language || 'it', logo: settings.logo || '', logoSource: settings.logoSource === undefined ? '' : settings.logoSource, logoShape: settings.logoShape === undefined ? 'none' : settings.logoShape,
        packSources: structuredClone(settings.packSources || []), iconPack: settings.iconPack ?? 'default', packThemeBases: structuredClone(settings.packThemeBases || {}),
        navigation: structuredClone(settings.navigation), hoursPerDay: settings.hoursPerDay, fontSizes: { ...(settings.fontSizes || Typography.defaultFontSizes()) }, fontFamily: settings.fontFamily ?? Typography.DEFAULT_FONT_FAMILY,
        statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies),
        highlights: structuredClone(highlights), tags: structuredClone(settings.tags || []),
        taskColumns: ColumnLayout.listColumns(settings, 'tasks'), savedViews: structuredClone(settings.savedViews || []),
        deletedTaskColumns: [...ColumnSchema.deletedOf(settings, 'tasks')], deletedIssueColumns: [...ColumnSchema.deletedOf(settings, 'issues')],
        requiredTaskColumns: RequiredFields.requiredOf(settings, 'tasks'), requiredIssueColumns: RequiredFields.requiredOf(settings, 'issues'),
        taskFields: structuredClone(settings.taskFields || []), issueFields: structuredClone(settings.issueFields || []),
        issueColumns: ColumnLayout.listColumns(settings, 'issues'), taskEditorLayout: TaskLayout.normalizeTaskEditorLayout(settings)
      };
    }
    if (parts.includes('data')) {
      file.data = { statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies), highlights: structuredClone(highlights), tags: structuredClone(settings.tags || []), tasks: structuredClone(organization.data.tasks), issues: structuredClone(organization.data.issues), groups: structuredClone(organization.data.groups || []) };
      file.data.todos = structuredClone(organization.data.todos || []);
      file.data.taskFields = structuredClone(settings.taskFields || []);
      file.data.issueFields = structuredClone(settings.issueFields || []);
      file.data.deletedTaskColumns = [...ColumnSchema.deletedOf(settings, 'tasks')];
      file.data.deletedIssueColumns = [...ColumnSchema.deletedOf(settings, 'issues')];
    }
    return file;
  }
  static #slugify = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  static organizationFileName(name, kind, language = 'it', date = Common.today()) {
    Common.assert(OrganizationTransfer.ORGANIZATION_FILE_KINDS.includes(kind), "Unsupported export type.");
    const labels = { themes: "themes", settings: "settings", data: "data", organization: "organization" };
    const label = key => OrganizationTransfer.#slugify(Common.term(labels[key], language)) || key;
    return `${Common.APP_NAME}-${OrganizationTransfer.#slugify(name) || label('organization')}-${label(kind)}-${date}.json`;
  }
  static situationFileName(name, language = 'it', date = Common.today()) {
    return `${Common.APP_NAME}-${OrganizationTransfer.#slugify(name) || OrganizationTransfer.#slugify(Common.term("organization", language)) || 'organization'}-${OrganizationTransfer.#slugify(Common.term("situation", language)) || 'situation'}-${date}.xlsx`;
  }
  static #fileRecords(list, keys, message) {
    Common.assert(Array.isArray(list) && list.every(item => item && typeof item === 'object' && !Array.isArray(item)), message);
    return list.map(item => Object.fromEntries(keys.filter(key => item[key] !== undefined).map(key => [key, item[key]])));
  }
  static parseOrganizationFile(input) {
    let file = input;
    if (typeof input === 'string') {
      try { file = JSON.parse(input.replace(/^\uFEFF/, '')); }
      catch { throw new Error("The selected file is not a valid JSON file."); }
    }
    Common.assert(file && typeof file === 'object' && !Array.isArray(file), "The file is not an OrbitKanban organization export.");
    Common.assert(file.format !== undefined || !(Array.isArray(file.organizations) || (file.settings && Array.isArray(file.tasks))), "This file is a full archive backup: use “Import backup” in the “Data that travels with you” section.");
    Common.assert(file.format === OrganizationTransfer.#ORGANIZATION_FILE_FORMAT, "The file is not an OrbitKanban organization export.");
    Common.assert(Number.isInteger(file.version) && file.version >= 1, "Unsupported file version.");
    Common.assert(file.version <= OrganizationTransfer.#ORGANIZATION_FILE_VERSION, "The file was created by a newer version of OrbitKanban: update the app to import it.");
    Common.assert(OrganizationTransfer.ORGANIZATION_FILE_KINDS.includes(file.kind), "Unsupported export type.");
    const name = file.organization?.name;
    Common.assert(name === undefined || (typeof name === 'string' && name.trim().length <= 100), "Invalid organization name.");
    const parts = OrganizationTransfer.#ORGANIZATION_FILE_PARTS[file.kind];
    const result = {
      format: OrganizationTransfer.#ORGANIZATION_FILE_FORMAT, version: file.version, kind: file.kind, parts: [...parts],
      exportedAt: typeof file.exportedAt === 'string' && !Number.isNaN(Date.parse(file.exportedAt)) ? file.exportedAt : '',
      appVersion: typeof file.appVersion === 'string' && /^[\w.+-]{1,40}$/.test(file.appVersion) ? file.appVersion : '',
      organization: { name: typeof name === 'string' ? name.trim() : '' }
    };
    const missing = { themes: "The file does not contain themes.", settings: "The file does not contain settings.", data: "The file does not contain data." };
    for (const part of parts) Common.assert(file[part] && typeof file[part] === 'object' && !Array.isArray(file[part]), missing[part]);
    file = structuredClone(file);
    const fileLanguage = Common.validLanguage(file.settings?.language) ? file.settings.language : 'it';
    const legacyTemplate = typeof file.settings?.portalUrlTemplate === 'string' ? file.settings.portalUrlTemplate : undefined;
    if (parts.includes('settings')) {
      TaskLinks.upgradeLegacyLink(file.settings, [], { language: fileLanguage });
      NavigationSections.upgradeLegacyTabNames(file.settings);
    }
    // Without the settings the template is unknown: the codes are kept so the template of the receiving column can complete them.
    if (parts.includes('data')) TaskLinks.upgradeLegacyLink(file.data, file.data.tasks, { language: fileLanguage, template: legacyTemplate ?? '', fillCodes: !parts.includes('settings') || Boolean(legacyTemplate) });
    const probe = DataFactory.baseData('it');
    const check = (settings, content = {}) => ArchiveValidator.validateData({ ...probe, settings: { ...probe.settings, ...settings }, ...content });
    if (parts.includes('themes')) {
      const themes = { themeId: file.themes.themeId, themes: OrganizationTransfer.#fileRecords(file.themes.themes, OrganizationTransfer.#RECORD_KEYS.theme, "Invalid themes.") };
      check(themes);
      result.themes = themes;
    }
    if (parts.includes('settings')) {
      const source = file.settings;
      const settings = {
        language: source.language, logo: source.logo ?? '', logoSource: source.logoSource === undefined ? '' : source.logoSource, logoShape: source.logoShape === undefined ? 'none' : source.logoShape,
        ...(source.packSources === undefined ? {} : { packSources: structuredClone(source.packSources) }),
        ...(source.iconPack === undefined ? {} : { iconPack: source.iconPack }),
        ...(source.packThemeBases === undefined ? {} : { packThemeBases: structuredClone(source.packThemeBases) }),
        navigation: Array.isArray(source.navigation) ? OrganizationTransfer.#fileRecords(source.navigation, OrganizationTransfer.#RECORD_KEYS.section, "Invalid navigation sections.") : source.navigation, hoursPerDay: source.hoursPerDay,
        statuses: OrganizationTransfer.#fileRecords(source.statuses, OrganizationTransfer.#RECORD_KEYS.status, "Invalid or empty status list."),
        urgencies: OrganizationTransfer.#fileRecords(source.urgencies, OrganizationTransfer.#RECORD_KEYS.urgency, "Invalid or empty urgency list.")
      };
      if (source.fontFamily !== undefined) settings.fontFamily = source.fontFamily;
      if (source.taskEditorLayout !== undefined) settings.taskEditorLayout = structuredClone(source.taskEditorLayout);
      if (source.fontSizes !== undefined) {
        Common.assert(source.fontSizes && typeof source.fontSizes === 'object' && !Array.isArray(source.fontSizes), "Invalid text sizes.");
        settings.fontSizes = Object.fromEntries(Typography.FONT_SIZE_PARTS.map(({ id }) => [id, source.fontSizes[id] ?? 100]));
      }
      if (source.highlights !== undefined) settings.highlights = OrganizationTransfer.#fileRecords(source.highlights, OrganizationTransfer.#RECORD_KEYS.highlight, "Invalid highlighters.");
      if (source.tags !== undefined) settings.tags = OrganizationTransfer.#fileRecords(source.tags, OrganizationTransfer.#RECORD_KEYS.highlight, "Invalid tags.");
      for (const key of ['taskFields', 'issueFields', 'issueColumns', 'deletedTaskColumns', 'deletedIssueColumns', 'requiredTaskColumns', 'requiredIssueColumns']) if (source[key] !== undefined) settings[key] = structuredClone(source[key]);
      ColumnCleanup.validateDeleted(settings);
      RequiredFields.validateRequired(settings);
      for (const kind of ['tasks', 'issues']) ColumnValidator.validateFields(ColumnSchema.fieldsOf(settings, kind), kind);
      if (source.taskColumns !== undefined) {
        const columns = OrganizationTransfer.#fileRecords(source.taskColumns, OrganizationTransfer.#RECORD_KEYS.column, "Invalid list columns.");
        Common.assert(columns.every(column => typeof column.id === 'string' && typeof column.visible === 'boolean'), "Invalid list columns.");
        settings.taskColumns = TaskColumns.normalizeTaskColumns(columns, settings.taskFields, settings.deletedTaskColumns);
      }
      if (source.savedViews !== undefined) settings.savedViews = structuredClone(source.savedViews);
      Common.assert(Common.validLanguage(settings.language), "Unsupported language.");
      check(settings);
      result.settings = settings;
    }
    if (parts.includes('data')) {
      const source = file.data;
      const content = {
        statuses: OrganizationTransfer.#fileRecords(source.statuses, OrganizationTransfer.#RECORD_KEYS.status, "Invalid or empty status list."),
        urgencies: OrganizationTransfer.#fileRecords(source.urgencies, OrganizationTransfer.#RECORD_KEYS.urgency, "Invalid or empty urgency list."),
        tasks: OrganizationTransfer.#fileRecords(source.tasks, OrganizationTransfer.#RECORD_KEYS.task, "Invalid task list."),
        issues: OrganizationTransfer.#fileRecords(source.issues, OrganizationTransfer.#RECORD_KEYS.issue, "Invalid issue list.")
      };
      if (source.highlights !== undefined) content.highlights = OrganizationTransfer.#fileRecords(source.highlights, OrganizationTransfer.#RECORD_KEYS.highlight, "Invalid highlighters.");
      if (source.tags !== undefined) content.tags = OrganizationTransfer.#fileRecords(source.tags, OrganizationTransfer.#RECORD_KEYS.highlight, "Invalid tags.");
      if (source.groups !== undefined) content.groups = OrganizationTransfer.#fileRecords(source.groups, OrganizationTransfer.#RECORD_KEYS.group, "Invalid task groups.");
      if (source.todos !== undefined) content.todos = OrganizationTransfer.#fileRecords(source.todos, OrganizationTransfer.#RECORD_KEYS.todo, "Invalid to-do cards.");
      for (const key of ['taskFields', 'issueFields', 'deletedTaskColumns', 'deletedIssueColumns']) if (source[key] !== undefined) content[key] = structuredClone(source[key]);
      ColumnCleanup.validateDeleted(content);
      for (const kind of ['tasks', 'issues']) ColumnValidator.validateFields(ColumnSchema.fieldsOf(content, kind), kind);
      const schema = { deletedTaskColumns: ColumnSchema.deletedOf(content, 'tasks'), deletedIssueColumns: ColumnSchema.deletedOf(content, 'issues') };
      check({ statuses: content.statuses, urgencies: content.urgencies, ...(content.highlights ? { highlights: content.highlights } : {}), tags: content.tags || [], taskFields: ColumnSchema.fieldsOf(content, 'tasks'), issueFields: ColumnSchema.fieldsOf(content, 'issues'), ...schema,
        taskColumns: ColumnLayout.listColumns({ ...content, ...schema }, 'tasks'), issueColumns: ColumnLayout.listColumns({ ...content, ...schema }, 'issues')
      }, { tasks: content.tasks, issues: content.issues, ...(content.groups ? { groups: content.groups } : {}), ...(content.todos ? { todos: content.todos } : {}) });
      result.data = content;
    }
    return result;
  }
  static #optionRemapper(source, target) {
    const key = name => name.trim().toLowerCase();
    const ids = new Set(target.map(option => option.id)), names = new Map();
    for (const option of target) if (!names.has(key(option.name))) names.set(key(option.name), option.id);
    return sourceId => {
      if (!sourceId || !target.length) return '';
      if (ids.has(sourceId)) return sourceId;
      const index = source.findIndex(option => option.id === sourceId);
      if (index >= 0 && names.has(key(source[index].name))) return names.get(key(source[index].name));
      return target[Math.min(Math.max(index, 0), target.length - 1)].id;
    };
  }
  // Match shared catalogs by id/name; tags with an id collision must keep their original meaning.
  static #colorOptionRemapper(source, target, add = false, { limit = Limits.HIGHLIGHT_LIMIT, overflow = '', matchName = false } = {}) {
    const key = name => name.trim().toLowerCase();
    return sourceId => {
      if (!sourceId) return '';
      const original = source.find(highlight => highlight.id === sourceId);
      if (target.some(item => item.id === sourceId && (!matchName || !original || key(item.name) === key(original.name)))) return sourceId;
      if (!original) return '';
      const sameName = target.find(highlight => key(highlight.name) === key(original.name));
      if (sameName) return sameName.id;
      if (!add) return '';
      if (target.length >= limit) { if (overflow) throw new Error(overflow); return ''; }
      const added = structuredClone(original);
      if (target.some(item => item.id === added.id)) added.id = Common.id();
      target.push(added);
      return added.id;
    };
  }
  static #tagRemapper = (source, target, add = false) => OrganizationTransfer.#colorOptionRemapper(source, target, add, { limit: Limits.TAG_LIMIT, matchName: true, overflow: "Too many tags: reduce the catalog before importing." });
  static applyOrganizationImport(current, file, options = {}) {
    const next = structuredClone(current), settings = next.settings;
    const importFields = (source, preferIncoming = false) => Object.fromEntries(['tasks', 'issues'].map(kind => {
      const key = kind === 'tasks' ? 'taskFields' : 'issueFields';
      const merged = ColumnMerger.mergeFields(settings[key] || [], source[key] || [], preferIncoming);
      settings[key] = merged.fields;
      return [kind, merged];
    }));
    const wanted = part => Boolean(options[part] && file[part]);
    Common.assert(['themes', 'settings', 'data'].some(wanted), "Select at least one part to import.");
    if (wanted('settings')) {
      const incoming = structuredClone(file.settings);
      settings.deletedTaskColumns = [...ColumnSchema.deletedOf(incoming, 'tasks')];
      settings.deletedIssueColumns = [...ColumnSchema.deletedOf(incoming, 'issues')];
      const maps = importFields(incoming, true);
      const remapColumns = (list, map) => list.map(column => ({ ...column, id: map.get(column.id) || column.id }));
      const status = OrganizationTransfer.#optionRemapper(settings.statuses, incoming.statuses), urgency = OrganizationTransfer.#optionRemapper(settings.urgencies, incoming.urgencies);
      for (const task of next.tasks) { task.statusId = status(task.statusId); task.urgencyId = urgency(task.urgencyId); }
      for (const key of ['language', 'navigation', 'hoursPerDay', 'statuses', 'urgencies']) settings[key] = incoming[key];
      for (const key of ['packSources', 'iconPack', 'packThemeBases']) if (incoming[key] !== undefined) settings[key] = structuredClone(incoming[key]);
      if (incoming.fontSizes) settings.fontSizes = incoming.fontSizes;
      if (incoming.fontFamily !== undefined) settings.fontFamily = incoming.fontFamily;
      if (incoming.taskEditorLayout !== undefined) settings.taskEditorLayout = TaskLayout.remapTaskEditorLayout(settings, incoming.taskEditorLayout, maps.tasks.mapping);
      for (const kind of ['tasks', 'issues']) {
        const key = RequiredFields.requiredKey(kind);
        if (incoming[key] !== undefined) settings[key] = [...new Set(incoming[key].map(fieldId => maps[kind].mapping.get(fieldId) || fieldId))];
      }
      if (incoming.highlights) {
        const highlight = OrganizationTransfer.#colorOptionRemapper(settings.highlights || [], incoming.highlights);
        for (const task of next.tasks) ColumnSchema.setTaskHighlightIds(task, ColumnSchema.taskHighlightIds(task).map(highlight));
        settings.highlights = incoming.highlights;
      }
      if (incoming.tags) {
        const tag = OrganizationTransfer.#tagRemapper(settings.tags || [], incoming.tags);
        for (const task of next.tasks) task.tagIds = [...new Set((task.tagIds || []).map(tag).filter(Boolean))];
        settings.tags = incoming.tags;
      }
      if (incoming.taskColumns) settings.taskColumns = ColumnLayout.listColumns(settings, 'tasks', remapColumns(incoming.taskColumns, maps.tasks.mapping));
      if (incoming.issueColumns) settings.issueColumns = ColumnLayout.listColumns(settings, 'issues', remapColumns(incoming.issueColumns, maps.issues.mapping));
      if (incoming.savedViews) settings.savedViews = incoming.savedViews.map(view => ({
        ...view, columns: remapColumns(view.columns, maps.tasks.mapping), sort: view.sort.map(item => ({ ...item, key: maps.tasks.mapping.get(item.key) || item.key })),
        ...(view.columnFilters && { columnFilters: ColumnMerger.remapValues(view.columnFilters, maps.tasks.mapping, maps.tasks.valueMappings, true) })
      }));
      NavigationSections.normalizeNavigation(settings);
      if (options.logo) {
        settings.logo = incoming.logo;
        settings.logoSource = incoming.logoSource;
        settings.logoShape = incoming.logoShape;
      }
    }
    if (wanted('themes')) {
      for (const theme of structuredClone(file.themes.themes)) {
        theme.name = ThemeCatalog.modernThemeName(theme);
        const index = settings.themes.findIndex(existing => existing.id === theme.id);
        if (index >= 0) settings.themes[index] = theme; else settings.themes.push(theme);
      }
      if (options.activateTheme) settings.themeId = file.themes.themeId;
    }
    if (wanted('data')) {
      const maps = importFields(file.data);
      const status = OrganizationTransfer.#optionRemapper(file.data.statuses, settings.statuses), urgency = OrganizationTransfer.#optionRemapper(file.data.urgencies, settings.urgencies);
      settings.highlights ??= ThemeCatalog.defaultHighlights(settings.language || 'it');
      const highlight = OrganizationTransfer.#colorOptionRemapper(file.data.highlights || [], settings.highlights, true);
      settings.tags ??= [];
      const tag = OrganizationTransfer.#tagRemapper(file.data.tags || [], settings.tags, true);
      // Files from versions without highlighters do not erase the highlight of the tasks they update.
      const existing = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, ColumnSchema.taskHighlightIds(task)]));
      const existingTags = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.tagIds || []]));
      const oldTasks = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.customFields]));
      const oldIssues = new Map(options.dataMode === 'replace' ? [] : next.issues.map(issue => [issue.id, issue.customFields]));
      const tasks = structuredClone(file.data.tasks).map(task => {
        const highlights = task.highlightId === undefined && task.additionalHighlightIds === undefined
          ? existing.get(task.id) || [] : ColumnSchema.taskHighlightIds(task).map(highlight);
        const result = {
          ...task, statusId: status(task.statusId), urgencyId: urgency(task.urgencyId),
          tagIds: task.tagIds === undefined ? existingTags.get(task.id) || [] : [...new Set(task.tagIds.map(tag).filter(Boolean))],
          ...(task.customFields !== undefined || oldTasks.get(task.id) !== undefined ? { customFields: { ...(oldTasks.get(task.id) || {}), ...ColumnMerger.remapValues(task.customFields, maps.tasks.mapping, maps.tasks.valueMappings) } } : {})
        };
        ColumnSchema.setTaskHighlightIds(result, highlights);
        return result;
      });
      const issues = structuredClone(file.data.issues).map(issue => ({ ...issue, ...(issue.customFields !== undefined || oldIssues.get(issue.id) !== undefined ? { customFields: { ...(oldIssues.get(issue.id) || {}), ...ColumnMerger.remapValues(issue.customFields, maps.issues.mapping, maps.issues.valueMappings) } } : {}) }));
      if (options.dataMode === 'replace') { next.tasks = tasks; next.issues = issues; }
      else {
        const triple = issue => [issue.code, issue.incident, issue.problem].map(value => value.trim().toUpperCase()).join('\u0000');
        for (const task of tasks) {
          const index = next.tasks.findIndex(existing => existing.id === task.id);
          if (index >= 0) next.tasks[index] = task; else next.tasks.push(task);
        }
        for (const issue of issues) {
          const index = next.issues.findIndex(existing => existing.id === issue.id);
          if (index >= 0) next.issues[index] = issue;
          else if (!next.issues.some(existing => triple(existing) === triple(issue) && ColumnMerger.valuesKey(existing.customFields) === ColumnMerger.valuesKey(issue.customFields))) next.issues.push(issue);
        }
      }
      // Files from versions without groups keep the current ones, limited to the tasks that still exist.
      if (file.data.groups !== undefined) next.groups = options.dataMode === 'replace' ? structuredClone(file.data.groups) : TaskGroups.mergeGroups(next.groups, file.data.groups);
      if (file.data.todos !== undefined) next.todos = options.dataMode === 'replace' ? structuredClone(file.data.todos) : TodoLists.merge(next.todos, file.data.todos);
    }
    return ArchiveValidator.normalizeTags(ArchiveValidator.validateData(TaskGroups.prune(ColumnCleanup.cleanData(next))));
  }
  static importedOrganizationData(file, options = {}, fallbackLanguage = 'it') {
    const withSettings = Boolean(options.settings && file.settings);
    const base = DataFactory.baseData(withSettings ? file.settings.language : Common.validLanguage(fallbackLanguage) ? fallbackLanguage : 'it');
    if (options.data && file.data && !withSettings) {
      base.settings.deletedTaskColumns = [...ColumnSchema.deletedOf(file.data, 'tasks')];
      base.settings.deletedIssueColumns = [...ColumnSchema.deletedOf(file.data, 'issues')];
      base.settings.statuses = structuredClone(file.data.statuses);
      base.settings.urgencies = structuredClone(file.data.urgencies);
      if (file.data.highlights) base.settings.highlights = structuredClone(file.data.highlights);
      if (file.data.tags) base.settings.tags = structuredClone(file.data.tags);
    }
    return OrganizationTransfer.applyOrganizationImport(base, file, { ...options, logo: true, dataMode: 'replace' });
  }
  static uniqueOrganizationName(name, existingNames, fallback = "Imported organization") {
    const base = String(name ?? '').trim().slice(0, 100).trim() || fallback;
    const taken = new Set(existingNames.map(existing => existing.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let counter = 2; ; counter++) {
      const suffix = ` (${counter})`, candidate = base.slice(0, 100 - suffix.length).trimEnd() + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
}

if (typeof module !== 'undefined') module.exports = OrganizationTransfer;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).OrganizationTransfer = OrganizationTransfer;
})();
