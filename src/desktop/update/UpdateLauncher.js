'use strict';
// Starts the hidden PowerShell helper (install-update.ps1) that replaces the portable executable after the app exits.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const SplashTheme = require('../splash/SplashTheme');

class UpdateLauncher {
  static READY_VARIABLE = 'ORBITKANBAN_UPDATE_READY';
  static presentation(settings, translate = text => text) {
    return {
      colors: SplashTheme.theme(settings),
      text: Object.fromEntries([
        ['title', 'App update'], ['waiting', 'Closing OrbitKanban…'],
        ['installing', 'Installing the verified update…'], ['starting', 'Starting OrbitKanban…'],
        ['detail', 'Your workspace is backed up. This window will close when the app is ready.'],
        ['failed', 'The update could not be completed.'], ['close', 'Close'],
        ['timeout', 'The update was installed, but startup could not be confirmed. Open OrbitKanban from its portable folder.']
      ].map(([key, text]) => [key, translate(text)])),
      errors: Object.fromEntries([
        'OrbitKanban is still running. Close the app and retry the update.',
        'The portable executable is still in use. Nothing was installed.',
        'Update checksum or size does not match. Nothing was installed.'
      ].map(text => [text, translate(text)]))
    };
  }
  static readyFile(folder, root) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || path.basename(folder) !== 'app-ready') return null;
    const directory = path.dirname(folder);
    return /^[a-f0-9-]{36}$/.test(path.basename(directory)) && path.dirname(directory) === path.join(root, 'data', 'updates') ? folder : null;
  }
  static async launchInstaller({ directory, target, release, presentation = UpdateLauncher.presentation() }, { appRoot = __dirname, pid = process.pid } = {}) {
    const script = path.join(directory, 'install.ps1'), job = path.join(directory, 'job.json');
    await fs.rm(path.join(directory, 'ready'), { force: true });
    await fs.rm(path.join(directory, 'result.json'), { force: true });
    await fs.copyFile(path.join(appRoot, 'install-update.ps1'), script);
    await fs.copyFile(path.join(appRoot, 'UpdateProgress.ps1'), path.join(directory, 'UpdateProgress.ps1'));
    await fs.writeFile(job, JSON.stringify({ version: 1, pid, target, sha256: release.sha256, size: release.size, presentation }));
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    // Start-Process gives PowerShell its own hidden Windows console and lifetime.
    // DETACHED_PROCESS can skip script execution; a directly attached child can die with Electron.
    const literal = value => "'" + value.replaceAll("'", "''") + "'";
    const argumentsText = `-NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "${script}" -Job "${job}"`;
    const bootstrap = `$ErrorActionPreference='Stop'; $helper=Start-Process -FilePath ${literal(powershell)} -ArgumentList ${literal(argumentsText)} -WindowStyle Hidden -PassThru; [Console]::WriteLine($helper.Id)`;
    const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(bootstrap, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    const helperPid = Number(stdout.trim());
    if (!Number.isSafeInteger(helperPid) || helperPid <= 0) throw new Error('Update helper did not start. The app has not been closed.');
    const deadline = Date.now() + 15000;
    try {
      for (;;) {
        try { if (await fs.readFile(path.join(directory, 'ready'), 'utf8') === 'ready') break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        try {
          const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
          if (result.status === 'error') throw new Error(result.message);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (Date.now() > deadline) throw new Error('Update helper did not start. The app has not been closed.');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      try { process.kill(helperPid); } catch (killError) { if (killError.code !== 'ESRCH') console.error('Could not stop the failed update helper:', killError); }
      throw error;
    }
  }
}

module.exports = UpdateLauncher;
