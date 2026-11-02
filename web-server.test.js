'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { baseData } = require('./core');
const { createWorkspaceStore } = require('./workspace-store');
const { createWebServer } = require('./web-server');

let folder, store, server, cookie, firstOrg, secondOrg;

function request(urlPath, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: urlPath, method, headers: { Host: `127.0.0.1:${server.port}`, ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  });
}
const api = () => ({ Cookie: cookie, 'X-OrbitKanban': '1' });
const post = (urlPath, body, headers = {}) => request(urlPath, { method: 'POST', body, headers: { ...api(), Origin: `http://127.0.0.1:${server.port}`, 'Content-Type': 'application/json', ...headers } });

before(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbitkanban-web-'));
  store = createWorkspaceStore({ dataFolder: path.join(folder, 'data'), seed: () => baseData('it'), extras: () => ({ appVersion: '2.0.0-test' }) });
  firstOrg = (await store.load()).activeOrganizationId;
  secondOrg = (await store.organization('create', { name: 'Seconda', language: 'en' }, firstOrg)).activeOrganizationId;
  server = createWebServer({ store, appRoot: __dirname, tokenFolder: path.join(folder, 'runtime'), port: 0 });
  await server.start();
});
after(async () => {
  await server.close();
  await store.idle();
  await fs.rm(folder, { recursive: true, force: true });
});

test('font assets require authentication and only bundled assets are served with the correct MIME type', async () => {
  const font = require('./fonts/sources.json').fonts[0].files[0].file;
  assert.equal((await request(`/fonts/${font}`)).status, 401);
  const authUrl = new URL(server.authUrl(firstOrg));
  const auth = await request(authUrl.pathname + authUrl.search);
  const fontCookie = auth.headers['set-cookie'][0].split(';')[0];
  const headers = { Cookie: fontCookie };
  const css = await request('/fonts/fonts.css', { headers });
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.doesNotMatch(css.text, /https?:|@import/);
  for (const source of require('./fonts/sources.json').fonts) {
    for (const file of source.files) {
      const response = await request(`/fonts/${file.file}`, { headers });
      assert.equal(response.status, 200, file.file);
      assert.equal(response.headers['content-type'], 'font/woff2');
      assert.ok(response.text.startsWith('wOF2'));
    }
  }
  assert.equal((await request('/fonts/unlisted.woff2', { headers })).status, 404);
});

test('listens on loopback only and persists a strong access key', async () => {
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const token = await fs.readFile(path.join(folder, 'runtime', 'browser-access-token'), 'utf8');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(server.authUrl(secondOrg)).searchParams.get('token'), token);
  const again = createWebServer({ store, appRoot: __dirname, tokenFolder: path.join(folder, 'runtime'), port: 0 });
  await again.start();
  try { assert.equal(new URL(again.authUrl()).searchParams.get('token'), token); } finally { await again.close(); }
});

test('access requires the key link, which sets a strict http-only cookie', async () => {
  const anonymous = await request('/');
  assert.equal(anonymous.status, 401);
  assert.doesNotMatch(anonymous.text, /renderer\.js/);
  assert.equal((await request('/renderer.js')).status, 401);
  assert.equal((await request('/api/load', { headers: { 'X-OrbitKanban': '1' } })).status, 401);
  assert.equal((await request('/auth?token=wrong')).status, 403);
  const tokenUrl = new URL(server.authUrl(secondOrg));
  assert.equal((await request(`${tokenUrl.pathname}${tokenUrl.search}`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const auth = await request(`${tokenUrl.pathname}${tokenUrl.search}`);
  assert.equal(auth.status, 303);
  assert.equal(auth.headers.location, `/?org=${encodeURIComponent(secondOrg)}`);
  const setCookie = auth.headers['set-cookie'][0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  cookie = setCookie.split(';')[0];
  assert.equal((await request('/', { headers: { Cookie: 'orbitkanban_1=wrong' } })).status, 401);
});

test('serves the interface with the browser bridge and strict security headers', async () => {
  const page = await request('/', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  assert.match(page.text, /<script defer src="web-bridge\.js"><\/script>\s*<script defer src="renderer\.js"><\/script>/);
  assert.match(page.text, /connect-src 'self'/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['cache-control'], 'no-store');
  for (const file of ['/styles.css', '/core.js', '/columns.js', '/csv.js', '/i18n.js', '/renderer.js', '/web-bridge.js', '/app-logo.svg']) assert.equal((await request(file, { headers: { Cookie: cookie } })).status, 200, file);
  for (const file of ['/main.js', '/package.json', '/web-server.js', '/data/workspace.json', '/..%2fmain.js', '/%2e%2e/main.js', '/runtime/browser-access-token']) assert.equal((await request(file, { headers: { Cookie: cookie } })).status, 404, file);
});

test('rejects DNS rebinding, cross-site requests, missing API header and foreign origins', async () => {
  assert.equal((await request('/', { headers: { Cookie: cookie, Host: `attacker.example:${server.port}` } })).status, 403);
  assert.equal((await request('/api/load', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await request('/api/load', { headers: { ...api(), 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await post('/api/save', {}, { Origin: 'http://attacker.example' })).status, 403);
  const noOrigin = { ...api(), 'Content-Type': 'application/json' };
  assert.equal((await request('/api/save', { method: 'POST', body: {}, headers: noOrigin })).status, 403);
});

test('each browser tab loads its own organization and stale saves get a conflict', async () => {
  const second = JSON.parse((await request(`/api/load?org=${encodeURIComponent(secondOrg)}`, { headers: api() })).text);
  const first = JSON.parse((await request(`/api/load?org=${encodeURIComponent(firstOrg)}`, { headers: api() })).text);
  assert.equal(second.activeOrganizationId, secondOrg);
  assert.equal(first.activeOrganizationId, firstOrg);
  assert.equal(second.appVersion, '2.0.0-test');
  second.data.tasks.push({ id: 'web-1', code: 'WEB-1', sequence: 1, url: '', description: '', urgencyId: second.data.settings.urgencies[0].id, statusId: second.data.settings.statuses[0].id, effortHours: 2, releaseDate: '', notes: '', hidden: false });
  const saved = await post('/api/save', { data: second.data, organizationId: secondOrg, revision: second.revision });
  assert.equal(saved.status, 200);
  const stale = await post('/api/save', { data: second.data, organizationId: secondOrg, revision: second.revision });
  assert.equal(stale.status, 409);
  assert.equal(JSON.parse(stale.text).code, 'conflict');
  const missing = await post('/api/save', { data: second.data, organizationId: 'missing', revision: second.revision });
  assert.equal(missing.status, 404);
  assert.equal(JSON.parse(missing.text).code, 'missing-organization');
  assert.equal((await store.load(firstOrg)).revision, first.revision);
});

test('server-sent events notify every tab of changes without sending task data', async () => {
  const received = [];
  const stream = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: '/api/events', headers: { Host: `127.0.0.1:${server.port}`, Cookie: cookie } }, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => received.push(chunk));
      resolve({ res, close: () => req.destroy() });
    });
    req.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
    req.end();
  });
  try {
    assert.match(stream.res.headers['content-type'], /text\/event-stream/);
    const current = await store.load(firstOrg);
    current.data.tasks.push({ id: 'sse-1', code: 'SECRET-SSE', sequence: 1, url: '', description: '', urgencyId: current.data.settings.urgencies[0].id, statusId: current.data.settings.statuses[0].id, effortHours: 2, releaseDate: '', notes: '', hidden: false });
    const saved = await store.save(current.data, firstOrg, undefined, current.revision);
    const deadline = Date.now() + 3000;
    while (!received.join('').includes(saved.revision) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    const text = received.join('');
    assert.match(text, /event: ready/);
    assert.match(text, /event: change/);
    assert.ok(text.includes(saved.revision));
    assert.ok(!text.includes('SECRET-SSE'));
  } finally { stream.close(); }
});

test('export downloads the archive and invalid bodies return JSON errors', async () => {
  const exported = await request('/api/export', { headers: api() });
  assert.equal(exported.status, 200);
  assert.match(exported.headers['content-disposition'], /attachment/);
  assert.equal(JSON.parse(exported.text).version, 2);
  const invalid = await request('/api/save', { method: 'POST', headers: { ...api(), Origin: `http://127.0.0.1:${server.port}` }, body: '{ not json' });
  assert.equal(invalid.status, 400);
  assert.ok(JSON.parse(invalid.text).error);
  const unsupported = await post('/api/organization', { operation: 'explode', payload: {}, organizationId: firstOrg });
  assert.equal(unsupported.status, 400);
  assert.ok(JSON.parse(unsupported.text).error);
});

test('organization parts download as separate files and invalid requests are rejected', async () => {
  const exported = await request(`/api/export-organization?org=${encodeURIComponent(secondOrg)}&kind=data`, { headers: api() });
  assert.equal(exported.status, 200);
  assert.match(exported.headers['content-disposition'], /^attachment; filename="OrbitKanban-seconda-data-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.match(exported.headers['content-type'], /^application\/json/);
  const file = JSON.parse(exported.text);
  assert.deepEqual([file.format, file.kind, file.appVersion, file.organization.name], ['orbitkanban-organization', 'data', '2.0.0-test', 'Seconda']);
  assert.ok(file.data.tasks.some(t => t.code === 'WEB-1'));
  assert.ok(!('settings' in file) && !('themes' in file));
  const themes = await request(`/api/export-organization?org=${encodeURIComponent(firstOrg)}&kind=themes`, { headers: api() });
  assert.match(themes.headers['content-disposition'], /-temi-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.ok(Array.isArray(JSON.parse(themes.text).themes.themes));
  assert.equal((await request(`/api/export-organization?org=${encodeURIComponent(firstOrg)}&kind=altro`, { headers: api() })).status, 400);
  const missing = await request('/api/export-organization?org=missing&kind=data', { headers: api() });
  assert.equal(missing.status, 404);
  assert.equal(JSON.parse(missing.text).code, 'missing-organization');
  assert.equal((await request(`/api/export-organization?org=${encodeURIComponent(firstOrg)}&kind=data`, { headers: { Cookie: cookie } })).status, 403);
});

test('languages are listed for the browser and operations are forwarded to the app', async () => {
  const listed = await request('/api/languages', { headers: api() });
  assert.equal(listed.status, 200);
  const info = JSON.parse(listed.text);
  assert.deepEqual(info.languages.map(({ code, source }) => [code, source]), [['en', 'built-in'], ['it', 'built-in']]);
  assert.ok(info.packs.find(pack => pack.code === 'en').messages['Salva impostazioni']);
  assert.equal((await request('/api/languages', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await request('/api/languages', { headers: { 'X-OrbitKanban': '1' } })).status, 401);
  const operations = [];
  const custom = createWebServer({
    store, appRoot: __dirname, tokenFolder: path.join(folder, 'runtime'), port: 0, language: () => 'en',
    languages: async operation => { operations.push(operation); if (operation === 'explode') throw new Error('Operazione non supportata.'); return { folder: 'languages', languages: [], packs: [], errors: [] }; }
  });
  await custom.start();
  try {
    const call = (urlPath, options = {}) => new Promise((resolve, reject) => {
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      const req = http.request({ host: '127.0.0.1', port: custom.port, path: urlPath, method: body ? 'POST' : 'GET', headers: { Host: `127.0.0.1:${custom.port}`, Cookie: `orbitkanban_${custom.port}=${cookie.split('=')[1]}`, 'X-OrbitKanban': '1', ...(body ? { Origin: `http://127.0.0.1:${custom.port}`, 'Content-Type': 'application/json' } : {}) } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(body);
    });
    assert.equal(JSON.parse((await call('/api/languages')).text).folder, 'languages');
    assert.equal((await call('/api/languages', { body: { operation: 'reload' } })).status, 200);
    const failed = await call('/api/languages', { body: { operation: 'explode' } });
    assert.equal(failed.status, 400);
    assert.equal(JSON.parse(failed.text).error, 'Operazione non supportata.');
    assert.deepEqual(operations, ['info', 'reload', 'explode']);
    const denied = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: custom.port, path: '/auth?token=wrong', headers: { Host: `127.0.0.1:${custom.port}` } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }).on('error', reject);
    });
    assert.match(denied, /<html lang="en">/);
    assert.match(denied, /Invalid link/);
  } finally { await custom.close(); }
});

test('daily backups are listed only to authenticated browser clients and unsafe restores are rejected', async () => {
  const anonymous = await request('/api/backups', { headers: { 'X-OrbitKanban': '1' } });
  assert.equal(anonymous.status, 401);
  const listed = await request('/api/backups', { headers: api() });
  assert.equal(listed.status, 200);
  const result = JSON.parse(listed.text);
  assert.equal(result.retention, 14);
  assert.ok(result.backups.length > 0);
  assert.ok(result.backups.every(backup => /^\d{4}-\d{2}-\d{2}-workspace\.json$/.test(backup.fileName)));
  const unsafe = await post('/api/backups', { operation: 'restore', fileName: '../workspace.json' });
  assert.equal(unsafe.status, 400);
});
