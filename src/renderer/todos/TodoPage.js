// Organization-local note cards and checklists.
import { Component } from '../core/Component.js';
import { TodoLists } from '../shared.js';

export class TodoPage extends Component {
  query = '';
  #card(card) {
    const id = this.esc(card.id), label = card.title || this.t("Untitled card");
    const action = (attribute, icon, text) => `<button type="button" class="icon-button" ${attribute}="${id}" title="${this.esc(this.t(text))}" aria-label="${this.esc(this.t(text) + ': ' + label)}">${this.ico(icon)}</button>`;
    return `<article class="todo-card" data-todo="${id}" style="--todo-color:${this.esc(card.color)}">
      <header><h2>${this.esc(label)}</h2><span class="${card.pinned ? 'todo-pinned' : ''}">${action('data-todo-pin', 'star', card.pinned ? "Unpin card" : "Pin card")}</span></header>
      ${card.text ? `<p class="todo-text">${this.esc(card.text)}</p>` : ''}
      ${card.items.length ? `<ul class="todo-items">${card.items.map(item => `<li class="${item.done ? 'is-done' : ''}"><label><input type="checkbox" data-todo-item="${this.esc(item.id)}" ${item.done ? 'checked' : ''}><span>${this.esc(item.text)}</span></label></li>`).join('')}</ul>` : ''}
      <footer>${action('data-todo-edit', 'edit', "Edit card")}${action('data-todo-delete', 'close', "Delete card")}</footer></article>`;
  }
  render() {
    const cards = this.state.data.todos || [], words = this.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible = cards.filter(card => {
      const text = [card.title, card.text, ...card.items.map(item => item.text)].join(' ').toLocaleLowerCase();
      return words.every(word => text.includes(word));
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('todos'), "Keep notes and checklists together in this organization.", `<button type="button" class="button primary" id="new-todo">${this.ico('plus')}${this.esc(this.t("New card"))}</button>`) +
      `<div id="todo-page"><label class="group-search"><span aria-hidden="true">${this.ico('search')}</span><input id="todo-search" type="search" autocomplete="off" value="${this.esc(this.query)}" placeholder="${this.esc(this.t("Search cards…"))}" aria-label="${this.esc(this.t("Search cards…"))}"></label>` +
      (visible.length ? `<div class="todo-grid">${visible.map(card => this.#card(card)).join('')}</div>` : `<section class="panel empty"><p>${this.esc(this.t(cards.length ? "No cards match the search." : "No cards yet. Create a note or checklist."))}</p></section>`) + '</div>';
    const search = this.$('#todo-search');
    search.oninput = () => {
      this.query = search.value;
      const position = search.selectionStart;
      this.render();
      this.$('#todo-search').focus();
      this.$('#todo-search').setSelectionRange(position, position);
    };
    this.$('#new-todo').onclick = () => this.edit();
    this.$('#todo-page').onclick = event => {
      const button = event.target.closest('[data-todo-edit], [data-todo-delete], [data-todo-pin]');
      if (!button) return;
      const id = button.dataset.todoEdit || button.dataset.todoDelete || button.dataset.todoPin;
      const card = (this.state.data.todos || []).find(entry => entry.id === id);
      if (!card) { this.app.notifier.notify("This item no longer exists.", true); return; }
      if (button.hasAttribute('data-todo-edit')) this.edit(card);
      if (button.hasAttribute('data-todo-delete')) this.remove(card);
      if (button.hasAttribute('data-todo-pin')) this.app.notifier.action(async () => {
        await this.app.history.commit(next => {
          const current = next.todos.find(entry => entry.id === id);
          if (!current) throw new Error(this.t("This item no longer exists."));
          current.pinned = !current.pinned;
        });
        this.app.shell.rerenderPreservingView();
        this.$(`[data-todo-pin="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      })();
    };
    this.$('#todo-page').onchange = this.app.notifier.action(async event => {
      const input = event.target.closest('[data-todo-item]');
      if (!input) return;
      const cardId = input.closest('[data-todo]').dataset.todo, itemId = input.dataset.todoItem, done = input.checked;
      input.disabled = true;
      try {
        await this.app.history.commit(next => {
          const item = next.todos.find(card => card.id === cardId)?.items.find(entry => entry.id === itemId);
          if (!item) throw new Error(this.t("This item no longer exists."));
          item.done = done;
        });
      } finally {
        this.app.shell.rerenderPreservingView();
        this.$(`[data-todo="${CSS.escape(cardId)}"] [data-todo-item="${CSS.escape(itemId)}"]`)?.focus({ preventScroll: true });
      }
    });
  }
  edit(existing) {
    if (!existing && (this.state.data.todos || []).length >= TodoLists.LIMIT) { this.app.notifier.notify("Too many to-do cards.", true); return; }
    const card = existing ? structuredClone(existing) : { id: this.uid(), title: '', text: '', color: TodoLists.PALETTE[(this.state.data.todos || []).length % TodoLists.PALETTE.length], pinned: false, items: [] };
    this.app.modal.openModal(this.ui`<form id="todo-form"><div class="modal-heading"><div><div class="eyebrow">TO-DO</div><h2>${this.esc(this.t(existing ? "Edit card" : "New card"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>
      <div class="todo-form-fields"><label class="field">Title<input name="title" maxlength="${TodoLists.TITLE_MAX}" value="${this.esc(card.title)}" autocomplete="off"></label>
      <label class="field">Note<textarea name="text" maxlength="${TodoLists.TEXT_MAX}" rows="3">${this.esc(card.text)}</textarea></label>
      <div class="field"><span class="field-label">Color</span>${this.app.colorPicker.colorControl(card.color, this.t("Card"), 'id="todo-color"', true)}</div>
      <fieldset class="todo-editor-items"><legend>Checklist</legend><div id="todo-editor-items"></div><button type="button" class="button small" id="todo-add-item">${this.ico('plus')}Add item</button></fieldset></div>
      <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary">Save card</button></div></form>`);
    const form = this.$('#todo-form'), list = this.$('#todo-editor-items'), color = this.$('#todo-color');
    color.onclick = () => this.app.colorPicker.openColorPicker(color);
    const add = item => {
      if (list.children.length >= TodoLists.ITEM_LIMIT) { this.app.notifier.notify("Too many checklist items.", true); return; }
      list.insertAdjacentHTML('beforeend', `<div class="todo-editor-item" data-item-id="${this.esc(item.id)}"><input type="checkbox" aria-label="${this.esc(this.t("Completed"))}" ${item.done ? 'checked' : ''}><input class="todo-item-text" maxlength="${TodoLists.ITEM_MAX}" value="${this.esc(item.text)}" placeholder="${this.esc(this.t("Checklist item"))}" aria-label="${this.esc(this.t("Checklist item"))}"><button type="button" class="icon-button" data-remove-item title="${this.esc(this.t("Remove item"))}" aria-label="${this.esc(this.t("Remove item"))}">${this.ico('close')}</button></div>`);
    };
    card.items.forEach(add);
    this.$('#todo-add-item').onclick = () => { add({ id: this.uid(), text: '', done: false }); list.lastElementChild?.querySelector('.todo-item-text').focus(); };
    list.onclick = event => event.target.closest('[data-remove-item]')?.closest('.todo-editor-item').remove();
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const items = [...list.children].map(row => ({ id: row.dataset.itemId, text: row.querySelector('.todo-item-text').value.trim(), done: row.querySelector('input[type="checkbox"]').checked })).filter(item => item.text);
      const updated = { ...card, title: form.elements.title.value.trim(), text: form.elements.text.value.trim(), color: color.value, items };
      if (!updated.title && !updated.text && !items.length) throw new Error(this.t("Add a title, note or checklist item."));
      await this.app.history.commit(next => {
        next.todos ??= [];
        const index = next.todos.findIndex(entry => entry.id === card.id);
        if (existing && index < 0) throw new Error(this.t("This item no longer exists."));
        if (index >= 0) next.todos[index] = updated; else next.todos.push(updated);
      });
      this.$('#modal').close();
      this.app.shell.rerenderPreservingView();
      this.app.notifier.notify("Card saved.");
    });
    form.elements.title.focus();
  }
  remove(card) {
    this.app.modal.confirmDialog("Delete this card?", "The note and its checklist will be deleted.", async () => {
      await this.app.history.commit(next => { next.todos = (next.todos || []).filter(entry => entry.id !== card.id); });
      this.app.shell.rerenderPreservingView();
      this.app.notifier.notify("Card deleted.");
    });
  }
}
