'use strict';
// Validates and migrates the workspace archive and its organizations.
(() => {
const ColumnSchema = typeof module !== 'undefined' ? require('../columns/ColumnSchema') : globalThis.OrbitKanban.Columns.ColumnSchema;
const RequiredFields = typeof module !== 'undefined' ? require('../columns/RequiredFields') : globalThis.OrbitKanban.Columns.RequiredFields;
const ColumnLayout = typeof module !== 'undefined' ? require('../columns/ColumnLayout') : globalThis.OrbitKanban.Columns.ColumnLayout;
const ColumnFilters = typeof module !== 'undefined' ? require('../columns/ColumnFilters') : globalThis.OrbitKanban.Columns.ColumnFilters;
const ColumnCleanup = typeof module !== 'undefined' ? require('../columns/ColumnCleanup') : globalThis.OrbitKanban.Columns.ColumnCleanup;
const ColumnValidator = typeof module !== 'undefined' ? require('../columns/ColumnValidator') : globalThis.OrbitKanban.Columns.ColumnValidator;
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;
const Typography = typeof module !== 'undefined' ? require('./Typography') : globalThis.OrbitKanban.Domain.Typography;
const Limits = typeof module !== 'undefined' ? require('./Limits') : globalThis.OrbitKanban.Domain.Limits;
const TaskLayout = typeof module !== 'undefined' ? require('./TaskLayout') : globalThis.OrbitKanban.Domain.TaskLayout;
const ThemeCatalog = typeof module !== 'undefined' ? require('./ThemeCatalog') : globalThis.OrbitKanban.Domain.ThemeCatalog;
const TaskLinks = typeof module !== 'undefined' ? require('./TaskLinks') : globalThis.OrbitKanban.Domain.TaskLinks;
const NavigationSections = typeof module !== 'undefined' ? require('./NavigationSections') : globalThis.OrbitKanban.Domain.NavigationSections;
const TaskGroups = typeof module !== 'undefined' ? require('./TaskGroups') : globalThis.OrbitKanban.Domain.TaskGroups;
const TodoLists = typeof module !== 'undefined' ? require('./TodoLists') : globalThis.OrbitKanban.Domain.TodoLists;
const AppearancePacks = typeof module !== 'undefined' ? require('./AppearancePacks') : globalThis.OrbitKanban.Domain.AppearancePacks;
const LogoCrop = typeof module !== 'undefined' ? require('../graphics/LogoCrop') : globalThis.OrbitKanban.Graphics.LogoCrop;

class ArchiveValidator {
  static validateData(data) {
    Common.assert(data && data.version === 1, "Unsupported archive format.");
    const s = data.settings;
    AppearancePacks.validateSettings(s || {});
    ColumnCleanup.validateDeleted(s || {});
    RequiredFields.validateRequired(s || {});
    Common.assert(s && (s.appName === undefined || (typeof s.appName === 'string' && s.appName.trim().length > 0 && s.appName.length <= 100)), "Invalid organization name.");
    NavigationSections.validateNavigation(s.navigation);
    Common.assert(Number.isFinite(s.hoursPerDay) && s.hoursPerDay > 0 && s.hoursPerDay <= 24, "Hours per day must be greater than 0 and no more than 24.");
    const uniqueIds = (items) => new Set(items.map(x => x.id)).size === items.length;
    const text = v => typeof v === 'string';
    const color = v => /^#[0-9a-f]{6}$/i.test(v);
    Common.assert(s.language === undefined || Common.validLanguage(s.language), "Unsupported language.");
    Common.assert(s.logo === undefined || s.logo === '' || (text(s.logo) && s.logo.length <= 1500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.logo)), "Invalid logo.");
    Common.assert(s.logoSource === undefined || s.logoSource === '' || (text(s.logoSource) && s.logoSource.length <= 1500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.logoSource)), "Invalid original logo.");
    Common.assert(s.logoShape === undefined || LogoCrop.valid(s.logoShape), "Invalid logo shape.");
    Common.assert(s.fontSizes === undefined || Typography.validFontSizes(s.fontSizes), "Invalid text sizes.");
    Common.assert(s.fontFamily === undefined || Typography.validFontFamily(s.fontFamily), "Invalid font.");
    Common.assert(s.taskEditorLayout === undefined || TaskLayout.validTaskEditorLayout(s.taskEditorLayout), "Invalid task editor layout.");
    for (const key of ['statuses', 'urgencies']) {
      Common.assert(Array.isArray(s[key]) && uniqueIds(s[key]), `The ${key} list is invalid or empty.`);
      Common.assert(s[key].every(x => text(x.id) && x.id && text(x.name) && x.name.trim() && color(x.color)), `Invalid ${key} values.`);
    }
    Common.assert(s.statuses.every(x => typeof x.highlight === 'boolean'), "Invalid status highlighting.");
    Common.assert(s.highlights === undefined || (Array.isArray(s.highlights) && s.highlights.length <= Limits.HIGHLIGHT_LIMIT && s.highlights.every(x => x && text(x.id) && x.id && text(x.name) && x.name.trim() && x.name.length <= Limits.HIGHLIGHT_NAME_MAX && color(x.color)) && uniqueIds(s.highlights)), "Invalid highlighters.");
    Common.assert(s.tags === undefined || (Array.isArray(s.tags) && s.tags.length <= Limits.TAG_LIMIT && s.tags.every(x => x && text(x.id) && x.id && x.id.length <= 200 && text(x.name) && x.name.trim() && x.name.length <= Limits.TAG_NAME_MAX && color(x.color)) && uniqueIds(s.tags)), "Invalid tags.");
    Common.assert(s.tags === undefined || new Set(s.tags.map(tag => tag.name.trim().toLowerCase())).size === s.tags.length, "Tag names must be unique.");
    ColumnValidator.validateFields(ColumnSchema.fieldsOf(s, 'tasks'), 'tasks');
    ColumnValidator.validateFields(ColumnSchema.fieldsOf(s, 'issues'), 'issues');
    const taskColumnIds = ColumnSchema.schemaOf(s, 'tasks').map(field => field.id);
    const issueColumnIds = ColumnSchema.schemaOf(s, 'issues').map(field => field.id);
    const filterTypes = { sequence: 'number', effort: 'effort', releaseDate: 'date', ...Object.fromEntries((s.taskFields || []).map(field => [field.id, field.type])) };
    const sortKeys = ColumnLayout.sortKeys(s);
    Common.assert(s.taskColumns === undefined || (Array.isArray(s.taskColumns) && s.taskColumns.every(c => c && text(c.id) && c.id && typeof c.visible === 'boolean') && uniqueIds(s.taskColumns) && (!taskColumnIds.length || s.taskColumns.some(c => c.visible && taskColumnIds.includes(c.id)))), "Invalid list columns.");
    Common.assert(s.issueColumns === undefined || (Array.isArray(s.issueColumns) && s.issueColumns.every(c => c && text(c.id) && typeof c.visible === 'boolean') && uniqueIds(s.issueColumns) && (!issueColumnIds.length || s.issueColumns.some(c => c.visible && issueColumnIds.includes(c.id)))), "Invalid list columns.");
    Common.assert(s.savedViews === undefined || (Array.isArray(s.savedViews) && s.savedViews.length <= Limits.SAVED_VIEW_LIMIT && s.savedViews.every(view =>
      view && text(view.id) && view.id && view.id.length <= 200 && text(view.name) && view.name.trim() && view.name.length <= Limits.SAVED_VIEW_NAME_MAX &&
      text(view.search) && view.search.length <= 200 && text(view.statusFilter) && view.statusFilter.length <= 200 &&
      text(view.highlightFilter) && view.highlightFilter.length <= 200 && typeof view.showHidden === 'boolean' &&
      typeof view.duplicatesOnly === 'boolean' && Array.isArray(view.sort) && (!sortKeys.length || view.sort.length > 0) && view.sort.length <= sortKeys.length &&
      view.sort.every(item => item && sortKeys.includes(item.key) && ['asc', 'desc'].includes(item.direction)) &&
      new Set(view.sort.map(item => item.key)).size === view.sort.length && Array.isArray(view.columns) &&
      view.columns.every(column => column && taskColumnIds.includes(column.id) && typeof column.visible === 'boolean') &&
      uniqueIds(view.columns) && (!taskColumnIds.length || view.columns.some(column => column.visible)) && ColumnFilters.validFilters(view.columnFilters, taskColumnIds, filterTypes)
    ) && uniqueIds(s.savedViews) && new Set(s.savedViews.map(view => view.name.trim().toLocaleLowerCase())).size === s.savedViews.length), "Invalid saved views.");
    Common.assert(Array.isArray(s.themes) && s.themes.length > 0 && uniqueIds(s.themes) && s.themes.every(t => text(t.id) && t.id && text(t.name) && t.name.trim() && ['background', 'surface', 'text', 'accent'].every(k => color(t[k]))), "Invalid themes.");
    Common.assert(s.themes.some(t => t.id === s.themeId), "Selected theme does not exist.");
    Common.assert(Array.isArray(data.tasks) && uniqueIds(data.tasks), "Invalid task list.");
    for (const t of data.tasks) {
      Common.assert(['id', 'code', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId'].every(k => text(t[k])) && t.id, "Incomplete task.");
      Common.assert(Number.isInteger(t.sequence) && t.sequence >= 0, "Sequence must be a non-negative integer.");
      Common.assert(Number.isFinite(t.effortHours) && t.effortHours >= 0, "Invalid effort.");
      Common.assert(typeof t.hidden === 'boolean', "Invalid visibility.");
      Common.assert(t.highlightId === undefined || (text(t.highlightId) && t.highlightId.length <= 200), "Invalid task highlight.");
      Common.assert(t.additionalHighlightIds === undefined || (Array.isArray(t.additionalHighlightIds) && t.additionalHighlightIds.length < Limits.HIGHLIGHT_LIMIT &&
        t.additionalHighlightIds.every(id => text(id) && id && id.length <= 200 && id !== t.highlightId) &&
        new Set(t.additionalHighlightIds).size === t.additionalHighlightIds.length), "Invalid task highlight.");
      Common.assert(t.tagIds === undefined || (Array.isArray(t.tagIds) && t.tagIds.length <= Limits.TAG_LIMIT && t.tagIds.every(tagId => text(tagId) && tagId && tagId.length <= 200) && new Set(t.tagIds).size === t.tagIds.length), "Invalid task tags.");
      Common.assert(!t.releaseDate || (/^\d{4}-\d{2}-\d{2}$/.test(t.releaseDate) && !Number.isNaN(Date.parse(t.releaseDate)) && new Date(t.releaseDate).toISOString().slice(0, 10) === t.releaseDate), "Invalid release date.");
      Common.assert((!t.statusId || s.statuses.some(x => x.id === t.statusId)) && (!t.urgencyId || s.urgencies.some(x => x.id === t.urgencyId)), "Missing status or urgency.");
    }
    Common.assert(Array.isArray(data.issues) && uniqueIds(data.issues), "Invalid issue list.");
    Common.assert(data.issues.every(x => ['id', 'code', 'incident', 'problem'].every(k => text(x[k])) && x.id), "Invalid issue list.");
    if (data.groups !== undefined) TaskGroups.validateGroups(data.groups);
    if (data.todos !== undefined) TodoLists.validate(data.todos);
    ColumnValidator.validateCustomData(data);
    return data;
  }
  static migrateArchive(input) {
    const archive = structuredClone(input);
    Common.assert(archive?.format !== 'orbitkanban-organization', "This file is an organization export (themes, settings or data): use “Import from file…” in the “Export and import organization” section.");
    if (archive.version === 1) {
      TaskLinks.upgradeLegacyLink(archive.settings, archive.tasks, { language: archive.settings?.language ?? 'it' });
      NavigationSections.upgradeLegacyTabNames(archive.settings);
      ArchiveValidator.validateData(archive);
      const organizationId = Common.id();
      return ArchiveValidator.validateArchive({
        version: 2, activeOrganizationId: organizationId,
        organizations: [{ id: organizationId, name: archive.settings.appName || Common.term("Main organization", archive.settings.language ?? 'it'), data: archive }]
      });
    }
    return ArchiveValidator.validateArchive(archive);
  }
  static validateArchive(archive) {
    Common.assert(archive && archive.version === 2, "Unsupported archive format.");
    Common.assert(Array.isArray(archive.organizations) && archive.organizations.length > 0, "At least one organization must exist.");
    Common.assert(archive.organizations.every(o => o && typeof o.id === 'string' && o.id && typeof o.name === 'string' && o.name.trim() && o.name.length <= 100), "Invalid organization.");
    Common.assert(new Set(archive.organizations.map(o => o.id)).size === archive.organizations.length, "Duplicate organizations.");
    Common.assert(archive.organizations.some(o => o.id === archive.activeOrganizationId), "The active organization does not exist.");
    for (const organization of archive.organizations) {
      TaskLinks.upgradeLegacyLink(organization.data?.settings, organization.data?.tasks, { language: organization.data?.settings?.language ?? 'it' });
      NavigationSections.upgradeLegacyTabNames(organization.data?.settings);
      ArchiveValidator.validateData(organization.data);
      // Organizations saved before 3.2 get the group activities section once; the empty list marks them as upgraded.
      if (organization.data.groups === undefined) {
        NavigationSections.addMissingType(organization.data.settings, 'groups');
        organization.data.groups = [];
      }
      if (organization.data.todos === undefined) {
        NavigationSections.addMissingType(organization.data.settings, 'todos');
        organization.data.todos = [];
      }
      TaskGroups.prune(organization.data);
      organization.data.settings.language ??= 'it';
      organization.data.settings.logo ??= '';
      organization.data.settings.logoSource ??= '';
      organization.data.settings.logoShape ??= 'none';
      if (organization.data.settings.packSources === undefined) organization.data.settings.packSources = [];
      if (organization.data.settings.iconPack === undefined) organization.data.settings.iconPack = 'default';
      if (organization.data.settings.packThemeBases === undefined) organization.data.settings.packThemeBases = Object.fromEntries(ThemeCatalog.availableThemes().filter(theme => theme.id !== 'midnight').map(theme => [theme.id, { ...theme }]));
      organization.data.settings.fontSizes ??= Typography.defaultFontSizes();
      organization.data.settings.fontFamily ??= Typography.DEFAULT_FONT_FAMILY;
      organization.data.settings.savedViews ??= [];
      organization.data.settings.taskFields ??= [];
      organization.data.settings.issueFields ??= [];
      for (const kind of ['tasks', 'issues']) for (const field of ColumnSchema.fieldsOf(organization.data.settings, kind)) field.options = ColumnSchema.choices(field);
      organization.data.settings.issueColumns = ColumnLayout.listColumns(organization.data.settings, 'issues');
      for (const kind of ['tasks', 'issues']) organization.data.settings[RequiredFields.requiredKey(kind)] = RequiredFields.requiredOf(organization.data.settings, kind);
      organization.data.settings.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(organization.data.settings);
      NavigationSections.normalizeNavigation(organization.data.settings);
      ThemeCatalog.normalizeThemes(organization.data.settings);
      ArchiveValidator.#normalizeHighlights(organization.data);
      ArchiveValidator.normalizeTags(organization.data);
      delete organization.data.settings.appName;
    }
    return archive;
  }
  // Archives written before highlighters existed get the default colors, the default columns and unhighlighted tasks.
  static #normalizeHighlights(data) {
    const settings = data.settings;
    settings.highlights ??= ThemeCatalog.defaultHighlights(settings.language || 'it');
    settings.taskColumns = ColumnLayout.listColumns(settings, 'tasks');
    const known = new Set(settings.highlights.map(highlight => highlight.id));
    for (const task of data.tasks) ColumnSchema.setTaskHighlightIds(task, ColumnSchema.taskHighlightIds(task).filter(id => known.has(id)));
    return data;
  }
  static normalizeTags(data) {
    data.settings.tags ??= [];
    const known = new Set(data.settings.tags.map(tag => tag.id));
    for (const task of data.tasks) task.tagIds = (task.tagIds || []).filter(tagId => known.has(tagId));
    return data;
  }
}

if (typeof module !== 'undefined') module.exports = ArchiveValidator;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).ArchiveValidator = ArchiveValidator;
})();
