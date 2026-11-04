'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const quote = text => "'" + text.replaceAll("'", "''") + "'";

test('Windows update helper replaces only the unlocked launcher, restarts it and preserves data', { skip: process.platform !== 'win32', timeout: 45000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "orbit update's test-\u00e9-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const stub = path.join(root, 'stub.exe'), helper = path.join(__dirname, 'install-update.ps1');
  const source = 'using System; using System.IO; public class Program { public static void Main() { File.WriteAllText(Environment.GetCommandLineArgs()[0] + ".started", "started"); } }';
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
        path.join(__dirname, 'update-launcher.js'), JSON.stringify({ directory, target, release: { size: bytes.length, sha256: digest } })
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
      assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')).status, 'installed');
    }
    await parentExit;
    assert.equal(await fs.readFile(path.join(data, 'workspace.json'), 'utf8'), 'preserve this archive exactly');
  }
});
