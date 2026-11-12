// Row highlighter and highlight menu.
import { Component } from '../core/Component.js';
import { ColumnSchema } from '../shared.js';

export class RowMarks extends Component {
  drawHighlighter() {
    const bar = this.$('.highlighter-bar');
    if (!bar) return;
    if (!this.hasColumn('highlight')) { bar.hidden = true; bar.innerHTML = ''; return; }
    const highlights = this.app.presenter.highlightsOf(), active = highlights.find(h => h.id === this.state.highlighter);
    const hint = this.state.highlighter === 'erase' ? this.t("Eraser active: click rows to remove their highlight. Press Esc to finish.")
      : active ? this.app.transfer.fillText("Highlighter “{0}” active: click rows to color them, click again to remove the color. Press Esc to finish.", active.name)
        : highlights.length ? this.t("Pick a color and click the rows to highlight, or use the ● dot at the end of each row.") : this.t("No colors available: add them in the settings.");
    bar.classList.toggle('active', Boolean(this.state.highlighter));
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', this.t("Highlighter"));
    bar.title = hint;
    bar.innerHTML = `<span class="highlighter-label">${this.ico('highlighter')} ${this.esc(this.t("Highlighter"))}</span><div class="highlighter-swatches">${highlights.map(h => `<button type="button" class="highlighter-swatch" data-highlighter="${this.esc(h.id)}" style="--mark:${h.color}" aria-pressed="${h.id === this.state.highlighter}" title="${this.esc(h.name)}"><i aria-hidden="true"></i><span>${this.esc(h.name)}</span></button>`).join('')}${highlights.length ? `<button type="button" class="highlighter-swatch eraser" data-highlighter="erase" aria-pressed="${this.state.highlighter === 'erase'}" title="${this.esc(this.t("Remove the highlight from rows"))}">${this.ico('eraser')}<span>${this.esc(this.t("Eraser"))}</span></button>` : ''}</div><span class="highlighter-hint" aria-live="polite">${this.esc(hint)}</span><button type="button" class="unsaved-link highlighter-manage" data-manage-highlights>${this.esc(this.t("Manage colors"))}</button>`;
    const table = this.$('.activity-table');
    table?.classList.toggle('painting', Boolean(this.state.highlighter));
    table?.style.setProperty('--paint', active ? active.color : 'var(--muted)');
    bar.querySelectorAll('[data-highlighter]').forEach(button => button.onclick = () => {
      const choice = button.dataset.highlighter;
      this.state.highlighter = this.state.highlighter === choice ? '' : choice;
      this.drawHighlighter();
      bar.querySelector(`[data-highlighter="${CSS.escape(choice)}"]`)?.focus();
    });
    bar.querySelector('[data-manage-highlights]').onclick = () => this.app.settings.openSettingsTab('highlights');
  }
  #applyRowMark(row, ids, task) {
    const marks = this.app.presenter.highlightsOf().filter(highlight => ids.includes(highlight.id));
    const styles = this.app.presenter.highlightStyle(marks, this.statusOf(task));
    row.classList.toggle('marked', Boolean(marks.length));
    for (const name of ['--mark', '--mark-colors', '--mark-background']) row.style.removeProperty(name);
    if (styles) {
      const sample = document.createElement('span');
      sample.style.cssText = styles;
      for (const name of ['--mark', '--mark-colors', '--mark-background']) row.style.setProperty(name, sample.style.getPropertyValue(name));
    }
    const button = row.querySelector('.mark-button');
    if (button) {
      button.classList.toggle('is-marked', Boolean(marks.length));
      const label = marks.length ? this.app.transfer.fillText("Highlight: {0}", marks.map(mark => mark.name).join(', ')) : this.t("Highlight row");
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }
  pendingMarks = new Map();
  markFlush = null;
  currentMarks = task => this.pendingMarks.has(task.id) ? this.pendingMarks.get(task.id) : ColumnSchema.taskHighlightIds(task);
  #toggleMark(ids, value) {
    return !value || value === 'erase' ? [] : ids.includes(value) ? ids.filter(id => id !== value) : [...ids, value];
  }
  paintRow(row) {
    const task = this.state.data.tasks.find(item => item.id === row.dataset.taskRow);
    if (!task) return;
    const value = this.#toggleMark(this.currentMarks(task), this.state.highlighter);
    this.#applyRowMark(row, value, task);
    this.#setTaskHighlight(task.id, value);
  }
  // Clicks are applied to the page at once and saved in order, batching the rows colored while a save is running.
  #setTaskHighlight(id, value) {
    this.pendingMarks.set(id, value);
    this.markFlush ||= this.#flushMarks().finally(() => { this.markFlush = null; });
    return this.markFlush;
  }
  async #flushMarks() {
    try {
      while (this.pendingMarks.size) {
        while (this.state.saving || this.state.organizationBusy) await new Promise(resolve => setTimeout(resolve, 30));
        const batch = new Map(this.pendingMarks);
        if (![...batch.keys()].some(id => this.state.data.tasks.some(task => task.id === id))) { this.pendingMarks.clear(); break; }
        await this.app.history.commit(next => { for (const [id, value] of batch) { const task = next.tasks.find(item => item.id === id); if (task) ColumnSchema.setTaskHighlightIds(task, value); } });
        for (const [id, value] of batch) if (this.pendingMarks.get(id) === value) this.pendingMarks.delete(id);
      }
    } catch (error) {
      this.pendingMarks.clear();
      this.app.notifier.notify(error.message, true);
    }
    if (this.$('#modal').open) this.state.renderAfterModal = true;
    else if (this.state.view !== 4) this.app.shell.rerenderPreservingView();
  }
  closeMarkMenu(restoreFocus = false) {
    const menu = document.getElementById('mark-menu');
    if (!menu) return;
    const owner = document.querySelector(`[data-mark-task="${CSS.escape(menu.dataset.task)}"]`);
    menu.remove();
    owner?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) owner?.focus();
  }
  openMarkMenu(button) {
    const id = button.dataset.markTask, open = document.getElementById('mark-menu');
    if (open) { const same = open.dataset.task === id; this.closeMarkMenu(); if (same) return; }
    const task = this.state.data.tasks.find(item => item.id === id);
    if (!task) return;
    const current = this.currentMarks(task);
    const item = (value, label, swatch) => {
      const checked = value ? current.includes(value) : !current.length;
      return `<button type="button" role="menuitemcheckbox" aria-checked="${checked}" class="mark-choice" data-mark-choice="${this.esc(value)}">${swatch}<span>${this.esc(label)}</span>${checked ? `<b aria-hidden="true">${this.ico('check')}</b>` : ''}</button>`;
    };
    const menu = document.createElement('div');
    menu.id = 'mark-menu';
    menu.className = 'mark-menu';
    menu.dataset.task = id;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', this.app.transfer.fillText("Highlight {0}", task.code));
    menu.innerHTML = this.app.presenter.highlightsOf().map(h => item(h.id, h.name, `<i class="mark-swatch" style="--mark:${h.color}"></i>`)).join('') +
      item('', this.t("No highlight"), '<i class="mark-swatch none"></i>') +
      `<hr><button type="button" role="menuitem" class="mark-choice" data-manage-highlights><i class="mark-swatch manage" aria-hidden="true">${this.ico('gear')}</i><span>${this.esc(this.t("Manage colors…"))}</span></button>`;
    document.body.append(menu);
    const rect = button.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
    menu.style.top = `${rect.bottom + 6 + height > innerHeight - 8 ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`;
    button.setAttribute('aria-expanded', 'true');
    menu.addEventListener('click', event => {
      if (event.target.closest('[data-manage-highlights]')) { this.closeMarkMenu(); this.app.settings.openSettingsTab('highlights'); return; }
      const choice = event.target.closest('[data-mark-choice]');
      if (!choice) return;
      const value = this.#toggleMark(this.currentMarks(task), choice.dataset.markChoice);
      this.closeMarkMenu();
      const row = document.querySelector(`tr[data-task-row="${CSS.escape(id)}"]`);
      if (row) this.#applyRowMark(row, value, task);
      this.#setTaskHighlight(id, value).then(() => document.querySelector(`[data-mark-task="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
    });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); this.closeMarkMenu(true); return; }
      const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement);
      const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      items[(next + items.length) % items.length].focus();
    });
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus({ preventScroll: true });
  }
  install() {
    document.addEventListener('pointerdown', event => {
      const menu = document.getElementById('mark-menu');
      if (menu && !menu.contains(event.target) && !event.target.closest('[data-mark-task]')) this.closeMarkMenu();
    }, true);
    window.addEventListener('scroll', event => { if (!document.getElementById('mark-menu')?.contains(event.target)) this.closeMarkMenu(); }, true);
    window.addEventListener('resize', () => this.closeMarkMenu());
  }
}
