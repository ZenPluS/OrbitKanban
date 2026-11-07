'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const { DEFAULT_COLORS, BACKDROP, TITLE_BAR_HEIGHT, themeColors, titleBarOverlay } = require('../src/desktop/platform/WindowChrome');

test('title bar starts with the active theme colors and falls back to the default palette', () => {
  const themes = [{ id: 'everforest', background: '#2D353B', text: '#D3C6AA' }, { id: 'bad', background: 'red', text: '#ffffff' }];
  assert.deepEqual(themeColors({ themeId: 'everforest', themes }), { background: '#2d353b', text: '#d3c6aa' });
  assert.deepEqual(themeColors({ themeId: 'bad', themes }), DEFAULT_COLORS);
  assert.deepEqual(themeColors({ themeId: 'missing', themes }), DEFAULT_COLORS);
  assert.deepEqual(themeColors(undefined), DEFAULT_COLORS);
  assert.deepEqual(themeColors({ themeId: 'x', themes: 'not a list' }), DEFAULT_COLORS);
});

test('caption buttons use the theme background and text with the top bar height', () => {
  assert.deepEqual(titleBarOverlay({ background: '#2D353B', text: '#D3C6AA', height: 44 }), { color: '#2d353b', symbolColor: '#d3c6aa', height: 44 });
  assert.deepEqual(titleBarOverlay({ background: '#ffffff', text: '#000000', height: 43.6, dimmed: false }, 1.25), { color: '#ffffff', symbolColor: '#000000', height: 55 });
  assert.equal(titleBarOverlay({ background: '#ffffff', text: '#000000', height: 4 }).height, TITLE_BAR_HEIGHT.min);
  assert.equal(titleBarOverlay({ background: '#ffffff', text: '#000000', height: 900 }).height, TITLE_BAR_HEIGHT.max);
});

test('caption buttons dim with the dialog backdrop and keep visible symbols', () => {
  const overlay = titleBarOverlay({ background: '#ffffff', text: '#ffffff', height: 44, dimmed: true });
  const expected = channel => Math.round(255 + (channel - 255) * BACKDROP.alpha);
  assert.equal(overlay.color, `#${[0x05, 0x08, 0x12].map(c => expected(c).toString(16).padStart(2, '0')).join('')}`);
  const lightness = color => parseInt(color.slice(1, 3), 16);
  assert.ok(lightness(overlay.symbolColor) > lightness(overlay.color));
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.match(css, new RegExp(`dialog::backdrop\\{background:${BACKDROP.color}${Math.round(BACKDROP.alpha * 255).toString(16)}`));
});

test('preload enables the custom title bar with the same argument used by the main process', () => {
  const { TITLE_BAR_ARGUMENT } = require('../src/desktop/platform/WindowChrome');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'desktop', 'preload.js'), 'utf8');
  assert.ok(preload.includes(`process.argv.includes('${TITLE_BAR_ARGUMENT}')`));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('src/**/*'));
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'desktop', 'platform', 'WindowChrome.js')));
  assert.equal(pkg.scripts.check, 'node tools/check.js');
});

test('invalid title bar requests are rejected', () => {
  for (const request of [null, 'x', [], { background: 'red', text: '#000000', height: 44 }, { background: '#ffffff', text: '#000', height: 44 }, { background: '#ffffff', text: '#000000', height: 'tall' }, { background: '#ffffff', text: '#000000', height: 44, dimmed: 'yes' }]) assert.equal(titleBarOverlay(request), null);
  assert.equal(titleBarOverlay({ background: '#ffffff', text: '#000000', height: 44 }, 0), null);
  assert.equal(titleBarOverlay({ background: '#ffffff', text: '#000000', height: 44 }, Number.NaN), null);
});
