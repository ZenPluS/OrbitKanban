'use strict';
(() => {
const id = () => globalThis.crypto.randomUUID();
const APP_NAME = 'OrbitKanban';
const today = () => new Date().toLocaleDateString('en-CA');
const i18n = typeof module !== 'undefined' ? require('./i18n') : null;
const columns = typeof module !== 'undefined' ? require('./columns') : globalThis.OrbitaColumns;
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
const FONT_FAMILIES = [
  { id: 'segoe', name: 'Segoe UI', css: '"Segoe UI", sans-serif' },
  { id: 'aptos', name: 'Aptos', css: 'Aptos, "Segoe UI", sans-serif' },
  { id: 'arial', name: 'Arial', css: 'Arial, sans-serif' },
  { id: 'calibri', name: 'Calibri', css: 'Calibri, "Segoe UI", sans-serif' },
  { id: 'verdana', name: 'Verdana', css: 'Verdana, sans-serif' },
  { id: 'tahoma', name: 'Tahoma', css: 'Tahoma, sans-serif' },
  { id: 'trebuchet', name: 'Trebuchet MS', css: '"Trebuchet MS", sans-serif' },
  { id: 'georgia', name: 'Georgia', css: 'Georgia, serif' },
  { id: 'consolas', name: 'Consolas', css: 'Consolas, monospace' },
  ...[
    ['roboto', 'Roboto'], ['inter', 'Inter'], ['opensans', 'Open Sans'], ['lato', 'Lato'],
    ['montserrat', 'Montserrat'], ['poppins', 'Poppins'], ['nunito', 'Nunito'], ['nunitosans', 'Nunito Sans'],
    ['raleway', 'Raleway'], ['rubik', 'Rubik'], ['worksans', 'Work Sans'], ['sourcesans3', 'Source Sans 3'],
    ['notosans', 'Noto Sans'], ['dmsans', 'DM Sans'], ['manrope', 'Manrope'], ['firasans', 'Fira Sans'],
    ['notoserif', 'Noto Serif', 'serif'], ['merriweather', 'Merriweather', 'serif'], ['lora', 'Lora', 'serif'],
    ['playfairdisplay', 'Playfair Display', 'serif'], ['sourceserif4', 'Source Serif 4', 'serif'],
    ['robotoslab', 'Roboto Slab', 'serif'], ['firacode', 'Fira Code', 'monospace'], ['jetbrainsmono', 'JetBrains Mono', 'monospace']
  ].map(([id, name, fallback = 'sans-serif']) => ({ id, name, css: `${name.includes(' ') ? `"${name}"` : name}, ${fallback}`, bundled: true }))
];
const DEFAULT_FONT_FAMILY = 'segoe';
const validFontFamily = value => FONT_FAMILIES.some(font => font.id === value);
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
const TAG_LIMIT = 100;
const TAG_NAME_MAX = 60;
// Order and default visibility of the task list columns: hidden ones can be enabled from the column chooser.
const TASK_COLUMNS = [
  ['sequence', true], ['code', true], ['link', false], ['description', true], ['urgency', true], ['status', true], ['highlight', false],
  ['tags', true], ['effort', true], ['incident', true], ['problem', true], ['releaseDate', true], ['notes', true]
];
const TASK_COLUMN_IDS = TASK_COLUMNS.map(([columnId]) => columnId);
const SAVED_VIEW_LIMIT = 30;
const SAVED_VIEW_NAME_MAX = 60;
const SAVED_VIEW_SORT_KEYS = ['sequence', 'code', 'urgencyId', 'statusId', 'highlightId', 'effortHours', 'releaseDate'];
const defaultTaskColumns = (fields = []) => [...TASK_COLUMNS.map(([columnId, visible]) => ({ id: columnId, visible })), ...fields.map(field => ({ id: field.id, visible: true }))];
// Unknown or repeated columns are dropped and missing ones come back in their default place, so files from other versions stay usable.
function normalizeTaskColumns(input, fields = []) {
  return columns.normalizeColumns(input, defaultTaskColumns(), fields);
}
function defaultHighlights(language = 'it') {
  const T = text => { const value = term(text, language).trim(); return value && value.length <= HIGHLIGHT_NAME_MAX ? value : text; };
  return [
    { id: 'highlight-yellow', name: T("Attention"), color: '#f2c94c' },
    { id: 'highlight-red', name: T("Blocker"), color: '#f0647a' },
    { id: 'highlight-blue', name: T("To discuss"), color: '#5aa9f6' },
    { id: 'highlight-green', name: T("Ready"), color: '#4fcf8f' }
  ];
}
function defaultThemes() {
  return [
    { id: 'midnight', name: 'Midnight', background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#b39cff' },
    { id: 'ocean', name: 'Ocean', background: '#082032', surface: '#103b50', text: '#e8f1f5', accent: '#00b4d8' },
    { id: 'daylight', name: 'Daylight', background: '#eef0f7', surface: '#ffffff', text: '#252a42', accent: '#6953d9' },
    { id: 'aurora', name: 'Aurora', background: '#0e1a1f', surface: '#16262d', text: '#e6f4f1', accent: '#62d6a6' },
    { id: 'monokai', name: 'Monokai', background: '#272822', surface: '#3e3d32', text: '#f8f8f2', accent: '#ff8ab4' },
    { id: 'dracula', name: 'Dracula', background: '#282a36', surface: '#343746', text: '#f8f8f2', accent: '#bd93f9' },
    { id: 'nord', name: 'Nord', background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' },
    { id: 'solarized-dark', name: 'Solarized Dark', background: '#002b36', surface: '#073642', text: '#eee8d5', accent: '#2aa8e8' },
    { id: 'solarized-light', name: 'Solarized Light', background: '#fdf6e3', surface: '#eee8d5', text: '#073642', accent: '#006b9f' },
    { id: 'gruvbox-dark', name: 'Gruvbox Dark', background: '#282828', surface: '#3c3836', text: '#ebdbb2', accent: '#fabd2f' },
    { id: 'gruvbox-light', name: 'Gruvbox Light', background: '#fbf1c7', surface: '#ebdbb2', text: '#3c3836', accent: '#8b4f00' },
    { id: 'tokyo-night', name: 'Tokyo Night', background: '#1a1b26', surface: '#24283b', text: '#c0caf5', accent: '#7aa2f7' },
    { id: 'one-dark', name: 'One Dark', background: '#282c34', surface: '#353b45', text: '#abb2bf', accent: '#61afef' },
    { id: 'material-ocean', name: 'Material Ocean', background: '#0f111a', surface: '#1b1e2b', text: '#d0d0d0', accent: '#82aaff' },
    { id: 'github-light', name: 'GitHub Light', background: '#ffffff', surface: '#f6f8fa', text: '#24292f', accent: '#0969da' },
    { id: 'github-dark', name: 'GitHub Dark', background: '#0d1117', surface: '#161b22', text: '#e6edf3', accent: '#2f81f7' },
    { id: 'synthwave', name: 'Synthwave', background: '#241b2f', surface: '#342542', text: '#f8e9ff', accent: '#ff7edb' },
    { id: 'ayu-dark', name: 'Ayu Dark', background: '#0b0e14', surface: '#11151c', text: '#bfbdb6', accent: '#e6b450' },
    { id: 'everforest', name: 'Everforest', background: '#2d353b', surface: '#343f44', text: '#d3c6aa', accent: '#a7c080' },
    { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', background: '#1e1e2e', surface: '#313244', text: '#cdd6f4', accent: '#cba6f7' },
    { id: 'rose-pine', name: 'Rosé Pine', background: '#191724', surface: '#26233a', text: '#e0def4', accent: '#ebbcba' },
    { id: 'forest', name: 'Forest', background: '#14251c', surface: '#20382b', text: '#e6f0e8', accent: '#7fb069' },
    { id: 'paper', name: 'Paper', background: '#f3f1eb', surface: '#ffffff', text: '#30352f', accent: '#40624a' },
    { id: 'pearl', name: 'Pearl', background: '#f0f2f5', surface: '#ffffff', text: '#293444', accent: '#425a9e' },
    { id: 'sandstone', name: 'Sandstone', background: '#f5ebdf', surface: '#fff9f1', text: '#49382b', accent: '#99502d' },
    { id: 'mist', name: 'Mist', background: '#e8f0f2', surface: '#f8fcfd', text: '#253e48', accent: '#206879' },
    { id: 'sage-light', name: 'Sage Light', background: '#eaf0e5', surface: '#f8fcf5', text: '#30402d', accent: '#4d702f' },
    { id: 'lavender-light', name: 'Lavender Light', background: '#eeeaf7', surface: '#faf8ff', text: '#3d3455', accent: '#7450a2' },
    { id: 'rose-quartz', name: 'Rose Quartz', background: '#f7e9ec', surface: '#fff7f9', text: '#51343f', accent: '#a23b66' },
    { id: 'iceberg', name: 'Iceberg', background: '#e8f0fa', surface: '#f7fbff', text: '#273a53', accent: '#2762a6' },
    { id: 'mint', name: 'Mint', background: '#e5f2ee', surface: '#f6fffb', text: '#23463c', accent: '#16765c' },
    { id: 'graphite', name: 'Graphite', background: '#1d2024', surface: '#292e34', text: '#e4e8ed', accent: '#afc4d9' },
    { id: 'obsidian', name: 'Obsidian', background: '#121214', surface: '#222226', text: '#eeeef2', accent: '#dfba73' },
    { id: 'deep-space', name: 'Deep Space', background: '#0d1528', surface: '#192640', text: '#e2ecff', accent: '#8ab8ff' },
    { id: 'blue-hour', name: 'Blue Hour', background: '#20243a', surface: '#303750', text: '#e2e6fa', accent: '#a8a0ff' },
    { id: 'copper', name: 'Copper', background: '#241c19', surface: '#352a25', text: '#f3e5dc', accent: '#eba578' },
    { id: 'plum', name: 'Plum', background: '#261b2e', surface: '#392940', text: '#f1e2f5', accent: '#dba0eb' },
    { id: 'burgundy', name: 'Burgundy', background: '#291a21', surface: '#3c2732', text: '#f6e5eb', accent: '#f299b7' },
    { id: 'desert-night', name: 'Desert Night', background: '#28251e', surface: '#39352b', text: '#f3ecd8', accent: '#dfc17a' },
    { id: 'emerald', name: 'Emerald', background: '#10251f', surface: '#1c3830', text: '#e0f4ec', accent: '#60d5ac' }
  ];
}
// Built-in themes renamed when the source moved to English: saved copies keep their colors and only lose the old default name.
const LEGACY_THEME_NAMES = { daylight: 'Luce' };
function modernThemeName(theme) {
  return LEGACY_THEME_NAMES[theme.id] === theme.name ? defaultThemes().find(preset => preset.id === theme.id).name : theme.name;
}
function normalizeThemes(settings) {
  for (const theme of settings.themes) theme.name = modernThemeName(theme);
  // Append new presets without replacing saved palettes, their order or the active theme.
  const known = new Set(settings.themes.map(theme => theme.id));
  settings.themes.push(...defaultThemes().filter(theme => !known.has(theme.id)));
}
function baseData(language = 'it') {
  const T = (text, max = 60) => { const value = term(text, language).trim(); return value && value.length <= max ? value : text; };
  const statuses = [
    { id: id(), name: T("To do"), color: '#8190aa', highlight: false },
    { id: id(), name: T("In progress"), color: '#7c6aef', highlight: false },
    { id: id(), name: T("In review"), color: '#e5aa4a', highlight: true },
    { id: id(), name: T("Done"), color: '#42b899', highlight: false }
  ];
  const urgencies = [
    { id: id(), name: T("Critical"), color: '#ec7086' },
    { id: id(), name: T("High"), color: '#eda36b' },
    { id: id(), name: T("Medium"), color: '#9e8af7' },
    { id: id(), name: T("Low"), color: '#77a6c9' }
  ];
  return {
    version: 1,
    settings: {
      language, logo: '', portalUrlTemplate: '', tabNames: ["Tasks", "Linked issues", "Milestones", 'Kanban'].map(name => T(name)),
      hoursPerDay: 8, fontSizes: defaultFontSizes(), fontFamily: DEFAULT_FONT_FAMILY, statuses, urgencies, highlights: defaultHighlights(language), tags: [], taskColumns: defaultTaskColumns(), themeId: 'midnight',
      themes: defaultThemes(), savedViews: [], taskFields: [], issueFields: [], issueColumns: columns.normalizeIssueColumns()
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
  data.settings.portalUrlTemplate = "https://jira.example.com/browse/{code}";
  data.settings.tags = [
    { id: 'tag-frontend', name: 'Frontend', color: '#5aa9f6' },
    { id: 'tag-backend', name: 'Backend', color: '#b18cff' },
    { id: 'tag-bug', name: 'Bug', color: '#f0647a' },
    { id: 'tag-security', name: 'Security', color: '#f2c94c' }
  ];
  let seed = 0x20250101;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(random() * list.length)];
  const areas = [
    "Operations dashboard", "Login and authentication", "Finance report", "Orders API", "Product catalog", "Push notifications",
    "Checkout and payments", "Mobile app", "Advanced search", "SAP integration", "User management", "Customer portal",
    "Promotion engine", "Warehouse", "E-invoicing", 'Audit log', 'Single sign-on', 'Data warehouse'
  ];
  // The flag marks fixes that are always critical and linked to incidents.
  const actions = [
    ["performance optimization"], ["production bug fix", true], ["new filters and sorting"], ["interface redesign"],
    ["security library upgrade", true], ["regulatory compliance update"], ["migration to the new database"], ["automated end-to-end tests"],
    ["error handling and retries"], ["WCAG 2.2 accessibility"], ["Excel data export"], ["monitoring and alerting"],
    ["faster load times"], ["multi-language support"], ["session timeout hotfix", true], ["new approval workflow"]
  ];
  const teams = ['Finance', 'Customer Care', "Logistics", 'Marketing', "IT Security", "Sales"];
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
      `<p><strong>${title}</strong></p><ul><li>${L("Analysis and estimate")}</li><li>${L("Development and code review")}</li><li>${L("Production release")}</li></ul>`,
      `<p>${title}</p><p><em>${format(L("Requested by the {0} team"), team)}</em></p>`,
      `<p><u>${title}</u></p><ol><li>${L("Requirements gathering")}</li><li>${L("Implementation")}</li><li>${L("User acceptance testing")}</li></ol>`
    ];
    const notesByStatus = {
      [done]: [`<p>${L("Released to production on")} <strong>${displayDate(releaseDate || '')}</strong>.</p>`, `<ul><li>${L("Logs checked after release")}</li><li>${L("Service desk notified")}</li></ul>`],
      [review]: [`<p><strong>${L("Verification in progress")}</strong>: ${L("check the metrics during the first 48 hours.")}</p>`],
      [doing]: [`<p><em>${L("Waiting for business sign-off.")}</em></p>`, `<ul><li>${L("Backend development completed")}</li><li>${L("Design review pending")}</li></ul>`],
      [todo]: [`<ol><li>${L("Define acceptance criteria")}</li><li>${L("Estimate with the team")}</li></ol>`]
    };
    tasks.push({
      id: id(), code, sequence: n + 1,
      url: external ? `https://servicenow.example.com/change/${code}` : '',
      description: pick(descriptions),
      urgencyId: urgencyId || (action[1] ? critical : pick([critical, high, high, high, medium, medium, medium, medium, low, low])),
      statusId, effortHours: pick([2, 4, 6, 8, 12, 16, 20, 24, 32, 40]) + pick([0, 0, 0, 2, 4]),
      releaseDate, notes: random() < 0.45 || statusId === review ? pick(notesByStatus[statusId]) : '',
      hidden: statusId === done && Boolean(releaseDate) && releaseDate < hideBefore, highlightId: '',
      tagIds: n % 5 === 0 ? [] : [n % 2 ? 'tag-frontend' : 'tag-backend', ...(action[1] ? ['tag-bug', 'tag-security'] : [])]
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
// Templates saved before the source moved to English use the Italian placeholder {codice} (or <codice>), so both spellings stay valid.
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
  assert(data && data.version === 1, "Unsupported archive format.");
  const s = data.settings;
  assert(s && (s.appName === undefined || (typeof s.appName === 'string' && s.appName.trim().length > 0 && s.appName.length <= 100)), "Invalid organization name.");
  assert(Array.isArray(s.tabNames) && s.tabNames.length === 4 && s.tabNames.every(n => typeof n === 'string' && n.trim() && n.length <= 60), "Specify four valid tab names.");
  assert(Number.isFinite(s.hoursPerDay) && s.hoursPerDay > 0 && s.hoursPerDay <= 24, "Hours per day must be greater than 0 and no more than 24.");
  const uniqueIds = (items) => new Set(items.map(x => x.id)).size === items.length;
  const text = v => typeof v === 'string';
  const color = v => /^#[0-9a-f]{6}$/i.test(v);
  assert(s.language === undefined || validLanguage(s.language), "Unsupported language.");
  assert(s.portalUrlTemplate === undefined || validPortalTemplate(s.portalUrlTemplate), "The portal link template must be a valid web address containing {code}.");
  assert(s.logo === undefined || s.logo === '' || (text(s.logo) && s.logo.length <= 1500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.logo)), "Invalid logo.");
  assert(s.fontSizes === undefined || validFontSizes(s.fontSizes), "Invalid text sizes.");
  assert(s.fontFamily === undefined || validFontFamily(s.fontFamily), "Invalid font.");
  for (const key of ['statuses', 'urgencies']) {
    assert(Array.isArray(s[key]) && s[key].length > 0 && uniqueIds(s[key]), `The ${key} list is invalid or empty.`);
    assert(s[key].every(x => text(x.id) && x.id && text(x.name) && x.name.trim() && color(x.color)), `Invalid ${key} values.`);
  }
  assert(s.statuses.every(x => typeof x.highlight === 'boolean'), "Invalid status highlighting.");
  assert(s.highlights === undefined || (Array.isArray(s.highlights) && s.highlights.length <= HIGHLIGHT_LIMIT && s.highlights.every(x => x && text(x.id) && x.id && text(x.name) && x.name.trim() && x.name.length <= HIGHLIGHT_NAME_MAX && color(x.color)) && uniqueIds(s.highlights)), "Invalid highlighters.");
  assert(s.tags === undefined || (Array.isArray(s.tags) && s.tags.length <= TAG_LIMIT && s.tags.every(x => x && text(x.id) && x.id && x.id.length <= 200 && text(x.name) && x.name.trim() && x.name.length <= TAG_NAME_MAX && color(x.color)) && uniqueIds(s.tags)), "Invalid tags.");
  assert(s.tags === undefined || new Set(s.tags.map(tag => tag.name.trim().toLowerCase())).size === s.tags.length, "Tag names must be unique.");
  columns.validateFields(columns.fieldsOf(s, 'tasks'));
  columns.validateFields(columns.fieldsOf(s, 'issues'));
  const taskColumnIds = [...TASK_COLUMN_IDS, ...(s.taskFields || []).map(field => field.id)];
  const filterTypes = { sequence: 'number', effort: 'effort', releaseDate: 'date', ...Object.fromEntries((s.taskFields || []).map(field => [field.id, field.type])) };
  const sortKeys = [...SAVED_VIEW_SORT_KEYS, ...(s.taskFields || []).filter(field => !['text', 'richtext', 'url', 'multiselect'].includes(field.type)).map(field => field.id)];
  assert(s.taskColumns === undefined || (Array.isArray(s.taskColumns) && s.taskColumns.every(c => c && text(c.id) && c.id && typeof c.visible === 'boolean') && uniqueIds(s.taskColumns) && s.taskColumns.some(c => c.visible && taskColumnIds.includes(c.id))), "Invalid list columns.");
  assert(s.issueColumns === undefined || (Array.isArray(s.issueColumns) && s.issueColumns.every(c => c && text(c.id) && typeof c.visible === 'boolean') && uniqueIds(s.issueColumns) && s.issueColumns.some(c => c.visible)), "Invalid list columns.");
  assert(s.savedViews === undefined || (Array.isArray(s.savedViews) && s.savedViews.length <= SAVED_VIEW_LIMIT && s.savedViews.every(view =>
    view && text(view.id) && view.id && view.id.length <= 200 && text(view.name) && view.name.trim() && view.name.length <= SAVED_VIEW_NAME_MAX &&
    text(view.search) && view.search.length <= 200 && text(view.statusFilter) && view.statusFilter.length <= 200 &&
    text(view.highlightFilter) && view.highlightFilter.length <= 200 && typeof view.showHidden === 'boolean' &&
    typeof view.duplicatesOnly === 'boolean' && Array.isArray(view.sort) && view.sort.length > 0 && view.sort.length <= sortKeys.length &&
    view.sort.every(item => item && sortKeys.includes(item.key) && ['asc', 'desc'].includes(item.direction)) &&
    new Set(view.sort.map(item => item.key)).size === view.sort.length && Array.isArray(view.columns) &&
    view.columns.length > 0 && view.columns.every(column => column && taskColumnIds.includes(column.id) && typeof column.visible === 'boolean') &&
    uniqueIds(view.columns) && view.columns.some(column => column.visible) && columns.validFilters(view.columnFilters, taskColumnIds, filterTypes)
  ) && uniqueIds(s.savedViews) && new Set(s.savedViews.map(view => view.name.trim().toLocaleLowerCase())).size === s.savedViews.length), "Invalid saved views.");
  assert(Array.isArray(s.themes) && s.themes.length > 0 && uniqueIds(s.themes) && s.themes.every(t => text(t.id) && t.id && text(t.name) && t.name.trim() && ['background', 'surface', 'text', 'accent'].every(k => color(t[k]))), "Invalid themes.");
  assert(s.themes.some(t => t.id === s.themeId), "Selected theme does not exist.");
  assert(Array.isArray(data.tasks) && uniqueIds(data.tasks), "Invalid task list.");
  for (const t of data.tasks) {
    assert(['id', 'code', 'url', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId'].every(k => text(t[k])) && t.id && t.code.trim(), "Incomplete task.");
    assert(Number.isInteger(t.sequence) && t.sequence >= 0, "Sequence must be a non-negative integer.");
    assert(Number.isFinite(t.effortHours) && t.effortHours >= 0, "Invalid effort.");
    assert(typeof t.hidden === 'boolean', "Invalid visibility.");
    assert(t.highlightId === undefined || (text(t.highlightId) && t.highlightId.length <= 200), "Invalid task highlight.");
    assert(t.tagIds === undefined || (Array.isArray(t.tagIds) && t.tagIds.length <= TAG_LIMIT && t.tagIds.every(tagId => text(tagId) && tagId && tagId.length <= 200) && new Set(t.tagIds).size === t.tagIds.length), "Invalid task tags.");
    assert(!t.url || /^https?:\/\/\S+$/i.test(t.url), "The link must start with http:// or https://.");
    assert(!t.releaseDate || (/^\d{4}-\d{2}-\d{2}$/.test(t.releaseDate) && !Number.isNaN(Date.parse(t.releaseDate)) && new Date(t.releaseDate).toISOString().slice(0, 10) === t.releaseDate), "Invalid release date.");
    assert(s.statuses.some(x => x.id === t.statusId) && s.urgencies.some(x => x.id === t.urgencyId), "Missing status or urgency.");
  }
  assert(Array.isArray(data.issues) && uniqueIds(data.issues), "Invalid issue list.");
  assert(data.issues.every(x => ['id', 'code', 'incident', 'problem'].every(k => text(x[k])) && x.id && x.code.trim() && (x.incident.trim() || x.problem.trim())), "Enter a portal code and at least one incident or problem.");
  columns.validateCustomData(data);
  return data;
}
function migrateArchive(input) {
  const archive = structuredClone(input);
  assert(archive?.format !== 'orbitkanban-organization', "This file is an organization export (themes, settings or data): use “Import from file…” in the “Export and import organization” section.");
  if (archive.version === 1) {
    validateData(archive);
    const organizationId = id();
    return validateArchive({
      version: 2, activeOrganizationId: organizationId,
      organizations: [{ id: organizationId, name: archive.settings.appName || term("Main organization", archive.settings.language ?? 'it'), data: archive }]
    });
  }
  return validateArchive(archive);
}
function validateArchive(archive) {
  assert(archive && archive.version === 2, "Unsupported archive format.");
  assert(Array.isArray(archive.organizations) && archive.organizations.length > 0, "At least one organization must exist.");
  assert(archive.organizations.every(o => o && typeof o.id === 'string' && o.id && typeof o.name === 'string' && o.name.trim() && o.name.length <= 100), "Invalid organization.");
  assert(new Set(archive.organizations.map(o => o.id)).size === archive.organizations.length, "Duplicate organizations.");
  assert(archive.organizations.some(o => o.id === archive.activeOrganizationId), "The active organization does not exist.");
  for (const organization of archive.organizations) {
    validateData(organization.data);
    organization.data.settings.language ??= 'it';
    organization.data.settings.logo ??= '';
    organization.data.settings.portalUrlTemplate ??= '';
    organization.data.settings.fontSizes ??= defaultFontSizes();
    organization.data.settings.fontFamily ??= DEFAULT_FONT_FAMILY;
    organization.data.settings.savedViews ??= [];
    organization.data.settings.taskFields ??= [];
    organization.data.settings.issueFields ??= [];
    for (const kind of ['tasks', 'issues']) for (const field of columns.fieldsOf(organization.data.settings, kind)) field.options = columns.choices(field);
    organization.data.settings.issueColumns = columns.normalizeIssueColumns(organization.data.settings.issueColumns, organization.data.settings.issueFields);
    normalizeThemes(organization.data.settings);
    normalizeHighlights(organization.data);
    normalizeTags(organization.data);
    delete organization.data.settings.appName;
  }
  return archive;
}
// Archives written before highlighters existed get the default colors, the default columns and unhighlighted tasks.
function normalizeHighlights(data) {
  const settings = data.settings;
  settings.highlights ??= defaultHighlights(settings.language || 'it');
  settings.taskColumns = normalizeTaskColumns(settings.taskColumns, settings.taskFields);
  const known = new Set(settings.highlights.map(highlight => highlight.id));
  for (const task of data.tasks) if (!known.has(task.highlightId)) task.highlightId = '';
  return data;
}
function normalizeTags(data) {
  data.settings.tags ??= [];
  const known = new Set(data.settings.tags.map(tag => tag.id));
  for (const task of data.tasks) task.tagIds = (task.tagIds || []).filter(tagId => known.has(tagId));
  return data;
}
function createOrganization(name, language = 'it', logo = '', palette, demo = false) {
  assert(typeof name === 'string' && name.trim() && name.trim().length <= 100, "Invalid organization name.");
  assert(validLanguage(language), "Unsupported language.");
  const data = demo ? demoData(language) : baseData(language);
  data.settings.logo = logo;
  if (logo) {
    assert(palette && ['background', 'surface', 'text', 'accent'].every(key => /^#[0-9a-f]{6}$/i.test(palette[key])), "Invalid themes.");
    const theme = { id: 'organization-logo', name: term("Theme from logo", language).trim().slice(0, 100) || "Theme from logo" };
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
  task: ['id', 'code', 'sequence', 'url', 'description', 'notes', 'releaseDate', 'statusId', 'urgencyId', 'effortHours', 'hidden', 'highlightId', 'tagIds', 'customFields'],
  issue: ['id', 'code', 'incident', 'problem', 'customFields']
};
function organizationExport(organization, kind, { appVersion = '', exportedAt = new Date().toISOString() } = {}) {
  assert(ORGANIZATION_FILE_KINDS.includes(kind), "Unsupported export type.");
  const parts = ORGANIZATION_FILE_PARTS[kind], settings = organization.data.settings;
  const file = { format: ORGANIZATION_FILE_FORMAT, version: ORGANIZATION_FILE_VERSION, kind, exportedAt, appVersion, organization: { name: organization.name } };
  if (parts.includes('themes')) file.themes = { themeId: settings.themeId, themes: structuredClone(settings.themes) };
  const highlights = structuredClone(settings.highlights ?? defaultHighlights(settings.language || 'it'));
  if (parts.includes('settings')) {
    file.settings = {
      language: settings.language || 'it', logo: settings.logo || '', portalUrlTemplate: settings.portalUrlTemplate || '',
      tabNames: [...settings.tabNames], hoursPerDay: settings.hoursPerDay, fontSizes: { ...(settings.fontSizes || defaultFontSizes()) }, fontFamily: settings.fontFamily ?? DEFAULT_FONT_FAMILY,
      statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies),
      highlights: structuredClone(highlights), tags: structuredClone(settings.tags || []),
      taskColumns: normalizeTaskColumns(settings.taskColumns, settings.taskFields), savedViews: structuredClone(settings.savedViews || []),
      taskFields: structuredClone(settings.taskFields || []), issueFields: structuredClone(settings.issueFields || []),
      issueColumns: columns.normalizeIssueColumns(settings.issueColumns, settings.issueFields)
    };
  }
  if (parts.includes('data')) {
    file.data = { statuses: structuredClone(settings.statuses), urgencies: structuredClone(settings.urgencies), highlights: structuredClone(highlights), tags: structuredClone(settings.tags || []), tasks: structuredClone(organization.data.tasks), issues: structuredClone(organization.data.issues) };
    file.data.taskFields = structuredClone(settings.taskFields || []);
    file.data.issueFields = structuredClone(settings.issueFields || []);
  }
  return file;
}
const slugify = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
function organizationFileName(name, kind, language = 'it', date = today()) {
  assert(ORGANIZATION_FILE_KINDS.includes(kind), "Unsupported export type.");
  const labels = { themes: "themes", settings: "settings", data: "data", organization: "organization" };
  const label = key => slugify(term(labels[key], language)) || key;
  return `${APP_NAME}-${slugify(name) || label('organization')}-${label(kind)}-${date}.json`;
}
function situationFileName(name, language = 'it', date = today()) {
  return `${APP_NAME}-${slugify(name) || slugify(term("organization", language)) || 'organization'}-${slugify(term("situation", language)) || 'situation'}-${date}.xlsx`;
}
function fileRecords(list, keys, message) {
  assert(Array.isArray(list) && list.every(item => item && typeof item === 'object' && !Array.isArray(item)), message);
  return list.map(item => Object.fromEntries(keys.filter(key => item[key] !== undefined).map(key => [key, item[key]])));
}
function parseOrganizationFile(input) {
  let file = input;
  if (typeof input === 'string') {
    try { file = JSON.parse(input.replace(/^\uFEFF/, '')); }
    catch { throw new Error("The selected file is not a valid JSON file."); }
  }
  assert(file && typeof file === 'object' && !Array.isArray(file), "The file is not an OrbitKanban organization export.");
  assert(file.format !== undefined || !(Array.isArray(file.organizations) || (file.settings && Array.isArray(file.tasks))), "This file is a full archive backup: use “Import backup” in the “Data that travels with you” section.");
  assert(file.format === ORGANIZATION_FILE_FORMAT, "The file is not an OrbitKanban organization export.");
  assert(Number.isInteger(file.version) && file.version >= 1, "Unsupported file version.");
  assert(file.version <= ORGANIZATION_FILE_VERSION, "The file was created by a newer version of OrbitKanban: update the app to import it.");
  assert(ORGANIZATION_FILE_KINDS.includes(file.kind), "Unsupported export type.");
  const name = file.organization?.name;
  assert(name === undefined || (typeof name === 'string' && name.trim().length <= 100), "Invalid organization name.");
  const parts = ORGANIZATION_FILE_PARTS[file.kind];
  const result = {
    format: ORGANIZATION_FILE_FORMAT, version: file.version, kind: file.kind, parts: [...parts],
    exportedAt: typeof file.exportedAt === 'string' && !Number.isNaN(Date.parse(file.exportedAt)) ? file.exportedAt : '',
    appVersion: typeof file.appVersion === 'string' && /^[\w.+-]{1,40}$/.test(file.appVersion) ? file.appVersion : '',
    organization: { name: typeof name === 'string' ? name.trim() : '' }
  };
  const missing = { themes: "The file does not contain themes.", settings: "The file does not contain settings.", data: "The file does not contain data." };
  for (const part of parts) assert(file[part] && typeof file[part] === 'object' && !Array.isArray(file[part]), missing[part]);
  const probe = baseData('it');
  const check = (settings, content = {}) => validateData({ ...probe, settings: { ...probe.settings, ...settings }, ...content });
  if (parts.includes('themes')) {
    const themes = { themeId: file.themes.themeId, themes: fileRecords(file.themes.themes, RECORD_KEYS.theme, "Invalid themes.") };
    check(themes);
    result.themes = themes;
  }
  if (parts.includes('settings')) {
    const source = file.settings;
    const settings = {
      language: source.language, logo: source.logo ?? '', portalUrlTemplate: source.portalUrlTemplate ?? '',
      tabNames: Array.isArray(source.tabNames) ? [...source.tabNames] : source.tabNames, hoursPerDay: source.hoursPerDay,
      statuses: fileRecords(source.statuses, RECORD_KEYS.status, "Invalid or empty status list."),
      urgencies: fileRecords(source.urgencies, RECORD_KEYS.urgency, "Invalid or empty urgency list.")
    };
    if (source.fontFamily !== undefined) settings.fontFamily = source.fontFamily;
    if (source.fontSizes !== undefined) {
      assert(source.fontSizes && typeof source.fontSizes === 'object' && !Array.isArray(source.fontSizes), "Invalid text sizes.");
      settings.fontSizes = Object.fromEntries(FONT_SIZE_PARTS.map(({ id }) => [id, source.fontSizes[id] ?? 100]));
    }
    if (source.highlights !== undefined) settings.highlights = fileRecords(source.highlights, RECORD_KEYS.highlight, "Invalid highlighters.");
    if (source.tags !== undefined) settings.tags = fileRecords(source.tags, RECORD_KEYS.highlight, "Invalid tags.");
    for (const key of ['taskFields', 'issueFields', 'issueColumns']) if (source[key] !== undefined) settings[key] = structuredClone(source[key]);
    if (source.taskColumns !== undefined) {
      const columns = fileRecords(source.taskColumns, RECORD_KEYS.column, "Invalid list columns.");
      assert(columns.every(column => typeof column.id === 'string' && typeof column.visible === 'boolean'), "Invalid list columns.");
      settings.taskColumns = normalizeTaskColumns(columns, settings.taskFields);
    }
    if (source.savedViews !== undefined) settings.savedViews = structuredClone(source.savedViews);
    assert(validLanguage(settings.language), "Unsupported language.");
    check(settings);
    result.settings = settings;
  }
  if (parts.includes('data')) {
    const source = file.data;
    const content = {
      statuses: fileRecords(source.statuses, RECORD_KEYS.status, "Invalid or empty status list."),
      urgencies: fileRecords(source.urgencies, RECORD_KEYS.urgency, "Invalid or empty urgency list."),
      tasks: fileRecords(source.tasks, RECORD_KEYS.task, "Invalid task list."),
      issues: fileRecords(source.issues, RECORD_KEYS.issue, "Invalid issue list.")
    };
    if (source.highlights !== undefined) content.highlights = fileRecords(source.highlights, RECORD_KEYS.highlight, "Invalid highlighters.");
    if (source.tags !== undefined) content.tags = fileRecords(source.tags, RECORD_KEYS.highlight, "Invalid tags.");
    for (const key of ['taskFields', 'issueFields']) if (source[key] !== undefined) content[key] = structuredClone(source[key]);
    check({ statuses: content.statuses, urgencies: content.urgencies, ...(content.highlights ? { highlights: content.highlights } : {}), tags: content.tags || [], taskFields: columns.fieldsOf(content, 'tasks'), issueFields: columns.fieldsOf(content, 'issues') }, { tasks: content.tasks, issues: content.issues });
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
// Match shared catalogs by id/name; tags with an id collision must keep their original meaning.
function colorOptionRemapper(source, target, add = false, { limit = HIGHLIGHT_LIMIT, overflow = '', matchName = false } = {}) {
  const key = name => name.trim().toLowerCase();
  return sourceId => {
    if (!sourceId) return '';
    const original = source.find(highlight => highlight.id === sourceId);
    if (target.some(item => item.id === sourceId && (!matchName || !original || key(item.name) === key(original.name)))) return sourceId;
    if (!original) return '';
    const sameName = target.find(highlight => key(highlight.name) === key(original.name));
    if (sameName) return sameName.id;
    if (!add) return '';
    if (target.length >= limit) { if (overflow) throw new Error(overflow); return ''; }
    const added = structuredClone(original);
    if (target.some(item => item.id === added.id)) added.id = id();
    target.push(added);
    return added.id;
  };
}
const tagRemapper = (source, target, add = false) => colorOptionRemapper(source, target, add, { limit: TAG_LIMIT, matchName: true, overflow: "Too many tags: reduce the catalog before importing." });
function applyOrganizationImport(current, file, options = {}) {
  const next = structuredClone(current), settings = next.settings;
  const importFields = (source, preferIncoming = false) => Object.fromEntries(['tasks', 'issues'].map(kind => {
    const key = kind === 'tasks' ? 'taskFields' : 'issueFields';
    const merged = columns.mergeFields(settings[key] || [], source[key] || [], preferIncoming);
    settings[key] = merged.fields;
    return [kind, merged];
  }));
  const wanted = part => Boolean(options[part] && file[part]);
  assert(['themes', 'settings', 'data'].some(wanted), "Select at least one part to import.");
  if (wanted('settings')) {
    const incoming = structuredClone(file.settings);
    const maps = importFields(incoming, true);
    const remapColumns = (list, map) => list.map(column => ({ ...column, id: map.get(column.id) || column.id }));
    const status = optionRemapper(settings.statuses, incoming.statuses), urgency = optionRemapper(settings.urgencies, incoming.urgencies);
    for (const task of next.tasks) { task.statusId = status(task.statusId); task.urgencyId = urgency(task.urgencyId); }
    for (const key of ['language', 'portalUrlTemplate', 'tabNames', 'hoursPerDay', 'statuses', 'urgencies']) settings[key] = incoming[key];
    if (incoming.fontSizes) settings.fontSizes = incoming.fontSizes;
    if (incoming.fontFamily !== undefined) settings.fontFamily = incoming.fontFamily;
    if (incoming.highlights) {
      const highlight = colorOptionRemapper(settings.highlights || [], incoming.highlights);
      for (const task of next.tasks) task.highlightId = highlight(task.highlightId);
      settings.highlights = incoming.highlights;
    }
    if (incoming.tags) {
      const tag = tagRemapper(settings.tags || [], incoming.tags);
      for (const task of next.tasks) task.tagIds = [...new Set((task.tagIds || []).map(tag).filter(Boolean))];
      settings.tags = incoming.tags;
    }
    if (incoming.taskColumns) settings.taskColumns = normalizeTaskColumns(remapColumns(incoming.taskColumns, maps.tasks.mapping), settings.taskFields);
    if (incoming.issueColumns) settings.issueColumns = columns.normalizeIssueColumns(remapColumns(incoming.issueColumns, maps.issues.mapping), settings.issueFields);
    if (incoming.savedViews) settings.savedViews = incoming.savedViews.map(view => ({
      ...view, columns: remapColumns(view.columns, maps.tasks.mapping), sort: view.sort.map(item => ({ ...item, key: maps.tasks.mapping.get(item.key) || item.key })),
      ...(view.columnFilters && { columnFilters: columns.remapValues(view.columnFilters, maps.tasks.mapping, maps.tasks.valueMappings, true) })
    }));
    if (options.logo) settings.logo = incoming.logo;
  }
  if (wanted('themes')) {
    for (const theme of structuredClone(file.themes.themes)) {
      theme.name = modernThemeName(theme);
      const index = settings.themes.findIndex(existing => existing.id === theme.id);
      if (index >= 0) settings.themes[index] = theme; else settings.themes.push(theme);
    }
    if (options.activateTheme) settings.themeId = file.themes.themeId;
  }
  if (wanted('data')) {
    const maps = importFields(file.data);
    const status = optionRemapper(file.data.statuses, settings.statuses), urgency = optionRemapper(file.data.urgencies, settings.urgencies);
    settings.highlights ??= defaultHighlights(settings.language || 'it');
    const highlight = colorOptionRemapper(file.data.highlights || [], settings.highlights, true);
    settings.tags ??= [];
    const tag = tagRemapper(file.data.tags || [], settings.tags, true);
    // Files from versions without highlighters do not erase the highlight of the tasks they update.
    const existing = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.highlightId]));
    const existingTags = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.tagIds || []]));
    const oldTasks = new Map(options.dataMode === 'replace' ? [] : next.tasks.map(task => [task.id, task.customFields]));
    const oldIssues = new Map(options.dataMode === 'replace' ? [] : next.issues.map(issue => [issue.id, issue.customFields]));
    const tasks = structuredClone(file.data.tasks).map(task => ({
      ...task, statusId: status(task.statusId), urgencyId: urgency(task.urgencyId),
      highlightId: task.highlightId === undefined ? existing.get(task.id) || '' : highlight(task.highlightId),
      tagIds: task.tagIds === undefined ? existingTags.get(task.id) || [] : [...new Set(task.tagIds.map(tag).filter(Boolean))],
      ...(task.customFields !== undefined || oldTasks.get(task.id) !== undefined ? { customFields: { ...(oldTasks.get(task.id) || {}), ...columns.remapValues(task.customFields, maps.tasks.mapping, maps.tasks.valueMappings) } } : {})
    }));
    const issues = structuredClone(file.data.issues).map(issue => ({ ...issue, ...(issue.customFields !== undefined || oldIssues.get(issue.id) !== undefined ? { customFields: { ...(oldIssues.get(issue.id) || {}), ...columns.remapValues(issue.customFields, maps.issues.mapping, maps.issues.valueMappings) } } : {}) }));
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
        else if (!next.issues.some(existing => triple(existing) === triple(issue) && columns.valuesKey(existing.customFields) === columns.valuesKey(issue.customFields))) next.issues.push(issue);
      }
    }
  }
  settings.taskColumns = normalizeTaskColumns(settings.taskColumns, settings.taskFields);
  settings.issueColumns = columns.normalizeIssueColumns(settings.issueColumns, settings.issueFields);
  return normalizeTags(validateData(next));
}
function importedOrganizationData(file, options = {}, fallbackLanguage = 'it') {
  const withSettings = Boolean(options.settings && file.settings);
  const base = baseData(withSettings ? file.settings.language : validLanguage(fallbackLanguage) ? fallbackLanguage : 'it');
  if (options.data && file.data && !withSettings) {
    base.settings.statuses = structuredClone(file.data.statuses);
    base.settings.urgencies = structuredClone(file.data.urgencies);
    if (file.data.highlights) base.settings.highlights = structuredClone(file.data.highlights);
    if (file.data.tags) base.settings.tags = structuredClone(file.data.tags);
  }
  return applyOrganizationImport(base, file, { ...options, logo: true, dataMode: 'replace' });
}
function uniqueOrganizationName(name, existingNames, fallback = "Imported organization") {
  const base = String(name ?? '').trim().slice(0, 100).trim() || fallback;
  const taken = new Set(existingNames.map(existing => existing.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let counter = 2; ; counter++) {
    const suffix = ` (${counter})`, candidate = base.slice(0, 100 - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
const referenceKey = value => String(value ?? '').trim().toUpperCase();
function indexIssues(issues) {
  const index = new Map();
  for (const issue of issues) {
    const code = issue.code.trim().toUpperCase();
    if (!index.has(code)) index.set(code, { incidents: new Set(), problems: new Set() });
    const links = index.get(code), incident = issue.incident.trim(), problem = issue.problem.trim();
    if (incident) links.incidents.add(incident);
    if (problem) links.problems.add(problem);
  }
  return index;
}
function matchIssues(task, issues) {
  const code = task.code.trim().toUpperCase();
  // Batch callers build the index once; return fresh arrays just like the single-task path.
  if (issues instanceof Map) {
    const links = issues.get(code);
    return { incidents: [...(links?.incidents || [])], problems: [...(links?.problems || [])] };
  }
  const matches = issues.filter(x => x.code.trim().toUpperCase() === code);
  return {
    incidents: [...new Set(matches.map(x => x.incident.trim()).filter(Boolean))],
    problems: [...new Set(matches.map(x => x.problem.trim()).filter(Boolean))]
  };
}
// The incident is the duplicate key: it is compared like portal codes, ignoring case and surrounding spaces.
// An incident is duplicated in the issue list when it appears in more than one association, and among tasks
// when, through its associations, it resolves to more than one task. Associations without incident are never duplicates.
function findDuplicates(tasks, issues) {
  const tasksByCode = new Map(), groups = new Map();
  for (const task of tasks) {
    const code = referenceKey(task.code);
    if (!tasksByCode.has(code)) tasksByCode.set(code, []);
    tasksByCode.get(code).push(task.id);
  }
  for (const issue of issues) {
    const key = referenceKey(issue.incident);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, incident: issue.incident.trim(), issueIds: [], codes: [], taskIds: [] });
    const group = groups.get(key), code = referenceKey(issue.code);
    group.issueIds.push(issue.id);
    if (!group.codes.includes(code)) {
      group.codes.push(code);
      group.taskIds.push(...(tasksByCode.get(code) || []));
    }
  }
  const result = { groups: [], issues: new Map(), tasks: new Map(), identical: [] };
  for (const group of groups.values()) {
    if (group.issueIds.length < 2 && group.taskIds.length < 2) continue;
    result.groups.push(group);
    if (group.issueIds.length > 1) for (const issueId of group.issueIds) result.issues.set(issueId, group);
    if (group.taskIds.length > 1) for (const taskId of group.taskIds) result.tasks.set(taskId, [...(result.tasks.get(taskId) || []), group]);
  }
  // Associations repeating code, incident and problem of an earlier one add nothing: the first of each set is kept.
  const seen = new Set();
  for (const issue of issues) {
    if (!referenceKey(issue.incident)) continue;
    const triple = [...[issue.code, issue.incident, issue.problem].map(referenceKey), columns.valuesKey(issue.customFields)].join('\u0000');
    if (seen.has(triple)) result.identical.push(issue.id); else seen.add(triple);
  }
  return result;
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
function reorderTaskSequences(tasks, visibleIds, from, to) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  assert(new Set(visibleIds).size === visibleIds.length && visibleIds.every(id => byId.has(id))
    && Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= 0 && from < visibleIds.length && to < visibleIds.length,
  "The list has changed. Try reordering again.");
  if (from === to) return;
  const ids = [...visibleIds], visible = new Set(ids);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  let index = 0;
  // Filtered-out tasks keep their slots; visible tasks take those slots in the requested order.
  sortTasks(tasks, [{ key: 'sequence', direction: 'asc' }]).map(task => visible.has(task.id) ? byId.get(ids[index++]) : task)
    .forEach((task, position) => { task.sequence = position + 1; });
}
function nextReleaseDate(tasks, referenceDate = today()) {
  return tasks.reduce((next, task) => {
    const date = task.releaseDate;
    return date && date >= referenceDate && (!next || date < next) ? date : next;
  }, '');
}
function extractThemePalette(pixels) {
  assert(pixels && pixels.length > 0 && pixels.length % 4 === 0, "The image has no valid pixels.");
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
// WCAG 2.x contrast: relative luminance of sRGB colors and the (L1 + 0.05) / (L2 + 0.05) ratio.
const WCAG_TEXT_CONTRAST = 4.5, WCAG_GRAPHIC_CONTRAST = 3;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
function hexToRgb(color) {
  assert(typeof color === 'string' && HEX_COLOR.test(color), "Invalid color.");
  const digits = color.length === 4 ? [...color.slice(1)].map(digit => digit + digit).join('') : color.slice(1);
  return digits.match(/.{2}/g).map(channel => parseInt(channel, 16));
}
const rgbToHex = channels => '#' + channels.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('');
const srgbToLinear = channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
const linearToSrgb = value => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
function relativeLuminance(color) {
  return hexToRgb(color).map(srgbToLinear).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrastRatio(a, b) {
  const first = relativeLuminance(a), second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
const meetsContrast = (color, against, minimum) => against.every(other => contrastRatio(color, other) >= minimum);
// OKLCH keeps hue and chroma while only the perceived lightness moves, so corrected colors stay recognisable.
function toOklch(color) {
  const [r, g, b] = hexToRgb(color).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const chroma = Math.hypot(a, bb);
  return { l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, c: chroma < 1e-4 ? 0 : chroma, h: Math.atan2(bb, a) };
}
function fromOklch({ l, c, h }) {
  const lightness = Math.min(1, Math.max(0, l));
  const linear = chroma => {
    const a = chroma * Math.cos(h), b = chroma * Math.sin(h);
    const lc = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3, mc = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3, sc = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc, -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc, -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc];
  };
  const inGamut = rgb => rgb.every(value => value >= -1e-6 && value <= 1 + 1e-6);
  let rgb = linear(c);
  if (!inGamut(rgb)) {
    // Out-of-gamut colors lose chroma, never lightness or hue.
    let low = 0, high = c;
    for (let step = 0; step < 24; step++) { const middle = (low + high) / 2; if (inGamut(linear(middle))) low = middle; else high = middle; }
    rgb = linear(low);
  }
  return rgbToHex(rgb.map(value => linearToSrgb(Math.min(1, Math.max(0, value)))));
}
// Smallest lightness change (towards white or black, hue kept) that reaches the minimum contrast against every color; null if impossible.
function shiftToContrast(color, against, minimum) {
  if (meetsContrast(color, against, minimum)) return color;
  const base = toOklch(color);
  const candidates = [1, 0].map(target => {
    const at = amount => fromOklch({ ...base, l: base.l + (target - base.l) * amount });
    const steps = 64;
    let previous = 0, found = -1;
    for (let step = 1; step <= steps; step++) {
      if (meetsContrast(at(step / steps), against, minimum)) { found = step / steps; break; }
      previous = step / steps;
    }
    if (found < 0) return null;
    let low = previous, high = found;
    for (let step = 0; step < 20; step++) { const middle = (low + high) / 2; if (meetsContrast(at(middle), against, minimum)) high = middle; else low = middle; }
    return { color: at(high), distance: Math.abs(target - base.l) * high };
  }).filter(Boolean);
  return candidates.length ? candidates.sort((a, b) => a.distance - b.distance)[0].color : null;
}
// WCAG AA for a theme: text 4.5:1 on background and surfaces, accent 3:1 (UI components), each moved as little as possible.
function accessibleThemePalette(input) {
  const palette = { ...input };
  let text = shiftToContrast(palette.text, [palette.background, palette.surface], WCAG_TEXT_CONTRAST);
  if (!text) {
    // Background and surface are too far apart for any text color: the surface moves just enough towards the background side.
    const lightText = relativeLuminance(palette.text) >= relativeLuminance(palette.background);
    for (const extreme of lightText ? ['#ffffff', '#000000'] : ['#000000', '#ffffff']) {
      if (contrastRatio(extreme, palette.background) < WCAG_TEXT_CONTRAST) continue;
      const surface = shiftToContrast(palette.surface, [extreme], WCAG_TEXT_CONTRAST);
      const candidate = surface && shiftToContrast(palette.text, [palette.background, surface], WCAG_TEXT_CONTRAST);
      if (candidate) { palette.surface = surface; text = candidate; break; }
    }
  }
  palette.text = text;
  palette.accent = shiftToContrast(palette.accent, [palette.background, palette.surface], WCAG_GRAPHIC_CONTRAST) || palette.text;
  const adjusted = ['background', 'surface', 'text', 'accent'].filter(role => palette[role].toLowerCase() !== String(input[role]).toLowerCase());
  return { palette, adjusted };
}
function themeFromImage(pixels) {
  const extracted = extractThemePalette(pixels);
  const { palette, adjusted } = accessibleThemePalette(extracted);
  return { ...palette, colorCount: extracted.colorCount, extracted: { background: extracted.background, surface: extracted.surface, text: extracted.text, accent: extracted.accent }, adjusted };
}
// Label color for filled accent buttons: the theme background when it is readable, otherwise the most readable option.
function onAccentColor(theme) {
  if (contrastRatio(theme.background, theme.accent) >= WCAG_TEXT_CONTRAST) return theme.background;
  return [theme.background, theme.text, '#ffffff', '#000000'].reduce((best, color) => contrastRatio(color, theme.accent) > contrastRatio(best, theme.accent) ? color : best);
}
// Gradient stops for the interface icons: each family keeps its hue and gets 3:1 against background and surfaces.
const ICON_FAMILIES = {
  blue: ['#5ac8ff', '#2f6bff'],
  violet: ['#b490ff', '#6a4cff'],
  teal: ['#3ee0c5', '#0f9f9a'],
  amber: ['#ffcf4d', '#ff8a3d'],
  rose: ['#ff8fb1', '#e5487f'],
  green: ['#7ee081', '#22a35a'],
  slate: ['#a9b6cc', '#5d6b82']
};
function iconPalette(theme) {
  const against = [theme.background, theme.surface];
  const accessible = color => shiftToContrast(color, against, WCAG_GRAPHIC_CONTRAST) || theme.text;
  const accent = toOklch(theme.accent);
  const accentStops = [fromOklch({ ...accent, l: accent.l + 0.12, h: accent.h - 0.35 }), fromOklch({ ...accent, l: accent.l - 0.04, h: accent.h + 0.2 })];
  return Object.fromEntries([...Object.entries(ICON_FAMILIES), ['accent', accentStops]].map(([family, stops]) => [family, stops.map(accessible)]));
}
// Inner details of a gradient icon: white, or a deep ink when white would fade on light gradients.
function iconInk(stops) {
  const legibility = color => Math.min(...stops.map(stop => contrastRatio(color, stop)));
  return legibility('#ffffff') >= legibility('#1d1b26') ? '#ffffff' : '#1d1b26';
}
function themeFromLogo(pixels) {
  const palette = extractThemePalette(pixels);
  const mix = (a, b, weight) => rgbToHex(hexToRgb(a).map((channel, i) => channel * (1 - weight) + hexToRgb(b)[i] * weight));
  const foreground = contrastRatio(palette.background, '#ffffff') > contrastRatio(palette.background, '#000000') ? '#ffffff' : '#000000';
  if (!meetsContrast(palette.text, [palette.background, palette.surface], WCAG_TEXT_CONTRAST)) palette.text = foreground;
  if (contrastRatio(palette.text, palette.surface) < WCAG_TEXT_CONTRAST || contrastRatio(palette.background, palette.surface) < 1.1) palette.surface = mix(palette.background, palette.text, 0.08);
  if (contrastRatio(palette.text, palette.surface) < WCAG_TEXT_CONTRAST) palette.surface = mix(palette.background, palette.text === '#ffffff' ? '#000000' : '#ffffff', 0.08);
  if (!meetsContrast(palette.accent, [palette.background, palette.surface], WCAG_GRAPHIC_CONTRAST)) {
    for (let weight = 0.1; weight <= 1.01; weight += 0.1) {
      const accent = mix(palette.accent, palette.text, weight);
      if (meetsContrast(accent, [palette.background, palette.surface], WCAG_GRAPHIC_CONTRAST)) { palette.accent = accent; break; }
    }
  }
  return palette;
}
const core = {
  APP_NAME, initialData, baseData, demoData, demoReleaseDates, validateData, migrateArchive, validateArchive, createOrganization, matchIssues, indexIssues, findDuplicates, sortTasks, dateColor, today, validLanguage,
  extractThemePalette, themeFromLogo, themeFromImage, accessibleThemePalette, shiftToContrast, contrastRatio, relativeLuminance, onAccentColor, iconPalette, iconInk, ICON_FAMILIES, WCAG_TEXT_CONTRAST, WCAG_GRAPHIC_CONTRAST,
  normalizeUrl, isWebUrl, validPortalTemplate, hasPortalPlaceholder, portalUrl,
  ORGANIZATION_FILE_KINDS, organizationExport, organizationFileName, situationFileName, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName,
  FONT_SIZE_PARTS, FONT_SIZE_STEP, FONT_FAMILIES, DEFAULT_FONT_FAMILY, validFontFamily, defaultFontSizes, clampFontSize, defaultThemes,
  HIGHLIGHT_LIMIT, defaultHighlights, TASK_COLUMN_IDS, defaultTaskColumns, normalizeTaskColumns, TAG_LIMIT, TAG_NAME_MAX, nextReleaseDate, reorderTaskSequences
};
if (typeof module !== 'undefined') module.exports = core;
else window.OrbitaCore = core;
})();
