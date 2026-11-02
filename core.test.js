'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { APP_NAME, initialData, baseData, demoData, demoReleaseDates, validateData, migrateArchive, validateArchive, createOrganization, matchIssues, findDuplicates, sortTasks, dateColor, extractThemePalette, themeFromLogo, normalizeUrl, isWebUrl, validPortalTemplate, portalUrl, ORGANIZATION_FILE_KINDS, organizationExport, organizationFileName, situationFileName, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName, FONT_SIZE_PARTS, FONT_SIZE_STEP, defaultFontSizes, clampFontSize, HIGHLIGHT_LIMIT, defaultHighlights, TASK_COLUMN_IDS, defaultTaskColumns, normalizeTaskColumns, nextReleaseDate, today } = require('./core');
const { defaultThemes } = require('./core');
const { reorderTaskSequences } = require('./core');
const luminance = color => color.slice(1).match(/.{2}/g).map(channel => {
  const value = parseInt(channel, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('default archive is valid and independent between invocations', () => {
  const first = initialData(), second = initialData();
  assert.equal(validateData(first), first);
  assert.ok(first.tasks.length > 200);
  assert.notEqual(first.tasks[0].id, second.tasks[0].id);
});
test('row reordering renumbers Sequence and preserves fields and filtered-out positions', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, sequence: i * 10, notes: id, hidden: i === 1 }));
  reorderTaskSequences(tasks, ['e', 'c', 'a'], 0, 2);
  assert.deepEqual(sortTasks(tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => task.id), ['c', 'b', 'a', 'd', 'e']);
  assert.deepEqual(tasks.map(task => [task.id, task.notes, task.hidden]), ['a', 'b', 'c', 'd', 'e'].map((id, i) => [id, id, i === 1]));
  assert.deepEqual(tasks.map(task => task.sequence).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  const before = structuredClone(tasks);
  reorderTaskSequences(tasks, ['c', 'a'], 0, 0);
  assert.deepEqual(tasks, before);
  for (const [ids, from, to] of [[['missing', 'a'], 0, 1], [['a', 'a'], 0, 1], [['a', 'c'], -1, 0], [['a', 'c'], 0, 2]]) {
    assert.throws(() => reorderTaskSequences(tasks, ids, from, to), /lista è cambiata/);
    assert.deepEqual(tasks, before);
  }
});
test('row reordering handles duplicate sequences and saves the visible order across reloads', () => {
  const data = initialData();
  data.tasks.forEach(task => { task.sequence = 0; });
  const ids = data.tasks.map(task => task.id);
  reorderTaskSequences(data.tasks, ids, 0, ids.length - 1);
  const restored = validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(sortTasks(restored.tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => task.id), [...ids.slice(1), ids[0]]);
});
test('40 distinct built-in themes have four colors with readable text and accents', () => {
  const themes = defaultThemes();
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
  for (const data of [baseData(), demoData(), createOrganization('Fresh').data]) assert.deepEqual(data.settings.themes, themes);
  themes[0].accent = '#000000';
  assert.notEqual(defaultThemes()[0].accent, themes[0].accent);
});
test('older archives gain missing presets without overwriting active, custom or modified themes', () => {
  const legacy = initialData();
  legacy.settings.themes = legacy.settings.themes.slice(0, 4);
  legacy.settings.themes[0].accent = '#a392ff';
  legacy.settings.themes.push({ id: 'organization-logo', name: 'My palette', background: '#111111', surface: '#222222', text: '#ffffff', accent: '#aabbcc' });
  legacy.settings.themeId = 'organization-logo';
  const original = structuredClone(legacy), migrated = migrateArchive(legacy), settings = migrated.organizations[0].data.settings;
  assert.deepEqual(legacy, original);
  assert.deepEqual(settings.themes.slice(0, 5), original.settings.themes);
  assert.equal(settings.themes.length, 41);
  assert.equal(settings.themeId, 'organization-logo');
  assert.deepEqual(migrated.organizations[0].data.tasks, original.tasks);
  assert.deepEqual(migrated.organizations[0].data.issues, original.issues);
  assert.deepEqual(migrateArchive(migrated), migrated);
  const oldV2 = structuredClone(migrated);
  oldV2.organizations[0].data.settings.themes = original.settings.themes;
  const second = createOrganization('Other');
  second.data.settings.themes = defaultThemes().filter(theme => theme.id === 'everforest');
  second.data.settings.themeId = 'everforest';
  oldV2.organizations.push(second);
  const upgraded = migrateArchive(oldV2);
  assert.deepEqual(upgraded.organizations[0], migrated.organizations[0]);
  assert.equal(upgraded.organizations[1].data.settings.themes.length, 40);
  assert.equal(upgraded.organizations[1].data.settings.themeId, 'everforest');
  const roundtrip = migrateArchive(JSON.parse(JSON.stringify(upgraded)));
  assert.deepEqual(roundtrip, upgraded);
  const bad = structuredClone(legacy);
  bad.settings.themes[0].accent = 'invalid';
  assert.throws(() => migrateArchive(bad), /Temi non validi/);
  bad.settings.themes = [];
  assert.throws(() => migrateArchive(bad), /Temi non validi/);
});
test('demo releases are on Wednesdays every two weeks from January 2025 up to the next release', () => {
  const { past, next } = demoReleaseDates(new Date(2026, 4, 20, 10));
  assert.equal(past[0], '2025-01-01');
  assert.ok(past.at(-1) <= '2026-05-20' && next > '2026-05-20');
  for (const date of [...past, next]) assert.equal(new Date(`${date}T12:00:00Z`).getUTCDay(), 3, date);
  [...past, next].slice(1).forEach((date, index) => assert.equal((Date.parse(date) - Date.parse([...past, next][index])) / 86400000, 14));
  assert.deepEqual(demoReleaseDates(new Date(2025, 0, 1, 9)), { past: ['2025-01-01'], next: '2025-01-15' });
});
test('demo data shows every feature and is deterministic for the same day', () => {
  const now = new Date(2026, 4, 20, 10);
  const data = demoData('it', now), again = demoData('it', now);
  const { past, next } = demoReleaseDates(now);
  const [todo, doing, review, done] = data.settings.statuses.map(status => status.id);
  const shape = archive => archive.tasks.map(task => [task.code, task.releaseDate, archive.settings.statuses.findIndex(status => status.id === task.statusId), task.hidden, task.effortHours]);
  assert.deepEqual(shape(data), shape(again));
  assert.deepEqual(new Set(data.tasks.filter(task => task.releaseDate).map(task => task.releaseDate)), new Set([...past, next]));
  assert.ok(data.tasks.some(task => !task.releaseDate && task.statusId === todo));
  for (const status of [todo, doing, review, done]) assert.ok(data.tasks.some(task => task.statusId === status));
  assert.ok(data.tasks.every(task => !task.hidden || (task.statusId === done && task.releaseDate < '2026-03-25')));
  assert.ok(data.tasks.some(task => task.hidden) && data.tasks.some(task => task.statusId === done && !task.hidden));
  assert.ok(new Set(data.tasks.map(task => task.urgencyId)).size === data.settings.urgencies.length);
  assert.ok(data.tasks.some(task => /<(ul|ol|strong|em|u)>/.test(task.description)) && data.tasks.some(task => task.notes));
  assert.ok(data.tasks.some(task => task.effortHours % 8) && data.tasks.some(task => task.effortHours >= 8));
  assert.ok(data.tasks.some(task => task.url.startsWith('https://servicenow.example.com/')) && data.tasks.some(task => !task.url));
  assert.equal(validPortalTemplate(data.settings.portalUrlTemplate), true);
  assert.ok(data.tasks.some(task => matchIssues(task, data.issues).incidents.length >= 2));
  assert.ok(data.issues.some(issue => issue.code !== issue.code.toUpperCase()));
  assert.ok(data.issues.some(issue => !data.tasks.some(task => task.code.toLowerCase() === issue.code.trim().toLowerCase())));
  const problems = data.issues.filter(issue => issue.problem).map(issue => issue.problem);
  assert.ok(problems.length > new Set(problems).size);
  assert.ok(data.settings.themes.length >= 4);
  assert.equal(validateData(JSON.parse(JSON.stringify(data))).tasks.length, data.tasks.length);
});
test('demo data is localized and only added to new organizations on request', () => {
  const english = demoData('en', new Date(2026, 4, 20, 10));
  assert.equal(english.settings.tabNames[0], 'Tasks');
  assert.ok(english.tasks.some(task => /Released to production/.test(task.notes)));
  assert.ok(!english.tasks.some(task => /Rilasciato/.test(task.notes)));
  assert.equal(createOrganization('Empty', 'en').data.tasks.length, 0);
  const demo = createOrganization('Demo', 'en', '', undefined, true);
  assert.ok(demo.data.tasks.length > 200 && demo.data.issues.length > 100);
});
test('automatic associations are case-insensitive, many-to-many and deduplicated', () => {
  const issues = [
    { code: ' abc-1 ', incident: 'INC-1', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-2', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-2', problem: 'PRB-2' },
    { code: 'OTHER', incident: 'INC-3', problem: 'PRB-3' }
  ];
  assert.deepEqual(matchIssues({ code: 'abc-1' }, issues), { incidents: ['INC-1', 'INC-2'], problems: ['PRB-1', 'PRB-2'] });
  assert.deepEqual(matchIssues({ code: 'none' }, issues), { incidents: [], problems: [] });
});

test('batch issue index preserves association order, case, empty references and independent results', () => {
  const { indexIssues } = require('./core');
  const issues = [
    { code: ' abc-1 ', incident: ' INC-1 ', problem: 'PRB-1' },
    { code: 'ABC-1', incident: 'INC-1', problem: ' PRB-2 ' },
    { code: 'Abc-1', incident: 'inc-1', problem: '' },
    { code: 'OTHER', incident: ' ', problem: 'PRB-1' }
  ];
  const index = indexIssues(issues);
  for (const code of ['ABC-1', ' abc-1 ', 'OTHER', 'missing']) {
    assert.deepEqual(matchIssues({ code }, index), matchIssues({ code }, issues));
  }
  matchIssues({ code: 'ABC-1' }, index).incidents.push('not-an-association');
  assert.deepEqual(matchIssues({ code: 'ABC-1' }, index).incidents, ['INC-1', 'inc-1']);
  issues[0].incident = 'INC-CHANGED';
  assert.deepEqual(matchIssues({ code: 'ABC-1' }, indexIssues(issues)), matchIssues({ code: 'ABC-1' }, issues));
});
test('default sort is chronological, unplanned last and sequence as tie-breaker', () => {
  const tasks = [
    { sequence: 4, releaseDate: '' }, { sequence: 3, releaseDate: '2027-01-02' },
    { sequence: 2, releaseDate: '2027-01-01' }, { sequence: 1, releaseDate: '2027-01-01' }
  ];
  assert.deepEqual(sortTasks(tasks).map(t => t.sequence), [1, 2, 3, 4]);
  assert.equal(tasks[0].sequence, 4);
});
test('multi-column sort uses each priority and numeric values', () => {
  const tasks = [{ sequence: 10, releaseDate: '2027-01-01' }, { sequence: 2, releaseDate: '2027-01-01' }, { sequence: 1, releaseDate: '2027-01-02' }];
  assert.deepEqual(sortTasks(tasks, [{ key: 'releaseDate', direction: 'asc' }, { key: 'sequence', direction: 'desc' }]).map(t => t.sequence), [10, 2, 1]);
});
test('unplanned release stays last even with descending sort', () => {
  assert.deepEqual(sortTasks([{ releaseDate: '', sequence: 1 }, { releaseDate: '2027-01-01', sequence: 2 }], [{ key: 'releaseDate', direction: 'desc' }]).map(t => t.sequence), [2, 1]);
});
test('date colors are stable across views and archive reloads', () => {
  assert.equal(dateColor('2027-01-01'), dateColor('2027-01-01'));
  assert.notEqual(dateColor('2027-01-01'), dateColor('2027-01-02'));
});
test('next release is the nearest scheduled date on or after today, independently of order', () => {
  const tasks = [{ releaseDate: '2026-11-18' }, { releaseDate: '' }, { releaseDate: '2026-10-28' }, { releaseDate: '2026-11-04', hidden: true }, { releaseDate: '2026-11-04' }];
  const before = structuredClone(tasks);
  assert.equal(nextReleaseDate(tasks, '2026-10-31'), '2026-11-04');
  assert.deepEqual(tasks, before);
  assert.equal(nextReleaseDate([...tasks].reverse(), '2026-10-31'), '2026-11-04');
});
test('a release today takes precedence even if all of its activities are hidden or completed', () => {
  assert.equal(nextReleaseDate([{ releaseDate: '2026-11-01' }, { releaseDate: '2026-10-31', hidden: true, statusId: 'done' }], '2026-10-31'), '2026-10-31');
  assert.equal(nextReleaseDate([{ releaseDate: today() }]), today());
});
test('past-only, empty and unscheduled milestones never become the next release', () => {
  for (const tasks of [[], [{ releaseDate: '' }], [{ releaseDate: '2026-10-30' }, { releaseDate: '' }]]) assert.equal(nextReleaseDate(tasks, '2026-10-31'), '');
});
test('next release rolls forward across day, month, year and leap-day boundaries', () => {
  const tasks = ['2027-12-31', '2028-01-01', '2028-02-29', '2028-03-01'].map(releaseDate => ({ releaseDate }));
  for (const date of tasks.map(task => task.releaseDate)) assert.equal(nextReleaseDate(tasks, date), date);
  assert.equal(nextReleaseDate(tasks, '2028-01-02'), '2028-02-29');
  assert.equal(nextReleaseDate(tasks, '2028-03-02'), '');
});
test('default next-release cutoff follows the local calendar rather than the UTC date', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const NativeDate = Date;
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-31T00:30:00Z'])); }
    };
    const { nextReleaseDate } = require(${JSON.stringify(require.resolve('./core'))});
    process.stdout.write(nextReleaseDate([{ releaseDate: '2026-10-30' }, { releaseDate: '2026-10-31' }]));
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
    d => { d.tasks[0].url = 'javascript:alert(1)'; },
    d => { d.tasks[0].releaseDate = '2027-02-30'; },
    d => { d.tasks[0].hidden = 'true'; },
    d => { d.tasks.push({ ...d.tasks[0] }); },
    d => { d.issues[0].incident = ''; d.issues[0].problem = ''; }
  ]) {
    const data = initialData(); mutate(data);
    assert.throws(() => validateData(data));
  }
});
test('repeated portal and problem codes are supported by archive validation', () => {
  const data = initialData();
  data.tasks[1].code = data.tasks[0].code;
  data.tasks[1].sequence = data.tasks[0].sequence;
  assert.equal(validateData(data), data);
});
test('archive roundtrip preserves rich text, hours, themes and hidden rows', () => {
  const data = initialData();
  data.tasks[0].description = '<p>Rich <b>text</b></p>';
  data.tasks[0].hidden = true;
  data.tasks[0].effortHours = 10.5;
  const restored = validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored, data);
});
test('empty workspace is valid but still has configured statuses', () => {
  const data = initialData(); data.tasks = []; data.issues = [];
  assert.equal(validateData(data).tasks.length, 0);
});
function imagePixels(colors) {
  return new Uint8ClampedArray(colors.flatMap(color => {
    const rgb = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
    return [...rgb, 255];
  }));
}
test('image extraction assigns four representative colors to all theme roles', () => {
  const pixels = imagePixels(['#101820', '#303848', '#f0f4fc', '#d06090']);
  assert.deepEqual(extractThemePalette(pixels), {
    background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090', colorCount: 4
  });
});
test('automatic extraction is independent of pixel order for a distinct palette', () => {
  const colors = ['#d06090', '#f0f4fc', '#303848', '#101820'];
  assert.deepEqual(extractThemePalette(imagePixels(colors)), extractThemePalette(imagePixels(colors.reverse())));
});
test('monochrome and two-color images return four valid roles and actual group count', () => {
  const single = extractThemePalette(imagePixels(['#557799', '#557799']));
  assert.equal(single.colorCount, 1);
  for (const key of ['background', 'surface', 'text', 'accent']) assert.equal(single[key], '#557799');
  assert.deepEqual(extractThemePalette(imagePixels(['#ffffff', '#000000'])), {
    background: '#000000', surface: '#000000', text: '#ffffff', accent: '#ffffff', colorCount: 2
  });
});
test('transparent pixels are composited on white consistently with the image preview', () => {
  const palette = extractThemePalette(new Uint8ClampedArray([10, 20, 30, 0, 0, 0, 0, 255]));
  assert.equal(palette.text, '#ffffff');
  assert.equal(palette.background, '#000000');
});
test('empty or incomplete image data is explicitly rejected', () => {
  assert.throws(() => extractThemePalette(new Uint8ClampedArray()));
  assert.throws(() => extractThemePalette(new Uint8ClampedArray([1, 2, 3])));
});
test('monochrome logo themes retain visible text and accent instead of hiding the interface', () => {
  for (const color of ['#000000', '#ffffff', '#888888', '#767676', '#0066aa']) {
    const palette = themeFromLogo(imagePixels([color]));
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
test('legacy archive migrates without losing task IDs, settings, associations or themes', () => {
  const legacy = initialData();
  legacy.settings.appName = 'Legacy organization';
  delete legacy.settings.logo; delete legacy.settings.language;
  const original = JSON.parse(JSON.stringify(legacy));
  const archive = migrateArchive(legacy);
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
test('new organizations have independent empty workspaces and localized defaults', () => {
  const first = createOrganization('First', 'it'), second = createOrganization('Second', 'en');
  assert.equal(second.data.settings.tabNames[0], 'Tasks');
  assert.equal(second.data.settings.statuses[0].name, 'To do');
  assert.equal(first.data.tasks.length, 0);
  assert.equal(second.data.issues.length, 0);
  assert.notEqual(first.data.settings.statuses[0].id, second.data.settings.statuses[0].id);
  first.data.settings.themes[0].accent = '#ff0000';
  assert.notEqual(second.data.settings.themes[0].accent, '#ff0000');
  assert.equal(APP_NAME, 'OrbitKanban');
  assert.equal(first.data.settings.appName, undefined);
  assert.equal(second.data.settings.appName, undefined);
});
test('organization creation validates and includes the logo and generated theme atomically', () => {
  const logo = 'data:image/png;base64,aGVsbG8=';
  const palette = { background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090' };
  const organization = createOrganization('Logo organization', 'en', logo, palette);
  assert.equal(organization.data.settings.logo, logo);
  assert.equal(organization.data.settings.themeId, 'organization-logo');
  assert.deepEqual(organization.data.settings.themes.at(-1), { id: 'organization-logo', name: 'Theme from logo', ...palette });
  assert.throws(() => createOrganization('Invalid', 'it', 'https://remote/logo.png', palette));
  assert.throws(() => createOrganization('Invalid', 'it', logo));
  assert.throws(() => createOrganization('Invalid', 'it', logo, { ...palette, accent: 'red' }));
});
test('existing multi-organization names, logos and themes survive removal of obsolete app names', () => {
  const archive = migrateArchive(initialData());
  archive.organizations[0].data.settings.appName = 'Obsolete app title';
  archive.organizations[0].name = 'Existing organization';
  archive.organizations[0].data.settings.logo = 'data:image/png;base64,aGVsbG8=';
  const migrated = migrateArchive(archive);
  assert.equal(migrated.organizations[0].name, 'Existing organization');
  assert.equal(migrated.organizations[0].data.settings.logo, archive.organizations[0].data.settings.logo);
  assert.deepEqual(migrated.organizations[0].data.settings.themes, archive.organizations[0].data.settings.themes);
  assert.equal(migrated.organizations[0].data.settings.appName, undefined);
  assert.equal(archive.organizations[0].data.settings.appName, 'Obsolete app title');
});
test('multi-organization archive roundtrip retains logos, languages and selection', () => {
  const archive = migrateArchive(initialData());
  const organization = createOrganization('English organization', 'en');
  organization.data.settings.logo = 'data:image/png;base64,aGVsbG8=';
  archive.organizations.push(organization);
  archive.activeOrganizationId = organization.id;
  assert.deepEqual(migrateArchive(JSON.parse(JSON.stringify(archive))), archive);
});
test('invalid organization archives, logo sources and unsupported languages are rejected', () => {
  const archive = migrateArchive(initialData());
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
    assert.throws(() => validateArchive(invalid));
  }
  assert.throws(() => createOrganization(' '));
  assert.throws(() => createOrganization('Bad language', 'english'), /Lingua/);
  const portable = structuredClone(archive);
  portable.organizations[0].data.settings.language = 'pt-BR';
  assert.equal(validateArchive(portable).organizations[0].data.settings.language, 'pt-BR');
});

test('portal links are built from the organization template, with per-task override and optional link', () => {
  const settings = { portalUrlTemplate: 'https://jira.de.com/browse/{codice}' };
  assert.equal(portalUrl({ code: ' PRJ-7 ', url: '' }, settings), 'https://jira.de.com/browse/PRJ-7');
  assert.equal(portalUrl({ code: 'PRJ 7/A', url: '' }, settings), 'https://jira.de.com/browse/PRJ%207%2FA');
  assert.equal(portalUrl({ code: 'X-1', url: '' }, { portalUrlTemplate: 'https://qualcosa.net/<codice>/dettaglio?ref={CODE}' }), 'https://qualcosa.net/X-1/dettaglio?ref=X-1');
  assert.equal(portalUrl({ code: 'PRJ-7', url: 'https://altro.it/7' }, settings), 'https://altro.it/7');
  assert.equal(portalUrl({ code: 'PRJ-7', url: '' }, { portalUrlTemplate: '' }), '');
  assert.equal(portalUrl({ code: ' ', url: '' }, settings), '');
  assert.equal(normalizeUrl(' jira.de.com/{codice} '), 'https://jira.de.com/{codice}');
  assert.equal(normalizeUrl('http://intranet:8080/{codice}'), 'http://intranet:8080/{codice}');
  assert.equal(normalizeUrl(''), '');
  for (const valid of ['', 'https://jira.de.com/browse/{codice}', 'http://qualcosa.net/{code}/x', 'https://{codice}.portal.com']) assert.ok(validPortalTemplate(valid), valid);
  for (const invalid of ['https://jira.de.com/browse/', 'ftp://host/{codice}', 'javascript:alert(1)//{codice}', 'https:// spazio/{codice}', 'jira.de.com/{codice}']) assert.ok(!validPortalTemplate(invalid), invalid);
  assert.ok(isWebUrl('https://jira.de.com/browse/PRJ-1') && !isWebUrl('javascript:alert(1)') && !isWebUrl('https://') && !isWebUrl(42));
  const data = initialData();
  data.tasks[0].url = '';
  data.settings.portalUrlTemplate = 'https://jira.de.com/browse/{codice}';
  assert.equal(validateData(data), data);
  data.settings.portalUrlTemplate = 'https://jira.de.com/browse/';
  assert.throws(() => validateData(data), /\{codice\}/);
});
test('existing archives gain an empty portal link template without losing task links', () => {
  const legacy = initialData();
  delete legacy.settings.portalUrlTemplate;
  legacy.tasks[0].url = 'https://azienda.atlassian.net/browse/PRJ-1042';
  const archive = migrateArchive(legacy);
  const settings = archive.organizations[0].data.settings;
  assert.equal(settings.portalUrlTemplate, '');
  assert.equal(portalUrl(archive.organizations[0].data.tasks[0], settings), 'https://azienda.atlassian.net/browse/PRJ-1042');
  assert.equal(createOrganization('Nuova').data.settings.portalUrlTemplate, '');
});

const sampleOrganization = () => {
  const data = demoData('it', new Date(2026, 4, 20, 10));
  data.settings.logo = 'data:image/png;base64,iVBORw0KGgo=';
  data.settings.portalUrlTemplate = 'https://jira.de.com/browse/{codice}';
  return { id: 'org-1', name: 'Àcme Srl / Team #1', data };
};
const sections = file => ['themes', 'settings', 'data'].filter(part => part in file);
test('organization exports contain only the requested parts as independent copies', () => {
  const organization = sampleOrganization(), exportedAt = '2026-05-20T08:00:00.000Z';
  assert.deepEqual(ORGANIZATION_FILE_KINDS, ['themes', 'settings', 'data', 'organization']);
  const files = Object.fromEntries(ORGANIZATION_FILE_KINDS.map(kind => [kind, organizationExport(organization, kind, { appVersion: '2.1.0', exportedAt })]));
  for (const [kind, file] of Object.entries(files)) {
    assert.deepEqual([file.format, file.version, file.kind, file.exportedAt, file.appVersion], ['orbitkanban-organization', 1, kind, exportedAt, '2.1.0']);
    assert.deepEqual(file.organization, { name: organization.name });
  }
  assert.deepEqual(sections(files.themes), ['themes']);
  assert.deepEqual(sections(files.settings), ['settings']);
  assert.deepEqual(sections(files.data), ['data']);
  assert.deepEqual(sections(files.organization), ['themes', 'settings', 'data']);
  assert.deepEqual(files.themes.themes, { themeId: organization.data.settings.themeId, themes: organization.data.settings.themes });
  assert.deepEqual(Object.keys(files.settings.settings).sort(), ['fontSizes', 'highlights', 'hoursPerDay', 'issueColumns', 'issueFields', 'language', 'logo', 'portalUrlTemplate', 'savedViews', 'statuses', 'tabNames', 'tags', 'taskColumns', 'taskFields', 'urgencies']);
  assert.deepEqual(files.settings.settings.highlights, organization.data.settings.highlights);
  assert.deepEqual(files.data.data.highlights, organization.data.settings.highlights);
  assert.deepEqual(files.settings.settings.fontSizes, defaultFontSizes());
  assert.deepEqual(files.settings.settings.savedViews, []);
  assert.equal(files.settings.settings.logo, organization.data.settings.logo);
  assert.deepEqual(files.data.data.statuses, organization.data.settings.statuses);
  assert.equal(files.data.data.tasks.length, organization.data.tasks.length);
  files.data.data.tasks[0].code = 'CHANGED';
  files.themes.themes.themes[0].accent = '#000000';
  assert.notEqual(organization.data.tasks[0].code, 'CHANGED');
  assert.notEqual(organization.data.settings.themes[0].accent, '#000000');
  assert.throws(() => organizationExport(organization, 'backup'), /non supportato/);
});
test('organization file names are portable slugs with the localized part and date', () => {
  assert.equal(organizationFileName('Àcme Srl / Team #1', 'themes', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-temi-2026-05-20.json');
  assert.equal(organizationFileName('Àcme Srl / Team #1', 'settings', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-configurazione-2026-05-20.json');
  assert.equal(organizationFileName('Acme', 'data', 'en', '2026-05-20'), 'OrbitKanban-acme-data-2026-05-20.json');
  assert.equal(organizationFileName('Acme', 'organization', 'en', '2026-05-20'), 'OrbitKanban-acme-organization-2026-05-20.json');
  assert.equal(organizationFileName('***', 'data', 'it', '2026-05-20'), 'OrbitKanban-organizzazione-dati-2026-05-20.json');
  assert.match(organizationFileName('x'.repeat(200), 'themes', 'en'), /^OrbitKanban-x{60}-themes-\d{4}-\d{2}-\d{2}\.json$/);
  assert.throws(() => organizationFileName('Acme', 'backup'), /non supportato/);
  assert.equal(situationFileName('Àcme Srl / Team #1', 'it', '2026-05-20'), 'OrbitKanban-acme-srl-team-1-situazione-2026-05-20.xlsx');
  assert.equal(situationFileName('Acme', 'en', '2026-05-20'), 'OrbitKanban-acme-situation-2026-05-20.xlsx');
  assert.equal(situationFileName('***', 'it', '2026-05-20'), 'OrbitKanban-organizzazione-situazione-2026-05-20.xlsx');
  assert.match(situationFileName('Acme'), /^OrbitKanban-acme-situazione-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
test('organization files are validated, stripped of unknown fields and never confused with backups', () => {
  const organization = sampleOrganization();
  const file = organizationExport(organization, 'organization', { appVersion: '2.1.0' });
  Object.assign(file, { extra: 'x' });
  file.themes.themes[0].script = '<script>';
  file.settings.themes = 'ignored';
  file.data.tasks[0].injected = true;
  const parsed = parseOrganizationFile(JSON.stringify(file));
  assert.deepEqual([parsed.kind, parsed.parts, parsed.appVersion, parsed.organization.name], ['organization', ['themes', 'settings', 'data'], '2.1.0', organization.name]);
  assert.ok(!('extra' in parsed) && !('script' in parsed.themes.themes[0]) && !('themes' in parsed.settings) && !('injected' in parsed.data.tasks[0]));
  assert.deepEqual(parsed.data.tasks.map(t => t.id), organization.data.tasks.map(t => t.id));
  assert.equal(parseOrganizationFile('\uFEFF' + JSON.stringify(organizationExport(organization, 'themes'))).themes.themeId, organization.data.settings.themeId);
  assert.deepEqual([parseOrganizationFile({ ...file, appVersion: '<b>', exportedAt: 'ieri' }).appVersion, parseOrganizationFile({ ...file, exportedAt: 'ieri' }).exportedAt], ['', '']);
  assert.throws(() => parseOrganizationFile('{ rotto'), /JSON valido/);
  assert.throws(() => parseOrganizationFile('[]'), /esportazione di organizzazione/);
  assert.throws(() => parseOrganizationFile(JSON.stringify(migrateArchive(initialData()))), /backup completo/);
  assert.throws(() => parseOrganizationFile(initialData()), /backup completo/);
  assert.throws(() => migrateArchive(file), /Importa da file/);
  assert.throws(() => parseOrganizationFile({ ...file, format: 'altro' }), /esportazione di organizzazione/);
  assert.throws(() => parseOrganizationFile({ ...file, version: 2 }), /più recente/);
  assert.throws(() => parseOrganizationFile({ ...file, version: 0 }), /Versione del file/);
  assert.throws(() => parseOrganizationFile({ ...file, kind: 'archive' }), /non supportato/);
  assert.throws(() => parseOrganizationFile({ ...file, data: undefined }), /non contiene i dati/);
  assert.throws(() => parseOrganizationFile({ ...file, organization: { name: 'x'.repeat(101) } }), /Nome organizzazione/);
  const broken = (change, pattern) => { const copy = structuredClone(file); change(copy); assert.throws(() => parseOrganizationFile(copy), pattern); };
  broken(copy => { copy.data.tasks[0].statusId = 'inesistente'; }, /Stato o urgenza/);
  broken(copy => { copy.data.tasks = 'tutte'; }, /Elenco attività/);
  broken(copy => { copy.themes.themeId = 'inesistente'; }, /Tema selezionato/);
  broken(copy => { copy.themes.themes[0].accent = 'red'; }, /Temi non validi/);
  broken(copy => { copy.settings.logo = 'data:image/svg+xml;base64,AAAA'; }, /Logo non valido/);
  broken(copy => { copy.settings.language = 'fr_FR'; }, /Lingua/);
  broken(copy => { copy.settings.portalUrlTemplate = 'javascript:alert(1)//{codice}'; }, /modello del link/);
});
test('importing settings remaps existing tasks by name, then position, and keeps the logo unless requested', () => {
  const current = demoData('it', new Date(2026, 4, 20, 10));
  current.settings.logo = 'data:image/png;base64,AAAA';
  const [todo, doing, review, done] = current.settings.statuses.map(status => status.id);
  const source = baseData('en');
  source.settings.statuses = [{ id: 'x-done', name: ` ${current.settings.statuses[3].name.toUpperCase()} `, color: '#00aa00', highlight: false }, { id: 'x-open', name: 'Open', color: '#0000aa', highlight: true }];
  Object.assign(source.settings, { logo: 'data:image/png;base64,BBBB', portalUrlTemplate: 'https://jira.example.com/{codice}', hoursPerDay: 7 });
  const file = parseOrganizationFile(organizationExport({ name: 'Source', data: source }, 'settings'));
  const result = applyOrganizationImport(current, file, { settings: true });
  const expectedStatus = { [todo]: 'x-done', [doing]: 'x-open', [review]: 'x-open', [done]: 'x-done' };
  for (const original of current.tasks) {
    const imported = result.tasks.find(t => t.id === original.id);
    assert.equal(imported.statusId, expectedStatus[original.statusId]);
    assert.equal(imported.urgencyId, source.settings.urgencies[current.settings.urgencies.findIndex(u => u.id === original.urgencyId)].id);
  }
  assert.deepEqual(result.issues, current.issues);
  assert.deepEqual([result.settings.language, result.settings.portalUrlTemplate, result.settings.hoursPerDay, result.settings.tabNames], ['en', 'https://jira.example.com/{codice}', 7, source.settings.tabNames]);
  assert.deepEqual([result.settings.logo, result.settings.themeId, result.settings.themes], [current.settings.logo, current.settings.themeId, current.settings.themes]);
  assert.equal(applyOrganizationImport(current, file, { settings: true, logo: true }).settings.logo, 'data:image/png;base64,BBBB');
  assert.equal(current.settings.language, 'it');
  assert.throws(() => applyOrganizationImport(current, file, { themes: true, data: true }), /almeno una parte/);
});
test('importing themes merges by identifier and activates the file theme only on request', () => {
  const current = baseData('it'), source = baseData('en');
  source.settings.themes[0] = { ...source.settings.themes[0], name: 'Midnight 2', accent: '#ff0000' };
  source.settings.themes.push({ id: 'brand', name: 'Brand', background: '#000000', surface: '#111111', text: '#ffffff', accent: '#ff7a59' });
  source.settings.themeId = 'brand';
  const file = parseOrganizationFile(organizationExport({ name: 'Source', data: source }, 'themes'));
  const kept = applyOrganizationImport(current, file, { themes: true });
  assert.equal(kept.settings.themeId, current.settings.themeId);
  assert.deepEqual(kept.settings.themes.map(theme => theme.id), [...defaultThemes().map(theme => theme.id), 'brand']);
  assert.deepEqual([kept.settings.themes[0].name, kept.settings.themes[0].accent], ['Midnight 2', '#ff0000']);
  const activated = applyOrganizationImport(current, file, { themes: true, activateTheme: true });
  assert.equal(activated.settings.themeId, 'brand');
  assert.deepEqual([activated.settings.statuses, activated.tasks], [current.settings.statuses, current.tasks]);
  assert.deepEqual(applyOrganizationImport(activated, file, { themes: true, activateTheme: true }), activated);
});
test('importing data merges idempotently by identifier or replaces everything, remapping statuses', () => {
  const current = baseData('it');
  const existing = { id: 'keep', code: 'KEEP-1', sequence: 1, url: '', description: '', notes: '', releaseDate: '', statusId: current.settings.statuses[0].id, urgencyId: current.settings.urgencies[0].id, effortHours: 1, hidden: false };
  current.tasks = [existing, { ...existing, id: 'shared', code: 'OLD-2', sequence: 2 }];
  current.issues = [{ id: 'i-keep', code: 'KEEP-1', incident: 'INC-1', problem: '' }, { id: 'i-same', code: 'new-1', incident: 'inc-9', problem: 'prb-9' }];
  const source = baseData('en');
  source.settings.statuses[2].name = current.settings.statuses[1].name.toLowerCase();
  const make = (id, code, statusIndex) => ({ ...existing, id, code, statusId: source.settings.statuses[statusIndex].id, urgencyId: source.settings.urgencies[3].id });
  source.tasks = [make('shared', 'NEW-2', 2), make('fresh', 'NEW-1', 3)];
  source.issues = [{ id: 'i-new', code: 'NEW-1', incident: 'INC-9', problem: 'PRB-9' }, { id: 'i-other', code: 'NEW-2', incident: '', problem: 'PRB-2' }];
  const file = parseOrganizationFile(organizationExport({ name: 'Source', data: source }, 'data'));
  const merged = applyOrganizationImport(current, file, { data: true });
  assert.deepEqual(merged.tasks.map(t => [t.id, t.code]), [['keep', 'KEEP-1'], ['shared', 'NEW-2'], ['fresh', 'NEW-1']]);
  assert.deepEqual([merged.tasks[1].statusId, merged.tasks[2].statusId, merged.tasks[2].urgencyId], [current.settings.statuses[1].id, current.settings.statuses[3].id, current.settings.urgencies[3].id]);
  assert.deepEqual(merged.issues.map(issue => issue.id), ['i-keep', 'i-same', 'i-other']);
  assert.equal(matchIssues(merged.tasks[2], merged.issues).incidents[0], 'inc-9');
  assert.deepEqual(applyOrganizationImport(merged, file, { data: true }), merged);
  assert.deepEqual(merged.settings, current.settings);
  const replaced = applyOrganizationImport(current, file, { data: true, dataMode: 'replace' });
  assert.deepEqual([replaced.tasks.map(t => t.id), replaced.issues.map(issue => issue.id)], [['shared', 'fresh'], ['i-new', 'i-other']]);
  assert.deepEqual(replaced.settings, current.settings);
});
test('new organizations created from files keep the statuses, logo and language of the file', () => {
  const source = demoData('en', new Date(2026, 4, 20, 10));
  source.settings.statuses[0].name = 'Backlog';
  source.settings.logo = 'data:image/png;base64,CCCC';
  const exported = kind => parseOrganizationFile(organizationExport({ name: 'Remote', data: source }, kind));
  const full = exported('organization');
  const created = importedOrganizationData(full, { themes: true, activateTheme: true, settings: true, data: true }, 'it');
  assert.deepEqual([created.settings.language, created.settings.logo, created.settings.themeId], ['en', source.settings.logo, source.settings.themeId]);
  assert.deepEqual([created.settings.statuses, created.tasks, created.issues], [source.settings.statuses, source.tasks, source.issues]);
  const dataOnly = importedOrganizationData(exported('data'), { data: true }, 'it');
  assert.deepEqual([dataOnly.settings.language, dataOnly.settings.logo, dataOnly.settings.statuses, dataOnly.tasks], ['it', '', source.settings.statuses, source.tasks]);
  const themesOnly = importedOrganizationData(exported('themes'), { themes: true }, 'en');
  assert.deepEqual([themesOnly.settings.language, themesOnly.settings.themeId, themesOnly.tasks], ['en', 'midnight', []]);
  assert.ok(themesOnly.settings.themes.some(theme => theme.id === 'aurora'));
  assert.throws(() => importedOrganizationData(full, {}, 'it'), /almeno una parte/);
});
test('imported organization names stay unique, case-insensitive and within limits', () => {
  assert.equal(uniqueOrganizationName('Acme', ['Beta']), 'Acme');
  assert.equal(uniqueOrganizationName(' acme ', ['Acme', 'ACME (2)']), 'acme (3)');
  assert.equal(uniqueOrganizationName('', ['Organizzazione importata']), 'Organizzazione importata (2)');
  assert.equal(uniqueOrganizationName(undefined, [], 'Imported organization'), 'Imported organization');
  const long = uniqueOrganizationName('x'.repeat(120), ['x'.repeat(100)]);
  assert.deepEqual([long.length, long.endsWith('x (2)')], [100, true]);
});
test('text sizes have per-part limits in 5% steps and older archives get the defaults', () => {
  assert.deepEqual(FONT_SIZE_PARTS.map(part => part.id), ['base', 'sidebar', 'headings', 'tables', 'milestones', 'kanban', 'dialogs']);
  assert.ok(FONT_SIZE_PARTS.every(part => part.min >= 80 && part.min < 100 && part.max > 100 && part.max <= 150 && part.min % FONT_SIZE_STEP === 0 && part.max % FONT_SIZE_STEP === 0));
  assert.ok(Object.values(defaultFontSizes()).every(value => value === 100));
  assert.deepEqual(baseData('en').settings.fontSizes, defaultFontSizes());
  assert.deepEqual([clampFontSize('sidebar', 147), clampFontSize('base', 87), clampFontSize('kanban', 12), clampFontSize('dialogs', '112'), clampFontSize('tables', 'x')], [130, 85, 80, 110, 100]);
  const data = baseData('it');
  const invalid = [s => { s.tables = 100.5; }, s => { s.tables = 155; }, s => { s.sidebar = 135; }, s => { s.base = 75; }, s => { s.kanban = '100'; }, s => { s.extra = 100; }, s => { delete s.dialogs; }];
  for (const change of invalid) {
    const copy = structuredClone(data);
    change(copy.settings.fontSizes);
    assert.throws(() => validateData(copy), /Dimensioni del testo non valide/);
  }
  const notAnObject = structuredClone(data);
  notAnObject.settings.fontSizes = [];
  assert.throws(() => validateData(notAnObject), /Dimensioni del testo non valide/);
  const legacy = initialData();
  delete legacy.settings.fontSizes;
  assert.equal(validateData(legacy), legacy);
  assert.deepEqual(migrateArchive(legacy).organizations[0].data.settings.fontSizes, defaultFontSizes());
  const archive = migrateArchive(initialData());
  delete archive.organizations[0].data.settings.fontSizes;
  assert.deepEqual(validateArchive(archive).organizations[0].data.settings.fontSizes, defaultFontSizes());
  assert.deepEqual(createOrganization('Nuova', 'en').data.settings.fontSizes, defaultFontSizes());
});
test('text sizes travel with settings exports while older or partial files stay safe', () => {
  const organization = sampleOrganization();
  organization.data.settings.fontSizes = { ...defaultFontSizes(), tables: 120, kanban: 85 };
  const file = parseOrganizationFile(JSON.stringify(organizationExport(organization, 'settings')));
  assert.deepEqual(file.settings.fontSizes, organization.data.settings.fontSizes);
  const current = baseData('it');
  const imported = applyOrganizationImport(current, file, { settings: true });
  assert.deepEqual([imported.settings.fontSizes, current.settings.fontSizes], [organization.data.settings.fontSizes, defaultFontSizes()]);
  imported.settings.fontSizes.tables = 90;
  assert.equal(file.settings.fontSizes.tables, 120);
  const older = organizationExport(organization, 'settings', { appVersion: '2.1.0' });
  delete older.settings.fontSizes;
  const parsedOlder = parseOrganizationFile(older);
  assert.equal(parsedOlder.settings.fontSizes, undefined);
  const customized = baseData('it');
  customized.settings.fontSizes.sidebar = 120;
  assert.deepEqual(applyOrganizationImport(customized, parsedOlder, { settings: true }).settings.fontSizes, { ...defaultFontSizes(), sidebar: 120 });
  const partial = organizationExport(organization, 'settings');
  partial.settings.fontSizes = { tables: 120, unknown: 300 };
  assert.deepEqual(parseOrganizationFile(partial).settings.fontSizes, { ...defaultFontSizes(), tables: 120 });
  for (const fontSizes of [{ ...defaultFontSizes(), tables: 400 }, { ...defaultFontSizes(), base: 'grande' }, [], null]) {
    const broken = organizationExport(organization, 'settings');
    broken.settings.fontSizes = fontSizes;
    assert.throws(() => parseOrganizationFile(broken), /Dimensioni del testo non valide/);
  }
  const full = parseOrganizationFile(organizationExport(organization, 'organization'));
  assert.deepEqual(importedOrganizationData(full, { themes: true, settings: true, data: true }, 'it').settings.fontSizes, organization.data.settings.fontSizes);
  assert.deepEqual(importedOrganizationData(parseOrganizationFile(organizationExport(organization, 'data')), { data: true }, 'en').settings.fontSizes, defaultFontSizes());
});

const legacyArchive = () => {
  const data = baseData('it');
  delete data.settings.highlights;
  delete data.settings.taskColumns;
  data.tasks = [{ id: 't1', code: 'PRJ-1', sequence: 1, url: '', description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false }];
  return { version: 2, activeOrganizationId: 'o1', organizations: [{ id: 'o1', name: 'Vecchia', data }] };
};
test('archives from previous versions get default highlighters, columns and unhighlighted tasks', () => {
  const archive = validateArchive(legacyArchive());
  const data = archive.organizations[0].data;
  assert.deepEqual(data.settings.highlights, defaultHighlights('it'));
  assert.deepEqual(data.settings.taskColumns, defaultTaskColumns());
  assert.equal(data.tasks[0].highlightId, '');
  const english = legacyArchive();
  english.organizations[0].data.settings.language = 'en';
  assert.deepEqual(validateArchive(english).organizations[0].data.settings.highlights.map(item => item.name), ['Attention', 'Blocker', 'To discuss', 'Ready']);
  const dangling = validateArchive(archive);
  dangling.organizations[0].data.tasks[0].highlightId = 'deleted-color';
  assert.equal(validateArchive(dangling).organizations[0].data.tasks[0].highlightId, '');
  const kept = validateArchive(archive);
  kept.organizations[0].data.tasks[0].highlightId = 'highlight-red';
  assert.equal(validateArchive(kept).organizations[0].data.tasks[0].highlightId, 'highlight-red');
});
test('highlighters and task columns are validated', () => {
  const valid = baseData('it');
  assert.equal(new Set(valid.settings.highlights.map(item => item.id)).size, 4);
  assert.deepEqual(defaultTaskColumns().map(column => column.id), TASK_COLUMN_IDS);
  assert.deepEqual(defaultTaskColumns().filter(column => !column.visible).map(column => column.id), ['link', 'highlight']);
  const broken = [
    data => { data.settings.highlights = [{ id: 'a', name: 'A', color: 'red' }]; },
    data => { data.settings.highlights = [{ id: 'a', name: ' ', color: '#ffffff' }]; },
    data => { data.settings.highlights = [{ id: 'a', name: 'A', color: '#ffffff' }, { id: 'a', name: 'B', color: '#000000' }]; },
    data => { data.settings.highlights = Array.from({ length: HIGHLIGHT_LIMIT + 1 }, (_, index) => ({ id: `h${index}`, name: `H${index}`, color: '#ffffff' })); },
    data => { data.settings.highlights = 'giallo'; }
  ];
  for (const breakIt of broken) { const data = baseData('it'); breakIt(data); assert.throws(() => validateData(data), /Evidenziatori non validi/); }
  for (const columns of [[], [{ id: 'code', visible: false }], [{ id: 'code', visible: 'si' }], [{ id: 'code', visible: true }, { id: 'code', visible: true }], 'code']) {
    const data = baseData('it');
    data.settings.taskColumns = columns;
    assert.throws(() => validateData(data), /Colonne della lista non valide/);
  }
  const data = baseData('it');
  data.settings.highlights = [];
  data.tasks = [{ id: 't1', code: 'PRJ-1', sequence: 1, url: '', description: '', notes: '', releaseDate: '', statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[0].id, effortHours: 0, hidden: false, highlightId: 42 }];
  assert.throws(() => validateData(data), /Evidenziazione attività non valida/);
  data.tasks[0].highlightId = 'missing';
  assert.equal(validateData(data), data);
});
test('task columns keep the saved order and restore missing columns in their default place', () => {
  assert.deepEqual(normalizeTaskColumns(undefined), defaultTaskColumns());
  const custom = normalizeTaskColumns([{ id: 'status', visible: true }, { id: 'code', visible: false }, { id: 'owner', visible: true }, { id: 'status', visible: false }, null]);
  const order = custom.map(column => column.id);
  assert.ok(order.indexOf('status') < order.indexOf('code'));
  assert.equal(custom.find(column => column.id === 'code').visible, false);
  assert.equal(custom.find(column => column.id === 'status').visible, true);
  assert.deepEqual([...order].sort(), [...TASK_COLUMN_IDS].sort());
  assert.ok(custom.findIndex(column => column.id === 'link') === custom.findIndex(column => column.id === 'code') + 1);
  assert.equal(custom.find(column => column.id === 'sequence').visible, true);
  assert.equal(normalizeTaskColumns([{ id: 'link', visible: false }]).filter(column => column.visible).length, TASK_COLUMN_IDS.length - 2);
  const allHidden = normalizeTaskColumns(TASK_COLUMN_IDS.map(id => ({ id, visible: false })));
  assert.deepEqual(allHidden.filter(column => column.visible).map(column => column.id), ['code']);
});
test('saved views are portable settings and normalize safely in older archives', () => {
  const data = baseData('it'), savedView = {
    id: 'release-next', name: 'Prossima release', search: 'ORBIT', statusFilter: data.settings.statuses[0].id,
    highlightFilter: '__any', showHidden: false, duplicatesOnly: false,
    sort: [{ key: 'releaseDate', direction: 'asc' }, { key: 'sequence', direction: 'desc' }],
    columns: [{ id: 'code', visible: true }, { id: 'releaseDate', visible: true }]
  };
  data.settings.savedViews = [savedView];
  assert.equal(validateData(data), data);
  const exported = parseOrganizationFile(organizationExport({ name: 'Views', data }, 'settings'));
  assert.deepEqual(exported.settings.savedViews, [savedView]);
  const imported = importedOrganizationData(exported, { settings: true }, 'it');
  assert.deepEqual(imported.settings.savedViews, [savedView]);
  const legacy = legacyArchive();
  delete legacy.organizations[0].data.settings.savedViews;
  assert.deepEqual(validateArchive(legacy).organizations[0].data.settings.savedViews, []);
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
    const data = baseData('it');
    const view = { id: 'v1', name: 'Valid', search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: defaultTaskColumns() };
    mutate(view);
    data.settings.savedViews = [view];
    assert.throws(() => validateData(data), /Viste salvate non valide/);
  }
  const duplicateNames = baseData('it');
  duplicateNames.settings.savedViews = ['Vista', 'vista'].map((name, i) => ({ id: `v${i}`, name, search: '', statusFilter: '', highlightFilter: '', showHidden: false, duplicatesOnly: false, sort: [{ key: 'sequence', direction: 'asc' }], columns: defaultTaskColumns() }));
  assert.throws(() => validateData(duplicateNames), /Viste salvate non valide/);
});
test('demo data highlights a mix of open and recently released tasks', () => {
  const data = demoData('it', new Date(2026, 4, 20, 10));
  const ids = new Set(data.settings.highlights.map(item => item.id));
  const marked = data.tasks.filter(task => task.highlightId);
  assert.ok(marked.length >= 10);
  assert.ok(marked.every(task => ids.has(task.highlightId)));
  assert.equal(new Set(marked.map(task => task.highlightId)).size, 4);
  assert.ok(data.tasks.every(task => typeof task.highlightId === 'string'));
  assert.deepEqual(demoData('it', new Date(2026, 4, 20, 10)).tasks.map(task => task.highlightId), data.tasks.map(task => task.highlightId));
});
test('highlighters and columns travel with settings and data exports', () => {
  const organization = sampleOrganization();
  const settings = organization.data.settings;
  settings.highlights.push({ id: 'h-purple', name: 'Cliente VIP', color: '#9b6bff' });
  settings.taskColumns = normalizeTaskColumns([{ id: 'highlight', visible: true }, { id: 'link', visible: true }]);
  const task = organization.data.tasks.find(item => !item.highlightId);
  task.highlightId = 'h-purple';
  const full = parseOrganizationFile(JSON.stringify(organizationExport(organization, 'organization')));
  const created = importedOrganizationData(full, { themes: true, settings: true, data: true }, 'it');
  assert.deepEqual(created.settings.highlights, settings.highlights);
  assert.deepEqual(created.settings.taskColumns, settings.taskColumns);
  assert.equal(created.tasks.find(item => item.id === task.id).highlightId, 'h-purple');

  const dataOnly = importedOrganizationData(parseOrganizationFile(organizationExport(organization, 'data')), { data: true }, 'en');
  assert.deepEqual(dataOnly.settings.highlights, settings.highlights);
  assert.equal(dataOnly.tasks.find(item => item.id === task.id).highlightId, 'h-purple');

  // Merging data into an organization that lacks a color adds it; same names are matched instead of duplicated.
  const target = baseData('it');
  target.settings.highlights = [{ id: 'mine-yellow', name: 'attenzione', color: '#ffee00' }];
  const merged = applyOrganizationImport(target, parseOrganizationFile(organizationExport(organization, 'data')), { data: true, dataMode: 'merge' });
  assert.deepEqual(merged.settings.highlights.map(item => item.id).sort(), ['highlight-blue', 'highlight-green', 'highlight-red', 'h-purple', 'mine-yellow'].sort());
  const yellow = organization.data.tasks.find(item => item.highlightId === 'highlight-yellow');
  assert.equal(merged.tasks.find(item => item.id === yellow.id).highlightId, 'mine-yellow');

  // Importing a configuration remaps the current tasks by name and drops colors that no longer exist.
  const current = structuredClone(organization.data);
  const incoming = organizationExport(organization, 'settings');
  incoming.settings.highlights = [{ id: 'other-red', name: 'BLOCCANTE', color: '#ff0000' }];
  const applied = applyOrganizationImport(current, parseOrganizationFile(incoming), { settings: true });
  const red = organization.data.tasks.find(item => item.highlightId === 'highlight-red');
  assert.equal(applied.tasks.find(item => item.id === red.id).highlightId, 'other-red');
  assert.equal(applied.tasks.find(item => item.id === task.id).highlightId, '');
  assert.deepEqual(applied.settings.taskColumns, settings.taskColumns);
});
test('organization files from previous versions still import and keep current highlights', () => {
  const organization = sampleOrganization();
  const old = organizationExport(organization, 'organization');
  delete old.settings.highlights;
  delete old.settings.taskColumns;
  delete old.data.highlights;
  for (const item of old.data.tasks) delete item.highlightId;
  const parsed = parseOrganizationFile(old);
  const created = importedOrganizationData(parsed, { themes: true, settings: true, data: true }, 'it');
  assert.deepEqual(created.settings.highlights, defaultHighlights('it'));
  assert.ok(created.tasks.every(item => item.highlightId === ''));
  const current = structuredClone(organization.data);
  const marked = current.tasks.find(item => item.highlightId);
  const merged = applyOrganizationImport(current, parsed, { settings: true, data: true, dataMode: 'merge' });
  assert.equal(merged.tasks.find(item => item.id === marked.id).highlightId, marked.highlightId);
  assert.deepEqual(merged.settings.highlights, organization.data.settings.highlights);
  assert.deepEqual(merged.settings.taskColumns, organization.data.settings.taskColumns);
  const unknown = organizationExport(organization, 'settings');
  unknown.settings.taskColumns = [{ id: 'owner', visible: true }, { id: 'code', visible: false }];
  assert.deepEqual(parseOrganizationFile(unknown).settings.taskColumns.map(column => column.id), [...TASK_COLUMN_IDS]);
  assert.equal(parseOrganizationFile(unknown).settings.taskColumns.find(column => column.id === 'code').visible, false);
  const bad = organizationExport(organization, 'data');
  bad.data.highlights = [{ id: 'x', name: 'X', color: 'giallo' }];
  assert.throws(() => parseOrganizationFile(bad), /Evidenziatori non validi/);
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
  const result = findDuplicates(tasks, issues);
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
  const clean = findDuplicates(tasks, issues.filter(issue => !['i2', 'i3', 'i9'].includes(issue.id)));
  assert.deepEqual(clean.groups.map(group => group.key), ['INC-3'], 'same portal code on two tasks still shares the incident');
  assert.deepEqual(findDuplicates([], []), { groups: [], issues: new Map(), tasks: new Map(), identical: [] });
});
test('demo data has no duplicated incidents', () => {
  const data = demoData('it', new Date('2026-03-15T12:00:00'));
  const result = findDuplicates(data.tasks, data.issues);
  assert.equal(result.groups.length, 0);
  assert.equal(result.identical.length, 0);
});