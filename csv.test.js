'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./csv');
const { baseData, validateData } = require('./core');

test('CSV detects comma, semicolon and tab outside quoted headers and strips BOM', () => {
  for (const separator of [',', ';', '\t']) {
    const result = C.parseCsv(`\uFEFF"code"${separator}"description"\r\nA${separator}"Hello, world; tab\tinside"\r\n`);
    assert.equal(result.delimiter, separator);
    assert.deepEqual(result.rows, [['code', 'description'], ['A', 'Hello, world; tab\tinside']]);
  }
});
test('CSV preserves multiline quoted cells, escaped quotes, empty cells and the last row', () => {
  assert.deepEqual(C.parseCsv('code;notes;other\nA;"Line 1\r\nLine ""2""";\nB;;last', ';').rows,
    [['code', 'notes', 'other'], ['A', 'Line 1\r\nLine "2"', ''], ['B', '', 'last']]);
  assert.deepEqual(C.parseCsv('code\nA').rows, [['code'], ['A']]);
  assert.equal(C.parseCsv('\ncode;notes\n ; \nA;ok\n').skipped, 2);
  assert.deepEqual(C.parseCsv('\r\n  \ncode,notes\nA,ok').rows, [['code', 'notes'], ['A', 'ok']]);
});
test('CSV rejects invalid quotes, empty files, invalid delimiters and configured size limits', () => {
  for (const text of ['a;"unfinished', 'a;"closed"x', 'a;un"quoted']) assert.throws(() => C.parseCsv(text, ';'), /virgolette/i);
  for (const text of ['', '\uFEFF\n ; \n']) assert.throws(() => C.parseCsv(text), /vuoto/);
  assert.throws(() => C.parseCsv('a|b', '|'), /Separatore/);
  assert.throws(() => C.parseCsv('x'.repeat(C.MAX_BYTES + 1)), /16 MB/);
  assert.throws(() => C.parseCsv(Array(101).fill('a').join(';')), /troppe colonne/);
  assert.throws(() => C.parseCsv('code\n' + 'A\n'.repeat(C.MAX_ROWS + 1)), /10000/);
});
test('mapping matches localized labels and aliases, leaving ambiguous and repeated destinations unmapped', () => {
  const data = baseData(), fields = C.destinations(data, 'tasks');
  assert.deepEqual(C.suggestMapping(['Issue key', 'DESCRIPTION', 'Priorita', 'Data release', 'Sequence', 'Notes', 'ignored', 'code'], fields),
    ['code', 'description', 'urgencyId', 'releaseDate', 'sequence', 'notes', '', '']);
  data.settings.taskFields = [{ id: 'custom-collision', name: 'Codice portale', type: 'text', options: [] }];
  assert.deepEqual(C.suggestMapping(['Codice portale'], C.destinations(data, 'tasks')), ['']);
  assert.ok(!fields.some(field => ['incident', 'problem'].includes(field.id)));
  assert.throws(() => C.destinations(data, 'other'), /Lista/);
});
test('CSV conversion validates numbers, dates, booleans, URLs, catalogs and escaped rich text', () => {
  const convert = (value, type, options = {}) => C.convertCell(value, { type, ...options });
  assert.equal(convert(' -2,5 ', 'number'), -2.5);
  assert.equal(convert('.25', 'effort'), 0.25);
  assert.equal(convert('29/2/2028', 'date'), '2028-02-29');
  assert.equal(convert('Sì', 'boolean'), true);
  assert.equal(convert('0', 'boolean'), false);
  assert.equal(convert('example.com/path', 'url'), 'https://example.com/path');
  assert.equal(convert('  ', 'text'), undefined);
  assert.equal(convert('<script>alert("x")</script>\n&', 'richtext'), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>&amp;</p>');
  const options = [{ value: 'a', name: 'Uno' }, { value: 'b', name: 'Due' }];
  assert.deepEqual(convert('uno | DUE | a', 'multiselect', { options }), ['a', 'b']);
  for (const [value, type] of [['1,000.5', 'number'], ['NaN', 'number'], ['-1', 'effort'], ['29/2/2027', 'date'], ['31/4/2026', 'date'], ['maybe', 'boolean'], ['javascript:alert(1)', 'url']]) assert.throws(() => convert(value, type));
  assert.throws(() => convert('1.5', 'number', { id: 'sequence' }));
  assert.throws(() => convert('9007199254740993', 'number', { id: 'sequence' }));
  assert.throws(() => convert('Other', 'select', { options }));
  assert.throws(() => convert('Uno', 'select', { options: [...options, { value: 'c', name: 'UNO' }] }));
  assert.throws(() => convert('x'.repeat(201), 'text', { id: 'code' }), /200 caratteri/);
});
test('task import is append-only, applies defaults, combines effort and allocates sequences without mutation', () => {
  const data = baseData(), before = structuredClone(data);
  const prepared = C.prepareImport(data, 'tasks', [['A', '2', '1,5', '0'], ['B', '', '', '']], ['code', 'effortHours', 'effortDays', 'sequence']);
  assert.equal(prepared.errorCount, 0);
  assert.equal(prepared.records[0].effortHours, 2 + 1.5 * data.settings.hoursPerDay);
  assert.equal(prepared.records[0].sequence, 0);
  assert.equal(prepared.records[1].sequence, 2);
  assert.equal(prepared.records[1].statusId, data.settings.statuses[0].id);
  assert.equal(prepared.records[1].hidden, false);
  assert.deepEqual(data, before);
  const appended = { ...data, tasks: [...data.tasks, ...prepared.records] };
  validateData(appended);
  const again = C.prepareImport(appended, 'tasks', [['A', '100'], ['C', '']], ['code', 'sequence']);
  assert.equal(again.records[1].sequence, 101);
  assert.notEqual(again.records[0].id, prepared.records[0].id);
});
test('custom fields of all types import into tasks and linked issues with catalogs and tags', () => {
  const data = baseData();
  const types = ['text', 'richtext', 'number', 'date', 'select', 'multiselect', 'url', 'effort', 'boolean'];
  const fields = types.map(type => ({ id: `custom-${type}`, name: type, type, options: ['select', 'multiselect'].includes(type) ? ['Uno', 'Due'] : [] }));
  data.settings.taskFields = fields; data.settings.issueFields = structuredClone(fields);
  data.settings.tags = [{ id: 'tag-a', name: 'Team', color: '#123456' }];
  const cells = ['custom text', '<b>Literal</b>', '0', '2028-02-29', 'due', 'Uno|Due', 'https://example.com', '1,25', 'no'];
  for (const kind of ['tasks', 'issues']) {
    const base = kind === 'tasks' ? ['code', 'tagIds'] : ['code', 'incident'];
    const prepared = C.prepareImport(data, kind, [['A', kind === 'tasks' ? 'Team' : 'INC-1', ...cells]], [...base, ...fields.map(field => field.id)]);
    assert.equal(prepared.errorCount, 0);
    assert.equal(prepared.records[0].customFields['custom-number'], 0);
    assert.equal(prepared.records[0].customFields['custom-boolean'], false);
    assert.equal(prepared.records[0].customFields['custom-select'], 'Due');
    assert.deepEqual(prepared.records[0].customFields['custom-multiselect'], ['Uno', 'Due']);
    if (kind === 'tasks') assert.deepEqual(prepared.records[0].tagIds, ['tag-a']);
    validateData({ ...data, [kind]: [...data[kind], ...prepared.records] });
  }
  assert.equal(C.prepareImport(data, 'tasks', [['A', 'nan']], ['code', 'custom-number']).errors[0].custom, true);
});
test('invalid rows report data-row and field errors without modifying the archive or truncating widths', () => {
  const data = baseData(), before = structuredClone(data);
  const result = C.prepareImport(data, 'tasks', [['A', '2027-02-29'], ['', ''], ['B'], ['C', '', 'extra'], ['VALID', '2028-02-29']], ['code', 'releaseDate']);
  assert.equal(result.errorCount, 4);
  assert.deepEqual(result.errors.map(error => error.row), [1, 2, 3, 4]);
  assert.equal(result.errors[0].column, 'Release date');
  assert.equal(result.records.length, 1);
  assert.deepEqual(data, before);
  assert.equal(C.prepareImport(data, 'issues', [['A', '']], ['code', 'incident']).errorCount, 1);
  assert.equal(C.prepareImport(data, 'issues', [['A', 'PRB']], ['code', 'problem']).errorCount, 0);
  const capped = C.prepareImport(data, 'tasks', Array.from({ length: 150 }, () => ['']), ['code']);
  assert.equal(capped.errors.length, 100);
  assert.equal(capped.errorCount, 150);
});
test('invalid mappings and missing data are explicitly rejected', () => {
  const data = baseData();
  for (const mapping of [[], ['notes'], ['code', 'code'], ['code', 'unknown'], null]) assert.throws(() => C.prepareImport(data, 'tasks', [['A']], mapping));
  assert.throws(() => C.prepareImport(data, 'issues', [['A']], ['code']));
  assert.throws(() => C.prepareImport(data, 'tasks', [], ['code']));
  assert.throws(() => C.prepareImport(data, 'tasks', Array.from({ length: C.MAX_ROWS + 1 }, () => ['A']), ['code']));
});
test('CSV matches colored choices by label or stable id after a rename', () => {
  const data = baseData();
  data.settings.taskFields = [{ id: 'custom-team', name: 'Team', type: 'multiselect', options: [{ id: 'stable', name: 'New label', color: '#123456' }] }];
  for (const input of ['New label', 'stable']) {
    const result = C.prepareImport(data, 'tasks', [['A', input]], ['code', 'custom-team']);
    assert.equal(result.errorCount, 0);
    assert.deepEqual(result.records[0].customFields['custom-team'], ['stable']);
  }
});
