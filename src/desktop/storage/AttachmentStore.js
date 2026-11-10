'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { constants: fsConstants } = require('node:fs');

class AttachmentStore {
  static EXTENSIONS = Object.freeze(['txt', 'json', 'pdf', 'docx', 'pptx', 'csv', 'html', 'js', 'sql', 'xlsx']);
  static MAX_FILE_BYTES = 100 * 1024 * 1024;
  static MAX_FILES_PER_DROP = 20;

  #dataFolder;
  #attachmentsFolder;
  #queue = Promise.resolve();

  constructor({ dataFolder }) {
    this.#dataFolder = path.resolve(dataFolder);
    this.#attachmentsFolder = path.join(this.#dataFolder, 'attachments');
  }

  #serial(action) {
    const result = this.#queue.then(action);
    this.#queue = result.catch(() => {});
    return result;
  }

  static #key(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(label === 'organization identifier' ? 'Invalid organization identifier.' : 'Invalid task identifier.');
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  static #folderName(code) {
    let name = String(code || 'Uncoded').normalize('NFKC').trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100).trim();
    if (!name || /^\.+$/.test(name)) name = 'Uncoded';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
    return name;
  }

  static #fileName(value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid attachment file name.');
    let name = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
    if (!name || name === '.' || name === '..' || name.length > 180) throw new Error('Invalid attachment file name.');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!AttachmentStore.EXTENSIONS.includes(extension)) throw new Error('Unsupported attachment type.');
    return name;
  }

  static #assertWithin(root, target) {
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      if (relative === '') return;
      throw new Error('Attachment path is outside the data folder.');
    }
  }

  async #root() {
    await fs.mkdir(this.#attachmentsFolder, { recursive: true });
    const stat = await fs.lstat(this.#attachmentsFolder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The attachments folder must be a regular directory.');
    const realRoot = await fs.realpath(this.#attachmentsFolder), realData = await fs.realpath(this.#dataFolder);
    AttachmentStore.#assertWithin(realData, realRoot);
    return realRoot;
  }

  async #directory(organizationId, task, create) {
    const organizationKey = AttachmentStore.#key(organizationId, 'organization identifier');
    const taskKey = AttachmentStore.#key(task?.id, 'task identifier');
    if (typeof task.code !== 'string') throw new Error('Invalid task code.');
    const root = await this.#root();
    const organizationRoot = path.join(root, organizationKey);
    const taskRoot = path.join(root, organizationKey, taskKey);
    AttachmentStore.#assertWithin(root, organizationRoot);
    AttachmentStore.#assertWithin(root, taskRoot);
    let organizationStat;
    try { organizationStat = await fs.lstat(organizationRoot); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) { if (error.code === 'ENOENT') return null; throw error; }
      await fs.mkdir(organizationRoot);
      organizationStat = await fs.lstat(organizationRoot);
    }
    if (!organizationStat.isDirectory() || organizationStat.isSymbolicLink()) throw new Error('The organization attachments folder must be a regular directory.');
    let taskStat;
    try { taskStat = await fs.lstat(taskRoot); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) { if (error.code === 'ENOENT') return null; throw error; }
      await fs.mkdir(taskRoot);
      taskStat = await fs.lstat(taskRoot);
    }
    if (!taskStat.isDirectory() || taskStat.isSymbolicLink()) throw new Error('The task attachments folder must be a regular directory.');
    const target = path.join(taskRoot, AttachmentStore.#folderName(task.code));
    AttachmentStore.#assertWithin(taskRoot, target);
    try {
      const targetStat = await fs.lstat(target);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error('The task code folder must be a regular directory.');
      return target;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const children = await fs.readdir(taskRoot, { withFileTypes: true });
    const previous = children.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.upload-'));
    if (previous.length === 1) {
      const old = path.join(taskRoot, previous[0].name);
      if (previous[0].name !== path.basename(target)) {
        await fs.rename(old, target);
        return target;
      }
      return old;
    }
    if (!create) return null;
    await fs.mkdir(target);
    return target;
  }

  static async #fileInfo(folder, entry) {
    if (!entry.isFile()) return null;
    const extension = path.extname(entry.name).slice(1).toLowerCase();
    if (!AttachmentStore.EXTENSIONS.includes(extension)) return null;
    const target = path.join(folder, entry.name);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return { name: entry.name, extension, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  }

  async #list(organizationId, task) {
    const folder = await this.#directory(organizationId, task, false);
    if (!folder) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => AttachmentStore.#fileInfo(folder, entry)));
    return files.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  list(organizationId, task) {
    return this.#serial(() => this.#list(organizationId, task));
  }

  counts(organizationId, tasks) {
    return this.#serial(async () => {
      const result = Object.create(null);
      for (const task of tasks) result[task.id] = (await this.#list(organizationId, task)).length;
      return result;
    });
  }

  async #existingName(folder, requestedName) {
    const extension = path.extname(requestedName), stem = requestedName.slice(0, -extension.length);
    for (let counter = 1; counter <= 10000; counter++) {
      const name = counter === 1 ? requestedName : `${stem} (${counter})${extension}`;
      try { await fs.access(path.join(folder, name)); }
      catch (error) { if (error.code === 'ENOENT') return name; throw error; }
    }
    throw new Error('Too many files with the same name.');
  }

  async #copyFile(folder, source, requestedName) {
    const name = AttachmentStore.#fileName(requestedName), info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Attachments must be regular files.');
    if (info.size > AttachmentStore.MAX_FILE_BYTES) throw new Error('Each attachment must be 100 MB or smaller.');
    const temp = path.join(folder, `.upload-${crypto.randomUUID()}.tmp`);
    try {
      await fs.copyFile(source, temp, fsConstants.COPYFILE_EXCL);
      for (let counter = 0; counter < 10000; counter++) {
        const targetName = await this.#existingName(folder, name);
        try {
          await fs.link(temp, path.join(folder, targetName));
          return targetName;
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      throw new Error('Too many files with the same name.');
    } finally { await fs.rm(temp, { force: true }); }
  }

  addPaths(organizationId, task, sources) {
    return this.#serial(async () => {
      if (!Array.isArray(sources) || !sources.length || sources.length > AttachmentStore.MAX_FILES_PER_DROP || sources.some(source => typeof source !== 'string' || !source)) throw new Error('Choose between 1 and 20 files.');
      const prepared = [];
      for (const source of sources) {
        const name = AttachmentStore.#fileName(path.basename(source));
        const info = await fs.lstat(source);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Attachments must be regular files.');
        if (info.size > AttachmentStore.MAX_FILE_BYTES) throw new Error('Each attachment must be 100 MB or smaller.');
        prepared.push({ source, name });
      }
      const folder = await this.#directory(organizationId, task, true);
      for (const file of prepared) await this.#copyFile(folder, file.source, file.name);
      return this.#list(organizationId, task);
    });
  }

  addBuffer(organizationId, task, requestedName, value) {
    return this.#serial(async () => {
      const name = AttachmentStore.#fileName(requestedName);
      if (!(Buffer.isBuffer(value) || value instanceof Uint8Array)) throw new Error('Invalid attachment content.');
      const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      if (bytes.length > AttachmentStore.MAX_FILE_BYTES) throw new Error('Each attachment must be 100 MB or smaller.');
      const folder = await this.#directory(organizationId, task, true);
      const temp = path.join(folder, `.upload-${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, bytes, { flag: 'wx' });
        for (let counter = 0; counter < 10000; counter++) {
          const targetName = await this.#existingName(folder, name);
          try {
            await fs.link(temp, path.join(folder, targetName));
            return await this.#list(organizationId, task);
          } catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        throw new Error('Too many files with the same name.');
      } finally { await fs.rm(temp, { force: true }); }
    });
  }

  remove(organizationId, task, requestedName) {
    return this.#serial(async () => {
      const name = AttachmentStore.#fileName(requestedName), folder = await this.#directory(organizationId, task, false);
      if (!folder) throw new Error('The attachment no longer exists.');
      const target = path.join(folder, name);
      AttachmentStore.#assertWithin(folder, target);
      let stat;
      try { stat = await fs.lstat(target); }
      catch (error) { if (error.code === 'ENOENT') throw new Error('The attachment no longer exists.'); throw error; }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The attachment is not a regular file.');
      await fs.unlink(target);
      return this.#list(organizationId, task);
    });
  }

  openPath(organizationId, task, requestedName) {
    return this.#serial(async () => {
      const name = AttachmentStore.#fileName(requestedName), folder = await this.#directory(organizationId, task, false);
      if (!folder) throw new Error('The attachment no longer exists.');
      const target = path.join(folder, name);
      AttachmentStore.#assertWithin(folder, target);
      let stat;
      try { stat = await fs.lstat(target); }
      catch (error) { if (error.code === 'ENOENT') throw new Error('The attachment no longer exists.'); throw error; }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The attachment is not a regular file.');
      return target;
    });
  }
}

module.exports = AttachmentStore;
