'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const icons = require('./icons');
const { ICON_FAMILIES } = require('./core');

test('every icon has one symbol in the sprite and renders through <use>', () => {
  const sprite = icons.spriteMarkup();
  assert.ok(icons.names().length >= 50);
  for (const name of icons.names()) {
    assert.equal(sprite.split(`<symbol id="i-${name}"`).length - 1, 1, name);
    assert.match(icons.icon(name), new RegExp(`^<svg class="ico [^"]+" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>$`));
  }
  assert.throws(() => icons.icon('missing-icon'), /Unknown icon/);
});

test('feature icons use the theme gradient families, line icons follow the text color', () => {
  assert.deepEqual([...icons.families].sort(), [...Object.keys(ICON_FAMILIES), 'accent'].sort());
  const sprite = icons.spriteMarkup();
  for (const family of icons.families) assert.match(sprite, new RegExp(`<linearGradient id="ig-${family}"[^>]*>.*?var\\(--ig-${family}-1,#[0-9a-f]{6}\\).*?var\\(--ig-${family}-2,#[0-9a-f]{6}\\)`, 'i'));
  assert.equal(icons.icon('tasks'), '<svg class="ico ico-blue" aria-hidden="true" focusable="false"><use href="#i-tasks"/></svg>');
  assert.equal(icons.icon('tag', 'violet'), '<svg class="ico ico-violet" aria-hidden="true" focusable="false"><use href="#i-tag"/></svg>');
  assert.equal(icons.icon('tag', 'unknown'), icons.icon('tag'));
  assert.ok(icons.isLine('close') && !icons.isLine('tasks'));
  assert.match(icons.icon('close'), /class="ico ico-line"/);
});
