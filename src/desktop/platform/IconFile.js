'use strict';
// Windows ICO files: the executable icon built from app-logo.svg and the themed window icon the app keeps in data/runtime.
const { AppLogo } = require('../../shared/graphics');

class IconFile {
  static ICON_SIZES = AppLogo.ICON_SIZES;
  static #fail = message => { throw new Error(message); };
  static isPng = data => data.length > 8 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a;

  // 32-bit DIB with straight alpha plus the 1-bit AND mask that older Windows code paths still read.
  static #encodeDib(rgba, size) {
    const pixelBytes = size * size * 4, maskRow = Math.ceil(size / 32) * 4;
    const data = Buffer.alloc(40 + pixelBytes + maskRow * size);
    data.writeUInt32LE(40, 0);
    data.writeInt32LE(size, 4);
    data.writeInt32LE(size * 2, 8);
    data.writeUInt16LE(1, 12);
    data.writeUInt16LE(32, 14);
    data.writeUInt32LE(pixelBytes + maskRow * size, 20);
    for (let y = 0; y < size; y++) {
      const row = 40 + (size - 1 - y) * size * 4, mask = 40 + pixelBytes + (size - 1 - y) * maskRow;
      for (let x = 0; x < size; x++) {
        const source = (y * size + x) * 4, target = row + x * 4;
        data[target] = rgba[source + 2];
        data[target + 1] = rgba[source + 1];
        data[target + 2] = rgba[source];
        data[target + 3] = rgba[source + 3];
        if (rgba[source + 3] === 0) data[mask + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return data;
  }

  // Every Windows component can draw DIB entries; PNG is used only at 256 px, as Windows expects.
  static encode(images) {
    if (!Array.isArray(images) || !images.length) IconFile.#fail('Invalid icon images.');
    const sizes = new Set();
    const entries = images.map(({ size, rgba, png }) => {
      if (!Number.isInteger(size) || size < 1 || size > 256 || sizes.has(size)) IconFile.#fail('Invalid icon dimensions.');
      sizes.add(size);
      if (size === 256) {
        if (!Buffer.isBuffer(png) || !IconFile.isPng(png)) IconFile.#fail('The 256 px icon must be a PNG.');
        return { size, data: png };
      }
      if (!rgba || rgba.length !== size * size * 4) IconFile.#fail('Invalid icon pixels.');
      return { size, data: IconFile.#encodeDib(rgba, size) };
    }).sort((a, b) => a.size - b.size);
    const header = Buffer.alloc(6 + entries.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(entries.length, 4);
    let offset = header.length;
    entries.forEach(({ size, data }, index) => {
      const at = 6 + index * 16;
      header[at] = header[at + 1] = size & 255;
      header.writeUInt16LE(1, at + 4);
      header.writeUInt16LE(32, at + 6);
      header.writeUInt32LE(data.length, at + 8);
      header.writeUInt32LE(offset, at + 12);
      offset += data.length;
    });
    return Buffer.concat([header, ...entries.map(entry => entry.data)]);
  }

  static image = (width, data) => ({ size: width || 256, format: IconFile.isPng(data) ? 'png' : 'dib', data });

  static parse(file) {
    if (!Buffer.isBuffer(file) || file.length < 6 || file.readUInt16LE(0) !== 0 || file.readUInt16LE(2) !== 1) IconFile.#fail('Invalid ICO file.');
    const count = file.readUInt16LE(4);
    if (!count || file.length < 6 + count * 16) IconFile.#fail('Invalid ICO file.');
    return Array.from({ length: count }, (_, index) => {
      const at = 6 + index * 16, length = file.readUInt32LE(at + 8), offset = file.readUInt32LE(at + 12);
      if (offset + length > file.length) IconFile.#fail('Truncated ICO file.');
      return IconFile.image(file[at], file.subarray(offset, offset + length));
    });
  }
}

module.exports = IconFile;
