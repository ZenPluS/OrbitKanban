// Popup menu that assigns tags to a task from the list.
import { Component } from '../core/Component.js';
import { ColumnSchema } from '../shared.js';

export class TagMenu extends Component {
  closeTagMenu(restoreFocus = false) {
    const menu = this.$('#tag-menu');
    if (!menu) return;
    const owner = document.querySelector(menu.dataset.owner);
    menu.remove();
    owner?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) owner?.focus({ preventScroll: true });
  }
  openTagMenu(button, custom) {
    const id = button.dataset.taskTags, owner = custom ? `${custom.form ? '#' + custom.form.id : '#content'} [data-choice-picker="${CSS.escape(button.dataset.choicePicker)}"]` : `[data-task-tags="${CSS.escape(id)}"]`, same = this.$('#tag-menu')?.dataset.owner === owner;
    this.closeTagMenu();
    this.app.rowMarks.closeMarkMenu();
    if (same) return;
    const task = this.state.data.tasks.find(task => task.id === id);
    if (!task && !custom) return;
    const initial = new Set(custom ? custom.values : task.tagIds || []);
    const menu = document.createElement('form');
    menu.id = 'tag-menu';
    menu.dataset.task = id;
    menu.dataset.owner = owner;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', custom ? custom.field.name : this.t("Edit tags") + ': ' + task.code);
    const searchLabel = this.esc(custom?.searchLabel || this.t("Search tasks…"));
    menu.innerHTML = (custom?.options ? `<fieldset class="field full task-tags reference-menu"><legend>${this.esc(custom.field.name)}</legend><input type="search" class="reference-search" placeholder="${searchLabel}" aria-label="${searchLabel}"><div class="tag-options reference-options">${custom.options.map(option => `<label class="tag-choice" data-search="${this.esc(option.search)}"><input type="checkbox" name="tagIds" value="${this.esc(option.id)}" ${initial.has(option.id) ? 'checked' : ''}>${option.html}</label>`).join('') || `<p class="muted">${this.esc(custom.emptyLabel || this.t("No other tasks available."))}</p>`}</div></fieldset>` :
      custom ? `<fieldset class="field full task-tags"><legend>${this.esc(custom.field.name)}</legend><p class="muted">${this.esc(this.t("Select labels. Manage names and colors in the dedicated settings section."))}</p><div class="tag-options">${ColumnSchema.choices(custom.field).map(option => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${this.esc(option.id)}" ${initial.has(option.id) ? 'checked' : ''}>${this.app.presenter.pill(option.name, option.color, 'tag-pill')}</label>`).join('')}</div></fieldset>` : this.app.presenter.tagPicker(task)) + this.ui`<div class="tag-menu-actions"><button type="button" class="button small" data-cancel-tags>Cancel</button><button type="submit" class="button small primary">Apply</button></div>`;
    (custom?.form ? this.$('#modal') : document.body).append(menu);
    this.#positionTagMenu(menu);
    const search = menu.querySelector('.reference-search');
    if (search) search.oninput = () => {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      menu.querySelectorAll('[data-search]').forEach(option => { option.hidden = !words.every(word => option.dataset.search.includes(word)); });
    };
    search?.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('[data-cancel-tags]').onclick = () => this.closeTagMenu(true);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeTagMenu(true); }
      if (event.key === 'Tab') {
        const inputs = [...menu.querySelectorAll('input,button')], index = inputs.indexOf(document.activeElement);
        if (event.shiftKey && index === 0 || !event.shiftKey && index === inputs.length - 1) {
          event.preventDefault(); inputs[event.shiftKey ? inputs.length - 1 : 0].focus();
        }
      }
    });
    menu.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const chosen = new Set(new FormData(menu).getAll('tagIds'));
      const added = [...chosen].filter(id => !initial.has(id)), removed = [...initial].filter(id => !chosen.has(id));
      const submit = menu.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (custom) await custom.apply(added, removed, [...chosen]);
        else await this.app.history.commit(next => {
          const row = next.tasks.find(task => task.id === id);
          if (!row) throw new Error("Task no longer available.");
          const known = new Set(next.settings.tags.map(tag => tag.id));
          row.tagIds = [...new Set([...(row.tagIds || []).filter(id => !removed.includes(id)), ...added])].filter(id => known.has(id));
        });
        this.closeTagMenu();
        if (!custom?.form) this.app.shell.rerenderPreservingView();
        document.querySelector(owner)?.focus({ preventScroll: true });
      } finally { submit.disabled = false; }
    });
    (menu.querySelector('input') || menu.querySelector('button')).focus({ preventScroll: true });
  }
  #positionTagMenu(menu) {
    const owner = document.querySelector(menu.dataset.owner);
    if (!owner) { this.closeTagMenu(); return; }
    const rect = owner.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
  }
  install() {
    document.addEventListener('pointerdown', event => {
      const menu = this.$('#tag-menu');
      if (menu && !menu.contains(event.target) && !event.target.closest('[data-task-tags], [data-choice-picker]')) this.closeTagMenu();
    }, true);
    window.addEventListener('scroll', event => {
      const menu = this.$('#tag-menu');
      if (!menu || menu.contains(event.target)) return;
      if (menu.closest('#modal')) this.#positionTagMenu(menu); else this.closeTagMenu();
    }, true);
    window.addEventListener('resize', () => this.closeTagMenu());
  }
}
