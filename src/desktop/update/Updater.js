'use strict';
// Checks GitHub for a newer portable release, downloads and verifies it, and hands it to the installer.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

class Updater extends EventEmitter {
  static REPOSITORY = 'ZenPluS/OrbitKanban';
  static RELEASES_URL = `https://github.com/${Updater.REPOSITORY}/releases`;
  static LATEST_URL = `https://api.github.com/repos/${Updater.REPOSITORY}/releases/latest`;
  static ASSET_NAME = 'OrbitKanban-Portable.exe';
  static MAX_DOWNLOAD = 512 * 1024 * 1024;
  static #versionParts(value) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid update version.');
    const parts = value.split('.').map(Number);
    if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid update version.');
    return parts;
  }
  static newerVersion(next, current) {
    const a = Updater.#versionParts(next), b = Updater.#versionParts(current);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  }
  static parseRelease(release, current) {
    if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v')) throw new Error('Invalid update release.');
    const version = release.tag_name.slice(1);
    if (!Updater.newerVersion(version, current)) return null;
    const url = `${Updater.RELEASES_URL}/tag/v${version}`;
    const assets = release.assets?.filter(asset => asset.name === Updater.ASSET_NAME);
    if (release.html_url !== url || assets?.length !== 1) throw new Error('The release has no verified portable update.');
    const asset = assets[0], downloadUrl = `https://github.com/${Updater.REPOSITORY}/releases/download/v${version}/${Updater.ASSET_NAME}`;
    if (asset.state !== 'uploaded' || asset.browser_download_url !== downloadUrl || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > Updater.MAX_DOWNLOAD || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw new Error('The release has no verified portable update.');
    return { version, url, downloadUrl, size: asset.size, sha256: asset.digest.slice(7).toLowerCase() };
  }
  static allowedDownload(url) {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port &&
      ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname);
  }
  static async downloadResponse(url, fetchImpl, signal) {
    for (let redirect = 0; redirect <= 5; redirect++) {
      if (!Updater.allowedDownload(url)) throw new Error('Invalid update download destination.');
      const response = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'OrbitKanban-updater', Accept: 'application/octet-stream' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.ok || !response.body) throw new Error('Update download failed. Check your connection and try again.');
        return response;
      }
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Invalid update download destination.');
      url = new URL(location, url).href;
    }
    throw new Error('Too many update download redirects.');
  }
  static async verifyFile(file, release) {
    const handle = await fs.open(file, 'r');
    try {
      if ((await handle.stat()).size !== release.size) throw new Error('Update checksum or size does not match. Nothing was installed.');
      const hash = createHash('sha256');
      for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
      if (hash.digest('hex') !== release.sha256) throw new Error('Update checksum or size does not match. Nothing was installed.');
    } finally { await handle.close(); }
  }

  #currentVersion;
  #portableFile;
  #fetchImpl;
  #install;
  #onError;
  #folder;
  #configFile;
  #release = null;
  #downloaded = null;
  #busy = false;
  #initialized = false;
  #state;

  constructor({ currentVersion, dataFolder, portableFile, fetchImpl = fetch, install, onError = error => console.error('Update failed:', error) }) {
    Updater.#versionParts(currentVersion);
    super();
    this.#currentVersion = currentVersion;
    this.#portableFile = portableFile;
    this.#fetchImpl = fetchImpl;
    this.#install = install;
    this.#onError = onError;
    this.#folder = path.join(dataFolder, 'updates');
    this.#configFile = path.join(this.#folder, 'settings.json');
    this.#state = { supported: Boolean(portableFile), currentVersion, phase: 'idle', autoCheck: true, version: '', percent: 0, error: '', releaseUrl: Updater.RELEASES_URL };
  }
  snapshot() { return { ...this.#state }; }
  #change(values) { this.#state = { ...this.#state, ...values }; this.emit('change', this.snapshot()); return this.snapshot(); }
  async #operation(action) {
    if (this.#busy) throw new Error('An update operation is already running.');
    this.#busy = true;
    try { return await action(); }
    catch (error) { this.#change({ phase: 'error', error: error.message }); this.#onError(error); throw error; }
    finally { this.#busy = false; }
  }
  async init() {
    if (this.#initialized) return this.snapshot();
    try {
      const config = JSON.parse(await fs.readFile(this.#configFile, 'utf8'));
      if (config.version !== 1 || typeof config.autoCheck !== 'boolean') throw new Error('Invalid update settings. Check data/updates/settings.json.');
      this.#state.autoCheck = config.autoCheck;
    } catch (error) { if (error.code !== 'ENOENT') { this.#change({ phase: 'error', error: error.message }); throw error; } }
    this.#initialized = true;
    return this.#change({});
  }
  async check() {
    return this.#operation(async () => {
      await this.init();
      if (!this.#portableFile) throw new Error('Updates can only be installed from the Windows portable app.');
      this.#change({ phase: 'checking', error: '', percent: 0 });
      const fetchImpl = this.#fetchImpl;
      let response;
      try { response = await fetchImpl(Updater.LATEST_URL, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OrbitKanban-updater', 'X-GitHub-Api-Version': '2022-11-28' } }); }
      catch (cause) { throw new Error('Unable to check for updates. Check your connection and try again.', { cause }); }
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub request limit reached. Try again later.' : 'Unable to check for updates. Check your connection and try again.');
      // Release metadata is small; do not accept an unbounded response.
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 2 * 1024 * 1024) throw new Error('Invalid update release.');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const release = this.#release = Updater.parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')), this.#currentVersion);
      return this.#change({ phase: release ? this.#downloaded?.release.sha256 === release.sha256 ? 'ready' : 'available' : 'latest', version: release?.version || '', releaseUrl: release?.url || Updater.RELEASES_URL });
    });
  }
  async download() {
    return this.#operation(async () => {
      const release = this.#release;
      if (!this.#portableFile || !release) throw new Error('Check for an update before downloading.');
      const previous = this.#downloaded;
      this.#downloaded = null;
      this.#change({ phase: 'downloading', error: '', percent: 0 });
      const directory = path.join(this.#folder, randomUUID()), file = path.join(directory, Updater.ASSET_NAME);
      await fs.mkdir(directory, { recursive: true });
      try {
        const response = await Updater.downloadResponse(release.downloadUrl, this.#fetchImpl, AbortSignal.timeout(10 * 60 * 1000));
        const hash = createHash('sha256'), handle = await fs.open(file, 'wx');
        let size = 0, header = Buffer.alloc(0);
        try {
          for await (const bytes of response.body) {
            size += bytes.length;
            if (size > release.size) throw new Error('Update checksum or size does not match. Nothing was installed.');
            if (header.length < 2) header = Buffer.concat([header, bytes]).subarray(0, 2);
            hash.update(bytes);
            await handle.writeFile(bytes);
            const percent = Math.floor(size / release.size * 100);
            if (percent !== this.#state.percent) this.#change({ percent });
          }
          await handle.sync();
        } finally { await handle.close(); }
        if (size !== release.size || hash.digest('hex') !== release.sha256 || header.toString('ascii') !== 'MZ') throw new Error('Update checksum or size does not match. Nothing was installed.');
        this.#downloaded = { directory, file, release: { ...release } };
        if (previous) await fs.rm(previous.directory, { recursive: true, force: true });
        return this.#change({ phase: 'ready', percent: 100 });
      } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    });
  }
  async apply() {
    return this.#operation(async () => {
      const downloaded = this.#downloaded;
      if (!this.#portableFile || !downloaded || downloaded.release.sha256 !== this.#release?.sha256) throw new Error('Download and verify an update before installing.');
      await Updater.verifyFile(downloaded.file, downloaded.release);
      this.#change({ phase: 'installing', error: '' });
      const accepted = await this.#install({ ...downloaded, target: this.#portableFile });
      if (!accepted) return this.#change({ phase: 'ready' });
      return this.snapshot();
    });
  }
  async setAutoCheck(value) {
    return this.#operation(async () => {
      await this.init();
      if (typeof value !== 'boolean') throw new Error('Invalid update settings.');
      await fs.mkdir(this.#folder, { recursive: true });
      const temp = `${this.#configFile}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temp, JSON.stringify({ version: 1, autoCheck: value }), { flag: 'wx' }); await fs.rename(temp, this.#configFile); }
      finally { await fs.rm(temp, { force: true }); }
      return this.#change({ autoCheck: value });
    });
  }
}

module.exports = Updater;
