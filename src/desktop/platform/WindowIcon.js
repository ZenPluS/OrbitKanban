'use strict';
// Themed window icon: the interface draws the atom in its theme colors at every icon size and the app keeps it as
// data/runtime/app-icon.ico, so the next start opens with it. Windows picks each size from the file, as for the executable.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const IconFile = require('./IconFile');

class WindowIcon {
  static FILE_NAME = 'app-icon.ico';
  static #MAX_PNG = 512 * 1024;
  static #MAX_FILE = 2 * 1024 * 1024;
  static #fail = () => { throw new Error('Invalid window icon.'); };

  // One image per icon size, as the interface sends them: raw RGBA pixels, and a PNG at 256 px.
  static encode(images) {
    if (!Array.isArray(images) || images.length !== IconFile.ICON_SIZES.length) WindowIcon.#fail();
    const bySize = new Map(images.map(image => [image?.size, image]));
    return IconFile.encode(IconFile.ICON_SIZES.map(size => {
      const image = bySize.get(size);
      if (!image) WindowIcon.#fail();
      if (size === 256) {
        if (!(image.png instanceof Uint8Array) || image.png.length > WindowIcon.#MAX_PNG) WindowIcon.#fail();
        return { size, png: Buffer.from(image.png.buffer, image.png.byteOffset, image.png.length) };
      }
      if (!(image.rgba instanceof Uint8Array)) WindowIcon.#fail();
      return { size, rgba: image.rgba };
    }));
  }
  static valid(file) {
    try {
      const sizes = IconFile.parse(file).map(image => image.size).sort((a, b) => a - b);
      return sizes.length === IconFile.ICON_SIZES.length && sizes.every((size, index) => size === IconFile.ICON_SIZES[index]);
    } catch { return false; }
  }

  #written = null;
  #saving = Promise.resolve();

  constructor(folder) {
    this.file = path.join(folder, WindowIcon.FILE_NAME);
  }
  // Path of the saved icon, read synchronously before the windows are created; null on the first start or when it is invalid.
  read() {
    try {
      if (fs.statSync(this.file).size > WindowIcon.#MAX_FILE) return null;
      return WindowIcon.valid(fs.readFileSync(this.file)) ? this.file : null;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('The window icon could not be read:', error);
      return null;
    }
  }
  // Saves run one after another and write through a temporary file, only when the icon changed.
  save(images) {
    let ico;
    try { ico = WindowIcon.encode(images); }
    catch (error) { return Promise.reject(error); }
    const saving = this.#saving.then(() => this.#write(ico));
    this.#saving = saving.catch(() => {});
    return saving;
  }
  async #write(ico) {
    if (this.#written?.equals(ico)) return false;
    try {
      if ((await fsp.readFile(this.file)).equals(ico)) { this.#written = ico; return false; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fsp.writeFile(temp, ico, { flag: 'wx' });
      await fsp.rename(temp, this.file);
    } catch (error) {
      await fsp.rm(temp, { force: true });
      throw error;
    }
    this.#written = ico;
    return true;
  }
}

module.exports = WindowIcon;
