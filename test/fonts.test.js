'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const crypto = require('node:crypto');
const { Typography } = require('../src/shared/domain');
const sources = require('../fonts/sources.json');

test('portable font catalog has 24 licensed offline families plus nine system choices', () => {
  assert.equal(Typography.FONT_FAMILIES.length, 33);
  assert.equal(new Set(Typography.FONT_FAMILIES.map(font => font.id)).size, 33);
  assert.deepEqual(sources.fonts.map(font => font.id), Typography.FONT_FAMILIES.filter(font => font.bundled).map(font => font.id));
  assert.equal(sources.fonts.length, 24);
  assert.ok(Typography.FONT_FAMILIES.some(font => font.id === 'roboto' && font.bundled));
  assert.ok(Typography.FONT_FAMILIES.some(font => font.id === 'aptos' && !font.bundled));
  assert.ok(require('../package.json').build.files.includes('fonts/**/*'));
});
test('bundled font bytes, licenses, coverage and local CSS references are complete', () => {
  const folder = path.join(ROOT, 'fonts'), css = fs.readFileSync(path.join(folder, 'fonts.css'), 'utf8');
  const files = new Set(['fonts.css', 'sources.json', 'robotoslab-COPYRIGHT.txt']);
  let size = 0;
  assert.doesNotMatch(css, /https?:|@import|local\(/);
  for (const font of sources.fonts) {
    assert.match(font.licenseUrl, new RegExp(`/${sources.googleFontsRevision}/`));
    const license = fs.readFileSync(path.join(folder, font.license), 'utf8');
    assert.match(license, font.id === 'robotoslab' ? /Apache License/ : /SIL OPEN FONT LICENSE Version 1\.1/);
    files.add(font.license);
    assert.ok(font.files.some(file => file.file.includes('-latin-')));
    assert.ok(font.files.some(file => file.file.includes('-latin-ext-')));
    for (const file of font.files) {
      assert.match(file.file, /^[a-z0-9-]+\.woff2$/);
      assert.ok(css.includes(`url(${file.file})`));
      const bytes = fs.readFileSync(path.join(folder, file.file));
      assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
      assert.equal(bytes.readUInt32BE(8), bytes.length);
      assert.equal(bytes.length, file.bytes);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
      size += bytes.length; files.add(file.file);
    }
  }
  assert.ok(size < 4 * 1024 * 1024, 'Keep the portable font catalog below 4 MiB');
  assert.deepEqual(fs.readdirSync(folder).sort(), [...files].sort());
  assert.match(fs.readFileSync(path.join(folder, 'robotoslab-COPYRIGHT.txt'), 'utf8'), /Apache License/);
});
