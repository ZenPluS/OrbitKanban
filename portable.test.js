'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { APP_ID, launcherPath, relaunchDetails, shortcutDetails } = require('./portable');

test('taskbar relaunch and shortcut always target the durable portable launcher', () => {
  const file = path.resolve('portable folder', 'OrbitKanban-Portable.exe');
  const executable = path.resolve('temporary runtime', 'OrbitKanban.exe');
  const target = launcherPath({ packaged: true, executable, portableFile: file });
  assert.equal(target, file);
  assert.deepEqual(relaunchDetails(target), { appId: APP_ID, appIconPath: file, appIconIndex: 0, relaunchCommand: `"${file}"`, relaunchDisplayName: 'OrbitKanban' });
  assert.equal(shortcutDetails(target).target, file);
  assert.equal(shortcutDetails(target).icon, file);
  assert.equal(shortcutDetails(target).appUserModelId, require('./package.json').build.appId);
  assert.equal(launcherPath({ packaged: false, executable, portableFile: file }), null);
  assert.equal(launcherPath({ packaged: true, executable }), executable);
  assert.throws(() => launcherPath({ packaged: true, executable: 'relative.exe' }));
});
test('portable invocations isolate extraction and bundle their update helper', () => {
  const { build } = require('./package.json');
  assert.equal(build.portable.unpackDirName, false);
  for (const file of ['portable.js', 'updater.js', 'update-launcher.js', 'install-update.ps1']) assert(build.files.includes(file));
  assert.match(fs.readFileSync(path.join(__dirname, 'build', 'portable-launcher.nsh'), 'utf8'), /SetCurrentProcessExplicitAppUserModelID/);
});
test('published build script derives paths from its location rather than a workstation', () => {
  const script = fs.readFileSync(path.join(__dirname, 'build-and-push.ps1'), 'utf8');
  assert.match(script, /\$root = \[IO\.Path\]::GetFullPath\(\$PSScriptRoot\)/);
  assert.match(script, /Push-Location -LiteralPath \$root/);
  assert.doesNotMatch(script, /[a-z]:[\\/]|\\\\[^\\\s]+\\/i);
});
