// Organization switching, creation and management.
import { Component } from '../core/Component.js';

export class OrganizationManager extends Component {
  constructor(app) {
    super(app);
    this.openOrganizationSettings = this.openOrganizationSettings.bind(this);
  }
  async organizationAction(operation, payload) {
    if (this.state.saving || this.state.organizationBusy) throw new Error(this.t("A save is in progress. Please try again in a moment."));
    this.state.organizationBusy = true;
    this.$('#organization-select').disabled = true;
    try {
      this.app.shell.adoptSnapshot(await this.workspaceApi.organization(operation, payload, this.state.activeOrganizationId));
      this.state.search = ''; this.state.statusFilter = ''; this.state.highlightFilter = ''; this.state.highlighter = ''; this.state.selectedTasks.clear(); this.state.showHidden = false; this.state.duplicatesOnly = false; this.state.issueDuplicatesOnly = false; this.state.activeSavedViewId = ''; this.state.sort = [{ key: 'releaseDate', direction: 'asc' }];
      this.app.shell.render();
    } finally { this.state.organizationBusy = false; this.$('#organization-select').disabled = false; this.app.shell.flushPendingChange(); }
  }
  openOrganizationSettings() {
    this.state.view = 4;
    this.state.settingsTab = 'organizations';
    this.app.shell.render();
    this.$('#create-organization-section').open = true;
    this.$('#organizations-panel').scrollIntoView({ block: 'start' });
  }
  wireOrganizationCreation() {
    const form = this.$('#create-organization'), fileInput = this.$('#create-logo-file'), preview = this.$('#create-logo-preview'), result = this.$('#create-logo-result');
    let logo = '', palette;
    fileInput.onchange = this.app.notifier.action(async () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileInput.disabled = true;
      form.querySelector('[type=submit]').disabled = true;
      result.textContent = this.t("Loading image…");
      try {
        const processed = await this.app.logo.processLogo(file);
        if (!fileInput.isConnected) return;
        logo = processed.logo; palette = processed.palette;
        preview.innerHTML = `<img src="${logo}" alt="${this.esc(this.t("New organization logo"))}"><div class="theme-swatches">${this.app.themes.themeFields.map(([key, label]) => `<i style="background:${palette[key]}" title="${this.t(label)}: ${palette[key]}"></i>`).join('')}</div>`;
        result.textContent = this.t("Logo ready: the theme will be applied to the new organization.");
      } catch (error) { result.textContent = this.t(error.message); throw error; }
      finally { fileInput.disabled = false; fileInput.value = ''; form.querySelector('[type=submit]').disabled = false; }
    });
    this.$('#clear-create-logo').onclick = () => { logo = ''; palette = undefined; preview.innerHTML = ''; result.textContent = ''; };
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      if (fileInput.disabled) throw new Error(this.t("Loading image…"));
      const fields = new FormData(form);
      const payload = { name: fields.get('name').trim(), language: fields.get('language'), logo, palette, demo: fields.has('demo') };
      await this.app.settings.withSavedSettings(async () => {
        await this.organizationAction('create', payload);
        this.app.notifier.notify("Organization created.");
      });
    });
  }
  install() {
    this.$('#organization-select').onchange = this.app.notifier.action(async event => {
      const id = event.target.value;
      event.target.value = this.state.activeOrganizationId;
      await this.app.settings.withSavedSettings(() => this.organizationAction('switch', { id }));
    });
    this.$('#manage-organizations').onclick = this.app.notifier.action(() => this.app.settings.withSavedSettings(this.openOrganizationSettings));
    this.$('#content').addEventListener('dblclick', event => {
      if (event.button !== 0 || this.$('#modal').open || event.target.closest('button, a, input, select, textarea, [contenteditable], .select-cell')) return;
      const row = event.target.closest('tr[data-task-row], tr[data-issue-row]');
      if (!row) return;
      if (this.state.view === 0 && !this.state.highlighter && row.dataset.taskRow) {
        const task = this.state.data.tasks.find(item => item.id === row.dataset.taskRow);
        if (task) { event.preventDefault(); this.app.taskDialog.taskDialog(task); }
      } else if (this.state.view === 1 && row.dataset.issueRow) {
        const issue = this.state.data.issues.find(item => item.id === row.dataset.issueRow);
        if (issue) { event.preventDefault(); this.app.issues.issueDialog(issue); }
      }
    });
  }
}
