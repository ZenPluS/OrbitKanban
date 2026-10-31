'use strict';
const { APP_NAME, validateData, matchIssues, sortTasks, dateColor, extractThemePalette, themeFromLogo, normalizeUrl, isWebUrl, validPortalTemplate, portalUrl, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName, FONT_SIZE_PARTS, FONT_SIZE_STEP, defaultFontSizes, clampFontSize, HIGHLIGHT_LIMIT, defaultTaskColumns, normalizeTaskColumns } = window.OrbitaCore;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
let data, dataFolder, view = 0, search = '', showHidden = false, statusFilter = '', highlightFilter = '', highlighter = '', sort = [{ key: 'releaseDate', direction: 'asc' }];
let settingsDraft, saving = false, organizationBusy = false, organizations = [], activeOrganizationId, lastOpenedLink = '';
let revision = '', appVersion = '', browserUrl = '', online = true, refreshing = false, pendingChange = null, renderAfterModal = false, adoptions = 0, subscribed = false;
let languageInfo = { folder: '', template: '', languages: [], errors: [] };
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
const plain = html => {
  const el = document.createElement('div');
  el.innerHTML = sanitize(html);
  el.querySelectorAll('br').forEach(node => node.replaceWith(' '));
  el.querySelectorAll('p,div,li,blockquote').forEach(node => node.append(' '));
  return el.textContent.replace(/\s+/g, ' ').trim();
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
async function commit(change, organizationName) {
  if (saving || organizationBusy) throw new Error(t('Un salvataggio è già in corso. Riprova tra un istante.'));
  const build = () => {
    if (typeof change !== 'function') return change;
    const next = structuredClone(data);
    change(next);
    return next;
  };
  const organizationId = activeOrganizationId;
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
      next = validateData(build());
      saved = await workspaceApi.save(next, organizationId, organizationName, revision);
    }
    adoptSnapshot(saved);
    $('#save-status').innerHTML = ui`<i class="connection-dot"></i> Tutto salvato in locale`;
  } catch (error) {
    $('#save-status').textContent = t('Salvataggio non riuscito');
    if (error.code === 'missing-organization') pendingChange = { forced: true };
    throw error;
  } finally { saving = false; flushPendingChange(); }
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
function formatDate(date) { return date ? new Date(date + 'T12:00:00').toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) : t('Da pianificare'); }
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
function matchesHighlightFilter(task) {
  if (!highlightFilter) return true;
  if (highlightFilter === '__any') return Boolean(highlightOf(task));
  if (highlightFilter === '__none') return !highlightOf(task);
  return task.highlightId === highlightFilter;
}
function filteredTasks() {
  return data.tasks.filter(t => (showHidden || !t.hidden) && (!statusFilter || t.statusId === statusFilter) && matchesHighlightFilter(t) && (
    !search || [t.code, String(t.sequence), plain(t.description), plain(t.notes), highlightOf(t)?.name || '', ...Object.values(matchIssues(t, data.issues)).flat()].some(v => v.toLowerCase().includes(search.toLowerCase()))
  ));
}
function paintTheme(theme) {
  for (const key of ['background', 'surface', 'text', 'accent']) document.documentElement.style.setProperty(`--${key}`, theme[key]);
  const rgb = theme.background.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  document.documentElement.style.colorScheme = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? 'light' : 'dark';
}
function paintFontSizes(sizes) {
  const values = { ...defaultFontSizes(), ...sizes };
  for (const { id } of FONT_SIZE_PARTS) document.documentElement.style.setProperty(`--fs-${id}`, String(values[id] / 100));
}
function applyTheme() {
  paintTheme(data.settings.themes.find(t => t.id === data.settings.themeId));
  paintFontSizes(data.settings.fontSizes);
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
  const content = $('#content'), nextView = ['tasks', 'issues', 'milestones', 'kanban', 'settings'][view];
  if (content.dataset.workspaceView !== nextView) content.scrollTop = 0;
  content.dataset.workspaceView = nextView;
  applyTheme();
  renderChrome();
  $('#navigation').innerHTML = data.settings.tabNames.map((name, i) => `<button class="nav-button ${view === i ? 'active' : ''}" data-view="${i}"><span class="nav-icon">${icons[i]}</span><span>${esc(name)}</span>${i === 0 ? `<span class="nav-count">${visibleTasks().length}</span>` : ''}</button>`).join('');
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
  data = validateData(snapshot.data);
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
  renderConnectionStatus();
  $('#navigation').setAttribute('aria-label', t('Viste principali'));
  $('.organization-switcher label').textContent = t('Organizzazione');
  $('#manage-organizations').textContent = t('Gestisci organizzazioni');
  $('#organization-select').innerHTML = organizations.map(o => `<option value="${esc(o.id)}" ${o.id === activeOrganizationId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  $('#open-browser').textContent = t(browserMode() ? 'Apri in nuova scheda' : 'Apri nel browser') + ' ↗';
  $('#open-browser').disabled = !browserUrl;
  $('.version').innerHTML = `${browserMode() ? 'BROWSER' : 'PORTABLE'} EDITION <span id="app-version">${esc(appVersion ? `v${appVersion}` : '')}</span>`;
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
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; showHidden = false; sort = [{ key: 'releaseDate', direction: 'asc' }];
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
  return JSON.stringify(collectSettings()) !== JSON.stringify(data.settings) || $('#organization-name').value.trim() !== organizations.find(o => o.id === activeOrganizationId).name;
}
const settingsTabs = [
  { id: 'identity', group: 'Organizzazione', icon: '◉', label: 'Identità & navigazione', panel: 'identity-panel', keys: ['tabNames', 'hoursPerDay', 'logo'] },
  { id: 'languages', group: 'Organizzazione', icon: '文', label: 'Lingua & traduzioni', panel: 'languages-panel', keys: ['language'] },
  { id: 'portal', group: 'Organizzazione', icon: '⇗', label: 'Link al portale', panel: 'portal-panel', keys: ['portalUrlTemplate'] },
  { id: 'organizations', group: 'Organizzazione', icon: '⌂', label: 'Organizzazioni', panel: 'organizations-panel', keys: [] },
  { id: 'themes', group: 'Aspetto', icon: '◐', label: 'Temi & atmosfera', panel: 'themes-panel', keys: ['themes', 'themeId'] },
  { id: 'fonts', group: 'Aspetto', icon: 'Aa', label: 'Dimensione del testo', panel: 'font-size-panel', keys: ['fontSizes'] },
  { id: 'statuses', group: 'Flusso di lavoro', icon: '☰', label: 'Stati del flusso', panel: 'statuses-panel', keys: ['statuses'] },
  { id: 'urgencies', group: 'Flusso di lavoro', icon: '⚑', label: 'Livelli di urgenza', panel: 'urgencies-panel', keys: ['urgencies'] },
  { id: 'highlights', group: 'Flusso di lavoro', icon: '✎', label: 'Evidenziatori', panel: 'highlights-panel', keys: ['highlights'] },
  { id: 'columns', group: 'Flusso di lavoro', icon: '▥', label: 'Colonne della lista', panel: 'columns-panel', keys: ['taskColumns'] },
  { id: 'transfer', group: 'Dati e accesso', icon: '⇅', label: 'Esporta e importa organizzazione', panel: 'transfer-panel', keys: [] },
  { id: 'storage', group: 'Dati e accesso', icon: '▣', label: 'Dati che viaggiano con te', panel: 'storage-panel', keys: [] },
  { id: 'browser', group: 'Dati e accesso', icon: '◍', label: 'Accesso da browser', panel: 'browser-panel', keys: [] }
];
// Ordered: the first matching pattern decides which settings tab holds the field to fix.
const settingsErrorTabs = [[/evidenziatori|highlighter/i, 'highlights'], [/colonne della lista|list columns/i, 'columns'], [/link portale|portal link/i, 'portal'], [/dimensioni del testo|text sizes/i, 'fonts'], [/\b(?:temi|tema|themes?)\b/i, 'themes'], [/urgen/i, 'urgencies'], [/\b(?:stati|status|statuses)\b/i, 'statuses'], [/\b(?:lingua|language)\b/i, 'languages'], [/organizzazione|organization|\btab\b|ore per giorno|hours per day|logo/i, 'identity']];
function settingsNav() {
  const groups = [...new Set(settingsTabs.map(tab => tab.group))];
  return `<nav class="settings-nav" aria-label="${esc(t('Sezioni delle impostazioni'))}">${groups.map((group, index) => `<div class="settings-nav-group" role="group" aria-labelledby="settings-group-${index}"><span class="settings-nav-label" id="settings-group-${index}">${esc(t(group))}</span>${settingsTabs.filter(tab => tab.group === group).map(tab => `<button type="button" class="settings-tab" id="settings-tab-${tab.id}" data-settings-tab="${tab.id}" aria-controls="${tab.panel}"><span class="settings-tab-icon" aria-hidden="true">${tab.icon}</span><span class="settings-tab-text">${esc(t(tab.label))}</span><span class="settings-tab-dot" role="img" aria-label="${esc(t('Modifiche non salvate'))}" title="${esc(t('Modifiche non salvate'))}" hidden></span></button>`).join('')}</div>`).join('')}</nav>`;
}
function showSettingsTab(id, reveal = false) {
  const selected = settingsTabs.find(tab => tab.id === id) || settingsTabs[0];
  settingsTab = selected.id;
  try { sessionStorage.setItem('orbitkanban.settingsTab', selected.id); } catch {}
  for (const tab of settingsTabs) {
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
  $('.settings-nav').addEventListener('keydown', event => {
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
  banner.hidden = !changed;
  const savedName = organizations.find(o => o.id === activeOrganizationId)?.name;
  const dirty = changed ? settingsTabs.filter(tab => tab.keys.some(key => JSON.stringify(settingsDraft[key]) !== JSON.stringify(data.settings[key])) || (tab.id === 'identity' && $('#organization-name').value.trim() !== savedName)) : [];
  for (const tab of settingsTabs) {
    const dot = document.querySelector(`#settings-tab-${tab.id} .settings-tab-dot`);
    if (dot) dot.hidden = !dirty.includes(tab);
  }
  const where = $('#unsaved-where'), key = dirty.map(tab => tab.id).join();
  if (where && where.dataset.key !== key) {
    where.dataset.key = key;
    where.innerHTML = dirty.length ? `${esc(t('Sezioni modificate:'))} ${dirty.map(tab => `<button type="button" class="unsaved-link" data-goto-settings-tab="${tab.id}">${esc(t(tab.label))}</button>`).join(', ')}` : '';
  }
  $('#settings-page')?.style.setProperty('--unsaved-offset', changed ? `${banner.offsetHeight + 12}px` : '0px');
}
async function saveSettings() {
  try {
    if ($('#logo-file')?.disabled || $('#theme-image-file')?.disabled || $('#create-logo-file')?.disabled) throw new Error(t('Caricamento immagine…'));
    const settings = structuredClone(collectSettings());
    const organizationName = $('#organization-name').value.trim();
    if (!organizationName || organizationName.length > 100) throw new Error(t('Nome organizzazione non valido.'));
    await commit(next => {
      next.settings = structuredClone(settings);
      const known = new Set((settings.highlights || []).map(h => h.id));
      for (const task of next.tasks) if (task.highlightId && !known.has(task.highlightId)) task.highlightId = '';
    }, organizationName);
    statusFilter = '';
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
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; showHidden = false; sort = [{ key: 'releaseDate', direction: 'asc' }];
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
  if (event.button !== 0 || $('#modal').open || event.target.closest('button, a, input, select, textarea, [contenteditable]')) return;
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
  effort: { name: 'Effort', sort: 'effortHours' },
  incident: { name: 'Incident' },
  problem: { name: 'Problem' },
  releaseDate: { name: 'Release date', sort: 'releaseDate' },
  notes: { name: 'Note' }
};
const shownColumns = () => normalizeTaskColumns(data.settings.taskColumns).filter(column => column.visible).map(column => column.id);
function sortedRows(tasks) {
  const highlights = highlightsOf();
  const ranked = tasks.map(t => {
    const highlightRank = highlights.findIndex(h => h.id === t.highlightId);
    return { ...t,
      urgencyRank: data.settings.urgencies.findIndex(s => s.id === t.urgencyId),
      statusRank: data.settings.statuses.findIndex(s => s.id === t.statusId),
      highlightRank: highlightRank < 0 ? '' : highlightRank
    };
  });
  const keys = { urgencyId: 'urgencyRank', statusId: 'statusRank', highlightId: 'highlightRank' };
  return sortTasks(ranked, sort.map(s => ({ ...s, key: keys[s.key] || s.key })));
}
function renderTasks() {
  const hidden = data.tasks.filter(t => t.hidden).length, highlights = highlightsOf(), columns = shownColumns();
  if (highlightFilter && !['__any', '__none'].includes(highlightFilter) && !highlights.some(h => h.id === highlightFilter)) highlightFilter = '';
  if (highlighter && highlighter !== 'erase' && !highlights.some(h => h.id === highlighter)) highlighter = '';
  if (highlighter === 'erase' && !highlights.length) highlighter = '';
  const sortable = columns.map(id => taskColumnDefs[id].sort).filter(Boolean);
  sort = sort.filter(s => sortable.includes(s.key));
  if (!sort.length) sort = [{ key: 'releaseDate', direction: 'asc' }];
  const highlightOptions = [['', 'Tutte le evidenziazioni'], ['__any', 'Solo evidenziate'], ['__none', 'Senza evidenziazione']].map(([value, label]) => `<option value="${value}" ${value === highlightFilter ? 'selected' : ''}>${esc(t(label))}</option>`).join('') +
    highlights.map(h => `<option value="${esc(h.id)}" ${h.id === highlightFilter ? 'selected' : ''}>● ${esc(h.name)}</option>`).join('');
  const headers = columns.map(id => {
    const def = taskColumnDefs[id], label = esc(def.header || t(def.name)), current = def.sort && sort.find(s => s.key === def.sort);
    const title = def.header ? ` title="${esc(t(def.name))}"` : '';
    return `<th data-column="${id}"${title}>${def.sort ? ui`<button data-sort="${def.sort}" title="Clic per ordinare; Maiusc+clic per ordinamento multiplo">${label} <span>${current ? (current.direction === 'asc' ? '↑' : '↓') + (sort.length > 1 ? sort.indexOf(current) + 1 : '') : '↕'}</span></button>` : label}</th>`;
  }).join('');
  $('#content').innerHTML = heading(data.settings.tabNames[0], 'Tutte le attività, una direzione. Pianifica il lavoro e tieni a fuoco le prossime release.',
    ui`<button class="button primary" id="new-task">＋ Nuova attività</button>`) + stats() +
    ui`<section class="panel"><div class="table-toolbar"><div class="search-wrap"><span>⌕</span><input id="search" aria-label="Cerca attività" placeholder="Cerca codice, descrizione, incident…" value="${esc(search)}"></div><div class="filters"><select id="status-filter" aria-label="Filtra stato">${optionList(data.settings.statuses, statusFilter, 'Tutti gli stati')}</select><select id="highlight-filter" aria-label="Filtra evidenziazione">${highlightOptions}</select><label class="toggle-label"><input id="show-hidden" type="checkbox" ${showHidden ? 'checked' : ''}> Nascoste <span class="tiny-count">${hidden}</span></label><button class="button subtle" id="columns-button" aria-haspopup="dialog" title="Scegli quali colonne mostrare e in che ordine">▥ Colonne</button><button class="button subtle" id="reset-sort" title="Ripristina ordinamento release crescente">↕ Release</button></div></div><div class="highlighter-bar"></div><div class="table-scroll"><table class="activity-table"><thead><tr>${headers}<th><span class="sr-only">Azioni</span></th></tr></thead><tbody id="task-rows"></tbody></table></div><div class="table-footer"><span id="row-count"></span><span>Maiusc + clic su una colonna per ordinare su più livelli</span></div></section><div class="hint"><span>✧</span> Un unico archivio, quattro prospettive. Issue, milestone e kanban si aggiornano automaticamente.</div>`;
  drawHighlighter();
  drawTaskRows();
  $('#new-task').onclick = () => taskDialog();
  $('#search').oninput = event => { search = event.target.value; drawTaskRows(); };
  $('#status-filter').onchange = event => { statusFilter = event.target.value; drawTaskRows(); };
  $('#highlight-filter').onchange = event => { highlightFilter = event.target.value; drawTaskRows(); };
  $('#show-hidden').onchange = event => { showHidden = event.target.checked; drawTaskRows(); };
  $('#columns-button').onclick = () => columnsDialog();
  $('#reset-sort').onclick = () => { sort = [{ key: 'releaseDate', direction: 'asc' }]; renderTasks(); };
  document.querySelectorAll('[data-sort]').forEach(button => button.onclick = event => {
    const key = button.dataset.sort, old = sort.find(s => s.key === key);
    const entry = { key, direction: old?.direction === 'asc' ? 'desc' : 'asc' };
    sort = event.shiftKey ? [...sort.filter(s => s.key !== key), entry] : [entry];
    renderTasks();
  });
  // While a highlighter is active, a click anywhere on a row colors it instead of opening links or the task.
  $('#task-rows').addEventListener('click', event => {
    const row = highlighter && event.target.closest('tr[data-task-row]');
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    paintRow(row);
  }, true);
}
function taskCell(column, task, status, urgency, links) {
  const none = '<span class="muted">—</span>';
  switch (column) {
    case 'sequence': return `<td class="sequence">${task.sequence}</td>`;
    case 'code': return `<td><button class="code-link" data-edit-task="${task.id}">${esc(task.code)}</button>${portalAnchor(portalUrl(task, data.settings), task.code)}</td>`;
    case 'link': {
      const url = portalUrl(task, data.settings);
      return `<td class="link-cell">${url ? `<a class="portal-link" href="${esc(url)}" data-open-url title="${esc(t('Apri nel browser predefinito') + ': ' + url)}">${esc(url.replace(/^https?:\/\//i, ''))}</a>` : none}</td>`;
    }
    case 'description': return `<td class="description-col"><button class="description-cell" data-edit-task="${task.id}">${esc(plain(task.description) || t('Senza descrizione'))}</button></td>`;
    case 'urgency': return `<td>${pill(urgency.name, urgency.color)}</td>`;
    case 'status': return `<td>${pill(status.name, status.color, 'status-pill')}</td>`;
    case 'highlight': { const mark = highlightOf(task); return `<td>${mark ? pill(mark.name, mark.color, 'mark-pill') : none}</td>`; }
    case 'effort': return `<td class="effort-cell">${effort(task.effortHours)}</td>`;
    case 'incident': return `<td class="references">${links.incidents.map(esc).join('<br>') || none}</td>`;
    case 'problem': return `<td class="references">${links.problems.map(esc).join('<br>') || none}</td>`;
    case 'releaseDate': return `<td><span class="date-pill" style="--date:${task.releaseDate ? dateColor(task.releaseDate) : '#929bb2'}">◷ ${formatDate(task.releaseDate)}</span></td>`;
    case 'notes': return `<td><button class="notes-button ${plain(task.notes) ? 'has-notes' : ''}" data-edit-task="${task.id}" title="${esc(plain(task.notes) || t('Aggiungi note'))}">☰</button></td>`;
    default: return '<td></td>';
  }
}
function drawTaskRows() {
  const tasks = sortedRows(filteredTasks()), columns = shownColumns();
  $('#task-rows').innerHTML = tasks.map(task => {
    const status = data.settings.statuses.find(s => s.id === task.statusId), urgency = data.settings.urgencies.find(s => s.id === task.urgencyId);
    const links = matchIssues(task, data.issues), mark = highlightOf(task);
    const classes = [status.highlight ? 'highlighted' : '', mark ? 'marked' : '', task.hidden ? 'hidden-row' : ''].filter(Boolean).join(' ');
    const markLabel = mark ? fillText('Evidenziazione: {0}', mark.name) : t('Evidenzia riga');
    return `<tr data-task-row="${esc(task.id)}" title="${esc(t('Doppio clic sulla riga per modificare.'))}" class="${classes}" style="--row-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}">${columns.map(column => taskCell(column, task, status, urgency, links)).join('')}<td class="row-actions"><button type="button" class="icon-button mark-button ${mark ? 'is-marked' : ''}" data-mark-task="${esc(task.id)}" title="${esc(markLabel)}" aria-label="${esc(markLabel)}" aria-haspopup="menu" aria-expanded="false"><i class="mark-dot"></i></button><button class="icon-button" data-toggle-task="${task.id}" title="${esc(t(task.hidden ? 'Mostra attività' : 'Nascondi attività'))}">${task.hidden ? '◉' : '◌'}</button><button class="icon-button" data-edit-task="${task.id}" title="${esc(t('Modifica attività'))}">⋯</button></td></tr>`;
  }).join('') || `<tr><td colspan="${columns.length + 1}" class="empty">${esc(t('Nessuna attività trovata. Crea una nuova attività o modifica i filtri.'))}</td></tr>`;
  $('#row-count').textContent = ui`${tasks.length} attività mostrate · ${data.tasks.length} totali`;
  document.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => taskDialog(data.tasks.find(t => t.id === b.dataset.editTask)));
  document.querySelectorAll('[data-toggle-task]').forEach(b => b.onclick = action(async () => {
    const id = b.dataset.toggleTask, hidden = !data.tasks.find(t => t.id === id).hidden;
    await commit(next => { const task = next.tasks.find(t => t.id === id); if (task) task.hidden = hidden; }); render();
  }));
  document.querySelectorAll('[data-mark-task]').forEach(b => b.onclick = () => openMarkMenu(b));
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
function columnEditor(container, columns) {
  const draw = focus => {
    container.innerHTML = `<ol class="column-editor">${columns.map((column, index) => {
      const def = taskColumnDefs[column.id], name = t(def.name);
      return `<li class="column-row ${column.visible ? '' : 'is-off'}"><span class="order-number">${String(index + 1).padStart(2, '0')}</span><label class="column-toggle"><input type="checkbox" data-column-visible="${column.id}" ${column.visible ? 'checked' : ''}><span>${esc(name)}</span></label>${def.sort ? `<span class="column-tag" title="${esc(t('Clic sull’intestazione per ordinare'))}">↕ ${esc(t('Ordinabile'))}</span>` : ''}<button type="button" class="icon-button" data-column-move="${column.id}:-1" ${index === 0 ? 'disabled' : ''} title="${esc(t('Sposta su'))}" aria-label="${esc(`${t('Sposta su')}: ${name}`)}">↑</button><button type="button" class="icon-button" data-column-move="${column.id}:1" ${index === columns.length - 1 ? 'disabled' : ''} title="${esc(t('Sposta giù'))}" aria-label="${esc(`${t('Sposta giù')}: ${name}`)}">↓</button></li>`;
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
  draw();
}
function columnsDialog() {
  const columns = normalizeTaskColumns(data.settings.taskColumns);
  openModal(`<div class="modal-heading"><div><div class="eyebrow">${esc(t('ATTIVITÀ'))}</div><h2>${esc(t('Colonne della lista'))}</h2></div><button type="button" class="icon-button" data-close aria-label="${esc(t('Chiudi'))}">✕</button></div><p class="section-description">${esc(t('Spunta le colonne da mostrare e usa le frecce per cambiarne l’ordine. Nascondere una colonna non cancella i dati.'))}</p><div id="columns-dialog-editor"></div><div class="modal-actions"><button type="button" class="button" id="columns-default">${esc(t('Ripristina predefinite'))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(t('Annulla'))}</button><button type="button" class="button primary" id="columns-apply">${esc(t('Applica'))}</button></div>`);
  const container = $('#columns-dialog-editor');
  columnEditor(container, columns);
  $('#columns-default').onclick = () => { columns.splice(0, columns.length, ...defaultTaskColumns()); columnEditor(container, columns); };
  $('#columns-apply').onclick = action(async () => {
    await commit(next => { next.settings.taskColumns = structuredClone(columns); });
    $('#modal').close();
    rerenderPreservingView();
    notify('Colonne aggiornate.');
  });
}
function openModal(html) {
  $('#modal-content').innerHTML = html;
  $('#modal').showModal();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('#modal').close());
}
function editor(id, label, html) {
  return ui`<div class="field full"><span class="field-label" id="${id}-label">${t(label)}</span><div class="rich-editor"><div class="rich-toolbar" data-editor="${id}"><button type="button" data-command="bold" title="Grassetto"><b>B</b></button><button type="button" data-command="italic" title="Corsivo"><i>I</i></button><button type="button" data-command="underline" title="Sottolineato"><u>U</u></button><button type="button" data-command="insertUnorderedList" title="Elenco puntato">• Elenco</button><button type="button" data-command="insertOrderedList" title="Elenco numerato">1. Elenco</button><button type="button" data-command="removeFormat" title="Rimuovi formattazione">Tx</button></div><div id="${id}" class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-label">${sanitize(html)}</div></div></div>`;
}
function wireEditors() {
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
function taskDialog(existing) {
  const t = existing || {
    id: uid(), code: '', sequence: Math.max(0, ...data.tasks.map(t => t.sequence)) + 1, url: '', description: '',
    statusId: data.settings.statuses[0].id, urgencyId: data.settings.urgencies[Math.min(2, data.settings.urgencies.length - 1)].id,
    effortHours: 0, releaseDate: '', notes: '', hidden: false, highlightId: ''
  };
  const days = Math.floor(t.effortHours / data.settings.hoursPerDay), hours = Math.round((t.effortHours - days * data.settings.hoursPerDay) * 100) / 100;
  openModal(ui`<form id="task-form"><div class="modal-heading"><div><div class="eyebrow">ATTIVITÀ</div><h2>${tr(existing ? 'Modifica attività' : 'Una nuova direzione')}</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">✕</button></div><div class="form-grid">
    <label class="field">Codice portale *<input name="code" required maxlength="200" value="${esc(t.code)}" placeholder="es. PRJ-1042"></label>
    <label class="field">Progressivo *<input name="sequence" type="number" min="0" step="1" required value="${t.sequence}"></label>
    <div class="field full portal-field"><label for="task-url">Link specifico (facoltativo)</label><input id="task-url" name="url" inputmode="url" spellcheck="false" autocomplete="off" maxlength="2000" value="${esc(t.url)}"><small id="portal-link-preview" aria-live="polite"></small></div>
    ${editor('description-editor', 'Descrizione', t.description)}
    <label class="field">Urgenza<select name="urgencyId">${optionList(data.settings.urgencies, t.urgencyId)}</select></label>
    <label class="field">Stato<select name="statusId">${optionList(data.settings.statuses, t.statusId)}</select></label>
    <label class="field">Effort in giorni<input name="days" type="number" min="0" step="0.01" value="${days}"></label>
    <label class="field">Effort in ore aggiuntive<input name="hours" type="number" min="0" step="0.01" value="${hours}"><small>${esc(fillText('1 giorno = {0} ore', data.settings.hoursPerDay))}</small></label>
    <label class="field">Release date<input name="releaseDate" type="date" value="${esc(t.releaseDate)}"></label>
    <label class="field">Evidenziazione<select name="highlightId">${optionList(highlightsOf(), currentMark(t), 'Nessuna evidenziazione')}</select><small>Colora la riga nella lista attività. I colori si gestiscono in Impostazioni › Evidenziatori.</small></label>
    <label class="field full checkbox-field"><input type="checkbox" name="hidden" ${t.hidden ? 'checked' : ''}> Nascondi solo dalla lista attività (resta visibile in milestone e kanban)</label>
    <div class="auto-match full" id="match-preview"></div>
    ${editor('notes-editor', 'Note', t.notes)}
    </div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-task">Elimina</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button type="submit" class="button primary">Salva attività</button></div></form>`);
  const form = $('#task-form');
  const updateMatches = () => {
    const links = matchIssues({ code: form.elements.code.value }, data.issues);
    $('#match-preview').innerHTML = ui`<span>⌘ Collegamento automatico dal codice portale</span><div>Incident: <strong>${esc(links.incidents.join(', ') || '—')}</strong> &nbsp; Problem: <strong>${esc(links.problems.join(', ') || '—')}</strong></div>`;
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
      hidden: fields.has('hidden'), highlightId: fields.get('highlightId') || ''
    };
    pendingMarks.delete(item.id);
    await commit(next => {
      const index = next.tasks.findIndex(x => x.id === item.id);
      if (index >= 0) next.tasks[index] = item; else next.tasks.push(item);
    });
    $('#modal').close(); render(); notify('Attività salvata.');
  });
  if (existing) $('#delete-task').onclick = () => confirmDialog('Eliminare questa attività?', `${t.code} sarà eliminata definitivamente. Le associazioni issue resteranno disponibili.`, async () => {
    await commit(next => { next.tasks = next.tasks.filter(x => x.id !== t.id); }); render(); notify('Attività eliminata.');
  });
}
function confirmDialog(title, message, callback) {
  if ($('#modal').open) $('#modal').close();
  openModal(ui`<div class="modal-heading"><h2>${esc(t(title))}</h2></div><p class="confirm-message">${esc(t(message))}</p><div class="modal-actions"><span class="spacer"></span><button class="button" data-close>Annulla</button><button class="button danger" id="confirm-action">Conferma</button></div>`);
  $('#confirm-action').onclick = action(async () => { await callback(); $('#modal').close(); });
}
function renderIssues() {
  $('#content').innerHTML = heading(data.settings.tabNames[1], 'Collega il lavoro alla sua origine. Più incident possono condividere lo stesso problem.', ui`<button class="button primary" id="new-issue">＋ Nuova associazione</button>`) +
    ui`<div class="info-banner">⌘ &nbsp; Incident e problem vengono riportati automaticamente sulle attività con lo stesso codice portale, senza distinzione tra maiuscole e minuscole.</div><section class="panel"><div class="table-toolbar"><strong>${data.issues.length} associazioni</strong><input id="issue-search" class="issue-search" placeholder="Cerca codice, incident o problem…" aria-label="Cerca associazioni"></div><div class="table-scroll"><table><thead><tr><th>Codice portale</th><th>Incident</th><th>Problem</th><th>Collegamento</th><th>Azioni</th></tr></thead><tbody id="issue-rows"></tbody></table></div></section>`;
  function rows(query = '') {
    const issues = data.issues.filter(i => [i.code, i.incident, i.problem].some(v => v.toLowerCase().includes(query.toLowerCase())));
    $('#issue-rows').innerHTML = issues.map(i => {
      const count = data.tasks.filter(t => t.code.trim().toUpperCase() === i.code.trim().toUpperCase()).length;
      return ui`<tr data-issue-row="${esc(i.id)}" title="Doppio clic sulla riga per modificare."><td><button class="code-link" data-issue="${i.id}">${esc(i.code)}</button></td><td>${esc(i.incident) || '—'}</td><td>${pill(i.problem || '—', '#9d8de8')}</td><td><span class="${count ? 'linked' : 'muted'}">${count ? ui`↗ ${count} attività collegate` : t('In attesa di attività')}</span></td><td><button class="button small" data-issue="${i.id}">Modifica</button></td></tr>`;
    }).join('') || ui`<tr><td colspan="5" class="empty">Nessuna associazione. Aggiungi un codice portale con incident e/o problem.</td></tr>`;
    document.querySelectorAll('[data-issue]').forEach(b => b.onclick = () => issueDialog(data.issues.find(i => i.id === b.dataset.issue)));
  }
  rows(); $('#issue-search').oninput = e => rows(e.target.value);
  $('#new-issue').onclick = () => issueDialog();
}
function issueDialog(existing) {
  const issue = existing || { id: uid(), code: '', incident: '', problem: '' };
  openModal(ui`<form id="issue-form"><div class="modal-heading"><h2>${t(existing ? 'Modifica associazione' : 'Nuova associazione')}</h2><button class="icon-button" type="button" data-close aria-label="Chiudi">✕</button></div><div class="form-grid">
    <label class="field full">Codice portale *<input name="code" required value="${esc(issue.code)}" list="task-codes"><datalist id="task-codes">${[...new Set(data.tasks.map(t => t.code))].map(code => `<option value="${esc(code)}">`).join('')}</datalist></label>
    <label class="field">Incident<input name="incident" value="${esc(issue.incident)}" placeholder="INC-00001"></label><label class="field">Problem<input name="problem" value="${esc(issue.problem)}" placeholder="PRB-00001"></label>
    <p class="muted full">Specificare almeno un incident o un problem. Puoi riutilizzare i codici in più associazioni.</p></div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-issue">Elimina</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Annulla</button><button class="button primary" type="submit">Salva associazione</button></div></form>`);
  $('#issue-form').onsubmit = action(async e => {
    e.preventDefault();
    const fields = new FormData(e.target);
    const item = { id: issue.id, code: fields.get('code').trim(), incident: fields.get('incident').trim(), problem: fields.get('problem').trim() };
    await commit(next => {
      const index = next.issues.findIndex(i => i.id === item.id);
      if (index < 0) next.issues.push(item); else next.issues[index] = item;
    });
    $('#modal').close(); render(); notify('Associazione salvata. Attività aggiornate.');
  });
  if (existing) $('#delete-issue').onclick = () => confirmDialog('Eliminare l’associazione?', 'I relativi incident e problem non appariranno più nelle attività, a meno che esistano altre associazioni.', async () => {
    await commit(next => { next.issues = next.issues.filter(i => i.id !== issue.id); }); render();
  });
}
function miniTask(t, readOnly = false) {
  const status = data.settings.statuses.find(s => s.id === t.statusId), urgency = data.settings.urgencies.find(s => s.id === t.urgencyId), mark = highlightOf(t);
  return `<article class="task-card ${t.hidden ? 'is-hidden' : ''} ${mark ? 'is-marked' : ''}" style="--card-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><div class="card-top">${readOnly ? `<strong class="code-label">${esc(t.code)}</strong>` : `<button class="code-link" data-card="${t.id}">${esc(t.code)}</button>`}${portalAnchor(portalUrl(t, data.settings), t.code, 'external-link card-portal-link')}<span class="card-sequence">${t.hidden ? `<span class="hidden-badge" title="${esc(tr('Nascosta dalla lista attività'))}">◌ ${tr('Nascosta in lista')}</span>` : ''}#${t.sequence}</span></div><div class="card-title">${esc(plain(t.description) || tr('Senza descrizione'))}</div><div class="card-meta">${pill(urgency.name, urgency.color)}<span>${effort(t.effortHours)}</span>${mark ? `<span class="mark-chip" title="${esc(tr('Evidenziazione'))}">${esc(mark.name)}</span>` : ''}</div><div class="card-bottom"><span style="color:${t.releaseDate ? dateColor(t.releaseDate) : 'inherit'}">◷ ${formatDate(t.releaseDate)}</span>${!readOnly ? pill(status.name, status.color) : ''}</div></article>`;
}
function renderMilestones() {
  const tasks = data.tasks, dates = [...new Set(tasks.map(t => t.releaseDate).filter(Boolean))].sort();
  if (tasks.some(t => !t.releaseDate)) dates.push('');
  $('#content').innerHTML = heading(data.settings.tabNames[2], 'Ogni release è una tappa. Le date e le attività si allineano automaticamente.', ui`<span class="view-label">${dates.filter(Boolean).length} milestone · ${tasks.length} attività</span>`) +
    ui`<div class="milestone-shell"><div class="milestone-scroll"><div class="milestone-track">${dates.map((date, index) => {
      const group = tasks.filter(t => t.releaseDate === date), color = date ? dateColor(date) : '#929bb2';
      return ui`<section class="milestone-column" style="--milestone:${color}"><div class="timeline-label">${date ? ui`TAPPA ${String(index + 1).padStart(2, '0')}` : 'BACKLOG'}</div><div class="timeline-line"><span>◆</span></div><div class="milestone-heading"><h2>${formatDate(date)}</h2><span>${group.length} attività · ${effort(group.reduce((sum, t) => sum + t.effortHours, 0))}</span></div><div class="milestone-cards">${sortedRows(group).map(t => miniTask(t)).join('')}</div></section>`;
    }).join('') || ui`<div class="empty">Aggiungi attività e release date per costruire la tua roadmap.</div>`}</div></div></div><div class="hint">↔ Scorri in orizzontale per esplorare le release e in verticale per tutte le attività. La stessa data mantiene lo stesso colore in ogni vista.</div>`;
  document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => taskDialog(data.tasks.find(t => t.id === b.dataset.card)));
}
function renderKanban() {
  const tasks = data.tasks;
  $('#content').innerHTML = heading(data.settings.tabNames[3], 'Una vista di sola lettura, sempre allineata alle attività. Ogni stato trova il suo spazio.', ui`<span class="readonly-badge">◈ Sola lettura</span>`) +
    ui`<div class="kanban-scroll"><div class="kanban-board">${data.settings.statuses.map(status => {
      const items = sortTasks(tasks.filter(t => t.statusId === status.id));
      return `<section class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${esc(status.name)}</span><b>${items.length}</b></div><div class="kanban-cards">${items.map(t => miniTask(t, true)).join('') || ui`<div class="kanban-empty">Spazio alle prossime attività</div>`}</div></section>`;
    }).join('')}</div></div><div class="hint">◈ Per modificare uno stato usa la lista attività. L’ordine delle colonne si configura nelle impostazioni.</div>`;
}
const exportKinds = [['themes', '◐', 'Esporta temi'], ['settings', '⚙', 'Esporta configurazione'], ['data', '▤', 'Esporta dati'], ['organization', '◈', 'Esporta tutto']];
const exportedMessages = { themes: 'Temi esportati:', settings: 'Configurazione esportata:', data: 'Dati esportati:', organization: 'Organizzazione esportata:' };
const importKindNames = { themes: 'Temi', settings: 'Configurazione', data: 'Dati', organization: 'Organizzazione completa' };
const fillText = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), t(text));
function transferPanel() {
  const settings = data.settings, activeTheme = settings.themes.find(theme => theme.id === settings.themeId);
  const details = {
    themes: `${plural(settings.themes.length, 'tema')} · ${fillText('attivo: {0}', esc(activeTheme.name))}`,
    settings: `${plural(settings.statuses.length, 'stato')} · ${plural(settings.urgencies.length, 'urgenza')} · ${plural((settings.highlights || []).length, 'evidenziatore')} · ${t(settings.logo ? 'lingua, link, tab, colonne, dimensioni del testo e logo' : 'lingua, link, tab, colonne e dimensioni del testo')}`,
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
    file.settings && part('settings', 'Configurazione', esc(t(file.settings.highlights ? 'Lingua, link al portale, nomi delle tab, ore per giorno, dimensioni del testo, stati, urgenze, evidenziatori e colonne della lista. Sostituisce la configurazione attuale.' : file.settings.fontSizes ? 'Lingua, link al portale, nomi delle tab, ore per giorno, dimensioni del testo, stati e urgenze. Sostituisce la configurazione attuale.' : 'Lingua, link al portale, nomi delle tab, ore per giorno, stati e urgenze. Sostituisce la configurazione attuale.')),
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
  const presets = fontPresets.map(([value, name]) => `<button type="button" class="button small font-preset" data-font-preset="${value}" aria-pressed="false">${esc(t(name))} <small>${value}%</small></button>`).join('');
  const cards = FONT_SIZE_PARTS.map(({ id, min, max }) => {
    const [name, description] = fontSizeLabels[id], value = sizes[id] ?? 100, reset = t('Ripristina 100%');
    return `<div class="font-size-card" data-font-card="${id}"><div class="font-size-title"><label for="font-size-${id}">${esc(t(name))}</label><small id="font-size-${id}-hint">${esc(t(description))}</small></div><div class="font-size-control"><span class="font-size-limit" aria-hidden="true">${min}%</span><input type="range" id="font-size-${id}" data-font-size="${id}" min="${min}" max="${max}" step="${FONT_SIZE_STEP}" value="${value}" aria-describedby="font-size-${id}-hint"><span class="font-size-limit" aria-hidden="true">${max}%</span><output class="font-size-value" id="font-size-${id}-value" for="font-size-${id}">${value}%</output><button type="button" class="icon-button font-size-reset" data-font-reset="${id}" title="${esc(reset)}" aria-label="${esc(`${reset}: ${t(name)}`)}">↺</button></div><div class="font-sample" data-part="${id}" inert aria-hidden="true">${fontSample(id, task)}</div></div>`;
  }).join('');
  return ui`<section class="panel settings-section full" id="font-size-panel"><div class="font-size-heading"><div><h2>Dimensione del testo</h2><p class="section-description">Regola il testo di ogni parte dell’app: l’anteprima è immediata in tutta l’interfaccia, salva per mantenerla. Minimi e massimi mantengono tutto leggibile e ordinato.</p></div><div class="font-presets" role="group" aria-label="Preimpostazioni">${presets}</div></div><div class="font-size-grid">${cards}<div class="font-size-card font-size-notes"><h3>Buono a sapersi</h3><ul><li>100% è la dimensione consigliata; le preimpostazioni regolano tutte le parti insieme.</li><li>Ogni parte ha un minimo e un massimo, a passi del 5%: l’interfaccia resta sempre utilizzabile.</li><li>Le dimensioni valgono solo per questa organizzazione e sono incluse nell’esportazione della configurazione.</li></ul></div></div></section>`;
}
function wireFontSizes() {
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
function renderSettings() {
  settingsDraft = structuredClone(data.settings);
  settingsDraft.highlights ??= [];
  settingsDraft.taskColumns = normalizeTaskColumns(settingsDraft.taskColumns);
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
    <section class="panel settings-section" id="columns-panel"><h2>Colonne della lista</h2><p class="section-description">Scegli quali colonne mostrare nella lista attività e in che ordine. Nascondere una colonna non cancella i dati. Puoi farlo anche dal pulsante “Colonne” sopra la tabella.</p><div id="columns-editor"></div><button type="button" class="button" id="reset-columns">↺ Ripristina colonne predefinite</button></section>
    <section class="panel settings-section full" id="browser-panel"><h2>Accesso da browser</h2><p class="section-description">Mentre OrbitKanban è aperto puoi lavorare anche dal browser di questo PC, con più organizzazioni in schede diverse. Le modifiche si sincronizzano in tempo reale tra app e schede.</p><code class="data-path" id="browser-url">${esc(browserUrl || t('Non disponibile'))}</code><div class="storage-actions"><button class="button" id="browser-open" ${browserUrl ? '' : 'disabled'}>${t(browserMode() ? 'Apri in nuova scheda' : 'Apri nel browser')} ↗</button><button class="button" id="browser-copy" ${browserUrl ? '' : 'disabled'}>${t(browserMode() ? 'Copia indirizzo' : 'Copia link di accesso')}</button></div><p class="muted">${t(browserMode() ? 'Stai usando OrbitKanban dal browser: l’app sul PC deve restare aperta. Ogni scheda può mostrare un’organizzazione diversa.' : 'Raggiungibile solo da questo computer (127.0.0.1) e protetto da una chiave personale: il link di accesso contiene la chiave, non condividerlo. Chiudendo l’app le schede del browser si disconnettono.')}</p></section>
    ${transferPanel()}<section class="panel settings-section full" id="storage-panel"><div class="storage-heading"><div><h2>Dati che viaggiano con te</h2><p class="section-description">Archivio JSON locale e copia automatica del salvataggio precedente.</p></div><span class="readonly-badge">100% LOCALE</span></div><code class="data-path">${esc(dataFolder)}</code><div class="storage-actions"><button class="button" id="export-data">↗ Esporta backup</button><button class="button" id="import-data">↙ Importa backup</button><button class="button" id="open-folder">Apri cartella dati</button><span class="spacer"></span><button class="button danger" id="clear-data">Svuota attività e issue</button></div><p class="muted">Per condividere l’app chiudila e copia l’eseguibile insieme alla cartella data.     Non eseguire contemporaneamente copie che condividono la stessa cartella dati.</p></section></div></div></div>`;
      showSettingsTab(settingsTab); wireSettingsNav();
      drawOptionLists(); drawThemes(); drawLogoPreview(); wireOrganizationCreation(); drawPortalPreview(); wireFontSizes(); wireLanguages();
      columnEditor($('#columns-editor'), settingsDraft.taskColumns);
      $('#reset-columns').onclick = () => { settingsDraft.taskColumns.splice(0, settingsDraft.taskColumns.length, ...defaultTaskColumns()); columnEditor($('#columns-editor'), settingsDraft.taskColumns); };
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
    await saveSettings(); render(); notify('Impostazioni salvate.');
  });
  $('#discard-settings').onclick = () => { render(); notify('Modifiche annullate.'); };
  $('#export-data').onclick = action(async () => { if (await workspaceApi.exportData()) notify('Backup esportato.'); });
  $('#import-data').onclick = action(async () => {
    const imported = await workspaceApi.importData();
    if (imported) { adoptSnapshot(imported); search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; showHidden = false; render(); notify('Archivio importato.'); }
  });
  $('#open-folder').onclick = action(() => workspaceApi.openDataFolder());
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
function drawOptionLists() {
  for (const key of ['statuses', 'urgencies', 'highlights']) {
    const usage = id => `<span class="option-usage" title="${esc(t('Righe con questo colore'))}">${esc(plural(data.tasks.filter(task => task.highlightId === id).length, 'attività'))}</span>`;
    document.getElementById(`${key}-list`).innerHTML = settingsDraft[key].map((item, index) => ui`<div class="option-row"><span class="order-number">${String(index + 1).padStart(2, '0')}</span><input type="color" aria-label="Colore ${esc(item.name)}" data-color="${key}:${item.id}" value="${item.color}"><input class="option-name" aria-label="Nome opzione" ${key === 'highlights' ? 'maxlength="60"' : ''} data-option-name="${key}:${item.id}" value="${esc(item.name)}">${key === 'highlights' ? usage(item.id) : ''}${key === 'statuses' ? ui`<button class="icon-button star ${item.highlight ? 'selected' : ''}" data-highlight="${item.id}" title="Evidenzia le attività con questo stato" aria-pressed="${item.highlight}">★</button>` : ''}<button class="icon-button" data-move="${key}:${item.id}:-1" ${index === 0 ? 'disabled' : ''} title="Sposta su">↑</button><button class="icon-button" data-move="${key}:${item.id}:1" ${index === settingsDraft[key].length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button><button class="icon-button delete-option" data-remove="${key}:${item.id}" title="Elimina opzione">×</button></div>`).join('') || (key === 'highlights' ? `<p class="muted option-empty">${esc(t('Nessun colore: aggiungine uno per usare l’evidenziatore.'))}</p>` : '');
  }
  function itemAt(value) { const [key, id] = value.split(':'); return settingsDraft[key].find(x => x.id === id); }
  document.querySelectorAll('[data-color]').forEach(input => input.oninput = () => { itemAt(input.dataset.color).color = input.value; });
  document.querySelectorAll('[data-option-name]').forEach(input => input.oninput = () => { itemAt(input.dataset.optionName).name = input.value; });
  document.querySelectorAll('[data-highlight]').forEach(b => b.onclick = () => {
    const item = settingsDraft.statuses.find(s => s.id === b.dataset.highlight); item.highlight = !item.highlight; drawOptionLists();
  });
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
    const [key, id, offset] = b.dataset.move.split(':'), list = settingsDraft[key], index = list.findIndex(x => x.id === id);
    [list[index], list[index + Number(offset)]] = [list[index + Number(offset)], list[index]]; drawOptionLists();
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    const [key, id] = b.dataset.remove.split(':');
    if (key === 'highlights') { settingsDraft.highlights = settingsDraft.highlights.filter(x => x.id !== id); drawOptionLists(); return; }
    const field = key === 'statuses' ? 'statusId' : 'urgencyId';
    if (settingsDraft[key].length === 1) { notify('Deve restare almeno un’opzione.', true); return; }
    if (data.tasks.some(t => t[field] === id)) { notify('Questa opzione è usata da alcune attività, anche nascoste. Riassegnale prima di eliminarla.', true); return; }
    settingsDraft[key] = settingsDraft[key].filter(x => x.id !== id); drawOptionLists();
  });
}
const themeFields = [['background', 'Sfondo'], ['surface', 'Superfici'], ['text', 'Testo'], ['accent', 'Accento']];
function drawThemeChoices() {
  const query = themeQuery.trim().toLocaleLowerCase(), total = settingsDraft.themes.length;
  const themes = settingsDraft.themes.filter(theme => !query || theme.name.toLocaleLowerCase().includes(query));
  const themeCount = plural(total, 'tema');
  $('#theme-count').textContent = query ? `${themes.length} / ${themeCount}` : themeCount;
  $('#theme-list').innerHTML = themes.length ? themes.map(theme => {
    const chosen = theme.id === settingsDraft.themeId, mock = themeFields.map(([key]) => `--mock-${key}:${theme[key]}`).join(';');
    return `<button type="button" class="theme-choice ${chosen ? 'chosen' : ''}" data-theme="${esc(theme.id)}" aria-pressed="${chosen}" title="${esc(theme.name)}"><span class="theme-mock" style="${mock}" aria-hidden="true"><span class="theme-mock-card"><span class="theme-mock-line"></span><span class="theme-mock-pill"></span></span></span><span class="theme-choice-info"><span class="theme-choice-name">${esc(theme.name)}</span><span class="theme-swatches">${themeFields.map(([key, label]) => `<i style="background:${theme[key]}" title="${t(label)}: ${theme[key]}" role="img" aria-label="${t(label)}: ${theme[key]}"></i>`).join('')}</span></span>${chosen ? '<span class="theme-check" aria-hidden="true">✓</span>' : ''}</button>`;
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
    <small class="muted">Anteprima dal vivo: il tema viene applicato subito all’app. Salva le impostazioni per mantenerlo, altrimenti resta quello precedente.</small><button class="button small" id="delete-theme">Elimina tema</button></div>`;
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
  $('#delete-theme').onclick = () => {
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
$('#modal').addEventListener('close', () => {
  if (!renderAfterModal || !data) return;
  renderAfterModal = false;
  if (settingsDraftPending()) { renderChrome(); refreshSettingsState(); } else rerenderPreservingView();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !$('#modal').open && data && view === 0) { e.preventDefault(); taskDialog(); }
  if (e.key === 'Escape' && highlighter && !$('#modal').open && !document.getElementById('mark-menu')) { highlighter = ''; drawHighlighter(); }
});
window.runSmokeTests = async () => {
  const checks = [];
  function check(condition, name) { if (!condition) throw new Error(name); checks.push(name); }
  const doubleClick = element => element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
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
  view = 0; render();
  const paint = highlightsOf()[1];
  $(`.highlighter-bar [data-highlighter="${paint.id}"]`).click();
  check(highlighter === paint.id && $('.activity-table').classList.contains('painting') && $('.highlighter-bar').classList.contains('active') && $(`.highlighter-bar [data-highlighter="${paint.id}"]`).getAttribute('aria-pressed') === 'true', 'Evidenziatore attivabile dalla barra sopra la tabella');
  smokeRow().querySelector('.description-cell').click();
  check(!$('#modal').open && smokeRow().classList.contains('marked'), 'Clic su una riga con l’evidenziatore la colora senza aprire la scheda');
  await waitFor(() => !saving && !markFlush);
  check(smokeTask().highlightId === paint.id && (await workspaceApi.load()).data.tasks.find(task => task.code === 'SMOKE-1').highlightId === paint.id && smokeRow().classList.contains('marked') && smokeRow().style.getPropertyValue('--mark').trim() === paint.color && highlighter === paint.id, 'Evidenziazione della riga salvata nell’archivio portatile');
  doubleClick(smokeRow().cells[0]);
  check(!$('#modal').open && highlighter === paint.id, 'Doppio clic con evidenziatore attivo non apre la modifica');
  smokeRow().cells[0].click();
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
  check(headerIds().join() === 'sequence,code,description,urgency,status,effort,incident,problem,releaseDate,notes' && document.querySelectorAll('#task-rows td.description-col').length === listedRows().length, 'Colonne predefinite della lista attività');
  $('#columns-button').click();
  const columnToggle = id => $(`#columns-dialog-editor [data-column-visible="${id}"]`);
  check($('#modal').open && document.querySelectorAll('#columns-dialog-editor [data-column-visible]').length === Object.keys(taskColumnDefs).length && !columnToggle('highlight').checked && columnToggle('notes').checked, 'Scelta delle colonne dal pulsante Colonne');
  columnToggle('highlight').click();
  columnToggle('notes').click();
  $('#columns-dialog-editor [data-column-move="highlight:-1"]').click();
  check(document.activeElement?.dataset.columnMove === 'highlight:-1', 'Spostamento colonne utilizzabile da tastiera');
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(headerIds().join() === 'sequence,code,description,urgency,highlight,status,effort,incident,problem,releaseDate' && smokeRow().cells.length === headerIds().length + 1 && smokeRow().querySelector('.mark-pill') && !data.settings.taskColumns.find(column => column.id === 'notes').visible && (await workspaceApi.load()).data.settings.taskColumns.find(column => column.id === 'highlight').visible, 'Colonne mostrate, nascoste e riordinate e salvate');
  $('[data-sort="highlightId"]').click();
  check(sort.length === 1 && sort[0].key === 'highlightId' && listedRows()[0].classList.contains('marked') && !listedRows().at(-1).classList.contains('marked'), 'Ordinamento per evidenziazione');
  await commit(next => { next.settings.taskColumns = defaultTaskColumns(); });
  render();
  check(headerIds().at(-1) === 'notes' && !headerIds().includes('highlight') && sort.length === 1 && sort[0].key === 'releaseDate', 'Ordinamento su colonna nascosta torna alla release date');
  view = 2; render();
  check(document.querySelector('.milestone-column .task-card.is-marked .mark-chip'), 'Evidenziazione visibile nelle milestone');
  view = 3; render();
  check(document.querySelector('.kanban-column .task-card.is-marked .mark-chip'), 'Evidenziazione visibile nel kanban');
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
  const previewTheme = data.settings.themes.find(theme => theme.id !== data.settings.themeId && theme.accent !== savedAccent);
  document.querySelector(`[data-theme="${previewTheme.id}"]`).click();
  await new Promise(resolve => setTimeout(resolve));
  check(accent() === previewTheme.accent && document.documentElement.style.getPropertyValue('--background') === previewTheme.background, 'Selezione tema applicata subito in anteprima');
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
  $('#discard-settings').click();
  check(accent() === savedAccent && $('#unsaved-banner').hidden && !settingsDraft.themes.some(theme => theme.accent === '#12ab34'), 'Annulla modifiche ripristina il tema salvato');
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
  check($('.highlighter-label').textContent.includes('Highlighter') && $('#columns-button').textContent.includes('Columns') && $('#highlight-filter').options[0].textContent === 'All highlights' && $('.activity-table th[data-column="description"]').textContent === 'Description', 'Evidenziatore e colonne tradotti in inglese');
  taskDialog();
  check($('#task-form').textContent.includes('Portal code') && $('#task-form').textContent.includes('Effort in days') && $('#task-form').textContent.includes('1 day'), 'Dialog attività, editor e unità in inglese');
  $('#task-form').elements.code.value = 'SMOKE-1';
  $('#description-editor').innerHTML = '<p>Attività personalizzate</p>';
  $('#task-form').elements.days.value = '1';
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.length === 1 && !saving);
  check(data.tasks[0].code === 'SMOKE-1' && matchIssues(data.tasks[0], data.issues).incidents.length === 0, 'Codici uguali tra organizzazioni non condividono issue');
  check(data.settings.portalUrlTemplate === '' && !document.querySelector('#task-rows a[data-open-url]'), 'Modello link separato per organizzazione');
  check($('#task-rows').textContent.includes('Attività personalizzate') && effort(data.tasks[0].effortHours) === '1d', 'Contenuti utente preservati e effort localizzato');
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
