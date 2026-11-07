'use strict';
// Local HTTP server that opens the workspace in a browser: static interface files, a JSON API and change events.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Translator } = require('../shared/localization');
const fontSources = require('../../fonts/sources.json');

class WebServer {
  static DEFAULT_PORT = 47821;
  static HOST = '127.0.0.1';
  static #BODY_LIMIT = 64 * 1024 * 1024;
  static #JAVASCRIPT = 'text/javascript; charset=utf-8';
  static #FIXED_FILES = [
    ['/styles.css', 'text/css; charset=utf-8'],
    ['/fonts/fonts.css', 'text/css; charset=utf-8'],
    ...fontSources.fonts.flatMap(font => font.files.map(file => [`/fonts/${file.file}`, 'font/woff2'])),
    ['/src/web/WebBridge.js', WebServer.#JAVASCRIPT],
    ['/app-logo.svg', 'image/svg+xml']
  ];
  // Folders whose scripts the interface loads; the Node-only namespace barrels (index.js under src/shared) are not served.
  static #SCRIPT_FOLDERS = ['src/shared', 'src/renderer'];
  static #CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  static #STATUS_BY_CODE = { conflict: 409, 'missing-organization': 404, unauthorized: 401, forbidden: 403, 'not-found': 404, 'too-large': 413 };
  static #ENTRY_SCRIPT = '<script type="module" src="src/renderer/main.js"></script>';

  static #digest(value) { return crypto.createHash('sha256').update(String(value)).digest(); }
  static #sameSecret(a, b) { return typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(WebServer.#digest(a), WebServer.#digest(b)); }
  static #httpError(code, message) { const error = new Error(message); error.code = code; return error; }
  static #cookies(header = '') {
    const result = {};
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
    return result;
  }
  static async #loadToken(folder) {
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
  static #builtInLanguages() {
    return { folder: '', template: '', packs: Translator.packs(), languages: Translator.languages().map(language => ({ ...language, source: 'built-in' })), errors: [] };
  }
  static #listen(server, port) {
    return new Promise((resolve, reject) => {
      const failed = error => { server.off('listening', ready); reject(error); };
      const ready = () => { server.off('error', failed); resolve(server.address().port); };
      server.once('error', failed);
      server.once('listening', ready);
      server.listen(port, WebServer.HOST);
    });
  }
  static async #scripts(appRoot, folder) {
    const found = [];
    for (const entry of await fs.readdir(path.join(appRoot, folder), { withFileTypes: true })) {
      const relative = `${folder}/${entry.name}`;
      if (entry.isDirectory()) found.push(...await WebServer.#scripts(appRoot, relative));
      else if (entry.name.endsWith('.js') && !(folder.startsWith('src/shared') && entry.name === 'index.js')) found.push(`/${relative}`);
    }
    return found;
  }

  #store; #appRoot; #tokenFolder; #requestedPort; #openDataFolder; #language; #languages;
  #server; #token; #actualPort; #indexHtml; #keepAlive;
  #streams = new Set();
  #staticCache = new Map();
  #staticFiles = new Map(WebServer.#FIXED_FILES);

  constructor({ store, appRoot, tokenFolder, port = WebServer.DEFAULT_PORT, openDataFolder = async () => {}, language = () => 'it', languages = async () => WebServer.#builtInLanguages() }) {
    this.#store = store;
    this.#appRoot = appRoot;
    this.#tokenFolder = tokenFolder;
    this.#requestedPort = port;
    this.#openDataFolder = openDataFolder;
    this.#language = language;
    this.#languages = languages;
  }

  get port() { return this.#actualPort; }
  get url() { return this.#baseUrl(); }

  #currentLanguage() { const code = this.#language(); return Translator.validCode(code) ? code : Translator.SOURCE; }
  #say(text) { return Translator.translate(text, this.#currentLanguage()); }
  #cookieName() { return `orbitkanban_${this.#actualPort}`; }
  #baseUrl() { return this.#actualPort ? `http://${WebServer.HOST}:${this.#actualPort}/` : ''; }

  #securityHeaders(res, type) {
    res.setHeader('Content-Security-Policy', WebServer.#CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (type) res.setHeader('Content-Type', type);
  }
  #send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
    this.#securityHeaders(res, type);
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    res.writeHead(status);
    res.end(body);
  }
  #json(res, status, value, headers) { this.#send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', headers); }
  #page(res, status, title, text) {
    const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    this.#send(res, status, `<!doctype html><html lang="${this.#currentLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OrbitKanban</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#10131c;color:#edf0fa;font:16px system-ui,sans-serif}main{max-width:520px;padding:32px;border-radius:18px;background:#191d2a;box-shadow:0 20px 60px #0008}h1{margin:0 0 12px;font-size:22px;color:#a392ff}p{line-height:1.55;color:#c5cbe0}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(text)}</p></main></body></html>`, 'text/html; charset=utf-8');
  }
  #allowedHost(req) { return [`${WebServer.HOST}:${this.#actualPort}`, `localhost:${this.#actualPort}`].includes(req.headers.host); }
  #authenticated(req) { return WebServer.#sameSecret(WebServer.#cookies(req.headers.cookie)[this.#cookieName()], this.#token); }
  async #readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > WebServer.#BODY_LIMIT) throw WebServer.#httpError('too-large', this.#say("Request too large."));
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw new Error(this.#say("Invalid request.")); }
  }
  async #staticFile(name) {
    if (!this.#staticCache.has(name)) this.#staticCache.set(name, await fs.readFile(path.join(this.#appRoot, name.slice(1))));
    return this.#staticCache.get(name);
  }
  async #index() {
    if (this.#indexHtml) return this.#indexHtml;
    const html = await fs.readFile(path.join(this.#appRoot, 'index.html'), 'utf8');
    const csp = html.replace("connect-src 'none'", "connect-src 'self'");
    const bridged = csp.replace(WebServer.#ENTRY_SCRIPT, `<script defer src="src/web/WebBridge.js"></script>\n  ${WebServer.#ENTRY_SCRIPT}`);
    if (csp === html || bridged === csp) throw new Error('index.html is not compatible with browser access.');
    return (this.#indexHtml = bridged);
  }
  #events(req, res) {
    this.#securityHeaders(res, 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.writeHead(200);
    res.write('retry: 3000\n\n');
    res.write(`event: ready\ndata: {}\n\n`);
    this.#streams.add(res);
    req.on('close', () => this.#streams.delete(res));
  }
  // Stable reference: registered on and removed from the store change events.
  #broadcast = info => {
    const message = `event: change\ndata: ${JSON.stringify(info)}\n\n`;
    for (const res of this.#streams) res.write(message);
  };
  async #api(req, res, url) {
    const store = this.#store;
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/events') return this.#events(req, res);
    if (req.headers['x-orbitkanban'] !== '1') throw WebServer.#httpError('forbidden', this.#say("Request not allowed."));
    if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) throw WebServer.#httpError('forbidden', this.#say("Origin not allowed."));
    if (route === 'GET /api/load') return this.#json(res, 200, await store.load(url.searchParams.get('org') || undefined));
    if (route === 'GET /api/export') {
      return this.#send(res, 200, await store.exportText(), 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="OrbitKanban-backup.json"' });
    }
    if (route === 'GET /api/backups') return this.#json(res, 200, await store.listBackups());
    if (route === 'GET /api/export-organization') {
      const exported = await store.exportOrganization(url.searchParams.get('org') || undefined, url.searchParams.get('kind') || '');
      return this.#send(res, 200, exported.text, 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="${exported.fileName}"` });
    }
    if (route === 'GET /api/languages') return this.#json(res, 200, await this.#languages('info'));
    if (req.method !== 'POST') throw WebServer.#httpError('not-found', this.#say("Not found."));
    const body = await this.#readBody(req);
    if (url.pathname === '/api/save') return this.#json(res, 200, await store.save(body.data, body.organizationId, body.organizationName, body.revision));
    if (url.pathname === '/api/organization') return this.#json(res, 200, await store.organization(body.operation, body.payload, body.organizationId));
    if (url.pathname === '/api/import') return this.#json(res, 200, await store.replace(body.archive));
    if (url.pathname === '/api/backups' && body.operation === 'restore') return this.#json(res, 200, await store.restoreBackup(body.fileName));
    if (url.pathname === '/api/languages') return this.#json(res, 200, await this.#languages(body.operation));
    if (url.pathname === '/api/open-data-folder') { await this.#openDataFolder(); return this.#json(res, 200, { ok: true }); }
    throw WebServer.#httpError('not-found', this.#say("Not found."));
  }
  async #handle(req, res) {
    if (!this.#allowedHost(req)) return this.#send(res, 403, 'Host not allowed');
    const url = new URL(req.url, this.#baseUrl());
    const site = req.headers['sec-fetch-site'];
    if (url.pathname === '/auth' && req.method === 'GET') {
      if (site === 'cross-site' || !WebServer.#sameSecret(url.searchParams.get('token') || '', this.#token)) return this.#page(res, 403, this.#say("Invalid link"), this.#say("The access key is not valid. Open the browser from the “Open in browser” button in the OrbitKanban app."));
      const org = url.searchParams.get('org') || '';
      const location = org && org.length <= 200 ? `/?org=${encodeURIComponent(org)}` : '/';
      return this.#send(res, 303, '', 'text/plain; charset=utf-8', { Location: location, 'Set-Cookie': `${this.#cookieName()}=${this.#token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` });
    }
    if (!this.#authenticated(req)) {
      if (url.pathname.startsWith('/api/')) return this.#json(res, 401, { error: this.#say("Browser session not authorized. Reopen the link from the app."), code: 'unauthorized' });
      return this.#page(res, 401, this.#say("Protected access"), this.#say("To open OrbitKanban in the browser use the “Open in browser” button in the app, or copy the access link from Settings."));
    }
    if (url.pathname.startsWith('/api/')) {
      if (site && site !== 'same-origin') throw WebServer.#httpError('forbidden', this.#say("Request not allowed."));
      return this.#api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return this.#send(res, 405, 'Method not allowed');
    if (url.pathname === '/' || url.pathname === '/index.html') return this.#send(res, 200, await this.#index(), 'text/html; charset=utf-8');
    if (this.#staticFiles.has(url.pathname)) return this.#send(res, 200, await this.#staticFile(url.pathname), this.#staticFiles.get(url.pathname));
    return this.#send(res, 404, 'Not found');
  }

  authUrl(organizationId) {
    const url = new URL('auth', this.#baseUrl());
    url.searchParams.set('token', this.#token);
    if (organizationId) url.searchParams.set('org', organizationId);
    return url.toString();
  }
  async start() {
    this.#token = await WebServer.#loadToken(this.#tokenFolder);
    for (const folder of WebServer.#SCRIPT_FOLDERS) for (const file of await WebServer.#scripts(this.#appRoot, folder)) this.#staticFiles.set(file, WebServer.#JAVASCRIPT);
    this.#server = http.createServer((req, res) => {
      this.#handle(req, res).catch(error => {
        if (res.headersSent) { res.destroy(); return; }
        const status = WebServer.#STATUS_BY_CODE[error.code] || 400;
        this.#json(res, status, { error: error.message, code: error.code || 'error' });
      });
    });
    this.#server.requestTimeout = 120000;
    try { this.#actualPort = await WebServer.#listen(this.#server, this.#requestedPort); }
    catch (error) {
      if (error.code !== 'EADDRINUSE' || this.#requestedPort === 0) throw error;
      this.#actualPort = await WebServer.#listen(this.#server, 0);
    }
    this.#store.on('change', this.#broadcast);
    this.#keepAlive = setInterval(() => { for (const res of this.#streams) res.write(': ping\n\n'); }, 25000);
    this.#keepAlive.unref?.();
    return { port: this.#actualPort, url: this.#baseUrl() };
  }
  async close() {
    clearInterval(this.#keepAlive);
    this.#store.off('change', this.#broadcast);
    for (const res of this.#streams) res.end();
    this.#streams.clear();
    if (!this.#server) return;
    await new Promise(resolve => { this.#server.close(() => resolve()); this.#server.closeAllConnections?.(); });
  }
}

module.exports = WebServer;
