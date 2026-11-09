'use strict';
// Sections of the sidebar: each one opens a view type under its own name and, for the task views, can follow a saved view.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class NavigationSections {
  // Settings and Guide keep their existing page numbers (4 and 5).
  static VIEW_IDS = { tasks: 0, issues: 1, milestones: 2, kanban: 3, views: 6, groups: 7 };
  static TYPES = Object.keys(NavigationSections.VIEW_IDS);
  static DEFAULT_NAMES = { tasks: "Tasks", issues: "Linked issues", milestones: "Milestones", kanban: 'Kanban', views: "Views", groups: "Group activities" };
  // Types that show tasks, so a saved view can filter them.
  static FILTERABLE = ['tasks', 'milestones', 'kanban'];
  static LIMIT = 12;
  static NAME_MAX = 60;
  static typeIndex = type => NavigationSections.VIEW_IDS[type] ?? -1;
  static typeOf = view => NavigationSections.TYPES.find(type => NavigationSections.typeIndex(type) === view);
  static defaultName(type, language = 'it') {
    const source = NavigationSections.DEFAULT_NAMES[type], value = Common.term(source, language).trim();
    return value && value.length <= NavigationSections.NAME_MAX ? value : source;
  }
  static defaultSections(language = 'it') {
    return NavigationSections.TYPES.map(type => ({ id: type, type, name: NavigationSections.defaultName(type, language) }));
  }
  // Up to 3.0 every organization had exactly the four views, renamed through "tabNames".
  static upgradeLegacyTabNames(settings) {
    if (!Common.plainObject(settings) || settings.navigation !== undefined || !Array.isArray(settings.tabNames) || settings.tabNames.length !== 4) return false;
    settings.navigation = NavigationSections.defaultSections(settings.language).map((section, index) => ({ ...section, name: index < 4 ? settings.tabNames[index] : section.name }));
    delete settings.tabNames;
    return true;
  }
  static validateNavigation(list) {
    Common.assert(Array.isArray(list) && list.length > 0, "Keep at least one navigation section.");
    Common.assert(list.length <= NavigationSections.LIMIT, "You can have up to 12 navigation sections.");
    Common.assert(list.every(section => Common.plainObject(section) && typeof section.name === 'string' && section.name.trim() && section.name.length <= NavigationSections.NAME_MAX), "Each navigation section needs a name of 1 to 60 characters.");
    Common.assert(list.every(section => typeof section.id === 'string' && section.id && section.id.length <= 200 && NavigationSections.TYPES.includes(section.type) &&
      (section.viewId === undefined || (NavigationSections.FILTERABLE.includes(section.type) && typeof section.viewId === 'string' && section.viewId && section.viewId.length <= 200))) &&
      new Set(list.map(section => section.id)).size === list.length, "Invalid navigation sections.");
    return list;
  }
  // A section whose saved view was deleted shows every task again.
  static normalizeNavigation(settings) {
    const known = new Set((settings.savedViews || []).map(view => view.id));
    for (const section of settings.navigation || []) if (section.viewId !== undefined && !known.has(section.viewId)) delete section.viewId;
    return settings;
  }
  // Menus saved before a view type existed get its section once, at the end, while there is room.
  static addMissingType(settings, type) {
    const list = settings?.navigation;
    if (!Array.isArray(list) || list.some(section => section.type === type) || list.length >= NavigationSections.LIMIT) return false;
    let id = type;
    for (let counter = 2; list.some(section => section.id === id); counter++) id = `${type}-${counter}`;
    list.push({ id, type, name: NavigationSections.defaultName(type, settings.language) });
    return true;
  }
}

if (typeof module !== 'undefined') module.exports = NavigationSections;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).NavigationSections = NavigationSections;
})();
