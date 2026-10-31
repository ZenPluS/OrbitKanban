'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SPLASH_STATUS, SPLASH_MIN_VISIBLE, splashHoldTime, windowBackground } = require('./splash');
const { encodeBmp, quantize, encodeAvi } = require('./splash-image');

test('loading screen is English only with an indeterminate bar and no step counter', () => {
  const html = fs.readFileSync(path.join(__dirname, 'splash.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes(`>${SPLASH_STATUS}<`));
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /aria-valuenow|splash-counter|Caricamento|Preparazione/);
  assert.equal(html.match(/class="brand"/g).length, 1, 'markup appears once');
  assert.match(html, /@keyframes sweep/);
});
test('loading screen stays just long enough not to flicker', () => {
  assert.equal(splashHoldTime(null, 5000), 0, 'never shown: nothing to wait for');
  assert.equal(splashHoldTime(1000, 1100), SPLASH_MIN_VISIBLE - 100);
  assert.equal(splashHoldTime(1000, 1000 + SPLASH_MIN_VISIBLE + 50), 0);
  assert.equal(splashHoldTime(1000, 900), SPLASH_MIN_VISIBLE, 'clock going backwards');
  assert.ok(SPLASH_MIN_VISIBLE <= 500);
});
test('main window starts with the organization theme background', () => {
  const themes = [{ id: 'midnight', background: '#10131c' }, { id: 'daylight', background: '#EEF0F7' }];
  assert.equal(windowBackground({ themeId: 'daylight', themes }), '#EEF0F7');
  assert.equal(windowBackground({ themeId: 'missing', themes }), '#10131c');
  assert.equal(windowBackground({ themeId: 'bad', themes: [{ id: 'bad', background: 'red' }] }), '#10131c');
  assert.equal(windowBackground(undefined), '#10131c');
});
test('BMP encoder writes a padded bottom-up 24-bit bitmap over the background', () => {
  // 3×2 premultiplied BGRA: top row blue, green, transparent; bottom row red, half white, opaque black.
  const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 128, 128, 128, 128, 0, 0, 0, 255]);
  const file = encodeBmp(pixels, 3, 2, '#102030');
  const rowSize = 12;
  assert.equal(file.toString('ascii', 0, 2), 'BM');
  assert.equal(file.length, 54 + rowSize * 2);
  assert.deepEqual([file.readUInt32LE(2), file.readUInt32LE(10), file.readUInt32LE(14)], [file.length, 54, 40]);
  assert.deepEqual([file.readInt32LE(18), file.readInt32LE(22), file.readUInt16LE(26), file.readUInt16LE(28), file.readUInt32LE(34)], [3, 2, 1, 24, rowSize * 2]);
  const pixel = (x, y) => [...file.subarray(54 + (1 - y) * rowSize + x * 3, 54 + (1 - y) * rowSize + x * 3 + 3)];
  assert.deepEqual(pixel(0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(1, 0), [0, 255, 0]);
  assert.deepEqual(pixel(2, 0), [0x30, 0x20, 0x10]);
  assert.deepEqual(pixel(0, 1), [0, 0, 255]);
  assert.deepEqual(pixel(1, 1), [152, 144, 136]);
  assert.deepEqual(pixel(2, 1), [0, 0, 0]);
  assert.deepEqual([...file.subarray(54 + 9, 54 + 12)], [0, 0, 0], 'row padding');
});
test('BMP encoder rejects inconsistent input', () => {
  assert.throws(() => encodeBmp(Buffer.alloc(10), 3, 2), /non validi/);
  assert.throws(() => encodeBmp(Buffer.alloc(0), 0, 0), /non validi/);
  assert.throws(() => encodeBmp(null, 1, 1), /non validi/);
  assert.throws(() => encodeBmp(Buffer.alloc(8), 1.5, 2), /non validi/);
});
test('palette is exact for few colors and close for many', () => {
  const few = quantize([Uint8Array.from([1, 2, 3, 200, 100, 50]), Uint8Array.from([200, 100, 50, 1, 2, 3])]);
  assert.equal(few.palette.length, 2);
  assert.deepEqual(few.frames.map(frame => [...frame].map(index => few.palette[index])), [[[1, 2, 3], [200, 100, 50]], [[200, 100, 50], [1, 2, 3]]]);
  const gradient = new Uint8Array(3 * 4096);
  for (let index = 0; index < 4096; index++) gradient.set([index & 255, index >> 4, 255 - (index & 255)], index * 3);
  const many = quantize([gradient]);
  assert.ok(many.palette.length <= 256);
  let worst = 0;
  many.frames[0].forEach((entry, index) => {
    const color = many.palette[entry];
    worst = Math.max(worst, ...[0, 1, 2].map(c => Math.abs(color[c] - gradient[index * 3 + c])));
  });
  assert.ok(worst <= 24, `largest channel error ${worst}`);
  assert.throws(() => quantize([]), /non validi/);
});
test('AVI encoder writes a looping 8-bit clip the animation control can read', () => {
  const frames = [Uint8Array.from([0, 1, 1, 0, 1, 0]), Uint8Array.from([1, 0, 0, 1, 0, 1])];
  const file = encodeAvi({ width: 3, height: 2, fps: 30, palette: [[16, 19, 28], [163, 146, 255]], frames });
  assert.deepEqual([file.toString('ascii', 0, 4), file.readUInt32LE(4), file.toString('ascii', 8, 12)], ['RIFF', file.length - 8, 'AVI ']);
  const find = (id, from = 12) => { const at = file.indexOf(id, from, 'ascii'); assert.ok(at > 0, id); return at; };
  const avih = find('avih') + 8;
  assert.deepEqual([file.readUInt32LE(avih), file.readUInt32LE(avih + 12), file.readUInt32LE(avih + 16), file.readUInt32LE(avih + 24), file.readUInt32LE(avih + 32), file.readUInt32LE(avih + 36)], [33333, 0x10, 2, 1, 3, 2]);
  const strh = find('strh') + 8;
  assert.deepEqual([file.toString('ascii', strh, strh + 4), file.toString('ascii', strh + 4, strh + 8), file.readUInt32LE(strh + 20), file.readUInt32LE(strh + 24), file.readUInt32LE(strh + 32)], ['vids', 'DIB ', 1, 30, 2]);
  const strf = find('strf') + 8;
  assert.deepEqual([file.readUInt32LE(strf), file.readInt32LE(strf + 4), file.readInt32LE(strf + 8), file.readUInt16LE(strf + 14), file.readUInt32LE(strf + 16), file.readUInt32LE(strf + 32)], [40, 3, 2, 8, 0, 256]);
  assert.deepEqual([...file.subarray(strf + 44, strf + 48)], [255, 146, 163, 0], 'palette is stored as BGR');
  const movi = find('movi'), first = find('00db', movi);
  assert.equal(file.readUInt32LE(first + 4), 8, 'rows padded to 4 bytes');
  assert.deepEqual([...file.subarray(first + 8, first + 16)], [0, 1, 0, 0, 0, 1, 1, 0], 'bottom row first');
  const idx1 = find('idx1', first) + 8;
  assert.deepEqual([file.toString('ascii', idx1, idx1 + 4), file.readUInt32LE(idx1 + 4), file.readUInt32LE(idx1 + 8), file.readUInt32LE(idx1 + 12)], ['00db', 0x10, first - movi, 8]);
  assert.equal(file.readUInt32LE(idx1 + 24), first - movi + 16);
  assert.throws(() => encodeAvi({ width: 3, height: 2, fps: 30, palette: [[0, 0, 0]], frames: [new Uint8Array(5)] }), /non validi/);
  assert.throws(() => encodeAvi({ width: 3, height: 2, fps: 0, palette: [[0, 0, 0]], frames }), /non valido/);
});
