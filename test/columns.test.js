'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ColumnSchema, ColumnCleanup, ColumnLayout, ColumnFilters, ColumnValidator, PlatformLinks, ColumnMerger } = require('../src/shared/columns');
const { DataFactory, ArchiveValidator, OrganizationTransfer, TaskColumns, IssueMatcher } = require('../src/shared/domain');
const { CsvImporter } = require('../src/shared/interop');
const field = (type, name = type) => ({ id: `custom-${type}`, name, type, options: ['select', 'multiselect'].includes(type) ? ['One', 'Two'] : [] });
const task = data => ({ id: 't', code: 'A', sequence: 1, description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false });

test('every default column can be deleted without returning on reload or organization import', () => {
  for (const kind of ['tasks', 'issues']) for (const field of ColumnSchema.BUILTIN_FIELDS[kind]) {
    const data = DataFactory.baseData();
    data.tasks = [task(data)];
    data.issues = [{ id: 'i', code: 'A', incident: 'INC', problem: 'PRB' }];
    ColumnCleanup.removeColumn(data.settings, kind, field.id);
    ColumnCleanup.cleanData(data);
    ArchiveValidator.validateData(data);
    assert.ok(!ColumnLayout.listColumns(data.settings, kind).some(column => column.id === field.id));
    if (field.property) assert.deepEqual(data[kind][0][field.property], field.empty);
    const restored = ArchiveValidator.migrateArchive(data).organizations[0].data;
    assert.ok(!ColumnSchema.hasColumn(restored.settings, kind, field.id));
    const imported = OrganizationTransfer.importedOrganizationData(OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data }, 'organization')), { settings: true, data: true });
    assert.ok(!ColumnSchema.hasColumn(imported.settings, kind, field.id));
    restored.settings[ColumnSchema.deletedKey(kind)] = [];
    ColumnCleanup.cleanData(restored);
    ArchiveValidator.validateData(restored);
    assert.ok(ColumnSchema.hasColumn(restored.settings, kind, field.id));
    if (field.property) assert.deepEqual(restored[kind][0][field.property], field.empty);
  }
});
test('zero-column schemas, unassigned choices and empty restored fields remain editable', () => {
  const data = DataFactory.baseData();
  data.tasks = [task(data)]; data.issues = [{ id: 'i', code: 'A', incident: 'INC', problem: '' }];
  for (const kind of ['tasks', 'issues']) for (const field of ColumnSchema.BUILTIN_FIELDS[kind]) ColumnCleanup.removeColumn(data.settings, kind, field.id);
  ColumnCleanup.cleanData(data); ArchiveValidator.validateData(data);
  assert.deepEqual(ColumnLayout.listColumns(data.settings, 'tasks'), []);
  assert.deepEqual(ColumnLayout.listColumns(data.settings, 'issues'), []);
  assert.deepEqual(ColumnLayout.defaultSort(data.settings), []);
  assert.equal(data.tasks.length, 1);
  for (const kind of ['tasks', 'issues']) data.settings[ColumnSchema.deletedKey(kind)] = [];
  ColumnCleanup.cleanData(data); ArchiveValidator.validateData(data);
  assert.equal(data.tasks[0].code, '');
  data.settings.statuses = []; data.settings.urgencies = [];
  ArchiveValidator.validateData(data);
});
test('deleted columns clean saved filters, sort keys and visibility without changing unrelated view preferences', () => {
  const data = DataFactory.baseData(), settings = data.settings;
  settings.savedViews = [{ id: 'v', name: 'View', search: 'keep', statusFilter: settings.statuses[0].id, highlightFilter: '__any', showHidden: true, duplicatesOnly: false,
    columns: [{ id: 'code', visible: true }, { id: 'releaseDate', visible: true }], sort: [{ key: 'releaseDate', direction: 'asc' }],
    columnFilters: { releaseDate: { ...ColumnFilters.emptyFilter(), values: ['2030-01-01'] } } }];
  for (const id of ['releaseDate', 'status', 'highlight']) ColumnCleanup.removeColumn(settings, 'tasks', id);
  ColumnCleanup.cleanData(data); ArchiveValidator.validateData(data);
  const view = settings.savedViews[0];
  assert.deepEqual(view.columns, [{ id: 'code', visible: true }]);
  assert.deepEqual(view.columnFilters, {});
  assert.equal(view.statusFilter, ''); assert.equal(view.highlightFilter, '');
  assert.equal(view.search, 'keep'); assert.equal(view.showHidden, true);
  assert.ok(view.sort.every(entry => ColumnLayout.sortKeys(settings).includes(entry.key)));
});
test('built-in and custom choices use the same schema and clear removed assignments on save', () => {
  const data = DataFactory.baseData(), settings = data.settings;
  settings.tags = [{ id: 'tag', name: 'Tag', color: '#123456' }];
  settings.taskFields = [field('select'), field('multiselect')];
  data.tasks = [{ ...task(data), tagIds: ['tag'], customFields: { 'custom-select': 'One', 'custom-multiselect': ['One', 'Two'] } }];
  const schema = ColumnSchema.schemaOf(settings, 'tasks');
  for (const id of ['status', 'urgency', 'tags', 'custom-select', 'custom-multiselect']) {
    const descriptor = schema.find(field => field.id === id);
    assert.ok(['select', 'multiselect'].includes(descriptor.type));
    assert.ok(ColumnSchema.choices(descriptor).length);
  }
  settings.statuses = []; settings.urgencies = []; settings.tags = [];
  settings.taskFields.forEach(field => { field.options = ['Two']; });
  ColumnCleanup.cleanData(data); ArchiveValidator.validateData(data);
  assert.equal(data.tasks[0].statusId, ''); assert.equal(data.tasks[0].urgencyId, '');
  assert.deepEqual(data.tasks[0].tagIds, []);
  assert.equal(data.tasks[0].customFields['custom-select'], '');
  assert.deepEqual(data.tasks[0].customFields['custom-multiselect'], ['Two']);
});
test('deleted-column metadata travels with data-only files and never revives a target schema', () => {
  const source = DataFactory.baseData();
  source.tasks = [task(source)];
  ColumnCleanup.removeColumn(source.settings, 'tasks', 'code'); ColumnCleanup.cleanData(source);
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'data'));
  const created = OrganizationTransfer.importedOrganizationData(file, { data: true });
  assert.ok(!ColumnSchema.hasColumn(created.settings, 'tasks', 'code'));
  const target = DataFactory.baseData();
  ColumnCleanup.removeColumn(target.settings, 'tasks', 'status'); ColumnCleanup.cleanData(target);
  const imported = OrganizationTransfer.applyOrganizationImport(target, file, { data: true });
  assert.ok(!ColumnSchema.hasColumn(imported.settings, 'tasks', 'status'));
  assert.ok(ColumnSchema.hasColumn(imported.settings, 'tasks', 'code'));
  assert.equal(imported.tasks[0].statusId, '');
});
test('invalid deletion metadata and stale writes to removed fields are rejected', () => {
  for (const value of [null, {}, ['unknown'], ['code', 'code'], ['custom-text'], ['__proto__']]) {
    const data = DataFactory.baseData(); data.settings.deletedTaskColumns = value;
    assert.throws(() => ArchiveValidator.validateData(data), /deleted columns/i);
    const file = OrganizationTransfer.organizationExport({ name: 'Source', data: DataFactory.baseData() }, 'data');
    file.data.deletedIssueColumns = value;
    assert.throws(() => OrganizationTransfer.parseOrganizationFile(file), /deleted columns/i);
  }
  const data = DataFactory.baseData(); data.tasks = [task(data)];
  ColumnCleanup.removeColumn(data.settings, 'tasks', 'code');
  assert.throws(() => ArchiveValidator.validateData(data), /deleted columns cannot contain values/i);
});
test('empty deleted portal codes cannot match tasks or produce duplicate task links', () => {
  const tasks = [{ id: 'a', code: '' }, { id: 'b', code: '' }], issues = [{ id: 'i', code: '', incident: 'INC', problem: 'PRB' }];
  assert.deepEqual(IssueMatcher.matchIssues(tasks[0], issues), { incidents: [], problems: [] });
  assert.deepEqual(IssueMatcher.matchIssues(tasks[0], IssueMatcher.indexIssues(issues)), { incidents: [], problems: [] });
  assert.equal(IssueMatcher.findDuplicates(tasks, issues).tasks.size, 0);
});
test('CSV destinations and required mappings follow the existing schema', () => {
  const data = DataFactory.baseData();
  for (const kind of ['tasks', 'issues']) {
    for (const field of ColumnSchema.BUILTIN_FIELDS[kind]) ColumnCleanup.removeColumn(data.settings, kind, field.id);
    data.settings[kind === 'tasks' ? 'taskFields' : 'issueFields'] = [field('text')];
  }
  ColumnCleanup.cleanData(data);
  for (const kind of ['tasks', 'issues']) {
    assert.ok(!CsvImporter.destinations(data, kind).some(field => field.id === 'code'));
    const result = CsvImporter.prepareImport(data, kind, [['Only custom data']], ['custom-text']);
    assert.equal(result.errorCount, 0);
    assert.equal(result.records[0].customFields['custom-text'], 'Only custom data');
    assert.equal(result.records[0].code, '');
    assert.throws(() => CsvImporter.prepareImport(data, kind, [['A']], ['code']), /column mapping/i);
  }
});

test('custom field types validate real values, including zero, false and blank cells', () => {
  const values = { text: 'Text', richtext: '<p>Text</p>', number: -2.5, date: '2028-02-29', select: 'One', multiselect: ['One', 'Two'], url: 'https://example.com', platform: 'PRJ-1', effort: 0, boolean: false, parent: ['a', 'b'] };
  for (const type of ColumnSchema.TYPES.filter(type => type !== 'child')) {
    ColumnValidator.validateFields([field(type)], 'tasks');
    ColumnValidator.validateValue(values[type], field(type));
    ColumnValidator.validateValue('', field(type));
    assert.throws(() => ColumnValidator.validateValue({ bad: true }, field(type)));
  }
  for (const [type, value] of [['date', '2027-02-29'], ['number', Infinity], ['effort', -1], ['select', 'Three'], ['multiselect', ['One', 'One']], ['url', 'javascript:alert(1)'],
    ['platform', ' padded '], ['platform', 'a\nb'], ['parent', ['a', 'a']], ['parent', [1]], ['parent', 'a']]) assert.throws(() => ColumnValidator.validateValue(value, field(type)), `${type} ${JSON.stringify(value)}`);
  const child = { ...field('child'), source: 'custom-parent' };
  ColumnValidator.validateFields([field('parent'), child], 'tasks');
  ColumnValidator.validateValue('', child);
  assert.throws(() => ColumnValidator.validateValue(['a'], child));
});
test('invalid field names, identifiers, options and excessive schemas are rejected', () => {
  assert.throws(() => ColumnValidator.validateFields([field('text'), { ...field('number'), name: 'TEXT' }]));
  assert.throws(() => ColumnValidator.validateFields([{ ...field('text'), id: '__proto__' }]));
  assert.throws(() => ColumnValidator.validateFields([{ ...field('select'), options: ['One', 'one'] }]));
  ColumnValidator.validateFields([{ ...field('select'), options: [] }]);
  assert.throws(() => ColumnValidator.validateFields([{ ...field('select'), options: [{ id: 'a', name: 'A', color: 'bad' }] }]));
  ColumnValidator.validateFields(Array.from({ length: ColumnSchema.FIELD_LIMIT }, (_, i) => ({ ...field('text'), id: `custom-${i}`, name: String(i) })));
  assert.throws(() => ColumnValidator.validateFields(Array.from({ length: ColumnSchema.FIELD_LIMIT + 1 }, (_, i) => ({ ...field('text'), id: `custom-${i}`, name: String(i) }))));
  const parent = field('parent'), child = { ...field('child'), source: parent.id };
  assert.throws(() => ColumnValidator.validateFields([parent, field('child')], 'tasks'), /successor column/i);
  assert.throws(() => ColumnValidator.validateFields([parent, child, { ...child, id: 'custom-child-2', name: 'Other' }], 'tasks'), /successor column/i);
  assert.throws(() => ColumnValidator.validateFields([{ ...field('text'), source: parent.id }, parent], 'tasks'));
  assert.throws(() => ColumnValidator.validateFields([parent], 'issues'));
  assert.throws(() => ColumnValidator.validateFields([parent, child], 'issues'));
  assert.throws(() => ColumnValidator.validateFields([{ ...field('text'), template: 'https://tickets.example.com/{code}' }]), /template/i);
  for (const template of ['https://tickets.example.com/browse', 'javascript:alert(1)//{code}', 'tickets.example.com/{code}', 42]) {
    assert.throws(() => ColumnValidator.validateFields([{ ...field('platform'), template }]), /template/i, String(template));
  }
  ColumnValidator.validateFields([{ ...field('platform'), template: '' }, { ...field('url'), id: 'custom-site' }]);
  ColumnValidator.validateFields([{ ...field('platform'), template: 'https://tickets.example.com/browse/{code}' }, { ...field('platform', 'Changes'), id: 'custom-changes', template: 'https://changes.example.com/c?id=<codice>' }]);
});
test('platform columns turn an identifier into a link with their own template or keep a full address', () => {
  const tickets = { ...field('platform'), template: 'https://tickets.example.com/browse/{code}' }, plain = field('platform', 'Plain');
  assert.equal(PlatformLinks.platformLink(tickets, 'PRJ-7'), 'https://tickets.example.com/browse/PRJ-7');
  assert.equal(PlatformLinks.platformLink(tickets, ' a b/c '), 'https://tickets.example.com/browse/a%20b%2Fc');
  assert.equal(PlatformLinks.platformLink(tickets, 'https://other.example.com/item/9'), 'https://other.example.com/item/9');
  assert.equal(PlatformLinks.platformLink(tickets, 'javascript://alert(1)'), '');
  assert.equal(PlatformLinks.platformLink(tickets, ''), '');
  assert.equal(PlatformLinks.platformLink(plain, 'PRJ-7'), '');
  assert.equal(PlatformLinks.platformLink(plain, 'https://tickets.example.com/browse/PRJ-7'), 'https://tickets.example.com/browse/PRJ-7');
  assert.equal(PlatformLinks.platformLink({ ...tickets, template: 'https://changes.example.com/change?id=<codice>' }, 'CHG 1'), 'https://changes.example.com/change?id=CHG%201');
  assert.equal(PlatformLinks.platformValue(tickets, '  PRJ-7  '), 'PRJ-7');
  assert.equal(PlatformLinks.platformValue(tickets, 'https://other.example.com/x'), 'https://other.example.com/x');
  assert.equal(PlatformLinks.platformValue(plain, 'tickets.example.com/browse/PRJ-7'), 'https://tickets.example.com/browse/PRJ-7');
  assert.equal(PlatformLinks.platformValue(plain, ' '), '');
  assert.throws(() => PlatformLinks.platformValue(plain, 'PRJ 7'), /valid web address/i);
  assert.throws(() => PlatformLinks.platformValue(tickets, 'ftp://tickets.example.com/x'), /valid web address/i);
  assert.ok(PlatformLinks.validTemplate('') && PlatformLinks.validTemplate('https://tickets.example.com/browse/{CODE}'));
  assert.ok(!PlatformLinks.validTemplate('https://tickets.example.com/browse/') && !PlatformLinks.validTemplate('ftp://tickets.example.com/{code}'));
});
test('successors are computed from predecessors and references never point to missing tasks or to the task itself', () => {
  const data = DataFactory.baseData(), parent = field('parent'), child = { ...field('child'), source: parent.id };
  data.settings.taskFields = [parent, child];
  data.tasks = ['a', 'b', 'c'].map((id, index) => ({ ...task(data), id, code: id.toUpperCase(), sequence: index + 1 }));
  data.tasks[1].customFields = { [parent.id]: ['a'] };
  data.tasks[2].customFields = { [parent.id]: ['a', 'b'] };
  ArchiveValidator.validateData(data);
  const successors = ColumnCleanup.successorIndex(data.tasks, parent.id);
  assert.deepEqual(successors.get('a'), ['b', 'c']);
  assert.deepEqual(successors.get('b'), ['c']);
  assert.equal(successors.get('c'), undefined);
  data.tasks[0].customFields = { [parent.id]: ['a'] };
  assert.throws(() => ArchiveValidator.validateData(data), /depend on itself/i);
  data.tasks[0].customFields = { [child.id]: ['b'] };
  assert.throws(() => ArchiveValidator.validateData(data), /custom column value/i);
  data.tasks[0].customFields = { [parent.id]: ['a', 'gone'], [child.id]: ['b'] };
  data.tasks = data.tasks.filter(item => item.id !== 'b');
  ColumnCleanup.pruneReferences(data);
  assert.deepEqual(data.tasks[0].customFields, {});
  assert.deepEqual(data.tasks[1].customFields, { [parent.id]: ['a'] });
  ArchiveValidator.validateData(data);
});
test('deleting a predecessor column also deletes its successor column and the other way round', () => {
  for (const removed of ['custom-parent', 'custom-child']) {
    const data = DataFactory.baseData(), parent = field('parent'), child = { ...field('child'), source: parent.id };
    data.settings.taskFields = [field('text'), parent, child];
    data.settings.requiredTaskColumns = ['sequence', parent.id];
    data.tasks = [{ ...task(data), id: 'a' }, { ...task(data), id: 'b', customFields: { [parent.id]: ['a'] } }];
    assert.deepEqual(ColumnCleanup.pairedIds(data.settings, 'tasks', removed), [parent.id, child.id]);
    ColumnCleanup.removeColumn(data.settings, 'tasks', removed);
    ColumnCleanup.cleanData(data);
    ArchiveValidator.validateData(data);
    assert.deepEqual(data.settings.taskFields.map(item => item.id), ['custom-text']);
    assert.ok(!data.settings.taskColumns.some(column => [parent.id, child.id].includes(column.id)));
    assert.deepEqual(data.settings.requiredTaskColumns, ['sequence']);
    assert.deepEqual(data.tasks[1].customFields, {});
  }
  assert.deepEqual(ColumnCleanup.pairedIds({ taskFields: [field('text')] }, 'tasks', 'custom-text'), ['custom-text']);
});
test('old archives get empty custom schemas and all built-in issue columns', () => {
  const data = DataFactory.baseData();
  delete data.settings.taskFields; delete data.settings.issueFields; delete data.settings.issueColumns;
  const migrated = ArchiveValidator.migrateArchive(data).organizations[0].data;
  assert.deepEqual(migrated.settings.taskFields, []);
  assert.deepEqual(migrated.settings.issueFields, []);
  assert.deepEqual(migrated.settings.issueColumns.map(c => c.id), ['code', 'incident', 'problem', 'linked']);
});
test('custom column order, visibility, values and filtered saved views survive archive and organization roundtrips', () => {
  const data = DataFactory.baseData();
  data.settings.taskFields = [field('number')];
  data.settings.issueFields = [field('select')];
  data.settings.taskColumns = TaskColumns.normalizeTaskColumns([{ id: 'custom-number', visible: true }, { id: 'code', visible: true }], data.settings.taskFields);
  data.tasks.push({ ...task(data), customFields: { 'custom-number': 12 } });
  data.issues.push({ id: 'i', code: 'A', incident: 'INC', problem: '',   customFields: { 'custom-select': 'Two' } });
    data.settings.savedViews = [{ id: 'v', name: 'View', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'custom-number', direction: 'desc' }], columns: data.settings.taskColumns, columnFilters: { 'custom-number': { ...ColumnFilters.emptyFilter(), min: '10' } } }];
  ArchiveValidator.validateData(data);
  const exported = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Org', data }, 'organization'));
  const imported = OrganizationTransfer.applyOrganizationImport(DataFactory.baseData(), exported, { settings: true, data: true });
  assert.equal(imported.tasks[0].customFields['custom-number'], 12);
  assert.equal(imported.issues[0].customFields['custom-select'], 'Two');
  assert.deepEqual(imported.settings.taskColumns, data.settings.taskColumns);
  assert.equal(imported.settings.savedViews[0].columnFilters['custom-number'].min, '10');
});
test('data-only imports carry schemas and remap values by field name without overwriting colliding ids', () => {
  const source = DataFactory.baseData(), target = DataFactory.baseData();
  source.settings.taskFields = [field('number', 'Costo')];
  source.tasks = [{ ...task(source), customFields: { 'custom-number': 42 } }];
  target.settings.taskFields = [field('number', 'Durata')];
  const imported = OrganizationTransfer.applyOrganizationImport(target, OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'data')), { data: true });
  const cost = imported.settings.taskFields.find(f => f.name === 'Costo');
  assert.notEqual(cost.id, 'custom-number');
  assert.equal(imported.tasks[0].customFields[cost.id], 42);
  assert.equal(imported.settings.taskFields.find(f => f.id === 'custom-number').name, 'Durata');
});
test('filter semantics support contains, choice intersections, numeric/date ranges and empty cells', () => {
  const f = ColumnFilters.emptyFilter();
  assert.ok(ColumnFilters.matchesFilter('Alpha Beta', { ...f, text: 'BETA' }, 'text'));
  assert.ok(ColumnFilters.matchesFilter(['One', 'Two'], { ...f, values: ['Two'] }, 'multiselect'));
  assert.ok(!ColumnFilters.matchesFilter(0, { ...f, min: '1' }, 'number'));
  assert.ok(ColumnFilters.matchesFilter(0, { ...f, empty: 'filled', max: '0' }, 'number'));
  assert.ok(ColumnFilters.matchesFilter(false, { ...f, values: ['false'] }, 'boolean'));
  assert.ok(ColumnFilters.matchesFilter([], { ...f, empty: 'empty' }, 'multiselect'));
  assert.ok(!ColumnFilters.matchesFilter('2026-02-03', { ...f, min: '2026-03-01' }, 'date'));
  assert.ok(!ColumnFilters.validFilters({ unknown: f }, ['code']));
  assert.ok(!ColumnFilters.validFilters({ sequence: { ...f, min: 'bad' } }, ['sequence'], { sequence: 'number' }));
  assert.ok(!ColumnFilters.validFilters({ sequence: { ...f, min: '5', max: '2' } }, ['sequence'], { sequence: 'number' }));
  assert.ok(!ColumnFilters.validFilters({ releaseDate: { ...f, min: '2027-02-29' } }, ['releaseDate'], { releaseDate: 'date' }));
});
test('date filters combine picked dates, unassigned cells and the range as alternatives', () => {
  const f = ColumnFilters.emptyFilter(), E = ColumnFilters.EMPTY_VALUE, type = 'date';
  const picked = { ...f, values: ['2026-06-03', '2026-07-01'] };
  assert.ok(ColumnFilters.matchesFilter('2026-06-03', picked, type));
  assert.ok(!ColumnFilters.matchesFilter('2026-06-04', picked, type));
  assert.ok(!ColumnFilters.matchesFilter('', picked, type));
  const withEmpty = { ...picked, values: [...picked.values, E] };
  assert.ok(ColumnFilters.matchesFilter('', withEmpty, type) && ColumnFilters.matchesFilter(undefined, withEmpty, type) && ColumnFilters.matchesFilter('2026-07-01', withEmpty, type));
  const onlyEmpty = { ...f, values: [E] };
  assert.ok(ColumnFilters.matchesFilter('', onlyEmpty, type) && !ColumnFilters.matchesFilter('2026-06-03', onlyEmpty, type));
  const sameDay = { ...f, min: '2026-06-03', max: '2026-06-03' };
  assert.ok(ColumnFilters.matchesFilter('2026-06-03', sameDay, type) && !ColumnFilters.matchesFilter('2026-06-02', sameDay, type) && !ColumnFilters.matchesFilter('', sameDay, type));
  const union = { ...f, min: '2026-08-01', values: ['2026-06-03', E] };
  assert.deepEqual(['2026-06-03', '2026-06-04', '2026-08-01', '2027-01-01', ''].map(value => ColumnFilters.matchesFilter(value, union, type)), [true, false, true, true, true]);
  assert.ok(!ColumnFilters.matchesFilter('', { ...f, empty: 'filled' }, type) && ColumnFilters.matchesFilter('2026-06-03', { ...f, empty: 'filled' }, type));
  assert.ok(ColumnFilters.matchesFilter('', { ...f, empty: 'empty', values: ['2026-06-03'] }, type) && !ColumnFilters.matchesFilter('2026-06-03', { ...f, empty: 'empty', values: ['2026-06-03'] }, type));
  assert.ok(ColumnFilters.matchesFilter('', { ...f, values: [E] }, 'select') && !ColumnFilters.matchesFilter('a', { ...f, values: [E] }, 'select'));
  const ids = ['releaseDate'], types = { releaseDate: 'date' };
  assert.ok(ColumnFilters.validFilters({ releaseDate: union }, ids, types));
  assert.ok(ColumnFilters.validFilters({ releaseDate: { ...f, values: Array.from({ length: 400 }, (_, day) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10)) } }, ids, types));
  assert.ok(!ColumnFilters.validFilters({ releaseDate: { ...f, values: ['03/06/2026'] } }, ids, types));
  assert.ok(!ColumnFilters.validFilters({ releaseDate: { ...f, values: ['2026-02-30'] } }, ids, types));
  assert.ok(!ColumnFilters.validFilters({ releaseDate: { ...f, values: Array(ColumnFilters.FILTER_VALUES_MAX + 1).fill('2026-06-03') } }, ids, types));
});
test('identical issue cleanup preserves different custom values and compares object keys independently of order', () => {
  const issues = [
    { id: '1', code: 'A', incident: 'INC', problem: '', customFields: { 'custom-a': 1, 'custom-b': 2 } },
    { id: '2', code: 'a', incident: 'inc', problem: '', customFields: { 'custom-b': 2, 'custom-a': 1 } },
    { id: '3', code: 'A', incident: 'INC', problem: '', customFields: { 'custom-a': 3, 'custom-b': 2 } }
  ];
  const duplicates = IssueMatcher.findDuplicates([], issues);
  assert.equal(duplicates.issues.size, 3);
  assert.deepEqual(duplicates.identical, ['2']);
});
test('malformed custom schemas and removal of still-used options are rejected', () => {
  const data = DataFactory.baseData();
  data.settings.taskFields = null;
  assert.throws(() => ArchiveValidator.validateData(data), /invalid custom column list/i);
  data.settings.taskFields = [field('select')];
  data.tasks = [{ ...task(data), customFields: { 'custom-select': 'One' } }];
  data.settings.taskFields[0].options = ['Two'];
  assert.throws(() => ArchiveValidator.validateData(data), /invalid custom column/i);
  const file = OrganizationTransfer.organizationExport({ name: 'Invalid', data: DataFactory.baseData() }, 'data');
  file.data.taskFields = null;
  assert.throws(() => OrganizationTransfer.parseOrganizationFile(file), /invalid custom column list/i);
});
test('legacy choice labels migrate to stable ids without losing assignments', () => {
  const data = DataFactory.baseData();
  data.settings.taskFields = [field('multiselect')];
  data.tasks = [{ ...task(data), customFields: { 'custom-multiselect': ['One', 'Two'] } }];
  const migrated = ArchiveValidator.migrateArchive(data).organizations[0].data;
  assert.deepEqual(migrated.settings.taskFields[0].options, [
    { id: 'One', name: 'One', color: '#a392ff' }, { id: 'Two', name: 'Two', color: '#a392ff' }
  ]);
  migrated.settings.taskFields[0].options[0].name = 'Renamed';
  migrated.settings.taskFields[0].options[0].color = '#123456';
  ArchiveValidator.validateData(migrated);
  assert.deepEqual(migrated.tasks[0].customFields['custom-multiselect'], ['One', 'Two']);
});
test('colored choice schemas, values and saved filters roundtrip and remap option identifiers', () => {
  const source = DataFactory.baseData(), target = DataFactory.baseData();
  source.settings.taskFields = [{ ...field('multiselect'), options: [{ id: 'source-id', name: 'Team', color: '#123456' }] }];
  source.tasks = [{ ...task(source), customFields: { 'custom-multiselect': ['source-id'] } }];
  source.settings.savedViews = [{ id: 'view', name: 'View', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: TaskColumns.normalizeTaskColumns(undefined, source.settings.taskFields), columnFilters: { 'custom-multiselect': { ...ColumnFilters.emptyFilter(), values: ['source-id'] } } }];
  target.settings.taskFields = [{ ...field('multiselect'), options: [{ id: 'target-id', name: 'Team', color: '#abcdef' }] }];
  const incoming = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'organization'));
  const imported = OrganizationTransfer.applyOrganizationImport(target, incoming, { settings: true, data: true });
  assert.deepEqual(imported.tasks[0].customFields['custom-multiselect'], ['target-id']);
  assert.deepEqual(imported.settings.savedViews[0].columnFilters['custom-multiselect'].values, ['target-id']);
  assert.equal(imported.settings.taskFields[0].options[0].color, '#123456');
  const again = OrganizationTransfer.applyOrganizationImport(imported, incoming, { settings: true, data: true });
  assert.deepEqual(again, imported);
  const renamed = structuredClone(source);
  renamed.settings.taskFields[0].options[0].name = 'New team';
  const updated = OrganizationTransfer.applyOrganizationImport(source, OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: renamed }, 'settings')), { settings: true });
  assert.equal(updated.settings.taskFields[0].options[0].name, 'New team');
  assert.deepEqual(updated.tasks[0].customFields['custom-multiselect'], ['source-id']);
  const collision = ColumnMerger.mergeFields([{ ...field('multiselect'), options: [{ id: 'source-id', name: 'Other', color: '#abcdef' }] }], source.settings.taskFields);
  assert.notEqual(collision.valueMappings.get('custom-multiselect').get('source-id'), 'source-id');
  assert.equal(collision.fields[0].options[0].name, 'Other');
});
