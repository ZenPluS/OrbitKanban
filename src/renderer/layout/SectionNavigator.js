// Sidebar sections: the view each one opens, its name and the saved view it follows.
import { Component } from '../core/Component.js';
import { ColumnLayout, NavigationSections } from '../shared.js';

export class SectionNavigator extends Component {
  list = (settings = this.state.data.settings) => settings.navigation;
  typeOf = NavigationSections.typeOf;
  iconOf = type => type === 'views' ? this.ico('list') : this.icons[NavigationSections.typeIndex(type)];
  // Several sections can open the same view: the one picked last wins, then the one whose filters the task list holds.
  current() {
    const type = this.typeOf(this.state.view), list = this.list();
    if (!type || this.state.standaloneView === this.state.view) return null;
    return list.find(section => section.id === this.state.sectionId && section.type === type) || (type === 'tasks' && list.find(section => section.id === this.state.taskSectionId && section.type === type)) || list.find(section => section.type === type) || null;
  }
  nameOf(type, settings = this.state.data.settings) {
    return this.list(settings).find(section => section.type === type)?.name || NavigationSections.defaultName(type, settings.language || 'it');
  }
  title(type) {
    if (this.state.standaloneView === this.state.view) return NavigationSections.defaultName(type, this.currentLanguage());
    const current = this.current();
    return current?.type === type ? current.name : this.nameOf(type);
  }
  savedViewOf(section) {
    return section?.viewId ? (this.state.data.settings.savedViews || []).find(view => view.id === section.viewId) || null : null;
  }
  // Tasks of the open board: the ones of its saved view, or all of them.
  boardTasks(section = this.current()) {
    const saved = this.savedViewOf(section);
    return saved ? this.app.taskFilter.tasksOfView(saved) : this.state.data.tasks;
  }
  // Badge of a board that follows a saved view.
  viewChip(section = this.current()) {
    const saved = this.savedViewOf(section);
    return saved ? `<span class="view-label section-view-chip" title="${this.esc(this.app.savedViews.savedViewSummary(saved))}">${this.ico('filter')}${this.esc(this.app.transfer.fillText("View: {0}", saved.name))}</span>` : '';
  }
  // Count shown next to a task section in the sidebar.
  taskCount(section) {
    const saved = this.savedViewOf(section);
    return saved ? this.app.taskFilter.tasksOfView(saved, saved.showHidden).length : this.app.presenter.visibleTasks().length;
  }
  // A view whose sections were all deleted falls back to the first section of the menu.
  resolve() {
    if (!this.typeOf(this.state.view) || this.state.standaloneView === this.state.view) return;
    let section = this.current();
    if (!section) {
      section = this.list()[0];
      this.state.view = NavigationSections.typeIndex(section.type);
    }
    this.state.sectionId = section.id;
    if (section.type === 'tasks' && section.id !== this.state.taskSectionId) { this.state.taskSectionId = section.id; this.state.taskSectionViewId = ''; }
  }
  #resetTaskFilters() {
    Object.assign(this.state, { search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, activeSavedViewId: '' });
    this.state.columnFilters.tasks = {};
    this.state.sort = ColumnLayout.defaultSort(this.state.data.settings);
  }
  // Entering another task section applies its saved view, or starts again from every task.
  async open(id, applySavedView = true) {
    const list = this.list(), section = list.find(item => item.id === id);
    if (!section) return false;
    const previous = list.find(item => item.id === this.state.taskSectionId);
    this.state.view = NavigationSections.typeIndex(section.type);
    this.state.standaloneView = null;
    this.state.sectionId = section.id;
    if (section.type === 'tasks' && (section.viewId || section.id !== this.state.taskSectionId || (section.viewId || '') !== this.state.taskSectionViewId)) {
      this.state.taskSectionId = section.id;
      this.state.taskSectionViewId = section.viewId || '';
      const saved = this.savedViewOf(section);
      if (saved && applySavedView) { await this.app.savedViews.applySavedView(saved.id); return true; }
      if (previous && previous.id !== section.id) this.#resetTaskFilters();
    }
    this.app.shell.render();
    return true;
  }
  // Direct links still open a page when its menu sections have been removed.
  async openType(type, savedViewId) {
    if (!NavigationSections.TYPES.includes(type)) throw new Error(this.t("Invalid navigation sections."));
    const list = this.list(), current = this.current();
    const section = savedViewId !== undefined
      ? list.find(item => item.type === type && item.viewId === savedViewId) || list.find(item => item.type === type && !item.viewId)
      : (type === 'tasks' && list.find(item => item.id === this.state.taskSectionId && item.type === type)) || (current?.type === type && current) || list.find(item => item.type === type);
    if (section) return this.open(section.id, savedViewId === undefined);
    this.state.view = NavigationSections.typeIndex(type);
    this.state.standaloneView = this.state.view;
    this.state.sectionId = '';
    if (type === 'tasks') { this.state.taskSectionId = ''; this.state.taskSectionViewId = ''; }
    this.app.shell.render();
    return true;
  }
  openFirst = () => this.open(this.list()[0].id);
}
