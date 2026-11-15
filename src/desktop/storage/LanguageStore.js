'use strict';
// Repository references apply to this portable copy. Cached packs remain usable offline.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Translator } = require('../../shared/localization');
const LanguagePacks = require('../../shared/localization/LanguagePacks');
const RepositoryPackStore = require('./RepositoryPackStore');

class LanguageStore {
  #cache;
  #references = [];
  #sources = new Map();
  #revision = '';
  #busy = false;
  #settingsError = '';
  get revision() { return this.#revision; }
  constructor(options) {
    this.file = path.join(options.dataFolder, 'language-repositories.json');
    this.#cache = new RepositoryPackStore({ ...options, definitions: LanguagePacks, folder: 'language-cache', label: 'language' });
  }
  info() {
    const repositories = this.#cache.catalog(this.#references).sources;
    return {
      revision: this.#revision, packs: Translator.packs(), repositories,
      languages: Translator.languages().map(language => ({ ...language, source: this.#sources.get(language.code) || 'built-in' })),
      errors: [...repositories.filter(source => source.error).map(source => ({ repository: source.repository, message: source.error })), ...(this.#settingsError ? [{ message: this.#settingsError }] : [])]
    };
  }
  #adopt() {
    const active = this.#cache.catalog(this.#references).sources;
    const retained = this.#cache.cachedSources().filter(source => !active.some(item => item.repository === source.repository))
      .flatMap(source => this.#cache.catalog([source]).sources.filter(item => item.repository === source.repository));
    const activeCodes = new Set(active.flatMap(source => (source.manifest?.languages || []).map(pack => pack.code)));
    Translator.reset();
    Translator.loadBuiltIn();
    this.#sources = new Map([['en', 'built-in'], ['it', LanguagePacks.OFFICIAL[0].repository]]);
    // Keep installed translations available to saved organizations after removing a reference.
    for (const source of retained) for (const pack of source.manifest?.languages || []) {
      if (!Translator.has(pack.code) && !activeCodes.has(pack.code)) { Translator.register(pack); this.#sources.set(pack.code, source.repository); }
    }
    for (const source of active) for (const pack of source.manifest?.languages || []) {
      Translator.register(pack);
      this.#sources.set(pack.code, source.repository);
    }
    this.#revision = createHash('sha256').update(JSON.stringify(Translator.packs())).digest('hex');
    return this.info();
  }
  async reload() {
    await this.#cache.initialize();
    let references = [];
    try {
      const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (saved?.version !== 1 || !Array.isArray(saved.sources)) throw new Error('Invalid language repository settings.');
      references = LanguagePacks.sources(saved.sources).filter(source => source.repository !== LanguagePacks.OFFICIAL[0].repository);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.#adopt();
        this.#settingsError = 'Cannot read language repository settings.';
        throw new Error(this.#settingsError, { cause: error });
      }
    }
    this.#settingsError = '';
    this.#references = references;
    return this.#adopt();
  }
  async change(operation, repository) {
    if (this.#settingsError) throw new Error(this.#settingsError);
    if (this.#busy) throw new Error('Language repositories are loading.');
    repository = LanguagePacks.repository(repository);
    const official = LanguagePacks.OFFICIAL[0].repository;
    const current = LanguagePacks.sources(this.#references);
    if (!['add', 'refresh', 'remove'].includes(operation) || (operation !== 'add' && !current.some(source => source.repository === repository)) ||
      (operation === 'remove' && repository === official)) throw new Error('Invalid language repository operation.');
    const references = operation === 'remove' ? this.#references.filter(source => source.repository !== repository) :
      operation === 'add' && !current.some(source => source.repository === repository) ? [...this.#references, { kind: 'languages', repository }] : this.#references;
    LanguagePacks.sources(references);
    this.#busy = true;
    try {
      if (operation !== 'remove') await this.#cache.refresh('languages', repository);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(temporary, JSON.stringify({ version: 1, sources: references }), { flag: 'wx' });
        await fs.rename(temporary, this.file);
      } catch (error) {
        throw new Error('Cannot save language repository settings.', { cause: error });
      } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      this.#references = references;
      return this.#adopt();
    } finally { this.#busy = false; }
  }
}
module.exports = LanguageStore;
