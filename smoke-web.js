'use strict';
const http = require('node:http');

function request(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { Host: `127.0.0.1:${port}`, ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error(`Timeout ${path}`)));
    if (body !== undefined) req.end(typeof body === 'string' ? body : JSON.stringify(body));
    else req.end();
  });
}
function openEvents(port, cookie) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `127.0.0.1:${port}`, Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' } }, res => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const type = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (type) events.push({ type, data: data ? JSON.parse(data) : null });
        }
      });
      resolve({ status: res.statusCode, type: res.headers['content-type'], events, close: () => req.destroy() });
    });
    req.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
    req.end();
  });
}
async function waitFor(predicate, label) {
  const deadline = Date.now() + 8000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function run({ server, win }) {
  const checks = [];
  const check = (condition, name) => { if (!condition) throw new Error(`Web smoke: ${name}`); checks.push(name); };
  const port = server.port;
  const renderer = code => win.webContents.executeJavaScript(code);
  const electronOrganization = await renderer('activeOrganizationId');
  const organizationIds = await renderer('organizations.map(o => o.id)');
  const otherOrganization = organizationIds.find(id => id !== electronOrganization);
  check(port > 0 && server.url === `http://127.0.0.1:${port}/`, 'Server browser in ascolto solo su 127.0.0.1');

  const anonymous = await request(port, '/');
  check(anonymous.status === 401 && anonymous.text.includes('OrbitKanban') && !anonymous.text.includes('renderer.js'), 'Browser senza chiave non accede all’app');
  check((await request(port, '/api/load', { headers: { 'X-OrbitKanban': '1' } })).status === 401, 'API senza sessione rifiutate');
  check((await request(port, '/auth?token=sbagliato')).status === 403, 'Chiave di accesso errata rifiutata');

  const auth = await request(port, `/auth?token=${encodeURIComponent(new URL(server.authUrl()).searchParams.get('token'))}&org=${encodeURIComponent(otherOrganization)}`);
  const setCookie = String(auth.headers['set-cookie'] || '');
  check(auth.status === 303 && auth.headers.location === `/?org=${encodeURIComponent(otherOrganization)}` && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), 'Link di accesso crea sessione protetta e apre l’organizzazione richiesta');
  const cookie = setCookie.split(';')[0];
  const api = { Cookie: cookie, 'X-OrbitKanban': '1', 'Sec-Fetch-Site': 'same-origin' };
  const post = (path, body, headers = {}) => request(port, path, { method: 'POST', body, headers: { ...api, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json', ...headers } });

  const page = await request(port, '/', { headers: { Cookie: cookie } });
  check(page.status === 200 && page.text.includes('<script defer src="web-bridge.js"></script>') && page.text.includes("connect-src 'self'") && /frame-ancestors 'none'/.test(page.headers['content-security-policy']) && page.headers['x-content-type-options'] === 'nosniff', 'Pagina browser con bridge e intestazioni di sicurezza');
  check((await request(port, '/', { headers: { Cookie: cookie, Host: 'evil.example' } })).status === 403, 'Host non locale rifiutato (DNS rebinding)');
  check((await request(port, '/api/load', { headers: { Cookie: cookie } })).status === 403, 'API senza intestazione dedicata rifiutate');
  check((await request(port, '/api/load', { headers: { ...api, 'Sec-Fetch-Site': 'cross-site' } })).status === 403, 'Richieste cross-site rifiutate');
  check((await post('/api/save', {}, { Origin: 'http://evil.example' })).status === 403, 'Origine esterna rifiutata in scrittura');

  const bridge = await request(port, '/web-bridge.js', { headers: { Cookie: cookie } });
  check(bridge.status === 200 && /javascript/.test(bridge.headers['content-type']) && bridge.text.includes("mode: 'browser'"), 'Bridge browser servito');
  const blocked = await Promise.all(['/main.js', '/web-server.js', '/data/workspace.json', '/..%2fmain.js', '/%2e%2e/package.json'].map(path => request(port, path, { headers: { Cookie: cookie } })));
  check(blocked.every(response => response.status === 404), 'Solo i file dell’interfaccia sono esposti');

  const other = JSON.parse((await request(port, `/api/load?org=${encodeURIComponent(otherOrganization)}`, { headers: api })).text);
  check(other.activeOrganizationId === otherOrganization && other.revision && other.appVersion && await renderer('activeOrganizationId') === electronOrganization, 'Organizzazione diversa aperta nel browser senza cambiare quella dell’app');

  const languages = JSON.parse((await request(port, '/api/languages', { headers: api })).text);
  check(languages.languages.some(language => language.code === 'de' && language.source === 'added') && languages.packs.some(pack => pack.code === 'de' && pack.messages.Impostazioni === 'Einstellungen') && languages.errors.some(error => error.file === 'broken.json'), 'Lingue aggiunte da file disponibili anche nel browser');
  const events = await openEvents(port, cookie);
  await waitFor(() => events.events.some(event => event.type === 'ready'), 'evento ready');
  check(events.status === 200 && events.type.startsWith('text/event-stream'), 'Canale di sincronizzazione in tempo reale attivo');

  const shared = JSON.parse((await request(port, `/api/load?org=${encodeURIComponent(electronOrganization)}`, { headers: api })).text);
  const stale = await post('/api/save', { data: shared.data, organizationId: electronOrganization, revision: 'revisione-superata' });
  check(stale.status === 409 && JSON.parse(stale.text).code === 'conflict', 'Salvataggio browser con dati superati segnalato come conflitto');
  const task = { ...shared.data.tasks[0], id: 'web-smoke-task', code: 'WEB-1', sequence: 9100, hidden: false, tagIds: shared.data.settings.tags.slice(0, 2).map(tag => tag.id) };
  shared.data.tasks.push(task);
  const saved = await post('/api/save', { data: shared.data, organizationId: electronOrganization, revision: shared.revision });
  check(saved.status === 200 && JSON.parse(saved.text).revision !== shared.revision, 'Salvataggio dal browser accettato');
  await waitFor(() => events.events.some(event => event.type === 'change' && event.data.organizations.some(o => o.id === electronOrganization && o.revision === JSON.parse(saved.text).revision)), 'evento change');
  check(events.events.filter(event => event.type === 'change').every(event => !JSON.stringify(event.data).includes('WEB-1')), 'Altre schede ricevono la notifica di modifica senza dati sensibili nel canale');
  await waitFor(() => renderer("data.tasks.some(t => t.code === 'WEB-1') && !refreshing"), 'sincronizzazione Electron');
  check(await renderer("revision") === JSON.parse(saved.text).revision, 'Modifica dal browser visibile subito nell’app desktop');
  check(JSON.stringify(await renderer("data.tasks.find(t => t.id === 'web-smoke-task').tagIds")) === JSON.stringify(task.tagIds) && task.tagIds.length === 2, 'Tag multipli sincronizzati dal browser all’app desktop');

  const exported = await request(port, '/api/export', { headers: api });
  check(exported.status === 200 && /attachment/.test(exported.headers['content-disposition']) && JSON.parse(exported.text).version === 2, 'Esportazione backup dal browser');
  const organizationFile = await request(port, `/api/export-organization?org=${encodeURIComponent(electronOrganization)}&kind=data`, { headers: api });
  const organizationData = organizationFile.status === 200 ? JSON.parse(organizationFile.text) : {};
  check(organizationFile.status === 200 && /^attachment; filename="OrbitKanban-[a-z0-9-]+-(dati|data)-\d{4}-\d{2}-\d{2}\.json"$/.test(organizationFile.headers['content-disposition']) && organizationData.format === 'orbitkanban-organization' && organizationData.data.tasks.some(t => t.code === 'WEB-1') && !organizationData.settings && !organizationData.themes, 'Esportazione dati per organizzazione dal browser in un file dedicato');
  check(organizationData.data.tags.length === shared.data.settings.tags.length && JSON.stringify(organizationData.data.tasks.find(t => t.id === task.id).tagIds) === JSON.stringify(task.tagIds), 'Esportazione browser include catalogo tag e assegnazioni');
  const wrongKind = await request(port, `/api/export-organization?org=${encodeURIComponent(electronOrganization)}&kind=altro`, { headers: api });
  const wrongOrganization = await request(port, '/api/export-organization?org=inesistente&kind=themes', { headers: api });
  check(wrongKind.status === 400 && wrongOrganization.status === 404 && JSON.parse(wrongOrganization.text).code === 'missing-organization', 'Esportazione per organizzazione rifiuta tipi o organizzazioni non validi');
  events.close();
  return checks;
}

module.exports = { run };
