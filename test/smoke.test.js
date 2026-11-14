'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const vm = require('node:vm');

for (const failsToStart of [false, true]) {
  test(`smoke isolates portable extraction and cleans up after ${failsToStart ? 'launch errors' : 'failed tests'}`, () => {
    const parentEnv = { TEMP: 'parent-temp', TMP: 'parent-tmp', TMPDIR: 'parent-tmpdir' };
    const childProcess = { argv: ['node', 'tools/smoke.js', 'test-portable.exe'], env: parentEnv };
    const launchError = new Error('Launcher failed to start');
    let folder;
    const context = {
      __dirname,
      process: childProcess,
      require(name) {
        if (name === '../src/shared/domain') return { DataFactory: { initialData: () => ({ settings: {} }) }, ArchiveValidator: {} };
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
    const run = () => vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tools', 'smoke.js'), 'utf8'), context);
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

for (const outcome of ['success', 'launch-error', 'missing-report', 'invalid-metric']) {
  test(`performance runner isolates data, validates results and cleans up: ${outcome}`, () => {
    const parentEnv = { TEMP: 'parent-temp', TMP: 'parent-tmp', TMPDIR: 'parent-tmpdir' };
    const childProcess = { env: parentEnv };
    const messages = [], errors = [];
    let folder, launches = 0;
    const context = {
      __dirname, process: childProcess,
      console: { log: value => messages.push(JSON.parse(value)), error: message => errors.push(message) },
      require(name) {
        if (name === 'node:util') return { parseArgs: () => ({ values: { tasks: '10', runs: '2', executable: 'test-performance.exe', profile: true } }) };
        if (name === '../src/shared/domain') return { DataFactory: { baseData: () => ({ settings: { statuses: [{ id: 'todo' }], urgencies: [{ id: 'normal' }] } }) } };
        if (name === 'node:child_process') return {
          spawnSync(executable, args, options) {
            launches++;
            assert.equal(executable, path.resolve('test-performance.exe'));
            assert.equal(args.join(' '), '--performance-test');
            folder = options.env.ORBITA_PERFORMANCE_DIR;
            assert.ok(path.isAbsolute(folder));
            const data = JSON.parse(fs.readFileSync(path.join(folder, 'data', 'workspace.json'), 'utf8'));
            assert.equal(data.tasks.length, 10);
            assert.equal(data.issues.length, 10);
            for (const key of ['TEMP', 'TMP', 'TMPDIR']) assert.equal(options.env[key], folder);
            assert.equal(options.env.ORBITA_PERFORMANCE_PROFILE, '1');
            assert.ok(Number.isFinite(Number(options.env.ORBITA_PERFORMANCE_STARTED)));
            const output = path.join(folder, 'performance-result.json');
            assert.equal(fs.existsSync(output), false, 'A previous run cannot supply a stale report');
            if (outcome === 'launch-error') return { error: new Error('Launch failed') };
            if (outcome === 'missing-report' && launches === 2) return { status: 0 };
            const metrics = Object.fromEntries(['electronReady', 'languagesReady', 'packsReady', 'archiveReady', 'servicesReady', 'rendererReady', 'launchToReady', 'searchFirst', 'searchRepeat', 'searchClear', 'sort', 'openTask', 'saveTask'].map(key => [key, launches * 10]));
            if (outcome === 'invalid-metric') metrics.saveTask = null;
            fs.writeFileSync(output, JSON.stringify({ ok: true, tasks: 10, metrics }));
            return { status: 0 };
          }
        };
        return require(name);
      }
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'tools', 'performance.js'), 'utf8'), context);
    assert.ok(folder);
    assert.equal(fs.existsSync(folder), false);
    assert.deepEqual(parentEnv, { TEMP: 'parent-temp', TMP: 'parent-tmp', TMPDIR: 'parent-tmpdir' });
    if (outcome === 'success') {
      assert.equal(errors.length, 0);
      assert.equal(messages[0].metrics.saveTask, 15);
      assert.equal(messages[0].reports.length, 2);
    } else {
      assert.equal(childProcess.exitCode, 1);
      assert.equal(messages.length, 0);
      assert.equal(errors.length, 1);
    }
  });
}
