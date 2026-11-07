// Search across tasks and issues.
import { Component } from '../core/Component.js';
import { IssueMatcher } from '../shared.js';

export class GlobalSearch extends Component {
  constructor(app) {
    super(app);
    this.openGlobalSearch = this.openGlobalSearch.bind(this);
  }
  globalSearchResults(query) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const results = [], issues = IssueMatcher.indexIssues(this.state.data.issues);
    for (const task of this.state.data.tasks) {
      const links = this.matchIssues(task, issues), status = this.state.data.settings.statuses.find(item => item.id === task.statusId)?.name || '';
      const fields = this.app.cells.searchableValues(task, 'tasks', issues);
      if (!fields.some(value => String(value || '').toLocaleLowerCase().includes(needle))) continue;
      const detail = [this.hasColumn('releaseDate') && (task.releaseDate ? this.app.presenter.formatDate(task.releaseDate) : this.t("Unscheduled")), this.hasColumn('status') && status, links.incidents.length && `INC ${links.incidents.join(', ')}`, links.problems.length && `PRB ${links.problems.join(', ')}`, task.hidden && this.t("Hidden")].filter(Boolean).join(' · ');
      results.push({ kind: 'task', id: task.id, title: this.app.taskFilter.recordLabel(task), detail, subtitle: this.hasColumn('description') ? this.app.richText.plain(task.description) : '' });
      if (results.length === 40) return results;
    }
    for (const issue of this.state.data.issues) {
      if (!this.app.cells.searchableValues(issue, 'issues', this.app.taskDialog.linkedCounts()).some(value => value.toLocaleLowerCase().includes(needle))) continue;
      results.push({ kind: 'issue', id: issue.id, title: this.app.taskFilter.recordLabel(issue, 'issues'), detail: [issue.incident && `INC ${issue.incident}`, issue.problem && `PRB ${issue.problem}`].filter(Boolean).join(' · '), subtitle: '' });
      if (results.length === 40) return results;
    }
    return results;
  }
  openGlobalSearch(initial = '') {
    this.app.modal.openModal(this.ui`<div class="modal-heading"><div><div class="eyebrow">${this.esc(this.t("GLOBAL SEARCH"))}</div><h2>${this.esc(this.t("Search OrbitKanban"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${this.ico('close')}</button></div><label class="global-search-field"><span aria-hidden="true">${this.ico('search')}</span><input id="global-search-input" type="search" autocomplete="off" placeholder="${this.esc(this.t("Code, incident, problem, release date…"))}" aria-label="${this.esc(this.t("Search tasks and issues"))}"><kbd>Esc</kbd></label><div class="global-search-results" id="global-search-results" role="listbox" aria-label="${this.esc(this.t("Search results"))}"></div>`);
    const input = this.$('#global-search-input'), list = this.$('#global-search-results');
    const draw = () => {
      const results = this.globalSearchResults(input.value);
      list.innerHTML = results.length ? results.map((item, index) => `<button type="button" class="global-search-result" role="option" aria-selected="false" data-global-kind="${item.kind}" data-global-id="${this.esc(item.id)}" ${index === 0 ? 'data-first-result' : ''}><strong>${this.esc(item.title)}</strong><span class="global-search-kind">${this.esc(this.t(item.kind === 'task' ? "Tasks" : 'Issue'))}</span><small>${this.esc([item.detail, item.subtitle].filter(Boolean).join(' · '))}</small></button>`).join('') : input.value.trim() ? `<p class="backup-empty">${this.esc(this.t("No results."))}</p>` : `<p class="backup-empty">${this.esc(this.t("Search codes, incidents, problems or release dates."))}</p>`;
    };
    input.value = initial;
    input.oninput = draw;
    input.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); list.querySelector('[data-first-result]')?.click(); }
    };
    list.onclick = event => {
      const button = event.target.closest('[data-global-kind]');
      if (!button) return;
      const item = button.dataset.globalKind === 'task' ? this.state.data.tasks.find(task => task.id === button.dataset.globalId) : this.state.data.issues.find(issue => issue.id === button.dataset.globalId);
      if (!item) { this.app.notifier.notify("This item no longer exists.", true); return; }
      this.$('#modal').close();
      this.state.view = button.dataset.globalKind === 'task' ? 0 : 1;
      this.app.shell.render();
      if (this.state.view === 0) this.app.taskDialog.taskDialog(item); else this.app.issues.issueDialog(item);
    };
    draw();
    input.focus();
  }
}
