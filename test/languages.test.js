'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Translator } = require('../src/shared/localization');
const LanguagePacks = require('../src/shared/localization/LanguagePacks');
const LanguageStore = require('../src/desktop/storage/LanguageStore');
const pack = (code = 'de', messages = { Settings: 'Einstellungen' }) => ({ format: Translator.FORMAT, version: 1, code, name: code === 'de' ? 'Deutsch' : code, messages });
const manifest = (...languages) => ({ format: 'orbitkanban-languages', version: 1, languages });
const repository = 'sample/languages';

async function fixture(t, options = {}) {
  const dataFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbita-languages-'));
  t.after(async () => { Translator.reset(); Translator.loadBuiltIn(); await fs.rm(dataFolder, { recursive: true, force: true }); });
  const store = new LanguageStore({ dataFolder, fetchImpl: () => assert.fail('Unexpected network request'), ...options });
  await store.reload();
  return { dataFolder, store };
}

test('English fallback and the official offline snapshot are available without scanning local language files', async t => {
  const { dataFolder, store } = await fixture(t);
  const legacy = path.join(dataFolder, 'languages');
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'de.json'), JSON.stringify(pack()));
  await fs.writeFile(path.join(legacy, 'broken.json'), '{broken');
  const info = await store.reload();
  assert.deepEqual(info.languages.map(({ code, source }) => [code, source]), [['en', 'built-in'], ['it', 'zenplus/orbit_languages']]);
  assert.equal(Translator.translate('Save settings', 'it'), 'Salva impostazioni');
  assert.deepEqual(info.errors, []);
  assert.deepEqual((await fs.readdir(legacy)).sort(), ['broken.json', 'de.json']);
  assert.equal(info.repositories[0].official, true);
  assert.equal(info.repositories[0].updatedAt, null);
});

test('repository add normalizes public references, caches translations and restores them offline', async t => {
  let calls = 0;
  const { dataFolder, store } = await fixture(t, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/sample/languages/contents/orbit-languages.json');
    assert.equal(options.credentials, 'omit');
    return new Response(JSON.stringify(manifest(pack())));
  } });
  const before = store.revision;
  const info = await store.change('add', 'https://github.com/Sample/Languages.git');
  assert.equal(calls, 1);
  assert.equal(info.languages.find(item => item.code === 'de').source, repository);
  assert.equal(Translator.translate('Settings', 'de'), 'Einstellungen');
  assert.equal(Translator.translate('Save settings', 'de'), 'Save settings');
  assert.notEqual(store.revision, before);
  assert.deepEqual(JSON.parse(await fs.readFile(store.file, 'utf8')).sources, [{ kind: 'languages', repository }]);
  const offline = new LanguageStore({ dataFolder, fetchImpl: () => assert.fail('Offline startup must not fetch') });
  assert.deepEqual(await offline.reload(), info);
  await assert.rejects(offline.change('remove', 'zenplus/orbit_languages'), /Invalid language repository operation/);
});

test('removing overrides restores defaults and retains otherwise unavailable cached languages', async t => {
  const { dataFolder, store } = await fixture(t, { fetchImpl: async () => new Response(JSON.stringify(manifest(pack(), pack('it', { Settings: 'Team settings' }), pack('en', { 'Save settings': 'Store settings' })))) });
  await store.change('add', repository);
  assert.equal(Translator.translate('Settings', 'it'), 'Team settings');
  assert.equal(Translator.translate('Save settings', 'de'), 'Store settings');
  await store.change('remove', repository);
  assert.equal(store.info().repositories.length, 1);
  assert.equal(Translator.translate('Settings', 'it'), 'Impostazioni');
  assert.equal(Translator.translate('Save settings', 'de'), 'Save settings');
  assert.equal(Translator.translate('Settings', 'de'), 'Einstellungen');
  const restarted = new LanguageStore({ dataFolder });
  await restarted.reload();
  assert.equal(Translator.translate('Settings', 'de'), 'Einstellungen');
  assert.equal(Translator.translate('Settings', 'it'), 'Impostazioni');
});

test('later active sources override earlier packs without inheriting texts from removed references', async t => {
  const { store } = await fixture(t, { fetchImpl: async url => new Response(JSON.stringify(manifest(
    pack('de', url.includes('/second/') ? { Settings: 'Second' } : { Settings: 'First', 'Save settings': 'First save' })
  ))) });
  await store.change('add', repository);
  await store.change('add', 'second/languages');
  assert.equal(Translator.translate('Settings', 'de'), 'Second');
  assert.equal(Translator.translate('Save settings', 'de'), 'First save');
  await store.change('remove', repository);
  assert.equal(Translator.translate('Settings', 'de'), 'Second');
  assert.equal(Translator.translate('Save settings', 'de'), 'Save settings');
  assert.equal(store.info().languages.find(item => item.code === 'de').source, 'second/languages');
});

test('invalid, oversized and failed refreshes preserve the last valid translations and cache', async t => {
  let response = () => new Response(JSON.stringify(manifest(pack())));
  const { dataFolder, store } = await fixture(t, { fetchImpl: () => response() });
  await store.change('add', repository);
  const saved = await fs.readFile(store.file, 'utf8'), revision = store.revision;
  const cacheFolder = path.join(dataFolder, 'language-cache'), files = await fs.readdir(cacheFolder);
  const cached = await fs.readFile(path.join(cacheFolder, files[0]), 'utf8');
  for (const [next, expected] of [
    [() => new Response(JSON.stringify(manifest(pack(), pack()))), /Invalid language manifest/],
    [() => new Response(JSON.stringify(manifest(pack('english')))), /Invalid language manifest/],
    [() => new Response('', { status: 404 }), /not found \(404\)/],
    [() => new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }), /2 MB/],
    [() => { throw new Error('network'); }, /Cannot reach/]
  ]) {
    response = next;
    await assert.rejects(store.change('refresh', repository), expected);
    assert.match(store.info().errors[0].message, expected);
    assert.equal(store.revision, revision);
    assert.equal(Translator.translate('Settings', 'de'), 'Einstellungen');
    assert.equal(await fs.readFile(store.file, 'utf8'), saved);
    assert.equal(await fs.readFile(path.join(cacheFolder, files[0]), 'utf8'), cached);
  }
  response = () => new Response(JSON.stringify(manifest(pack('de', { Settings: 'Neu' }))));
  assert.deepEqual((await store.change('refresh', repository)).errors, []);
  assert.equal(Translator.translate('Settings', 'de'), 'Neu');
});

test('corrupt repository settings and failed persistence are explicit and never overwritten', async t => {
  const { store } = await fixture(t, { fetchImpl: async () => new Response(JSON.stringify(manifest(pack()))) });
  await fs.writeFile(store.file, '{broken');
  await assert.rejects(store.reload(), /Cannot read language repository settings/);
  assert.equal(await fs.readFile(store.file, 'utf8'), '{broken');
  await assert.rejects(store.change('add', repository), /Cannot read language repository settings/);
  assert.match(store.info().errors[0].message, /Cannot read/);
  await fs.rm(store.file);
  await store.reload();
  await fs.mkdir(store.file);
  await assert.rejects(store.change('add', repository), /Cannot save language repository settings/);
  assert.equal(store.info().repositories.length, 1);
  assert.equal(Translator.has('de'), false);
});

test('language manifest validation rejects duplicate codes, malformed packs and unsafe repository references', () => {
  for (const value of [manifest(), { ...manifest(pack()), version: 2 }, manifest(pack(), pack()), manifest(pack('pt-BR'), pack('pt-br')), manifest({ ...pack(), messages: { Settings: 1 } })]) {
    assert.throws(() => LanguagePacks.validate(value));
  }
  for (const repository of ['https://example.com/a/b', '../private', 'https://user:password@github.com/a/b']) {
    assert.throws(() => LanguagePacks.sources([{ kind: 'languages', repository }]));
  }
  assert.deepEqual(LanguagePacks.validate(manifest(pack())).languages, [Translator.validatePack(pack())]);
});

test('repository translations cannot insert HTML through messages, terms or counted forms', () => {
  for (const extra of [
    { messages: { Settings: '<img src=x>' } },
    { terms: { Settings: '<style>body{display:none}</style>' } },
    { plurals: { tasks: { other: '<!--hidden-->{0}' } } }
  ]) assert.throws(() => LanguagePacks.validate(manifest({ ...pack(), ...extra })), /Invalid language manifest/);
});
