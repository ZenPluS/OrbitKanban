'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AttachmentStore = require('../src/desktop/storage/AttachmentStore');

test('attachments are copied into task-code folders, listed from disk, and isolated by organization and task', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbitkanban-attachments-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const dataFolder = path.join(folder, 'data'), sourceFolder = path.join(folder, 'source');
  await fs.mkdir(sourceFolder, { recursive: true });
  const store = new AttachmentStore({ dataFolder });
  const task = { id: 'task-1', code: 'OPS/100' }, source = path.join(sourceFolder, 'report.PDF');
  await fs.writeFile(source, 'portable document');

  const files = await store.addPaths('organization-1', task, [source]);
  assert.deepEqual(files.map(file => [file.name, file.extension, file.size]), [['report.PDF', 'pdf', 17]]);
  assert.equal(await fs.readFile(source, 'utf8'), 'portable document');
  const organizationKey = crypto.createHash('sha256').update('organization-1').digest('hex');
  const taskKey = crypto.createHash('sha256').update('task-1').digest('hex');
  const taskFolder = path.join(dataFolder, 'attachments', organizationKey, taskKey);
  assert.deepEqual(await fs.readdir(taskFolder), ['OPS_100']);
  const copied = await store.openPath('organization-1', task, 'report.PDF');
  assert.equal(await fs.readFile(copied, 'utf8'), 'portable document');

  assert.equal((await store.list('organization-1', { id: 'another-task', code: task.code })).length, 0);
  assert.equal((await store.list('another-organization', task)).length, 0);
  assert.equal((await store.counts('organization-1', [task]))['task-1'], 1);
});

test('same-name uploads are preserved and renaming a task code moves its folder', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbitkanban-attachments-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const dataFolder = path.join(folder, 'data'), source = path.join(folder, 'notes.txt');
  await fs.writeFile(source, 'first');
  const store = new AttachmentStore({ dataFolder }), task = { id: 'task-2', code: 'OPS-1' };
  await store.addPaths('organization', task, [source]);
  await fs.writeFile(source, 'second');
  assert.deepEqual((await store.addPaths('organization', task, [source])).map(file => file.name), ['notes (2).txt', 'notes.txt']);
  task.code = 'OPS-2';
  const files = await store.list('organization', task);
  assert.deepEqual(files.map(file => file.name), ['notes (2).txt', 'notes.txt']);
  const organizationKey = crypto.createHash('sha256').update('organization').digest('hex');
  const taskKey = crypto.createHash('sha256').update('task-2').digest('hex');
  const taskFolder = path.join(dataFolder, 'attachments', organizationKey, taskKey);
  assert.deepEqual(await fs.readdir(taskFolder), ['OPS-2']);
  assert.deepEqual(await store.remove('organization', task, 'notes.txt'), [files[0]]);
  const remainingPath = await store.openPath('organization', task, 'notes (2).txt');
  await fs.unlink(remainingPath);
  assert.deepEqual(await store.list('organization', task), []);
  await assert.rejects(store.openPath('organization', task, 'notes (2).txt'), /no longer exists/i);
});

test('attachment inputs reject unsupported types, directories, invalid names and excessive files', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbitkanban-attachments-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'bad.exe'), dir = path.join(folder, 'folder');
  await fs.writeFile(file, 'not supported');
  await fs.mkdir(dir);
  const store = new AttachmentStore({ dataFolder: path.join(folder, 'data') });
  const task = { id: 'task-3', code: 'OPS-3' };
  await assert.rejects(store.addPaths('organization', task, [file]), /unsupported attachment type/i);
  await assert.rejects(store.addPaths('organization', task, [dir]), /unsupported attachment type/i);
  await assert.rejects(store.addBuffer('organization', task, '../escape.exe', Buffer.from('bad')), /unsupported attachment type/i);
  await assert.rejects(store.addPaths('organization', task, Array(21).fill(file)), /between 1 and 20/i);
});
