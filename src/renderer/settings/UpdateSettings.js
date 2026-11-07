// Application updates panel and update notice.
import { Component } from '../core/Component.js';

export class UpdateSettings extends Component {
  constructor(app) {
    super(app);
    this.adoptUpdateState = this.adoptUpdateState.bind(this);
  }
  updatesPanel() {
    return this.ui`<section class="panel settings-section full" id="updates-panel"><h2>App & updates</h2><p class="section-description">Updates and shortcuts apply to this portable copy, not to one organization. GitHub receives no workspace data. Downloading and installing always require your action.</p><p>Installed version: <strong>${this.esc(this.state.appVersion)}</strong></p><p id="update-status" role="status" aria-live="polite"></p><progress id="update-progress" max="100" hidden aria-label="Update download progress"></progress><label class="field checkbox-field"><input type="checkbox" id="update-auto"><span>Check for updates at startup</span></label><div class="storage-actions"><button type="button" class="button" id="update-check">Check for updates</button><button type="button" class="button" id="update-download" hidden>Download update</button><button type="button" class="button primary" id="update-install" hidden>Install and restart</button><button type="button" class="button" id="update-release">View releases</button></div><hr><h3>Windows shortcut</h3><p class="section-description">Create a shortcut to the portable launcher, not the temporary app. Remove old broken pins, then pin the new shortcut or the running app once. Moving the portable folder requires recreating its shortcut.</p><button type="button" class="button" id="create-shortcut">Create desktop shortcut</button></section>`;
  }
  #drawUpdateState() {
    if (!this.$('#update-status')) return;
    const state = this.state.updateState, supported = !this.browserMode() && state.supported, busy = ['checking', 'downloading', 'installing'].includes(state.phase);
    const messages = {
      idle: "Ready to check for updates.", checking: "Checking GitHub releases…", available: "A new version is available.",
      latest: "You are using the latest version.", downloading: "Downloading update…", ready: "Update verified and ready to install.",
      installing: "The app is restarting to install an update.", error: "Update failed."
    };
    this.$('#update-status').textContent = !supported ? this.t(this.browserMode() ? "Manage updates from the desktop app. Browser tabs reconnect after it restarts." : "Updates can only be installed from the Windows portable app.") :
      `${this.t(messages[state.phase] || messages.idle)}${state.version ? ` v${state.version}` : ''}${state.phase === 'downloading' ? ` (${state.percent}%)` : ''}${state.error ? ` ${this.t(state.error)}` : ''}`;
    this.$('#update-progress').hidden = state.phase !== 'downloading';
    this.$('#update-progress').value = state.percent;
    this.$('#update-check').disabled = !supported || busy;
    this.$('#update-auto').disabled = !supported || busy;
    this.$('#update-auto').checked = state.autoCheck;
    this.$('#update-download').hidden = !supported || state.phase !== 'available';
    this.$('#update-install').hidden = !supported || state.phase !== 'ready';
    this.$('#update-download').disabled = this.$('#update-download').hidden;
    this.$('#update-install').disabled = this.$('#update-install').hidden;
    this.$('#create-shortcut').disabled = this.browserMode() || !window.workspace?.createShortcut || busy;
  }
  drawUpdateNotice() {
    const notice = this.$('#update-notice');
    let badge = this.$('#update-badge');
    const openUpdates = this.app.notifier.action(() => this.app.settings.withSavedSettings(() => { this.state.view = 4; this.state.settingsTab = 'updates'; this.app.shell.render(); this.$('#update-check').focus(); }));
    if (!badge) {
      badge = document.createElement('button');
      badge.id = 'update-badge';
      badge.type = 'button';
      badge.className = 'button subtle topbar-tool';
      badge.innerHTML = `${this.ico('reset')}<span class="update-badge-dot" aria-hidden="true"></span>`;
      this.$('.topbar-right').prepend(badge);
    }
    const available = !this.browserMode() && this.state.updateState.supported && Boolean(this.state.updateState.version) && !['idle', 'latest', 'installing'].includes(this.state.updateState.phase);
    const title = this.app.transfer.fillText("Update available: v{0}", this.state.updateState.version);
    badge.hidden = !available;
    badge.title = title;
    badge.setAttribute('aria-label', title);
    badge.onclick = openUpdates;
    notice.hidden = !available || this.state.dismissedUpdateVersions.has(this.state.updateState.version);
    notice.setAttribute('aria-label', this.t("App update"));
    const message = this.t(this.state.updateState.phase === 'ready' ? "Update verified and ready to install." : this.state.updateState.phase === 'downloading' ? "Downloading update…" : this.state.updateState.phase === 'error' ? "Update failed. Open App & updates for details." : "Open App & updates to download it. Installation always requires your confirmation.");
    if (this.$('#update-notice-title').textContent !== title) this.$('#update-notice-title').textContent = title;
    if (this.$('#update-notice-message').textContent !== message) this.$('#update-notice-message').textContent = message;
    this.$('.update-notice-icon').innerHTML = this.ico('reset');
    this.$('#update-notice-open').textContent = this.t("View update");
    this.$('#update-notice-open').onclick = openUpdates;
    this.$('#update-notice-dismiss').innerHTML = this.ico('close');
    this.$('#update-notice-dismiss').setAttribute('aria-label', this.t("Dismiss update notification"));
    this.$('#update-notice-dismiss').onclick = () => {
      this.state.dismissedUpdateVersions.add(this.state.updateState.version);
      notice.hidden = true;
      badge.focus({ preventScroll: true });
    };
  }
  adoptUpdateState(state) {
    this.state.updateState = state;
    this.#drawUpdateState();
    this.drawUpdateNotice();
  }
  wireUpdates() {
    this.#drawUpdateState();
    this.$('#update-check').onclick = this.app.notifier.action(async () => this.adoptUpdateState(await this.workspaceApi.updates('check')));
    this.$('#update-download').onclick = this.app.notifier.action(async () => this.adoptUpdateState(await this.workspaceApi.updates('download')));
    this.$('#update-install').onclick = this.app.notifier.action(() => this.app.settings.withSavedSettings(async () => this.adoptUpdateState(await this.workspaceApi.updates('install'))));
    this.$('#update-auto').onchange = this.app.notifier.action(async () => {
      try { this.adoptUpdateState(await this.workspaceApi.updates('auto-check', this.$('#update-auto').checked)); }
      finally { this.#drawUpdateState(); }
    });
    this.$('#update-release').onclick = this.app.notifier.action(() => this.workspaceApi.openLink(this.state.updateState.releaseUrl));
    this.$('#create-shortcut').onclick = this.app.notifier.action(async () => { if (await this.workspaceApi.createShortcut()) this.app.notifier.notify("Shortcut created. You can now pin it to the taskbar."); });
  }
}
