// Sticky column offsets follow the actual table widths, including font and viewport changes.
import { Component } from '../core/Component.js';

export class PinnedColumns extends Component {
  #observer;
  disconnect() {
    this.#observer?.disconnect();
    this.#observer = null;
  }
  apply(kind = 'tasks') {
    this.disconnect();
    const table = this.$(kind === 'tasks' ? '.activity-table' : '#issue-rows')?.closest('table');
    if (!table) return;
    const columns = this.configuredColumns(kind);
    const pinned = new Set(columns.filter(column => column.visible && column.pinned).map(column => column.id));
    const headers = [...table.tHead.rows[0].cells];
    const indexes = headers.flatMap((header, index) => pinned.has(header.dataset.column) || (pinned.size && header.classList.contains('select-col')) ? [index] : []);
    if (!indexes.length && !table.classList.contains('has-pinned-columns')) return;
    table.classList.toggle('has-pinned-columns', indexes.length > 0);
    for (const row of table.rows) {
      for (const cell of row.cells) {
        const index = cell.cellIndex, sticky = cell.colSpan === 1 && indexes.includes(index);
        cell.classList.toggle('pinned-column', sticky);
        if (sticky) cell.style.left = `var(--pinned-left-${index})`; else cell.style.removeProperty('left');
      }
    }
    if (!indexes.length) return;
    const measure = () => {
      let left = 0;
      for (const index of indexes) {
        table.style.setProperty(`--pinned-left-${index}`, `${left}px`);
        left += headers[index].getBoundingClientRect().width;
      }
    };
    measure();
    this.#observer = new ResizeObserver(measure);
    headers.forEach(header => this.#observer.observe(header));
  }
}
