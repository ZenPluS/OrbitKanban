'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const AppearancePackStore = require('../src/desktop/storage/AppearancePackStore');
const AppearancePacks = require('../src/shared/domain/AppearancePacks');

const custom = { kind: 'themes', repository: 'sample/appearance' };
const themes = (name = 'Sample') => ({
  format: 'orbitkanban-themes', version: 1,
  packs: [{ id: 'sample', name, themes: [{ id: 'sample', name, background: '#112233', surface: '#223344', text: '#ffffff', accent: '#aabbcc' }] }]
});
const icons = () => ({
  format: 'orbitkanban-icons', version: 1,
  packs: [{ id: 'partial', name: 'Partial', icons: { sample: { family: 'line', layers: [{ style: 'line', shapes: [{ tag: 'path', attrs: { d: 'M0 0 L1 1' } }] }] } } }]
});
const filename = (kind, repository) => `${createHash('sha256').update(kind + repository).digest('hex')}.json`;
const envelope = (source = custom, manifest = themes()) => ({
  format: 'orbitkanban-pack-cache', version: 1, ...source, updatedAt: '2026-11-13T00:00:00.000Z', manifest
});
const sourceOf = (store, source = custom) => store.catalog([source]).sources.find(item => item.kind === source.kind && item.repository === source.repository);

async function fixture(t, options = {}) {
  const dataFolder = await fs.mkdtemp(path.join(__dirname, '.appearance-store-'));
  t.after(() => fs.rm(dataFolder, { recursive: true, force: true }));
  const store = new AppearancePackStore({
    dataFolder, fetchImpl: async () => { throw new Error('Unexpected network request'); }, ...options
  });
  await store.initialize();
  return { store, dataFolder, file: path.join(store.folder, filename(custom.kind, custom.repository)) };
}

test('initialization validates packaged fallbacks and catalog returns normalized, isolated snapshots', async t => {
  const { store } = await fixture(t);
  const catalog = store.catalog([{ kind: 'themes', repository: 'https://github.com/Sample/Appearance.git' }]);
  assert.equal(catalog.sources.length, 3);
  for (const source of catalog.sources.slice(0, 2)) {
    assert.equal(source.official, true);
    assert.equal(source.error, null);
    assert.equal(source.updatedAt, null);
    assert.deepEqual(source.manifest, AppearancePacks.validate(source.manifest, source.kind));
  }
  assert.equal(catalog.sources[2].repository, custom.repository);
  assert.equal(catalog.sources[2].manifest, null);
  catalog.sources[0].manifest.packs[0].name = 'Mutated';
  assert.notEqual(store.catalog().sources[0].manifest.packs[0].name, 'Mutated');
  assert.throws(() => store.catalog([{ kind: 'icons', repository: 'https://example.com/owner/repo' }]));
});

test('refresh uses anonymous default-branch GitHub raw API, persists atomically and reloads offline', async t => {
  let calls = 0;
  const { store, dataFolder, file } = await fixture(t, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/sample/appearance/contents/orbit-themes.json');
    assert.deepEqual(options.headers, { Accept: 'application/vnd.github.raw+json' });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify(themes()));
  } });
  await store.refresh('themes', 'https://github.com/Sample/Appearance.git');
  assert.equal(calls, 1);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(saved, { ...envelope(), updatedAt: saved.updatedAt });
  assert.deepEqual(await fs.readdir(store.folder), [path.basename(file)]);
  const restarted = new AppearancePackStore({ dataFolder, fetchImpl: () => assert.fail('offline initialization fetched') });
  await restarted.initialize();
  assert.deepEqual(sourceOf(restarted), sourceOf(store));
});

test('concurrent refreshes of one normalized source are deduplicated', async t => {
  let release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const { store } = await fixture(t, { fetchImpl: async () => { calls++; await pending; return new Response(JSON.stringify(themes())); } });
  const first = store.refresh('themes', custom.repository);
  const second = store.refresh('themes', 'Sample/Appearance');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, await second);
  await store.refresh('themes', custom.repository);
  assert.equal(calls, 2);
});

test('network, rate-limit, not-found, invalid and oversized responses preserve the last good cache', async t => {
  let fetchResponse = () => new Response(JSON.stringify(themes()));
  const { store, file } = await fixture(t, { fetchImpl: (...args) => fetchResponse(...args) });
  await store.refresh(custom.kind, custom.repository);
  const before = await fs.readFile(file, 'utf8'), good = sourceOf(store);
  const failures = [
    [() => { throw new Error('network secret must not escape'); }, /Cannot reach/],
    [() => new Response('', { status: 404 }), /not found \(404\)/],
    [() => new Response('', { status: 429 }), /rate limit/],
    [() => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }), /rate limit/],
    [() => new Response('', { status: 500 }), /failed \(500\)/],
    [() => new Response('{bad'), /Invalid appearance manifest/],
    [() => new Response(JSON.stringify({ ...themes(), version: 2 })), /Invalid appearance manifest/],
    [() => new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }), /2 MB/],
    [() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1024 * 1024 + 1)); controller.close(); }
    })), /2 MB/],
    [() => new Response(new ReadableStream({ start(controller) { controller.error(new Error('broken stream')); } })), /Cannot read/]
  ];
  for (const [response, expected] of failures) {
    fetchResponse = response;
    await assert.rejects(store.refresh(custom.kind, custom.repository), expected);
    assert.match(sourceOf(store).error, expected);
    assert.deepEqual(sourceOf(store).manifest, good.manifest);
    assert.equal(sourceOf(store).updatedAt, good.updatedAt);
    assert.equal(await fs.readFile(file, 'utf8'), before);
  }
  fetchResponse = () => new Response(JSON.stringify(themes('Recovered')));
  await store.refresh(custom.kind, custom.repository);
  assert.equal(sourceOf(store).error, null);
  assert.equal(sourceOf(store).manifest.packs[0].name, 'Recovered');
});

test('timeout bounds both response acquisition and streamed body consumption', async t => {
  for (const fetchImpl of [
    () => new Promise(() => {}),
    () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }))
  ]) {
    const { store } = await fixture(t, { fetchImpl, timeoutMs: 20 });
    await assert.rejects(store.refresh(custom.kind, custom.repository), /timed out/);
    assert.match(sourceOf(store).error, /timed out/);
    assert.equal(sourceOf(store).manifest, null);
  }
});

test('corrupt cache metadata and manifests are visible, with official fallback and custom unavailability', async t => {
  const { store, dataFolder, file } = await fixture(t);
  const official = AppearancePacks.OFFICIAL[0];
  const officialFile = path.join(store.folder, filename(official.kind, official.repository));
  for (const corrupt of [
    '{broken',
    JSON.stringify({ ...envelope(), version: 2 }),
    JSON.stringify({ ...envelope(), format: 'other' }),
    JSON.stringify({ ...envelope(), repository: 'another/repo' }),
    JSON.stringify({ ...envelope(), updatedAt: 'yesterday' }),
    JSON.stringify({ ...envelope(), kind: 'unknown' }),
    JSON.stringify({ ...envelope(), manifest: { ...themes(), packs: [] } })
  ]) {
    await fs.writeFile(file, corrupt);
    await fs.writeFile(officialFile, corrupt);
    const restarted = new AppearancePackStore({ dataFolder });
    await restarted.initialize();
    assert.equal(sourceOf(restarted).manifest, null);
    assert.match(sourceOf(restarted).error, /corrupt or unreadable/);
    const fallback = sourceOf(restarted, official);
    assert.deepEqual(fallback.manifest, sourceOf(store, official).manifest);
    assert.match(fallback.error, /corrupt or unreadable/);
  }
});

test('cache write and rename failures retain both disk and memory, then allow recovery', async t => {
  let failure = '';
  const fsImpl = {
    ...fs,
    writeFile: (...args) => failure === 'write' ? Promise.reject(new Error('private path')) : fs.writeFile(...args),
    rename: (...args) => failure === 'rename' ? Promise.reject(new Error('private path')) : fs.rename(...args)
  };
  let name = 'Original';
  const { store, file } = await fixture(t, { fsImpl, fetchImpl: async () => new Response(JSON.stringify(themes(name))) });
  await store.refresh(custom.kind, custom.repository);
  const before = await fs.readFile(file, 'utf8'), good = sourceOf(store);
  name = 'Replacement';
  for (failure of ['write', 'rename']) {
    await assert.rejects(store.refresh(custom.kind, custom.repository), /Cannot save/);
    assert.deepEqual(sourceOf(store).manifest, good.manifest);
    assert.equal(sourceOf(store).updatedAt, good.updatedAt);
    assert.equal(await fs.readFile(file, 'utf8'), before);
    assert.deepEqual(await fs.readdir(store.folder), [path.basename(file)]);
  }
  failure = '';
  await store.refresh(custom.kind, custom.repository);
  assert.equal(sourceOf(store).manifest.packs[0].name, name);
  assert.equal(sourceOf(store).error, null);
});

test('unreadable cache directory is reported instead of silently appearing empty', async t => {
  const { store } = await fixture(t, {
    fsImpl: { ...fs, readdir: async () => { throw new Error('permission denied'); } },
    fetchImpl: async () => new Response(JSON.stringify(themes()))
  });
  assert.match(sourceOf(store).error, /Cannot read/);
  assert.ok(store.catalog().sources.every(source => source.manifest && source.error));
  await store.refresh(custom.kind, custom.repository);
  assert.equal(sourceOf(store).error, null);
});

test('incomplete official icons are rejected without losing defaults while custom icons may be partial', async t => {
  let manifest = icons();
  const { store } = await fixture(t, { fetchImpl: async () => new Response(JSON.stringify(manifest)) });
  const official = AppearancePacks.OFFICIAL[0], before = sourceOf(store, official);
  await assert.rejects(store.refresh(official.kind, official.repository), /missing required icons/);
  assert.deepEqual(sourceOf(store, official).manifest, before.manifest);
  await store.refresh('icons', 'sample/icons');
  assert.deepEqual(sourceOf(store, { kind: 'icons', repository: 'sample/icons' }).manifest, icons());
  manifest = structuredClone(before.manifest);
  manifest.packs[0].name = 'Official refresh';
  await store.refresh(official.kind, official.repository);
  assert.equal(sourceOf(store, official).manifest.packs[0].name, 'Official refresh');
  assert.equal(sourceOf(store, official).error, null);
});

test('a schema-valid but incomplete official icon cache is rejected on disk read', async t => {
  const { store, dataFolder } = await fixture(t);
  const official = AppearancePacks.OFFICIAL[0];
  await fs.writeFile(path.join(store.folder, filename(official.kind, official.repository)), JSON.stringify(envelope(official, icons())));
  const restarted = new AppearancePackStore({ dataFolder });
  await restarted.initialize();
  assert.match(sourceOf(restarted, official).error, /corrupt or unreadable/);
  assert.deepEqual(sourceOf(restarted, official).manifest, sourceOf(store, official).manifest);
});

test('official duplicate and Midnight themes cannot replace last-good themes, but community IDs are namespaced', async t => {
  let manifest = themes('Last good');
  const { store, dataFolder } = await fixture(t, { fetchImpl: async () => new Response(JSON.stringify(manifest)) });
  const official = AppearancePacks.OFFICIAL.find(source => source.kind === 'themes');
  const file = path.join(store.folder, filename(official.kind, official.repository));
  const fallback = sourceOf(store, official).manifest;
  await store.refresh(official.kind, official.repository);
  const good = sourceOf(store, official), disk = await fs.readFile(file, 'utf8');
  const duplicate = themes();
  duplicate.packs.push({ ...structuredClone(duplicate.packs[0]), id: 'another-pack' });
  const midnight = themes();
  midnight.packs[0].themes[0].id = 'midnight';
  for (const [invalid, message] of [
    [duplicate, 'The official appearance manifest contains duplicate theme IDs.'],
    [midnight, 'The official appearance manifest must not include Midnight.']
  ]) {
    manifest = invalid;
    await assert.rejects(store.refresh(official.kind, official.repository), { message });
    assert.equal(sourceOf(store, official).error, message);
    assert.deepEqual(sourceOf(store, official).manifest, good.manifest);
    assert.equal(sourceOf(store, official).updatedAt, good.updatedAt);
    assert.equal(await fs.readFile(file, 'utf8'), disk);
    await fs.writeFile(file, JSON.stringify(envelope(official, invalid)));
    const restarted = new AppearancePackStore({ dataFolder });
    await restarted.initialize();
    assert.match(sourceOf(restarted, official).error, /corrupt or unreadable/);
    assert.deepEqual(sourceOf(restarted, official).manifest, fallback);
    await fs.writeFile(file, disk);
    await store.refresh(custom.kind, custom.repository);
    assert.deepEqual(sourceOf(store).manifest, invalid);
  }
});

test('the byte limit accepts an exactly 2 MB manifest and independent sources refresh concurrently', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { store } = await fixture(t, { fetchImpl: async url => {
    if (url.includes('/sample/blocked/')) await waiting;
    return new Response(JSON.stringify(themes()).padEnd(AppearancePackStore.MAX_RESPONSE_BYTES, ' '));
  } });
  const blocked = store.refresh('themes', 'sample/blocked');
  await store.refresh(custom.kind, custom.repository);
  assert.ok(sourceOf(store).manifest);
  release();
  await blocked;
  assert.ok(sourceOf(store, { kind: 'themes', repository: 'sample/blocked' }).manifest);
});

test('invalid repository and kind are rejected before making a request', async t => {
  const { store } = await fixture(t, { fetchImpl: () => assert.fail('invalid request fetched') });
  for (const repository of ['https://evil.test/repo', 'owner/repo?token=secret', 'owner/../repo']) {
    await assert.rejects(store.refresh('themes', repository), /public GitHub repository/);
  }
  await assert.rejects(store.refresh('scripts', custom.repository), /Invalid appearance repository/);
});
