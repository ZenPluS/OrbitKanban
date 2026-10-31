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
app.setName(APP_NAME);
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
  if (operation !== 'info') throw new Error(message('Operazione non supportata.'));
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
  ipcMain.handle(channel, async (_, ...args) => {
    try { return await handler(...args); }
    catch (error) {
      if (!['conflict', 'missing-organization'].includes(error.code)) console.error(`Operazione ${channel} non riuscita:`, error);
      return { __error: true, message: error.message, code: error.code || '' };
    }
  });
}
handle('load', organizationId => store.load(organizationId));
ipcMain.on('app-ready', event => { if (win && event.sender === win.webContents) revealMainWindow('renderer'); });
handle('save', (data, organizationId, organizationName, revision) => store.save(data, organizationId, organizationName, revision));
handle('organization', (operation, payload, organizationId) => store.organization(operation, payload, organizationId));
handle('export', async () => {
  const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, `${APP_NAME}-backup.json`), filters: [{ name: message('Archivio JSON'), extensions: ['json'] }] });
  if (result.canceled) return false;
  await store.exportTo(result.filePath);
  return true;
});
handle('export-organization', async (organizationId, kind) => {
  const { fileName, text } = await store.exportOrganization(organizationId, kind);
  let filePath = path.join(root, 'exports', fileName);
  if (smoke) await fs.mkdir(path.dirname(filePath), { recursive: true });
  else {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, fileName), filters: [{ name: message('Esportazione OrbitKanban', organizationId), extensions: ['json'] }] });
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
  if (!valid) throw new Error(message('File Excel non valido.'));
  let filePath = path.join(root, 'exports', name);
  if (smoke) await fs.mkdir(path.dirname(filePath), { recursive: true });
  else {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(root, name), filters: [{ name: message('Cartella di lavoro Excel'), extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return false;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, bytes);
  return { fileName: path.basename(filePath) };
});
handle('import', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: message('Archivio JSON'), extensions: ['json'] }] });
  if (result.canceled) return null;
  const archive = store.parseArchive(await fs.readFile(result.filePaths[0], 'utf8'));
  const answer = await dialog.showMessageBox(win, { type: 'warning', buttons: [message('Annulla'), message('Sostituisci archivio')], defaultId: 0, cancelId: 0, message: message('Sostituire tutte le organizzazioni, i dati e le impostazioni?'), detail: message('Il precedente archivio sarà conservato in workspace.json.bak.') });
  if (answer.response !== 1) return null;
  return store.replace(archive);
});
handle('open-link', async url => {
  if (!isWebUrl(url)) throw new Error('URL non valido.');
  if (!smoke) await shell.openExternal(url);
  return url;
});
handle('open-data-folder', openDataFolder);
handle('languages', languageOperation);
handle('browser-access', async (operation, organizationId) => {
  if (!webServer.port) throw new Error(message('L’accesso da browser non è disponibile.'));
  if (operation === 'open') { if (!smoke) await shell.openExternal(webServer.authUrl(organizationId)); }
  else if (operation === 'copy') { if (!smoke) clipboard.writeText(webServer.authUrl(organizationId)); }
  else if (operation !== 'info') throw new Error(message('Operazione non supportata.'));
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
    if (icon.isEmpty()) throw new Error('Icona applicativa non trovata o non valida. In sviluppo esegui npm run icon.');
    if (process.platform === 'win32') app.setAppUserModelId('local.orbita.workspace');
    splash = createSplash({ BrowserWindow, screen, appRoot: __dirname, title: APP_NAME, icon, version: app.getVersion(), show: !smoke });
    try { await languages.reload(); }
    catch (error) { console.error('Lingue aggiuntive non caricate:', error); }
    let settings;
    try { settings = (await store.load()).data.settings; }
    catch (error) { console.error('Archivio non aperto in anticipo:', error); }
    try { await webServer.start(); }
    catch (error) { console.error('Accesso da browser non avviato:', error); }
    win = new BrowserWindow({
      width: 1500, height: 960, minWidth: 1050, minHeight: 700, show: false,
      backgroundColor: windowBackground(settings), autoHideMenuBar: true, title: APP_NAME, icon,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
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
    if (smoke) {
      try {
        if (await appReady !== 'renderer') throw new Error('L’interfaccia non ha segnalato di essere pronta.');
        let screenState;
        for (let attempt = 0; attempt < 30; attempt++) {
          screenState = await splash.inspect();
          if (screenState.logo && screenState.version.endsWith(app.getVersion())) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (screenState.lang !== 'en' || screenState.status !== SPLASH_STATUS || screenState.version !== `Portable · v${app.getVersion()}` || screenState.busy !== 'true' || !screenState.logo) throw new Error(`Schermata di caricamento non valida: ${JSON.stringify(screenState)}`);
        if (!screenState.indeterminate || !screenState.animated) throw new Error(`Barra di caricamento non animata: ${JSON.stringify(screenState)}`);
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
        if (!iconPixels.equals(logoPixels)) throw new Error('Il logo applicativo e l’icona della finestra non coincidono.');
        splash.close();
        if (!splash.closed || !win || win.isDestroyed()) throw new Error('Schermata di caricamento non chiusa.');
        const splashChecks = [
          'Logo applicativo e icona della finestra identici, generati dalla stessa immagine',
          'Schermata di caricamento in inglese con logo e versione',
          'Schermata di caricamento con barra infinita animata',
          'Schermata di caricamento chiusa quando l’interfaccia è pronta'
        ];
        await new Promise(resolve => setTimeout(resolve, 1200));
        const result = await win.webContents.executeJavaScript('window.runSmokeTests()');
        if (!result.ok) throw new Error('Smoke test UI fallito');
        result.checks.unshift(...splashChecks);
        result.checks.push(...await require('./smoke-web').run({ server: webServer, win }));
        const exportsFolder = path.join(root, 'exports'), exportNames = await fs.readdir(exportsFolder);
        const exportedFiles = await Promise.all(exportNames.filter(name => name.endsWith('.json')).map(async name => ({ name, file: parseOrganizationFile(await fs.readFile(path.join(exportsFolder, name), 'utf8')) })));
        const fullExport = exportedFiles.find(entry => entry.file.kind === 'organization');
        if (!ORGANIZATION_FILE_KINDS.every(kind => exportedFiles.some(entry => entry.file.kind === kind)) || !exportedFiles.every(entry => /^OrbitKanban-[a-z0-9-]+-(temi|configurazione|dati|organizzazione|themes|settings|data|organization)-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) || !fullExport.file.data.tasks.some(task => task.code === 'SMOKE-1') || !fullExport.file.settings.logo.startsWith('data:image/png;base64,')) throw new Error('Esportazioni per organizzazione non valide.');
        result.checks.push('File esportati per organizzazione scritti su disco e reimportabili');
        const spreadsheets = exportNames.filter(name => name.endsWith('.xlsx'));
        const workbook = spreadsheets.length ? await fs.readFile(path.join(exportsFolder, spreadsheets[0])) : Buffer.alloc(0);
        if (spreadsheets.length !== 1 || !/^OrbitKanban-[a-z0-9-]+-(situazione|situation)-\d{4}-\d{2}-\d{2}\.xlsx$/.test(spreadsheets[0]) || workbook.readUInt32LE(0) !== 0x04034b50 || !workbook.includes('xl/workbook.xml') || workbook.readUInt32LE(workbook.length - 22) !== 0x06054b50) throw new Error(`Esportazione Excel non valida: ${spreadsheets.join(', ')}`);
        result.checks.push('Esportazione Excel scritta su disco come cartella di lavoro .xlsx');
        console.log(JSON.stringify(result, null, 2));
        await store.idle();
        const stored = validateArchive(JSON.parse(await fs.readFile(store.dataFile, 'utf8')));
        if (!stored.organizations.some(o => o.data.tasks.some(t => t.code === 'SMOKE-1'))) throw new Error('Attività di prova non persistita.');
        validateArchive(JSON.parse(await fs.readFile(store.dataFile + '.bak', 'utf8')));
        await fs.writeFile(path.join(root, 'smoke-result.json'), JSON.stringify(result));
        await webServer.close();
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    }
  }).catch(error => { splash?.close(); dialog.showErrorBox('Avvio non riuscito', error.message); app.exit(1); });
}
let quitting = false;
app.on('before-quit', event => {
  splash?.close();
  if (quitting) return;
  event.preventDefault();
  Promise.allSettled([store.idle(), webServer.close()]).then(() => { quitting = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
