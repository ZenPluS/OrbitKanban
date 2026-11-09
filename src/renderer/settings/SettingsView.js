// Settings view.
import { Component } from '../core/Component.js';
import { Common } from '../shared.js';

export class SettingsView extends Component {
  renderSettings() {
    this.state.settingsDraft = structuredClone(this.state.data.settings);
    this.state.settingsBase = structuredClone(this.state.data.settings);
    this.state.settingsDraft.highlights ??= [];
    this.state.settingsDraft.tags ??= [];
    this.state.settingsDraft.taskFields ??= []; this.state.settingsDraft.issueFields ??= [];
    this.state.settingsDraft.taskColumns = this.configuredColumns('tasks', this.state.settingsDraft);
    this.state.settingsDraft.issueColumns = this.configuredColumns('issues', this.state.settingsDraft);
    const organization = this.state.organizations.find(o => o.id === this.state.activeOrganizationId);
    this.$('#content').innerHTML = '<div id="settings-page">' + this.app.columns.heading(this.t("Settings"), "Names, workflows and colors. Configure your workspace and take it anywhere.", this.ui`<button class="button primary" id="save-settings">Save settings</button>`) +
      this.ui`<div class="unsaved-banner" id="unsaved-banner" role="status" aria-live="polite" hidden><span class="unsaved-icon" aria-hidden="true">${this.ico('warning')}</span><div class="unsaved-text"><strong>You have unsaved settings.</strong> Changes, including the previewed theme and text sizes, take effect only when you save. If you leave without saving, the previous configuration remains.<span class="unsaved-where" id="unsaved-where"></span></div><div class="unsaved-actions"><button type="button" class="button small" id="discard-settings">Discard changes</button><button type="button" class="button primary small" id="save-settings-inline">Save</button></div></div><div class="info-banner"><strong>${Common.APP_NAME}</strong> · Organization configuration: <strong>${this.esc(organization.name)}</strong><br>Organization settings apply only to the selected organization. App & updates applies to this portable copy.</div>
    <div class="settings-layout">${this.app.settings.settingsNav()}<div class="settings-panels"><section class="panel settings-section full" id="organizations-panel"><h2>Organizations</h2><p class="section-description">Data and settings are isolated per organization. Your selection is saved automatically.</p>
    <details id="create-organization-section"><summary>New organization</summary><form id="create-organization"><div class="form-grid"><label class="field">Organization name<input name="name" required maxlength="100"></label><label class="field">Interface language<select name="language">${this.app.languages.languageOptions(this.state.data.settings.language)}</select></label><label class="field full checkbox-field demo-field"><input type="checkbox" name="demo"><span>Include demo data<small>Biweekly milestones from January 2026 to January 2029 with sample tasks, issues, notes and hidden rows.</small></span></label><div class="field full"><label for="create-logo-file">New organization logo</label><input id="create-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"><small>Choose a logo during creation: it will be stored with the organization and automatically generate its theme.</small><div id="create-logo-preview"></div><output id="create-logo-result" aria-live="polite"></output><button type="button" class="button small" id="clear-create-logo">Remove logo</button></div></div><div class="organization-actions"><button class="button primary" type="submit">Create organization</button></div></form></details>
    <button class="button danger small" id="delete-organization" ${this.state.organizations.length === 1 ? 'disabled' : ''}>Delete organization</button></section>
        <section class="panel settings-section" id="identity-panel"><h2>Identity</h2><p class="section-description">Make this space truly yours.</p><div class="form-grid"><label class="field full">Organization name<input id="organization-name" maxlength="100" required value="${this.esc(organization.name)}"></label>
    <label class="field">Hours per effort day<input id="hours-per-day" type="number" min="0.01" max="24" step="0.01" value="${this.state.data.settings.hoursPerDay}"><small>Changes the display in days. Previously recorded hours stay the same.</small></label>
    <div class="full logo-settings"><h3>Organization logo</h3><div id="logo-preview"></div><label class="field">Upload logo and generate theme<input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">The logo and theme belong only to this organization and travel with the archive.</p><button class="button small" id="remove-logo" type="button">Remove logo</button><output id="logo-result" aria-live="polite"></output></div></div></section>${this.app.navigationSettings.navigationPanel()}
    <section class="panel settings-section full" id="languages-panel"><h2>Language & translations</h2><p class="section-description">Choose the language of this organization. Translations are plain JSON files: you can add more without changing the app.</p><div class="form-grid"><label class="field">Interface language<select id="language">${this.app.languages.languageOptions(this.state.data.settings.language)}</select><small>Language is saved per organization. Custom names and content are not translated.</small></label><p class="language-missing" id="language-missing" role="status" hidden>This language is not installed on this PC: texts are shown in English.</p></div><div id="languages-details"></div></section>
    <section class="panel settings-section" id="themes-panel"><div class="themes-heading"><div><h2>Themes & atmosphere</h2><p class="section-description">Choose a palette or create your own.</p></div><button class="button" id="add-theme">${this.ico('plus')}Create theme</button></div><div class="themes-layout"><div class="theme-browser"><div class="theme-toolbar"><label class="theme-search"><span aria-hidden="true">${this.ico('search')}</span><input type="search" id="theme-search" placeholder="Search themes…" aria-label="Search themes" autocomplete="off" spellcheck="false" value="${this.esc(this.state.themeQuery)}"></label><span class="theme-count" id="theme-count" aria-live="polite"></span></div><div class="theme-gallery" id="theme-list"></div></div><div class="theme-editor-panel" id="theme-editor"></div></div></section>${this.app.fontSettings.fontSizePanel()}
    ${this.app.taskLayout.taskLayoutPanel()}<section class="panel settings-section" id="columns-panel"><h2>List columns</h2><p class="section-description">Choose which columns the task list shows and in what order. Hiding a column does not delete any data. You can also do this with the “Columns” button above the table.</p><div id="columns-editor"></div><button type="button" class="button" id="reset-columns">${this.ico('reset')}Restore default columns</button></section>${this.app.customColumns.customColumnsPanel()}
    <section class="panel settings-section full" id="browser-panel"><h2>Browser access</h2><p class="section-description">While OrbitKanban is open you can also work from a browser on this PC, with different organizations in separate tabs. Changes sync in real time between the app and the tabs.</p><code class="data-path" id="browser-url">${this.esc(this.state.browserUrl || this.t("Not available"))}</code><div class="storage-actions"><button class="button" id="browser-open" ${this.state.browserUrl ? '' : 'disabled'}>${this.ico('globe')}${this.t(this.browserMode() ? "Open in new tab" : "Open in browser")}</button><button class="button" id="browser-copy" ${this.state.browserUrl ? '' : 'disabled'}>${this.t(this.browserMode() ? "Copy address" : "Copy access link")}</button></div><p class="muted">${this.t(this.browserMode() ? "You are using OrbitKanban from the browser: the app on the PC must stay open. Each tab can show a different organization." : "Reachable only from this computer (127.0.0.1) and protected by a personal key: the access link contains the key, do not share it. Closing the app disconnects the browser tabs.")}</p></section>
    ${this.app.transfer.transferPanel()}<section class="panel settings-section full" id="storage-panel"><div class="storage-heading"><div><h2>Data that travels with you</h2><p class="section-description">Local JSON archive with an automatic copy of the previous save.</p></div><span class="readonly-badge">100% LOCAL</span></div><code class="data-path">${this.esc(this.state.dataFolder)}</code><div class="storage-actions"><button class="button" id="export-data">${this.ico('export')}Export backup</button><button class="button" id="import-data">${this.ico('import')}Import backup</button><button class="button" id="open-folder">Open data folder</button><span class="spacer"></span><button class="button danger" id="clear-data">Clear tasks and issues</button></div><div class="backup-section"><div class="storage-heading"><div><h3>Automatic backups</h3><p class="section-description">One copy per day, kept in the data folder for the last 14 days. You can restore one without losing the current archive: the standard .bak backup is created first.</p></div><button type="button" class="button small" id="refresh-backups">Refresh backups</button></div><p id="backup-status" class="muted" role="status" aria-live="polite"></p><div id="backup-list"></div></div><p class="muted">To share the app, close it and copy the executable together with the data folder. Do not run copies using the same data folder at the same time.</p></section></div></div></div>`;
        this.$('.settings-panels').insertAdjacentHTML('beforeend', this.app.updates.updatesPanel());
        this.app.settings.showSettingsTab(this.state.settingsTab); this.app.settings.wireSettingsNav(); this.app.updates.wireUpdates();
        this.app.optionLists.drawOptionLists(); this.app.navigationSettings.drawNavigation(); this.app.themes.drawThemes(); this.app.logo.drawLogoPreview(); this.app.organizationManager.wireOrganizationCreation(); this.app.fontSettings.wireFontSizes(); this.app.languages.wireLanguages();
        this.app.columnEditor.columnEditor(this.$('#columns-editor'), this.state.settingsDraft.taskColumns, 'tasks', this.state.settingsDraft);
        this.$('#reset-columns').onclick = () => { this.state.settingsDraft.taskColumns.splice(0, this.state.settingsDraft.taskColumns.length, ...this.configuredColumns('tasks', this.state.settingsDraft, [])); this.app.columnEditor.columnEditor(this.$('#columns-editor'), this.state.settingsDraft.taskColumns, 'tasks', this.state.settingsDraft); };
        this.app.customColumns.wireCustomColumns();
        this.$('#theme-search').oninput = event => { this.state.themeQuery = event.target.value; this.app.themes.drawThemeChoices(); };
    for (const type of ['input', 'change', 'click']) this.$('#settings-page').addEventListener(type, () => queueMicrotask(this.app.settings.refreshSettingsState));
    this.$('#delete-organization').onclick = () => this.app.modal.confirmDialog("Delete this organization?", "All its data, logo and settings will be deleted. Other organizations will not be changed. Export a backup first.", () => this.app.organizationManager.organizationAction('delete', { id: this.state.activeOrganizationId }));
    const logoFile = this.$('#logo-file'), logoResult = this.$('#logo-result');
    logoFile.onchange = this.app.notifier.action(async () => {
      const file = logoFile.files[0];
      if (!file) return;
      logoFile.disabled = true;
      logoResult.textContent = this.t("Loading image…");
      const draft = this.state.settingsDraft;
      try {
        const { logo, palette } = await this.app.logo.processLogo(file);
        if (this.state.settingsDraft !== draft || !logoFile.isConnected) return;
        draft.logo = logo;
        let theme = draft.themes.find(theme => theme.id === 'organization-logo');
        if (!theme) {
          theme = { id: 'organization-logo', name: this.t("Theme from logo") };
          draft.themes.push(theme);
        }
        for (const [key] of this.app.themes.themeFields) theme[key] = palette[key];
        draft.themeId = theme.id;
        this.app.logo.drawLogoPreview(); this.app.themes.drawThemes(); this.app.settings.refreshSettingsState();
        logoResult.textContent = this.t("Logo loaded and theme previewed. Save settings to keep them.");
      } catch (error) { logoResult.textContent = this.t(error.message); throw error; }
      finally { logoFile.disabled = false; logoFile.value = ''; }
    });
    this.$('#remove-logo').onclick = () => { this.state.settingsDraft.logo = ''; this.app.logo.drawLogoPreview(); logoResult.textContent = ''; };
    this.$('#save-settings').onclick = this.$('#save-settings-inline').onclick = this.app.notifier.action(async () => {
      await this.app.settings.saveSettings(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Settings saved.");
    });
    this.$('#discard-settings').onclick = () => { this.app.shell.render(); this.app.notifier.notify("Changes discarded."); };
    this.$('#export-data').onclick = this.app.notifier.action(async () => { if (await this.workspaceApi.exportData()) this.app.notifier.notify("Backup exported."); });
    this.$('#import-data').onclick = this.app.notifier.action(async () => {
      const imported = await this.workspaceApi.importData();
      if (imported) { this.app.history.clearHistory(); this.state.columnFilters = { tasks: {}, issues: {} }; this.state.issueSearch = ''; this.app.shell.adoptSnapshot(imported); this.state.search = ''; this.state.statusFilter = ''; this.state.highlightFilter = ''; this.state.highlighter = ''; this.state.selectedTasks.clear(); this.state.showHidden = false; this.state.duplicatesOnly = false; this.state.issueDuplicatesOnly = false; this.state.activeSavedViewId = ''; this.state.sort = [{ key: 'releaseDate', direction: 'asc' }]; this.app.shell.render(); this.app.notifier.notify("Archive imported."); }
    });
    this.$('#open-folder').onclick = this.app.notifier.action(() => this.workspaceApi.openDataFolder());
    this.$('#refresh-backups').onclick = this.app.notifier.action(this.app.backups.loadBackupList);
    this.$('#backup-list').onclick = this.app.notifier.action(event => {
      const button = event.target.closest('[data-restore-backup]');
      if (button) this.app.backups.restoreDailyBackup(button.dataset.restoreBackup);
    });
    this.app.notifier.action(this.app.backups.loadBackupList)();
    this.app.transfer.wireTransfer();
    this.$('#browser-open').onclick = this.app.notifier.action(this.app.toolbar.openBrowserAccess);
    this.$('#browser-copy').onclick = this.app.notifier.action(async () => {
      await this.workspaceApi.browserAccess('copy', this.state.activeOrganizationId);
      this.app.notifier.notify(this.browserMode() ? "Address copied to the clipboard." : "Access link copied to the clipboard.");
    });
    this.$('#clear-data').onclick = () => this.app.modal.confirmDialog("Clear this workspace?", "All tasks, issue associations and groups in this organization will be deleted. Themes and settings will stay unchanged. Export a backup first to keep them.", async () => {
      await this.app.history.commit(next => { next.tasks = []; next.issues = []; next.groups = []; }); this.app.shell.render(); this.app.notifier.notify("Workspace cleared.");
    });
    this.$('#add-theme').onclick = () => {
      const theme = structuredClone(this.state.settingsDraft.themes.find(t => t.id === this.state.settingsDraft.themeId));
      theme.id = this.uid(); theme.name = this.t("My theme"); this.state.settingsDraft.themes.push(theme); this.state.settingsDraft.themeId = theme.id;
      this.state.themeQuery = ''; this.$('#theme-search').value = '';
      this.app.themes.drawThemes();
      this.$('#theme-name').focus(); this.$('#theme-name').select();
    };
  }
}
