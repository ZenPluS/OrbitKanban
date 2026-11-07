// Saved views and ready-made release views of the task list.
import { Component } from '../core/Component.js';
import { ColumnFilters, Common } from '../shared.js';

export class SavedViews extends Component {
  // Every release date gets a ready-made view; ids are "release:<date>" ("release:" for tasks without a date) and are never stored.
  RELEASE_VIEW = 'release:';
  #releaseViewGroups() {
    const counts = new Map();
    if (!this.hasColumn('releaseDate')) return { upcoming: [], past: [], counts, unassigned: 0 };
    let unassigned = 0;
    for (const task of this.state.data.tasks) {
      if (task.hidden && !this.state.showHidden) continue;
      if (task.releaseDate) counts.set(task.releaseDate, (counts.get(task.releaseDate) || 0) + 1); else unassigned++;
    }
    const day = Common.today(), dates = [...counts.keys()].sort();
    return { upcoming: dates.filter(date => date >= day), past: dates.filter(date => date < day).reverse(), counts, unassigned };
  }
  releaseViewIds(groups = this.#releaseViewGroups()) {
    return [...groups.upcoming, ...groups.past, ...(groups.unassigned ? [''] : [])].map(date => this.RELEASE_VIEW + date);
  }
  releaseViewOptions(groups = this.#releaseViewGroups()) {
    const option = (date, label, count) => `<option value="${this.esc(this.RELEASE_VIEW + date)}" ${this.RELEASE_VIEW + date === this.state.activeSavedViewId ? 'selected' : ''}>${this.esc(`${label} (${count})`)}</option>`;
    const upcoming = groups.upcoming.map(date => option(date, `◷ ${this.app.presenter.formatDate(date)}`, groups.counts.get(date))).join('') + (groups.unassigned ? option('', `◌ ${this.t("Unassigned")}`, groups.unassigned) : '');
    const past = groups.past.map(date => option(date, `◷ ${this.app.presenter.formatDate(date)}`, groups.counts.get(date))).join('');
    return (upcoming ? `<optgroup label="${this.esc(this.t("Upcoming releases"))}">${upcoming}</optgroup>` : '') + (past ? `<optgroup label="${this.esc(this.t("Past releases"))}">${past}</optgroup>` : '');
  }
  applyReleaseView(id) {
    const date = id.slice(this.RELEASE_VIEW.length);
    if (!this.releaseViewIds().includes(id)) throw new Error(this.t("The saved view no longer exists."));
    this.state.search = ''; this.state.statusFilter = ''; this.state.highlightFilter = ''; this.state.duplicatesOnly = false;
    this.state.columnFilters.tasks = { releaseDate: date ? { ...ColumnFilters.emptyFilter(), values: [date] } : { ...ColumnFilters.emptyFilter(), empty: 'empty' } };
    this.state.activeSavedViewId = id;
    this.$('#modal').open && this.$('#modal').close();
    this.app.shell.render();
    this.app.notifier.notify(this.app.transfer.fillText("View “{0}” applied.", `Release ${date ? this.app.presenter.formatDate(date) : this.t("Unassigned")}`));
  }
  clearActiveSavedView() {
    if (!this.state.activeSavedViewId) return;
    this.state.activeSavedViewId = '';
    const select = this.$('#saved-view-select');
    if (select) select.value = '';
  }
  #savedViewSnapshot(name, id = this.uid()) {
    return {
      id, name: name.trim(), search: this.state.search, statusFilter: this.state.statusFilter, highlightFilter: this.state.highlightFilter, showHidden: this.state.showHidden, duplicatesOnly: this.state.duplicatesOnly,
      sort: structuredClone(this.state.sort), columns: this.configuredColumns(), columnFilters: structuredClone(this.state.columnFilters.tasks)
    };
  }
  savedViewSummary(saved) {
    const status = this.state.data.settings.statuses.find(item => item.id === saved.statusFilter)?.name;
    const mark = this.app.presenter.highlightsOf().find(item => item.id === saved.highlightFilter)?.name;
    const columns = saved.columns.filter(column => column.visible).length;
    const order = saved.sort.map(item => `${this.app.columns.columnDef(item.key) ? this.app.columns.columnName(item.key) : this.t(Object.values(this.app.columns.taskColumnDefs).find(column => column.sort === item.key)?.name || item.key)} ${item.direction === 'asc' ? '↑' : '↓'}`).join(', ');
    return [saved.search && this.app.transfer.fillText("Search: {0}", saved.search), status && this.app.transfer.fillText("Status: {0}", status), mark && this.app.transfer.fillText("Highlight: {0}", mark),
      saved.highlightFilter === '__any' && this.t("Highlighted only"), saved.highlightFilter === '__none' && this.t("Not highlighted"),
      saved.showHidden && this.t("Include hidden"), saved.duplicatesOnly && this.t("Duplicates only"),
      this.app.transfer.fillText("{0} columns", columns), ...Object.keys(saved.columnFilters || {}).map(id => this.app.columns.columnName(id)), order && this.app.transfer.fillText("Sort: {0}", order)].filter(Boolean).join(' · ') || this.t("All tasks");
  }
  async saveSavedView(name, existingId = '') {
    const normalized = name.trim();
    if (!normalized || normalized.length > 60) throw new Error(this.t("The view name must contain 1 to 60 characters."));
    const saved = this.#savedViewSnapshot(normalized, existingId || this.uid());
    await this.app.history.commit(next => {
      const list = next.settings.savedViews || (next.settings.savedViews = []);
      const duplicate = list.find(item => item.id !== saved.id && item.name.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase());
      if (duplicate) throw new Error(this.t("A view with this name already exists."));
      const index = list.findIndex(item => item.id === saved.id);
      if (index >= 0) list[index] = saved;
      else {
        if (list.length >= 30) throw new Error(this.t("You have reached the limit of 30 saved views."));
        list.push(saved);
      }
    });
    this.state.activeSavedViewId = saved.id;
    this.$('#modal').close();
    this.app.shell.rerenderPreservingView();
    this.app.notifier.notify(existingId ? "View updated." : "View saved.");
  }
  async applySavedView(id) {
    const saved = (this.state.data.settings.savedViews || []).find(item => item.id === id);
    if (!saved) throw new Error(this.t("The saved view no longer exists."));
    const columns = this.configuredColumns('tasks', this.state.data.settings, saved.columns);
    if (JSON.stringify(columns) !== JSON.stringify(this.configuredColumns())) {
      await this.app.history.commit(next => { next.settings.taskColumns = structuredClone(columns); });
    }
    this.state.search = saved.search;
    this.state.statusFilter = this.state.data.settings.statuses.some(item => item.id === saved.statusFilter) ? saved.statusFilter : '';
    this.state.highlightFilter = ['__any', '__none'].includes(saved.highlightFilter) || this.app.presenter.highlightsOf().some(item => item.id === saved.highlightFilter) ? saved.highlightFilter : '';
    this.state.showHidden = saved.showHidden;
    this.state.duplicatesOnly = saved.duplicatesOnly;
    this.state.columnFilters.tasks = structuredClone(saved.columnFilters || {});
    this.state.sort = structuredClone(saved.sort);
    this.state.activeSavedViewId = saved.id;
    this.$('#modal').open && this.$('#modal').close();
    this.app.shell.render();
    this.app.notifier.notify(this.app.transfer.fillText("View “{0}” applied.", saved.name));
  }
  #renderSavedViewList() {
    const list = this.$('#saved-view-list');
    if (!list) return;
    const savedViews = this.state.data.settings.savedViews || [];
    list.innerHTML = savedViews.length ? savedViews.map(saved => `<article class="saved-view-item"><div class="saved-view-info"><strong>${this.esc(saved.name)}</strong><small>${this.esc(this.savedViewSummary(saved))}</small></div><button type="button" class="button small primary" data-view-action="apply" data-view-id="${this.esc(saved.id)}">${this.esc(this.t("Open"))}</button><button type="button" class="button small" data-view-action="update" data-view-id="${this.esc(saved.id)}">${this.esc(this.t("Update"))}</button><button type="button" class="button small danger" data-view-action="delete" data-view-id="${this.esc(saved.id)}" aria-label="${this.esc(this.app.transfer.fillText("Delete view {0}", saved.name))}">${this.ico('close')}</button></article>`).join('') : `<p class="backup-empty">${this.esc(this.t("You have not saved any views yet."))}</p>`;
  }
  openSavedViews() {
    this.app.modal.openModal(this.ui`<div class="modal-heading"><div><div class="eyebrow">${this.esc(this.t("TASK"))}</div><h2>${this.esc(this.t("Saved views"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div><p class="section-description">${this.esc(this.t("Save filters, sorting and columns to reapply them in one click. Views belong to this organization only."))}</p><p class="filter-note">${this.esc(this.t("A view for every release date is created automatically: you find them in the views menu, under “Upcoming releases” and “Past releases”."))}</p><form id="saved-view-form" class="form-grid"><label class="field full">${this.esc(this.t("View name"))}<input name="name" maxlength="60" required autocomplete="off" placeholder="${this.esc(this.t("e.g. Next release"))}"></label><div class="modal-actions full"><span class="spacer"></span><button type="submit" class="button primary">${this.esc(this.t("Save current view"))}</button></div></form><div class="saved-view-list" id="saved-view-list"></div>`);
    const form = this.$('#saved-view-form');
    form.onsubmit = this.app.notifier.action(async event => { event.preventDefault(); await this.saveSavedView(new FormData(form).get('name')); });
    this.$('#saved-view-list').onclick = this.app.notifier.action(async event => {
      const button = event.target.closest('[data-view-action]');
      if (!button) return;
      const saved = (this.state.data.settings.savedViews || []).find(item => item.id === button.dataset.viewId);
      if (!saved) throw new Error(this.t("The saved view no longer exists."));
      if (button.dataset.viewAction === 'apply') return this.applySavedView(saved.id);
      if (button.dataset.viewAction === 'update') return this.saveSavedView(saved.name, saved.id);
      if (button.dataset.viewAction === 'delete') this.app.modal.confirmDialog("Delete the saved view?", saved.name, async () => {
        await this.app.history.commit(next => { next.settings.savedViews = (next.settings.savedViews || []).filter(item => item.id !== saved.id); });
        if (this.state.activeSavedViewId === saved.id) this.state.activeSavedViewId = '';
        this.app.shell.rerenderPreservingView();
        this.app.notifier.notify("View deleted.");
      });
    });
    this.#renderSavedViewList();
  }
}
