// Daily backup list and restore.
import { Component } from '../core/Component.js';

export class BackupSettings extends Component {
  constructor(app) {
    super(app);
    this.loadBackupList = this.loadBackupList.bind(this);
  }
  async loadBackupList() {
    const requestId = ++this.state.backupRequest;
    const result = await this.workspaceApi.backups('list');
    if (requestId !== this.state.backupRequest || !this.$('#backup-list')) return;
    this.$('#backup-status').textContent = this.app.transfer.fillText("Backups available: {0} of {1}.", result.backups.length, result.retention);
    this.$('#backup-list').innerHTML = result.backups.length ? result.backups.map(backup => {
      const date = new Date(`${backup.date}T12:00:00`);
      const label = Number.isNaN(date.getTime()) ? backup.date : date.toLocaleDateString(this.locale(), { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
      const size = backup.size >= 1024 * 1024 ? `${(backup.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(backup.size / 1024))} KB`;
      return `<article class="backup-item"><div class="backup-info"><strong>${this.esc(label)}</strong><small>${this.esc(size)} · ${this.esc(backup.fileName)}</small></div><button type="button" class="button small danger" data-restore-backup="${this.esc(backup.fileName)}">${this.esc(this.t("Restore…"))}</button></article>`;
    }).join('') : `<p class="backup-empty">${this.esc(this.t("No automatic backups are available yet."))}</p>`;
  }
  restoreDailyBackup(fileName) {
    const date = fileName.slice(0, 10);
    this.app.modal.confirmDialog("Restore this backup?", this.app.transfer.fillText("The backup from {0} will replace all organizations, tasks and settings. workspace.json.bak is created first with the current state.", date), async () => {
      const snapshot = await this.workspaceApi.backups('restore', fileName);
      this.state.columnFilters = { tasks: {}, issues: {} }; this.state.issueSearch = '';
      this.app.history.clearHistory();
      this.app.shell.adoptSnapshot(snapshot);
      this.state.search = ''; this.state.statusFilter = ''; this.state.highlightFilter = ''; this.state.highlighter = ''; this.state.selectedTasks.clear(); this.state.showHidden = false; this.state.duplicatesOnly = false; this.state.issueDuplicatesOnly = false; this.state.activeSavedViewId = ''; this.state.sort = [{ key: 'releaseDate', direction: 'asc' }];
      this.app.shell.render();
      this.app.notifier.notify("Backup restored.");
    });
  }
}
