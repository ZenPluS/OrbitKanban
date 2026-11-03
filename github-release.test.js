'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { repositoryFromRemote, githubClient, checkRepository, publishRelease, releaseNotes } = require('./github-release');

async function fixture(t, { existing = false, corrupt = false, failUpload = false, wrongTree = false } = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-release-test-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const bytes = Buffer.from('MZ portable test artifact'), digest = createHash('sha256').update(bytes).digest('hex');
  const options = { repo: 'owner/repo', tag: 'v2.7.0', commit: 'a'.repeat(40), tree: 'b'.repeat(40), assetPath: path.join(folder, 'OrbitKanban-Portable.exe') };
  await fs.writeFile(options.assetPath, bytes);
  const state = {
    release: existing ? { id: 1, tag_name: options.tag, draft: false, body: 'Manual release notes', html_url: 'https://github.com/owner/repo/releases/tag/v2.7.0' } : null,
    assets: existing ? [{ id: 10, name: 'OrbitKanban-Portable.exe', size: 3, digest: 'sha256:old', state: 'uploaded' }] : [],
    calls: [], nextId: 20, failUpload, corrupt, wrongTree
  };
  const request = async (endpoint, args = {}) => {
    const url = new URL(endpoint, 'https://api.github.com'), method = args.method || 'GET', pathname = url.pathname;
    state.calls.push({ method, pathname, args });
    if (pathname === '/repos/owner/repo/commits/v2.7.0') return { commit: { tree: { sha: state.wrongTree ? 'c'.repeat(40) : options.tree } } };
    if (pathname.endsWith('/releases/tags/v2.7.0')) return state.release && structuredClone(state.release);
    if (pathname.endsWith('/releases') && method === 'POST') {
      state.release = { id: 1, ...args.body, body: 'Generated notes', html_url: 'https://github.com/owner/repo/releases/tag/v2.7.0' };
      return structuredClone(state.release);
    }
    if (pathname.endsWith('/releases/1') && method === 'PATCH') {
      Object.assign(state.release, args.body);
      return structuredClone(state.release);
    }
    if (pathname.endsWith('/releases/1/assets')) {
      if (method === 'GET') return structuredClone(state.assets);
      if (state.failUpload) throw new Error('Upload failed');
      assert.deepEqual(args.bytes, bytes);
      const asset = {
        id: state.nextId++, name: url.searchParams.get('name'), size: bytes.length, state: 'uploaded',
        digest: state.corrupt ? null : `sha256:${digest}`, browser_download_url: 'https://github.com/owner/repo/download/asset'
      };
      state.assets.push(asset);
      return structuredClone(asset);
    }
    const id = Number(/\/releases\/assets\/(\d+)$/.exec(pathname)?.[1]);
    const asset = state.assets.find(item => item.id === id);
    assert.ok(asset, `Unexpected request ${method} ${endpoint}`);
    if (method === 'DELETE') { state.assets = state.assets.filter(item => item.id !== id); return null; }
    if (method === 'PATCH') Object.assign(asset, args.body);
    return structuredClone(asset);
  };
  return { options, request, state, digest };
}
test('release repositories only accept GitHub remotes without embedded credentials', () => {
  for (const url of ['https://github.com/owner/repo.git', 'git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo/']) assert.equal(repositoryFromRemote(url), 'owner/repo');
  for (const url of ['https://token@github.com/owner/repo', 'https://example.com/owner/repo', 'file:///repo', 'https://github.com/owner/repo?token=secret']) assert.throws(() => repositoryFromRemote(url));
});
test('GitHub API errors are explicit, tokens stay on trusted hosts and redirects are disabled', async () => {
  let calls = 0;
  const request = githubClient('secret-token', async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    assert.equal(options.redirect, 'error');
    return new Response('{"message":"secret-token"}', { status: 403 });
  });
  await assert.rejects(() => request('/repos/owner/repo'), error => /HTTP 403/.test(error.message) && !error.message.includes('secret-token'));
  await assert.rejects(() => request('https://example.com/steal'), /not allowed/i);
  assert.equal(calls, 1);
  await assert.rejects(() => checkRepository('owner/repo', async () => ({ permissions: { push: false } })), /write access/i);
});
test('new release stays a draft until the correct executable is uploaded and verified', async t => {
  const f = await fixture(t);
  const result = await publishRelease(f.options, f.request);
  assert.equal(f.state.calls.find(call => call.method === 'POST' && call.pathname.endsWith('/releases')).args.body.draft, true);
  assert.equal(f.state.release.draft, false);
  assert.equal(f.state.assets[0].name, 'OrbitKanban-Portable.exe');
  assert.equal(result.sha256, f.digest);
  assert.ok(f.state.release.body.includes('Generated notes') && f.state.release.body.includes(f.digest));
});
test('repeating publication reuses matching assets and preserves manual release notes', async t => {
  const f = await fixture(t, { existing: true });
  await publishRelease(f.options, f.request);
  const upload = f.state.calls.findIndex(call => call.method === 'POST' && call.pathname.endsWith('/assets'));
  const removal = f.state.calls.findIndex(call => call.method === 'DELETE');
  assert.ok(upload >= 0 && removal > upload);
  assert.ok(f.state.calls.slice(upload + 1, removal).some(call => call.method === 'GET' && /assets\/20$/.test(call.pathname)));
  assert.ok(f.state.release.body.startsWith('Manual release notes'));
  const count = f.state.calls.length;
  await publishRelease({ ...f.options, commit: 'd'.repeat(40) }, f.request);
  assert.ok(f.state.calls.slice(count).every(call => !['POST', 'DELETE'].includes(call.method)));
  assert.equal(f.state.assets.length, 1);
  assert.equal(f.state.release.body.match(/orbitkanban-build:start/g).length, 1);
});
test('failed or unverified uploads preserve the existing downloadable executable', async t => {
  for (const failure of [{ corrupt: true }, { failUpload: true }]) {
    const f = await fixture(t, { existing: true, ...failure });
    await assert.rejects(() => publishRelease(f.options, f.request), /checksum|upload failed/i);
    assert.equal(f.state.assets.find(asset => asset.id === 10).name, 'OrbitKanban-Portable.exe');
    assert.ok(!f.state.calls.some(call => call.method === 'DELETE' && call.pathname.endsWith('/10')));
    assert.equal(f.state.assets.length, 1);
    assert.equal(f.state.release.body, 'Manual release notes');
  }
});
test('a failed new release can be retried without creating duplicate releases', async t => {
  const f = await fixture(t, { failUpload: true });
  await assert.rejects(() => publishRelease(f.options, f.request), /Upload failed/);
  assert.equal(f.state.release.draft, true);
  f.state.failUpload = false;
  await publishRelease(f.options, f.request);
  assert.equal(f.state.release.draft, false);
  assert.equal(f.state.calls.filter(call => call.method === 'POST' && call.pathname.endsWith('/releases')).length, 1);
});
test('a tag for different sources or an immutable release cannot be overwritten', async t => {
  const f = await fixture(t, { existing: true, wrongTree: true });
  await assert.rejects(() => publishRelease(f.options, f.request), /tested sources/i);
  assert.ok(f.state.calls.every(call => call.method === 'GET'));
  f.state.wrongTree = false;
  f.state.release.immutable = true;
  await assert.rejects(() => publishRelease(f.options, f.request), /immutable/i);
  assert.ok(f.state.calls.every(call => call.method === 'GET'));
});
test('release notes replace only their own generated block', () => {
  const first = releaseNotes('Human notes', 'commit-one', 'hash-one');
  const second = releaseNotes(`${first}\nExtra details`, 'commit-two', 'hash-two');
  assert.ok(second.startsWith('Human notes') && second.endsWith('Extra details'));
  assert.ok(second.includes('hash-two') && !second.includes('hash-one'));
});
