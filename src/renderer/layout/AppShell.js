// Renders the current view and the chrome, and adopts workspace snapshots and remote changes.
import { Component } from '../core/Component.js';
import { ArchiveValidator, ColumnFilters, ColumnLayout, ColumnSchema, Common, NavigationSections, Typography } from '../shared.js';

export class AppShell extends Component {
  constructor(app) {
    super(app);
    this.onWorkspaceChange = this.onWorkspaceChange.bind(this);
  }
  paintFontSizes(sizes) {
    const values = { ...Typography.defaultFontSizes(), ...sizes };
    for (const { id } of Typography.FONT_SIZE_PARTS) document.documentElement.style.setProperty(`--fs-${id}`, String(values[id] / 100));
  }
  #applyTheme() {
    const theme = this.state.data.settings.themes.find(t => t.id === this.state.data.settings.themeId);
    this.app.themePainter.paintTheme(theme);
    this.paintFontSizes(this.state.data.settings.fontSizes);
    this.app.fontSettings.paintFontFamily(this.state.data.settings.fontFamily);
    const organization = this.state.organizations.find(o => o.id === this.state.activeOrganizationId);
    document.title = this.browserMode() ? `${organization.name} · ${Common.APP_NAME}` : Common.APP_NAME;
    this.$('#brand-name').textContent = Common.APP_NAME;
    this.app.logoPainter.paintLogo(theme, organization);
  }
  render() {
    this.app.colorPicker.closeColorPicker();
    this.app.rowMarks.closeMarkMenu();
    this.app.tagMenu.closeTagMenu();
    this.app.sections.resolve();
    const content = this.$('#content'), nextView = ['tasks', 'issues', 'milestones', 'kanban', 'settings', 'guide', 'views', 'groups'][this.state.view];
    if (content.dataset.workspaceView !== nextView) content.scrollTop = 0;
    content.dataset.workspaceView = nextView;
    this.#applyTheme();
    this.renderChrome();
    const duplicates = this.app.taskFilter.duplicatesOf(), alerts = [duplicates.tasks.size, duplicates.issues.size];
    const alert = i => {
      if (!alerts[i]) return '';
      const label = this.app.transfer.fillText(i ? "{0} associations with a duplicate incident" : "{0} tasks with a duplicate incident", alerts[i]);
      return `<span class="nav-alert" title="${this.esc(label)}"><span aria-hidden="true">${alerts[i]}</span><span class="sr-only">${this.esc(label)}</span></span>`;
    };
    const current = this.app.sections.current();
    this.$('#navigation').innerHTML = this.app.sections.list().map(section => {
      const { id, name } = section, i = NavigationSections.typeIndex(section.type);
      return `<button class="nav-button ${current?.id === id ? 'active' : ''}" data-view="${i}" data-section="${this.esc(id)}"${this.app.sidebar.sidebarCollapsed ? ` title="${this.esc(name)}"` : ''}><span class="nav-icon">${this.app.sections.iconOf(section.type)}${alert(i)}</span><span class="nav-label">${this.esc(name)}</span>${i === 0 ? `<span class="nav-count">${this.app.sections.taskCount(section)}</span>` : ''}</button>`;
    }).join('');
    document.querySelectorAll('#navigation [data-section]').forEach(button => button.onclick = this.app.notifier.action(() => this.app.sections.open(button.dataset.section)));
    this.$('#settings-button').classList.toggle('active', this.state.view === 4);
    this.$('#guide-button').classList.toggle('active', this.state.view === 5);
    this.$('#current-tab').textContent = this.state.view === 4 ? this.t("Settings") : this.state.view === 5 ? this.term("Guide") : this.app.sections.title(this.app.sections.typeOf(this.state.view));
    if (this.state.view === 0) this.app.taskList.renderTasks();
    if (this.state.view === 1) this.app.issues.renderIssues();
    if (this.state.view === 2) this.app.milestones.renderMilestones();
    if (this.state.view === 3) this.app.kanban.renderKanban();
    if (this.state.view === 4) this.app.settingsView.renderSettings();
    if (this.state.view === 5) this.app.guide.renderGuide();
    if (this.state.view === 6) this.app.viewsPage.renderViews();
    if (this.state.view === 7) this.app.groupsPage.renderGroups();
  }
  adoptSnapshot(snapshot) {
    if (this.state.activeOrganizationId !== snapshot.activeOrganizationId) { this.state.columnFilters = { tasks: {}, issues: {} }; this.state.issueSearch = ''; this.state.taskSectionId = ''; this.state.taskSectionViewId = ''; this.state.standaloneView = null; }
    this.state.data = ArchiveValidator.validateData(snapshot.data);
    if (!this.hasColumn('status')) this.state.statusFilter = '';
    if (!this.hasColumn('highlight')) { this.state.highlightFilter = ''; this.state.highlighter = ''; this.app.rowMarks.pendingMarks.clear(); }
    this.state.sort = this.state.sort.filter(entry => ColumnLayout.sortKeys(this.state.data.settings).includes(entry.key));
    if (!this.state.sort.length) this.state.sort = ColumnLayout.defaultSort(this.state.data.settings);
    for (const kind of ['tasks', 'issues']) this.state.columnFilters[kind] = Object.fromEntries(Object.entries(this.state.columnFilters[kind]).filter(([id]) => this.app.columns.columnDef(id, kind)));
    for (const kind of ['tasks', 'issues']) for (const field of ColumnSchema.schemaOf(this.state.data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type))) {
      const filter = this.state.columnFilters[kind][field.id];
      if (filter) {
        const known = ColumnSchema.choices(field).map(option => option.id);
        filter.values = filter.values.filter(value => value === ColumnFilters.EMPTY_VALUE || known.includes(value));
        if (!ColumnFilters.activeFilter(filter)) delete this.state.columnFilters[kind][field.id];
      }
    }
    this.state.dataFolder = snapshot.dataFolder;
    this.state.organizations = snapshot.organizations;
    this.state.activeOrganizationId = snapshot.activeOrganizationId;
    this.state.revision = snapshot.revision || '';
    this.state.appVersion = snapshot.appVersion || this.state.appVersion;
    this.state.browserUrl = snapshot.browserUrl ?? this.state.browserUrl;
    this.state.adoptions++;
  }
  renderChrome() {
    document.documentElement.lang = this.state.data.settings.language;
    this.$('.brand small').textContent = this.t("YOUR PERSONAL WORKSPACE");
    this.$('.workspace-label').innerHTML = this.ui`WORKSPACE <span>LOCAL</span>`;
    this.$('#settings-button').innerHTML = this.ui`<span class="nav-icon">${this.ico('settings')}</span><span class="nav-label">Settings</span>`;
    this.$('#guide-button').innerHTML = `<span class="nav-icon">${this.ico('book')}</span><span class="nav-label">${this.esc(this.term("Guide"))}</span>`;
    this.$('#guide-button').title = this.term("Open the guide (F1)");
    this.$('.local-card strong').textContent = this.t("Only on your device");
    this.$('.local-card small').textContent = this.t("Your data. Always with you.");
    this.$('footer>span').innerHTML = this.ui`<i class="connection-dot"></i> No cloud. No account. Everything under control.`;
    this.$('#folder-button').innerHTML = `${this.ico('folder')}<span>${this.esc(this.t("Open data folder"))}</span>`;
    this.$('#global-search-label').textContent = this.t("Search");
    this.$('#global-search').title = this.t("Search OrbitKanban (Ctrl+K)");
    this.#renderConnectionStatus();
    this.$('#navigation').setAttribute('aria-label', this.t("Main views"));
    this.$('.organization-switcher label').textContent = this.t("Organization");
    this.$('#manage-organizations').textContent = this.t("Manage organizations");
    this.$('#organization-select').innerHTML = this.state.organizations.map(o => `<option value="${this.esc(o.id)}" ${o.id === this.state.activeOrganizationId ? 'selected' : ''}>${this.esc(o.name)}</option>`).join('');
    this.$('#open-browser').innerHTML = `${this.ico('globe')}<span class="nav-label">${this.esc(this.t(this.browserMode() ? "Open in new tab" : "Open in browser"))}</span>`;
    this.$('#open-browser').disabled = !this.state.browserUrl;
    this.$('.version').innerHTML = `${this.browserMode() ? 'BROWSER' : 'PORTABLE'} EDITION <span id="app-version">${this.esc(this.state.appVersion ? `v${this.state.appVersion}` : '')}</span>`;
    this.app.sidebar.applySidebar();
    this.app.history.updateHistoryButtons();
    this.app.updates.drawUpdateNotice();
  }
  #renderConnectionStatus() {
    const status = this.$('#save-status');
    status.classList.toggle('offline', !this.state.online);
    status.innerHTML = !this.state.online ? this.ui`<i class="connection-dot"></i> App not reachable` : this.browserMode() ? this.ui`<i class="connection-dot"></i> Synced with the app` : this.ui`<i class="connection-dot"></i> Local archive`;
  }
  #sameOrganizations(list) {
    return list.length === this.state.organizations.length && list.every((o, i) => this.state.organizations[i].id === o.id && this.state.organizations[i].name === o.name);
  }
  settingsDraftPending() {
    return this.state.view === 4 && Boolean(this.$('#organization-name')) && (this.app.settings.settingsChanged() || Boolean(this.$('#create-organization-section')?.open));
  }
  rerenderPreservingView() {
    const page = document.scrollingElement, pageScroll = [page.scrollLeft, page.scrollTop];
    const selectors = ['#content', '.table-scroll', '.milestone-scroll', '.kanban-scroll', '.theme-gallery', '.settings-nav', '.guide-nav'];
    const scrolls = selectors.map(selector => [...document.querySelectorAll(selector)].map(el => [el.scrollLeft, el.scrollTop]));
    const focused = document.activeElement, focusId = focused?.id || '';
    const selection = focusId && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
    const issueQuery = this.$('#issue-search')?.value || '';
    this.render();
    if (issueQuery && this.$('#issue-search')) { this.$('#issue-search').value = issueQuery; this.$('#issue-search').dispatchEvent(new Event('input')); }
    selectors.forEach((selector, index) => document.querySelectorAll(selector).forEach((el, i) => { if (scrolls[index][i]) [el.scrollLeft, el.scrollTop] = scrolls[index][i]; }));
    page.scrollTo(...pageScroll);
    const element = focusId && document.getElementById(focusId);
    if (element && element !== document.activeElement) {
      element.focus({ preventScroll: true });
      if (selection) try { element.setSelectionRange(...selection); } catch {}
    }
  }
  #applyRemoteSnapshot(snapshot, previousId) {
    if (snapshot.activeOrganizationId !== previousId) {
      this.state.renderAfterModal = false;
      if (this.$('#modal').open) this.$('#modal').close();
      this.adoptSnapshot(snapshot);
      this.state.search = ''; this.state.statusFilter = ''; this.state.highlightFilter = ''; this.state.highlighter = ''; this.state.selectedTasks.clear(); this.state.showHidden = false; this.state.duplicatesOnly = false; this.state.issueDuplicatesOnly = false; this.state.activeSavedViewId = ''; this.state.sort = [{ key: 'releaseDate', direction: 'asc' }];
      this.render();
      this.app.notifier.notify("The open organization was deleted in another window. You are now viewing another organization.", true);
      return;
    }
    if (snapshot.revision === this.state.revision && this.#sameOrganizations(snapshot.organizations)) return;
    const keepDraft = this.settingsDraftPending();
    this.adoptSnapshot(snapshot);
    if (this.$('#modal').open) { this.state.renderAfterModal = true; this.renderChrome(); return; }
    if (keepDraft) {
      this.renderChrome(); this.app.settings.refreshSettingsState();
      this.app.notifier.notify("Data updated from another window. Your unsaved settings are kept: saving them will take precedence.");
      return;
    }
    this.rerenderPreservingView();
  }
  flushPendingChange() {
    if (!this.state.pendingChange || this.state.saving || this.state.organizationBusy || this.state.refreshing) return;
    const info = this.state.pendingChange;
    this.state.pendingChange = null;
    setTimeout(() => this.onWorkspaceChange(info));
  }
  onWorkspaceChange(info) {
    if (!this.state.data || !info) return;
    if (this.state.saving || this.state.organizationBusy || this.state.refreshing) { this.state.pendingChange = this.state.pendingChange?.forced ? this.state.pendingChange : info; return; }
    if (!info.forced) {
      const mine = info.organizations?.find(o => o.id === this.state.activeOrganizationId);
      if (mine && mine.revision === this.state.revision && this.#sameOrganizations(info.organizations)) return;
    }
    this.#refreshFromWorkspace();
  }
  async #refreshFromWorkspace() {
    this.state.refreshing = true;
    const generation = this.state.adoptions, previousId = this.state.activeOrganizationId;
    try {
      const snapshot = await this.workspaceApi.load(previousId);
      if (generation === this.state.adoptions) this.#applyRemoteSnapshot(snapshot, previousId);
    } catch (error) {
      if (error.code !== 'offline') this.app.notifier.notify(error.message, true);
    } finally { this.state.refreshing = false; this.flushPendingChange(); }
  }
  subscribe() {
    if (this.state.subscribed) return;
    this.state.subscribed = true;
    this.workspaceApi.onChange?.(this.onWorkspaceChange);
    this.workspaceApi.onConnection?.(value => {
      this.state.online = value;
      this.#renderConnectionStatus();
      if (!value) { this.app.notifier.notify("OrbitKanban is not reachable: reopen the app on the PC and reload the page.", true); return; }
      this.app.notifier.notify("Connection restored.");
      this.state.pendingChange = { forced: true };
      this.flushPendingChange();
    });
  }
}
