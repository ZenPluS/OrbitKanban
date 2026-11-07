'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const Updater = require('../src/desktop/update/Updater');
const { newerVersion, parseRelease, downloadResponse, LATEST_URL, RELEASES_URL } = Updater;
const bytes = Buffer.from('MZ verified test executable');
const sha256 = createHash('sha256').update(bytes).digest('hex');
function release(version = '2.45.0') {
  return { tag_name: `v${version}`, draft: false, prerelease: false, html_url: `${RELEASES_URL}/tag/v${version}`, assets: [{
    name: 'OrbitKanban-Portable.exe', state: 'uploaded', size: bytes.length, digest: `sha256:${sha256}`,
    browser_download_url: `https://github.com/ZenPluS/OrbitKanban/releases/download/v${version}/OrbitKanban-Portable.exe`
  }] };
}
async function fixture(t, fetchImpl, install = async () => false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-updater-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], failures = [];
  const updater = new Updater({
    currentVersion: '2.23.1', dataFolder: path.join(root, 'data'), portableFile: path.join(root, 'Portable.exe'), install,
    onError: error => failures.push(error),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return fetchImpl ? fetchImpl(url, options) : url === LATEST_URL ? Response.json(release()) : new Response(bytes); }
  });
  return { updater, root, calls, failures };
}
test('update versions are compared numerically and malformed versions are rejected', () => {
  assert(newerVersion('2.45.0', '2.23.1'));
  assert(newerVersion('2.10.0', '2.9.9'));
  assert(!newerVersion('2.45.0', '2.45.0'));
  assert(!newerVersion('2.45.0', '3.0.0'));
  for (const version of ['2.45', 'v2.45.0', '2.45.0-beta', '2.045.0', '99999999999999999999.0.0', null]) assert.throws(() => newerVersion(version, '2.0.0'));
});
test('only stable release assets from this repository with a SHA-256 digest are accepted', () => {
  assert.equal(parseRelease(release(), '2.23.1').version, '2.45.0');
  assert.equal(parseRelease(release('2.23.1'), '2.45.0'), null);
  for (const mutate of [
    r => { r.draft = true; }, r => { r.prerelease = true; }, r => { r.tag_name = '../other'; },
    r => { r.html_url = 'https://other.example'; }, r => { r.assets[0].digest = ''; },
    r => { r.assets[0].size = 600000000; }, r => { r.assets[0].browser_download_url += '?other'; },
    r => { r.assets.push(r.assets[0]); }, r => { r.assets = []; }, r => { r.assets[0].state = 'new'; }
  ]) {
    const data = release(); mutate(data);
    assert.throws(() => parseRelease(data, '2.23.1'));
  }
});
test('checking never downloads automatically or sends workspace data or credentials', async t => {
  const { updater, calls } = await fixture(t);
  assert.equal((await updater.check()).phase, 'available');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LATEST_URL);
  assert(!calls[0].options.body && !calls[0].options.headers.Authorization);
  assert.equal(calls[0].options.redirect, 'error');
});
test('download is hashed before ready and reverified before a confirmed install', async t => {
  let attempt = 0;
  const { updater, root } = await fixture(t, null, async update => {
    assert.equal(await fs.readFile(update.file, 'utf8'), bytes.toString());
    assert.equal(update.target, path.join(root, 'Portable.exe'));
    return ++attempt > 1;
  });
  await updater.check();
  assert.equal((await updater.download()).phase, 'ready');
  assert.equal((await updater.apply()).phase, 'ready', 'cancel keeps the verified download');
  assert.equal((await updater.apply()).phase, 'installing');
});
test('corrupt, oversized and interrupted downloads cannot install and remove partial files', async t => {
  for (const payload of [Buffer.from('MZ changed executable.....'), Buffer.concat([bytes, bytes]), Buffer.alloc(0)]) {
    const { updater, root, failures } = await fixture(t, url => url === LATEST_URL ? Response.json(release()) : new Response(payload));
    await updater.check();
    await assert.rejects(updater.download(), /checksum or size/);
    assert.equal(updater.snapshot().phase, 'error');
    assert.equal(failures.length, 1);
    assert.deepEqual(await fs.readdir(path.join(root, 'data', 'updates')), []);
    await assert.rejects(updater.apply(), /Download and verify/);
  }
});
test('tampered staged files are rejected again immediately before installation', async t => {
  let installs = 0;
  const { updater, root } = await fixture(t, null, async () => { installs++; return true; });
  await updater.check(); await updater.download();
  const [job] = await fs.readdir(path.join(root, 'data', 'updates'));
  await fs.writeFile(path.join(root, 'data', 'updates', job, 'OrbitKanban-Portable.exe'), 'MZ tampered');
  await assert.rejects(updater.apply(), /checksum or size/);
  assert.equal(installs, 0);
});
test('network interruption removes partial downloads and never enables installation', async t => {
  const { updater, root } = await fixture(t, url => url === LATEST_URL ? Response.json(release()) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.subarray(0, 4)); },
    pull(controller) { controller.error(new Error('Download connection interrupted.')); }
  })));
  await updater.check();
  await assert.rejects(updater.download(), /interrupted/);
  assert.equal(updater.snapshot().phase, 'error');
  assert.deepEqual(await fs.readdir(path.join(root, 'data', 'updates')), []);
});
test('download redirects are limited to HTTPS GitHub asset hosts', async () => {
  const start = release().assets[0].browser_download_url, calls = [];
  await downloadResponse(start, async url => {
    calls.push(url);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/asset?token=public' } }) : new Response(bytes);
  });
  assert.equal(calls.length, 2);
  for (const url of ['http://github.com/a', 'https://evil.example/a', 'https://github.com.evil.example/a', 'https://user@github.com/a', 'https://github.com:444/a']) {
    await assert.rejects(downloadResponse(start, async () => new Response(null, { status: 302, headers: { location: url } })), /destination/);
  }
  await assert.rejects(downloadResponse(start, async () => new Response(null, { status: 302, headers: { location: start } })), /redirects/);
});
test('offline and rate-limit errors are explicit, not reported as latest', async t => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response(null, { status: 403 })]) {
    const { updater } = await fixture(t, fetchImpl);
    await assert.rejects(updater.check());
    assert.equal(updater.snapshot().phase, 'error');
    assert(updater.snapshot().error);
  }
});
test('duplicate update operations are rejected while a request is pending', async t => {
  let finish;
  const { updater } = await fixture(t, () => new Promise(resolve => { finish = resolve; }));
  const first = updater.check();
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(updater.check(), /already running/);
  finish(Response.json(release()));
  await first;
});
test('automatic checking preference is portable and corrupt settings are not overwritten', async t => {
  const { updater, root } = await fixture(t);
  assert.equal((await updater.init()).autoCheck, true);
  await updater.setAutoCheck(false);
  const config = path.join(root, 'data', 'updates', 'settings.json');
  assert.deepEqual(JSON.parse(await fs.readFile(config, 'utf8')), { version: 1, autoCheck: false });
  const next = new Updater({ currentVersion: '2.45.0', dataFolder: path.join(root, 'data'), onError: () => {} });
  assert.equal((await next.init()).autoCheck, false);
  await fs.writeFile(config, '{"version":99}');
  const broken = new Updater({ currentVersion: '2.45.0', dataFolder: path.join(root, 'data'), onError: () => {} });
  await assert.rejects(broken.setAutoCheck(true), /Invalid update settings/);
  assert.equal(await fs.readFile(config, 'utf8'), '{"version":99}');
});
