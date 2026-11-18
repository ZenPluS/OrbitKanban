// Column visibility, pinning and order dialog.
import { Component } from '../core/Component.js';

export class ColumnEditor extends Component {
  columnEditor(container, columns, kind = 'tasks', settings = this.state.data.settings) {
    const draw = focus => {
      container.innerHTML = `<ol class="column-editor">${columns.map((column, index) => {
        const def = this.app.columns.columnDef(column.id, kind, settings), name = def.field ? def.name : this.t(def.name);
        return `<li class="column-row ${column.visible ? '' : 'is-off'}">${this.app.sortable.dragHandle(name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span><label class="column-toggle"><input type="checkbox" data-column-visible="${column.id}" ${column.visible ? 'checked' : ''}><span>${this.esc(name)}</span></label>${def.sort ? `<span class="column-tag" title="${this.esc(this.t("Click the header to sort"))}">${this.ico('sort')}${this.esc(this.t("Sortable"))}</span>` : ''}<button type="button" class="icon-button" data-column-move="${column.id}:-1" ${index === 0 ? 'disabled' : ''} title="${this.esc(this.t("Move up"))}" aria-label="${this.esc(`${this.t("Move up")}: ${name}`)}">${this.ico('arrow-up')}</button><button type="button" class="icon-button" data-column-move="${column.id}:1" ${index === columns.length - 1 ? 'disabled' : ''} title="${this.esc(this.t("Move down"))}" aria-label="${this.esc(`${this.t("Move down")}: ${name}`)}">${this.ico('arrow-down')}</button></li>`;
      }).join('')}</ol>`;
      container.querySelectorAll('.column-row').forEach((row, index) => {
        const column = columns[index], label = this.t(column.pinned ? "Unpin column" : "Pin column"), def = this.app.columns.columnDef(column.id, kind, settings);
        row.querySelector('[data-column-move]').insertAdjacentHTML('beforebegin', `<button type="button" class="icon-button column-pin ${column.pinned ? 'is-pinned' : ''}" data-column-pin="${this.esc(column.id)}" aria-pressed="${Boolean(column.pinned)}" title="${this.esc(label)}" aria-label="${this.esc(`${label}: ${def.field ? def.name : this.t(def.name)}`)}">${this.ico('pin')}</button>`);
      });
      container.querySelectorAll('[data-column-pin]').forEach(button => button.onclick = () => {
        const column = columns.find(item => item.id === button.dataset.columnPin);
        if (column.pinned) delete column.pinned; else column.pinned = true;
        draw(`[data-column-pin="${CSS.escape(column.id)}"]`);
      });
      container.querySelectorAll('[data-column-visible]').forEach(input => input.onchange = () => {
        const column = columns.find(item => item.id === input.dataset.columnVisible);
        if (!input.checked && columns.filter(item => item.visible).length === 1) { input.checked = true; this.app.notifier.notify("At least one column must stay visible.", true); return; }
        column.visible = input.checked;
        draw(`[data-column-visible="${column.id}"]`);
      });
      container.querySelectorAll('[data-column-move]').forEach(button => button.onclick = () => {
        const [id, offset] = button.dataset.columnMove.split(':'), index = columns.findIndex(item => item.id === id), target = index + Number(offset);
        if (target < 0 || target >= columns.length) return;
        [columns[index], columns[target]] = [columns[target], columns[index]];
        draw(`[data-column-move="${button.dataset.columnMove}"]`);
      });
      const element = focus && container.querySelector(focus);
      if (element?.disabled) element.closest('li').querySelector('[data-column-move]:not([disabled])')?.focus();
      else element?.focus();
    };
    this.app.sortable.sortable(container, '.column-row', (from, to) => { columns.splice(to, 0, ...columns.splice(from, 1)); draw(); });
    draw();
  }
  columnsDialog(kind = 'tasks') {
    const columns = this.configuredColumns(kind);
    this.app.modal.openModal(`<div class="modal-heading"><div><div class="eyebrow">${this.esc(this.t("TASK"))}</div><h2>${this.esc(this.t("List columns"))}</h2></div><button type="button" class="icon-button" data-close aria-label="${this.esc(this.t("Close"))}">${this.ico('close')}</button></div><p class="section-description">${this.esc(this.t("Tick the columns to show and drag them (or use the arrows) to change their order. Hiding a column does not delete any data."))}</p><div id="columns-dialog-editor"></div><div class="modal-actions"><button type="button" class="button" id="columns-default">${this.esc(this.t("Restore defaults"))}</button><span class="spacer"></span><button type="button" class="button" data-close>${this.esc(this.t("Cancel"))}</button><button type="button" class="button primary" id="columns-apply">${this.esc(this.t("Apply"))}</button></div>`);
    const container = this.$('#columns-dialog-editor');
    container.insertAdjacentHTML('beforebegin', `<p class="section-description">${this.esc(this.t("Pinned columns keep their original positions and stop beside earlier pinned columns only when scrolling reaches them."))}</p>`);
    this.columnEditor(container, columns, kind);
    this.$('#columns-default').onclick = () => { columns.splice(0, columns.length, ...this.configuredColumns(kind, this.state.data.settings, [])); this.columnEditor(container, columns, kind); };
    this.$('#columns-apply').onclick = this.app.notifier.action(async () => {
      await this.app.history.commit(next => { next.settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = structuredClone(columns); });
      this.app.savedViews.clearActiveSavedView();
      this.$('#modal').close();
      this.app.shell.rerenderPreservingView();
      this.app.notifier.notify("Columns updated.");
    });
  }
}
