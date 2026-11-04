'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { APP_NAME, validateArchive, isWebUrl, parseOrganizationFile, ORGANIZATION_FILE_KINDS } = require('./core');
const { createWorkspaceStore } = require('./workspace-store');
const { createWebServer, DEFAULT_PORT } = require('./web-server');
const { createSplash, splashHoldTime, windowBackground, SPLASH_STATUS } = require('./splash');
const { createLanguageStore } = require('./languages');
const { TITLE_BAR_ARGUMENT, TITLE_BAR_HEIGHT, themeColors, titleBarOverlay } = require('./window-chrome');
const { APP_ID, launcherPath, relaunchDetails, shortcutDetails } = require('./portable');
const { createUpdater } = require('./updater');
const { launchInstaller } = require('./update-launcher');
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
// On Windows the app draws its own title bar: the top bar drags the window and the caption buttons follow the theme.
const customTitleBar = process.platform === 'win32';
let windowChrome = null;
const smoke = process.argv.includes('--smoke-test');
if (smoke) {
  // Match the build's rasterizer and scale for the SVG/icon pixel comparison.
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.disableHardwareAcceleration();
}
const root = smoke ? (process.env.ORBITA_SMOKE_DIR || path.join(os.tmpdir(), `orbita-smoke-${process.pid}`)) :
  (process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname));
const dataFolder = path.join(root, 'data');
const runtimeFolder = path.join(dataFolder, 'runtime');
const launcher = process.platform === 'win32' ? launcherPath({ packaged: app.isPackaged, executable: app.getPath('exe'), portableFile: process.env.PORTABLE_EXECUTABLE_FILE }) : null;
const portableFile = launcher && process.env.PORTABLE_EXECUTABLE_FILE ? launcher : null;
app.setPath('userData', runtimeFolder);
app.setPath('sessionData', runtimeFolder);
app.setAppLogsPath(path.join(dataFolder, 'logs'));
let win, splash, revealTimer, revealed = false, resolveAppReady;
const appReady = new Promise(resolve => { resolveAppReady = resolve; });
// The main window stays hidden behind the loading screen until the renderer has drawn the workspace.
function revealMainWindow(reason) {
  if (revealed) return;
  revealed = true;
  clearTimeout(revealTimer);
  resolveAppReady(reason);
  if (smoke) return;
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.show();
    splash?.close();
  }, splashHoldTime(splash?.shownAt, Date.now()));
}
const store = createWorkspaceStore({ dataFolder, extras: () => ({ appVersion: app.getVersion(), browserUrl: webServer.url }) });
const languages = createLanguageStore({ dataFolder });
const message = (text, organizationId) => store.message(text, organizationId);
let updateShutdown = false;
const updater = createUpdater({
  currentVersion: app.getVersion(), dataFolder, portableFile: smoke ? null : portableFile,
  install: async update => {
    const answer = await dialog.showMessageBox(win, {
      type: 'question', buttons: [message("Cancel"), message("Install and restart")], defaultId: 0, cancelId: 0,
      message: message("Install the downloaded update?"),
      detail: message("OrbitKanban and browser access will close. Saved data will be backed up and kept. Save any open editors in browser tabs before continuing.")
    });
    if (answer.response !== 1) return false;
    updateShutdown = true;
    try {
      await store.idle();
      await store.exportTo(path.join(update.directory, 'workspace-before-update.json'));
      await launchInstaller(update);
      app.quit();
      return true;
    } catch (error) { updateShutdown = false; throw error; }
  }
});
updater.on('change', info => { if (win && !win.isDestroyed()) win.webContents.send('update-changed', info); });
async function languageOperation(operation = 'info') {
  if (operation === 'reload') return languages.reload();
  if (operation === 'open-folder') {
    const folder = await languages.prepareFolder();
    if (!smoke) {
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    }
    return languages.info();
  }
  if (operation !== 'info') throw new Error(message("Unsupported operation."));
  return languages.info();
}
async function openDataFolder() {
  const error = await shell.openPath(dataFolder);
  if (error) throw new Error(error);
}
const webServer = createWebServer({
  store, appRoot: __dirname, tokenFolder: runtimeFolder, port: smoke ? 0 : DEFAULT_PORT,
  openDataFolder: smoke ? async () => {} : openDataFolder,
  language: () => store.language(),
  languages: languageOperation
});
function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unsupported request.');
      if (updateShutdown) throw new Error(message("The app is restarting to install an update."));
      return await handler(...args);
    }
    catch (error) {
      if (!['conflict', 'missing-organization'].includes(error.code)) console.error(`Operation ${channel} failed:`, error);
      return { __error: true, message: error.message, code: error.code || '' };
    }
  });
}
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
  if (!launcher) throw new Error(message("Shortcuts are available in the packaged Windows app."));
  const result = smoke ? { filePath: path.join(root, 'OrbitKanban.lnk') } : await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('desktop'), 'OrbitKanban.lnk'), filters: [{ name: 'Windows shortcut', extensions: ['lnk'] }]
  });
  if (result.canceled || !result.filePath) return false;
  if (!shell.writeShortcutLink(result.filePath, 'create', shortcutDetails(launcher))) throw new Error(message("Could not create the shortcut."));
  return true;
});
ipcMain.on('app-ready', event => { if (win && event.sender === win.webContents) revealMainWindow('renderer'); });
ipcMain.on('window-chrome', (event, request) => {
  if (!customTitleBar || !win || win.isDestroyed() || event.sender !== win.webContents) return;
  const overlay = titleBarOverlay(request, win.webContents.getZoomFactor());
  if (!overlay || (windowChrome && ['color', 'symbolColor', 'height'].every(key => windowChrome[key] === overlay[key]))) return;
  try {
    win.setTitleBarOverlay(overlay);
    windowChrome = overlay;
  } catch (error) { console.error('Title bar update failed:', error); }
});
handle('save', (data, organizationId, organizationName, revision) => store.save(data, organizationId, organizationName, revision));
handle('organization', (operation, payload, organizationId) => store.organization(operation, payload, organizationId));
handle('export', async () => {
  const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, `${APP_NAME}-backup.json`), filters: [{ name: message("JSON archive"), extensions: ['json'] }] });
  if (result.canceled) return false;
  await store.exportTo(result.filePath);
  return true;
});
handle('export-organization', async (organizationId, kind) => {
  const { fileName, text } = await store.exportOrganization(organizationId, kind);
  let filePath = path.join(root, 'exports', fileName);
  if (smoke) await fs.mkdir(path.dirname(filePath), { recursive: true });
  else {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, fileName), filters: [{ name: message("OrbitKanban export", organizationId), extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, text, 'utf8');
  return { fileName: path.basename(filePath) };
});
const SPREADSHEET_LIMIT = 256 * 1024 * 1024;
handle('export-spreadsheet', async (fileName, bytes) => {
  const name = path.basename(String(fileName ?? '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  const valid = /^[^.].*\.xlsx$/i.test(name) && name.length <= 200 && bytes instanceof Uint8Array && bytes.length > 22 && bytes.length <= SPREADSHEET_LIMIT && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (!valid) throw new Error(message("Invalid Excel file."));
  let filePath = path.join(root, 'exports', name);
  if (smoke) await fs.mkdir(path.dirname(filePath), { recursive: true });
  else {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, name), filters: [{ name: message("Excel workbook"), extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return false;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, bytes);
  return { fileName: path.basename(filePath) };
});
handle('import', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: message("JSON archive"), extensions: ['json'] }] });
  if (result.canceled) return null;
  const archive = store.parseArchive(await fs.readFile(result.filePaths[0], 'utf8'));
  const answer = await dialog.showMessageBox(win, { type: 'warning', buttons: [message("Cancel"), message("Replace archive")], defaultId: 0, cancelId: 0, message: message("Replace all organizations, data and settings?"), detail: message("The previous archive will be kept in workspace.json.bak.") });
  if (answer.response !== 1) return null;
  return store.replace(archive);
});
handle('backups', (operation = 'list', fileName) => {
  if (operation === 'list') return store.listBackups();
  if (operation === 'restore') return store.restoreBackup(fileName);
  throw new Error(message("Unsupported operation."));
});
handle('open-link', async url => {
  if (!isWebUrl(url)) throw new Error("Invalid URL.");
  if (!smoke) await shell.openExternal(url);
  return url;
});
handle('open-data-folder', openDataFolder);
handle('languages', languageOperation);
handle('browser-access', async (operation, organizationId) => {
  if (!webServer.port) throw new Error(message("Browser access is not available."));
  if (operation === 'open') { if (!smoke) await shell.openExternal(webServer.authUrl(organizationId)); }
  else if (operation === 'copy') { if (!smoke) clipboard.writeText(webServer.authUrl(organizationId)); }
  else if (operation !== 'info') throw new Error(message("Unsupported operation."));
  return { url: webServer.url };
});
store.on('change', info => { if (win && !win.isDestroyed()) win.webContents.send('workspace-changed', info); });
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    const target = win && !win.isDestroyed() && win.isVisible() ? win : splash && !splash.closed ? splash.window : win;
    if (!target || target.isDestroyed()) return;
    if (target.isMinimized()) target.restore();
    target.focus();
  });
  app.whenReady().then(async () => {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'app-logo.png'));
    if (icon.isEmpty()) throw new Error('The application icon is missing or invalid. Run npm run icon during development.');
    splash = createSplash({ BrowserWindow, screen, appRoot: __dirname, title: APP_NAME, icon, version: app.getVersion(), show: !smoke });
    try { await languages.reload(); }
    catch (error) { console.error('Additional languages could not be loaded:', error); }
    let settings;
    try { settings = (await store.load()).data.settings; }
    catch (error) { console.error('Workspace archive could not be preloaded:', error); }
    try { await webServer.start(); }
    catch (error) { console.error('Browser access did not start:', error); }
    windowChrome = customTitleBar ? titleBarOverlay({ ...themeColors(settings), height: TITLE_BAR_HEIGHT.initial }) : null;
    win = new BrowserWindow({
      width: 1500, height: 960, minWidth: 1050, minHeight: 700, show: false,
      backgroundColor: windowBackground(settings), title: APP_NAME, icon,
      ...(customTitleBar ? { titleBarStyle: 'hidden', titleBarOverlay: windowChrome } : { autoHideMenuBar: true }),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: customTitleBar ? [TITLE_BAR_ARGUMENT] : [] }
    });
    if (launcher) win.setAppDetails(relaunchDetails(launcher));
    // The default menu keeps its shortcuts, but Alt must not slide a native menu bar under the custom title bar.
    if (customTitleBar) win.setMenuBarVisibility(false);
    win.on('closed', () => splash?.close());
    revealTimer = setTimeout(() => revealMainWindow('timeout'), 15000);
    win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => { if (isMainFrame) revealMainWindow('failed'); });
    win.webContents.on('render-process-gone', () => revealMainWindow('crashed'));
    if (smoke) win.webContents.on('console-message', (event) => console.log('Renderer:', event.message));
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!smoke && isWebUrl(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', event => event.preventDefault());
    await win.loadFile('index.html');
    if (!smoke) {
      appReady.then(async () => {
        try { const state = await updater.init(); if (state.supported && state.autoCheck) await updater.check(); }
        catch (error) { console.error('Automatic update check failed:', error); }
      });
    }
    if (smoke) {
      try {
        if (await appReady !== 'renderer') throw new Error('The interface did not signal that it was ready.');
        let screenState;
        for (let attempt = 0; attempt < 30; attempt++) {
          screenState = await splash.inspect();
          if (screenState.logo && screenState.version.endsWith(app.getVersion())) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (screenState.lang !== 'en' || screenState.status !== SPLASH_STATUS || screenState.version !== `Portable · v${app.getVersion()}` || screenState.busy !== 'true' || !screenState.logo) throw new Error(`Invalid splash screen: ${JSON.stringify(screenState)}`);
        if (!screenState.indeterminate || !screenState.animated) throw new Error(`Loading bar is not animated: ${JSON.stringify(screenState)}`);
        const logoData = await win.webContents.executeJavaScript(`(async () => {
          const image = new Image();
          image.src = 'app-logo.svg';
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/png');
        })()`);
        const iconPixels = icon.toBitmap(), logoPixels = nativeImage.createFromDataURL(logoData).toBitmap();
        if (!iconPixels.equals(logoPixels)) throw new Error('The application logo and window icon do not match.');
        splash.close();
        if (!splash.closed || !win || win.isDestroyed()) throw new Error('The splash screen did not close.');
        const splashChecks = [
          'Application logo and window icon use the same source image',
          'Splash screen shows English, logo, and version',
          'Splash screen displays an animated indeterminate loading bar',
          'Splash screen closes when the interface is ready'
        ];
        if (launcher) {
          await require('./smoke-windows').verifyTaskbar(win, launcher);
          splashChecks.push('Native Windows taskbar properties relaunch the portable launcher with its persistent icon');
          const shortcut = path.join(root, 'OrbitKanban.lnk');
          if (!shell.writeShortcutLink(shortcut, 'create', shortcutDetails(launcher))) throw new Error('Could not create the test shortcut.');
          const actual = shell.readShortcutLink(shortcut);
          if (actual.target !== launcher || actual.icon !== launcher || actual.appUserModelId !== APP_ID) throw new Error('The shortcut does not point to the persistent launcher with the correct identity.');
          await fs.unlink(shortcut);
          splashChecks.push('Windows shortcut targets the stable executable and icon with the application identity');
          const helperSource = path.join(__dirname, 'install-update.ps1'), helperCopy = path.join(root, 'install-copy.ps1');
          await fs.copyFile(helperSource, helperCopy);
          if (!(await fs.readFile(helperCopy)).equals(await fs.readFile(helperSource))) throw new Error('The packaged update helper could not be extracted.');
          await fs.unlink(helperCopy);
          splashChecks.push('Update helper can be copied out of the packaged archive before shutdown');
        }
        if (portableFile) {
          await new Promise((resolve, reject) => {
            const child = require('node:child_process').spawn(portableFile, ['--smoke-test'], { windowsHide: true, stdio: 'ignore' });
            const timer = setTimeout(() => { child.kill(); reject(new Error('Second portable launch did not return to the existing app.')); }, 45000);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Second portable launch failed (${code}).`)); });
          });
          await fs.access(app.getPath('exe'));
          await fs.access(path.join(__dirname, 'index.html'));
          splashChecks.push('Second portable launch reuses the app without deleting its extracted runtime');
        }
        await new Promise(resolve => setTimeout(resolve, 1200));
        const result = await win.webContents.executeJavaScript('window.runSmokeTests()');
        if (!result.ok) throw new Error('UI smoke test failed.');
        result.checks.unshift(...splashChecks);
        if (customTitleBar) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const chrome = await win.webContents.executeJavaScript(`(() => {
            const style = document.documentElement.style;
            return { background: style.getPropertyValue('--background'), text: style.getPropertyValue('--text'), height: document.querySelector('.topbar').clientHeight, dimmed: document.querySelector('#modal').open };
          })()`);
          const expected = titleBarOverlay(chrome, win.webContents.getZoomFactor());
          if (!expected || !windowChrome || ['color', 'symbolColor', 'height'].some(key => windowChrome[key] !== expected[key]) || win.isMenuBarVisible()) throw new Error(`The title bar does not match the theme: ${JSON.stringify({ windowChrome, expected })}`);
          result.checks.push('Native window buttons match the theme and top-bar height');
        }
        result.checks.push(...await require('./smoke-web').run({ server: webServer, win }));
        // Exported file names carry a part localized by the language of the organization, so both the Italian and the English spellings are valid.
        const exportsFolder = path.join(root, 'exports'), exportNames = await fs.readdir(exportsFolder);
        const exportedFiles = await Promise.all(exportNames.filter(name => name.endsWith('.json')).map(async name => ({ name, file: parseOrganizationFile(await fs.readFile(path.join(exportsFolder, name), 'utf8')) })));
        const fullExport = exportedFiles.find(entry => entry.file.kind === 'organization');
        if (!ORGANIZATION_FILE_KINDS.every(kind => exportedFiles.some(entry => entry.file.kind === kind)) || !exportedFiles.every(entry => /^OrbitKanban-[a-z0-9-]+-(temi|configurazione|dati|organizzazione|themes|settings|data|organization)-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) || !fullExport.file.data.tasks.some(task => task.code === 'SMOKE-1') || !fullExport.file.settings.logo.startsWith('data:image/png;base64,')) throw new Error('Invalid organization exports.');
        result.checks.push('Organization exports are saved and can be imported again');
        const spreadsheets = exportNames.filter(name => name.endsWith('.xlsx'));
        const workbook = spreadsheets.length ? await fs.readFile(path.join(exportsFolder, spreadsheets[0])) : Buffer.alloc(0);
        if (spreadsheets.length !== 1 || !/^OrbitKanban-[a-z0-9-]+-(situazione|situation)-\d{4}-\d{2}-\d{2}\.xlsx$/.test(spreadsheets[0]) || workbook.readUInt32LE(0) !== 0x04034b50 || !workbook.includes('xl/workbook.xml') || workbook.readUInt32LE(workbook.length - 22) !== 0x06054b50) throw new Error(`Invalid Excel export: ${spreadsheets.join(', ')}`);
        result.checks.push('Excel export is saved as a valid .xlsx workbook');
        console.log(JSON.stringify(result, null, 2));
        await store.idle();
        const stored = validateArchive(JSON.parse(await fs.readFile(store.dataFile, 'utf8')));
        if (!stored.organizations.some(o => o.data.tasks.some(t => t.code === 'SMOKE-1'))) throw new Error('Smoke-test task was not persisted.');
        validateArchive(JSON.parse(await fs.readFile(store.dataFile + '.bak', 'utf8')));
        await fs.writeFile(path.join(root, 'smoke-result.json'), JSON.stringify(result));
        await webServer.close();
        app.exit(0);
      } catch (error) {
        console.error(error);
        await fs.writeFile(path.join(root, 'smoke-error.json'), JSON.stringify({ error: error.stack || error.message }));
        app.exit(1);
      }
    }
  }).catch(error => { splash?.close(); dialog.showErrorBox('Startup failed', error.message); app.exit(1); });
}
let quitting = false;
app.on('before-quit', event => {
  splash?.close();
  if (quitting) return;
  event.preventDefault();
  Promise.allSettled([store.idle(), webServer.close()]).then(() => { quitting = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
