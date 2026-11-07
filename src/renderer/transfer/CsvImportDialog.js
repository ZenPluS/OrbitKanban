// CSV import of tasks and issues.
import { Component } from '../core/Component.js';
import { ColumnSchema, CsvImporter, CsvParser } from '../shared.js';

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
    const buffer = await file.arrayBuffer(), fields = CsvImporter.destinations(this.state.data, kind);
    let rows = [], mapping = [], preview;
    this.app.modal.openModal(`<form id="csv-import-form"><div class="modal-heading"><div><div class="eyebrow">CSV · ${this.esc(this.state.data.settings.tabNames[kind === 'tasks' ? 0 : 1])}</div><h2>${this.esc(this.t("Import CSV"))}</h2></div><button type="button" class="icon-button" data-close aria-label="${this.esc(this.t("Close"))}">${this.ico('close')}</button></div><p>${this.esc(file.name)}</p>
    <p class="section-description">${this.esc(this.t("Rows will be added without overwriting existing ones. Duplicates will be flagged as usual."))}</p>
    <div class="csv-options"><label class="field">${this.esc(this.t("Delimiter"))}<select id="csv-separator"><option value="">${this.esc(this.t("Automatic"))}</option><option value=";">;</option><option value=",">,</option><option value="tab">Tab</option></select></label><label class="field">${this.esc(this.t("Encoding"))}<select id="csv-encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (Excel)</option><option value="utf-16le">UTF-16 LE</option></select></label><label class="checkbox-field"><input id="csv-header" type="checkbox" checked> ${this.esc(this.t("First row contains headers"))}</label></div>
    <p class="muted">${this.esc(this.t("Dates: YYYY-MM-DD or DD/MM/YYYY. Numbers: decimal point or comma. Multiple choices and tags: separate with |. Configure catalogs and custom columns first."))}</p>
    ${kind === 'tasks' ? `<p class="muted">${this.esc(this.t("Incidents and problems are calculated: import them into the linked issues list."))}</p>` : ''}
    <div class="csv-mapping" id="csv-mapping"></div><div id="csv-status" role="status" aria-live="polite"></div><div class="table-scroll csv-preview" id="csv-preview"></div>
    <div class="modal-actions"><span class="spacer"></span><button class="button" type="button" data-close>${this.esc(this.t("Cancel"))}</button><button class="button primary" type="submit" id="csv-import" disabled>${this.esc(this.t("Import rows"))}</button></div></form>`);
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
        button.disabled = preview.errorCount > 0 || !preview.records.length;
        button.textContent = this.app.transfer.fillText("Import {0} rows", preview.records.length);
      } catch (error) { status.className = 'csv-errors'; status.textContent = this.t(error.message); }
    };
    const parse = () => {
      this.$('#csv-import').disabled = true; rows = []; mapping = []; preview = undefined;
      try {
        let text;
        try { text = new TextDecoder(this.$('#csv-encoding').value, { fatal: true }).decode(buffer); }
        catch { throw new Error(this.t("The file does not match the selected encoding. Try Windows-1252 or UTF-16 LE.")); }
        const separator = this.$('#csv-separator').value;
        const parsed = CsvParser.parseCsv(text, separator === 'tab' ? '\t' : separator), hasHeader = this.$('#csv-header').checked;
        const headers = hasHeader ? parsed.rows[0] : parsed.rows[0].map((_, i) => `${this.t("Column")} ${i + 1}`);
        rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
        mapping = hasHeader ? CsvImporter.suggestMapping(headers, fields) : headers.map(() => '');
        this.$('#csv-mapping').innerHTML = `<h3>${this.esc(this.t("Map columns"))}</h3>${headers.map((header, index) => `<label class="csv-map-row"><span><strong>${this.esc(header || `${this.t("Column")} ${index + 1}`)}</strong><small>${this.esc(rows[0]?.[index]?.slice(0, 100) || '—')}</small></span><select data-csv-column="${index}" aria-label="${this.esc(this.t("Destination") + ': ' + header)}"><option value="">${this.esc(this.t("Do not import"))}</option>${fields.map(field => `<option value="${this.esc(field.id)}" ${field.id === mapping[index] ? 'selected' : ''}>${this.esc((field.custom ? `${field.name} · ${this.t("Custom")}` : this.t(field.name)) + ' · ' + this.t(this.app.columns.fieldTypeNames[field.type]))}</option>`).join('')}</select></label>`).join('')}`;
        document.querySelectorAll('[data-csv-column]').forEach(select => select.onchange = () => { mapping[Number(select.dataset.csvColumn)] = select.value; showPreview(); });
        showPreview();
      } catch (error) { this.$('#csv-mapping').innerHTML = ''; this.$('#csv-preview').innerHTML = ''; this.$('#csv-status').className = 'csv-errors'; this.$('#csv-status').textContent = this.t(error.message); }
    };
    for (const id of ['csv-separator', 'csv-encoding', 'csv-header']) document.getElementById(id).onchange = parse;
    this.$('#csv-import-form').onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      if (!preview || preview.errorCount || !preview.records.length) throw new Error(this.t("Fix the errors before importing."));
      this.$('#csv-import').disabled = true;
      let count;
      try {
        await this.app.history.commit(next => {
          const result = CsvImporter.prepareImport(next, kind, rows, mapping);
          if (result.errorCount) throw new Error(this.t("The data or catalogs have changed. Reopen the import and check the mapping."));
          count = result.records.length; next[kind].push(...result.records);
        });
        this.$('#modal').close(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify(this.app.transfer.fillText("Imported {0} rows.", count));
      } finally { if (this.$('#csv-import')) this.$('#csv-import').disabled = false; }
    });
    parse();
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
