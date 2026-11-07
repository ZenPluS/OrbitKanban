// Status, urgency, highlight and tag option lists.
import { Component } from '../core/Component.js';
import { ColumnSchema, Limits } from '../shared.js';

export class OptionListSettings extends Component {
  highlightPalette = ['#f2c94c', '#f0647a', '#5aa9f6', '#4fcf8f', '#b18cff', '#ff9f5a', '#3fd0c9', '#ff7ac6', '#9ccc65', '#7986cb', '#e57373', '#4db6ac', '#ffd54f', '#ba68c8', '#90a4ae', '#a1887f'];
  optionCatalog(key) {
    const custom = this.app.settings.choiceSettingsTabs().find(tab => tab.id === key);
    if (!custom) throw new Error(this.t("This column no longer exists."));
    return custom.field.options;
  }
  #setOptionCatalog(key, list) {
    const custom = this.app.settings.choiceSettingsTabs().find(tab => tab.id === key);
    if (custom?.field.catalog) this.state.settingsDraft[custom.field.catalog] = list;
    else if (custom) custom.field.options = list;
    else throw new Error(this.t("This column no longer exists."));
  }
  drawOptionLists() {
    const self = this;
    this.app.colorPicker.closeColorPicker();
    for (const custom of this.app.settings.choiceSettingsTabs()) {
      const key = custom.id, list = this.optionCatalog(key);
      if (!document.getElementById(`${key}-list`)) continue;
      const usage = id => {
        const count = this.state.data[custom.kind].filter(row => { const value = ColumnSchema.getValue(row, custom.field); return Array.isArray(value) ? value.includes(id) : value === id; }).length;
        return `<span class="option-usage" title="${this.esc(this.t("Rows with this label"))}">${count}</span>`;
      };
      document.getElementById(`${key}-list`).innerHTML = list.map((item, index) => this.ui`<div class="option-row">${this.app.sortable.dragHandle(item.name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span>${this.app.colorPicker.colorControl(item.color, item.name, `data-color="${key}:${this.esc(item.id)}"`)}<input class="option-name" aria-label="Option name" maxlength="60" data-option-name="${key}:${this.esc(item.id)}" value="${this.esc(item.name)}">${usage(item.id)}${key === 'statuses' ? this.ui`<button class="icon-button star ${item.highlight ? 'selected' : ''}" data-highlight="${this.esc(item.id)}" title="Highlight tasks with this status" aria-pressed="${item.highlight}">${this.ico(item.highlight ? 'star' : 'star-line')}</button>` : ''}<button class="icon-button" data-move="${key}:${this.esc(item.id)}:-1" ${index === 0 ? 'disabled' : ''} title="Move up">${this.ico('arrow-up')}</button><button class="icon-button" data-move="${key}:${this.esc(item.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} title="Move down">${this.ico('arrow-down')}</button><button class="icon-button delete-option" data-remove="${key}:${this.esc(item.id)}" title="Delete option">${this.ico('close')}</button></div>`).join('') || `<p class="muted option-empty">${this.esc(this.t("No labels. Add one to get started."))}</p>`;
      const choiceAdd = document.querySelector(`[data-add-choice="${key}"]`);
      if (choiceAdd) choiceAdd.disabled = list.length >= (key === 'highlights' ? Limits.HIGHLIGHT_LIMIT : Limits.TAG_LIMIT);
      this.app.sortable.sortable(document.getElementById(`${key}-list`), '.option-row', (from, to) => { list.splice(to, 0, ...list.splice(from, 1)); this.drawOptionLists(); this.app.settings.refreshSettingsState(); });
    }
    function optionId(value) { const [key, ...parts] = value.split(':'); return [key, parts.join(':')]; }
    function itemAt(value) { const [key, id] = optionId(value); return self.optionCatalog(key).find(x => x.id === id); }
    document.querySelectorAll('[data-color]').forEach(button => {
      button.onclick = () => this.app.colorPicker.openColorPicker(button);
      button.oninput = () => { itemAt(button.dataset.color).color = button.value; this.app.colorPicker.updateColorControl(button, button.value); this.app.settings.refreshSettingsState(); };
    });
    document.querySelectorAll('[data-option-name]').forEach(input => input.oninput = () => {
      itemAt(input.dataset.optionName).name = input.value;
      const button = input.closest('.option-row').querySelector('.color-control');
      button.dataset.colorLabel = input.value; this.app.colorPicker.updateColorControl(button, button.value);
    });
    document.querySelectorAll('[data-highlight]').forEach(b => b.onclick = () => {
      const item = this.state.settingsDraft.statuses.find(s => s.id === b.dataset.highlight); item.highlight = !item.highlight; this.drawOptionLists();
    });
    document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
      const parts = b.dataset.move.split(':'), key = parts.shift(), offset = parts.pop(), id = parts.join(':'), list = this.optionCatalog(key), index = list.findIndex(x => x.id === id);
      [list[index], list[index + Number(offset)]] = [list[index + Number(offset)], list[index]]; this.drawOptionLists(); this.app.settings.refreshSettingsState();
    });
    document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
      const [key, id] = optionId(b.dataset.remove);
      this.#setOptionCatalog(key, this.optionCatalog(key).filter(x => x.id !== id)); this.drawOptionLists(); this.app.settings.refreshSettingsState();
    });
  }
}
