// Drag and drop ordering for settings lists and column editors.
import { Component } from '../core/Component.js';

export class SortableList extends Component {
  // Drag and drop ordering for the settings lists and the column editors. Rows follow the pointer live, the list
  // scrolls near its edges, Esc restores the original order; the ↑ ↓ buttons and the arrow keys on the grip still work.
  dragHandle = name => `<button type="button" class="drag-handle" data-drag-handle title="${this.esc(this.t("Drag to reorder, or use the ↑ ↓ keys"))}" aria-label="${this.esc(this.app.transfer.fillText("Reorder “{0}”", name))}"></button>`;
  announceOrder(container, message) {
    const host = container.closest('dialog') || document.body;
    let region = [...host.children].find(child => child.classList.contains('sort-status'));
    if (!region) {
      region = document.createElement('div');
      region.className = 'sr-only sort-status';
      region.setAttribute('role', 'status');
      host.append(region);
    }
    region.textContent = message;
  }
  sortable(container, rowSelector, move, handlesOnly = false) {
    const self = this;
    const rowsOf = () => [...container.querySelectorAll(rowSelector)];
    const place = (from, to) => {
      const count = rowsOf().length;
      if (from !== to) {
        const result = move(from, to);
        if (result?.then) {
          result.then(() => {
            this.announceOrder(container, this.app.transfer.fillText("Moved to position {0} of {1}", to + 1, count));
          }).catch(error => this.app.notifier.notify(error.message, true));
          return;
        }
      }
      rowsOf()[to]?.querySelector('[data-drag-handle]')?.focus();
      if (from !== to) this.announceOrder(container, this.app.transfer.fillText("Moved to position {0} of {1}", to + 1, count));
      this.app.settings.refreshSettingsState();
    };
    container.onkeydown = event => {
      const handle = event.target.closest?.('[data-drag-handle]');
      if (!handle || this.state.saving || this.state.organizationBusy || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const rows = rowsOf(), from = rows.indexOf(handle.closest(rowSelector)), to = from + (event.key === 'ArrowUp' ? -1 : 1);
      if (from >= 0 && to >= 0 && to < rows.length) place(from, to);
    };
    container.onpointerdown = event => {
      const row = event.target.closest(rowSelector);
      if (event.button !== 0 || !event.isPrimary || !row || !container.contains(row) || this.state.saving || this.state.organizationBusy || document.body.classList.contains('is-sorting')) return;
      if (handlesOnly && !event.target.closest('[data-drag-handle]')) return;
      if (!event.target.closest('[data-drag-handle]') && event.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
      const from = rowsOf().indexOf(row), startX = event.clientX, startY = event.clientY, pointerId = event.pointerId;
      let dragging = false, pointerY = startY, grab = 0, frame = 0, scrollers = [];
      const listeners = { pointermove: onMove, pointerup: onUp, pointercancel: () => stop(true), keydown: onKey };
      for (const [type, listener] of Object.entries(listeners)) window.addEventListener(type, listener, true);
      function layout() {
        const others = rowsOf().filter(item => item !== row);
        const next = others.find(item => { const box = item.getBoundingClientRect(); return pointerY < box.top + box.height / 2; });
        if (next && row.nextElementSibling !== next) next.before(row);
        else if (!next && others.length && others.at(-1).nextElementSibling !== row) others.at(-1).after(row);
        row.style.transform = '';
        const rows = rowsOf(), natural = row.getBoundingClientRect(), first = rows[0].getBoundingClientRect(), last = rows.at(-1).getBoundingClientRect();
        const top = Math.min(Math.max(pointerY - grab, first.top), last.bottom - natural.height);
        row.style.transform = `translateY(${Math.round(top - natural.top)}px)`;
      }
      function autoScroll() {
        frame = 0;
        if (!dragging) return;
        for (const element of scrollers) {
          const box = element.getBoundingClientRect(), edge = Math.min(48, box.height / 4);
          const speed = pointerY < box.top + edge ? -(box.top + edge - pointerY) : pointerY > box.bottom - edge ? pointerY - box.bottom + edge : 0;
          const room = speed < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
          if (speed && room) {
            element.scrollTop += Math.sign(speed) * Math.min(18, Math.ceil(Math.abs(speed) / 3));
            layout();
            frame = requestAnimationFrame(autoScroll);
            return;
          }
        }
      }
      function onMove(move) {
        if (move.pointerId !== pointerId) return;
        if (!row.isConnected) { stop(true); return; }
        pointerY = move.clientY;
        if (!dragging) {
          if (Math.hypot(move.clientX - startX, move.clientY - startY) < 4) return;
          dragging = true;
          grab = startY - row.getBoundingClientRect().top;
          for (let element = container; element && element !== document.documentElement; element = element.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) scrollers.push(element);
          }
          try { container.setPointerCapture(pointerId); } catch {}
          row.classList.add('is-dragging');
          document.body.classList.add('is-sorting');
        }
        move.preventDefault();
        layout();
        if (!frame) frame = requestAnimationFrame(autoScroll);
      }
      function onUp(up) {
        if (up.pointerId !== pointerId) return;
        const moved = dragging && row.isConnected;
        const to = moved ? rowsOf().indexOf(row) : from;
        stop(false);
        if (!moved) return;
        // The release would otherwise click whatever ended up under the pointer, e.g. a checkbox label.
        const swallow = click => { click.preventDefault(); click.stopImmediatePropagation(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, true));
        place(from, to);
      }
      function onKey(key) {
        if (key.key !== 'Escape') return;
        key.preventDefault();
        key.stopImmediatePropagation();
        stop(true);
      }
      function stop(cancel) {
        for (const [type, listener] of Object.entries(listeners)) window.removeEventListener(type, listener, true);
        cancelAnimationFrame(frame);
        try { container.releasePointerCapture(pointerId); } catch {}
        row.classList.remove('is-dragging');
        row.style.transform = '';
        document.body.classList.remove('is-sorting');
        if (cancel && dragging && row.isConnected) {
          const others = rowsOf().filter(item => item !== row);
          if (others[from]) others[from].before(row); else others.at(-1)?.after(row);
          self.announceOrder(container, self.t("Move cancelled"));
        }
        dragging = false;
      }
    };
  }
}
