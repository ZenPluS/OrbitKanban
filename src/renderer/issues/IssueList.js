// Issue list view and issue editor.
import { Component } from '../core/Component.js';
import { IssueMatcher } from '../shared.js';

export class IssueList extends Component {
  filteredIssues(query = this.state.issueSearch, duplicates = this.app.taskFilter.duplicatesOf(), counts = this.app.taskDialog.linkedCounts()) {
    return this.state.data.issues.filter(issue => (!this.state.issueDuplicatesOnly || duplicates.issues.has(issue.id)) &&
      (!query || this.app.cells.searchableValues(issue, 'issues', counts).some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) &&
      this.app.columnFilterPanel.passesColumnFilters(issue, 'issues', counts));
  }
  renderIssues() {
    const self = this;
    const duplicates = this.app.taskFilter.duplicatesOf(), duplicateCount = duplicates.issues.size, identicalIds = new Set(duplicates.identical), columns = this.app.columns.shownIssueColumns(), counts = this.app.taskDialog.linkedCounts();
    if (this.state.issueDuplicatesOnly && !duplicateCount) this.state.issueDuplicatesOnly = false;
    this.$('#content').innerHTML = this.app.columns.heading(this.app.sections.title('issues'), "Connect work to its origin. Multiple incidents can share the same problem.", this.app.csvImport.csvButton('issues') + this.app.excel.excelButton() + this.ui`<button class="button primary" id="new-issue">${this.ico('plus')}New association</button>`) +
      this.ui`<div class="info-banner">${this.ico('link')}Incidents and problems are automatically linked to tasks with the same portal code, regardless of letter case.</div><section class="panel"><div class="table-toolbar"><strong id="issue-count">${this.state.data.issues.length} associations</strong><div class="filters"><input id="issue-search" class="issue-search" value="${this.esc(this.state.issueSearch)}" placeholder="Search code, incident or problem…" aria-label="Search associations"><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Show only associations whose incident appears in more than one row"><input id="issue-duplicates-only" type="checkbox" ${this.state.issueDuplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicates <span class="tiny-count">${duplicateCount}</span></label><button class="button subtle" id="issue-columns-button">${this.ico('columns')}Columns</button>${identicalIds.size ? this.ui`<button class="button subtle" id="remove-identical" title="Delete associations with the same portal code, incident and problem as another one, keeping the first">Remove identical <span class="tiny-count">${identicalIds.size}</span></button>` : ''}</div></div>${this.app.columnFilterPanel.columnFilterBar('issues')}<div class="table-scroll"><table><thead><tr>${columns.map(id => `<th data-column="${this.esc(id)}"><div class="column-heading"><span>${this.esc(this.app.columns.columnDef(id, 'issues').field ? this.app.columns.columnDef(id, 'issues').name : this.t(this.app.columns.columnDef(id, 'issues').name))}</span>${this.app.columnFilterPanel.filterHeader(id, 'issues')}</div></th>`).join('')}<th>Actions</th></tr></thead><tbody id="issue-rows"></tbody></table></div></section>`;
    function rows(query = self.$('#issue-search').value) {
      self.state.issueSearch = query;
      const issues = self.filteredIssues(query, duplicates, counts);
      self.$('#issue-count').textContent = `${issues.length} / ${self.state.data.issues.length} ${self.t("associations")}`;
      self.$('#issue-rows').innerHTML = issues.map(i => {
        const count = counts.get(i.code.trim().toUpperCase()) || 0, group = duplicates.issues.get(i.id);
        const identical = identicalIds.has(i.id) ? `<span class="dup-note" title="${self.esc(self.t("Same portal code, incident and problem as another association."))}">${self.esc(self.t("identical"))}</span>` : '';
        const incident = group ? `<button type="button" class="dup-ref" data-dup-issue="${self.esc(group.incident)}" title="${self.esc(self.app.taskFilter.issueDuplicateLine(i.id, group) + '\n' + self.t("Click to see only the associations involved."))}">${self.ico('copy')}${self.esc(i.incident)}</button>${identical}` : self.esc(i.incident) || '—';
        const cells = { code: `<td><button class="code-link" data-issue="${i.id}">${self.esc(i.code)}</button></td>`, incident: `<td>${incident}</td>`, problem: `<td>${self.app.presenter.pill(i.problem || '—', '#9d8de8')}</td>`, linked: `<td><span class="${count ? 'linked' : 'muted'}">${count ? self.ui`${self.ico('link')}${count} linked tasks` : self.t("Waiting for a task")}</span></td>` };
        return self.ui`<tr data-issue-row="${self.esc(i.id)}" class="${group ? 'duplicate-row' : ''}" title="Double-click the row to edit.">${columns.map(id => cells[id] || self.app.cells.customCell(i, self.app.columns.columnDef(id, 'issues').field, 'issues')).join('')}<td><button class="button small" data-issue="${i.id}">Edit</button></td></tr>`;
      }).join('') || self.ui`<tr><td colspan="${columns.length + 1}" class="empty">No associations. Add a portal code with an incident and/or problem.</td></tr>`;
      self.app.cells.wireChoicePickers();
      document.querySelectorAll('[data-issue]').forEach(b => b.onclick = () => self.issueDialog(self.state.data.issues.find(i => i.id === b.dataset.issue)));
      document.querySelectorAll('#issue-rows [data-dup-issue]').forEach(b => b.onclick = () => {
        self.$('#issue-search').value = b.dataset.dupIssue;
        self.state.issueDuplicatesOnly = self.$('#issue-duplicates-only').checked = true;
        rows();
      });
    }
    rows(); this.$('#issue-search').oninput = e => rows(e.target.value);
    this.app.columnFilterPanel.wireColumnFilters('issues'); this.app.csvImport.wireCsvImport('issues');
    this.$('#issue-columns-button').onclick = () => this.app.columnEditor.columnsDialog('issues');
    this.$('#issue-duplicates-only').onchange = event => { this.state.issueDuplicatesOnly = event.target.checked; rows(); };
    this.$('#new-issue').onclick = () => this.issueDialog();
    if (identicalIds.size) this.$('#remove-identical').onclick = () => this.app.modal.confirmDialog("Remove identical associations?", "Associations with the same portal code, incident and problem as another one are deleted, keeping the first of each group. Task incidents and problems do not change.", async () => {
      let removed = 0;
      await this.app.history.commit(next => {
        const ids = new Set(IssueMatcher.findDuplicates(next.tasks, next.issues).identical);
        removed = ids.size;
        next.issues = next.issues.filter(issue => !ids.has(issue.id));
      });
      this.app.shell.rerenderPreservingView(); this.app.notifier.notify(this.app.transfer.fillText("Identical associations removed: {0}.", removed));
    });
  }
  issueDialog(existing) {
    const issue = existing || { id: this.uid(), code: '', incident: '', problem: '' };
    this.app.modal.openModal(this.ui`<form id="issue-form"><div class="modal-heading"><h2>${this.t(existing ? "Edit association" : "New association")}</h2><button class="icon-button" type="button" data-close aria-label="Close">${this.ico('close')}</button></div><div class="form-grid">
    <label class="field full">Portal code<input name="code" value="${this.esc(issue.code)}" list="task-codes"><datalist id="task-codes">${[...new Set(this.state.data.tasks.map(t => t.code).filter(Boolean))].map(code => `<option value="${this.esc(code)}">`).join('')}</datalist></label>
    <label class="field">Incident<input name="incident" value="${this.esc(issue.incident)}" placeholder="INC-00001"></label><label class="field">Problem<input name="problem" value="${this.esc(issue.problem)}" placeholder="PRB-00001"></label>
    <p class="duplicate-warning full" id="issue-duplicate" hidden></p>
    ${this.app.fieldEditors.customEditors('issues', issue)}
    </div><div class="modal-actions">${existing ? this.ui`<button type="button" class="button danger" id="delete-issue">Delete</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button class="button primary" type="submit">Save association</button></div></form>`);
    const form = this.$('#issue-form');
    this.app.csvImport.pruneColumnEditors(form, 'issues');
    this.app.taskForm.tagFormFields(form, 'issues');
    this.app.taskForm.markRequiredFields(form, 'issues');
    // Warns while typing when the incident is already in another association; saving stays possible.
    const updateDuplicate = () => {
      const draft = { id: issue.id, code: form.elements.code?.value || '', incident: form.elements.incident?.value || '', problem: form.elements.problem?.value || '' };
      const issues = [...this.state.data.issues.filter(i => i.id !== issue.id), draft], result = IssueMatcher.findDuplicates(this.state.data.tasks, issues), group = result.issues.get(issue.id);
      this.$('#issue-duplicate').hidden = !group;
      this.$('#issue-duplicate').innerHTML = group ? `<strong>${this.ico('copy')}${this.esc(this.t(result.identical.includes(issue.id) ? "An identical association already exists" : "Incident already present"))}</strong><span>${this.esc(this.app.taskFilter.issueDuplicateLine(issue.id, group, issues))}</span><span>${this.esc(this.t("You can still save: the association will be flagged as a duplicate."))}</span>` : '';
    };
    for (const name of ['code', 'incident', 'problem']) form.elements[name]?.addEventListener('input', updateDuplicate);
    updateDuplicate(); this.app.fieldEditors.wireEditors(); this.app.cells.wirePlatformPreviews(form, 'issues');
    this.$('#issue-form').onsubmit = this.app.notifier.action(async e => {
      e.preventDefault();
      this.app.taskForm.checkRequiredFields(form, 'issues');
      const fields = new FormData(e.target);
      const item = { ...issue, id: issue.id, code: (fields.get('code') || '').trim(), incident: (fields.get('incident') || '').trim(), problem: (fields.get('problem') || '').trim(), customFields: this.app.fieldEditors.readCustomEditors(form, 'issues') };
      await this.app.history.commit(next => {
        const index = next.issues.findIndex(i => i.id === item.id);
        if (index < 0) next.issues.push(item); else next.issues[index] = item;
      });
      this.$('#modal').close(); this.app.shell.rerenderPreservingView(); this.app.notifier.notify("Association saved. Tasks updated.");
    });
    if (existing) this.$('#delete-issue').onclick = () => this.app.modal.confirmDialog("Delete this association?", "The associated incidents and problems will no longer appear on tasks unless other associations exist.", async () => {
      await this.app.history.commit(next => { next.issues = next.issues.filter(i => i.id !== issue.id); }); this.app.shell.rerenderPreservingView();
    });
  }
}
