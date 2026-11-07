'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Common, DataFactory, ArchiveValidator, IssueMatcher, TaskOrder, TaskLinks, OrganizationTransfer, Typography, Limits, ThemeCatalog, TaskColumns } = require('../src/shared/domain');
const { ThemeGenerator, ColorMath } = require('../src/shared/graphics');
const { PlatformLinks } = require('../src/shared/columns');

test('picker HSV conversion handles endpoints, achromatic colors and short HEX', () => {
  for (const [hex, hsv] of [
    ['#000000', { h: 0, s: 0, v: 0 }], ['#ffffff', { h: 0, s: 0, v: 100 }],
    ['#ff0000', { h: 0, s: 100, v: 100 }], ['#00ff00', { h: 120, s: 100, v: 100 }],
    ['#0000ff', { h: 240, s: 100, v: 100 }]
  ]) {
    assert.deepEqual(ColorMath.hexToHsv(hex), hsv);
    assert.equal(ColorMath.hsvToHex(hsv), hex);
  }
  assert.equal(ColorMath.hsvToHex({ h: 360, s: 100, v: 100 }), '#ff0000');
  assert.equal(ColorMath.hsvToHex(ColorMath.hexToHsv('#AbC')), '#aabbcc');
});
test('picker HSV roundtrips preserve RGB values without cumulative drift', () => {
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const color = '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('');
    assert.equal(ColorMath.hsvToHex(ColorMath.hexToHsv(color)), color);
  }
});
test('picker color conversion rejects invalid channels and HEX strings', () => {
  for (const color of ['', '#12', '#abcd', '#aabbccdd', '#zzzzzz', 'red', null]) assert.throws(() => ColorMath.hexToHsv(color), /Invalid color/);
  for (const values of [{ h: -1, s: 0, v: 0 }, { h: 361, s: 0, v: 0 }, { h: 0, s: 101, v: 0 }, { h: 0, s: 0, v: -1 }, { h: 0, s: NaN, v: 0 }, {}]) assert.throws(() => ColorMath.hsvToHex(values), /Invalid color/);
});

test('font choices are validated and migrate without changing existing data', () => {
  const data = DataFactory.baseData();
  assert.equal(data.settings.fontFamily, Typography.DEFAULT_FONT_FAMILY);
  for (const font of Typography.FONT_FAMILIES) { data.settings.fontFamily = font.id; ArchiveValidator.validateData(data); }
  for (const value of ['', null, 'unknown', 'Arial; color: red', {}]) {
    data.settings.fontFamily = value;
    assert.throws(() => ArchiveValidator.validateData(data), /font/i);
  }
  delete data.settings.fontFamily;
  assert.equal(ArchiveValidator.migrateArchive(data).organizations[0].data.settings.fontFamily, Typography.DEFAULT_FONT_FAMILY);
});
test('fonts travel with configuration exports and old files preserve the current font', () => {
  const data = DataFactory.baseData(); data.settings.fontFamily = 'georgia';
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Fonts', data }, 'settings'));
  assert.equal(file.settings.fontFamily, 'georgia');
  const target = DataFactory.baseData(); target.settings.fontFamily = 'consolas';
  assert.equal(OrganizationTransfer.applyOrganizationImport(target, file, { settings: true }).settings.fontFamily, 'georgia');
  const old = structuredClone(file); delete old.settings.fontFamily;
  assert.equal(OrganizationTransfer.applyOrganizationImport(target, old, { settings: true }).settings.fontFamily, 'consolas');
});
const luminance = color => color.slice(1).match(/.{2}/g).map(channel => {
  const value = parseInt(channel, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('default archive is valid and independent between invocations', () => {
  const first = DataFactory.initialData(), second = DataFactory.initialData();
  assert.equal(ArchiveValidator.validateData(first), first);
  assert.ok(first.tasks.length > 200);
  assert.notEqual(first.tasks[0].id, second.tasks[0].id);
});
test('row reordering renumbers Sequence and preserves fields and filtered-out positions', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, sequence: i * 10, notes: id, hidden: i === 1 }));
  TaskOrder.reorderTaskSequences(tasks, ['e', 'c', 'a'], 0, 2);
  assert.deepEqual(TaskOrder.sortTasks(tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => task.id), ['c', 'b', 'a', 'd', 'e']);
  assert.deepEqual(tasks.map(task => [task.id, task.notes, task.hidden]), ['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, id, i === 1]));
  assert.deepEqual(tasks.map(task => task.sequence).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  const before = structuredClone(tasks);
  TaskOrder.reorderTaskSequences(tasks, ['c', 'a'], 0, 0);
  assert.deepEqual(tasks, before);
  for (const [ids, from, to] of [[['missing', 'a'], 0, 1], [['a', 'a'], 0, 1], [['a', 'c'], -1, 0], [['a', 'c'], 0, 2]]) {
    assert.throws(() => TaskOrder.reorderTaskSequences(tasks, ids, from, to), /list has changed/i);
    assert.deepEqual(tasks, before);
  }
});
test('row reordering handles duplicate sequences and saves the visible order across reloads', () => {
  const data = DataFactory.initialData();
  data.tasks.forEach(task => { task.sequence = 0; });
  const ids = data.tasks.map(task => task.id);
  TaskOrder.reorderTaskSequences(data.tasks, ids, 0, ids.length - 1);
  const restored = ArchiveValidator.validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(TaskOrder.sortTasks(restored.tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => task.id), [...ids.slice(1), ids[0]]);
});
test('40 distinct built-in themes have four colors with readable text and accents', () => {
  const themes = ThemeCatalog.defaultThemes();
  assert.equal(themes.length, 40);
  for (const key of ['id', 'name']) assert.equal(new Set(themes.map(theme => theme[key])).size, 40);
  assert.equal(new Set(themes.map(({ background, surface, text, accent }) => [background, surface, text, accent].join())).size, 40);
  assert.ok(!themes.some(theme => theme.id === 'organization-logo'));
  assert.equal(themes.filter(theme => luminance(theme.background) > 0.5).length, 13);
  for (const theme of themes) {
    assert.equal(new Set([theme.background, theme.surface, theme.text, theme.accent]).size, 4, theme.name);
    for (const background of [theme.background, theme.surface]) {
      assert.ok(contrast(theme.text, background) >= 4.5, `${theme.name}: text`);
      assert.ok(contrast(theme.accent, background) >= 3, `${theme.name}: accent`);
    }
  }
  for (const data of [DataFactory.baseData(), DataFactory.demoData(), DataFactory.createOrganization('Fresh').data]) assert.deepEqual(data.settings.themes, themes);
  themes[0].accent = '#000000';
  assert.notEqual(ThemeCatalog.defaultThemes()[0].accent, themes[0].accent);
});
test('older archives gain missing presets without overwriting active, custom or modified themes', () => {
  const legacy = DataFactory.initialData();
  legacy.settings.themes = legacy.settings.themes.slice(0, 4);
  legacy.settings.themes[0].accent = '#a392ff';
  legacy.settings.themes.push({ id: 'organization-logo', name: 'My palette', background: '#111111', surface: '#222222', text: '#ffffff', accent: '#aabbcc' });
  legacy.settings.themeId = 'organization-logo';
  const original = structuredClone(legacy), migrated = ArchiveValidator.migrateArchive(legacy), settings = migrated.organizations[0].data.settings;
  assert.deepEqual(legacy, original);
  assert.deepEqual(settings.themes.slice(0, 5), original.settings.themes);
  assert.equal(settings.themes.length, 41);
  assert.equal(settings.themeId, 'organization-logo');
  assert.deepEqual(migrated.organizations[0].data.tasks, original.tasks);
  assert.deepEqual(migrated.organizations[0].data.issues, original.issues);
  assert.deepEqual(ArchiveValidator.migrateArchive(migrated), migrated);
  const oldV2 = structuredClone(migrated);
  oldV2.organizations[0].data.settings.themes = original.settings.themes;
  const second = DataFactory.createOrganization('Other');
  second.data.settings.themes = ThemeCatalog.defaultThemes().filter(theme => theme.id === 'everforest');
  second.data.settings.themeId = 'everforest';
  oldV2.organizations.push(second);
  const upgraded = ArchiveValidator.migrateArchive(oldV2);
  assert.deepEqual(upgraded.organizations[0], migrated.organizations[0]);
  assert.equal(upgraded.organizations[1].data.settings.themes.length, 40);
  assert.equal(upgraded.organizations[1].data.settings.themeId, 'everforest');
  const roundtrip = ArchiveValidator.migrateArchive(JSON.parse(JSON.stringify(upgraded)));
  assert.deepEqual(roundtrip, upgraded);
  const bad = structuredClone(legacy);
  bad.settings.themes[0].accent = 'invalid';
  assert.throws(() => ArchiveValidator.migrateArchive(bad), /invalid themes/i);
  bad.settings.themes = [];
  assert.throws(() => ArchiveValidator.migrateArchive(bad), /invalid themes/i);
});
test('demo releases fall every other Wednesday from January 2026 to January 2029', () => {
  const { past, next, future } = DataFactory.demoReleaseDates(new Date(2026, 4, 20, 10)), all = [...past, next, ...future];
  assert.deepEqual([all[0], all.at(-1), all.length], ['2026-01-07', '2029-01-31', 81]);
  assert.ok(past.at(-1) <= '2026-05-20' && next > '2026-05-20');
  for (const date of all) assert.equal(new Date(`${date}T12:00:00Z`).getUTCDay(), 3, date);
  all.slice(1).forEach((date, index) => assert.equal((Date.parse(date) - Date.parse(all[index])) / 86400000, 14));
  assert.deepEqual(DataFactory.demoReleaseDates(new Date(2026, 0, 7, 9)), { past: ['2026-01-07'], next: '2026-01-21', future: all.slice(2) });
  assert.deepEqual(DataFactory.demoReleaseDates(new Date(2025, 11, 1, 9)), { past: [], next: '2026-01-07', future: all.slice(1) });
  assert.deepEqual(DataFactory.demoReleaseDates(new Date(2029, 5, 1, 9)), { past: all, next: '2029-02-14', future: [] }, 'after the last milestone the open work moves to the following one');
});
test('demo data shows every feature and is deterministic for the same day', () => {
  const now = new Date(2026, 4, 20, 10);
  const data = DataFactory.demoData('it', now), again = DataFactory.demoData('it', now);
  const { past, next, future } = DataFactory.demoReleaseDates(now);
  const [todo, doing, review, done] = data.settings.statuses.map(status => status.id);
  const shape = archive => archive.tasks.map(task => [task.code, task.releaseDate, archive.settings.statuses.findIndex(status => status.id === task.statusId), task.hidden, task.effortHours]);
  assert.deepEqual(shape(data), shape(again));
  assert.deepEqual(new Set(data.tasks.filter(task => task.releaseDate).map(task => task.releaseDate)), new Set([...past, next, ...future]));
  assert.ok(data.tasks.length > 350 && data.issues.length > 100);
  assert.ok(data.tasks.filter(task => task.releaseDate && task.releaseDate <= '2026-05-20').every(task => [done, review].includes(task.statusId)));
  const planned = data.tasks.filter(task => task.releaseDate > next), urgentFixes = ["production bug fix", "security library upgrade", "session timeout hotfix"].map(text => Common.term(text, 'it'));
  assert.ok(planned.length && planned.every(task => task.statusId === todo && !task.hidden && !task.highlightId && !urgentFixes.some(fix => task.description.includes(fix))));
  assert.ok(data.tasks.some(task => !task.releaseDate && task.statusId === todo));
  for (const status of [todo, doing, review, done]) assert.ok(data.tasks.some(task => task.statusId === status));
  assert.ok(data.tasks.every(task => !task.hidden || (task.statusId === done && task.releaseDate < '2026-03-25')));
  assert.ok(data.tasks.some(task => task.hidden) && data.tasks.some(task => task.statusId === done && !task.hidden));
  assert.ok(new Set(data.tasks.map(task => task.urgencyId)).size === data.settings.urgencies.length);
  assert.ok(data.tasks.some(task => /<(ul|ol|strong|em|u)>/.test(task.description)) && data.tasks.some(task => task.notes));
  assert.ok(data.tasks.some(task => task.effortHours % 8) && data.tasks.some(task => task.effortHours >= 8));
  const fields = Object.fromEntries(data.settings.taskFields.map(field => [field.id, field]));
  assert.deepEqual(Object.values(fields).map(field => field.type), ['platform', 'platform', 'parent', 'child']);
  assert.ok(['custom-ticket-platform', 'custom-change-platform'].every(id => PlatformLinks.validTemplate(fields[id].template) && fields[id].template));
  assert.equal(fields['custom-successors'].source, 'custom-predecessors');
  assert.ok(data.tasks.every(task => !('url' in task) && !('portalUrlTemplate' in data.settings)));
  assert.ok(data.tasks.some(task => TaskLinks.platformUrl(task, data.settings) === `https://tickets.example.com/browse/${task.code}`));
  assert.ok(data.tasks.some(task => TaskLinks.platformUrl(task, data.settings).startsWith('https://changes.example.com/change/')));
  assert.ok(data.tasks.every(task => TaskLinks.platformUrl(task, data.settings)));
  const dependent = data.tasks.filter(task => task.customFields['custom-predecessors']);
  assert.ok(dependent.length >= 5 && dependent.some(task => task.customFields['custom-predecessors'].length === 2));
  assert.ok(dependent.every(task => task.customFields['custom-predecessors'].every(id => id !== task.id && data.tasks.some(other => other.id === id))));
  assert.ok(data.tasks.some(task => IssueMatcher.matchIssues(task, data.issues).incidents.length >= 2));
  assert.ok(data.issues.some(issue => issue.code !== issue.code.toUpperCase()));
  assert.ok(data.issues.some(issue => !data.tasks.some(task => task.code.toLowerCase() === issue.code.trim().toLowerCase())));
  const problems = data.issues.filter(issue => issue.problem).map(issue => issue.problem);
  assert.ok(problems.length > new Set(problems).size);
  assert.ok(data.settings.themes.length >= 4);
  assert.equal(ArchiveValidator.validateData(JSON.parse(JSON.stringify(data))).tasks.length, data.tasks.length);
});
test('demo data is localized and only added to new organizations on request', () => {
  const english = DataFactory.demoData('en', new Date(2026, 4, 20, 10));
  assert.equal(english.settings.tabNames[0], 'Tasks');
  assert.ok(english.tasks.some(task => /Released to production/.test(task.notes)));
  assert.ok(!english.tasks.some(task => /Rilasciato/.test(task.notes)));
  assert.equal(DataFactory.createOrganization('Empty', 'en').data.tasks.length, 0);
  const demo = DataFactory.createOrganization('Demo', 'en', '', undefined, true);
  assert.ok(demo.data.tasks.length > 200 && demo.data.issues.length > 100);
});
test('automatic associations are case-insensitive, many-to-many and deduplicated', () => {
  const issues = [
    { code: ' abc-1 ', incident: 'INC-1', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-2', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-2', problem: 'PRB-2' },
    { code: 'OTHER', incident: 'INC-3', problem: 'PRB-3' }
  ];
  assert.deepEqual(IssueMatcher.matchIssues({ code: 'abc-1' }, issues), { incidents: ['INC-1', 'INC-2'], problems: ['PRB-1', 'PRB-2'] });
  assert.deepEqual(IssueMatcher.matchIssues({ code: 'none' }, issues), { incidents: [], problems: [] });
});

test('batch issue index preserves association order, case, empty references and independent results', () => {
  const issues = [
    { code: ' abc-1 ', incident: ' INC-1 ', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-1', problem: ' PRB-2 ' },
    { code: 'Abc-1', incident: 'inc-1', problem: '' },
    { code: 'OTHER', incident: ' ', problem: 'PRB-1' }
  ];
  const index = IssueMatcher.indexIssues(issues);
  for (const code of ['ABC-1', ' abc-1 ', 'OTHER', 'missing']) {
    assert.deepEqual(IssueMatcher.matchIssues({ code }, index), IssueMatcher.matchIssues({ code }, issues));
  }
  IssueMatcher.matchIssues({ code: 'ABC-1' }, index).incidents.push('not-an-association');
  assert.deepEqual(IssueMatcher.matchIssues({ code: 'ABC-1' }, index).incidents, ['INC-1', 'inc-1']);
  issues[0].incident = 'INC-CHANGED';
  assert.deepEqual(IssueMatcher.matchIssues({ code: 'ABC-1' }, IssueMatcher.indexIssues(issues)), IssueMatcher.matchIssues({ code: 'ABC-1' }, issues));
});
test('default sort is chronological, unplanned last and sequence as tie-breaker', () => {
  const tasks = [
    { sequence: 4, releaseDate: '' }, { sequence: 3, releaseDate: '2027-01-02' },
    { sequence: 2, releaseDate: '2027-01-01' }, { sequence: 1, releaseDate: '2027-01-01' }
  ];
  assert.deepEqual(TaskOrder.sortTasks(tasks).map(t => t.sequence), [1, 2, 3, 4]);
  assert.equal(tasks[0].sequence, 4);
});
test('multi-column sort uses each priority and numeric values', () => {
  const tasks = [{ sequence: 10, releaseDate: '2027-01-01' }, { sequence: 2, releaseDate: '2027-01-01' }, { sequence: 1, releaseDate: '2027-01-02' }];
  assert.deepEqual(TaskOrder.sortTasks(tasks, [{ key: 'releaseDate', direction: 'asc' }, { key: 'sequence', direction: 'desc' }]).map(t => t.sequence), [10, 2, 1]);
});
test('unplanned release stays last even with descending sort', () => {
  assert.deepEqual(TaskOrder.sortTasks([{ releaseDate: '', sequence: 1 }, { releaseDate: '2027-01-01', sequence: 2 }], [{ key: 'releaseDate', direction: 'desc' }]).map(t => t.sequence), [2, 1]);
});
test('date colors are stable across views and archive reloads', () => {
  assert.equal(TaskOrder.dateColor('2027-01-01'), TaskOrder.dateColor('2027-01-01'));
  assert.notEqual(TaskOrder.dateColor('2027-01-01'), TaskOrder.dateColor('2027-01-02'));
});
test('next release is the nearest scheduled date on or after today, independently of order', () => {
  const tasks = [{ releaseDate: '2026-11-18' }, { releaseDate: '' }, { releaseDate: '2026-10-28' }, { releaseDate: '2026-11-04', hidden: true }, { releaseDate: '2026-11-04' }];
  const before = structuredClone(tasks);
  assert.equal(TaskOrder.nextReleaseDate(tasks, '2026-10-31'), '2026-11-04');
  assert.deepEqual(tasks, before);
  assert.equal(TaskOrder.nextReleaseDate([...tasks].reverse(), '2026-10-31'), '2026-11-04');
});
test('a release today takes precedence even if all of its activities are hidden or completed', () => {
  assert.equal(TaskOrder.nextReleaseDate([{ releaseDate: '2026-11-01' }, { releaseDate: '2026-10-31', hidden: true, statusId: 'done' }], '2026-10-31'), '2026-10-31');
  assert.equal(TaskOrder.nextReleaseDate([{ releaseDate: Common.today() }]), Common.today());
});
test('past-only, empty and unscheduled milestones never become the next release', () => {
  for (const tasks of [[], [{ releaseDate: '' }], [{ releaseDate: '2026-10-30' }, { releaseDate: '' }]]) assert.equal(TaskOrder.nextReleaseDate(tasks, '2026-10-31'), '');
});
test('next release rolls forward across day, month, year and leap-day boundaries', () => {
  const tasks = ['2027-12-31', '2028-01-01', '2028-02-29', '2028-03-01'].map(releaseDate => ({ releaseDate }));
  for (const date of tasks.map(task => task.releaseDate)) assert.equal(TaskOrder.nextReleaseDate(tasks, date), date);
  assert.equal(TaskOrder.nextReleaseDate(tasks, '2028-01-02'), '2028-02-29');
  assert.equal(TaskOrder.nextReleaseDate(tasks, '2028-03-02'), '');
});
test('default next-release cutoff follows the local calendar rather than the UTC date', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const NativeDate = Date;
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-31T00:30:00Z'])); }
    };
    const { TaskOrder } = require(${JSON.stringify(require.resolve('../src/shared/domain'))});
    process.stdout.write(TaskOrder.nextReleaseDate([{ releaseDate: '2026-10-30' }, { releaseDate: '2026-10-31' }]));
  `;
  for (const [zone, expected] of [['America/Los_Angeles', '2026-10-30'], ['Asia/Tokyo', '2026-10-31']]) {
    assert.equal(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 10000 }), expected);
  }
});
test('invalid archives cannot overwrite portable data', () => {
  for (const mutate of [
    d => { d.version = 2; },
    d => { d.settings.appName = ' '; },
    d => { d.settings.tabNames.pop(); },
    d => { d.settings.hoursPerDay = 0; },
    d => { d.settings.statuses = []; },
    d => { d.settings.urgencies[0].color = 'red'; },
    d => { d.settings.themeId = 'missing'; },
    d => { d.tasks[0].statusId = 'missing'; },
    d => { d.tasks[0].sequence = -1; },
    d => { d.tasks[0].effortHours = NaN; },
    d => { d.tasks[0].customFields['custom-ticket-platform'] = 'PRJ\n1'; },
    d => { d.tasks[0].customFields['custom-predecessors'] = [d.tasks[0].id]; },
    d => { d.tasks[0].customFields['custom-successors'] = [d.tasks[1].id]; },
    d => { d.settings.taskFields[1].template = 'javascript:alert(1)//{code}'; },
    d => { d.settings.taskFields.pop(); d.settings.taskFields.push({ id: 'custom-orphan', name: 'Orphan', type: 'child', options: [] }); },
    d => { d.tasks[0].releaseDate = '2027-02-30'; },
    d => { d.tasks[0].hidden = 'true'; },
    d => { d.tasks.push({ ...d.tasks[0] }); },
    d => { d.issues[0].incident = null; }
  ]) {
    const data = DataFactory.initialData(); mutate(data);
    assert.throws(() => ArchiveValidator.validateData(data));
  }
});
test('repeated portal and problem codes are supported by archive validation', () => {
  const data = DataFactory.initialData();
  data.tasks[1].code = data.tasks[0].code;
  data.tasks[1].sequence = data.tasks[0].sequence;
  assert.equal(ArchiveValidator.validateData(data), data);
});
test('archive roundtrip preserves rich text, hours, themes and hidden rows', () => {
  const data = DataFactory.initialData();
  data.tasks[0].description = '<p>Rich <b>text</b></p>';
  data.tasks[0].hidden = true;
  data.tasks[0].effortHours = 10.5;
  const restored = ArchiveValidator.validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored, data);
});
test('empty workspace is valid but still has configured statuses', () => {
  const data = DataFactory.initialData(); data.tasks = []; data.issues = [];
  assert.equal(ArchiveValidator.validateData(data).tasks.length, 0);
});
function imagePixels(colors) {
  return new Uint8ClampedArray(colors.flatMap(color => {
    const rgb = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
    return [...rgb, 255];
  }));
}
test('image extraction assigns four representative colors to all theme roles', () => {
  const pixels = imagePixels(['#101820', '#303848', '#f0f4fc', '#d06090']);
  assert.deepEqual(ThemeGenerator.extractThemePalette(pixels), {
    background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090', colorCount: 4
  });
});
test('automatic extraction is independent of pixel order for a distinct palette', () => {
  const colors = ['#d06090', '#f0f4fc', '#303848', '#101820'];
  assert.deepEqual(ThemeGenerator.extractThemePalette(imagePixels(colors)), ThemeGenerator.extractThemePalette(imagePixels(colors.reverse())));
});
test('monochrome and two-color images return four valid roles and actual group count', () => {
  const single = ThemeGenerator.extractThemePalette(imagePixels(['#557799', '#557799']));
  assert.equal(single.colorCount, 1);
  for (const key of ['background', 'surface', 'text', 'accent']) assert.equal(single[key], '#557799');
  assert.deepEqual(ThemeGenerator.extractThemePalette(imagePixels(['#ffffff', '#000000'])), {
    background: '#000000', surface: '#000000', text: '#ffffff', accent: '#ffffff', colorCount: 2
  });
});
test('transparent pixels are composited on white consistently with the image preview', () => {
  const palette = ThemeGenerator.extractThemePalette(new Uint8ClampedArray([10, 20, 30, 0, 0, 0, 0, 255]));
  assert.equal(palette.text, '#ffffff');
  assert.equal(palette.background, '#000000');
});
test('empty or incomplete image data is explicitly rejected', () => {
  assert.throws(() => ThemeGenerator.extractThemePalette(new Uint8ClampedArray()));
  assert.throws(() => ThemeGenerator.extractThemePalette(new Uint8ClampedArray([1, 2, 3])));
});
test('monochrome logo themes retain visible text and accent instead of hiding the interface', () => {
  for (const color of ['#000000', '#ffffff', '#888888', '#767676', '#0066aa']) {
    const palette = ThemeGenerator.themeFromLogo(imagePixels([color]));
    assert.equal(palette.background, color);
    assert.notEqual(palette.text, palette.background);
    assert.notEqual(palette.accent, palette.background);
    assert.notEqual(palette.surface, palette.background);
    assert.ok(['#000000', '#ffffff'].includes(palette.text));
    assert.ok(contrast(palette.background, palette.text) >= 4.5);
    assert.ok(contrast(palette.surface, palette.text) >= 4.5);
    assert.ok(contrast(palette.background, palette.accent) >= 3);
    assert.ok(contrast(palette.surface, palette.accent) >= 3);
  }
});
const meetsThemeContrast = palette => contrast(palette.text, palette.background) >= 4.5 && contrast(palette.text, palette.surface) >= 4.5
  && contrast(palette.accent, palette.background) >= 3 && contrast(palette.accent, palette.surface) >= 3;
const hueOf = color => { const [r, g, b] = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16)); return Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b); };
const hueDistance = (a, b) => Math.abs(Math.atan2(Math.sin(hueOf(a) - hueOf(b)), Math.cos(hueOf(a) - hueOf(b))));
test('image themes keep colors that already meet WCAG AA unchanged', () => {
  const palette = ThemeGenerator.themeFromImage(imagePixels(['#101820', '#303848', '#f0f4fc', '#d06090']));
  assert.deepEqual(palette.adjusted, []);
  assert.deepEqual({ background: palette.background, surface: palette.surface, text: palette.text, accent: palette.accent }, palette.extracted);
  assert.deepEqual(palette.extracted, { background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090' });
  assert.equal(palette.colorCount, 4);
});
test('image themes move text and accent only as much as WCAG AA needs, keeping their hue', () => {
  const input = { background: '#1a1a2e', surface: '#24243a', text: '#6a6a90', accent: '#5a2a3a' };
  const { palette, adjusted } = ThemeGenerator.accessibleThemePalette(input);
  assert.deepEqual(adjusted, ['text', 'accent']);
  assert.equal(palette.background, input.background);
  assert.equal(palette.surface, input.surface);
  assert.ok(meetsThemeContrast(palette));
  // The smallest change: just over the thresholds, never pushed to pure white.
  assert.ok(contrast(palette.text, palette.surface) < 4.7, palette.text);
  assert.ok(Math.min(contrast(palette.accent, palette.background), contrast(palette.accent, palette.surface)) < 3.2, palette.accent);
  assert.notEqual(palette.text, '#ffffff');
  assert.ok(hueDistance(palette.text, input.text) < 0.15, palette.text);
  assert.ok(hueDistance(palette.accent, input.accent) < 0.15, palette.accent);
  const darkText = ThemeGenerator.accessibleThemePalette({ background: '#f4efe6', surface: '#ffffff', text: '#a08a70', accent: '#2a6cf0' });
  assert.deepEqual(darkText.adjusted, ['text']);
  assert.ok(meetsThemeContrast(darkText.palette));
  assert.ok(Math.min(contrast(darkText.palette.text, darkText.palette.background), contrast(darkText.palette.text, darkText.palette.surface)) < 4.7 && darkText.palette.text !== '#000000');
});
test('image themes move the surface when no text color can be read on both background and surface', () => {
  // Text needs luminance >= 0.31 on #303030 but <= 0.183 on white: no text color satisfies both.
  const { palette, adjusted } = ThemeGenerator.accessibleThemePalette({ background: '#303030', surface: '#ffffff', text: '#909090', accent: '#ff0000' });
  assert.equal(palette.background, '#303030');
  assert.ok(adjusted.includes('surface') && adjusted.includes('text'));
  assert.ok(meetsThemeContrast(palette), JSON.stringify(palette));
});
test('every image palette satisfies WCAG AA, keeps its background and is stable once corrected', () => {
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const color = () => '#' + Math.floor(random() * 0x1000000).toString(16).padStart(6, '0');
  for (let i = 0; i < 400; i++) {
    const input = { background: color(), surface: color(), text: color(), accent: color() };
    const { palette } = ThemeGenerator.accessibleThemePalette(input);
    assert.equal(palette.background, input.background);
    assert.ok(meetsThemeContrast(palette), JSON.stringify({ input, palette }));
    assert.deepEqual(ThemeGenerator.accessibleThemePalette(palette).adjusted, []);
  }
  for (const single of ['#557799', '#000000', '#ffffff', '#767676']) assert.ok(meetsThemeContrast(ThemeGenerator.themeFromImage(imagePixels([single]))), single);
});
test('filled accent buttons and gradient icons stay readable on every built-in theme', () => {
  for (const theme of ThemeCatalog.defaultThemes()) {
    const label = ThemeGenerator.onAccentColor(theme);
    assert.ok(contrast(label, theme.accent) >= 4.5, theme.id);
    const icons = ThemeGenerator.iconPalette(theme);
    assert.deepEqual(Object.keys(icons).sort(), [...Object.keys(ThemeGenerator.ICON_FAMILIES), 'accent'].sort());
    for (const [family, stops] of Object.entries(icons)) {
      assert.equal(stops.length, 2);
      for (const stop of stops) assert.ok(contrast(stop, theme.background) >= 3 && contrast(stop, theme.surface) >= 3, `${theme.id} ${family} ${stop}`);
    }
  }
  assert.equal(ThemeGenerator.onAccentColor({ background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#a392ff' }), '#10131c');
  assert.ok(contrast(ThemeGenerator.onAccentColor({ background: '#ffffff', surface: '#f4f4f4', text: '#111111', accent: '#3b82f6' }), '#3b82f6') >= 4.5);
});
test('legacy archive migrates without losing task IDs, settings, associations or themes', () => {
  const legacy = DataFactory.initialData();
  legacy.settings.appName = 'Legacy organization';
  delete legacy.settings.logo; delete legacy.settings.language;
  const original = JSON.parse(JSON.stringify(legacy));
  const archive = ArchiveValidator.migrateArchive(legacy);
  assert.equal(archive.version, 2);
  assert.equal(archive.organizations.length, 1);
  assert.equal(archive.activeOrganizationId, archive.organizations[0].id);
  assert.deepEqual(archive.organizations[0].data.tasks, legacy.tasks);
  assert.deepEqual(archive.organizations[0].data.issues, legacy.issues);
  assert.deepEqual(archive.organizations[0].data.settings.themes, legacy.settings.themes);
  assert.equal(archive.organizations[0].data.settings.language, 'it');
  assert.equal(archive.organizations[0].data.settings.logo, '');
  assert.equal(archive.organizations[0].name, 'Legacy organization');
  assert.equal(archive.organizations[0].data.settings.appName, undefined);
  assert.deepEqual(legacy, original);
});
test('legacy archives without an app title name their only organization in the archive language', () => {
  const italian = DataFactory.initialData(), english = DataFactory.initialData();
  english.settings.language = 'en';
  assert.equal(ArchiveValidator.migrateArchive(italian).organizations[0].name, 'Organizzazione principale');
  assert.equal(ArchiveValidator.migrateArchive(english).organizations[0].name, 'Main organization');
});
test('the renamed built-in theme drops its old Italian name in archives and imported files', () => {
  const legacy = DataFactory.initialData();
  legacy.settings.themes.find(theme => theme.id === 'daylight').name = 'Luce';
  legacy.settings.themes.push({ id: 'luce', name: 'Luce', background: '#ffffff', surface: '#f0f0f0', text: '#111111', accent: '#2255aa' });
  const themes = ArchiveValidator.migrateArchive(legacy).organizations[0].data.settings.themes;
  assert.equal(themes.find(theme => theme.id === 'daylight').name, 'Daylight');
  assert.equal(themes.find(theme => theme.id === 'luce').name, 'Luce');
  const source = DataFactory.baseData('en');
  source.settings.themes.find(theme => theme.id === 'daylight').name = 'Luce';
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'themes'));
  assert.equal(OrganizationTransfer.applyOrganizationImport(DataFactory.baseData('it'), file, { themes: true }).settings.themes.find(theme => theme.id === 'daylight').name, 'Daylight');
});
test('new organizations have independent empty workspaces and localized defaults', () => {
  const first = DataFactory.createOrganization('First', 'it'), second = DataFactory.createOrganization('Second', 'en');
  assert.equal(second.data.settings.tabNames[0], 'Tasks');
  assert.equal(second.data.settings.statuses[0].name, 'To do');
  assert.equal(first.data.tasks.length, 0);
  assert.equal(second.data.issues.length, 0);
  assert.notEqual(first.data.settings.statuses[0].id, second.data.settings.statuses[0].id);
  first.data.settings.themes[0].accent = '#ff0000';
  assert.notEqual(second.data.settings.themes[0].accent, '#ff0000');
  assert.equal(Common.APP_NAME, 'OrbitKanban');
  assert.equal(first.data.settings.appName, undefined);
  assert.equal(second.data.settings.appName, undefined);
});
test('organization creation validates and includes the logo and generated theme atomically', () => {
  const logo = 'data:image/png;base64,aGVsbG8=';
  const palette = { background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090' };
  const organization = DataFactory.createOrganization('Logo organization', 'en', logo, palette);
  assert.equal(organization.data.settings.logo, logo);
  assert.equal(organization.data.settings.themeId, 'organization-logo');
  assert.deepEqual(organization.data.settings.themes.at(-1), { id: 'organization-logo', name: 'Theme from logo', ...palette });
  assert.throws(() => DataFactory.createOrganization('Invalid', 'it', 'https://remote/logo.png', palette));
  assert.throws(() => DataFactory.createOrganization('Invalid', 'it', logo));
  assert.throws(() => DataFactory.createOrganization('Invalid', 'it', logo, { ...palette, accent: 'red' }));
});
test('existing multi-organization names, logos and themes survive removal of obsolete app names', () => {
  const archive = ArchiveValidator.migrateArchive(DataFactory.initialData());
  archive.organizations[0].data.settings.appName = 'Obsolete app title';
  archive.organizations[0].name = 'Existing organization';
  archive.organizations[0].data.settings.logo = 'data:image/png;base64,aGVsbG8=';
  const migrated = ArchiveValidator.migrateArchive(archive);
  assert.equal(migrated.organizations[0].name, 'Existing organization');
  assert.equal(migrated.organizations[0].data.settings.logo, archive.organizations[0].data.settings.logo);
  assert.deepEqual(migrated.organizations[0].data.settings.themes, archive.organizations[0].data.settings.themes);
  assert.equal(migrated.organizations[0].data.settings.appName, undefined);
  assert.equal(archive.organizations[0].data.settings.appName, 'Obsolete app title');
});
test('multi-organization archive roundtrip retains logos, languages and selection', () => {
  const archive = ArchiveValidator.migrateArchive(DataFactory.initialData());
  const organization = DataFactory.createOrganization('English organization', 'en');
  organization.data.settings.logo = 'data:image/png;base64,aGVsbG8=';
  archive.organizations.push(organization);
  archive.activeOrganizationId = organization.id;
  assert.deepEqual(ArchiveValidator.migrateArchive(JSON.parse(JSON.stringify(archive))), archive);
});
test('invalid organization archives, logo sources and unsupported languages are rejected', () => {
  const archive = ArchiveValidator.migrateArchive(DataFactory.initialData());
  for (const mutate of [
    a => { a.organizations = []; },
    a => { a.activeOrganizationId = 'missing'; },
    a => { a.organizations.push(structuredClone(a.organizations[0])); },
    a => { a.organizations[0].name = ' '; },
    a => { a.organizations[0].data.settings.language = 'Français'; },
    a => { a.organizations[0].data.settings.language = 'EN'; },
    a => { a.organizations[0].data.settings.logo = 'https://remote/logo.png'; },
    a => { a.organizations[0].data.settings.logo = 'data:image/svg+xml;base64,aGVsbG8='; }
  ]) {
    const invalid = structuredClone(archive); mutate(invalid);
    assert.throws(() => ArchiveValidator.validateArchive(invalid));
  }
  assert.throws(() => DataFactory.createOrganization(' '));
  assert.throws(() => DataFactory.createOrganization('Bad language', 'english'), /unsupported language/i);
  const portable = structuredClone(archive);
  portable.organizations[0].data.settings.language = 'pt-BR';
  assert.equal(ArchiveValidator.validateArchive(portable).organizations[0].data.settings.language, 'pt-BR');
});

test('platform links come from the first column in list order that resolves to a web address', () => {
  const settings = DataFactory.baseData('en').settings;
  settings.taskFields = [
    { id: 'custom-tickets', name: 'Tickets', type: 'platform', options: [], template: 'https://tickets.example.com/browse/{code}' },
    { id: 'custom-changes', name: 'Changes', type: 'platform', options: [], template: 'https://changes.example.com/c/<code>?ref={CODE}' },
    { id: 'custom-site', name: 'Site', type: 'url', options: [] }
  ];
  const task = customFields => ({ code: 'PRJ-7', customFields });
  assert.equal(TaskLinks.platformUrl(task({ 'custom-tickets': 'PRJ 7/A' }), settings), 'https://tickets.example.com/browse/PRJ%207%2FA');
  assert.equal(TaskLinks.platformUrl(task({ 'custom-changes': 'X-1' }), settings), 'https://changes.example.com/c/X-1?ref=X-1');
  assert.equal(TaskLinks.platformUrl(task({ 'custom-tickets': 'https://other.example.com/7', 'custom-changes': 'X-1' }), settings), 'https://other.example.com/7');
  assert.equal(TaskLinks.platformUrl(task({ 'custom-site': 'https://www.example.com' }), settings), '');
  assert.equal(TaskLinks.platformUrl(task({}), settings), '');
  assert.equal(TaskLinks.platformUrl({ code: 'PRJ-7' }, settings), '');
  settings.taskColumns = TaskColumns.normalizeTaskColumns([{ id: 'custom-changes', visible: false }, { id: 'custom-tickets', visible: true }], settings.taskFields);
  assert.equal(TaskLinks.platformUrl(task({ 'custom-tickets': 'A', 'custom-changes': 'B' }), settings), 'https://changes.example.com/c/B?ref=B');
  settings.taskFields[1].template = '';
  assert.equal(TaskLinks.platformUrl(task({ 'custom-tickets': 'A', 'custom-changes': 'B' }), settings), 'https://tickets.example.com/browse/A');
  // Templates saved before the source moved to English use the Italian placeholder.
  assert.equal(PlatformLinks.fillTemplate('https://tickets.example.com/<codice>/detail?ref={codice}', ' X-1 '), 'https://tickets.example.com/X-1/detail?ref=X-1');
  assert.equal(PlatformLinks.normalizeUrl(' tickets.example.com/{code} '), 'https://tickets.example.com/{code}');
  assert.equal(PlatformLinks.normalizeUrl('http://intranet:8080/{code}'), 'http://intranet:8080/{code}');
  assert.equal(PlatformLinks.normalizeUrl(''), '');
  for (const valid of ['', 'https://tickets.example.com/browse/{code}', 'http://tickets.example.com/{code}/x', 'https://{code}.tickets.example.com', 'https://tickets.example.com/browse/{codice}']) assert.ok(PlatformLinks.validTemplate(valid), valid);
  for (const invalid of ['https://tickets.example.com/browse/', 'ftp://host/{code}', 'javascript:alert(1)//{code}', 'https:// space/{code}', 'tickets.example.com/{code}']) assert.ok(!PlatformLinks.validTemplate(invalid), invalid);
  assert.ok(PlatformLinks.isWebUrl('https://tickets.example.com/browse/PRJ-1') && !PlatformLinks.isWebUrl('javascript:alert(1)') && !PlatformLinks.isWebUrl('https://') && !PlatformLinks.isWebUrl(42));
});
const legacyLinkData = (template = 'https://tickets.example.com/browse/{code}') => {
  const data = DataFactory.baseData('en'), task = (id, code, url) => ({ id, code, sequence: 1, url, description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false });
  data.settings.portalUrlTemplate = template;
  data.settings.taskColumns = data.settings.taskColumns.flatMap(column => column.id === 'code' ? [column, { id: 'link', visible: true }] : [column]);
  data.settings.requiredTaskColumns = ['sequence', 'link'];
  data.settings.savedViews = [{ id: 'v', name: 'View', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'releaseDate', direction: 'asc' }], columns: [{ id: 'code', visible: true }, { id: 'link', visible: true }], columnFilters: { link: { text: 'PRJ', values: [], min: '', max: '', empty: 'any' } } }];
  data.settings.taskEditorLayout.columns[0].sections[0].fields.splice(1, 0, { id: 'link', span: 2 });
  data.tasks = [task('a', 'PRJ-1', 'https://other.example.com/item/1'), task('b', 'PRJ-2', ''), task('c', '', ''), task('d', 'PRJ-4', 'javascript:alert(1)')];
  return data;
};
test('the built-in portal link of older archives becomes a "Link to platform" column with its template', () => {
  const data = ArchiveValidator.migrateArchive(legacyLinkData()).organizations[0].data, settings = data.settings;
  const field = settings.taskFields.find(item => item.id === 'custom-platform-link');
  assert.deepEqual(field, { id: 'custom-platform-link', name: 'Link to platform', type: 'platform', options: [], template: 'https://tickets.example.com/browse/{code}' });
  assert.ok(!('portalUrlTemplate' in settings) && data.tasks.every(task => !('url' in task)));
  assert.deepEqual(data.tasks.map(task => task.customFields?.[field.id]), ['https://other.example.com/item/1', 'PRJ-2', undefined, 'PRJ-4']);
  assert.deepEqual(data.tasks.map(task => TaskLinks.platformUrl(task, settings)), ['https://other.example.com/item/1', 'https://tickets.example.com/browse/PRJ-2', '', 'https://tickets.example.com/browse/PRJ-4']);
  const ids = settings.taskColumns.map(column => column.id);
  assert.equal(ids.indexOf(field.id), ids.indexOf('code') + 1);
  assert.ok(!ids.includes('link'));
  assert.deepEqual(settings.requiredTaskColumns, ['sequence', field.id]);
  assert.deepEqual(settings.savedViews[0].columns.map(column => column.id), ['code', field.id]);
  assert.deepEqual(Object.keys(settings.savedViews[0].columnFilters), [field.id]);
  assert.equal(settings.taskEditorLayout.columns[0].sections[0].fields[1].id, field.id);
  assert.ok(!JSON.stringify(settings.taskEditorLayout).includes('"link"'));
  assert.ok(!('portalUrlTemplate' in DataFactory.createOrganization('New').data.settings));
  assert.ok(!DataFactory.createOrganization('New').data.settings.taskFields.length);
  const italian = legacyLinkData('');
  italian.settings.language = 'it';
  italian.settings.taskFields = [{ id: 'custom-platform-link', name: 'Link alla piattaforma', type: 'text', options: [] }];
  const migrated = ArchiveValidator.migrateArchive(italian).organizations[0].data;
  const added = migrated.settings.taskFields.find(item => item.type === 'platform');
  assert.notEqual(added.id, 'custom-platform-link');
  assert.deepEqual([added.name, added.template], ['Link alla piattaforma 2', '']);
  assert.deepEqual(migrated.tasks.map(task => task.customFields?.[added.id]), ['https://other.example.com/item/1', undefined, undefined, undefined]);
});
test('a deleted or invalid legacy portal link migrates without leaving dangling references', () => {
  const deleted = legacyLinkData();
  deleted.settings.deletedTaskColumns = ['link'];
  deleted.settings.taskColumns = deleted.settings.taskColumns.filter(column => column.id !== 'link');
  const data = ArchiveValidator.migrateArchive(deleted).organizations[0].data;
  assert.deepEqual(data.settings.taskFields, []);
  assert.deepEqual(data.settings.deletedTaskColumns, []);
  assert.deepEqual(data.settings.requiredTaskColumns, ['sequence']);
  assert.deepEqual(data.settings.savedViews[0].columns.map(column => column.id), ['code']);
  assert.deepEqual(data.settings.savedViews[0].columnFilters, {});
  assert.ok(data.tasks.every(task => !('url' in task) && !task.customFields));
  const invalid = legacyLinkData('javascript:alert(1)//{code}');
  const fixed = ArchiveValidator.migrateArchive(invalid).organizations[0].data;
  assert.equal(fixed.settings.taskFields[0].template, '');
  assert.equal(fixed.tasks[1].customFields, undefined);
  const settingsOnly = DataFactory.baseData('en').settings;
  settingsOnly.portalUrlTemplate = 'https://tickets.example.com/{code}';
  assert.equal(TaskLinks.upgradeLegacyLink(settingsOnly, []), true);
  assert.equal(settingsOnly.taskFields.at(-1).template, 'https://tickets.example.com/{code}');
  assert.equal(TaskLinks.upgradeLegacyLink(settingsOnly, []), false);
  assert.equal(TaskLinks.upgradeLegacyLink(null, []), false);
});
test('older organization files keep their portal links, also when only the data part is imported', () => {
  const source = legacyLinkData(), current = DataFactory.baseData('en');
  const file = OrganizationTransfer.organizationExport({ name: 'Old', data: source }, 'organization');
  file.settings.portalUrlTemplate = source.settings.portalUrlTemplate;
  file.settings.taskColumns = source.settings.taskColumns;
  const parsed = OrganizationTransfer.parseOrganizationFile(file);
  assert.ok(!('portalUrlTemplate' in parsed.settings) && parsed.data.tasks.every(task => !('url' in task)));
  const created = OrganizationTransfer.importedOrganizationData(parsed, { themes: true, settings: true, data: true }, 'en');
  const field = created.settings.taskFields.find(item => item.type === 'platform');
  assert.equal(field.template, 'https://tickets.example.com/browse/{code}');
  assert.deepEqual(created.tasks.map(task => TaskLinks.platformUrl(task, created.settings)), ['https://other.example.com/item/1', 'https://tickets.example.com/browse/PRJ-2', '', 'https://tickets.example.com/browse/PRJ-4']);
  const dataFile = OrganizationTransfer.organizationExport({ name: 'Old', data: source }, 'data');
  const dataOnly = OrganizationTransfer.applyOrganizationImport(current, OrganizationTransfer.parseOrganizationFile(dataFile), { data: true });
  const column = dataOnly.settings.taskFields.find(item => item.type === 'platform');
  assert.equal(column.template, '');
  assert.deepEqual(dataOnly.tasks.map(task => task.customFields?.[column.id]), ['https://other.example.com/item/1', 'PRJ-2', undefined, 'PRJ-4']);
});

const sampleOrganization = () => {
  const data = DataFactory.demoData('it', new Date(2026, 4, 20, 10));
  data.settings.logo = 'data:image/png;base64,iVBORw0KGgo=';
  return { id: 'org-1', name: 'Àcme Srl / Team #1', data };
};
const sections = file => ['themes', 'settings', 'data'].filter(part => part in file);
test('organization exports contain only the requested parts as independent copies', () => {
  const organization = sampleOrganization(), exportedAt = '2026-05-20T08:00:00.000Z';
  assert.deepEqual(OrganizationTransfer.ORGANIZATION_FILE_KINDS, ['themes', 'settings', 'data', 'organization']);
  const files = Object.fromEntries(OrganizationTransfer.ORGANIZATION_FILE_KINDS.map(kind => [kind, OrganizationTransfer.organizationExport(organization, kind, { appVersion: '2.1.0', exportedAt })]));
  for (const [kind, file] of Object.entries(files)) {
    assert.deepEqual([file.format, file.version, file.kind, file.exportedAt, file.appVersion], ['orbitkanban-organization', 1, kind, exportedAt, '2.1.0']);
    assert.deepEqual(file.organization, { name: organization.name });
  }
  assert.deepEqual(sections(files.themes), ['themes']);
  assert.deepEqual(sections(files.settings), ['settings']);
  assert.deepEqual(sections(files.data), ['data']);
  assert.deepEqual(sections(files.organization), ['themes', 'settings', 'data']);
  assert.deepEqual(files.themes.themes, { themeId: organization.data.settings.themeId, themes: organization.data.settings.themes });
  assert.deepEqual(Object.keys(files.settings.settings).sort(), ['deletedIssueColumns', 'deletedTaskColumns', 'fontFamily', 'fontSizes', 'highlights', 'hoursPerDay', 'issueColumns', 'issueFields', 'language', 'logo', 'requiredIssueColumns', 'requiredTaskColumns', 'savedViews', 'statuses', 'tabNames', 'tags', 'taskColumns', 'taskEditorLayout', 'taskFields', 'urgencies']);
  assert.deepEqual(files.settings.settings.highlights, organization.data.settings.highlights);
  assert.deepEqual(files.data.data.highlights, organization.data.settings.highlights);
  assert.deepEqual(files.settings.settings.fontSizes, Typography.defaultFontSizes());
  assert.deepEqual(files.settings.settings.savedViews, []);
  assert.equal(files.settings.settings.logo, organization.data.settings.logo);
  assert.deepEqual(files.data.data.statuses, organization.data.settings.statuses);
  assert.equal(files.data.data.tasks.length, organization.data.tasks.length);
  files.data.data.tasks[0].code = 'CHANGED';
  files.themes.themes.themes[0].accent = '#000000';
  assert.notEqual(organization.data.tasks[0].code, 'CHANGED');
  assert.notEqual(organization.data.settings.themes[0].accent, '#000000');
  assert.throws(() => OrganizationTransfer.organizationExport(organization, 'backup'), /unsupported/i);
});
test('organization file names are portable slugs with the localized part and date', () => {
  assert.equal(OrganizationTransfer.organizationFileName('Àcme Srl / Team #1', 'themes', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-temi-2026-05-20.json');
  assert.equal(OrganizationTransfer.organizationFileName('Àcme Srl / Team #1', 'settings', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-configurazione-2026-05-20.json');
  assert.equal(OrganizationTransfer.organizationFileName('Acme', 'data', 'en', '2026-05-20'), 'OrbitKanban-acme-data-2026-05-20.json');
  assert.equal(OrganizationTransfer.organizationFileName('Acme', 'organization', 'en', '2026-05-20'), 'OrbitKanban-acme-organization-2026-05-20.json');
  assert.equal(OrganizationTransfer.organizationFileName('***', 'data', 'it', '2026-05-20'), 'OrbitKanban-organizzazione-dati-2026-05-20.json');
  assert.match(OrganizationTransfer.organizationFileName('x'.repeat(200), 'themes', 'en'), /^OrbitKanban-x{60}-themes-\d{4}-\d{2}-\d{2}\.json$/);
  assert.throws(() => OrganizationTransfer.organizationFileName('Acme', 'backup'), /unsupported/i);
  assert.equal(OrganizationTransfer.situationFileName('Àcme Srl / Team #1', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-situazione-2026-05-20.xlsx');
  assert.equal(OrganizationTransfer.situationFileName('Acme', 'en', '2026-05-20'), 'OrbitKanban-acme-situation-2026-05-20.xlsx');
  assert.equal(OrganizationTransfer.situationFileName('***', 'it', '2026-05-20'), 'OrbitKanban-organizzazione-situazione-2026-05-20.xlsx');
  assert.match(OrganizationTransfer.situationFileName('Acme'), /^OrbitKanban-acme-situazione-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
test('organization files are validated, stripped of unknown fields and never confused with backups', () => {
  const organization = sampleOrganization();
  const file = OrganizationTransfer.organizationExport(organization, 'organization', { appVersion: '2.1.0' });
  Object.assign(file, { extra: 'x' });
  file.themes.themes[0].script = '<script>';
  file.settings.themes = 'ignored';
  file.data.tasks[0].injected = true;
  const parsed = OrganizationTransfer.parseOrganizationFile(JSON.stringify(file));
  assert.deepEqual([parsed.kind, parsed.parts, parsed.appVersion, parsed.organization.name], ['organization', ['themes', 'settings', 'data'], '2.1.0', organization.name]);
  assert.ok(!('extra' in parsed) && !('script' in parsed.themes.themes[0]) && !('themes' in parsed.settings) && !('injected' in parsed.data.tasks[0]));
  assert.deepEqual(parsed.data.tasks.map(t => t.id), organization.data.tasks.map(t => t.id));
  assert.equal(OrganizationTransfer.parseOrganizationFile('\uFEFF' + JSON.stringify(OrganizationTransfer.organizationExport(organization, 'themes'))).themes.themeId, organization.data.settings.themeId);
  assert.deepEqual([OrganizationTransfer.parseOrganizationFile({ ...file, appVersion: '<b>', exportedAt: 'yesterday' }).appVersion, OrganizationTransfer.parseOrganizationFile({ ...file, exportedAt: 'yesterday' }).exportedAt], ['', '']);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile('{ broken'), /valid JSON/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile('[]'), /organization export/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile(JSON.stringify(ArchiveValidator.migrateArchive(DataFactory.initialData()))), /full archive backup/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile(DataFactory.initialData()), /full archive backup/i);
  assert.throws(() => ArchiveValidator.migrateArchive(file), /organization export/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, format: 'other' }), /organization export/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, version: 2 }), /newer version/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, version: 0 }), /file version/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, kind: 'archive' }), /unsupported export type/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, data: undefined }), /does not contain data/i);
  assert.throws(() => OrganizationTransfer.parseOrganizationFile({ ...file, organization: { name: 'x'.repeat(101) } }), /organization name/i);
  const broken = (change, pattern) => { const copy = structuredClone(file); change(copy); assert.throws(() => OrganizationTransfer.parseOrganizationFile(copy), pattern); };
  broken(copy => { copy.data.tasks[0].statusId = 'nonexistent'; }, /status or urgency/i);
  broken(copy => { copy.data.tasks = 'all'; }, /invalid task list/i);
  broken(copy => { copy.themes.themeId = 'nonexistent'; }, /selected theme/i);
  broken(copy => { copy.themes.themes[0].accent = 'red'; }, /invalid themes/i);
  broken(copy => { copy.settings.logo = 'data:image/svg+xml;base64,AAAA'; }, /invalid logo/i);
  broken(copy => { copy.settings.language = 'fr_FR'; }, /unsupported language/i);
  broken(copy => { copy.settings.taskFields[0].template = 'javascript:alert(1)//{code}'; }, /platform link template/i);
  broken(copy => { copy.data.taskFields[2].type = 'text'; }, /successor column/i);
  broken(copy => { copy.data.tasks[0].customFields['custom-predecessors'] = [copy.data.tasks[0].id]; }, /depend on itself/i);
});
test('importing settings remaps existing tasks by name, then position, and keeps the logo unless requested', () => {
  const current = DataFactory.demoData('it', new Date(2026, 4, 20, 10));
  current.settings.logo = 'data:image/png;base64,AAAA';
  const [todo, doing, review, done] = current.settings.statuses.map(status => status.id);
  const source = DataFactory.baseData('en');
  source.settings.statuses = [{ id: 'x-done', name: ` ${current.settings.statuses[3].name.toUpperCase()} `, color: '#00aa00', highlight: false }, { id: 'x-open', name: 'Open', color: '#0000aa', highlight: true }];
  Object.assign(source.settings, { logo: 'data:image/png;base64,BBBB', hoursPerDay: 7 });
  const raw = OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'settings');
  raw.settings.portalUrlTemplate = 'https://tickets.example.com/browse/{code}';
  const file = OrganizationTransfer.parseOrganizationFile(raw);
  const result = OrganizationTransfer.applyOrganizationImport(current, file, { settings: true });
  const expectedStatus = { [todo]: 'x-done', [doing]: 'x-open', [review]: 'x-open', [done]: 'x-done' };
  for (const original of current.tasks) {
    const imported = result.tasks.find(t => t.id === original.id);
    assert.equal(imported.statusId, expectedStatus[original.statusId]);
    assert.equal(imported.urgencyId, source.settings.urgencies[current.settings.urgencies.findIndex(u => u.id === original.urgencyId)].id);
  }
  assert.deepEqual(result.issues, current.issues);
  assert.deepEqual([result.settings.language, result.settings.hoursPerDay, result.settings.tabNames], ['en', 7, source.settings.tabNames]);
  const platform = result.settings.taskFields.find(field => field.name === 'Link to platform');
  assert.deepEqual([platform.type, platform.template, 'portalUrlTemplate' in result.settings], ['platform', 'https://tickets.example.com/browse/{code}', false]);
  assert.deepEqual(result.settings.taskFields.slice(0, current.settings.taskFields.length), current.settings.taskFields);
  assert.deepEqual([result.settings.logo, result.settings.themeId, result.settings.themes], [current.settings.logo, current.settings.themeId, current.settings.themes]);
  assert.equal(OrganizationTransfer.applyOrganizationImport(current, file, { settings: true, logo: true }).settings.logo, 'data:image/png;base64,BBBB');
  assert.equal(current.settings.language, 'it');
  assert.throws(() => OrganizationTransfer.applyOrganizationImport(current, file, { themes: true, data: true }), /at least one part/i);
});
test('importing themes merges by identifier and activates the file theme only on request', () => {
  const current = DataFactory.baseData('it'), source = DataFactory.baseData('en');
  source.settings.themes[0] = { ...source.settings.themes[0], name: 'Midnight 2', accent: '#ff0000' };
  source.settings.themes.push({ id: 'brand', name: 'Brand', background: '#000000', surface: '#111111', text: '#ffffff', accent: '#ff7a59' });
  source.settings.themeId = 'brand';
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'themes'));
  const kept = OrganizationTransfer.applyOrganizationImport(current, file, { themes: true });
  assert.equal(kept.settings.themeId, current.settings.themeId);
  assert.deepEqual(kept.settings.themes.map(theme => theme.id), [...ThemeCatalog.defaultThemes().map(theme => theme.id), 'brand']);
  assert.deepEqual([kept.settings.themes[0].name, kept.settings.themes[0].accent], ['Midnight 2', '#ff0000']);
  const activated = OrganizationTransfer.applyOrganizationImport(current, file, { themes: true, activateTheme: true });
  assert.equal(activated.settings.themeId, 'brand');
  assert.deepEqual([activated.settings.statuses, activated.tasks], [current.settings.statuses, current.tasks]);
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(activated, file, { themes: true, activateTheme: true }), activated);
});
test('importing data merges idempotently by identifier or replaces everything, remapping statuses', () => {
  const current = DataFactory.baseData('it');
  const existing = { id: 'keep', code: 'KEEP-1', sequence: 1, description: '', notes: '', releaseDate: '', statusId: current.settings.statuses[0].id, urgencyId: current.settings.urgencies[0].id, effortHours: 1, hidden: false };
  current.tasks = [existing, { ...existing, id: 'shared', code: 'OLD-2', sequence: 2 }];
  current.issues = [{ id: 'i-keep', code: 'KEEP-1', incident: 'INC-1', problem: '' }, { id: 'i-same', code: 'new-1', incident: 'inc-9', problem: 'prb-9' }];
  const source = DataFactory.baseData('en');
  source.settings.statuses[2].name = current.settings.statuses[1].name.toLowerCase();
  const make = (id, code, statusIndex) => ({ ...existing, id, code, statusId: source.settings.statuses[statusIndex].id, urgencyId: source.settings.urgencies[3].id });
  source.tasks = [make('shared', 'NEW-2', 2), make('fresh', 'NEW-1', 3)];
  source.issues = [{ id: 'i-new', code: 'NEW-1', incident: 'INC-9', problem: 'PRB-9' }, { id: 'i-other', code: 'NEW-2', incident: '', problem: 'PRB-2' }];
  const file = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Source', data: source }, 'data'));
  const merged = OrganizationTransfer.applyOrganizationImport(current, file, { data: true });
  assert.deepEqual(merged.tasks.map(t => [t.id, t.code]), [['keep', 'KEEP-1'], ['shared', 'NEW-2'], ['fresh', 'NEW-1']]);
  assert.deepEqual([merged.tasks[1].statusId, merged.tasks[2].statusId, merged.tasks[2].urgencyId], [current.settings.statuses[1].id, current.settings.statuses[3].id, current.settings.urgencies[3].id]);
  assert.deepEqual(merged.issues.map(issue => issue.id), ['i-keep', 'i-same', 'i-other']);
  assert.equal(IssueMatcher.matchIssues(merged.tasks[2], merged.issues).incidents[0], 'inc-9');
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(merged, file, { data: true }), merged);
  assert.deepEqual(merged.settings, current.settings);
  const replaced = OrganizationTransfer.applyOrganizationImport(current, file, { data: true, dataMode: 'replace' });
  assert.deepEqual([replaced.tasks.map(t => t.id), replaced.issues.map(issue => issue.id)], [['shared', 'fresh'], ['i-new', 'i-other']]);
  assert.deepEqual(replaced.settings, current.settings);
});
test('new organizations created from files keep the statuses, logo and language of the file', () => {
  const source = DataFactory.demoData('en', new Date(2026, 4, 20, 10));
  source.settings.statuses[0].name = 'Backlog';
  source.settings.logo = 'data:image/png;base64,CCCC';
  const exported = kind => OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Remote', data: source }, kind));
  const full = exported('organization');
  const created = OrganizationTransfer.importedOrganizationData(full, { themes: true, activateTheme: true, settings: true, data: true }, 'it');
  assert.deepEqual([created.settings.language, created.settings.logo, created.settings.themeId], ['en', source.settings.logo, source.settings.themeId]);
  assert.deepEqual([created.settings.statuses, created.tasks, created.issues], [source.settings.statuses, source.tasks, source.issues]);
  const dataOnly = OrganizationTransfer.importedOrganizationData(exported('data'), { data: true }, 'it');
  assert.deepEqual([dataOnly.settings.language, dataOnly.settings.logo, dataOnly.settings.statuses, dataOnly.tasks], ['it', '', source.settings.statuses, source.tasks]);
  const themesOnly = OrganizationTransfer.importedOrganizationData(exported('themes'), { themes: true }, 'en');
  assert.deepEqual([themesOnly.settings.language, themesOnly.settings.themeId, themesOnly.tasks], ['en', 'midnight', []]);
  assert.ok(themesOnly.settings.themes.some(theme => theme.id === 'aurora'));
  assert.throws(() => OrganizationTransfer.importedOrganizationData(full, {}, 'it'), /at least one part/i);
});
test('imported organization names stay unique, case-insensitive and within limits', () => {
  assert.equal(OrganizationTransfer.uniqueOrganizationName('Acme', ['Beta']), 'Acme');
  assert.equal(OrganizationTransfer.uniqueOrganizationName(' acme ', ['Acme', 'ACME (2)']), 'acme (3)');
  assert.equal(OrganizationTransfer.uniqueOrganizationName('', ['Imported organization'], 'Imported organization'), 'Imported organization (2)');
  assert.equal(OrganizationTransfer.uniqueOrganizationName(undefined, [], 'Imported organization'), 'Imported organization');
  const long = OrganizationTransfer.uniqueOrganizationName('x'.repeat(120), ['x'.repeat(100)]);
  assert.deepEqual([long.length, long.endsWith('x (2)')], [100, true]);
});
test('text sizes have per-part limits in 5% steps and older archives get the defaults', () => {
  assert.deepEqual(Typography.FONT_SIZE_PARTS.map(part => part.id), ['base', 'sidebar', 'headings', 'tables', 'milestones', 'kanban', 'dialogs']);
  assert.ok(Typography.FONT_SIZE_PARTS.every(part => part.min >= 80 && part.min < 100 && part.max > 100 && part.max <= 150 && part.min % Typography.FONT_SIZE_STEP === 0 && part.max % Typography.FONT_SIZE_STEP === 0));
  assert.ok(Object.values(Typography.defaultFontSizes()).every(value => value === 100));
  assert.deepEqual(DataFactory.baseData('en').settings.fontSizes, Typography.defaultFontSizes());
  assert.deepEqual([Typography.clampFontSize('sidebar', 147), Typography.clampFontSize('base', 87), Typography.clampFontSize('kanban', 12), Typography.clampFontSize('dialogs', '112'), Typography.clampFontSize('tables', 'x')], [130, 85, 80, 110, 100]);
  const data = DataFactory.baseData('it');
  const invalid = [s => { s.tables = 100.5; }, s => { s.tables = 155; }, s => { s.sidebar = 135; }, s => { s.base = 75; }, s => { s.kanban = '100'; }, s => { s.extra = 100; }, s => { delete s.dialogs; }];
  for (const change of invalid) {
    const copy = structuredClone(data);
    change(copy.settings.fontSizes);
    assert.throws(() => ArchiveValidator.validateData(copy), /invalid text sizes/i);
  }
  const notAnObject = structuredClone(data);
  notAnObject.settings.fontSizes = [];
  assert.throws(() => ArchiveValidator.validateData(notAnObject), /invalid text sizes/i);
  const legacy = DataFactory.initialData();
  delete legacy.settings.fontSizes;
  assert.equal(ArchiveValidator.validateData(legacy), legacy);
  assert.deepEqual(ArchiveValidator.migrateArchive(legacy).organizations[0].data.settings.fontSizes, Typography.defaultFontSizes());
  const archive = ArchiveValidator.migrateArchive(DataFactory.initialData());
  delete archive.organizations[0].data.settings.fontSizes;
  assert.deepEqual(ArchiveValidator.validateArchive(archive).organizations[0].data.settings.fontSizes, Typography.defaultFontSizes());
  assert.deepEqual(DataFactory.createOrganization('New', 'en').data.settings.fontSizes, Typography.defaultFontSizes());
});
test('text sizes travel with settings exports while older or partial files stay safe', () => {
  const organization = sampleOrganization();
  organization.data.settings.fontSizes = { ...Typography.defaultFontSizes(), tables: 120, kanban: 85 };
  const file = OrganizationTransfer.parseOrganizationFile(JSON.stringify(OrganizationTransfer.organizationExport(organization, 'settings')));
  assert.deepEqual(file.settings.fontSizes, organization.data.settings.fontSizes);
  const current = DataFactory.baseData('it');
  const imported = OrganizationTransfer.applyOrganizationImport(current, file, { settings: true });
  assert.deepEqual([imported.settings.fontSizes, current.settings.fontSizes], [organization.data.settings.fontSizes, Typography.defaultFontSizes()]);
  imported.settings.fontSizes.tables = 90;
  assert.equal(file.settings.fontSizes.tables, 120);
  const older = OrganizationTransfer.organizationExport(organization, 'settings', { appVersion: '2.1.0' });
  delete older.settings.fontSizes;
  const parsedOlder = OrganizationTransfer.parseOrganizationFile(older);
  assert.equal(parsedOlder.settings.fontSizes, undefined);
  const customized = DataFactory.baseData('it');
  customized.settings.fontSizes.sidebar = 120;
  assert.deepEqual(OrganizationTransfer.applyOrganizationImport(customized, parsedOlder, { settings: true }).settings.fontSizes, { ...Typography.defaultFontSizes(), sidebar: 120 });
  const partial = OrganizationTransfer.organizationExport(organization, 'settings');
  partial.settings.fontSizes = { tables: 120, unknown: 300 };
  assert.deepEqual(OrganizationTransfer.parseOrganizationFile(partial).settings.fontSizes, { ...Typography.defaultFontSizes(), tables: 120 });
  for (const fontSizes of [{ ...Typography.defaultFontSizes(), tables: 400 }, { ...Typography.defaultFontSizes(), base: 'large' }, [], null]) {
    const broken = OrganizationTransfer.organizationExport(organization, 'settings');
    broken.settings.fontSizes = fontSizes;
    assert.throws(() => OrganizationTransfer.parseOrganizationFile(broken), /invalid text sizes/i);
  }
  const full = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(organization, 'organization'));
  assert.deepEqual(OrganizationTransfer.importedOrganizationData(full, { themes: true, settings: true, data: true }, 'it').settings.fontSizes, organization.data.settings.fontSizes);
  assert.deepEqual(OrganizationTransfer.importedOrganizationData(OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(organization, 'data')), { data: true }, 'en').settings.fontSizes, Typography.defaultFontSizes());
});

const legacyArchive = () => {
  const data = DataFactory.baseData('it');
  delete data.settings.highlights;
  delete data.settings.taskColumns;
  data.tasks = [{ id: 't1', code: 'PRJ-1', sequence: 1, description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false }];
  return { version: 2, activeOrganizationId: 'o1', organizations: [{ id: 'o1', name: 'Vecchia', data }] };
};
test('archives from previous versions get default highlighters, columns and unhighlighted tasks', () => {
  const archive = ArchiveValidator.validateArchive(legacyArchive());
  const data = archive.organizations[0].data;
  assert.deepEqual(data.settings.highlights, ThemeCatalog.defaultHighlights('it'));
  assert.deepEqual(data.settings.taskColumns, TaskColumns.defaultTaskColumns());
  assert.equal(data.tasks[0].highlightId, '');
  const english = legacyArchive();
  english.organizations[0].data.settings.language = 'en';
  assert.deepEqual(ArchiveValidator.validateArchive(english).organizations[0].data.settings.highlights.map(item => item.name), ['Attention', 'Blocker', 'To discuss', 'Ready']);
  const dangling = ArchiveValidator.validateArchive(archive);
  dangling.organizations[0].data.tasks[0].highlightId = 'deleted-color';
  assert.equal(ArchiveValidator.validateArchive(dangling).organizations[0].data.tasks[0].highlightId, '');
  const kept = ArchiveValidator.validateArchive(archive);
  kept.organizations[0].data.tasks[0].highlightId = 'highlight-red';
  assert.equal(ArchiveValidator.validateArchive(kept).organizations[0].data.tasks[0].highlightId, 'highlight-red');
});
test('highlighters and task columns are validated', () => {
  const valid = DataFactory.baseData('it');
  assert.equal(new Set(valid.settings.highlights.map(item => item.id)).size, 4);
  assert.deepEqual(TaskColumns.defaultTaskColumns().map(column => column.id), TaskColumns.TASK_COLUMN_IDS);
  assert.deepEqual(TaskColumns.defaultTaskColumns().filter(column => !column.visible).map(column => column.id), ['highlight']);
  const broken = [
    data => { data.settings.highlights = [{ id: 'a', name: 'A', color: 'red' }]; },
    data => { data.settings.highlights = [{ id: 'a', name: ' ', color: '#ffffff' }]; },
    data => { data.settings.highlights = [{ id: 'a', name: 'A', color: '#ffffff' }, { id: 'a', name: 'B', color: '#000000' }]; },
    data => { data.settings.highlights = Array.from({ length: Limits.HIGHLIGHT_LIMIT + 1 }, (_, index) => ({ id: `h${index}`, name: `H${index}`, color: '#ffffff' })); },
    data => { data.settings.highlights = 'giallo'; }
  ];
  for (const breakIt of broken) { const data = DataFactory.baseData('it'); breakIt(data); assert.throws(() => ArchiveValidator.validateData(data), /invalid highlighters/i); }
  for (const columns of [[], [{ id: 'code', visible: false }], [{ id: 'code', visible: 'si' }], [{ id: 'code', visible: true }, { id: 'code', visible: true }], 'code']) {
    const data = DataFactory.baseData('it');
    data.settings.taskColumns = columns;
    assert.throws(() => ArchiveValidator.validateData(data), /invalid list columns/i);
  }
  const data = DataFactory.baseData('it');
  data.settings.highlights = [];
  data.tasks = [{ id: 't1', code: 'PRJ-1', sequence: 1, description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false, highlightId: 42 }];
  assert.throws(() => ArchiveValidator.validateData(data), /invalid task highlight/i);
  data.tasks[0].highlightId = 'missing';
  assert.equal(ArchiveValidator.validateData(data), data);
});
test('task columns keep the saved order and restore missing columns in their default place', () => {
  assert.deepEqual(TaskColumns.normalizeTaskColumns(undefined), TaskColumns.defaultTaskColumns());
  const custom = TaskColumns.normalizeTaskColumns([{ id: 'status', visible: true }, { id: 'code', visible: false }, { id: 'owner', visible: true }, { id: 'status', visible: false }, null]);
  const order = custom.map(column => column.id);
  assert.ok(order.indexOf('status') < order.indexOf('code'));
  assert.equal(custom.find(column => column.id === 'code').visible, false);
  assert.equal(custom.find(column => column.id === 'status').visible, true);
  assert.deepEqual([...order].sort(), [...TaskColumns.TASK_COLUMN_IDS].sort());
  assert.ok(custom.findIndex(column => column.id === 'description') === custom.findIndex(column => column.id === 'code') + 1);
  assert.equal(custom.find(column => column.id === 'sequence').visible, true);
  assert.equal(TaskColumns.normalizeTaskColumns([{ id: 'effort', visible: false }]).filter(column => column.visible).length, TaskColumns.TASK_COLUMN_IDS.length - 2);
  const allHidden = TaskColumns.normalizeTaskColumns(TaskColumns.TASK_COLUMN_IDS.map(id => ({ id, visible: false })));
  assert.deepEqual(allHidden.filter(column => column.visible).map(column => column.id), ['code']);
});
test('saved views are portable settings and normalize safely in older archives', () => {
  const data = DataFactory.baseData('it'), savedView = {
    id: 'release-next', name: 'Next release', search: 'ORBIT', statusFilter: data.settings.statuses[0].id,
    highlightFilter: '__any', showHidden: false, duplicatesOnly: false,
    sort: [{ key: 'releaseDate', direction: 'asc' }, { key: 'sequence', direction: 'desc' }],
    columns: [{ id: 'code', visible: true }, { id: 'releaseDate', visible: true }]
  };
  data.settings.savedViews = [savedView];
  assert.equal(ArchiveValidator.validateData(data), data);
  const exported = OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport({ name: 'Views', data }, 'settings'));
  assert.deepEqual(exported.settings.savedViews, [savedView]);
  const imported = OrganizationTransfer.importedOrganizationData(exported, { settings: true }, 'it');
  assert.deepEqual(imported.settings.savedViews, [savedView]);
  const legacy = legacyArchive();
  delete legacy.organizations[0].data.settings.savedViews;
  assert.deepEqual(ArchiveValidator.validateArchive(legacy).organizations[0].data.settings.savedViews, []);
});
test('invalid saved view names, filters, sorts, and columns are rejected', () => {
  const invalid = [
    view => { view.name = ' '; },
    view => { view.name = 'x'.repeat(61); },
    view => { view.search = 'x'.repeat(201); },
    view => { view.showHidden = 'yes'; },
    view => { view.sort = [{ key: 'description', direction: 'asc' }]; },
    view => { view.sort = [{ key: 'sequence', direction: 'sideways' }]; },
    view => { view.sort = [{ key: 'sequence', direction: 'asc' }, { key: 'sequence', direction: 'desc' }]; },
    view => { view.columns = [{ id: 'description', visible: false }]; },
    view => { view.columns = [{ id: 'invalid', visible: true }]; }
  ];
  for (const mutate of invalid) {
    const data = DataFactory.baseData('it');
    const view = { id: 'v1', name: 'Valid', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: TaskColumns.defaultTaskColumns() };
    mutate(view);
    data.settings.savedViews = [view];
    assert.throws(() => ArchiveValidator.validateData(data), /invalid saved views/i);
  }
  const duplicateNames = DataFactory.baseData('it');
  duplicateNames.settings.savedViews = ['View', 'view'].map((name, i) => ({ id: `v${i}`, name, search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: TaskColumns.defaultTaskColumns() }));
  assert.throws(() => ArchiveValidator.validateData(duplicateNames), /invalid saved views/i);
});
test('demo data highlights a mix of open and recently released tasks', () => {
  const data = DataFactory.demoData('it', new Date(2026, 4, 20, 10)), { next } = DataFactory.demoReleaseDates(new Date(2026, 4, 20, 10));
  const ids = new Set(data.settings.highlights.map(item => item.id));
  const marked = data.tasks.filter(task => task.highlightId);
  assert.ok(marked.length >= 10 && marked.every(task => !task.releaseDate || task.releaseDate <= next));
  assert.ok(marked.every(task => ids.has(task.highlightId)));
  assert.equal(new Set(marked.map(task => task.highlightId)).size, 4);
  assert.ok(data.tasks.every(task => typeof task.highlightId === 'string'));
  assert.deepEqual(DataFactory.demoData('it', new Date(2026, 4, 20, 10)).tasks.map(task => task.highlightId), data.tasks.map(task => task.highlightId));
});
test('highlighters and columns travel with settings and data exports', () => {
  const organization = sampleOrganization();
  const settings = organization.data.settings;
  settings.highlights.push({ id: 'h-purple', name: 'VIP customer', color: '#9b6bff' });
  settings.taskColumns = TaskColumns.normalizeTaskColumns([{ id: 'highlight', visible: true }, { id: 'custom-ticket-platform', visible: true }], settings.taskFields);
  const task = organization.data.tasks.find(item => !item.highlightId);
  task.highlightId = 'h-purple';
  const full = OrganizationTransfer.parseOrganizationFile(JSON.stringify(OrganizationTransfer.organizationExport(organization, 'organization')));
  const created = OrganizationTransfer.importedOrganizationData(full, { themes: true, settings: true, data: true }, 'it');
  assert.deepEqual(created.settings.highlights, settings.highlights);
  assert.deepEqual(created.settings.taskColumns, settings.taskColumns);
  assert.equal(created.tasks.find(item => item.id === task.id).highlightId, 'h-purple');

  const dataOnly = OrganizationTransfer.importedOrganizationData(OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(organization, 'data')), { data: true }, 'en');
  assert.deepEqual(dataOnly.settings.highlights, settings.highlights);
  assert.equal(dataOnly.tasks.find(item => item.id === task.id).highlightId, 'h-purple');

  // Merging data into an organization that lacks a color adds it; same names are matched instead of duplicated.
  const highlightName = id => settings.highlights.find(item => item.id === id).name;
  const target = DataFactory.baseData('it');
  target.settings.highlights = [{ id: 'mine-yellow', name: highlightName('highlight-yellow').toLowerCase(), color: '#ffee00' }];
  const merged = OrganizationTransfer.applyOrganizationImport(target, OrganizationTransfer.parseOrganizationFile(OrganizationTransfer.organizationExport(organization, 'data')), { data: true, dataMode: 'merge' });
  assert.deepEqual(merged.settings.highlights.map(item => item.id).sort(), ['highlight-blue', 'highlight-green', 'highlight-red', 'h-purple', 'mine-yellow'].sort());
  const yellow = organization.data.tasks.find(item => item.highlightId === 'highlight-yellow');
  assert.equal(merged.tasks.find(item => item.id === yellow.id).highlightId, 'mine-yellow');

  // Importing a configuration remaps the current tasks by name and drops colors that no longer exist.
  const current = structuredClone(organization.data);
  const incoming = OrganizationTransfer.organizationExport(organization, 'settings');
  incoming.settings.highlights = [{ id: 'other-red', name: highlightName('highlight-red').toUpperCase(), color: '#ff0000' }];
  const applied = OrganizationTransfer.applyOrganizationImport(current, OrganizationTransfer.parseOrganizationFile(incoming), { settings: true });
  const red = organization.data.tasks.find(item => item.highlightId === 'highlight-red');
  assert.equal(applied.tasks.find(item => item.id === red.id).highlightId, 'other-red');
  assert.equal(applied.tasks.find(item => item.id === task.id).highlightId, '');
  assert.deepEqual(applied.settings.taskColumns, settings.taskColumns);
});
test('organization files from previous versions still import and keep current highlights', () => {
  const organization = sampleOrganization();
  const old = OrganizationTransfer.organizationExport(organization, 'organization');
  delete old.settings.highlights;
  delete old.settings.taskColumns;
  delete old.data.highlights;
  for (const item of old.data.tasks) delete item.highlightId;
  const parsed = OrganizationTransfer.parseOrganizationFile(old);
  const created = OrganizationTransfer.importedOrganizationData(parsed, { themes: true, settings: true, data: true }, 'it');
  assert.deepEqual(created.settings.highlights, ThemeCatalog.defaultHighlights('it'));
  assert.ok(created.tasks.every(item => item.highlightId === ''));
  const current = structuredClone(organization.data);
  const marked = current.tasks.find(item => item.highlightId);
  const merged = OrganizationTransfer.applyOrganizationImport(current, parsed, { settings: true, data: true, dataMode: 'merge' });
  assert.equal(merged.tasks.find(item => item.id === marked.id).highlightId, marked.highlightId);
  assert.deepEqual(merged.settings.highlights, organization.data.settings.highlights);
  assert.deepEqual(merged.settings.taskColumns, organization.data.settings.taskColumns);
  const unknown = OrganizationTransfer.organizationExport(organization, 'settings');
  unknown.settings.taskColumns = [{ id: 'owner', visible: true }, { id: 'code', visible: false }];
  assert.deepEqual(OrganizationTransfer.parseOrganizationFile(unknown).settings.taskColumns.map(column => column.id), [...TaskColumns.TASK_COLUMN_IDS, ...organization.data.settings.taskFields.map(field => field.id)]);
  assert.equal(OrganizationTransfer.parseOrganizationFile(unknown).settings.taskColumns.find(column => column.id === 'code').visible, false);
  const bad = OrganizationTransfer.organizationExport(organization, 'data');
  bad.data.highlights = [{ id: 'x', name: 'X', color: 'giallo' }];
  assert.throws(() => OrganizationTransfer.parseOrganizationFile(bad), /invalid highlighters/i);
});

test('duplicates are detected by incident in associations and in the tasks they resolve to', () => {
  const task = (id, code, hidden = false) => ({ id, code, hidden });
  const tasks = [task('t1', 'ORB-1'), task('t2', 'orb-2'), task('t3', 'ORB-3'), task('t4', ' orb-3 ', true), task('t5', 'ORB-5')];
  const issues = [
    { id: 'i1', code: 'ORB-1', incident: 'INC-1', problem: 'PRB-1' },
    { id: 'i2', code: 'ORB-2', incident: ' inc-1 ', problem: '' },
    { id: 'i3', code: 'orb-1', incident: 'INC-1', problem: 'prb-1' },
    { id: 'i4', code: 'ORB-3', incident: 'INC-3', problem: '' },
    { id: 'i5', code: 'ORB-5', incident: '', problem: 'PRB-1' },
    { id: 'i6', code: 'ORB-5', incident: '', problem: 'PRB-1' },
    { id: 'i7', code: 'ORB-5', incident: 'INC-5', problem: '' },
    { id: 'i8', code: 'ORB-9', incident: 'INC-9', problem: '' },
    { id: 'i9', code: 'ORB-10', incident: 'inc-9', problem: '' }
  ];
  const result = IssueMatcher.findDuplicates(tasks, issues);
  assert.deepEqual(result.groups.map(group => [group.key, group.incident, group.issueIds, group.taskIds]), [
    ['INC-1', 'INC-1', ['i1', 'i2', 'i3'], ['t1', 't2']],
    ['INC-3', 'INC-3', ['i4'], ['t3', 't4']],
    ['INC-9', 'INC-9', ['i8', 'i9'], []]
  ]);
  assert.deepEqual([...result.issues.keys()], ['i1', 'i2', 'i3', 'i8', 'i9']);
  assert.deepEqual([...result.tasks.keys()], ['t1', 't2', 't3', 't4']);
  assert.deepEqual(result.tasks.get('t1').map(group => group.key), ['INC-1']);
  assert.deepEqual(result.identical, ['i3'], 'only the later copy of an identical association is removable; rows without incident are ignored');
  assert.equal(result.tasks.has('t5') || result.issues.has('i5') || result.issues.has('i7'), false);
  const clean = IssueMatcher.findDuplicates(tasks, issues.filter(issue => !['i2', 'i3', 'i9'].includes(issue.id)));
  assert.deepEqual(clean.groups.map(group => group.key), ['INC-3'], 'same portal code on two tasks still shares the incident');
  assert.deepEqual(IssueMatcher.findDuplicates([], []), { groups: [], issues: new Map(), tasks: new Map(), identical: [] });
});
test('demo data has no duplicated incidents', () => {
  const data = DataFactory.demoData('it', new Date('2026-03-15T12:00:00'));
  const result = IssueMatcher.findDuplicates(data.tasks, data.issues);
  assert.equal(result.groups.length, 0);
  assert.equal(result.identical.length, 0);
});