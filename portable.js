'use strict';
const path = require('node:path');

const APP_ID = 'local.orbita.workspace';
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
module.exports = { APP_ID, launcherPath, relaunchDetails, shortcutDetails };
