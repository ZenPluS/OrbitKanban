'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DataFactory, ArchiveValidator, TaskColumns, OrganizationTransfer, Limits } = require('../src/shared/domain');

function taggedOrganization() {
  const data = DataFactory.baseData();
  data.settings.tags = [{ id: 'a', name: 'Frontend', color: '#123456' }, { id: 'b', name: 'Bug', color: '#abcdef' }];
  data.tasks = [{
    id: 'task', code: 'TAG-1', sequence: 1, description: '<b>Task</b>', notes: '', releaseDate: '',
    statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 8,
    hidden: true, tagIds: ['a', 'b']
  }];
  return { id: 'org', name: 'Tags', data };
}
test('older archives gain an empty tag catalog and visible column without changing existing data', () => {
  const original = taggedOrganization().data;
  delete original.settings.tags;
  delete original.tasks[0].tagIds;
  original.settings.taskColumns = TaskColumns.defaultTaskColumns().filter(column => column.id !== 'tags');
  original.settings.taskColumns.find(column => column.id === 'notes').visible = false;
  const saved = structuredClone(original);
  const migrated = ArchiveValidator.migrateArchive(original).organizations[0].data;
  assert.deepEqual(original, saved);
  assert.deepEqual(migrated.settings.tags, []);
  assert.deepEqual(migrated.tasks[0].tagIds, []);
  assert.equal(migrated.tasks[0].description, saved.tasks[0].description);
  assert.equal(migrated.tasks[0].hidden, true);
  assert.equal(migrated.settings.taskColumns.find(column => column.id === 'tags').visible, true);
  assert.equal(migrated.settings.taskColumns.find(column => column.id === 'notes').visible, false);
  assert.deepEqual(ArchiveValidator.migrateArchive(migrated).organizations[0].data, migrated);
});
test('tag catalogs and task selections reject invalid values and duplicates', () => {
  const tag = { id: 'a', name: 'Frontend', color: '#123456' };
  for (const tags of [null, 'tag', [null], [{ ...tag, name: ' ' }], [{ ...tag, color: 'red' }], [{ ...tag, name: 'x'.repeat(Limits.TAG_NAME_MAX + 1) }], [tag, tag], [tag, { ...tag, id: 'b', name: ' FRONTEND ' }], Array.from({ length: Limits.TAG_LIMIT + 1 }, (_, index) => ({ ...tag, id: `t${index}`, name: `T${index}` }))]) {
    const data = DataFactory.baseData();
    data.settings.tags = tags;
    assert.throws(() => ArchiveValidator.validateData(data), /invalid tags|tag names must be unique/i);
  }
  for (const tagIds of [null, 'a', [null], [''], ['a', 'a'], [12], ['x'.repeat(201)]]) {
    const { data } = taggedOrganization();
    data.tasks[0].tagIds = tagIds;
    assert.throws(() => ArchiveValidator.validateData(data), /invalid task tags/i);
  }
});
test('removing a catalog entry prunes only that tag, including hidden tasks', () => {
  const { data } = taggedOrganization();
  data.settings.tags.shift();
  const result = ArchiveValidator.migrateArchive(data).organizations[0].data;
  assert.deepEqual(result.tasks[0].tagIds, ['b']);
  assert.equal(result.tasks[0].hidden, true);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(DataFactory.createOrganization('Separate').data.settings.tags, []);
  assert.ok(DataFactory.demoData().tasks.some(task => task.tagIds.length > 1));
  assert.ok(DataFactory.demoData().tasks.some(task => task.tagIds.length === 0));
});
test('tags round-trip through backups, full organization files and data-only files', () => {
  const organization = taggedOrganization();
  const archive = ArchiveValidator.migrateArchive(organization.data);
  assert.deepEqual(ArchiveValidator.migrateArchive(JSON.parse(JSON.stringify(archive))), archive);
  for (const kind of ['organization', 'data']) {
    const file = OrganizationTransfer.parseOrganizationFile(JSON.stringify(OrganizationTransfer.organizationExport(organization, kind)));
    const result = OrganizationTransfer.importedOrganizationData(file, { themes: true, settings: true, data: true });
    assert.deepEqual(result.settings.tags, organization.data.settings.tags);
    assert.deepEqual(result.tasks[0].tagIds, ['a', 'b']);
    file.data.tags[0].name = 'Changed';
    assert.equal(organization.data.settings.tags[0].name, 'Frontend');
  }
});
test('data import matches tag names and resolves id collisions without relabelling tasks', () => {
  const source = taggedOrganization(), target = DataFactory.baseData();
  target.settings.tags = [{ id: 'a', name: 'Different', color: '#111111' }, { id: 'my-bug', name: ' BUG ', color: '#222222' }];
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(source, 'data'));
  const result = OrganizationTransfer.applyOrganizationImport(target, file, { data: true });
  assert.equal(result.settings.tags.length, 3);
  const frontend = result.settings.tags.find(tag => tag.name === 'Frontend');
  assert.notEqual(frontend.id, 'a');
  assert.deepEqual(result.tasks[0].tagIds, [frontend.id, 'my-bug']);
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(result, file, { data: true }), result);
  assert.equal(target.tasks.length, 0);
});
test('settings import remaps tags while older files preserve current catalog and assignments', () => {
  const organization = taggedOrganization(), current = organization.data;
  const settings = OrganizationTransfer.organizationExport(organization, 'settings');
  settings.settings.tags = [{ id: 'renamed-id', name: 'BUG', color: '#222222' }];
  const result = OrganizationTransfer.applyOrganizationImport(current, OrganizationTransfer.parseOrganizationFile(settings), { settings: true });
  assert.deepEqual(result.tasks[0].tagIds, ['renamed-id']);
  const legacy = OrganizationTransfer.organizationExport(organization, 'organization');
  delete legacy.settings.tags;
  delete legacy.data.tags;
  delete legacy.data.tasks[0].tagIds;
  const parsed = OrganizationTransfer.parseOrganizationFile(legacy);
  const merged = OrganizationTransfer.applyOrganizationImport(current, parsed, { settings: true, data: true });
  assert.deepEqual(merged.settings.tags, current.settings.tags);
  assert.deepEqual(merged.tasks[0].tagIds, ['a', 'b']);
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(current, parsed, { data: true, dataMode: 'replace' }).tasks[0].tagIds, []);
  const explicitEmpty = OrganizationTransfer.organizationExport(organization, 'data');
  explicitEmpty.data.tasks[0].tagIds = [];
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(current, OrganizationTransfer.parseOrganizationFile(explicitEmpty), { data: true }).tasks[0].tagIds, []);
});
test('a full catalog rejects imports instead of silently losing tag assignments', () => {
  const target = DataFactory.baseData();
  target.settings.tags = Array.from({ length: Limits.TAG_LIMIT }, (_, index) => ({ id: `t${index}`, name: `T${index}`, color: '#123456' }));
  const original = structuredClone(target);
  assert.throws(() => OrganizationTransfer.applyOrganizationImport(target, OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(taggedOrganization(), 'data')), { data: true }), /too many tags/i);
  assert.deepEqual(target, original);
});
