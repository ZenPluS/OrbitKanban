'use strict';
const { APP_NAME, validateData, matchIssues, findDuplicates, sortTasks, dateColor, extractThemePalette, themeFromLogo, defaultThemes, normalizeUrl, isWebUrl, validPortalTemplate, portalUrl, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName, FONT_SIZE_PARTS, FONT_SIZE_STEP, defaultFontSizes, clampFontSize, HIGHLIGHT_LIMIT, defaultTaskColumns, normalizeTaskColumns, TAG_LIMIT, TAG_NAME_MAX, today, nextReleaseDate, situationFileName } = window.OrbitaCore;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const { reorderTaskSequences, indexIssues } = window.OrbitaCore;
const { FONT_FAMILIES, DEFAULT_FONT_FAMILY } = window.OrbitaCore;
const CustomColumns = window.OrbitaColumns, Csv = window.OrbitaCsv;
let columnFilters = { tasks: {}, issues: {} }, issueSearch = '';
let data, dataFolder, view = 0, search = '', showHidden = false, duplicatesOnly = false, issueDuplicatesOnly = false, statusFilter = '', highlightFilter = '', highlighter = '', sort = [{ key: 'releaseDate', direction: 'asc' }];
let settingsDraft, settingsBase, saving = false, organizationBusy = false, organizations = [], activeOrganizationId, lastOpenedLink = '';
let revision = '', appVersion = '', browserUrl = '', online = true, refreshing = false, pendingChange = null, renderAfterModal = false, adoptions = 0, subscribed = false;
const HISTORY_LIMIT = 20, undoHistory = new Map(), redoHistory = new Map();
let activeSavedViewId = '', backupRequest = 0;
let languageInfo = { folder: '', template: '', languages: [], errors: [] };
let milestoneDay = '';
// Tasks ticked in the list for bulk edit or export; kept across filters and dropped when they no longer exist.
const selectedTasks = new Set();
let selectionAnchor = '';
let settingsTab = (() => { try { return sessionStorage.getItem('orbitkanban.settingsTab') || ''; } catch { return ''; } })(), themeQuery = '';
function unwrap(value) {
  if (value && value.__error) { const error = new Error(value.message); error.code = value.code; throw error; }
  return value;
}
const workspaceApi = new Proxy({}, { get: (_, name) => { const member = window.workspace?.[name]; return typeof member === 'function' ? async (...args) => unwrap(await member(...args)) : member; } });
const browserMode = () => window.workspace?.mode === 'browser';
const currentLanguage = () => data?.settings.language || 'it';
const t = text => window.OrbitaI18n.translate(text, currentLanguage());
const tr = t;
const ui = (strings, ...values) => strings.reduce((html, fragment, i) => html + t(fragment) + (i < values.length ? values[i] : ''), '');
const locale = () => window.OrbitaI18n.locale(currentLanguage());
const term = text => window.OrbitaI18n.term(text, currentLanguage());
const plural = (count, key) => window.OrbitaI18n.plural(count, key, currentLanguage());
const icons = ['▤', '⌘', '◈', '▥'];
const plainCache = new Map();
const PLAIN_CACHE_LIMIT = 4096, PLAIN_CACHE_CHARS = 4_000_000;
let plainCacheChars = 0;
const plain = html => {
  const source = String(html);
  if (plainCache.has(source)) return plainCache.get(source);
  const el = document.createElement('div');
  el.innerHTML = sanitize(source);
  el.querySelectorAll('br').forEach(node => node.replaceWith(' '));
  el.querySelectorAll('p,div,li,blockquote').forEach(node => node.append(' '));
  const text = el.textContent.replace(/\s+/g, ' ').trim(), size = source.length + text.length;
  if (size <= PLAIN_CACHE_CHARS) {
    while (plainCache.size && (plainCache.size >= PLAIN_CACHE_LIMIT || plainCacheChars + size > PLAIN_CACHE_CHARS)) {
      const oldest = plainCache.keys().next().value;
      plainCacheChars -= oldest.length + plainCache.get(oldest).length;
      plainCache.delete(oldest);
    }
    plainCache.set(source, text);
    plainCacheChars += size;
  }
  return text;
};
function sanitize(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'DIV', 'BLOCKQUOTE']);
  function clean(parent) {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'MATH'].includes(child.tagName)) { child.remove(); continue; }
        clean(child);
        if (!allowed.has(child.tagName)) child.replaceWith(...child.childNodes);
        else for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
      } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}
function notify(message, error = false, detail = '') {
  $('#toast').textContent = t(message) + (detail ? ` ${detail}` : '');
  $('#toast').className = error ? 'visible error' : 'visible';
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => { $('#toast').className = ''; }, error ? 10000 : 3500);
}
function historyFor(collection, organizationId = activeOrganizationId) {
  if (!collection.has(organizationId)) collection.set(organizationId, []);
  return collection.get(organizationId);
}
function clearHistory(organizationId) {
  if (organizationId) { undoHistory.delete(organizationId); redoHistory.delete(organizationId); }
  else { undoHistory.clear(); redoHistory.clear(); }
  updateHistoryButtons();
}
function updateHistoryButtons() {
  const undo = $('#undo-button'), redo = $('#redo-button');
  if (!undo || !redo) return;
  const pendingSettings = settingsDraftPending();
  const canUndo = Boolean(undoHistory.get(activeOrganizationId)?.length) && !saving && !organizationBusy && !pendingSettings;
  const canRedo = Boolean(redoHistory.get(activeOrganizationId)?.length) && !saving && !organizationBusy && !pendingSettings;
  undo.disabled = !canUndo;
  redo.disabled = !canRedo;
  undo.title = t('Annulla (Ctrl+Z)');
  redo.title = t('Ripristina (Ctrl+Y)');
  undo.setAttribute('aria-label', undo.title);
  redo.setAttribute('aria-label', redo.title);
}
function recordHistory(organizationId, before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const undo = historyFor(undoHistory, organizationId);
  if (undo.length && JSON.stringify(undo.at(-1).after) !== JSON.stringify(before)) undo.length = 0;
  undo.push({ before: structuredClone(before), after: structuredClone(after) });
  if (undo.length > HISTORY_LIMIT) undo.splice(0, undo.length - HISTORY_LIMIT);
  historyFor(redoHistory, organizationId).length = 0;
  updateHistoryButtons();
}
async function changeHistory(direction) {
  if (saving || organizationBusy || $('#modal').open || settingsDraftPending()) return;
  const undo = historyFor(undoHistory), redo = historyFor(redoHistory);
  const source = direction === 'undo' ? undo : redo, targetStack = direction === 'undo' ? redo : undo;
  const entry = source.at(-1);
  if (!entry) return;
  const expected = direction === 'undo' ? entry.after : entry.before;
  if (JSON.stringify(data) !== JSON.stringify(expected)) {
    clearHistory(activeOrganizationId);
    notify('La cronologia non corrisponde più ai dati correnti; annulla e ripristina sono stati azzerati.', true);
    return;
  }
  const organizationId = activeOrganizationId;
  saving = true;
  updateHistoryButtons();
  $('#save-status').textContent = t('Salvataggio…');
  try {
    const snapshot = await workspaceApi.save(structuredClone(direction === 'undo' ? entry.before : entry.after), organizationId, undefined, revision);
    adoptSnapshot(snapshot);
    source.pop();
    targetStack.push(entry);
    if (targetStack.length > HISTORY_LIMIT) targetStack.splice(0, targetStack.length - HISTORY_LIMIT);
    $('#save-status').innerHTML = ui`<i class="connection-dot"></i> Tutto salvato in locale`;
    rerenderPreservingView();
    notify(direction === 'undo' ? 'Modifica annullata.' : 'Modifica ripristinata.');
  } catch (error) {
    if (error.code === 'conflict') {
      adoptSnapshot(await workspaceApi.load(organizationId));
      clearHistory(organizationId);
      rerenderPreservingView();
      notify('Le modifiche sono cambiate in un’altra finestra; annulla e ripristina sono stati azzerati.', true);
      return;
    }
    $('#save-status').textContent = t('Salvataggio non riuscito');
    throw error;
  } finally {
    saving = false;
    updateHistoryButtons();
    flushPendingChange();
  }
}
async function commit(change, organizationName) {
  if (saving || organizationBusy) throw new Error(t('Un salvataggio è già in corso. Riprova tra un istante.'));
  const build = () => {
    if (typeof change !== 'function') return change;
    const next = structuredClone(data);
    change(next);
    return next;
  };
  const organizationId = activeOrganizationId;
  let before = structuredClone(data);
  let next = validateData(build());
  saving = true;
  $('#save-status').textContent = t('Salvataggio…');
  try {
    let saved;
    try { saved = await workspaceApi.save(next, organizationId, organizationName, revision); }
    catch (error) {
      if (error.code !== 'conflict' || typeof change !== 'function') throw error;
      const fresh = await workspaceApi.load(organizationId);
      if (fresh.activeOrganizationId !== organizationId) throw Object.assign(new Error(t('Questa organizzazione non esiste più.')), { code: 'missing-organization' });
      adoptSnapshot(fresh);
      before = structuredClone(data);
      next = validateData(build());
      saved = await workspaceApi.save(next, organizationId, organizationName, revision);
    }
    adoptSnapshot(saved);
    recordHistory(organizationId, before, saved.data);
    $('#save-status').innerHTML = ui`<i class="connection-dot"></i> Tutto salvato in locale`;
  } catch (error) {
    $('#save-status').textContent = t('Salvataggio non riuscito');
    if (error.code === 'missing-organization') pendingChange = { forced: true };
    throw error;
  } finally { saving = false; updateHistoryButtons(); flushPendingChange(); }
}
function action(handler) { return async event => { try { await handler(event); } catch (error) { notify(error.message, true); } }; }
const openPortal = action(async url => { lastOpenedLink = await workspaceApi.openLink(url); });
function portalAnchor(url, code, className = 'external-link') {
  return url ? `<a class="${className}" href="${esc(url)}" data-open-url title="${esc(t('Apri nel browser predefinito') + ': ' + url)}" aria-label="${esc(t('Apri portale') + ' ' + code)}">↗</a>` : '';
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-open-url]');
  if (!link) return;
  event.preventDefault();
  openPortal(link.getAttribute('href'));
});
function pill(name, color, extra = '') { return `<span class="pill ${extra}" style="--pill:${esc(color)}"><i></i>${esc(name)}</span>`; }
let dateFormatter, dateFormatterLocale;
function formatDate(date) {
  if (!date) return t('Da pianificare');
  const currentLocale = locale();
  if (dateFormatterLocale !== currentLocale) {
    dateFormatter = new Intl.DateTimeFormat(currentLocale, { day: '2-digit', month: 'short', year: 'numeric' });
    dateFormatterLocale = currentLocale;
  }
  return dateFormatter.format(new Date(date + 'T12:00:00'));
}
function effort(value) {
  const days = Math.floor(value / data.settings.hoursPerDay);
  const hours = Math.round((value - days * data.settings.hoursPerDay) * 100) / 100;
  return [days ? term('{0}g').replaceAll('{0}', days) : '', hours ? `${hours}h` : ''].filter(Boolean).join(' ') || '—';
}
function optionList(items, selected, all = '') {
  return (all ? `<option value="">${esc(t(all))}</option>` : '') + items.map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}
function visibleTasks() { return data.tasks.filter(t => !t.hidden); }
const highlightsOf = () => data.settings.highlights || [];
const highlightOf = task => task.highlightId ? highlightsOf().find(h => h.id === task.highlightId) : undefined;
const tagsOf = task => (data.settings.tags || []).filter(tag => task.tagIds?.includes(tag.id));
function tagChips(task) { return `<span class="tag-chips">${tagsOf(task).map(tag => pill(tag.name, tag.color, 'tag-pill')).join('')}</span>`; }
function tagPicker(task) {
  const tags = data.settings.tags || [];
  return `<fieldset class="field full task-tags" tabindex="-1"><legend>${esc(t('Tags'))}</legend><p class="muted">${esc(t(tags.length ? 'Seleziona uno o più tag. Gestiscili in Impostazioni › Tags.' : 'Nessun tag disponibile. Aggiungili in Impostazioni › Tags.'))}</p><div class="tag-options">${tags.map(tag => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${esc(tag.id)}" ${task.tagIds?.includes(tag.id) ? 'checked' : ''}>${pill(tag.name, tag.color, 'tag-pill')}</label>`).join('')}</div></fieldset>`;
}
function closeTagMenu(restoreFocus = false) {
  const menu = $('#tag-menu');
  if (!menu) return;
  const owner = document.querySelector(menu.dataset.owner);
  menu.remove();
  owner?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) owner?.focus({ preventScroll: true });
}
function openTagMenu(button, custom) {
  const id = button.dataset.taskTags, owner = custom ? `${custom.form ? '#' + custom.form.id : '#content'} [data-choice-picker="${CSS.escape(button.dataset.choicePicker)}"]` : `[data-task-tags="${CSS.escape(id)}"]`, same = $('#tag-menu')?.dataset.owner === owner;
  closeTagMenu();
  closeMarkMenu();
  if (same) return;
  const task = data.tasks.find(task => task.id === id);
  if (!task && !custom) return;
  const initial = new Set(custom ? custom.values : task.tagIds || []);
  const menu = document.createElement('form');
  menu.id = 'tag-menu';
  menu.dataset.task = id;
  menu.dataset.owner = owner;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', custom ? custom.field.name : t('Modifica tag') + ': ' + task.code);
  menu.innerHTML = (custom ? `<fieldset class="field full task-tags"><legend>${esc(custom.field.name)}</legend><p class="muted">${esc(t('Seleziona le etichette. Nomi e colori si gestiscono nella sezione dedicata delle impostazioni.'))}</p><div class="tag-options">${CustomColumns.choices(custom.field).map(option => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${esc(option.id)}" ${initial.has(option.id) ? 'checked' : ''}>${pill(option.name, option.color, 'tag-pill')}</label>`).join('')}</div></fieldset>` : tagPicker(task)) + ui`<div class="tag-menu-actions"><button type="button" class="button small" data-cancel-tags>Annulla</button><button type="submit" class="button small primary">Applica</button></div>`;
  (custom?.form ? $('#modal') : document.body).append(menu);
  positionTagMenu(menu);
  button.setAttribute('aria-expanded', 'true');
  menu.querySelector('[data-cancel-tags]').onclick = () => closeTagMenu(true);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeTagMenu(true); }
    if (event.key === 'Tab') {
      const inputs = [...menu.querySelectorAll('input,button')], index = inputs.indexOf(document.activeElement);
      if (event.shiftKey && index === 0 || !event.shiftKey && index === inputs.length - 1) {
        event.preventDefault(); inputs[event.shiftKey ? inputs.length - 1 : 0].focus();
      }
    }
  });
  menu.onsubmit = action(async event => {
    event.preventDefault();
    const chosen = new Set(new FormData(menu).getAll('tagIds'));
    const added = [...chosen].filter(id => !initial.has(id)), removed = [...initial].filter(id => !chosen.has(id));
    const submit = menu.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (custom) await custom.apply(added, removed, [...chosen]);
      else await commit(next => {
        const row = next.tasks.find(task => task.id === id);
        if (!row) throw new Error('Attività non più disponibile.');
        const known = new Set(next.settings.tags.map(tag => tag.id));
        row.tagIds = [...new Set([...(row.tagIds || []).filter(id => !removed.includes(id)), ...added])].filter(id => known.has(id));
      });
      closeTagMenu();
      if (!custom?.form) rerenderPreservingView();
      document.querySelector(owner)?.focus({ preventScroll: true });
    } finally { submit.disabled = false; }
  });
  (menu.querySelector('input') || menu.querySelector('button')).focus({ preventScroll: true });
}
document.addEventListener('pointerdown', event => {
  const menu = $('#tag-menu');
  if (menu && !menu.contains(event.target) && !event.target.closest('[data-task-tags], [data-choice-picker]')) closeTagMenu();
}, true);
function positionTagMenu(menu) {
  const owner = document.querySelector(menu.dataset.owner);
  if (!owner) { closeTagMenu(); return; }
  const rect = owner.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
}
window.addEventListener('scroll', event => {
  const menu = $('#tag-menu');
  if (!menu || menu.contains(event.target)) return;
  if (menu.closest('#modal')) positionTagMenu(menu); else closeTagMenu();
}, true);
window.addEventListener('resize', () => closeTagMenu());
function matchesHighlightFilter(task) {
  if (!highlightFilter) return true;
  if (highlightFilter === '__any') return Boolean(highlightOf(task));
  if (highlightFilter === '__none') return !highlightOf(task);
  return task.highlightId === highlightFilter;
}
const duplicatesOf = () => findDuplicates(data.tasks, data.issues);
const taskLabel = task => `#${task.sequence} ${task.code}${task.hidden ? ` (${t('nascosta')})` : ''}`;
// One line per duplicated incident, naming the other tasks or associations that share it.
function taskDuplicateLines(taskId, groups) {
  return groups.map(group => fillText('{0} è collegato anche a: {1}', group.incident, group.taskIds.filter(id => id !== taskId).map(id => taskLabel(data.tasks.find(task => task.id === id))).join(', ')));
}
function issueDuplicateLine(issueId, group, issues = data.issues) {
  const others = group.issueIds.filter(id => id !== issueId).map(id => issues.find(issue => issue.id === id)).map(issue => issue.problem.trim() ? `${issue.code} · ${issue.problem}` : issue.code);
  return fillText('{0} è presente anche in: {1}', group.incident, others.join(', '));
}
function filteredTasks(duplicates = duplicatesOf(), issues = search || Object.keys(columnFilters.tasks).length ? indexIssues(data.issues) : data.issues) {
  const needle = search.toLowerCase();
  return data.tasks.filter(t => (duplicatesOnly ? duplicates.tasks.has(t.id) : showHidden || !t.hidden) && (!statusFilter || t.statusId === statusFilter) && matchesHighlightFilter(t) && passesColumnFilters(t, 'tasks', issues) && (
    !search || [t.code, String(t.sequence), plain(t.description), plain(t.notes), highlightOf(t)?.name || '', ...tagsOf(t).map(tag => tag.name), ...Object.values(matchIssues(t, issues)).flat(), ...customSearchValues(t, 'tasks')].some(v => v.toLowerCase().includes(needle))
  ));
}
function paintTheme(theme) {
  for (const key of ['background', 'surface', 'text', 'accent']) document.documentElement.style.setProperty(`--${key}`, theme[key]);
  const rgb = theme.background.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  document.documentElement.style.colorScheme = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? 'light' : 'dark';
  windowChromeColors = { background: theme.background, text: theme.text };
  syncWindowChrome();
}
// The desktop window has no native title bar: the top bar drags it and the caption buttons take the theme colors.
const customTitleBar = () => window.workspace?.titleBarOverlay === true && typeof window.workspace.windowChrome === 'function';
let windowChromeColors = null, windowChromeKey = '', windowChromeSent = null;
function syncWindowChrome() {
  if (!customTitleBar() || !windowChromeColors) return;
  // The overlay stops above the top bar's bottom border, so the separator line runs under the caption buttons too.
  const request = { ...windowChromeColors, height: $('.topbar').clientHeight, dimmed: $('#modal').open };
  const key = JSON.stringify([request, devicePixelRatio]);
  if (key === windowChromeKey) return;
  windowChromeKey = key;
  windowChromeSent = request;
  window.workspace.windowChrome(request);
}
if (customTitleBar()) {
  document.documentElement.classList.add('custom-titlebar');
  new ResizeObserver(syncWindowChrome).observe($('.topbar'));
  new MutationObserver(syncWindowChrome).observe($('#modal'), { attributes: true, attributeFilter: ['open'] });
  // Page zoom changes the device pixel ratio but not the CSS height of the top bar.
  window.addEventListener('resize', syncWindowChrome);
}
function paintFontSizes(sizes) {
  const values = { ...defaultFontSizes(), ...sizes };
  for (const { id } of FONT_SIZE_PARTS) document.documentElement.style.setProperty(`--fs-${id}`, String(values[id] / 100));
}
function applyTheme() {
  paintTheme(data.settings.themes.find(t => t.id === data.settings.themeId));
  paintFontSizes(data.settings.fontSizes);
  paintFontFamily(data.settings.fontFamily);
  const organization = organizations.find(o => o.id === activeOrganizationId);
  document.title = browserMode() ? `${organization.name} · ${APP_NAME}` : APP_NAME;
  $('#brand-name').textContent = APP_NAME;
  const icon = $('link[rel="icon"]');
  if (icon) { icon.type = data.settings.logo ? 'image/png' : 'image/svg+xml'; icon.href = data.settings.logo || 'app-logo.svg'; }
  $('.brand-icon').innerHTML = `<img src="${data.settings.logo || 'app-logo.svg'}" alt="${esc(data.settings.logo ? organization.name : APP_NAME)}">`;
  $('.brand-icon').classList.add('has-logo');
}
function render() {
  closeMarkMenu();
  closeTagMenu();
  const content = $('#content'), nextView = ['tasks', 'issues', 'milestones', 'kanban', 'settings'][view];
  if (content.dataset.workspaceView !== nextView) content.scrollTop = 0;
  content.dataset.workspaceView = nextView;
  applyTheme();
  renderChrome();
  const duplicates = duplicatesOf(), alerts = [duplicates.tasks.size, duplicates.issues.size];
  const alert = i => {
    if (!alerts[i]) return '';
    const label = fillText(i ? '{0} associazioni con incident duplicato' : '{0} attività con incident duplicato', alerts[i]);
    return `<span class="nav-alert" title="${esc(label)}"><span aria-hidden="true">${alerts[i]}</span><span class="sr-only">${esc(label)}</span></span>`;
  };
  $('#navigation').innerHTML = data.settings.tabNames.map((name, i) => `<button class="nav-button ${view === i ? 'active' : ''}" data-view="${i}"><span class="nav-icon">${icons[i]}${alert(i)}</span><span>${esc(name)}</span>${i === 0 ? `<span class="nav-count">${visibleTasks().length}</span>` : ''}</button>`).join('');
  document.querySelectorAll('#navigation [data-view]').forEach(button => button.onclick = () => { view = Number(button.dataset.view); render(); });
  $('#settings-button').classList.toggle('active', view === 4);
  $('#current-tab').textContent = view === 4 ? t('Impostazioni') : data.settings.tabNames[view];
  if (view === 0) renderTasks();
  if (view === 1) renderIssues();
  if (view === 2) renderMilestones();
  if (view === 3) renderKanban();
  if (view === 4) renderSettings();
}
function adoptSnapshot(snapshot) {
  if (activeOrganizationId !== snapshot.activeOrganizationId) { columnFilters = { tasks: {}, issues: {} }; issueSearch = ''; }
  data = validateData(snapshot.data);
  for (const kind of ['tasks', 'issues']) columnFilters[kind] = Object.fromEntries(Object.entries(columnFilters[kind]).filter(([id]) => columnDef(id, kind)));
  for (const kind of ['tasks', 'issues']) for (const field of CustomColumns.fieldsOf(data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type))) {
    const filter = columnFilters[kind][field.id];
    if (filter) {
      const known = CustomColumns.choices(field).map(option => option.id);
      filter.values = filter.values.filter(value => known.includes(value));
      if (!CustomColumns.activeFilter(filter)) delete columnFilters[kind][field.id];
    }
  }
  dataFolder = snapshot.dataFolder;
  organizations = snapshot.organizations;
  activeOrganizationId = snapshot.activeOrganizationId;
  revision = snapshot.revision || '';
  appVersion = snapshot.appVersion || appVersion;
  browserUrl = snapshot.browserUrl ?? browserUrl;
  adoptions++;
}
function renderChrome() {
  document.documentElement.lang = data.settings.language;
  $('.brand small').textContent = t('IL TUO SPAZIO DI LAVORO');
  $('.workspace-label').innerHTML = ui`WORKSPACE <span>LOCALE</span>`;
  $('#settings-button').innerHTML = ui`<span class="nav-icon">⚙</span> Impostazioni`;
  $('.local-card strong').textContent = t('Solo sul tuo dispositivo');
  $('.local-card small').textContent = t('I tuoi dati. Sempre con te.');
  $('footer>span').innerHTML = ui`<i class="connection-dot"></i> Nessun cloud. Nessun account. Tutto sotto controllo.`;
  $('#folder-button').textContent = t('Apri cartella dati') + ' ↗';
  $('#global-search-label').textContent = t('Cerca');
  $('#global-search').title = t('Cerca in OrbitKanban (Ctrl+K)');
  renderConnectionStatus();
  $('#navigation').setAttribute('aria-label', t('Viste principali'));
  $('.organization-switcher label').textContent = t('Organizzazione');
  $('#manage-organizations').textContent = t('Gestisci organizzazioni');
  $('#organization-select').innerHTML = organizations.map(o => `<option value="${esc(o.id)}" ${o.id === activeOrganizationId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  $('#open-browser').textContent = t(browserMode() ? 'Apri in nuova scheda' : 'Apri nel browser') + ' ↗';
  $('#open-browser').disabled = !browserUrl;
  $('.version').innerHTML = `${browserMode() ? 'BROWSER' : 'PORTABLE'} EDITION <span id="app-version">${esc(appVersion ? `v${appVersion}` : '')}</span>`;
  updateHistoryButtons();
}
function renderConnectionStatus() {
  const status = $('#save-status');
  status.classList.toggle('offline', !online);
  status.innerHTML = !online ? ui`<i class="connection-dot"></i> App non raggiungibile` : browserMode() ? ui`<i class="connection-dot"></i> Sincronizzato con l’app` : ui`<i class="connection-dot"></i> Archivio locale`;
}
function sameOrganizations(list) {
  return list.length === organizations.length && list.every((o, i) => organizations[i].id === o.id && organizations[i].name === o.name);
}
function settingsDraftPending() {
  return view === 4 && Boolean($('#organization-name')) && (settingsChanged() || Boolean($('#create-organization-section')?.open));
}
function rerenderPreservingView() {
  const page = document.scrollingElement, pageScroll = [page.scrollLeft, page.scrollTop];
  const selectors = ['#content', '.table-scroll', '.milestone-scroll', '.kanban-scroll', '.theme-gallery', '.settings-nav'];
  const scrolls = selectors.map(selector => [...document.querySelectorAll(selector)].map(el => [el.scrollLeft, el.scrollTop]));
  const focused = document.activeElement, focusId = focused?.id || '';
  const selection = focusId && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  const issueQuery = $('#issue-search')?.value || '';
  render();
  if (issueQuery && $('#issue-search')) { $('#issue-search').value = issueQuery; $('#issue-search').dispatchEvent(new Event('input')); }
  selectors.forEach((selector, index) => document.querySelectorAll(selector).forEach((el, i) => { if (scrolls[index][i]) [el.scrollLeft, el.scrollTop] = scrolls[index][i]; }));
  page.scrollTo(...pageScroll);
  const element = focusId && document.getElementById(focusId);
  if (element && element !== document.activeElement) {
    element.focus({ preventScroll: true });
    if (selection) try { element.setSelectionRange(...selection); } catch {}
  }
}
function applyRemoteSnapshot(snapshot, previousId) {
  if (snapshot.activeOrganizationId !== previousId) {
    renderAfterModal = false;
    if ($('#modal').open) $('#modal').close();
    adoptSnapshot(snapshot);
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
    render();
    notify('L’organizzazione aperta è stata eliminata in un’altra finestra. Ora stai vedendo un’altra organizzazione.', true);
    return;
  }
  if (snapshot.revision === revision && sameOrganizations(snapshot.organizations)) return;
  const keepDraft = settingsDraftPending();
  adoptSnapshot(snapshot);
  if ($('#modal').open) { renderAfterModal = true; renderChrome(); return; }
  if (keepDraft) {
    renderChrome(); refreshSettingsState();
    notify('Dati aggiornati da un’altra finestra. Le impostazioni non salvate restano in sospeso: salvandole avranno la precedenza.');
    return;
  }
  rerenderPreservingView();
}
function flushPendingChange() {
  if (!pendingChange || saving || organizationBusy || refreshing) return;
  const info = pendingChange;
  pendingChange = null;
  setTimeout(() => onWorkspaceChange(info));
}
function onWorkspaceChange(info) {
  if (!data || !info) return;
  if (saving || organizationBusy || refreshing) { pendingChange = pendingChange?.forced ? pendingChange : info; return; }
  if (!info.forced) {
    const mine = info.organizations?.find(o => o.id === activeOrganizationId);
    if (mine && mine.revision === revision && sameOrganizations(info.organizations)) return;
  }
  refreshFromWorkspace();
}
async function refreshFromWorkspace() {
  refreshing = true;
  const generation = adoptions, previousId = activeOrganizationId;
  try {
    const snapshot = await workspaceApi.load(previousId);
    if (generation === adoptions) applyRemoteSnapshot(snapshot, previousId);
  } catch (error) {
    if (error.code !== 'offline') notify(error.message, true);
  } finally { refreshing = false; flushPendingChange(); }
}
function subscribe() {
  if (subscribed) return;
  subscribed = true;
  workspaceApi.onChange?.(onWorkspaceChange);
  workspaceApi.onConnection?.(value => {
    online = value;
    renderConnectionStatus();
    if (!value) { notify('OrbitKanban non è raggiungibile: riapri l’app sul PC e ricarica la pagina.', true); return; }
    notify('Connessione ripristinata.');
    pendingChange = { forced: true };
    flushPendingChange();
  });
}
function collectSettings() {
  settingsDraft.hoursPerDay = Number($('#hours-per-day').value);
  settingsDraft.language = $('#language').value;
  settingsDraft.portalUrlTemplate = normalizeUrl($('#portal-url-template').value);
  document.querySelectorAll('[data-tab-name]').forEach(input => { settingsDraft.tabNames[Number(input.dataset.tabName)] = input.value.trim(); });
  return settingsDraft;
}
function settingsChanged() {
  if (view !== 4 || !$('#organization-name')) return false;
  return pendingCustomColumns().length > 0 || JSON.stringify(collectSettings()) !== JSON.stringify(data.settings) || $('#organization-name').value.trim() !== organizations.find(o => o.id === activeOrganizationId).name;
}
const settingsTabs = [
  { id: 'identity', group: 'Organizzazione', icon: '◉', label: 'Identità & navigazione', panel: 'identity-panel', keys: ['tabNames', 'hoursPerDay', 'logo'] },
  { id: 'languages', group: 'Organizzazione', icon: '文', label: 'Lingua & traduzioni', panel: 'languages-panel', keys: ['language'] },
  { id: 'portal', group: 'Organizzazione', icon: '⇗', label: 'Link al portale', panel: 'portal-panel', keys: ['portalUrlTemplate'] },
  { id: 'organizations', group: 'Organizzazione', icon: '⌂', label: 'Organizzazioni', panel: 'organizations-panel', keys: [] },
  { id: 'themes', group: 'Aspetto', icon: '◐', label: 'Temi & atmosfera', panel: 'themes-panel', keys: ['themes', 'themeId'] },
  { id: 'fonts', group: 'Aspetto', icon: 'Aa', label: 'Font e dimensione del testo', panel: 'font-size-panel', keys: ['fontSizes', 'fontFamily'] },
  { id: 'statuses', group: 'Flusso di lavoro', icon: '☰', label: 'Stati del flusso', panel: 'statuses-panel', keys: ['statuses'] },
  { id: 'urgencies', group: 'Flusso di lavoro', icon: '⚑', label: 'Livelli di urgenza', panel: 'urgencies-panel', keys: ['urgencies'] },
  { id: 'highlights', group: 'Flusso di lavoro', icon: '✎', label: 'Evidenziatori', panel: 'highlights-panel', keys: ['highlights'] },
  { id: 'tags', group: 'Flusso di lavoro', icon: '#', label: 'Tags', panel: 'tags-panel', keys: ['tags'] },
  { id: 'columns', group: 'Flusso di lavoro', icon: '▥', label: 'Colonne della lista', panel: 'columns-panel', keys: ['taskColumns'] },
  { id: 'custom-columns', group: 'Flusso di lavoro', icon: '＋', label: 'Colonne personalizzate', panel: 'custom-columns-panel', keys: ['taskFields', 'issueFields', 'issueColumns'] },
  { id: 'transfer', group: 'Dati e accesso', icon: '⇅', label: 'Esporta e importa organizzazione', panel: 'transfer-panel', keys: [] },
  { id: 'storage', group: 'Dati e accesso', icon: '▣', label: 'Dati che viaggiano con te', panel: 'storage-panel', keys: [] },
  { id: 'browser', group: 'Dati e accesso', icon: '◍', label: 'Accesso da browser', panel: 'browser-panel', keys: [] }
];
function choiceSettingsTabs() {
  return ['tasks', 'issues'].flatMap((kind, index) => CustomColumns.fieldsOf(settingsDraft || data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type)).map(field => ({
    id: `choice-${kind}-${field.id}`, panel: `choice-${kind}-${field.id}-panel`, group: 'Etichette delle colonne', icon: '#',
    label: `${field.name} · ${data.settings.tabNames[index]}`, field, kind, custom: true, keys: [kind === 'tasks' ? 'taskFields' : 'issueFields']
  })));
}
const allSettingsTabs = () => [...settingsTabs, ...choiceSettingsTabs()];
// Ordered: the first matching pattern decides which settings tab holds the field to fix.
const settingsErrorTabs = [[/colonn[ae] personalizzat|opzioni della colonna|nomi e identificativi delle colonne/i, 'custom-columns'], [/\btags?\b/i, 'tags'], [/evidenziatori|highlighter/i, 'highlights'], [/colonne della lista|list columns/i, 'columns'], [/link portale|portal link/i, 'portal'], [/dimensioni del testo|text sizes|\bfont\b/i, 'fonts'], [/\b(?:temi|tema|themes?)\b/i, 'themes'], [/urgen/i, 'urgencies'], [/\b(?:stati|status|statuses)\b/i, 'statuses'], [/\b(?:lingua|language)\b/i, 'languages'], [/organizzazione|organization|\btab\b|ore per giorno|hours per day|logo/i, 'identity']];
function settingsNav() {
  const tabs = allSettingsTabs(), groups = [...new Set(tabs.map(tab => tab.group))];
  return `<nav class="settings-nav" aria-label="${esc(t('Sezioni delle impostazioni'))}">${groups.map((group, index) => `<div class="settings-nav-group" role="group" aria-labelledby="settings-group-${index}"><span class="settings-nav-label" id="settings-group-${index}">${esc(t(group))}</span>${tabs.filter(tab => tab.group === group).map(tab => `<button type="button" class="settings-tab" id="settings-tab-${tab.id}" data-settings-tab="${tab.id}" aria-controls="${tab.panel}"><span class="settings-tab-icon" aria-hidden="true">${tab.icon}</span><span class="settings-tab-text">${esc(tab.custom ? tab.label : t(tab.label))}</span><span class="settings-tab-dot" role="img" aria-label="${esc(t('Modifiche non salvate'))}" title="${esc(t('Modifiche non salvate'))}" hidden></span></button>`).join('')}</div>`).join('')}</nav>`;
}
function showSettingsTab(id, reveal = false) {
  const tabs = allSettingsTabs(), selected = tabs.find(tab => tab.id === id) || settingsTabs[0];
  settingsTab = selected.id;
  try { sessionStorage.setItem('orbitkanban.settingsTab', selected.id); } catch {}
  for (const tab of tabs) {
    const button = document.getElementById(`settings-tab-${tab.id}`), panel = document.getElementById(tab.panel);
    if (!button || !panel) continue;
    panel.hidden = tab !== selected;
    button.classList.toggle('active', tab === selected);
    if (tab === selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
  }
  if (selected.id === 'themes') revealChosenTheme();
  const layout = $('.settings-layout');
  if (reveal && layout && layout.getBoundingClientRect().top < 0) layout.scrollIntoView({ block: 'start' });
}
function wireSettingsNav() {
  $('#settings-page').addEventListener('click', event => {
    const target = event.target.closest('[data-settings-tab],[data-goto-settings-tab]');
    if (!target) return;
    const id = target.dataset.settingsTab || target.dataset.gotoSettingsTab;
    showSettingsTab(id, true);
    if (target.dataset.gotoSettingsTab) document.getElementById(`settings-tab-${id}`)?.focus();
  });
  $('#settings-page').addEventListener('keydown', event => {
    if (!event.target.closest('.settings-nav')) return;
    const tabs = [...document.querySelectorAll('.settings-tab')], index = tabs.indexOf(document.activeElement);
    const next = index < 0 ? undefined : { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    target.focus();
    showSettingsTab(target.dataset.settingsTab);
  });
}
function refreshSettingsState() {
  const banner = $('#unsaved-banner');
  if (!banner) return;
  const changed = settingsChanged();
  updateHistoryButtons();
  banner.hidden = !changed;
  const savedName = organizations.find(o => o.id === activeOrganizationId)?.name;
  const tabs = allSettingsTabs();
  const dirty = changed ? tabs.filter(tab => tab.custom ? JSON.stringify(tab.field) !== JSON.stringify(CustomColumns.fieldsOf(data.settings, tab.kind).find(field => field.id === tab.field.id)) : tab.keys.some(key => JSON.stringify(settingsDraft[key]) !== JSON.stringify(data.settings[key])) || (tab.id === 'custom-columns' && pendingCustomColumns().length > 0) || (tab.id === 'identity' && $('#organization-name').value.trim() !== savedName)) : [];
  for (const tab of tabs) {
    const dot = document.querySelector(`#settings-tab-${tab.id} .settings-tab-dot`);
    if (dot) dot.hidden = !dirty.includes(tab);
  }
  const where = $('#unsaved-where'), key = dirty.map(tab => tab.id).join();
  if (where && where.dataset.key !== key) {
    where.dataset.key = key;
    where.innerHTML = dirty.length ? `${esc(t('Sezioni modificate:'))} ${dirty.map(tab => `<button type="button" class="unsaved-link" data-goto-settings-tab="${tab.id}">${esc(tab.custom ? tab.label : t(tab.label))}</button>`).join(', ')}` : '';
  }
  $('#settings-page')?.style.setProperty('--unsaved-offset', changed ? `${banner.offsetHeight + 12}px` : '0px');
}
async function saveSettings() {
  try {
    if ($('#logo-file')?.disabled || $('#theme-image-file')?.disabled || $('#create-logo-file')?.disabled) throw new Error(t('Caricamento immagine…'));
    const settings = structuredClone(collectSettings());
    for (const form of pendingCustomColumns()) {
      const kind = form.dataset.addField, fields = CustomColumns.fieldsOf(settings, kind);
      fields.push(newCustomField(form));
      CustomColumns.validateFields(fields);
    }
    settings.taskColumns = normalizeTaskColumns(settings.taskColumns, settings.taskFields);
    settings.issueColumns = CustomColumns.normalizeIssueColumns(settings.issueColumns, settings.issueFields);
    const organizationName = $('#organization-name').value.trim();
    if (!organizationName || organizationName.length > 100) throw new Error(t('Nome organizzazione non valido.'));
    await commit(next => {
      for (const key of ['taskFields', 'issueFields']) {
        if (JSON.stringify(next.settings[key]) !== JSON.stringify(settingsBase[key]) && JSON.stringify(next.settings[key]) !== JSON.stringify(settings[key])) {
          throw new Error(t('Le colonne personalizzate sono cambiate in un’altra finestra. Annulla le modifiche alle impostazioni e riprova: i dati salvati non sono stati sovrascritti.'));
        }
      }
      next.settings = structuredClone(settings);
      const known = new Set((settings.highlights || []).map(h => h.id));
      for (const task of next.tasks) if (task.highlightId && !known.has(task.highlightId)) task.highlightId = '';
      const tags = new Set((settings.tags || []).map(tag => tag.id));
      for (const task of next.tasks) task.tagIds = (task.tagIds || []).filter(id => tags.has(id));
      for (const kind of ['tasks', 'issues']) {
        const ids = new Set(CustomColumns.fieldsOf(settings, kind).map(field => field.id));
        for (const record of next[kind]) if (record.customFields) record.customFields = Object.fromEntries(Object.entries(record.customFields).filter(([id]) => ids.has(id)));
        for (const field of CustomColumns.fieldsOf(settings, kind).filter(field => ['select', 'multiselect'].includes(field.type))) {
          const known = CustomColumns.choices(field).map(option => option.id);
          for (const record of next[kind]) {
            const value = record.customFields?.[field.id];
            if (value !== undefined) record.customFields[field.id] = Array.isArray(value) ? value.filter(id => known.includes(id)) : known.includes(value) ? value : '';
          }
          const clean = filters => { if (filters?.[field.id]) filters[field.id].values = filters[field.id].values.filter(id => known.includes(id)); };
          if (kind === 'tasks') for (const saved of next.settings.savedViews || []) clean(saved.columnFilters);
        }
      }
      const columnIds = normalizeTaskColumns(settings.taskColumns, settings.taskFields).map(column => column.id);
      for (const saved of next.settings.savedViews || []) {
        saved.columns = normalizeTaskColumns(saved.columns, settings.taskFields);
        saved.sort = saved.sort.filter(entry => !entry.key.startsWith('custom-') || columnIds.includes(entry.key));
        if (!saved.sort.length) saved.sort = [{ key: 'releaseDate', direction: 'asc' }];
        if (saved.columnFilters) saved.columnFilters = Object.fromEntries(Object.entries(saved.columnFilters).filter(([id]) => columnIds.includes(id)));
      }
    }, organizationName);
    statusFilter = '';
    activeSavedViewId = '';
  } catch (error) {
    const tab = settingsErrorTabs.find(([pattern]) => pattern.test(String(error?.message)))?.[1];
    if (tab && $('#settings-page')) showSettingsTab(tab, true);
    throw error;
  }
}
const settingsPrompts = {
  switch: ['Salvare le impostazioni prima di cambiare organizzazione?', 'Hai modifiche non salvate. Puoi salvarle oppure scartarle prima di cambiare organizzazione.', 'Scarta e cambia', 'Salva e cambia'],
  transfer: ['Salvare le impostazioni prima di continuare?', 'Hai modifiche non salvate: esportazione e importazione usano le impostazioni salvate. Puoi salvarle oppure scartarle prima di continuare.', 'Scarta e continua', 'Salva e continua']
};
async function withSavedSettings(callback, purpose = 'switch') {
  if (saving || organizationBusy) { notify('Un salvataggio è già in corso. Riprova tra un istante.', true); return; }
  if ($('#logo-file')?.disabled || $('#theme-image-file')?.disabled || $('#create-logo-file')?.disabled) { notify('Caricamento immagine…', true); return; }
  if (!settingsChanged()) { await callback(); return; }
  const [title, message, discard, save] = settingsPrompts[purpose].map(text => t(text));
  openModal(`<div class="modal-heading"><h2>${title}</h2></div><p class="confirm-message">${message}</p><div class="modal-actions"><button class="button" data-close>${t('Annulla')}</button><button class="button" id="discard-switch">${discard}</button><button class="button primary" id="save-switch">${save}</button></div>`);
  $('#discard-switch').onclick = action(async () => { $('#modal').close(); render(); await callback(); });
  $('#save-switch').onclick = action(async () => { await saveSettings(); $('#modal').close(); render(); await callback(); });
}
async function organizationAction(operation, payload) {
  if (saving || organizationBusy) throw new Error(t('Un salvataggio è già in corso. Riprova tra un istante.'));
  organizationBusy = true;
  $('#organization-select').disabled = true;
  try {
    adoptSnapshot(await workspaceApi.organization(operation, payload, activeOrganizationId));
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
    render();
  } finally { organizationBusy = false; $('#organization-select').disabled = false; flushPendingChange(); }
}
function openOrganizationSettings() {
  view = 4;
  settingsTab = 'organizations';
  render();
  $('#create-organization-section').open = true;
  $('#organizations-panel').scrollIntoView({ block: 'start' });
}
function wireOrganizationCreation() {
  const form = $('#create-organization'), fileInput = $('#create-logo-file'), preview = $('#create-logo-preview'), result = $('#create-logo-result');
  let logo = '', palette;
  fileInput.onchange = action(async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.disabled = true;
    form.querySelector('[type=submit]').disabled = true;
    result.textContent = t('Caricamento immagine…');
    try {
      const processed = await processLogo(file);
      if (!fileInput.isConnected) return;
      logo = processed.logo; palette = processed.palette;
      preview.innerHTML = `<img src="${logo}" alt="${esc(t('Logo della nuova organizzazione'))}"><div class="theme-swatches">${themeFields.map(([key, label]) => `<i style="background:${palette[key]}" title="${t(label)}: ${palette[key]}"></i>`).join('')}</div>`;
      result.textContent = t('Logo pronto: il tema verrà applicato alla nuova organizzazione.');
    } catch (error) { result.textContent = t(error.message); throw error; }
    finally { fileInput.disabled = false; fileInput.value = ''; form.querySelector('[type=submit]').disabled = false; }
  });
  $('#clear-create-logo').onclick = () => { logo = ''; palette = undefined; preview.innerHTML = ''; result.textContent = ''; };
  form.onsubmit = action(async event => {
    event.preventDefault();
    if (fileInput.disabled) throw new Error(t('Caricamento immagine…'));
    const fields = new FormData(form);
    const payload = { name: fields.get('name').trim(), language: fields.get('language'), logo, palette, demo: fields.has('demo') };
    await withSavedSettings(async () => {
      await organizationAction('create', payload);
      notify('Organizzazione creata.');
    });
  });
}
$('#organization-select').onchange = action(async event => {
  const id = event.target.value;
  event.target.value = activeOrganizationId;
  await withSavedSettings(() => organizationAction('switch', { id }));
});
$('#manage-organizations').onclick = action(() => withSavedSettings(openOrganizationSettings));
$('#content').addEventListener('dblclick', event => {
  if (event.button !== 0 || $('#modal').open || event.target.closest('button, a, input, select, textarea, [contenteditable], .select-cell')) return;
  const row = event.target.closest('tr[data-task-row], tr[data-issue-row]');
  if (!row) return;
  if (view === 0 && !highlighter && row.dataset.taskRow) {
    const task = data.tasks.find(item => item.id === row.dataset.taskRow);
    if (task) { event.preventDefault(); taskDialog(task); }
  } else if (view === 1 && row.dataset.issueRow) {
    const issue = data.issues.find(item => item.id === row.dataset.issueRow);
    if (issue) { event.preventDefault(); issueDialog(issue); }
  }
});
function heading(title, subtitle, buttons = '') {
  return `<section class="page-heading"><div><h1>${esc(title)}<span class="title-dot">.</span></h1><p>${esc(t(subtitle))}</p></div><div class="heading-actions">${buttons}</div></section>`;
}
function stats() {
  const tasks = visibleTasks();
  const releases = new Set(tasks.map(t => t.releaseDate).filter(Boolean));
  const hours = tasks.reduce((sum, t) => sum + t.effortHours, 0);
  const highlighted = tasks.filter(t => highlightOf(t) || data.settings.statuses.find(s => s.id === t.statusId)?.highlight).length;
  return ui`<div class="stats"><div class="stat"><span>Attività visibili <span class="stat-icon">▤</span></span><strong>${tasks.length}<small>nel tuo workspace</small></strong></div><div class="stat"><span>Release pianificate <span class="stat-icon mint">◈</span></span><strong>${releases.size}<small>prossime destinazioni</small></strong></div><div class="stat"><span>Effort complessivo <span class="stat-icon peach">◷</span></span><strong title="${hours.toLocaleString(locale())} ore totali">${effort(hours)}<small>${hours.toLocaleString(locale())} ore totali</small></strong></div><div class="stat"><span>In evidenza <span class="stat-icon pink">⚑</span></span><strong>${highlighted}<small>da tenere d'occhio</small></strong></div></div>`;
}
const taskColumnDefs = {
  sequence: { name: 'Progressivo', header: '#', sort: 'sequence' },
  code: { name: 'Codice portale', sort: 'code' },
  link: { name: 'Link portale' },
  description: { name: 'Descrizione' },
  urgency: { name: 'Urgenza', sort: 'urgencyId' },
  status: { name: 'Stato', sort: 'statusId' },
  highlight: { name: 'Evidenziazione', sort: 'highlightId' },
  tags: { name: 'Tags' },
  effort: { name: 'Effort', sort: 'effortHours' },
  incident: { name: 'Incident' },
  problem: { name: 'Problem' },
  releaseDate: { name: 'Release date', sort: 'releaseDate' },
  notes: { name: 'Note' }
};
const issueColumnDefs = { code: { name: 'Codice portale' }, incident: { name: 'Incident' }, problem: { name: 'Problem' }, linked: { name: 'Collegamento', type: 'number' } };
const fieldTypeNames = { text: 'Testo', richtext: 'Testo formattato', number: 'Numero', date: 'Data', select: 'Elenco a scelta singola', multiselect: 'Elenco a scelta multipla', url: 'Link', effort: 'Effort (ore)', boolean: 'Sì / No' };
function columnDef(id, kind = 'tasks', settings = data.settings) {
  const base = (kind === 'tasks' ? taskColumnDefs : issueColumnDefs)[id];
  if (base) return base;
  const field = CustomColumns.fieldsOf(settings, kind).find(field => field.id === id);
  return field ? { name: field.name, type: field.type, field, sort: kind === 'tasks' && ['number', 'date', 'effort', 'boolean', 'select'].includes(field.type) ? field.id : undefined } : undefined;
}
function columnName(id, kind = 'tasks') {
  const def = columnDef(id, kind);
  return def?.field ? def.name : t(def?.name || id);
}
const shownColumns = () => normalizeTaskColumns(data.settings.taskColumns, data.settings.taskFields).filter(column => column.visible).map(column => column.id);
const shownIssueColumns = () => CustomColumns.normalizeIssueColumns(data.settings.issueColumns, data.settings.issueFields).filter(column => column.visible).map(column => column.id);
function customText(value, field) {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'richtext') return plain(value);
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'boolean') return t(value ? 'Sì' : 'No');
  if (field.type === 'effort') return value === 0 ? '0h' : effort(value);
  if (['select', 'multiselect'].includes(field.type)) return CustomColumns.choices(field).filter(option => Array.isArray(value) ? value.includes(option.id) : value === option.id).map(option => option.name).join(', ');
  return Array.isArray(value) ? value.join(', ') : String(value);
}
function customSearchValues(record, kind) { return CustomColumns.fieldsOf(data.settings, kind).map(field => customText(record.customFields?.[field.id], field)); }
function choiceButton(record, field, kind, values = record.customFields?.[field.id] || []) {
  const chips = CustomColumns.choices(field).filter(option => values.includes(option.id)).map(option => pill(option.name, option.color, 'tag-pill')).join('');
  return `<button type="button" class="task-tags-button" data-choice-picker="${esc(`${kind}:${record.id}:${field.id}`)}" data-choice-kind="${kind}" data-choice-record="${esc(record.id)}" data-choice-field="${field.id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(field.name)}"><span class="tag-chips">${chips || `<span class="muted">+ ${esc(field.name)}</span>`}</span><span aria-hidden="true"> ▾</span></button>`;
}
function wireChoicePickers() {
  document.querySelectorAll('[data-choice-picker]').forEach(button => button.onclick = () => {
    const kind = button.dataset.choiceKind, id = button.dataset.choiceRecord, fieldId = button.dataset.choiceField, form = button.closest('#task-form, #issue-form');
    const field = CustomColumns.fieldsOf(data.settings, kind).find(field => field.id === fieldId);
    const record = data[kind].find(record => record.id === id);
    if (!field || !record && !form) { notify('L’elemento non esiste più.', true); return; }
    const values = form ? new FormData(form).getAll(fieldId) : record.customFields?.[fieldId] || [];
    openTagMenu(button, { field, values, form, apply: async (added, removed, chosen) => {
      if (form) {
        const container = button.parentElement;
        container.innerHTML = choiceButton({ id }, field, kind, chosen) + chosen.map(value => `<input type="hidden" name="${fieldId}" value="${esc(value)}">`).join('');
        wireChoicePickers();
      } else await commit(next => {
        const row = next[kind].find(row => row.id === id), current = CustomColumns.fieldsOf(next.settings, kind).find(field => field.id === fieldId);
        if (!row || !current) throw new Error(t('L’elemento non esiste più.'));
        const known = CustomColumns.choices(current).map(option => option.id);
        if (added.some(id => !known.includes(id))) throw new Error(t('Il catalogo è cambiato. Riapri il menu delle etichette.'));
        (row.customFields ||= {})[fieldId] = [...new Set([...(row.customFields[fieldId] || []).filter(id => !removed.includes(id)), ...added])];
      });
    } });
  });
}
function customCell(record, field, kind = 'tasks') {
  const value = record.customFields?.[field.id], text = customText(value, field);
  if (field.type === 'multiselect') return `<td class="tags-cell custom-cell">${choiceButton(record, field, kind)}</td>`;
  if (field.type === 'select') { const option = CustomColumns.choices(field).find(option => option.id === value); return `<td class="custom-cell">${option ? pill(option.name, option.color, 'tag-pill') : '—'}</td>`; }
  const html = field.type === 'url' && value ? `<a href="${esc(value)}" data-open-url>${esc(value)} ↗</a>` :
    field.type === 'date' && value ? `<span class="date-pill" style="--date:${dateColor(value)}">${esc(text)}</span>` : esc(text || '—');
  return `<td class="custom-cell" title="${esc(text)}"><span>${html}</span></td>`;
}
function filterSpec(id, kind) {
  if (id === 'linked') return { type: 'number' };
  const key = { link: 'url', status: 'statusId', urgency: 'urgencyId', highlight: 'highlightId', tags: 'tagIds', effort: 'effortHours' }[id] || id;
  return Csv.destinations(data, kind).find(field => field.id === key) || { type: 'text' };
}
function columnValue(record, id, kind, context) {
  const field = columnDef(id, kind)?.field;
  if (field) return field.type === 'richtext' ? plain(record.customFields?.[id] || '') : record.customFields?.[id];
  if (kind === 'issues') return id === 'linked' ? context.get(record.code.trim().toUpperCase()) || 0 : record[id];
  if (id === 'incident' || id === 'problem') return matchIssues(record, context)[id === 'incident' ? 'incidents' : 'problems'];
  if (id === 'description' || id === 'notes') return plain(record[id]);
  if (id === 'link') return portalUrl(record, data.settings);
  return record[{ status: 'statusId', urgency: 'urgencyId', highlight: 'highlightId', tags: 'tagIds', effort: 'effortHours' }[id] || id];
}
function passesColumnFilters(record, kind, context) {
  return Object.entries(columnFilters[kind]).every(([id, filter]) => CustomColumns.matchesFilter(columnValue(record, id, kind, context), filter, columnDef(id, kind)?.type || ({ sequence: 'number', effort: 'effort', releaseDate: 'date', linked: 'number' }[id] || 'text')));
}
function filterHeader(id, kind) {
  const active = CustomColumns.activeFilter(columnFilters[kind][id]);
  return `<button type="button" class="column-filter-button ${active ? 'active' : ''}" data-filter-column="${esc(id)}" aria-haspopup="dialog" aria-label="${esc(t('Filtra colonna') + ': ' + columnName(id, kind))}" title="${esc(t('Filtra colonna'))}">▽</button>`;
}
function columnFilterBar(kind) {
  const ids = Object.keys(columnFilters[kind]);
  return ids.length ? `<div class="column-filter-bar">${ids.map(id => `<button class="button small" data-filter-column="${esc(id)}">${esc(columnName(id, kind))} ▾</button>`).join('')}<button class="button small subtle" data-clear-column-filters>${esc(t('Azzera filtri colonne'))}</button></div>` : '';
}
function wireColumnFilters(kind) {
  document.querySelectorAll('#content [data-filter-column]').forEach(button => button.onclick = () => columnFilterDialog(button.dataset.filterColumn, kind));
  const clear = $('#content [data-clear-column-filters]');
  if (clear) clear.onclick = () => { columnFilters[kind] = {}; clearActiveSavedView(); rerenderPreservingView(); };
}
function columnFilterDialog(id, kind) {
  const filter = structuredClone(columnFilters[kind][id] || CustomColumns.emptyFilter()), spec = filterSpec(id, kind);
  const range = ['number', 'effort', 'date'].includes(spec.type), options = spec.type === 'boolean' ? [{ value: 'true', name: t('Sì') }, { value: 'false', name: t('No') }] : spec.options;
  openModal(`<form id="column-filter-form"><div class="modal-heading"><h2>${esc(t('Filtra colonna') + ': ' + columnName(id, kind))}</h2></div><div class="form-grid">
    ${range ? `<label class="field">${esc(t('Da'))}<input name="min" type="${spec.type === 'date' ? 'date' : 'number'}" step="any" value="${esc(filter.min)}"></label><label class="field">${esc(t('A'))}<input name="max" type="${spec.type === 'date' ? 'date' : 'number'}" step="any" value="${esc(filter.max)}"></label>` :
      options ? `<fieldset class="field full filter-options"><legend>${esc(t('Valori ammessi'))}</legend>${options.map(option => `<label><input type="checkbox" name="values" value="${esc(option.value)}" ${filter.values.includes(String(option.value)) ? 'checked' : ''}> ${esc(option.name)}</label>`).join('')}</fieldset>` :
        `<label class="field full">${esc(t('Contiene'))}<input name="text" maxlength="200" value="${esc(filter.text)}"></label>`}
    <label class="field full">${esc(t('Celle vuote'))}<select name="empty">${[['any', 'Tutte'], ['empty', 'Solo vuote'], ['filled', 'Solo valorizzate']].map(([value, label]) => `<option value="${value}" ${value === filter.empty ? 'selected' : ''}>${esc(t(label))}</option>`).join('')}</select></label>
    </div><div class="modal-actions"><button type="button" class="button" id="clear-one-filter">${esc(t('Rimuovi filtro'))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(t('Annulla'))}</button><button class="button primary" type="submit">${esc(t('Applica'))}</button></div></form>`);
  const apply = value => { if (CustomColumns.activeFilter(value)) columnFilters[kind][id] = value; else delete columnFilters[kind][id]; clearActiveSavedView(); $('#modal').close(); rerenderPreservingView(); };
  $('#clear-one-filter').onclick = () => apply(CustomColumns.emptyFilter());
  $('#column-filter-form').onsubmit = action(event => {
    event.preventDefault();
    const fields = new FormData(event.target), next = { text: String(fields.get('text') || '').trim(), min: String(fields.get('min') || ''), max: String(fields.get('max') || ''), values: fields.getAll('values'), empty: fields.get('empty') };
    if (next.min && next.max && (spec.type === 'date' ? next.min > next.max : Number(next.min) > Number(next.max))) throw new Error(t('Il limite minimo supera il massimo.'));
    if (!CustomColumns.validFilters({ [id]: next }, [id], { [id]: spec.type })) throw new Error(t('Filtro colonna non valido.'));
    apply(next);
  });
}
function sortedRows(tasks) {
  const highlights = highlightsOf();
  const ranked = tasks.map(t => {
    const highlightRank = highlights.findIndex(h => h.id === t.highlightId);
    return { ...t,
      ...Object.fromEntries(CustomColumns.fieldsOf(data.settings, 'tasks').map(field => [field.id, field.type === 'select' ? (t.customFields?.[field.id] ? CustomColumns.choices(field).findIndex(option => option.id === t.customFields[field.id]) : '') : t.customFields?.[field.id] ?? ''])),
      urgencyRank: data.settings.urgencies.findIndex(s => s.id === t.urgencyId),
      statusRank: data.settings.statuses.findIndex(s => s.id === t.statusId),
      highlightRank: highlightRank < 0 ? '' : highlightRank
    };
  });
  const keys = { urgencyId: 'urgencyRank', statusId: 'statusRank', highlightId: 'highlightRank' };
  return sortTasks(ranked, sort.map(s => ({ ...s, key: keys[s.key] || s.key })));
}
function renderTasks() {
  const hidden = data.tasks.filter(t => t.hidden).length, highlights = highlightsOf(), columns = shownColumns(), duplicateCount = duplicatesOf().tasks.size;
  const savedViews = data.settings.savedViews || [];
  if (activeSavedViewId && !savedViews.some(saved => saved.id === activeSavedViewId)) activeSavedViewId = '';
  if (duplicatesOnly && !duplicateCount) duplicatesOnly = false;
  if (highlightFilter && !['__any', '__none'].includes(highlightFilter) && !highlights.some(h => h.id === highlightFilter)) highlightFilter = '';
  if (highlighter && highlighter !== 'erase' && !highlights.some(h => h.id === highlighter)) highlighter = '';
  if (highlighter === 'erase' && !highlights.length) highlighter = '';
  const sortable = [...columns.map(id => columnDef(id).sort).filter(Boolean), 'sequence'];
  sort = sort.filter(s => sortable.includes(s.key));
  if (!sort.length) sort = [{ key: 'releaseDate', direction: 'asc' }];
  const highlightOptions = [['', 'Tutte le evidenziazioni'], ['__any', 'Solo evidenziate'], ['__none', 'Senza evidenziazione']].map(([value, label]) => `<option value="${value}" ${value === highlightFilter ? 'selected' : ''}>${esc(t(label))}</option>`).join('') +
    highlights.map(h => `<option value="${esc(h.id)}" ${h.id === highlightFilter ? 'selected' : ''}>● ${esc(h.name)}</option>`).join('');
  const savedViewOptions = `<option value="">${esc(t('Viste salvate…'))}</option>` + savedViews.map(saved => `<option value="${esc(saved.id)}" ${saved.id === activeSavedViewId ? 'selected' : ''}>${esc(saved.name)}</option>`).join('');
  const headers = columns.map(id => {
    const def = columnDef(id), label = esc(def.header || (def.field ? def.name : t(def.name))), current = def.sort && sort.find(s => s.key === def.sort);
    const title = def.header ? ` title="${esc(t(def.name))}"` : '';
    return `<th data-column="${id}"${title}><div class="column-heading">${def.sort ? ui`<button data-sort="${def.sort}" title="Clic per ordinare; Maiusc+clic per ordinamento multiplo">${label} <span>${current ? (current.direction === 'asc' ? '↑' : '↓') + (sort.length > 1 ? sort.indexOf(current) + 1 : '') : '↕'}</span></button>` : `<span>${label}</span>`}${filterHeader(id, 'tasks')}</div></th>`;
  }).join('');
  $('#content').innerHTML = heading(data.settings.tabNames[0], 'Tutte le attività, una direzione. Pianifica il lavoro e tieni a fuoco le prossime release.',
    csvButton('tasks') + excelButton() + ui`<button class="button primary" id="new-task">＋ Nuova attività</button>`) + stats() +
    ui`<section class="panel"><div class="table-toolbar"><div class="search-wrap"><span>⌕</span><input id="search" aria-label="Cerca attività" placeholder="Cerca codice, descrizione, incident…" value="${esc(search)}"></div><div class="filters"><select id="status-filter" aria-label="Filtra stato">${optionList(data.settings.statuses, statusFilter, 'Tutti gli stati')}</select><select id="highlight-filter" aria-label="Filtra evidenziazione">${highlightOptions}</select><label class="toggle-label"><input id="show-hidden" type="checkbox" ${showHidden ? 'checked' : ''}> Nascoste <span class="tiny-count">${hidden}</span></label><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Mostra solo le attività con un incident collegato anche ad altre attività, comprese quelle nascoste"><input id="duplicates-only" type="checkbox" ${duplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicati <span class="tiny-count">${duplicateCount}</span></label><div class="saved-view-tools"><select id="saved-view-select" aria-label="Carica una vista salvata">${savedViewOptions}</select><button type="button" class="button subtle" id="saved-view-manage" aria-haspopup="dialog">Viste</button></div><button class="button subtle" id="columns-button" aria-haspopup="dialog" title="Scegli quali colonne mostrare e in che ordine">▥ Colonne</button><button class="button subtle" id="reset-sort" title="Ripristina ordinamento release crescente">↕ Release</button></div></div><div class="highlighter-bar"></div><div class="table-scroll"><table class="activity-table"><thead><tr><th class="select-col"><input type="checkbox" id="select-all" aria-label="Seleziona tutte le attività mostrate" title="Seleziona tutte le attività mostrate"></th>${headers}<th><span class="sr-only">Azioni</span></th></tr></thead><tbody id="task-rows"></tbody></table></div><div class="table-footer"><span id="row-count"></span><span id="footer-hint">Maiusc + clic su una colonna per ordinare su più livelli</span><div class="bulk-bar" id="bulk-bar" role="toolbar" aria-label="Azioni sulle attività selezionate" hidden><strong id="bulk-count"></strong><button type="button" class="button small primary" id="bulk-edit">✎ Modifica multipla…</button><button type="button" class="button small" id="bulk-excel">⤓ Esporta in Excel</button><button type="button" class="button small subtle" id="bulk-clear">Deseleziona</button></div></div></section><div class="hint"><span>✧</span> Un unico archivio, quattro prospettive. Issue, milestone e kanban si aggiornano automaticamente.</div>`;
  drawHighlighter();
  drawTaskRows();
  $('.table-scroll').insertAdjacentHTML('beforebegin', columnFilterBar('tasks'));
  wireColumnFilters('tasks');
  wireCsvImport('tasks');
  $('#new-task').onclick = () => taskDialog();
  $('#search').oninput = event => { search = event.target.value; clearActiveSavedView(); drawTaskRows(); };
  $('#status-filter').onchange = event => { statusFilter = event.target.value; clearActiveSavedView(); drawTaskRows(); };
  $('#highlight-filter').onchange = event => { highlightFilter = event.target.value; clearActiveSavedView(); drawTaskRows(); };
  $('#show-hidden').onchange = event => { showHidden = event.target.checked; clearActiveSavedView(); drawTaskRows(); };
  $('#duplicates-only').onchange = event => { duplicatesOnly = event.target.checked; clearActiveSavedView(); drawTaskRows(); };
  $('#saved-view-select').onchange = action(async event => { if (event.target.value) await applySavedView(event.target.value); });
  $('#saved-view-manage').onclick = () => openSavedViews();
  $('#columns-button').onclick = () => columnsDialog();
  $('#reset-sort').onclick = () => { sort = [{ key: 'releaseDate', direction: 'asc' }]; clearActiveSavedView(); renderTasks(); };
  document.querySelectorAll('[data-sort]').forEach(button => button.onclick = event => {
    const key = button.dataset.sort, old = sort.find(s => s.key === key);
    const entry = { key, direction: old?.direction === 'asc' ? 'desc' : 'asc' };
    sort = event.shiftKey ? [...sort.filter(s => s.key !== key), entry] : [entry];
    clearActiveSavedView();
    renderTasks();
  });
  // While a highlighter is active, a click anywhere on a row colors it instead of opening links or the task.
  $('#task-rows').addEventListener('click', event => {
    const row = highlighter && event.target.closest('tr[data-task-row]');
    if (!row || event.target.closest('.select-cell, [data-task-tags], [data-choice-picker]')) return;
    event.preventDefault();
    event.stopPropagation();
    paintRow(row);
  }, true);
  $('#task-rows').addEventListener('click', event => {
    const box = event.target.closest('input[data-select-task]');
    if (box) selectTaskRows(box, event.shiftKey);
  });
  $('#select-all').onchange = event => {
    for (const box of document.querySelectorAll('#task-rows input[data-select-task]')) {
      if (event.target.checked) selectedTasks.add(box.dataset.selectTask); else selectedTasks.delete(box.dataset.selectTask);
    }
    selectionAnchor = '';
    drawSelection();
  };
  $('#bulk-edit').onclick = () => bulkDialog([...selectedTasks]);
  $('#bulk-excel').onclick = () => excelDialog({ scope: 'selected' });
  $('#bulk-clear').onclick = () => clearSelection();
}
function clearActiveSavedView() {
  if (!activeSavedViewId) return;
  activeSavedViewId = '';
  const select = $('#saved-view-select');
  if (select) select.value = '';
}
function savedViewSnapshot(name, id = uid()) {
  return {
    id, name: name.trim(), search, statusFilter, highlightFilter, showHidden, duplicatesOnly,
    sort: structuredClone(sort), columns: normalizeTaskColumns(data.settings.taskColumns, data.settings.taskFields), columnFilters: structuredClone(columnFilters.tasks)
  };
}
function savedViewSummary(saved) {
  const status = data.settings.statuses.find(item => item.id === saved.statusFilter)?.name;
  const mark = highlightsOf().find(item => item.id === saved.highlightFilter)?.name;
  const columns = saved.columns.filter(column => column.visible).length;
  const order = saved.sort.map(item => `${columnDef(item.key) ? columnName(item.key) : t(Object.values(taskColumnDefs).find(column => column.sort === item.key)?.name || item.key)} ${item.direction === 'asc' ? '↑' : '↓'}`).join(', ');
  return [saved.search && fillText('Ricerca: {0}', saved.search), status && fillText('Stato: {0}', status), mark && fillText('Evidenziazione: {0}', mark),
    saved.highlightFilter === '__any' && t('Solo evidenziate'), saved.highlightFilter === '__none' && t('Senza evidenziazione'),
    saved.showHidden && t('Include nascoste'), saved.duplicatesOnly && t('Solo duplicati'),
    fillText('{0} colonne', columns), ...Object.keys(saved.columnFilters || {}).map(id => columnName(id)), order && fillText('Ordine: {0}', order)].filter(Boolean).join(' · ') || t('Tutte le attività');
}
async function saveSavedView(name, existingId = '') {
  const normalized = name.trim();
  if (!normalized || normalized.length > 60) throw new Error(t('Il nome della vista deve contenere da 1 a 60 caratteri.'));
  const saved = savedViewSnapshot(normalized, existingId || uid());
  await commit(next => {
    const list = next.settings.savedViews || (next.settings.savedViews = []);
    const duplicate = list.find(item => item.id !== saved.id && item.name.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase());
    if (duplicate) throw new Error(t('Esiste già una vista con questo nome.'));
    const index = list.findIndex(item => item.id === saved.id);
    if (index >= 0) list[index] = saved;
    else {
      if (list.length >= 30) throw new Error(t('Hai raggiunto il limite di 30 viste salvate.'));
      list.push(saved);
    }
  });
  activeSavedViewId = saved.id;
  $('#modal').close();
  rerenderPreservingView();
  notify(existingId ? 'Vista aggiornata.' : 'Vista salvata.');
}
async function applySavedView(id) {
  const saved = (data.settings.savedViews || []).find(item => item.id === id);
  if (!saved) throw new Error(t('La vista salvata non esiste più.'));
  const columns = normalizeTaskColumns(saved.columns, data.settings.taskFields);
  if (JSON.stringify(columns) !== JSON.stringify(normalizeTaskColumns(data.settings.taskColumns, data.settings.taskFields))) {
    await commit(next => { next.settings.taskColumns = structuredClone(columns); });
  }
  search = saved.search;
  statusFilter = data.settings.statuses.some(item => item.id === saved.statusFilter) ? saved.statusFilter : '';
  highlightFilter = ['__any', '__none'].includes(saved.highlightFilter) || highlightsOf().some(item => item.id === saved.highlightFilter) ? saved.highlightFilter : '';
  showHidden = saved.showHidden;
  duplicatesOnly = saved.duplicatesOnly;
  columnFilters.tasks = structuredClone(saved.columnFilters || {});
  sort = structuredClone(saved.sort);
  activeSavedViewId = saved.id;
  $('#modal').open && $('#modal').close();
  render();
  notify(fillText('Vista «{0}» applicata.', saved.name));
}
function renderSavedViewList() {
  const list = $('#saved-view-list');
  if (!list) return;
  const savedViews = data.settings.savedViews || [];
  list.innerHTML = savedViews.length ? savedViews.map(saved => `<article class="saved-view-item"><div class="saved-view-info"><strong>${esc(saved.name)}</strong><small>${esc(savedViewSummary(saved))}</small></div><button type="button" class="button small primary" data-view-action="apply" data-view-id="${esc(saved.id)}">${esc(t('Apri'))}</button><button type="button" class="button small" data-view-action="update" data-view-id="${esc(saved.id)}">${esc(t('Aggiorna'))}</button><button type="button" class="button small danger" data-view-action="delete" data-view-id="${esc(saved.id)}" aria-label="${esc(fillText('Elimina vista {0}', saved.name))}">✕</button></article>`).join('') : `<p class="backup-empty">${esc(t('Non hai ancora salvato viste.'))}</p>`;
}
function openSavedViews() {
  openModal(ui`<div class="modal-heading"><div><div class="eyebrow">${esc(t('ATTIVITÀ'))}</div><h2>${esc(t('Viste salvate'))}</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div><p class="section-description">${esc(t('Salva filtri, ordinamento e colonne per riapplicarli con un clic. Le viste appartengono solo a questa organizzazione.'))}</p><form id="saved-view-form" class="form-grid"><label class="field full">${esc(t('Nome vista'))}<input name="name" maxlength="60" required autocomplete="off" placeholder="${esc(t('Es. Prossima release'))}"></label><div class="modal-actions full"><span class="spacer"></span><button type="submit" class="button primary">${esc(t('Salva vista corrente'))}</button></div></form><div class="saved-view-list" id="saved-view-list"></div>`);
  const form = $('#saved-view-form');
  form.onsubmit = action(async event => { event.preventDefault(); await saveSavedView(new FormData(form).get('name')); });
  $('#saved-view-list').onclick = action(async event => {
    const button = event.target.closest('[data-view-action]');
    if (!button) return;
    const saved = (data.settings.savedViews || []).find(item => item.id === button.dataset.viewId);
    if (!saved) throw new Error(t('La vista salvata non esiste più.'));
    if (button.dataset.viewAction === 'apply') return applySavedView(saved.id);
    if (button.dataset.viewAction === 'update') return saveSavedView(saved.name, saved.id);
    if (button.dataset.viewAction === 'delete') confirmDialog('Eliminare la vista salvata?', saved.name, async () => {
      await commit(next => { next.settings.savedViews = (next.settings.savedViews || []).filter(item => item.id !== saved.id); });
      if (activeSavedViewId === saved.id) activeSavedViewId = '';
      rerenderPreservingView();
      notify('Vista eliminata.');
    });
  });
  renderSavedViewList();
}
function taskCell(column, task, status, urgency, links, duplicateGroups = []) {
  const none = '<span class="muted">—</span>';
  switch (column) {
    case 'sequence': return `<td class="sequence">${task.sequence}</td>`;
    case 'code': return `<td><button class="code-link" data-edit-task="${task.id}">${esc(task.code)}</button>${portalAnchor(portalUrl(task, data.settings), task.code)}</td>`;
    case 'link': {
      const url = portalUrl(task, data.settings);
      return `<td class="link-cell">${url ? `<a class="portal-link" href="${esc(url)}" data-open-url title="${esc(t('Apri nel browser predefinito') + ': ' + url)}">${esc(url.replace(/^https?:\/\//i, ''))}</a>` : none}</td>`;
    }
    case 'description': return `<td class="description-col"><button class="description-cell" data-edit-task="${task.id}" title="${esc(plain(task.description))}">${esc(plain(task.description) || t('Senza descrizione'))}</button></td>`;
    case 'urgency': return `<td>${pill(urgency.name, urgency.color)}</td>`;
    case 'status': return `<td>${pill(status.name, status.color, 'status-pill')}</td>`;
    case 'highlight': { const mark = highlightOf(task); return `<td>${mark ? pill(mark.name, mark.color, 'mark-pill') : none}</td>`; }
    case 'tags': return `<td class="tags-cell"><button type="button" class="task-tags-button" data-task-tags="${esc(task.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(t('Modifica tag'))}" title="${esc(t('Modifica tag'))}">${tagsOf(task).length ? tagChips(task) : `<span class="muted">+ ${esc(t('Tags'))}</span>`}<span aria-hidden="true"> ▾</span></button></td>`;
    case 'effort': return `<td class="effort-cell">${effort(task.effortHours)}</td>`;
    case 'incident': {
      const groups = new Map(duplicateGroups.map(group => [group.key, group]));
      return `<td class="references">${links.incidents.map(incident => {
        const group = groups.get(incident.trim().toUpperCase());
        return group ? `<button type="button" class="dup-ref" data-dup-incident="${esc(group.incident)}" title="${esc(taskDuplicateLines(task.id, [group])[0] + '\n' + t('Clic per vedere solo le attività coinvolte.'))}">⧉ ${esc(incident)}</button>` : esc(incident);
      }).join('<br>') || none}</td>`;
    }
    case 'problem': return `<td class="references">${links.problems.map(esc).join('<br>') || none}</td>`;
    case 'releaseDate': return `<td><span class="date-pill" style="--date:${task.releaseDate ? dateColor(task.releaseDate) : '#929bb2'}">◷ ${formatDate(task.releaseDate)}</span></td>`;
    case 'notes': return `<td class="notes-col"><button class="description-cell notes-cell" data-edit-task="${task.id}" title="${esc(plain(task.notes) || t('Aggiungi note'))}">${esc(plain(task.notes) || t('Aggiungi note'))}</button></td>`;
    default: return columnDef(column)?.field ? customCell(task, columnDef(column).field) : '<td></td>';
  }
}
function drawTaskRows() {
  const duplicates = duplicatesOf(), issues = indexIssues(data.issues), tasks = sortedRows(filteredTasks(duplicates, issues)), columns = shownColumns();
  $('#task-rows').innerHTML = tasks.map(task => {
    const status = data.settings.statuses.find(s => s.id === task.statusId), urgency = data.settings.urgencies.find(s => s.id === task.urgencyId);
    const links = matchIssues(task, issues), mark = highlightOf(task), duplicateGroups = duplicates.tasks.get(task.id) || [];
    const classes = [status.highlight ? 'highlighted' : '', mark ? 'marked' : '', task.hidden ? 'hidden-row' : '', duplicateGroups.length ? 'duplicate-row' : '', selectedTasks.has(task.id) ? 'selected' : ''].filter(Boolean).join(' ');
    const markLabel = mark ? fillText('Evidenziazione: {0}', mark.name) : t('Evidenzia riga');
    const duplicateLabel = duplicateGroups.length ? [t('Possibile duplicato'), ...taskDuplicateLines(task.id, duplicateGroups)].join('\n') : '';
    const duplicateFlag = duplicateGroups.length ? `<button type="button" class="icon-button dup-flag" data-dup-incident="${esc(duplicateGroups[0].incident)}" title="${esc(duplicateLabel + '\n' + t('Clic per vedere solo le attività coinvolte.'))}" aria-label="${esc(duplicateLabel.replaceAll('\n', '. '))}">⧉</button>` : '';
    const selectLabel = fillText('Seleziona {0}', task.code);
    return `<tr data-task-row="${esc(task.id)}" title="${esc(t('Doppio clic sulla riga per modificare.'))}" class="${classes}" style="--row-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><td class="select-cell"><label class="select-hit" title="${esc(selectLabel + '\n' + t('Maiusc + clic per selezionare un intervallo.'))}"><input type="checkbox" data-select-task="${esc(task.id)}" ${selectedTasks.has(task.id) ? 'checked' : ''} aria-label="${esc(selectLabel)}"></label></td>${columns.map(column => taskCell(column, task, status, urgency, links, duplicateGroups)).join('')}<td class="row-actions">${duplicateFlag}<button type="button" class="icon-button mark-button ${mark ? 'is-marked' : ''}" data-mark-task="${esc(task.id)}" title="${esc(markLabel)}" aria-label="${esc(markLabel)}" aria-haspopup="menu" aria-expanded="false"><i class="mark-dot"></i></button><button class="icon-button" data-toggle-task="${task.id}" title="${esc(t(task.hidden ? 'Mostra attività' : 'Nascondi attività'))}">${task.hidden ? '◉' : '◌'}</button><button class="icon-button" data-edit-task="${task.id}" title="${esc(t('Modifica attività'))}">⋯</button></td></tr>`;
  }).join('') || `<tr><td colspan="${columns.length + 2}" class="empty">${esc(t('Nessuna attività trovata. Crea una nuova attività o modifica i filtri.'))}</td></tr>`;
  document.querySelectorAll('#task-rows .select-cell').forEach((cell, index) => cell.insertAdjacentHTML('afterbegin', dragHandle(tasks[index].code)));
  sortable($('#task-rows'), 'tr[data-task-row]', async (from, to) => {
    try {
      await commit(next => reorderTaskSequences(next.tasks, tasks.map(task => task.id), from, to));
      sort = [{ key: 'sequence', direction: 'asc' }];
      clearActiveSavedView();
      notify('Ordine salvato. Sequence aggiornate.');
    } finally { rerenderPreservingView(); }
    document.querySelector(`[data-task-row="${CSS.escape(tasks[from].id)}"] [data-drag-handle]`)?.focus({ preventScroll: true });
  }, true);
  $('#row-count').textContent = ui`${tasks.length} attività mostrate · ${data.tasks.length} totali`;
  drawSelection();
  document.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => {
    taskDialog(data.tasks.find(t => t.id === b.dataset.editTask));
  });
  document.querySelectorAll('[data-task-tags]').forEach(button => button.onclick = () => openTagMenu(button));
  wireChoicePickers();
  document.querySelectorAll('[data-toggle-task]').forEach(b => b.onclick = action(async () => {
    const id = b.dataset.toggleTask, hidden = !data.tasks.find(t => t.id === id).hidden;
    await commit(next => { const task = next.tasks.find(t => t.id === id); if (task) task.hidden = hidden; }); rerenderPreservingView();
  }));
  document.querySelectorAll('[data-mark-task]').forEach(b => b.onclick = () => openMarkMenu(b));
  document.querySelectorAll('#task-rows [data-dup-incident]').forEach(b => b.onclick = () => showTaskDuplicates(b.dataset.dupIncident));
}
// Lists every task sharing the incident, hidden ones included, so duplicates can be compared side by side.
function showTaskDuplicates(incident) {
  search = incident;
  duplicatesOnly = true;
  renderTasks();
  notify(fillText('Attività che condividono l’incident {0}.', incident));
}
// Selection for bulk edit and export. Shift+click extends from the last ticked row over the rows as currently shown.
function selectTaskRows(box, extend) {
  const boxes = [...document.querySelectorAll('#task-rows input[data-select-task]')];
  const from = boxes.findIndex(input => input.dataset.selectTask === selectionAnchor), to = boxes.indexOf(box);
  const range = extend && from >= 0 && to >= 0 ? boxes.slice(Math.min(from, to), Math.max(from, to) + 1) : [box];
  for (const input of range) {
    if (box.checked) selectedTasks.add(input.dataset.selectTask); else selectedTasks.delete(input.dataset.selectTask);
  }
  selectionAnchor = box.dataset.selectTask;
  drawSelection();
}
function clearSelection() {
  selectedTasks.clear();
  selectionAnchor = '';
  drawSelection();
}
function drawSelection() {
  for (const id of selectedTasks) if (!data.tasks.some(task => task.id === id)) selectedTasks.delete(id);
  const boxes = [...document.querySelectorAll('#task-rows input[data-select-task]')], all = $('#select-all');
  if (!all) return;
  let shown = 0;
  for (const box of boxes) {
    const selected = selectedTasks.has(box.dataset.selectTask);
    box.checked = selected;
    box.closest('tr').classList.toggle('selected', selected);
    if (selected) shown++;
  }
  all.disabled = !boxes.length;
  all.checked = boxes.length > 0 && shown === boxes.length;
  all.indeterminate = shown > 0 && shown < boxes.length;
  const count = selectedTasks.size, outside = count - shown;
  $('.table-footer').classList.toggle('has-selection', count > 0);
  $('#bulk-bar').hidden = !count;
  $('#footer-hint').hidden = count > 0;
  $('#bulk-count').textContent = count ? fillText('{0} selezionate', count) + (outside ? ` · ${fillText('{0} non visibili con i filtri attuali', outside)}` : '') : '';
}
const shiftDate = (date, days) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
// Turns the bulk form into a list of edits; fields left on "do not change" are skipped.
function bulkPlan(fields) {
  const steps = [], status = fields.get('statusId'), urgency = fields.get('urgencyId'), mode = fields.get('releaseMode'), mark = fields.get('highlightId'), hidden = fields.get('hidden');
  if (status) steps.push(task => { task.statusId = status; });
  if (urgency) steps.push(task => { task.urgencyId = urgency; });
  if (mode === 'set') {
    const date = fields.get('releaseDate');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Scegli la nuova release date.');
    steps.push(task => { task.releaseDate = date; });
  } else if (mode === 'shift') {
    const days = Number(fields.get('shiftDays'));
    if (!Number.isInteger(days) || !days || Math.abs(days) > 3650) throw new Error('Indica di quanti giorni spostare la release: un numero intero diverso da zero.');
    steps.push(task => { if (task.releaseDate) task.releaseDate = shiftDate(task.releaseDate, days); });
  } else if (mode === 'clear') steps.push(task => { task.releaseDate = ''; });
  if (mark) steps.push(task => { task.highlightId = mark === '__none' ? '' : mark; });
  if (hidden) steps.push(task => { task.hidden = hidden === 'hide'; });
  const tags = data.settings.tags || [], add = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'add').map(tag => tag.id), remove = tags.filter(tag => fields.get(`tag:${tag.id}`) === 'remove').map(tag => tag.id);
  if (add.length || remove.length) steps.push(task => {
    const current = task.tagIds || [];
    task.tagIds = [...current.filter(id => !remove.includes(id)), ...add.filter(id => !current.includes(id))];
  });
  return { steps, highlight: Boolean(mark) };
}
function bulkDialog(ids, context = '') {
  const settings = data.settings, wanted = new Set(ids), tasks = sortedRows(data.tasks.filter(task => wanted.has(task.id))), tags = settings.tags || [];
  if (!tasks.length) { notify('Seleziona almeno un’attività.', true); return; }
  const keep = `<option value="">${esc(t('— Non modificare —'))}</option>`;
  const statuses = settings.statuses.filter(status => tasks.some(task => task.statusId === status.id));
  const items = tasks.map(task => {
    const status = settings.statuses.find(s => s.id === task.statusId);
    return `<label class="bulk-item ${task.hidden ? 'is-hidden' : ''}"><input type="checkbox" name="taskIds" value="${esc(task.id)}" data-status="${esc(task.statusId)}" checked><strong>${esc(task.code)}</strong><span class="bulk-desc">${esc(plain(task.description) || t('Senza descrizione'))}</span>${pill(status.name, status.color)}<span class="bulk-date" style="--date:${task.releaseDate ? dateColor(task.releaseDate) : '#929bb2'}">◷ ${formatDate(task.releaseDate)}</span></label>`;
  }).join('');
  const tagRows = tags.map(tag => `<label class="bulk-tag">${pill(tag.name, tag.color, 'tag-pill')}<select name="tag:${esc(tag.id)}" aria-label="${esc(fillText('Tag {0}', tag.name))}"><option value="">—</option><option value="add">${esc(t('＋ Aggiungi'))}</option><option value="remove">${esc(t('− Togli'))}</option></select></label>`).join('');
  openModal(ui`<form id="bulk-form" novalidate><div class="modal-heading"><div><div class="eyebrow">${esc(data.settings.tabNames[0])}</div><h2>${esc(t('Modifica multipla'))}</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div>${context ? `<p class="section-description">${esc(context)}</p>` : ''}
    <section class="bulk-targets" aria-labelledby="bulk-targets-title"><div class="bulk-targets-head"><strong id="bulk-targets-title">Attività coinvolte</strong><span class="bulk-quick">${statuses.length > 1 ? statuses.map(status => `<button type="button" class="bulk-status-chip" data-bulk-status="${esc(status.id)}" style="--pill:${esc(status.color)}" title="${esc(fillText('Seleziona solo: {0}', status.name))}">${esc(status.name)}</button>`).join('') : ''}<button type="button" class="unsaved-link" data-bulk-all="1">Seleziona tutte</button><button type="button" class="unsaved-link" data-bulk-all="0">Deseleziona tutte</button></span></div><div class="bulk-list">${items}</div></section>
    <div class="form-grid bulk-fields">
      <label class="field">Stato<select name="statusId">${keep}${optionList(settings.statuses, '')}</select></label>
      <label class="field">Urgenza<select name="urgencyId">${keep}${optionList(settings.urgencies, '')}</select></label>
      <div class="field"><label for="bulk-release-mode">Release date</label><div class="bulk-inline"><select id="bulk-release-mode" name="releaseMode">${keep}<option value="set">Imposta una data</option><option value="shift">Sposta di N giorni</option><option value="clear">Togli la data (da pianificare)</option></select><input type="date" name="releaseDate" aria-label="Nuova release date" hidden><input type="number" name="shiftDays" step="1" value="7" aria-label="Giorni di spostamento (negativi per anticipare)" title="Giorni di spostamento (negativi per anticipare)" hidden></div><small id="bulk-release-hint"></small></div>
      <label class="field">Evidenziazione<select name="highlightId">${keep}<option value="__none">Nessuna evidenziazione</option>${optionList(highlightsOf(), '')}</select></label>
      <label class="field">Visibilità nella lista<select name="hidden">${keep}<option value="hide">Nascondi dalla lista</option><option value="show">Mostra nella lista</option></select></label>
      ${tags.length ? ui`<fieldset class="field full bulk-tags"><legend>Tags</legend><div class="bulk-tag-grid">${tagRows}</div></fieldset>` : ''}
    </div><p class="bulk-summary" id="bulk-summary" aria-live="polite"></p>
    <div class="modal-actions"><button type="button" class="button danger" id="bulk-delete">Elimina…</button><span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button type="submit" class="button primary" id="bulk-apply">Applica</button></div></form>`);
  const form = $('#bulk-form'), boxes = [...form.querySelectorAll('input[name="taskIds"]')];
  const chosen = () => new Set(boxes.filter(box => box.checked).map(box => box.value));
  const summarize = () => {
    const ids = chosen(), mode = form.elements.releaseMode.value;
    let pending = 0;
    try { pending = bulkPlan(new FormData(form)).steps.length; } catch { pending = 1; }
    form.elements.releaseDate.hidden = mode !== 'set';
    form.elements.shiftDays.hidden = mode !== 'shift';
    const dated = tasks.filter(task => ids.has(task.id) && task.releaseDate).length;
    $('#bulk-release-hint').textContent = mode === 'shift' ? fillText('Solo le attività con una data: {0} su {1}.', dated, ids.size) : '';
    $('#bulk-summary').textContent = !ids.size ? t('Seleziona almeno un’attività.') : pending ? fillText('Le modifiche verranno applicate a {0}.', plural(ids.size, 'attività')) : fillText('{0} pronte: scegli cosa modificare.', plural(ids.size, 'attività'));
    $('#bulk-apply').disabled = !ids.size || !pending;
    $('#bulk-delete').disabled = !ids.size;
    form.querySelectorAll('[data-bulk-status]').forEach(chip => chip.setAttribute('aria-pressed', String(boxes.every(box => box.checked === (box.dataset.status === chip.dataset.bulkStatus)))));
  };
  form.addEventListener('input', summarize);
  form.addEventListener('change', summarize);
  form.querySelectorAll('[data-bulk-all]').forEach(button => button.onclick = () => { boxes.forEach(box => { box.checked = button.dataset.bulkAll === '1'; }); summarize(); });
  form.querySelectorAll('[data-bulk-status]').forEach(chip => chip.onclick = () => { boxes.forEach(box => { box.checked = box.dataset.status === chip.dataset.bulkStatus; }); summarize(); });
  summarize();
  form.onsubmit = action(async event => {
    event.preventDefault();
    const ids = chosen(), plan = bulkPlan(new FormData(form));
    if (!ids.size) throw new Error('Seleziona almeno un’attività.');
    if (!plan.steps.length) throw new Error('Scegli almeno un campo da modificare.');
    let changed = 0;
    await commit(next => {
      changed = 0;
      for (const task of next.tasks) {
        if (!ids.has(task.id)) continue;
        const before = JSON.stringify(task);
        plan.steps.forEach(step => step(task));
        if (JSON.stringify(task) !== before) changed++;
      }
    });
    if (plan.highlight) ids.forEach(id => pendingMarks.delete(id));
    $('#modal').close();
    rerenderPreservingView();
    notify(fillText('Modifica multipla applicata: {0} aggiornate.', plural(changed, 'attività')));
  });
  $('#bulk-delete').onclick = () => {
    const ids = chosen(), codes = tasks.filter(task => ids.has(task.id)).map(task => task.code);
    if (!ids.size) return;
    confirmDialog('Eliminare le attività scelte?', fillText('{0} saranno eliminate definitivamente: {1}. Le associazioni issue resteranno disponibili.', plural(ids.size, 'attività'), codes.slice(0, 10).join(', ') + (codes.length > 10 ? '…' : '')), async () => {
      let removed = 0;
      await commit(next => {
        const before = next.tasks.length;
        next.tasks = next.tasks.filter(task => !ids.has(task.id));
        removed = before - next.tasks.length;
      });
      ids.forEach(id => { selectedTasks.delete(id); pendingMarks.delete(id); });
      rerenderPreservingView();
      notify(fillText('Attività eliminate: {0}.', removed));
    });
  };
}
function openSettingsTab(id) {
  view = 4;
  settingsTab = id;
  render();
}
function drawHighlighter() {
  const bar = $('.highlighter-bar');
  if (!bar) return;
  const highlights = highlightsOf(), active = highlights.find(h => h.id === highlighter);
  const hint = highlighter === 'erase' ? t('Gomma attiva: clicca sulle righe per togliere l’evidenziazione. Esc per terminare.')
    : active ? fillText('Evidenziatore «{0}» attivo: clicca sulle righe da colorare, di nuovo per togliere il colore. Esc per terminare.', active.name)
      : highlights.length ? t('Scegli un colore e clicca sulle righe da evidenziare, oppure usa il pallino ● a fine riga.') : t('Nessun colore disponibile: aggiungili nelle impostazioni.');
  bar.classList.toggle('active', Boolean(highlighter));
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Evidenziatore'));
  bar.title = hint;
  bar.innerHTML = `<span class="highlighter-label"><span aria-hidden="true">✎</span> ${esc(t('Evidenziatore'))}</span><div class="highlighter-swatches">${highlights.map(h => `<button type="button" class="highlighter-swatch" data-highlighter="${esc(h.id)}" style="--mark:${h.color}" aria-pressed="${h.id === highlighter}" title="${esc(h.name)}"><i aria-hidden="true"></i><span>${esc(h.name)}</span></button>`).join('')}${highlights.length ? `<button type="button" class="highlighter-swatch eraser" data-highlighter="erase" aria-pressed="${highlighter === 'erase'}" title="${esc(t('Togli l’evidenziazione dalle righe'))}"><span aria-hidden="true">⌫</span><span>${esc(t('Gomma'))}</span></button>` : ''}</div><span class="highlighter-hint" aria-live="polite">${esc(hint)}</span><button type="button" class="unsaved-link highlighter-manage" data-manage-highlights>${esc(t('Gestisci colori'))}</button>`;
  const table = $('.activity-table');
  table?.classList.toggle('painting', Boolean(highlighter));
  table?.style.setProperty('--paint', active ? active.color : 'var(--muted)');
  bar.querySelectorAll('[data-highlighter]').forEach(button => button.onclick = () => {
    const choice = button.dataset.highlighter;
    highlighter = highlighter === choice ? '' : choice;
    drawHighlighter();
    bar.querySelector(`[data-highlighter="${CSS.escape(choice)}"]`)?.focus();
  });
  bar.querySelector('[data-manage-highlights]').onclick = () => openSettingsTab('highlights');
}
function applyRowMark(row, value) {
  const mark = highlightsOf().find(h => h.id === value);
  row.classList.toggle('marked', Boolean(mark));
  if (mark) row.style.setProperty('--mark', mark.color); else row.style.removeProperty('--mark');
  row.querySelector('.mark-button')?.classList.toggle('is-marked', Boolean(mark));
}
const pendingMarks = new Map();
let markFlush = null;
const currentMark = task => pendingMarks.has(task.id) ? pendingMarks.get(task.id) : highlightOf(task)?.id || '';
function paintRow(row) {
  const task = data.tasks.find(item => item.id === row.dataset.taskRow);
  if (!task) return;
  const value = highlighter === 'erase' || currentMark(task) === highlighter ? '' : highlighter;
  applyRowMark(row, value);
  setTaskHighlight(task.id, value);
}
// Clicks are applied to the page at once and saved in order, batching the rows colored while a save is running.
function setTaskHighlight(id, value) {
  pendingMarks.set(id, value);
  markFlush ||= flushMarks().finally(() => { markFlush = null; });
  return markFlush;
}
async function flushMarks() {
  try {
    while (pendingMarks.size) {
      while (saving || organizationBusy) await new Promise(resolve => setTimeout(resolve, 30));
      const batch = new Map(pendingMarks);
      if (![...batch.keys()].some(id => data.tasks.some(task => task.id === id))) { pendingMarks.clear(); break; }
      await commit(next => { for (const [id, value] of batch) { const task = next.tasks.find(item => item.id === id); if (task) task.highlightId = value; } });
      for (const [id, value] of batch) if (pendingMarks.get(id) === value) pendingMarks.delete(id);
    }
  } catch (error) {
    pendingMarks.clear();
    notify(error.message, true);
  }
  if ($('#modal').open) renderAfterModal = true;
  else if (view !== 4) rerenderPreservingView();
}
function closeMarkMenu(restoreFocus = false) {
  const menu = document.getElementById('mark-menu');
  if (!menu) return;
  const owner = document.querySelector(`[data-mark-task="${CSS.escape(menu.dataset.task)}"]`);
  menu.remove();
  owner?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) owner?.focus();
}
function openMarkMenu(button) {
  const id = button.dataset.markTask, open = document.getElementById('mark-menu');
  if (open) { const same = open.dataset.task === id; closeMarkMenu(); if (same) return; }
  const task = data.tasks.find(item => item.id === id);
  if (!task) return;
  const current = currentMark(task);
  const item = (value, label, swatch) => `<button type="button" role="menuitemradio" aria-checked="${value === current}" class="mark-choice" data-mark-choice="${esc(value)}">${swatch}<span>${esc(label)}</span>${value === current ? '<b aria-hidden="true">✓</b>' : ''}</button>`;
  const menu = document.createElement('div');
  menu.id = 'mark-menu';
  menu.className = 'mark-menu';
  menu.dataset.task = id;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', fillText('Evidenzia {0}', task.code));
  menu.innerHTML = highlightsOf().map(h => item(h.id, h.name, `<i class="mark-swatch" style="--mark:${h.color}"></i>`)).join('') +
    item('', t('Nessuna evidenziazione'), '<i class="mark-swatch none"></i>') +
    `<hr><button type="button" role="menuitem" class="mark-choice" data-manage-highlights><i class="mark-swatch manage" aria-hidden="true">⚙</i><span>${esc(t('Gestisci colori…'))}</span></button>`;
  document.body.append(menu);
  const rect = button.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  menu.style.top = `${rect.bottom + 6 + height > innerHeight - 8 ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`;
  button.setAttribute('aria-expanded', 'true');
  menu.addEventListener('click', event => {
    if (event.target.closest('[data-manage-highlights]')) { closeMarkMenu(); openSettingsTab('highlights'); return; }
    const choice = event.target.closest('[data-mark-choice]');
    if (!choice) return;
    const value = choice.dataset.markChoice;
    closeMarkMenu();
    const row = document.querySelector(`tr[data-task-row="${CSS.escape(id)}"]`);
    if (row) applyRowMark(row, value);
    setTaskHighlight(id, value).then(() => document.querySelector(`[data-mark-task="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); closeMarkMenu(true); return; }
    const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[(next + items.length) % items.length].focus();
  });
  (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus({ preventScroll: true });
}
document.addEventListener('pointerdown', event => {
  const menu = document.getElementById('mark-menu');
  if (menu && !menu.contains(event.target) && !event.target.closest('[data-mark-task]')) closeMarkMenu();
}, true);
window.addEventListener('scroll', event => { if (!document.getElementById('mark-menu')?.contains(event.target)) closeMarkMenu(); }, true);
window.addEventListener('resize', () => closeMarkMenu());
// Drag and drop ordering for the settings lists and the column editors. Rows follow the pointer live, the list
// scrolls near its edges, Esc restores the original order; the ↑ ↓ buttons and the arrow keys on the grip still work.
const dragHandle = name => `<button type="button" class="drag-handle" data-drag-handle title="${esc(t('Trascina per riordinare, oppure usa i tasti ↑ ↓'))}" aria-label="${esc(fillText('Riordina «{0}»', name))}"></button>`;
function announceOrder(container, message) {
  const host = container.closest('dialog') || document.body;
  let region = [...host.children].find(child => child.classList.contains('sort-status'));
  if (!region) {
    region = document.createElement('div');
    region.className = 'sr-only sort-status';
    region.setAttribute('role', 'status');
    host.append(region);
  }
  region.textContent = message;
}
function sortable(container, rowSelector, move, handlesOnly = false) {
  const rowsOf = () => [...container.querySelectorAll(rowSelector)];
  const place = (from, to) => {
    const count = rowsOf().length;
    if (from !== to) {
      const result = move(from, to);
      if (result?.then) {
        result.then(() => {
          announceOrder(container, fillText('Spostato in posizione {0} di {1}', to + 1, count));
        }).catch(error => notify(error.message, true));
        return;
      }
    }
    rowsOf()[to]?.querySelector('[data-drag-handle]')?.focus();
    if (from !== to) announceOrder(container, fillText('Spostato in posizione {0} di {1}', to + 1, count));
    refreshSettingsState();
  };
  container.onkeydown = event => {
    const handle = event.target.closest?.('[data-drag-handle]');
    if (!handle || saving || organizationBusy || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const rows = rowsOf(), from = rows.indexOf(handle.closest(rowSelector)), to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from >= 0 && to >= 0 && to < rows.length) place(from, to);
  };
  container.onpointerdown = event => {
    const row = event.target.closest(rowSelector);
    if (event.button !== 0 || !event.isPrimary || !row || !container.contains(row) || saving || organizationBusy || document.body.classList.contains('is-sorting')) return;
    if (handlesOnly && !event.target.closest('[data-drag-handle]')) return;
    if (!event.target.closest('[data-drag-handle]') && event.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
    const from = rowsOf().indexOf(row), startX = event.clientX, startY = event.clientY, pointerId = event.pointerId;
    let dragging = false, pointerY = startY, grab = 0, frame = 0, scrollers = [];
    const listeners = { pointermove: onMove, pointerup: onUp, pointercancel: () => stop(true), keydown: onKey };
    for (const [type, listener] of Object.entries(listeners)) window.addEventListener(type, listener, true);
    function layout() {
      const others = rowsOf().filter(item => item !== row);
      const next = others.find(item => { const box = item.getBoundingClientRect(); return pointerY < box.top + box.height / 2; });
      if (next && row.nextElementSibling !== next) next.before(row);
      else if (!next && others.length && others.at(-1).nextElementSibling !== row) others.at(-1).after(row);
      row.style.transform = '';
      const rows = rowsOf(), natural = row.getBoundingClientRect(), first = rows[0].getBoundingClientRect(), last = rows.at(-1).getBoundingClientRect();
      const top = Math.min(Math.max(pointerY - grab, first.top), last.bottom - natural.height);
      row.style.transform = `translateY(${Math.round(top - natural.top)}px)`;
    }
    function autoScroll() {
      frame = 0;
      if (!dragging) return;
      for (const element of scrollers) {
        const box = element.getBoundingClientRect(), edge = Math.min(48, box.height / 4);
        const speed = pointerY < box.top + edge ? -(box.top + edge - pointerY) : pointerY > box.bottom - edge ? pointerY - box.bottom + edge : 0;
        const room = speed < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        if (speed && room) {
          element.scrollTop += Math.sign(speed) * Math.min(18, Math.ceil(Math.abs(speed) / 3));
          layout();
          frame = requestAnimationFrame(autoScroll);
          return;
        }
      }
    }
    function onMove(move) {
      if (move.pointerId !== pointerId) return;
      if (!row.isConnected) { stop(true); return; }
      pointerY = move.clientY;
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < 4) return;
        dragging = true;
        grab = startY - row.getBoundingClientRect().top;
        for (let element = container; element && element !== document.documentElement; element = element.parentElement) {
          if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) scrollers.push(element);
        }
        try { container.setPointerCapture(pointerId); } catch {}
        row.classList.add('is-dragging');
        document.body.classList.add('is-sorting');
      }
      move.preventDefault();
      layout();
      if (!frame) frame = requestAnimationFrame(autoScroll);
    }
    function onUp(up) {
      if (up.pointerId !== pointerId) return;
      const moved = dragging && row.isConnected;
      const to = moved ? rowsOf().indexOf(row) : from;
      stop(false);
      if (!moved) return;
      // The release would otherwise click whatever ended up under the pointer, e.g. a checkbox label.
      const swallow = click => { click.preventDefault(); click.stopImmediatePropagation(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true));
      place(from, to);
    }
    function onKey(key) {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      stop(true);
    }
    function stop(cancel) {
      for (const [type, listener] of Object.entries(listeners)) window.removeEventListener(type, listener, true);
      cancelAnimationFrame(frame);
      try { container.releasePointerCapture(pointerId); } catch {}
      row.classList.remove('is-dragging');
      row.style.transform = '';
      document.body.classList.remove('is-sorting');
      if (cancel && dragging && row.isConnected) {
        const others = rowsOf().filter(item => item !== row);
        if (others[from]) others[from].before(row); else others.at(-1)?.after(row);
        announceOrder(container, t('Spostamento annullato'));
      }
      dragging = false;
    }
  };
}
function columnEditor(container, columns, kind = 'tasks', settings = data.settings) {
  const draw = focus => {
    container.innerHTML = `<ol class="column-editor">${columns.map((column, index) => {
      const def = columnDef(column.id, kind, settings), name = def.field ? def.name : t(def.name);
      return `<li class="column-row ${column.visible ? '' : 'is-off'}">${dragHandle(name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span><label class="column-toggle"><input type="checkbox" data-column-visible="${column.id}" ${column.visible ? 'checked' : ''}><span>${esc(name)}</span></label>${def.sort ? `<span class="column-tag" title="${esc(t('Clic sull’intestazione per ordinare'))}">↕ ${esc(t('Ordinabile'))}</span>` : ''}<button type="button" class="icon-button" data-column-move="${column.id}:-1" ${index === 0 ? 'disabled' : ''} title="${esc(t('Sposta su'))}" aria-label="${esc(`${t('Sposta su')}: ${name}`)}">↑</button><button type="button" class="icon-button" data-column-move="${column.id}:1" ${index === columns.length - 1 ? 'disabled' : ''} title="${esc(t('Sposta giù'))}" aria-label="${esc(`${t('Sposta giù')}: ${name}`)}">↓</button></li>`;
    }).join('')}</ol>`;
    container.querySelectorAll('[data-column-visible]').forEach(input => input.onchange = () => {
      const column = columns.find(item => item.id === input.dataset.columnVisible);
      if (!input.checked && columns.filter(item => item.visible).length === 1) { input.checked = true; notify('Deve restare visibile almeno una colonna.', true); return; }
      column.visible = input.checked;
      draw(`[data-column-visible="${column.id}"]`);
    });
    container.querySelectorAll('[data-column-move]').forEach(button => button.onclick = () => {
      const [id, offset] = button.dataset.columnMove.split(':'), index = columns.findIndex(item => item.id === id), target = index + Number(offset);
      if (target < 0 || target >= columns.length) return;
      [columns[index], columns[target]] = [columns[target], columns[index]];
      draw(`[data-column-move="${button.dataset.columnMove}"]`);
    });
    const element = focus && container.querySelector(focus);
    if (element?.disabled) element.closest('li').querySelector('[data-column-move]:not([disabled])')?.focus();
    else element?.focus();
  };
  sortable(container, '.column-row', (from, to) => { columns.splice(to, 0, ...columns.splice(from, 1)); draw(); });
  draw();
}
function columnsDialog(kind = 'tasks') {
  const columns = kind === 'tasks' ? normalizeTaskColumns(data.settings.taskColumns, data.settings.taskFields) : CustomColumns.normalizeIssueColumns(data.settings.issueColumns, data.settings.issueFields);
  openModal(`<div class="modal-heading"><div><div class="eyebrow">${esc(t('ATTIVITÀ'))}</div><h2>${esc(t('Colonne della lista'))}</h2></div><button type="button" class="icon-button" data-close aria-label="${esc(t('Chiudi'))}">✕</button></div><p class="section-description">${esc(t('Spunta le colonne da mostrare e trascinale (o usa le frecce) per cambiarne l’ordine. Nascondere una colonna non cancella i dati.'))}</p><div id="columns-dialog-editor"></div><div class="modal-actions"><button type="button" class="button" id="columns-default">${esc(t('Ripristina predefinite'))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(t('Annulla'))}</button><button type="button" class="button primary" id="columns-apply">${esc(t('Applica'))}</button></div>`);
  const container = $('#columns-dialog-editor');
  columnEditor(container, columns, kind);
  $('#columns-default').onclick = () => { columns.splice(0, columns.length, ...(kind === 'tasks' ? defaultTaskColumns(data.settings.taskFields) : CustomColumns.normalizeIssueColumns(undefined, data.settings.issueFields))); columnEditor(container, columns, kind); };
  $('#columns-apply').onclick = action(async () => {
    await commit(next => { next.settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = structuredClone(columns); });
    clearActiveSavedView();
    $('#modal').close();
    rerenderPreservingView();
    notify('Colonne aggiornate.');
  });
}
function openModal(html) {
  closeTagMenu();
  $('#modal-content').innerHTML = html;
  $('#modal').showModal();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('#modal').close());
}
function globalSearchResults(query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results = [], issues = indexIssues(data.issues);
  for (const task of data.tasks) {
    const links = matchIssues(task, issues), status = data.settings.statuses.find(item => item.id === task.statusId)?.name || '';
    const urgency = data.settings.urgencies.find(item => item.id === task.urgencyId)?.name || '';
    const mark = highlightOf(task)?.name || '', tags = tagsOf(task).map(tag => tag.name);
    const fields = [task.code, String(task.sequence), plain(task.description), plain(task.notes), task.releaseDate, formatDate(task.releaseDate), status, urgency, mark, ...tags, ...Object.values(links).flat(), ...customSearchValues(task, 'tasks')];
    if (!fields.some(value => String(value || '').toLocaleLowerCase().includes(needle))) continue;
    const detail = [task.releaseDate ? formatDate(task.releaseDate) : t('Da pianificare'), status, links.incidents.length && `INC ${links.incidents.join(', ')}`, links.problems.length && `PRB ${links.problems.join(', ')}`, task.hidden && t('Nascosta')].filter(Boolean).join(' · ');
    results.push({ kind: 'task', id: task.id, title: task.code, detail, subtitle: plain(task.description) });
    if (results.length === 40) return results;
  }
  for (const issue of data.issues) {
    if (![issue.code, issue.incident, issue.problem, ...customSearchValues(issue, 'issues')].some(value => value.toLocaleLowerCase().includes(needle))) continue;
    results.push({ kind: 'issue', id: issue.id, title: issue.code, detail: [issue.incident && `INC ${issue.incident}`, issue.problem && `PRB ${issue.problem}`].filter(Boolean).join(' · '), subtitle: '' });
    if (results.length === 40) return results;
  }
  return results;
}
function openGlobalSearch(initial = '') {
  openModal(ui`<div class="modal-heading"><div><div class="eyebrow">${esc(t('RICERCA GLOBALE'))}</div><h2>${esc(t('Cerca in OrbitKanban'))}</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div><label class="global-search-field"><span aria-hidden="true">⌕</span><input id="global-search-input" type="search" autocomplete="off" placeholder="${esc(t('Codice, incident, problem, release date…'))}" aria-label="${esc(t('Cerca attività e issue'))}"><kbd>Esc</kbd></label><div class="global-search-results" id="global-search-results" role="listbox" aria-label="${esc(t('Risultati della ricerca'))}"></div>`);
  const input = $('#global-search-input'), list = $('#global-search-results');
  const draw = () => {
    const results = globalSearchResults(input.value);
    list.innerHTML = results.length ? results.map((item, index) => `<button type="button" class="global-search-result" role="option" aria-selected="false" data-global-kind="${item.kind}" data-global-id="${esc(item.id)}" ${index === 0 ? 'data-first-result' : ''}><strong>${esc(item.title)}</strong><span class="global-search-kind">${esc(t(item.kind === 'task' ? 'Attività' : 'Issue'))}</span><small>${esc([item.detail, item.subtitle].filter(Boolean).join(' · '))}</small></button>`).join('') : input.value.trim() ? `<p class="backup-empty">${esc(t('Nessun risultato.'))}</p>` : `<p class="backup-empty">${esc(t('Cerca codici, incident, problem o date di release.'))}</p>`;
  };
  input.value = initial;
  input.oninput = draw;
  input.onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); list.querySelector('[data-first-result]')?.click(); }
  };
  list.onclick = event => {
    const button = event.target.closest('[data-global-kind]');
    if (!button) return;
    const item = button.dataset.globalKind === 'task' ? data.tasks.find(task => task.id === button.dataset.globalId) : data.issues.find(issue => issue.id === button.dataset.globalId);
    if (!item) { notify('L’elemento non esiste più.', true); return; }
    $('#modal').close();
    view = button.dataset.globalKind === 'task' ? 0 : 1;
    render();
    if (view === 0) taskDialog(item); else issueDialog(item);
  };
  draw();
  input.focus();
}
function editor(id, label, html, translateLabel = true) {
  return ui`<div class="field full"><span class="field-label" id="${id}-label">${esc(translateLabel ? t(label) : label)}</span><div class="rich-editor"><div class="rich-toolbar" data-editor="${id}"><button type="button" data-command="bold" title="Grassetto"><b>B</b></button><button type="button" data-command="italic" title="Corsivo"><i>I</i></button><button type="button" data-command="underline" title="Sottolineato"><u>U</u></button><button type="button" data-command="insertUnorderedList" title="Elenco puntato">• Elenco</button><button type="button" data-command="insertOrderedList" title="Elenco numerato">1. Elenco</button><button type="button" data-command="removeFormat" title="Rimuovi formattazione">Tx</button></div><div id="${id}" class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-label">${sanitize(html)}</div></div></div>`;
}
function wireEditors() {
  wireChoicePickers();
  document.querySelectorAll('[data-command]').forEach(b => {
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => {
      const editor = document.getElementById(b.closest('[data-editor]').dataset.editor);
      editor.focus(); document.execCommand(b.dataset.command, false);
    };
  });
  document.querySelectorAll('.editable').forEach(el => {
    el.addEventListener('paste', e => {
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      if (html) document.execCommand('insertHTML', false, sanitize(html));
      else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    el.addEventListener('drop', e => e.preventDefault());
  });
}
function customEditors(kind, record) {
  const fields = CustomColumns.fieldsOf(data.settings, kind);
  if (!fields.length) return '';
  return `<section class="custom-edit-fields full"><h3>${esc(t('Colonne personalizzate'))}</h3><div class="form-grid">${fields.map(field => {
    const value = record.customFields?.[field.id], label = esc(field.name), name = esc(field.id);
    if (field.type === 'richtext') return editor(`editor-${field.id}`, field.name, value || '', false);
    const choice = (value, name, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(name)}</option>`;
    let input;
    if (field.type === 'boolean') input = `<select name="${name}">${choice('', '—', value === undefined)}${choice('true', t('Sì'), value === true)}${choice('false', t('No'), value === false)}</select>`;
    else if (field.type === 'multiselect') input = `<div>${choiceButton(record, field, kind)}${(value || []).map(value => `<input type="hidden" name="${name}" value="${esc(value)}">`).join('')}</div>`;
    else if (field.type === 'select') input = `<select name="${name}">${choice('', '—', !value)}${CustomColumns.choices(field).map(option => choice(option.id, option.name, option.id === value)).join('')}</select>`;
    else input = `<input name="${name}" type="${field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text'}" ${['number', 'effort'].includes(field.type) ? 'step="any"' : 'maxlength="200000"'} ${field.type === 'effort' ? 'min="0"' : ''} value="${esc(value ?? '')}">`;
    return `<label class="field">${label}${input}${field.type === 'effort' ? `<small>${esc(t('Valore in ore'))}</small>` : ''}</label>`;
  }).join('')}</div></section>`;
}
function readCustomEditors(form, kind) {
  const values = {}, entries = new FormData(form);
  for (const field of CustomColumns.fieldsOf(data.settings, kind)) {
    let value;
    if (field.type === 'richtext') value = sanitize(document.getElementById(`editor-${field.id}`).innerHTML);
    else if (field.type === 'multiselect') value = entries.getAll(field.id);
    else {
      const raw = entries.get(field.id);
      value = raw === '' ? undefined : field.type === 'boolean' ? raw === 'true' : ['number', 'effort'].includes(field.type) ? Number(raw) : field.type === 'url' ? normalizeUrl(raw) : raw;
    }
    CustomColumns.validateValue(value, field);
    if (value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)) values[field.id] = value;
  }
  return values;
}
function csvButton(kind) {
  return `<button class="button" id="import-csv-${kind}" type="button">${esc(t('Importa CSV'))}</button><input type="file" id="csv-file-${kind}" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden>`;
}
function wireCsvImport(kind) {
  const fileInput = $(`#csv-file-${kind}`);
  $(`#import-csv-${kind}`).onclick = () => fileInput.click();
  fileInput.onchange = action(async () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) await csvImportDialog(file, kind); });
}
async function csvImportDialog(file, kind) {
  if (file.size > Csv.MAX_BYTES) throw new Error(t('Il CSV supera il limite di 16 MB.'));
  const buffer = await file.arrayBuffer(), fields = Csv.destinations(data, kind);
  let rows = [], mapping = [], preview;
  openModal(`<form id="csv-import-form"><div class="modal-heading"><div><div class="eyebrow">CSV · ${esc(data.settings.tabNames[kind === 'tasks' ? 0 : 1])}</div><h2>${esc(t('Importa CSV'))}</h2></div><button type="button" class="icon-button" data-close aria-label="${esc(t('Chiudi'))}">✕</button></div><p>${esc(file.name)}</p>
    <p class="section-description">${esc(t('Le righe verranno aggiunte, senza sovrascrivere quelle esistenti. I duplicati saranno segnalati normalmente.'))}</p>
    <div class="csv-options"><label class="field">${esc(t('Separatore'))}<select id="csv-separator"><option value="">${esc(t('Automatico'))}</option><option value=";">;</option><option value=",">,</option><option value="tab">Tab</option></select></label><label class="field">${esc(t('Codifica'))}<select id="csv-encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (Excel)</option><option value="utf-16le">UTF-16 LE</option></select></label><label class="checkbox-field"><input id="csv-header" type="checkbox" checked> ${esc(t('Prima riga con intestazioni'))}</label></div>
    <p class="muted">${esc(t('Date: AAAA-MM-GG o GG/MM/AAAA. Numeri: punto o virgola decimale. Scelte multiple e tag: separare con |. Cataloghi e colonne personalizzate devono essere già configurati.'))}</p>
    ${kind === 'tasks' ? `<p class="muted">${esc(t('Incident e problem sono calcolati: importarli nella lista delle issue collegate.'))}</p>` : ''}
    <div class="csv-mapping" id="csv-mapping"></div><div id="csv-status" role="status" aria-live="polite"></div><div class="table-scroll csv-preview" id="csv-preview"></div>
    <div class="modal-actions"><span class="spacer"></span><button class="button" type="button" data-close>${esc(t('Annulla'))}</button><button class="button primary" type="submit" id="csv-import" disabled>${esc(t('Importa righe'))}</button></div></form>`);
  const showPreview = () => {
    const status = $('#csv-status'), button = $('#csv-import');
    button.disabled = true; preview = undefined; $('#csv-preview').innerHTML = '';
    try {
      preview = Csv.prepareImport(data, kind, rows, mapping);
      status.className = preview.errorCount ? 'csv-errors' : '';
      status.innerHTML = `<p>${esc(fillText('{0} righe valide · {1} errori', preview.records.length, preview.errorCount))}</p>` + (preview.errorCount ? `<ul>${preview.errors.map(error => `<li>${esc(t('Riga dati') + ' ' + error.row + (error.column ? ` · ${error.custom ? error.column : t(error.column)}` : '') + ': ' + t(error.message))}</li>`).join('')}</ul>` : '');
      const selected = mapping.filter(Boolean).map(id => fields.find(field => field.id === id));
      const text = (record, field) => {
        const value = field.custom ? record.customFields?.[field.id] : field.id === 'effortDays' ? record.effortHours / data.settings.hoursPerDay : record[field.id];
        if (field.type === 'select') return field.options.find(option => option.value === value)?.name || '';
        if (field.type === 'multiselect') return (value || []).map(value => field.options.find(option => option.value === value)?.name || value).join(', ');
        if (field.type === 'effort') return String(value ?? '');
        return customText(value, field);
      };
      $('#csv-preview').innerHTML = `<table><caption>${esc(t('Anteprima delle prime 10 righe valide'))}</caption><thead><tr>${selected.map(field => `<th>${esc(field.custom ? field.name : t(field.name))}</th>`).join('')}</tr></thead><tbody>${preview.records.slice(0, 10).map(record => `<tr>${selected.map(field => `<td>${esc(text(record, field))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      button.disabled = preview.errorCount > 0 || !preview.records.length;
      button.textContent = fillText('Importa {0} righe', preview.records.length);
    } catch (error) { status.className = 'csv-errors'; status.textContent = t(error.message); }
  };
  const parse = () => {
    $('#csv-import').disabled = true; rows = []; mapping = []; preview = undefined;
    try {
      let text;
      try { text = new TextDecoder($('#csv-encoding').value, { fatal: true }).decode(buffer); }
      catch { throw new Error(t('Il file non corrisponde alla codifica selezionata. Prova Windows-1252 oppure UTF-16 LE.')); }
      const separator = $('#csv-separator').value;
      const parsed = Csv.parseCsv(text, separator === 'tab' ? '\t' : separator), hasHeader = $('#csv-header').checked;
      const headers = hasHeader ? parsed.rows[0] : parsed.rows[0].map((_, i) => `${t('Colonna')} ${i + 1}`);
      rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
      mapping = hasHeader ? Csv.suggestMapping(headers, fields) : headers.map(() => '');
      $('#csv-mapping').innerHTML = `<h3>${esc(t('Mappa le colonne'))}</h3>${headers.map((header, index) => `<label class="csv-map-row"><span><strong>${esc(header || `${t('Colonna')} ${index + 1}`)}</strong><small>${esc(rows[0]?.[index]?.slice(0, 100) || '—')}</small></span><select data-csv-column="${index}" aria-label="${esc(t('Destinazione') + ': ' + header)}"><option value="">${esc(t('Non importare'))}</option>${fields.map(field => `<option value="${esc(field.id)}" ${field.id === mapping[index] ? 'selected' : ''}>${esc((field.custom ? `${field.name} · ${t('Personalizzata')}` : t(field.name)) + ' · ' + t(fieldTypeNames[field.type]))}</option>`).join('')}</select></label>`).join('')}`;
      document.querySelectorAll('[data-csv-column]').forEach(select => select.onchange = () => { mapping[Number(select.dataset.csvColumn)] = select.value; showPreview(); });
      showPreview();
    } catch (error) { $('#csv-mapping').innerHTML = ''; $('#csv-preview').innerHTML = ''; $('#csv-status').className = 'csv-errors'; $('#csv-status').textContent = t(error.message); }
  };
  for (const id of ['csv-separator', 'csv-encoding', 'csv-header']) document.getElementById(id).onchange = parse;
  $('#csv-import-form').onsubmit = action(async event => {
    event.preventDefault();
    if (!preview || preview.errorCount || !preview.records.length) throw new Error(t('Correggere gli errori prima di importare.'));
    $('#csv-import').disabled = true;
    let count;
    try {
      await commit(next => {
        const result = Csv.prepareImport(next, kind, rows, mapping);
        if (result.errorCount) throw new Error(t('I dati o i cataloghi sono cambiati. Riapri l’importazione e controlla la mappatura.'));
        count = result.records.length; next[kind].push(...result.records);
      });
      $('#modal').close(); rerenderPreservingView(); notify(fillText('Importate {0} righe.', count));
    } finally { if ($('#csv-import')) $('#csv-import').disabled = false; }
  });
  parse();
}
function taskDialog(existing) {
  const t = existing || {
    id: uid(), code: '', sequence: Math.max(0, ...data.tasks.map(t => t.sequence)) + 1, url: '', description: '',
    statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[Math.min(2, data.settings.urgencies.length - 1)].id,
    effortHours: 0, releaseDate: '', notes: '', hidden: false, highlightId: '', tagIds: []
  };
  const days = Math.floor(t.effortHours / data.settings.hoursPerDay), hours = Math.round((t.effortHours - days * data.settings.hoursPerDay) * 100) / 100;
  openModal(ui`<form id="task-form"><div class="modal-heading"><div><div class="eyebrow">ATTIVITÀ</div><h2>${tr(existing ? 'Modifica attività' : 'Una nuova direzione')}</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div><div class="task-edit-layout"><div class="form-grid task-edit-fields">
    <label class="field">Codice portale *<input name="code" required maxlength="200" value="${esc(t.code)}" placeholder="es. PRJ-1042"></label>
    <label class="field">Progressivo *<input name="sequence" type="number" min="0" step="1" required value="${t.sequence}"></label>
    <label class="field">Urgenza<select name="urgencyId">${optionList(data.settings.urgencies, t.urgencyId)}</select></label>
    <label class="field">Stato<select name="statusId">${optionList(data.settings.statuses, t.statusId)}</select></label>
    <label class="field">Release date<input name="releaseDate" type="date" value="${esc(t.releaseDate)}"></label>
    <label class="field" title="Colora la riga nella lista attività. I colori si gestiscono in Impostazioni › Evidenziatori.">Evidenziazione<select name="highlightId">${optionList(highlightsOf(), currentMark(t), 'Nessuna evidenziazione')}</select></label>
    <label class="field"><span class="task-effort-label">Effort in giorni <small>${esc(fillText('1 giorno = {0} ore', data.settings.hoursPerDay))}</small></span><input name="days" type="number" min="0" step="0.01" value="${days}"></label>
    <label class="field">Effort in ore aggiuntive<input name="hours" type="number" min="0" step="0.01" value="${hours}"></label>
    <div class="field full portal-field"><label for="task-url">Link specifico (facoltativo)</label><input id="task-url" name="url" inputmode="url" spellcheck="false" autocomplete="off" maxlength="2000" value="${esc(t.url)}"><small id="portal-link-preview" aria-live="polite"></small></div>
    <label class="field full checkbox-field"><input type="checkbox" name="hidden" ${t.hidden ? 'checked' : ''}> Nascondi solo dalla lista attività (resta visibile in milestone e kanban)</label>
    <div class="auto-match full" id="match-preview"></div>
    ${customEditors('tasks', t)}
    </div><div class="task-edit-text">
    ${editor('description-editor', 'Descrizione', t.description)}
    ${editor('notes-editor', 'Note', t.notes)}
    </div></div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-task">Elimina</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button type="submit" class="button primary">Salva attività</button></div></form>`);
  const form = $('#task-form');
  const updateMatches = () => {
    const code = form.elements.code.value, links = matchIssues({ code }, data.issues);
    const groups = findDuplicates([...data.tasks.filter(task => task.id !== t.id), { ...t, code }], data.issues).tasks.get(t.id) || [];
    $('#match-preview').classList.toggle('has-duplicates', groups.length > 0);
    $('#match-preview').innerHTML = ui`<span>⌘ Collegamento automatico dal codice portale</span><div>Incident: <strong>${esc(links.incidents.join(', ') || '—')}</strong> &nbsp; Problem: <strong>${esc(links.problems.join(', ') || '—')}</strong></div>` +
      (groups.length ? `<p class="duplicate-warning"><strong>⧉ ${esc(tr('Possibile duplicato'))}</strong>${taskDuplicateLines(t.id, groups).map(line => `<span>${esc(line)}</span>`).join('')}</p>` : '');
  };
  form.elements.code.oninput = updateMatches; updateMatches(); wireEditors();
  const generatedLink = () => portalUrl({ code: form.elements.code.value, url: '' }, data.settings);
  const updateLink = () => {
    const override = normalizeUrl(form.elements.url.value), generated = generatedLink(), effective = override || generated;
    form.elements.url.placeholder = generated || tr('https://portale.azienda.com/browse/PRJ-1042');
    $('#portal-link-preview').innerHTML = !effective
      ? esc(tr(data.settings.portalUrlTemplate ? 'Inserisci il codice portale per generare il link.' : 'Nessun link: imposta il modello del link nelle impostazioni dell’organizzazione oppure inserisci un link specifico.'))
      : isWebUrl(effective)
        ? `${esc(tr(override ? 'Link specifico' : 'Link generato dal modello dell’organizzazione'))}: <a class="portal-link" href="${esc(effective)}" data-open-url>${esc(effective)} ↗</a>`
        : `<span class="portal-error">${esc(tr('Il link deve iniziare con http:// o https://.'))}</span>`;
  };
  form.elements.code.addEventListener('input', updateLink);
  form.elements.url.oninput = updateLink; updateLink();
  form.onsubmit = action(async event => {
    event.preventDefault();
    const fields = new FormData(form);
    let url = normalizeUrl(fields.get('url'));
    if (url && !isWebUrl(url)) throw new Error('Il link deve iniziare con http:// o https://.');
    if (url === generatedLink()) url = '';
    const item = {
      ...t, code: fields.get('code').trim(), sequence: Number(fields.get('sequence')), url,
      description: sanitize($('#description-editor').innerHTML), notes: sanitize($('#notes-editor').innerHTML),
      urgencyId: fields.get('urgencyId'), statusId: fields.get('statusId'), releaseDate: fields.get('releaseDate'),
      effortHours: Math.round((Number(fields.get('days')) * data.settings.hoursPerDay + Number(fields.get('hours'))) * 100) / 100,
      hidden: fields.has('hidden'), highlightId: fields.get('highlightId') || '', customFields: readCustomEditors(form, 'tasks')
    };
    pendingMarks.delete(item.id);
    await commit(next => {
      const index = next.tasks.findIndex(x => x.id === item.id);
      if (index >= 0) next.tasks[index] = { ...item, tagIds: next.tasks[index].tagIds }; else next.tasks.push(item);
    });
    $('#modal').close(); rerenderPreservingView(); notify('Attività salvata.');
  });
  if (existing) $('#delete-task').onclick = () => confirmDialog('Eliminare questa attività?', `${t.code} sarà eliminata definitivamente. Le associazioni issue resteranno disponibili.`, async () => {
    await commit(next => { next.tasks = next.tasks.filter(x => x.id !== t.id); }); rerenderPreservingView(); notify('Attività eliminata.');
  });
}
function confirmDialog(title, message, callback) {
  if ($('#modal').open) $('#modal').close();
  openModal(ui`<div class="modal-heading"><h2>${esc(t(title))}</h2></div><p class="confirm-message">${esc(t(message))}</p><div class="modal-actions"><span class="spacer"></span><button class="button" data-close>Annulla</button><button class="button danger" id="confirm-action">Conferma</button></div>`);
  $('#confirm-action').onclick = action(async () => { await callback(); $('#modal').close(); });
}
function linkedCounts() {
  const counts = new Map();
  for (const task of data.tasks) { const code = task.code.trim().toUpperCase(); counts.set(code, (counts.get(code) || 0) + 1); }
  return counts;
}
function filteredIssues(query = issueSearch, duplicates = duplicatesOf(), counts = linkedCounts()) {
  return data.issues.filter(issue => (!issueDuplicatesOnly || duplicates.issues.has(issue.id)) &&
    (!query || [issue.code, issue.incident, issue.problem, ...customSearchValues(issue, 'issues')].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) &&
    passesColumnFilters(issue, 'issues', counts));
}
function renderIssues() {
  const duplicates = duplicatesOf(), duplicateCount = duplicates.issues.size, identicalIds = new Set(duplicates.identical), columns = shownIssueColumns(), counts = linkedCounts();
  if (issueDuplicatesOnly && !duplicateCount) issueDuplicatesOnly = false;
  $('#content').innerHTML = heading(data.settings.tabNames[1], 'Collega il lavoro alla sua origine. Più incident possono condividere lo stesso problem.', csvButton('issues') + excelButton() + ui`<button class="button primary" id="new-issue">＋ Nuova associazione</button>`) +
    ui`<div class="info-banner">⌘ &nbsp; Incident e problem vengono riportati automaticamente sulle attività con lo stesso codice portale, senza distinzione tra maiuscole e minuscole.</div><section class="panel"><div class="table-toolbar"><strong id="issue-count">${data.issues.length} associazioni</strong><div class="filters"><input id="issue-search" class="issue-search" value="${esc(issueSearch)}" placeholder="Cerca codice, incident o problem…" aria-label="Cerca associazioni"><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Mostra solo le associazioni il cui incident compare in più righe"><input id="issue-duplicates-only" type="checkbox" ${issueDuplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicati <span class="tiny-count">${duplicateCount}</span></label><button class="button subtle" id="issue-columns-button">▥ Colonne</button>${identicalIds.size ? ui`<button class="button subtle" id="remove-identical" title="Elimina le associazioni con stesso codice portale, incident e problem di un’altra, lasciando la prima">Rimuovi identiche <span class="tiny-count">${identicalIds.size}</span></button>` : ''}</div></div>${columnFilterBar('issues')}<div class="table-scroll"><table><thead><tr>${columns.map(id => `<th data-column="${esc(id)}"><div class="column-heading"><span>${esc(columnDef(id, 'issues').field ? columnDef(id, 'issues').name : t(columnDef(id, 'issues').name))}</span>${filterHeader(id, 'issues')}</div></th>`).join('')}<th>Azioni</th></tr></thead><tbody id="issue-rows"></tbody></table></div></section>`;
  function rows(query = $('#issue-search').value) {
    issueSearch = query;
    const issues = filteredIssues(query, duplicates, counts);
    $('#issue-count').textContent = `${issues.length} / ${data.issues.length} ${t('associazioni')}`;
    $('#issue-rows').innerHTML = issues.map(i => {
      const count = counts.get(i.code.trim().toUpperCase()) || 0, group = duplicates.issues.get(i.id);
      const identical = identicalIds.has(i.id) ? `<span class="dup-note" title="${esc(t('Stesso codice portale, incident e problem di un’altra associazione.'))}">${esc(t('identica'))}</span>` : '';
      const incident = group ? `<button type="button" class="dup-ref" data-dup-issue="${esc(group.incident)}" title="${esc(issueDuplicateLine(i.id, group) + '\n' + t('Clic per vedere solo le associazioni coinvolte.'))}">⧉ ${esc(i.incident)}</button>${identical}` : esc(i.incident) || '—';
      const cells = { code: `<td><button class="code-link" data-issue="${i.id}">${esc(i.code)}</button></td>`, incident: `<td>${incident}</td>`, problem: `<td>${pill(i.problem || '—', '#9d8de8')}</td>`, linked: `<td><span class="${count ? 'linked' : 'muted'}">${count ? ui`↗ ${count} attività collegate` : t('In attesa di attività')}</span></td>` };
      return ui`<tr data-issue-row="${esc(i.id)}" class="${group ? 'duplicate-row' : ''}" title="Doppio clic sulla riga per modificare.">${columns.map(id => cells[id] || customCell(i, columnDef(id, 'issues').field, 'issues')).join('')}<td><button class="button small" data-issue="${i.id}">Modifica</button></td></tr>`;
    }).join('') || ui`<tr><td colspan="${columns.length + 1}" class="empty">Nessuna associazione. Aggiungi un codice portale con incident e/o problem.</td></tr>`;
    wireChoicePickers();
    document.querySelectorAll('[data-issue]').forEach(b => b.onclick = () => issueDialog(data.issues.find(i => i.id === b.dataset.issue)));
    document.querySelectorAll('#issue-rows [data-dup-issue]').forEach(b => b.onclick = () => {
      $('#issue-search').value = b.dataset.dupIssue;
      issueDuplicatesOnly = $('#issue-duplicates-only').checked = true;
      rows();
    });
  }
  rows(); $('#issue-search').oninput = e => rows(e.target.value);
  wireColumnFilters('issues'); wireCsvImport('issues');
  $('#issue-columns-button').onclick = () => columnsDialog('issues');
  $('#issue-duplicates-only').onchange = event => { issueDuplicatesOnly = event.target.checked; rows(); };
  $('#new-issue').onclick = () => issueDialog();
  if (identicalIds.size) $('#remove-identical').onclick = () => confirmDialog('Rimuovere le associazioni identiche?', 'Le associazioni con stesso codice portale, incident e problem di un’altra vengono eliminate, lasciando la prima di ciascun gruppo. Incident e problem delle attività non cambiano.', async () => {
    let removed = 0;
    await commit(next => {
      const ids = new Set(findDuplicates(next.tasks, next.issues).identical);
      removed = ids.size;
      next.issues = next.issues.filter(issue => !ids.has(issue.id));
    });
    rerenderPreservingView(); notify(fillText('Associazioni identiche rimosse: {0}.', removed));
  });
}
function issueDialog(existing) {
  const issue = existing || { id: uid(), code: '', incident: '', problem: '' };
  openModal(ui`<form id="issue-form"><div class="modal-heading"><h2>${t(existing ? 'Modifica associazione' : 'Nuova associazione')}</h2><button class="icon-button" type="button" data-close aria-label="Chiudi">✕</button></div><div class="form-grid">
    <label class="field full">Codice portale *<input name="code" required value="${esc(issue.code)}" list="task-codes"><datalist id="task-codes">${[...new Set(data.tasks.map(t => t.code))].map(code => `<option value="${esc(code)}">`).join('')}</datalist></label>
    <label class="field">Incident<input name="incident" value="${esc(issue.incident)}" placeholder="INC-00001"></label><label class="field">Problem<input name="problem" value="${esc(issue.problem)}" placeholder="PRB-00001"></label>
    <p class="duplicate-warning full" id="issue-duplicate" hidden></p>
    ${customEditors('issues', issue)}
    <p class="muted full">Specificare almeno un incident o un problem. Puoi riutilizzare i codici in più associazioni.</p></div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-issue">Elimina</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button class="button primary" type="submit">Salva associazione</button></div></form>`);
  const form = $('#issue-form');
  // Warns while typing when the incident is already in another association; saving stays possible.
  const updateDuplicate = () => {
    const draft = { id: issue.id, code: form.elements.code.value, incident: form.elements.incident.value, problem: form.elements.problem.value };
    const issues = [...data.issues.filter(i => i.id !== issue.id), draft], result = findDuplicates(data.tasks, issues), group = result.issues.get(issue.id);
    $('#issue-duplicate').hidden = !group;
    $('#issue-duplicate').innerHTML = group ? `<strong>⧉ ${esc(t(result.identical.includes(issue.id) ? 'Esiste già un’associazione identica' : 'Incident già presente'))}</strong><span>${esc(issueDuplicateLine(issue.id, group, issues))}</span><span>${esc(t('Puoi salvare comunque: l’associazione sarà segnalata come duplicato.'))}</span>` : '';
  };
  for (const name of ['code', 'incident', 'problem']) form.elements[name].addEventListener('input', updateDuplicate);
  updateDuplicate(); wireEditors();
  $('#issue-form').onsubmit = action(async e => {
    e.preventDefault();
    const fields = new FormData(e.target);
    const item = { ...issue, id: issue.id, code: fields.get('code').trim(), incident: fields.get('incident').trim(), problem: fields.get('problem').trim(), customFields: readCustomEditors(form, 'issues') };
    await commit(next => {
      const index = next.issues.findIndex(i => i.id === item.id);
      if (index < 0) next.issues.push(item); else next.issues[index] = item;
    });
    $('#modal').close(); rerenderPreservingView(); notify('Associazione salvata. Attività aggiornate.');
  });
  if (existing) $('#delete-issue').onclick = () => confirmDialog('Eliminare l’associazione?', 'I relativi incident e problem non appariranno più nelle attività, a meno che esistano altre associazioni.', async () => {
    await commit(next => { next.issues = next.issues.filter(i => i.id !== issue.id); }); rerenderPreservingView();
  });
}
function miniTask(t, readOnly = false) {
  const status = data.settings.statuses.find(s => s.id === t.statusId), urgency = data.settings.urgencies.find(s => s.id === t.urgencyId), mark = highlightOf(t);
  return `<article class="task-card ${t.hidden ? 'is-hidden' : ''} ${mark ? 'is-marked' : ''}" style="--card-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><div class="card-top">${readOnly ? `<strong class="code-label">${esc(t.code)}</strong>` : `<button class="code-link" data-card="${t.id}">${esc(t.code)}</button>`}${portalAnchor(portalUrl(t, data.settings), t.code, 'external-link card-portal-link')}<span class="card-sequence">${t.hidden ? `<span class="hidden-badge" title="${esc(tr('Nascosta dalla lista attività'))}">◌ ${tr('Nascosta in lista')}</span>` : ''}#${t.sequence}</span></div><div class="card-title">${esc(plain(t.description) || tr('Senza descrizione'))}</div><div class="card-meta">${pill(urgency.name, urgency.color)}<span>${effort(t.effortHours)}</span>${mark ? `<span class="mark-chip" title="${esc(tr('Evidenziazione'))}">${esc(mark.name)}</span>` : ''}</div><div class="card-bottom"><span style="color:${t.releaseDate ? dateColor(t.releaseDate) : 'inherit'}">◷ ${formatDate(t.releaseDate)}</span>${!readOnly ? pill(status.name, status.color) : ''}</div></article>`;
}
function renderMilestones() {
  const tasks = data.tasks, dates = [...new Set(tasks.map(t => t.releaseDate).filter(Boolean))].sort();
  milestoneDay = today();
  const nextDate = nextReleaseDate(tasks, milestoneDay), nextLabel = nextDate === milestoneDay ? 'Release di oggi' : 'Prossima release';
  if (tasks.some(t => !t.releaseDate)) dates.push('');
  const shortcut = nextDate ? `<button type="button" class="button next-release-link" id="next-release-button" aria-controls="next-release-milestone" title="${esc(t('Vai alla prossima release'))}">${esc(t(nextLabel))} · ${esc(formatDate(nextDate))}</button>` : `<span class="view-label next-release-empty">${esc(t('Nessuna release in programma'))}</span>`;
  $('#content').innerHTML = heading(data.settings.tabNames[2], 'Ogni release è una tappa. Le date e le attività si allineano automaticamente.', ui`<span class="view-label">${dates.filter(Boolean).length} milestone · ${tasks.length} attività</span>` + shortcut + excelButton()) +
    ui`<div class="milestone-shell"><div class="milestone-scroll"><div class="milestone-track">${dates.map((date, index) => {
      const group = tasks.filter(t => t.releaseDate === date), color = date ? dateColor(date) : '#929bb2', isNext = Boolean(nextDate && date === nextDate);
      return ui`<section class="milestone-column ${isNext ? 'is-next-release' : ''}" data-release-date="${esc(date)}" ${isNext ? 'id="next-release-milestone" aria-current="step"' : ''} style="--milestone:${color}"><div class="timeline-label"><span>${date ? ui`TAPPA ${String(index + 1).padStart(2, '0')}` : 'BACKLOG'}</span>${isNext ? `<span class="next-release-badge">${esc(t(nextLabel))}</span>` : ''}</div><div class="timeline-line"><span>◆</span></div><div class="milestone-heading"><h2>${formatDate(date)}</h2><span>${group.length} attività · ${effort(group.reduce((sum, t) => sum + t.effortHours, 0))}</span><button type="button" class="icon-button milestone-bulk" data-bulk-release="${esc(date)}" title="${esc(t('Modifica multipla delle attività di questa tappa'))}" aria-label="${esc(t('Modifica multipla delle attività di questa tappa'))}">✎</button></div><div class="milestone-cards">${sortedRows(group).map(t => miniTask(t)).join('')}</div></section>`;
    }).join('') || ui`<div class="empty">Aggiungi attività e release date per costruire la tua roadmap.</div>`}</div></div></div><div class="hint">↔ Scorri in orizzontale per esplorare le release e in verticale per tutte le attività. La stessa data mantiene lo stesso colore in ogni vista.</div>`;
  document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => taskDialog(data.tasks.find(t => t.id === b.dataset.card)));
  document.querySelectorAll('[data-bulk-release]').forEach(button => button.onclick = () => {
    const date = button.dataset.bulkRelease;
    bulkDialog(data.tasks.filter(task => task.releaseDate === date).map(task => task.id), date ? fillText('Attività della release del {0}, comprese quelle nascoste.', formatDate(date)) : t('Attività da pianificare, comprese quelle nascoste.'));
  });
  if ($('#next-release-button')) $('#next-release-button').onclick = revealNextMilestone;
  revealNextMilestone();
}
function revealNextMilestone() {
  const scroll = $('.milestone-scroll'), column = $('#next-release-milestone');
  if (!scroll || !column) return;
  const target = column.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
  scroll.scrollLeft += target.left - viewport.left - Math.max(0, (scroll.clientWidth - target.width) / 2);
  scroll.scrollTop = 0;
}
function refreshMilestoneDate() {
  if (view !== 2 || !data || saving || organizationBusy || $('#modal').open || milestoneDay === today()) return;
  rerenderPreservingView();
}
setInterval(refreshMilestoneDate, 60000);
document.addEventListener('visibilitychange', refreshMilestoneDate);
function renderKanban() {
  const tasks = data.tasks;
  $('#content').innerHTML = heading(data.settings.tabNames[3], 'Una vista di sola lettura, sempre allineata alle attività. Ogni stato trova il suo spazio.', ui`<span class="readonly-badge">◈ Sola lettura</span>` + excelButton()) +
    ui`<div class="kanban-scroll"><div class="kanban-board">${data.settings.statuses.map(status => {
      const items = sortTasks(tasks.filter(t => t.statusId === status.id));
      return `<section class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${esc(status.name)}</span><b>${items.length}</b></div><div class="kanban-cards">${items.map(t => miniTask(t, true)).join('') || ui`<div class="kanban-empty">Spazio alle prossime attività</div>`}</div></section>`;
    }).join('')}</div></div><div class="hint">◈ Per modificare uno stato usa la lista attività. L’ordine delle colonne si configura nelle impostazioni.</div>`;
}
// ---- Excel export of the current situation ----
const excelButton = () => `<button type="button" class="button excel-button" data-excel-export title="${esc(t('Esporta la situazione attuale in un file Excel'))}">⤓ Excel</button>`;
document.addEventListener('click', event => { if (data && event.target.closest('[data-excel-export]')) excelDialog(); });
let colorProbe;
// Any CSS color (including the hsl() used for release dates) as #rrggbb, which is what Excel needs.
function hexColor(color, fallback = '#929bb2') {
  colorProbe ||= document.createElement('canvas').getContext('2d');
  colorProbe.fillStyle = fallback;
  colorProbe.fillStyle = String(color || fallback);
  return /^#[0-9a-f]{6}$/i.test(colorProbe.fillStyle) ? colorProbe.fillStyle : fallback;
}
// Mixes a color with white: amount 1 keeps the color, 0 gives white. Keeps cell text readable on any palette.
function tint(color, amount) {
  const hex = hexColor(color);
  return '#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * amount).toString(16).padStart(2, '0')).join('');
}
// Rich text as plain text with real line breaks and list markers, for spreadsheet cells.
function richText(html) {
  const el = document.createElement('div');
  el.innerHTML = sanitize(html);
  el.querySelectorAll('ol').forEach(list => [...list.children].forEach((item, i) => item.prepend(`${i + 1}. `)));
  el.querySelectorAll('ul > li').forEach(item => item.prepend('• '));
  el.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  el.querySelectorAll('p,div,li,blockquote').forEach(node => node.append('\n'));
  return el.textContent.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const EXCEL_SHEETS = [['summary', 'Riepilogo', 'Totali, filtri attivi e distribuzione per stato e urgenza'], ['tasks', 0, 'Una riga per attività con colori, link, date e incident'], ['issues', 1, 'Associazioni, colonne personalizzate e duplicati segnalati'], ['milestones', 2, 'Una riga per release con effort e stati'], ['kanban', 3, 'Le attività in colonne, una per stato']];
let excelChoices = { scope: 'view', columns: 'visible', sheets: EXCEL_SHEETS.map(([id]) => id) };
function excelTasks(scope) {
  if (scope === 'selected') return sortedRows(data.tasks.filter(task => selectedTasks.has(task.id)));
  return sortedRows(scope === 'all' ? data.tasks : filteredTasks());
}
function columnFilterDescriptions(kind) {
  return Object.entries(columnFilters[kind]).map(([id, filter]) => {
    const spec = filterSpec(id, kind);
    const values = filter.values.map(value => spec.type === 'boolean' ? t(value === 'true' ? 'Sì' : 'No') : spec.options?.find(option => String(option.value) === value)?.name || value);
    const parts = [filter.text && `${t('Contiene')}: ${filter.text}`, filter.min && `${t('Da')}: ${filter.min}`, filter.max && `${t('A')}: ${filter.max}`, values.join(', '), filter.empty !== 'any' && t(filter.empty === 'empty' ? 'Solo vuote' : 'Solo valorizzate')].filter(Boolean);
    return `${columnName(id, kind)}: ${parts.join(', ')}`;
  });
}
function activeFilterText(kind = 'tasks') {
  if (kind === 'issues') return [issueSearch && `${t('Ricerca')}: ${issueSearch}`, issueDuplicatesOnly && t('Solo duplicati'), ...columnFilterDescriptions(kind)].filter(Boolean).join(' · ') || t('Nessuno');
  const status = data.settings.statuses.find(s => s.id === statusFilter);
  const highlight = { __any: t('Solo evidenziate'), __none: t('Senza evidenziazione') }[highlightFilter] || highlightsOf().find(h => h.id === highlightFilter)?.name;
  const parts = [search && `${t('Ricerca')}: “${search}”`, status && `${t('Stato')}: ${status.name}`, highlight && `${t('Evidenziazione')}: ${highlight}`, showHidden && t('Nascoste incluse'), duplicatesOnly && t('Solo duplicati')].filter(Boolean);
  parts.push(...columnFilterDescriptions('tasks'));
  return parts.join(' · ') || t('Nessuno');
}
function sortText() {
  return sort.map(entry => {
    const def = columnDef(entry.key)?.field ? columnDef(entry.key) : Object.values(taskColumnDefs).find(column => column.sort === entry.key);
    return `${def?.field ? def.name : t(def?.name || entry.key)} ${entry.direction === 'asc' ? '↑' : '↓'}`;
  }).join(', ');
}
function customSpreadsheetCell(record, field, style) {
  const value = record.customFields?.[field.id];
  if (value === undefined || value === null || value === '') return { v: '', style };
  if (field.type === 'date') return { v: value, type: 'date', style: { ...style, fill: tint(dateColor(value), 0.5) } };
  if (field.type === 'url') return { v: value, link: value, style };
  if (['number', 'effort'].includes(field.type)) return { v: value, type: 'number', style };
  if (field.type === 'select') {
    const option = CustomColumns.choices(field).find(option => option.id === value);
    return { v: option?.name || '', style: { ...style, ...(option && { fill: tint(option.color, 0.35) }) } };
  }
  return { v: field.type === 'richtext' ? richText(value) : customText(value, field), style: { ...style, wrap: true } };
}
async function situationWorkbook(options, now = new Date()) {
  const settings = data.settings, tasks = excelTasks(options.scope), duplicates = duplicatesOf(), wanted = new Set(options.sheets);
  const organization = organizations.find(o => o.id === activeOrganizationId)?.name || '';
  const header = { bold: true, color: '#ffffff', fill: '#2d3142', vertical: 'center', border: '#2d3142' }, grid = '#d9dce6', muted = '#7a8099';
  const section = text => [{ v: text, style: { bold: true, size: 12, color: '#2d3142', border: { color: '#2d3142', style: 'medium', sides: ['bottom'] } } }];
  const hours = list => list.reduce((sum, task) => sum + task.effortHours, 0);
  const statusOf = task => settings.statuses.find(s => s.id === task.statusId), urgencyOf = task => settings.urgencies.find(s => s.id === task.urgencyId);
  const nextDate = nextReleaseDate(tasks, today());
  const sheets = [];
  if (wanted.has('summary')) {
    const scopeLabel = { view: t('Come mostrate nella lista'), all: t('Tutte le attività'), selected: t('Solo le selezionate') }[options.scope];
    const label = text => ({ v: t(text), style: { color: muted } });
    const dated = tasks.filter(task => task.releaseDate), hidden = tasks.filter(task => task.hidden).length, total = hours(tasks);
    const highlighted = tasks.filter(task => highlightOf(task) || statusOf(task).highlight).length, duplicated = tasks.filter(task => duplicates.tasks.has(task.id)).length;
    const breakdown = (title, items, of) => [section(t(title)), [title, 'Attività', 'Ore', 'Effort', '%'].map(text => ({ v: t(text), style: header })),
      ...items.map(item => {
        const group = tasks.filter(task => of(task) === item.id), cell = { border: grid };
        return [{ v: item.name, style: { ...cell, bold: true, fill: tint(item.color, 0.35) } }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? effort(hours(group)) : '', style: cell }, { v: tasks.length ? group.length / tasks.length : 0, type: 'number', style: { ...cell, numFmt: '0%' } }];
      })];
    const rows = [
      [{ v: `${APP_NAME} · ${t('Situazione attuale')}`, style: { bold: true, size: 16, color: '#2d3142' } }], [],
      [label('Organizzazione'), { v: organization, style: { bold: true } }],
      [label('Esportato il'), { v: now, type: 'datetime', style: { horizontal: 'left' } }],
      [label('Versione app'), appVersion || '—'],
      [label('Attività esportate'), scopeLabel],
      ...(options.scope === 'view' ? [[label('Filtri attivi'), activeFilterText()], [label('Filtri issue'), activeFilterText('issues')]] : []),
      [label('Ordinamento'), sortText()],
      [label('Colonne'), t(options.columns === 'all' ? 'Tutte le colonne' : 'Colonne visibili nella lista')],
      [], section(t('Totali')),
      [label('Attività'), tasks.length], [label('Di cui nascoste'), hidden],
      [label('Effort complessivo'), total ? effort(total) : '—'], [label('Effort (ore)'), total],
      [label('Release pianificate'), new Set(dated.map(task => task.releaseDate)).size], [label('Da pianificare'), tasks.length - dated.length],
      [label('Prossima release'), nextDate ? { v: nextDate, type: 'date', style: { horizontal: 'left', bold: true } } : '—', nextDate ? plural(tasks.filter(task => task.releaseDate === nextDate).length, 'attività') : ''],
      [label('In evidenza'), highlighted], [label('Con incident duplicato'), duplicated],
      [], ...breakdown('Stato', settings.statuses, task => task.statusId),
      [], ...breakdown('Urgenza', settings.urgencies, task => task.urgencyId)
    ];
    sheets.push({ name: t('Riepilogo'), columns: [{ width: 26 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 9 }], rows, gridLines: false, tabColor: '#2d3142', merges: [{ row: 0, col: 0, cols: 5 }] });
  }
  if (wanted.has('tasks')) {
    const issues = indexIssues(data.issues);
    const ids = options.columns === 'all' ? normalizeTaskColumns(settings.taskColumns, settings.taskFields).map(column => column.id) : shownColumns();
    const widths = { sequence: 7, code: 16, link: 40, description: 56, urgency: 14, status: 18, highlight: 18, tags: 22, effort: 11, incident: 18, problem: 18, releaseDate: 14, notes: 48 };
    const defs = ids.flatMap(id => id === 'effort' ? [{ id, name: t('Effort'), width: 11 }, { id: 'effortHours', name: t('Effort (ore)'), width: 11 }] : [{ id, name: columnDef(id).field ? columnDef(id).name : t(columnDef(id).name), width: widths[id] || 24 }]);
    if (tasks.some(task => task.hidden)) defs.push({ id: 'hidden', name: t('Nascosta'), width: 11 });
    const rows = [defs.map(def => ({ v: def.name, style: { ...header, wrap: true } }))];
    for (const task of tasks) {
      const status = statusOf(task), urgency = urgencyOf(task), mark = highlightOf(task), links = matchIssues(task, issues), url = portalUrl(task, settings);
      const fill = mark ? tint(mark.color, 0.22) : status.highlight ? tint(status.color, 0.14) : '';
      const base = { border: grid, vertical: 'top', ...(fill && { fill }), ...(task.hidden && { italic: true, color: muted }) };
      const cell = (v, style = {}, extra = {}) => ({ v, ...extra, style: { ...base, ...style } });
      rows.push(defs.map(def => {
        switch (def.id) {
          case 'sequence': return cell(task.sequence, { horizontal: 'right' });
          case 'code': return cell(task.code, { bold: true }, url ? { link: url } : {});
          case 'link': return cell(url, {}, url ? { link: url } : {});
          case 'description': return cell(richText(task.description), { wrap: true });
          case 'notes': return cell(richText(task.notes), { wrap: true });
          case 'urgency': return cell(urgency.name, { fill: tint(urgency.color, 0.35) });
          case 'status': return cell(status.name, { fill: tint(status.color, 0.35), bold: Boolean(status.highlight) });
          case 'highlight': return cell(mark?.name || '', mark ? { fill: tint(mark.color, 0.45) } : {});
          case 'tags': return cell(tagsOf(task).map(tag => tag.name).join(', '), { wrap: true });
          case 'effort': return cell(task.effortHours ? effort(task.effortHours) : '');
          case 'effortHours': return cell(task.effortHours);
          case 'incident': return cell(links.incidents.join('\n'), { wrap: true, ...(duplicates.tasks.has(task.id) && { fill: tint('#f2b94a', 0.45) }) });
          case 'problem': return cell(links.problems.join('\n'), { wrap: true });
          case 'releaseDate': return task.releaseDate ? cell(task.releaseDate, { fill: tint(dateColor(task.releaseDate), 0.5), horizontal: 'center' }, { type: 'date' }) : cell(t('Da pianificare'), { italic: true, color: muted, horizontal: 'center' });
          case 'hidden': return cell(task.hidden ? t('Sì') : '', { horizontal: 'center' });
          default: return columnDef(def.id)?.field ? customSpreadsheetCell(task, columnDef(def.id).field, base) : cell('');
        }
      }));
    }
    const code = defs.findIndex(def => def.id === 'code');
    sheets.push({ name: settings.tabNames[0], columns: defs.map(def => ({ width: def.width })), rows, freeze: { row: 1, col: code >= 0 && code < 3 ? code + 1 : 0 }, autoFilter: true, tabColor: settings.themes.find(theme => theme.id === settings.themeId)?.accent, print: { landscape: true, fitWidth: true } });
  }
  if (wanted.has('issues')) {
    const identical = new Set(duplicates.identical), cell = { border: grid, vertical: 'top' };
    const ids = options.columns === 'all' ? CustomColumns.normalizeIssueColumns(settings.issueColumns, settings.issueFields).map(column => column.id) : shownIssueColumns();
    const rows = [[...ids.map(id => ({ v: columnDef(id, 'issues').field ? columnDef(id, 'issues').name : t(id === 'linked' ? 'Attività collegate' : columnDef(id, 'issues').name), style: header })), { v: t('Duplicato'), style: header }],
      ...(options.scope === 'view' ? filteredIssues() : data.issues).map(issue => {
        const linked = data.tasks.filter(task => task.code.trim().toUpperCase() === issue.code.trim().toUpperCase()), task = linked[0], url = task ? portalUrl(task, settings) : '', group = duplicates.issues.get(issue.id);
        const values = { code: { v: issue.code, link: url, style: { ...cell, bold: true } }, incident: { v: issue.incident, style: { ...cell, ...(group && { fill: tint('#f2b94a', 0.45) }) } }, problem: { v: issue.problem, style: cell }, linked: { v: linked.length, style: cell } };
        return [...ids.map(id => values[id] || customSpreadsheetCell(issue, columnDef(id, 'issues').field, cell)), { v: group ? t(identical.has(issue.id) ? 'identica' : 'Sì') : '', style: { ...cell, horizontal: 'center' } }];
      })];
    sheets.push({ name: settings.tabNames[1], columns: [...ids.map(() => ({ width: 22 })), { width: 12 }], rows, freeze: { row: 1 }, autoFilter: true });
  }
  if (wanted.has('milestones')) {
    const dates = [...new Set(tasks.map(task => task.releaseDate).filter(Boolean))].sort(), day = today();
    if (tasks.some(task => !task.releaseDate)) dates.push('');
    const rows = [['Tappa', 'Release date', 'Release', 'Attività', 'Ore', 'Effort'].map(text => ({ v: t(text), style: header })).concat(settings.statuses.map(status => ({ v: status.name, style: { ...header, fill: tint(status.color, 0.55), color: '#1d2030', wrap: true } })), { v: t('Codici'), style: header })];
    dates.forEach((date, index) => {
      const group = tasks.filter(task => task.releaseDate === date), next = Boolean(date && date === nextDate), fill = next ? '#fff1c2' : '';
      const state = !date ? t('Da pianificare') : next ? t(date === day ? 'Release di oggi' : 'Prossima release') : t(date < day ? 'Passata' : 'Futura');
      const cell = { border: grid, vertical: 'top', ...(fill && { fill }), ...(next && { bold: true }) };
      rows.push([{ v: date ? index + 1 : '—', style: { ...cell, horizontal: 'center' } }, date ? { v: date, type: 'date', style: { ...cell, fill: fill || tint(dateColor(date), 0.5), horizontal: 'center' } } : { v: t('Da pianificare'), style: { ...cell, italic: true } }, { v: state, style: cell }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? effort(hours(group)) : '', style: cell },
        ...settings.statuses.map(status => ({ v: group.filter(task => task.statusId === status.id).length || '', style: { ...cell, horizontal: 'center' } })), { v: sortedRows(group).map(task => task.code).join(', '), style: { ...cell, wrap: true } }]);
    });
    sheets.push({ name: settings.tabNames[2], columns: [{ width: 8 }, { width: 14 }, { width: 17 }, { width: 10 }, { width: 9 }, { width: 11 }, ...settings.statuses.map(() => ({ width: 12 })), { width: 60 }], rows, freeze: { row: 1, col: 2 } });
  }
  if (wanted.has('kanban')) {
    const columns = settings.statuses.map(status => sortTasks(tasks.filter(task => task.statusId === status.id)));
    const rows = [settings.statuses.map((status, i) => ({ v: `${status.name} (${columns[i].length})`, style: { bold: true, fill: tint(status.color, 0.45), border: { color: hexColor(status.color), style: 'medium', sides: ['bottom'] }, horizontal: 'center' } }))];
    for (let r = 0; r < Math.max(0, ...columns.map(list => list.length)); r++) {
      rows.push(columns.map((list, i) => {
        const task = list[r];
        if (!task) return '';
        const text = plain(task.description), url = portalUrl(task, settings);
        return { v: `${task.code}${text ? ` · ${text.length > 90 ? text.slice(0, 89) + '…' : text}` : ''}`, link: url, style: { wrap: true, vertical: 'top', border: grid, fill: tint(settings.statuses[i].color, 0.12), ...(task.hidden ? { italic: true, color: muted } : url ? {} : { color: '#1d2030' }) } };
      }));
    }
    sheets.push({ name: settings.tabNames[3], columns: settings.statuses.map(() => ({ width: 34 })), rows, freeze: { row: 1 } });
  }
  return window.OrbitaXlsx.buildWorkbook({ title: `${APP_NAME} · ${organization}`, creator: APP_NAME, application: APP_NAME, created: now, sheets });
}
async function exportExcel(options) {
  const organization = organizations.find(o => o.id === activeOrganizationId)?.name || '';
  const bytes = await situationWorkbook(options);
  const result = await workspaceApi.exportSpreadsheet(situationFileName(organization, currentLanguage()), bytes);
  if (result) notify('Excel esportato:', false, result.fileName);
  return result;
}
function excelDialog(preset = {}) {
  const selected = data.tasks.filter(task => selectedTasks.has(task.id)).length, choices = { ...excelChoices, ...preset };
  if (choices.scope === 'selected' && !selected) choices.scope = 'view';
  const columns = normalizeTaskColumns(data.settings.taskColumns, data.settings.taskFields);
  const radio = (name, value, title, detail, disabled = false) => `<label class="choice-card ${disabled ? 'is-disabled' : ''}"><input type="radio" name="${name}" value="${value}" ${choices[name] === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(t(title))}</strong><small>${esc(detail)}</small></span></label>`;
  const sheetCards = EXCEL_SHEETS.map(([id, name, detail]) => `<label class="choice-card"><input type="checkbox" name="sheets" value="${id}" ${choices.sheets.includes(id) ? 'checked' : ''}><span><strong>${esc(typeof name === 'number' ? data.settings.tabNames[name] : t(name))}</strong><small>${esc(t(detail))}</small></span></label>`).join('');
  openModal(ui`<form id="excel-form" novalidate><div class="modal-heading"><div><div class="eyebrow">EXCEL</div><h2>Esporta in Excel</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div>
    <p class="section-description">Crea una cartella di lavoro .xlsx. Riepilogo, milestone e kanban seguono le attività scelte. “Come mostrate” applica anche i filtri delle issue; le altre opzioni esportano tutte le issue.</p>
    <fieldset class="excel-group"><legend>Attività da esportare</legend><div class="choice-grid">${radio('scope', 'view', 'Come mostrate nella lista', fillText('{0} · filtri e ordinamento attuali', plural(filteredTasks().length, 'attività')))}${radio('scope', 'all', 'Tutte le attività', fillText('{0}, comprese le nascoste', plural(data.tasks.length, 'attività')))}${radio('scope', 'selected', 'Solo le selezionate', selected ? fillText('{0} selezionate', selected) : t('Nessuna attività selezionata'), !selected)}</div></fieldset>
    <fieldset class="excel-group"><legend>Colonne dei fogli attività e issue</legend><div class="choice-grid">${radio('columns', 'visible', 'Colonne visibili nella lista', fillText('Attività: {0} · Issue: {1}', shownColumns().length, shownIssueColumns().length))}${radio('columns', 'all', 'Tutte le colonne', fillText('Attività: {0} · Issue: {1}', columns.length, CustomColumns.normalizeIssueColumns(data.settings.issueColumns, data.settings.issueFields).length))}</div></fieldset>
    <fieldset class="excel-group"><legend>Fogli</legend><div class="choice-grid sheets">${sheetCards}</div></fieldset>
    <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button type="submit" class="button primary" id="excel-save">⤓ Esporta</button></div></form>`);
  const form = $('#excel-form');
  form.onsubmit = action(async event => {
    event.preventDefault();
    const fields = new FormData(form), options = { scope: fields.get('scope') || 'view', columns: fields.get('columns') || 'visible', sheets: fields.getAll('sheets') };
    if (!options.sheets.length) throw new Error('Scegli almeno un foglio da esportare.');
    if (options.scope === 'selected' && !selectedTasks.size) throw new Error('Seleziona almeno un’attività.');
    excelChoices = options;
    $('#excel-save').disabled = true;
    try {
      if (await exportExcel(options) && $('#modal').open && $('#excel-form') === form) $('#modal').close();
    } finally { if (form.isConnected) $('#excel-save').disabled = false; }
  });
}
const exportKinds = [['themes', '◐', 'Esporta temi'], ['settings', '⚙', 'Esporta configurazione'], ['data', '▤', 'Esporta dati'], ['organization', '◈', 'Esporta tutto']];
const exportedMessages = { themes: 'Temi esportati:', settings: 'Configurazione esportata:', data: 'Dati esportati:', organization: 'Organizzazione esportata:' };
const importKindNames = { themes: 'Temi', settings: 'Configurazione', data: 'Dati', organization: 'Organizzazione completa' };
const fillText = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), t(text));
function transferPanel() {
  const settings = data.settings, activeTheme = settings.themes.find(theme => theme.id === settings.themeId);
  const details = {
    themes: `${plural(settings.themes.length, 'tema')} · ${fillText('attivo: {0}', esc(activeTheme.name))}`,
    settings: `${plural(settings.statuses.length, 'stato')} · ${plural(settings.urgencies.length, 'urgenza')} · ${plural((settings.highlights || []).length, 'evidenziatore')} · ${(settings.tags || []).length} ${t('Tags')} · ${t(settings.logo ? 'lingua, link, tab, colonne, dimensioni del testo e logo' : 'lingua, link, tab, colonne e dimensioni del testo')}`,
    data: `${plural(data.tasks.length, 'attività')} · ${plural(data.issues.length, 'issue')}`,
    organization: t('Temi, configurazione e dati in un unico file')
  };
  const cards = exportKinds.map(([kind, icon, label]) => `<button type="button" class="transfer-card" data-export-kind="${kind}"><span class="transfer-icon" aria-hidden="true">${icon}</span><span class="transfer-text"><strong>${t(label)}</strong><small>${details[kind]}</small></span></button>`).join('');
  return ui`<section class="panel settings-section full" id="transfer-panel"><div class="storage-heading"><div><h2>Esporta e importa organizzazione</h2><p class="section-description">Salva temi, configurazione e dati di questa organizzazione in file separati, da condividere o da reimportare qui o in un’altra copia di OrbitKanban.</p></div><span class="readonly-badge">FILE JSON</span></div><div class="transfer-grid">${cards}</div><div class="storage-actions"><button type="button" class="button primary" id="import-organization">↙ Importa da file…</button><input type="file" id="organization-file" accept=".json,application/json" hidden><span class="transfer-hint">Scegli un file esportato da OrbitKanban: prima di applicarlo potrai decidere quali parti importare e dove.</span></div></section>`;
}
function wireTransfer() {
  document.querySelectorAll('[data-export-kind]').forEach(button => {
    const kind = button.dataset.exportKind;
    button.onclick = action(() => withSavedSettings(async () => {
      const result = await workspaceApi.exportOrganization(activeOrganizationId, kind);
      if (result) notify(exportedMessages[kind], false, result.fileName);
    }, 'transfer'));
  });
  $('#import-organization').onclick = action(() => withSavedSettings(() => {
    const input = $('#organization-file');
    input.value = '';
    input.click();
  }, 'transfer'));
  $('#organization-file').onchange = action(async event => {
    const input = event.target, file = input.files[0];
    if (!file) return;
    input.value = '';
    if (file.size > 32 * 1024 * 1024) throw new Error(t('File troppo grande per un’esportazione OrbitKanban.'));
    organizationImportDialog(parseOrganizationFile(await file.text()));
  });
}
function organizationImportDialog(file) {
  const current = organizations.find(o => o.id === activeOrganizationId), toNew = file.kind === 'organization';
  const fileTheme = file.themes?.themes.find(theme => theme.id === file.themes.themeId);
  const exportedAt = file.exportedAt ? new Date(file.exportedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const origin = [file.organization.name ? fillText('Da «{0}»', esc(file.organization.name)) : esc(t('Organizzazione senza nome')), exportedAt && fillText('esportato il {0}', esc(exportedAt)), file.appVersion && `OrbitKanban v${esc(file.appVersion)}`].filter(Boolean).join(' · ');
  const part = (name, title, detail, extra = '') => `<div class="import-part"><label class="import-check"><input type="checkbox" name="${name}" checked><span><strong>${esc(t(title))}</strong><small>${detail}</small></span></label>${extra}</div>`;
  const radio = (name, value, title, detail, checked) => `<label class="radio-card"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span><strong>${esc(t(title))}</strong><small>${detail}</small></span></label>`;
  const parts = [
    file.themes && part('themes', 'Temi', `${plural(file.themes.themes.length, 'tema')}: ${esc(t('quelli con lo stesso identificativo vengono aggiornati, gli altri aggiunti.'))}`,
      `<label class="import-sub"><input type="checkbox" name="activateTheme" checked><span>${fillText('Attiva il tema «{0}»', esc(fileTheme.name))}</span><span class="theme-swatches">${themeFields.map(([key]) => `<i style="background:${fileTheme[key]}"></i>`).join('')}</span></label>`),
    file.settings && part('settings', 'Configurazione', esc(t(file.settings.tags ? 'Lingua, link al portale, nomi delle tab, ore per giorno, dimensioni del testo, stati, urgenze, evidenziatori, tags e colonne della lista. Sostituisce la configurazione attuale.' : file.settings.highlights ? 'Lingua, link al portale, nomi delle tab, ore per giorno, dimensioni del testo, stati, urgenze, evidenziatori e colonne della lista. Sostituisce la configurazione attuale.' : file.settings.fontSizes ? 'Lingua, link al portale, nomi delle tab, ore per giorno, dimensioni del testo, stati e urgenze. Sostituisce la configurazione attuale.' : 'Lingua, link al portale, nomi delle tab, ore per giorno, stati e urgenze. Sostituisce la configurazione attuale.')),
      file.settings.logo ? `<label class="import-sub"><input type="checkbox" name="logo"><img class="import-logo" src="${file.settings.logo}" alt=""><span>${esc(t('Sostituisci anche il logo'))}</span></label>` : ''),
    file.data && part('data', 'Dati', `${plural(file.data.tasks.length, 'attività')} · ${plural(file.data.issues.length, 'issue')}`,
      `<div class="import-sub import-modes" id="import-data-mode">${radio('dataMode', 'merge', 'Aggiungi e aggiorna', esc(t('Le attività con lo stesso identificativo vengono aggiornate, le issue già presenti non vengono duplicate.')), true)}${radio('dataMode', 'replace', 'Sostituisci tutto', esc(t('Attività e issue attuali vengono sostituite da quelle del file.')), false)}</div>`)
  ].filter(Boolean).join('');
  const destinations = radio('destination', 'current', 'In questa organizzazione', esc(current.name), !toNew) + radio('destination', 'new', 'In una nuova organizzazione', esc(t('L’organizzazione attuale non viene modificata.')), toNew);
  const suggestedName = uniqueOrganizationName(file.organization.name, organizations.map(o => o.name), t('Organizzazione importata'));
  openModal(ui`<form id="organization-import-form"><div class="modal-heading"><div><div class="eyebrow">IMPORTAZIONE</div><h2>Importa da file</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div><div class="import-source"><span class="import-kind">${esc(t(importKindNames[file.kind]))}</span><span>${origin}</span></div><fieldset class="import-parts"><legend>Cosa importare</legend>${parts}</fieldset><fieldset class="import-target"><legend>Dove importare</legend><div class="import-destinations">${destinations}</div><label class="field" id="import-name-field">Nome della nuova organizzazione<input name="name" maxlength="100" required value="${esc(suggestedName)}"></label></fieldset><ul class="import-notes" id="import-notes" aria-live="polite"></ul><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button type="submit" class="button primary" id="confirm-import">Importa</button></div></form>`);
  const form = $('#organization-import-form'), fields = form.elements;
  const selected = name => Boolean(fields[name]?.checked);
  let logoChoice = false;
  const refresh = () => {
    const toNewOrganization = fields.destination.value === 'new';
    if (fields.activateTheme) fields.activateTheme.disabled = !selected('themes');
    if (fields.logo) {
      fields.logo.checked = selected('settings') && (toNewOrganization || logoChoice);
      fields.logo.disabled = toNewOrganization || !selected('settings');
    }
    if (fields.dataMode) {
      $('#import-data-mode').hidden = toNewOrganization;
      form.querySelectorAll('[name="dataMode"]').forEach(input => { input.disabled = !selected('data'); });
    }
    $('#import-name-field').hidden = !toNewOrganization;
    fields.name.disabled = !toNewOrganization;
    $('#confirm-import').disabled = !['themes', 'settings', 'data'].some(selected);
    $('#confirm-import').textContent = t(toNewOrganization ? 'Crea e importa' : 'Importa');
    const notes = [];
    if (toNewOrganization) notes.push('Verrà creata una nuova organizzazione con le parti selezionate: quella attuale non viene modificata.');
    else {
      if (selected('settings')) notes.push('La configurazione attuale verrà sostituita: le attività esistenti restano e vengono associate agli stati e alle urgenze del file con lo stesso nome, altrimenti nella stessa posizione.');
      else if (selected('data')) notes.push('Stati e urgenze delle attività importate vengono associati a quelli di questa organizzazione con lo stesso nome, altrimenti nella stessa posizione.');
      if (selected('data') && fields.dataMode.value === 'replace') notes.push('Tutte le attività e le issue attuali di questa organizzazione verranno eliminate e sostituite da quelle del file.');
      notes.push('Se vuoi poter tornare indietro, esporta prima un backup o l’organizzazione completa.');
    }
    $('#import-notes').innerHTML = notes.map(note => `<li>${esc(t(note))}</li>`).join('');
  };
  if (fields.logo) fields.logo.addEventListener('change', () => { logoChoice = fields.logo.checked; });
  form.addEventListener('change', refresh);
  refresh();
  form.onsubmit = action(async event => {
    event.preventDefault();
    const options = { themes: selected('themes'), activateTheme: selected('activateTheme'), settings: selected('settings'), logo: selected('logo'), data: selected('data'), dataMode: fields.dataMode?.value === 'replace' ? 'replace' : 'merge' };
    if (fields.destination.value === 'new') {
      const name = fields.name.value.trim();
      if (!name || name.length > 100) throw new Error(t('Nome organizzazione non valido.'));
      await organizationAction('import', { name, data: importedOrganizationData(file, options, data.settings.language) });
      $('#modal').close();
      notify('Organizzazione importata.');
      return;
    }
    await commit(next => {
      const imported = applyOrganizationImport(next, file, options);
      next.settings = imported.settings; next.tasks = imported.tasks; next.issues = imported.issues;
    });
    statusFilter = '';
    $('#modal').close(); render(); notify('Importazione completata.');
  });
}
const fontSizeLabels = {
  base: ['Testo generale', 'Barra superiore, pulsanti, statistiche, filtri, impostazioni e messaggi.'],
  sidebar: ['Barra laterale', 'Organizzazione, viste e informazioni nella colonna di sinistra.'],
  headings: ['Intestazioni di pagina', 'Occhiello, titolo e descrizione in cima a ogni vista.'],
  tables: ['Tabelle', 'Righe e colonne della lista attività e delle issue collegate.'],
  milestones: ['Vista milestone', 'Date, tappe e schede della roadmap.'],
  kanban: ['Vista kanban', 'Colonne e schede della board.'],
  dialogs: ['Finestre di dialogo', 'Modifica di attività e issue, conferme e importazione.']
};
const fontPresets = [[85, 'Compatta'], [100, 'Standard'], [115, 'Ampia'], [130, 'Molto ampia']];
function sampleTask() {
  const { statuses, urgencies } = data.settings;
  return data.tasks.find(task => task.releaseDate && !task.hidden && plain(task.description)) || data.tasks.find(task => task.releaseDate) || data.tasks[0] || {
    id: 'font-sample', code: 'PRJ-1042', sequence: 1, url: '', description: t('Esempio: prepara il rilascio e aggiorna la documentazione.'), notes: '',
    releaseDate: new Date().toLocaleDateString('en-CA'), statusId: statuses[Math.min(1, statuses.length - 1)].id, urgencyId: urgencies[0].id, effortHours: 12, hidden: false
  };
}
function fontSample(id, task) {
  const settings = data.settings, status = settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0];
  const color = task.releaseDate ? dateColor(task.releaseDate) : '#929bb2', group = data.tasks.includes(task) ? data.tasks.filter(item => item.releaseDate === task.releaseDate) : [task];
  const samples = {
    base: () => ui`<div class="sample-stack"><div class="stat"><span>Attività visibili <span class="stat-icon">▤</span></span><strong>${visibleTasks().length}<small>nel tuo workspace</small></strong></div><div class="sample-actions"><span class="button primary">＋ Nuova attività</span><span class="button">Salva impostazioni</span></div></div>`,
    sidebar: () => [0, 1, 2].map(i => `<div class="nav-button ${i ? '' : 'active'}"><span class="nav-icon">${icons[i]}</span><span>${esc(settings.tabNames[i])}</span>${i ? '' : `<span class="nav-count">${visibleTasks().length}</span>`}</div>`).join(''),
    headings: () => heading(settings.tabNames[0], 'Tutte le attività, una direzione. Pianifica il lavoro e tieni a fuoco le prossime release.'),
    tables: () => ui`<table><thead><tr><th>Codice portale</th><th>Descrizione</th><th>Release date</th></tr></thead><tbody><tr><td><span class="code-link">${esc(task.code)}</span></td><td><span class="description-cell">${esc(plain(task.description) || tr('Senza descrizione'))}</span></td><td><span class="date-pill" style="--date:${color}">◷ ${formatDate(task.releaseDate)}</span></td></tr></tbody></table>`,
    milestones: () => ui`<div style="--milestone:${color}"><div class="timeline-label">TAPPA ${'01'}</div><div class="timeline-line"><span>◆</span></div><div class="milestone-heading"><h2>${formatDate(task.releaseDate)}</h2><span>${group.length} attività · ${effort(group.reduce((sum, item) => sum + item.effortHours, 0))}</span></div><div class="milestone-cards">${miniTask(task)}</div></div>`,
    kanban: () => `<div class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${esc(status.name)}</span><b>${data.tasks.filter(item => item.statusId === status.id).length}</b></div><div class="kanban-cards">${miniTask(task, true)}</div></div>`,
    dialogs: () => ui`<div class="sample-dialog"><div class="modal-heading"><div><div class="eyebrow">ATTIVITÀ</div><h2>Modifica attività</h2></div><span class="icon-button">✕</span></div><label class="field">Codice portale<input value="${esc(task.code)}" readonly tabindex="-1"></label><div class="modal-actions"><span class="spacer"></span><span class="button">Annulla</span><span class="button primary">Salva attività</span></div></div>`
  };
  return samples[id]();
}
function fontSizePanel() {
  const sizes = settingsDraft.fontSizes || defaultFontSizes(), task = sampleTask();
  const families = [true, false].map(bundled => `<optgroup label="${esc(t(bundled ? 'Inclusi nel portable (offline)' : 'Font di sistema (se installati)'))}">${FONT_FAMILIES.filter(font => Boolean(font.bundled) === bundled).map(font => `<option value="${font.id}" ${font.id === (settingsDraft.fontFamily ?? DEFAULT_FONT_FAMILY) ? 'selected' : ''}>${font.name}</option>`).join('')}</optgroup>`).join('');
  const presets = fontPresets.map(([value, name]) => `<button type="button" class="button small font-preset" data-font-preset="${value}" aria-pressed="false">${esc(t(name))} <small>${value}%</small></button>`).join('');
  const cards = FONT_SIZE_PARTS.map(({ id, min, max }) => {
    const [name, description] = fontSizeLabels[id], value = sizes[id] ?? 100, reset = t('Ripristina 100%');
    return `<div class="font-size-card" data-font-card="${id}"><div class="font-size-title"><label for="font-size-${id}">${esc(t(name))}</label><small id="font-size-${id}-hint">${esc(t(description))}</small></div><div class="font-size-control"><span class="font-size-limit" aria-hidden="true">${min}%</span><input type="range" id="font-size-${id}" data-font-size="${id}" min="${min}" max="${max}" step="${FONT_SIZE_STEP}" value="${value}" aria-describedby="font-size-${id}-hint"><span class="font-size-limit" aria-hidden="true">${max}%</span><output class="font-size-value" id="font-size-${id}-value" for="font-size-${id}">${value}%</output><button type="button" class="icon-button font-size-reset" data-font-reset="${id}" title="${esc(reset)}" aria-label="${esc(`${reset}: ${t(name)}`)}">↺</button></div><div class="font-sample" data-part="${id}" inert aria-hidden="true">${fontSample(id, task)}</div></div>`;
  }).join('');
  return ui`<section class="panel settings-section full" id="font-size-panel"><label class="field font-family-field"><span>${esc(t('Font dell’interfaccia'))}</span><select id="font-family">${families}</select><small>${esc(t('Anteprima immediata; salva per mantenere la scelta. I font inclusi funzionano offline su ogni PC. I font di sistema, come Aptos, richiedono l’installazione locale; se mancano viene usato un carattere alternativo.'))}</small></label><div class="font-size-heading"><div><h2>Dimensione del testo</h2><p class="section-description">Regola il testo di ogni parte dell’app: l’anteprima è immediata in tutta l’interfaccia, salva per mantenerla. Minimi e massimi mantengono tutto leggibile e ordinato.</p></div><div class="font-presets" role="group" aria-label="Preimpostazioni">${presets}</div></div><div class="font-size-grid">${cards}<div class="font-size-card font-size-notes"><h3>Buono a sapersi</h3><ul><li>100% è la dimensione consigliata; le preimpostazioni regolano tutte le parti insieme.</li><li>Ogni parte ha un minimo e un massimo, a passi del 5%: l’interfaccia resta sempre utilizzabile.</li><li>Le dimensioni valgono solo per questa organizzazione e sono incluse nell’esportazione della configurazione.</li></ul></div></div></section>`;
}
function paintFontFamily(value = DEFAULT_FONT_FAMILY) {
  const font = FONT_FAMILIES.find(font => font.id === value);
  if (!font) throw new Error(t('Font non valido.'));
  document.documentElement.style.fontFamily = font.css;
  if (font.bundled) document.fonts.load(`400 14px "${font.name}"`).then(faces => {
    if (!faces.length) throw new Error(`Missing font face: ${font.name}`);
  }).catch(error => {
    console.error('Portable font load failed:', error);
    notify(t('Impossibile caricare il font incluso. Verifica i file dell’app o scegli un altro font.') + ` (${font.name})`, true);
  });
}
function wireFontSizes() {
  $('#font-family').onchange = event => {
    settingsDraft.fontFamily = event.target.value;
    paintFontFamily(settingsDraft.fontFamily);
    refreshSettingsState();
  };
  const draftSizes = () => (settingsDraft.fontSizes ??= defaultFontSizes());
  const sync = () => {
    const sizes = settingsDraft.fontSizes || defaultFontSizes();
    for (const { id } of FONT_SIZE_PARTS) {
      const value = sizes[id] ?? 100, input = $(`#font-size-${id}`);
      input.value = String(value);
      input.setAttribute('aria-valuetext', `${value}%`);
      $(`#font-size-${id}-value`).textContent = `${value}%`;
      $(`[data-font-reset="${id}"]`).disabled = value === 100;
      $(`[data-font-card="${id}"]`).classList.toggle('changed', value !== (data.settings.fontSizes?.[id] ?? 100));
    }
    document.querySelectorAll('[data-font-preset]').forEach(button => {
      button.setAttribute('aria-pressed', String(FONT_SIZE_PARTS.every(({ id }) => (sizes[id] ?? 100) === clampFontSize(id, button.dataset.fontPreset))));
    });
    paintFontSizes(sizes);
  };
  document.querySelectorAll('[data-font-size]').forEach(input => input.oninput = () => {
    draftSizes()[input.dataset.fontSize] = clampFontSize(input.dataset.fontSize, input.value);
    sync();
  });
  document.querySelectorAll('[data-font-reset]').forEach(button => button.onclick = () => {
    draftSizes()[button.dataset.fontReset] = 100;
    sync();
  });
  document.querySelectorAll('[data-font-preset]').forEach(button => button.onclick = () => {
    const sizes = draftSizes();
    for (const { id } of FONT_SIZE_PARTS) sizes[id] = clampFontSize(id, button.dataset.fontPreset);
    sync();
  });
  sync();
}
async function loadBackupList() {
  const requestId = ++backupRequest;
  const result = await workspaceApi.backups('list');
  if (requestId !== backupRequest || !$('#backup-list')) return;
  $('#backup-status').textContent = fillText('Copie disponibili: {0} su {1}.', result.backups.length, result.retention);
  $('#backup-list').innerHTML = result.backups.length ? result.backups.map(backup => {
    const date = new Date(`${backup.date}T12:00:00`);
    const label = Number.isNaN(date.getTime()) ? backup.date : date.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
    const size = backup.size >= 1024 * 1024 ? `${(backup.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(backup.size / 1024))} KB`;
    return `<article class="backup-item"><div class="backup-info"><strong>${esc(label)}</strong><small>${esc(size)} · ${esc(backup.fileName)}</small></div><button type="button" class="button small danger" data-restore-backup="${esc(backup.fileName)}">${esc(t('Ripristina…'))}</button></article>`;
  }).join('') : `<p class="backup-empty">${esc(t('Non sono ancora disponibili copie automatiche.'))}</p>`;
}
function restoreDailyBackup(fileName) {
  const date = fileName.slice(0, 10);
  confirmDialog('Ripristinare questa copia?', fillText('Il backup del {0} sostituirà tutte le organizzazioni, attività e impostazioni. Prima viene creato workspace.json.bak con lo stato corrente.', date), async () => {
    const snapshot = await workspaceApi.backups('restore', fileName);
    columnFilters = { tasks: {}, issues: {} }; issueSearch = '';
    clearHistory();
    adoptSnapshot(snapshot);
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
    render();
    notify('Backup ripristinato.');
  });
}
function pendingCustomColumns() {
  return [...document.querySelectorAll('[data-add-field]')].filter(form => form.elements.name.value.trim());
}
function newCustomField(form) {
  const values = new FormData(form), type = values.get('type');
  return { id: `custom-${uid()}`, name: values.get('name').trim(), type, options: ['select', 'multiselect'].includes(type) ? [{ id: uid(), name: `${t('Opzione')} 1`, color: '#a392ff' }] : [] };
}
function customColumnsPanel() {
  return `<section class="panel settings-section" id="custom-columns-panel"><h2>${esc(t('Colonne personalizzate'))}</h2><p class="section-description">${esc(t('Fino a 30 colonne per lista. Il tipo si sceglie alla creazione; nome, opzioni e ordine restano modificabili. Salvare le impostazioni per applicare.'))}</p><p class="section-description">${esc(t('Salva impostazioni include anche le nuove colonne compilate qui sotto. Usa Aggiungi colonna per configurare subito etichette e colori o preparare altre colonne prima di salvare.'))}</p>${['tasks', 'issues'].map((kind, index) => `<section class="custom-schema"><h3>${esc(data.settings.tabNames[index])}</h3><div id="custom-definitions-${kind}"></div><form class="custom-add-form" data-add-field="${kind}"><label class="field">${esc(t('Nome colonna'))}<input name="name" maxlength="60" required></label><label class="field">${esc(t('Tipo'))}<select name="type">${Object.entries(fieldTypeNames).map(([type, name]) => `<option value="${type}">${esc(t(name))}</option>`).join('')}</select></label><button type="submit" class="button">${esc(t('Aggiungi colonna'))}</button></form></section>`).join('')}<h3>${esc(t('Colonne visibili nelle issue'))}</h3><div id="issue-columns-editor"></div></section>`;
}
function refreshChoiceSettings() {
  let panels = $('#choice-settings-panels');
  if (!panels) { panels = document.createElement('div'); panels.id = 'choice-settings-panels'; $('.settings-panels').append(panels); }
  panels.innerHTML = choiceSettingsTabs().map(tab => `<section class="panel settings-section" id="${tab.panel}"><h2>${esc(tab.field.name)}</h2><p class="section-description">${esc(t('Gestisci etichette, colori e ordine come nei Tags. Le etichette eliminate vengono rimosse dalle righe solo al salvataggio.'))}</p><div id="${tab.id}-list"></div><button type="button" class="button" data-add-choice="${tab.id}">+ ${esc(t('Aggiungi etichetta'))}</button></section>`).join('');
  $('.settings-nav').outerHTML = settingsNav();
  document.querySelectorAll('[data-add-choice]').forEach(button => button.onclick = () => {
    const list = optionCatalog(button.dataset.addChoice);
    if (list.length >= 100) { notify('Opzioni della colonna non valide.', true); return; }
    let index = 1;
    while (list.some(option => option.name.trim().toLocaleLowerCase() === `${t('Opzione')} ${index}`.toLocaleLowerCase())) index++;
    list.push({ id: uid(), name: `${t('Opzione')} ${index}`, color: '#a392ff' });
    drawOptionLists(); refreshSettingsState();
  });
  drawOptionLists(); showSettingsTab(settingsTab); refreshSettingsState();
}
function wireCustomColumns() {
  const syncColumns = () => {
    settingsDraft.taskColumns = normalizeTaskColumns(settingsDraft.taskColumns, settingsDraft.taskFields);
    settingsDraft.issueColumns = CustomColumns.normalizeIssueColumns(settingsDraft.issueColumns, settingsDraft.issueFields);
    columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft);
    columnEditor($('#issue-columns-editor'), settingsDraft.issueColumns, 'issues', settingsDraft);
    refreshChoiceSettings();
    refreshSettingsState();
  };
  for (const kind of ['tasks', 'issues']) {
    const key = kind === 'tasks' ? 'taskFields' : 'issueFields', columnKey = kind === 'tasks' ? 'taskColumns' : 'issueColumns', container = $(`#custom-definitions-${kind}`);
    const draw = () => {
      container.innerHTML = settingsDraft[key].map(field => `<article class="custom-definition" data-field-id="${field.id}">${dragHandle(field.name)}<div class="custom-definition-fields"><label class="field">${esc(t('Nome colonna'))}<input data-field-name maxlength="60" value="${esc(field.name)}"></label><span class="muted">${esc(t(fieldTypeNames[field.type]))}</span>${['select', 'multiselect'].includes(field.type) ? `<button type="button" class="button small" data-goto-settings-tab="choice-${kind}-${field.id}">${esc(t('Gestisci etichette e colori'))}</button>` : ''}</div><button type="button" class="button small danger" data-delete-field>${esc(t('Elimina'))}</button></article>`).join('');
      container.querySelectorAll('[data-field-id]').forEach(row => {
        const field = settingsDraft[key].find(field => field.id === row.dataset.fieldId);
        row.querySelector('[data-field-name]').oninput = event => { field.name = event.target.value; syncColumns(); };
        row.querySelector('[data-delete-field]').onclick = () => confirmDialog('Eliminare la colonna personalizzata?', t('I valori della colonna verranno eliminati al salvataggio delle impostazioni.') + ` (${field.name})`, async () => {
          settingsDraft[key] = settingsDraft[key].filter(item => item.id !== field.id);
          settingsDraft[columnKey] = settingsDraft[columnKey].filter(column => column.id !== field.id);
          draw(); syncColumns();
        });
      });
      sortable(container, '.custom-definition', (from, to) => {
        settingsDraft[key].splice(to, 0, ...settingsDraft[key].splice(from, 1));
        const ordered = settingsDraft[key].map(field => field.id), visibility = new Map(settingsDraft[columnKey].map(column => [column.id, column.visible]));
        let index = 0;
        settingsDraft[columnKey] = settingsDraft[columnKey].map(column => column.id.startsWith('custom-') ? { id: ordered[index++], visible: visibility.get(ordered[index - 1]) } : column);
        draw(); syncColumns();
      });
    };
    const form = document.querySelector(`[data-add-field="${kind}"]`);
    form.onsubmit = action(event => {
      event.preventDefault();
      const field = newCustomField(form);
      CustomColumns.validateFields([...settingsDraft[key], field]);
      settingsDraft[key].push(field); form.reset(); draw(); syncColumns();
    });
    draw();
  }
  columnEditor($('#issue-columns-editor'), settingsDraft.issueColumns, 'issues', settingsDraft);
  refreshChoiceSettings();
}
function renderSettings() {
  settingsDraft = structuredClone(data.settings);
  settingsBase = structuredClone(data.settings);
  settingsDraft.highlights ??= [];
  settingsDraft.tags ??= [];
  settingsDraft.taskFields ??= []; settingsDraft.issueFields ??= [];
  settingsDraft.taskColumns = normalizeTaskColumns(settingsDraft.taskColumns, settingsDraft.taskFields);
  settingsDraft.issueColumns = CustomColumns.normalizeIssueColumns(settingsDraft.issueColumns, settingsDraft.issueFields);
  const organization = organizations.find(o => o.id === activeOrganizationId);
  $('#content').innerHTML = '<div id="settings-page">' + heading(t('Impostazioni'), 'Nomi, flussi e colori. Configura il tuo workspace, portalo ovunque.', ui`<button class="button primary" id="save-settings">Salva impostazioni</button>`) +
    ui`<div class="unsaved-banner" id="unsaved-banner" role="status" aria-live="polite" hidden><span class="unsaved-icon" aria-hidden="true">⚠</span><div class="unsaved-text"><strong>Hai impostazioni non salvate.</strong> Le modifiche, inclusi tema e dimensioni del testo in anteprima, diventano effettive solo con “Salva”. Se esci senza salvare resta la configurazione precedente.<span class="unsaved-where" id="unsaved-where"></span></div><div class="unsaved-actions"><button type="button" class="button small" id="discard-settings">Annulla modifiche</button><button type="button" class="button primary small" id="save-settings-inline">Salva</button></div></div><div class="info-banner"><strong>${APP_NAME}</strong> · Configurazione dell’organizzazione: <strong>${esc(organization.name)}</strong><br>Tutte le impostazioni qui sotto si applicano solo all’organizzazione selezionata.</div>
    <div class="settings-layout">${settingsNav()}<div class="settings-panels"><section class="panel settings-section full" id="organizations-panel"><h2>Organizzazioni</h2><p class="section-description">Dati e impostazioni sono separati per organizzazione. Il cambio salva automaticamente la selezione.</p>
    <details id="create-organization-section"><summary>Nuova organizzazione</summary><form id="create-organization"><div class="form-grid"><label class="field">Nome organizzazione<input name="name" required maxlength="100"></label><label class="field">Lingua dell’interfaccia<select name="language">${languageOptions(data.settings.language)}</select></label><label class="field full checkbox-field demo-field"><input type="checkbox" name="demo"><span>Includi dati dimostrativi<small>Milestone ogni due settimane da gennaio 2025 con attività, issue, note e righe nascoste di esempio.</small></span></label><div class="field full"><label for="create-logo-file">Logo della nuova organizzazione</label><input id="create-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"><small>Scegli il logo durante la creazione: verrà salvato con l’organizzazione e genererà automaticamente il suo tema.</small><div id="create-logo-preview"></div><output id="create-logo-result" aria-live="polite"></output><button type="button" class="button small" id="clear-create-logo">Rimuovi logo</button></div></div><div class="organization-actions"><button class="button primary" type="submit">Crea organizzazione</button></div></form></details>
    <button class="button danger small" id="delete-organization" ${organizations.length === 1 ? 'disabled' : ''}>Elimina organizzazione</button></section>
        <section class="panel settings-section full" id="portal-panel"><h2>Link al portale</h2><p class="section-description">Il link di ogni attività viene costruito dal codice portale: inserisci l’indirizzo del portale di questa organizzazione e metti il segnaposto {codice} dove deve comparire il codice.</p><div class="form-grid"><label class="field full">Modello del link<input id="portal-url-template" maxlength="2000" spellcheck="false" autocomplete="off" inputmode="url" placeholder="https://jira.azienda.com/browse/{codice}" value="${esc(data.settings.portalUrlTemplate)}"><small>Esempi: https://jira.azienda.com/browse/{codice} oppure https://portale.net/{codice}/dettaglio. Se manca, https:// viene aggiunto automaticamente. Lascia vuoto per non generare link. Un link specifico inserito nell’attività ha la precedenza.</small></label><div class="portal-preview full" id="portal-preview" aria-live="polite"></div></div></section>
        <section class="panel settings-section" id="identity-panel"><h2>Identità & navigazione</h2><p class="section-description">Rendi questo spazio davvero tuo.</p><div class="form-grid"><label class="field full">Nome organizzazione<input id="organization-name" maxlength="100" required value="${esc(organization.name)}"></label>${data.settings.tabNames.map((name, i) => ui`<label class="field">Nome tab ${i + 1}<input data-tab-name="${i}" maxlength="60" required value="${esc(name)}"></label>`).join('')}
    <label class="field">Ore per giorno di effort<input id="hours-per-day" type="number" min="0.01" max="24" step="0.01" value="${data.settings.hoursPerDay}"><small>Modifica la visualizzazione in giorni. Le ore già registrate non cambiano.</small></label>
    <div class="full logo-settings"><h3>Logo dell’organizzazione</h3><div id="logo-preview"></div><label class="field">Carica logo e genera tema<input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">Il logo e il tema vengono conservati solo per questa organizzazione e viaggiano con l’archivio.</p><button class="button small" id="remove-logo" type="button">Rimuovi logo</button><output id="logo-result" aria-live="polite"></output></div></div></section>
    <section class="panel settings-section full" id="languages-panel"><h2>Lingua & traduzioni</h2><p class="section-description">Scegli la lingua di questa organizzazione. Le traduzioni sono semplici file JSON: puoi aggiungerne altre senza modificare l’app.</p><div class="form-grid"><label class="field">Lingua dell’interfaccia<select id="language">${languageOptions(data.settings.language)}</select><small>La lingua è salvata per questa organizzazione. Nomi personalizzati e contenuti non vengono tradotti.</small></label><p class="language-missing" id="language-missing" role="status" hidden>Questa lingua non è installata su questo PC: i testi sono mostrati in inglese.</p></div><div id="languages-details"></div></section>
    <section class="panel settings-section" id="themes-panel"><div class="themes-heading"><div><h2>Temi & atmosfera</h2><p class="section-description">Scegli una palette o crea la tua.</p></div><button class="button" id="add-theme">＋ Crea tema</button></div><div class="themes-layout"><div class="theme-browser"><div class="theme-toolbar"><label class="theme-search"><span aria-hidden="true">⌕</span><input type="search" id="theme-search" placeholder="Cerca tema…" aria-label="Cerca tema" autocomplete="off" spellcheck="false" value="${esc(themeQuery)}"></label><span class="theme-count" id="theme-count" aria-live="polite"></span></div><div class="theme-gallery" id="theme-list"></div></div><div class="theme-editor-panel" id="theme-editor"></div></div></section>${fontSizePanel()}
    <section class="panel settings-section" id="statuses-panel"><h2>Stati del flusso</h2><p class="section-description">L’ordine qui diventa l’ordine del kanban. Accendi il simbolo ★ per evidenziare automaticamente tutte le righe con quello stato; per colorare singole righe usa gli Evidenziatori.</p><div id="statuses-list"></div><button class="button" data-add-option="statuses">＋ Aggiungi stato</button></section>
    <section class="panel settings-section" id="urgencies-panel"><h2>Livelli di urgenza</h2><p class="section-description">Definisci le priorità e il loro ordinamento.</p><div id="urgencies-list"></div><button class="button" data-add-option="urgencies">＋ Aggiungi urgenza</button></section>
    <section class="panel settings-section" id="highlights-panel"><h2>Evidenziatori</h2><p class="section-description">Colori per evidenziare singole righe della lista attività, indipendentemente dallo stato. Nella lista usa la barra Evidenziatore sopra la tabella, il pallino ● a fine riga oppure il campo Evidenziazione della scheda attività.</p><div id="highlights-list"></div><button class="button" data-add-option="highlights">＋ Aggiungi colore</button><p class="muted">Eliminando un colore, le righe che lo usano tornano senza evidenziazione. L’ordine qui è usato anche per ordinare la colonna Evidenziazione.</p></section>
    <section class="panel settings-section" id="tags-panel"><h2>Tags</h2><p class="section-description">Crea i tag di questa organizzazione, scegli nome e colore e ordinane la visualizzazione. Ogni attività può avere più tag.</p><div id="tags-list"></div><button class="button" data-add-option="tags">＋ Aggiungi tag</button><p class="muted">${esc(fillText('Massimo {0} tag, con nomi univoci di massimo {1} caratteri.', TAG_LIMIT, TAG_NAME_MAX))}</p><p class="muted">Eliminando un tag e salvando, viene rimosso dalle attività che lo usano, anche nascoste. Le attività e gli altri tag non vengono eliminati.</p></section>
    <section class="panel settings-section" id="columns-panel"><h2>Colonne della lista</h2><p class="section-description">Scegli quali colonne mostrare nella lista attività e in che ordine. Nascondere una colonna non cancella i dati. Puoi farlo anche dal pulsante “Colonne” sopra la tabella.</p><div id="columns-editor"></div><button type="button" class="button" id="reset-columns">↺ Ripristina colonne predefinite</button></section>${customColumnsPanel()}
    <section class="panel settings-section full" id="browser-panel"><h2>Accesso da browser</h2><p class="section-description">Mentre OrbitKanban è aperto puoi lavorare anche dal browser di questo PC, con più organizzazioni in schede diverse. Le modifiche si sincronizzano in tempo reale tra app e schede.</p><code class="data-path" id="browser-url">${esc(browserUrl || t('Non disponibile'))}</code><div class="storage-actions"><button class="button" id="browser-open" ${browserUrl ? '' : 'disabled'}>${t(browserMode() ? 'Apri in nuova scheda' : 'Apri nel browser')} ↗</button><button class="button" id="browser-copy" ${browserUrl ? '' : 'disabled'}>${t(browserMode() ? 'Copia indirizzo' : 'Copia link di accesso')}</button></div><p class="muted">${t(browserMode() ? 'Stai usando OrbitKanban dal browser: l’app sul PC deve restare aperta. Ogni scheda può mostrare un’organizzazione diversa.' : 'Raggiungibile solo da questo computer (127.0.0.1) e protetto da una chiave personale: il link di accesso contiene la chiave, non condividerlo. Chiudendo l’app le schede del browser si disconnettono.')}</p></section>
    ${transferPanel()}<section class="panel settings-section full" id="storage-panel"><div class="storage-heading"><div><h2>Dati che viaggiano con te</h2><p class="section-description">Archivio JSON locale e copia automatica del salvataggio precedente.</p></div><span class="readonly-badge">100% LOCALE</span></div><code class="data-path">${esc(dataFolder)}</code><div class="storage-actions"><button class="button" id="export-data">↗ Esporta backup</button><button class="button" id="import-data">↙ Importa backup</button><button class="button" id="open-folder">Apri cartella dati</button><span class="spacer"></span><button class="button danger" id="clear-data">Svuota attività e issue</button></div><div class="backup-section"><div class="storage-heading"><div><h3>Copie di sicurezza automatiche</h3><p class="section-description">Una copia al giorno, conservate nella cartella data per gli ultimi 14 giorni. Puoi ripristinarne una senza perdere l’archivio corrente: prima del ripristino viene creato il backup standard .bak.</p></div><button type="button" class="button small" id="refresh-backups">Aggiorna copie</button></div><p id="backup-status" class="muted" role="status" aria-live="polite"></p><div id="backup-list"></div></div><p class="muted">Per condividere l’app chiudila e copia l’eseguibile insieme alla cartella data. Non eseguire contemporaneamente copie che condividono la stessa cartella dati.</p></section></div></div></div>`;
      showSettingsTab(settingsTab); wireSettingsNav();
      drawOptionLists(); drawThemes(); drawLogoPreview(); wireOrganizationCreation(); drawPortalPreview(); wireFontSizes(); wireLanguages();
      columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft);
      $('#reset-columns').onclick = () => { settingsDraft.taskColumns.splice(0, settingsDraft.taskColumns.length, ...defaultTaskColumns(settingsDraft.taskFields)); columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft); };
      wireCustomColumns();
      $('#theme-search').oninput = event => { themeQuery = event.target.value; drawThemeChoices(); };
  $('#portal-url-template').oninput = drawPortalPreview;
  for (const type of ['input', 'change', 'click']) $('#settings-page').addEventListener(type, () => queueMicrotask(refreshSettingsState));
  $('#delete-organization').onclick = () => confirmDialog('Eliminare questa organizzazione?', 'Verranno eliminati tutti i suoi dati, il logo e le impostazioni. Le altre organizzazioni non saranno modificate. Esporta prima un backup.', () => organizationAction('delete', { id: activeOrganizationId }));
  const logoFile = $('#logo-file'), logoResult = $('#logo-result');
  logoFile.onchange = action(async () => {
    const file = logoFile.files[0];
    if (!file) return;
    logoFile.disabled = true;
    logoResult.textContent = t('Caricamento immagine…');
    const draft = settingsDraft;
    try {
      const { logo, palette } = await processLogo(file);
      if (settingsDraft !== draft || !logoFile.isConnected) return;
      draft.logo = logo;
      let theme = draft.themes.find(theme => theme.id === 'organization-logo');
      if (!theme) {
        theme = { id: 'organization-logo', name: t('Tema dal logo') };
        draft.themes.push(theme);
      }
      for (const [key] of themeFields) theme[key] = palette[key];
      draft.themeId = theme.id;
      drawLogoPreview(); drawThemes(); refreshSettingsState();
      logoResult.textContent = t('Logo caricato e tema generato in anteprima. Salva le impostazioni per mantenerli.');
    } catch (error) { logoResult.textContent = t(error.message); throw error; }
    finally { logoFile.disabled = false; logoFile.value = ''; }
  });
  $('#remove-logo').onclick = () => { settingsDraft.logo = ''; drawLogoPreview(); logoResult.textContent = ''; };
  document.querySelectorAll('[data-add-option]').forEach(b => b.onclick = () => {
    if (b.dataset.addOption === 'tags') {
      if (settingsDraft.tags.length >= TAG_LIMIT) { notify(fillText('Puoi definire al massimo {0} tag.', TAG_LIMIT), true); return; }
      const base = t('Nuovo tag'), names = new Set(settingsDraft.tags.map(tag => tag.name.trim().toLowerCase()));
      let name = base;
      for (let suffix = 2; names.has(name.toLowerCase()); suffix++) name = `${base} ${suffix}`;
      settingsDraft.tags.push({ id: uid(), name, color: highlightPalette[settingsDraft.tags.length % highlightPalette.length] });
      drawOptionLists();
      return;
    }
    if (b.dataset.addOption === 'highlights') {
      if (settingsDraft.highlights.length >= HIGHLIGHT_LIMIT) { notify(fillText('Puoi definire al massimo {0} colori.', HIGHLIGHT_LIMIT), true); return; }
      const used = new Set(settingsDraft.highlights.map(h => h.color.toLowerCase()));
      settingsDraft.highlights.push({ id: uid(), name: t('Nuovo colore'), color: highlightPalette.find(color => !used.has(color)) || '#a392ff' });
      drawOptionLists();
      return;
    }
    settingsDraft[b.dataset.addOption].push({ id: uid(), name: t(b.dataset.addOption === 'statuses' ? 'Nuovo stato' : 'Nuova urgenza'), color: '#a392ff', ...(b.dataset.addOption === 'statuses' ? { highlight: false } : {}) });
    drawOptionLists();
  });
  $('#save-settings').onclick = $('#save-settings-inline').onclick = action(async () => {
    await saveSettings(); rerenderPreservingView(); notify('Impostazioni salvate.');
  });
  $('#discard-settings').onclick = () => { render(); notify('Modifiche annullate.'); };
  $('#export-data').onclick = action(async () => { if (await workspaceApi.exportData()) notify('Backup esportato.'); });
  $('#import-data').onclick = action(async () => {
    const imported = await workspaceApi.importData();
    if (imported) { clearHistory(); columnFilters = { tasks: {}, issues: {} }; issueSearch = ''; adoptSnapshot(imported); search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }]; render(); notify('Archivio importato.'); }
  });
  $('#open-folder').onclick = action(() => workspaceApi.openDataFolder());
  $('#refresh-backups').onclick = action(loadBackupList);
  $('#backup-list').onclick = action(event => {
    const button = event.target.closest('[data-restore-backup]');
    if (button) restoreDailyBackup(button.dataset.restoreBackup);
  });
  action(loadBackupList)();
  wireTransfer();
  $('#browser-open').onclick = action(openBrowserAccess);
  $('#browser-copy').onclick = action(async () => {
    await workspaceApi.browserAccess('copy', activeOrganizationId);
    notify(browserMode() ? 'Indirizzo copiato negli appunti.' : 'Link di accesso copiato negli appunti.');
  });
  $('#clear-data').onclick = () => confirmDialog('Svuotare il workspace?', 'Tutte le attività e le associazioni issue saranno eliminate. Temi e impostazioni resteranno invariati. Esporta prima un backup se vuoi conservarle.', async () => {
    await commit(next => { next.tasks = []; next.issues = []; }); render(); notify('Workspace svuotato.');
  });
  $('#add-theme').onclick = () => {
    const theme = structuredClone(settingsDraft.themes.find(t => t.id === settingsDraft.themeId));
    theme.id = uid(); theme.name = t('Il mio tema'); settingsDraft.themes.push(theme); settingsDraft.themeId = theme.id;
    themeQuery = ''; $('#theme-search').value = '';
    drawThemes();
    $('#theme-name').focus(); $('#theme-name').select();
  };
}
function languageOptions(selected) {
  const installed = window.OrbitaI18n.languages();
  const list = installed.length ? installed : [{ code: 'it', name: 'Italiano' }];
  const options = list.map(language => `<option value="${esc(language.code)}" ${language.code === selected ? 'selected' : ''}>${esc(language.name)}</option>`);
  if (selected && !list.some(language => language.code === selected)) options.unshift(`<option value="${esc(selected)}" selected>${esc(fillText('{0} (non installata)', selected))}</option>`);
  return options.join('');
}
async function loadLanguages(operation = 'info') {
  const info = await workspaceApi.languages(operation);
  const registry = window.OrbitaI18n;
  registry.reset();
  for (const pack of info?.packs || []) {
    try { registry.register(pack, { replace: true }); }
    catch (error) { console.error('Lingua non registrata:', pack?.code, error); }
  }
  const sources = new Map((info?.languages || []).map(language => [language.code, language.source]));
  languageInfo = {
    folder: info?.folder || '', template: info?.template || '',
    languages: registry.languages().map(language => ({ ...language, source: sources.get(language.code) || 'built-in' })),
    errors: Array.isArray(info?.errors) ? info.errors : []
  };
  return languageInfo;
}
const languageSources = { 'built-in': 'Integrata', added: 'Aggiunta da file', customized: 'Personalizzata da file' };
const languageSteps = [
  'Apri la cartella lingue: contiene en.template.json, il file inglese completo da usare come modello.',
  'Copialo con il codice della nuova lingua, per esempio de.json, e aggiorna code, name e locale.',
  'Traduci solo i valori a destra: le chiavi a sinistra sono il testo originale e non vanno modificate. I testi mancanti restano in inglese.',
  'Premi “Ricarica lingue”: la nuova lingua comparirà nell’elenco.'
];
function drawLanguages() {
  const details = $('#languages-details');
  if (!details) return;
  const select = $('#language');
  $('#language-missing').hidden = !select || window.OrbitaI18n.has(select.value);
  const languages = languageInfo.languages.map(language => `<li><span class="language-name">${esc(language.name)}</span><code>${esc(language.code)}</code><span class="language-source ${esc(language.source)}">${esc(t(languageSources[language.source] || languageSources['built-in']))}</span></li>`).join('');
  const errors = languageInfo.errors.length ? `<div class="language-errors" role="alert"><h3>${esc(t('File lingua ignorati'))}</h3><ul>${languageInfo.errors.map(error => `<li><code>${esc(error.file || '—')}</code> ${esc(t(error.message))}</li>`).join('')}</ul></div>` : '';
  const folder = languageInfo.folder ? `<p class="muted language-folder-label">${esc(t('Cartella lingue'))}</p><code class="data-path" id="languages-folder">${esc(languageInfo.folder)}</code>` : '';
  details.innerHTML = `<div class="languages-layout"><div><h3>${esc(t('Lingue disponibili'))}</h3><ul class="language-list">${languages}</ul></div><div><h3>${esc(t('Aggiungi una lingua'))}</h3><ol class="language-steps">${languageSteps.map(step => `<li>${esc(t(step))}</li>`).join('')}</ol></div></div>${folder}<div class="storage-actions"><button type="button" class="button" id="open-languages-folder">${esc(t('Apri cartella lingue'))} ↗</button><button type="button" class="button" id="reload-languages">${esc(t('Ricarica lingue'))}</button></div>${errors}`;
  $('#open-languages-folder').onclick = action(async () => { await loadLanguages('open-folder'); drawLanguages(); });
  $('#reload-languages').onclick = action(async () => {
    const draftLanguage = $('#language').value, changed = settingsChanged();
    await loadLanguages('reload');
    if (!changed) render();
    else { $('#language').innerHTML = languageOptions(draftLanguage); drawLanguages(); }
    notify('Lingue ricaricate.');
  });
}
function wireLanguages() {
  $('#language').addEventListener('change', drawLanguages);
  drawLanguages();
}
function drawPortalPreview() {
  const template = normalizeUrl($('#portal-url-template').value);
  const sample = data.tasks.find(task => task.code.trim())?.code.trim() || 'PRJ-1042';
  const preview = $('#portal-preview');
  preview.classList.toggle('invalid', Boolean(template) && !validPortalTemplate(template));
  if (!template) { preview.textContent = t('Nessun modello: i link vengono creati solo se inseriti nella singola attività.'); return; }
  if (!/\{(?:codice|code)\}|<(?:codice|code)>/i.test(template)) { preview.textContent = t('Aggiungi il segnaposto {codice} nel punto in cui va inserito il codice portale.'); return; }
  if (!validPortalTemplate(template)) { preview.textContent = t('Indirizzo non valido: usa un indirizzo web, per esempio https://jira.azienda.com/browse/{codice}.'); return; }
  const url = portalUrl({ code: sample, url: '' }, { portalUrlTemplate: template });
  preview.innerHTML = `${esc(t('Anteprima con'))} <strong>${esc(sample)}</strong>: <a class="portal-link" href="${esc(url)}" data-open-url>${esc(url)} ↗</a>`;
}
function drawLogoPreview() {
  $('#logo-preview').innerHTML = settingsDraft.logo ? `<img src="${settingsDraft.logo}" alt="${esc(t('Logo dell’organizzazione'))}">` : `<span class="muted">${t('Nessun logo')}</span>`;
}
async function decodeImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) throw new Error(t('Scegli un’immagine PNG, JPEG, WebP, GIF o BMP.'));
  if (file.size > 15 * 1024 * 1024) throw new Error(t('L’immagine è troppo grande. Il limite è 15 MB.'));
  try { return await createImageBitmap(file); }
  catch { throw new Error(t('Impossibile leggere l’immagine. Il file potrebbe essere danneggiato o non supportato.')); }
}
async function processLogo(file) {
  const bitmap = await decodeImage(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error(t('Il selettore immagine non è disponibile su questo dispositivo.'));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL('image/png');
    if (logo.length > 1500000) throw new Error(t('L’immagine del logo è troppo grande dopo la conversione.'));
    const palette = themeFromLogo(context.getImageData(0, 0, canvas.width, canvas.height).data);
    return { logo, palette };
  } finally { bitmap.close(); }
}
const highlightPalette = ['#f2c94c', '#f0647a', '#5aa9f6', '#4fcf8f', '#b18cff', '#ff9f5a', '#3fd0c9', '#ff7ac6', '#9ccc65', '#7986cb', '#e57373', '#4db6ac', '#ffd54f', '#ba68c8', '#90a4ae', '#a1887f'];
function optionCatalog(key) {
  const custom = choiceSettingsTabs().find(tab => tab.id === key);
  return custom ? custom.field.options : settingsDraft[key];
}
function setOptionCatalog(key, list) {
  const custom = choiceSettingsTabs().find(tab => tab.id === key);
  if (custom) custom.field.options = list; else settingsDraft[key] = list;
}
function drawOptionLists() {
  for (const key of ['statuses', 'urgencies', 'highlights', 'tags', ...choiceSettingsTabs().map(tab => tab.id)]) {
    const custom = choiceSettingsTabs().find(tab => tab.id === key), list = optionCatalog(key);
    if (!document.getElementById(`${key}-list`)) continue;
    const optional = custom || key === 'highlights' || key === 'tags';
    const usage = id => {
      const count = custom ? data[custom.kind].filter(row => { const value = row.customFields?.[custom.field.id]; return Array.isArray(value) ? value.includes(id) : value === id; }).length : data.tasks.filter(task => key === 'tags' ? task.tagIds?.includes(id) : task.highlightId === id).length;
      return `<span class="option-usage" title="${esc(t(custom ? 'Righe con questa etichetta' : key === 'tags' ? 'Attività con questo tag' : 'Righe con questo colore'))}">${custom ? count : esc(plural(count, 'attività'))}</span>`;
    };
    document.getElementById(`${key}-list`).innerHTML = list.map((item, index) => ui`<div class="option-row">${dragHandle(item.name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span><input type="color" aria-label="Colore ${esc(item.name)}" data-color="${key}:${esc(item.id)}" value="${item.color}"><input class="option-name" aria-label="Nome opzione" ${optional ? 'maxlength="60"' : ''} data-option-name="${key}:${esc(item.id)}" value="${esc(item.name)}">${optional ? usage(item.id) : ''}${key === 'statuses' ? ui`<button class="icon-button star ${item.highlight ? 'selected' : ''}" data-highlight="${esc(item.id)}" title="Evidenzia le attività con questo stato" aria-pressed="${item.highlight}">★</button>` : ''}<button class="icon-button" data-move="${key}:${esc(item.id)}:-1" ${index === 0 ? 'disabled' : ''} title="Sposta su">↑</button><button class="icon-button" data-move="${key}:${esc(item.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button><button class="icon-button delete-option" data-remove="${key}:${esc(item.id)}" title="Elimina opzione">×</button></div>`).join('') || (optional ? `<p class="muted option-empty">${esc(t(custom ? 'Nessuna etichetta. Aggiungine una per iniziare.' : key === 'tags' ? 'Nessun tag: aggiungine uno per classificare le attività.' : 'Nessun colore: aggiungine uno per usare l’evidenziatore.'))}</p>` : '');
    const add = document.querySelector(`[data-add-option="${key}"]`);
    if (optional && add) add.disabled = settingsDraft[key].length >= (key === 'tags' ? TAG_LIMIT : HIGHLIGHT_LIMIT);
    const choiceAdd = document.querySelector(`[data-add-choice="${key}"]`);
    if (choiceAdd) choiceAdd.disabled = list.length >= 100;
    sortable(document.getElementById(`${key}-list`), '.option-row', (from, to) => { list.splice(to, 0, ...list.splice(from, 1)); drawOptionLists(); refreshSettingsState(); });
  }
  function optionId(value) { const [key, ...parts] = value.split(':'); return [key, parts.join(':')]; }
  function itemAt(value) { const [key, id] = optionId(value); return optionCatalog(key).find(x => x.id === id); }
  document.querySelectorAll('[data-color]').forEach(input => input.oninput = () => { itemAt(input.dataset.color).color = input.value; });
  document.querySelectorAll('[data-option-name]').forEach(input => input.oninput = () => { itemAt(input.dataset.optionName).name = input.value; });
  document.querySelectorAll('[data-highlight]').forEach(b => b.onclick = () => {
    const item = settingsDraft.statuses.find(s => s.id === b.dataset.highlight); item.highlight = !item.highlight; drawOptionLists();
  });
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
    const parts = b.dataset.move.split(':'), key = parts.shift(), offset = parts.pop(), id = parts.join(':'), list = optionCatalog(key), index = list.findIndex(x => x.id === id);
    [list[index], list[index + Number(offset)]] = [list[index + Number(offset)], list[index]]; drawOptionLists(); refreshSettingsState();
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    const [key, id] = optionId(b.dataset.remove);
    if (key === 'highlights' || key === 'tags' || key.startsWith('choice-')) { setOptionCatalog(key, optionCatalog(key).filter(x => x.id !== id)); drawOptionLists(); refreshSettingsState(); return; }
    const field = key === 'statuses' ? 'statusId' : 'urgencyId';
    if (settingsDraft[key].length === 1) { notify('Deve restare almeno un’opzione.', true); return; }
    if (data.tasks.some(t => t[field] === id)) { notify('Questa opzione è usata da alcune attività, anche nascoste. Riassegnale prima di eliminarla.', true); return; }
    settingsDraft[key] = settingsDraft[key].filter(x => x.id !== id); drawOptionLists();
  });
}
const themeFields = [['background', 'Sfondo'], ['surface', 'Superfici'], ['text', 'Testo'], ['accent', 'Accento']];
const themePresets = new Map(defaultThemes().map(theme => [theme.id, theme]));
function themeKind(theme) {
  const preset = themePresets.get(theme.id);
  if (!preset) return 'Personalizzato';
  return theme.name === preset.name && themeFields.every(([key]) => theme[key].toLowerCase() === preset[key]) ? 'Predefinito' : 'Predefinito modificato';
}
function drawThemeChoices() {
  const query = themeQuery.trim().toLocaleLowerCase(), total = settingsDraft.themes.length;
  const themes = settingsDraft.themes.filter(theme => !query || theme.name.toLocaleLowerCase().includes(query));
  const themeCount = plural(total, 'tema');
  $('#theme-count').textContent = query ? `${themes.length} / ${themeCount}` : themeCount;
  $('#theme-list').innerHTML = themes.length ? themes.map(theme => {
    const chosen = theme.id === settingsDraft.themeId, mock = themeFields.map(([key]) => `--mock-${key}:${theme[key]}`).join(';');
    return `<button type="button" class="theme-choice ${chosen ? 'chosen' : ''}" data-theme="${esc(theme.id)}" aria-pressed="${chosen}" title="${esc(theme.name)}"><span class="theme-mock" style="${mock}" aria-hidden="true"><span class="theme-mock-card"><span class="theme-mock-line"></span><span class="theme-mock-pill"></span></span></span><span class="theme-choice-info"><span class="theme-choice-name">${esc(theme.name)}</span><span class="theme-kind">${esc(t(themeKind(theme)))}</span><span class="theme-swatches">${themeFields.map(([key, label]) => `<i style="background:${theme[key]}" title="${t(label)}: ${theme[key]}" role="img" aria-label="${t(label)}: ${theme[key]}"></i>`).join('')}</span></span>${chosen ? '<span class="theme-check" aria-hidden="true">✓</span>' : ''}</button>`;
  }).join('') : `<p class="theme-empty">${esc(t('Nessun tema corrisponde alla ricerca.'))}</p>`;
  document.querySelectorAll('#theme-list [data-theme]').forEach(b => b.onclick = () => {
    settingsDraft.themeId = b.dataset.theme; drawThemes();
    document.querySelector(`#theme-list [data-theme="${CSS.escape(b.dataset.theme)}"]`)?.focus({ preventScroll: true });
  });
}
function revealChosenTheme() {
  const list = $('#theme-list'), chosen = list?.querySelector('.theme-choice.chosen');
  if (!chosen || !list.clientHeight) return;
  const top = chosen.offsetTop, bottom = top + chosen.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 6;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 6;
}
async function loadThemeImage(file, canvas) {
  if (!file) return false;
  const bitmap = await decodeImage(file);
  try {
    if (!canvas.isConnected) return false;
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Il selettore immagine non è disponibile su questo dispositivo.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false;
    return true;
  } finally { bitmap.close(); }
}
function drawThemes() {
  drawThemeChoices();
  const theme = settingsDraft.themes.find(t => t.id === settingsDraft.themeId);
  paintTheme(theme);
  $('#theme-editor').innerHTML = ui`<div class="theme-edit"><h3 class="theme-edit-title">Modifica tema</h3><label class="field">Nome tema<input id="theme-name" value="${esc(theme.name)}"></label><div class="theme-colors">${themeFields.map(([key, label]) => `<label><input type="color" value="${theme[key]}" data-theme-color="${key}">${t(label)}</label>`).join('')}</div>
    <div class="image-picker"><label class="field">Genera i 4 colori da un’immagine<input id="theme-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">Carica un’immagine: sfondo, superfici, testo e accento vengono estratti e assegnati automaticamente. Puoi poi ritoccarli con i selettori. Le trasparenze sono visualizzate su bianco.</p><canvas id="theme-image-canvas" hidden role="img" aria-label="Immagine usata per generare automaticamente i quattro colori del tema"></canvas><label class="field">Ritocco facoltativo: colore da prelevare con un clic<select id="theme-image-target">${themeFields.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('')}</select></label><output id="theme-image-result" aria-live="polite">L’immagine resta locale e non viene salvata: nel tema sono conservati solo i colori.</output></div>
    <small class="muted">Anteprima dal vivo: il tema viene applicato subito all’app. Salva le impostazioni per mantenerlo, altrimenti resta quello precedente.</small>${themePresets.has(theme.id) ? ui`<button class="button small" id="reset-theme">Ripristina tema predefinito</button>` : ui`<button class="button small" id="delete-theme">Elimina tema</button>`}</div>`;
  $('#theme-name').oninput = e => { theme.name = e.target.value; drawThemeChoices(); };
  document.querySelectorAll('[data-theme-color]').forEach(input => input.oninput = () => { theme[input.dataset.themeColor] = input.value; drawThemeChoices(); paintTheme(theme); });
  const canvas = $('#theme-image-canvas'), fileInput = $('#theme-image-file'), result = $('#theme-image-result');
  fileInput.onchange = action(async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.disabled = true;
    result.textContent = t('Caricamento immagine…');
    try {
      if (await loadThemeImage(file, canvas)) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Impossibile estrarre la palette dall’immagine.');
        const palette = extractThemePalette(context.getImageData(0, 0, canvas.width, canvas.height).data);
        for (const [key] of themeFields) {
          theme[key] = palette[key];
          document.querySelector(`[data-theme-color="${key}"]`).value = palette[key];
        }
        drawThemeChoices(); paintTheme(theme); refreshSettingsState();
        result.textContent = `${file.name} — ${t('quattro colori assegnati automaticamente.')} ${palette.colorCount < 4 ? t('L’immagine contiene pochi colori distinti: alcuni ruoli condividono lo stesso colore.') + ' ' : ''}${t('Premi “Salva impostazioni” per conservarli.')}`;
      }
    } catch (error) {
      result.textContent = t(error.message);
      throw error;
    } finally { fileInput.disabled = false; fileInput.value = ''; }
  });
  canvas.onclick = action(event => {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height)));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Impossibile leggere il colore dall’immagine.');
    const pixel = context.getImageData(x, y, 1, 1).data;
    const color = '#' + [...pixel].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
    const key = $('#theme-image-target').value;
    const input = document.querySelector(`[data-theme-color="${key}"]`);
    input.value = color;
    input.dispatchEvent(new Event('input'));
    result.textContent = `${t(themeFields.find(([field]) => field === key)[1])}: ${color}`;
  });
  if ($('#reset-theme')) $('#reset-theme').onclick = () => {
    Object.assign(theme, themePresets.get(theme.id));
    drawThemes();
  };
  if ($('#delete-theme')) $('#delete-theme').onclick = () => {
    if (settingsDraft.themes.length === 1) { notify('Deve restare almeno un tema.', true); return; }
    settingsDraft.themes = settingsDraft.themes.filter(t => t.id !== theme.id); settingsDraft.themeId = settingsDraft.themes[0].id; drawThemes();
  };
  revealChosenTheme();
}
$('#settings-button').onclick = () => { view = 4; render(); };
$('#folder-button').onclick = action(() => workspaceApi.openDataFolder());
async function openBrowserAccess() {
  await workspaceApi.browserAccess('open', activeOrganizationId);
  if (!browserMode()) notify('Organizzazione aperta nel browser predefinito.');
}
$('#open-browser').onclick = action(openBrowserAccess);
$('#global-search').onclick = action(() => withSavedSettings(openGlobalSearch));
$('#undo-button').onclick = action(() => changeHistory('undo'));
$('#redo-button').onclick = action(() => changeHistory('redo'));
$('#modal').addEventListener('close', () => {
  if (!renderAfterModal || !data) return;
  renderAfterModal = false;
  if (settingsDraftPending()) { renderChrome(); refreshSettingsState(); } else rerenderPreservingView();
});
document.addEventListener('keydown', e => {
  const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (command && key === 'k' && !$('#modal').open && data) { e.preventDefault(); action(() => withSavedSettings(openGlobalSearch))(); return; }
  const editing = e.target.closest?.('input, select, textarea, [contenteditable="true"]');
  if (command && !editing && !$('#modal').open && (key === 'z' || key === 'y')) {
    e.preventDefault();
    action(() => changeHistory(key === 'y' || (key === 'z' && e.shiftKey) ? 'redo' : 'undo'))();
    return;
  }
  if (command && key === 'n' && !$('#modal').open && data && view === 0) { e.preventDefault(); taskDialog(); }
  if (e.key === 'Escape' && highlighter && !$('#modal').open && !document.getElementById('mark-menu')) { highlighter = ''; drawHighlighter(); }
  else if (e.key === 'Escape' && view === 0 && selectedTasks.size && !$('#modal').open && !document.getElementById('mark-menu') && !e.target.closest?.('input:not([type="checkbox"]), select, textarea, [contenteditable]')) clearSelection();
});
window.runSmokeTests = async () => {
  const checks = [];
  function check(condition, name) { if (!condition) throw new Error(name); checks.push(name); }
  const doubleClick = element => element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
  const tick = () => new Promise(resolve => setTimeout(resolve));
  const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  // Presses on grip, drags it over the upper or lower half of target (depending on the direction) and drops it, or presses Esc.
  function dragTo(grip, target, finish = 'drop') {
    const row = grip.closest('.option-row, .column-row, tr[data-task-row]'), start = grip.getBoundingClientRect(), goal = target.getBoundingClientRect();
    const x = start.left + start.width / 2, y = start.top + start.height / 2, endY = goal.top + goal.height * (goal.top > start.top ? 0.75 : 0.25);
    pointer(grip, 'pointerdown', x, y);
    pointer(grip, 'pointermove', x, y + 6);
    pointer(grip, 'pointermove', x, endY);
    const lifted = row.classList.contains('is-dragging') && document.body.classList.contains('is-sorting') && row.style.transform.startsWith('translateY(');
    if (finish === 'escape') (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    pointer(grip, 'pointerup', x, endY);
    return lifted;
  }
  async function waitFor(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Timeout durante il salvataggio del test.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const initialTaskCount = data.tasks.length;
  const tableArea = $('.table-scroll').getBoundingClientRect();
  check($('.page-heading').offsetHeight <= 75 && tableArea.top < 330 && tableArea.height >= innerHeight * 0.5 && tableArea.bottom <= $('footer').getBoundingClientRect().top, 'Intestazione compatta e almeno metà finestra disponibile per la tabella');
  check(getComputedStyle($('.page-heading h1')).userSelect === 'none' && getComputedStyle($('#task-rows td')).userSelect === 'none' && getComputedStyle($('#search')).userSelect === 'text', 'Testo dell’interfaccia non selezionabile, ricerca selezionabile');
  if (customTitleBar()) {
    const overlay = navigator.windowControlsOverlay, area = overlay?.visible ? overlay.getTitlebarAreaRect() : null;
    const controls = area ? innerWidth - area.x - area.width : 0, region = selector => getComputedStyle($(selector)).getPropertyValue('-webkit-app-region');
    check(document.documentElement.classList.contains('custom-titlebar') && region('.topbar') === 'drag' && region('.sidebar .brand') === 'drag' && region('#modal') === 'no-drag' && region('#toast') === 'no-drag' && region('#organization-select') !== 'drag' && controls >= 90 && parseFloat(getComputedStyle($('.topbar')).paddingRight) >= controls + 23 && $('.topbar .avatar').getBoundingClientRect().right <= innerWidth - controls, 'Barra superiore trascinabile come barra del titolo, con spazio per i pulsanti della finestra');
    const style = document.documentElement.style;
    check(windowChromeSent && windowChromeSent.background === style.getPropertyValue('--background') && windowChromeSent.text === style.getPropertyValue('--text') && windowChromeSent.height === $('.topbar').clientHeight && $('.topbar').clientHeight < $('.topbar').offsetHeight && windowChromeSent.dimmed === false && Math.abs(area.height - windowChromeSent.height) <= 1, 'Pulsanti della finestra con i colori del tema e l’altezza della barra superiore');
    openModal('<p>OrbitKanban</p>');
    await tick();
    const dimmed = windowChromeSent.dimmed === true;
    $('#modal').close();
    await tick();
    check(dimmed && windowChromeSent.dimmed === false, 'Pulsanti della finestra oscurati insieme alla pagina durante i dialog');
  }
  taskDialog(data.tasks.find(task => !task.hidden));
  const editModal = $('#modal'), editBody = $('.task-edit-layout'), editWidth = editModal.clientWidth;
  check(editWidth >= Math.min(1100, innerWidth * 0.9) && $('.task-edit-fields').getBoundingClientRect().right < $('.task-edit-text').getBoundingClientRect().left, 'Editor attività largo con proprietà e testi affiancati');
  check(editModal.scrollHeight <= editModal.clientHeight + 1 && editBody.scrollHeight <= editBody.clientHeight + 1 && $('#task-form [type="submit"]').getBoundingClientRect().bottom <= innerHeight, 'Editor desktop interamente visibile senza scorrere la modale');
  $('#description-editor').innerHTML = '<p>Descrizione lunga da modificare.</p>'.repeat(100);
  $('#notes-editor').innerHTML = '<p>Note lunghe da modificare.</p>'.repeat(100);
  check($('#description-editor').scrollHeight > $('#description-editor').clientHeight && $('#notes-editor').scrollHeight > $('#notes-editor').clientHeight && editBody.scrollHeight <= editBody.clientHeight + 1, 'Testi lunghi scorrono solo negli editor, senza spostare campi e pulsanti');
  editModal.close();
  openModal('<p>OrbitKanban</p>');
  check($('#modal').clientWidth < editWidth, 'Le altre finestre mantengono il layout compatto');
  $('#modal').close();
  {
    const baseline = structuredClone(data), editedId = data.tasks.find(task => !task.hidden).id;
    view = 4; render(); showSettingsTab('custom-columns');
    for (const kind of ['tasks', 'issues']) {
      const add = $(`[data-add-field="${kind}"]`);
      add.elements.name.value = `Pending ${kind}`; add.elements.type.value = 'multiselect';
      add.elements.name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await tick();
    check(settingsChanged() && !$('#unsaved-banner').hidden && !$('#settings-tab-custom-columns .settings-tab-dot').hidden, 'Colonne compilate ma non aggiunte segnalate come modifiche non salvate');
    $('#save-settings').click();
    await waitFor(() => !saving && data.settings.taskFields.some(field => field.name === 'Pending tasks'));
    const pendingStored = await workspaceApi.load();
    check(pendingStored.data.settings.issueFields.some(field => field.name === 'Pending issues') && data.settings.taskColumns.some(column => column.id === data.settings.taskFields[0].id), 'Salva impostazioni crea e persiste entrambe le colonne senza richiedere Aggiungi colonna');
    await commit(baseline); render(); showSettingsTab('custom-columns');
    check(!$('#custom-columns-panel').hidden && document.querySelectorAll('[data-add-field]').length === 2, 'Impostazioni con schemi separati per attività e issue');
    for (const kind of ['tasks', 'issues']) {
      for (const type of kind === 'tasks' ? CustomColumns.TYPES : ['text', 'select', 'boolean', 'multiselect']) {
        const add = $(`[data-add-field="${kind}"]`);
        add.elements.name.value = `Smoke ${kind} ${type}`; add.elements.type.value = type;
        add.requestSubmit(); await tick();
        const field = settingsDraft[kind === 'tasks' ? 'taskFields' : 'issueFields'].at(-1);
        if (['select', 'multiselect'].includes(type)) {
          const key = `choice-${kind}-${field.id}`;
          $(`[data-add-choice="${key}"]`).click();
          const inputs = [...document.querySelectorAll(`#${key}-list [data-option-name]`)];
          inputs.forEach((input, index) => { input.value = ['Uno', 'Due'][index]; input.dispatchEvent(new Event('input', { bubbles: true })); });
        }
      }
    }
    check(settingsDraft.taskFields.length === 9 && settingsDraft.issueFields.length === 4 && !$('#unsaved-banner').hidden && document.querySelectorAll('.custom-definition select').length === 0, 'Aggiunta dei nove tipi con tipo immutabile e impostazioni ancora non salvate');
    check(choiceSettingsTabs().length === 4 && document.querySelectorAll('#choice-settings-panels .option-row').length === 8, 'Una sezione dinamica di etichette e colori per ogni colonna a scelta');
    $('#save-settings').click();
    await waitFor(() => !saving && data.settings.taskFields.length === 9);
    const taskFields = Object.fromEntries(data.settings.taskFields.map(field => [field.type, field]));
    const issueFields = Object.fromEntries(data.settings.issueFields.map(field => [field.type, field]));
    check((await workspaceApi.load()).data.settings.issueFields.length === 4 && data.settings.taskColumns.some(column => column.id === taskFields.number.id), 'Schemi e colonne predefinite persistiti nell’archivio');
    const pendingTask = $('[data-add-field="tasks"]'), pendingIssue = $('[data-add-field="issues"]');
    pendingTask.elements.name.value = taskFields.text.name;
    pendingIssue.elements.name.value = 'Must not partially save';
    let duplicateRejected = false;
    try { await saveSettings(); } catch (error) { duplicateRejected = /univoc/i.test(error.message); }
    check(duplicateRejected && (await workspaceApi.load()).data.settings.issueFields.length === 4 && pendingTask.elements.name.value === taskFields.text.name && pendingIssue.elements.name.value === 'Must not partially save', 'Nome duplicato rifiutato senza salvare parzialmente o perdere le colonne ancora compilate');
    view = 0; render(); taskDialog(data.tasks.find(task => task.id === editedId));
    const form = $('#task-form'), values = { text: 'Needle custom text '.repeat(40), number: '17.5', date: '2028-02-29', select: taskFields.select.options[1].id, url: 'https://example.com/custom', effort: '1.25', boolean: 'false' };
    for (const [type, value] of Object.entries(values)) form.elements[taskFields[type].id].value = value;
    form.querySelector('[data-choice-picker]').click();
    $('.task-edit-layout').dispatchEvent(new Event('scroll'));
    check(Boolean($('#tag-menu')), 'Scorrimento automatico dell’editor non chiude la scelta multipla appena aperta');
    closeTagMenu(true);
    check(form.querySelector('[data-choice-picker]').getAttribute('aria-expanded') === 'false' && document.activeElement === form.querySelector('[data-choice-picker]'), 'Chiusura del menu ripristina stato e focus sul selettore dell’editor, non sulla tabella sottostante');
    form.querySelector('[data-choice-picker]').click();
    document.querySelectorAll('#tag-menu input').forEach(input => { input.checked = true; });
    $('#tag-menu').requestSubmit(); await waitFor(() => !$('#tag-menu'));
    check(!form.querySelector('select[multiple]') && form.querySelectorAll('.tag-pill').length === 2 && $('#modal').open, 'Scelta multipla nella scheda con dropdown e pillole colorate, senza lista nativa');
    $(`#editor-${taskFields.richtext.id}`).innerHTML = '<p>Needle custom <strong>rich</strong></p>';
    form.requestSubmit();
    await waitFor(() => !saving && !$('#modal').open);
    const edited = () => data.tasks.find(task => task.id === editedId);
    check(edited().customFields[taskFields.number.id] === 17.5 && edited().customFields[taskFields.boolean.id] === false && edited().customFields[taskFields.multiselect.id].length === 2 && edited().customFields[taskFields.richtext.id].includes('<strong>'), 'Editor salva numeri, booleani falsi, scelte multiple e rich text personalizzati');
    const storedCustom = (await workspaceApi.load()).data.tasks.find(task => task.id === editedId).customFields;
    check(JSON.stringify(storedCustom) === JSON.stringify(edited().customFields), 'Tutti i valori personalizzati riletti dal backend coincidono con quelli salvati');
    const customCells = $(`[data-task-row="${editedId}"]`).querySelectorAll('.custom-cell');
    check(customCells.length === 9 && [...customCells].some(cell => cell.querySelector('a[data-open-url]')) && [...customCells].some(cell => cell.querySelector('.date-pill')) && getComputedStyle(customCells[0]).overflowWrap === 'anywhere', 'Colonne tipizzate leggibili con link, date colorate e testo lungo contenuto');
    check(globalSearchResults('Needle custom').some(result => result.id === editedId), 'Ricerca globale include i valori personalizzati');
    async function setColumnFilter(id, kind, fields) {
      columnFilterDialog(id, kind);
      const form = $('#column-filter-form');
      for (const [name, value] of Object.entries(fields)) form.elements[name].value = value;
      form.requestSubmit(); await tick();
    }
    await setColumnFilter(taskFields.number.id, 'tasks', { min: '10', max: '20' });
    check(filteredTasks().length === 1 && $('.column-filter-button.active'), 'Filtro numerico per colonna seleziona la riga attesa');
    await setColumnFilter(taskFields.text.id, 'tasks', { empty: 'empty' });
    check(filteredTasks().length === 0 && $('.column-filter-bar').querySelectorAll('[data-filter-column]').length === 2, 'Filtri di colonne diverse si combinano con AND, inclusi i valori vuoti');
    $('[data-clear-column-filters]').click();
    check(filteredTasks().length === baseline.tasks.filter(task => !task.hidden).length && !$('.column-filter-bar'), 'Azzera filtri ripristina la lista senza cambiare i dati');
    await csvImportDialog(new File(['code;releaseDate\nBAD;2027-02-29'], 'invalid.csv'), 'tasks');
    check($('#csv-import').disabled && $('#csv-status').textContent.includes('1') && data.tasks.length === baseline.tasks.length, 'CSV invalido mostra gli errori e non importa alcuna riga');
    $('#modal').close();
    const transfer = new DataTransfer();
    transfer.items.add(new File([`Ticket;${taskFields.number.name};${taskFields.date.name};${taskFields.url.name}\nCSV-CUSTOM;42;2031-01-02;https://example.com/csv`], 'mapped.csv'));
    $('#csv-file-tasks').files = transfer.files;
    $('#csv-file-tasks').dispatchEvent(new Event('change'));
    await waitFor(() => $('#modal').open && Boolean($('#csv-import-form')));
    check($('#csv-import').disabled && $('[data-csv-column="1"]').value === taskFields.number.id, 'Selezione file CSV suggerisce le colonne personalizzate e richiede la mappatura del codice');
    $('[data-csv-column="0"]').value = 'code'; $('[data-csv-column="0"]').dispatchEvent(new Event('change'));
    check(!$('#csv-import').disabled && $('#csv-preview').textContent.includes('CSV-CUSTOM') && $('#csv-import').getBoundingClientRect().bottom <= $('#modal').getBoundingClientRect().bottom, 'Mappatura manuale aggiorna anteprima e abilita importazione con pulsante visibile');
    $('#csv-import-form').requestSubmit();
    await waitFor(() => !saving && !$('#modal').open && data.tasks.length === baseline.tasks.length + 1);
    check(data.tasks.find(task => task.code === 'CSV-CUSTOM').customFields[taskFields.number.id] === 42, 'Importazione CSV aggiunge i valori tipizzati senza sovrascrivere le attività');
    $('#undo-button').click(); await waitFor(() => !saving && data.tasks.length === baseline.tasks.length);
    $('#redo-button').click(); await waitFor(() => !saving && data.tasks.length === baseline.tasks.length + 1);
    check(data.tasks.some(task => task.code === 'CSV-CUSTOM'), 'Intera importazione CSV annullabile e ripristinabile in una operazione');
    await setColumnFilter('code', 'tasks', { text: 'CSV-CUSTOM' });
    await setColumnFilter(taskFields.number.id, 'tasks', { min: '40' });
    $(`[data-sort="${taskFields.number.id}"]`).click();
    await saveSavedView('Custom filters smoke');
    const saved = data.settings.savedViews.find(saved => saved.name === 'Custom filters smoke');
    columnFilters.tasks = {}; await applySavedView(saved.id);
    check(filteredTasks().length === 1 && columnFilters.tasks[taskFields.number.id].min === '40' && savedViewSummary(saved).includes(taskFields.number.name), 'Viste salvate mantengono filtri e ordinamento delle colonne personalizzate');
    view = 1; render();
    await csvImportDialog(new File([`code;incident;${issueFields.select.name}\nCSV-CUSTOM;INC-CSV-CUSTOM;Due`], 'issues.csv'), 'issues');
    $('#csv-import-form').requestSubmit();
    await waitFor(() => !saving && !$('#modal').open && data.issues.some(issue => issue.incident === 'INC-CSV-CUSTOM'));
    check(matchIssues(data.tasks.find(task => task.code === 'CSV-CUSTOM'), data.issues).incidents.includes('INC-CSV-CUSTOM'), 'CSV delle issue aggiorna automaticamente incident e problem delle attività');
    const csvIssue = data.issues.find(issue => issue.incident === 'INC-CSV-CUSTOM');
    issueDialog(csvIssue); $('#issue-form').elements[issueFields.boolean.id].value = 'false';
    $('#issue-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    check(data.issues.find(issue => issue.id === csvIssue.id).customFields[issueFields.boolean.id] === false, 'Editor issue conserva le scelte importate e salva altri campi personalizzati');
    columnFilterDialog(issueFields.select.id, 'issues');
    $('#column-filter-form').querySelector(`input[value="${issueFields.select.options[1].id}"]`).checked = true;
    $('#column-filter-form').requestSubmit(); await tick();
    await setColumnFilter('linked', 'issues', { min: '1' });
    check(filteredIssues().length === 1 && document.querySelectorAll('#issue-rows [data-issue]').length === 2, 'Filtri issue combinano scelta personalizzata e conteggio attività collegate');
    const book = await unzipParts(await situationWorkbook({ scope: 'view', columns: 'all', sheets: ['tasks', 'issues'] }));
    const xml = text => new DOMParser().parseFromString(text, 'application/xml');
    check(xml(book.get('xl/worksheets/sheet1.xml')).getElementsByTagName('row').length === 2 && xml(book.get('xl/worksheets/sheet2.xml')).getElementsByTagName('row').length === 2, 'Excel della vista applica i filtri di entrambe le liste');
    check(book.get('xl/sharedStrings.xml').includes(taskFields.number.name) && book.get('xl/sharedStrings.xml').includes(issueFields.select.name) && book.get('xl/worksheets/sheet1.xml').includes(`<v>${window.OrbitaXlsx.excelDate('2031-01-02')}</v>`) && book.get('xl/worksheets/_rels/sheet1.xml.rels').includes('https://example.com/csv'), 'Excel include nomi personalizzati, date reali e collegamenti');
    $('#issue-columns-button').click();
    $(`#columns-dialog-editor [data-column-visible="${issueFields.select.id}"]`).click();
    $('#columns-apply').click(); await waitFor(() => !saving && !$('#modal').open);
    const visibleBook = await unzipParts(await situationWorkbook({ scope: 'view', columns: 'visible', sheets: ['issues'] }));
    check(!visibleBook.get('xl/sharedStrings.xml').includes(issueFields.select.name) && $('.column-filter-bar').textContent.includes(issueFields.select.name), 'Colonna issue nascosta esclusa da Excel ma filtro ancora visibile e rimovibile');
    const issuePicker = document.querySelector(`#issue-rows [data-choice-field="${issueFields.multiselect.id}"]`);
    issuePicker.click();
    $('#tag-menu input').checked = true; $('#tag-menu').requestSubmit();
    await waitFor(() => !saving && !$('#tag-menu'));
    check(data.issues.find(issue => issue.id === csvIssue.id).customFields[issueFields.multiselect.id].length === 1 && !$('#modal').open, 'Dropdown multiselezione direttamente nella tabella issue, con salvataggio');
    view = 4; render(); showSettingsTab('custom-columns');
    const optionKey = `choice-tasks-${taskFields.multiselect.id}`, chosenId = taskFields.multiselect.options[0].id;
    showSettingsTab(optionKey);
    const labelInput = document.querySelector(`#${optionKey}-list [data-option-name]`), colorInput = document.querySelector(`#${optionKey}-list [data-color]`);
    labelInput.value = 'Etichetta rinominata'; labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.value = '#12ab34'; colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    $(`#${optionKey}-list [data-move="${optionKey}:${chosenId}:1"]`).click();
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.taskFields.find(field => field.id === taskFields.multiselect.id).options[1].name === 'Etichetta rinominata');
    check(edited().customFields[taskFields.multiselect.id].includes(chosenId) && customText([chosenId], data.settings.taskFields.find(field => field.id === taskFields.multiselect.id)) === 'Etichetta rinominata', 'Rinomina, colore e riordino preservano le assegnazioni grazie a identificativi stabili');
    view = 0; columnFilters.tasks = {}; render();
    const picker = document.querySelector(`[data-task-row="${editedId}"] [data-choice-field="${taskFields.multiselect.id}"]`);
    check(picker.textContent.includes('Etichetta rinominata') && picker.querySelectorAll('.tag-pill')[1].style.getPropertyValue('--pill') === '#12ab34', 'Etichette e colori del catalogo aggiornati nelle pillole della tabella');
    picker.click(); $('#tag-menu input').checked = false; $('#tag-menu').requestSubmit();
    await waitFor(() => !saving && !$('#tag-menu'));
    check(edited().customFields[taskFields.multiselect.id].length === 1 && !$('#modal').open, 'Dropdown multiselezione direttamente nella lista attività');
    view = 4; render(); showSettingsTab(optionKey);
    $(`#${optionKey}-list [data-remove="${optionKey}:${chosenId}"]`).click();
    check(edited().customFields[taskFields.multiselect.id].includes(chosenId), 'Rimozione etichetta ancora reversibile prima del salvataggio');
    $('#save-settings').click(); await waitFor(() => !saving && !edited().customFields[taskFields.multiselect.id].includes(chosenId));
    check(data.settings.taskFields.find(field => field.id === taskFields.multiselect.id).options.length === 1, 'Eliminazione etichetta pulisce i valori solo al salvataggio');
    showSettingsTab('custom-columns');
    $(`[data-field-id="${taskFields.number.id}"] [data-delete-field]`).click();
    $('#confirm-action').click(); await waitFor(() => !$('#modal').open);
    check(edited().customFields[taskFields.number.id] === 17.5, 'Eliminazione colonna richiede conferma e non cancella dati prima di salvare');
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.taskFields.length === 8);
    const cleaned = data.settings.savedViews.find(view => view.id === saved.id);
    check(edited().customFields[taskFields.number.id] === undefined && !cleaned.columnFilters[taskFields.number.id] && cleaned.sort[0].key === 'releaseDate', 'Salvataggio rimuove valori, filtri e ordinamenti della colonna eliminata senza invalidare le viste');
    await commit(baseline);
    columnFilters = { tasks: {}, issues: {} }; issueSearch = ''; search = ''; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
    view = 0; clearHistory(activeOrganizationId); render();
  }
  {
    const baseline = structuredClone(data);
    view = 4; render();
    settingsDraft.fontFamily = 'arial'; refreshSettingsState();
    const external = await workspaceApi.load();
    external.data.settings.taskFields.push({ id: 'custom-remote', name: 'Remote column', type: 'text', options: [] });
    external.data.tasks[0].customFields = { 'custom-remote': 'Keep this value' };
    await workspaceApi.save(external.data, activeOrganizationId, undefined, external.revision);
    let conflictRejected = false;
    try { await saveSettings(); } catch (error) { conflictRejected = /altra finestra/.test(error.message); }
    const protectedData = (await workspaceApi.load()).data;
    check(conflictRejected && protectedData.settings.taskFields.some(field => field.id === 'custom-remote') && protectedData.tasks[0].customFields['custom-remote'] === 'Keep this value', 'Una bozza vecchia non cancella colonne e valori salvati da un’altra finestra');
    adoptSnapshot(await workspaceApi.load());
    await commit(baseline); render(); clearHistory(activeOrganizationId);
  }
  {
    const baseline = structuredClone(data);
    view = 4; render(); showSettingsTab('fonts');
    for (const font of FONT_FAMILIES) {
      $('#font-family').value = font.id; $('#font-family').dispatchEvent(new Event('change', { bubbles: true }));
      if (font.bundled) {
        const regular = await document.fonts.load(`400 14px "${font.name}"`, 'Attività Łódź'), bold = await document.fonts.load(`700 14px "${font.name}"`, 'Attività Łódź');
        check(regular.length > 0 && bold.length > 0 && [...regular, ...bold].every(face => face.status === 'loaded'), `Font ${font.name} caricato realmente dai file locali, anche con accenti e grassetto`);
      }
      check(getComputedStyle($('.font-sample input')).fontFamily === getComputedStyle(document.documentElement).fontFamily && document.documentElement.style.fontFamily === font.css, `Anteprima font ${font.name} applicata anche ai controlli`);
    }
    $('#discard-settings').click();
    check(data.settings.fontFamily === DEFAULT_FONT_FAMILY && $('#font-family').value === DEFAULT_FONT_FAMILY, 'Annulla impostazioni ripristina il font precedente');
    $('#font-family').value = 'verdana'; $('#font-family').dispatchEvent(new Event('change', { bubbles: true }));
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.fontFamily === 'verdana');
    check((await workspaceApi.load()).data.settings.fontFamily === 'verdana' && $('#unsaved-banner').hidden, 'Font salvato nell’archivio e riletto nelle impostazioni');
    await commit(baseline); clearHistory(activeOrganizationId); view = 0; render();
  }
  const historyTask = data.tasks.find(task => !task.hidden);
  const originalHistoryNotes = historyTask.notes;
  await commit(next => { next.tasks.find(task => task.id === historyTask.id).notes = '<p>Undo smoke</p>'; });
  check(!$('#undo-button').disabled && $('#redo-button').disabled, 'Modifiche persistite abilitate in Annulla');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === originalHistoryNotes);
  check($('#undo-button').disabled && !$('#redo-button').disabled, 'Ctrl+Z ripristina i dati e abilita Ripristina');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === '<p>Undo smoke</p>');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === originalHistoryNotes);
  clearHistory(activeOrganizationId);
  check($('#undo-button').disabled && $('#redo-button').disabled, 'Annulla e Ripristina restano disabilitati senza operazioni nello storico');
  view = 2;
  render();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  check($('#modal').open && $('#global-search-input'), 'Ctrl+K apre la ricerca globale anche da un’altra scheda');
  const searchTask = data.tasks.find(task => !task.hidden);
  $('#global-search-input').value = searchTask.code;
  $('#global-search-input').dispatchEvent(new Event('input', { bubbles: true }));
  check($('#global-search-results [data-global-kind="task"]')?.dataset.globalId === searchTask.id, 'Ricerca globale trova attività per codice');
  $('#global-search-results [data-global-kind="task"]').click();
  check(view === 0 && $('#modal').open && $('#task-form'), 'Risultato attività apre direttamente la modifica');
  $('#modal').close();
  const searchIssue = data.issues.find(issue => issue.incident);
  openGlobalSearch(searchIssue.incident);
  check($('#global-search-results [data-global-kind="issue"]'), 'Ricerca globale trova issue per incident');
  $('#global-search-results [data-global-kind="issue"]').click();
  check(view === 1 && $('#modal').open && $('#issue-form'), 'Risultato issue apre direttamente la modifica');
  $('#modal').close();
  view = 0;
  render();
  const savedViewTask = data.tasks.find(task => !task.hidden && task.highlightId) || data.tasks.find(task => !task.hidden);
  const savedViewState = { search, statusFilter, highlightFilter, showHidden, duplicatesOnly, sort: structuredClone(sort), columns: structuredClone(data.settings.taskColumns), savedViews: structuredClone(data.settings.savedViews || []) };
  search = savedViewTask.code;
  statusFilter = savedViewTask.statusId;
  highlightFilter = savedViewTask.highlightId || '__none';
  showHidden = true;
  duplicatesOnly = false;
  sort = [{ key: 'sequence', direction: 'desc' }];
  const savedColumns = defaultTaskColumns().map(column => ({ ...column, visible: ['code', 'releaseDate'].includes(column.id) }));
  await commit(next => { next.settings.taskColumns = savedColumns; });
  render();
  openSavedViews();
  $('#saved-view-form').elements.name.value = 'Smoke saved view';
  $('#saved-view-form').requestSubmit();
  await waitFor(() => !saving && data.settings.savedViews.some(saved => saved.name === 'Smoke saved view'));
  const smokeView = data.settings.savedViews.find(saved => saved.name === 'Smoke saved view');
  search = 'not-the-saved-view';
  statusFilter = '';
  highlightFilter = '';
  showHidden = false;
  sort = [{ key: 'releaseDate', direction: 'asc' }];
  await commit(next => { next.settings.taskColumns = defaultTaskColumns(); });
  render();
  $('#saved-view-select').value = smokeView.id;
  $('#saved-view-select').dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => !saving && activeSavedViewId === smokeView.id && search === savedViewTask.code);
  check(statusFilter === savedViewTask.statusId && showHidden && sort[0].key === 'sequence' && sort[0].direction === 'desc' && shownColumns().join() === 'code,releaseDate', 'Vista salvata riapplica filtri, ordinamento e colonne');
  openSavedViews();
  $('#saved-view-list [data-view-action="delete"]').click();
  check($('#confirm-action'), 'Eliminazione vista richiede conferma');
  $('#confirm-action').click();
  await waitFor(() => !saving && !data.settings.savedViews.some(saved => saved.id === smokeView.id));
  await commit(next => { next.settings.savedViews = savedViewState.savedViews; next.settings.taskColumns = savedViewState.columns; });
  ({ search, statusFilter, highlightFilter, showHidden, duplicatesOnly, sort } = savedViewState);
  activeSavedViewId = '';
  clearHistory(activeOrganizationId);
  render();
  check(!(data.settings.savedViews || []).some(saved => saved.name === 'Smoke saved view'), 'Vista salvata eliminata senza lasciare dati di prova');
  check(initialTaskCount > 200 && visibleTasks().length < initialTaskCount && document.querySelectorAll('#task-rows tr').length === visibleTasks().length, 'Caricamento dati dimostrativi con righe già rilasciate nascoste');
  const demoReleases = [...new Set(data.tasks.map(t => t.releaseDate).filter(Boolean))].sort();
  check(demoReleases[0] === '2025-01-01' && demoReleases.length > 40 && demoReleases.every((date, i) => new Date(`${date}T12:00:00Z`).getUTCDay() === 3 && (!i || Date.parse(date) - Date.parse(demoReleases[i - 1]) === 14 * 86400000)), 'Milestone dimostrative ogni due settimane di mercoledì da gennaio 2025');
  check(data.tasks.some(t => !t.releaseDate) && data.tasks.some(t => t.url) && data.settings.portalUrlTemplate.includes('{codice}') && data.settings.themes.length > 3, 'Dati dimostrativi coprono backlog, link, modello portale e temi');
  check(data.tasks.some(t => matchIssues(t, data.issues).incidents.length >= 2), 'Associazioni uno-a-molti');
  taskDialog();
  const form = $('#task-form');
  form.elements.code.value = 'SMOKE-1';
  form.elements.days.value = '1';
  form.elements.hours.value = '2';
  form.elements.releaseDate.value = '2027-01-15';
  $('#description-editor').innerHTML = '<p>Test <strong>rich text</strong></p>';
  $('#notes-editor').innerHTML = '<ul><li>Nota di prova</li></ul>';
  form.requestSubmit();
  await waitFor(() => data.tasks.some(t => t.code === 'SMOKE-1') && !saving);
  check(data.tasks.some(t => t.code === 'SMOKE-1' && t.effortHours === 10 && t.notes.includes('<ul>')), 'Creazione con effort e rich text persistiti');
  check(data.tasks.find(t => t.code === 'SMOKE-1').url === '', 'Link portale facoltativo in creazione');
  issueDialog();
  const issueForm = $('#issue-form');
  issueForm.elements.code.value = 'smoke-1';
  issueForm.elements.incident.value = 'INC-SMOKE';
  issueForm.elements.problem.value = 'PRB-SMOKE';
  issueForm.requestSubmit();
  await waitFor(() => data.issues.some(i => i.incident === 'INC-SMOKE') && !saving);
  check(matchIssues(data.tasks.find(t => t.code === 'SMOKE-1'), data.issues).problems[0] === 'PRB-SMOKE', 'Inserimento issue aggiorna automaticamente attività');
  const reloaded = await workspaceApi.load();
  check(reloaded.data.tasks.some(t => t.code === 'SMOKE-1' && t.description.includes('<strong>')) && reloaded.data.issues.some(i => i.incident === 'INC-SMOKE'), 'Rilettura archivio reale preserva rich text e associazioni');
  let rejected = false;
  try { await workspaceApi.save({ ...data, version: 999 }); } catch { rejected = true; }
  check(rejected && (await workspaceApi.load()).data.version === 1, 'Archivio non valido rifiutato senza perdita dati');
  for (let i = 1; i < 4; i++) {
    view = i; render();
    check($('#content').textContent.includes(data.settings.tabNames[i]), `Rendering tab ${i + 1}`);
    check($('.page-heading').offsetHeight <= 75 && document.documentElement.scrollHeight <= innerHeight + 1, `Intestazione compatta e scorrimento interno nel tab ${i + 1}`);
  }
  check(document.querySelectorAll('.kanban-column').length === data.settings.statuses.length, 'Colonne kanban e ordine stati');
  check(!document.querySelector('.kanban-board button'), 'Kanban effettivamente readonly');
  doubleClick($('.kanban-board .task-card'));
  check(!$('#modal').open, 'Doppio clic nel kanban mantiene la sola lettura');
  view = 2; render();
  check($('#content').textContent.includes('SMOKE-1'), 'Milestone aggiornata dopo inserimento');
  const upcoming = () => $('#next-release-milestone');
  const upcomingVisible = () => {
    const column = upcoming().getBoundingClientRect(), scroll = $('.milestone-scroll').getBoundingClientRect();
    return column.left >= scroll.left - 1 && column.right <= scroll.right + 1;
  };
  check(document.querySelectorAll('.milestone-column.is-next-release').length === 1 && upcoming().dataset.releaseDate === nextReleaseDate(data.tasks) && upcoming().getAttribute('aria-current') === 'step' && upcoming().querySelector('.next-release-badge'), 'Una sola colonna identifica la prossima release in ordine cronologico');
  const frame = upcoming().getBoundingClientRect(), cards = upcoming().querySelectorAll('.task-card');
  check(parseFloat(getComputedStyle(upcoming()).borderTopWidth) >= 2 && frame.top < cards[0].getBoundingClientRect().top && frame.bottom >= cards[cards.length - 1].getBoundingClientRect().bottom && upcoming().style.getPropertyValue('--milestone') === dateColor(upcoming().dataset.releaseDate), 'Evidenziazione avvolge tutte le attività senza cambiare il colore della data');
  check(upcomingVisible() && $('.milestone-scroll').scrollLeft > 0, 'Apertura milestone porta la prossima release in vista anche con molto storico');
  $('.milestone-scroll').scrollLeft = 0;
  $('.milestone-scroll').scrollTop = 42;
  const milestoneScrollTop = $('.milestone-scroll').scrollTop;
  rerenderPreservingView();
  check($('.milestone-scroll').scrollLeft === 0 && $('.milestone-scroll').scrollTop === milestoneScrollTop, 'Aggiornamenti milestone conservano lo scorrimento manuale');
  $('#next-release-button').click();
  check(upcomingVisible() && $('.milestone-scroll').scrollTop === 0, 'Pulsante prossima release ritrova la colonna e la sua intestazione');
  const previousMilestoneElement = upcoming();
  milestoneDay = '1900-01-01';
  refreshMilestoneDate();
  check(milestoneDay === today() && upcoming() !== previousMilestoneElement && upcomingVisible(), 'Indicatore ricalcolato al cambio di giorno senza perdere lo scorrimento');
  taskDialog(data.tasks[0]);
  const milestoneEditor = $('#description-editor');
  milestoneEditor.innerHTML = '<p>Draft across midnight</p>';
  milestoneDay = '1900-01-01';
  refreshMilestoneDate();
  check($('#modal').open && $('#description-editor') === milestoneEditor && milestoneEditor.textContent === 'Draft across midnight' && milestoneDay === '1900-01-01', 'Aggiornamento della data non interrompe un editor aperto');
  $('#modal').close();
  refreshMilestoneDate();
  check(milestoneDay === today(), 'Indicatore aggiornabile dopo la chiusura dell’editor');
  const scheduledTasks = data.tasks, milestoneLanguage = data.settings.language, localDay = today();
  const followingDay = new Date(Date.parse(`${localDay}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  try {
    data.tasks = ['2000-01-01', localDay, followingDay, '', localDay].map((releaseDate, index) => ({
      ...scheduledTasks[0], id: `milestone-check-${index}`, releaseDate, hidden: index === 1
    }));
    render();
    check(upcoming().dataset.releaseDate === localDay && $('.next-release-badge').textContent === 'Release di oggi' && upcoming().querySelectorAll('.task-card').length === 2 && upcoming().querySelector('.task-card.is-hidden'), 'Release di oggi prioritaria, raggruppata e completa delle righe nascoste');
    data.tasks = data.tasks.filter(task => task.releaseDate !== localDay);
    render();
    check(upcoming().dataset.releaseDate === followingDay && $('.next-release-badge').textContent === 'Prossima release', 'Rimuovendo una milestone l’indicatore passa alla successiva');
    data.settings.language = 'en'; render();
    check($('.next-release-badge').textContent === 'Next release' && $('#next-release-button').title === 'Go to next release', 'Etichette della prossima release tradotte in inglese');
    data.tasks = data.tasks.map(task => ({ ...task, releaseDate: task.releaseDate ? '2000-01-01' : '' }));
    render();
    check(!upcoming() && !$('#next-release-button') && $('.next-release-empty').textContent === 'No upcoming release' && !document.querySelector('.milestone-column[data-release-date=""].is-next-release'), 'Nessuna prossima release con sole date passate o backlog');
    data.tasks = []; render();
    check(!upcoming() && !document.querySelector('.milestone-column') && $('.milestone-track .empty'), 'Workspace senza attività non evidenzia milestone inesistenti');
  } finally { data.tasks = scheduledTasks; data.settings.language = milestoneLanguage; render(); }
  const next = structuredClone(data); next.tasks.find(t => t.code === 'SMOKE-1').hidden = true; await commit(next); render();
  check($('#content').textContent.includes('SMOKE-1') && document.querySelector('.milestone-column .task-card.is-hidden .hidden-badge'), 'Attività nascoste dalla lista restano visibili e segnalate nelle milestone');
  view = 3; render();
  check($('#content').textContent.includes('SMOKE-1') && document.querySelector('.kanban-column .task-card.is-hidden'), 'Attività nascoste dalla lista restano nel kanban');
  view = 0; showHidden = false; render();
  check(!$('#task-rows').textContent.includes('SMOKE-1') && $('.nav-count').textContent === String(data.tasks.filter(t => !t.hidden).length), 'Attività nascoste escluse solo dalla lista');
  view = 0; showHidden = true; render();
  check($('#task-rows').textContent.includes('SMOKE-1'), 'Attività nascoste recuperabili dalla lista');
  const datePills = [...document.querySelectorAll('.date-pill')];
  check(datePills[0].style.getPropertyValue('--date') === datePills[1].style.getPropertyValue('--date'), 'Date uguali hanno lo stesso colore');
  check(document.querySelectorAll('tr.highlighted').length > 0, 'Evidenziazione righe secondo stato configurato');
  const markedRows = () => [...document.querySelectorAll('#task-rows tr.marked')];
  check(markedRows().length > 0 && markedRows().every(row => highlightOf(data.tasks.find(task => task.id === row.dataset.taskRow))) && document.querySelectorAll('.highlighter-bar [data-highlighter]').length === highlightsOf().length + 1, 'Righe evidenziate con colori personalizzati e barra evidenziatore');
  const smokeTask = () => data.tasks.find(task => task.code === 'SMOKE-1');
  const smokeRow = () => document.querySelector(`tr[data-task-row="${CSS.escape(smokeTask().id)}"]`);
  const savedSequences = new Map(data.tasks.map(task => [task.id, task.sequence]));
  const rowIds = () => [...document.querySelectorAll('#task-rows [data-drag-handle]')].map(handle => handle.closest('tr').dataset.taskRow);
  const beforeDrag = rowIds(), targetRow = document.querySelector(`[data-task-row="${beforeDrag[2]}"]`);
  const rowLifted = dragTo($('#task-rows [data-drag-handle]'), targetRow);
  await waitFor(() => !saving && sort[0].key === 'sequence');
  check(rowLifted && rowIds()[2] === beforeDrag[0] && data.tasks.every(task => task.sequence >= 1) && new Set(data.tasks.map(task => task.sequence)).size === data.tasks.length, 'Drag delle righe salva Sequence univoche e mantiene ordine manuale');
  check((await workspaceApi.load()).data.tasks.find(task => task.id === beforeDrag[0]).sequence === data.tasks.find(task => task.id === beforeDrag[0]).sequence, 'Sequence riordinate persistite su disco');
  const beforeCancel = rowIds(), sequenceBeforeCancel = data.tasks.map(task => task.sequence).join();
  dragTo($('#task-rows [data-drag-handle]'), document.querySelector(`[data-task-row="${beforeCancel[2]}"]`), 'escape');
  check(rowIds().join() === beforeCancel.join() && data.tasks.map(task => task.sequence).join() === sequenceBeforeCancel && !saving, 'Esc durante drag non modifica ordine o Sequence');
  $('#task-rows [data-drag-handle]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await waitFor(() => !saving && rowIds()[1] === beforeCancel[0]);
  check(rowIds()[1] === beforeCancel[0], 'Riordino attività disponibile anche con frecce sulla maniglia');
  await commit(next => next.tasks.forEach(task => { task.sequence = savedSequences.get(task.id); }));
  sort = [{ key: 'releaseDate', direction: 'asc' }]; render();
  const oldText = { description: smokeTask().description, notes: smokeTask().notes };
  await commit(next => Object.assign(next.tasks.find(task => task.id === smokeTask().id), { description: '<p>' + 'LongDescription'.repeat(100) + '</p>', notes: '<p>' + 'LongNotes'.repeat(100) + '</p>' }));
  rerenderPreservingView();
  const descriptions = [...smokeRow().querySelectorAll('.description-cell')];
  check(descriptions.length === 2 && smokeRow().querySelector('.notes-cell').textContent.startsWith('LongNotes') && descriptions.every(cell => cell.scrollWidth <= cell.clientWidth + 1 && cell.getBoundingClientRect().right <= cell.closest('td').getBoundingClientRect().right), 'Note leggibili e testi lunghi senza spazi contenuti nelle celle');
  $('.table-scroll').scrollTop = 500; $('.table-scroll').scrollLeft = 160;
  const tablePosition = [$('.table-scroll').scrollLeft, $('.table-scroll').scrollTop];
  taskDialog(smokeTask());
  check($('#description-editor').scrollWidth <= $('#description-editor').clientWidth + 1 && $('#notes-editor').scrollWidth <= $('#notes-editor').clientWidth + 1, 'Editor descrizione e note a capo anche con parole molto lunghe');
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(tablePosition[0] > 0 && tablePosition[1] > 0 && Math.abs($('.table-scroll').scrollTop - tablePosition[1]) <= 1 && Math.abs($('.table-scroll').scrollLeft - tablePosition[0]) <= 1, 'Modificare attività conserva scorrimento orizzontale e verticale della lista');
  await commit(next => Object.assign(next.tasks.find(task => task.id === smokeTask().id), oldText));
  render();
  view = 4; render(); showSettingsTab('tags');
  check(!$('#tags-panel').hidden && $('#settings-tab-tags').getAttribute('aria-current') === 'true' && document.querySelectorAll('#tags-list .option-row').length === data.settings.tags.length, 'Catalogo Tags in una scheda dedicata per organizzazione');
  const savedTagCount = data.settings.tags.length;
  $('[data-add-option="tags"]').click();
  $('[data-add-option="tags"]').click();
  const [tagOne, tagTwo] = settingsDraft.tags.slice(-2).map(tag => tag.id);
  const setTagName = (id, name) => {
    const input = document.querySelector(`[data-option-name="tags:${id}"]`);
    input.value = name; input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setTagName(tagOne, 'SMOKE-TAG <b>One</b>');
  setTagName(tagTwo, 'SMOKE-TAG Two');
  await new Promise(resolve => setTimeout(resolve));
  check(!$('#settings-tab-tags .settings-tab-dot').hidden && !$('#unsaved-banner').hidden && data.settings.tags.length === savedTagCount, 'Nuovi tag restano in bozza fino al salvataggio');
  $('#save-settings-inline').click();
  await waitFor(() => !saving && data.settings.tags.length === savedTagCount + 2);
  check((await workspaceApi.load()).data.settings.tags.some(tag => tag.id === tagOne), 'Catalogo tag salvato nell’archivio locale');
  view = 0; render();
  check($('.activity-table th[data-column="tags"] .column-heading > span').textContent === 'Tags' && !$('.activity-table th[data-column="tags"] [data-sort]') && $('.activity-table th[data-column="tags"] [data-filter-column]'), 'Colonna Tags visibile e filtrabile ma non ordinabile come campo testuale multiplo');
  smokeRow().querySelector('.task-tags-button').click();
  check($('#tag-menu') && !$('#modal').open && document.querySelectorAll('.tag-choice').length === data.settings.tags.length && !$('.tag-choice b') && document.activeElement?.name === 'tagIds', 'Colonna Tags apre il dropdown multiselezione senza editor attività, con testo sicuro');
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  document.querySelector(`.tag-choice input[value="${tagTwo}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  check(smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo) && smokeRow().querySelectorAll('.tag-pill').length === 2, 'Selezione multipla visualizzata come etichette nella riga');
  check((await workspaceApi.load()).data.tasks.find(task => task.id === smokeTask().id).tagIds.length === 2, 'Selezione multipla persistita sul disco');
  smokeRow().querySelector('.task-tags-button').click();
  check(document.querySelectorAll('.tag-choice input:checked').length === 2, 'La modifica ripristina i tag già selezionati');
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  check(smokeTask().tagIds.length === 1 && smokeTask().tagIds[0] === tagTwo, 'Un tag si può rimuovere dalla singola attività');
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!$('#tag-menu') && smokeTask().tagIds.includes(tagOne), 'Esc annulla il dropdown senza cambiare i tag');
  taskDialog(smokeTask());
  check(!$('#task-form [name="tagIds"]') && !$('#task-form .task-tags'), 'I tag non sono più modificabili dalla scheda attività');
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(smokeTask().tagIds.length === 2, 'Salvare una scheda attività mantiene i tag della lista');
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  const submitTagChanges = $('#tag-menu').onsubmit;
  const externalTag = data.settings.tags[0].id, externalSnapshot = await workspaceApi.load();
  externalSnapshot.data.tasks.find(task => task.id === smokeTask().id).tagIds.push(externalTag);
  await workspaceApi.save(externalSnapshot.data, activeOrganizationId, undefined, externalSnapshot.revision);
  await submitTagChanges(new Event('submit', { cancelable: true }));
  check(smokeTask().tagIds.includes(externalTag) && !smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo), 'Dropdown tag conserva le aggiunte concorrenti di altre finestre');
  await commit(next => { next.tasks.find(task => task.id === smokeTask().id).tagIds = [tagOne, tagTwo]; });
  rerenderPreservingView();
  $('#search').value = 'smoke-tag';
  $('#search').dispatchEvent(new Event('input'));
  check(document.querySelectorAll('#task-rows tr[data-task-row]').length === 1 && smokeRow(), 'Ricerca attività estesa ai nomi dei tag');
  $('#search').value = ''; $('#search').dispatchEvent(new Event('input'));
  $('#columns-button').click();
  $('[data-column-visible="tags"]').click();
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(!$('.activity-table th[data-column="tags"]') && smokeTask().tagIds.length === 2, 'Nascondere Tags non cancella le assegnazioni');
  $('#columns-button').click();
  $('[data-column-visible="tags"]').click();
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(smokeRow().querySelectorAll('.tag-pill').length === 2, 'Colonna Tags ripristinata con i dati salvati');
  view = 4; render(); showSettingsTab('tags');
  setTagName(tagTwo, 'SMOKE-TAG Updated');
  const tagColor = document.querySelector(`[data-color="tags:${tagTwo}"]`);
  tagColor.value = '#12ab34'; tagColor.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector(`[data-move="tags:${tagTwo}:-1"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => !saving && data.settings.tags.find(tag => tag.id === tagTwo).name === 'SMOKE-TAG Updated');
  view = 0; render();
  check(smokeRow().querySelector('.tag-pill').textContent === 'SMOKE-TAG Updated' && smokeRow().querySelector('.tag-pill').style.getPropertyValue('--pill') === '#12ab34', 'Nome, colore e ordine del catalogo si riflettono sulle attività');
  view = 4; render(); showSettingsTab('tags');
  document.querySelector(`[data-remove="tags:${tagOne}"]`).click();
  $('#discard-settings').click();
  check(settingsDraft.tags.some(tag => tag.id === tagOne) && smokeTask().tagIds.includes(tagOne), 'Annullare una cancellazione conserva catalogo e assegnazioni');
  document.querySelector(`[data-remove="tags:${tagOne}"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => !saving && !data.settings.tags.some(tag => tag.id === tagOne));
  check(smokeTask().hidden && !smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo) && data.tasks.length === initialTaskCount + 1, 'Eliminare un tag pulisce anche le righe nascoste senza eliminare attività o altri tag');
  view = 0; render();
  doubleClick(smokeRow().querySelector('.sequence'));
  check($('#modal').open && $('#task-form').elements.code.value === 'SMOKE-1', 'Doppio clic su una cella apre la modifica della relativa attività');
  check(getComputedStyle($('#task-form').elements.code).userSelect === 'text' && getComputedStyle($('#description-editor strong')).userSelect === 'text', 'Campi e contenuti rich text restano selezionabili');
  $('#notes-editor').innerHTML += '<p>Doppio clic verificato</p>';
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check((await workspaceApi.load()).data.tasks.find(task => task.code === 'SMOKE-1').notes.includes('Doppio clic verificato'), 'Modifica aperta con doppio clic salvata nell’archivio');
  doubleClick(smokeRow().querySelector('[data-mark-task]'));
  doubleClick(smokeRow().querySelector('a'));
  check(!$('#modal').open, 'Doppio clic su pulsanti e link non apre un secondo editor');
  view = 1; render();
  $('#issue-search').value = 'INC-SMOKE';
  $('#issue-search').dispatchEvent(new Event('input'));
  doubleClick($('#issue-rows tr[data-issue-row]').cells[1]);
  check($('#modal').open && $('#issue-form').elements.incident.value === 'INC-SMOKE', 'Doppio clic modifica l’issue corretta anche dopo un filtro');
  $('#issue-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(data.issues.some(issue => issue.incident === 'INC-SMOKE' && issue.problem === 'PRB-SMOKE'), 'Associazione salvabile dalla modifica aperta con doppio clic');
  $('#issue-search').value = 'nessun-risultato-doppio-clic';
  $('#issue-search').dispatchEvent(new Event('input'));
  doubleClick($('#issue-rows .empty'));
  check(!$('#modal').open, 'Doppio clic sulla lista vuota non crea associazioni');
  render();
  check($('#issue-search').value === 'nessun-risultato-doppio-clic', 'Ricerca issue mantenuta durante il ridisegno della lista');
  $('#issue-search').value = ''; $('#issue-search').dispatchEvent(new Event('input'));
  check(!duplicatesOf().groups.length && !document.querySelector('.nav-alert, #issue-rows .dup-ref') && $('#issue-duplicates-only').disabled && !$('#remove-identical'), 'Nessun duplicato segnalato senza incident ripetuti');
  issueDialog();
  const duplicateIssueForm = $('#issue-form');
  check($('#issue-duplicate').hidden, 'Nessun avviso duplicato su una nuova associazione vuota');
  duplicateIssueForm.elements.code.value = 'SMOKE-DUP';
  duplicateIssueForm.elements.incident.value = ' inc-smoke ';
  duplicateIssueForm.elements.incident.dispatchEvent(new Event('input'));
  check(!$('#issue-duplicate').hidden && $('#issue-duplicate').textContent.includes('INC-SMOKE') && $('#issue-duplicate').textContent.includes('smoke-1 · PRB-SMOKE'), 'Avviso immediato per incident già presente, senza distinzione di maiuscole e spazi');
  duplicateIssueForm.requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  const smokeIssue = data.issues.find(issue => issue.incident === 'INC-SMOKE'), duplicateIssue = data.issues.find(issue => issue.code === 'SMOKE-DUP');
  check(duplicateIssue?.incident === 'inc-smoke' && (await workspaceApi.load()).data.issues.some(issue => issue.id === duplicateIssue.id), 'Associazione con incident duplicato salvabile comunque');
  const flaggedIssues = () => [...document.querySelectorAll('#issue-rows tr.duplicate-row')].map(row => row.dataset.issueRow).sort().join();
  check(flaggedIssues() === [smokeIssue.id, duplicateIssue.id].sort().join() && document.querySelectorAll('#issue-rows .dup-ref').length === 2, 'Entrambe le associazioni con lo stesso incident segnalate');
  check($('[data-view="1"] .nav-alert [aria-hidden]')?.textContent === '2' && !$('[data-view="0"] .nav-alert'), 'Navigazione segnala le associazioni duplicate, non le attività con un solo collegamento');
  $('#issue-duplicates-only').click();
  check(issueDuplicatesOnly && document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 2, 'Filtro Duplicati mostra solo le associazioni coinvolte');
  const identicalId = uid();
  await commit(next => { next.issues.push({ id: identicalId, code: 'smoke-dup', incident: 'INC-SMOKE', problem: '' }); });
  render();
  check(document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 3 && document.querySelectorAll('#issue-rows .dup-note').length === 1 && $(`#issue-rows tr[data-issue-row="${identicalId}"] .dup-note`) && $('#remove-identical .tiny-count').textContent === '1', 'Associazione identica a un’altra riconosciuta e marcata');
  $('#remove-identical').click();
  check($('#modal').open && $('#confirm-action'), 'Rimozione delle identiche chiede conferma');
  $('#confirm-action').click();
  await waitFor(() => !saving && !$('#modal').open);
  const issuesOnDisk = (await workspaceApi.load()).data.issues;
  check(!data.issues.some(issue => issue.id === identicalId) && !issuesOnDisk.some(issue => issue.id === identicalId) && issuesOnDisk.some(issue => issue.id === duplicateIssue.id) && issuesOnDisk.some(issue => issue.id === smokeIssue.id) && !$('#remove-identical'), 'Rimuovi identiche elimina solo le copie, lasciando la prima');
  $('#issue-duplicates-only').click();
  $(`#issue-rows tr[data-issue-row="${duplicateIssue.id}"] .dup-ref`).click();
  check($('#issue-search').value === 'INC-SMOKE' && issueDuplicatesOnly && document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 2, 'Clic sull’incident duplicato filtra le associazioni coinvolte');
  view = 0; render();
  taskDialog();
  const duplicateTaskForm = $('#task-form');
  duplicateTaskForm.elements.code.value = 'smoke-dup';
  duplicateTaskForm.elements.code.dispatchEvent(new Event('input'));
  check($('#match-preview .duplicate-warning')?.textContent.includes('INC-SMOKE') && $('#match-preview .duplicate-warning').textContent.includes(`#${smokeTask().sequence} SMOKE-1`), 'Avviso di possibile duplicato già durante l’inserimento dell’attività');
  duplicateTaskForm.requestSubmit();
  await waitFor(() => !saving && !$('#modal').open && data.tasks.some(task => task.code === 'smoke-dup'));
  const duplicateTask = data.tasks.find(task => task.code === 'smoke-dup'), taskRowOf = id => document.querySelector(`#task-rows tr[data-task-row="${CSS.escape(id)}"]`);
  check(duplicatesOf().tasks.size === 2 && $('[data-view="0"] .nav-alert [aria-hidden]')?.textContent === '2' && $('#duplicates-only').closest('label').classList.contains('has-duplicates'), 'Attività collegate allo stesso incident segnalate in navigazione e nel filtro');
  check([smokeTask().id, duplicateTask.id].every(id => taskRowOf(id)?.classList.contains('duplicate-row') && taskRowOf(id).querySelector('.dup-flag') && (!shownColumns().includes('incident') || taskRowOf(id).querySelector('.dup-ref'))) && document.querySelectorAll('#task-rows .dup-flag').length === 2, 'Righe, incident e azioni segnalano i possibili duplicati');
  check(taskRowOf(duplicateTask.id).querySelector('.dup-flag').title.includes(`#${smokeTask().sequence} SMOKE-1`), 'Il segnale indica con quali attività è condiviso l’incident');
  showHidden = false; render();
  check(smokeTask().hidden && !taskRowOf(smokeTask().id), 'Attività duplicata nascosta esclusa dalla lista normale');
  $('#duplicates-only').click();
  check(duplicatesOnly && document.querySelectorAll('#task-rows tr[data-task-row]').length === 2 && taskRowOf(smokeTask().id), 'Filtro Duplicati include anche le attività nascoste');
  $('#duplicates-only').click();
  taskRowOf(duplicateTask.id).querySelector('.dup-flag').click();
  check(search === 'INC-SMOKE' && $('#search').value === 'INC-SMOKE' && duplicatesOnly && document.querySelectorAll('#task-rows tr[data-task-row]').length === 2 && !$('#modal').open, 'Clic sul segnale mostra le attività che condividono l’incident');
  doubleClick(taskRowOf(duplicateTask.id).querySelector('.dup-flag'));
  check(!$('#modal').open, 'Doppio clic sul segnale duplicato non apre la modifica');
  await commit(next => {
    next.tasks = next.tasks.filter(task => task.id !== duplicateTask.id);
    next.issues = next.issues.filter(issue => issue.id !== duplicateIssue.id);
  });
  search = ''; duplicatesOnly = false; issueDuplicatesOnly = false; showHidden = true; render();
  check(!duplicatesOf().groups.length && !document.querySelector('.nav-alert, .dup-flag, .dup-ref') && $('#duplicates-only').disabled && data.tasks.length === initialTaskCount + 1, 'Risolto il duplicato spariscono segnalazioni e filtro');
  view = 0; render();
  const paint = highlightsOf()[1];
  $(`.highlighter-bar [data-highlighter="${paint.id}"]`).click();
  check(highlighter === paint.id && $('.activity-table').classList.contains('painting') && $('.highlighter-bar').classList.contains('active') && $(`.highlighter-bar [data-highlighter="${paint.id}"]`).getAttribute('aria-pressed') === 'true', 'Evidenziatore attivabile dalla barra sopra la tabella');
  smokeRow().querySelector('.description-cell').click();
  check(!$('#modal').open && smokeRow().classList.contains('marked'), 'Clic su una riga con l’evidenziatore la colora senza aprire la scheda');
  await waitFor(() => !saving && !markFlush);
  check(smokeTask().highlightId === paint.id && (await workspaceApi.load()).data.tasks.find(task => task.code === 'SMOKE-1').highlightId === paint.id && smokeRow().classList.contains('marked') && smokeRow().style.getPropertyValue('--mark').trim() === paint.color && highlighter === paint.id, 'Evidenziazione della riga salvata nell’archivio portatile');
  doubleClick(smokeRow().cells[1]);
  check(!$('#modal').open && highlighter === paint.id, 'Doppio clic con evidenziatore attivo non apre la modifica');
  smokeRow().cells[1].click();
  await waitFor(() => !saving && !markFlush);
  check(smokeTask().highlightId === '' && !smokeRow().classList.contains('marked'), 'Secondo clic con lo stesso colore toglie l’evidenziazione');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(highlighter === '' && !$('.activity-table').classList.contains('painting') && !$('.highlighter-bar').classList.contains('active'), 'Esc termina la modalità evidenziatore');
  smokeRow().querySelector('[data-mark-task]').click();
  check($('#mark-menu') && document.querySelectorAll('#mark-menu [data-mark-choice]').length === highlightsOf().length + 1 && smokeRow().querySelector('[data-mark-task]').getAttribute('aria-expanded') === 'true' && document.activeElement.closest('#mark-menu'), 'Menu di evidenziazione dal pallino a fine riga');
  $('#mark-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!$('#mark-menu') && document.activeElement === smokeRow().querySelector('[data-mark-task]'), 'Esc chiude il menu e riporta il focus sul pallino');
  smokeRow().querySelector('[data-mark-task]').click();
  $(`#mark-menu [data-mark-choice="${highlightsOf()[0].id}"]`).click();
  await waitFor(() => !saving && !markFlush);
  check(!$('#mark-menu') && smokeTask().highlightId === highlightsOf()[0].id && smokeRow().classList.contains('marked') && smokeRow().querySelector('.mark-button.is-marked'), 'Colore scelto dal menu applicato alla riga');
  const listedRows = () => [...document.querySelectorAll('#task-rows tr[data-task-row]')];
  const setHighlightFilter = value => { $('#highlight-filter').value = value; $('#highlight-filter').dispatchEvent(new Event('change')); };
  setHighlightFilter(highlightsOf()[0].id);
  check(listedRows().length > 0 && listedRows().every(row => data.tasks.find(task => task.id === row.dataset.taskRow).highlightId === highlightsOf()[0].id) && listedRows().includes(smokeRow()), 'Filtro della lista per colore di evidenziazione');
  setHighlightFilter('__none');
  check(listedRows().length > 0 && listedRows().every(row => !row.classList.contains('marked')), 'Filtro delle righe senza evidenziazione');
  setHighlightFilter('');
  check(listedRows().length === filteredTasks().length && highlightFilter === '', 'Filtro evidenziazione azzerato');
  smokeRow().querySelector('.code-link').click();
  check($('#task-form').elements.highlightId.value === highlightsOf()[0].id && $('#task-form').elements.highlightId.options.length === highlightsOf().length + 1, 'Campo evidenziazione nella scheda attività');
  $('#task-form').elements.highlightId.value = highlightsOf()[2].id;
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open && smokeTask().highlightId === highlightsOf()[2].id);
  check(smokeRow().classList.contains('marked') && smokeRow().style.getPropertyValue('--mark').trim() === highlightsOf()[2].color, 'Evidenziazione modificabile dalla scheda attività');
  const headerIds = () => [...document.querySelectorAll('.activity-table thead th[data-column]')].map(th => th.dataset.column);
  check(headerIds().join() === 'sequence,code,description,urgency,status,tags,effort,incident,problem,releaseDate,notes' && document.querySelectorAll('#task-rows td.description-col').length === listedRows().length, 'Colonne predefinite della lista attività');
  $('#columns-button').click();
  const columnToggle = id => $(`#columns-dialog-editor [data-column-visible="${id}"]`);
  check($('#modal').open && document.querySelectorAll('#columns-dialog-editor [data-column-visible]').length === Object.keys(taskColumnDefs).length && !columnToggle('highlight').checked && columnToggle('notes').checked, 'Scelta delle colonne dal pulsante Colonne');
  columnToggle('highlight').click();
  columnToggle('notes').click();
  $('#columns-dialog-editor [data-column-move="highlight:-1"]').click();
  check(document.activeElement?.dataset.columnMove === 'highlight:-1', 'Spostamento colonne utilizzabile da tastiera');
  const dialogOrder = () => [...document.querySelectorAll('#columns-dialog-editor [data-column-visible]')].map(input => input.dataset.columnVisible);
  const columnsBeforeDrag = dialogOrder();
  check(document.querySelectorAll('#columns-dialog-editor .column-row [data-drag-handle]').length === columnsBeforeDrag.length && $('#modal .section-description').textContent === t('Spunta le colonne da mostrare e trascinale (o usa le frecce) per cambiarne l’ordine. Nascondere una colonna non cancella i dati.'), 'Maniglia di trascinamento su ogni colonna');
  const codeRow = () => columnToggle('code').closest('.column-row');
  const columnLifted = dragTo(codeRow().querySelector('.column-toggle span'), columnToggle('sequence').closest('.column-row'));
  columnToggle('code').closest('label').click();
  await tick();
  check(columnLifted && dialogOrder().join() === ['code', 'sequence', ...columnsBeforeDrag.slice(2)].join() && columnToggle('code').checked && $('#modal').open && !document.querySelector('.is-dragging') && $('#modal > .sort-status')?.textContent === fillText('Spostato in posizione {0} di {1}', 1, columnsBeforeDrag.length), 'Colonne trascinabili anche dal nome, senza cambiarne la visibilità');
  codeRow().querySelector('[data-drag-handle]').focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  check(dialogOrder().join() === columnsBeforeDrag.join() && document.activeElement === codeRow().querySelector('[data-drag-handle]') && codeRow() === document.querySelectorAll('#columns-dialog-editor .column-row')[1], 'Colonne riordinabili con le frecce sulla maniglia');
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(headerIds().join() === 'sequence,code,description,urgency,highlight,status,tags,effort,incident,problem,releaseDate' && smokeRow().cells.length === headerIds().length + 2 && smokeRow().querySelector('.mark-pill') && !data.settings.taskColumns.find(column => column.id === 'notes').visible && (await workspaceApi.load()).data.settings.taskColumns.find(column => column.id === 'highlight').visible, 'Colonne mostrate, nascoste e riordinate e salvate');
  $('[data-sort="highlightId"]').click();
  check(sort.length === 1 && sort[0].key === 'highlightId' && listedRows()[0].classList.contains('marked') && !listedRows().at(-1).classList.contains('marked'), 'Ordinamento per evidenziazione');
  await commit(next => { next.settings.taskColumns = defaultTaskColumns(); });
  render();
  check(headerIds().at(-1) === 'notes' && !headerIds().includes('highlight') && sort.length === 1 && sort[0].key === 'releaseDate', 'Ordinamento su colonna nascosta torna alla release date');
  view = 2; render();
  check(document.querySelector('.milestone-column .task-card.is-marked .mark-chip'), 'Evidenziazione visibile nelle milestone');
  view = 3; render();
  check(document.querySelector('.kanban-column .task-card.is-marked .mark-chip'), 'Evidenziazione visibile nel kanban');
  // Bulk selection and edit.
  const bulkTasks = () => ['BULK-1', 'BULK-2', 'BULK-3'].map(code => data.tasks.find(task => task.code === code));
  await commit(next => {
    ['2031-03-14', '2031-03-14', ''].forEach((releaseDate, i) => next.tasks.push({ ...structuredClone(next.tasks[0]), id: uid(), code: `BULK-${i + 1}`, sequence: 990001 + i, description: `<p>Bulk ${i + 1}</p>`, notes: '', url: '', releaseDate, hidden: false, highlightId: '', tagIds: [], statusId: next.settings.statuses[0].id, urgencyId: next.settings.urgencies[0].id }));
  });
  view = 0; search = 'BULK-'; statusFilter = ''; highlightFilter = ''; duplicatesOnly = false; showHidden = false; sort = [{ key: 'code', direction: 'asc' }]; selectedTasks.clear(); render();
  const selectBoxes = () => [...document.querySelectorAll('#task-rows input[data-select-task]')];
  check(selectBoxes().length === 3 && $('.activity-table thead th.select-col #select-all') && $('#bulk-bar').hidden && !$('#footer-hint').hidden && !$('#select-all').checked && !$('#select-all').indeterminate, 'Colonna di selezione delle attività, barra azioni nascosta senza selezione');
  selectBoxes()[0].click();
  check(selectedTasks.size === 1 && selectBoxes()[0].closest('tr').classList.contains('selected') && !$('#bulk-bar').hidden && $('#footer-hint').hidden && $('#select-all').indeterminate && $('#bulk-count').textContent === fillText('{0} selezionate', 1), 'Selezione di una riga mostra la barra della modifica multipla');
  selectBoxes()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
  check(selectedTasks.size === 3 && selectBoxes().every(box => box.checked) && $('#select-all').checked && !$('#select-all').indeterminate, 'Maiusc + clic seleziona un intervallo di righe');
  $('#select-all').click();
  check(!selectedTasks.size && $('#bulk-bar').hidden && selectBoxes().every(box => !box.checked), 'Casella di intestazione deseleziona tutte le righe mostrate');
  $('#select-all').click();
  $('#search').value = 'BULK-1'; $('#search').dispatchEvent(new Event('input'));
  check(selectedTasks.size === 3 && $('#bulk-count').textContent === `${fillText('{0} selezionate', 3)} · ${fillText('{0} non visibili con i filtri attuali', 2)}`, 'Selezione conservata cambiando i filtri, con conteggio delle righe non visibili');
  $('#search').value = 'BULK-'; $('#search').dispatchEvent(new Event('input'));
  doubleClick(selectBoxes()[0].closest('td'));
  check(!$('#modal').open, 'Doppio clic sulla casella di selezione non apre la modifica');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!selectedTasks.size && $('#bulk-bar').hidden, 'Esc azzera la selezione');
  $('#select-all').click();
  $('#bulk-edit').click();
  const bulkForm = () => $('#bulk-form'), bulkBox = code => bulkForm().querySelector(`input[name="taskIds"][value="${CSS.escape(data.tasks.find(task => task.code === code).id)}"]`);
  check($('#modal').open && bulkForm() && bulkForm().querySelectorAll('input[name="taskIds"]:checked').length === 3 && $('#bulk-apply').disabled && $('#bulk-summary').textContent === fillText('{0} pronte: scegli cosa modificare.', plural(3, 'attività')), 'Modifica multipla con elenco delle attività coinvolte');
  const bulkTag = (data.settings.tags || [])[0], bulkStatus = data.settings.statuses[1], bulkMark = highlightsOf()[0];
  bulkBox('BULK-2').click();
  bulkForm().elements.statusId.value = bulkStatus.id;
  bulkForm().elements.releaseMode.value = 'shift';
  bulkForm().elements.highlightId.value = bulkMark.id;
  bulkForm().elements[`tag:${bulkTag.id}`].value = 'add';
  bulkForm().dispatchEvent(new Event('change'));
  check(!bulkForm().elements.shiftDays.hidden && bulkForm().elements.releaseDate.hidden && !$('#bulk-apply').disabled && $('#bulk-summary').textContent === fillText('Le modifiche verranno applicate a {0}.', plural(2, 'attività')) && $('#bulk-release-hint').textContent === fillText('Solo le attività con una data: {0} su {1}.', 1, 2), 'Riepilogo dal vivo della modifica multipla');
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  const [bulkOne, bulkTwo, bulkThree] = bulkTasks(), savedBulk = (await workspaceApi.load()).data.tasks.filter(task => task.code.startsWith('BULK-'));
  check([bulkOne, bulkThree].every(task => task.statusId === bulkStatus.id && task.highlightId === bulkMark.id && task.tagIds.includes(bulkTag.id)) && bulkOne.releaseDate === '2031-03-21' && bulkThree.releaseDate === '' && bulkTwo.statusId === data.settings.statuses[0].id && bulkTwo.releaseDate === '2031-03-14' && !bulkTwo.tagIds.length && savedBulk.filter(task => task.statusId === bulkStatus.id).length === 2, 'Modifica multipla applica stato, release, evidenziazione e tag solo alle attività spuntate');
  check($('#toast').textContent === fillText('Modifica multipla applicata: {0} aggiornate.', plural(2, 'attività')) && selectedTasks.size === 3 && document.querySelectorAll('#task-rows tr.selected').length === 3, 'Esito della modifica multipla e selezione conservata');
  $('#bulk-edit').click();
  bulkForm().requestSubmit();
  await tick();
  check($('#modal').open && $('#toast').textContent === t('Scegli almeno un campo da modificare.'), 'Modifica multipla senza campi scelti viene bloccata');
  bulkForm().elements.releaseMode.value = 'set';
  bulkForm().dispatchEvent(new Event('change'));
  bulkForm().requestSubmit();
  await tick();
  check($('#modal').open && !bulkForm().elements.releaseDate.hidden && $('#toast').textContent === t('Scegli la nuova release date.'), 'Nuova release date obbligatoria nella modifica multipla');
  bulkForm().elements.releaseMode.value = '';
  bulkForm().elements.hidden.value = 'hide';
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(bulkTasks().every(task => task.hidden) && !selectBoxes().length && selectedTasks.size === 3 && $('#bulk-count').textContent.includes(fillText('{0} non visibili con i filtri attuali', 3)), 'Modifica multipla nasconde le attività senza perdere la selezione');
  view = 2; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1 && document.querySelectorAll('.milestone-heading [data-bulk-release]').length === document.querySelectorAll('.milestone-column').length, 'Modifica multipla ed Excel disponibili dalle milestone');
  document.querySelector('[data-bulk-release="2031-03-21"]').click();
  check(bulkForm() && [...bulkForm().querySelectorAll('input[name="taskIds"]')].map(box => box.value).join() === bulkOne.id && bulkForm().querySelector('.bulk-item.is-hidden') && $('#bulk-form .section-description').textContent === fillText('Attività della release del {0}, comprese quelle nascoste.', formatDate('2031-03-21')), 'Modifica della tappa con le sue attività, comprese le nascoste');
  bulkForm().elements.releaseMode.value = 'set';
  bulkForm().elements.releaseDate.value = '2031-04-01';
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(bulkTasks()[0].releaseDate === '2031-04-01' && view === 2 && $('.milestone-column[data-release-date="2031-04-01"]') && !$('.milestone-column[data-release-date="2031-03-21"]'), 'Tappa spostata con la modifica multipla dalle milestone');
  view = 3; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1, 'Esportazione Excel disponibile dal kanban');
  view = 1; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1, 'Esportazione Excel disponibile dalle issue');
  // Excel workbook content.
  check(richText('<ol><li>Uno</li><li>Due</li></ol><ul><li>Tre</li></ul><p>A<br>B</p>') === '1. Uno\n2. Due\n• Tre\nA\nB' && hexColor('hsl(0 100% 50%)') === '#ff0000' && tint('#000000', 0.5) === '#808080' && hexColor('nonsense') === '#929bb2', 'Testo ricco e colori convertiti per Excel');
  async function unzipParts(bytes) {
    const reader = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts = new Map(), decoder = new TextDecoder();
    let end = bytes.length - 22;
    while (end > 0 && reader.getUint32(end, true) !== 0x06054b50) end--;
    for (let i = 0, offset = reader.getUint32(end + 16, true); i < reader.getUint16(end + 10, true); i++) {
      const nameLength = reader.getUint16(offset + 28, true), local = reader.getUint32(offset + 42, true), size = reader.getUint32(offset + 20, true);
      const start = local + 30 + reader.getUint16(local + 26, true) + reader.getUint16(local + 28, true), body = bytes.subarray(start, start + size);
      const raw = reader.getUint16(offset + 10, true) === 8 ? new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : body;
      parts.set(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)), decoder.decode(raw));
      offset += 46 + nameLength + reader.getUint16(offset + 30, true) + reader.getUint16(offset + 32, true);
    }
    return parts;
  }
  const allSheets = EXCEL_SHEETS.map(([id]) => id), xmlDoc = text => new DOMParser().parseFromString(text, 'application/xml');
  const fullBook = await unzipParts(await situationWorkbook({ scope: 'all', columns: 'all', sheets: allSheets }));
  const bookSheets = [...xmlDoc(fullBook.get('xl/workbook.xml')).getElementsByTagName('sheet')].map(sheet => sheet.getAttribute('name'));
  check([...fullBook].every(([name, text]) => !/\.(xml|rels)$/.test(name) || !xmlDoc(text).querySelector('parsererror')) && bookSheets.join('|') === window.OrbitaXlsx.sheetNames([t('Riepilogo'), ...data.settings.tabNames.slice(0, 4)]).join('|'), 'Cartella Excel ben formata con riepilogo e un foglio per tab');
  const taskSheetXml = fullBook.get('xl/worksheets/sheet2.xml'), sharedXml = fullBook.get('xl/sharedStrings.xml');
  check(xmlDoc(taskSheetXml).getElementsByTagName('row').length === data.tasks.length + 1 && sharedXml.includes('SMOKE-1') && sharedXml.includes('BULK-3') && taskSheetXml.includes(`<v>${window.OrbitaXlsx.excelDate('2031-04-01')}</v>`) && taskSheetXml.includes('<autoFilter ') && taskSheetXml.includes('state="frozen"') && fullBook.has('xl/worksheets/_rels/sheet2.xml.rels'), 'Foglio attività con tutte le righe, date reali, filtri, riquadri bloccati e link');
  check(fullBook.get('xl/styles.xml').includes(window.OrbitaXlsx.argb(tint(bulkStatus.color, 0.35))) && fullBook.get('xl/styles.xml').includes(window.OrbitaXlsx.argb(tint(dateColor('2031-04-01'), 0.5))) && fullBook.get('xl/worksheets/sheet3.xml').includes('<autoFilter ') && fullBook.get('xl/styles.xml').includes('FFFFF1C2') && [t('Prossima release'), t('Release di oggi')].some(text => sharedXml.includes(text)), 'Colori di stato, date e prossima release riportati nel file Excel');
  const pickedBook = await unzipParts(await situationWorkbook({ scope: 'selected', columns: 'visible', sheets: ['summary', 'tasks'] }));
  const pickedSheet = pickedBook.get('xl/worksheets/sheet2.xml'), pickedShared = pickedBook.get('xl/sharedStrings.xml');
  check(!pickedBook.has('xl/worksheets/sheet3.xml') && xmlDoc(pickedSheet).getElementsByTagName('row').length === 4 && pickedShared.includes(t('Solo le selezionate')) && pickedShared.includes(t('Nascosta')) && !pickedShared.includes('SMOKE-1'), 'Excel delle sole attività selezionate con i fogli scelti');
  view = 0; render();
  $('#bulk-excel').click();
  const excelForm = () => $('#excel-form');
  check($('#modal').open && excelForm().elements.scope.value === 'selected' && excelForm().querySelectorAll('input[name="sheets"]:checked').length === allSheets.length && excelForm().querySelectorAll('input[name="sheets"]').length === 5, 'Excel delle attività selezionate dalla barra della selezione');
  excelForm().querySelectorAll('input[name="sheets"]').forEach(box => { box.checked = false; });
  excelForm().requestSubmit();
  await tick();
  check($('#modal').open && $('#toast').textContent === t('Scegli almeno un foglio da esportare.'), 'Esportazione Excel richiede almeno un foglio');
  excelForm().querySelectorAll('input[name="sheets"]').forEach(box => { box.checked = true; });
  excelForm().requestSubmit();
  await waitFor(() => !$('#modal').open);
  const excelName = situationFileName(organizations.find(o => o.id === activeOrganizationId).name, currentLanguage());
  check($('#toast').textContent === `${t('Excel esportato:')} ${excelName}` && excelChoices.scope === 'selected', 'Esportazione Excel salvata su file con nome dell’organizzazione e data');
  clearSelection();
  $('[data-excel-export]').click();
  check(excelForm().elements.scope.value === 'view' && excelForm().querySelector('input[value="selected"]').disabled, 'Senza selezione l’Excel parte dalla vista attuale');
  $('#modal').close();
  $('#select-all').click();
  check(!selectedTasks.size, 'Nessuna riga mostrata da selezionare con le attività nascoste');
  showHidden = true; render(); $('#select-all').click();
  $('#bulk-edit').click();
  $('#bulk-delete').click();
  check($('#confirm-action') && $('.confirm-message').textContent.includes('BULK-1'), 'Eliminazione multipla chiede conferma');
  $('#confirm-action').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(!bulkTasks().some(Boolean) && data.tasks.length === initialTaskCount + 1 && !selectedTasks.size && $('#bulk-bar').hidden && !(await workspaceApi.load()).data.tasks.some(task => task.code.startsWith('BULK-')), 'Eliminazione multipla delle attività selezionate');
  search = ''; showHidden = false; sort = [{ key: 'releaseDate', direction: 'asc' }];
  view = 0; render();
  $('.highlighter-bar [data-manage-highlights]').click();
  check(view === 4 && settingsTab === 'highlights' && !$('#highlights-panel').hidden, 'Gestisci colori apre la scheda Evidenziatori');
  view = 4; render();
  const visibleSettingsPanels = () => settingsTabs.filter(tab => !$(`#${tab.panel}`).hidden).map(tab => tab.id);
  check(document.querySelectorAll('.settings-nav .settings-tab').length === settingsTabs.length && settingsTabs.every(tab => $(`#${tab.panel}`) && $(`#settings-tab-${tab.id}`).getAttribute('aria-controls') === tab.panel) && visibleSettingsPanels().length === 1, 'Impostazioni divise in schede con un solo pannello visibile');
  $('[data-settings-tab="themes"]').click();
  check(visibleSettingsPanels().join() === 'themes' && $('#settings-tab-themes').getAttribute('aria-current') === 'true' && !$('#settings-tab-identity').hasAttribute('aria-current') && settingsTab === 'themes', 'Scheda temi selezionabile dalla navigazione');
  render();
  check(visibleSettingsPanels().join() === 'themes' && $('#settings-tab-themes').classList.contains('active'), 'Scheda delle impostazioni mantenuta dopo il ridisegno');
  $('#settings-tab-themes').focus();
  $('#settings-tab-themes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  check(settingsTab === 'fonts' && visibleSettingsPanels().join() === 'fonts' && document.activeElement === $('#settings-tab-fonts'), 'Schede delle impostazioni navigabili da tastiera');
  showSettingsTab('themes');
  const accent = () => document.documentElement.style.getPropertyValue('--accent');
  const savedAccent = data.settings.themes.find(theme => theme.id === data.settings.themeId).accent;
  check($('#unsaved-banner').hidden && !settingsChanged() && accent() === savedAccent, 'Nessun avviso senza modifiche alle impostazioni');
  check(defaultThemes().length === 40 && defaultThemes().every(theme => data.settings.themes.some(saved => saved.id === theme.id)) && $('#reset-theme') && !$('#delete-theme') && [...document.querySelectorAll('#theme-list .theme-kind')].filter(label => label.textContent === t('Predefinito')).length === 40, 'Catalogo di 40 temi predefiniti disponibile senza importazione');
  const previewTheme = data.settings.themes.find(theme => theme.id !== data.settings.themeId && theme.accent !== savedAccent);
  document.querySelector(`[data-theme="${previewTheme.id}"]`).click();
  await new Promise(resolve => setTimeout(resolve));
  check(accent() === previewTheme.accent && document.documentElement.style.getPropertyValue('--background') === previewTheme.background, 'Selezione tema applicata subito in anteprima');
  if (customTitleBar()) check(windowChromeSent.background === previewTheme.background && windowChromeSent.text === previewTheme.text, 'Barra del titolo aggiornata con l’anteprima del tema');
  check(!$('#unsaved-banner').hidden && data.settings.themeId !== previewTheme.id, 'Avviso impostazioni non salvate visibile senza salvare il tema');
  check(!$('#settings-tab-themes .settings-tab-dot').hidden && settingsTabs.filter(tab => !$(`#settings-tab-${tab.id} .settings-tab-dot`).hidden).length === 1 && $('#unsaved-where').textContent.includes(t('Temi & atmosfera')) && $('#unsaved-where [data-goto-settings-tab="themes"]'), 'Scheda con modifiche segnalata nella navigazione e nell’avviso');
  showSettingsTab('identity');
  $('#unsaved-where [data-goto-settings-tab="themes"]').click();
  check(settingsTab === 'themes' && visibleSettingsPanels().join() === 'themes', 'Collegamento dell’avviso apre la scheda modificata');
  const searchThemes = value => { $('#theme-search').value = value; $('#theme-search').dispatchEvent(new Event('input', { bubbles: true })); };
  const themeQueryText = previewTheme.name.slice(1, 4).toLocaleUpperCase();
  const expectedThemes = settingsDraft.themes.filter(theme => theme.name.toLocaleLowerCase().includes(themeQueryText.toLocaleLowerCase()));
  searchThemes(themeQueryText);
  check(document.querySelectorAll('#theme-list .theme-choice').length === expectedThemes.length && expectedThemes.length < settingsDraft.themes.length && $('#theme-count').textContent.startsWith(`${expectedThemes.length} / ${settingsDraft.themes.length}`), 'Ricerca temi filtra la galleria senza distinguere maiuscole');
  searchThemes('nessun-tema-con-questo-nome');
  check($('.theme-empty') && !document.querySelector('#theme-list .theme-choice') && $('#theme-editor #theme-name'), 'Ricerca temi senza risultati mostra un messaggio e mantiene l’editor');
  searchThemes('');
  check(document.querySelectorAll('#theme-list .theme-choice').length === settingsDraft.themes.length && themeQuery === '', 'Ricerca temi azzerata mostra tutti i temi');
  document.querySelector('[data-theme-color="accent"]').value = '#12ab34';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input', { bubbles: true }));
  check(accent() === '#12ab34', 'Modifica colore tema applicata in tempo reale');
  if (customTitleBar()) {
    const backgroundInput = document.querySelector('[data-theme-color="background"]');
    backgroundInput.value = '#f4f1e8';
    backgroundInput.dispatchEvent(new Event('input', { bubbles: true }));
    check(windowChromeSent.background === '#f4f1e8' && windowChromeSent.text === previewTheme.text, 'Barra del titolo segue in tempo reale lo sfondo del tema');
  }
  check($('.theme-choice.chosen .theme-kind').textContent === t('Predefinito modificato') && !$('#delete-theme'), 'Tema predefinito modificabile senza eliminare il modello incorporato');
  $('#reset-theme').click();
  check(accent() === previewTheme.accent && $('#theme-name').value === previewTheme.name && $('.theme-choice.chosen .theme-kind').textContent === t('Predefinito'), 'Ripristino tema recupera nome e quattro colori originali');
  document.querySelector('[data-theme-color="accent"]').value = '#12ab34';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input', { bubbles: true }));
  $('#discard-settings').click();
  check(accent() === savedAccent && $('#unsaved-banner').hidden && !settingsDraft.themes.some(theme => theme.accent === '#12ab34'), 'Annulla modifiche ripristina il tema salvato');
  if (customTitleBar()) {
    const savedTheme = data.settings.themes.find(theme => theme.id === data.settings.themeId);
    check(windowChromeSent.background === savedTheme.background && windowChromeSent.text === savedTheme.text, 'Barra del titolo ripristinata con il tema salvato');
  }
  document.querySelector(`[data-theme="${previewTheme.id}"]`).click();
  check(accent() === previewTheme.accent, 'Anteprima tema riattivata');
  document.querySelector('[data-view="0"]').click();
  check(view === 0 && accent() === savedAccent && data.settings.themeId !== previewTheme.id, 'Uscita senza salvare mantiene il tema precedente');
  view = 4; render();
  document.querySelector('[data-tab-name="1"]').value = 'Modifica temporanea';
  document.querySelector('[data-tab-name="1"]').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  check(!$('#unsaved-banner').hidden, 'Avviso per qualsiasi impostazione modificata');
  check(!$('#settings-tab-identity .settings-tab-dot').hidden && $('#settings-tab-themes .settings-tab-dot').hidden, 'Modifica ai nomi delle tab segnalata sulla scheda identità');
  document.querySelector('[data-tab-name="1"]').value = data.settings.tabNames[1];
  document.querySelector('[data-tab-name="1"]').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  check($('#unsaved-banner').hidden, 'Avviso rimosso quando le modifiche tornano ai valori salvati');
  showSettingsTab('themes');
  const galleryThemes = Array.from({ length: 30 }, (_, index) => ({ id: uid(), name: `Galleria ${index + 1}`, background: '#101820', surface: '#203040', text: '#f0f4fc', accent: '#40a0e0' }));
  settingsDraft.themes.push(...galleryThemes);
  settingsDraft.themeId = galleryThemes.at(-1).id;
  drawThemes();
  check($('.theme-choice.chosen .theme-kind').textContent === t('Personalizzato') && $('#delete-theme') && !$('#reset-theme'), 'Tema personale distinto dai predefiniti e ancora eliminabile');
  $('#delete-theme').click();
  check(!settingsDraft.themes.some(theme => theme.id === galleryThemes.at(-1).id) && defaultThemes().every(theme => settingsDraft.themes.some(saved => saved.id === theme.id)), 'Eliminazione tema personale non rimuove i predefiniti');
  settingsDraft.themes.push(galleryThemes.at(-1));
  settingsDraft.themeId = galleryThemes.at(-1).id;
  drawThemes();
  const gallery = $('#theme-list'), lastGalleryTile = gallery.querySelector('.theme-choice.chosen');
  check(gallery.scrollHeight > gallery.clientHeight + 100 && gallery.scrollTop > 0 && lastGalleryTile.offsetTop >= gallery.scrollTop && lastGalleryTile.offsetTop + lastGalleryTile.offsetHeight <= gallery.scrollTop + gallery.clientHeight + 1 && $('#themes-panel').offsetHeight < $('#theme-editor').offsetHeight + 400, 'Galleria temi compatta: scorre al suo interno e mostra il tema scelto');
  $('#discard-settings').click();
  check(settingsDraft.themes.length === data.settings.themes.length && $('#unsaved-banner').hidden, 'Temi aggiunti alla galleria scartati');
  showSettingsTab('highlights');
  const savedHighlights = structuredClone(data.settings.highlights), removedHighlight = savedHighlights.find(h => h.id === smokeTask().highlightId);
  check(visibleSettingsPanels().join() === 'highlights' && document.querySelectorAll('#highlights-list .option-row').length === savedHighlights.length && document.querySelectorAll('#highlights-list .option-usage').length === savedHighlights.length && !$('#highlights-list .star'), 'Scheda Evidenziatori con i colori dell’organizzazione');
  $('[data-add-option="highlights"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(settingsDraft.highlights.length === savedHighlights.length + 1 && !savedHighlights.some(h => h.color === settingsDraft.highlights.at(-1).color) && !$('#settings-tab-highlights .settings-tab-dot').hidden && !$('#unsaved-banner').hidden, 'Nuovo colore con tinta non usata segnalato come modifica');
  $('#discard-settings').click();
  check(settingsDraft.highlights.length === savedHighlights.length && $('#unsaved-banner').hidden, 'Nuovo colore scartato annullando le modifiche');
  document.querySelector(`[data-remove="highlights:${removedHighlight.id}"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => data.settings.highlights.length === savedHighlights.length - 1 && !saving);
  check(!data.tasks.some(task => task.highlightId === removedHighlight.id) && smokeTask().highlightId === '', 'Eliminando un colore le righe tornano senza evidenziazione');
  await commit(next => { next.settings.highlights = savedHighlights; });
  render();
  showSettingsTab('statuses');
  const savedStatuses = structuredClone(data.settings.statuses), statusIds = list => list.map(status => status.id).join();
  const statusRow = index => document.querySelectorAll('#statuses-list .option-row')[index], statusHandle = index => statusRow(index).querySelector('[data-drag-handle]');
  check(savedStatuses.length >= 3 && document.querySelectorAll('#statuses-list [data-drag-handle]').length === savedStatuses.length && getComputedStyle(statusHandle(0)).cursor === 'grab' && $('#unsaved-banner').hidden, 'Maniglia di trascinamento su ogni stato');
  const statusLifted = dragTo(statusHandle(0), statusRow(2));
  await tick();
  const draggedStatuses = [savedStatuses[1], savedStatuses[2], savedStatuses[0], ...savedStatuses.slice(3)];
  check(statusLifted && statusIds(settingsDraft.statuses) === statusIds(draggedStatuses) && document.activeElement === statusHandle(2) && !document.querySelector('.is-dragging') && !document.body.classList.contains('is-sorting') && !$('#settings-tab-statuses .settings-tab-dot').hidden && !$('#unsaved-banner').hidden && $('body > .sort-status')?.textContent === fillText('Spostato in posizione {0} di {1}', 3, savedStatuses.length), 'Stati riordinati trascinandoli, con modifica segnalata e annunciata');
  const statusCancelled = dragTo(statusHandle(0), statusRow(2), 'escape');
  await tick();
  const listedStatusIds = () => [...document.querySelectorAll('#statuses-list [data-option-name]')].map(input => input.dataset.optionName.slice('statuses:'.length)).join();
  check(statusCancelled && statusIds(settingsDraft.statuses) === statusIds(draggedStatuses) && listedStatusIds() === statusIds(draggedStatuses) && !document.querySelector('.is-dragging') && !statusRow(0).style.transform && !$('#modal').open, 'Esc annulla il trascinamento e ripristina l’ordine');
  statusHandle(2).focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  const keyedStatuses = [savedStatuses[1], savedStatuses[0], savedStatuses[2], ...savedStatuses.slice(3)];
  check(statusIds(settingsDraft.statuses) === statusIds(keyedStatuses) && listedStatusIds() === statusIds(keyedStatuses) && document.activeElement === statusHandle(1), 'Stati riordinabili con le frecce sulla maniglia');
  $('#save-settings-inline').click();
  await waitFor(() => !saving && statusIds(data.settings.statuses) === statusIds(keyedStatuses));
  view = 3; render();
  check(statusIds((await workspaceApi.load()).data.settings.statuses) === statusIds(keyedStatuses) && [...document.querySelectorAll('.kanban-column .kanban-heading span')].map(span => span.textContent).join() === keyedStatuses.map(status => status.name).join(), 'Nuovo ordine degli stati salvato e applicato al kanban');
  await commit(next => { next.settings.statuses = savedStatuses; });
  view = 4; render();
  showSettingsTab('columns');
  $('#columns-editor [data-column-visible="link"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(settingsDraft.taskColumns.find(column => column.id === 'link').visible && !$('#settings-tab-columns .settings-tab-dot').hidden, 'Colonne della lista configurabili dalle impostazioni');
  $('#reset-columns').click();
  await new Promise(resolve => setTimeout(resolve));
  check(!settingsDraft.taskColumns.find(column => column.id === 'link').visible && $('#unsaved-banner').hidden, 'Ripristino delle colonne predefinite');
  showSettingsTab('fonts');
  const rootSize = id => document.documentElement.style.getPropertyValue(`--fs-${id}`);
  const fontPx = element => parseFloat(getComputedStyle(element).fontSize);
  const setFontSize = async (id, value) => {
    const input = $(`#font-size-${id}`);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve));
  };
  check($('#font-size-panel') && FONT_SIZE_PARTS.every(({ id, min, max }) => {
    const input = $(`#font-size-${id}`);
    return Number(input.min) === min && Number(input.max) === max && Number(input.step) === FONT_SIZE_STEP && Number(input.value) === data.settings.fontSizes[id] && rootSize(id) === String(data.settings.fontSizes[id] / 100);
  }) && document.querySelectorAll('#font-size-panel .font-sample[inert]').length === FONT_SIZE_PARTS.length, 'Dimensione del testo configurabile per parte con limiti e anteprime');
  const tableSampleSize = fontPx($('.font-sample[data-part="tables"] .code-link')), baseSampleSize = fontPx($('.font-sample[data-part="base"] .button'));
  const navSize = fontPx($('.sidebar .nav-button')), topbarSize = fontPx($('.topbar'));
  await setFontSize('tables', 130);
  check(rootSize('tables') === '1.3' && Math.abs(fontPx($('.font-sample[data-part="tables"] .code-link')) - tableSampleSize * 1.3) < 0.1 && fontPx($('.font-sample[data-part="base"] .button')) === baseSampleSize && $('#font-size-tables-value').textContent === '130%' && !$('#unsaved-banner').hidden && data.settings.fontSizes.tables === 100, 'Dimensione tabelle applicata subito in anteprima solo alla sua parte');
  await setFontSize('tables', 400);
  check(settingsDraft.fontSizes.tables === 150 && $('#font-size-tables').value === '150' && rootSize('tables') === '1.5', 'Dimensione del testo limitata al massimo consentito');
  $('[data-font-preset="85"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(FONT_SIZE_PARTS.every(({ id }) => settingsDraft.fontSizes[id] === 85 && rootSize(id) === '0.85') && $('[data-font-preset="85"]').getAttribute('aria-pressed') === 'true' && Math.abs(fontPx($('.sidebar .nav-button')) - navSize * 0.85) < 0.05 && Math.abs(fontPx($('.topbar')) - topbarSize * 0.85) < 0.05, 'Preimpostazione compatta applicata a tutta l’interfaccia');
  $('#discard-settings').click();
  check(FONT_SIZE_PARTS.every(({ id }) => rootSize(id) === '1' && $(`#font-size-${id}`).value === '100') && $('#unsaved-banner').hidden && fontPx($('.font-sample[data-part="tables"] .code-link')) === tableSampleSize && fontPx($('.topbar')) === topbarSize, 'Annulla modifiche ripristina le dimensioni del testo salvate');
  await setFontSize('kanban', 120);
  document.querySelector('[data-view="3"]').click();
  const kanbanTitleSize = fontPx($('.kanban-column .card-title'));
  check(view === 3 && rootSize('kanban') === '1' && data.settings.fontSizes.kanban === 100, 'Uscita senza salvare mantiene le dimensioni del testo precedenti');
  view = 4; render();
  await setFontSize('kanban', 120);
  $('#save-settings-inline').click();
  await waitFor(() => data.settings.fontSizes.kanban === 120 && !saving);
  check((await workspaceApi.load()).data.settings.fontSizes.kanban === 120 && rootSize('kanban') === '1.2' && $('#unsaved-banner').hidden, 'Dimensioni del testo salvate per organizzazione');
  view = 3; render();
  check(Math.abs(fontPx($('.kanban-column .card-title')) - kanbanTitleSize * 1.2) < 0.1, 'Kanban ingrandito dopo il salvataggio');
  view = 0; render();
  check(Math.abs(fontPx($('#task-rows .code-link')) - tableSampleSize) < 0.05, 'Tabelle invariate e coerenti con l’anteprima');
  let invalidSizesRejected = false;
  const invalidSizes = structuredClone(data);
  invalidSizes.settings.fontSizes.tables = 500;
  try { await workspaceApi.save(invalidSizes, activeOrganizationId, undefined, revision); } catch (error) { invalidSizesRejected = /Dimensioni del testo non valide|Invalid text sizes/.test(error.message); }
  check(invalidSizesRejected && (await workspaceApi.load()).data.settings.fontSizes.tables === 100, 'Dimensioni del testo fuori dai limiti rifiutate dall’archivio');
  view = 4; render();
  const sampleCode = data.tasks.find(task => task.code.trim()).code.trim();
  const setTemplate = async value => { $('#portal-url-template').value = value; $('#portal-url-template').dispatchEvent(new Event('input', { bubbles: true })); await new Promise(resolve => setTimeout(resolve)); };
  const savedTemplate = data.settings.portalUrlTemplate;
  await setTemplate('https://jira.smoke.test/browse/');
  check($('#portal-preview').classList.contains('invalid') && $('#portal-preview').textContent.includes('{codice}'), 'Modello link senza segnaposto segnalato');
  showSettingsTab('themes');
  $('#save-settings-inline').click();
  await waitFor(() => $('#toast').textContent.includes('Il modello del link portale') && !saving);
  check(data.settings.portalUrlTemplate === savedTemplate && !$('#unsaved-banner').hidden, 'Modello link non valido non salvato');
  check(settingsTab === 'portal' && visibleSettingsPanels().join() === 'portal' && !$('#settings-tab-portal .settings-tab-dot').hidden, 'Errore di salvataggio apre la scheda del campo da correggere');
  await setTemplate('jira.smoke.test/browse/{codice}');
  check($('#portal-preview a[data-open-url]').getAttribute('href') === `https://jira.smoke.test/browse/${encodeURIComponent(sampleCode)}` && !$('#unsaved-banner').hidden, 'Anteprima modello link con https:// automatico');
  $('#portal-preview a[data-open-url]').click();
  await waitFor(() => lastOpenedLink === `https://jira.smoke.test/browse/${encodeURIComponent(sampleCode)}`);
  check(location.protocol === 'file:' && view === 4, 'Link di anteprima aperto nel browser predefinito senza navigare nell’app');
  $('#organization-name').value = 'Workspace di prova';
  document.querySelector('[data-tab-name="2"]').value = 'Roadmap personalizzata';
  settingsDraft.statuses.reverse();
  showSettingsTab('themes');
  $('#add-theme').click();
  $('#theme-name').value = 'Tema di prova';
  $('#theme-name').dispatchEvent(new Event('input'));
  document.querySelector('[data-theme-color="accent"]').value = '#ff8844';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input'));
  check([...document.querySelectorAll('.theme-swatches')].every(swatches => swatches.children.length === 4), 'Anteprime temi mostrano tutti e quattro i colori');
  check(document.querySelector('.theme-choice.chosen [aria-label="Accento: #ff8844"]'), 'Anteprima aggiornata immediatamente dal selettore colore');
  const imageSource = document.createElement('canvas');
  imageSource.width = 40; imageSource.height = 10;
  const imageContext = imageSource.getContext('2d');
  for (const [index, color] of ['#101820', '#303848', '#f0f4fc', '#d06090'].entries()) {
    imageContext.fillStyle = color; imageContext.fillRect(index * 10, 0, 10, 10);
  }
  const imageBlob = await new Promise(resolve => imageSource.toBlob(resolve, 'image/png'));
  const transfer = new DataTransfer();
  transfer.items.add(new File([imageBlob], 'palette-test.png', { type: 'image/png' }));
  $('#theme-image-file').files = transfer.files;
  $('#theme-image-file').dispatchEvent(new Event('change'));
  await waitFor(() => !$('#theme-image-canvas').hidden && !$('#theme-image-file').disabled);
  const generated = { background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090' };
  for (const [key, label] of themeFields) {
    check(document.querySelector(`[data-theme-color="${key}"]`).value === generated[key], `Caricamento immagine assegna automaticamente ${key}`);
    check(document.querySelector(`.theme-choice.chosen [aria-label="${label}: ${generated[key]}"]`), `Anteprima automatica sincronizzata per ${key}`);
  }
  check($('#theme-image-result').textContent.includes('quattro colori assegnati automaticamente'), 'Estrazione dei quattro colori non richiede clic manuali');
  settingsDraft.themes.push({ id: uid(), name: 'Palette automatica', ...generated });
  const canvas = $('#theme-image-canvas');
  const bounds = canvas.getBoundingClientRect();
  for (const [key] of themeFields) {
    $('#theme-image-target').value = key;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: bounds.left + bounds.width * (key === 'text' ? 0.625 : 0.125), clientY: bounds.top + bounds.height / 2 }));
    const expected = key === 'text' ? '#f0f4fc' : '#101820';
    check(document.querySelector(`[data-theme-color="${key}"]`).value === expected, `Prelievo da immagine assegna colore esatto a ${key}`);
    check(document.querySelector(`.theme-choice.chosen [aria-label="${themeFields.find(([field]) => field === key)[1]}: ${expected}"]`), `Anteprima sincronizzata dopo prelievo ${key}`);
  }
  let invalidImageRejected = false;
  try { await loadThemeImage(new File(['invalid'], 'invalid.png', { type: 'image/png' }), canvas); } catch { invalidImageRejected = true; }
  check(invalidImageRejected, 'Immagine non leggibile rifiutata esplicitamente');
  let oversizedImageRejected = false;
  try { await loadThemeImage(new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), canvas); } catch { oversizedImageRejected = true; }
  check(oversizedImageRejected, 'Limite dimensione immagine verificato');
  document.querySelector('[data-theme-color="accent"]').value = '#ff8844';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input'));
  check(accent() === '#ff8844' && !$('#unsaved-banner').hidden, 'Tema personalizzato in anteprima prima del salvataggio');
  $('#save-settings-inline').click();
  const organizationName = () => organizations.find(o => o.id === activeOrganizationId).name;
  await waitFor(() => organizationName() === 'Workspace di prova' && !saving);
  check(view === 4 && $('#unsaved-banner').hidden && accent() === '#ff8844', 'Salvataggio dall’avviso rende effettivo il tema e rimuove l’avviso');
  check(data.settings.portalUrlTemplate === 'https://jira.smoke.test/browse/{codice}' && (await workspaceApi.load()).data.settings.portalUrlTemplate === data.settings.portalUrlTemplate, 'Modello link portale salvato per organizzazione');
  view = 0; showHidden = true; render();
  const generatedSmokeLink = 'https://jira.smoke.test/browse/SMOKE-1', overrideLink = 'https://altro.portale.it/ticket/SMOKE-1';
  const listLink = document.querySelector(`#task-rows a[data-open-url][href="${generatedSmokeLink}"]`);
  check(listLink && data.tasks.find(t => t.code === 'SMOKE-1').url === '', 'Link generato dal modello per attività senza link specifico');
  listLink.click();
  await waitFor(() => lastOpenedLink === generatedSmokeLink);
  check(location.protocol === 'file:' && view === 0, 'Link della lista aperto nel browser predefinito');
  let unsafeLinkRejected = false;
  try { await workspaceApi.openLink('javascript:alert(1)'); } catch { unsafeLinkRejected = true; }
  check(unsafeLinkRejected, 'Apertura di indirizzi non web rifiutata');
  taskDialog(data.tasks.find(t => t.code === 'SMOKE-1'));
  check($('#portal-link-preview a').getAttribute('href') === generatedSmokeLink && $('#task-url').placeholder === generatedSmokeLink && !$('#task-url').required, 'Dialog mostra il link generato dal codice');
  $('#task-url').value = 'altro.portale.it/ticket/SMOKE-1';
  $('#task-url').dispatchEvent(new Event('input'));
  check($('#portal-link-preview a').getAttribute('href') === overrideLink, 'Link specifico normalizzato in anteprima');
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.find(t => t.code === 'SMOKE-1').url === overrideLink && !saving);
  check(document.querySelector(`#task-rows a[href="${overrideLink}"]`) && !document.querySelector(`#task-rows a[href="${generatedSmokeLink}"]`), 'Link specifico ha la precedenza sul modello');
  taskDialog(data.tasks.find(t => t.code === 'SMOKE-1'));
  $('#task-url').value = '';
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.find(t => t.code === 'SMOKE-1').url === '' && !saving);
  check(document.querySelector(`#task-rows a[href="${generatedSmokeLink}"]`), 'Senza link specifico torna il link del modello');
  view = 2; render();
  check(document.querySelector(`.milestone-column a.card-portal-link[href="${generatedSmokeLink}"]`), 'Link portale apribile dalle milestone');
  view = 3; render();
  check(document.querySelector(`.kanban-column a.card-portal-link[href="${generatedSmokeLink}"]`) && !document.querySelector('.kanban-board button'), 'Link portale nel kanban senza comandi di modifica');
  check(organizationName() === 'Workspace di prova' && document.title === APP_NAME && $('#brand-name').textContent === APP_NAME && !$('#app-name'), 'Nome organizzazione modificabile ma identità OrbitKanban fissa');
  check(data.settings.tabNames[2] === 'Roadmap personalizzata' && data.settings.themes.some(t => t.name === 'Tema di prova' && t.accent === '#ff8844'), 'Nomi tab e tema utente salvati');
  const savedTheme = (await workspaceApi.load()).data.settings.themes.find(t => t.name === 'Tema di prova');
  check(savedTheme.background === '#101820' && savedTheme.surface === '#101820' && savedTheme.text === '#f0f4fc', 'Colori prelevati da immagine persistiti su disco');
  check((await workspaceApi.load()).data.settings.themes.some(t => t.name === 'Palette automatica' && themeFields.every(([key]) => t[key] === generated[key])), 'Intera palette automatica preservata su disco');
  view = 3; render();
  check(document.querySelector('.kanban-heading').textContent.includes(data.settings.statuses[0].name), 'Ordine kanban segue impostazioni');
  check(sanitize('<img src=x onerror=alert(1)><p onclick="x()">ok<script>x()</script></p>') === '<p>ok</p>', 'Sanitizzazione rich text');
  check(plain('<p>Prima</p><p>Seconda<br>Terza</p>') === 'Prima Seconda Terza', 'Anteprime rich text preservano separazione parole');
  const previewSource = `<p>Anteprima ${uid()}<script>non visibile</script></p>`;
  const parseDocument = DOMParser.prototype.parseFromString;
  let previewParses = 0, cachedPreview;
  try {
    DOMParser.prototype.parseFromString = function (...args) { previewParses++; return parseDocument.apply(this, args); };
    cachedPreview = plain(previewSource);
    plain(previewSource);
    plain(previewSource + '<p>Modificata</p>');
  } finally { DOMParser.prototype.parseFromString = parseDocument; }
  check(previewParses === 2 && !cachedPreview.includes('non visibile') && plain(previewSource + '<p>Modificata</p>').endsWith('Modificata'), 'Cache anteprime evita parsing ripetuti senza riutilizzare testi superati o non sanitizzati');
  const formatterLanguage = data.settings.language;
  try {
    for (const language of ['en', 'it', 'en']) {
      data.settings.language = language;
      check(formatDate('2026-11-02') === new Date('2026-11-02T12:00:00').toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }), `Formattatore date riutilizzato nella lingua ${language}`);
    }
  } finally { data.settings.language = formatterLanguage; }
  const firstOrganizationId = activeOrganizationId;
  const firstSettings = structuredClone(data.settings);
  const firstOrganizationName = organizationName();
  check(organizations.length === 1 && $('#organization-select').options.length === 1, 'Archivio precedente migrato in una singola organizzazione');
  $('#manage-organizations').click();
  const createForm = $('#create-organization');
  createForm.elements.name.value = 'Seconda organizzazione';
  const upload = new DataTransfer();
  upload.items.add(new File([imageBlob], 'logo.png', { type: 'image/png' }));
  $('#create-logo-file').files = upload.files;
  $('#create-logo-file').dispatchEvent(new Event('change'));
  await waitFor(() => Boolean($('#create-logo-preview img')) && !$('#create-logo-file').disabled);
  const creationLogo = $('#create-logo-preview img').src;
  check($('#create-logo-preview .theme-swatches').children.length === 4 && view === 4, 'Creazione organizzazione in impostazioni con logo e anteprima di quattro colori');
  check(settingsTab === 'organizations' && visibleSettingsPanels().join() === 'organizations', 'Gestione organizzazioni apre direttamente la sua scheda');
  createForm.requestSubmit();
  await waitFor(() => activeOrganizationId !== firstOrganizationId && !organizationBusy);
  const secondOrganizationId = activeOrganizationId;
  check(data.tasks.length === 0 && data.issues.length === 0 && data.settings.logo === creationLogo, 'Nuova organizzazione creata con logo e dati indipendenti in un singolo salvataggio');
  check($('.brand-icon img').src === creationLogo && $('#brand-name').textContent === APP_NAME, 'Logo organizzazione visibile subito senza rinominare l’app');
  view = 4; render();
  check(settingsDraft.themeId === 'organization-logo' && themeFields.every(([key]) => settingsDraft.themes.find(theme => theme.id === 'organization-logo')[key] === generated[key]), 'Logo genera automaticamente un tema dedicato con quattro colori');
  const secondLogo = settingsDraft.logo;
  showSettingsTab('languages');
  const languagePanel = () => $('#languages-panel').textContent;
  check(visibleSettingsPanels().join() === 'languages' && [...$('#language').options].map(option => option.value).join() === 'de,en,it' && $('#language').value === 'it' && $('#language-missing').hidden, 'Scheda lingua con lingue integrate e lingua aggiunta da file');
  check(['Deutsch', 'Aggiunta da file', 'Integrata', 'Aggiungi una lingua', 'en.template.json', 'Apri cartella lingue', 'Ricarica lingue'].every(text => languagePanel().includes(text)) && $('#languages-folder').textContent.endsWith('languages'), 'Elenco lingue, istruzioni e cartella lingue visibili');
  check($('.language-errors') && $('.language-errors').textContent.includes('broken.json') && $('.language-errors').textContent.includes('File JSON non valido.'), 'File lingua non validi segnalati senza bloccare l’app');
  check(languageOptions('fr').includes('fr (non installata)') && !$('#identity-panel #language'), 'Lingua non installata indicata e selettore spostato nella scheda lingua');
  await $('#open-languages-folder').onclick();
  check(languageInfo.template.endsWith('en.template.json') && languageInfo.errors.length === 1, 'Cartella lingue preparata con il modello inglese');
  $('#language').value = 'de';
  $('#language').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  check(!$('#settings-tab-languages .settings-tab-dot').hidden && $('#settings-tab-identity .settings-tab-dot').hidden && $('#language-missing').hidden, 'Cambio lingua segnalato nella scheda lingua');
  $('#save-settings').click();
  await waitFor(() => data.settings.language === 'de' && !saving);
  check(document.documentElement.lang === 'de' && $('#current-tab').textContent === 'Einstellungen' && $('#save-settings').textContent === 'Einstellungen speichern' && $('#manage-organizations').textContent === 'Manage organizations' && $('#theme-count').textContent.endsWith('themes'), 'Lingua aggiunta da file usata con l’inglese per i testi mancanti');
  await $('#reload-languages').onclick();
  check($('#toast').textContent === 'Languages reloaded.' && $('#language').value === 'de' && $('#current-tab').textContent === 'Einstellungen' && settingsTab === 'languages', 'Ricarica lingue aggiorna la scheda senza perdere la selezione');
  $('#language').value = 'en';
  $('#organization-name').value = 'English workspace';
  $('#save-settings').click();
  await waitFor(() => data.settings.language === 'en' && !saving);
  check(document.documentElement.lang === 'en' && $('#current-tab').textContent === 'Settings' && $('#save-settings').textContent === 'Save settings', 'Selettore inglese traduce impostazioni e navigazione');
  check($('#content').textContent.includes('Organization logo') && $('#content').textContent.includes('Interface language') && !$('#content').textContent.includes('Identità'), 'Impostazioni, logo e lingua tradotti in inglese');
  check($('.settings-nav').getAttribute('aria-label') === 'Settings sections' && ['Appearance', 'Themes & atmosphere', 'Data & access'].every(text => $('.settings-nav').textContent.includes(text)) && $('#theme-search').placeholder === 'Search themes…' && $('#theme-count').textContent.endsWith('themes'), 'Schede delle impostazioni e galleria temi tradotte in inglese');
  check($('#portal-panel').textContent.includes('Link template') && $('#portal-panel').textContent.includes('{code}') && !$('#portal-panel').textContent.includes('{codice}') && $('#portal-url-template').placeholder.endsWith('{code}'), 'Sezione link portale tradotta in inglese');
  check($('.brand-icon img').src === secondLogo && document.documentElement.style.getPropertyValue('--accent') === generated.accent, 'Logo e tema dell’organizzazione attiva visualizzati nella sidebar');
  check([...document.querySelectorAll('.theme-swatches')].every(swatches => swatches.children.length === 4) && document.querySelector('.theme-choice.chosen [aria-label="Text: #f0f4fc"]'), 'Quattro colori e relative etichette tradotti');
  view = 0; render();
  check($('#new-task').textContent.includes('New task') && $('#search').placeholder.startsWith('Search'), 'Lista attività e ricerca tradotte');
  check($('.highlighter-label').textContent.includes('Highlighter') && $('#columns-button').textContent.includes('Columns') && $('#highlight-filter').options[0].textContent === 'All highlights' && $('.activity-table th[data-column="description"] .column-heading > span').textContent === 'Description', 'Evidenziatore e colonne tradotti in inglese');
  taskDialog();
  check($('#task-form').textContent.includes('Portal code') && $('#task-form').textContent.includes('Effort in days') && $('#task-form').textContent.includes('1 day'), 'Dialog attività, editor e unità in inglese');
  check(data.settings.tags.length === 0 && !$('.tag-choice') && !$('.task-tags'), 'Catalogo tag isolato e selettore assente dalla scheda attività');
  $('#task-form').elements.code.value = 'SMOKE-1';
  $('#description-editor').innerHTML = '<p>Attività personalizzate</p>';
  $('#task-form').elements.days.value = '1';
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.length === 1 && !saving);
  check(data.tasks[0].code === 'SMOKE-1' && matchIssues(data.tasks[0], data.issues).incidents.length === 0, 'Codici uguali tra organizzazioni non condividono issue');
  check(data.settings.portalUrlTemplate === '' && !document.querySelector('#task-rows a[data-open-url]'), 'Modello link separato per organizzazione');
  check($('#task-rows').textContent.includes('Attività personalizzate') && effort(data.tasks[0].effortHours) === '1d', 'Contenuti utente preservati e effort localizzato');
  $('.task-tags-button').click();
  check($('#tag-menu').textContent.includes('No tags available. Add them in Settings'), 'Dropdown senza catalogo mostra istruzioni in inglese');
  closeTagMenu();
  view = 1; render(); issueDialog();
  check($('#issue-form').textContent.includes('Save association') && $('.page-heading p').textContent.startsWith('Connect work to its origin.'), 'Vista issue e dialog tradotti in inglese');
  $('#modal').close();
  view = 2; render();
  check($('#content').textContent.includes('Unscheduled') && $('.page-heading p').textContent.startsWith('Every release is a milestone.'), 'Milestone e data mancante tradotte');
  view = 3; render();
  check($('#content').textContent.includes('Read only') && !document.querySelector('.kanban-board button'), 'Kanban inglese resta readonly');
  view = 4; render();
  $('#organization-name').value = 'Unsaved name';
  const selectOrganization = id => { $('#organization-select').value = id; $('#organization-select').dispatchEvent(new Event('change')); };
  selectOrganization(firstOrganizationId);
  check($('#modal').open && $('#save-switch') && activeOrganizationId === secondOrganizationId, 'Cambio organizzazione protegge modifiche non salvate');
  $('#modal [data-close]').click();
  check(activeOrganizationId === secondOrganizationId && $('#organization-name').value === 'Unsaved name', 'Annullamento cambio conserva modifiche');
  selectOrganization(firstOrganizationId);
  $('#discard-switch').click();
  await waitFor(() => activeOrganizationId === firstOrganizationId && !organizationBusy);
  check(data.tasks.length === initialTaskCount + 1 && data.issues.some(issue => issue.incident === 'INC-SMOKE') && organizationName() === firstOrganizationName, 'Ritorno alla prima organizzazione conserva attività, associazioni e impostazioni');
  check(document.documentElement.lang === 'it' && $('.brand-icon img').getAttribute('src') === 'app-logo.svg' && document.documentElement.style.getPropertyValue('--accent') === firstSettings.themes.find(theme => theme.id === firstSettings.themeId).accent, 'Lingua e tema per organizzazione e logo applicazione come fallback');
  imageContext.fillStyle = '#22cc88'; imageContext.fillRect(30, 0, 10, 10);
  const firstLogoBlob = await new Promise(resolve => imageSource.toBlob(resolve, 'image/png'));
  const firstLogoUpload = new DataTransfer();
  firstLogoUpload.items.add(new File([firstLogoBlob], 'first-logo.png', { type: 'image/png' }));
  $('#logo-file').files = firstLogoUpload.files;
  $('#logo-file').dispatchEvent(new Event('change'));
  await waitFor(() => Boolean(settingsDraft.logo) && !$('#logo-file').disabled);
  $('#organization-name').value = 'Prima organizzazione con logo';
  selectOrganization(secondOrganizationId);
  $('#save-switch').click();
  await waitFor(() => activeOrganizationId === secondOrganizationId && !organizationBusy);
  check(organizationName() === 'English workspace' && data.settings.logo === secondLogo && document.documentElement.lang === 'en', 'Salva e cambia conserva lingua e logo separati per organizzazione');
  let staleSaveRejected = false;
  try { await workspaceApi.save(structuredClone(data), firstOrganizationId); } catch { staleSaveRejected = true; }
  const snapshotAfterRejection = await workspaceApi.load();
  check(staleSaveRejected && snapshotAfterRejection.organizations.find(o => o.id === snapshotAfterRejection.activeOrganizationId).name === 'English workspace', 'Salvataggio con organizzazione obsoleta rifiutato senza contaminare dati');
  $('#manage-organizations').click();
  $('#organization-name').value = 'Second renamed';
  $('#save-settings').click();
  await waitFor(() => organizations.some(o => o.name === 'Second renamed') && !saving);
  check($('#organization-select').selectedOptions[0].textContent === 'Second renamed', 'Rinomina organizzazione aggiorna menu');
  $('#manage-organizations').click();
  $('#create-organization').elements.name.value = 'Temporary';
  $('#create-organization').requestSubmit();
  await waitFor(() => organizations.length === 3 && !organizationBusy);
  check(data.settings.language === 'en' && data.settings.tabNames[0] === 'Tasks', 'Nuova organizzazione eredita lingua con nomi iniziali localizzati');
  $('#manage-organizations').click();
  $('#delete-organization').click();
  $('#confirm-action').click();
  await waitFor(() => organizations.length === 2 && !organizationBusy);
  check(!organizations.some(o => o.name === 'Temporary'), 'Eliminazione organizzazione confermata senza toccare le altre');
  const finalSnapshot = await workspaceApi.load();
  check(finalSnapshot.organizations.length === 2 && finalSnapshot.data.settings.logo.startsWith('data:image/png;base64,'), 'Organizzazioni e logo incorporato persistiti su disco');
  await organizationAction('switch', { id: firstOrganizationId });
  check(data.settings.logo !== secondLogo && organizationName() === 'Prima organizzazione con logo', 'Ogni organizzazione mantiene un logo distinto dopo ripetuti cambi');
  check(document.title === APP_NAME && $('#brand-name').textContent === APP_NAME && data.settings.appName === undefined, 'OrbitKanban rimane il nome fisso indipendentemente da organizzazione e lingua');
  view = 4; render();
  check($('#browser-panel') && /^http:\/\/127\.0\.0\.1:\d+\/$/.test($('#browser-url').textContent) && !$('#browser-open').disabled && !$('#browser-copy').disabled, 'Sezione accesso da browser con indirizzo locale');
  check(!$('#open-browser').disabled && $('#open-browser').textContent.includes('Apri nel browser') && /^\d+\.\d+\.\d+$/.test(appVersion) && $('#app-version').textContent === `v${appVersion}`, 'Pulsante browser e versione dell’app visibili');
  check((await workspaceApi.browserAccess('info', activeOrganizationId)).url === browserUrl, 'Indirizzo browser coerente con l’app');
  $('#open-browser').click();
  await waitFor(() => $('#toast').textContent.includes('Organizzazione aperta nel browser'));
  check(location.protocol === 'file:', 'Organizzazione aperta nel browser predefinito senza navigare nell’app');
  check($('#create-organization [name="demo"]') && !$('#create-organization [name="demo"]').checked, 'Opzione dati dimostrativi nella creazione organizzazione');
  view = 0; showHidden = true; render();
  const remoteBase = await workspaceApi.load(activeOrganizationId);
  remoteBase.data.tasks.push({ ...structuredClone(remoteBase.data.tasks[0]), id: uid(), code: 'REMOTE-1', sequence: 9001, hidden: false, notes: '' });
  const remoteSaved = await workspaceApi.save(remoteBase.data, activeOrganizationId, undefined, remoteBase.revision);
  await waitFor(() => revision === remoteSaved.revision && !refreshing);
  check(data.tasks.some(t => t.code === 'REMOTE-1') && $('#task-rows').textContent.includes('REMOTE-1'), 'Modifiche da un’altra finestra sincronizzate in tempo reale');
  const staleRevision = revision;
  const external = await workspaceApi.load(activeOrganizationId);
  external.data.tasks.find(t => t.code === 'REMOTE-1').notes = '<p>Nota remota</p>';
  const externalSaved = await workspaceApi.save(external.data, activeOrganizationId, undefined, external.revision);
  await waitFor(() => revision === externalSaved.revision && !refreshing);
  revision = staleRevision;
  let conflictCode = '';
  try { await commit(structuredClone(data)); } catch (error) { conflictCode = error.code; }
  check(conflictCode === 'conflict', 'Salvataggio basato su dati superati rifiutato come conflitto');
  await commit(next => { next.tasks.find(t => t.code === 'REMOTE-1').hidden = true; });
  const merged = await workspaceApi.load(activeOrganizationId);
  const mergedTask = merged.data.tasks.find(t => t.code === 'REMOTE-1');
  check(mergedTask.hidden && mergedTask.notes === '<p>Nota remota</p>' && revision === merged.revision, 'Conflitto risolto riapplicando la modifica senza perdere quella remota');
  view = 4; render();
  $('#organization-name').value = 'Bozza locale';
  $('#organization-name').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  const draftBase = await workspaceApi.load(activeOrganizationId);
  draftBase.data.tasks.find(t => t.code === 'REMOTE-1').code = 'REMOTE-2';
  const draftSaved = await workspaceApi.save(draftBase.data, activeOrganizationId, undefined, draftBase.revision);
  await waitFor(() => revision === draftSaved.revision && !refreshing);
  check(view === 4 && $('#organization-name').value === 'Bozza locale' && !$('#unsaved-banner').hidden && data.tasks.some(t => t.code === 'REMOTE-2'), 'Aggiornamento remoto non perde le impostazioni non salvate');
  $('#discard-settings').click();
  check($('#organization-name').value === organizationName() && $('#unsaved-banner').hidden, 'Bozza scartata dopo la sincronizzazione');
  const originalOrganizationId = activeOrganizationId;
  const created = await workspaceApi.organization('create', { name: 'Organizzazione remota', language: 'it', demo: true }, 'external-client');
  await waitFor(() => organizations.length === 3 && !refreshing);
  check(activeOrganizationId === originalOrganizationId && $('#organization-select').options.length === 3 && created.data.tasks.length > 200 && created.data.issues.length > 0, 'Organizzazione con dati dimostrativi creata altrove compare senza cambiare vista');
  await organizationAction('switch', { id: created.activeOrganizationId });
  check(activeOrganizationId === created.activeOrganizationId && visibleTasks().length < data.tasks.length && data.tasks.some(t => t.hidden), 'Organizzazione dimostrativa navigabile');
  await workspaceApi.organization('delete', { id: created.activeOrganizationId }, 'external-client');
  await waitFor(() => activeOrganizationId !== created.activeOrganizationId && organizations.length === 2 && !refreshing);
  check(organizations.some(o => o.id === activeOrganizationId) && $('#toast').textContent.includes('eliminata in un’altra finestra'), 'Organizzazione eliminata altrove gestita senza perdere la sessione');
  const { baseData, organizationExport } = window.OrbitaCore;
  const chooseImportFile = (content, name) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([typeof content === 'string' ? content : JSON.stringify(content)], name, { type: 'application/json' }));
    $('#organization-file').files = transfer.files;
    $('#organization-file').dispatchEvent(new Event('change'));
  };
  const importDialogOpen = () => $('#modal').open && Boolean($('#organization-import-form'));
  if (activeOrganizationId !== firstOrganizationId) await organizationAction('switch', { id: firstOrganizationId });
  view = 4; render();
  check($('#transfer-panel') && document.querySelectorAll('#transfer-panel [data-export-kind]').length === 4 && $('#organization-file').type === 'file' && $('#transfer-panel').textContent.includes('Esporta configurazione'), 'Sezione esporta e importa per organizzazione nelle impostazioni');
  $('#organization-name').value = 'Bozza esportazione';
  $('#organization-name').dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-export-kind="themes"]').click();
  await waitFor(() => $('#modal').open && $('#discard-switch'));
  check($('#modal-content').textContent.includes('esportazione e importazione usano le impostazioni salvate') && $('#discard-switch').textContent === 'Scarta e continua' && $('#save-switch').textContent === 'Salva e continua', 'Esportazione con impostazioni non salvate chiede di salvarle o scartarle');
  $('#discard-switch').click();
  await waitFor(() => $('#toast').textContent.includes('Temi esportati'));
  check(!$('#modal').open && $('#organization-name').value === organizationName() && $('#unsaved-banner').hidden && /OrbitKanban-[a-z0-9-]+-temi-\d{4}-\d{2}-\d{2}\.json$/.test($('#toast').textContent), 'Bozza scartata e temi esportati in un file dedicato');
  for (const [kind, label] of [['settings', 'configurazione'], ['data', 'dati'], ['organization', 'organizzazione']]) {
    document.querySelector(`[data-export-kind="${kind}"]`).click();
    await waitFor(() => new RegExp(`-${label}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test($('#toast').textContent));
  }
  check($('#toast').textContent.startsWith('Organizzazione esportata:') && !$('#modal').open, 'Configurazione, dati e organizzazione completa esportati in file separati');
  chooseImportFile('{ non è json', 'rotto.json');
  await waitFor(() => $('#toast').classList.contains('error') && $('#toast').textContent.includes('non è un file JSON valido'));
  chooseImportFile({ version: 2, activeOrganizationId: 'x', organizations: [{ id: 'x', name: 'Backup', data: {} }] }, 'backup.json');
  await waitFor(() => $('#toast').textContent.includes('backup completo'));
  check(!$('#modal').open, 'File non validi e backup completi rifiutati con un messaggio chiaro');
  const importSource = baseData('en');
  importSource.settings.statuses[1].name = data.settings.statuses[2].name;
  importSource.tasks = [
    { id: 'smoke-import-1', code: 'IMPORT-1', sequence: 8001, url: '', description: '<p>Attività importata</p>', notes: '', releaseDate: '2026-03-04', statusId: importSource.settings.statuses[1].id, urgencyId: importSource.settings.urgencies[0].id, effortHours: 4, hidden: false },
    { id: 'smoke-import-2', code: 'IMPORT-2', sequence: 8002, url: '', description: '', notes: '', releaseDate: '', statusId: importSource.settings.statuses[3].id, urgencyId: importSource.settings.urgencies[3].id, effortHours: 0, hidden: false }
  ];
  importSource.issues = [{ id: 'smoke-import-issue', code: 'IMPORT-1', incident: 'INC-IMPORT', problem: 'PRB-IMPORT' }];
  const dataFile = organizationExport({ name: 'Sorgente esterna', data: importSource }, 'data', { appVersion: '9.9.9' });
  const sameName = name => option => option.name.trim().toLowerCase() === name.trim().toLowerCase();
  const expectedNamedStatus = data.settings.statuses.find(sameName(data.settings.statuses[2].name)).id;
  const expectedPositionStatus = (data.settings.statuses.find(sameName('Done')) || data.settings.statuses[Math.min(3, data.settings.statuses.length - 1)]).id;
  const expectedPositionUrgency = (data.settings.urgencies.find(sameName('Low')) || data.settings.urgencies[Math.min(3, data.settings.urgencies.length - 1)]).id;
  chooseImportFile(dataFile, 'dati.json');
  await waitFor(importDialogOpen);
  const dataForm = $('#organization-import-form');
  check(!dataForm.elements.themes && !dataForm.elements.settings && dataForm.elements.data.checked && dataForm.elements.destination.value === 'current' && $('#import-name-field').hidden && dataForm.textContent.includes('Sorgente esterna') && dataForm.textContent.includes('v9.9.9') && dataForm.textContent.includes('2 attività'), 'Dialog di importazione mostra origine, versione e solo le parti presenti nel file');
  const tasksBeforeImport = data.tasks.length;
  dataForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.tasks.some(t => t.id === 'smoke-import-2'));
  const importedFirst = data.tasks.find(t => t.id === 'smoke-import-1'), importedSecond = data.tasks.find(t => t.id === 'smoke-import-2');
  check(data.tasks.length === tasksBeforeImport + 2 && importedFirst.statusId === expectedNamedStatus && importedSecond.statusId === expectedPositionStatus && importedSecond.urgencyId === expectedPositionUrgency && matchIssues(importedFirst, data.issues).incidents.includes('INC-IMPORT') && data.tasks.some(t => t.code === 'SMOKE-1') && $('#toast').textContent.includes('Importazione completata'), 'Dati uniti all’organizzazione con stati e urgenze riassociati per nome o posizione');
  const countsBeforeReimport = [data.tasks.length, data.issues.length];
  chooseImportFile(dataFile, 'dati.json');
  await waitFor(importDialogOpen);
  $('#organization-import-form').requestSubmit();
  await waitFor(() => !$('#modal').open && !saving);
  check(data.tasks.length === countsBeforeReimport[0] && data.issues.length === countsBeforeReimport[1], 'Reimportare lo stesso file aggiorna senza duplicare attività o issue');
  const themesBeforeImport = data.settings.themes.length;
  chooseImportFile({ format: 'orbitkanban-organization', version: 1, kind: 'themes', exportedAt: new Date().toISOString(), appVersion, organization: { name: 'Palette condivisa' }, themes: { themeId: 'smoke-imported-theme', themes: [{ id: 'smoke-imported-theme', name: 'Tema importato', background: '#14121f', surface: '#1f1b30', text: '#f4f1ff', accent: '#ff7a59', extra: 'ignorato' }] } }, 'temi.json');
  await waitFor(importDialogOpen);
  const themeForm = $('#organization-import-form');
  check(themeForm.elements.themes.checked && themeForm.elements.activateTheme.checked && !themeForm.elements.data && themeForm.textContent.includes('Attiva il tema «Tema importato»') && themeForm.querySelectorAll('.import-sub .theme-swatches i').length === 4, 'Importazione temi propone di attivare il tema del file con i suoi quattro colori');
  themeForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.settings.themeId === 'smoke-imported-theme');
  check(data.settings.themes.length === themesBeforeImport + 1 && data.settings.themes.find(theme => theme.id === 'smoke-imported-theme').extra === undefined && document.documentElement.style.getPropertyValue('--accent') === '#ff7a59', 'Tema importato aggiunto, attivato e applicato senza campi estranei');
  const fullFile = organizationExport({ name: organizationName(), data }, 'organization', { appVersion });
  check(fullFile.settings.fontSizes.kanban === 120 && fullFile.settings.fontSizes.tables === 100, 'Esportazione completa include le dimensioni del testo');
  const expectedImportedName = `${organizationName()} (2)`;
  chooseImportFile(fullFile, 'organizzazione.json');
  await waitFor(importDialogOpen);
  const fullForm = $('#organization-import-form');
  check(['themes', 'settings', 'data'].every(part => fullForm.elements[part].checked) && fullForm.elements.destination.value === 'new' && fullForm.elements.name.value === expectedImportedName && !$('#import-name-field').hidden && fullForm.elements.logo.checked && fullForm.elements.logo.disabled && $('#import-data-mode').hidden && $('#confirm-import').textContent === 'Crea e importa', 'Organizzazione completa proposta come nuova organizzazione con nome univoco e logo');
  fullForm.querySelector('[name="destination"][value="current"]').click();
  check(!fullForm.elements.logo.checked && !fullForm.elements.logo.disabled && !$('#import-data-mode').hidden && $('#import-name-field').hidden && $('#import-notes').textContent.includes('La configurazione attuale verrà sostituita'), 'Importando nell’organizzazione corrente il logo si sostituisce solo su richiesta');
  fullForm.querySelector('[name="destination"][value="new"]').click();
  const organizationsBeforeImport = organizations.length;
  fullForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !organizationBusy && organizations.length === organizationsBeforeImport + 1);
  const importedOrganizationId = activeOrganizationId;
  check(importedOrganizationId !== firstOrganizationId && organizationName() === expectedImportedName && data.tasks.length === fullFile.data.tasks.length && data.issues.length === fullFile.data.issues.length && data.settings.logo === fullFile.settings.logo && data.settings.themeId === fullFile.themes.themeId && $('.brand-icon img').src === fullFile.settings.logo && $('#toast').textContent.includes('Organizzazione importata'), 'Organizzazione completa importata come nuova con dati, temi, logo e configurazione');
  check(data.settings.fontSizes.kanban === 120 && rootSize('kanban') === '1.2', 'Dimensioni del testo importate con l’organizzazione completa');
  const settingsSource = baseData('en');
  settingsSource.settings.statuses = [{ id: 'smoke-status-a', name: data.settings.statuses[0].name.toUpperCase(), color: '#3366ff', highlight: false }, { id: 'smoke-status-b', name: 'Shipped', color: '#33aa66', highlight: true }];
  settingsSource.settings.tabNames = ['Imported tasks', 'Imported issues', 'Imported milestones', 'Imported board'];
  settingsSource.settings.portalUrlTemplate = 'https://imported.example.com/browse/{codice}';
  settingsSource.settings.logo = secondLogo;
  settingsSource.settings.fontSizes.tables = 110;
  const settingsFile = organizationExport({ name: 'Remote settings', data: settingsSource }, 'settings', { appVersion });
  const firstStatusTasks = data.tasks.filter(t => t.statusId === data.settings.statuses[0].id).map(t => t.id);
  chooseImportFile(settingsFile, 'configurazione.json');
  await waitFor(importDialogOpen);
  const settingsForm = $('#organization-import-form');
  check(settingsForm.elements.settings.checked && settingsForm.elements.destination.value === 'current' && !settingsForm.elements.logo.checked && !settingsForm.elements.logo.disabled && settingsForm.querySelector('.import-logo'), 'Configurazione proposta per l’organizzazione corrente senza sostituire il logo');
  check(/dimensioni del testo|text sizes/.test(settingsForm.textContent), 'Importazione configurazione indica le dimensioni del testo');
  settingsForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.settings.language === 'en');
  check(firstStatusTasks.length > 0 && firstStatusTasks.every(id => data.tasks.find(t => t.id === id).statusId === 'smoke-status-a') && data.tasks.every(t => ['smoke-status-a', 'smoke-status-b'].includes(t.statusId)) && data.settings.logo === fullFile.settings.logo && data.settings.tabNames[0] === 'Imported tasks' && data.settings.portalUrlTemplate === 'https://imported.example.com/browse/{codice}', 'Configurazione importata con stati riassociati e logo invariato');
  check(data.settings.fontSizes.tables === 110 && data.settings.fontSizes.kanban === 100 && rootSize('tables') === '1.1' && rootSize('kanban') === '1', 'Dimensioni del testo sostituite dalla configurazione importata');
  check(document.documentElement.lang === 'en' && $('#current-tab').textContent === 'Settings' && $('#transfer-panel').textContent.includes('Export and import organization') && $('#transfer-panel').textContent.includes('Export everything') && $('#import-organization').textContent.includes('Import from file') && $('#toast').textContent === 'Import completed.', 'Sezione esporta e importa tradotta con la lingua importata');
  check($('#font-size-panel h2').textContent === 'Text size' && $('label[for="font-size-tables"]').textContent === 'Tables' && $('[data-font-preset="130"]').textContent.includes('Extra large') && $('#font-size-tables').value === '110', 'Sezione dimensione del testo tradotta in inglese');
  chooseImportFile(dataFile, 'data.json');
  await waitFor(importDialogOpen);
  const replaceForm = $('#organization-import-form');
  check($('#modal-content .eyebrow').textContent === 'IMPORT' && replaceForm.textContent.includes('What to import') && replaceForm.textContent.includes('Add and update') && replaceForm.textContent.includes('2 tasks') && !replaceForm.textContent.includes('Cosa importare'), 'Dialog di importazione tradotto in inglese');
  replaceForm.querySelector('[name="dataMode"][value="replace"]').click();
  check($('#import-notes').textContent.includes('will be deleted and replaced'), 'Sostituzione di attività e issue segnalata prima di importare');
  replaceForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.tasks.length === 2);
  check(data.tasks.every(t => t.code.startsWith('IMPORT-') && ['smoke-status-a', 'smoke-status-b'].includes(t.statusId)) && data.issues.length === 1, 'Dati sostituiti nell’organizzazione importata');
  await organizationAction('delete', { id: importedOrganizationId });
  if (activeOrganizationId !== firstOrganizationId) await organizationAction('switch', { id: firstOrganizationId });
  check(organizations.length === 2 && !organizations.some(o => o.id === importedOrganizationId) && organizationName() === 'Prima organizzazione con logo' && data.tasks.some(t => t.id === 'smoke-import-1') && data.settings.themeId === 'smoke-imported-theme', 'Organizzazione importata eliminata senza effetti sulle altre');
  check(rootSize('kanban') === '1.2' && rootSize('tables') === '1' && data.settings.fontSizes.kanban === 120, 'Dimensioni del testo separate per organizzazione');
  return { ok: true, checks };
};
async function boot() {
  try {
    if (!window.workspace) throw new Error(t('Avvia l’app con OrbitKanban-Portable.exe oppure npm start, non aprendo direttamente il file HTML.'));
    try { await loadLanguages(); }
    catch (error) { console.error('Lingue non caricate:', error); }
    const loaded = await workspaceApi.load();
    adoptSnapshot(loaded); render(); subscribe();
  } catch (error) {
    $('#content').innerHTML = ui`<section class="fatal-error"><h1>Non riesco ad aprire il workspace</h1><p>${esc(t(error.message))}</p><p>Verifica i permessi di scrittura della cartella e conserva l’archivio esistente prima di intervenire.</p><button class="button" id="retry-load">Riprova</button></section>`;
    $('#retry-load').onclick = boot;
    notify(error.message, true);
  } finally {
    window.workspace?.ready?.();
  }
}
boot();
