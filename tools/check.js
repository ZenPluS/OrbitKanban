'use strict';
// Syntax-checks every script of the app and its tools: node tools/check.js
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

class SyntaxCheck {
  static #ROOT = path.join(__dirname, '..');
  static #FOLDERS = ['src', 'tools'];
  // The renderer is loaded as ES modules; node --check would accept broken ones as ambiguous input, so they go through stdin as modules.
  static #MODULES = path.join(SyntaxCheck.#ROOT, 'src', 'renderer');

  static *#scripts(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) yield* SyntaxCheck.#scripts(file);
      else if (entry.name.endsWith('.js')) yield file;
    }
  }

  static #check(file) {
    const module = file.startsWith(SyntaxCheck.#MODULES + path.sep);
    const result = module
      ? spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file), encoding: 'utf8' })
      : spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status === 0) return true;
    console.error(`${path.relative(SyntaxCheck.#ROOT, file)}\n${result.stderr || result.error}`);
    return false;
  }

  static run() {
    let files = 0, failed = 0;
    for (const folder of SyntaxCheck.#FOLDERS) {
      for (const file of SyntaxCheck.#scripts(path.join(SyntaxCheck.#ROOT, folder))) {
        files++;
        if (!SyntaxCheck.#check(file)) failed++;
      }
    }
    console.log(`Checked ${files} scripts${failed ? `, ${failed} failed` : ''}.`);
    return failed ? 1 : 0;
  }
}

process.exitCode = SyntaxCheck.run();