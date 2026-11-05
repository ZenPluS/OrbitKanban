'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  baseData, migrateArchive, validateData, taskEditorFields, normalizeTaskEditorLayout, validTaskEditorLayout, migrateLegacyTaskLayout,
  organizationExport, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, createOrganization
} = require('./core');
const { removeColumn } = require('./columns');

const sections = layout => layout.columns.flatMap(column => column.sections);
const placed = layout => sections(layout).flatMap(section => section.fields.map(field => field.id));
const sectionOf = (layout, fieldId) => sections(layout).find(section => section.fields.some(field => field.id === fieldId));
const legacy = (settings, mode = 'split', columns = 2) => ({
  mode, columns, fields: taskEditorFields(settings).map(({ id, section, span }) => ({ id, section, span: Math.min(span, 2), visible: true }))
});

test('default task form keeps the 2.50 split: properties on the left and text panels on the right', () => {
  const data = baseData('en'), layout = data.settings.taskEditorLayout;
  assert.equal(layout.width, 1260);
  assert.equal(layout.height, 0);
  assert.deepEqual(layout.columns.map(column => column.width), [40, 60]);
  const [properties, text] = sections(layout);
  assert.deepEqual({ ...properties, fields: undefined }, { id: 'section-properties', name: 'Properties', showName: false, columns: 2, fields: undefined });
  assert.deepEqual(text.fields, [{ id: 'description', span: 1 }, { id: 'notes', span: 1 }]);
  assert.equal(properties.fields[0].id, 'code');
  assert.ok(!properties.fields.some(field => field.id === 'link'));
  assert.equal(properties.fields.find(field => field.id === 'effort').span, 2);
  assert.deepEqual(layout.unplaced, []);
  assert.equal(sections(baseData('it').settings.taskEditorLayout)[0].name, 'Proprietà');
  assert.ok(validTaskEditorLayout(layout));
});

test('workspaces without a layout or with a 2.50 layout migrate to sections', () => {
  const data = baseData('en'), expected = structuredClone(data.settings.taskEditorLayout);
  delete data.settings.taskEditorLayout;
  assert.deepEqual(migrateArchive(data).organizations[0].data.settings.taskEditorLayout, expected);
  const old = legacy(data.settings, 'text-first', 1);
  old.fields.find(field => field.id === 'code').visible = false;
  old.fields.find(field => field.id === 'sequence').section = 'text';
  data.settings.taskEditorLayout = old;
  const migrated = migrateArchive(data).organizations[0].data.settings.taskEditorLayout;
  assert.deepEqual(migrated.columns.map(column => column.width), [60, 40]);
  assert.deepEqual(migrated.columns[0].sections[0].fields.map(field => field.id), ['sequence', 'description', 'notes']);
  assert.equal(migrated.columns[1].sections[0].columns, 1);
  assert.ok(migrated.columns[1].sections[0].fields.every(field => field.span === 1));
  assert.deepEqual(migrated.unplaced, ['code']);
  const stacked = migrateLegacyTaskLayout(data.settings, legacy(data.settings, 'stacked'));
  assert.deepEqual(stacked.columns.map(column => column.sections.map(section => section.id)), [['section-properties', 'section-text']]);
});

test('layouts are independent per organization and survive archive reloads', () => {
  const first = createOrganization('First', 'en'), second = createOrganization('Second', 'it');
  const layout = first.data.settings.taskEditorLayout;
  Object.assign(layout, { width: 900, height: 700 });
  layout.columns[0].sections.push({ id: 'section-review', name: 'Review', showName: true, columns: 3, fields: [] });
  layout.columns[0].sections[1].fields.push(...layout.columns[0].sections[0].fields.splice(0, 2).map(field => ({ ...field, span: 3 })));
  layout.unplaced.push(layout.columns[1].sections[0].fields.pop().id);
  const archive = migrateArchive(JSON.parse(JSON.stringify({ version: 2, activeOrganizationId: first.id, organizations: [first, second] })));
  assert.deepEqual(archive.organizations[0].data.settings.taskEditorLayout, layout);
  assert.deepEqual(archive.organizations[1].data.settings.taskEditorLayout, second.data.settings.taskEditorLayout);
  assert.equal(archive.organizations[1].data.settings.taskEditorLayout.width, 1260);
});

test('layout follows added and removed columns without touching the user arrangement', () => {
  const settings = baseData('en').settings, layout = settings.taskEditorLayout;
  layout.columns.reverse();
  layout.unplaced.push('effort');
  sections(layout)[1].fields = sections(layout)[1].fields.filter(field => field.id !== 'effort');
  settings.taskFields = [
    { id: 'custom-review', name: 'Review', type: 'richtext', options: [] },
    { id: 'custom-score', name: 'Score', type: 'number', options: [] }
  ];
  removeColumn(settings, 'tasks', 'status');
  removeColumn(settings, 'issues', 'code');
  const normalized = normalizeTaskEditorLayout(settings);
  assert.deepEqual(normalized.columns.map(column => column.width), [60, 40]);
  assert.ok(!placed(normalized).some(id => ['status', 'matches'].includes(id)));
  assert.deepEqual(normalized.unplaced, ['effort']);
  assert.equal(sectionOf(normalized, 'custom-review').id, 'section-text');
  assert.equal(sectionOf(normalized, 'custom-review').fields.at(-1).span, 1);
  assert.equal(sectionOf(normalized, 'custom-score').id, 'section-properties');
  assert.ok(taskEditorFields(settings).some(field => field.id === 'hidden'));
});

test('a layout without sections gets one for the fields that are not on the form yet', () => {
  const settings = baseData('en').settings;
  settings.taskEditorLayout = { width: 800, height: 0, columns: [{ width: 50, sections: [] }, { width: 50, sections: [] }], unplaced: ['code'] };
  const normalized = normalizeTaskEditorLayout(settings);
  assert.equal(normalized.columns[0].sections.length, 1);
  assert.equal(normalized.columns[0].sections[0].id, 'section-properties');
  assert.ok(!placed(normalized).includes('code'));
  assert.equal(placed(normalized).length + 1, taskEditorFields(settings).length);
  const spans = { ...settings.taskEditorLayout, columns: [{ width: 100, sections: [{ id: 'section-a', name: '', showName: false, columns: 1, fields: [{ id: 'effort', span: 4 }] }] }], unplaced: [] };
  assert.equal(normalizeTaskEditorLayout(settings, spans).columns[0].sections[0].fields[0].span, 1);
});

test('invalid layouts fail validation instead of silently resetting user preferences', () => {
  const data = baseData(), layout = data.settings.taskEditorLayout, section = layout.columns[0].sections[0];
  const withSection = change => ({ ...layout, columns: [{ ...layout.columns[0], sections: [{ ...section, ...change }] }] });
  for (const invalid of [null, [], {}, { ...layout, width: 200 }, { ...layout, width: 900.5 }, { ...layout, height: 100 }, { ...layout, columns: [] },
    { ...layout, columns: Array.from({ length: 4 }, () => ({ width: 25, sections: [] })) }, { ...layout, columns: [{ width: 5, sections: [] }] },
    { ...layout, unplaced: [section.fields[0].id] }, { ...layout, unplaced: [''] },
    { ...layout, columns: [layout.columns[0], { ...layout.columns[1], sections: [{ ...layout.columns[1].sections[0], id: section.id }] }] },
    withSection({ id: 'other' }), withSection({ name: 'x'.repeat(61) }), withSection({ showName: 'yes' }), withSection({ columns: 5 }),
    withSection({ fields: [{ id: 'code', span: 0 }] }), withSection({ fields: [{ id: 'code', span: 1 }, { id: 'code', span: 1 }] }),
    { mode: 'other', columns: 2, fields: [] }, { mode: 'split', columns: 3, fields: [] }
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
  const layout = source.settings.taskEditorLayout = normalizeTaskEditorLayout(source.settings);
  layout.width = 1000;
  layout.columns[1].sections.push({ id: 'section-extra', name: 'Extra', showName: true, columns: 2, fields: [] });
  const properties = layout.columns[0].sections[0];
  layout.columns[1].sections[1].fields.push({ ...properties.fields.splice(properties.fields.findIndex(field => field.id === 'custom-source'), 1)[0], span: 2 });
  for (const kind of ['settings', 'organization']) {
    const file = parseOrganizationFile(organizationExport({ name: 'Layout', data: source }, kind));
    const imported = applyOrganizationImport(target, file, { settings: true });
    assert.deepEqual(sectionOf(imported.settings.taskEditorLayout, 'custom-target').id, 'section-extra');
    assert.deepEqual(sectionOf(imported.settings.taskEditorLayout, 'custom-target').fields, [{ id: 'custom-target', span: 2 }]);
    assert.equal(imported.settings.taskEditorLayout.width, 1000);
    assert.deepEqual(importedOrganizationData(file, { settings: true }).settings.taskEditorLayout, source.settings.taskEditorLayout);
    const old = structuredClone(file);
    delete old.settings.taskEditorLayout;
    assert.deepEqual(applyOrganizationImport(imported, old, { settings: true }).settings.taskEditorLayout, imported.settings.taskEditorLayout);
    const fromV250 = structuredClone(file);
    fromV250.settings.taskEditorLayout = legacy(source.settings, 'stacked');
    fromV250.settings.taskEditorLayout.fields.find(field => field.id === 'custom-source').visible = false;
    const migrated = applyOrganizationImport(target, parseOrganizationFile(fromV250), { settings: true }).settings.taskEditorLayout;
    assert.deepEqual(migrated.unplaced, ['custom-target']);
    assert.equal(migrated.columns.length, 1);
  }
  assert.equal(organizationExport({ name: 'Layout', data: source }, 'data').settings, undefined);
});
