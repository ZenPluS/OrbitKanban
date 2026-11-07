'use strict';
// Electron main process: portable data folders, main window, loading screen, IPC API, browser access and updates.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const { writeFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Common } = require('../shared/domain');
const { PlatformLinks } = require('../shared/columns');
const WorkspaceStore = require('./storage/WorkspaceStore');
const LanguageStore = require('./storage/LanguageStore');
const WebServer = require('../web/WebServer');
const SplashScreen = require('./splash/SplashScreen');
const SplashTheme = require('./splash/SplashTheme');
const WindowChrome = require('./platform/WindowChrome');
const WindowIcon = require('./platform/WindowIcon');
const PortableLauncher = require('./platform/PortableLauncher');
const Updater = require('./update/Updater');
const UpdateLauncher = require('./update/UpdateLauncher');

class DesktopApplication {
  static #SPREADSHEET_LIMIT = 256 * 1024 * 1024;

  #appRoot;
  // On Windows the app draws its own title bar: the top bar drags the window and the caption buttons follow the theme.
  #customTitleBar = process.platform === 'win32';
  #windowChrome = null;
  #smoke = process.argv.includes('--smoke-test');
  #root; #dataFolder; #runtimeFolder; #launcher; #portableFile; #launcherReadyFile;
  #launcherReleased = false;
  #win; #splash; #revealTimer; #revealed = false; #resolveAppReady;
  #appReady = new Promise(resolve => { this.#resolveAppReady = resolve; });
  #store; #languages; #updater; #webServer;
  #splashTheme; #splashThemeTimer = null; #splashThemeSaving = Promise.resolve();
  #windowIcon; #windowIconApplied = null;
  #updateShutdown = false;
  #quitting = false;

  // Applies the process-wide settings (name, identity, data paths) that Electron needs before the app is ready.
  constructor({ appRoot }) {
    this.#appRoot = appRoot;
    app.setName(Common.APP_NAME);
    if (process.platform === 'win32') app.setAppUserModelId(PortableLauncher.APP_ID);
    if (this.#smoke) {
      // Match the build's rasterizer and scale for the SVG/icon pixel comparison.
      app.commandLine.appendSwitch('force-device-scale-factor', '1');
      app.disableHardwareAcceleration();
    }
    this.#root = this.#smoke ? (process.env.ORBITA_SMOKE_DIR || path.join(os.tmpdir(), `orbita-smoke-${process.pid}`)) :
      (process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(app.getPath('exe')) : appRoot));
    this.#dataFolder = path.join(this.#root, 'data');
    this.#runtimeFolder = path.join(this.#dataFolder, 'runtime');
    this.#launcher = process.platform === 'win32' ? PortableLauncher.launcherPath({ packaged: app.isPackaged, executable: app.getPath('exe'), portableFile: process.env.PORTABLE_EXECUTABLE_FILE }) : null;
    this.#portableFile = this.#launcher && process.env.PORTABLE_EXECUTABLE_FILE ? this.#launcher : null;
    // The portable launcher keeps showing its loading screen until the main window is visible, so the app does not open a second one.
    this.#launcherReadyFile = process.platform === 'win32' ? PortableLauncher.launcherSignal(process.env) : null;
    delete process.env[PortableLauncher.LAUNCHER_SIGNAL_VARIABLE];
    app.setPath('userData', this.#runtimeFolder);
    app.setPath('sessionData', this.#runtimeFolder);
    app.setAppLogsPath(path.join(this.#dataFolder, 'logs'));
    this.#store = new WorkspaceStore({ dataFolder: this.#dataFolder, extras: () => ({ appVersion: app.getVersion(), browserUrl: this.#webServer.url }) });
    this.#languages = new LanguageStore({ dataFolder: this.#dataFolder });
    this.#splashTheme = new SplashTheme(this.#runtimeFolder);
    this.#windowIcon = new WindowIcon(this.#runtimeFolder);
    this.#updater = new Updater({
      currentVersion: app.getVersion(), dataFolder: this.#dataFolder, portableFile: this.#smoke ? null : this.#portableFile,
      install: update => this.#installUpdate(update)
    });
    this.#updater.on('change', info => { if (this.#win && !this.#win.isDestroyed()) this.#win.webContents.send('update-changed', info); });
    this.#webServer = new WebServer({
      store: this.#store, appRoot, tokenFolder: this.#runtimeFolder, port: this.#smoke ? 0 : WebServer.DEFAULT_PORT,
      openDataFolder: this.#smoke ? async () => {} : () => this.#openDataFolder(),
      language: () => this.#store.language(),
      languages: operation => this.#languageOperation(operation)
    });
  }

  // State read by the desktop smoke test.
  get appRoot() { return this.#appRoot; }
  get root() { return this.#root; }
  get window() { return this.#win; }
  get splash() { return this.#splash; }
  get launcher() { return this.#launcher; }
  get portableFile() { return this.#portableFile; }
  get launcherReadyFile() { return this.#launcherReadyFile; }
  get launcherReleased() { return this.#launcherReleased; }
  get customTitleBar() { return this.#customTitleBar; }
  get windowChrome() { return this.#windowChrome; }
  get appReady() { return this.#appReady; }
  get store() { return this.#store; }
  get webServer() { return this.#webServer; }
  get splashTheme() { return this.#splashTheme; }
  get windowIcon() { return this.#windowIcon; }
  get windowIconApplied() { return this.#windowIconApplied; }

  #message(text, organizationId) { return this.#store.message(text, organizationId); }

  // The next start shows the loading screen in the theme and logo of the organization that opens first (the active one).
  // Saves run one after another, so quitting can wait for the last one and two writes never race.
  saveSplashTheme(settings) {
    clearTimeout(this.#splashThemeTimer);
    this.#splashThemeTimer = null;
    this.#splashThemeSaving = this.#splashThemeSaving.then(async () => {
      try { await this.#splashTheme.save(settings ?? (await this.#store.load()).data.settings); }
      catch (error) { console.error('The loading screen theme could not be saved:', error); }
    });
    return this.#splashThemeSaving;
  }
  #scheduleSplashTheme() {
    clearTimeout(this.#splashThemeTimer);
    this.#splashThemeTimer = setTimeout(() => this.saveSplashTheme(), 1500);
  }

  releaseLauncher() {
    if (!this.#launcherReadyFile || this.#launcherReleased) return;
    this.#launcherReleased = true;
    try { writeFileSync(this.#launcherReadyFile, '', { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') console.error('The launcher loading screen could not be closed:', error); }
  }
  // The main window stays hidden behind the loading screen until the renderer has drawn the workspace.
  #revealMainWindow(reason) {
    if (this.#revealed) return;
    this.#revealed = true;
    clearTimeout(this.#revealTimer);
    this.#resolveAppReady(reason);
    if (this.#smoke) {
      this.releaseLauncher();
      return;
    }
    setTimeout(() => {
      if (this.#win && !this.#win.isDestroyed()) this.#win.show();
      this.#splash?.close();
      this.releaseLauncher();
    }, SplashScreen.splashHoldTime(this.#splash?.shownAt, Date.now()));
  }
  async #installUpdate(update) {
    const message = (text, organizationId) => this.#message(text, organizationId);
    const answer = await dialog.showMessageBox(this.#win, {
      type: 'question', buttons: [message("Cancel"), message("Install and restart")], defaultId: 0, cancelId: 0,
      message: message("Install the downloaded update?"),
      detail: message("OrbitKanban and browser access will close. Saved data will be backed up and kept. Save any open editors in browser tabs before continuing.")
    });
    if (answer.response !== 1) return false;
    this.#updateShutdown = true;
    try {
      await this.#store.idle();
      await this.#store.exportTo(path.join(update.directory, 'workspace-before-update.json'));
      await UpdateLauncher.launchInstaller(update);
      app.quit();
      return true;
    } catch (error) { this.#updateShutdown = false; throw error; }
  }
  async #languageOperation(operation = 'info') {
    if (operation === 'reload') return this.#languages.reload();
    if (operation === 'open-folder') {
      const folder = await this.#languages.prepareFolder();
      if (!this.#smoke) {
        const error = await shell.openPath(folder);
        if (error) throw new Error(error);
      }
      return this.#languages.info();
    }
    if (operation !== 'info') throw new Error(this.#message("Unsupported operation."));
    return this.#languages.info();
  }
  async #openDataFolder() {
    const error = await shell.openPath(this.#dataFolder);
    if (error) throw new Error(error);
  }
  #handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      const win = this.#win;
      try {
        if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unsupported request.');
        if (this.#updateShutdown) throw new Error(this.#message("The app is restarting to install an update."));
        return await handler(...args);
      }
      catch (error) {
        if (!['conflict', 'missing-organization'].includes(error.code)) console.error(`Operation ${channel} failed:`, error);
        return { __error: true, message: error.message, code: error.code || '' };
      }
    });
  }
  // Exported files are written to <root>/exports during the smoke test and to a file chosen by the user otherwise.
  async #exportTarget(fileName, filter) {
    // Smoke runs write straight into the exports folder; otherwise the user picks the destination.
    let filePath = path.join(this.#root, 'exports', fileName);
    if (this.#smoke) await fs.mkdir(path.dirname(filePath), { recursive: true });
    else {
      const result = await dialog.showSaveDialog(this.#win, { defaultPath: path.join(this.#root, fileName), filters: [filter()] });
      if (result.canceled || !result.filePath) return null;
      filePath = result.filePath;
    }
    return filePath;
  }
  #registerIpc() {
    const store = this.#store, updater = this.#updater, webServer = this.#webServer, smoke = this.#smoke;
    const message = (text, organizationId) => this.#message(text, organizationId);
    const handle = (channel, handler) => this.#handle(channel, handler);
    handle('load', organizationId => store.load(organizationId));
    handle('updates', async (operation = 'info', value) => {
      if (operation === 'info') return updater.snapshot();
      if (operation === 'check') return updater.check();
      if (operation === 'download') return updater.download();
      if (operation === 'install') return updater.apply();
      if (operation === 'auto-check') return updater.setAutoCheck(value);
      throw new Error(message("Unsupported operation."));
    });
    handle('create-shortcut', async () => {
      if (!this.#launcher) throw new Error(message("Shortcuts are available in the packaged Windows app."));
      const result = smoke ? { filePath: path.join(this.#root, 'OrbitKanban.lnk') } : await dialog.showSaveDialog(this.#win, {
        defaultPath: path.join(app.getPath('desktop'), 'OrbitKanban.lnk'), filters: [{ name: 'Windows shortcut', extensions: ['lnk'] }]
      });
      if (result.canceled || !result.filePath) return false;
      if (!shell.writeShortcutLink(result.filePath, 'create', PortableLauncher.shortcutDetails(this.#launcher))) throw new Error(message("Could not create the shortcut."));
      return true;
    });
    // The window icon follows the theme; the executable and pinned shortcuts keep the icon embedded in the .exe.
    handle('window-icon', async images => {
      if (process.platform !== 'win32') return false;
      await this.#windowIcon.save(images);
      const win = this.#win, icon = nativeImage.createFromPath(this.#windowIcon.file);
      if (icon.isEmpty()) throw new Error('Invalid window icon.');
      if (win.isDestroyed()) return false;
      win.setIcon(icon);
      this.#windowIconApplied = this.#windowIcon.file;
      return true;
    });
    ipcMain.on('app-ready', event => { if (this.#win && event.sender === this.#win.webContents) this.#revealMainWindow('renderer'); });
    ipcMain.on('window-chrome', (event, request) => {
      const win = this.#win;
      if (!this.#customTitleBar || !win || win.isDestroyed() || event.sender !== win.webContents) return;
      const overlay = WindowChrome.titleBarOverlay(request, win.webContents.getZoomFactor());
      if (!overlay || (this.#windowChrome && ['color', 'symbolColor', 'height'].every(key => this.#windowChrome[key] === overlay[key]))) return;
      try {
        win.setTitleBarOverlay(overlay);
        this.#windowChrome = overlay;
      } catch (error) { console.error('Title bar update failed:', error); }
    });
    handle('save', (data, organizationId, organizationName, revision) => store.save(data, organizationId, organizationName, revision));
    handle('organization', (operation, payload, organizationId) => store.organization(operation, payload, organizationId));
    handle('export', async () => {
      const result = await dialog.showSaveDialog(this.#win, { defaultPath: path.join(this.#root, `${Common.APP_NAME}-backup.json`), filters: [{ name: message("JSON archive"), extensions: ['json'] }] });
      if (result.canceled) return false;
      await store.exportTo(result.filePath);
      return true;
    });
    handle('export-organization', async (organizationId, kind) => {
      const { fileName, text } = await store.exportOrganization(organizationId, kind);
      const filePath = await this.#exportTarget(fileName, () => ({ name: message("OrbitKanban export", organizationId), extensions: ['json'] }));
      if (!filePath) return false;
      await fs.writeFile(filePath, text, 'utf8');
      return { fileName: path.basename(filePath) };
    });
    handle('export-spreadsheet', async (fileName, bytes) => {
      const name = path.basename(String(fileName ?? '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
      const valid = /^[^.].*\.xlsx$/i.test(name) && name.length <= 200 && bytes instanceof Uint8Array && bytes.length > 22 && bytes.length <= DesktopApplication.#SPREADSHEET_LIMIT && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
      if (!valid) throw new Error(message("Invalid Excel file."));
      const filePath = await this.#exportTarget(name, () => ({ name: message("Excel workbook"), extensions: ['xlsx'] }));
      if (!filePath) return false;
      await fs.writeFile(filePath, bytes);
      return { fileName: path.basename(filePath) };
    });
    handle('import', async () => {
      const result = await dialog.showOpenDialog(this.#win, { properties: ['openFile'], filters: [{ name: message("JSON archive"), extensions: ['json'] }] });
      if (result.canceled) return null;
      const archive = store.parseArchive(await fs.readFile(result.filePaths[0], 'utf8'));
      const answer = await dialog.showMessageBox(this.#win, { type: 'warning', buttons: [message("Cancel"), message("Replace archive")], defaultId: 0, cancelId: 0, message: message("Replace all organizations, data and settings?"), detail: message("The previous archive will be kept in workspace.json.bak.") });
      if (answer.response !== 1) return null;
      return store.replace(archive);
    });
    handle('backups', (operation = 'list', fileName) => {
      if (operation === 'list') return store.listBackups();
      if (operation === 'restore') return store.restoreBackup(fileName);
      throw new Error(message("Unsupported operation."));
    });
    handle('open-link', async url => {
      if (!PlatformLinks.isWebUrl(url)) throw new Error("Invalid URL.");
      if (!smoke) await shell.openExternal(url);
      return url;
    });
    handle('open-data-folder', () => this.#openDataFolder());
    handle('languages', operation => this.#languageOperation(operation));
    handle('browser-access', async (operation, organizationId) => {
      if (!webServer.port) throw new Error(message("Browser access is not available."));
      if (operation === 'open') { if (!smoke) await shell.openExternal(webServer.authUrl(organizationId)); }
      else if (operation === 'copy') { if (!smoke) clipboard.writeText(webServer.authUrl(organizationId)); }
      else if (operation !== 'info') throw new Error(message("Unsupported operation."));
      return { url: webServer.url };
    });
  }
  async #ready() {
    const smoke = this.#smoke, customTitleBar = this.#customTitleBar;
    const appLogo = nativeImage.createFromPath(path.join(this.#appRoot, 'app-logo.png'));
    if (appLogo.isEmpty()) throw new Error('The application icon is missing or invalid. Run npm run icon during development.');
    // The themed icon saved by the last session, so the windows open in the theme colors; the app logo on the first start.
    const themedIcon = process.platform === 'win32' && this.#windowIcon.read();
    const savedIcon = themedIcon ? nativeImage.createFromPath(themedIcon) : null;
    const icon = savedIcon && !savedIcon.isEmpty() ? savedIcon : appLogo;
    this.#splash = this.#launcherReadyFile ? null : new SplashScreen({ BrowserWindow, screen, appRoot: this.#appRoot, title: Common.APP_NAME, icon, version: app.getVersion(), theme: this.#splashTheme.read(), show: !smoke });
    try { await this.#languages.reload(); }
    catch (error) { console.error('Additional languages could not be loaded:', error); }
    let settings;
    try { settings = (await this.#store.load()).data.settings; }
    catch (error) { console.error('Workspace archive could not be preloaded:', error); }
    if (settings) await this.saveSplashTheme(settings);
    try { await this.#webServer.start(); }
    catch (error) { console.error('Browser access did not start:', error); }
    this.#windowChrome = customTitleBar ? WindowChrome.titleBarOverlay({ ...WindowChrome.themeColors(settings), height: WindowChrome.TITLE_BAR_HEIGHT.initial }) : null;
    const win = this.#win = new BrowserWindow({
      width: 1500, height: 960, minWidth: 1050, minHeight: 700, show: false,
      backgroundColor: SplashScreen.windowBackground(settings), title: Common.APP_NAME, icon,
      ...(customTitleBar ? { titleBarStyle: 'hidden', titleBarOverlay: this.#windowChrome } : { autoHideMenuBar: true }),
      webPreferences: { preload: path.join(this.#appRoot, 'src', 'desktop', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: customTitleBar ? [WindowChrome.TITLE_BAR_ARGUMENT] : [] }
    });
    if (this.#launcher) win.setAppDetails(PortableLauncher.relaunchDetails(this.#launcher));
    // The default menu keeps its shortcuts, but Alt must not slide a native menu bar under the custom title bar.
    if (customTitleBar) win.setMenuBarVisibility(false);
    win.on('closed', () => this.#splash?.close());
    this.#revealTimer = setTimeout(() => this.#revealMainWindow('timeout'), 15000);
    win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => { if (isMainFrame) this.#revealMainWindow('failed'); });
    win.webContents.on('render-process-gone', () => this.#revealMainWindow('crashed'));
    if (smoke) win.webContents.on('console-message', (event) => console.log('Renderer:', event.message));
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!smoke && PlatformLinks.isWebUrl(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', event => event.preventDefault());
    await win.loadFile(path.join(this.#appRoot, 'index.html'));
    if (!smoke) {
      this.#appReady.then(async () => {
        try { const state = await this.#updater.init(); if (state.supported && state.autoCheck) await this.#updater.check(); }
        catch (error) { console.error('Automatic update check failed:', error); }
      });
    }
    if (smoke) await require('./diagnostics/DesktopSmokeTest').run(this, appLogo);
  }

  // Registers the IPC API and the application events; the window opens when Electron is ready.
  start() {
    this.#registerIpc();
    this.#store.on('change', info => {
      if (this.#win && !this.#win.isDestroyed()) this.#win.webContents.send('workspace-changed', info);
      this.#scheduleSplashTheme();
    });
    const lock = app.requestSingleInstanceLock();
    if (!lock) app.quit();
    else {
      app.on('second-instance', () => {
        // A window that is still loading appears by itself once it is ready.
        const win = this.#win, splash = this.#splash;
        const target = win && !win.isDestroyed() && win.isVisible() ? win : splash && !splash.closed ? splash.window : null;
        if (!target || target.isDestroyed()) return;
        if (target.isMinimized()) target.restore();
        target.focus();
      });
      app.whenReady().then(() => this.#ready()).catch(error => { this.#splash?.close(); this.releaseLauncher(); dialog.showErrorBox('Startup failed', error.message); app.exit(1); });
    }
    app.on('before-quit', event => {
      this.#splash?.close();
      if (this.#quitting) return;
      event.preventDefault();
      // Decided after the store is idle: its last write may have scheduled a new theme save.
      Promise.allSettled([this.#store.idle(), this.#webServer.close()])
        .then(() => this.#splashThemeTimer !== null ? this.saveSplashTheme() : this.#splashThemeSaving)
        .then(() => { this.#quitting = true; app.quit(); });
    });
    app.on('window-all-closed', () => app.quit());
  }
}

module.exports = DesktopApplication;
