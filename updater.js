'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

const REPOSITORY = 'ZenPluS/OrbitKanban';
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const LATEST_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const ASSET_NAME = 'OrbitKanban-Portable.exe';
const MAX_DOWNLOAD = 512 * 1024 * 1024;
function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid update version.');
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid update version.');
  return parts;
}
function newerVersion(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function parseRelease(release, current) {
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v')) throw new Error('Invalid update release.');
  const version = release.tag_name.slice(1);
  if (!newerVersion(version, current)) return null;
  const url = `${RELEASES_URL}/tag/v${version}`;
  const assets = release.assets?.filter(asset => asset.name === ASSET_NAME);
  if (release.html_url !== url || assets?.length !== 1) throw new Error('The release has no verified portable update.');
  const asset = assets[0], downloadUrl = `https://github.com/${REPOSITORY}/releases/download/v${version}/${ASSET_NAME}`;
  if (asset.state !== 'uploaded' || asset.browser_download_url !== downloadUrl || !Number.isSafeInteger(asset.size) || asset.size < 2 || asset.size > MAX_DOWNLOAD || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw new Error('The release has no verified portable update.');
  return { version, url, downloadUrl, size: asset.size, sha256: asset.digest.slice(7).toLowerCase() };
}
function allowedDownload(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port &&
    ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname);
}
async function downloadResponse(url, fetchImpl, signal) {
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (!allowedDownload(url)) throw new Error('Invalid update download destination.');
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
async function verifyFile(file, release) {
  const handle = await fs.open(file, 'r');
  try {
    if ((await handle.stat()).size !== release.size) throw new Error('Update checksum or size does not match. Nothing was installed.');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    if (hash.digest('hex') !== release.sha256) throw new Error('Update checksum or size does not match. Nothing was installed.');
  } finally { await handle.close(); }
}
function createUpdater({ currentVersion, dataFolder, portableFile, fetchImpl = fetch, install, onError = error => console.error('Update failed:', error) }) {
  versionParts(currentVersion);
  const events = new EventEmitter(), folder = path.join(dataFolder, 'updates'), configFile = path.join(folder, 'settings.json');
  let release = null, downloaded = null, busy = false, initialized = false;
  let state = { supported: Boolean(portableFile), currentVersion, phase: 'idle', autoCheck: true, version: '', percent: 0, error: '', releaseUrl: RELEASES_URL };
  const snapshot = () => ({ ...state });
  const change = values => { state = { ...state, ...values }; events.emit('change', snapshot()); return snapshot(); };
  async function operation(action) {
    if (busy) throw new Error('An update operation is already running.');
    busy = true;
    try { return await action(); }
    catch (error) { change({ phase: 'error', error: error.message }); onError(error); throw error; }
    finally { busy = false; }
  }
  async function init() {
    if (initialized) return snapshot();
    try {
      const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
      if (config.version !== 1 || typeof config.autoCheck !== 'boolean') throw new Error('Invalid update settings. Check data/updates/settings.json.');
      state.autoCheck = config.autoCheck;
    } catch (error) { if (error.code !== 'ENOENT') { change({ phase: 'error', error: error.message }); throw error; } }
    initialized = true;
    return change({});
  }
  async function check() {
    return operation(async () => {
      await init();
      if (!portableFile) throw new Error('Updates can only be installed from the Windows portable app.');
      change({ phase: 'checking', error: '', percent: 0 });
      let response;
      try { response = await fetchImpl(LATEST_URL, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OrbitKanban-updater', 'X-GitHub-Api-Version': '2022-11-28' } }); }
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
      release = parseRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')), currentVersion);
      return change({ phase: release ? downloaded?.release.sha256 === release.sha256 ? 'ready' : 'available' : 'latest', version: release?.version || '', releaseUrl: release?.url || RELEASES_URL });
    });
  }
  async function download() {
    return operation(async () => {
      if (!portableFile || !release) throw new Error('Check for an update before downloading.');
      const previous = downloaded;
      downloaded = null;
      change({ phase: 'downloading', error: '', percent: 0 });
      const directory = path.join(folder, randomUUID()), file = path.join(directory, ASSET_NAME);
      await fs.mkdir(directory, { recursive: true });
      try {
        const response = await downloadResponse(release.downloadUrl, fetchImpl, AbortSignal.timeout(10 * 60 * 1000));
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
            if (percent !== state.percent) change({ percent });
          }
          await handle.sync();
        } finally { await handle.close(); }
        if (size !== release.size || hash.digest('hex') !== release.sha256 || header.toString('ascii') !== 'MZ') throw new Error('Update checksum or size does not match. Nothing was installed.');
        downloaded = { directory, file, release: { ...release } };
        if (previous) await fs.rm(previous.directory, { recursive: true, force: true });
        return change({ phase: 'ready', percent: 100 });
      } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    });
  }
  async function apply() {
    return operation(async () => {
      if (!portableFile || !downloaded || downloaded.release.sha256 !== release?.sha256) throw new Error('Download and verify an update before installing.');
      await verifyFile(downloaded.file, downloaded.release);
      change({ phase: 'installing', error: '' });
      const accepted = await install({ ...downloaded, target: portableFile });
      if (!accepted) return change({ phase: 'ready' });
      return snapshot();
    });
  }
  async function setAutoCheck(value) {
    return operation(async () => {
      await init();
      if (typeof value !== 'boolean') throw new Error('Invalid update settings.');
      await fs.mkdir(folder, { recursive: true });
      const temp = `${configFile}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temp, JSON.stringify({ version: 1, autoCheck: value }), { flag: 'wx' }); await fs.rename(temp, configFile); }
      finally { await fs.rm(temp, { force: true }); }
      return change({ autoCheck: value });
    });
  }
  return Object.assign(events, { snapshot, init, check, download, apply, setAutoCheck });
}
module.exports = { REPOSITORY, RELEASES_URL, LATEST_URL, ASSET_NAME, MAX_DOWNLOAD, newerVersion, parseRelease, allowedDownload, downloadResponse, verifyFile, createUpdater };
