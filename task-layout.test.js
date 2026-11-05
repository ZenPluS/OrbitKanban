'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { baseData, migrateArchive, validateData, taskEditorFields, normalizeTaskEditorLayout, organizationExport, parseOrganizationFile, applyOrganizationImport, importedOrganizationData } = require('./core');
const { removeColumn } = require('./columns');
const { createOrganization } = require('./core');

test('editor layouts are independent per organization and survive archive reloads', () => {
  const first = createOrganization('First', 'en'), second = createOrganization('Second', 'it');
  first.data.settings.taskEditorLayout.mode = 'stacked';
  first.data.settings.taskEditorLayout.fields.find(field => field.id === 'code').visible = false;
  const archive = migrateArchive(JSON.parse(JSON.stringify({ version: 2, activeOrganizationId: first.id, organizations: [first, second] })));
  assert.equal(archive.organizations[0].data.settings.taskEditorLayout.mode, 'stacked');
  assert.equal(archive.organizations[0].data.settings.taskEditorLayout.fields.find(field => field.id === 'code').visible, false);
  assert.equal(archive.organizations[1].data.settings.taskEditorLayout.mode, 'split');
  assert.equal(archive.organizations[1].data.settings.taskEditorLayout.fields.find(field => field.id === 'code').visible, true);
});

test('task editor layout defaults preserve the original sections and migrate old workspaces', () => {
  const data = baseData('en'), layout = normalizeTaskEditorLayout(data.settings);
  delete data.settings.taskEditorLayout;
  assert.equal(layout.mode, 'split');
  assert.equal(layout.columns, 2);
  assert.deepEqual(layout.fields.filter(field => field.section === 'text').map(field => field.id), ['description', 'notes']);
  assert.ok(layout.fields.every(field => field.visible));
  assert.equal(layout.fields[0].id, 'code');
  const migrated = migrateArchive(data).organizations[0].data;
  assert.deepEqual(migrated.settings.taskEditorLayout, layout);
  assert.deepEqual(migrated.tasks, data.tasks);
  assert.equal(data.settings.taskEditorLayout, undefined);
});

test('task layout keeps customization and follows added and removed columns', () => {
  const settings = baseData('en').settings;
  settings.taskEditorLayout = normalizeTaskEditorLayout(settings);
  settings.taskEditorLayout.mode = 'stacked';
  settings.taskEditorLayout.columns = 1;
  settings.taskEditorLayout.fields.reverse();
  settings.taskEditorLayout.fields.find(field => field.id === 'notes').visible = false;
  settings.taskFields = [{ id: 'custom-review', name: 'Review', type: 'richtext', options: [] }];
  removeColumn(settings, 'tasks', 'status');
  removeColumn(settings, 'issues', 'code');
  const normalized = normalizeTaskEditorLayout(settings);
  assert.equal(normalized.mode, 'stacked');
  assert.equal(normalized.columns, 1);
  assert.equal(normalized.fields[0].id, 'notes');
  assert.equal(normalized.fields[0].visible, false);
  assert.ok(!normalized.fields.some(field => ['status', 'matches'].includes(field.id)));
  assert.equal(normalized.fields.at(-1).id, 'custom-review');
  assert.equal(normalized.fields.at(-1).visible, true);
  assert.ok(taskEditorFields(settings).some(field => field.id === 'hidden'));
});

test('invalid layouts fail validation instead of silently resetting user preferences', () => {
  const data = baseData(), layout = normalizeTaskEditorLayout(data.settings);
  for (const invalid of [null, [], {}, { ...layout, mode: 'other' }, { ...layout, columns: 3 },
    { ...layout, fields: [layout.fields[0], layout.fields[0]] },
    ...[{ section: 'elsewhere' }, { span: 0 }, { visible: 'false' }, { id: '' }].map(change => ({ ...layout, fields: [{ ...layout.fields[0], ...change }] }))
  ]) {
    data.settings.taskEditorLayout = invalid;
    assert.throws(() => validateData(data), /Invalid task editor layout/);
    assert.throws(() => normalizeTaskEditorLayout(data.settings), /Invalid task editor layout/);
  }
});

test('layouts travel with settings exports, remap custom field ids and preserve old imports', () => {
  const source = baseData('en'), target = baseData('en');
  source.settings.taskFields = [{ id: 'custom-source', name: 'Review', type: 'text', options: [] }];
  target.settings.taskFields = [{ id: 'custom-target', name: 'Review', type: 'text', options: [] }];
  source.settings.taskEditorLayout = normalizeTaskEditorLayout(source.settings);
  source.settings.taskEditorLayout.mode = 'text-first';
  Object.assign(source.settings.taskEditorLayout.fields.find(field => field.id === 'custom-source'), { section: 'text', visible: false, span: 2 });
  for (const kind of ['settings', 'organization']) {
    const file = parseOrganizationFile(organizationExport({ name: 'Layout', data: source }, kind));
    const imported = applyOrganizationImport(target, file, { settings: true });
    assert.deepEqual(imported.settings.taskEditorLayout.fields.find(field => field.id === 'custom-target'),
      { id: 'custom-target', section: 'text', visible: false, span: 2 });
    assert.equal(imported.settings.taskEditorLayout.mode, 'text-first');
    assert.deepEqual(importedOrganizationData(file, { settings: true }).settings.taskEditorLayout, source.settings.taskEditorLayout);
    const old = structuredClone(file);
    delete old.settings.taskEditorLayout;
    assert.deepEqual(applyOrganizationImport(imported, old, { settings: true }).settings.taskEditorLayout, imported.settings.taskEditorLayout);
  }
  assert.equal(organizationExport({ name: 'Layout', data: source }, 'data').settings, undefined);
});
