'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { ICON_SIZES, encodeIco, parseIco, readExecutableIcons, verifyExecutableIcon } = require('../tools/AppIcon');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), zlib.deflateSync(Buffer.from('png'))]);
const solid = (size, rgba) => Buffer.alloc(size * size * 4).fill(Buffer.from(rgba));
const sampleIco = () => encodeIco(ICON_SIZES.map(size => size === 256 ? { size, png: PNG } : { size, rgba: solid(size, [10, 20, 30, 255]) }));

// Minimal 64-bit Windows executable with a .rsrc section: [[type, [[id, data]]]].
function buildExecutable(types, rva = 0x3000) {
  const section = Buffer.alloc(1 << 20);
  let end = 0;
  const take = length => { const at = end; end += length; return at; };
  const directory = count => { const at = take(16 + count * 8); section.writeUInt16LE(count, at + 14); return at; };
  const link = (dir, index, id, target) => { section.writeUInt32LE(id, dir + 16 + index * 8); section.writeUInt32LE(target >>> 0, dir + 20 + index * 8); };
  const root = directory(types.length);
  types.forEach(([type, items], typeIndex) => {
    const typeDir = directory(items.length);
    link(root, typeIndex, type, 0x80000000 | typeDir);
    items.forEach(([id, data], index) => {
      const nameDir = directory(1), entry = take(16), blob = take(data.length);
      link(typeDir, index, id, 0x80000000 | nameDir);
      link(nameDir, 0, 1033, entry);
      data.copy(section, blob);
      section.writeUInt32LE(rva + blob, entry);
      section.writeUInt32LE(data.length, entry + 4);
    });
  });
  const header = Buffer.alloc(0x400), optional = 88, table = optional + 240;
  header.write('MZ', 0, 'ascii');
  header.writeUInt32LE(64, 0x3c);
  header.writeUInt32BE(0x50450000, 64);
  header.writeUInt16LE(0x8664, 68);
  header.writeUInt16LE(1, 70);
  header.writeUInt16LE(240, 84);
  header.writeUInt16LE(0x20b, optional);
  header.writeUInt32LE(rva, optional + 128);
  header.writeUInt32LE(end, optional + 132);
  header.write('.rsrc', table, 'ascii');
  header.writeUInt32LE(end, table + 8);
  header.writeUInt32LE(rva, table + 12);
  header.writeUInt32LE(end, table + 16);
  header.writeUInt32LE(header.length, table + 20);
  return Buffer.concat([header, section.subarray(0, end)]);
}
// Icons as Windows stores them in an executable: one RT_ICON per image and an RT_GROUP_ICON that lists them.
function iconResources(ico, groupId = 1, firstId = 1) {
  const images = parseIco(ico), group = Buffer.alloc(6 + images.length * 14);
  group.writeUInt16LE(1, 2);
  group.writeUInt16LE(images.length, 4);
  images.forEach((image, index) => {
    const at = 6 + index * 14;
    ico.copy(group, at, 6 + index * 16, 6 + index * 16 + 12);
    group.writeUInt16LE(firstId + index, at + 12);
  });
  return [[3, images.map((image, index) => [firstId + index, image.data])], [14, [[groupId, group]]]];
}

test('ICO uses 32-bit DIB images up to 128 px and PNG only at 256 px', () => {
  const ico = sampleIco();
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, ICON_SIZES.length]);
  assert.deepEqual(ICON_SIZES, [16, 24, 32, 48, 64, 128, 256]);
  const images = parseIco(ico);
  assert.deepEqual(images.map(({ size, format }) => `${size}:${format}`), ['16:dib', '24:dib', '32:dib', '48:dib', '64:dib', '128:dib', '256:png']);
  assert.equal(ico[6 + 6 * 16], 0, '256 px is stored as 0 in the directory');
  ICON_SIZES.forEach((size, index) => {
    const at = 6 + index * 16;
    assert.deepEqual([ico.readUInt16LE(at + 4), ico.readUInt16LE(at + 6)], [1, 32]);
  });
  assert.ok(images.at(-1).data.equals(PNG));
  const dib = images[0].data;
  assert.deepEqual([dib.readUInt32LE(0), dib.readInt32LE(4), dib.readInt32LE(8), dib.readUInt16LE(12), dib.readUInt16LE(14), dib.readUInt32LE(16)], [40, 16, 32, 1, 32, 0]);
  assert.equal(dib.length, 40 + 16 * 16 * 4 + 4 * 16, 'pixels plus a 1-bit mask with 32-bit rows');
  assert.deepEqual([...dib.subarray(40, 44)], [30, 20, 10, 255], 'BGRA');
});
test('ICO pixels are bottom-up with straight alpha and a transparency mask', () => {
  const rgba = Buffer.alloc(2 * 2 * 4);
  rgba.set([255, 0, 0, 255], 0);
  rgba.set([0, 255, 0, 128], 4);
  rgba.set([0, 0, 255, 0], 8);
  rgba.set([1, 2, 3, 255], 12);
  const [image] = parseIco(encodeIco([{ size: 2, rgba }]));
  const pixel = (x, y) => [...image.data.subarray(40 + ((1 - y) * 2 + x) * 4, 44 + ((1 - y) * 2 + x) * 4)];
  assert.deepEqual(pixel(0, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(1, 0), [0, 255, 0, 128], 'alpha is not premultiplied');
  assert.deepEqual(pixel(0, 1), [255, 0, 0, 0]);
  assert.deepEqual(pixel(1, 1), [3, 2, 1, 255]);
  assert.deepEqual([image.data.readUInt32BE(56), image.data.readUInt32BE(60)], [0x80000000, 0], 'only the transparent pixel is masked; bottom row first');
});
test('ICO encoder rejects inconsistent images', () => {
  assert.throws(() => encodeIco([]), /invalid icon images/i);
  assert.throws(() => encodeIco([{ size: 16, rgba: Buffer.alloc(10) }]), /invalid icon pixels/i);
  assert.throws(() => encodeIco([{ size: 16, rgba: solid(16, [0, 0, 0, 0]) }, { size: 16, rgba: solid(16, [0, 0, 0, 0]) }]), /invalid icon dimensions/i);
  assert.throws(() => encodeIco([{ size: 300, rgba: solid(300, [0, 0, 0, 0]) }]), /invalid icon dimensions/i);
  assert.throws(() => encodeIco([{ size: 256, png: Buffer.from('not a png') }]), /PNG/);
  assert.throws(() => parseIco(Buffer.from('nope')), /invalid/i);
});
test('executable icon is read back and must match the application ICO exactly', () => {
  const ico = sampleIco();
  const executable = buildExecutable(iconResources(ico, 103, 7));
  const [group] = readExecutableIcons(executable);
  assert.equal(group.id, 103);
  assert.deepEqual(group.images.map(({ size, format }) => `${size}:${format}`), parseIco(ico).map(({ size, format }) => `${size}:${format}`));
  assert.deepEqual(verifyExecutableIcon(executable, ico).map(image => image.size), ICON_SIZES);

  const other = encodeIco(ICON_SIZES.map(size => size === 256 ? { size, png: PNG } : { size, rgba: solid(size, size === 48 ? [9, 9, 9, 255] : [10, 20, 30, 255]) }));
  assert.throws(() => verifyExecutableIcon(buildExecutable(iconResources(other)), ico), /48px/);
  const fewer = encodeIco([{ size: 16, rgba: solid(16, [10, 20, 30, 255]) }]);
  assert.throws(() => verifyExecutableIcon(buildExecutable(iconResources(fewer)), ico), /does not match/i);
  assert.throws(() => verifyExecutableIcon(buildExecutable([[16, [[1, Buffer.alloc(8)]]]]), ico), /does not contain an icon/i);
  assert.throws(() => readExecutableIcons(Buffer.from('not an executable at all, definitely not one, nope, really nothing')), /invalid/i);
});
test('icon reader understands a real Windows executable', { skip: process.platform !== 'win32' }, () => {
  const electron = require('electron');
  if (!fs.existsSync(electron)) return;
  const groups = readExecutableIcons(fs.readFileSync(electron));
  assert.ok(groups.length > 0);
  assert.ok(groups[0].images.length > 0 && groups[0].images.every(image => image.size > 0 && image.data.length > 0));
  assert.throws(() => verifyExecutableIcon(fs.readFileSync(electron), sampleIco()), /does not match/i);
});
