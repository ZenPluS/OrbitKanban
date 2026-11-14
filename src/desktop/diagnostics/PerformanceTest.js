'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

class PerformanceTest {
  static async run(application) {
    const { window: win, root, store } = application;
    try {
      if (await application.appReady !== 'renderer') throw new Error('The performance workspace did not become ready.');
      const profile = process.env.ORBITA_PERFORMANCE_PROFILE === '1';
      if (profile) {
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Profiler.enable');
        await win.webContents.debugger.sendCommand('Profiler.start');
      }
      const result = await win.webContents.executeJavaScript(`(async () => {
        const metrics = {};
        const layout = () => document.querySelector('#content').getBoundingClientRect();
        const measure = async (name, action) => {
          const start = performance.now();
          await action();
          layout();
          metrics[name] = performance.now() - start;
        };
        const search = value => {
          const input = document.querySelector('#search');
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        layout();
        await measure('searchFirst', () => search('deployment'));
        await measure('searchRepeat', () => search('maintenance'));
        await measure('searchClear', () => search(''));
        await measure('sort', () => document.querySelector('[data-sort="sequence"]').click());
        const taskId = document.querySelector('[data-edit-task]').dataset.editTask;
        await measure('openTask', () => document.querySelector('[data-edit-task]').click());
        const revision = window.smokeState().revision;
        const notes = '<p>Performance check ' + Date.now() + '</p>';
        document.querySelector('#notes-editor').innerHTML = notes;
        await measure('saveTask', async () => {
          document.querySelector('#task-form').requestSubmit();
          const deadline = performance.now() + 30000;
          while (window.smokeState().revision === revision || window.smokeState().saving || document.querySelector('#modal').open) {
            if (performance.now() > deadline) throw new Error('Performance save timed out: ' + document.querySelector('#toast').textContent);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        });
        return { metrics, taskId, notes };
      })()`);
      const saved = await store.load();
      if (saved.data.tasks.find(task => task.id === result.taskId)?.notes !== result.notes) throw new Error('The performance edit was not persisted.');
      const report = { ok: true, tasks: saved.data.tasks.length, metrics: { ...application.startupTimings, ...result.metrics } };
      if (profile) {
        const { profile: cpu } = await win.webContents.debugger.sendCommand('Profiler.stop');
        report.cpu = cpu.nodes.filter(node => node.hitCount).sort((a, b) => b.hitCount - a.hitCount).slice(0, 20).map(node => ({
          name: node.callFrame.functionName, file: node.callFrame.url.split('/').slice(-2).join('/'), samples: node.hitCount
        }));
        win.webContents.debugger.detach();
      }
      await fs.writeFile(path.join(root, 'performance-result.json'), JSON.stringify(report, null, 2));
      require('electron').app.exit(0);
    } catch (error) {
      console.error(error);
      require('electron').app.exit(1);
    }
  }
}
module.exports = PerformanceTest;
