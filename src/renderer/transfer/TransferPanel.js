// Organization export and import.
import { Component } from '../core/Component.js';
import { OrganizationTransfer } from '../shared.js';

export class TransferPanel extends Component {
  #exportKinds = [['themes', 'palette', "Export themes"], ['settings', 'settings', "Export settings"], ['data', 'tasks', "Export data"], ['organization', 'database', "Export everything"]];
  #exportedMessages = { themes: "Themes exported:", settings: "Settings exported:", data: "Data exported:", organization: "Organization exported:" };
  #importKindNames = { themes: "Themes", settings: "Settings", data: "Data", organization: "Full organization" };
  fillText = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), this.t(text));
  transferPanel() {
    const settings = this.state.data.settings, activeTheme = settings.themes.find(theme => theme.id === settings.themeId);
    const details = {
      themes: `${this.plural(settings.themes.length, 'theme')} · ${this.fillText("active: {0}", this.esc(activeTheme.name))}`,
      settings: `${this.plural(settings.statuses.length, 'status')} · ${this.plural(settings.urgencies.length, 'urgency')} · ${this.plural((settings.highlights || []).length, 'highlighter')} · ${(settings.tags || []).length} ${this.t('Tags')} · ${this.t(settings.logo ? "language, tabs, columns, text sizes and logo" : "language, tabs, columns and text sizes")}`,
      data: `${this.plural(this.state.data.tasks.length, "tasks")} · ${this.plural(this.state.data.issues.length, 'issue')}`,
      organization: this.t("Themes, settings and data in a single file")
    };
    const cards = this.#exportKinds.map(([kind, icon, label]) => `<button type="button" class="transfer-card" data-export-kind="${kind}"><span class="transfer-icon" aria-hidden="true">${this.ico(icon)}</span><span class="transfer-text"><strong>${this.t(label)}</strong><small>${details[kind]}</small></span></button>`).join('');
    return this.ui`<section class="panel settings-section full" id="transfer-panel"><div class="storage-heading"><div><h2>Export and import organization</h2><p class="section-description">Save this organization’s themes, settings and data as separate files, to share them or import them again here or into another copy of OrbitKanban.</p></div><span class="readonly-badge">JSON FILES</span></div><div class="transfer-grid">${cards}</div><div class="storage-actions"><button type="button" class="button primary" id="import-organization">${this.ico('import')}${this.esc(this.t("Import from file"))}…</button><input type="file" id="organization-file" accept=".json,application/json" hidden><span class="transfer-hint">Choose a file exported by OrbitKanban: before applying it you can decide which parts to import and where.</span></div></section>`;
  }
  wireTransfer() {
    document.querySelectorAll('[data-export-kind]').forEach(button => {
      const kind = button.dataset.exportKind;
      button.onclick = this.app.notifier.action(() => this.app.settings.withSavedSettings(async () => {
        const result = await this.workspaceApi.exportOrganization(this.state.activeOrganizationId, kind);
        if (result) this.app.notifier.notify(this.#exportedMessages[kind], false, result.fileName);
      }, 'transfer'));
    });
    this.$('#import-organization').onclick = this.app.notifier.action(() => this.app.settings.withSavedSettings(() => {
      const input = this.$('#organization-file');
      input.value = '';
      input.click();
    }, 'transfer'));
    this.$('#organization-file').onchange = this.app.notifier.action(async event => {
      const input = event.target, file = input.files[0];
      if (!file) return;
      input.value = '';
      if (file.size > 32 * 1024 * 1024) throw new Error(this.t("This file is too large to be an OrbitKanban export."));
      this.#organizationImportDialog(OrganizationTransfer.parseOrganizationFile(await file.text()));
    });
  }
  #organizationImportDialog(file) {
    const current = this.state.organizations.find(o => o.id === this.state.activeOrganizationId), toNew = file.kind === 'organization';
    const fileTheme = file.themes?.themes.find(theme => theme.id === file.themes.themeId);
    const exportedAt = file.exportedAt ? new Date(file.exportedAt).toLocaleString(this.locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const origin = [file.organization.name ? this.fillText("From “{0}”", this.esc(file.organization.name)) : this.esc(this.t("Unnamed organization")), exportedAt && this.fillText("exported on {0}", this.esc(exportedAt)), file.appVersion && `OrbitKanban v${this.esc(file.appVersion)}`].filter(Boolean).join(' · ');
    const part = (name, title, detail, extra = '') => `<div class="import-part"><label class="import-check"><input type="checkbox" name="${name}" checked><span><strong>${this.esc(this.t(title))}</strong><small>${detail}</small></span></label>${extra}</div>`;
    const radio = (name, value, title, detail, checked) => `<label class="radio-card"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span><strong>${this.esc(this.t(title))}</strong><small>${detail}</small></span></label>`;
    const parts = [
      file.themes && part('themes', "Themes", `${this.plural(file.themes.themes.length, 'theme')}: ${this.esc(this.t("those with the same identifier are updated, the others are added."))}`,
        `<label class="import-sub"><input type="checkbox" name="activateTheme" checked><span>${this.fillText("Activate the “{0}” theme", this.esc(fileTheme.name))}</span><span class="theme-swatches">${this.app.themes.themeFields.map(([key]) => `<i style="background:${fileTheme[key]}"></i>`).join('')}</span></label>`),
      file.settings && part('settings', "Settings", this.esc(this.t(file.settings.tags ? "Language, navigation sections, hours per day, text sizes, statuses, urgencies, highlighters, tags, list columns and platform links. Replaces current settings." : file.settings.highlights ? "Language, navigation sections, hours per day, text sizes, statuses, urgencies, highlighters and list columns. Replaces the current settings." : file.settings.fontSizes ? "Language, navigation sections, hours per day, text sizes, statuses and urgencies. Replaces the current settings." : "Language, navigation sections, hours per day, statuses and urgencies. Replaces the current settings.")),
        file.settings.logo ? `<label class="import-sub"><input type="checkbox" name="logo"><img class="import-logo" src="${file.settings.logo}" alt=""><span>${this.esc(this.t("Also replace the logo"))}</span></label>` : ''),
      file.data && part('data', "Data", `${this.plural(file.data.tasks.length, "tasks")} · ${this.plural(file.data.issues.length, 'issue')}`,
        `<div class="import-sub import-modes" id="import-data-mode">${radio('dataMode', 'merge', "Add and update", this.esc(this.t("Tasks and cards with the same identifier are updated, issues already present are not duplicated.")), true)}${radio('dataMode', 'replace', "Replace everything", this.esc(this.t("Tasks and issues are replaced; groups and cards are replaced if present in the file.")), false)}</div>`)
    ].filter(Boolean).join('');
    const destinations = radio('destination', 'current', "Into this organization", this.esc(current.name), !toNew) + radio('destination', 'new', "Into a new organization", this.esc(this.t("The current organization is left unchanged.")), toNew);
    const suggestedName = OrganizationTransfer.uniqueOrganizationName(file.organization.name, this.state.organizations.map(o => o.name), this.t("Imported organization"));
    this.app.modal.openModal(this.ui`<form id="organization-import-form"><div class="modal-heading"><div><div class="eyebrow">IMPORT</div><h2>Import from file</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div><div class="import-source"><span class="import-kind">${this.esc(this.t(this.#importKindNames[file.kind]))}</span><span>${origin}</span></div><fieldset class="import-parts"><legend>What to import</legend>${parts}</fieldset><fieldset class="import-target"><legend>Where to import</legend><div class="import-destinations">${destinations}</div><label class="field" id="import-name-field">New organization name<input name="name" maxlength="100" required value="${this.esc(suggestedName)}"></label></fieldset><ul class="import-notes" id="import-notes" aria-live="polite"></ul><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="confirm-import">Import</button></div></form>`);
    const form = this.$('#organization-import-form'), fields = form.elements;
    const selected = name => Boolean(fields[name]?.checked);
    let logoChoice = false;
    const refresh = () => {
      const toNewOrganization = fields.destination.value === 'new';
      if (fields.activateTheme) fields.activateTheme.disabled = !selected('themes');
      if (fields.logo) {
        fields.logo.checked = selected('settings') && (toNewOrganization || logoChoice);
        fields.logo.disabled = toNewOrganization || !selected('settings');
      }
      if (fields.dataMode) {
        this.$('#import-data-mode').hidden = toNewOrganization;
        form.querySelectorAll('[name="dataMode"]').forEach(input => { input.disabled = !selected('data'); });
      }
      this.$('#import-name-field').hidden = !toNewOrganization;
      fields.name.disabled = !toNewOrganization;
      this.$('#confirm-import').disabled = !['themes', 'settings', 'data'].some(selected);
      this.$('#confirm-import').textContent = this.t(toNewOrganization ? "Create and import" : "Import");
      const notes = [];
      if (toNewOrganization) notes.push("A new organization will be created with the selected parts: the current one is left unchanged.");
      else {
        if (selected('settings')) notes.push("The current settings will be replaced: existing tasks are kept and mapped to the file’s statuses and urgencies with the same name, otherwise to the same position.");
        else if (selected('data')) notes.push("Statuses and urgencies of the imported tasks are mapped to this organization’s ones with the same name, otherwise to the same position.");
        if (selected('data') && fields.dataMode.value === 'replace') notes.push("All current tasks and issues will be deleted and replaced; groups and cards will also be replaced if present in the file.");
        notes.push("To be able to go back, first export a backup or the full organization.");
      }
      this.$('#import-notes').innerHTML = notes.map(note => `<li>${this.esc(this.t(note))}</li>`).join('');
    };
    if (fields.logo) fields.logo.addEventListener('change', () => { logoChoice = fields.logo.checked; });
    form.addEventListener('change', refresh);
    refresh();
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const options = { themes: selected('themes'), activateTheme: selected('activateTheme'), settings: selected('settings'), logo: selected('logo'), data: selected('data'), dataMode: fields.dataMode?.value === 'replace' ? 'replace' : 'merge' };
      if (fields.destination.value === 'new') {
        const name = fields.name.value.trim();
        if (!name || name.length > 100) throw new Error(this.t("Invalid organization name."));
        await this.app.organizationManager.organizationAction('import', { name, data: OrganizationTransfer.importedOrganizationData(file, options, this.state.data.settings.language) });
        this.$('#modal').close();
        this.app.notifier.notify("Organization imported.");
        return;
      }
      await this.app.history.commit(next => {
        const imported = OrganizationTransfer.applyOrganizationImport(next, file, options);
        next.settings = imported.settings; next.tasks = imported.tasks; next.issues = imported.issues; next.groups = imported.groups; next.todos = imported.todos;
      });
      this.state.statusFilter = '';
      this.$('#modal').close(); this.app.shell.render(); this.app.notifier.notify("Import completed.");
    });
  }
}
