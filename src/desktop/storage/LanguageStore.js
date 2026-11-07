'use strict';
// User languages live in data/languages/<code>.json, next to the portable data.
// A file for a built-in code customises it, any other valid code adds a new language.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Translator } = require('../../shared/localization');

class LanguageStore {
  static MAX_FILE_SIZE = 2 * 1024 * 1024;
  static TEMPLATE_FILE = `${Translator.FALLBACK}.template.json`;

  #sources = new Map();
  #errors = [];

  constructor({ dataFolder }) {
    this.folder = path.join(dataFolder, 'languages');
    this.template = path.join(this.folder, LanguageStore.TEMPLATE_FILE);
  }
  async #writeTemplate() {
    const source = await fs.readFile(path.join(Translator.builtInFolder, `${Translator.FALLBACK}.json`));
    const current = await fs.readFile(this.template).catch(() => null);
    if (current?.equals(source)) return;
    const temporary = `${this.template}.${process.pid}-${Date.now()}.tmp`;
    await fs.writeFile(temporary, source);
    try { await fs.rename(temporary, this.template); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  }
  async prepareFolder() {
    await fs.mkdir(this.folder, { recursive: true });
    await this.#writeTemplate();
    return this.folder;
  }
  async #readUserFiles() {
    const found = [], failed = [];
    let names = [];
    try { names = await fs.readdir(this.folder); }
    catch (error) { if (error.code !== 'ENOENT') failed.push({ file: '', message: error.message }); }
    const files = names.filter(name => /\.json$/i.test(name) && !/\.template\.json$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en'));
    for (const file of files) {
      try {
        const fullPath = path.join(this.folder, file);
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > LanguageStore.MAX_FILE_SIZE) throw new Error("Language file too large.");
        let pack;
        try { pack = JSON.parse((await fs.readFile(fullPath, 'utf8')).replace(/^\uFEFF/, '')); }
        catch { throw new Error("Invalid JSON file."); }
        const { code } = Translator.validatePack(pack);
        if (code.toLowerCase() !== file.slice(0, -5).toLowerCase()) throw new Error("The language code must match the file name.");
        found.push({ file, pack });
      } catch (error) { failed.push({ file, message: error.message }); }
    }
    return { found, failed };
  }
  info() {
    return {
      folder: this.folder,
      template: this.template,
      packs: Translator.packs(),
      languages: Translator.languages().map(language => ({ ...language, source: this.#sources.get(language.code) || 'built-in' })),
      errors: this.#errors.map(error => ({ ...error }))
    };
  }
  // Files are read first and swapped in synchronously, so translations never see a half-loaded registry.
  async reload() {
    const { found, failed } = await this.#readUserFiles();
    Translator.reset();
    Translator.loadBuiltIn();
    const builtIn = new Set(Translator.languages().map(language => language.code));
    const nextSources = new Map([...builtIn].map(code => [code, 'built-in']));
    for (const { file, pack } of found) {
      try {
        const code = Translator.register(pack);
        nextSources.set(code, builtIn.has(code) ? 'customized' : 'added');
      } catch (error) { failed.push({ file, message: error.message }); }
    }
    this.#sources = nextSources;
    this.#errors = failed;
    return this.info();
  }
}

module.exports = LanguageStore;
