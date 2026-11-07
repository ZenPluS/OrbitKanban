'use strict';
// Same as `electron-builder --win portable --x64`, plus build/portable-launcher.nsh in the portable launcher.
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { build, Platform, Arch } = require('electron-builder');

class PortableBuild {
  static #LAUNCHER_HOOK = path.join(__dirname, '..', 'build', 'portable-launcher.nsh');

  // The launcher starts the app from the template's customFiles_x64 hook, which runs after unpacking and before the template's own launch.
  static #checkTemplate() {
    const templates = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis');
    if (!fs.readFileSync(path.join(templates, 'include', 'extractAppPackage.nsh'), 'utf8').includes('!ifmacrodef customFiles_x64') ||
      !/extractEmbeddedAppPackage[\s\S]*BgImage::Destroy[\s\S]*ExecWait/.test(fs.readFileSync(path.join(templates, 'portable.nsi'), 'utf8'))) {
      throw new Error('The portable launcher template changed: check build/portable-launcher.nsh against this electron-builder version.');
    }
  }

  static run({ out } = {}) {
    PortableBuild.#checkTemplate();
    let hooked = false;
    return build({
      targets: Platform.WINDOWS.createTarget('portable', Arch.x64),
      publish: 'never',
      config: out ? { directories: { output: out } } : undefined,
      // electron-builder hands over the makensis defines and -X commands before compiling; returning false lets the build continue.
      effectiveOptionComputed: async options => {
        const [defines, commands] = Array.isArray(options) ? options : [];
        if (defines?.SPLASH_IMAGE && commands && 'Unicode' in commands) {
          if (!commands.Icon) throw new Error('The portable launcher icon is not configured.');
          // Some builder versions ignore unpackDirName:false. Omit the define so NSIS uses its per-launch $PLUGINSDIR.
          delete defines.UNPACK_DIR_NAME;
          commands['!include'] = `"${PortableBuild.#LAUNCHER_HOOK}"`;
          hooked = true;
        }
        return false;
      }
    }).then(() => {
      if (!hooked) throw new Error('The portable launcher was not customized: check compatibility with this electron-builder version.');
    });
  }
}

const { values } = parseArgs({ options: { out: { type: 'string' } } });
PortableBuild.run({ out: values.out }).catch(error => {
  console.error(error);
  process.exitCode = 1;
});