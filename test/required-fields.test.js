'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DataFactory, ArchiveValidator, OrganizationTransfer } = require('../src/shared/domain');
const { RequiredFields, ColumnCleanup } = require('../src/shared/columns');

test('the sequence stays mandatory by default and old workspaces keep that rule', () => {
  const data = DataFactory.baseData('en');
  assert.deepEqual(data.settings.requiredTaskColumns, ['sequence']);
  assert.deepEqual(data.settings.requiredIssueColumns, []);
  delete data.settings.requiredTaskColumns;
  delete data.settings.requiredIssueColumns;
  const migrated = ArchiveValidator.migrateArchive(data).organizations[0].data.settings;
  assert.deepEqual(migrated.requiredTaskColumns, ['sequence']);
  assert.deepEqual(migrated.requiredIssueColumns, []);
});

test('only columns with a value to fill in can be mandatory', () => {
  const settings = DataFactory.baseData('en').settings;
  settings.taskFields = [
    { id: 'custom-flag', name: 'Flag', type: 'boolean', options: [] },
    { id: 'custom-owner', name: 'Owner', type: 'text', options: [] },
    { id: 'custom-ticket', name: 'Ticket', type: 'platform', options: [], template: '' },
    { id: 'custom-parent', name: 'Predecessors', type: 'parent', options: [] },
    { id: 'custom-child', name: 'Successors', type: 'child', options: [], source: 'custom-parent' }
  ];
  settings.issueFields = [{ id: 'custom-area', name: 'Area', type: 'select', options: ['A', 'B'] }];
  for (const id of ['sequence', 'code', 'description', 'urgency', 'status', 'highlight', 'effort', 'releaseDate', 'notes', 'custom-owner', 'custom-ticket', 'custom-parent']) assert.ok(RequiredFields.canRequire(settings, 'tasks', id), id);
  for (const id of ['tags', 'incident', 'problem', 'custom-flag', 'custom-child', 'link', 'hidden', 'matches', 'missing']) assert.ok(!RequiredFields.canRequire(settings, 'tasks', id), id);
  for (const id of ['code', 'incident', 'problem', 'custom-area']) assert.ok(RequiredFields.canRequire(settings, 'issues', id), id);
  assert.ok(!RequiredFields.canRequire(settings, 'issues', 'linked'));
  settings.requiredTaskColumns = ['code', 'tags', 'custom-flag', 'custom-owner', 'missing'];
  assert.deepEqual(RequiredFields.requiredOf(settings, 'tasks'), ['code', 'custom-owner']);
  assert.ok(RequiredFields.isRequired(settings, 'tasks', 'code') && !RequiredFields.isRequired(settings, 'tasks', 'sequence'));
});

test('removed columns leave the mandatory list', () => {
  const data = DataFactory.baseData('en'), settings = data.settings;
  settings.taskFields = [{ id: 'custom-owner', name: 'Owner', type: 'text', options: [] }];
  settings.requiredTaskColumns = ['sequence', 'code', 'custom-owner'];
  settings.requiredIssueColumns = ['problem'];
  ColumnCleanup.removeColumn(settings, 'tasks', 'code');
  ColumnCleanup.removeColumn(settings, 'tasks', 'custom-owner');
  ColumnCleanup.removeColumn(settings, 'issues', 'problem');
  assert.deepEqual(settings.requiredTaskColumns, ['sequence']);
  assert.deepEqual(settings.requiredIssueColumns, []);
  settings.requiredTaskColumns = ['sequence', 'gone'];
  assert.deepEqual(ColumnCleanup.cleanData(data).settings.requiredTaskColumns, ['sequence']);
  assert.doesNotThrow(() => ArchiveValidator.validateData(data));
});

test('invalid mandatory lists are rejected', () => {
  for (const invalid of ['sequence', [1], [''], ['code', 'code'], Array.from({ length: 101 }, (_, index) => `custom-${index}`)]) {
    const data = DataFactory.baseData('en');
    data.settings.requiredIssueColumns = invalid;
    assert.throws(() => ArchiveValidator.validateData(data), /Invalid required columns/);
  }
});

test('mandatory columns travel with settings exports and follow remapped custom columns', () => {
  const source = DataFactory.baseData('en'), target = DataFactory.baseData('en');
  source.settings.taskFields = [{ id: 'custom-source', name: 'Owner', type: 'text', options: [] }];
  target.settings.taskFields = [{ id: 'custom-target', name: 'Owner', type: 'text', options: [] }];
  source.settings.requiredTaskColumns = ['code', 'custom-source'];
  source.settings.requiredIssueColumns = ['incident'];
  for (const kind of ['settings', 'organization']) {
    const exported = OrganizationTransfer.organizationExport({ name: 'Rules', data: source }, kind);
    assert.deepEqual(exported.settings.requiredTaskColumns, ['code', 'custom-source']);
    const file = OrganizationTransfer.parseOrganizationFile(exported);
    const imported = OrganizationTransfer.applyOrganizationImport(target, file, { settings: true });
    assert.deepEqual(imported.settings.requiredTaskColumns, ['code', 'custom-target']);
    assert.deepEqual(imported.settings.requiredIssueColumns, ['incident']);
    assert.deepEqual(OrganizationTransfer.importedOrganizationData(file, { settings: true }).settings.requiredTaskColumns, ['code', 'custom-source']);
    const old = structuredClone(exported);
    delete old.settings.requiredTaskColumns;
    delete old.settings.requiredIssueColumns;
    const kept = OrganizationTransfer.applyOrganizationImport(imported, OrganizationTransfer.parseOrganizationFile(old), { settings: true });
    assert.deepEqual(kept.settings.requiredTaskColumns, ['code', 'custom-target']);
    assert.deepEqual(kept.settings.requiredIssueColumns, ['incident']);
  }
  assert.equal(OrganizationTransfer.organizationExport({ name: 'Rules', data: source }, 'data').settings, undefined);
});
