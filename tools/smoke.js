'use strict';
// Runs the in-app smoke tests against an isolated portable data folder: node tools/smoke.js [portable.exe]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { DataFactory, ArchiveValidator } = require('../src/shared/domain');

class SmokeRunner {
  static #MIN_CHECKS = 510;
  static #ROOT = path.join(__dirname, '..');

  static #seed(folder) {
    fs.mkdirSync(path.join(folder, 'data'));
    fs.writeFileSync(path.join(folder, 'data', 'workspace.json'), JSON.stringify(DataFactory.initialData()));
    fs.mkdirSync(path.join(folder, 'data', 'languages'));
    fs.writeFileSync(path.join(folder, 'data', 'languages', 'de.json'), JSON.stringify({ format: 'orbitkanban-language', version: 1, code: 'de', name: 'Deutsch', locale: 'de-DE', messages: { Settings: 'Einstellungen', 'Save settings': 'Einstellungen speichern' } }));
    fs.writeFileSync(path.join(folder, 'data', 'languages', 'broken.json'), '{ broken');
  }

  static #verify(folder) {
    const report = JSON.parse(fs.readFileSync(path.join(folder, 'smoke-result.json'), 'utf8'));
    if (!report.ok || report.checks.length < SmokeRunner.#MIN_CHECKS) throw new Error('Smoke test report is incomplete.');
    const stored = ArchiveValidator.validateArchive(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'workspace.json'), 'utf8')));
    if (stored.organizations.length !== 2 || !stored.organizations.every(o => o.data.settings.logo.startsWith('data:image/png;base64,'))) throw new Error('Multi-organization archive is incomplete.');
    const template = fs.readFileSync(path.join(folder, 'data', 'languages', 'en.template.json'));
    if (!template.equals(fs.readFileSync(path.join(SmokeRunner.#ROOT, 'languages', 'en.json')))) throw new Error('English language template was not written to the languages folder.');
    console.log(`Verified on-disk archive and backup: ${report.checks.length} UI checks passed.`);
  }

  static run(portable) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-smoke-run-'));
    const executable = portable || require('electron');
    const args = portable ? ['--smoke-test'] : ['.', '--smoke-test'];
    let exitCode = 1;
    try {
      SmokeRunner.#seed(folder);
      const result = spawnSync(executable, args, {
        stdio: 'inherit',
        // Isolate the launcher's extraction and helper files as well as application data.
        env: { ...process.env, ORBITA_SMOKE_DIR: folder, TEMP: folder, TMP: folder, TMPDIR: folder },
        timeout: 120000
      });
      if (result.error) throw result.error;
      exitCode = result.status ?? 1;
      if (exitCode !== 0 && fs.existsSync(path.join(folder, 'smoke-error.json'))) {
        throw new Error(JSON.parse(fs.readFileSync(path.join(folder, 'smoke-error.json'), 'utf8')).error);
      }
      if (exitCode === 0) SmokeRunner.#verify(folder);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
    return exitCode;
  }
}

process.exitCode = SmokeRunner.run(process.argv[2]);