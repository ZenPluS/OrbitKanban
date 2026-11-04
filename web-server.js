'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const i18n = require('./i18n');
const fontSources = require('./fonts/sources.json');

const DEFAULT_PORT = 47821;
const HOST = '127.0.0.1';
const BODY_LIMIT = 64 * 1024 * 1024;
const STATIC_FILES = new Map([
  ['/styles.css', 'text/css; charset=utf-8'],
  ['/fonts/fonts.css', 'text/css; charset=utf-8'],
  ...fontSources.fonts.flatMap(font => font.files.map(file => [`/fonts/${file.file}`, 'font/woff2'])),
  ['/core.js', 'text/javascript; charset=utf-8'],
  ['/columns.js', 'text/javascript; charset=utf-8'],
  ['/icons.js', 'text/javascript; charset=utf-8'],
  ['/csv.js', 'text/javascript; charset=utf-8'],
  ['/guide.js', 'text/javascript; charset=utf-8'],
  ['/i18n.js', 'text/javascript; charset=utf-8'],
  ['/xlsx.js', 'text/javascript; charset=utf-8'],
  ['/renderer.js', 'text/javascript; charset=utf-8'],
  ['/web-bridge.js', 'text/javascript; charset=utf-8'],
  ['/app-logo.svg', 'image/svg+xml']
]);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const STATUS_BY_CODE = { conflict: 409, 'missing-organization': 404, unauthorized: 401, forbidden: 403, 'not-found': 404, 'too-large': 413 };

function digest(value) { return crypto.createHash('sha256').update(String(value)).digest(); }
function sameSecret(a, b) { return typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(digest(a), digest(b)); }
function httpError(code, message) { const error = new Error(message); error.code = code; return error; }
function cookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}
async function loadToken(folder) {
  const file = path.join(folder, 'browser-access-token');
  try {
    const token = (await fs.readFile(file, 'utf8')).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) return token;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const token = crypto.randomBytes(32).toString('base64url');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(file, token, { encoding: 'utf8', mode: 0o600 });
  return token;
}
function builtInLanguages() {
  return { folder: '', template: '', packs: i18n.packs(), languages: i18n.languages().map(language => ({ ...language, source: 'built-in' })), errors: [] };
}
function listen(server, port) {
  return new Promise((resolve, reject) => {
    const failed = error => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', failed); resolve(server.address().port); };
    server.once('error', failed);
    server.once('listening', ready);
    server.listen(port, HOST);
  });
}

function createWebServer({ store, appRoot, tokenFolder, port = DEFAULT_PORT, openDataFolder = async () => {}, language = () => 'it', languages = async () => builtInLanguages() }) {
  let server, token, actualPort, indexHtml;
  const streams = new Set();
  const staticCache = new Map();
  let keepAlive;
  const currentLanguage = () => { const code = language(); return i18n.validCode(code) ? code : i18n.SOURCE; };
  const say = text => i18n.translate(text, currentLanguage());
  const cookieName = () => `orbitkanban_${actualPort}`;
  const baseUrl = () => actualPort ? `http://${HOST}:${actualPort}/` : '';

  function securityHeaders(res, type) {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (type) res.setHeader('Content-Type', type);
  }
  function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
    securityHeaders(res, type);
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    res.writeHead(status);
    res.end(body);
  }
  function json(res, status, value, headers) { send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', headers); }
  function page(res, status, title, text) {
    const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    send(res, status, `<!doctype html><html lang="${currentLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OrbitKanban</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10131c;color:#edf0fa;font:16px system-ui,sans-serif}main{max-width:520px;padding:32px;border-radius:18px;background:#191d2a;box-shadow:0 20px 60px #0008}h1{margin:0 0 12px;font-size:22px;color:#a392ff}p{line-height:1.55;color:#c5cbe0}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(text)}</p></main></body></html>`, 'text/html; charset=utf-8');
  }
  function allowedHost(req) { return [`${HOST}:${actualPort}`, `localhost:${actualPort}`].includes(req.headers.host); }
  function authenticated(req) { return sameSecret(cookies(req.headers.cookie)[cookieName()], token); }
  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) throw httpError('too-large', say("Request too large."));
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw new Error(say("Invalid request.")); }
  }
  async function staticFile(name) {
    if (!staticCache.has(name)) staticCache.set(name, await fs.readFile(path.join(appRoot, name.slice(1))));
    return staticCache.get(name);
  }
  async function index() {
    if (indexHtml) return indexHtml;
    let html = await fs.readFile(path.join(appRoot, 'index.html'), 'utf8');
    const csp = html.replace("connect-src 'none'", "connect-src 'self'");
    const bridged = csp.replace('<script defer src="renderer.js"></script>', '<script defer src="web-bridge.js"></script>\n  <script defer src="renderer.js"></script>');
    if (csp === html || bridged === csp) throw new Error('index.html is not compatible with browser access.');
    return (indexHtml = bridged);
  }
  function events(req, res) {
    securityHeaders(res, 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.writeHead(200);
    res.write('retry: 3000\n\n');
    res.write(`event: ready\ndata: {}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
  }
  function broadcast(info) {
    const message = `event: change\ndata: ${JSON.stringify(info)}\n\n`;
    for (const res of streams) res.write(message);
  }
  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/events') return events(req, res);
    if (req.headers['x-orbitkanban'] !== '1') throw httpError('forbidden', say("Request not allowed."));
    if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) throw httpError('forbidden', say("Origin not allowed."));
    if (route === 'GET /api/load') return json(res, 200, await store.load(url.searchParams.get('org') || undefined));
    if (route === 'GET /api/export') {
      return send(res, 200, await store.exportText(), 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="OrbitKanban-backup.json"' });
    }
    if (route === 'GET /api/backups') return json(res, 200, await store.listBackups());
    if (route === 'GET /api/export-organization') {
      const exported = await store.exportOrganization(url.searchParams.get('org') || undefined, url.searchParams.get('kind') || '');
      return send(res, 200, exported.text, 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="${exported.fileName}"` });
    }
    if (route === 'GET /api/languages') return json(res, 200, await languages('info'));
    if (req.method !== 'POST') throw httpError('not-found', say("Not found."));
    const body = await readBody(req);
    if (url.pathname === '/api/save') return json(res, 200, await store.save(body.data, body.organizationId, body.organizationName, body.revision));
    if (url.pathname === '/api/organization') return json(res, 200, await store.organization(body.operation, body.payload, body.organizationId));
    if (url.pathname === '/api/import') return json(res, 200, await store.replace(body.archive));
    if (url.pathname === '/api/backups' && body.operation === 'restore') return json(res, 200, await store.restoreBackup(body.fileName));
    if (url.pathname === '/api/languages') return json(res, 200, await languages(body.operation));
    if (url.pathname === '/api/open-data-folder') { await openDataFolder(); return json(res, 200, { ok: true }); }
    throw httpError('not-found', say("Not found."));
  }
  async function handle(req, res) {
    if (!allowedHost(req)) return send(res, 403, 'Host not allowed');
    const url = new URL(req.url, baseUrl());
    const site = req.headers['sec-fetch-site'];
    if (url.pathname === '/auth' && req.method === 'GET') {
      if (site === 'cross-site' || !sameSecret(url.searchParams.get('token') || '', token)) return page(res, 403, say("Invalid link"), say("The access key is not valid. Open the browser from the “Open in browser” button in the OrbitKanban app."));
      const org = url.searchParams.get('org') || '';
      const location = org && org.length <= 200 ? `/?org=${encodeURIComponent(org)}` : '/';
      return send(res, 303, '', 'text/plain; charset=utf-8', { Location: location, 'Set-Cookie': `${cookieName()}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` });
    }
    if (!authenticated(req)) {
      if (url.pathname.startsWith('/api/')) return json(res, 401, { error: say("Browser session not authorized. Reopen the link from the app."), code: 'unauthorized' });
      return page(res, 401, say("Protected access"), say("To open OrbitKanban in the browser use the “Open in browser” button in the app, or copy the access link from Settings."));
    }
    if (url.pathname.startsWith('/api/')) {
      if (site && site !== 'same-origin') throw httpError('forbidden', say("Request not allowed."));
      return api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, await index(), 'text/html; charset=utf-8');
    if (STATIC_FILES.has(url.pathname)) return send(res, 200, await staticFile(url.pathname), STATIC_FILES.get(url.pathname));
    return send(res, 404, 'Not found');
  }

  return {
    get port() { return actualPort; },
    get url() { return baseUrl(); },
    authUrl(organizationId) {
      const url = new URL('auth', baseUrl());
      url.searchParams.set('token', token);
      if (organizationId) url.searchParams.set('org', organizationId);
      return url.toString();
    },
    async start() {
      token = await loadToken(tokenFolder);
      server = http.createServer((req, res) => {
        handle(req, res).catch(error => {
          if (res.headersSent) { res.destroy(); return; }
          const status = STATUS_BY_CODE[error.code] || 400;
          json(res, status, { error: error.message, code: error.code || 'error' });
        });
      });
      server.requestTimeout = 120000;
      try { actualPort = await listen(server, port); }
      catch (error) {
        if (error.code !== 'EADDRINUSE' || port === 0) throw error;
        actualPort = await listen(server, 0);
      }
      store.on('change', broadcast);
      keepAlive = setInterval(() => { for (const res of streams) res.write(': ping\n\n'); }, 25000);
      keepAlive.unref?.();
      return { port: actualPort, url: baseUrl() };
    },
    async close() {
      clearInterval(keepAlive);
      store.off('change', broadcast);
      for (const res of streams) res.end();
      streams.clear();
      if (!server) return;
      await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
    }
  };
}

module.exports = { createWebServer, DEFAULT_PORT };
