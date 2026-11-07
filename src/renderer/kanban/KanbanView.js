// Read-only kanban board.
import { Component } from '../core/Component.js';
import { TaskOrder } from '../shared.js';

export class KanbanView extends Component {
  renderKanban() {
    if (!this.hasColumn('status')) { this.app.milestones.unavailableColumnView('kanban', 'status'); return; }
    const tasks = this.app.sections.boardTasks();
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('kanban'), "A read-only view, always aligned with your tasks. One space for every status.", this.app.sections.viewChip() + this.ui`<span class="readonly-badge">${this.ico('lock')}Read only</span>` + this.app.excel.excelButton()) +
      this.ui`<div class="kanban-scroll"><div class="kanban-board">${this.workflowStatuses().map(status => {
        const items = TaskOrder.sortTasks(tasks.filter(t => t.statusId === status.id));
        return `<section class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${this.esc(status.name)}</span><b>${items.length}</b></div><div class="kanban-cards">${items.map(t => this.app.milestones.miniTask(t, true)).join('') || this.ui`<div class="kanban-empty">Room for upcoming tasks</div>`}</div></section>`;
      }).join('')}</div></div><div class="hint"><span>${this.ico('lock')}</span> To change a status, use the task list. Configure column order in settings.</div>`;
  }
}
