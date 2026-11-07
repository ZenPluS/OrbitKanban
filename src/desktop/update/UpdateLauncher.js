'use strict';
// Starts the hidden PowerShell helper (install-update.ps1) that replaces the portable executable after the app exits.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

class UpdateLauncher {
  static async launchInstaller({ directory, target, release }, { appRoot = __dirname, pid = process.pid } = {}) {
    const script = path.join(directory, 'install.ps1'), job = path.join(directory, 'job.json');
    await fs.rm(path.join(directory, 'ready'), { force: true });
    await fs.copyFile(path.join(appRoot, 'install-update.ps1'), script);
    await fs.writeFile(job, JSON.stringify({ version: 1, pid, target, sha256: release.sha256, size: release.size }));
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    // Start-Process gives PowerShell its own hidden Windows console and lifetime.
    // DETACHED_PROCESS can skip script execution; a directly attached child can die with Electron.
    const literal = value => "'" + value.replaceAll("'", "''") + "'";
    const argumentsText = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" -Job "${job}"`;
    const bootstrap = `$ErrorActionPreference='Stop'; $helper=Start-Process -FilePath ${literal(powershell)} -ArgumentList ${literal(argumentsText)} -WindowStyle Hidden -PassThru; [Console]::WriteLine($helper.Id)`;
    const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(bootstrap, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    const helperPid = Number(stdout.trim());
    if (!Number.isSafeInteger(helperPid) || helperPid <= 0) throw new Error('Update helper did not start. The app has not been closed.');
    const deadline = Date.now() + 15000;
    try {
      for (;;) {
        try { if (await fs.readFile(path.join(directory, 'ready'), 'utf8') === 'ready') break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
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
