'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { baseData, migrateArchive, validateData, organizationExport, parseOrganizationFile, applyOrganizationImport, importedOrganizationData } = require('./core');
const { requiredOf, isRequired, canRequire, removeColumn, cleanData } = require('./columns');

test('the sequence stays mandatory by default and old workspaces keep that rule', () => {
  const data = baseData('en');
  assert.deepEqual(data.settings.requiredTaskColumns, ['sequence']);
  assert.deepEqual(data.settings.requiredIssueColumns, []);
  delete data.settings.requiredTaskColumns;
  delete data.settings.requiredIssueColumns;
  const migrated = migrateArchive(data).organizations[0].data.settings;
  assert.deepEqual(migrated.requiredTaskColumns, ['sequence']);
  assert.deepEqual(migrated.requiredIssueColumns, []);
});

test('only columns with a value to fill in can be mandatory', () => {
  const settings = baseData('en').settings;
  settings.taskFields = [
    { id: 'custom-flag', name: 'Flag', type: 'boolean', options: [] },
    { id: 'custom-owner', name: 'Owner', type: 'text', options: [] }
  ];
  settings.issueFields = [{ id: 'custom-area', name: 'Area', type: 'select', options: ['A', 'B'] }];
  for (const id of ['sequence', 'code', 'link', 'description', 'urgency', 'status', 'highlight', 'effort', 'releaseDate', 'notes', 'custom-owner']) assert.ok(canRequire(settings, 'tasks', id), id);
  for (const id of ['tags', 'incident', 'problem', 'custom-flag', 'hidden', 'matches', 'missing']) assert.ok(!canRequire(settings, 'tasks', id), id);
  for (const id of ['code', 'incident', 'problem', 'custom-area']) assert.ok(canRequire(settings, 'issues', id), id);
  assert.ok(!canRequire(settings, 'issues', 'linked'));
  settings.requiredTaskColumns = ['code', 'tags', 'custom-flag', 'custom-owner', 'missing'];
  assert.deepEqual(requiredOf(settings, 'tasks'), ['code', 'custom-owner']);
  assert.ok(isRequired(settings, 'tasks', 'code') && !isRequired(settings, 'tasks', 'sequence'));
});

test('removed columns leave the mandatory list', () => {
  const data = baseData('en'), settings = data.settings;
  settings.taskFields = [{ id: 'custom-owner', name: 'Owner', type: 'text', options: [] }];
  settings.requiredTaskColumns = ['sequence', 'code', 'custom-owner'];
  settings.requiredIssueColumns = ['problem'];
  removeColumn(settings, 'tasks', 'code');
  removeColumn(settings, 'tasks', 'custom-owner');
  removeColumn(settings, 'issues', 'problem');
  assert.deepEqual(settings.requiredTaskColumns, ['sequence']);
  assert.deepEqual(settings.requiredIssueColumns, []);
  settings.requiredTaskColumns = ['sequence', 'gone'];
  assert.deepEqual(cleanData(data).settings.requiredTaskColumns, ['sequence']);
  assert.doesNotThrow(() => validateData(data));
});

test('invalid mandatory lists are rejected', () => {
  for (const invalid of ['sequence', [1], [''], ['code', 'code'], Array.from({ length: 101 }, (_, index) => `custom-${index}`)]) {
    const data = baseData('en');
    data.settings.requiredIssueColumns = invalid;
    assert.throws(() => validateData(data), /Invalid required columns/);
  }
});

test('mandatory columns travel with settings exports and follow remapped custom columns', () => {
  const source = baseData('en'), target = baseData('en');
  source.settings.taskFields = [{ id: 'custom-source', name: 'Owner', type: 'text', options: [] }];
  target.settings.taskFields = [{ id: 'custom-target', name: 'Owner', type: 'text', options: [] }];
  source.settings.requiredTaskColumns = ['code', 'custom-source'];
  source.settings.requiredIssueColumns = ['incident'];
  for (const kind of ['settings', 'organization']) {
    const exported = organizationExport({ name: 'Rules', data: source }, kind);
    assert.deepEqual(exported.settings.requiredTaskColumns, ['code', 'custom-source']);
    const file = parseOrganizationFile(exported);
    const imported = applyOrganizationImport(target, file, { settings: true });
    assert.deepEqual(imported.settings.requiredTaskColumns, ['code', 'custom-target']);
    assert.deepEqual(imported.settings.requiredIssueColumns, ['incident']);
    assert.deepEqual(importedOrganizationData(file, { settings: true }).settings.requiredTaskColumns, ['code', 'custom-source']);
    const old = structuredClone(exported);
    delete old.settings.requiredTaskColumns;
    delete old.settings.requiredIssueColumns;
    const kept = applyOrganizationImport(imported, parseOrganizationFile(old), { settings: true });
    assert.deepEqual(kept.settings.requiredTaskColumns, ['code', 'custom-target']);
    assert.deepEqual(kept.settings.requiredIssueColumns, ['incident']);
  }
  assert.equal(organizationExport({ name: 'Rules', data: source }, 'data').settings, undefined);
});
