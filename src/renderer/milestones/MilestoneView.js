// Milestone timeline view.
import { Component } from '../core/Component.js';
import { Common, TaskLinks, TaskOrder } from '../shared.js';

export class MilestoneView extends Component {
  constructor(app) {
    super(app);
    this.revealNextMilestone = this.revealNextMilestone.bind(this);
    this.refreshMilestoneDate = this.refreshMilestoneDate.bind(this);
  }
  miniTask(t, readOnly = false) {
    const status = this.statusOf(t), urgency = this.urgencyOf(t), marks = this.app.presenter.taskHighlights(t), mark = marks[0], label = this.app.taskFilter.recordLabel(t);
    return `<article class="task-card ${t.hidden ? 'is-hidden' : ''} ${mark ? 'is-marked' : ''}" style="--card-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><div class="card-top">${readOnly ? `<strong class="code-label">${this.esc(label)}</strong>` : `<button class="code-link" data-card="${t.id}">${this.esc(label)}</button>`}${this.app.presenter.portalAnchor(TaskLinks.platformUrl(t, this.state.data.settings), label, 'external-link card-portal-link')}<span class="card-sequence">${t.hidden ? `<span class="hidden-badge" title="${this.esc(this.tr("Hidden from the task list"))}">${this.ico('eye-off')}${this.tr("Hidden in list")}</span>` : ''}${this.hasColumn('sequence') ? '#' + t.sequence : ''}</span></div>${this.hasColumn('description') && this.app.richText.plain(t.description) ? `<div class="card-title">${this.esc(this.app.richText.plain(t.description))}</div>` : ''}<div class="card-meta">${this.hasColumn('urgency') ? this.app.presenter.pill(urgency.name, urgency.color) : ''}${this.hasColumn('effort') ? `<span>${this.app.presenter.effort(t.effortHours)}</span>` : ''}${marks.map(item => `<span class="mark-chip" style="--mark:${item.color}" title="${this.esc(this.tr("Highlight"))}">${this.esc(item.name)}</span>`).join('')}</div><div class="card-bottom">${this.hasColumn('releaseDate') ? `<span style="color:${t.releaseDate ? TaskOrder.dateColor(t.releaseDate) : 'inherit'}">${this.ico('calendar')}${this.app.presenter.formatDate(t.releaseDate)}</span>` : ''}${!readOnly && this.hasColumn('status') ? this.app.presenter.pill(status.name, status.color) : ''}</div></article>`;
  }
  unavailableColumnView(type, id) {
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title(type), '') + `<section class="panel empty"><p>${this.esc(this.app.transfer.fillText("This view needs the {0} column. Restore it in Column management.", this.t(this.app.columns.taskColumnDefs[id].name)))}</p><button class="button" id="restore-view-column">${this.esc(this.t("Column management"))}</button></section>`;
    this.$('#restore-view-column').onclick = () => this.app.settings.openSettingsTab('custom-columns');
  }
  renderMilestones() {
    if (!this.hasColumn('releaseDate')) { this.unavailableColumnView('milestones', 'releaseDate'); return; }
    const tasks = this.app.sections.boardTasks(), dates = [...new Set(tasks.map(t => t.releaseDate).filter(Boolean))].sort();
    this.state.milestoneDay = Common.today();
    const nextDate = TaskOrder.nextReleaseDate(tasks, this.state.milestoneDay), nextLabel = nextDate === this.state.milestoneDay ? "Today's release" : "Next release";
    if (tasks.some(t => !t.releaseDate)) dates.push('');
    const shortcut = nextDate ? `<button type="button" class="button next-release-link" id="next-release-button" aria-controls="next-release-milestone" title="${this.esc(this.t("Go to next release"))}">${this.esc(this.t(nextLabel))} · ${this.esc(this.app.presenter.formatDate(nextDate))}</button>` : `<span class="view-label next-release-empty">${this.esc(this.t("No upcoming release"))}</span>`;
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('milestones'), "Every release is a milestone. Dates and tasks stay automatically aligned.", this.app.sections.viewChip() + this.ui`<span class="view-label">${dates.filter(Boolean).length} milestones · ${tasks.length} tasks</span>` + shortcut + this.app.excel.excelButton()) +
      this.ui`<div class="milestone-shell"><div class="milestone-scroll"><div class="milestone-track">${dates.map((date, index) => {
        const group = tasks.filter(t => t.releaseDate === date), color = date ? TaskOrder.dateColor(date) : '#929bb2', isNext = Boolean(nextDate && date === nextDate);
        return this.ui`<section class="milestone-column ${isNext ? 'is-next-release' : ''}" data-release-date="${this.esc(date)}" ${isNext ? 'id="next-release-milestone" aria-current="step"' : ''} style="--milestone:${color}"><div class="timeline-label"><span>${date ? this.ui`MILESTONE ${String(index + 1).padStart(2, '0')}` : 'BACKLOG'}</span>${isNext ? `<span class="next-release-badge">${this.esc(this.t(nextLabel))}</span>` : ''}</div><div class="timeline-line"><span>${this.ico('diamond')}</span></div><div class="milestone-heading"><h2>${this.app.presenter.formatDate(date)}</h2><span>${group.length} tasks${this.hasColumn('effort') ? ' · ' + this.app.presenter.effort(group.reduce((sum, t) => sum + t.effortHours, 0)) : ''}</span><button type="button" class="icon-button milestone-bulk" data-bulk-release="${this.esc(date)}" title="${this.esc(this.t("Bulk edit the tasks of this milestone"))}" aria-label="${this.esc(this.t("Bulk edit the tasks of this milestone"))}">${this.ico('edit')}</button></div><div class="milestone-cards">${this.app.taskList.sortedRows(group).map(t => this.miniTask(t)).join('')}</div></section>`;
      }).join('') || this.ui`<div class="empty">Add tasks and release dates to build your roadmap.</div>`}</div></div></div><div class="hint"><span>${this.ico('arrows-h')}</span> Scroll horizontally to explore releases and vertically to see all tasks. The same date has the same color in every view.</div>`;
    document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => this.app.taskDialog.taskDialog(this.state.data.tasks.find(t => t.id === b.dataset.card)));
    document.querySelectorAll('[data-bulk-release]').forEach(button => button.onclick = () => {
      const date = button.dataset.bulkRelease;
      this.app.bulkEdit.bulkDialog(tasks.filter(task => task.releaseDate === date).map(task => task.id), date ? this.app.transfer.fillText("Tasks of the {0} release, hidden ones included.", this.app.presenter.formatDate(date)) : this.t("Unscheduled tasks, hidden ones included."));
    });
    if (this.$('#next-release-button')) this.$('#next-release-button').onclick = this.revealNextMilestone;
    this.revealNextMilestone();
  }
  revealNextMilestone() {
    const scroll = this.$('.milestone-scroll'), column = this.$('#next-release-milestone');
    if (!scroll || !column) return;
    const target = column.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
    scroll.scrollLeft += target.left - viewport.left - Math.max(0, (scroll.clientWidth - target.width) / 2);
    scroll.scrollTop = 0;
  }
  refreshMilestoneDate() {
    if (this.state.view !== 2 || !this.state.data || this.state.saving || this.state.organizationBusy || this.$('#modal').open || this.state.milestoneDay === Common.today()) return;
    this.app.shell.rerenderPreservingView();
  }
  install() {
    setInterval(this.refreshMilestoneDate, 60000);
    document.addEventListener('visibilitychange', this.refreshMilestoneDate);
  }
}
