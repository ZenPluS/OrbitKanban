'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { baseData, parseOrganizationFile, importedOrganizationData } = require('./core');
const { createWorkspaceStore, revisionOf } = require('./workspace-store');

async function tempStore(options = {}) {
  const dataFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbitkanban-store-'));
  const store = createWorkspaceStore({ dataFolder, seed: () => baseData('it'), ...options });
  return { store, dataFolder, cleanup: () => fs.rm(dataFolder, { recursive: true, force: true }) };
}
const task = (data, code) => ({ id: `task-${code}`, code, sequence: data.tasks.length + 1, url: '', description: '', urgencyId: data.settings.urgencies[0].id, statusId: data.settings.statuses[0].id, effortHours: 4, releaseDate: '', notes: '', hidden: false });

test('first load seeds a portable archive and exposes revision and client metadata', async () => {
  const { store, dataFolder, cleanup } = await tempStore({ extras: () => ({ appVersion: '9.9.9' }) });
  try {
    const snapshot = await store.load();
    const archive = JSON.parse(await fs.readFile(path.join(dataFolder, 'workspace.json'), 'utf8'));
    assert.equal(archive.version, 2);
    assert.equal(snapshot.appVersion, '9.9.9');
    assert.equal(snapshot.activeOrganizationId, archive.activeOrganizationId);
    assert.equal(snapshot.revision, revisionOf(archive.organizations[0]));
    assert.equal(snapshot.organizations.length, 1);
    const backups = await store.listBackups();
    assert.equal(backups.retention, 14);
    assert.equal(backups.backups.length, 1);
    assert.match(backups.backups[0].fileName, /^\d{4}-\d{2}-\d{2}-workspace\.json$/);
  } finally { await cleanup(); }
});
test('daily backups preserve the pre-change archive and restore without losing the current backup', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const loaded = await store.load(), backup = (await store.listBackups()).backups[0];
    loaded.data.tasks.push(task(loaded.data, 'BACKUP-1'));
    const saved = await store.save(loaded.data, loaded.activeOrganizationId, undefined, loaded.revision);
    assert.equal((await store.listBackups()).backups[0].fileName, backup.fileName);
    const restored = await store.restoreBackup(backup.fileName);
    assert.equal(restored.data.tasks.length, 0);
    assert.equal(restored.activeOrganizationId, loaded.activeOrganizationId);
    const currentBackup = JSON.parse(await fs.readFile(`${store.dataFile}.bak`, 'utf8'));
    assert.deepEqual(currentBackup.organizations[0].data.tasks.map(item => item.code), ['BACKUP-1']);
    assert.notEqual(saved.revision, restored.revision);
    assert.deepEqual((await store.listBackups()).backups.map(item => item.fileName), [backup.fileName]);
  } finally { await cleanup(); }
});
test('daily backup retention removes only the oldest named snapshots', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const folder = path.join(dataFolder, 'backups');
    await fs.mkdir(folder, { recursive: true });
    for (let day = 1; day <= 16; day++) {
      const date = new Date(Date.UTC(2000, 0, day)).toISOString().slice(0, 10);
      await fs.writeFile(path.join(folder, `${date}-workspace.json`), '{}');
    }
    const listing = await store.listBackups();
    assert.equal(listing.backups.length, listing.retention);
    assert.equal(listing.backups[0].fileName, `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}-workspace.json`);
    assert.ok(!listing.backups.some(item => ['2000-01-01-workspace.json', '2000-01-02-workspace.json', '2000-01-03-workspace.json'].includes(item.fileName)));
  } finally { await cleanup(); }
});
test('backup restore rejects path traversal and corrupt archives without changing workspace data', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const loaded = await store.load(), before = await fs.readFile(store.dataFile, 'utf8');
    await assert.rejects(store.restoreBackup('..\\workspace.json'), /Backup selezionato non valido/);
    const corrupt = '2001-02-03-workspace.json';
    await fs.writeFile(path.join(dataFolder, 'backups', corrupt), '{broken', 'utf8');
    await assert.rejects(store.restoreBackup(corrupt), { code: 'unreadable' });
    assert.equal(await fs.readFile(store.dataFile, 'utf8'), before);
    assert.equal((await store.load()).revision, loaded.revision);
  } finally { await cleanup(); }
});

test('theme catalog upgrade is persisted once with backup and preserves personal palettes', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const data = baseData();
    data.settings.themes = data.settings.themes.filter(theme => theme.id === 'everforest');
    data.settings.themes.push({ id: 'organization-logo', name: 'Personal', background: '#111111', surface: '#222222', text: '#ffffff', accent: '#aabbcc' });
    data.settings.themeId = 'everforest';
    const original = JSON.stringify({ version: 2, activeOrganizationId: 'one', organizations: [{ id: 'one', name: 'Main', data }] });
    await fs.writeFile(store.dataFile, original);
    const loaded = await store.load();
    assert.equal(loaded.data.settings.themes.length, 41);
    assert.equal(loaded.data.settings.themeId, 'everforest');
    assert.deepEqual(loaded.data.settings.themes.slice(0, 2), data.settings.themes);
    assert.equal(await fs.readFile(`${store.dataFile}.bak`, 'utf8'), original);
    const persisted = await fs.readFile(store.dataFile, 'utf8');
    const reopened = createWorkspaceStore({ dataFolder });
    assert.deepEqual(await reopened.load(), loaded);
    assert.equal(await fs.readFile(store.dataFile, 'utf8'), persisted);
    assert.equal(await fs.readFile(`${store.dataFile}.bak`, 'utf8'), original);
    const saved = await reopened.save(loaded.data, loaded.activeOrganizationId, undefined, loaded.revision);
    assert.deepEqual(saved.data.settings.themes, loaded.data.settings.themes);
  } finally { await cleanup(); }
});

test('saves need the current revision so stale clients cannot overwrite newer data', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const first = await store.load(), second = await store.load();
    first.data.tasks.push(task(first.data, 'A-1'));
    const saved = await store.save(first.data, first.activeOrganizationId, undefined, first.revision);
    assert.notEqual(saved.revision, first.revision);
    second.data.tasks.push(task(second.data, 'B-1'));
    await assert.rejects(store.save(second.data, second.activeOrganizationId, undefined, second.revision), { code: 'conflict' });
    await assert.rejects(store.save(second.data, second.activeOrganizationId), { code: 'conflict' });
    const stored = JSON.parse(await fs.readFile(path.join(dataFolder, 'workspace.json'), 'utf8'));
    assert.deepEqual(stored.organizations[0].data.tasks.map(t => t.code), ['A-1']);
    const backup = JSON.parse(await fs.readFile(path.join(dataFolder, 'workspace.json.bak'), 'utf8'));
    assert.equal(backup.organizations[0].data.tasks.length, 0);
  } finally { await cleanup(); }
});

test('each client can work on a different organization without changing the others', async () => {
  const { store, cleanup } = await tempStore();
  try {
    const main = await store.load();
    const created = await store.organization('create', { name: 'Second', language: 'en', demo: true }, main.activeOrganizationId);
    assert.equal(created.organizations.length, 2);
    assert.ok(created.data.tasks.length > 200);
    const browserTab = await store.load(created.activeOrganizationId), desktop = await store.load(main.activeOrganizationId);
    assert.equal(browserTab.data.settings.language, 'en');
    assert.equal(desktop.activeOrganizationId, main.activeOrganizationId);
    assert.equal(desktop.defaultOrganizationId, created.activeOrganizationId);
    const fallback = await store.load('missing');
    assert.equal(fallback.activeOrganizationId, created.activeOrganizationId);
    desktop.data.tasks.push(task(desktop.data, 'D-1'));
    await store.save(desktop.data, desktop.activeOrganizationId, undefined, desktop.revision);
    assert.equal((await store.load(created.activeOrganizationId)).revision, browserTab.revision);
  } finally { await cleanup(); }
});

test('changes are announced with revisions only and deleted organizations fall back safely', async () => {
  const { store, cleanup } = await tempStore();
  try {
    const main = await store.load();
    const second = await store.organization('create', { name: 'Second', language: 'it' }, main.activeOrganizationId);
    const events = [];
    store.on('change', info => events.push(info));
    second.data.tasks.push(task(second.data, 'S-1'));
    const saved = await store.save(second.data, second.activeOrganizationId, 'Renamed', second.revision);
    assert.equal(events.length, 1);
    assert.deepEqual(Object.keys(events[0]).sort(), ['defaultOrganizationId', 'organizations']);
    assert.deepEqual(events[0].organizations.find(o => o.id === second.activeOrganizationId), { id: second.activeOrganizationId, name: 'Renamed', revision: saved.revision });
    assert.ok(!JSON.stringify(events[0]).includes('S-1'));
    const afterDelete = await store.organization('delete', { id: second.activeOrganizationId }, second.activeOrganizationId);
    assert.equal(afterDelete.activeOrganizationId, main.activeOrganizationId);
    await assert.rejects(store.save(second.data, second.activeOrganizationId, undefined, saved.revision), { code: 'missing-organization' });
    await assert.rejects(store.organization('switch', { id: second.activeOrganizationId }), { code: 'missing-organization' });
    await assert.rejects(store.organization('delete', { id: main.activeOrganizationId }), /almeno/);
  } finally { await cleanup(); }
});

test('invalid saves and unreadable archives never overwrite the portable file', async () => {
  const { store, dataFolder, cleanup } = await tempStore();
  try {
    const snapshot = await store.load();
    await assert.rejects(store.save({ ...snapshot.data, tasks: 'broken' }, snapshot.activeOrganizationId, undefined, snapshot.revision));
    assert.equal((await store.load()).revision, snapshot.revision);
    const file = path.join(dataFolder, 'workspace.json');
    await fs.writeFile(file, '{ corrupt', 'utf8');
    const reopened = createWorkspaceStore({ dataFolder, seed: () => baseData('it') });
    await assert.rejects(reopened.load(), { code: 'unreadable' });
    assert.equal(await fs.readFile(file, 'utf8'), '{ corrupt');
  } finally { await cleanup(); }
});

test('concurrent saves are serialized: exactly one of two racing clients wins', async () => {
  const { store, cleanup } = await tempStore();
  try {
    const snapshot = await store.load();
    const a = structuredClone(snapshot.data), b = structuredClone(snapshot.data);
    a.tasks.push(task(a, 'RACE-A'));
    b.tasks.push(task(b, 'RACE-B'));
    const results = await Promise.allSettled([
      store.save(a, snapshot.activeOrganizationId, undefined, snapshot.revision),
      store.save(b, snapshot.activeOrganizationId, undefined, snapshot.revision)
    ]);
    assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected']);
    assert.equal(results[1].reason.code, 'conflict');
    assert.deepEqual((await store.load()).data.tasks.map(t => t.code), ['RACE-A']);
  } finally { await cleanup(); }
});

test('organizations are exported one part at a time and imported as new organizations with fresh ids', async () => {
  const { store, dataFolder, cleanup } = await tempStore({ extras: () => ({ appVersion: '9.9.9' }) });
  try {
    const main = await store.load();
    main.data.tasks.push(task(main.data, 'EXP-1'));
    const saved = await store.save(main.data, main.activeOrganizationId, 'Àcme Team', main.revision);
    const exported = await store.exportOrganization(main.activeOrganizationId, 'organization');
    assert.match(exported.fileName, /^OrbitKanban-acme-team-organizzazione-\d{4}-\d{2}-\d{2}\.json$/);
    const file = parseOrganizationFile(exported.text);
    assert.deepEqual([file.appVersion, file.organization.name, file.data.tasks.map(t => t.code)], ['9.9.9', 'Àcme Team', ['EXP-1']]);
    assert.match((await store.exportOrganization(main.activeOrganizationId, 'themes')).fileName, /-temi-\d{4}-\d{2}-\d{2}\.json$/);
    await assert.rejects(store.exportOrganization('missing', 'data'), { code: 'missing-organization' });
    await assert.rejects(store.exportOrganization(main.activeOrganizationId, 'backup'), /non supportato/);
    const imported = await store.organization('import', { name: ' Copia ', data: importedOrganizationData(file, { themes: true, settings: true, data: true }) }, main.activeOrganizationId);
    assert.equal(imported.organizations.length, 2);
    assert.notEqual(imported.activeOrganizationId, main.activeOrganizationId);
    assert.equal(imported.organizations.find(o => o.id === imported.activeOrganizationId).name, 'Copia');
    assert.deepEqual(imported.data.tasks.map(t => t.code), ['EXP-1']);
    assert.equal((await store.load(main.activeOrganizationId)).revision, saved.revision);
    const before = await fs.readFile(path.join(dataFolder, 'workspace.json'), 'utf8');
    await assert.rejects(store.organization('import', { name: 'Rotta', data: { ...imported.data, tasks: 'broken' } }, main.activeOrganizationId), /Elenco attività/);
    await assert.rejects(store.organization('import', { name: ' ', data: imported.data }, main.activeOrganizationId), /Nome organizzazione/);
    assert.equal(await fs.readFile(path.join(dataFolder, 'workspace.json'), 'utf8'), before);
  } finally { await cleanup(); }
});
