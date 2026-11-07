'use strict';
// End-to-end check of the app run with --smoke-test: loading screen, icons, shortcuts, interface, browser access and exports.
const { app, BrowserWindow, nativeImage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ArchiveValidator, OrganizationTransfer } = require('../../shared/domain');
const SplashScreen = require('../splash/SplashScreen');
const WindowChrome = require('../platform/WindowChrome');
const PortableLauncher = require('../platform/PortableLauncher');

class DesktopSmokeTest {
  // Runs once the main window has loaded; writes smoke-result.json or smoke-error.json in the test folder and exits the app.
  static async run(application, icon) {
    const { splash, launcher, launcherReadyFile, portableFile, root, customTitleBar, webServer, store } = application;
    const win = application.window;
    try {
      if (await application.appReady !== 'renderer') throw new Error('The interface did not signal that it was ready.');
      const splashChecks = ['Application logo and window icon use the same source image'];
      if (splash) {
        let screenState;
        for (let attempt = 0; attempt < 30; attempt++) {
          screenState = await splash.inspect();
          if (screenState.logo && screenState.version.endsWith(app.getVersion())) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (screenState.lang !== 'en' || screenState.status !== SplashScreen.SPLASH_STATUS || screenState.version !== `Portable · v${app.getVersion()}` || screenState.busy !== 'true' || !screenState.logo) throw new Error(`Invalid splash screen: ${JSON.stringify(screenState)}`);
        if (!screenState.indeterminate || !screenState.animated) throw new Error(`Loading bar is not animated: ${JSON.stringify(screenState)}`);
        splash.close();
        if (!splash.closed || !win || win.isDestroyed()) throw new Error('The splash screen did not close.');
        splashChecks.push('Splash screen shows English, logo, and version', 'Splash screen displays an animated indeterminate loading bar', 'Splash screen closes when the interface is ready');
      } else {
        if (!application.launcherReleased || BrowserWindow.getAllWindows().length !== 1) throw new Error('The app opened its own loading screen under the portable launcher.');
        await fs.access(launcherReadyFile);
        splashChecks.push('Portable launcher keeps its loading screen until the interface is ready, without a second one');
      }
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
      if (launcher) {
        await require('./TaskbarVerifier').verifyTaskbar(win, launcher);
        splashChecks.push('Native Windows taskbar properties relaunch the portable launcher with its persistent icon');
        const shortcut = path.join(root, 'OrbitKanban.lnk');
        if (!shell.writeShortcutLink(shortcut, 'create', PortableLauncher.shortcutDetails(launcher))) throw new Error('Could not create the test shortcut.');
        const actual = shell.readShortcutLink(shortcut);
        if (actual.target !== launcher || actual.icon !== launcher || actual.appUserModelId !== PortableLauncher.APP_ID) throw new Error('The shortcut does not point to the persistent launcher with the correct identity.');
        await fs.unlink(shortcut);
        splashChecks.push('Windows shortcut targets the stable executable and icon with the application identity');
        const helperSource = path.join(application.appRoot, 'src', 'desktop', 'update', 'install-update.ps1'), helperCopy = path.join(root, 'install-copy.ps1');
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
        await fs.access(path.join(application.appRoot, 'index.html'));
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
        const expected = WindowChrome.titleBarOverlay(chrome, win.webContents.getZoomFactor());
        if (!expected || !application.windowChrome || ['color', 'symbolColor', 'height'].some(key => application.windowChrome[key] !== expected[key]) || win.isMenuBarVisible()) throw new Error(`The title bar does not match the theme: ${JSON.stringify({ windowChrome: application.windowChrome, expected })}`);
        result.checks.push('Native window buttons match the theme and top-bar height');
      }
      result.checks.push(...await require('./WebSmokeTests').run({ server: webServer, win }));
      // Exported file names carry a part localized by the language of the organization, so both the Italian and the English spellings are valid.
      const exportsFolder = path.join(root, 'exports'), exportNames = await fs.readdir(exportsFolder);
      const exportedFiles = await Promise.all(exportNames.filter(name => name.endsWith('.json')).map(async name => ({ name, file: OrganizationTransfer.parseOrganizationFile(await fs.readFile(path.join(exportsFolder, name), 'utf8')) })));
      const fullExport = exportedFiles.find(entry => entry.file.kind === 'organization');
      if (!OrganizationTransfer.ORGANIZATION_FILE_KINDS.every(kind => exportedFiles.some(entry => entry.file.kind === kind)) || !exportedFiles.every(entry => /^OrbitKanban-[a-z0-9-]+-(temi|configurazione|dati|organizzazione|themes|settings|data|organization)-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) || !fullExport.file.data.tasks.some(task => task.code === 'SMOKE-1') || !fullExport.file.settings.logo.startsWith('data:image/png;base64,')) throw new Error('Invalid organization exports.');
      result.checks.push('Organization exports are saved and can be imported again');
      const spreadsheets = exportNames.filter(name => name.endsWith('.xlsx'));
      const workbook = spreadsheets.length ? await fs.readFile(path.join(exportsFolder, spreadsheets[0])) : Buffer.alloc(0);
      if (spreadsheets.length !== 1 || !/^OrbitKanban-[a-z0-9-]+-(situazione|situation)-\d{4}-\d{2}-\d{2}\.xlsx$/.test(spreadsheets[0]) || workbook.readUInt32LE(0) !== 0x04034b50 || !workbook.includes('xl/workbook.xml') || workbook.readUInt32LE(workbook.length - 22) !== 0x06054b50) throw new Error(`Invalid Excel export: ${spreadsheets.join(', ')}`);
      result.checks.push('Excel export is saved as a valid .xlsx workbook');
      console.log(JSON.stringify(result, null, 2));
      await store.idle();
      const stored = ArchiveValidator.validateArchive(JSON.parse(await fs.readFile(store.dataFile, 'utf8')));
      if (!stored.organizations.some(o => o.data.tasks.some(t => t.code === 'SMOKE-1'))) throw new Error('Smoke-test task was not persisted.');
      ArchiveValidator.validateArchive(JSON.parse(await fs.readFile(store.dataFile + '.bak', 'utf8')));
      await fs.writeFile(path.join(root, 'smoke-result.json'), JSON.stringify(result));
      await webServer.close();
      app.exit(0);
    } catch (error) {
      console.error(error);
      await fs.writeFile(path.join(root, 'smoke-error.json'), JSON.stringify({ error: error.stack || error.message }));
      app.exit(1);
    }
  }
}

module.exports = DesktopSmokeTest;
