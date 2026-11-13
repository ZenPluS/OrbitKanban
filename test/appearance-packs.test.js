'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const AppearancePacks = require('../src/shared/domain/AppearancePacks');
const { ArchiveValidator, DataFactory, OrganizationTransfer, ThemeCatalog } = require('../src/shared/domain');
const IconLibrary = require('../src/shared/graphics/IconLibrary');
const icons = require('../resources/packs/orbit-icons.json');
const themes = require('../resources/packs/orbit-themes.json');
const palette = { id: 'paper', name: 'Paper', background: '#ffffff', surface: '#eeeeee', text: '#111111', accent: '#224488' };
const themeSource = (repository, color = '#224488') => ({
  kind: 'themes', repository,
  manifest: { format: 'orbitkanban-themes', version: 1, packs: [{ id: 'custom', name: 'Custom', themes: [{ ...palette, accent: color }] }] }
});

test('bundled official snapshots match their published source lock byte-for-byte', () => {
  for (const source of require('../resources/packs/sources.lock.json').sources) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', 'resources', 'packs', source.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  }
});

test('appearance references accept public GitHub repositories only and retain the mandatory defaults', () => {
  assert.equal(AppearancePacks.repository(' https://github.com/Team/Example.git/ '), 'team/example');
  assert.equal(AppearancePacks.repository('Team/Example'), 'team/example');
  assert.deepEqual(AppearancePacks.sources([{ kind: 'icons', repository: 'ZenPluS/orbit_icons' }]), AppearancePacks.OFFICIAL);
  for (const value of ['https://example.com/a/b', 'https://token@github.com/a/b', 'file:///a/b', 'a/b/tree/main', '../b', 'a/..']) assert.throws(() => AppearancePacks.repository(value));
  assert.throws(() => AppearancePacks.sources(Array.from({ length: 21 }, () => ({ kind: 'icons', repository: 'a/b' }))));
});

test('declarative icons reject executable SVG and markup while retaining the original offline assets', () => {
  assert.equal(Object.keys(AppearancePacks.validate(icons, 'icons').packs[0].icons).length, 63);
  assert.equal(AppearancePacks.validate(themes, 'themes').packs.flatMap(pack => pack.themes).length, 39);
  const invalidTheme = structuredClone(themes);
  invalidTheme.packs[0].themes[0].id = ['paper'];
  assert.throws(() => AppearancePacks.validate(invalidTheme, 'themes'));
  const icon = () => ({ format: 'orbitkanban-icons', version: 1, packs: [{ id: 'custom', name: 'Custom', icons: { tasks: { family: 'line', layers: [{ style: 'line', shapes: [{ tag: 'path', attrs: { d: 'M2 2L22 22' } }] }] } } }] });
  for (const mutate of [
    shape => { shape.tag = 'script'; },
    shape => { shape.attrs.onclick = 'alert(1)'; },
    shape => { shape.attrs.fill = 'url(https://example.com)'; },
    shape => { shape.attrs.d = 'M0 0"/><script>'; },
    shape => { shape.attrs.x = Infinity; }
  ]) {
    const manifest = icon();
    mutate(manifest.packs[0].icons.tasks.layers[0].shapes[0]);
    assert.throws(() => AppearancePacks.validate(manifest, 'icons'));
  }
});

test('partial icon overrides retain missing Orbit icons and can be reset or fall back explicitly', () => {
  const catalog = { sources: [{ kind: 'icons', repository: 'zenplus/orbit_icons', manifest: icons }, {
    kind: 'icons', repository: 'team/icons',
    manifest: { format: 'orbitkanban-icons', version: 1, packs: [{ id: 'sketch', name: 'Sketch', icons: {
      tasks: { family: 'line', layers: [{ style: 'line', shapes: [{ tag: 'path', attrs: { d: 'M2 2L22 22' } }] }] }
    } }] }
  }] };
  try {
    assert.equal(IconLibrary.configure(catalog, 'team/icons:sketch'), true);
    assert.equal(IconLibrary.isLine('tasks'), true);
    assert.match(IconLibrary.spriteMarkup(), /d="M2 2L22 22"/);
    assert.match(IconLibrary.icon('settings'), /href="#i-settings"/);
    assert.equal(IconLibrary.names().length, 63);
    assert.equal(IconLibrary.configure(catalog), true);
    assert.equal(IconLibrary.isLine('tasks'), false);
    assert.equal(IconLibrary.configure(catalog, 'team/missing:pack'), false);
    assert.equal(IconLibrary.names().length, 63);
  } finally { IconLibrary.configure(catalog); }
});

test('theme refresh namespaces community palettes and updates only unedited originals', () => {
  const settings = DataFactory.baseData('en').settings;
  const catalog = { sources: [themeSource('first/themes'), themeSource('second/themes')] };
  AppearancePacks.mergeThemes(settings, catalog);
  assert.ok(settings.themes.some(theme => theme.id === 'first/themes:custom:paper'));
  assert.ok(settings.themes.some(theme => theme.id === 'second/themes:custom:paper'));
  const edited = settings.themes.find(theme => theme.id === 'first/themes:custom:paper');
  edited.accent = '#123456';
  settings.themeId = edited.id;
  const next = { sources: [themeSource('first/themes', '#556677'), themeSource('second/themes', '#8899aa')] };
  AppearancePacks.mergeThemes(settings, next);
  assert.equal(edited.accent, '#123456');
  assert.equal(settings.packThemeBases[edited.id].accent, '#556677');
  assert.equal(settings.themes.find(theme => theme.id === 'second/themes:custom:paper').accent, '#8899aa');
  AppearancePacks.mergeThemes(settings, { sources: [] });
  assert.equal(settings.themeId, edited.id);
  assert.equal(edited.accent, '#123456');
  assert.deepEqual(ThemeCatalog.defaultThemes().map(theme => theme.id), ['midnight']);
});

test('appearance selections and theme bases survive organization and full-archive transfers', () => {
  const organization = DataFactory.createOrganization('Source');
  organization.data.settings.packSources = [{ kind: 'icons', repository: 'team/icons' }, { kind: 'themes', repository: 'team/themes' }];
  organization.data.settings.iconPack = 'team/icons:custom';
  AppearancePacks.mergeThemes(organization.data.settings, { sources: [themeSource('team/themes')] });
  const file = OrganizationTransfer.organizationExport(organization, 'organization');
  const parsed = OrganizationTransfer.parseOrganizationFile(file);
  const imported = OrganizationTransfer.applyOrganizationImport(DataFactory.baseData('en'), parsed, { settings: true, themes: true });
  for (const key of ['packSources', 'iconPack', 'packThemeBases']) assert.deepEqual(imported.settings[key], organization.data.settings[key]);
  const migrated = ArchiveValidator.migrateArchive(organization.data);
  assert.deepEqual(migrated.organizations[0].data.settings.packSources, organization.data.settings.packSources);
  assert.equal(migrated.organizations[0].data.settings.iconPack, 'team/icons:custom');
  delete file.settings.packSources;
  delete file.settings.iconPack;
  delete file.settings.packThemeBases;
  const legacy = OrganizationTransfer.applyOrganizationImport(imported, OrganizationTransfer.parseOrganizationFile(file), { settings: true });
  assert.deepEqual(legacy.settings.packSources, imported.settings.packSources);
  assert.equal(legacy.settings.iconPack, imported.settings.iconPack);
  file.settings.iconPack = null;
  assert.throws(() => OrganizationTransfer.parseOrganizationFile(file), /icon pack/);
  for (const key of ['packSources', 'iconPack', 'packThemeBases']) {
    const invalid = structuredClone(organization.data);
    invalid.settings[key] = null;
    assert.throws(() => ArchiveValidator.migrateArchive(invalid));
  }
});

test('all themes from a valid multi-pack repository can be saved with their preset history', () => {
  const data = DataFactory.baseData('en');
  const manifest = { format: 'orbitkanban-themes', version: 1, packs: Array.from({ length: 11 }, (_, i) => ({
    id: `pack-${i}`, name: `Pack ${i}`, themes: Array.from({ length: 200 }, (_, j) => ({ ...palette, id: `theme-${j}` }))
  })) };
  AppearancePacks.mergeThemes(data.settings, { sources: [{ kind: 'themes', repository: 'team/themes', manifest }] });
  assert.equal(data.settings.themes.length, 2240);
  assert.doesNotThrow(() => ArchiveValidator.validateData(data));
});
