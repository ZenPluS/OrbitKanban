'use strict';
const path = require('node:path');

const APP_ID = 'local.orbita.workspace';
// The portable launcher keeps its loading screen until the app creates this file (build/portable-launcher.nsh).
const LAUNCHER_SIGNAL_VARIABLE = 'ORBITKANBAN_LAUNCHER_SIGNAL';
const LAUNCHER_SIGNAL_FILE = 'orbitkanban-ready';
function launcherSignal(env) {
  const file = env?.[LAUNCHER_SIGNAL_VARIABLE];
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file || path.basename(file) !== LAUNCHER_SIGNAL_FILE) return null;
  return file;
}
function launcherPath({ packaged, executable, portableFile }) {
  if (!packaged) return null;
  const target = portableFile || executable;
  if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.exe') throw new Error('Invalid application launcher.');
  return path.resolve(target);
}
function relaunchDetails(target) {
  return { appId: APP_ID, relaunchCommand: `"${target}"`, relaunchDisplayName: 'OrbitKanban', appIconPath: target, appIconIndex: 0 };
}
function shortcutDetails(target) {
  return { target, cwd: path.dirname(target), description: 'OrbitKanban', icon: target, iconIndex: 0, appUserModelId: APP_ID };
}
module.exports = { APP_ID, LAUNCHER_SIGNAL_VARIABLE, LAUNCHER_SIGNAL_FILE, launcherSignal, launcherPath, relaunchDetails, shortcutDetails };
