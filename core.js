'use strict';
(() => {
const id = () => globalThis.crypto.randomUUID();
const APP_NAME = 'OrbitKanban';
const today = () => new Date().toLocaleDateString('en-CA');
const i18n = typeof module !== 'undefined' ? require('./i18n') : null;
const term = (text, language) => (i18n || globalThis.OrbitaI18n)?.term(text, language) ?? String(text);
const validLanguage = code => typeof code === 'string' && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(code);
const FONT_SIZE_PARTS = [
  { id: 'base', min: 80, max: 140 },
  { id: 'sidebar', min: 80, max: 130 },
  { id: 'headings', min: 80, max: 140 },
  { id: 'tables', min: 80, max: 150 },
  { id: 'milestones', min: 80, max: 150 },
  { id: 'kanban', min: 80, max: 150 },
  { id: 'dialogs', min: 80, max: 140 }
];
const FONT_SIZE_STEP = 5;
const defaultFontSizes = () => Object.fromEntries(FONT_SIZE_PARTS.map(part => [part.id, 100]));
function validFontSizes(sizes) {
  return Boolean(sizes) && typeof sizes === 'object' && !Array.isArray(sizes) && Object.keys(sizes).length === FONT_SIZE_PARTS.length
    && FONT_SIZE_PARTS.every(({ id, min, max }) => Number.isInteger(sizes[id]) && sizes[id] >= min && sizes[id] <= max);
}
function clampFontSize(partId, value) {
  const part = FONT_SIZE_PARTS.find(item => item.id === partId);
  const stepped = Math.round(Number(value) / FONT_SIZE_STEP) * FONT_SIZE_STEP;
  return Number.isFinite(stepped) ? Math.min(part.max, Math.max(part.min, stepped)) : 100;
}
const HIGHLIGHT_LIMIT = 16;
const HIGHLIGHT_NAME_MAX = 60;
// Order and default visibility of the task list columns: hidden ones can be enabled from the column chooser.
const TASK_COLUMNS = [
  ['sequence', true], ['code', true], ['link', false], ['description', true], ['urgency', true], ['status', true], ['highlight', false],
  ['effort', true], ['incident', true], ['problem', true], ['releaseDate', true], ['notes', true]
];
const TASK_COLUMN_IDS = TASK_COLUMNS.map(([columnId]) => columnId);
const defaultTaskColumns = () => TASK_COLUMNS.map(([columnId, visible]) => ({ id: columnId, visible }));
// Unknown or repeated columns are dropped and missing ones come back in their default place, so files from other versions stay usable.
function normalizeTaskColumns(columns) {
  if (!Array.isArray(columns)) return defaultTaskColumns();
  const result = [], seen = new Set();
  for (const column of columns) {
    if (!column || !TASK_COLUMN_IDS.includes(column.id) || seen.has(column.id)) continue;
    seen.add(column.id);
    result.push({ id: column.id, visible: column.visible !== false });
  }
  TASK_COLUMNS.forEach(([columnId, visible], index) => {
    if (seen.has(columnId)) return;
    const previous = TASK_COLUMN_IDS.slice(0, index).reverse().find(other => seen.has(other));
    result.splice(previous ? result.findIndex(column => column.id === previous) + 1 : 0, 0, { id: columnId, visible });
    seen.add(columnId);
  });
  if (!result.some(column => column.visible)) result.find(column => column.id === 'code').visible = true;
  return result;
}
function defaultHighlights(language = 'it') {
  const T = text => { const value = term(text, language).trim(); return value && value.length <= HIGHLIGHT_NAME_MAX ? value : text; };
  return [
    { id: 'highlight-yellow', name: T('Attenzione'), color: '#f2c94c' },
    { id: 'highlight-red', name: T('Bloccante'), color: '#f0647a' },
    { id: 'highlight-blue', name: T('Da discutere'), color: '#5aa9f6' },
    { id: 'highlight-green', name: T('Pronta'), color: '#4fcf8f' }
  ];
}
function baseData(language = 'it') {
  const T = (text, max = 60) => { const value = term(text, language).trim(); return value && value.length <= max ? value : text; };
  const statuses = [
    { id: id(), name: T('Da fare'), color: '#8190aa', highlight: false },
    { id: id(), name: T('In corso'), color: '#7c6aef', highlight: false },
    { id: id(), name: T('In verifica'), color: '#e5aa4a', highlight: true },
    { id: id(), name: T('Completato'), color: '#42b899', highlight: false }
  ];
  const urgencies = [
    { id: id(), name: T('Critica'), color: '#ec7086' },
    { id: id(), name: T('Alta'), color: '#eda36b' },
    { id: id(), name: T('Media'), color: '#9e8af7' },
    { id: id(), name: T('Bassa'), color: '#77a6c9' }
  ];
  return {
    version: 1,
    settings: {
      language, logo: '', portalUrlTemplate: '', tabNames: ['Attività', 'Issue collegate', 'Milestone', 'Kanban'].map(name => T(name)),
      hoursPerDay: 8, fontSizes: defaultFontSizes(), statuses, urgencies, highlights: defaultHighlights(language), taskColumns: defaultTaskColumns(), themeId: 'midnight',
      themes: [
        { id: 'midnight', name: 'Midnight', background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#a392ff' },
        { id: 'ocean', name: 'Oceano', background: '#0d1d25', surface: '#142c36', text: '#e3f5f5', accent: '#5bd7c3' },
        { id: 'daylight', name: 'Luce', background: '#eef0f7', surface: '#ffffff', text: '#252a42', accent: '#6953d9' }
      ]
    },
    tasks: [],
    issues: []
  };
}
const DEMO_FIRST_RELEASE = '2025-01-01';
const localIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function demoReleaseDates(now = new Date()) {
  const todayIso = localIsoDate(now), past = [];
  for (let date = DEMO_FIRST_RELEASE; date <= todayIso; date = addDays(date, 14)) past.push(date);
  return { past, next: past.length ? addDays(past[past.length - 1], 14) : DEMO_FIRST_RELEASE };
}
function demoData(language = 'it', now = new Date()) {
  const data = baseData(language), L = text => term(text, language);
  const format = (text, value) => text.replaceAll('{0}', value);
  const [todo, doing, review, done] = data.settings.statuses.map(status => status.id);
  const [critical, high, medium, low] = data.settings.urgencies.map(urgency => urgency.id);
  data.settings.portalUrlTemplate = 'https://jira.example.com/browse/{codice}';
  data.settings.themes.push({ id: 'aurora', name: 'Aurora', background: '#0e1a1f', surface: '#16262d', text: '#e6f4f1', accent: '#62d6a6' });
  let seed = 0x20250101;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(random() * list.length)];
  const areas = [
    'Dashboard operativa', 'Login e autenticazione', 'Report Finance', 'API ordini', 'Catalogo prodotti', 'Notifiche push',
    'Checkout e pagamenti', 'App mobile', 'Ricerca avanzata', 'Integrazione SAP', 'Gestione utenti', 'Portale clienti',
    'Motore promozioni', 'Magazzino', 'Fatturazione elettronica', 'Audit log', 'Single sign-on', 'Data warehouse'
  ];
  // The flag marks fixes that are always critical and linked to incidents.
  const actions = [
    ['ottimizzazione delle prestazioni'], ['correzione di un errore in produzione', true], ['nuovi filtri e ordinamenti'], ['revisione dell’interfaccia'],
    ['aggiornamento delle librerie di sicurezza', true], ['adeguamento normativo'], ['migrazione al nuovo database'], ['test end-to-end automatici'],
    ['gestione degli errori e dei retry'], ['accessibilità WCAG 2.2'], ['esportazione dei dati in Excel'], ['monitoraggio e alert'],
    ['riduzione dei tempi di caricamento'], ['supporto multilingua'], ['hotfix timeout di sessione', true], ['nuovo flusso di approvazione']
  ];
  const teams = ['Finance', 'Customer Care', 'Logistica', 'Marketing', 'Sicurezza IT', 'Vendite'];
  const displayDate = date => date.split('-').reverse().join('/');
  const { past, next } = demoReleaseDates(now);
  const hideBefore = addDays(localIsoDate(now), -56);
  const tasks = [], issues = [];
  let incident = 4810, problem = 310, sharedProblem = '';
  const numbered = (prefix, value) => `${prefix}${String(value).padStart(7, '0')}`;
  function linkIssues(code, forceMany) {
    if (!sharedProblem || random() < 0.55) sharedProblem = numbered('PRB', ++problem);
    const count = forceMany ? 2 + Math.floor(random() * 2) : random() < 0.3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      issues.push({ id: id(), code: i === 1 && random() < 0.5 ? code.toLowerCase() : code, incident: numbered('INC', ++incident), problem: random() < 0.85 ? sharedProblem : '' });
    }
    if (random() < 0.12) issues.push({ id: id(), code, incident: '', problem: numbered('PRB', ++problem) });
  }
  function addTask(releaseDate, statusId, urgencyId) {
    const n = tasks.length, area = pick(areas), action = pick(actions), team = L(pick(teams));
    const title = `${L(area)}: ${L(action[0])}`;
    const external = n % 13 === 7;
    const code = external ? numbered('CHG', 41000 + n) : `ORB-${1001 + n}`;
    const descriptions = [
      `<p>${title}</p>`,
      `<p><strong>${title}</strong></p><ul><li>${L('Analisi e stima')}</li><li>${L('Sviluppo e code review')}</li><li>${L('Rilascio in produzione')}</li></ul>`,
      `<p>${title}</p><p><em>${format(L('Richiesta del team {0}'), team)}</em></p>`,
      `<p><u>${title}</u></p><ol><li>${L('Raccolta requisiti')}</li><li>${L('Implementazione')}</li><li>${L('Collaudo con gli utenti')}</li></ol>`
    ];
    const notesByStatus = {
      [done]: [`<p>${L('Rilasciato in produzione il')} <strong>${displayDate(releaseDate || '')}</strong>.</p>`, `<ul><li>${L('Log verificati dopo il rilascio')}</li><li>${L('Service desk informato')}</li></ul>`],
      [review]: [`<p><strong>${L('Verifica in corso')}</strong>: ${L('controllare gli indicatori nelle prime 48 ore.')}</p>`],
      [doing]: [`<p><em>${L('In attesa di conferma dal business.')}</em></p>`, `<ul><li>${L('Sviluppo backend completato')}</li><li>${L('Manca la revisione grafica')}</li></ul>`],
      [todo]: [`<ol><li>${L('Definire i criteri di accettazione')}</li><li>${L('Stimare con il team')}</li></ol>`]
    };
    tasks.push({
      id: id(), code, sequence: n + 1,
      url: external ? `https://servicenow.example.com/change/${code}` : '',
      description: pick(descriptions),
      urgencyId: urgencyId || (action[1] ? critical : pick([critical, high, high, high, medium, medium, medium, medium, low, low])),
      statusId, effortHours: pick([2, 4, 6, 8, 12, 16, 20, 24, 32, 40]) + pick([0, 0, 0, 2, 4]),
      releaseDate, notes: random() < 0.45 || statusId === review ? pick(notesByStatus[statusId]) : '',
      hidden: statusId === done && Boolean(releaseDate) && releaseDate < hideBefore, highlightId: ''
    });
    if (action[1] || random() < 0.2) linkIssues(code, action[1] && random() < 0.6);
  }
  past.forEach((date, index) => {
    const latest = index === past.length - 1, count = 3 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) addTask(date, latest && i < 2 ? review : done);
  });
  [doing, doing, doing, review, todo, todo].forEach(status => addTask(next, status));
  for (let i = 0; i < 6; i++) addTask('', todo, pick([medium, low, low, high]));
  linkIssues(tasks[0].code, true);
  for (let i = 1; i <= 3; i++) issues.push({ id: id(), code: `ORB-${1000 + tasks.length + i}`, incident: numbered('INC', ++incident), problem: numbered('PRB', problem) });
  const [attention, blocker, discuss, ready] = data.settings.highlights.map(highlight => highlight.id);
  const markers = [attention, '', blocker, discuss, '', ready, '', attention];
  tasks.filter(task => task.statusId !== done).forEach((task, index) => { task.highlightId = markers[index % markers.length]; });
  tasks.filter(task => task.statusId === done && !task.hidden).slice(-3).forEach(task => { task.highlightId = ready; });
  data.tasks = tasks;
  data.issues = issues;
  return validateData(data);
}
function initialData() { return demoData('it'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const hasPortalPlaceholder = template => /\{(?:codice|code)\}|<(?:codice|code)>/i.test(template);
function normalizeUrl(value) {
  const url = String(value ?? '').trim();
  return !url || /^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}
function isWebUrl(value) {
  if (typeof value !== 'string' || value.length > 4000 || !/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch { return false; }
}
function fillPortalTemplate(template, code) {
  return template.replace(/\{(?:codice|code)\}|<(?:codice|code)>/gi, () => encodeURIComponent(String(code).trim()));
}
function validPortalTemplate(template) {
  if (template === '') return true;
  return typeof template === 'string' && template.length <= 2000 && hasPortalPlaceholder(template) && isWebUrl(fillPortalTemplate(template, 'PRJ-1'));
}
function portalUrl(task, settings) {
  if (task.url) return task.url;
  const template = settings.portalUrlTemplate || '';
  return template && String(task.code ?? '').trim() ? fillPortalTemplate(template, task.code) : '';
}
function validateData(data) {
  assert(data && data.version === 1, 'Formato archivio non supportato.');
  const s = data.settings;
  assert(s && (s.appName === undefined || (typeof s.appName === 'string' && s.appName.trim().length > 0 && s.appName.length <= 100)), 'Nome organizzazione non valido.');
  assert(Array.isArray(s.tabNames) && s.tabNames.length === 4 && s.tabNames.every(n => typeof n === 'string' && n.trim() && n.length <= 60), 'Specificare quattro nomi di tab validi.');
  assert(Number.isFinite(s.hoursPerDay) && s.hoursPerDay > 0 && s.hoursPerDay <= 24, 'Le ore per giorno devono essere comprese tra 0 e 24.');
  const uniqueIds = (items) => new Set(items.map(x => x.id)).size === items.length;
  const text = v => typeof v === 'string';
  const color = v => /^#[0-9a-f]{6}$/i.test(v);
  assert(s.language === undefined || validLanguage(s.language), 'Lingua non supportata.');
  assert(s.portalUrlTemplate === undefined || validPortalTemplate(s.portalUrlTemplate), 'Il modello del link portale deve essere un indirizzo web valido e contenere {codice}.');
  assert(s.logo === undefined || s.logo === '' || (text(s.logo) && s.logo.length <= 1500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.logo)), 'Logo non valido.');
  assert(s.fontSizes === undefined || validFontSizes(s.fontSizes), 'Dimensioni del testo non valide.');
  for (const key of ['statuses', 'urgencies']) {
    assert(Array.isArray(s[key]) && s[key].length > 0 && uniqueIds(s[key]), `Elenco ${key} non valido o vuoto.`);
    assert(s[key].every(x => text(x.id) && x.id && text(x.name) && x.name.trim() && color(x.color)), `Valori ${key} non validi.`);
  }
  assert(s.statuses.every(x => typeof x.highlight === 'boolean'), 'Evidenziazione stati non valida.');
  assert(s.highlights === undefined || (Array.isArray(s.highlights) && s.highlights.length <= HIGHLIGHT_LIMIT && s.highlights.every(x => x && text(x.id) && x.id && text(x.name) && x.name.trim() && x.name.length <= HIGHLIGHT_NAME_MAX && color(x.color)) && uniqueIds(s.highlights)), 'Evidenziatori non validi.');
  assert(s.taskColumns === undefined || (Array.isArray(s.taskColumns) && s.taskColumns.every(c => c && text(c.id) && c.id && typeof c.visible === 'boolean') && uniqueIds(s.taskColumns) && s.taskColumns.some(c => c.visible && TASK_COLUMN_IDS.includes(c.id))), 'Colonne della lista non valide.');
  assert(Array.isArray(s.themes) && s.themes.length > 0 && uniqueIds(s.themes) && s.themes.every(t => text(t.id) && t.id && text(t.name) && t.name.trim() && ['background', 'surface', 'text', 'accent'].every(k => color(t[k]))), 'Temi non validi.');
  assert(s.themes.some(t => t.id === s.themeId), 'Tema selezionato inesistente.');
  assert(Array.isArray(data.tasks) && uniqueIds(data.tasks), 'Elenco attività non valido.');
  for (const t of data.tasks) {
    assert(['id', 'code', 'url', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId'].every(k => text(t[k])) && t.id && t.code.trim(), 'Attività incompleta.');
    assert(Number.isInteger(t.sequence) && t.sequence >= 0, 'Il progressivo deve essere un intero non negativo.');
    assert(Number.isFinite(t.effortHours) && t.effortHours >= 0, 'Effort non valido.');
    assert(typeof t.hidden === 'boolean', 'Visibilità non valida.');
    assert(t.highlightId === undefined || (text(t.highlightId) && t.highlightId.length <= 200), 'Evidenziazione attività non valida.');
    assert(!t.url || /^https?:\/\/\S+$/i.test(t.url), 'Il link deve iniziare con http:// o https://.');
    assert(!t.releaseDate || (/^\d{4}-\d{2}-\d{2}$/.test(t.releaseDate) && !Number.isNaN(Date.parse(t.releaseDate)) && new Date(t.releaseDate).toISOString().slice(0, 10) === t.releaseDate), 'Data release non valida.');
    assert(s.statuses.some(x => x.id === t.statusId) && s.urgencies.some(x => x.id === t.urgencyId), 'Stato o urgenza mancanti.');
  }
  assert(Array.isArray(data.issues) && uniqueIds(data.issues), 'Elenco issue non valido.');
  assert(data.issues.every(x => ['id', 'code', 'incident', 'problem'].every(k => text(x[k])) && x.id && x.code.trim() && (x.incident.trim() || x.problem.trim())), 'Indicare codice e almeno un incident o problem.');
  return data;
}
function migrateArchive(input) {
  const archive = structuredClone(input);
  assert(archive?.format !== 'orbitkanban-organization', 'Questo file è un’esportazione di organizzazione (temi, configurazione o dati): usa “Importa da file…” nella sezione “Esporta e importa organizzazione”.');
  if (archive.version === 1) {
    validateData(archive);
    const organizationId = id();
    return validateArchive({
      version: 2, activeOrganizationId: organizationId,
      organizations: [{ id: organizationId, name: archive.settings.appName || 'Organizzazione principale', data: archive }]
    });
  }
  return validateArchive(archive);
}
function validateArchive(archive) {
  assert(archive && archive.version === 2, 'Formato archivio non supportato.');
  assert(Array.isArray(archive.organizations) && archive.organizations.length > 0, 'Deve esistere almeno un’organizzazione.');
  assert(archive.organizations.every(o => o && typeof o.id === 'string' && o.id && typeof o.name === 'string' && o.name.trim() && o.name.length <= 100), 'Organizzazione non valida.');
  assert(new Set(archive.organizations.map(o => o.id)).size === archive.organizations.length, 'Organizzazioni duplicate.');
  assert(archive.organizations.some(o => o.id === archive.activeOrganizationId), 'Organizzazione attiva inesistente.');
  for (const organization of archive.organizations) {
    validateData(organization.data);
    organization.data.settings.language ??= 'it';
    organization.data.settings.logo ??= '';
    organization.data.settings.portalUrlTemplate ??= '';
    organization.data.settings.fontSizes ??= defaultFontSizes();
    normalizeHighlights(organization.data);
    delete organization.data.settings.appName;
  }
  return archive;
}
// Archives written before highlighters existed get the default colors, the default columns and unhighlighted tasks.
function normalizeHighlights(data) {
  const settings = data.settings;
  settings.highlights ??= defaultHighlights(settings.language || 'it');
  settings.taskColumns = normalizeTaskColumns(settings.taskColumns);
  const known = new Set(settings.highlights.map(highlight => highlight.id));
  for (const task of data.tasks) if (!known.has(task.highlightId)) task.highlightId = '';
  return data;
}
function createOrganization(name, language = 'it', logo = '', palette, demo = false) {
  assert(typeof name === 'string' && name.trim() && name.trim().length <= 100, 'Nome organizzazione non valido.');
  assert(validLanguage(language), 'Lingua non supportata.');
  const data = demo ? demoData(language) : baseData(language);
  data.settings.logo = logo;
  if (logo) {
    assert(palette && ['background', 'surface', 'text', 'accent'].every(key => /^#[0-9a-f]{6}$/i.test(palette[key])), 'Temi non validi.');
    const theme = { id: 'organization-logo', name: term('Tema dal logo', language).trim().slice(0, 100) || 'Tema dal logo' };
    for (const key of ['background', 'surface', 'text', 'accent']) theme[key] = palette[key];
    data.settings.themes.push(theme);
    data.settings.themeId = theme.id;
  }
  validateData(data);
  return { id: id(), name: name.trim(), data };
}
const ORGANIZATION_FILE_FORMAT = 'orbitkanban-organization';
const ORGANIZATION_FILE_VERSION = 1;
const ORGANIZATION_FILE_KINDS = ['themes', 'settings', 'data', 'organization'];
const ORGANIZATION_FILE_PARTS = { themes: ['themes'], settings: ['settings'], data: ['data'], organization: ['themes', 'settings', 'data'] };
const RECORD_KEYS = {
  theme: ['id', 'name', 'background', 'surface', 'text', 'accent'],
  status: ['id', 'name', 'color', 'highlight'],
  urgency: ['id', 'name', 'color'],
  highlight: ['id', 'name', 'color'],
  column: ['id', 'visible'],
  task: ['id', 'code', 'sequence', 'url', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId', 'effortHours', 'hidden', 'highlightId'],
  issue: ['id', 'code', 'incident', 'problem']
};
function organizationExport(organization, kind, { appVersion = '', exportedAt = new Date().toISOString() } = {}) {
  assert(ORGANIZATION_FILE_KINDS.includes(kind), 'Tipo di esportazione non supportato.');
  const parts = ORGANIZATION_FILE_PARTS[kind], settings = organization.data.settings;
  const file = { format: ORGANIZATION_FILE_FORMAT, version: ORGANIZATION_FILE_VERSION, kind, exportedAt, appVersion, organization: { name: organization.name } };
  if (parts.includes('themes')) file.themes = { themeId: settings.themeId, themes: structuredClone(settings.themes) };
  const highlights = structuredClone(settings.highlights ?? defaultHighlights(settings.language || 'it'));
  if (parts.includes('settings')) {
    file.settings = {
      language: settings.language || 'it', logo: settings.logo || '', portalUrlTemplate: settings.portalUrlTemplate || '',
      tabNames: [...settings.tabNames], hoursPerDay: settings.hoursPerDay, fontSizes: { ...(settings.fontSizes || defaultFontSizes()) },
      statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies),
      highlights: structuredClone(highlights), taskColumns: normalizeTaskColumns(settings.taskColumns)
    };
  }
  if (parts.includes('data')) {
    file.data = { statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies), highlights: structuredClone(highlights), tasks: structuredClone(organization.data.tasks), issues: structuredClone(organization.data.issues) };
  }
  return file;
}
function organizationFileName(name, kind, language = 'it', date = today()) {
  assert(ORGANIZATION_FILE_KINDS.includes(kind), 'Tipo di esportazione non supportato.');
  const slugify = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const labels = { themes: 'temi', settings: 'configurazione', data: 'dati', organization: 'organizzazione' };
  const label = key => slugify(term(labels[key], language)) || key;
  return `${APP_NAME}-${slugify(name) || label('organization')}-${label(kind)}-${date}.json`;
}
function fileRecords(list, keys, message) {
  assert(Array.isArray(list) && list.every(item => item && typeof item === 'object' && !Array.isArray(item)), message);
  return list.map(item => Object.fromEntries(keys.filter(key => item[key] !== undefined).map(key => [key, item[key]])));
}
function parseOrganizationFile(input) {
  let file = input;
  if (typeof input === 'string') {
    try { file = JSON.parse(input.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Il file selezionato non è un file JSON valido.'); }
  }
  assert(file && typeof file === 'object' && !Array.isArray(file), 'Il file non è un’esportazione di organizzazione OrbitKanban.');
  assert(file.format !== undefined || !(Array.isArray(file.organizations) || (file.settings && Array.isArray(file.tasks))), 'Questo file è un backup completo dell’archivio: usa “Importa backup” nella sezione “Dati che viaggiano con te”.');
  assert(file.format === ORGANIZATION_FILE_FORMAT, 'Il file non è un’esportazione di organizzazione OrbitKanban.');
  assert(Number.isInteger(file.version) && file.version >= 1, 'Versione del file non supportata.');
  assert(file.version <= ORGANIZATION_FILE_VERSION, 'Il file è stato creato da una versione più recente di OrbitKanban: aggiorna l’app per importarlo.');
  assert(ORGANIZATION_FILE_KINDS.includes(file.kind), 'Tipo di esportazione non supportato.');
  const name = file.organization?.name;
  assert(name === undefined || (typeof name === 'string' && name.trim().length <= 100), 'Nome organizzazione non valido.');
  const parts = ORGANIZATION_FILE_PARTS[file.kind];
  const result = {
    format: ORGANIZATION_FILE_FORMAT, version: file.version, kind: file.kind, parts: [...parts],
    exportedAt: typeof file.exportedAt === 'string' && !Number.isNaN(Date.parse(file.exportedAt)) ? file.exportedAt : '',
    appVersion: typeof file.appVersion === 'string' && /^[\w.+-]{1,40}$/.test(file.appVersion) ? file.appVersion : '',
    organization: { name: typeof name === 'string' ? name.trim() : '' }
  };
  const missing = { themes: 'Il file non contiene i temi.', settings: 'Il file non contiene la configurazione.', data: 'Il file non contiene i dati.' };
  for (const part of parts) assert(file[part] && typeof file[part] === 'object' && !Array.isArray(file[part]), missing[part]);
  const probe = baseData('it');
  const check = (settings, content = {}) => validateData({ ...probe, settings: { ...probe.settings, ...settings }, ...content });
  if (parts.includes('themes')) {
    const themes = { themeId: file.themes.themeId, themes: fileRecords(file.themes.themes, RECORD_KEYS.theme, 'Temi non validi.') };
    check(themes);
    result.themes = themes;
  }
  if (parts.includes('settings')) {
    const source = file.settings;
    const settings = {
      language: source.language, logo: source.logo ?? '', portalUrlTemplate: source.portalUrlTemplate ?? '',
      tabNames: Array.isArray(source.tabNames) ? [...source.tabNames] : source.tabNames, hoursPerDay: source.hoursPerDay,
      statuses: fileRecords(source.statuses, RECORD_KEYS.status, 'Elenco statuses non valido o vuoto.'),
      urgencies: fileRecords(source.urgencies, RECORD_KEYS.urgency, 'Elenco urgencies non valido o vuoto.')
    };
    if (source.fontSizes !== undefined) {
      assert(source.fontSizes && typeof source.fontSizes === 'object' && !Array.isArray(source.fontSizes), 'Dimensioni del testo non valide.');
      settings.fontSizes = Object.fromEntries(FONT_SIZE_PARTS.map(({ id }) => [id, source.fontSizes[id] ?? 100]));
    }
    if (source.highlights !== undefined) settings.highlights = fileRecords(source.highlights, RECORD_KEYS.highlight, 'Evidenziatori non validi.');
    if (source.taskColumns !== undefined) {
      const columns = fileRecords(source.taskColumns, RECORD_KEYS.column, 'Colonne della lista non valide.');
      assert(columns.every(column => typeof column.id === 'string' && typeof column.visible === 'boolean'), 'Colonne della lista non valide.');
      settings.taskColumns = normalizeTaskColumns(columns);
    }
    assert(validLanguage(settings.language), 'Lingua non supportata.');
    check(settings);
    result.settings = settings;
  }
  if (parts.includes('data')) {
    const source = file.data;
    const content = {
      statuses: fileRecords(source.statuses, RECORD_KEYS.status, 'Elenco statuses non valido o vuoto.'),
      urgencies: fileRecords(source.urgencies, RECORD_KEYS.urgency, 'Elenco urgencies non valido o vuoto.'),
      tasks: fileRecords(source.tasks, RECORD_KEYS.task, 'Elenco attività non valido.'),
      issues: fileRecords(source.issues, RECORD_KEYS.issue, 'Elenco issue non valido.')
    };
    if (source.highlights !== undefined) content.highlights = fileRecords(source.highlights, RECORD_KEYS.highlight, 'Evidenziatori non validi.');
    check({ statuses: content.statuses, urgencies: content.urgencies, ...(content.highlights ? { highlights: content.highlights } : {}) }, { tasks: content.tasks, issues: content.issues });
    result.data = content;
  }
  return result;
}
function optionRemapper(source, target) {
  const key = name => name.trim().toLowerCase();
  const ids = new Set(target.map(option => option.id)), names = new Map();
  for (const option of target) if (!names.has(key(option.name))) names.set(key(option.name), option.id);
  return sourceId => {
    if (ids.has(sourceId)) return sourceId;
    const index = source.findIndex(option => option.id === sourceId);
    if (index >= 0 && names.has(key(source[index].name))) return names.get(key(source[index].name));
    return target[Math.min(Math.max(index, 0), target.length - 1)].id;
  };
}
// Highlighters match by id, then by name; when adding data, colors missing here are added so the rows keep their meaning.
function highlightRemapper(source, target, add = false) {
  const key = name => name.trim().toLowerCase();
  return sourceId => {
    if (!sourceId) return '';
    if (target.some(highlight => highlight.id === sourceId)) return sourceId;
    const original = source.find(highlight => highlight.id === sourceId);
    if (!original) return '';
    const sameName = target.find(highlight => key(highlight.name) === key(original.name));
    if (sameName) return sameName.id;
    if (!add || target.length >= HIGHLIGHT_LIMIT) return '';
    target.push(structuredClone(original));
    return original.id;
  };
}
function applyOrganizationImport(current, file, options = {}) {
  const next = structuredClone(current), settings = next.settings;
  const wanted = part => Boolean(options[part] && file[part]);
  assert(['themes', 'settings', 'data'].some(wanted), 'Seleziona almeno una parte da importare.');
  if (wanted('settings')) {
    const incoming = structuredClone(file.settings);
    const status = optionRemapper(settings.statuses, incoming.statuses), urgency = optionRemapper(settings.urgencies, incoming.urgencies);
    for (const task of next.tasks) { task.statusId = status(task.statusId); task.urgencyId = urgency(task.urgencyId); }
    for (const key of ['language', 'portalUrlTemplate', 'tabNames', 'hoursPerDay', 'statuses', 'urgencies']) settings[key] = incoming[key];
    if (incoming.fontSizes) settings.fontSizes = incoming.fontSizes;
    if (incoming.highlights) {
      const highlight = highlightRemapper(settings.highlights || [], incoming.highlights);
      for (const task of next.tasks) task.highlightId = highlight(task.highlightId);
      settings.highlights = incoming.highlights;
    }
    if (incoming.taskColumns) settings.taskColumns = incoming.taskColumns;
    if (options.logo) settings.logo = incoming.logo;
  }
  if (wanted('themes')) {
    for (const theme of structuredClone(file.themes.themes)) {
      const index = settings.themes.findIndex(existing => existing.id === theme.id);
      if (index >= 0) settings.themes[index] = theme; else settings.themes.push(theme);
    }
    if (options.activateTheme) settings.themeId = file.themes.themeId;
  }
  if (wanted('data')) {
    const status = optionRemapper(file.data.statuses, settings.statuses), urgency = optionRemapper(file.data.urgencies, settings.urgencies);
    settings.highlights ??= defaultHighlights(settings.language || 'it');
    const highlight = highlightRemapper(file.data.highlights || [], settings.highlights, true);
    // Files from versions without highlighters do not erase the highlight of the tasks they update.
    const existing = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.highlightId]));
    const tasks = structuredClone(file.data.tasks).map(task => ({
      ...task, statusId: status(task.statusId), urgencyId: urgency(task.urgencyId),
      highlightId: task.highlightId === undefined ? existing.get(task.id) || '' : highlight(task.highlightId)
    }));
    const issues = structuredClone(file.data.issues);
    if (options.dataMode === 'replace') { next.tasks = tasks; next.issues = issues; }
    else {
      const triple = issue => [issue.code, issue.incident, issue.problem].map(value => value.trim().toUpperCase()).join('\u0000');
      for (const task of tasks) {
        const index = next.tasks.findIndex(existing => existing.id === task.id);
        if (index >= 0) next.tasks[index] = task; else next.tasks.push(task);
      }
      for (const issue of issues) {
        const index = next.issues.findIndex(existing => existing.id === issue.id);
        if (index >= 0) next.issues[index] = issue;
        else if (!next.issues.some(existing => triple(existing) === triple(issue))) next.issues.push(issue);
      }
    }
  }
  return validateData(next);
}
function importedOrganizationData(file, options = {}, fallbackLanguage = 'it') {
  const withSettings = Boolean(options.settings && file.settings);
  const base = baseData(withSettings ? file.settings.language : validLanguage(fallbackLanguage) ? fallbackLanguage : 'it');
  if (options.data && file.data && !withSettings) {
    base.settings.statuses = structuredClone(file.data.statuses);
    base.settings.urgencies = structuredClone(file.data.urgencies);
    if (file.data.highlights) base.settings.highlights = structuredClone(file.data.highlights);
  }
  return applyOrganizationImport(base, file, { ...options, logo: true, dataMode: 'replace' });
}
function uniqueOrganizationName(name, existingNames, fallback = 'Organizzazione importata') {
  const base = String(name ?? '').trim().slice(0, 100).trim() || fallback;
  const taken = new Set(existingNames.map(existing => existing.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let counter = 2; ; counter++) {
    const suffix = ` (${counter})`, candidate = base.slice(0, 100 - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
function matchIssues(task, issues) {
  const matches = issues.filter(x => x.code.trim().toUpperCase() === task.code.trim().toUpperCase());
  return {
    incidents: [...new Set(matches.map(x => x.incident.trim()).filter(Boolean))],
    problems: [...new Set(matches.map(x => x.problem.trim()).filter(Boolean))]
  };
}
function sortTasks(tasks, sort = [{ key: 'releaseDate', direction: 'asc' }]) {
  return [...tasks].sort((a, b) => {
    for (const { key, direction } of sort) {
      const av = a[key], bv = b[key];
      if (av === bv) continue;
      if (av === '') return 1;
      if (bv === '') return -1;
      const result = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'it', { numeric: true });
      if (result) return direction === 'desc' ? -result : result;
    }
    return a.sequence - b.sequence;
  });
}
function dateColor(date) {
  let hash = 0;
  for (const c of date) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 65% 68%)`;
}
function extractThemePalette(pixels) {
  assert(pixels && pixels.length > 0 && pixels.length % 4 === 0, 'Immagine priva di pixel validi.');
  const bins = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    const rgb = [0, 1, 2].map(channel => Math.round(pixels[i + channel] * alpha + 255 * (1 - alpha)));
    const key = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
    if (!bins.has(key)) bins.set(key, { sum: [0, 0, 0], count: 0 });
    const bin = bins.get(key);
    bin.count++;
    rgb.forEach((value, channel) => { bin.sum[channel] += value; });
  }
  const samples = [...bins.values()].map(bin => ({ rgb: bin.sum.map(value => value / bin.count), count: bin.count }))
    .sort((a, b) => b.count - a.count);
  const distance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  let centers = [samples[0].rgb];
  while (centers.length < Math.min(4, samples.length)) {
    const next = samples.reduce((best, sample) => {
      const score = Math.min(...centers.map(center => distance(sample.rgb, center))) * Math.sqrt(sample.count);
      return score > best.score ? { rgb: sample.rgb, score } : best;
    }, { rgb: null, score: 0 });
    if (!next.rgb) break;
    centers.push(next.rgb);
  }
  for (let iteration = 0; iteration < 10; iteration++) {
    const clusters = centers.map(() => ({ sum: [0, 0, 0], count: 0 }));
    for (const sample of samples) {
      let nearest = 0;
      centers.forEach((center, i) => {
        if (distance(sample.rgb, center) < distance(sample.rgb, centers[nearest])) nearest = i;
      });
      clusters[nearest].count += sample.count;
      sample.rgb.forEach((value, i) => { clusters[nearest].sum[i] += value * sample.count; });
    }
    const next = clusters.filter(cluster => cluster.count).map(cluster => cluster.sum.map(value => value / cluster.count));
    const stable = next.length === centers.length && next.every((center, i) => distance(center, centers[i]) < 1);
    centers = next;
    if (stable) break;
  }
  const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  centers.sort((a, b) => luminance(a) - luminance(b));
  const background = centers[0], text = centers[centers.length - 1];
  const middle = centers.slice(1, -1);
  const chroma = rgb => Math.max(...rgb) - Math.min(...rgb);
  const accent = middle.length ? [...middle].sort((a, b) => chroma(b) - chroma(a))[0] : text;
  const surface = middle.find(color => color !== accent) || background;
  const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
  return { background: hex(background), surface: hex(surface), text: hex(text), accent: hex(accent), colorCount: centers.length };
}
function themeFromLogo(pixels) {
  const palette = extractThemePalette(pixels);
  const rgb = color => color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16));
  const hex = channels => '#' + channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
  const luminance = color => rgb(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const foreground = contrast(palette.background, '#ffffff') > contrast(palette.background, '#000000') ? '#ffffff' : '#000000';
  if (contrast(palette.text, palette.background) < 4.5 || contrast(palette.text, palette.surface) < 4.5) palette.text = foreground;
  const mix = (a, b, weight) => hex(rgb(a).map((channel, i) => channel * (1 - weight) + rgb(b)[i] * weight));
  if (contrast(palette.text, palette.surface) < 4.5 || contrast(palette.background, palette.surface) < 1.1) palette.surface = mix(palette.background, palette.text, 0.08);
  if (contrast(palette.text, palette.surface) < 4.5) palette.surface = mix(palette.background, palette.text === '#ffffff' ? '#000000' : '#ffffff', 0.08);
  if (contrast(palette.accent, palette.background) < 3 || contrast(palette.accent, palette.surface) < 3) {
    for (let weight = 0.1; weight <= 1.01; weight += 0.1) {
      const accent = mix(palette.accent, palette.text, weight);
      if (contrast(accent, palette.background) >= 3 && contrast(accent, palette.surface) >= 3) { palette.accent = accent; break; }
    }
  }
  return palette;
}
const core = {
  APP_NAME, initialData, baseData, demoData, demoReleaseDates, validateData, migrateArchive, validateArchive, createOrganization, matchIssues, sortTasks, dateColor, today, validLanguage,
  extractThemePalette, themeFromLogo, normalizeUrl, isWebUrl, validPortalTemplate, portalUrl,
  ORGANIZATION_FILE_KINDS, organizationExport, organizationFileName, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName,
  FONT_SIZE_PARTS, FONT_SIZE_STEP, defaultFontSizes, clampFontSize,
  HIGHLIGHT_LIMIT, defaultHighlights, TASK_COLUMN_IDS, defaultTaskColumns, normalizeTaskColumns
};
if (typeof module !== 'undefined') module.exports = core;
else window.OrbitaCore = core;
})();
