// Undo/redo history per organization and saving of workspace changes.
import { Component } from '../core/Component.js';
import { ArchiveValidator, ColumnCleanup } from '../shared.js';

export class ChangeHistory extends Component {
  #historyFor(collection, organizationId = this.state.activeOrganizationId) {
    if (!collection.has(organizationId)) collection.set(organizationId, []);
    return collection.get(organizationId);
  }
  clearHistory(organizationId) {
    if (organizationId) { this.state.undoHistory.delete(organizationId); this.state.redoHistory.delete(organizationId); }
    else { this.state.undoHistory.clear(); this.state.redoHistory.clear(); }
    this.updateHistoryButtons();
  }
  updateHistoryButtons() {
    const undo = this.$('#undo-button'), redo = this.$('#redo-button');
    if (!undo || !redo) return;
    const pendingSettings = this.app.shell.settingsDraftPending();
    const canUndo = Boolean(this.state.undoHistory.get(this.state.activeOrganizationId)?.length) && !this.state.saving && !this.state.organizationBusy && !pendingSettings;
    const canRedo = Boolean(this.state.redoHistory.get(this.state.activeOrganizationId)?.length) && !this.state.saving && !this.state.organizationBusy && !pendingSettings;
    undo.disabled = !canUndo;
    redo.disabled = !canRedo;
    undo.title = this.t("Undo (Ctrl+Z)");
    redo.title = this.t("Redo (Ctrl+Y)");
    undo.setAttribute('aria-label', undo.title);
    redo.setAttribute('aria-label', redo.title);
  }
  #recordHistory(organizationId, before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const undo = this.#historyFor(this.state.undoHistory, organizationId);
    if (undo.length && JSON.stringify(undo.at(-1).after) !== JSON.stringify(before)) undo.length = 0;
    undo.push({ before: structuredClone(before), after: structuredClone(after) });
    if (undo.length > this.state.HISTORY_LIMIT) undo.splice(0, undo.length - this.state.HISTORY_LIMIT);
    this.#historyFor(this.state.redoHistory, organizationId).length = 0;
    this.updateHistoryButtons();
  }
  async changeHistory(direction) {
    if (this.state.saving || this.state.organizationBusy || this.$('#modal').open || this.app.shell.settingsDraftPending()) return;
    const undo = this.#historyFor(this.state.undoHistory), redo = this.#historyFor(this.state.redoHistory);
    const source = direction === 'undo' ? undo : redo, targetStack = direction === 'undo' ? redo : undo;
    const entry = source.at(-1);
    if (!entry) return;
    const expected = direction === 'undo' ? entry.after : entry.before;
    if (JSON.stringify(this.state.data) !== JSON.stringify(expected)) {
      this.clearHistory(this.state.activeOrganizationId);
      this.app.notifier.notify("History no longer matches the current data; undo and redo have been cleared.", true);
      return;
    }
    const organizationId = this.state.activeOrganizationId;
    this.state.saving = true;
    this.updateHistoryButtons();
    this.$('#save-status').textContent = this.t("Saving…");
    try {
      const snapshot = await this.workspaceApi.save(structuredClone(direction === 'undo' ? entry.before : entry.after), organizationId, undefined, this.state.revision);
      this.app.shell.adoptSnapshot(snapshot);
      source.pop();
      targetStack.push(entry);
      if (targetStack.length > this.state.HISTORY_LIMIT) targetStack.splice(0, targetStack.length - this.state.HISTORY_LIMIT);
      this.$('#save-status').innerHTML = this.ui`<i class="connection-dot"></i> Everything saved locally`;
      this.app.shell.rerenderPreservingView();
      this.app.notifier.notify(direction === 'undo' ? "Change undone." : "Change redone.");
    } catch (error) {
      if (error.code === 'conflict') {
        this.app.shell.adoptSnapshot(await this.workspaceApi.load(organizationId));
        this.clearHistory(organizationId);
        this.app.shell.rerenderPreservingView();
        this.app.notifier.notify("The data changed in another window; undo and redo have been cleared.", true);
        return;
      }
      this.$('#save-status').textContent = this.t("Save failed");
      throw error;
    } finally {
      this.state.saving = false;
      this.updateHistoryButtons();
      this.app.shell.flushPendingChange();
    }
  }
  async commit(change, organizationName) {
    if (this.state.saving || this.state.organizationBusy) throw new Error(this.t("A save is in progress. Please try again in a moment."));
    const build = () => {
      if (typeof change !== 'function') return change;
      const next = structuredClone(this.state.data);
      change(next);
      return ColumnCleanup.pruneReferences(next);
    };
    const organizationId = this.state.activeOrganizationId;
    let before = structuredClone(this.state.data);
    let next = ArchiveValidator.validateData(build());
    this.state.saving = true;
    this.$('#save-status').textContent = this.t("Saving…");
    try {
      let saved;
      try { saved = await this.workspaceApi.save(next, organizationId, organizationName, this.state.revision); }
      catch (error) {
        if (error.code !== 'conflict' || typeof change !== 'function') throw error;
        const fresh = await this.workspaceApi.load(organizationId);
        if (fresh.activeOrganizationId !== organizationId) throw Object.assign(new Error(this.t("This organization no longer exists.")), { code: 'missing-organization' });
        this.app.shell.adoptSnapshot(fresh);
        before = structuredClone(this.state.data);
        next = ArchiveValidator.validateData(build());
        saved = await this.workspaceApi.save(next, organizationId, organizationName, this.state.revision);
      }
      this.app.shell.adoptSnapshot(saved);
      this.#recordHistory(organizationId, before, saved.data);
      this.$('#save-status').innerHTML = this.ui`<i class="connection-dot"></i> Everything saved locally`;
    } catch (error) {
      this.$('#save-status').textContent = this.t("Save failed");
      if (error.code === 'missing-organization') this.state.pendingChange = { forced: true };
      throw error;
    } finally { this.state.saving = false; this.updateHistoryButtons(); this.app.shell.flushPendingChange(); }
  }
}
