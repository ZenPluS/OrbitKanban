'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { initialData, validateArchive } = require('./core');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita-smoke-run-'));
const executable = process.argv[2] || require('electron');
const args = process.argv[2] ? ['--smoke-test'] : ['.', '--smoke-test'];
let exitCode = 1;
try {
  fs.mkdirSync(path.join(folder, 'data'));
  fs.writeFileSync(path.join(folder, 'data', 'workspace.json'), JSON.stringify(initialData()));
  fs.mkdirSync(path.join(folder, 'data', 'languages'));
  fs.writeFileSync(path.join(folder, 'data', 'languages', 'de.json'), JSON.stringify({ format: 'orbitkanban-language', version: 1, code: 'de', name: 'Deutsch', locale: 'de-DE', messages: { Settings: 'Einstellungen', 'Save settings': 'Einstellungen speichern' } }));
  fs.writeFileSync(path.join(folder, 'data', 'languages', 'broken.json'), '{ broken');
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
  if (exitCode === 0) {
    const report = JSON.parse(fs.readFileSync(path.join(folder, 'smoke-result.json'), 'utf8'));
    if (!report.ok || report.checks.length < 506) throw new Error('Smoke test report is incomplete.');
    const stored = validateArchive(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'workspace.json'), 'utf8')));
    if (stored.organizations.length !== 2 || !stored.organizations.every(o => o.data.settings.logo.startsWith('data:image/png;base64,'))) throw new Error('Multi-organization archive is incomplete.');
    const template = fs.readFileSync(path.join(folder, 'data', 'languages', 'en.template.json'));
    if (!template.equals(fs.readFileSync(path.join(__dirname, 'languages', 'en.json')))) throw new Error('English language template was not written to the languages folder.');
    console.log(`Verified on-disk archive and backup: ${report.checks.length} UI checks passed.`);
  }
} finally {
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
process.exitCode = exitCode;
