'use strict';
// Same as `electron-builder --win portable --x64`, plus build/portable-launcher.nsh in the portable launcher.
const path = require('node:path');
const { parseArgs } = require('node:util');
const { build, Platform, Arch } = require('electron-builder');

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const launcherHook = path.join(__dirname, 'build', 'portable-launcher.nsh');
let hooked = false;
build({
  targets: Platform.WINDOWS.createTarget('portable', Arch.x64),
  publish: 'never',
  config: values.out ? { directories: { output: values.out } } : undefined,
  // electron-builder hands over the makensis defines and -X commands before compiling; returning false lets the build continue.
  effectiveOptionComputed: async options => {
    const [defines, commands] = Array.isArray(options) ? options : [];
    if (defines?.SPLASH_IMAGE && commands && 'Unicode' in commands) {
      if (!commands.Icon) throw new Error('Icona del launcher portable non configurata.');
      commands['!include'] = `"${launcherHook}"`;
      hooked = true;
    }
    return false;
  }
}).then(() => {
  if (!hooked) throw new Error('Launcher portable non personalizzato: verifica la compatibilità con la versione di electron-builder.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
