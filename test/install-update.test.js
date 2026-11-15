'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const quote = text => "'" + text.replaceAll("'", "''") + "'";
const UpdateLauncher = require('../src/desktop/update/UpdateLauncher');

test('update handoff uses the selected theme and accepts readiness only inside this portable update folder', () => {
  const settings = { themeId: 'custom', themes: [{ id: 'custom', background: '#ffffff', surface: '#eeeeee', text: '#222222', accent: '#0055aa' }] };
  const presentation = UpdateLauncher.presentation(settings, text => `translated: ${text}`);
  assert.equal(presentation.colors.background, '#ffffff');
  assert.equal(presentation.colors.accent, '#0055aa');
  assert.equal(presentation.text.starting, 'translated: Starting OrbitKanban…');
  const root = path.resolve('portable'), file = path.join(root, 'data', 'updates', randomUUID(), 'app-ready');
  assert.equal(UpdateLauncher.readyFile(file, root), file);
  for (const candidate of [path.join(root, 'app-ready'), path.join(root, 'data', 'updates', 'other', 'app-ready'), file + '.exe', 'app-ready', path.join(path.dirname(root), 'other', 'data', 'updates', randomUUID(), 'app-ready')]) {
    assert.equal(UpdateLauncher.readyFile(candidate, root), null);
  }
});

test('the standalone update window uses theme colors and remains open until readiness or an explicit error dismissal', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const presentation = UpdateLauncher.presentation({ themeId: 'light', themes: [{ id: 'light', background: '#f0f0f0', surface: '#ffffff', text: '#222222', accent: '#0055aa' }] });
  const script = `
    $ErrorActionPreference='Stop'
    Set-StrictMode -Version 3.0
    . ${quote(path.join(ROOT, 'src', 'desktop', 'update', 'UpdateProgress.ps1'))}
    $presentation = ${quote(JSON.stringify(presentation))} | ConvertFrom-Json
    $script:progressWindow = New-UpdateProgress $presentation
    try {
      Invoke-ProgressEvents
      if ($script:progressWindow.FindName('Card').Background.ToString() -ne '#FFF0F0F0') { throw 'Wrong background' }
      if ($script:progressWindow.FindName('Progress').Foreground.ToString() -ne '#FF0055AA') { throw 'Wrong accent' }
      $script:progressWindow.Close()
      if (-not $script:progressWindow.IsVisible) { throw 'Progress was dismissed during installation' }
      Update-ProgressWindow $presentation.text.starting
      if ($script:progressWindow.FindName('Status').Text -ne $presentation.text.starting) { throw 'Restart feedback missing' }
      Update-ProgressWindow $presentation.text.failed 'Expected test failure' -Failure
      if ($script:progressWindow.FindName('CloseAction').Visibility -ne 'Visible') { throw 'No error recovery action' }
      $script:progressWindow.FindName('CloseAction').RaiseEvent((New-Object Windows.RoutedEventArgs ([Windows.Controls.Button]::ClickEvent)))
      if ($script:progressWindow.IsVisible) { throw 'Error cannot be dismissed' }
    } finally { $script:progressWindow.Tag=$true; $script:progressWindow.Close() }
  `;
  await run(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 15000, windowsHide: true });
});

for (const slowRenderer of [false, true]) {
test(`Electron restart acknowledges the helper only after a visible renderer: ${slowRenderer ? 'late readiness after startup timeout' : 'normal startup'}`, { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-restart-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const directory = path.join(root, 'data', 'updates', randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const marker = path.join(directory, 'app-ready'), entry = path.join(root, 'restart.cjs');
  await fs.writeFile(entry, `
    const fs = require('node:fs');
    const { app, ipcMain } = require('electron');
    const schedule = setTimeout;
    if (${slowRenderer}) global.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 15000 ? 500 : delay, ...args);
    const DesktopApplication = require(${JSON.stringify(path.join(ROOT, 'src', 'desktop', 'DesktopApplication'))});
    const application = new DesktopApplication({ appRoot: ${JSON.stringify(ROOT)} });
    application.appReady.then(reason => {
      if (reason !== ${JSON.stringify(slowRenderer ? 'timeout' : 'renderer')} || fs.existsSync(${JSON.stringify(marker)})) { console.error('Premature restart acknowledgment: ' + reason); app.exit(1); return; }
      const deadline = Date.now() + 10000;
      const timer = setInterval(() => {
        if (fs.existsSync(${JSON.stringify(marker)})) {
          clearInterval(timer);
          if (!application.window.isVisible()) { console.error('Restart window is not visible'); app.exit(1); }
          else app.quit();
        } else if (Date.now() > deadline) { console.error('Restart acknowledgment missing'); app.exit(1); }
      }, 20);
    });
    application.start();
    if (${slowRenderer}) {
      const ready = ipcMain.listeners('app-ready').at(-1);
      ipcMain.removeListener('app-ready', ready);
      ipcMain.on('app-ready', event => schedule(() => ready(event), 1500));
    }
  `);
  await run(require('electron'), [entry], {
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: root, [UpdateLauncher.READY_VARIABLE]: marker },
    timeout: 20000, windowsHide: true
  });
  assert.equal(await fs.readFile(marker, 'utf8'), 'ready');
});
}

test('Windows update helper replaces only the unlocked launcher, restarts it and preserves data', { skip: process.platform !== 'win32', timeout: 45000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "orbit update's test-\u00e9-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const stub = path.join(root, 'stub.exe'), helper = path.join(ROOT, 'src', 'desktop', 'update', 'install-update.ps1');
  const source = 'using System; using System.IO; public class Program { public static void Main() { File.WriteAllText(Environment.GetCommandLineArgs()[0] + ".started", "started"); var ready = Environment.GetEnvironmentVariable("ORBITKANBAN_UPDATE_READY"); if (!String.IsNullOrEmpty(ready)) { System.Threading.Thread.Sleep(1200); File.WriteAllText(ready, "ready"); } } }';
  await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ${quote(source)} -OutputAssembly ${quote(stub)} -OutputType WindowsApplication`]);
  const bytes = await fs.readFile(stub), digest = createHash('sha256').update(bytes).digest('hex');
  const target = path.join(root, "Orbit's Portable.exe"), data = path.join(root, 'data');
  await fs.mkdir(data);
  await fs.writeFile(path.join(data, 'workspace.json'), 'preserve this archive exactly');
  for (const corrupt of [true, false]) {
    const directory = path.join(data, 'updates', randomUUID());
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(target, 'old launcher bytes');
    await fs.writeFile(path.join(directory, 'OrbitKanban-Portable.exe'), corrupt ? Buffer.from('MZ invalid') : bytes);
    // Holds the target open as the portable launcher would, then releases it.
    const releaseParent = path.join(directory, 'release-parent');
    const hold = corrupt ? 'Start-Sleep -Milliseconds 1200' : `$deadline=[DateTime]::UtcNow.AddSeconds(20); while(-not [IO.File]::Exists(${quote(releaseParent)}) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }`;
    const parent = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command',
      `$file=[IO.File]::Open(${quote(target)},'Open','Read','Read'); [IO.File]::WriteAllText(${quote(path.join(directory, 'locked'))},'locked'); ${hold}; $file.Dispose()`],
    { stdio: 'ignore', windowsHide: true });
    const parentExit = new Promise(resolve => parent.once('exit', resolve));
    for (let i = 0; i < 100; i++) {
      try { await fs.access(path.join(directory, 'locked')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const job = path.join(directory, 'job.json');
    if (corrupt) {
      await fs.writeFile(job, JSON.stringify({ version: 1, pid: parent.pid, target, size: bytes.length, sha256: digest }));
      const execution = run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Job', job, '-ReportOnly'], { timeout: 15000 });
      await assert.rejects(execution, /checksum or size/);
      assert.equal(await fs.readFile(target, 'utf8'), 'old launcher bytes');
      assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')).status, 'error');
    } else {
      // The app process must be able to exit while its hidden helper keeps running.
      await run(process.execPath, ['-e',
        'require(process.argv[1]).launchInstaller(JSON.parse(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });',
        path.join(ROOT, 'src', 'desktop', 'update', 'UpdateLauncher.js'), JSON.stringify({ directory, target, release: { size: bytes.length, sha256: digest } })
      ], { timeout: 15000 });
      assert.equal(await fs.readFile(target, 'utf8'), 'old launcher bytes', 'installation must wait for the running app');
      await fs.writeFile(releaseParent, 'exit');
      for (let i = 0; i < 200; i++) {
        try { await fs.access(path.join(directory, 'result.json')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.deepEqual(await fs.readFile(target), bytes);
      assert.equal(await fs.readFile(path.join(directory, 'previous.exe'), 'utf8'), 'old launcher bytes');
      for (let i = 0; i < 100; i++) {
        try { await fs.access(target + '.started'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(await fs.readFile(target + '.started', 'utf8'), 'started');
      assert.equal(await fs.readFile(path.join(directory, 'app-ready'), 'utf8'), 'ready');
      assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')).status, 'installed');
    }
    await parentExit;
    assert.equal(await fs.readFile(path.join(data, 'workspace.json'), 'utf8'), 'preserve this archive exactly');
  }
});
