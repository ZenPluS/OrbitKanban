// Settings draft, tabs, navigation and saving.
import { Component } from '../core/Component.js';
import { ColumnCleanup, ColumnSchema, ColumnValidator, NavigationSections, TaskLayout } from '../shared.js';

export class SettingsController extends Component {
  constructor(app) {
    super(app);
    this.refreshSettingsState = this.refreshSettingsState.bind(this);
  }
  #collectSettings() {
    this.state.settingsDraft.hoursPerDay = Number(this.$('#hours-per-day').value);
    this.state.settingsDraft.language = this.$('#language').value;
    for (const section of this.state.settingsDraft.navigation) section.name = section.name.trim();
    return this.state.settingsDraft;
  }
  settingsChanged() {
    if (this.state.view !== 4 || !this.$('#organization-name')) return false;
    return this.app.customColumns.pendingCustomColumns().length > 0 || JSON.stringify(this.#collectSettings()) !== JSON.stringify(this.state.data.settings) || this.$('#organization-name').value.trim() !== this.state.organizations.find(o => o.id === this.state.activeOrganizationId).name;
  }
  settingsTabs = [
    { id: 'identity', group: "Organization", icon: 'id', label: "Identity", panel: 'identity-panel', keys: ['hoursPerDay', 'logo', 'logoSource', 'logoShape'] },
    { id: 'navigation', group: "Organization", icon: 'menu', label: "Navigation", panel: 'navigation-panel', keys: ['navigation'] },
    { id: 'languages', group: "Organization", icon: 'translate', label: "Language & translations", panel: 'languages-panel', keys: ['language'] },
    { id: 'organizations', group: "Organization", icon: 'building', label: "Organizations", panel: 'organizations-panel', keys: [] },
    { id: 'themes', group: "Appearance", icon: 'palette', label: "Themes & atmosphere", panel: 'themes-panel', keys: ['themes', 'themeId'] },
    { id: 'appearance', group: "Appearance", icon: 'palette', label: "Appearance repositories", panel: 'appearance-panel', keys: ['packSources', 'iconPack', 'packThemeBases'] },
    { id: 'fonts', group: "Appearance", icon: 'font', label: "Font and text size", panel: 'font-size-panel', keys: ['fontSizes', 'fontFamily'] },
    { id: 'task-layout', group: "Appearance", icon: 'columns', label: "Task editor layout", panel: 'task-layout-panel', keys: ['taskEditorLayout', 'requiredTaskColumns'] },
    { id: 'columns', group: "Workflow", icon: 'columns', label: "List columns", panel: 'columns-panel', keys: ['taskColumns'] },
    { id: 'custom-columns', group: "Workflow", icon: 'column-plus', label: "Column management", panel: 'custom-columns-panel', keys: ['taskFields', 'issueFields', 'taskColumns', 'issueColumns', 'deletedTaskColumns', 'deletedIssueColumns', 'requiredTaskColumns', 'requiredIssueColumns'] },
    { id: 'transfer', group: "Data & access", icon: 'transfer', label: "Export and import organization", panel: 'transfer-panel', keys: [] },
    { id: 'storage', group: "Data & access", icon: 'database', label: "Data that travels with you", panel: 'storage-panel', keys: [] },
    { id: 'browser', group: "Data & access", icon: 'globe', label: "Browser access", panel: 'browser-panel', keys: [] },
    { id: 'updates', group: "Data & access", icon: 'reset', label: "App & updates", panel: 'updates-panel', keys: [] }
  ];
  choiceSettingsTabs() {
    return ['tasks', 'issues'].flatMap((kind, index) => ColumnSchema.schemaOf(this.state.settingsDraft || this.state.data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type)).map(field => {
      const id = field.catalog || `choice-${kind}-${field.id}`;
      return { id, panel: `${id}-panel`, group: "Column labels", icon: 'tag', family: 'violet',
        label: `${field.builtin ? this.t(field.name) : field.name} · ${this.app.sections.nameOf(kind, this.state.settingsDraft || this.state.data.settings)}`,
        field, kind, custom: true, keys: [field.catalog || (kind === 'tasks' ? 'taskFields' : 'issueFields')] };
    }));
  }
  allSettingsTabs = () => [
    ...this.settingsTabs.filter(tab => tab.group !== "Data & access"),
    ...this.choiceSettingsTabs(), ...this.settingsTabs.filter(tab => tab.group === "Data & access")
  ];
  // Ordered: the first matching pattern decides which settings tab holds the field to fix.
  // Validation messages are English source text, except those the store localizes in the organization language, so the patterns also list the Italian wording.
  #settingsErrorTabs = [[/navigation|navigazione/i, 'navigation'], [/custom columns?|deleted columns|required columns|colonne obbligatorie|columns changed|colonne eliminate|colonne modificate|column options|column names and identifiers|colonn[ae] personalizzat|opzioni della colonna|nomi e identificativi delle colonne|platform link|link alla piattaforma|successor|successori/i, 'custom-columns'], [/\btags?\b/i, 'tags'], [/evidenziatori|highlighter/i, 'highlights'], [/colonne della lista|list columns/i, 'columns'], [/dimensioni del testo|text sizes|\bfont\b/i, 'fonts'], [/\b(?:temi|tema|themes?)\b/i, 'themes'], [/urgen/i, 'urgencies'], [/\b(?:stati|status|statuses)\b/i, 'statuses'], [/\b(?:lingua|language)\b/i, 'languages'], [/organizzazione|organization|ore per giorno|hours per day|logo/i, 'identity']];
  settingsErrorTab = message => /appearance|icon pack/i.test(String(message)) ? 'appearance' : /task editor layout|layout della scheda attività/i.test(String(message)) ? 'task-layout' : this.#settingsErrorTabs.find(([pattern]) => pattern.test(String(message)))?.[1];
  settingsNav() {
    const tabs = this.allSettingsTabs(), groups = [...new Set(tabs.map(tab => tab.group))];
    return `<nav class="settings-nav" aria-label="${this.esc(this.t("Settings sections"))}">${groups.map((group, index) => `<div class="settings-nav-group" role="group" aria-labelledby="settings-group-${index}"><span class="settings-nav-label" id="settings-group-${index}">${this.esc(this.t(group))}</span>${tabs.filter(tab => tab.group === group).map(tab => `<button type="button" class="settings-tab" id="settings-tab-${tab.id}" data-settings-tab="${tab.id}" aria-controls="${tab.panel}"><span class="settings-tab-icon" aria-hidden="true">${this.ico(tab.icon, tab.family)}</span><span class="settings-tab-text">${this.esc(tab.custom ? tab.label : this.t(tab.label))}</span><span class="settings-tab-dot" role="img" aria-label="${this.esc(this.t("Unsaved changes"))}" title="${this.esc(this.t("Unsaved changes"))}" hidden></span></button>`).join('')}</div>`).join('')}</nav>`;
  }
  showSettingsTab(id, reveal = false) {
    this.app.colorPicker.closeColorPicker();
    const tabs = this.allSettingsTabs(), selected = tabs.find(tab => tab.id === id) || this.settingsTabs[0];
    document.querySelectorAll('.settings-section').forEach(panel => { panel.hidden = true; });
    this.state.settingsTab = selected.id;
    try { sessionStorage.setItem('orbitkanban.settingsTab', selected.id); } catch {}
    for (const tab of tabs) {
      const button = document.getElementById(`settings-tab-${tab.id}`), panel = document.getElementById(tab.panel);
      if (!button || !panel) continue;
      panel.hidden = tab !== selected;
      button.classList.toggle('active', tab === selected);
      if (tab === selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    }
    if (selected.id === 'themes') this.app.themes.revealChosenTheme();
    const layout = this.$('.settings-layout');
    if (reveal && layout && layout.getBoundingClientRect().top < 0) layout.scrollIntoView({ block: 'start' });
  }
  wireSettingsNav() {
    this.$('#settings-page').addEventListener('click', event => {
      const target = event.target.closest('[data-settings-tab],[data-goto-settings-tab]');
      if (!target) return;
      const id = target.dataset.settingsTab || target.dataset.gotoSettingsTab;
      this.showSettingsTab(id, true);
      if (target.dataset.gotoSettingsTab) document.getElementById(`settings-tab-${id}`)?.focus();
    });
    this.$('#settings-page').addEventListener('keydown', event => {
      if (!event.target.closest('.settings-nav')) return;
      const tabs = [...document.querySelectorAll('.settings-tab')], index = tabs.indexOf(document.activeElement);
      const next = index < 0 ? undefined : { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      this.showSettingsTab(target.dataset.settingsTab);
    });
  }
  refreshSettingsState() {
    const banner = this.$('#unsaved-banner');
    if (!banner) return;
    const changed = this.settingsChanged();
    this.app.history.updateHistoryButtons();
    banner.hidden = !changed;
    const savedName = this.state.organizations.find(o => o.id === this.state.activeOrganizationId)?.name;
    const tabs = this.allSettingsTabs();
    const dirty = changed ? tabs.filter(tab => tab.custom ? JSON.stringify(tab.field) !== JSON.stringify(ColumnSchema.schemaOf(this.state.data.settings, tab.kind).find(field => field.id === tab.field.id)) : tab.keys.some(key => JSON.stringify(this.state.settingsDraft[key]) !== JSON.stringify(this.state.data.settings[key])) || (tab.id === 'custom-columns' && this.app.customColumns.pendingCustomColumns().length > 0) || (tab.id === 'identity' && this.$('#organization-name').value.trim() !== savedName)) : [];
    for (const tab of tabs) {
      const dot = document.querySelector(`#settings-tab-${tab.id} .settings-tab-dot`);
      if (dot) dot.hidden = !dirty.includes(tab);
    }
    const where = this.$('#unsaved-where'), key = dirty.map(tab => tab.id).join();
    if (where && where.dataset.key !== key) {
      where.dataset.key = key;
      where.innerHTML = dirty.length ? `${this.esc(this.t("Changed sections:"))} ${dirty.map(tab => `<button type="button" class="unsaved-link" data-goto-settings-tab="${tab.id}">${this.esc(tab.custom ? tab.label : this.t(tab.label))}</button>`).join(', ')}` : '';
    }
    this.$('#settings-page')?.style.setProperty('--unsaved-offset', changed ? `${banner.offsetHeight + 12}px` : '0px');
  }
  async saveSettings() {
    this.app.colorPicker.closeColorPicker();
    try {
      if (this.app.packs.busy) throw new Error(this.t("Appearance packs are loading."));
      if (this.$('#logo-file')?.disabled || this.$('#theme-image-file')?.disabled || this.$('#create-logo-file')?.disabled) throw new Error(this.t("Loading image…"));
      const settings = structuredClone(this.#collectSettings());
      for (const form of this.app.customColumns.pendingCustomColumns()) {
        const kind = form.dataset.addField, fields = ColumnSchema.fieldsOf(settings, kind);
        fields.push(...this.app.customColumns.newCustomFields(form, fields));
        ColumnValidator.validateFields(fields, kind);
      }
      settings.taskColumns = this.configuredColumns('tasks', settings);
      settings.issueColumns = this.configuredColumns('issues', settings);
      settings.taskEditorLayout = TaskLayout.normalizeTaskEditorLayout(settings);
      const organizationName = this.$('#organization-name').value.trim();
      if (!organizationName || organizationName.length > 100) throw new Error(this.t("Invalid organization name."));
      await this.app.history.commit(next => {
        for (const key of ['taskFields', 'issueFields', 'deletedTaskColumns', 'deletedIssueColumns']) {
          if (JSON.stringify(next.settings[key]) !== JSON.stringify(this.state.settingsBase[key]) && JSON.stringify(next.settings[key]) !== JSON.stringify(settings[key])) {
            throw new Error(this.t("Columns changed in another window. Discard the settings changes and try again: saved data has not been overwritten."));
          }
        }
        next.settings = structuredClone(settings);
        ColumnCleanup.cleanData(next);
        NavigationSections.normalizeNavigation(next.settings);
      }, organizationName);
      this.state.statusFilter = '';
      this.state.activeSavedViewId = '';
    } catch (error) {
      const tab = this.settingsErrorTab(error?.message);
      if (tab && this.$('#settings-page')) this.showSettingsTab(tab, true);
      throw error;
    }
  }
  #settingsPrompts = {
    switch: ["Save settings before switching organization?", "You have unsaved changes. Save or discard them before switching organization.", "Discard and switch", "Save and switch"],
    transfer: ["Save settings before continuing?", "You have unsaved changes: export and import use the saved settings. Save or discard them before continuing.", "Discard and continue", "Save and continue"]
  };
  async withSavedSettings(callback, purpose = 'switch') {
    if (this.app.packs.busy) { this.app.notifier.notify("Appearance packs are loading.", true); return; }
    if (this.state.saving || this.state.organizationBusy) { this.app.notifier.notify("A save is in progress. Please try again in a moment.", true); return; }
    if (this.$('#logo-file')?.disabled || this.$('#theme-image-file')?.disabled || this.$('#create-logo-file')?.disabled) { this.app.notifier.notify("Loading image…", true); return; }
    if (!this.settingsChanged()) { await callback(); return; }
    const [title, message, discard, save] = this.#settingsPrompts[purpose].map(text => this.t(text));
    this.app.modal.openModal(`<div class="modal-heading"><h2>${title}</h2></div><p class="confirm-message">${message}</p><div class="modal-actions"><button class="button" data-close>${this.t("Cancel")}</button><button class="button" id="discard-switch">${discard}</button><button class="button primary" id="save-switch">${save}</button></div>`);
    this.$('#discard-switch').onclick = this.app.notifier.action(async () => { this.$('#modal').close(); this.app.shell.render(); await callback(); });
    this.$('#save-switch').onclick = this.app.notifier.action(async () => { await this.saveSettings(); this.$('#modal').close(); this.app.shell.render(); await callback(); });
  }
  openSettingsTab(id) {
    this.state.view = 4;
    this.state.settingsTab = id;
    this.app.shell.render();
  }
}
