'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const fs = require('node:fs');
const { APP_ID, LAUNCHER_SIGNAL_VARIABLE, LAUNCHER_SIGNAL_FILE, launcherSignal, launcherPath, relaunchDetails, shortcutDetails } = require('../src/desktop/platform/PortableLauncher');

test('taskbar relaunch and shortcut always target the durable portable launcher', () => {
  const file = path.resolve('portable folder', 'OrbitKanban-Portable.exe');
  const executable = path.resolve('temporary runtime', 'OrbitKanban.exe');
  const target = launcherPath({ packaged: true, executable, portableFile: file });
  assert.equal(target, file);
  assert.deepEqual(relaunchDetails(target), { appId: APP_ID, appIconPath: file, appIconIndex: 0, relaunchCommand: `"${file}"`, relaunchDisplayName: 'OrbitKanban' });
  assert.equal(shortcutDetails(target).target, file);
  assert.equal(shortcutDetails(target).icon, file);
  assert.equal(shortcutDetails(target).appUserModelId, require('../package.json').build.appId);
  assert.equal(launcherPath({ packaged: false, executable, portableFile: file }), null);
  assert.equal(launcherPath({ packaged: true, executable }), executable);
  assert.throws(() => launcherPath({ packaged: true, executable: 'relative.exe' }));
});
test('portable invocations isolate extraction and bundle their update helper', () => {
  const { build } = require('../package.json');
  assert.equal(build.portable.unpackDirName, false);
  assert(build.files.includes('src/**/*'));
  for (const file of ['platform/PortableLauncher.js', 'update/Updater.js', 'update/UpdateLauncher.js', 'update/install-update.ps1']) assert(fs.existsSync(path.join(ROOT, 'src', 'desktop', file)), file);
  assert.match(fs.readFileSync(path.join(ROOT, 'build', 'portable-launcher.nsh'), 'utf8'), /SetCurrentProcessExplicitAppUserModelID/);
});
test('the launcher keeps its loading screen until the app signals that its window is visible', () => {
  const file = path.resolve('temp', 'ns1A2B.tmp', LAUNCHER_SIGNAL_FILE);
  assert.equal(launcherSignal({ [LAUNCHER_SIGNAL_VARIABLE]: file }), file);
  for (const value of [undefined, '', 42, LAUNCHER_SIGNAL_FILE, path.resolve('temp', 'other-file'), path.resolve('temp') + path.sep + '..' + path.sep + LAUNCHER_SIGNAL_FILE]) {
    assert.equal(launcherSignal({ [LAUNCHER_SIGNAL_VARIABLE]: value }), null);
  }
  assert.equal(launcherSignal(undefined), null);
  const script = fs.readFileSync(path.join(ROOT, 'build', 'portable-launcher.nsh'), 'utf8');
  const hook = script.slice(script.indexOf('!macro customFiles_x64'), script.indexOf('!macroend'));
  assert(hook.includes(`("${LAUNCHER_SIGNAL_VARIABLE}", "$PLUGINSDIR\\${LAUNCHER_SIGNAL_FILE}")`));
  assert(hook.includes(`IfFileExists "$PLUGINSDIR\\${LAUNCHER_SIGNAL_FILE}"`));
  // The loading screen goes away only after the app has started and signalled, then the launcher quits before the template starts it again.
  assert.match(hook, /CreateProcessW[\s\S]*IfFileExists[\s\S]*Call orbitKanbanCloseSplash[\s\S]*BgImage::Destroy[\s\S]*GetExitCodeProcess[\s\S]*SetErrorLevel[\s\S]*RMDir \/r \$INSTDIR[\s\S]*Quit/);
  assert.match(hook.slice(hook.indexOf('orbitKanbanNotStarted:')), /Call orbitKanbanCloseSplash/, 'the template starts the app without a stale page');
});
test('the launcher shows the themed HTML loading screen and keeps the bitmap only as a fallback', () => {
  const SplashTheme = require('../src/desktop/splash/SplashTheme');
  const script = fs.readFileSync(path.join(ROOT, 'build', 'portable-launcher.nsh'), 'utf8');
  assert.doesNotMatch(script, /[^\x09\x0a\x0d\x20-\x7e]/, 'ASCII only: the template reads included scripts with the system code page');
  const page = script.slice(script.indexOf('Function orbitKanbanLauncherPage'), script.indexOf('FunctionEnd'));
  assert.match(script, /^Page instfiles "" orbitKanbanLauncherPage$/m);
  for (const file of ['splash.html', 'splash.js']) {
    assert(page.includes(`File "/oname=$PLUGINSDIR\\splash\\${file}" "\${ORBITKANBAN_SPLASH_PAGE}\\${file}"`), file);
    assert(fs.existsSync(path.join(ROOT, 'src', 'desktop', 'splash', file)), file);
  }
  assert.match(script, /!define ORBITKANBAN_SPLASH_PAGE "\$\{__FILEDIR__\}\\\.\.\\src\\desktop\\splash"/);
  // The theme is copied next to the page, the only stylesheet location splash.js accepts.
  assert(page.includes(`"$EXEDIR\\data\\runtime\\${SplashTheme.FILE_NAME}", w "$PLUGINSDIR\\splash\\${SplashTheme.FILE_NAME}"`));
  assert(page.includes(`StrCpy $9 "$9&theme=${SplashTheme.FILE_NAME}"`));
  assert(page.includes('StrCpy $9 "#version=${VERSION}"'));
  assert.match(page, /OleInitialize[\s\S]*AtlAxWinInit[\s\S]*CreateWindowEx\(i 0x80, w 'AtlAxWin', w r9/);
  assert.match(page, /StrCmp \$4 0 showFallback[\s\S]*showFallback:[\s\S]*"\$\{ORBITKANBAN_FALLBACK_SPLASH\}"[\s\S]*BgImage::SetBg/);
  assert.match(script, /!ifndef ORBITKANBAN_FALLBACK_SPLASH\s+!error/);
  assert.doesNotMatch(script, /splash-bar|SysAnimate32|\.avi\b/i);
  const build = fs.readFileSync(path.join(ROOT, 'tools', 'build.js'), 'utf8');
  assert.match(build, /defines\.ORBITKANBAN_FALLBACK_SPLASH = defines\.SPLASH_IMAGE;\s+defines\.SPLASH_IMAGE = PortableBuild\.#SPLASH_PLACEHOLDER;/);
});
test('published build script derives paths from its location rather than a workstation', () => {
  const script = fs.readFileSync(path.join(ROOT, 'build-and-push.ps1'), 'utf8');
  assert.match(script, /\$root = \[IO\.Path\]::GetFullPath\(\$PSScriptRoot\)/);
  assert.match(script, /Push-Location -LiteralPath \$root/);
  assert.doesNotMatch(script, /[a-z]:[\\/]|\\\\[^\\\s]+\\/i);
});
