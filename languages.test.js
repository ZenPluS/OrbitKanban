'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const i18n = require('./i18n');
const { createLanguageStore, TEMPLATE_FILE } = require('./languages');

async function withFolder(run) {
  const dataFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbita-languages-'));
  try { await run(dataFolder, createLanguageStore({ dataFolder })); }
  finally {
    i18n.reset();
    i18n.loadBuiltIn();
    await fs.rm(dataFolder, { recursive: true, force: true });
  }
}
const pack = (code, extra = {}) => JSON.stringify({ format: i18n.FORMAT, version: 1, code, name: code.toUpperCase(), ...extra });

test('without a languages folder only the built-in languages are listed', () => withFolder(async (_, languages) => {
  const info = await languages.reload();
  assert.deepEqual(info.languages.map(({ code, source }) => [code, source]), [['en', 'built-in'], ['it', 'built-in']]);
  assert.deepEqual(info.errors, []);
  assert.equal(info.packs.length, 2);
}));

test('the folder receives an English template that is ignored as a language', () => withFolder(async (dataFolder, languages) => {
  const folder = await languages.prepareFolder();
  assert.equal(folder, path.join(dataFolder, 'languages'));
  const template = await fs.readFile(path.join(folder, TEMPLATE_FILE));
  assert.ok(template.equals(await fs.readFile(path.join(i18n.builtInFolder, 'en.json'))));
  const before = (await fs.stat(path.join(folder, TEMPLATE_FILE))).mtimeMs;
  await new Promise(resolve => setTimeout(resolve, 20));
  await languages.prepareFolder();
  assert.equal((await fs.stat(path.join(folder, TEMPLATE_FILE))).mtimeMs, before);
  const info = await languages.reload();
  assert.deepEqual(info.languages.map(language => language.code), ['en', 'it']);
  assert.deepEqual(info.errors, []);
  assert.deepEqual((await fs.readdir(folder)).sort(), [TEMPLATE_FILE]);
}));

test('user files add languages, customise built-in ones and report invalid files', () => withFolder(async (_, languages) => {
  const folder = await languages.prepareFolder();
  await fs.writeFile(path.join(folder, 'de.json'), '\uFEFF' + JSON.stringify({
    format: i18n.FORMAT, version: 1, code: 'de', name: 'Deutsch', locale: 'de-DE',
    messages: { 'Save settings': 'Einstellungen speichern' },
    terms: { 'To do': 'Aufgabe' },
    plurals: { theme: { one: '{0} Thema', other: '{0} Themen' } }
  }));
  await fs.writeFile(path.join(folder, 'en.json'), pack('en', { name: 'English', messages: { Cancel: 'Dismiss' } }));
  await fs.writeFile(path.join(folder, 'pt-BR.json'), pack('pt-BR', { name: 'Português (Brasil)' }));
  await fs.writeFile(path.join(folder, 'fr.json'), pack('es'));
  await fs.writeFile(path.join(folder, 'nl.json'), '{ broken');
  await fs.writeFile(path.join(folder, 'xx.json'), JSON.stringify({ format: 'other' }));
  await fs.writeFile(path.join(folder, 'notes.txt'), 'ignored');
  await fs.mkdir(path.join(folder, 'old.json'));
  const info = await languages.reload();
  assert.deepEqual(info.languages.map(({ code, source }) => [code, source]), [['de', 'added'], ['en', 'customized'], ['it', 'built-in'], ['pt-BR', 'added']]);
  assert.deepEqual(info.errors.map(error => error.file), ['fr.json', 'nl.json', 'xx.json']);
  assert.match(info.errors[0].message, /file name/i);
  assert.match(info.errors[1].message, /JSON/);
  assert.match(info.errors[2].message, /not an OrbitKanban language/i);
  assert.equal(i18n.translate('Save settings', 'de'), 'Einstellungen speichern');
  assert.equal(i18n.translate('Manage organizations', 'de'), 'Manage organizations');
  assert.equal(i18n.term('To do', 'de'), 'Aufgabe');
  assert.equal(i18n.plural(2, 'theme', 'de'), '2 Themen');
  assert.equal(i18n.translate('Cancel', 'en'), 'Dismiss');
  assert.equal(i18n.translate('Save settings', 'en'), 'Save settings');
  assert.equal(i18n.locale('de'), 'de-DE');
  assert.ok(info.packs.some(item => item.code === 'de' && item.messages['Save settings']));

  await fs.rm(path.join(folder, 'de.json'));
  await fs.rm(path.join(folder, 'en.json'));
  const reloaded = await languages.reload();
  assert.deepEqual(reloaded.languages.map(({ code, source }) => [code, source]), [['en', 'built-in'], ['it', 'built-in'], ['pt-BR', 'added']]);
  assert.equal(i18n.has('de'), false);
  assert.equal(i18n.translate('Cancel', 'en'), 'Cancel');
  assert.deepEqual(languages.info().languages, reloaded.languages);
}));

test('language files written with the former Italian source keys still translate the English UI', () => withFolder(async (_, languages) => {
  const folder = await languages.prepareFolder();
  await fs.writeFile(path.join(folder, 'de.json'), JSON.stringify({
    format: i18n.FORMAT, version: 1, code: 'de', name: 'Deutsch',
    messages: { 'Salva impostazioni': 'Einstellungen speichern' },
    terms: { 'Da fare': 'Aufgabe' },
    plurals: { tema: { one: '{0} Thema', other: '{0} Themen' } }
  }));
  await fs.writeFile(path.join(folder, 'en.json'), pack('en', { name: 'English', messages: { Annulla: 'Dismiss' } }));
  const info = await languages.reload();
  assert.deepEqual(info.errors, []);
  assert.equal(i18n.translate('Save settings', 'de'), 'Einstellungen speichern');
  assert.equal(i18n.term('To do', 'de'), 'Aufgabe');
  assert.equal(i18n.plural(2, 'theme', 'de'), '2 Themen');
  assert.equal(i18n.translate('Cancel', 'en'), 'Dismiss');
}));

test('oversized language files are skipped', () => withFolder(async (_, languages) => {
  const folder = await languages.prepareFolder();
  await fs.writeFile(path.join(folder, 'de.json'), pack('de', { notes: 'x'.repeat(2 * 1024 * 1024) }));
  const info = await languages.reload();
  assert.equal(i18n.has('de'), false);
  assert.deepEqual(info.errors.map(error => [error.file, error.message]), [['de.json', 'Language file too large.']]);
}));
