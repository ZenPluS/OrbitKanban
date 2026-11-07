'use strict';
// Windows icon of the executables: build/icon.ico is generated from app-logo.svg by make-splash.js,
// and after packaging the icons embedded in the .exe files are read back and compared with it.
const fs = require('node:fs');
const IconFile = require('../src/desktop/platform/IconFile');

class AppIcon {
  static ICON_SIZES = IconFile.ICON_SIZES;
  static encodeIco = IconFile.encode;
  static parseIco = IconFile.parse;
  static #RT_ICON = 3;
  static #RT_GROUP_ICON = 14;
  static #fail = message => { throw new Error(message); };

  // Icon groups of a Windows executable, in resource order: Explorer shows the first one.
  static readExecutableIcons(file) {
    if (!Buffer.isBuffer(file) || file.length < 64 || file.toString('ascii', 0, 2) !== 'MZ') AppIcon.#fail('Invalid Windows executable.');
    const pe = file.readUInt32LE(0x3c);
    if (pe + 24 > file.length || file.readUInt32BE(pe) !== 0x50450000) AppIcon.#fail('Invalid Windows executable.');
    const sectionCount = file.readUInt16LE(pe + 6), optional = pe + 24, magic = file.readUInt16LE(optional);
    if (magic !== 0x10b && magic !== 0x20b) AppIcon.#fail('Invalid Windows executable.');
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
      if (!section) AppIcon.#fail('Unreadable executable resources.');
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
        if (!language) AppIcon.#fail('Unreadable executable resources.');
        const at = offsetOf(file.readUInt32LE(language.offset)), size = file.readUInt32LE(language.offset + 4);
        if (at + size > file.length) AppIcon.#fail('Truncated executable resources.');
        return { id: entry.id, data: file.subarray(at, at + size) };
      });
    };
    const images = new Map(resources(AppIcon.#RT_ICON).map(entry => [entry.id, entry.data]));
    return resources(AppIcon.#RT_GROUP_ICON).map(({ id, data }) => ({
      id,
      images: Array.from({ length: data.readUInt16LE(4) }, (_, index) => {
        const at = 6 + index * 14, image = images.get(data.readUInt16LE(at + 12));
        if (!image) AppIcon.#fail('Incomplete executable icon.');
        return IconFile.image(data[at], image);
      })
    }));
  }

  // The executable's main icon must contain exactly the images of the ICO file.
  static verifyExecutableIcon(executable, ico) {
    const [main] = AppIcon.readExecutableIcons(executable);
    if (!main) AppIcon.#fail('The executable does not contain an icon.');
    const expected = AppIcon.parseIco(ico), actual = new Map(main.images.map(image => [image.size, image]));
    const missing = expected.filter(image => !actual.get(image.size)?.data.equals(image.data)).map(image => `${image.size}px`);
    if (missing.length || actual.size !== expected.length) AppIcon.#fail(`The executable icon does not match the app icon (${missing.join(', ') || 'extra formats'}).`);
    return expected.map(({ size, format }) => ({ size, format }));
  }

  static main() {
    try {
      const [option, icoPath, ...executables] = process.argv.slice(2);
      if (option !== '--verify' || !icoPath || !executables.length) AppIcon.#fail('Usage: node tools/AppIcon.js --verify build/icon.ico <file.exe>...');
      const ico = fs.readFileSync(icoPath);
      for (const executable of executables) {
        const formats = AppIcon.verifyExecutableIcon(fs.readFileSync(executable), ico);
        console.log(`Verified icon: ${executable} (${formats.map(format => `${format.size}px ${format.format}`).join(', ')})`);
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) AppIcon.main();
module.exports = AppIcon;
