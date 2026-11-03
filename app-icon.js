'use strict';
// Windows icon of the executables: build/icon.ico is generated from app-logo.svg by make-splash.js,
// and after packaging the icons embedded in the .exe files are read back and compared with it.
const fs = require('node:fs');

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const fail = message => { throw new Error(message); };
const isPng = data => data.length > 8 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a;

// 32-bit DIB with straight alpha plus the 1-bit AND mask that older Windows code paths still read.
function encodeDib(rgba, size) {
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
function encodeIco(images) {
  if (!Array.isArray(images) || !images.length) fail('Invalid icon images.');
  const sizes = new Set();
  const entries = images.map(({ size, rgba, png }) => {
    if (!Number.isInteger(size) || size < 1 || size > 256 || sizes.has(size)) fail('Invalid icon dimensions.');
    sizes.add(size);
    if (size === 256) {
      if (!Buffer.isBuffer(png) || !isPng(png)) fail('The 256 px icon must be a PNG.');
      return { size, data: png };
    }
    if (!rgba || rgba.length !== size * size * 4) fail('Invalid icon pixels.');
    return { size, data: encodeDib(rgba, size) };
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

const describe = (width, data) => ({ size: width || 256, format: isPng(data) ? 'png' : 'dib', data });

function parseIco(file) {
  if (!Buffer.isBuffer(file) || file.length < 6 || file.readUInt16LE(0) !== 0 || file.readUInt16LE(2) !== 1) fail('Invalid ICO file.');
  const count = file.readUInt16LE(4);
  if (!count || file.length < 6 + count * 16) fail('Invalid ICO file.');
  return Array.from({ length: count }, (_, index) => {
    const at = 6 + index * 16, length = file.readUInt32LE(at + 8), offset = file.readUInt32LE(at + 12);
    if (offset + length > file.length) fail('File ICO troncato.');
    return describe(file[at], file.subarray(offset, offset + length));
  });
}

// Icon groups of a Windows executable, in resource order: Explorer shows the first one.
function readExecutableIcons(file) {
  if (!Buffer.isBuffer(file) || file.length < 64 || file.toString('ascii', 0, 2) !== 'MZ') fail('Invalid Windows executable.');
  const pe = file.readUInt32LE(0x3c);
  if (pe + 24 > file.length || file.readUInt32BE(pe) !== 0x50450000) fail('Invalid Windows executable.');
  const sectionCount = file.readUInt16LE(pe + 6), optional = pe + 24, magic = file.readUInt16LE(optional);
  if (magic !== 0x10b && magic !== 0x20b) fail('Invalid Windows executable.');
  const directory = optional + (magic === 0x20b ? 112 : 96) + 2 * 8;
  const resourceRva = file.readUInt32LE(directory);
  if (!resourceRva) return [];
  const sectionTable = optional + file.readUInt16LE(pe + 20);
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const at = sectionTable + index * 40;
    return { virtualSize: file.readUInt32LE(at + 8), address: file.readUInt32LE(at + 12), rawSize: file.readUInt32LE(at + 16), raw: file.readUInt32LE(at + 20) };
  });
  const offsetOf = rva => {
    const section = sections.find(s => rva >= s.address && rva < s.address + Math.max(s.virtualSize, s.rawSize));
    if (!section) fail('Unreadable executable resources.');
    return rva - section.address + section.raw;
  };
  const base = offsetOf(resourceRva);
  const entries = at => {
    const count = file.readUInt16LE(at + 12) + file.readUInt16LE(at + 14);
    return Array.from({ length: count }, (_, index) => {
      const name = file.readUInt32LE(at + 16 + index * 8), target = file.readUInt32LE(at + 20 + index * 8);
      let id = name;
      if (name & 0x80000000) {
        const text = base + (name & 0x7fffffff);
        id = file.toString('utf16le', text + 2, text + 2 + file.readUInt16LE(text) * 2);
      }
      return { id, offset: base + (target & 0x7fffffff), directory: Boolean(target & 0x80000000) };
    });
  };
  // Type -> name -> language -> data; the first language of each resource is used.
  const resources = type => {
    const typeEntry = entries(base).find(entry => entry.id === type && entry.directory);
    if (!typeEntry) return [];
    return entries(typeEntry.offset).filter(entry => entry.directory).map(entry => {
      const language = entries(entry.offset).find(item => !item.directory);
      if (!language) fail('Unreadable executable resources.');
      const at = offsetOf(file.readUInt32LE(language.offset)), size = file.readUInt32LE(language.offset + 4);
      if (at + size > file.length) fail('Truncated executable resources.');
      return { id: entry.id, data: file.subarray(at, at + size) };
    });
  };
  const images = new Map(resources(RT_ICON).map(entry => [entry.id, entry.data]));
  return resources(RT_GROUP_ICON).map(({ id, data }) => ({
    id,
    images: Array.from({ length: data.readUInt16LE(4) }, (_, index) => {
      const at = 6 + index * 14, image = images.get(data.readUInt16LE(at + 12));
      if (!image) fail('Incomplete executable icon.');
      return describe(data[at], image);
    })
  }));
}

// The executable's main icon must contain exactly the images of the ICO file.
function verifyExecutableIcon(executable, ico) {
  const [main] = readExecutableIcons(executable);
  if (!main) fail('The executable does not contain an icon.');
  const expected = parseIco(ico), actual = new Map(main.images.map(image => [image.size, image]));
  const missing = expected.filter(image => !actual.get(image.size)?.data.equals(image.data)).map(image => `${image.size}px`);
  if (missing.length || actual.size !== expected.length) fail(`The executable icon does not match the app icon (${missing.join(', ') || 'extra formats'}).`);
  return expected.map(({ size, format }) => ({ size, format }));
}

if (require.main === module) {
  try {
    const [option, icoPath, ...executables] = process.argv.slice(2);
    if (option !== '--verify' || !icoPath || !executables.length) fail('Usage: node app-icon.js --verify build/icon.ico <file.exe>...');
    const ico = fs.readFileSync(icoPath);
    for (const executable of executables) {
      const formats = verifyExecutableIcon(fs.readFileSync(executable), ico);
      console.log(`Verified icon: ${executable} (${formats.map(format => `${format.size}px ${format.format}`).join(', ')})`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { ICON_SIZES, encodeIco, parseIco, readExecutableIcons, verifyExecutableIcon };
