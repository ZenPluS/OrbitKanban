// Top bar and sidebar buttons and global keyboard shortcuts.
import { Component } from '../core/Component.js';

export class Toolbar extends Component {
  constructor(app) {
    super(app);
    this.openBrowserAccess = this.openBrowserAccess.bind(this);
  }
  async openBrowserAccess() {
    await this.workspaceApi.browserAccess('open', this.state.activeOrganizationId);
    if (!this.browserMode()) this.app.notifier.notify("Organization opened in the default browser.");
  }
  install() {
    this.$('#settings-button').onclick = () => { this.state.view = 4; this.app.shell.render(); };
    this.$('#guide-button').onclick = this.app.guide.openGuide;
    this.$('#sidebar-toggle').onclick = this.app.sidebar.toggleSidebar;
    this.$('#folder-button').onclick = this.app.notifier.action(() => this.workspaceApi.openDataFolder());
    this.$('#open-browser').onclick = this.app.notifier.action(this.openBrowserAccess);
    this.$('#global-search').onclick = this.app.notifier.action(() => this.app.settings.withSavedSettings(this.app.globalSearch.openGlobalSearch));
    this.$('#undo-button').onclick = this.app.notifier.action(() => this.app.history.changeHistory('undo'));
    this.$('#redo-button').onclick = this.app.notifier.action(() => this.app.history.changeHistory('redo'));
    this.$('#modal').addEventListener('close', () => {
      if (!this.state.renderAfterModal || !this.state.data) return;
      this.state.renderAfterModal = false;
      if (this.app.shell.settingsDraftPending()) { this.app.shell.renderChrome(); this.app.settings.refreshSettingsState(); } else this.app.shell.rerenderPreservingView();
    });
    document.addEventListener('keydown', e => {
      if (this.$('#form-designer')?.open) return;
      const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (e.key === 'F1' && !command && !e.altKey && !this.$('#modal').open && this.state.data) { e.preventDefault(); this.app.guide.openGuide(); return; }
      if (command && key === 'k' && !this.$('#modal').open && this.state.data) { e.preventDefault(); this.app.notifier.action(() => this.app.settings.withSavedSettings(this.app.globalSearch.openGlobalSearch))(); return; }
      // Rich text keeps Ctrl+B for bold.
      if (command && key === 'b' && !e.shiftKey && !e.altKey && !this.$('#modal').open && !e.target.isContentEditable) { e.preventDefault(); if (!e.repeat) this.app.sidebar.toggleSidebar(); return; }
      const editing = e.target.closest?.('input, select, textarea, [contenteditable="true"]');
      if (command && !editing && !this.$('#modal').open && (key === 'z' || key === 'y')) {
        e.preventDefault();
        this.app.notifier.action(() => this.app.history.changeHistory(key === 'y' || (key === 'z' && e.shiftKey) ? 'redo' : 'undo'))();
        return;
      }
      if (command && key === 'n' && !this.$('#modal').open && this.state.data && this.state.view === 0) { e.preventDefault(); this.app.taskDialog.taskDialog(); }
      if (e.key === 'Escape' && this.state.highlighter && !this.$('#modal').open && !document.getElementById('mark-menu')) { this.state.highlighter = ''; this.app.rowMarks.drawHighlighter(); }
      else if (e.key === 'Escape' && this.state.view === 0 && this.state.selectedTasks.size && !this.$('#modal').open && !document.getElementById('mark-menu') && !e.target.closest?.('input:not([type="checkbox"]), select, textarea, [contenteditable]')) this.app.taskRows.clearSelection();
    });
  }
}
