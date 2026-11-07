'use strict';
// Windows identity of the portable app: application id, launcher signal file, relaunch and shortcut details.
const path = require('node:path');

class PortableLauncher {
  static APP_ID = 'local.orbita.workspace';
  // The portable launcher keeps its loading screen until the app creates this file (build/portable-launcher.nsh).
  static LAUNCHER_SIGNAL_VARIABLE = 'ORBITKANBAN_LAUNCHER_SIGNAL';
  static LAUNCHER_SIGNAL_FILE = 'orbitkanban-ready';
  static launcherSignal(env) {
    const file = env?.[PortableLauncher.LAUNCHER_SIGNAL_VARIABLE];
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.normalize(file) !== file || path.basename(file) !== PortableLauncher.LAUNCHER_SIGNAL_FILE) return null;
    return file;
  }
  static launcherPath({ packaged, executable, portableFile }) {
    if (!packaged) return null;
    const target = portableFile || executable;
    if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.exe') throw new Error('Invalid application launcher.');
    return path.resolve(target);
  }
  static relaunchDetails(target) {
    return { appId: PortableLauncher.APP_ID, relaunchCommand: `"${target}"`, relaunchDisplayName: 'OrbitKanban', appIconPath: target, appIconIndex: 0 };
  }
  static shortcutDetails(target) {
    return { target, cwd: path.dirname(target), description: 'OrbitKanban', icon: target, iconIndex: 0, appUserModelId: PortableLauncher.APP_ID };
  }
}

module.exports = PortableLauncher;
