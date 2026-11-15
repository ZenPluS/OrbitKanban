// CSV import of tasks and issues.
import { Component } from '../core/Component.js';
import { ColumnSchema, CsvImporter, CsvImportProfiles, CsvParser } from '../shared.js';

export class CsvImportDialog extends Component {
  csvButton(kind) {
    return `<button class="button" id="import-csv-${kind}" type="button">${this.esc(this.t("Import CSV"))}</button><input type="file" id="csv-file-${kind}" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden>`;
  }
  wireCsvImport(kind) {
    const fileInput = this.$(`#csv-file-${kind}`);
    this.$(`#import-csv-${kind}`).onclick = () => fileInput.click();
    fileInput.onchange = this.app.notifier.action(async () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) await this.csvImportDialog(file, kind); });
  }
  async csvImportDialog(file, kind) {
    if (file.size > CsvParser.MAX_BYTES) throw new Error(this.t("The CSV exceeds the 16 MB limit."));
    const buffer = await file.arrayBuffer();
    let fields = CsvImporter.destinations(this.state.data, kind), rows = [], headers = [], mapping = [], preview;
    let selectedProfile = '', needsReview = false, profileBusy = false, deleteArmed = false;
    this.app.modal.openModal(`<form id="csv-import-form"><div class="modal-heading"><div><div class="eyebrow">CSV · ${this.esc(this.app.sections.nameOf(kind))}</div><h2>${this.esc(this.t("Import CSV"))}</h2></div><button type="button" class="icon-button" data-close aria-label="${this.esc(this.t("Close"))}">${this.ico('close')}</button></div><p>${this.esc(file.name)}</p>
    <p class="section-description">${this.esc(this.t("Rows will be added without overwriting existing ones. Duplicates will be flagged as usual."))}</p>
    <div class="csv-options csv-profiles"><label class="field">${this.esc(this.t("Import profile"))}<select id="csv-profile"></select></label><label class="field">${this.esc(this.t("Profile name"))}<input id="csv-profile-name" maxlength="60" autocomplete="off"></label><div class="csv-profile-actions"><button type="button" class="button small" id="csv-profile-save">${this.esc(this.t("Save new profile"))}</button><button type="button" class="button small" id="csv-profile-update">${this.esc(this.t("Update profile"))}</button><button type="button" class="button small" id="csv-profile-delete">${this.esc(this.t("Delete profile"))}</button></div></div>
    <p class="muted">${this.esc(this.t("Profiles belong to this organization and travel with its portable data. Without headers, columns are matched by position."))}</p>
    <div class="csv-options"><label class="field">${this.esc(this.t("Delimiter"))}<select id="csv-separator"><option value="">${this.esc(this.t("Automatic"))}</option><option value=";">;</option><option value=",">,</option><option value="tab">Tab</option></select></label><label class="field">${this.esc(this.t("Encoding"))}<select id="csv-encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (Excel)</option><option value="utf-16le">UTF-16 LE</option></select></label><label class="checkbox-field"><input id="csv-header" type="checkbox" checked> ${this.esc(this.t("First row contains headers"))}</label></div>
    <p class="muted">${this.esc(this.t("Dates: YYYY-MM-DD or DD/MM/YYYY. Numbers: decimal point or comma. Multiple choices and tags: separate with |. Configure catalogs and custom columns first."))}</p>
    ${kind === 'tasks' ? `<p class="muted">${this.esc(this.t("Incidents and problems are calculated: import them into the linked issues list."))}</p>` : ''}
    <div class="csv-mapping" id="csv-mapping"></div><div id="csv-status" role="status" aria-live="polite"></div><div class="table-scroll csv-preview" id="csv-preview"></div>
    <div class="csv-profile-review" id="csv-profile-review-wrap" hidden><p role="alert">${this.esc(this.t("The file headers or destination fields changed, or headers are ambiguous. Review every column before importing."))}</p><label class="checkbox-field"><input id="csv-profile-review" type="checkbox"> ${this.esc(this.t("I reviewed the changed mapping"))}</label></div>
    <div class="modal-actions"><span class="spacer"></span><button class="button" type="button" data-close>${this.esc(this.t("Cancel"))}</button><button class="button primary" type="submit" id="csv-import" disabled>${this.esc(this.t("Import rows"))}</button></div></form>`);
    const form = this.$('#csv-import-form');
    const profiles = () => (this.state.data.settings.csvImportProfiles || []).filter(profile => profile.kind === kind);
    const drawProfiles = () => {
      this.$('#csv-profile').innerHTML = `<option value="">${this.esc(this.t("Manual mapping"))}</option>${profiles().map(profile => `<option value="${this.esc(profile.id)}">${this.esc(profile.name)}</option>`).join('')}`;
      this.$('#csv-profile').value = selectedProfile;
      for (const id of ['csv-profile', 'csv-profile-name', 'csv-profile-save', 'csv-separator', 'csv-encoding', 'csv-header']) this.$(`#${id}`).disabled = profileBusy;
      for (const input of form.querySelectorAll('[data-csv-column], #csv-profile-review')) input.disabled = profileBusy;
      this.$('#csv-profile-update').disabled = profileBusy || !selectedProfile;
      this.$('#csv-profile-delete').disabled = profileBusy || !selectedProfile;
      this.$('#csv-profile-delete').textContent = this.t(deleteArmed ? "Confirm deletion" : "Delete profile");
    };
    const selected = () => {
      const profile = profiles().find(profile => profile.id === selectedProfile);
      CsvParser.assert(profile, this.t("The selected CSV import profile no longer exists."));
      return profile;
    };
    const showPreview = () => {
      const status = this.$('#csv-status'), button = this.$('#csv-import');
      button.disabled = true; preview = undefined; this.$('#csv-preview').innerHTML = '';
      try {
        preview = CsvImporter.prepareImport(this.state.data, kind, rows, mapping);
        status.className = preview.errorCount ? 'csv-errors' : '';
        status.innerHTML = `<p>${this.esc(this.app.transfer.fillText("{0} valid rows · {1} errors", preview.records.length, preview.errorCount))}</p>` + (preview.errorCount ? `<ul>${preview.errors.map(error => `<li>${this.esc(this.t("Data row") + ' ' + error.row + (error.column ? ` · ${error.custom ? error.column : this.t(error.column)}` : '') + ': ' + this.t(error.message))}</li>`).join('')}</ul>` : '');
        const selected = mapping.filter(Boolean).map(id => fields.find(field => field.id === id));
        const text = (record, field) => {
          const value = field.custom ? record.customFields?.[field.id] : field.id === 'effortDays' ? record.effortHours / this.state.data.settings.hoursPerDay : record[field.id];
          if (field.type === 'select') return field.options.find(option => option.value === value)?.name || '';
          if (field.type === 'multiselect') return (value || []).map(value => field.options.find(option => option.value === value)?.name || value).join(', ');
          if (field.type === 'effort') return String(value ?? '');
          return this.app.cells.customText(value, field);
        };
        this.$('#csv-preview').innerHTML = `<table><caption>${this.esc(this.t("Preview of the first 10 valid rows"))}</caption><thead><tr>${selected.map(field => `<th>${this.esc(field.custom ? field.name : this.t(field.name))}</th>`).join('')}</tr></thead><tbody>${preview.records.slice(0, 10).map(record => `<tr>${selected.map(field => `<td>${this.esc(text(record, field))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        button.disabled = profileBusy || preview.errorCount > 0 || !preview.records.length || needsReview && !this.$('#csv-profile-review').checked;
        button.textContent = this.app.transfer.fillText("Import {0} rows", preview.records.length);
      } catch (error) { status.className = 'csv-errors'; status.textContent = this.t(error.message); }
    };
    const parse = () => {
      this.$('#csv-import').disabled = true; rows = []; headers = []; mapping = []; preview = undefined;
      fields = CsvImporter.destinations(this.state.data, kind);
      needsReview = false;
      this.$('#csv-profile-review').checked = false;
      this.$('#csv-profile-review-wrap').hidden = true;
      try {
        let text;
        try { text = new TextDecoder(this.$('#csv-encoding').value, { fatal: true }).decode(buffer); }
        catch { throw new Error(this.t("The file does not match the selected encoding. Try Windows-1252 or UTF-16 LE.")); }
        const separator = this.$('#csv-separator').value;
        const parsed = CsvParser.parseCsv(text, separator === 'tab' ? '\t' : separator), hasHeader = this.$('#csv-header').checked;
        headers = hasHeader ? parsed.rows[0] : parsed.rows[0].map((_, i) => `${this.t("Column")} ${i + 1}`);
        rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
        if (selectedProfile) ({ mapping, needsReview } = CsvImportProfiles.apply(selected(), headers, fields, hasHeader));
        else mapping = hasHeader ? CsvImporter.suggestMapping(headers, fields) : headers.map(() => '');
        this.$('#csv-profile-review-wrap').hidden = !needsReview;
        this.$('#csv-mapping').innerHTML = `<h3>${this.esc(this.t("Map columns"))}</h3>${headers.map((header, index) => `<label class="csv-map-row"><span><strong>${this.esc(header || `${this.t("Column")} ${index + 1}`)}</strong><small>${this.esc(rows[0]?.[index]?.slice(0, 100) || '—')}</small></span><select data-csv-column="${index}" aria-label="${this.esc(this.t("Destination") + ': ' + header)}"><option value="">${this.esc(this.t("Do not import"))}</option>${fields.map(field => `<option value="${this.esc(field.id)}" ${field.id === mapping[index] ? 'selected' : ''}>${this.esc((field.custom ? `${field.name} · ${this.t("Custom")}` : this.t(field.name)) + ' · ' + this.t(this.app.columns.fieldTypeNames[field.type]))}</option>`).join('')}</select></label>`).join('')}`;
        document.querySelectorAll('[data-csv-column]').forEach(select => select.onchange = () => { mapping[Number(select.dataset.csvColumn)] = select.value; showPreview(); });
        showPreview();
      } catch (error) { this.$('#csv-mapping').innerHTML = ''; this.$('#csv-preview').innerHTML = ''; this.$('#csv-status').className = 'csv-errors'; this.$('#csv-status').textContent = this.t(error.message); }
    };
    this.$('#csv-profile').onchange = this.app.notifier.action(() => {
      selectedProfile = this.$('#csv-profile').value; deleteArmed = false;
      if (selectedProfile) {
        const profile = selected();
        this.$('#csv-profile-name').value = profile.name;
        this.$('#csv-separator').value = profile.separator;
        this.$('#csv-encoding').value = profile.encoding;
        this.$('#csv-header').checked = profile.firstRowHeader;
      } else this.$('#csv-profile-name').value = '';
      drawProfiles(); parse();
    });
    const saveProfile = async update => {
      if (profileBusy) throw new Error(this.t("A save is in progress. Please try again in a moment."));
      const name = this.$('#csv-profile-name').value.trim(), id = update ? selected().id : this.uid();
      CsvParser.assert(name && name.length <= 60, this.t("Enter a profile name (up to 60 characters)."));
      const candidate = CsvImportProfiles.create({
        id, name, kind, separator: this.$('#csv-separator').value, encoding: this.$('#csv-encoding').value, firstRowHeader: this.$('#csv-header').checked
      }, headers, mapping, fields);
      profileBusy = true; drawProfiles(); showPreview();
      try {
        await this.app.history.commit(next => {
          const list = next.settings.csvImportProfiles ||= [], index = list.findIndex(profile => profile.id === id);
          CsvParser.assert(!update || index >= 0, this.t("The selected CSV import profile no longer exists."));
          CsvParser.assert(!list.some(profile => profile.id !== id && profile.kind === kind && profile.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()), this.t("A CSV import profile with this name already exists."));
          const available = CsvImporter.destinations(next, kind);
          CsvParser.assert(candidate.columns.every(column => !column.target || available.some(field => field.id === column.target && field.type === column.type)), this.t("The CSV destination fields changed. Review the mapping."));
          CsvParser.assert(index >= 0 || list.length < CsvImportProfiles.LIMIT, this.t("You can save up to 30 CSV import profiles per organization."));
          if (index >= 0) list[index] = candidate; else list.push(candidate);
        });
        selectedProfile = id; deleteArmed = false;
        this.app.notifier.notify("CSV import profile saved.");
      } finally { profileBusy = false; if (form.isConnected) { drawProfiles(); showPreview(); } }
    };
    this.$('#csv-profile-save').onclick = this.app.notifier.action(() => saveProfile(false));
    this.$('#csv-profile-update').onclick = this.app.notifier.action(() => saveProfile(true));
    this.$('#csv-profile-name').onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); this.$(selectedProfile ? '#csv-profile-update' : '#csv-profile-save').click(); }
    };
    this.$('#csv-profile-delete').onclick = this.app.notifier.action(async () => {
      if (profileBusy) throw new Error(this.t("A save is in progress. Please try again in a moment."));
      if (!deleteArmed) { deleteArmed = true; drawProfiles(); return; }
      const id = selected().id;
      profileBusy = true; drawProfiles(); showPreview();
      try {
        await this.app.history.commit(next => {
          CsvParser.assert(next.settings.csvImportProfiles?.some(profile => profile.id === id), this.t("The selected CSV import profile no longer exists."));
          next.settings.csvImportProfiles = next.settings.csvImportProfiles.filter(profile => profile.id !== id);
        });
        selectedProfile = ''; deleteArmed = false;
        this.app.notifier.notify("CSV import profile deleted.");
      } finally { profileBusy = false; if (form.isConnected) { drawProfiles(); showPreview(); } }
    });
    this.$('#csv-profile-review').onchange = showPreview;
    for (const id of ['csv-separator', 'csv-encoding', 'csv-header']) document.getElementById(id).onchange = parse;
    this.$('#csv-import-form').onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      if (profileBusy) throw new Error(this.t("A save is in progress. Please try again in a moment."));
      if (needsReview && !this.$('#csv-profile-review').checked) throw new Error(this.t("Review the changed CSV mapping before importing."));
      if (!preview || preview.errorCount || !preview.records.length) throw new Error(this.t("Fix the errors before importing."));
      profileBusy = true; drawProfiles();
      this.$('#csv-import').disabled = true;
      let count;
      try {
        await this.app.history.commit(next => {
          const available = CsvImporter.destinations(next, kind);
          if (mapping.some(id => id && !available.some(field => field.id === id && field.type === fields.find(original => original.id === id)?.type))) throw new Error(this.t("The CSV destination fields changed. Review the mapping."));
          const result = CsvImporter.prepareImport(next, kind, rows, mapping);
          if (result.errorCount) throw new Error(this.t("The data or catalogs have changed. Reopen the import and check the mapping."));
          count = result.records.length; next[kind].push(...result.records);
        });
        if (form.isConnected) this.$('#modal').close();
        this.app.shell.rerenderPreservingView(); this.app.notifier.notify(this.app.transfer.fillText("Imported {0} rows.", count));
      } finally { profileBusy = false; if (form.isConnected) { drawProfiles(); showPreview(); } }
    });
    drawProfiles(); parse();
  }
  pruneColumnEditors(form, kind) {
    for (const field of ColumnSchema.BUILTIN_FIELDS[kind]) {
      if (this.hasColumn(field.id, kind)) continue;
      const names = field.id === 'effort' ? ['days', 'hours'] : [field.property];
      for (const name of names) if (name) form.querySelector(`[name="${name}"]`)?.closest('.field')?.remove();
      if (field.type === 'richtext') form.querySelector(`#${field.id}-editor`)?.closest('.field')?.remove();
    }
  }
}
