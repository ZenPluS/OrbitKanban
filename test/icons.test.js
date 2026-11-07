'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IconLibrary, ThemeGenerator } = require('../src/shared/graphics');

test('every icon has one symbol in the sprite and renders through <use>', () => {
  const sprite = IconLibrary.spriteMarkup();
  assert.ok(IconLibrary.names().length >= 50);
  for (const name of IconLibrary.names()) {
    assert.equal(sprite.split(`<symbol id="i-${name}"`).length - 1, 1, name);
    assert.match(IconLibrary.icon(name), new RegExp(`^<svg class="ico [^"]+" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>$`));
  }
  assert.throws(() => IconLibrary.icon('missing-icon'), /Unknown icon/);
});

test('feature icons use the theme gradient families, line icons follow the text color', () => {
  assert.deepEqual([...IconLibrary.families].sort(), [...Object.keys(ThemeGenerator.ICON_FAMILIES), 'accent'].sort());
  const sprite = IconLibrary.spriteMarkup();
  for (const family of IconLibrary.families) assert.match(sprite, new RegExp(`<linearGradient id="ig-${family}"[^>]*>.*?var\\(--ig-${family}-1,#[0-9a-f]{6}\\).*?var\\(--ig-${family}-2,#[0-9a-f]{6}\\)`, 'i'));
  assert.equal(IconLibrary.icon('tasks'), '<svg class="ico ico-blue" aria-hidden="true" focusable="false"><use href="#i-tasks"/></svg>');
  assert.equal(IconLibrary.icon('tag', 'violet'), '<svg class="ico ico-violet" aria-hidden="true" focusable="false"><use href="#i-tag"/></svg>');
  assert.equal(IconLibrary.icon('tag', 'unknown'), IconLibrary.icon('tag'));
  assert.ok(IconLibrary.isLine('close') && !IconLibrary.isLine('tasks'));
  assert.match(IconLibrary.icon('close'), /class="ico ico-line"/);
});
