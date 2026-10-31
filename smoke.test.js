'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const failsToStart of [false, true]) {
  test(`smoke isolates portable extraction and cleans up after ${failsToStart ? 'launch errors' : 'failed tests'}`, () => {
    const parentEnv = { TEMP: 'parent-temp', TMP: 'parent-tmp', TMPDIR: 'parent-tmpdir' };
    const childProcess = { argv: ['node', 'smoke.js', 'test-portable.exe'], env: parentEnv };
    const launchError = new Error('Launcher failed to start');
    let folder;
    const context = {
      __dirname,
      process: childProcess,
      require(name) {
        if (name === './core') return { initialData: () => ({}) };
        if (name === 'node:child_process') {
          return {
            spawnSync(executable, args, options) {
              assert.equal(executable, 'test-portable.exe');
              assert.equal(args.join(' '), '--smoke-test');
              folder = options.env.ORBITA_SMOKE_DIR;
              assert.ok(path.isAbsolute(folder));
              assert.ok(fs.existsSync(path.join(folder, 'data', 'workspace.json')));
              for (const key of ['TEMP', 'TMP', 'TMPDIR']) {
                assert.equal(options.env[key], folder);
                assert.notEqual(options.env[key], parentEnv[key]);
              }
              return failsToStart ? { error: launchError } : { status: 19 };
            }
          };
        }
        return require(name);
      }
    };
    const run = () => vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'smoke.js'), 'utf8'), context);
    if (failsToStart) assert.throws(run, error => error === launchError);
    else {
      run();
      assert.equal(childProcess.exitCode, 19);
    }
    assert.ok(folder);
    assert.equal(fs.existsSync(folder), false);
    assert.deepEqual(parentEnv, { TEMP: 'parent-temp', TMP: 'parent-tmp', TMPDIR: 'parent-tmpdir' });
  });
}
