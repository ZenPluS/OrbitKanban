'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./columns');
const { baseData, validateData, migrateArchive, organizationExport, parseOrganizationFile, applyOrganizationImport, normalizeTaskColumns, findDuplicates } = require('./core');
const field = (type, name = type) => ({ id: `custom-${type}`, name, type, options: ['select', 'multiselect'].includes(type) ? ['Uno', 'Due'] : [] });
const task = data => ({ id: 't', code: 'A', sequence: 1, url: '', description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false });

test('custom field types validate real values, including zero, false and blank cells', () => {
  const values = { text: 'Testo', richtext: '<p>Testo</p>', number: -2.5, date: '2028-02-29', select: 'Uno', multiselect: ['Uno', 'Due'], url: 'https://example.com', effort: 0, boolean: false };
  for (const type of C.TYPES) {
    C.validateFields([field(type)]);
    C.validateValue(values[type], field(type));
    C.validateValue('', field(type));
    assert.throws(() => C.validateValue({ bad: true }, field(type)));
  }
  for (const [type, value] of [['date', '2027-02-29'], ['number', Infinity], ['effort', -1], ['select', 'Tre'], ['multiselect', ['Uno', 'Uno']], ['url', 'javascript:alert(1)']]) assert.throws(() => C.validateValue(value, field(type)));
});
test('invalid field names, identifiers, options and excessive schemas are rejected', () => {
  assert.throws(() => C.validateFields([field('text'), { ...field('number'), name: 'TEXT' }]));
  assert.throws(() => C.validateFields([{ ...field('text'), id: '__proto__' }]));
  assert.throws(() => C.validateFields([{ ...field('select'), options: ['Uno', 'uno'] }]));
  C.validateFields([{ ...field('select'), options: [] }]);
  assert.throws(() => C.validateFields([{ ...field('select'), options: [{ id: 'a', name: 'A', color: 'bad' }] }]));
  assert.throws(() => C.validateFields(Array.from({ length: 31 }, (_, i) => ({ ...field('text'), id: `custom-${i}`, name: String(i) }))));
});
test('old archives get empty custom schemas and all built-in issue columns', () => {
  const data = baseData();
  delete data.settings.taskFields; delete data.settings.issueFields; delete data.settings.issueColumns;
  const migrated = migrateArchive(data).organizations[0].data;
  assert.deepEqual(migrated.settings.taskFields, []);
  assert.deepEqual(migrated.settings.issueFields, []);
  assert.deepEqual(migrated.settings.issueColumns.map(c => c.id), ['code', 'incident', 'problem', 'linked']);
});
test('custom column order, visibility, values and filtered saved views survive archive and organization roundtrips', () => {
  const data = baseData();
  data.settings.taskFields = [field('number')];
  data.settings.issueFields = [field('select')];
  data.settings.taskColumns = normalizeTaskColumns([{ id: 'custom-number', visible: true }, { id: 'code', visible: true }], data.settings.taskFields);
  data.tasks.push({ ...task(data), customFields: { 'custom-number': 12 } });
  data.issues.push({ id: 'i', code: 'A', incident: 'INC', problem: '', customFields: { 'custom-select': 'Due' } });
  data.settings.savedViews = [{ id: 'v', name: 'Vista', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'custom-number', direction: 'desc' }], columns: data.settings.taskColumns, columnFilters: { 'custom-number': { ...C.emptyFilter(), min: '10' } } }];
  validateData(data);
  const exported = parseOrganizationFile(organizationExport({ name: 'Org', data }, 'organization'));
  const imported = applyOrganizationImport(baseData(), exported, { settings: true, data: true });
  assert.equal(imported.tasks[0].customFields['custom-number'], 12);
  assert.equal(imported.issues[0].customFields['custom-select'], 'Due');
  assert.deepEqual(imported.settings.taskColumns, data.settings.taskColumns);
  assert.equal(imported.settings.savedViews[0].columnFilters['custom-number'].min, '10');
});
test('data-only imports carry schemas and remap values by field name without overwriting colliding ids', () => {
  const source = baseData(), target = baseData();
  source.settings.taskFields = [field('number', 'Costo')];
  source.tasks = [{ ...task(source), customFields: { 'custom-number': 42 } }];
  target.settings.taskFields = [field('number', 'Durata')];
  const imported = applyOrganizationImport(target, parseOrganizationFile(organizationExport({ name: 'Source', data: source }, 'data')), { data: true });
  const cost = imported.settings.taskFields.find(f => f.name === 'Costo');
  assert.notEqual(cost.id, 'custom-number');
  assert.equal(imported.tasks[0].customFields[cost.id], 42);
  assert.equal(imported.settings.taskFields.find(f => f.id === 'custom-number').name, 'Durata');
});
test('filter semantics support contains, choice intersections, numeric/date ranges and empty cells', () => {
  const f = C.emptyFilter();
  assert.ok(C.matchesFilter('Alpha Beta', { ...f, text: 'BETA' }, 'text'));
  assert.ok(C.matchesFilter(['Uno', 'Due'], { ...f, values: ['Due'] }, 'multiselect'));
  assert.ok(!C.matchesFilter(0, { ...f, min: '1' }, 'number'));
  assert.ok(C.matchesFilter(0, { ...f, empty: 'filled', max: '0' }, 'number'));
  assert.ok(C.matchesFilter(false, { ...f, values: ['false'] }, 'boolean'));
  assert.ok(C.matchesFilter([], { ...f, empty: 'empty' }, 'multiselect'));
  assert.ok(!C.matchesFilter('2026-02-03', { ...f, min: '2026-03-01' }, 'date'));
  assert.ok(!C.validFilters({ unknown: f }, ['code']));
  assert.ok(!C.validFilters({ sequence: { ...f, min: 'bad' } }, ['sequence'], { sequence: 'number' }));
  assert.ok(!C.validFilters({ sequence: { ...f, min: '5', max: '2' } }, ['sequence'], { sequence: 'number' }));
  assert.ok(!C.validFilters({ releaseDate: { ...f, min: '2027-02-29' } }, ['releaseDate'], { releaseDate: 'date' }));
});
test('identical issue cleanup preserves different custom values and compares object keys independently of order', () => {
  const issues = [
    { id: '1', code: 'A', incident: 'INC', problem: '', customFields: { 'custom-a': 1, 'custom-b': 2 } },
    { id: '2', code: 'a', incident: 'inc', problem: '', customFields: { 'custom-b': 2, 'custom-a': 1 } },
    { id: '3', code: 'A', incident: 'INC', problem: '', customFields: { 'custom-a': 3, 'custom-b': 2 } }
  ];
  const duplicates = findDuplicates([], issues);
  assert.equal(duplicates.issues.size, 3);
  assert.deepEqual(duplicates.identical, ['2']);
});
test('malformed custom schemas and removal of still-used options are rejected', () => {
  const data = baseData();
  data.settings.taskFields = null;
  assert.throws(() => validateData(data), /colonne personalizzate/);
  data.settings.taskFields = [field('select')];
  data.tasks = [{ ...task(data), customFields: { 'custom-select': 'Uno' } }];
  data.settings.taskFields[0].options = ['Due'];
  assert.throws(() => validateData(data), /colonna personalizzata/);
  const file = organizationExport({ name: 'Invalid', data: baseData() }, 'data');
  file.data.taskFields = null;
  assert.throws(() => parseOrganizationFile(file), /colonne personalizzate/);
});
test('legacy choice labels migrate to stable ids without losing assignments', () => {
  const data = baseData();
  data.settings.taskFields = [field('multiselect')];
  data.tasks = [{ ...task(data), customFields: { 'custom-multiselect': ['Uno', 'Due'] } }];
  const migrated = migrateArchive(data).organizations[0].data;
  assert.deepEqual(migrated.settings.taskFields[0].options, [
    { id: 'Uno', name: 'Uno', color: '#a392ff' }, { id: 'Due', name: 'Due', color: '#a392ff' }
  ]);
  migrated.settings.taskFields[0].options[0].name = 'Renamed';
  migrated.settings.taskFields[0].options[0].color = '#123456';
  validateData(migrated);
  assert.deepEqual(migrated.tasks[0].customFields['custom-multiselect'], ['Uno', 'Due']);
});
test('colored choice schemas, values and saved filters roundtrip and remap option identifiers', () => {
  const source = baseData(), target = baseData();
  source.settings.taskFields = [{ ...field('multiselect'), options: [{ id: 'source-id', name: 'Team', color: '#123456' }] }];
  source.tasks = [{ ...task(source), customFields: { 'custom-multiselect': ['source-id'] } }];
  source.settings.savedViews = [{ id: 'view', name: 'View', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: normalizeTaskColumns(undefined, source.settings.taskFields), columnFilters: { 'custom-multiselect': { ...C.emptyFilter(), values: ['source-id'] } } }];
  target.settings.taskFields = [{ ...field('multiselect'), options: [{ id: 'target-id', name: 'Team', color: '#abcdef' }] }];
  const incoming = parseOrganizationFile(organizationExport({ name: 'Source', data: source }, 'organization'));
  const imported = applyOrganizationImport(target, incoming, { settings: true, data: true });
  assert.deepEqual(imported.tasks[0].customFields['custom-multiselect'], ['target-id']);
  assert.deepEqual(imported.settings.savedViews[0].columnFilters['custom-multiselect'].values, ['target-id']);
  assert.equal(imported.settings.taskFields[0].options[0].color, '#123456');
  const again = applyOrganizationImport(imported, incoming, { settings: true, data: true });
  assert.deepEqual(again, imported);
  const renamed = structuredClone(source);
  renamed.settings.taskFields[0].options[0].name = 'New team';
  const updated = applyOrganizationImport(source, parseOrganizationFile(organizationExport({ name: 'Source', data: renamed }, 'settings')), { settings: true });
  assert.equal(updated.settings.taskFields[0].options[0].name, 'New team');
  assert.deepEqual(updated.tasks[0].customFields['custom-multiselect'], ['source-id']);
  const collision = C.mergeFields([{ ...field('multiselect'), options: [{ id: 'source-id', name: 'Other', color: '#abcdef' }] }], source.settings.taskFields);
  assert.notEqual(collision.valueMappings.get('custom-multiselect').get('source-id'), 'source-id');
  assert.equal(collision.fields[0].options[0].name, 'Other');
});
