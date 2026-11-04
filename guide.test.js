'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guide = require('./guide');
const icons = require('./icons');
const columns = require('./columns');

const pack = code => JSON.parse(fs.readFileSync(path.join(__dirname, 'languages', `${code}.json`), 'utf8'));
const en = pack('en');
const it = pack('it');
const lookup = (language, text) => language.terms[text] ?? language.messages[text];
const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
const settingsTabIds = [...renderer.match(/const settingsTabs = \[([\s\S]*?)\n\];/)[1].matchAll(/\{ id: '([^']+)'/g)].map(match => match[1]);
const catalogIds = columns.BUILTIN_FIELDS.tasks.filter(field => field.catalog).map(field => field.catalog);
const count = (text, marker) => text.split(marker).length - 1;
const keyTokens = (text, keyWords) => [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]).filter(token => token.split('+').every(part => guide.isLiteralKey(part) || keyWords.has(part)));

test('guide sections are complete and point to real destinations', () => {
  assert.ok(settingsTabIds.length >= 12 && settingsTabIds.includes('updates'));
  assert.deepEqual([...catalogIds].sort(), ['highlights', 'statuses', 'tags', 'urgencies']);
  const ids = guide.sections.map(section => section.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 15);
  assert.deepEqual(guide.sections.filter(section => section.tab !== undefined).map(section => section.tab), [0, 1, 2, 3]);
  for (const section of guide.sections) {
    assert.match(section.id, /^[a-z][a-z-]*$/, section.id);
    assert.ok(icons.names().includes(section.icon), `${section.id}: icon ${section.icon}`);
    if (section.family) assert.ok(icons.families.includes(section.family), `${section.id}: family ${section.family}`);
    assert.ok(section.tab !== undefined || section.title, `${section.id}: title`);
    assert.ok(section.summary, `${section.id}: summary`);
    assert.ok(Boolean(section.topics) !== Boolean(section.shortcuts), `${section.id}: topics or shortcuts`);
    for (const topic of section.topics || []) {
      assert.ok(topic.title && topic.items.length, `${section.id}: topic`);
      assert.ok(topic.items.every(item => typeof item === 'string' && item.trim()), `${section.id}: ${topic.title}`);
    }
    for (const [combos, description] of section.shortcuts || []) {
      assert.ok(description && combos.length, `${section.id}: shortcut`);
      for (const keys of combos) assert.ok(keys.length && keys.every(key => guide.isLiteralKey(key) || guide.keyWords().includes(key)), `${section.id}: ${keys.join('+')}`);
    }
    for (const target of section.go || []) {
      if (target.view !== undefined) assert.ok([0, 1, 2, 3].includes(target.view), `${section.id}: view ${target.view}`);
      else assert.ok(settingsTabIds.includes(target.settings) || catalogIds.includes(target.settings), `${section.id}: settings ${target.settings}`);
    }
  }
});

test('every guide text is translated in English and Italian with its markup intact', () => {
  const texts = [...new Set([...guide.texts(), ...guide.uiTexts()])];
  assert.ok(texts.length >= 200);
  const englishKeys = new Set(guide.keyWords());
  const italianKeys = new Set(guide.keyWords().map(key => lookup(it, key)));
  assert.deepEqual([...italianKeys], ['Maiusc', 'clic', 'Doppio clic', 'Invio']);
  for (const text of texts) {
    assert.equal(lookup(en, text), text, `en: ${text}`);
    const italian = lookup(it, text);
    assert.ok(typeof italian === 'string' && italian.trim(), `it: ${text}`);
    if (text in en.terms) assert.notEqual(italian, text, `it untranslated: ${text}`);
    assert.equal(count(text, '**') % 2, 0, `unbalanced bold: ${text}`);
    assert.equal(count(text, '`') % 2, 0, `unbalanced key: ${text}`);
    for (const marker of ['**', '`', '{0}', '→']) assert.equal(count(italian, marker), count(text, marker), `it ${marker}: ${text}`);
    assert.equal(keyTokens(italian, italianKeys).length, keyTokens(text, englishKeys).length, `it keys: ${italian}`);
  }
});

test('the renderer translates only guide texts it knows about', () => {
  const block = renderer.slice(renderer.indexOf('// ---- In-app guide'), renderer.indexOf('function openGuide'));
  const used = [...block.matchAll(/(?:term|fillTerm)\("([^"]+)"/g)].map(match => match[1]);
  assert.ok(used.length >= 10);
  for (const text of used) assert.ok(guide.uiTexts().includes(text), text);
  assert.ok(guide.uiTexts().every(text => renderer.includes(`"${text}"`)), 'every guide UI text is used');
});
