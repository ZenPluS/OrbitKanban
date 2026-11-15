'use strict';
// Repeatable desktop benchmarks, always using a separate synthetic portable workspace.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { DataFactory } = require('../src/shared/domain');

class PerformanceRunner {
  static run() {
    const { values } = parseArgs({ options: {
      tasks: { type: 'string', default: '1000' }, runs: { type: 'string', default: '3' },
      executable: { type: 'string' }, profile: { type: 'boolean', default: false }, sidebar: { type: 'boolean', default: false }
    } });
    const count = Number(values.tasks), runs = Number(values.runs);
    if (!Number.isInteger(count) || count < 10 || count > 10000 || !Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('Use --tasks 10..10000 and --runs 1..10.');
    const executable = values.executable ? path.resolve(values.executable) : require('electron');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitkanban-performance-')), reports = [];
    try {
      fs.mkdirSync(path.join(folder, 'data'));
      const data = DataFactory.baseData('en');
      data.tasks = Array.from({ length: count }, (_, i) => ({
        id: `perf-task-${i}`, code: `PERF-${i}`, sequence: i + 1,
        description: `<p>Activity ${i}: ${i % 7 === 0 ? 'deployment' : 'maintenance'} planning and verification</p>`,
        notes: `<p>Notes for activity ${i}</p>`, hidden: false, highlightId: '', tagIds: [],
        statusId: data.settings.statuses[i % data.settings.statuses.length].id,
        urgencyId: data.settings.urgencies[i % data.settings.urgencies.length].id,
        effortHours: i % 16, releaseDate: `2027-01-${String(i % 28 + 1).padStart(2, '0')}`
      }));
      data.issues = data.tasks.map((task, i) => ({ id: `perf-issue-${i}`, code: task.code, incident: `INC-${i}`, problem: `PRB-${Math.floor(i / 3)}` }));
      fs.writeFileSync(path.join(folder, 'data', 'workspace.json'), JSON.stringify(data));
      for (let run = 0; run < runs; run++) {
        fs.rmSync(path.join(folder, 'performance-result.json'), { force: true });
        const args = [...(values.executable ? [] : ['.']), '--performance-test'];
        const child = spawnSync(executable, args, {
          cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 180000,
          env: { ...process.env, ORBITA_PERFORMANCE_DIR: folder, ORBITA_PERFORMANCE_STARTED: String(Date.now()), ORBITA_PERFORMANCE_PROFILE: values.profile ? '1' : '', ORBITA_PERFORMANCE_SIDEBAR: values.sidebar ? '1' : '', TEMP: folder, TMP: folder, TMPDIR: folder }
        });
        if (child.error) throw child.error;
        if (child.status !== 0) throw new Error(`Performance run failed (exit code ${child.status}, signal ${child.signal || 'none'}): ${child.stderr}\n${child.stdout}`);
        const report = JSON.parse(fs.readFileSync(path.join(folder, 'performance-result.json'), 'utf8'));
        const required = ['electronReady', 'languagesReady', 'packsReady', 'archiveReady', 'servicesReady', 'rendererReady', 'launchToReady', 'searchFirst', 'searchRepeat', 'searchClear', 'sort', 'openTask', 'saveTask'];
        if (!report.ok || report.tasks !== count || !required.every(key => Number.isFinite(report.metrics?.[key]) && report.metrics[key] >= 0)) throw new Error('Incomplete performance report.');
        reports.push(report);
      }
      const median = samples => {
        const sorted = [...samples].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      };
      const metrics = Object.fromEntries(Object.keys(reports[0].metrics).map(key => [key, Math.round(median(reports.map(report => report.metrics[key])) * 10) / 10]));
      console.log(JSON.stringify({ tasks: count, runs, units: 'milliseconds', metrics, reports }, null, 2));
    } finally { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  }
}
try { PerformanceRunner.run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
