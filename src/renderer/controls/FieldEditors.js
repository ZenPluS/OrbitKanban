// Rich text editors and custom field editors of the forms.
import { Component } from '../core/Component.js';
import { ColumnSchema, ColumnValidator, PlatformLinks } from '../shared.js';

export class FieldEditors extends Component {
  editor(id, label, html, translateLabel = true) {
    return this.ui`<div class="field full"><span class="field-label" id="${id}-label">${this.esc(translateLabel ? this.t(label) : label)}</span><div class="rich-editor"><div class="rich-toolbar" data-editor="${id}"><button type="button" data-command="bold" title="Bold"><b>B</b></button><button type="button" data-command="italic" title="Italic"><i>I</i></button><button type="button" data-command="underline" title="Underline"><u>U</u></button><button type="button" data-command="insertUnorderedList" title="Bulleted list">• List</button><button type="button" data-command="insertOrderedList" title="Numbered list">1. List</button><button type="button" data-command="removeFormat" title="Clear formatting">Tx</button></div><div id="${id}" class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-label">${this.app.richText.sanitize(html)}</div></div></div>`;
  }
  wireEditors() {
    this.app.cells.wireChoicePickers();
    document.querySelectorAll('[data-command]').forEach(b => {
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => {
        const editor = document.getElementById(b.closest('[data-editor]').dataset.editor);
        editor.focus(); document.execCommand(b.dataset.command, false);
      };
    });
    document.querySelectorAll('.editable').forEach(el => {
      el.addEventListener('paste', e => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        if (html) document.execCommand('insertHTML', false, this.app.richText.sanitize(html));
        else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });
      el.addEventListener('drop', e => e.preventDefault());
    });
  }
  customEditors(kind, record, wrap = true) {
    const fields = ColumnSchema.fieldsOf(this.state.data.settings, kind);
    if (!fields.length) return '';
    const html = fields.map(field => {
      const value = record.customFields?.[field.id], label = this.esc(field.name), name = this.esc(field.id);
      if (field.type === 'richtext') return this.editor(`editor-${field.id}`, field.name, value || '', false);
      if (field.type === 'child') return `<div class="field reference-field"><span class="field-label">${label}</span><div class="reference-chips" data-reference-field="${name}">${this.app.cells.referenceChips(this.app.cells.referenceTasks(this.app.cells.referenceIds(record, field)), false) || `<span class="muted">${this.esc(this.t("No successors yet"))}</span>`}</div><small>${this.esc(this.t("Filled in automatically from the tasks that list this one as a predecessor."))}</small></div>`;
      if (field.type === 'parent') return `<label class="field reference-field">${label}<div>${this.app.cells.referenceButton(record, field, value || [])}${(value || []).map(value => `<input type="hidden" name="${name}" value="${this.esc(value)}">`).join('')}</div></label>`;
      if (field.type === 'platform') return `<div class="field platform-field"><label for="platform-${name}">${label}</label><input id="platform-${name}" name="${name}" maxlength="2000" spellcheck="false" autocomplete="off" value="${this.esc(value ?? '')}" placeholder="${this.esc(field.template ? this.t("Code on the platform or full link") : 'https://')}" data-platform-field="${name}"><small class="platform-preview" aria-live="polite"></small></div>`;
      const choice = (value, name, selected) => `<option value="${this.esc(value)}" ${selected ? 'selected' : ''}>${this.esc(name)}</option>`;
      let input;
      if (field.type === 'boolean') input = `<select name="${name}">${choice('', '—', value === undefined)}${choice('true', this.t("Yes"), value === true)}${choice('false', this.t('No'), value === false)}</select>`;
      else if (field.type === 'multiselect') input = `<div>${this.app.cells.choiceButton(record, field, kind)}${(value || []).map(value => `<input type="hidden" name="${name}" value="${this.esc(value)}">`).join('')}</div>`;
      else if (field.type === 'select') input = `<select name="${name}">${choice('', '—', !value)}${ColumnSchema.choices(field).map(option => choice(option.id, option.name, option.id === value)).join('')}</select>`;
      else input = `<input name="${name}" type="${field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text'}" ${['number', 'effort'].includes(field.type) ? 'step="any"' : 'maxlength="200000"'} ${field.type === 'effort' ? 'min="0"' : ''} value="${this.esc(value ?? '')}">`;
      return `<label class="field">${label}${input}${field.type === 'effort' ? `<small>${this.esc(this.t("Value in hours"))}</small>` : ''}</label>`;
    }).join('');
    return wrap ? `<section class="custom-edit-fields full"><h3>${this.esc(this.t("Custom columns"))}</h3><div class="form-grid">${html}</div></section>` : html;
  }
  readCustomEditors(form, kind) {
    const values = {}, entries = new FormData(form);
    for (const field of ColumnSchema.fieldsOf(this.state.data.settings, kind)) {
      let value;
      if (field.type === 'richtext') value = this.app.richText.sanitize(document.getElementById(`editor-${field.id}`).innerHTML);
      else if (field.type === 'child') continue;
      else if (['multiselect', 'parent'].includes(field.type)) value = entries.getAll(field.id);
      else {
        const raw = entries.get(field.id);
        value = raw === '' || raw === null ? undefined : field.type === 'boolean' ? raw === 'true' : ['number', 'effort'].includes(field.type) ? Number(raw) : field.type === 'url' ? PlatformLinks.normalizeUrl(raw) : field.type === 'platform' ? PlatformLinks.platformValue(field, raw) || undefined : raw;
      }
      ColumnValidator.validateValue(value, field);
      if (value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)) values[field.id] = value;
    }
    return values;
  }
}
