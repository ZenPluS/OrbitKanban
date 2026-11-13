// Organization-local note cards and checklists.
import { Component } from '../core/Component.js';
import { ColorMath, TodoLists } from '../shared.js';

export class TodoPage extends Component {
  query = '';
  draggingId = '';
  #style(color) {
    const { text, header } = ColorMath.readableSurface(color);
    return `--todo-color:${color};--todo-text:${text};--todo-header:${header}`;
  }
  #html(card) {
    return card.textHtml === undefined ? this.esc(card.text).replace(/\r\n|\r|\n/g, '<br>') : this.app.richText.sanitize(card.textHtml);
  }
  #card(card) {
    const id = this.esc(card.id), label = card.title || this.t("Untitled card");
    const action = (attribute, icon, text) => `<button type="button" class="icon-button" ${attribute}="${id}" title="${this.esc(this.t(text))}" aria-label="${this.esc(this.t(text) + ': ' + label)}">${this.ico(icon)}</button>`;
    return `<article class="todo-card" data-todo="${id}" style="${this.esc(this.#style(card.color))}">
      <header>${this.app.sortable.dragHandle(label).replace('data-drag-handle', 'data-drag-handle draggable="true"')}<h2>${this.esc(label)}</h2><span class="${card.pinned ? 'todo-pinned' : ''}">${action('data-todo-pin', 'star', card.pinned ? "Unpin card" : "Pin card")}</span></header>
      ${card.text ? `<div class="todo-text">${this.#html(card)}</div>` : ''}
      ${card.items.length ? `<ul class="todo-items">${card.items.map(item => `<li class="${item.done ? 'is-done' : ''}"><label><input type="checkbox" data-todo-item="${this.esc(item.id)}" ${item.done ? 'checked' : ''}><span>${this.#html(item)}</span></label></li>`).join('')}</ul>` : ''}
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
    const grid = this.$('.todo-grid');
    if (grid) {
      const clearDrag = () => { this.draggingId = ''; grid.querySelectorAll('.todo-dragging, .todo-drop-target').forEach(element => element.classList.remove('todo-dragging', 'todo-drop-target')); };
      grid.ondragstart = event => {
        const handle = event.target.closest('[data-drag-handle]'), card = handle?.closest('[data-todo]');
        if (!card || this.state.saving || this.state.organizationBusy) { event.preventDefault(); return; }
        this.draggingId = card.dataset.todo;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', this.draggingId);
        card.classList.add('todo-dragging');
      };
      grid.ondragover = event => {
        const card = event.target.closest('[data-todo]');
        if (!this.draggingId || !card || card.dataset.todo === this.draggingId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        grid.querySelectorAll('.todo-drop-target').forEach(element => element.classList.remove('todo-drop-target'));
        card.classList.add('todo-drop-target');
      };
      grid.ondragend = clearDrag;
      grid.ondrop = event => {
        const card = event.target.closest('[data-todo]'), source = this.draggingId;
        if (!source || !card || source === card.dataset.todo) { clearDrag(); return; }
        event.preventDefault();
        const rect = card.getBoundingClientRect(), after = event.clientX >= rect.left + rect.width / 2;
        const target = card.dataset.todo;
        clearDrag();
        this.#move(source, target, after);
      };
      grid.onkeydown = event => {
        const handle = event.target.closest('[data-drag-handle]');
        if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
        const rows = [...grid.querySelectorAll('[data-todo]')], index = rows.indexOf(handle.closest('[data-todo]')), down = event.key === 'ArrowDown', target = rows[index + (down ? 1 : -1)];
        if (!target) return;
        event.preventDefault();
        this.#move(rows[index].dataset.todo, target.dataset.todo, down);
      };
    }
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
  #move(source, target, after) {
    this.app.notifier.action(async () => {
      try {
        await this.app.history.commit(next => TodoLists.move(next.todos, source, target, after));
        this.app.sortable.announceOrder(this.$('.todo-grid'), this.t("Card order saved."));
      } finally {
        this.app.shell.rerenderPreservingView();
        this.$(`[data-todo="${CSS.escape(source)}"] [data-drag-handle]`)?.focus({ preventScroll: true });
      }
    })();
  }
  edit(existing) {
    if (!existing && (this.state.data.todos || []).length >= TodoLists.LIMIT) { this.app.notifier.notify("Too many to-do cards.", true); return; }
    const card = existing ? structuredClone(existing) : { id: this.uid(), title: '', text: '', color: TodoLists.PALETTE[(this.state.data.todos || []).length % TodoLists.PALETTE.length], pinned: false, items: [] };
    this.app.modal.openModal(this.ui`<form id="todo-form" style="${this.esc(this.#style(card.color))}"><div class="todo-form-header"><label class="field"><span class="sr-only">Title</span><input name="title" maxlength="${TodoLists.TITLE_MAX}" value="${this.esc(card.title)}" placeholder="Title" autocomplete="off"></label><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div>
      <div class="todo-form-fields">${this.app.fieldEditors.editor('todo-note-editor', "Note", this.#html(card))}
      <fieldset class="todo-editor-items"><legend>Checklist</legend><div id="todo-editor-items"></div><button type="button" class="button small" id="todo-add-item">${this.ico('plus')}Add item</button></fieldset></div>
      <div class="todo-form-footer"><button type="button" class="icon-button" id="todo-format" aria-label="Formatting" title="Formatting" aria-expanded="false"><u>A</u></button>${this.app.colorPicker.colorControl(card.color, this.t("Card"), 'id="todo-color"')}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary">Save card</button></div></form>`);
    const form = this.$('#todo-form'), list = this.$('#todo-editor-items'), color = this.$('#todo-color'), editor = this.$('#todo-note-editor');
    this.app.fieldEditors.wireEditors();
    const toolbar = form.querySelector('.rich-toolbar');
    toolbar.hidden = true;
    this.$('#todo-format').onclick = event => {
      toolbar.hidden = !toolbar.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!toolbar.hidden));
    };
    editor.setAttribute('data-placeholder', this.t("Note"));
    form.onkeydown = event => {
      if (!event.target.matches('#todo-note-editor, .todo-item-text')) return;
      const commands = { b: 'bold', i: 'italic', u: 'underline' }, command = commands[event.key.toLowerCase()];
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && command) {
        event.preventDefault();
        document.execCommand(command, false);
      }
    };
    color.onclick = () => this.app.colorPicker.openColorPicker(color);
    color.oninput = () => { form.style.cssText = this.#style(color.value); this.app.colorPicker.updateColorControl(color, color.value); };
    const add = item => {
      if (list.children.length >= TodoLists.ITEM_LIMIT) { this.app.notifier.notify("Too many checklist items.", true); return; }
      list.insertAdjacentHTML('beforeend', `<div class="todo-editor-item" data-item-id="${this.esc(item.id)}"><input type="checkbox" aria-label="${this.esc(this.t("Completed"))}" ${item.done ? 'checked' : ''}><div class="editable todo-item-text" contenteditable="true" role="textbox" aria-label="${this.esc(this.t("Checklist item"))}" data-placeholder="${this.esc(this.t("Checklist item"))}">${this.#html(item)}</div><button type="button" class="icon-button" data-remove-item title="${this.esc(this.t("Remove item"))}" aria-label="${this.esc(this.t("Remove item"))}">${this.ico('close')}</button></div>`);
      this.app.fieldEditors.wireEditable(list.lastElementChild.querySelector('.todo-item-text'));
    };
    card.items.forEach(add);
    this.$('#todo-add-item').onclick = () => { add({ id: this.uid(), text: '', done: false }); list.lastElementChild?.querySelector('.todo-item-text').focus(); };
    list.onclick = event => event.target.closest('[data-remove-item]')?.closest('.todo-editor-item').remove();
    form.onsubmit = this.app.notifier.action(async event => {
      event.preventDefault();
      const items = [...list.children].map(row => {
        const element = row.querySelector('.todo-item-text');
        return { id: row.dataset.itemId, text: element.innerText.trim(), textHtml: this.app.richText.sanitize(element.innerHTML), done: row.querySelector('input[type="checkbox"]').checked };
      }).filter(item => item.text);
      if (items.some(item => item.text.length > TodoLists.ITEM_MAX || item.textHtml.length > TodoLists.HTML_MAX)) throw new Error(this.t("The checklist item is too long."));
      const text = editor.innerText.trim(), textHtml = this.app.richText.sanitize(editor.innerHTML);
      if (text.length > TodoLists.TEXT_MAX || textHtml.length > TodoLists.HTML_MAX) throw new Error(this.t("The note is too long."));
      const updated = { ...card, title: form.elements.title.value.trim(), text, textHtml: text ? textHtml : '', color: color.value, items };
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
