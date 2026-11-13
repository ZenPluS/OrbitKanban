'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const AppearancePacks = require('../../shared/domain/AppearancePacks');

class AppearancePackStore {
  static MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
  #fs;
  #fetch;
  #timeoutMs;
  #cache = new Map();
  #errors = new Map();
  #official = new Map();
  #pending = new Map();
  #initialization;
  #folderError = null;

  constructor({ dataFolder, fetchImpl = globalThis.fetch, fsImpl = fs, timeoutMs = 15000 }) {
    this.folder = path.join(dataFolder, 'appearance');
    this.#fetch = fetchImpl;
    this.#fs = fsImpl;
    this.#timeoutMs = Math.max(1, Math.min(Number(timeoutMs) || 15000, 30000));
  }

  #filename(kind, repository) {
    return `${createHash('sha256').update(kind + repository).digest('hex')}.json`;
  }

  #checkSource(kind, repository, manifest) {
    const file = this.#filename(kind, repository);
    if (kind === 'icons' && this.#official.has(file) &&
      Object.keys(this.#official.get(file).packs[0].icons).some(name => !manifest.packs[0].icons[name])) {
      throw new Error('The official appearance manifest is missing required icons.');
    }
    if (kind === 'themes' && AppearancePacks.OFFICIAL.some(source => source.kind === kind && source.repository === repository)) {
      const ids = new Set();
      for (const pack of manifest.packs) {
        for (const theme of pack.themes) {
          if (theme.id === 'midnight') throw new Error('The official appearance manifest must not include Midnight.');
          if (ids.has(theme.id)) throw new Error('The official appearance manifest contains duplicate theme IDs.');
          ids.add(theme.id);
        }
      }
    }
  }

  initialize() {
    this.#initialization ??= this.#load();
    return this.#initialization;
  }

  async #load() {
    for (const { kind, repository } of AppearancePacks.OFFICIAL) {
      const manifest = AppearancePacks.validate(require(path.join(__dirname, '..', '..', '..', 'resources', 'packs', `orbit-${kind}.json`)), kind);
      this.#checkSource(kind, repository, manifest);
      this.#official.set(this.#filename(kind, repository), manifest);
    }
    let files;
    try {
      await this.#fs.mkdir(this.folder, { recursive: true });
      files = await this.#fs.readdir(this.folder);
    } catch {
      this.#folderError = 'Cannot read the appearance cache folder.';
      return this.catalog();
    }
    for (const file of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
      try {
        const target = path.join(this.folder, file);
        const stat = await this.#fs.stat(target);
        if (!stat.isFile() || stat.size > AppearancePackStore.MAX_RESPONSE_BYTES * 2) throw new Error();
        const envelope = JSON.parse(await this.#fs.readFile(target, 'utf8'));
        if (envelope?.format !== 'orbitkanban-pack-cache' || envelope.version !== 1 ||
          !['icons', 'themes'].includes(envelope.kind) || typeof envelope.repository !== 'string' ||
          AppearancePacks.repository(envelope.repository) !== envelope.repository ||
          this.#filename(envelope.kind, envelope.repository) !== file ||
          typeof envelope.updatedAt !== 'string' || !Number.isFinite(Date.parse(envelope.updatedAt)) ||
          new Date(envelope.updatedAt).toISOString() !== envelope.updatedAt) throw new Error();
        const manifest = AppearancePacks.validate(envelope.manifest, envelope.kind);
        this.#checkSource(envelope.kind, envelope.repository, manifest);
        this.#cache.set(file, { manifest, updatedAt: envelope.updatedAt });
      } catch {
        this.#errors.set(file, 'The appearance cache is corrupt or unreadable.');
      }
    }
    return this.catalog();
  }

  catalog(sources = []) {
    return { sources: AppearancePacks.sources(sources).map(({ kind, repository }) => {
      const file = this.#filename(kind, repository), cached = this.#cache.get(file);
      return {
        kind, repository,
        manifest: structuredClone(cached?.manifest ?? this.#official.get(file) ?? null),
        updatedAt: cached?.updatedAt ?? null,
        error: this.#errors.get(file) ?? (cached ? null : this.#folderError),
        official: this.#official.has(file)
      };
    }) };
  }

  async refresh(kind, repository) {
    if (!['icons', 'themes'].includes(kind)) throw new Error('Invalid appearance repository.');
    repository = AppearancePacks.repository(repository);
    await this.initialize();
    const file = this.#filename(kind, repository);
    if (this.#pending.has(file)) return this.#pending.get(file);
    const operation = this.#refresh(kind, repository, file);
    this.#pending.set(file, operation);
    try { return await operation; }
    finally { this.#pending.delete(file); }
  }

  async #download(kind, repository) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('The appearance repository request timed out.'));
        controller.abort();
      }, this.#timeoutMs);
    });
    const request = async () => {
      let response;
      try {
        response = await this.#fetch(`https://api.github.com/repos/${repository}/contents/orbit-${kind}.json`, {
          headers: { Accept: 'application/vnd.github.raw+json' },
          credentials: 'omit', redirect: 'error', signal: controller.signal
        });
      } catch {
        throw new Error('Cannot reach the public GitHub appearance repository.');
      }
      if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
        await response.body?.cancel().catch(() => {});
        throw new Error('GitHub appearance repository rate limit exceeded.');
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 404) throw new Error('The public appearance repository or manifest was not found (404).');
        throw new Error(`GitHub appearance repository request failed (${response.status}).`);
      }
      const length = response.headers.get('content-length');
      if (length !== null && Number(length) > AppearancePackStore.MAX_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => {});
        throw new Error('The appearance manifest exceeds the 2 MB limit.');
      }
      if (!response.body?.getReader) throw new Error('Invalid appearance manifest response.');
      const reader = response.body.getReader(), chunks = [];
      const cancel = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      let size = 0;
      try {
        while (true) {
          let chunk;
          try { chunk = await reader.read(); }
          catch { throw new Error('Cannot read the GitHub appearance repository response.'); }
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > AppearancePackStore.MAX_RESPONSE_BYTES) throw new Error('The appearance manifest exceeds the 2 MB limit.');
          chunks.push(Buffer.from(chunk.value));
        }
      } finally {
        // Cancellation must not delay the timeout or hide a more useful validation error.
        void reader.cancel().catch(() => {});
        controller.signal.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
      try { return AppearancePacks.validate(JSON.parse(Buffer.concat(chunks).toString('utf8')), kind); }
      catch { throw new Error('Invalid appearance manifest.'); }
    };
    try { return await Promise.race([request(), timeout]); }
    finally { clearTimeout(timer); }
  }

  async #refresh(kind, repository, file) {
    try {
      const manifest = await this.#download(kind, repository);
      this.#checkSource(kind, repository, manifest);
      const envelope = {
        format: 'orbitkanban-pack-cache', version: 1, kind, repository,
        updatedAt: new Date().toISOString(), manifest
      };
      const temporary = path.join(this.folder, `${file}.${randomUUID()}.tmp`);
      try {
        await this.#fs.mkdir(this.folder, { recursive: true });
        await this.#fs.writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', flag: 'wx' });
        await this.#fs.rename(temporary, path.join(this.folder, file));
      } catch {
        throw new Error('Cannot save the appearance cache.');
      } finally {
        await this.#fs.rm(temporary, { force: true }).catch(() => {});
      }
      this.#cache.set(file, { manifest, updatedAt: envelope.updatedAt });
      this.#errors.delete(file);
      return this.catalog([{ kind, repository }]);
    } catch (error) {
      this.#errors.set(file, error.message);
      throw error;
    }
  }
}

module.exports = AppearancePackStore;
