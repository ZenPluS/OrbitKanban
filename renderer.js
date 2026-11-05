'use strict';
const { APP_NAME, validateData, matchIssues: matchAllIssues, findDuplicates, sortTasks, dateColor, themeFromImage, themeFromLogo, onAccentColor, iconPalette, iconInk, defaultThemes, normalizeUrl, isWebUrl, validPortalTemplate, hasPortalPlaceholder, portalUrl, parseOrganizationFile, applyOrganizationImport, importedOrganizationData, uniqueOrganizationName, FONT_SIZE_PARTS, FONT_SIZE_STEP, defaultFontSizes, clampFontSize, HIGHLIGHT_LIMIT, defaultTaskColumns, TAG_LIMIT, TAG_NAME_MAX, today, nextReleaseDate, situationFileName } = window.OrbitaCore;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const { reorderTaskSequences, indexIssues } = window.OrbitaCore;
const { FONT_FAMILIES, DEFAULT_FONT_FAMILY } = window.OrbitaCore;
const { hexToHsv, hsvToHex } = window.OrbitaCore;
const { taskEditorFields, normalizeTaskEditorLayout, defaultTaskEditorLayout, TASK_LAYOUT } = window.OrbitaCore;
const CustomColumns = window.OrbitaColumns, Csv = window.OrbitaCsv;
const hasColumn = (id, kind = 'tasks', settings = data.settings) => CustomColumns.hasColumn(settings, kind, id);
const configuredColumns = (kind = 'tasks', settings = data.settings, input) => CustomColumns.listColumns(settings, kind, input);
const unassignedOption = () => ({ id: '', name: t("Unassigned"), color: '#929bb2', highlight: false });
const statusOf = task => hasColumn('status') && data.settings.statuses.find(option => option.id === task.statusId) || unassignedOption();
const urgencyOf = task => hasColumn('urgency') && data.settings.urgencies.find(option => option.id === task.urgencyId) || unassignedOption();
const workflowStatuses = () => hasColumn('status') ? [...data.settings.statuses, ...(data.tasks.some(task => !task.statusId) ? [unassignedOption()] : [])] : [];
function matchIssues(task, issues) {
  const links = matchAllIssues(task, issues);
  if (!hasColumn('incident')) links.incidents = [];
  if (!hasColumn('problem')) links.problems = [];
  return links;
}
let columnFilters = { tasks: {}, issues: {} }, issueSearch = '';
let data, dataFolder, view = 0, search = '', showHidden = false, duplicatesOnly = false, issueDuplicatesOnly = false, statusFilter = '', highlightFilter = '', highlighter = '', sort = [{ key: 'releaseDate', direction: 'asc' }];
let settingsDraft, settingsBase, saving = false, organizationBusy = false, organizations = [], activeOrganizationId, lastOpenedLink = '';
let revision = '', appVersion = '', browserUrl = '', online = true, refreshing = false, pendingChange = null, renderAfterModal = false, adoptions = 0, subscribed = false;
const HISTORY_LIMIT = 20, undoHistory = new Map(), redoHistory = new Map();
let activeSavedViewId = '', backupRequest = 0;
let languageInfo = { folder: '', template: '', languages: [], errors: [] };
let milestoneDay = '';
let updateState = { supported: false, phase: 'idle', autoCheck: true, version: '', percent: 0, error: '', releaseUrl: 'https://github.com/ZenPluS/OrbitKanban/releases' }, updateSubscribed = false;
const dismissedUpdateVersions = new Set();
// Tasks ticked in the list for bulk edit or export; kept across filters and dropped when they no longer exist.
const selectedTasks = new Set();
let selectionAnchor = '';
let settingsTab = (() => { try { return sessionStorage.getItem('orbitkanban.settingsTab') || ''; } catch { return ''; } })(), themeQuery = '';
let guideQuery = '', guidePinned = null;
function unwrap(value) {
  if (value && value.__error) { const error = new Error(value.message); error.code = value.code; throw error; }
  return value;
}
const workspaceApi = new Proxy({}, { get: (_, name) => { const member = window.workspace?.[name]; return typeof member === 'function' ? async (...args) => unwrap(await member(...args)) : member; } });
const browserMode = () => window.workspace?.mode === 'browser';
const currentLanguage = () => data?.settings.language || 'it';
const t = text => window.OrbitaI18n.translate(text, currentLanguage());
const tr = t;
const ui = (strings, ...values) => window.OrbitaI18n.translateTemplate(strings, values, currentLanguage());
const locale = () => window.OrbitaI18n.locale(currentLanguage());
const term = text => window.OrbitaI18n.term(text, currentLanguage());
const plural = (count, key) => window.OrbitaI18n.plural(count, key, currentLanguage());
const ico = (name, family) => window.OrbitaIcons.icon(name, family);
const icons = ['tasks', 'link', 'flag', 'kanban'].map(name => ico(name));
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
  undo.title = t("Undo (Ctrl+Z)");
  redo.title = t("Redo (Ctrl+Y)");
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
    notify("History no longer matches the current data; undo and redo have been cleared.", true);
    return;
  }
  const organizationId = activeOrganizationId;
  saving = true;
  updateHistoryButtons();
  $('#save-status').textContent = t("Saving…");
  try {
    const snapshot = await workspaceApi.save(structuredClone(direction === 'undo' ? entry.before : entry.after), organizationId, undefined, revision);
    adoptSnapshot(snapshot);
    source.pop();
    targetStack.push(entry);
    if (targetStack.length > HISTORY_LIMIT) targetStack.splice(0, targetStack.length - HISTORY_LIMIT);
    $('#save-status').innerHTML = ui`<i class="connection-dot"></i> Everything saved locally`;
    rerenderPreservingView();
    notify(direction === 'undo' ? "Change undone." : "Change redone.");
  } catch (error) {
    if (error.code === 'conflict') {
      adoptSnapshot(await workspaceApi.load(organizationId));
      clearHistory(organizationId);
      rerenderPreservingView();
      notify("The data changed in another window; undo and redo have been cleared.", true);
      return;
    }
    $('#save-status').textContent = t("Save failed");
    throw error;
  } finally {
    saving = false;
    updateHistoryButtons();
    flushPendingChange();
  }
}
async function commit(change, organizationName) {
  if (saving || organizationBusy) throw new Error(t("A save is in progress. Please try again in a moment."));
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
  $('#save-status').textContent = t("Saving…");
  try {
    let saved;
    try { saved = await workspaceApi.save(next, organizationId, organizationName, revision); }
    catch (error) {
      if (error.code !== 'conflict' || typeof change !== 'function') throw error;
      const fresh = await workspaceApi.load(organizationId);
      if (fresh.activeOrganizationId !== organizationId) throw Object.assign(new Error(t("This organization no longer exists.")), { code: 'missing-organization' });
      adoptSnapshot(fresh);
      before = structuredClone(data);
      next = validateData(build());
      saved = await workspaceApi.save(next, organizationId, organizationName, revision);
    }
    adoptSnapshot(saved);
    recordHistory(organizationId, before, saved.data);
    $('#save-status').innerHTML = ui`<i class="connection-dot"></i> Everything saved locally`;
  } catch (error) {
    $('#save-status').textContent = t("Save failed");
    if (error.code === 'missing-organization') pendingChange = { forced: true };
    throw error;
  } finally { saving = false; updateHistoryButtons(); flushPendingChange(); }
}
function action(handler) { return async event => { try { await handler(event); } catch (error) { notify(error.message, true); } }; }
const openPortal = action(async url => { lastOpenedLink = await workspaceApi.openLink(url); });
function portalAnchor(url, code, className = 'external-link') {
  return url ? `<a class="${className}" href="${esc(url)}" data-open-url title="${esc(t("Open in the default browser") + ': ' + url)}" aria-label="${esc(t("Open portal") + ' ' + code)}">${ico('external')}</a>` : '';
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
  if (!date) return t("Unscheduled");
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
  return [days ? term("{0}d").replaceAll('{0}', days) : '', hours ? `${hours}h` : ''].filter(Boolean).join(' ') || '—';
}
function optionList(items, selected, all = '') {
  return (all ? `<option value="">${esc(t(all))}</option>` : '') + items.map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}
function visibleTasks() { return data.tasks.filter(t => !t.hidden); }
const highlightsOf = () => hasColumn('highlight') ? data.settings.highlights || [] : [];
const highlightOf = task => task.highlightId ? highlightsOf().find(h => h.id === task.highlightId) : undefined;
const tagsOf = task => (hasColumn('tags') ? data.settings.tags || [] : []).filter(tag => task.tagIds?.includes(tag.id));
function tagChips(task) { return `<span class="tag-chips">${tagsOf(task).map(tag => pill(tag.name, tag.color, 'tag-pill')).join('')}</span>`; }
function tagPicker(task) {
  const tags = data.settings.tags || [];
  return `<fieldset class="field full task-tags" tabindex="-1"><legend>${esc(t('Tags'))}</legend><p class="muted">${esc(t(tags.length ? "Select one or more tags. Manage them in Settings › Tags." : "No tags available. Add them in Settings › Tags."))}</p><div class="tag-options">${tags.map(tag => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${esc(tag.id)}" ${task.tagIds?.includes(tag.id) ? 'checked' : ''}>${pill(tag.name, tag.color, 'tag-pill')}</label>`).join('')}</div></fieldset>`;
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
  menu.setAttribute('aria-label', custom ? custom.field.name : t("Edit tags") + ': ' + task.code);
  menu.innerHTML = (custom ? `<fieldset class="field full task-tags"><legend>${esc(custom.field.name)}</legend><p class="muted">${esc(t("Select labels. Manage names and colors in the dedicated settings section."))}</p><div class="tag-options">${CustomColumns.choices(custom.field).map(option => `<label class="tag-choice"><input type="checkbox" name="tagIds" value="${esc(option.id)}" ${initial.has(option.id) ? 'checked' : ''}>${pill(option.name, option.color, 'tag-pill')}</label>`).join('')}</div></fieldset>` : tagPicker(task)) + ui`<div class="tag-menu-actions"><button type="button" class="button small" data-cancel-tags>Cancel</button><button type="submit" class="button small primary">Apply</button></div>`;
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
        if (!row) throw new Error("Task no longer available.");
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
let activeColorPicker;
function colorControl(color, label, attributes, showValue = false) {
  const title = `${t("Color")}: ${label} (${color.toUpperCase()})`;
  return `<button type="button" class="color-control" ${attributes} value="${color}" style="--picked-color:${color}" data-color-label="${esc(label)}" aria-label="${esc(title)}" title="${esc(title)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="color-picker"><span class="color-control-swatch" aria-hidden="true"></span>${showValue ? `<span class="color-control-value">${color.toUpperCase()}</span>` : ''}${ico('chevron-down')}</button>`;
}
function updateColorControl(button, color) {
  button.value = color;
  button.style.setProperty('--picked-color', color);
  const value = button.querySelector('.color-control-value');
  if (value) value.textContent = color.toUpperCase();
  button.title = `${t("Color")}: ${button.dataset.colorLabel} (${color.toUpperCase()})`;
  button.setAttribute('aria-label', button.title);
}
function closeColorPicker(accept = false, restoreFocus = false) {
  const picker = activeColorPicker;
  if (!picker) return;
  activeColorPicker = null;
  picker.menu.remove();
  picker.button.setAttribute('aria-expanded', 'false');
  if (!accept && picker.button.value !== picker.initial) {
    picker.button.value = picker.initial;
    picker.button.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (restoreFocus && picker.button.isConnected) picker.button.focus({ preventScroll: true });
}
function positionColorPicker() {
  if (!activeColorPicker) return;
  const { button, menu } = activeColorPicker, rect = button.getBoundingClientRect();
  const below = rect.bottom + 6, above = rect.top - menu.offsetHeight - 6;
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(below + menu.offsetHeight <= innerHeight - 8 ? below : above, innerHeight - menu.offsetHeight - 8))}px`;
}
function openColorPicker(button) {
  const same = activeColorPicker?.button === button;
  closeColorPicker();
  closeTagMenu(); closeMarkMenu();
  if (same) return;
  const initial = button.value, theme = settingsDraft.themes.find(theme => theme.id === settingsDraft.themeId);
  let hsv = hexToHsv(initial);
  const menu = document.createElement('form');
  menu.id = 'color-picker';
  menu.className = 'color-picker';
  menu.setAttribute('popover', 'manual');
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-labelledby', 'color-picker-title');
  // Keep the picker legible while previewing potentially low-contrast theme colors.
  const style = getComputedStyle(document.documentElement);
  for (const name of ['background', 'surface', 'text', 'accent', 'muted', 'border', 'on-accent']) menu.style.setProperty(`--${name}`, style.getPropertyValue(`--${name}`));
  const swatches = [...new Set([theme.background, theme.surface, theme.text, theme.accent, ...highlightPalette].map(color => color.toLowerCase()))];
  menu.innerHTML = ui`<div class="color-picker-heading"><div><small>Choose color</small><h3 id="color-picker-title">${esc(button.dataset.colorLabel)}</h3></div><button type="button" class="icon-button" data-color-cancel aria-label="Close">${ico('close')}</button></div>
    <div class="color-plane" role="img" aria-label="Drag to adjust saturation and brightness, or use the sliders below."><span class="color-plane-thumb"></span></div>
    <label class="color-slider-label" for="color-hue"><span>Hue</span><output id="color-hue-value"></output></label><input id="color-hue" class="color-slider color-hue" type="range" min="0" max="360" step="1">
    <div class="color-picker-channels">${[['s', "Saturation"], ['v', "Brightness"]].map(([key, label]) => `<div><label class="color-slider-label" for="color-${key}"><span>${esc(t(label))}</span><output id="color-${key}-value"></output></label><input id="color-${key}" class="color-slider" type="range" min="0" max="100" step="1"></div>`).join('')}</div>
    <div class="color-picker-entry"><button type="button" class="color-original" style="--picked-color:${initial}" title="Restore original color" aria-label="Restore original color"></button><label class="field" for="color-hex">HEX<input id="color-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="color-error"></label></div>
    <p id="color-error" class="color-error" aria-live="polite" hidden>Enter a HEX color with 3 or 6 digits, for example #A392FF.</p>
    <div class="color-picker-swatches" role="group" aria-label="Theme colors and presets">${swatches.map(color => `<button type="button" class="color-preset" data-color-preset="${color}" style="--picked-color:${color}" aria-label="${color.toUpperCase()}" title="${color.toUpperCase()}"></button>`).join('')}</div>
    <div class="color-picker-actions"><button type="button" class="button small" data-color-cancel>Cancel</button><button type="submit" class="button small primary">Apply</button></div>`;
  document.body.append(menu);
  activeColorPicker = { menu, button, initial };
  const hex = menu.querySelector('#color-hex'), plane = menu.querySelector('.color-plane');
  function update(fromText = false) {
    const color = hsvToHex(hsv), pureHue = hsvToHex({ h: hsv.h, s: 100, v: 100 });
    menu.style.setProperty('--picked-color', color);
    plane.style.backgroundColor = pureHue;
    plane.style.setProperty('--color-s', `${hsv.s}%`);
    plane.style.setProperty('--color-v', `${100 - hsv.v}%`);
    for (const [id, value] of [['hue', hsv.h], ['s', hsv.s], ['v', hsv.v]]) {
      menu.querySelector(`#color-${id}`).value = Math.round(value);
      menu.querySelector(`#color-${id}-value`).textContent = `${Math.round(value)}${id === 'hue' ? '\u00b0' : '%'}`;
    }
    menu.querySelector('#color-s').style.backgroundImage = `linear-gradient(to right, #fff, ${pureHue})`;
    menu.querySelector('#color-v').style.backgroundImage = `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 100 })})`;
    if (!fromText) hex.value = color.toUpperCase();
    menu.querySelectorAll('[data-color-preset]').forEach(preset => preset.setAttribute('aria-pressed', String(preset.dataset.colorPreset === color)));
    hex.setAttribute('aria-invalid', 'false');
    menu.querySelector('#color-error').hidden = true;
    menu.querySelector('[type="submit"]').disabled = false;
    if (button.value !== color) {
      button.value = color;
      button.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function choose(color) {
    const next = hexToHsv(color);
    hsv = { ...next, h: next.s ? next.h : hsv.h };
    update();
  }
  hex.oninput = () => {
    const value = hex.value.trim();
    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      hex.setAttribute('aria-invalid', 'true');
      menu.querySelector('#color-error').hidden = false;
      menu.querySelector('[type="submit"]').disabled = true;
      positionColorPicker();
      return;
    }
    const next = hexToHsv(value.startsWith('#') ? value : '#' + value);
    hsv = { ...next, h: next.s ? next.h : hsv.h };
    update(true);
  };
  for (const [id, key] of [['hue', 'h'], ['s', 's'], ['v', 'v']]) menu.querySelector(`#color-${id}`).oninput = event => { hsv[key] = Number(event.target.value); update(); };
  let pointerId = null;
  const drag = event => {
    const bounds = plane.getBoundingClientRect(), clamp = value => Math.max(0, Math.min(1, value));
    hsv.s = clamp((event.clientX - bounds.left) / bounds.width) * 100;
    hsv.v = (1 - clamp((event.clientY - bounds.top) / bounds.height)) * 100;
    update();
  };
  plane.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    pointerId = event.pointerId;
    plane.setPointerCapture(pointerId);
    drag(event);
  };
  plane.onpointermove = event => { if (event.pointerId === pointerId) drag(event); };
  plane.onpointerup = event => { if (event.pointerId === pointerId) { drag(event); plane.releasePointerCapture(pointerId); pointerId = null; } };
  plane.onlostpointercapture = plane.onpointercancel = () => { pointerId = null; };
  menu.querySelectorAll('[data-color-preset]').forEach(preset => preset.onclick = () => choose(preset.dataset.colorPreset));
  menu.querySelector('.color-original').onclick = () => choose(initial);
  menu.querySelectorAll('[data-color-cancel]').forEach(cancel => cancel.onclick = () => closeColorPicker(false, true));
  menu.onsubmit = event => {
    event.preventDefault();
    if (hex.getAttribute('aria-invalid') === 'true') { hex.focus(); return; }
    closeColorPicker(true, true);
  };
  menu.onkeydown = event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); closeColorPicker(false, true); }
    if (event.key === 'Tab') {
      const inputs = [...menu.querySelectorAll('button:not(:disabled), input')], index = inputs.indexOf(document.activeElement);
      if (event.shiftKey && index === 0 || !event.shiftKey && index === inputs.length - 1) {
        event.preventDefault(); inputs[event.shiftKey ? inputs.length - 1 : 0].focus();
      }
    }
  };
  update();
  menu.showPopover();
  button.setAttribute('aria-expanded', 'true');
  positionColorPicker();
  hex.focus({ preventScroll: true }); hex.select();
}
document.addEventListener('pointerdown', event => {
  if (activeColorPicker && !activeColorPicker.menu.contains(event.target) && !event.target.closest('.color-control')) closeColorPicker();
}, true);
window.addEventListener('scroll', event => {
  if (activeColorPicker && !activeColorPicker.menu.contains(event.target)) positionColorPicker();
}, true);
window.addEventListener('resize', positionColorPicker);
function matchesHighlightFilter(task) {
  if (!highlightFilter) return true;
  if (highlightFilter === '__any') return Boolean(highlightOf(task));
  if (highlightFilter === '__none') return !highlightOf(task);
  return task.highlightId === highlightFilter;
}
const duplicatesOf = () => {
  const duplicates = findDuplicates(data.tasks, data.issues);
  if (!hasColumn('incident')) duplicates.tasks.clear();
  return duplicates;
};
const recordLabel = (record, kind = 'tasks') => hasColumn('code', kind) && record.code || (kind === 'tasks' && hasColumn('description') && plain(record.description)) || `${t(kind === 'tasks' ? "Task" : "Issue")} ${record.id.slice(0, 8)}`;
const taskLabel = task => `${hasColumn('sequence') ? '#' + task.sequence + ' ' : ''}${recordLabel(task)}${task.hidden ? ` (${t("hidden")})` : ''}`;
// One line per duplicated incident, naming the other tasks or associations that share it.
function taskDuplicateLines(taskId, groups) {
  return groups.map(group => fillText("{0} is also linked to: {1}", group.incident, group.taskIds.filter(id => id !== taskId).map(id => taskLabel(data.tasks.find(task => task.id === id))).join(', ')));
}
function issueDuplicateLine(issueId, group, issues = data.issues) {
  const others = group.issueIds.filter(id => id !== issueId).map(id => issues.find(issue => issue.id === id)).map(issue => issue.problem.trim() ? `${issue.code} · ${issue.problem}` : issue.code);
  return fillText("{0} also appears in: {1}", group.incident, others.join(', '));
}
function filteredTasks(duplicates = duplicatesOf(), issues = search || Object.keys(columnFilters.tasks).length ? indexIssues(data.issues) : data.issues) {
  const needle = search.toLowerCase();
  return data.tasks.filter(t => (duplicatesOnly ? duplicates.tasks.has(t.id) : showHidden || !t.hidden) && (!statusFilter || t.statusId === statusFilter) && matchesHighlightFilter(t) && passesColumnFilters(t, 'tasks', issues) && (
    !search || searchableValues(t, 'tasks', issues).some(value => value.toLocaleLowerCase().includes(needle))
  ));
}
const themeExtrasCache = new Map();
// Readable label color on accent fills and per-theme icon gradients, computed once per color combination.
function themeExtras(theme) {
  const key = [theme.background, theme.surface, theme.text, theme.accent].join();
  if (!themeExtrasCache.has(key)) {
    if (themeExtrasCache.size > 200) themeExtrasCache.clear();
    const properties = { '--on-accent': onAccentColor(theme) };
    for (const [family, stops] of Object.entries(iconPalette(theme))) {
      stops.forEach((stop, i) => { properties[`--ig-${family}-${i + 1}`] = stop; });
      properties[`--ig-${family}-ink`] = iconInk(stops);
    }
    themeExtrasCache.set(key, properties);
  }
  return themeExtrasCache.get(key);
}
function paintTheme(theme) {
  const style = document.documentElement.style;
  for (const key of ['background', 'surface', 'text', 'accent']) style.setProperty(`--${key}`, theme[key]);
  for (const [property, value] of Object.entries(themeExtras(theme))) style.setProperty(property, value);
  const rgb = theme.background.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  document.documentElement.style.colorScheme = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? 'light' : 'dark';
  windowChromeColors = { background: theme.background, surface: theme.surface, text: theme.text };
  syncWindowChrome();
}
// The desktop window has no native title bar: the top bar drags it and the caption buttons take the theme colors.
const customTitleBar = () => window.workspace?.titleBarOverlay === true && typeof window.workspace.windowChrome === 'function';
let windowChromeColors = null, windowChromeKey = '', windowChromeSent = null;
function syncWindowChrome() {
  if (!customTitleBar() || !windowChromeColors) return;
  // The overlay stops above the top bar's bottom border, so the separator line runs under the caption buttons too.
  // The form designer covers the top bar with its own bar, so the caption buttons take that bar's color while it is open.
  const designer = document.getElementById('form-designer')?.open === true;
  const request = { background: designer ? windowChromeColors.surface : windowChromeColors.background, text: windowChromeColors.text, height: $('.topbar').clientHeight, dimmed: $('#modal').open };
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
// The sidebar can fold into a column of icons so the views get more space; the choice is kept on this device.
const SIDEBAR_COLLAPSED_KEY = 'orbitkanban.sidebarCollapsed';
let sidebarCollapsed = (() => { try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; } })();
const sidebarReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let sidebarAnimations = [];
sidebarReducedMotion.addEventListener('change', () => {
  if (sidebarReducedMotion.matches) sidebarAnimations.forEach(animation => animation.cancel());
});
function applySidebar() {
  const toggle = $('#sidebar-toggle'), select = $('#organization-select');
  document.documentElement.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  toggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
  toggle.setAttribute('aria-label', t("Sidebar"));
  toggle.title = t(sidebarCollapsed ? "Expand the sidebar (Ctrl+B)" : "Collapse the sidebar (Ctrl+B)");
  // In the column the names are hidden, so they become tooltips.
  for (const button of document.querySelectorAll('#navigation .nav-button, #settings-button, #open-browser')) {
    if (sidebarCollapsed) button.title = button.querySelector('.nav-label').textContent; else button.removeAttribute('title');
  }
  if (sidebarCollapsed) select.title = fillText("Organization: {0}", select.selectedOptions[0]?.textContent ?? ''); else select.removeAttribute('title');
}
function toggleSidebar() {
  const focused = document.activeElement;
  const layout = sidebarReducedMotion.matches ? [] : [
    [$('#sidebar'), ['width', 'paddingLeft', 'paddingRight']],
    [$('main'), ['width', 'marginLeft']],
    [$('#toast'), ['left']]
  ];
  const propertiesOf = (element, properties) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(properties.map(property => [property, style[property]]));
  };
  const beforeLayout = layout.map(([element, properties]) => propertiesOf(element, properties));
  const moving = sidebarReducedMotion.matches ? [] : [
    ...[...document.querySelectorAll('#navigation, #guide-button, #settings-button, #open-browser, .sidebar .version')].map(element => [element, 'y']),
    ...[...document.querySelectorAll('.sidebar .nav-icon, .sidebar .nav-count, #open-browser .ico, #app-version')].map(element => [element, 'x']),
    [$('.sidebar .brand-icon'), 'xy']
  ];
  const beforePositions = moving.map(([element]) => element.getBoundingClientRect());
  // Capture the visible positions before cancelling, so a quick second click reverses smoothly.
  sidebarAnimations.forEach(animation => animation.cancel());
  sidebarAnimations = [];
  sidebarCollapsed = !sidebarCollapsed;
  try { if (sidebarCollapsed) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1'); else localStorage.removeItem(SIDEBAR_COLLAPSED_KEY); } catch {}
  applySidebar();
  const motion = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
  const afterLayout = layout.map(([element, properties]) => propertiesOf(element, properties));
  if (!sidebarCollapsed && !sidebarReducedMotion.matches) {
    // Reveal full-width labels through the growing sidebar instead of wrapping them while it opens.
    const children = [...$('#sidebar').children].map(element => [element, getComputedStyle(element).width]);
    sidebarAnimations.push(...children.map(([element, width]) => element.animate([{ minWidth: width }, { minWidth: width }], motion)));
  }
  sidebarAnimations.push(...layout.map(([element], index) => element.animate([beforeLayout[index], afterLayout[index]], motion)));
  // Move icons without scaling them, and compensate for controls changing rows in the compact layout.
  const afterPositions = moving.map(([element]) => element.getBoundingClientRect());
  sidebarAnimations.push(...moving.map(([element, axes], index) => {
    const x = axes.includes('x') ? beforePositions[index].left - afterPositions[index].left : 0;
    const y = axes.includes('y') ? beforePositions[index].top - afterPositions[index].top : 0;
    return element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], motion);
  }));
  if (!sidebarReducedMotion.matches) {
    const labels = sidebarCollapsed ? '.sidebar .organization-icon' : '.sidebar .nav-label, .sidebar .brand > div:last-child, .sidebar .organization-switcher label, #organization-select, #manage-organizations, .sidebar .local-card';
    const fade = sidebarCollapsed ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }];
    sidebarAnimations.push(...[...document.querySelectorAll(labels)].map(element => element.animate(fade, motion)));
  }
  // Controls that only exist in the full sidebar hand the focus to the menu button.
  if ($('#sidebar').contains(focused) && !focused.getClientRects().length) $('#sidebar-toggle').focus({ preventScroll: true });
  // The views change width without a window resize, so menus anchored to them follow the resize rules.
  const focusIn = selector => Boolean(document.querySelector(selector)?.contains(document.activeElement));
  closeTagMenu(focusIn('#tag-menu'));
  closeMarkMenu(focusIn('#mark-menu'));
  positionColorPicker();
}
// Set before the first render so a collapsed sidebar does not flash open; render() applies the rest.
document.documentElement.classList.toggle('sidebar-collapsed', sidebarCollapsed);
new ResizeObserver(positionColorPicker).observe($('main'));
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
  closeColorPicker();
  closeMarkMenu();
  closeTagMenu();
  const content = $('#content'), nextView = ['tasks', 'issues', 'milestones', 'kanban', 'settings', 'guide'][view];
  if (content.dataset.workspaceView !== nextView) content.scrollTop = 0;
  content.dataset.workspaceView = nextView;
  applyTheme();
  renderChrome();
  const duplicates = duplicatesOf(), alerts = [duplicates.tasks.size, duplicates.issues.size];
  const alert = i => {
    if (!alerts[i]) return '';
    const label = fillText(i ? "{0} associations with a duplicate incident" : "{0} tasks with a duplicate incident", alerts[i]);
    return `<span class="nav-alert" title="${esc(label)}"><span aria-hidden="true">${alerts[i]}</span><span class="sr-only">${esc(label)}</span></span>`;
  };
  $('#navigation').innerHTML = data.settings.tabNames.map((name, i) => `<button class="nav-button ${view === i ? 'active' : ''}" data-view="${i}"${sidebarCollapsed ? ` title="${esc(name)}"` : ''}><span class="nav-icon">${icons[i]}${alert(i)}</span><span class="nav-label">${esc(name)}</span>${i === 0 ? `<span class="nav-count">${visibleTasks().length}</span>` : ''}</button>`).join('');
  document.querySelectorAll('#navigation [data-view]').forEach(button => button.onclick = () => { view = Number(button.dataset.view); render(); });
  $('#settings-button').classList.toggle('active', view === 4);
  $('#guide-button').classList.toggle('active', view === 5);
  $('#current-tab').textContent = view === 4 ? t("Settings") : view === 5 ? term("Guide") : data.settings.tabNames[view];
  if (view === 0) renderTasks();
  if (view === 1) renderIssues();
  if (view === 2) renderMilestones();
  if (view === 3) renderKanban();
  if (view === 4) renderSettings();
  if (view === 5) renderGuide();
}
function adoptSnapshot(snapshot) {
  if (activeOrganizationId !== snapshot.activeOrganizationId) { columnFilters = { tasks: {}, issues: {} }; issueSearch = ''; }
  data = validateData(snapshot.data);
  if (!hasColumn('status')) statusFilter = '';
  if (!hasColumn('highlight')) { highlightFilter = ''; highlighter = ''; pendingMarks.clear(); }
  sort = sort.filter(entry => CustomColumns.sortKeys(data.settings).includes(entry.key));
  if (!sort.length) sort = CustomColumns.defaultSort(data.settings);
  for (const kind of ['tasks', 'issues']) columnFilters[kind] = Object.fromEntries(Object.entries(columnFilters[kind]).filter(([id]) => columnDef(id, kind)));
  for (const kind of ['tasks', 'issues']) for (const field of CustomColumns.schemaOf(data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type))) {
    const filter = columnFilters[kind][field.id];
    if (filter) {
      const known = CustomColumns.choices(field).map(option => option.id);
      filter.values = filter.values.filter(value => value === CustomColumns.EMPTY_VALUE || known.includes(value));
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
  $('.brand small').textContent = t("YOUR PERSONAL WORKSPACE");
  $('.workspace-label').innerHTML = ui`WORKSPACE <span>LOCAL</span>`;
  $('#settings-button').innerHTML = ui`<span class="nav-icon">${ico('settings')}</span><span class="nav-label">Settings</span>`;
  $('#guide-button').innerHTML = `<span class="nav-icon">${ico('book')}</span><span class="nav-label">${esc(term("Guide"))}</span>`;
  $('#guide-button').title = term("Open the guide (F1)");
  $('.local-card strong').textContent = t("Only on your device");
  $('.local-card small').textContent = t("Your data. Always with you.");
  $('footer>span').innerHTML = ui`<i class="connection-dot"></i> No cloud. No account. Everything under control.`;
  $('#folder-button').innerHTML = `${ico('folder')}<span>${esc(t("Open data folder"))}</span>`;
  $('#global-search-label').textContent = t("Search");
  $('#global-search').title = t("Search OrbitKanban (Ctrl+K)");
  renderConnectionStatus();
  $('#navigation').setAttribute('aria-label', t("Main views"));
  $('.organization-switcher label').textContent = t("Organization");
  $('#manage-organizations').textContent = t("Manage organizations");
  $('#organization-select').innerHTML = organizations.map(o => `<option value="${esc(o.id)}" ${o.id === activeOrganizationId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  $('#open-browser').innerHTML = `${ico('globe')}<span class="nav-label">${esc(t(browserMode() ? "Open in new tab" : "Open in browser"))}</span>`;
  $('#open-browser').disabled = !browserUrl;
  $('.version').innerHTML = `${browserMode() ? 'BROWSER' : 'PORTABLE'} EDITION <span id="app-version">${esc(appVersion ? `v${appVersion}` : '')}</span>`;
  applySidebar();
  updateHistoryButtons();
  drawUpdateNotice();
}
function renderConnectionStatus() {
  const status = $('#save-status');
  status.classList.toggle('offline', !online);
  status.innerHTML = !online ? ui`<i class="connection-dot"></i> App not reachable` : browserMode() ? ui`<i class="connection-dot"></i> Synced with the app` : ui`<i class="connection-dot"></i> Local archive`;
}
function sameOrganizations(list) {
  return list.length === organizations.length && list.every((o, i) => organizations[i].id === o.id && organizations[i].name === o.name);
}
function settingsDraftPending() {
  return view === 4 && Boolean($('#organization-name')) && (settingsChanged() || Boolean($('#create-organization-section')?.open));
}
function rerenderPreservingView() {
  const page = document.scrollingElement, pageScroll = [page.scrollLeft, page.scrollTop];
  const selectors = ['#content', '.table-scroll', '.milestone-scroll', '.kanban-scroll', '.theme-gallery', '.settings-nav', '.guide-nav'];
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
    notify("The open organization was deleted in another window. You are now viewing another organization.", true);
    return;
  }
  if (snapshot.revision === revision && sameOrganizations(snapshot.organizations)) return;
  const keepDraft = settingsDraftPending();
  adoptSnapshot(snapshot);
  if ($('#modal').open) { renderAfterModal = true; renderChrome(); return; }
  if (keepDraft) {
    renderChrome(); refreshSettingsState();
    notify("Data updated from another window. Your unsaved settings are kept: saving them will take precedence.");
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
    if (!value) { notify("OrbitKanban is not reachable: reopen the app on the PC and reload the page.", true); return; }
    notify("Connection restored.");
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
  { id: 'identity', group: "Organization", icon: 'id', label: "Identity & navigation", panel: 'identity-panel', keys: ['tabNames', 'hoursPerDay', 'logo'] },
  { id: 'languages', group: "Organization", icon: 'translate', label: "Language & translations", panel: 'languages-panel', keys: ['language'] },
  { id: 'portal', group: "Organization", icon: 'portal', label: "Portal link", panel: 'portal-panel', keys: ['portalUrlTemplate'] },
  { id: 'organizations', group: "Organization", icon: 'building', label: "Organizations", panel: 'organizations-panel', keys: [] },
  { id: 'themes', group: "Appearance", icon: 'palette', label: "Themes & atmosphere", panel: 'themes-panel', keys: ['themes', 'themeId'] },
  { id: 'fonts', group: "Appearance", icon: 'font', label: "Font and text size", panel: 'font-size-panel', keys: ['fontSizes', 'fontFamily'] },
  { id: 'task-layout', group: "Appearance", icon: 'columns', label: "Task editor layout", panel: 'task-layout-panel', keys: ['taskEditorLayout', 'requiredTaskColumns'] },
  { id: 'columns', group: "Workflow", icon: 'columns', label: "List columns", panel: 'columns-panel', keys: ['taskColumns'] },
  { id: 'custom-columns', group: "Workflow", icon: 'column-plus', label: "Column management", panel: 'custom-columns-panel', keys: ['taskFields', 'issueFields', 'taskColumns', 'issueColumns', 'deletedTaskColumns', 'deletedIssueColumns', 'requiredTaskColumns', 'requiredIssueColumns'] },
  { id: 'transfer', group: "Data & access", icon: 'transfer', label: "Export and import organization", panel: 'transfer-panel', keys: [] },
  { id: 'storage', group: "Data & access", icon: 'database', label: "Data that travels with you", panel: 'storage-panel', keys: [] },
  { id: 'browser', group: "Data & access", icon: 'globe', label: "Browser access", panel: 'browser-panel', keys: [] },
  { id: 'updates', group: "Data & access", icon: 'reset', label: "App & updates", panel: 'updates-panel', keys: [] }
];
function choiceSettingsTabs() {
  return ['tasks', 'issues'].flatMap((kind, index) => CustomColumns.schemaOf(settingsDraft || data.settings, kind).filter(field => ['select', 'multiselect'].includes(field.type)).map(field => {
    const id = field.catalog || `choice-${kind}-${field.id}`;
    return { id, panel: `${id}-panel`, group: "Column labels", icon: 'tag', family: 'violet',
      label: `${field.builtin ? t(field.name) : field.name} · ${(settingsDraft || data.settings).tabNames[index]}`,
      field, kind, custom: true, keys: [field.catalog || (kind === 'tasks' ? 'taskFields' : 'issueFields')] };
  }));
}
const allSettingsTabs = () => [
  ...settingsTabs.filter(tab => tab.group !== "Data & access" && (tab.id !== 'portal' || hasColumn('link', 'tasks', settingsDraft || data.settings))),
  ...choiceSettingsTabs(), ...settingsTabs.filter(tab => tab.group === "Data & access")
];
// Ordered: the first matching pattern decides which settings tab holds the field to fix.
// Validation messages are English source text, except those the store localizes in the organization language, so the patterns also list the Italian wording.
const settingsErrorTabs = [[/custom columns?|deleted columns|required columns|colonne obbligatorie|columns changed|colonne eliminate|colonne modificate|column options|column names and identifiers|colonn[ae] personalizzat|opzioni della colonna|nomi e identificativi delle colonne/i, 'custom-columns'], [/\btags?\b/i, 'tags'], [/evidenziatori|highlighter/i, 'highlights'], [/colonne della lista|list columns/i, 'columns'], [/link portale|portal link/i, 'portal'], [/dimensioni del testo|text sizes|\bfont\b/i, 'fonts'], [/\b(?:temi|tema|themes?)\b/i, 'themes'], [/urgen/i, 'urgencies'], [/\b(?:stati|status|statuses)\b/i, 'statuses'], [/\b(?:lingua|language)\b/i, 'languages'], [/organizzazione|organization|\btab\b|ore per giorno|hours per day|logo/i, 'identity']];
const settingsErrorTab = message => /task editor layout|layout della scheda attività/i.test(String(message)) ? 'task-layout' : settingsErrorTabs.find(([pattern]) => pattern.test(String(message)))?.[1];
function settingsNav() {
  const tabs = allSettingsTabs(), groups = [...new Set(tabs.map(tab => tab.group))];
  return `<nav class="settings-nav" aria-label="${esc(t("Settings sections"))}">${groups.map((group, index) => `<div class="settings-nav-group" role="group" aria-labelledby="settings-group-${index}"><span class="settings-nav-label" id="settings-group-${index}">${esc(t(group))}</span>${tabs.filter(tab => tab.group === group).map(tab => `<button type="button" class="settings-tab" id="settings-tab-${tab.id}" data-settings-tab="${tab.id}" aria-controls="${tab.panel}"><span class="settings-tab-icon" aria-hidden="true">${ico(tab.icon, tab.family)}</span><span class="settings-tab-text">${esc(tab.custom ? tab.label : t(tab.label))}</span><span class="settings-tab-dot" role="img" aria-label="${esc(t("Unsaved changes"))}" title="${esc(t("Unsaved changes"))}" hidden></span></button>`).join('')}</div>`).join('')}</nav>`;
}
function showSettingsTab(id, reveal = false) {
  closeColorPicker();
  const tabs = allSettingsTabs(), selected = tabs.find(tab => tab.id === id) || settingsTabs[0];
  document.querySelectorAll('.settings-section').forEach(panel => { panel.hidden = true; });
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
  const dirty = changed ? tabs.filter(tab => tab.custom ? JSON.stringify(tab.field) !== JSON.stringify(CustomColumns.schemaOf(data.settings, tab.kind).find(field => field.id === tab.field.id)) : tab.keys.some(key => JSON.stringify(settingsDraft[key]) !== JSON.stringify(data.settings[key])) || (tab.id === 'custom-columns' && pendingCustomColumns().length > 0) || (tab.id === 'identity' && $('#organization-name').value.trim() !== savedName)) : [];
  for (const tab of tabs) {
    const dot = document.querySelector(`#settings-tab-${tab.id} .settings-tab-dot`);
    if (dot) dot.hidden = !dirty.includes(tab);
  }
  const where = $('#unsaved-where'), key = dirty.map(tab => tab.id).join();
  if (where && where.dataset.key !== key) {
    where.dataset.key = key;
    where.innerHTML = dirty.length ? `${esc(t("Changed sections:"))} ${dirty.map(tab => `<button type="button" class="unsaved-link" data-goto-settings-tab="${tab.id}">${esc(tab.custom ? tab.label : t(tab.label))}</button>`).join(', ')}` : '';
  }
  $('#settings-page')?.style.setProperty('--unsaved-offset', changed ? `${banner.offsetHeight + 12}px` : '0px');
}
async function saveSettings() {
  closeColorPicker();
  try {
    if ($('#logo-file')?.disabled || $('#theme-image-file')?.disabled || $('#create-logo-file')?.disabled) throw new Error(t("Loading image…"));
    const settings = structuredClone(collectSettings());
    for (const form of pendingCustomColumns()) {
      const kind = form.dataset.addField, fields = CustomColumns.fieldsOf(settings, kind);
      fields.push(newCustomField(form));
      CustomColumns.validateFields(fields);
    }
    settings.taskColumns = configuredColumns('tasks', settings);
    settings.issueColumns = configuredColumns('issues', settings);
    settings.taskEditorLayout = normalizeTaskEditorLayout(settings);
    const organizationName = $('#organization-name').value.trim();
    if (!organizationName || organizationName.length > 100) throw new Error(t("Invalid organization name."));
    await commit(next => {
      for (const key of ['taskFields', 'issueFields', 'deletedTaskColumns', 'deletedIssueColumns']) {
        if (JSON.stringify(next.settings[key]) !== JSON.stringify(settingsBase[key]) && JSON.stringify(next.settings[key]) !== JSON.stringify(settings[key])) {
          throw new Error(t("Columns changed in another window. Discard the settings changes and try again: saved data has not been overwritten."));
        }
      }
      next.settings = structuredClone(settings);
      CustomColumns.cleanData(next);
    }, organizationName);
    statusFilter = '';
    activeSavedViewId = '';
  } catch (error) {
    const tab = settingsErrorTab(error?.message);
    if (tab && $('#settings-page')) showSettingsTab(tab, true);
    throw error;
  }
}
const settingsPrompts = {
  switch: ["Save settings before switching organization?", "You have unsaved changes. Save or discard them before switching organization.", "Discard and switch", "Save and switch"],
  transfer: ["Save settings before continuing?", "You have unsaved changes: export and import use the saved settings. Save or discard them before continuing.", "Discard and continue", "Save and continue"]
};
async function withSavedSettings(callback, purpose = 'switch') {
  if (saving || organizationBusy) { notify("A save is in progress. Please try again in a moment.", true); return; }
  if ($('#logo-file')?.disabled || $('#theme-image-file')?.disabled || $('#create-logo-file')?.disabled) { notify("Loading image…", true); return; }
  if (!settingsChanged()) { await callback(); return; }
  const [title, message, discard, save] = settingsPrompts[purpose].map(text => t(text));
  openModal(`<div class="modal-heading"><h2>${title}</h2></div><p class="confirm-message">${message}</p><div class="modal-actions"><button class="button" data-close>${t("Cancel")}</button><button class="button" id="discard-switch">${discard}</button><button class="button primary" id="save-switch">${save}</button></div>`);
  $('#discard-switch').onclick = action(async () => { $('#modal').close(); render(); await callback(); });
  $('#save-switch').onclick = action(async () => { await saveSettings(); $('#modal').close(); render(); await callback(); });
}
async function organizationAction(operation, payload) {
  if (saving || organizationBusy) throw new Error(t("A save is in progress. Please try again in a moment."));
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
    result.textContent = t("Loading image…");
    try {
      const processed = await processLogo(file);
      if (!fileInput.isConnected) return;
      logo = processed.logo; palette = processed.palette;
      preview.innerHTML = `<img src="${logo}" alt="${esc(t("New organization logo"))}"><div class="theme-swatches">${themeFields.map(([key, label]) => `<i style="background:${palette[key]}" title="${t(label)}: ${palette[key]}"></i>`).join('')}</div>`;
      result.textContent = t("Logo ready: the theme will be applied to the new organization.");
    } catch (error) { result.textContent = t(error.message); throw error; }
    finally { fileInput.disabled = false; fileInput.value = ''; form.querySelector('[type=submit]').disabled = false; }
  });
  $('#clear-create-logo').onclick = () => { logo = ''; palette = undefined; preview.innerHTML = ''; result.textContent = ''; };
  form.onsubmit = action(async event => {
    event.preventDefault();
    if (fileInput.disabled) throw new Error(t("Loading image…"));
    const fields = new FormData(form);
    const payload = { name: fields.get('name').trim(), language: fields.get('language'), logo, palette, demo: fields.has('demo') };
    await withSavedSettings(async () => {
      await organizationAction('create', payload);
      notify("Organization created.");
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
  return ui`<div class="stats"><div class="stat"><span>Visible tasks <span class="stat-icon">${ico('tasks')}</span></span><strong>${tasks.length}<small>in your workspace</small></strong></div><div class="stat"><span>Planned releases <span class="stat-icon mint">${ico('diamond')}</span></span><strong>${releases.size}<small>upcoming destinations</small></strong></div><div class="stat"><span>Total effort <span class="stat-icon peach">${ico('clock')}</span></span><strong title="${hours.toLocaleString(locale())} total hours">${effort(hours)}<small>${hours.toLocaleString(locale())} total hours</small></strong></div><div class="stat"><span>Highlighted <span class="stat-icon pink">${ico('flame')}</span></span><strong>${highlighted}<small>keep an eye on these</small></strong></div></div>`;
}
const taskColumnDefs = {
  sequence: { name: "Sequence", header: '#', sort: 'sequence' },
  code: { name: "Portal code", sort: 'code' },
  link: { name: "Portal link" },
  description: { name: "Description" },
  urgency: { name: "Urgency", sort: 'urgencyId' },
  status: { name: "Status", sort: 'statusId' },
  highlight: { name: "Highlight", sort: 'highlightId' },
  tags: { name: 'Tags' },
  effort: { name: 'Effort', sort: 'effortHours' },
  incident: { name: 'Incident' },
  problem: { name: 'Problem' },
  releaseDate: { name: 'Release date', sort: 'releaseDate' },
  notes: { name: "Notes" }
};
const issueColumnDefs = { code: { name: "Portal code" }, incident: { name: 'Incident' }, problem: { name: 'Problem' }, linked: { name: "Link", type: 'number' } };
const fieldTypeNames = { text: "Text", richtext: "Rich text", number: "Number", date: "Date", select: "Single choice", multiselect: "Multiple choice", url: 'Link', effort: "Effort (hours)", boolean: "Yes / No" };
function columnDef(id, kind = 'tasks', settings = data.settings) {
  if (!hasColumn(id, kind, settings)) return undefined;
  const base = (kind === 'tasks' ? taskColumnDefs : issueColumnDefs)[id];
  if (base) return base;
  const field = CustomColumns.fieldsOf(settings, kind).find(field => field.id === id);
  return field ? { name: field.name, type: field.type, field, sort: kind === 'tasks' && ['number', 'date', 'effort', 'boolean', 'select'].includes(field.type) ? field.id : undefined } : undefined;
}
function columnName(id, kind = 'tasks') {
  const def = columnDef(id, kind);
  return def?.field ? def.name : t(def?.name || id);
}
const shownColumns = () => configuredColumns().filter(column => column.visible).map(column => column.id);
const shownIssueColumns = () => configuredColumns('issues').filter(column => column.visible).map(column => column.id);
function customText(value, field) {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'richtext') return plain(value);
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'boolean') return t(value ? "Yes" : 'No');
  if (field.type === 'effort') return value === 0 ? '0h' : effort(value);
  if (['select', 'multiselect'].includes(field.type)) return CustomColumns.choices(field).filter(option => Array.isArray(value) ? value.includes(option.id) : value === option.id).map(option => option.name).join(', ');
  return Array.isArray(value) ? value.join(', ') : String(value);
}
function searchableValues(record, kind, context) {
  return CustomColumns.schemaOf(data.settings, kind).flatMap(field => {
    const value = field.builtin ? columnValue(record, field.id, kind, context) : record.customFields?.[field.id];
    if (value === undefined || value === null || value === '') return [];
    if (field.type === 'date') return [String(value), formatDate(value)];
    return [customText(value, field)];
  });
}
function choiceButton(record, field, kind, values = record.customFields?.[field.id] || []) {
  const chips = CustomColumns.choices(field).filter(option => values.includes(option.id)).map(option => pill(option.name, option.color, 'tag-pill')).join('');
  return `<button type="button" class="task-tags-button" data-choice-picker="${esc(`${kind}:${record.id}:${field.id}`)}" data-choice-kind="${kind}" data-choice-record="${esc(record.id)}" data-choice-field="${field.id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(field.name)}"><span class="tag-chips">${chips || `<span class="muted">+ ${esc(field.name)}</span>`}</span>${ico('chevron-down')}</button>`;
}
function wireChoicePickers() {
  document.querySelectorAll('[data-choice-picker]').forEach(button => button.onclick = () => {
    const kind = button.dataset.choiceKind, id = button.dataset.choiceRecord, fieldId = button.dataset.choiceField, form = button.closest('#task-form, #issue-form');
    const field = CustomColumns.fieldsOf(data.settings, kind).find(field => field.id === fieldId);
    const record = data[kind].find(record => record.id === id);
    if (!field || !record && !form) { notify("This item no longer exists.", true); return; }
    const values = form ? new FormData(form).getAll(fieldId) : record.customFields?.[fieldId] || [];
    openTagMenu(button, { field, values, form, apply: async (added, removed, chosen) => {
      if (form) {
        const container = button.parentElement;
        container.innerHTML = choiceButton({ id }, field, kind, chosen) + chosen.map(value => `<input type="hidden" name="${fieldId}" value="${esc(value)}">`).join('');
        wireChoicePickers();
      } else await commit(next => {
        const row = next[kind].find(row => row.id === id), current = CustomColumns.fieldsOf(next.settings, kind).find(field => field.id === fieldId);
        if (!row || !current) throw new Error(t("This item no longer exists."));
        const known = CustomColumns.choices(current).map(option => option.id);
        if (added.some(id => !known.includes(id))) throw new Error(t("The catalog has changed. Reopen the labels menu."));
        (row.customFields ||= {})[fieldId] = [...new Set([...(row.customFields[fieldId] || []).filter(id => !removed.includes(id)), ...added])];
      });
    } });
  });
}
function customCell(record, field, kind = 'tasks') {
  const value = record.customFields?.[field.id], text = customText(value, field);
  if (field.type === 'multiselect') return `<td class="tags-cell custom-cell">${choiceButton(record, field, kind)}</td>`;
  if (field.type === 'select') { const option = CustomColumns.choices(field).find(option => option.id === value); return `<td class="custom-cell">${option ? pill(option.name, option.color, 'tag-pill') : '—'}</td>`; }
  const html = field.type === 'url' && value ? `<a href="${esc(value)}" data-open-url>${esc(value)}${ico('external')}</a>` :
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
  return `<button type="button" class="column-filter-button ${active ? 'active' : ''}" data-filter-column="${esc(id)}" aria-haspopup="dialog" aria-label="${esc(t("Filter column") + ': ' + columnName(id, kind))}" title="${esc(t("Filter column"))}">${ico('filter')}</button>`;
}
function columnFilterBar(kind) {
  const ids = Object.keys(columnFilters[kind]);
  return ids.length ? `<div class="column-filter-bar">${ids.map(id => {
    const summary = filterSummary(id, kind, columnFilters[kind][id]), short = summary.length > 48 ? `${summary.slice(0, 47)}…` : summary;
    return `<button class="button small" data-filter-column="${esc(id)}" title="${esc(`${columnName(id, kind)}: ${summary}`)}">${esc(columnName(id, kind))}${short ? `: <span class="filter-summary">${esc(short)}</span>` : ''}${ico('chevron-down')}</button>`;
  }).join('')}<button class="button small subtle" data-clear-column-filters>${esc(t("Clear column filters"))}</button></div>` : '';
}
// Readable text of one column filter, shared by the filter bar and the Excel summary.
function filterSummary(id, kind, filter) {
  const spec = filterSpec(id, kind), empty = CustomColumns.EMPTY_VALUE;
  if (spec.type === 'date') {
    if (filter.empty === 'empty') return t("Unassigned");
    const dates = filter.values.filter(value => value !== empty).sort().map(formatDate);
    const range = filter.min || filter.max ? `${filter.min ? formatDate(filter.min) : '…'} → ${filter.max ? formatDate(filter.max) : '…'}` : '';
    const parts = [...dates, filter.values.includes(empty) && t("Unassigned"), range].filter(Boolean);
    return parts.length ? parts.join(', ') : filter.empty === 'filled' ? t("All dates") : '';
  }
  const values = filter.values.map(value => value === empty ? t("Unassigned") : spec.type === 'boolean' ? t(value === 'true' ? "Yes" : 'No') : spec.options?.find(option => String(option.value) === value)?.name || value);
  return [filter.text && `${t("Contains")}: ${filter.text}`, filter.min && `${t("From")}: ${filter.min}`, filter.max && `${t("To")}: ${filter.max}`, values.join(', '), filter.empty !== 'any' && t(filter.empty === 'empty' ? "Empty only" : "Non-empty only")].filter(Boolean).join(', ');
}
// Rows the other filters would show, so a column's choices and counts match what applying it would give.
function filterCandidates(id, kind) {
  const all = columnFilters[kind];
  columnFilters[kind] = Object.fromEntries(Object.entries(all).filter(([key]) => key !== id));
  try { return kind === 'issues' ? filteredIssues() : filteredTasks(); } finally { columnFilters[kind] = all; }
}
function dateFilterChoices(id, kind) {
  const counts = new Map();
  let empty = 0;
  for (const record of filterCandidates(id, kind)) {
    const value = columnValue(record, id, kind);
    if (value) counts.set(value, (counts.get(value) || 0) + 1); else empty++;
  }
  return { dates: [...counts.keys()].sort(), counts, empty };
}
// Dates are picked from the ones in the list instead of typed, because the native date input follows the browser's locale (mm/dd in English).
function dateFilterFields(filter, choices) {
  const empty = CustomColumns.EMPTY_VALUE, onlyEmpty = filter.empty === 'empty';
  const anyDate = filter.empty === 'filled' && !filter.values.length && !filter.min && !filter.max;
  const checked = new Set(onlyEmpty ? [empty] : anyDate ? choices.dates : filter.values);
  const min = onlyEmpty ? '' : filter.min, max = onlyEmpty ? '' : filter.max;
  const dates = [...new Set([...choices.dates, ...filter.values.filter(value => value !== empty)])].sort();
  const bounds = [...new Set([...choices.dates, min, max].filter(Boolean))].sort();
  const option = (value, label, color, count) => `<label class="date-filter-option"><input type="checkbox" name="values" value="${esc(value)}" ${checked.has(value) ? 'checked' : ''}><span class="date-pill" style="--date:${color}">${ico('calendar')}${esc(label)}</span><span class="tiny-count">${count}</span></label>`;
  const bound = (name, selected) => `<select name="${name}"><option value="">—</option>${bounds.map(date => `<option value="${date}" ${date === selected ? 'selected' : ''}>${esc(formatDate(date))}</option>`).join('')}</select>`;
  return `<fieldset class="field full filter-options date-filter-options"><legend>${esc(t("Dates in the list"))}</legend>
      <div class="filter-option-tools"><button type="button" class="button small" data-check-dates="all">${esc(t("Select all"))}</button><button type="button" class="button small subtle" data-check-dates="none">${esc(t("Deselect all"))}</button></div>
      ${option(empty, t("Unassigned"), '#929bb2', choices.empty)}${dates.map(date => option(date, formatDate(date), dateColor(date), choices.counts.get(date) || 0)).join('')}</fieldset>
    <label class="field">${esc(t("From"))}${bound('min', min)}</label><label class="field">${esc(t("To"))}${bound('max', max)}</label>
    <p class="full filter-note">${esc(t("Ticked dates and the range add up: a row is shown when it matches at least one of them."))}</p>`;
}
function dateFilterFromForm(fields, choices) {
  const values = fields.getAll('values').map(String), min = String(fields.get('min') || ''), max = String(fields.get('max') || '');
  const dates = values.filter(value => value !== CustomColumns.EMPTY_VALUE), withEmpty = values.includes(CustomColumns.EMPTY_VALUE), filter = CustomColumns.emptyFilter();
  if (!min && !max && withEmpty && !dates.length) return { ...filter, empty: 'empty' };
  if (!min && !max && choices.dates.length && choices.dates.every(date => dates.includes(date))) return withEmpty ? filter : { ...filter, empty: 'filled' };
  return { ...filter, min, max, values };
}
function wireColumnFilters(kind) {
  document.querySelectorAll('#content [data-filter-column]').forEach(button => button.onclick = () => columnFilterDialog(button.dataset.filterColumn, kind));
  const clear = $('#content [data-clear-column-filters]');
  if (clear) clear.onclick = () => { columnFilters[kind] = {}; clearActiveSavedView(); rerenderPreservingView(); };
}
function columnFilterDialog(id, kind) {
  const filter = structuredClone(columnFilters[kind][id] || CustomColumns.emptyFilter()), spec = filterSpec(id, kind), isDate = spec.type === 'date';
  const range = ['number', 'effort'].includes(spec.type), options = spec.type === 'boolean' ? [{ value: 'true', name: t("Yes") }, { value: 'false', name: t('No') }] : spec.options;
  const choices = isDate && dateFilterChoices(id, kind);
  openModal(`<form id="column-filter-form"><div class="modal-heading"><h2>${esc(t("Filter column") + ': ' + columnName(id, kind))}</h2></div><div class="form-grid">
    ${isDate ? dateFilterFields(filter, choices) :
      range ? `<label class="field">${esc(t("From"))}<input name="min" type="number" step="any" value="${esc(filter.min)}"></label><label class="field">${esc(t("To"))}<input name="max" type="number" step="any" value="${esc(filter.max)}"></label>` :
      options ? `<fieldset class="field full filter-options"><legend>${esc(t("Allowed values"))}</legend>${options.map(option => `<label><input type="checkbox" name="values" value="${esc(option.value)}" ${filter.values.includes(String(option.value)) ? 'checked' : ''}> ${esc(option.name)}</label>`).join('')}</fieldset>` :
        `<label class="field full">${esc(t("Contains"))}<input name="text" maxlength="200" value="${esc(filter.text)}"></label>`}
    ${isDate ? '' : `<label class="field full">${esc(t("Empty cells"))}<select name="empty">${[['any', "All"], ['empty', "Empty only"], ['filled', "Non-empty only"]].map(([value, label]) => `<option value="${value}" ${value === filter.empty ? 'selected' : ''}>${esc(t(label))}</option>`).join('')}</select></label>`}
    </div><div class="modal-actions"><button type="button" class="button" id="clear-one-filter">${esc(t("Remove filter"))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(t("Cancel"))}</button><button class="button primary" type="submit">${esc(t("Apply"))}</button></div></form>`);
  const apply = value => { if (CustomColumns.activeFilter(value)) columnFilters[kind][id] = value; else delete columnFilters[kind][id]; clearActiveSavedView(); $('#modal').close(); rerenderPreservingView(); };
  $('#clear-one-filter').onclick = () => apply(CustomColumns.emptyFilter());
  document.querySelectorAll('#column-filter-form [data-check-dates]').forEach(button => button.onclick = () => {
    document.querySelectorAll('#column-filter-form input[name="values"]').forEach(box => { box.checked = button.dataset.checkDates === 'all'; });
  });
  $('#column-filter-form').onsubmit = action(event => {
    event.preventDefault();
    const fields = new FormData(event.target), next = isDate ? dateFilterFromForm(fields, choices) : { text: String(fields.get('text') || '').trim(), min: String(fields.get('min') || ''), max: String(fields.get('max') || ''), values: fields.getAll('values'), empty: fields.get('empty') };
    if (next.min && next.max && (spec.type === 'date' ? next.min > next.max : Number(next.min) > Number(next.max))) throw new Error(t("The minimum exceeds the maximum."));
    if (!CustomColumns.validFilters({ [id]: next }, [id], { [id]: spec.type })) throw new Error(t("Invalid column filter."));
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
  if (activeSavedViewId && !savedViews.some(saved => saved.id === activeSavedViewId) && !releaseViewIds().includes(activeSavedViewId)) activeSavedViewId = '';
  if (duplicatesOnly && !duplicateCount) duplicatesOnly = false;
  if (highlightFilter && !['__any', '__none'].includes(highlightFilter) && !highlights.some(h => h.id === highlightFilter)) highlightFilter = '';
  if (highlighter && highlighter !== 'erase' && !highlights.some(h => h.id === highlighter)) highlighter = '';
  if (highlighter === 'erase' && !highlights.length) highlighter = '';
  const sortable = [...columns.map(id => columnDef(id).sort).filter(Boolean), ...(hasColumn('sequence') ? ['sequence'] : [])];
  sort = sort.filter(s => sortable.includes(s.key));
  if (!sort.length) sort = CustomColumns.defaultSort(data.settings);
  const highlightOptions = [['', "All highlights"], ['__any', "Highlighted only"], ['__none', "Not highlighted"]].map(([value, label]) => `<option value="${value}" ${value === highlightFilter ? 'selected' : ''}>${esc(t(label))}</option>`).join('') +
    highlights.map(h => `<option value="${esc(h.id)}" ${h.id === highlightFilter ? 'selected' : ''}>● ${esc(h.name)}</option>`).join('');
  const savedViewOptions = `<option value="">${esc(t("Choose a view…"))}</option>` + (savedViews.length ? `<optgroup label="${esc(t("Saved views"))}">${savedViews.map(saved => `<option value="${esc(saved.id)}" ${saved.id === activeSavedViewId ? 'selected' : ''}>${esc(saved.name)}</option>`).join('')}</optgroup>` : '') + releaseViewOptions();
  const headers = columns.map(id => {
    const def = columnDef(id), label = esc(def.header || (def.field ? def.name : t(def.name))), current = def.sort && sort.find(s => s.key === def.sort);
    const title = def.header ? ` title="${esc(t(def.name))}"` : '';
    return `<th data-column="${id}"${title}><div class="column-heading">${def.sort ? ui`<button data-sort="${def.sort}" title="Click to sort; Shift+click for multi-column sorting">${label} <span>${current ? ico(current.direction === 'asc' ? 'arrow-up' : 'arrow-down') + (sort.length > 1 ? sort.indexOf(current) + 1 : '') : ico('sort')}</span></button>` : `<span>${label}</span>`}${filterHeader(id, 'tasks')}</div></th>`;
  }).join('');
  $('#content').innerHTML = heading(data.settings.tabNames[0], "All tasks, one direction. Plan your work and focus on upcoming releases.",
    csvButton('tasks') + excelButton() + ui`<button class="button primary" id="new-task">${ico('plus')}New task</button>`) + stats() +
    ui`<section class="panel"><div class="table-toolbar"><div class="search-wrap"><span>${ico('search')}</span><input id="search" aria-label="Search tasks" placeholder="Search code, description, incident…" value="${esc(search)}"></div><div class="filters"><select id="status-filter" aria-label="Filter status">${optionList(data.settings.statuses, statusFilter, "All statuses")}</select><select id="highlight-filter" aria-label="Filter by highlight">${highlightOptions}</select><label class="toggle-label"><input id="show-hidden" type="checkbox" ${showHidden ? 'checked' : ''}> Hidden <span class="tiny-count">${hidden}</span></label><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Show only tasks whose incident is also linked to other tasks, hidden ones included"><input id="duplicates-only" type="checkbox" ${duplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicates <span class="tiny-count">${duplicateCount}</span></label><div class="saved-view-tools"><select id="saved-view-select" aria-label="Load a saved view">${savedViewOptions}</select><button type="button" class="button subtle" id="saved-view-manage" aria-haspopup="dialog">Views</button></div><button class="button subtle" id="columns-button" aria-haspopup="dialog" title="Choose which columns to show and in what order">${ico('columns')}Columns</button><button class="button subtle" id="reset-sort" title="Reset to ascending release date">${ico('sort')}Release</button></div></div><div class="highlighter-bar"></div><div class="table-scroll"><table class="activity-table"><thead><tr><th class="select-col"><input type="checkbox" id="select-all" aria-label="Select all shown tasks" title="Select all shown tasks"></th>${headers}<th><span class="sr-only">Actions</span></th></tr></thead><tbody id="task-rows"></tbody></table></div><div class="table-footer"><span id="row-count"></span><span id="footer-hint">Shift + click a column for multi-column sorting</span><div class="bulk-bar" id="bulk-bar" role="toolbar" aria-label="Actions on the selected tasks" hidden><strong id="bulk-count"></strong><button type="button" class="button small primary" id="bulk-edit">${ico('edit')}Bulk edit…</button><button type="button" class="button small" id="bulk-excel">${ico('excel')}Export to Excel</button><button type="button" class="button small subtle" id="bulk-clear">Deselect</button></div></div></section><div class="hint"><span>${ico('sparkle')}</span> One archive, four perspectives. Issues, milestones and kanban update automatically.</div>`;
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
  $('#saved-view-select').onchange = action(async event => {
    const id = event.target.value;
    if (!id) return;
    if ((data.settings.savedViews || []).some(saved => saved.id === id) || !id.startsWith(RELEASE_VIEW)) await applySavedView(id);
    else applyReleaseView(id);
  });
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
  if (!hasColumn('status')) $('#status-filter').remove();
  if (!hasColumn('highlight')) $('#highlight-filter').remove();
  if (!hasColumn('releaseDate')) $('#reset-sort').remove();
  if (!hasColumn('incident') || !hasColumn('code') || !hasColumn('incident', 'issues') || !hasColumn('code', 'issues')) $('#duplicates-only').closest('label').hidden = true;
  const statCards = document.querySelectorAll('.stats > .stat');
  statCards[1].hidden = !hasColumn('releaseDate');
  statCards[2].hidden = !hasColumn('effort');
  statCards[3].hidden = !hasColumn('highlight') && !hasColumn('status');
}
// Every release date gets a ready-made view; ids are "release:<date>" ("release:" for tasks without a date) and are never stored.
const RELEASE_VIEW = 'release:';
function releaseViewGroups() {
  const counts = new Map();
  if (!hasColumn('releaseDate')) return { upcoming: [], past: [], counts, unassigned: 0 };
  let unassigned = 0;
  for (const task of data.tasks) {
    if (task.hidden && !showHidden) continue;
    if (task.releaseDate) counts.set(task.releaseDate, (counts.get(task.releaseDate) || 0) + 1); else unassigned++;
  }
  const day = today(), dates = [...counts.keys()].sort();
  return { upcoming: dates.filter(date => date >= day), past: dates.filter(date => date < day).reverse(), counts, unassigned };
}
function releaseViewIds(groups = releaseViewGroups()) {
  return [...groups.upcoming, ...groups.past, ...(groups.unassigned ? [''] : [])].map(date => RELEASE_VIEW + date);
}
function releaseViewOptions(groups = releaseViewGroups()) {
  const option = (date, label, count) => `<option value="${esc(RELEASE_VIEW + date)}" ${RELEASE_VIEW + date === activeSavedViewId ? 'selected' : ''}>${esc(`${label} (${count})`)}</option>`;
  const upcoming = groups.upcoming.map(date => option(date, `◷ ${formatDate(date)}`, groups.counts.get(date))).join('') + (groups.unassigned ? option('', `◌ ${t("Unassigned")}`, groups.unassigned) : '');
  const past = groups.past.map(date => option(date, `◷ ${formatDate(date)}`, groups.counts.get(date))).join('');
  return (upcoming ? `<optgroup label="${esc(t("Upcoming releases"))}">${upcoming}</optgroup>` : '') + (past ? `<optgroup label="${esc(t("Past releases"))}">${past}</optgroup>` : '');
}
function applyReleaseView(id) {
  const date = id.slice(RELEASE_VIEW.length);
  if (!releaseViewIds().includes(id)) throw new Error(t("The saved view no longer exists."));
  search = ''; statusFilter = ''; highlightFilter = ''; duplicatesOnly = false;
  columnFilters.tasks = { releaseDate: date ? { ...CustomColumns.emptyFilter(), values: [date] } : { ...CustomColumns.emptyFilter(), empty: 'empty' } };
  activeSavedViewId = id;
  $('#modal').open && $('#modal').close();
  render();
  notify(fillText("View “{0}” applied.", `Release ${date ? formatDate(date) : t("Unassigned")}`));
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
    sort: structuredClone(sort), columns: configuredColumns(), columnFilters: structuredClone(columnFilters.tasks)
  };
}
function savedViewSummary(saved) {
  const status = data.settings.statuses.find(item => item.id === saved.statusFilter)?.name;
  const mark = highlightsOf().find(item => item.id === saved.highlightFilter)?.name;
  const columns = saved.columns.filter(column => column.visible).length;
  const order = saved.sort.map(item => `${columnDef(item.key) ? columnName(item.key) : t(Object.values(taskColumnDefs).find(column => column.sort === item.key)?.name || item.key)} ${item.direction === 'asc' ? '↑' : '↓'}`).join(', ');
  return [saved.search && fillText("Search: {0}", saved.search), status && fillText("Status: {0}", status), mark && fillText("Highlight: {0}", mark),
    saved.highlightFilter === '__any' && t("Highlighted only"), saved.highlightFilter === '__none' && t("Not highlighted"),
    saved.showHidden && t("Include hidden"), saved.duplicatesOnly && t("Duplicates only"),
    fillText("{0} columns", columns), ...Object.keys(saved.columnFilters || {}).map(id => columnName(id)), order && fillText("Sort: {0}", order)].filter(Boolean).join(' · ') || t("All tasks");
}
async function saveSavedView(name, existingId = '') {
  const normalized = name.trim();
  if (!normalized || normalized.length > 60) throw new Error(t("The view name must contain 1 to 60 characters."));
  const saved = savedViewSnapshot(normalized, existingId || uid());
  await commit(next => {
    const list = next.settings.savedViews || (next.settings.savedViews = []);
    const duplicate = list.find(item => item.id !== saved.id && item.name.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase());
    if (duplicate) throw new Error(t("A view with this name already exists."));
    const index = list.findIndex(item => item.id === saved.id);
    if (index >= 0) list[index] = saved;
    else {
      if (list.length >= 30) throw new Error(t("You have reached the limit of 30 saved views."));
      list.push(saved);
    }
  });
  activeSavedViewId = saved.id;
  $('#modal').close();
  rerenderPreservingView();
  notify(existingId ? "View updated." : "View saved.");
}
async function applySavedView(id) {
  const saved = (data.settings.savedViews || []).find(item => item.id === id);
  if (!saved) throw new Error(t("The saved view no longer exists."));
  const columns = configuredColumns('tasks', data.settings, saved.columns);
  if (JSON.stringify(columns) !== JSON.stringify(configuredColumns())) {
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
  notify(fillText("View “{0}” applied.", saved.name));
}
function renderSavedViewList() {
  const list = $('#saved-view-list');
  if (!list) return;
  const savedViews = data.settings.savedViews || [];
  list.innerHTML = savedViews.length ? savedViews.map(saved => `<article class="saved-view-item"><div class="saved-view-info"><strong>${esc(saved.name)}</strong><small>${esc(savedViewSummary(saved))}</small></div><button type="button" class="button small primary" data-view-action="apply" data-view-id="${esc(saved.id)}">${esc(t("Open"))}</button><button type="button" class="button small" data-view-action="update" data-view-id="${esc(saved.id)}">${esc(t("Update"))}</button><button type="button" class="button small danger" data-view-action="delete" data-view-id="${esc(saved.id)}" aria-label="${esc(fillText("Delete view {0}", saved.name))}">${ico('close')}</button></article>`).join('') : `<p class="backup-empty">${esc(t("You have not saved any views yet."))}</p>`;
}
function openSavedViews() {
  openModal(ui`<div class="modal-heading"><div><div class="eyebrow">${esc(t("TASK"))}</div><h2>${esc(t("Saved views"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div><p class="section-description">${esc(t("Save filters, sorting and columns to reapply them in one click. Views belong to this organization only."))}</p><p class="filter-note">${esc(t("A view for every release date is created automatically: you find them in the views menu, under “Upcoming releases” and “Past releases”."))}</p><form id="saved-view-form" class="form-grid"><label class="field full">${esc(t("View name"))}<input name="name" maxlength="60" required autocomplete="off" placeholder="${esc(t("e.g. Next release"))}"></label><div class="modal-actions full"><span class="spacer"></span><button type="submit" class="button primary">${esc(t("Save current view"))}</button></div></form><div class="saved-view-list" id="saved-view-list"></div>`);
  const form = $('#saved-view-form');
  form.onsubmit = action(async event => { event.preventDefault(); await saveSavedView(new FormData(form).get('name')); });
  $('#saved-view-list').onclick = action(async event => {
    const button = event.target.closest('[data-view-action]');
    if (!button) return;
    const saved = (data.settings.savedViews || []).find(item => item.id === button.dataset.viewId);
    if (!saved) throw new Error(t("The saved view no longer exists."));
    if (button.dataset.viewAction === 'apply') return applySavedView(saved.id);
    if (button.dataset.viewAction === 'update') return saveSavedView(saved.name, saved.id);
    if (button.dataset.viewAction === 'delete') confirmDialog("Delete the saved view?", saved.name, async () => {
      await commit(next => { next.settings.savedViews = (next.settings.savedViews || []).filter(item => item.id !== saved.id); });
      if (activeSavedViewId === saved.id) activeSavedViewId = '';
      rerenderPreservingView();
      notify("View deleted.");
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
      return `<td class="link-cell">${url ? `<a class="portal-link" href="${esc(url)}" data-open-url title="${esc(t("Open in the default browser") + ': ' + url)}">${esc(url.replace(/^https?:\/\//i, ''))}</a>` : none}</td>`;
    }
    case 'description': return `<td class="description-col"><button class="description-cell" data-edit-task="${task.id}" title="${esc(plain(task.description))}">${esc(plain(task.description) || t("No description"))}</button></td>`;
    case 'urgency': return `<td>${pill(urgency.name, urgency.color)}</td>`;
    case 'status': return `<td>${pill(status.name, status.color, 'status-pill')}</td>`;
    case 'highlight': { const mark = highlightOf(task); return `<td>${mark ? pill(mark.name, mark.color, 'mark-pill') : none}</td>`; }
    case 'tags': return `<td class="tags-cell"><button type="button" class="task-tags-button" data-task-tags="${esc(task.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(t("Edit tags"))}" title="${esc(t("Edit tags"))}">${tagsOf(task).length ? tagChips(task) : `<span class="muted">+ ${esc(t('Tags'))}</span>`}${ico('chevron-down')}</button></td>`;
    case 'effort': return `<td class="effort-cell">${effort(task.effortHours)}</td>`;
    case 'incident': {
      const groups = new Map(duplicateGroups.map(group => [group.key, group]));
      return `<td class="references">${links.incidents.map(incident => {
        const group = groups.get(incident.trim().toUpperCase());
        return group ? `<button type="button" class="dup-ref" data-dup-incident="${esc(group.incident)}" title="${esc(taskDuplicateLines(task.id, [group])[0] + '\n' + t("Click to see only the tasks involved."))}">${ico('copy')}${esc(incident)}</button>` : esc(incident);
      }).join('<br>') || none}</td>`;
    }
    case 'problem': return `<td class="references">${links.problems.map(esc).join('<br>') || none}</td>`;
    case 'releaseDate': return `<td><span class="date-pill" style="--date:${task.releaseDate ? dateColor(task.releaseDate) : '#929bb2'}">${ico('calendar')}${formatDate(task.releaseDate)}</span></td>`;
    case 'notes': return `<td class="notes-col"><button class="description-cell notes-cell" data-edit-task="${task.id}" title="${esc(plain(task.notes) || t("Add notes"))}">${esc(plain(task.notes) || t("Add notes"))}</button></td>`;
    default: return columnDef(column)?.field ? customCell(task, columnDef(column).field) : '<td></td>';
  }
}
function drawTaskRows() {
  const duplicates = duplicatesOf(), issues = indexIssues(data.issues), tasks = sortedRows(filteredTasks(duplicates, issues)), columns = shownColumns();
  $('#task-rows').innerHTML = tasks.map(task => {
    const status = statusOf(task), urgency = urgencyOf(task);
    const links = matchIssues(task, issues), mark = highlightOf(task), duplicateGroups = duplicates.tasks.get(task.id) || [];
    const classes = [status.highlight ? 'highlighted' : '', mark ? 'marked' : '', task.hidden ? 'hidden-row' : '', duplicateGroups.length ? 'duplicate-row' : '', selectedTasks.has(task.id) ? 'selected' : ''].filter(Boolean).join(' ');
    const markLabel = mark ? fillText("Highlight: {0}", mark.name) : t("Highlight row");
    const duplicateLabel = duplicateGroups.length ? [t("Possible duplicate"), ...taskDuplicateLines(task.id, duplicateGroups)].join('\n') : '';
    const duplicateFlag = duplicateGroups.length ? `<button type="button" class="icon-button dup-flag" data-dup-incident="${esc(duplicateGroups[0].incident)}" title="${esc(duplicateLabel + '\n' + t("Click to see only the tasks involved."))}" aria-label="${esc(duplicateLabel.replaceAll('\n', '. '))}">${ico('copy')}</button>` : '';
    const selectLabel = fillText("Select {0}", recordLabel(task));
    return `<tr data-task-row="${esc(task.id)}" title="${esc(t("Double-click the row to edit."))}" class="${classes}" style="--row-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><td class="select-cell"><label class="select-hit" title="${esc(selectLabel + '\n' + t("Shift + click to select a range."))}"><input type="checkbox" data-select-task="${esc(task.id)}" ${selectedTasks.has(task.id) ? 'checked' : ''} aria-label="${esc(selectLabel)}"></label></td>${columns.map(column => taskCell(column, task, status, urgency, links, duplicateGroups)).join('')}<td class="row-actions">${duplicateFlag}<button type="button" class="icon-button mark-button ${mark ? 'is-marked' : ''}" data-mark-task="${esc(task.id)}" title="${esc(markLabel)}" aria-label="${esc(markLabel)}" aria-haspopup="menu" aria-expanded="false"><i class="mark-dot"></i></button><button class="icon-button" data-toggle-task="${task.id}" title="${esc(t(task.hidden ? "Show task" : "Hide task"))}">${ico(task.hidden ? 'eye' : 'eye-off')}</button><button class="icon-button" data-edit-task="${task.id}" title="${esc(t("Edit task"))}">${ico('more')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="${columns.length + 2}" class="empty">${esc(t("No tasks found. Create a new task or change the filters."))}</td></tr>`;
  if (hasColumn('sequence')) document.querySelectorAll('#task-rows .select-cell').forEach((cell, index) => cell.insertAdjacentHTML('afterbegin', dragHandle(recordLabel(tasks[index]))));
  if (hasColumn('sequence')) sortable($('#task-rows'), 'tr[data-task-row]', async (from, to) => {
    try {
      await commit(next => reorderTaskSequences(next.tasks, tasks.map(task => task.id), from, to));
      sort = [{ key: 'sequence', direction: 'asc' }];
      clearActiveSavedView();
      notify("Order saved. Sequence updated.");
    } finally { rerenderPreservingView(); }
    document.querySelector(`[data-task-row="${CSS.escape(tasks[from].id)}"] [data-drag-handle]`)?.focus({ preventScroll: true });
  }, true);
  $('#row-count').textContent = ui`${tasks.length} tasks shown · ${data.tasks.length} total`;
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
  if (!hasColumn('highlight')) document.querySelectorAll('[data-mark-task]').forEach(button => button.remove());
  document.querySelectorAll('#task-rows [data-dup-incident]').forEach(b => b.onclick = () => showTaskDuplicates(b.dataset.dupIncident));
}
// Lists every task sharing the incident, hidden ones included, so duplicates can be compared side by side.
function showTaskDuplicates(incident) {
  search = incident;
  duplicatesOnly = true;
  renderTasks();
  notify(fillText("Tasks sharing incident {0}.", incident));
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
  $('#bulk-count').textContent = count ? fillText("{0} selected", count) + (outside ? ` · ${fillText("{0} not visible with the current filters", outside)}` : '') : '';
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose the new release date.");
    steps.push(task => { task.releaseDate = date; });
  } else if (mode === 'shift') {
    const days = Number(fields.get('shiftDays'));
    if (!Number.isInteger(days) || !days || Math.abs(days) > 3650) throw new Error("Enter how many days to move the release: a whole number other than zero.");
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
  if (!tasks.length) { notify("Select at least one task.", true); return; }
  const keep = `<option value="">${esc(t("— Keep unchanged —"))}</option>`;
  const statuses = settings.statuses.filter(status => tasks.some(task => task.statusId === status.id));
  const items = tasks.map(task => {
    const status = statusOf(task);
    return `<label class="bulk-item ${task.hidden ? 'is-hidden' : ''}"><input type="checkbox" name="taskIds" value="${esc(task.id)}" data-status="${esc(task.statusId)}" checked><strong>${esc(recordLabel(task))}</strong><span class="bulk-desc">${esc(plain(task.description) || t("No description"))}</span>${pill(status.name, status.color)}<span class="bulk-date" style="--date:${task.releaseDate ? dateColor(task.releaseDate) : '#929bb2'}">${ico('calendar')}${formatDate(task.releaseDate)}</span></label>`;
  }).join('');
  const tagRows = tags.map(tag => `<label class="bulk-tag">${pill(tag.name, tag.color, 'tag-pill')}<select name="tag:${esc(tag.id)}" aria-label="${esc(fillText('Tag {0}', tag.name))}"><option value="">—</option><option value="add">${esc(t("＋ Add"))}</option><option value="remove">${esc(t("− Remove"))}</option></select></label>`).join('');
  openModal(ui`<form id="bulk-form" novalidate><div class="modal-heading"><div><div class="eyebrow">${esc(data.settings.tabNames[0])}</div><h2>${esc(t("Bulk edit"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div>${context ? `<p class="section-description">${esc(context)}</p>` : ''}
    <section class="bulk-targets" aria-labelledby="bulk-targets-title"><div class="bulk-targets-head"><strong id="bulk-targets-title">Tasks involved</strong><span class="bulk-quick">${statuses.length > 1 ? statuses.map(status => `<button type="button" class="bulk-status-chip" data-bulk-status="${esc(status.id)}" style="--pill:${esc(status.color)}" title="${esc(fillText("Select only: {0}", status.name))}">${esc(status.name)}</button>`).join('') : ''}<button type="button" class="unsaved-link" data-bulk-all="1">Select all</button><button type="button" class="unsaved-link" data-bulk-all="0">Deselect all</button></span></div><div class="bulk-list">${items}</div></section>
    <div class="form-grid bulk-fields">
      <label class="field">Status<select name="statusId">${keep}${optionList(settings.statuses, '')}</select></label>
      <label class="field">Urgency<select name="urgencyId">${keep}${optionList(settings.urgencies, '')}</select></label>
      <div class="field"><label for="bulk-release-mode">Release date</label><div class="bulk-inline"><select id="bulk-release-mode" name="releaseMode">${keep}<option value="set">Set a date</option><option value="shift">Move by N days</option><option value="clear">Remove the date (unscheduled)</option></select><input type="date" name="releaseDate" aria-label="New release date" hidden><input type="number" name="shiftDays" step="1" value="7" aria-label="Days to move (negative to bring forward)" title="Days to move (negative to bring forward)" hidden></div><small id="bulk-release-hint"></small></div>
      <label class="field">Highlight<select name="highlightId">${keep}<option value="__none">No highlight</option>${optionList(highlightsOf(), '')}</select></label>
      <label class="field">Visibility in the list<select name="hidden">${keep}<option value="hide">Hide from the list</option><option value="show">Show in the list</option></select></label>
      ${tags.length ? ui`<fieldset class="field full bulk-tags"><legend>Tags</legend><div class="bulk-tag-grid">${tagRows}</div></fieldset>` : ''}
    </div><p class="bulk-summary" id="bulk-summary" aria-live="polite"></p>
    <div class="modal-actions"><button type="button" class="button danger" id="bulk-delete">Delete…</button><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="bulk-apply">Apply</button></div></form>`);
  const form = $('#bulk-form'), boxes = [...form.querySelectorAll('input[name="taskIds"]')];
  for (const [id, name] of [['status', 'statusId'], ['urgency', 'urgencyId'], ['highlight', 'highlightId'], ['releaseDate', 'releaseMode']]) {
    if (!hasColumn(id)) form.elements[name].closest('.field').remove();
  }
  if (!hasColumn('tags')) form.querySelector('.bulk-tags')?.remove();
  // Bulk edit cannot empty a mandatory field.
  if (CustomColumns.isRequired(settings, 'tasks', 'releaseDate')) form.querySelector('#bulk-release-mode option[value="clear"]')?.remove();
  if (CustomColumns.isRequired(settings, 'tasks', 'highlight')) form.querySelector('select[name="highlightId"] option[value="__none"]')?.remove();
  if (!hasColumn('releaseDate')) form.querySelectorAll('.bulk-date').forEach(element => element.remove());
  if (!hasColumn('status')) form.querySelectorAll('.bulk-item .pill, [data-bulk-status]').forEach(element => element.remove());
  if (!hasColumn('description')) form.querySelectorAll('.bulk-desc').forEach(element => element.remove());
  const chosen = () => new Set(boxes.filter(box => box.checked).map(box => box.value));
  const summarize = () => {
    const ids = chosen(), mode = form.elements.releaseMode?.value;
    let pending = 0;
    try { pending = bulkPlan(new FormData(form)).steps.length; } catch { pending = 1; }
    if (form.elements.releaseDate) form.elements.releaseDate.hidden = mode !== 'set';
    if (form.elements.shiftDays) form.elements.shiftDays.hidden = mode !== 'shift';
    const dated = tasks.filter(task => ids.has(task.id) && task.releaseDate).length;
    if ($('#bulk-release-hint')) $('#bulk-release-hint').textContent = mode === 'shift' ? fillText("Only tasks with a date: {0} of {1}.", dated, ids.size) : '';
    $('#bulk-summary').textContent = !ids.size ? t("Select at least one task.") : pending ? fillText("Changes will be applied to {0}.", plural(ids.size, "tasks")) : fillText("{0} ready: choose what to change.", plural(ids.size, "tasks"));
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
    if (!ids.size) throw new Error("Select at least one task.");
    if (!plan.steps.length) throw new Error("Choose at least one field to change.");
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
    notify(fillText("Bulk edit applied: {0} updated.", plural(changed, "tasks")));
  });
  $('#bulk-delete').onclick = () => {
    const ids = chosen(), codes = tasks.filter(task => ids.has(task.id)).map(task => task.code);
    if (!ids.size) return;
    confirmDialog("Delete the chosen tasks?", fillText("{0} will be permanently deleted: {1}. Issue associations will remain available.", plural(ids.size, "tasks"), codes.slice(0, 10).join(', ') + (codes.length > 10 ? '…' : '')), async () => {
      let removed = 0;
      await commit(next => {
        const before = next.tasks.length;
        next.tasks = next.tasks.filter(task => !ids.has(task.id));
        removed = before - next.tasks.length;
      });
      ids.forEach(id => { selectedTasks.delete(id); pendingMarks.delete(id); });
      rerenderPreservingView();
      notify(fillText("Tasks deleted: {0}.", removed));
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
  if (!hasColumn('highlight')) { bar.hidden = true; bar.innerHTML = ''; return; }
  const highlights = highlightsOf(), active = highlights.find(h => h.id === highlighter);
  const hint = highlighter === 'erase' ? t("Eraser active: click rows to remove their highlight. Press Esc to finish.")
    : active ? fillText("Highlighter “{0}” active: click rows to color them, click again to remove the color. Press Esc to finish.", active.name)
      : highlights.length ? t("Pick a color and click the rows to highlight, or use the ● dot at the end of each row.") : t("No colors available: add them in the settings.");
  bar.classList.toggle('active', Boolean(highlighter));
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t("Highlighter"));
  bar.title = hint;
  bar.innerHTML = `<span class="highlighter-label">${ico('highlighter')} ${esc(t("Highlighter"))}</span><div class="highlighter-swatches">${highlights.map(h => `<button type="button" class="highlighter-swatch" data-highlighter="${esc(h.id)}" style="--mark:${h.color}" aria-pressed="${h.id === highlighter}" title="${esc(h.name)}"><i aria-hidden="true"></i><span>${esc(h.name)}</span></button>`).join('')}${highlights.length ? `<button type="button" class="highlighter-swatch eraser" data-highlighter="erase" aria-pressed="${highlighter === 'erase'}" title="${esc(t("Remove the highlight from rows"))}">${ico('eraser')}<span>${esc(t("Eraser"))}</span></button>` : ''}</div><span class="highlighter-hint" aria-live="polite">${esc(hint)}</span><button type="button" class="unsaved-link highlighter-manage" data-manage-highlights>${esc(t("Manage colors"))}</button>`;
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
  const item = (value, label, swatch) => `<button type="button" role="menuitemradio" aria-checked="${value === current}" class="mark-choice" data-mark-choice="${esc(value)}">${swatch}<span>${esc(label)}</span>${value === current ? `<b aria-hidden="true">${ico('check')}</b>` : ''}</button>`;
  const menu = document.createElement('div');
  menu.id = 'mark-menu';
  menu.className = 'mark-menu';
  menu.dataset.task = id;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', fillText("Highlight {0}", task.code));
  menu.innerHTML = highlightsOf().map(h => item(h.id, h.name, `<i class="mark-swatch" style="--mark:${h.color}"></i>`)).join('') +
    item('', t("No highlight"), '<i class="mark-swatch none"></i>') +
    `<hr><button type="button" role="menuitem" class="mark-choice" data-manage-highlights><i class="mark-swatch manage" aria-hidden="true">${ico('gear')}</i><span>${esc(t("Manage colors…"))}</span></button>`;
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
const dragHandle = name => `<button type="button" class="drag-handle" data-drag-handle title="${esc(t("Drag to reorder, or use the ↑ ↓ keys"))}" aria-label="${esc(fillText("Reorder “{0}”", name))}"></button>`;
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
          announceOrder(container, fillText("Moved to position {0} of {1}", to + 1, count));
        }).catch(error => notify(error.message, true));
        return;
      }
    }
    rowsOf()[to]?.querySelector('[data-drag-handle]')?.focus();
    if (from !== to) announceOrder(container, fillText("Moved to position {0} of {1}", to + 1, count));
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
        announceOrder(container, t("Move cancelled"));
      }
      dragging = false;
    }
  };
}
function columnEditor(container, columns, kind = 'tasks', settings = data.settings) {
  const draw = focus => {
    container.innerHTML = `<ol class="column-editor">${columns.map((column, index) => {
      const def = columnDef(column.id, kind, settings), name = def.field ? def.name : t(def.name);
      return `<li class="column-row ${column.visible ? '' : 'is-off'}">${dragHandle(name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span><label class="column-toggle"><input type="checkbox" data-column-visible="${column.id}" ${column.visible ? 'checked' : ''}><span>${esc(name)}</span></label>${def.sort ? `<span class="column-tag" title="${esc(t("Click the header to sort"))}">${ico('sort')}${esc(t("Sortable"))}</span>` : ''}<button type="button" class="icon-button" data-column-move="${column.id}:-1" ${index === 0 ? 'disabled' : ''} title="${esc(t("Move up"))}" aria-label="${esc(`${t("Move up")}: ${name}`)}">${ico('arrow-up')}</button><button type="button" class="icon-button" data-column-move="${column.id}:1" ${index === columns.length - 1 ? 'disabled' : ''} title="${esc(t("Move down"))}" aria-label="${esc(`${t("Move down")}: ${name}`)}">${ico('arrow-down')}</button></li>`;
    }).join('')}</ol>`;
    container.querySelectorAll('[data-column-visible]').forEach(input => input.onchange = () => {
      const column = columns.find(item => item.id === input.dataset.columnVisible);
      if (!input.checked && columns.filter(item => item.visible).length === 1) { input.checked = true; notify("At least one column must stay visible.", true); return; }
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
  const columns = configuredColumns(kind);
  openModal(`<div class="modal-heading"><div><div class="eyebrow">${esc(t("TASK"))}</div><h2>${esc(t("List columns"))}</h2></div><button type="button" class="icon-button" data-close aria-label="${esc(t("Close"))}">${ico('close')}</button></div><p class="section-description">${esc(t("Tick the columns to show and drag them (or use the arrows) to change their order. Hiding a column does not delete any data."))}</p><div id="columns-dialog-editor"></div><div class="modal-actions"><button type="button" class="button" id="columns-default">${esc(t("Restore defaults"))}</button><span class="spacer"></span><button type="button" class="button" data-close>${esc(t("Cancel"))}</button><button type="button" class="button primary" id="columns-apply">${esc(t("Apply"))}</button></div>`);
  const container = $('#columns-dialog-editor');
  columnEditor(container, columns, kind);
  $('#columns-default').onclick = () => { columns.splice(0, columns.length, ...configuredColumns(kind, data.settings, [])); columnEditor(container, columns, kind); };
  $('#columns-apply').onclick = action(async () => {
    await commit(next => { next.settings[kind === 'tasks' ? 'taskColumns' : 'issueColumns'] = structuredClone(columns); });
    clearActiveSavedView();
    $('#modal').close();
    rerenderPreservingView();
    notify("Columns updated.");
  });
}
function openModal(html) {
  closeColorPicker();
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
    const fields = searchableValues(task, 'tasks', issues);
    if (!fields.some(value => String(value || '').toLocaleLowerCase().includes(needle))) continue;
    const detail = [hasColumn('releaseDate') && (task.releaseDate ? formatDate(task.releaseDate) : t("Unscheduled")), hasColumn('status') && status, links.incidents.length && `INC ${links.incidents.join(', ')}`, links.problems.length && `PRB ${links.problems.join(', ')}`, task.hidden && t("Hidden")].filter(Boolean).join(' · ');
    results.push({ kind: 'task', id: task.id, title: recordLabel(task), detail, subtitle: hasColumn('description') ? plain(task.description) : '' });
    if (results.length === 40) return results;
  }
  for (const issue of data.issues) {
    if (!searchableValues(issue, 'issues', linkedCounts()).some(value => value.toLocaleLowerCase().includes(needle))) continue;
    results.push({ kind: 'issue', id: issue.id, title: recordLabel(issue, 'issues'), detail: [issue.incident && `INC ${issue.incident}`, issue.problem && `PRB ${issue.problem}`].filter(Boolean).join(' · '), subtitle: '' });
    if (results.length === 40) return results;
  }
  return results;
}
function openGlobalSearch(initial = '') {
  openModal(ui`<div class="modal-heading"><div><div class="eyebrow">${esc(t("GLOBAL SEARCH"))}</div><h2>${esc(t("Search OrbitKanban"))}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div><label class="global-search-field"><span aria-hidden="true">${ico('search')}</span><input id="global-search-input" type="search" autocomplete="off" placeholder="${esc(t("Code, incident, problem, release date…"))}" aria-label="${esc(t("Search tasks and issues"))}"><kbd>Esc</kbd></label><div class="global-search-results" id="global-search-results" role="listbox" aria-label="${esc(t("Search results"))}"></div>`);
  const input = $('#global-search-input'), list = $('#global-search-results');
  const draw = () => {
    const results = globalSearchResults(input.value);
    list.innerHTML = results.length ? results.map((item, index) => `<button type="button" class="global-search-result" role="option" aria-selected="false" data-global-kind="${item.kind}" data-global-id="${esc(item.id)}" ${index === 0 ? 'data-first-result' : ''}><strong>${esc(item.title)}</strong><span class="global-search-kind">${esc(t(item.kind === 'task' ? "Tasks" : 'Issue'))}</span><small>${esc([item.detail, item.subtitle].filter(Boolean).join(' · '))}</small></button>`).join('') : input.value.trim() ? `<p class="backup-empty">${esc(t("No results."))}</p>` : `<p class="backup-empty">${esc(t("Search codes, incidents, problems or release dates."))}</p>`;
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
    if (!item) { notify("This item no longer exists.", true); return; }
    $('#modal').close();
    view = button.dataset.globalKind === 'task' ? 0 : 1;
    render();
    if (view === 0) taskDialog(item); else issueDialog(item);
  };
  draw();
  input.focus();
}
function editor(id, label, html, translateLabel = true) {
  return ui`<div class="field full"><span class="field-label" id="${id}-label">${esc(translateLabel ? t(label) : label)}</span><div class="rich-editor"><div class="rich-toolbar" data-editor="${id}"><button type="button" data-command="bold" title="Bold"><b>B</b></button><button type="button" data-command="italic" title="Italic"><i>I</i></button><button type="button" data-command="underline" title="Underline"><u>U</u></button><button type="button" data-command="insertUnorderedList" title="Bulleted list">• List</button><button type="button" data-command="insertOrderedList" title="Numbered list">1. List</button><button type="button" data-command="removeFormat" title="Clear formatting">Tx</button></div><div id="${id}" class="editable" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-label">${sanitize(html)}</div></div></div>`;
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
function customEditors(kind, record, wrap = true) {
  const fields = CustomColumns.fieldsOf(data.settings, kind);
  if (!fields.length) return '';
  const html = fields.map(field => {
    const value = record.customFields?.[field.id], label = esc(field.name), name = esc(field.id);
    if (field.type === 'richtext') return editor(`editor-${field.id}`, field.name, value || '', false);
    const choice = (value, name, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(name)}</option>`;
    let input;
    if (field.type === 'boolean') input = `<select name="${name}">${choice('', '—', value === undefined)}${choice('true', t("Yes"), value === true)}${choice('false', t('No'), value === false)}</select>`;
    else if (field.type === 'multiselect') input = `<div>${choiceButton(record, field, kind)}${(value || []).map(value => `<input type="hidden" name="${name}" value="${esc(value)}">`).join('')}</div>`;
    else if (field.type === 'select') input = `<select name="${name}">${choice('', '—', !value)}${CustomColumns.choices(field).map(option => choice(option.id, option.name, option.id === value)).join('')}</select>`;
    else input = `<input name="${name}" type="${field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text'}" ${['number', 'effort'].includes(field.type) ? 'step="any"' : 'maxlength="200000"'} ${field.type === 'effort' ? 'min="0"' : ''} value="${esc(value ?? '')}">`;
    return `<label class="field">${label}${input}${field.type === 'effort' ? `<small>${esc(t("Value in hours"))}</small>` : ''}</label>`;
  }).join('');
  return wrap ? `<section class="custom-edit-fields full"><h3>${esc(t("Custom columns"))}</h3><div class="form-grid">${html}</div></section>` : html;
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
  return `<button class="button" id="import-csv-${kind}" type="button">${esc(t("Import CSV"))}</button><input type="file" id="csv-file-${kind}" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden>`;
}
function wireCsvImport(kind) {
  const fileInput = $(`#csv-file-${kind}`);
  $(`#import-csv-${kind}`).onclick = () => fileInput.click();
  fileInput.onchange = action(async () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) await csvImportDialog(file, kind); });
}
async function csvImportDialog(file, kind) {
  if (file.size > Csv.MAX_BYTES) throw new Error(t("The CSV exceeds the 16 MB limit."));
  const buffer = await file.arrayBuffer(), fields = Csv.destinations(data, kind);
  let rows = [], mapping = [], preview;
  openModal(`<form id="csv-import-form"><div class="modal-heading"><div><div class="eyebrow">CSV · ${esc(data.settings.tabNames[kind === 'tasks' ? 0 : 1])}</div><h2>${esc(t("Import CSV"))}</h2></div><button type="button" class="icon-button" data-close aria-label="${esc(t("Close"))}">${ico('close')}</button></div><p>${esc(file.name)}</p>
    <p class="section-description">${esc(t("Rows will be added without overwriting existing ones. Duplicates will be flagged as usual."))}</p>
    <div class="csv-options"><label class="field">${esc(t("Delimiter"))}<select id="csv-separator"><option value="">${esc(t("Automatic"))}</option><option value=";">;</option><option value=",">,</option><option value="tab">Tab</option></select></label><label class="field">${esc(t("Encoding"))}<select id="csv-encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (Excel)</option><option value="utf-16le">UTF-16 LE</option></select></label><label class="checkbox-field"><input id="csv-header" type="checkbox" checked> ${esc(t("First row contains headers"))}</label></div>
    <p class="muted">${esc(t("Dates: YYYY-MM-DD or DD/MM/YYYY. Numbers: decimal point or comma. Multiple choices and tags: separate with |. Configure catalogs and custom columns first."))}</p>
    ${kind === 'tasks' ? `<p class="muted">${esc(t("Incidents and problems are calculated: import them into the linked issues list."))}</p>` : ''}
    <div class="csv-mapping" id="csv-mapping"></div><div id="csv-status" role="status" aria-live="polite"></div><div class="table-scroll csv-preview" id="csv-preview"></div>
    <div class="modal-actions"><span class="spacer"></span><button class="button" type="button" data-close>${esc(t("Cancel"))}</button><button class="button primary" type="submit" id="csv-import" disabled>${esc(t("Import rows"))}</button></div></form>`);
  const showPreview = () => {
    const status = $('#csv-status'), button = $('#csv-import');
    button.disabled = true; preview = undefined; $('#csv-preview').innerHTML = '';
    try {
      preview = Csv.prepareImport(data, kind, rows, mapping);
      status.className = preview.errorCount ? 'csv-errors' : '';
      status.innerHTML = `<p>${esc(fillText("{0} valid rows · {1} errors", preview.records.length, preview.errorCount))}</p>` + (preview.errorCount ? `<ul>${preview.errors.map(error => `<li>${esc(t("Data row") + ' ' + error.row + (error.column ? ` · ${error.custom ? error.column : t(error.column)}` : '') + ': ' + t(error.message))}</li>`).join('')}</ul>` : '');
      const selected = mapping.filter(Boolean).map(id => fields.find(field => field.id === id));
      const text = (record, field) => {
        const value = field.custom ? record.customFields?.[field.id] : field.id === 'effortDays' ? record.effortHours / data.settings.hoursPerDay : record[field.id];
        if (field.type === 'select') return field.options.find(option => option.value === value)?.name || '';
        if (field.type === 'multiselect') return (value || []).map(value => field.options.find(option => option.value === value)?.name || value).join(', ');
        if (field.type === 'effort') return String(value ?? '');
        return customText(value, field);
      };
      $('#csv-preview').innerHTML = `<table><caption>${esc(t("Preview of the first 10 valid rows"))}</caption><thead><tr>${selected.map(field => `<th>${esc(field.custom ? field.name : t(field.name))}</th>`).join('')}</tr></thead><tbody>${preview.records.slice(0, 10).map(record => `<tr>${selected.map(field => `<td>${esc(text(record, field))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      button.disabled = preview.errorCount > 0 || !preview.records.length;
      button.textContent = fillText("Import {0} rows", preview.records.length);
    } catch (error) { status.className = 'csv-errors'; status.textContent = t(error.message); }
  };
  const parse = () => {
    $('#csv-import').disabled = true; rows = []; mapping = []; preview = undefined;
    try {
      let text;
      try { text = new TextDecoder($('#csv-encoding').value, { fatal: true }).decode(buffer); }
      catch { throw new Error(t("The file does not match the selected encoding. Try Windows-1252 or UTF-16 LE.")); }
      const separator = $('#csv-separator').value;
      const parsed = Csv.parseCsv(text, separator === 'tab' ? '\t' : separator), hasHeader = $('#csv-header').checked;
      const headers = hasHeader ? parsed.rows[0] : parsed.rows[0].map((_, i) => `${t("Column")} ${i + 1}`);
      rows = hasHeader ? parsed.rows.slice(1) : parsed.rows;
      mapping = hasHeader ? Csv.suggestMapping(headers, fields) : headers.map(() => '');
      $('#csv-mapping').innerHTML = `<h3>${esc(t("Map columns"))}</h3>${headers.map((header, index) => `<label class="csv-map-row"><span><strong>${esc(header || `${t("Column")} ${index + 1}`)}</strong><small>${esc(rows[0]?.[index]?.slice(0, 100) || '—')}</small></span><select data-csv-column="${index}" aria-label="${esc(t("Destination") + ': ' + header)}"><option value="">${esc(t("Do not import"))}</option>${fields.map(field => `<option value="${esc(field.id)}" ${field.id === mapping[index] ? 'selected' : ''}>${esc((field.custom ? `${field.name} · ${t("Custom")}` : t(field.name)) + ' · ' + t(fieldTypeNames[field.type]))}</option>`).join('')}</select></label>`).join('')}`;
      document.querySelectorAll('[data-csv-column]').forEach(select => select.onchange = () => { mapping[Number(select.dataset.csvColumn)] = select.value; showPreview(); });
      showPreview();
    } catch (error) { $('#csv-mapping').innerHTML = ''; $('#csv-preview').innerHTML = ''; $('#csv-status').className = 'csv-errors'; $('#csv-status').textContent = t(error.message); }
  };
  for (const id of ['csv-separator', 'csv-encoding', 'csv-header']) document.getElementById(id).onchange = parse;
  $('#csv-import-form').onsubmit = action(async event => {
    event.preventDefault();
    if (!preview || preview.errorCount || !preview.records.length) throw new Error(t("Fix the errors before importing."));
    $('#csv-import').disabled = true;
    let count;
    try {
      await commit(next => {
        const result = Csv.prepareImport(next, kind, rows, mapping);
        if (result.errorCount) throw new Error(t("The data or catalogs have changed. Reopen the import and check the mapping."));
        count = result.records.length; next[kind].push(...result.records);
      });
      $('#modal').close(); rerenderPreservingView(); notify(fillText("Imported {0} rows.", count));
    } finally { if ($('#csv-import')) $('#csv-import').disabled = false; }
  });
  parse();
}
function pruneColumnEditors(form, kind) {
  for (const field of CustomColumns.BUILTIN_FIELDS[kind]) {
    if (hasColumn(field.id, kind)) continue;
    const names = field.id === 'effort' ? ['days', 'hours'] : [field.property];
    for (const name of names) if (name) form.querySelector(`[name="${name}"]`)?.closest('.field')?.remove();
    if (field.type === 'richtext') form.querySelector(`#${field.id}-editor`)?.closest('.field')?.remove();
  }
}
// Marks each editor control's container with the field id, so layouts, designers and required checks can find it.
function tagFormFields(form, kind) {
  for (const field of CustomColumns.schemaOf(data.settings, kind)) {
    const element = field.type === 'richtext' ? document.getElementById(field.builtin ? `${field.id}-editor` : `editor-${field.id}`) :
      field.property ? form.elements[field.property] : form.querySelector(`[data-choice-field="${CSS.escape(field.id)}"], [name="${CSS.escape(field.id)}"]`);
    const container = element?.closest?.('.field');
    if (container) container.dataset.formField = field.id;
  }
  if (kind !== 'tasks') return;
  const effort = form.elements.days?.closest('.field');
  if (effort) {
    const group = document.createElement('div');
    group.className = 'form-grid task-effort-fields';
    group.dataset.formField = 'effort';
    effort.before(group);
    group.append(effort, form.elements.hours.closest('.field'));
  }
  form.elements.hidden.closest('.field').dataset.formField = 'hidden';
  const matches = form.querySelector('#match-preview');
  if (matches) matches.dataset.formField = 'matches';
}
// Fields flow row by row like grid auto placement; explicit rows let rich-text rows take the spare height.
function placeSectionFields(fields, columnCount, isRich) {
  let row = 0, column = 0;
  const richRows = new Set(), placed = fields.map(field => {
    const span = Math.min(field.span, columnCount);
    if (column + span > columnCount) { row++; column = 0; }
    if (isRich(field.id)) richRows.add(row);
    const place = { ...field, span, column: column + 1, row: row + 1 };
    column += span;
    return place;
  });
  const rows = fields.length ? row + 1 : 0;
  return { placed, rows: Array.from({ length: rows }, (_, index) => richRows.has(index) ? 'minmax(min-content, 1fr)' : 'auto').join(' ') };
}
const taskLayoutTemplate = columns => columns.map(column => `minmax(0, ${column.width}fr)`).join(' ');
const richTaskFields = settings => new Set(taskEditorFields(settings).filter(field => field.type === 'richtext').map(field => field.id));
// Shared by the task editor and the form designer preview, so the designer is what you get.
function buildTaskLayoutColumns(layout, settings, elementFor, { keepEmpty = false, decorate } = {}) {
  const rich = richTaskFields(settings), shown = [];
  for (const [columnIndex, column] of layout.columns.entries()) {
    const columnElement = document.createElement('div');
    columnElement.className = 'task-form-column';
    columnElement.dataset.layoutColumn = String(columnIndex);
    for (const section of column.sections) {
      const fields = section.fields.filter(field => elementFor(field.id));
      if (!fields.length && !keepEmpty) continue;
      const titled = section.showName && section.name.trim();
      const sectionElement = document.createElement(titled ? 'section' : 'div');
      sectionElement.className = 'task-form-section';
      sectionElement.dataset.section = section.id;
      if (titled) {
        const title = document.createElement('h3');
        title.className = 'task-form-section-title';
        title.id = `task-section-${section.id}-${uid().slice(0, 8)}`;
        title.textContent = section.name;
        sectionElement.setAttribute('aria-labelledby', title.id);
        sectionElement.append(title);
      }
      const grid = document.createElement('div'), { placed, rows } = placeSectionFields(fields, section.columns, id => rich.has(id));
      grid.className = 'task-form-grid';
      grid.style.gridTemplateColumns = `repeat(${section.columns}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = rows;
      for (const field of placed) {
        const element = elementFor(field.id);
        element.style.gridColumn = `${field.column} / span ${field.span}`;
        element.style.gridRow = String(field.row);
        element.classList.toggle('is-rich-field', rich.has(field.id));
        grid.append(element);
      }
      sectionElement.classList.toggle('has-rich', placed.some(field => rich.has(field.id)));
      sectionElement.append(grid);
      decorate?.(sectionElement, section, columnIndex);
      columnElement.append(sectionElement);
    }
    if (columnElement.children.length || keepEmpty) shown.push({ width: column.width, element: columnElement });
  }
  return shown;
}
function applyTaskEditorLayout(form) {
  const layout = normalizeTaskEditorLayout(data.settings), body = form.querySelector('.task-edit-layout'), pool = form.querySelector('.task-edit-pool');
  tagFormFields(form, 'tasks');
  const elements = new Map([...pool.querySelectorAll('[data-form-field]')].map(element => [element.dataset.formField, element]));
  const columns = buildTaskLayoutColumns(layout, data.settings, id => elements.get(id));
  body.append(...columns.map(column => column.element));
  body.style.gridTemplateColumns = taskLayoutTemplate(columns);
  // Fields kept off the form stay in the hidden pool, so their values are saved unchanged.
  pool.hidden = true;
  form.style.setProperty('--task-form-width', `${layout.width}px`);
  if (layout.height) form.style.setProperty('--task-form-height', `${layout.height}px`);
  form.classList.toggle('fixed-height', layout.height > 0);
  if (!columns.length) body.insertAdjacentHTML('afterbegin', `<p class="muted task-form-empty">${esc(t("No fields are on this form. Add them with the form designer in Settings › Task editor layout."))}</p>`);
}
const REQUIRED_CONTROLS = 'input:not([type="hidden"]):not([type="checkbox"]), select, [contenteditable="true"], [data-choice-field]';
function markRequiredFields(form, kind) {
  for (const id of CustomColumns.requiredOf(data.settings, kind)) {
    const container = form.querySelector(`[data-form-field="${CSS.escape(id)}"]`);
    if (!container || container.closest('.task-edit-pool')) continue;
    container.dataset.required = 'true';
    const host = container.querySelector('.field-label, .task-effort-label, label[for], legend') || container;
    const text = [...host.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const mark = document.createElement('span');
    mark.className = 'required-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.title = t("Required");
    mark.textContent = '*';
    if (text) { const label = document.createElement('span'); text.replaceWith(label); label.append(text, mark); } else host.prepend(mark);
    container.querySelectorAll(REQUIRED_CONTROLS).forEach(control => control.setAttribute('aria-required', 'true'));
  }
  const clear = event => clearRequiredError(event.target.closest?.('[data-required]'));
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}
function clearRequiredError(container) {
  if (!container?.classList.contains('is-invalid')) return;
  container.classList.remove('is-invalid');
  container.querySelectorAll('.field-error').forEach(error => error.remove());
  container.querySelectorAll('[aria-invalid]').forEach(control => { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); });
}
// Mandatory fields are checked only where they appear on the form, like business-required fields in a model-driven form.
function checkRequiredFields(form, kind, emptyWhen = {}) {
  const entries = new FormData(form), schema = CustomColumns.schemaOf(data.settings, kind), missing = [];
  const isEmpty = (id, container) => {
    if (emptyWhen[id]) return emptyWhen[id]();
    const rich = container.querySelector('.editable');
    if (rich) return !plain(rich.innerHTML) && !rich.querySelector('img');
    if (schema.find(field => field.id === id)?.type === 'multiselect') return !entries.getAll(id).length;
    return [...container.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select')].every(control => !control.value.trim());
  };
  for (const container of form.querySelectorAll('[data-required="true"]')) {
    clearRequiredError(container);
    if (!isEmpty(container.dataset.formField, container)) continue;
    missing.push(container);
    const error = document.createElement('small');
    error.className = 'field-error';
    error.id = `required-error-${uid()}`;
    error.textContent = t("This field is required.");
    container.classList.add('is-invalid');
    container.append(error);
    container.querySelectorAll(REQUIRED_CONTROLS).forEach(control => {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', error.id);
    });
  }
  if (!missing.length) return;
  const names = missing.map(container => {
    const field = schema.find(item => item.id === container.dataset.formField);
    return field.builtin ? t(field.name) : field.name;
  });
  missing[0].scrollIntoView({ block: 'nearest' });
  missing[0].querySelector(REQUIRED_CONTROLS)?.focus();
  throw new Error(fillText("Fill in the required fields: {0}.", names.join(', ')));
}
function taskDialog(existing) {
  const t = existing || {
    id: uid(), code: '', sequence: Math.max(0, ...data.tasks.map(t => t.sequence)) + 1, url: '', description: '',
    statusId: hasColumn('status') ? data.settings.statuses[0]?.id || '' : '', urgencyId: hasColumn('urgency') ? data.settings.urgencies[Math.min(2, data.settings.urgencies.length - 1)]?.id || '' : '',
    effortHours: 0, releaseDate: '', notes: '', hidden: false, highlightId: '', tagIds: []
  };
  const days = Math.floor(t.effortHours / data.settings.hoursPerDay), hours = Math.round((t.effortHours - days * data.settings.hoursPerDay) * 100) / 100;
  openModal(ui`<form id="task-form" class="task-form"><div class="modal-heading"><div><div class="eyebrow">TASK</div><h2>${tr(existing ? "Edit task" : "A new direction")}</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div><div class="task-edit-layout"></div><div class="task-edit-pool">
    <label class="field">Portal code<input name="code" maxlength="200" value="${esc(t.code)}" placeholder="es. PRJ-1042"></label>
    <label class="field">Sequence<input name="sequence" type="number" min="0" step="1" value="${t.sequence}"></label>
    <label class="field">Urgency<select name="urgencyId">${optionList(data.settings.urgencies, t.urgencyId, "Unassigned")}</select></label>
    <label class="field">Status<select name="statusId">${optionList(data.settings.statuses, t.statusId, "Unassigned")}</select></label>
    <label class="field">Release date<input name="releaseDate" type="date" value="${esc(t.releaseDate)}"></label>
    <label class="field" title="Colors the row in the task list. Colors are managed in Settings › Highlighters.">Highlight<select name="highlightId">${optionList(highlightsOf(), currentMark(t), "No highlight")}</select></label>
    <label class="field"><span class="task-effort-label">Effort in days <small>${esc(fillText("1 day = {0} hours", data.settings.hoursPerDay))}</small></span><input name="days" type="number" min="0" step="0.01" value="${days}"></label>
    <label class="field">Additional effort in hours<input name="hours" type="number" min="0" step="0.01" value="${hours}"></label>
    <div class="field full portal-field"><label for="task-url">Specific link (optional)</label><input id="task-url" name="url" inputmode="url" spellcheck="false" autocomplete="off" maxlength="2000" value="${esc(t.url)}"><small id="portal-link-preview" aria-live="polite"></small></div>
    <label class="field full checkbox-field"><input type="checkbox" name="hidden" ${t.hidden ? 'checked' : ''}> Hide from the task list only (still visible in milestones and kanban)</label>
    <div class="auto-match full" id="match-preview"></div>
    ${customEditors('tasks', t, false)}
    ${editor('description-editor', "Description", t.description)}
    ${editor('notes-editor', "Notes", t.notes)}
    </div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-task">Delete</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary">Save task</button></div></form>`);
  const form = $('#task-form');
  pruneColumnEditors(form, 'tasks');
  if (!hasColumn('code') || !hasColumn('code', 'issues') || !['incident', 'problem'].some(id => hasColumn(id) && hasColumn(id, 'issues'))) $('#match-preview').remove();
  applyTaskEditorLayout(form);
  markRequiredFields(form, 'tasks');
  const updateMatches = () => {
    if (!$('#match-preview')) return;
    const code = form.elements.code?.value || '', links = matchIssues({ code }, data.issues);
    if (!hasColumn('incident') || !hasColumn('incident', 'issues')) links.incidents = [];
    if (!hasColumn('problem') || !hasColumn('problem', 'issues')) links.problems = [];
    const groups = findDuplicates([...data.tasks.filter(task => task.id !== t.id), { ...t, code }], data.issues).tasks.get(t.id) || [];
    $('#match-preview').classList.toggle('has-duplicates', groups.length > 0);
    $('#match-preview').innerHTML = ui`<span>${ico('link')}Automatic link by portal code</span>` + `<div>${hasColumn('incident') && hasColumn('incident', 'issues') ? `Incident: <strong>${esc(links.incidents.join(', ') || '—')}</strong>` : ''} ${hasColumn('problem') && hasColumn('problem', 'issues') ? `Problem: <strong>${esc(links.problems.join(', ') || '—')}</strong>` : ''}</div>` +
      (groups.length ? `<p class="duplicate-warning"><strong>${ico('copy')}${esc(tr("Possible duplicate"))}</strong>${taskDuplicateLines(t.id, groups).map(line => `<span>${esc(line)}</span>`).join('')}</p>` : '');
  };
  form.elements.code?.addEventListener('input', updateMatches); updateMatches(); wireEditors();
  const generatedLink = () => portalUrl({ code: form.elements.code?.value || '', url: '' }, data.settings);
  const updateLink = () => {
    if (!form.elements.url) return;
    const override = normalizeUrl(form.elements.url.value), generated = generatedLink(), effective = override || generated;
    form.elements.url.placeholder = generated || tr("https://portal.company.com/browse/PRJ-1042");
    $('#portal-link-preview').innerHTML = !effective
      ? esc(tr(data.settings.portalUrlTemplate ? "Enter the portal code to generate the link." : "No link: set the link template in the organization settings or enter a specific link."))
      : isWebUrl(effective)
        ? `${esc(tr(override ? "Specific link" : "Link generated from the organization template"))}: <a class="portal-link" href="${esc(effective)}" data-open-url>${esc(effective)}${ico('external')}</a>`
        : `<span class="portal-error">${esc(tr("The link must start with http:// or https://."))}</span>`;
  };
  form.elements.code?.addEventListener('input', updateLink);
  form.elements.url?.addEventListener('input', updateLink); updateLink();
  form.onsubmit = action(async event => {
    event.preventDefault();
    const fields = new FormData(form);
    checkRequiredFields(form, 'tasks', {
      effort: () => Number(fields.get('days')) * data.settings.hoursPerDay + Number(fields.get('hours')) <= 0,
      link: () => !(normalizeUrl(fields.get('url')) || generatedLink())
    });
    let url = normalizeUrl(fields.get('url'));
    if (url && !isWebUrl(url)) throw new Error("The link must start with http:// or https://.");
    if (url === generatedLink()) url = '';
    const sequence = String(fields.get('sequence') ?? '').trim();
    const item = {
      ...t, code: (fields.get('code') || '').trim(), sequence: Number(sequence), url,
      description: sanitize($('#description-editor')?.innerHTML || ''), notes: sanitize($('#notes-editor')?.innerHTML || ''),
      urgencyId: fields.get('urgencyId') || '', statusId: fields.get('statusId') || '', releaseDate: fields.get('releaseDate') || '',
      effortHours: Math.round((Number(fields.get('days')) * data.settings.hoursPerDay + Number(fields.get('hours'))) * 100) / 100,
      hidden: fields.has('hidden'), highlightId: fields.get('highlightId') || '', customFields: readCustomEditors(form, 'tasks')
    };
    pendingMarks.delete(item.id);
    await commit(next => {
      const index = next.tasks.findIndex(x => x.id === item.id);
      // An empty sequence takes the next free number, as for new tasks; a deleted sequence column stays empty.
      if (!sequence && hasColumn('sequence')) item.sequence = Math.max(0, ...next.tasks.filter(x => x.id !== item.id).map(x => x.sequence)) + 1;
      if (index >= 0) next.tasks[index] = { ...item, tagIds: next.tasks[index].tagIds }; else next.tasks.push(item);
    });
    $('#modal').close(); rerenderPreservingView(); notify("Task saved.");
  });
  if (existing) $('#delete-task').onclick = () => confirmDialog("Delete this task?", `${t.code} will be permanently deleted. Issue associations will remain available.`, async () => {
    await commit(next => { next.tasks = next.tasks.filter(x => x.id !== t.id); }); rerenderPreservingView(); notify("Task deleted.");
  });
}
function confirmDialog(title, message, callback) {
  if ($('#modal').open) $('#modal').close();
  openModal(ui`<div class="modal-heading"><h2>${esc(t(title))}</h2></div><p class="confirm-message">${esc(t(message))}</p><div class="modal-actions"><span class="spacer"></span><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-action">Confirm</button></div>`);
  $('#confirm-action').onclick = action(async () => { await callback(); $('#modal').close(); });
}
function linkedCounts() {
  const counts = new Map();
  for (const task of data.tasks) { const code = task.code.trim().toUpperCase(); if (code) counts.set(code, (counts.get(code) || 0) + 1); }
  return counts;
}
function filteredIssues(query = issueSearch, duplicates = duplicatesOf(), counts = linkedCounts()) {
  return data.issues.filter(issue => (!issueDuplicatesOnly || duplicates.issues.has(issue.id)) &&
    (!query || searchableValues(issue, 'issues', counts).some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) &&
    passesColumnFilters(issue, 'issues', counts));
}
function renderIssues() {
  const duplicates = duplicatesOf(), duplicateCount = duplicates.issues.size, identicalIds = new Set(duplicates.identical), columns = shownIssueColumns(), counts = linkedCounts();
  if (issueDuplicatesOnly && !duplicateCount) issueDuplicatesOnly = false;
  $('#content').innerHTML = heading(data.settings.tabNames[1], "Connect work to its origin. Multiple incidents can share the same problem.", csvButton('issues') + excelButton() + ui`<button class="button primary" id="new-issue">${ico('plus')}New association</button>`) +
    ui`<div class="info-banner">${ico('link')}Incidents and problems are automatically linked to tasks with the same portal code, regardless of letter case.</div><section class="panel"><div class="table-toolbar"><strong id="issue-count">${data.issues.length} associations</strong><div class="filters"><input id="issue-search" class="issue-search" value="${esc(issueSearch)}" placeholder="Search code, incident or problem…" aria-label="Search associations"><label class="toggle-label duplicate-toggle ${duplicateCount ? 'has-duplicates' : ''}" title="Show only associations whose incident appears in more than one row"><input id="issue-duplicates-only" type="checkbox" ${issueDuplicatesOnly ? 'checked' : ''} ${duplicateCount ? '' : 'disabled'}> Duplicates <span class="tiny-count">${duplicateCount}</span></label><button class="button subtle" id="issue-columns-button">${ico('columns')}Columns</button>${identicalIds.size ? ui`<button class="button subtle" id="remove-identical" title="Delete associations with the same portal code, incident and problem as another one, keeping the first">Remove identical <span class="tiny-count">${identicalIds.size}</span></button>` : ''}</div></div>${columnFilterBar('issues')}<div class="table-scroll"><table><thead><tr>${columns.map(id => `<th data-column="${esc(id)}"><div class="column-heading"><span>${esc(columnDef(id, 'issues').field ? columnDef(id, 'issues').name : t(columnDef(id, 'issues').name))}</span>${filterHeader(id, 'issues')}</div></th>`).join('')}<th>Actions</th></tr></thead><tbody id="issue-rows"></tbody></table></div></section>`;
  function rows(query = $('#issue-search').value) {
    issueSearch = query;
    const issues = filteredIssues(query, duplicates, counts);
    $('#issue-count').textContent = `${issues.length} / ${data.issues.length} ${t("associations")}`;
    $('#issue-rows').innerHTML = issues.map(i => {
      const count = counts.get(i.code.trim().toUpperCase()) || 0, group = duplicates.issues.get(i.id);
      const identical = identicalIds.has(i.id) ? `<span class="dup-note" title="${esc(t("Same portal code, incident and problem as another association."))}">${esc(t("identical"))}</span>` : '';
      const incident = group ? `<button type="button" class="dup-ref" data-dup-issue="${esc(group.incident)}" title="${esc(issueDuplicateLine(i.id, group) + '\n' + t("Click to see only the associations involved."))}">${ico('copy')}${esc(i.incident)}</button>${identical}` : esc(i.incident) || '—';
      const cells = { code: `<td><button class="code-link" data-issue="${i.id}">${esc(i.code)}</button></td>`, incident: `<td>${incident}</td>`, problem: `<td>${pill(i.problem || '—', '#9d8de8')}</td>`, linked: `<td><span class="${count ? 'linked' : 'muted'}">${count ? ui`${ico('link')}${count} linked tasks` : t("Waiting for a task")}</span></td>` };
      return ui`<tr data-issue-row="${esc(i.id)}" class="${group ? 'duplicate-row' : ''}" title="Double-click the row to edit.">${columns.map(id => cells[id] || customCell(i, columnDef(id, 'issues').field, 'issues')).join('')}<td><button class="button small" data-issue="${i.id}">Edit</button></td></tr>`;
    }).join('') || ui`<tr><td colspan="${columns.length + 1}" class="empty">No associations. Add a portal code with an incident and/or problem.</td></tr>`;
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
  if (identicalIds.size) $('#remove-identical').onclick = () => confirmDialog("Remove identical associations?", "Associations with the same portal code, incident and problem as another one are deleted, keeping the first of each group. Task incidents and problems do not change.", async () => {
    let removed = 0;
    await commit(next => {
      const ids = new Set(findDuplicates(next.tasks, next.issues).identical);
      removed = ids.size;
      next.issues = next.issues.filter(issue => !ids.has(issue.id));
    });
    rerenderPreservingView(); notify(fillText("Identical associations removed: {0}.", removed));
  });
}
function issueDialog(existing) {
  const issue = existing || { id: uid(), code: '', incident: '', problem: '' };
  openModal(ui`<form id="issue-form"><div class="modal-heading"><h2>${t(existing ? "Edit association" : "New association")}</h2><button class="icon-button" type="button" data-close aria-label="Close">${ico('close')}</button></div><div class="form-grid">
    <label class="field full">Portal code<input name="code" value="${esc(issue.code)}" list="task-codes"><datalist id="task-codes">${[...new Set(data.tasks.map(t => t.code).filter(Boolean))].map(code => `<option value="${esc(code)}">`).join('')}</datalist></label>
    <label class="field">Incident<input name="incident" value="${esc(issue.incident)}" placeholder="INC-00001"></label><label class="field">Problem<input name="problem" value="${esc(issue.problem)}" placeholder="PRB-00001"></label>
    <p class="duplicate-warning full" id="issue-duplicate" hidden></p>
    ${customEditors('issues', issue)}
    </div><div class="modal-actions">${existing ? ui`<button type="button" class="button danger" id="delete-issue">Delete</button>` : ''}<span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button class="button primary" type="submit">Save association</button></div></form>`);
  const form = $('#issue-form');
  pruneColumnEditors(form, 'issues');
  tagFormFields(form, 'issues');
  markRequiredFields(form, 'issues');
  // Warns while typing when the incident is already in another association; saving stays possible.
  const updateDuplicate = () => {
    const draft = { id: issue.id, code: form.elements.code?.value || '', incident: form.elements.incident?.value || '', problem: form.elements.problem?.value || '' };
    const issues = [...data.issues.filter(i => i.id !== issue.id), draft], result = findDuplicates(data.tasks, issues), group = result.issues.get(issue.id);
    $('#issue-duplicate').hidden = !group;
    $('#issue-duplicate').innerHTML = group ? `<strong>${ico('copy')}${esc(t(result.identical.includes(issue.id) ? "An identical association already exists" : "Incident already present"))}</strong><span>${esc(issueDuplicateLine(issue.id, group, issues))}</span><span>${esc(t("You can still save: the association will be flagged as a duplicate."))}</span>` : '';
  };
  for (const name of ['code', 'incident', 'problem']) form.elements[name]?.addEventListener('input', updateDuplicate);
  updateDuplicate(); wireEditors();
  $('#issue-form').onsubmit = action(async e => {
    e.preventDefault();
    checkRequiredFields(form, 'issues');
    const fields = new FormData(e.target);
    const item = { ...issue, id: issue.id, code: (fields.get('code') || '').trim(), incident: (fields.get('incident') || '').trim(), problem: (fields.get('problem') || '').trim(), customFields: readCustomEditors(form, 'issues') };
    await commit(next => {
      const index = next.issues.findIndex(i => i.id === item.id);
      if (index < 0) next.issues.push(item); else next.issues[index] = item;
    });
    $('#modal').close(); rerenderPreservingView(); notify("Association saved. Tasks updated.");
  });
  if (existing) $('#delete-issue').onclick = () => confirmDialog("Delete this association?", "The associated incidents and problems will no longer appear on tasks unless other associations exist.", async () => {
    await commit(next => { next.issues = next.issues.filter(i => i.id !== issue.id); }); rerenderPreservingView();
  });
}
function miniTask(t, readOnly = false) {
  const status = statusOf(t), urgency = urgencyOf(t), mark = highlightOf(t), label = recordLabel(t);
  return `<article class="task-card ${t.hidden ? 'is-hidden' : ''} ${mark ? 'is-marked' : ''}" style="--card-color:${status.color}${mark ? `;--mark:${mark.color}` : ''}"><div class="card-top">${readOnly ? `<strong class="code-label">${esc(label)}</strong>` : `<button class="code-link" data-card="${t.id}">${esc(label)}</button>`}${portalAnchor(portalUrl(t, data.settings), label, 'external-link card-portal-link')}<span class="card-sequence">${t.hidden ? `<span class="hidden-badge" title="${esc(tr("Hidden from the task list"))}">${ico('eye-off')}${tr("Hidden in list")}</span>` : ''}${hasColumn('sequence') ? '#' + t.sequence : ''}</span></div>${hasColumn('description') ? `<div class="card-title">${esc(plain(t.description) || tr("No description"))}</div>` : ''}<div class="card-meta">${hasColumn('urgency') ? pill(urgency.name, urgency.color) : ''}${hasColumn('effort') ? `<span>${effort(t.effortHours)}</span>` : ''}${mark ? `<span class="mark-chip" title="${esc(tr("Highlight"))}">${esc(mark.name)}</span>` : ''}</div><div class="card-bottom">${hasColumn('releaseDate') ? `<span style="color:${t.releaseDate ? dateColor(t.releaseDate) : 'inherit'}">${ico('calendar')}${formatDate(t.releaseDate)}</span>` : ''}${!readOnly && hasColumn('status') ? pill(status.name, status.color) : ''}</div></article>`;
}
function unavailableColumnView(index, id) {
  $('#content').innerHTML = heading(data.settings.tabNames[index], '') + `<section class="panel empty"><p>${esc(fillText("This view needs the {0} column. Restore it in Column management.", t(taskColumnDefs[id].name)))}</p><button class="button" id="restore-view-column">${esc(t("Column management"))}</button></section>`;
  $('#restore-view-column').onclick = () => openSettingsTab('custom-columns');
}
function renderMilestones() {
  if (!hasColumn('releaseDate')) { unavailableColumnView(2, 'releaseDate'); return; }
  const tasks = data.tasks, dates = [...new Set(tasks.map(t => t.releaseDate).filter(Boolean))].sort();
  milestoneDay = today();
  const nextDate = nextReleaseDate(tasks, milestoneDay), nextLabel = nextDate === milestoneDay ? "Today's release" : "Next release";
  if (tasks.some(t => !t.releaseDate)) dates.push('');
  const shortcut = nextDate ? `<button type="button" class="button next-release-link" id="next-release-button" aria-controls="next-release-milestone" title="${esc(t("Go to next release"))}">${esc(t(nextLabel))} · ${esc(formatDate(nextDate))}</button>` : `<span class="view-label next-release-empty">${esc(t("No upcoming release"))}</span>`;
  $('#content').innerHTML = heading(data.settings.tabNames[2], "Every release is a milestone. Dates and tasks stay automatically aligned.", ui`<span class="view-label">${dates.filter(Boolean).length} milestones · ${tasks.length} tasks</span>` + shortcut + excelButton()) +
    ui`<div class="milestone-shell"><div class="milestone-scroll"><div class="milestone-track">${dates.map((date, index) => {
      const group = tasks.filter(t => t.releaseDate === date), color = date ? dateColor(date) : '#929bb2', isNext = Boolean(nextDate && date === nextDate);
      return ui`<section class="milestone-column ${isNext ? 'is-next-release' : ''}" data-release-date="${esc(date)}" ${isNext ? 'id="next-release-milestone" aria-current="step"' : ''} style="--milestone:${color}"><div class="timeline-label"><span>${date ? ui`MILESTONE ${String(index + 1).padStart(2, '0')}` : 'BACKLOG'}</span>${isNext ? `<span class="next-release-badge">${esc(t(nextLabel))}</span>` : ''}</div><div class="timeline-line"><span>${ico('diamond')}</span></div><div class="milestone-heading"><h2>${formatDate(date)}</h2><span>${group.length} tasks${hasColumn('effort') ? ' · ' + effort(group.reduce((sum, t) => sum + t.effortHours, 0)) : ''}</span><button type="button" class="icon-button milestone-bulk" data-bulk-release="${esc(date)}" title="${esc(t("Bulk edit the tasks of this milestone"))}" aria-label="${esc(t("Bulk edit the tasks of this milestone"))}">${ico('edit')}</button></div><div class="milestone-cards">${sortedRows(group).map(t => miniTask(t)).join('')}</div></section>`;
    }).join('') || ui`<div class="empty">Add tasks and release dates to build your roadmap.</div>`}</div></div></div><div class="hint"><span>${ico('arrows-h')}</span> Scroll horizontally to explore releases and vertically to see all tasks. The same date has the same color in every view.</div>`;
  document.querySelectorAll('[data-card]').forEach(b => b.onclick = () => taskDialog(data.tasks.find(t => t.id === b.dataset.card)));
  document.querySelectorAll('[data-bulk-release]').forEach(button => button.onclick = () => {
    const date = button.dataset.bulkRelease;
    bulkDialog(data.tasks.filter(task => task.releaseDate === date).map(task => task.id), date ? fillText("Tasks of the {0} release, hidden ones included.", formatDate(date)) : t("Unscheduled tasks, hidden ones included."));
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
  if (!hasColumn('status')) { unavailableColumnView(3, 'status'); return; }
  const tasks = data.tasks;
  $('#content').innerHTML = heading(data.settings.tabNames[3], "A read-only view, always aligned with your tasks. One space for every status.", ui`<span class="readonly-badge">${ico('lock')}Read only</span>` + excelButton()) +
    ui`<div class="kanban-scroll"><div class="kanban-board">${workflowStatuses().map(status => {
      const items = sortTasks(tasks.filter(t => t.statusId === status.id));
      return `<section class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${esc(status.name)}</span><b>${items.length}</b></div><div class="kanban-cards">${items.map(t => miniTask(t, true)).join('') || ui`<div class="kanban-empty">Room for upcoming tasks</div>`}</div></section>`;
    }).join('')}</div></div><div class="hint"><span>${ico('lock')}</span> To change a status, use the task list. Configure column order in settings.</div>`;
}
// ---- In-app guide (view 5): content and texts come from guide.js, translated as exact terms ----
const foldText = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
const fillTerm = (text, value) => term(text).replaceAll('{0}', () => String(value));
function guideInline(text) {
  const keys = new Set(window.OrbitaGuide.keyWords().map(term));
  return esc(term(text))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, (_, value) => {
      const parts = value.split('+');
      return parts.every(part => window.OrbitaGuide.isLiteralKey(part) || keys.has(part)) ? parts.map(part => `<kbd>${part}</kbd>`).join('+') : `<code>${value}</code>`;
    });
}
// Settings tabs are resolved from the saved settings, so a leftover draft never adds or hides a destination.
function guideSettingsTarget(id) {
  const fixed = settingsTabs.find(tab => tab.id === id);
  if (fixed) return id !== 'portal' || hasColumn('link') ? t(fixed.label) : '';
  const field = CustomColumns.schemaOf(data.settings, 'tasks').find(item => item.catalog === id && ['select', 'multiselect'].includes(item.type));
  return field ? t(field.name) : '';
}
function guideSections() {
  return window.OrbitaGuide.sections.map(section => ({
    ...section,
    name: section.tab === undefined ? term(section.title) : data.settings.tabNames[section.tab],
    go: (section.go || []).map(target => target.view !== undefined
      ? { attr: `data-guide-view="${target.view}"`, label: data.settings.tabNames[target.view] }
      : { attr: `data-guide-settings="${esc(target.settings)}"`, label: guideSettingsTarget(target.settings) }).filter(target => target.label)
  }));
}
function guideShortcuts(section) {
  const combo = keys => `<span class="guide-combo">${keys.map(key => `<kbd>${esc(term(key))}</kbd>`).join('+')}</span>`;
  return `<table class="guide-shortcuts"><thead><tr><th scope="col">${esc(term("Shortcut"))}</th><th scope="col">${esc(term("Action"))}</th></tr></thead><tbody>${section.shortcuts.map(([combos, description]) => `<tr data-guide-topic><td>${combos.map(combo).join('<span class="guide-or">/</span>')}</td><td>${guideInline(description)}</td></tr>`).join('')}</tbody></table>`;
}
function guideSection(section) {
  const body = section.shortcuts ? guideShortcuts(section) : `<div class="guide-topics">${section.topics.map(topic => `<section class="guide-topic" data-guide-topic><h3>${esc(term(topic.title))}${topic.desktop ? `<span class="guide-badge">${esc(term("Desktop app only"))}</span>` : ''}</h3><ul>${topic.items.map(item => `<li>${guideInline(item)}</li>`).join('')}</ul></section>`).join('')}</div>`;
  const actions = section.go.length ? `<div class="guide-actions">${section.go.map(target => `<button type="button" class="button small" ${target.attr}>${esc(fillTerm("Go to {0}", target.label))}</button>`).join('')}</div>` : '';
  return `<article class="panel guide-section" id="guide-${section.id}" data-guide-id="${section.id}" aria-labelledby="guide-${section.id}-title"><header class="guide-section-head"><span class="guide-section-icon" aria-hidden="true">${ico(section.icon, section.family)}</span><div><h2 id="guide-${section.id}-title" tabindex="-1">${esc(section.name)}</h2><p>${guideInline(section.summary)}</p></div></header>${body}${actions}</article>`;
}
function renderGuide() {
  const sections = guideSections();
  const searchField = `<label class="theme-search guide-search"><span aria-hidden="true">${ico('search')}</span><input type="search" id="guide-search" placeholder="${esc(term("Search the guide…"))}" aria-label="${esc(term("Search the guide"))}" autocomplete="off" spellcheck="false" value="${esc(guideQuery)}"></label>`;
  $('#content').innerHTML = `<div id="guide-page"><section class="page-heading"><div><h1>${esc(term("Guide"))}<span class="title-dot">.</span></h1><p>${esc(term("Everything OrbitKanban can do, explained step by step."))}</p></div><div class="heading-actions">${searchField}</div></section>
    <div class="guide-layout"><nav class="guide-nav" aria-label="${esc(term("Guide contents"))}">${sections.map(section => `<button type="button" class="guide-nav-link" data-guide-section="${section.id}"><span class="settings-tab-icon" aria-hidden="true">${ico(section.icon, section.family)}</span><span class="guide-nav-text">${esc(section.name)}</span></button>`).join('')}</nav>
    <div class="guide-body"><p class="sr-only" id="guide-status" role="status" aria-live="polite"></p><p class="panel guide-empty" id="guide-empty" hidden>${esc(term("No topics match your search."))}</p>${sections.map(guideSection).join('')}</div></div></div>`;
  $('#guide-search').oninput = event => { guideQuery = event.target.value; guidePinned = null; filterGuide(); };
  $('#guide-page').addEventListener('click', event => {
    const link = event.target.closest('[data-guide-section]');
    if (link) { showGuideSection(link.dataset.guideSection); return; }
    const target = event.target.closest('[data-guide-view],[data-guide-settings]');
    if (target?.dataset.guideSettings) openSettingsTab(target.dataset.guideSettings);
    else if (target) { view = Number(target.dataset.guideView); render(); }
  });
  filterGuide();
}
function showGuideSection(id) {
  const section = document.getElementById(`guide-${id}`);
  if (!section || section.hidden) return;
  section.scrollIntoView({ block: 'start' });
  section.querySelector('h2').focus({ preventScroll: true });
  guidePinned = { id, scrollTop: $('#content').scrollTop };
  markGuideSection();
}
function filterGuide() {
  const query = foldText(guideQuery.trim());
  let shown = 0;
  document.querySelectorAll('.guide-section').forEach(section => {
    const whole = !query || foldText(section.querySelector('.guide-section-head').textContent).includes(query);
    let visible = 0;
    section.querySelectorAll('[data-guide-topic]').forEach(topic => {
      topic.hidden = !whole && !foldText(topic.textContent).includes(query);
      if (!topic.hidden) visible++;
    });
    section.hidden = !visible;
    document.querySelector(`[data-guide-section="${section.dataset.guideId}"]`).hidden = !visible;
    shown += visible;
  });
  $('#guide-empty').hidden = shown > 0;
  $('#guide-status').textContent = query ? fillTerm("Matching topics: {0}", shown) : '';
  markGuideSection();
}
// The contents entry follows the section at the top of the page; a section chosen from the contents stays marked until the page scrolls.
function markGuideSection() {
  const content = $('#content');
  if (view !== 5 || !$('#guide-page')) return;
  const sections = [...document.querySelectorAll('.guide-section:not([hidden])')];
  let current = sections[0]?.dataset.guideId;
  if (guidePinned && guidePinned.scrollTop === content.scrollTop && sections.some(section => section.dataset.guideId === guidePinned.id)) current = guidePinned.id;
  else {
    guidePinned = null;
    const line = content.getBoundingClientRect().top + Math.min(160, content.clientHeight / 3);
    for (const section of sections) if (section.getBoundingClientRect().top <= line) current = section.dataset.guideId;
  }
  const previous = document.querySelector('.guide-nav-link.active')?.dataset.guideSection;
  document.querySelectorAll('.guide-nav-link').forEach(link => {
    const active = link.dataset.guideSection === current;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
  });
  // Scrolls only the contents list, never the page, so the marked entry stays visible in both layouts.
  const nav = $('.guide-nav'), link = document.querySelector('.guide-nav-link.active');
  if (!link || current === previous) return;
  const navBox = nav.getBoundingClientRect(), box = link.getBoundingClientRect();
  if (box.left < navBox.left) nav.scrollLeft -= navBox.left - box.left + 8;
  else if (box.right > navBox.right) nav.scrollLeft += box.right - navBox.right + 8;
  if (box.top < navBox.top) nav.scrollTop -= navBox.top - box.top + 8;
  else if (box.bottom > navBox.bottom) nav.scrollTop += box.bottom - navBox.bottom + 8;
}
let guideScrollFrame = 0;
$('#content').addEventListener('scroll', () => {
  if (view !== 5 || guideScrollFrame) return;
  guideScrollFrame = requestAnimationFrame(() => { guideScrollFrame = 0; markGuideSection(); });
}, { passive: true });
function openGuide() {
  if (view === 5) { $('#guide-search')?.focus(); return; }
  view = 5;
  render();
}
// ---- Excel export of the current situation ----
const excelButton = () => `<button type="button" class="button excel-button" data-excel-export title="${esc(t("Export the current situation to an Excel file"))}">${ico('excel')}Excel</button>`;
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
const EXCEL_SHEETS = [['summary', "Summary", "Totals, active filters and breakdown by status and urgency"], ['tasks', 0, "One row per task with colors, links, dates and incidents"], ['issues', 1, "Associations, custom columns and flagged duplicates"], ['milestones', 2, "One row per release with effort and statuses"], ['kanban', 3, "Tasks in columns, one per status"]];
let excelChoices = { scope: 'view', columns: 'visible', sheets: EXCEL_SHEETS.map(([id]) => id) };
function excelTasks(scope) {
  if (scope === 'selected') return sortedRows(data.tasks.filter(task => selectedTasks.has(task.id)));
  return sortedRows(scope === 'all' ? data.tasks : filteredTasks());
}
function columnFilterDescriptions(kind) {
  return Object.entries(columnFilters[kind]).map(([id, filter]) => `${columnName(id, kind)}: ${filterSummary(id, kind, filter)}`);
}
function activeFilterText(kind = 'tasks') {
  if (kind === 'issues') return [issueSearch && `${t("Search")}: ${issueSearch}`, issueDuplicatesOnly && t("Duplicates only"), ...columnFilterDescriptions(kind)].filter(Boolean).join(' · ') || t("None");
  const status = data.settings.statuses.find(s => s.id === statusFilter);
  const highlight = { __any: t("Highlighted only"), __none: t("Not highlighted") }[highlightFilter] || highlightsOf().find(h => h.id === highlightFilter)?.name;
  const parts = [search && `${t("Search")}: “${search}”`, status && `${t("Status")}: ${status.name}`, highlight && `${t("Highlight")}: ${highlight}`, showHidden && t("Hidden included"), duplicatesOnly && t("Duplicates only")].filter(Boolean);
  parts.push(...columnFilterDescriptions('tasks'));
  return parts.join(' · ') || t("None");
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
  const statuses = workflowStatuses(), urgencies = hasColumn('urgency') ? [...settings.urgencies, ...(tasks.some(task => !task.urgencyId) ? [unassignedOption()] : [])] : [];
  if (wanted.has('milestones') && !hasColumn('releaseDate') || wanted.has('kanban') && !hasColumn('status')) throw new Error(t("Selected views need deleted columns. Restore the columns or choose other sheets."));
  const nextDate = nextReleaseDate(tasks, today());
  const sheets = [];
  if (wanted.has('summary')) {
    const scopeLabel = { view: t("As shown in the list"), all: t("All tasks"), selected: t("Selected only") }[options.scope];
    const label = text => ({ v: t(text), style: { color: muted } });
    const dated = tasks.filter(task => task.releaseDate), hidden = tasks.filter(task => task.hidden).length, total = hours(tasks);
    const highlighted = tasks.filter(task => highlightOf(task) || statusOf(task).highlight).length, duplicated = tasks.filter(task => duplicates.tasks.has(task.id)).length;
    const breakdown = (title, items, of) => [section(t(title)), [title, "Tasks", "Hours", 'Effort', '%'].map(text => ({ v: t(text), style: header })),
      ...items.map(item => {
        const group = tasks.filter(task => of(task) === item.id), cell = { border: grid };
        return [{ v: item.name, style: { ...cell, bold: true, fill: tint(item.color, 0.35) } }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? effort(hours(group)) : '', style: cell }, { v: tasks.length ? group.length / tasks.length : 0, type: 'number', style: { ...cell, numFmt: '0%' } }];
      })];
    const rows = [
      [{ v: `${APP_NAME} · ${t("Current situation")}`, style: { bold: true, size: 16, color: '#2d3142' } }], [],
      [label("Organization"), { v: organization, style: { bold: true } }],
      [label("Exported on"), { v: now, type: 'datetime', style: { horizontal: 'left' } }],
      [label("App version"), appVersion || '—'],
      [label("Exported tasks"), scopeLabel],
      ...(options.scope === 'view' ? [[label("Active filters"), activeFilterText()], [label("Issue filters"), activeFilterText('issues')]] : []),
      [label("Sorting"), sortText()],
      [label("Columns"), t(options.columns === 'all' ? "All columns" : "Columns visible in the list")],
      [], section(t("Totals")),
      [label("Tasks"), tasks.length], [label("Of which hidden"), hidden],
      ...(hasColumn('effort') ? [[label("Total effort"), total ? effort(total) : '—'], [label("Effort (hours)"), total]] : []),
      ...(hasColumn('releaseDate') ? [[label("Planned releases"), new Set(dated.map(task => task.releaseDate)).size], [label("Unscheduled"), tasks.length - dated.length],
        [label("Next release"), nextDate ? { v: nextDate, type: 'date', style: { horizontal: 'left', bold: true } } : '—', nextDate ? plural(tasks.filter(task => task.releaseDate === nextDate).length, "tasks") : '']] : []),
      ...(hasColumn('highlight') || hasColumn('status') ? [[label("Highlighted"), highlighted]] : []),
      ...(hasColumn('incident') ? [[label("With a duplicate incident"), duplicated]] : []),
      ...(hasColumn('status') ? [[], ...breakdown("Status", statuses, task => task.statusId)] : []),
      ...(hasColumn('urgency') ? [[], ...breakdown("Urgency", urgencies, task => task.urgencyId)] : [])
    ];
    sheets.push({ name: t("Summary"), columns: [{ width: 26 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 9 }], rows, gridLines: false, tabColor: '#2d3142', merges: [{ row: 0, col: 0, cols: 5 }] });
  }
  if (wanted.has('tasks')) {
    const issues = indexIssues(data.issues);
    const ids = options.columns === 'all' ? configuredColumns().map(column => column.id) : shownColumns();
    const widths = { sequence: 7, code: 16, link: 40, description: 56, urgency: 14, status: 18, highlight: 18, tags: 22, effort: 11, incident: 18, problem: 18, releaseDate: 14, notes: 48 };
    const defs = ids.flatMap(id => id === 'effort' ? [{ id, name: t('Effort'), width: 11 }, { id: 'effortHours', name: t("Effort (hours)"), width: 11 }] : [{ id, name: columnDef(id).field ? columnDef(id).name : t(columnDef(id).name), width: widths[id] || 24 }]);
    if (tasks.some(task => task.hidden)) defs.push({ id: 'hidden', name: t("Hidden"), width: 11 });
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
          case 'releaseDate': return task.releaseDate ? cell(task.releaseDate, { fill: tint(dateColor(task.releaseDate), 0.5), horizontal: 'center' }, { type: 'date' }) : cell(t("Unscheduled"), { italic: true, color: muted, horizontal: 'center' });
          case 'hidden': return cell(task.hidden ? t("Yes") : '', { horizontal: 'center' });
          default: return columnDef(def.id)?.field ? customSpreadsheetCell(task, columnDef(def.id).field, base) : cell('');
        }
      }));
    }
    const code = defs.findIndex(def => def.id === 'code');
    sheets.push({ name: settings.tabNames[0], columns: defs.map(def => ({ width: def.width })), rows, freeze: { row: 1, col: code >= 0 && code < 3 ? code + 1 : 0 }, autoFilter: true, tabColor: settings.themes.find(theme => theme.id === settings.themeId)?.accent, print: { landscape: true, fitWidth: true } });
  }
  if (wanted.has('issues')) {
    const identical = new Set(duplicates.identical), cell = { border: grid, vertical: 'top' };
    const ids = options.columns === 'all' ? configuredColumns('issues').map(column => column.id) : shownIssueColumns();
    const rows = [[...ids.map(id => ({ v: columnDef(id, 'issues').field ? columnDef(id, 'issues').name : t(id === 'linked' ? "Linked tasks" : columnDef(id, 'issues').name), style: header })), { v: t("Duplicate"), style: header }],
      ...(options.scope === 'view' ? filteredIssues() : data.issues).map(issue => {
        const linked = data.tasks.filter(task => task.code.trim() && task.code.trim().toUpperCase() === issue.code.trim().toUpperCase()), task = linked[0], url = task ? portalUrl(task, settings) : '', group = duplicates.issues.get(issue.id);
        const values = { code: { v: issue.code, link: url, style: { ...cell, bold: true } }, incident: { v: issue.incident, style: { ...cell, ...(group && { fill: tint('#f2b94a', 0.45) }) } }, problem: { v: issue.problem, style: cell }, linked: { v: linked.length, style: cell } };
        return [...ids.map(id => values[id] || customSpreadsheetCell(issue, columnDef(id, 'issues').field, cell)), { v: group ? t(identical.has(issue.id) ? "identical" : "Yes") : '', style: { ...cell, horizontal: 'center' } }];
      })];
    sheets.push({ name: settings.tabNames[1], columns: [...ids.map(() => ({ width: 22 })), { width: 12 }], rows, freeze: { row: 1 }, autoFilter: true });
  }
  if (wanted.has('milestones')) {
    const dates = [...new Set(tasks.map(task => task.releaseDate).filter(Boolean))].sort(), day = today();
    if (tasks.some(task => !task.releaseDate)) dates.push('');
    const rows = [["Milestone", 'Release date', 'Release', "Tasks", "Hours", 'Effort'].map(text => ({ v: t(text), style: header })).concat(statuses.map(status => ({ v: status.name, style: { ...header, fill: tint(status.color, 0.55), color: '#1d2030', wrap: true } })), { v: t("Codes"), style: header })];
    dates.forEach((date, index) => {
      const group = tasks.filter(task => task.releaseDate === date), next = Boolean(date && date === nextDate), fill = next ? '#fff1c2' : '';
      const state = !date ? t("Unscheduled") : next ? t(date === day ? "Today's release" : "Next release") : t(date < day ? "Past" : "Upcoming");
      const cell = { border: grid, vertical: 'top', ...(fill && { fill }), ...(next && { bold: true }) };
      rows.push([{ v: date ? index + 1 : '—', style: { ...cell, horizontal: 'center' } }, date ? { v: date, type: 'date', style: { ...cell, fill: fill || tint(dateColor(date), 0.5), horizontal: 'center' } } : { v: t("Unscheduled"), style: { ...cell, italic: true } }, { v: state, style: cell }, { v: group.length, style: cell }, { v: hours(group), style: cell }, { v: hours(group) ? effort(hours(group)) : '', style: cell },
        ...statuses.map(status => ({ v: group.filter(task => task.statusId === status.id).length || '', style: { ...cell, horizontal: 'center' } })), { v: sortedRows(group).map(task => task.code).join(', '), style: { ...cell, wrap: true } }]);
    });
    const included = (_, index) => (hasColumn('effort') || ![4, 5].includes(index)) && (hasColumn('code') || index !== 6 + statuses.length);
    sheets.push({ name: settings.tabNames[2], columns: [{ width: 8 }, { width: 14 }, { width: 17 }, { width: 10 }, { width: 9 }, { width: 11 }, ...statuses.map(() => ({ width: 12 })), { width: 60 }].filter(included), rows: rows.map(row => row.filter(included)), freeze: { row: 1, col: 2 } });
  }
  if (wanted.has('kanban')) {
    const columns = statuses.map(status => sortTasks(tasks.filter(task => task.statusId === status.id)));
    const rows = [statuses.map((status, i) => ({ v: `${status.name} (${columns[i].length})`, style: { bold: true, fill: tint(status.color, 0.45), border: { color: hexColor(status.color), style: 'medium', sides: ['bottom'] }, horizontal: 'center' } }))];
    for (let r = 0; r < Math.max(0, ...columns.map(list => list.length)); r++) {
      rows.push(columns.map((list, i) => {
        const task = list[r];
        if (!task) return '';
        const text = plain(task.description), url = portalUrl(task, settings);
        return { v: `${recordLabel(task)}${text ? ` · ${text.length > 90 ? text.slice(0, 89) + '…' : text}` : ''}`, link: url, style: { wrap: true, vertical: 'top', border: grid, fill: tint(statuses[i].color, 0.12), ...(task.hidden ? { italic: true, color: muted } : url ? {} : { color: '#1d2030' }) } };
      }));
    }
    sheets.push({ name: settings.tabNames[3], columns: statuses.map(() => ({ width: 34 })), rows, freeze: { row: 1 } });
  }
  return window.OrbitaXlsx.buildWorkbook({ title: `${APP_NAME} · ${organization}`, creator: APP_NAME, application: APP_NAME, created: now, sheets });
}
async function exportExcel(options) {
  const organization = organizations.find(o => o.id === activeOrganizationId)?.name || '';
  const bytes = await situationWorkbook(options);
  const result = await workspaceApi.exportSpreadsheet(situationFileName(organization, currentLanguage()), bytes);
  if (result) notify("Excel exported:", false, result.fileName);
  return result;
}
function excelDialog(preset = {}) {
  const selected = data.tasks.filter(task => selectedTasks.has(task.id)).length, choices = { ...excelChoices, ...preset };
  const enabledSheet = id => id !== 'milestones' && id !== 'kanban' || hasColumn(id === 'milestones' ? 'releaseDate' : 'status');
  if (choices.scope === 'selected' && !selected) choices.scope = 'view';
  const columns = configuredColumns();
  const radio = (name, value, title, detail, disabled = false) => `<label class="choice-card ${disabled ? 'is-disabled' : ''}"><input type="radio" name="${name}" value="${value}" ${choices[name] === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(t(title))}</strong><small>${esc(detail)}</small></span></label>`;
  const sheetCards = EXCEL_SHEETS.map(([id, name, detail]) => `<label class="choice-card ${enabledSheet(id) ? '' : 'is-disabled'}"><input type="checkbox" name="sheets" value="${id}" ${choices.sheets.includes(id) && enabledSheet(id) ? 'checked' : ''} ${enabledSheet(id) ? '' : 'disabled'}><span><strong>${esc(typeof name === 'number' ? data.settings.tabNames[name] : t(name))}</strong><small>${esc(t(enabledSheet(id) ? detail : "Restore the required column to export this view."))}</small></span></label>`).join('');
  openModal(ui`<form id="excel-form" novalidate><div class="modal-heading"><div><div class="eyebrow">EXCEL</div><h2>Export to Excel</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div>
    <p class="section-description">Create an .xlsx workbook. Summary, milestones and kanban follow the selected tasks. “As shown” also applies issue filters; the other options export all issues.</p>
    <fieldset class="excel-group"><legend>Tasks to export</legend><div class="choice-grid">${radio('scope', 'view', "As shown in the list", fillText("{0} · current filters and sorting", plural(filteredTasks().length, "tasks")))}${radio('scope', 'all', "All tasks", fillText("{0}, hidden ones included", plural(data.tasks.length, "tasks")))}${radio('scope', 'selected', "Selected only", selected ? fillText("{0} selected", selected) : t("No task selected"), !selected)}</div></fieldset>
    <fieldset class="excel-group"><legend>Task and issue sheet columns</legend><div class="choice-grid">${radio('columns', 'visible', "Columns visible in the list", fillText("Tasks: {0} · Issues: {1}", shownColumns().length, shownIssueColumns().length))}${radio('columns', 'all', "All columns", fillText("Tasks: {0} · Issues: {1}", columns.length, configuredColumns('issues').length))}</div></fieldset>
    <fieldset class="excel-group"><legend>Sheets</legend><div class="choice-grid sheets">${sheetCards}</div></fieldset>
    <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="excel-save">${ico('excel')}${esc(t("Export"))}</button></div></form>`);
  const form = $('#excel-form');
  form.onsubmit = action(async event => {
    event.preventDefault();
    const fields = new FormData(form), options = { scope: fields.get('scope') || 'view', columns: fields.get('columns') || 'visible', sheets: fields.getAll('sheets') };
    if (!options.sheets.length) throw new Error("Choose at least one sheet to export.");
    if (options.scope === 'selected' && !selectedTasks.size) throw new Error("Select at least one task.");
    excelChoices = options;
    $('#excel-save').disabled = true;
    try {
      if (await exportExcel(options) && $('#modal').open && $('#excel-form') === form) $('#modal').close();
    } finally { if (form.isConnected) $('#excel-save').disabled = false; }
  });
}
const exportKinds = [['themes', 'palette', "Export themes"], ['settings', 'settings', "Export settings"], ['data', 'tasks', "Export data"], ['organization', 'database', "Export everything"]];
const exportedMessages = { themes: "Themes exported:", settings: "Settings exported:", data: "Data exported:", organization: "Organization exported:" };
const importKindNames = { themes: "Themes", settings: "Settings", data: "Data", organization: "Full organization" };
const fillText = (text, ...values) => values.reduce((result, value, index) => result.replaceAll(`{${index}}`, value), t(text));
function transferPanel() {
  const settings = data.settings, activeTheme = settings.themes.find(theme => theme.id === settings.themeId);
  const details = {
    themes: `${plural(settings.themes.length, 'theme')} · ${fillText("active: {0}", esc(activeTheme.name))}`,
    settings: `${plural(settings.statuses.length, 'status')} · ${plural(settings.urgencies.length, 'urgency')} · ${plural((settings.highlights || []).length, 'highlighter')} · ${(settings.tags || []).length} ${t('Tags')} · ${t(settings.logo ? "language, link, tabs, columns, text sizes and logo" : "language, link, tabs, columns and text sizes")}`,
    data: `${plural(data.tasks.length, "tasks")} · ${plural(data.issues.length, 'issue')}`,
    organization: t("Themes, settings and data in a single file")
  };
  const cards = exportKinds.map(([kind, icon, label]) => `<button type="button" class="transfer-card" data-export-kind="${kind}"><span class="transfer-icon" aria-hidden="true">${ico(icon)}</span><span class="transfer-text"><strong>${t(label)}</strong><small>${details[kind]}</small></span></button>`).join('');
  return ui`<section class="panel settings-section full" id="transfer-panel"><div class="storage-heading"><div><h2>Export and import organization</h2><p class="section-description">Save this organization’s themes, settings and data as separate files, to share them or import them again here or into another copy of OrbitKanban.</p></div><span class="readonly-badge">JSON FILES</span></div><div class="transfer-grid">${cards}</div><div class="storage-actions"><button type="button" class="button primary" id="import-organization">${ico('import')}${esc(t("Import from file"))}…</button><input type="file" id="organization-file" accept=".json,application/json" hidden><span class="transfer-hint">Choose a file exported by OrbitKanban: before applying it you can decide which parts to import and where.</span></div></section>`;
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
    if (file.size > 32 * 1024 * 1024) throw new Error(t("This file is too large to be an OrbitKanban export."));
    organizationImportDialog(parseOrganizationFile(await file.text()));
  });
}
function organizationImportDialog(file) {
  const current = organizations.find(o => o.id === activeOrganizationId), toNew = file.kind === 'organization';
  const fileTheme = file.themes?.themes.find(theme => theme.id === file.themes.themeId);
  const exportedAt = file.exportedAt ? new Date(file.exportedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const origin = [file.organization.name ? fillText("From “{0}”", esc(file.organization.name)) : esc(t("Unnamed organization")), exportedAt && fillText("exported on {0}", esc(exportedAt)), file.appVersion && `OrbitKanban v${esc(file.appVersion)}`].filter(Boolean).join(' · ');
  const part = (name, title, detail, extra = '') => `<div class="import-part"><label class="import-check"><input type="checkbox" name="${name}" checked><span><strong>${esc(t(title))}</strong><small>${detail}</small></span></label>${extra}</div>`;
  const radio = (name, value, title, detail, checked) => `<label class="radio-card"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span><strong>${esc(t(title))}</strong><small>${detail}</small></span></label>`;
  const parts = [
    file.themes && part('themes', "Themes", `${plural(file.themes.themes.length, 'theme')}: ${esc(t("those with the same identifier are updated, the others are added."))}`,
      `<label class="import-sub"><input type="checkbox" name="activateTheme" checked><span>${fillText("Activate the “{0}” theme", esc(fileTheme.name))}</span><span class="theme-swatches">${themeFields.map(([key]) => `<i style="background:${fileTheme[key]}"></i>`).join('')}</span></label>`),
    file.settings && part('settings', "Settings", esc(t(file.settings.tags ? "Language, portal link, tab names, hours per day, text sizes, statuses, urgencies, highlighters, tags and list columns. Replaces current settings." : file.settings.highlights ? "Language, portal link, tab names, hours per day, text sizes, statuses, urgencies, highlighters and list columns. Replaces the current settings." : file.settings.fontSizes ? "Language, portal link, tab names, hours per day, text sizes, statuses and urgencies. Replaces the current settings." : "Language, portal link, tab names, hours per day, statuses and urgencies. Replaces the current settings.")),
      file.settings.logo ? `<label class="import-sub"><input type="checkbox" name="logo"><img class="import-logo" src="${file.settings.logo}" alt=""><span>${esc(t("Also replace the logo"))}</span></label>` : ''),
    file.data && part('data', "Data", `${plural(file.data.tasks.length, "tasks")} · ${plural(file.data.issues.length, 'issue')}`,
      `<div class="import-sub import-modes" id="import-data-mode">${radio('dataMode', 'merge', "Add and update", esc(t("Tasks with the same identifier are updated, issues already present are not duplicated.")), true)}${radio('dataMode', 'replace', "Replace everything", esc(t("Current tasks and issues are replaced by those in the file.")), false)}</div>`)
  ].filter(Boolean).join('');
  const destinations = radio('destination', 'current', "Into this organization", esc(current.name), !toNew) + radio('destination', 'new', "Into a new organization", esc(t("The current organization is left unchanged.")), toNew);
  const suggestedName = uniqueOrganizationName(file.organization.name, organizations.map(o => o.name), t("Imported organization"));
  openModal(ui`<form id="organization-import-form"><div class="modal-heading"><div><div class="eyebrow">IMPORT</div><h2>Import from file</h2></div><button type="button" class="icon-button" data-close aria-label="Close">${ico('close')}</button></div><div class="import-source"><span class="import-kind">${esc(t(importKindNames[file.kind]))}</span><span>${origin}</span></div><fieldset class="import-parts"><legend>What to import</legend>${parts}</fieldset><fieldset class="import-target"><legend>Where to import</legend><div class="import-destinations">${destinations}</div><label class="field" id="import-name-field">New organization name<input name="name" maxlength="100" required value="${esc(suggestedName)}"></label></fieldset><ul class="import-notes" id="import-notes" aria-live="polite"></ul><div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-close>Cancel</button><button type="submit" class="button primary" id="confirm-import">Import</button></div></form>`);
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
    $('#confirm-import').textContent = t(toNewOrganization ? "Create and import" : "Import");
    const notes = [];
    if (toNewOrganization) notes.push("A new organization will be created with the selected parts: the current one is left unchanged.");
    else {
      if (selected('settings')) notes.push("The current settings will be replaced: existing tasks are kept and mapped to the file’s statuses and urgencies with the same name, otherwise to the same position.");
      else if (selected('data')) notes.push("Statuses and urgencies of the imported tasks are mapped to this organization’s ones with the same name, otherwise to the same position.");
      if (selected('data') && fields.dataMode.value === 'replace') notes.push("All current tasks and issues of this organization will be deleted and replaced by those in the file.");
      notes.push("To be able to go back, first export a backup or the full organization.");
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
      if (!name || name.length > 100) throw new Error(t("Invalid organization name."));
      await organizationAction('import', { name, data: importedOrganizationData(file, options, data.settings.language) });
      $('#modal').close();
      notify("Organization imported.");
      return;
    }
    await commit(next => {
      const imported = applyOrganizationImport(next, file, options);
      next.settings = imported.settings; next.tasks = imported.tasks; next.issues = imported.issues;
    });
    statusFilter = '';
    $('#modal').close(); render(); notify("Import completed.");
  });
}
const fontSizeLabels = {
  base: ["General text", "Top bar, buttons, statistics, filters, settings and messages."],
  sidebar: ["Sidebar", "Organization, views and details in the left column."],
  headings: ["Page headings", "Eyebrow, title and description at the top of each view."],
  tables: ["Tables", "Rows and columns of the task list and linked issues."],
  milestones: ["Milestone view", "Roadmap dates, milestones and cards."],
  kanban: ["Kanban view", "Board columns and cards."],
  dialogs: ["Dialogs", "Task and issue editing, confirmations and import."]
};
const fontPresets = [[85, "Compact"], [100, 'Standard'], [115, "Large"], [130, "Extra large"]];
function sampleTask() {
  const { statuses, urgencies } = data.settings;
  return data.tasks.find(task => task.releaseDate && !task.hidden && plain(task.description)) || data.tasks.find(task => task.releaseDate) || data.tasks[0] || {
    id: 'font-sample', code: 'PRJ-1042', sequence: 1, url: '', description: t("Example: prepare the release and update the documentation."), notes: '',
    releaseDate: new Date().toLocaleDateString('en-CA'), statusId: statuses[Math.min(1, statuses.length - 1)]?.id || '', urgencyId: urgencies[0]?.id || '', effortHours: 12, hidden: false
  };
}
function fontSample(id, task) {
  const settings = data.settings, status = statusOf(task);
  const color = task.releaseDate ? dateColor(task.releaseDate) : '#929bb2', group = data.tasks.includes(task) ? data.tasks.filter(item => item.releaseDate === task.releaseDate) : [task];
  const samples = {
    base: () => ui`<div class="sample-stack"><div class="stat"><span>Visible tasks <span class="stat-icon">${ico('tasks')}</span></span><strong>${visibleTasks().length}<small>in your workspace</small></strong></div><div class="sample-actions"><span class="button primary">${ico('plus')}New task</span><span class="button">Save settings</span></div></div>`,
    sidebar: () => [0, 1, 2].map(i => `<div class="nav-button ${i ? '' : 'active'}"><span class="nav-icon">${icons[i]}</span><span>${esc(settings.tabNames[i])}</span>${i ? '' : `<span class="nav-count">${visibleTasks().length}</span>`}</div>`).join(''),
    headings: () => heading(settings.tabNames[0], "All tasks, one direction. Plan your work and focus on upcoming releases."),
    tables: () => ui`<table><thead><tr><th>Portal code</th><th>Description</th><th>Release date</th></tr></thead><tbody><tr><td><span class="code-link">${esc(task.code)}</span></td><td><span class="description-cell">${esc(plain(task.description) || tr("No description"))}</span></td><td><span class="date-pill" style="--date:${color}">${ico('calendar')}${formatDate(task.releaseDate)}</span></td></tr></tbody></table>`,
    milestones: () => ui`<div style="--milestone:${color}"><div class="timeline-label">MILESTONE ${'01'}</div><div class="timeline-line"><span>${ico('diamond')}</span></div><div class="milestone-heading"><h2>${formatDate(task.releaseDate)}</h2><span>${group.length} tasks · ${effort(group.reduce((sum, item) => sum + item.effortHours, 0))}</span></div><div class="milestone-cards">${miniTask(task)}</div></div>`,
    kanban: () => `<div class="kanban-column" style="--column:${status.color}"><div class="kanban-heading"><span><i></i>${esc(status.name)}</span><b>${data.tasks.filter(item => item.statusId === status.id).length}</b></div><div class="kanban-cards">${miniTask(task, true)}</div></div>`,
    dialogs: () => ui`<div class="sample-dialog"><div class="modal-heading"><div><div class="eyebrow">TASK</div><h2>Edit task</h2></div><span class="icon-button">${ico('close')}</span></div><label class="field">Portal code<input value="${esc(task.code)}" readonly tabindex="-1"></label><div class="modal-actions"><span class="spacer"></span><span class="button">Cancel</span><span class="button primary">Save task</span></div></div>`
  };
  return samples[id]();
}
function fontSizePanel() {
  const sizes = settingsDraft.fontSizes || defaultFontSizes(), task = sampleTask();
  const families = [true, false].map(bundled => `<optgroup label="${esc(t(bundled ? "Bundled with the portable app (offline)" : "System fonts (if installed)"))}">${FONT_FAMILIES.filter(font => Boolean(font.bundled) === bundled).map(font => `<option value="${font.id}" ${font.id === (settingsDraft.fontFamily ?? DEFAULT_FONT_FAMILY) ? 'selected' : ''}>${font.name}</option>`).join('')}</optgroup>`).join('');
  const presets = fontPresets.map(([value, name]) => `<button type="button" class="button small font-preset" data-font-preset="${value}" aria-pressed="false">${esc(t(name))} <small>${value}%</small></button>`).join('');
  const cards = FONT_SIZE_PARTS.map(({ id, min, max }) => {
    const [name, description] = fontSizeLabels[id], value = sizes[id] ?? 100, reset = t("Reset to 100%");
    return `<div class="font-size-card" data-font-card="${id}"><div class="font-size-title"><label for="font-size-${id}">${esc(t(name))}</label><small id="font-size-${id}-hint">${esc(t(description))}</small></div><div class="font-size-control"><span class="font-size-limit" aria-hidden="true">${min}%</span><input type="range" id="font-size-${id}" data-font-size="${id}" min="${min}" max="${max}" step="${FONT_SIZE_STEP}" value="${value}" aria-describedby="font-size-${id}-hint"><span class="font-size-limit" aria-hidden="true">${max}%</span><output class="font-size-value" id="font-size-${id}-value" for="font-size-${id}">${value}%</output><button type="button" class="icon-button font-size-reset" data-font-reset="${id}" title="${esc(reset)}" aria-label="${esc(`${reset}: ${t(name)}`)}">${ico('reset')}</button></div><div class="font-sample" data-part="${id}" inert aria-hidden="true">${fontSample(id, task)}</div></div>`;
  }).join('');
  return ui`<section class="panel settings-section full" id="font-size-panel"><label class="field font-family-field"><span>${esc(t("Interface font"))}</span><select id="font-family">${families}</select><small>${esc(t("Instant preview; save to keep your choice. Bundled fonts work offline on every PC. System fonts, such as Aptos, must be installed locally; an alternative is used when unavailable."))}</small></label><div class="font-size-heading"><div><h2>Text size</h2><p class="section-description">Adjust the text of each part of the app: the preview applies instantly across the whole interface, save to keep it. Minimums and maximums keep everything readable and tidy.</p></div><div class="font-presets" role="group" aria-label="Presets">${presets}</div></div><div class="font-size-grid">${cards}<div class="font-size-card font-size-notes"><h3>Good to know</h3><ul><li>100% is the recommended size; presets adjust every part at once.</li><li>Each part has a minimum and a maximum, in 5% steps: the interface always stays usable.</li><li>Sizes apply only to this organization and are included in the settings export.</li></ul></div></div></section>`;
}
function paintFontFamily(value = DEFAULT_FONT_FAMILY) {
  const font = FONT_FAMILIES.find(font => font.id === value);
  if (!font) throw new Error(t("Invalid font."));
  document.documentElement.style.fontFamily = font.css;
  if (font.bundled) document.fonts.load(`400 14px "${font.name}"`).then(faces => {
    if (!faces.length) throw new Error(`Missing font face: ${font.name}`);
  }).catch(error => {
    console.error('Portable font load failed:', error);
    notify(t("Unable to load the bundled font. Check the app files or choose another font.") + ` (${font.name})`, true);
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
  $('#backup-status').textContent = fillText("Backups available: {0} of {1}.", result.backups.length, result.retention);
  $('#backup-list').innerHTML = result.backups.length ? result.backups.map(backup => {
    const date = new Date(`${backup.date}T12:00:00`);
    const label = Number.isNaN(date.getTime()) ? backup.date : date.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
    const size = backup.size >= 1024 * 1024 ? `${(backup.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(backup.size / 1024))} KB`;
    return `<article class="backup-item"><div class="backup-info"><strong>${esc(label)}</strong><small>${esc(size)} · ${esc(backup.fileName)}</small></div><button type="button" class="button small danger" data-restore-backup="${esc(backup.fileName)}">${esc(t("Restore…"))}</button></article>`;
  }).join('') : `<p class="backup-empty">${esc(t("No automatic backups are available yet."))}</p>`;
}
function restoreDailyBackup(fileName) {
  const date = fileName.slice(0, 10);
  confirmDialog("Restore this backup?", fillText("The backup from {0} will replace all organizations, tasks and settings. workspace.json.bak is created first with the current state.", date), async () => {
    const snapshot = await workspaceApi.backups('restore', fileName);
    columnFilters = { tasks: {}, issues: {} }; issueSearch = '';
    clearHistory();
    adoptSnapshot(snapshot);
    search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
    render();
    notify("Backup restored.");
  });
}
function pendingCustomColumns() {
  return [...document.querySelectorAll('[data-add-field]')].filter(form => form.elements.name.value.trim());
}
function newCustomField(form) {
  const values = new FormData(form), type = values.get('type');
  return { id: `custom-${uid()}`, name: values.get('name').trim(), type, options: ['select', 'multiselect'].includes(type) ? [{ id: uid(), name: `${t("Option")} 1`, color: '#a392ff' }] : [] };
}
function customColumnsPanel() {
  return `<section class="panel settings-section" id="custom-columns-panel"><h2>${esc(t("Column management"))}</h2><p class="section-description">${esc(t("Default and custom columns share the same controls. Deleting a column removes its values and related controls when settings are saved. Hiding only changes the table."))}</p><p class="section-description">${esc(t("Up to 30 custom columns per list. Deleted default columns can be restored below, without their old values."))}</p><p class="section-description">${esc(t("Save settings also includes new columns entered below. Use Add column to configure labels and colors immediately or prepare more columns before saving."))}</p>${['tasks', 'issues'].map((kind, index) => `<section class="custom-schema"><h3>${esc(data.settings.tabNames[index])}</h3><div id="custom-definitions-${kind}"></div><div id="restore-columns-${kind}" class="storage-actions"></div><form class="custom-add-form" data-add-field="${kind}"><label class="field">${esc(t("Column name"))}<input name="name" maxlength="60" required></label><label class="field">${esc(t("Type"))}<select name="type">${Object.entries(fieldTypeNames).map(([type, name]) => `<option value="${type}">${esc(t(name))}</option>`).join('')}</select></label><button type="submit" class="button">${esc(t("Add column"))}</button></form></section>`).join('')}<h3>${esc(t("Visible issue columns"))}</h3><div id="issue-columns-editor"></div></section>`;
}
function refreshChoiceSettings() {
  let panels = $('#choice-settings-panels');
  if (!panels) { panels = document.createElement('div'); panels.id = 'choice-settings-panels'; $('.settings-panels').append(panels); }
  panels.innerHTML = choiceSettingsTabs().map(tab => `<section class="panel settings-section" id="${tab.panel}"><h2>${esc(tab.label)}</h2><p class="section-description">${esc(t("Manage labels, colors and order. Deleted labels are removed from rows when settings are saved; single choices become unassigned."))}</p>${tab.field.id === 'status' && tab.field.builtin ? `<p class="section-description">${esc(t("This order becomes the kanban order. Use the star to highlight tasks with this status."))}</p>` : ''}<div id="${tab.id}-list"></div><button type="button" class="button" data-add-choice="${tab.id}" ${tab.field.builtin ? `data-add-option="${tab.id}"` : ''}>${ico('plus')}${esc(t("Add label"))}</button></section>`).join('');
  $('.settings-nav').outerHTML = settingsNav();
  document.querySelectorAll('[data-add-choice]').forEach(button => button.onclick = () => {
    const tab = choiceSettingsTabs().find(tab => tab.id === button.dataset.addChoice), list = optionCatalog(tab.id);
    if (list.length >= (tab.id === 'highlights' ? HIGHLIGHT_LIMIT : TAG_LIMIT)) { notify("Invalid column options.", true); return; }
    let index = 1;
    while (list.some(option => option.name.trim().toLocaleLowerCase() === `${t("Option")} ${index}`.toLocaleLowerCase())) index++;
    const color = highlightPalette.find(color => !list.some(option => option.color.toLowerCase() === color)) || '#a392ff';
    list.push({ id: uid(), name: `${t("Option")} ${index}`, color, ...(tab.id === 'statuses' ? { highlight: false } : {}) });
    drawOptionLists(); refreshSettingsState();
  });
  drawOptionLists(); showSettingsTab(settingsTab); refreshSettingsState();
}
function wireCustomColumns() {
  const syncColumns = () => {
    settingsDraft.taskColumns = configuredColumns('tasks', settingsDraft);
    settingsDraft.issueColumns = configuredColumns('issues', settingsDraft);
    settingsDraft.taskEditorLayout = normalizeTaskEditorLayout(settingsDraft);
    drawTaskLayoutSettings();
    $('#hours-per-day').closest('.field').hidden = !['tasks', 'issues'].some(kind => CustomColumns.schemaOf(settingsDraft, kind).some(field => field.type === 'effort'));
    columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft);
    columnEditor($('#issue-columns-editor'), settingsDraft.issueColumns, 'issues', settingsDraft);
    refreshChoiceSettings();
    refreshSettingsState();
  };
  const draws = [];
  redrawColumnDefinitions = () => draws.forEach(draw => draw());
  for (const kind of ['tasks', 'issues']) {
    const key = kind === 'tasks' ? 'taskFields' : 'issueFields', columnKey = kind === 'tasks' ? 'taskColumns' : 'issueColumns', container = $(`#custom-definitions-${kind}`);
    const draw = () => {
      const schema = CustomColumns.schemaOf(settingsDraft, kind);
      // Only the task editor has a configurable form: a required task field left off it is not checked.
      const placed = kind === 'tasks' ? new Set(normalizeTaskEditorLayout(settingsDraft).columns.flatMap(column => column.sections.flatMap(section => section.fields.map(field => field.id)))) : null;
      const requiredControl = field => {
        const allowed = CustomColumns.canRequire(settingsDraft, kind, field.id), on = allowed && CustomColumns.isRequired(settingsDraft, kind, field.id);
        return `<label class="toggle-label required-toggle" ${allowed ? '' : `title="${esc(t("This field cannot be required."))}"`}><input type="checkbox" data-field-required ${on ? 'checked' : ''} ${allowed ? '' : 'disabled'}> ${esc(t("Required"))}</label>${on && placed && !placed.has(field.id) ? `<small class="required-off">${ico('warning')}${esc(t("not on the form: not checked"))}</small>` : ''}`;
      };
      container.innerHTML = configuredColumns(kind, settingsDraft).map(column => {
        const field = schema.find(field => field.id === column.id), name = field.builtin ? t(field.name) : field.name;
        return `<article class="custom-definition" data-field-id="${field.id}" ${field.builtin ? 'data-builtin' : ''}>${dragHandle(name)}<div class="custom-definition-fields">${field.builtin ? `<strong>${esc(name)}</strong>` : `<label class="field">${esc(t("Column name"))}<input data-field-name maxlength="60" value="${esc(name)}"></label>`}<span class="muted">${esc(t(fieldTypeNames[field.type]))}</span>${requiredControl(field)}${['select', 'multiselect'].includes(field.type) ? `<button type="button" class="button small" data-goto-settings-tab="${field.catalog || `choice-${kind}-${field.id}`}">${esc(t("Manage labels and colors"))}</button>` : ''}</div><button type="button" class="button small danger" data-delete-field>${esc(t("Delete"))}</button></article>`;
      }).join('');
      container.querySelectorAll('[data-field-id]').forEach(row => {
        const field = schema.find(field => field.id === row.dataset.fieldId), input = row.querySelector('[data-field-name]');
        if (input) input.oninput = event => { field.name = event.target.value; syncColumns(); };
        row.querySelector('[data-field-required]').onchange = event => {
          setRequiredColumn(settingsDraft, kind, field.id, event.target.checked);
          draw(); drawTaskLayoutSettings(); refreshSettingsState();
          container.querySelector(`[data-field-id="${CSS.escape(field.id)}"] [data-field-required]`)?.focus();
        };
        row.querySelector('[data-delete-field]').onclick = () => confirmDialog("Delete this column?", t("Column values will be deleted when settings are saved.") + ` (${field.builtin ? t(field.name) : field.name})`, async () => {
          CustomColumns.removeColumn(settingsDraft, kind, field.id);
          draw(); syncColumns();
        });
      });
      sortable(container, '.custom-definition', (from, to) => {
        settingsDraft[columnKey].splice(to, 0, ...settingsDraft[columnKey].splice(from, 1));
        settingsDraft[key].sort((a, b) => settingsDraft[columnKey].findIndex(column => column.id === a.id) - settingsDraft[columnKey].findIndex(column => column.id === b.id));
        draw(); syncColumns();
      });
      const restore = $(`#restore-columns-${kind}`);
      restore.innerHTML = CustomColumns.BUILTIN_FIELDS[kind].filter(field => !hasColumn(field.id, kind, settingsDraft)).map(field => `<button type="button" class="button small" data-restore-column="${field.id}">${ico('reset')}${esc(t("Restore column") + ': ' + t(field.name))}</button>`).join('');
      restore.querySelectorAll('[data-restore-column]').forEach(button => button.onclick = () => {
        const deletedKey = CustomColumns.deletedKey(kind);
        settingsDraft[deletedKey] = settingsDraft[deletedKey].filter(id => id !== button.dataset.restoreColumn);
        syncColumns(); draw();
      });
    };
    const form = document.querySelector(`[data-add-field="${kind}"]`);
    form.onsubmit = action(event => {
      event.preventDefault();
      const field = newCustomField(form);
      CustomColumns.validateFields([...settingsDraft[key], field]);
      settingsDraft[key].push(field); form.reset(); syncColumns(); draw();
    });
    draws.push(draw);
    draw();
  }
  syncColumns();
}
const layoutFieldName = field => field.builtin ? term(field.name) : field.name;
const layoutSectionLabel = (section, index) => section.name.trim() || fillText("Section {0}", index + 1);
function layoutSchematic(layout, settings) {
  const fields = new Map(taskEditorFields(settings).map(field => [field.id, field])), required = new Set(CustomColumns.requiredOf(settings, 'tasks'));
  return `<div class="layout-mini-columns" style="grid-template-columns:${esc(taskLayoutTemplate(layout.columns))}">${layout.columns.map(column => `<div class="layout-mini-column">${column.sections.map(section => `<div class="layout-mini-section">${section.showName && section.name.trim() ? `<b>${esc(section.name)}</b>` : ''}<div class="layout-mini-grid" style="grid-template-columns:repeat(${section.columns}, minmax(0, 1fr))">${section.fields.map(field => {
    const definition = fields.get(field.id);
    return `<span class="layout-mini-field ${definition.type === 'richtext' ? 'is-rich' : ''}" style="grid-column:span ${field.span}">${esc(layoutFieldName(definition))}${required.has(field.id) ? '<i class="required-mark">*</i>' : ''}</span>`;
  }).join('') || `<span class="layout-mini-empty">${esc(t("Empty section"))}</span>`}</div></div>`).join('')}</div>`).join('')}</div>`;
}
function taskLayoutPanel() {
  return `<section class="panel settings-section full" id="task-layout-panel"><h2>${esc(t("Task editor layout"))}</h2><p class="section-description">${esc(t("Design the task form of this organization: drag fields into sections, create new sections and choose the size of the window. Fields left off the form keep their values; list columns are not changed."))}</p><div class="layout-overview"><div class="layout-mini" id="task-layout-mini" aria-hidden="true"></div><div class="layout-overview-side"><dl class="layout-summary" id="task-layout-summary"></dl><div class="storage-actions"><button type="button" class="button primary" id="open-form-designer">${ico('edit')}${esc(t("Open form designer"))}</button><button type="button" class="button" id="reset-task-layout">${ico('reset')}${esc(t("Restore default layout"))}</button></div></div></div><h3>${esc(t("Required fields"))}</h3><p class="muted">${esc(t("A required field must be filled in before saving, but only when it is on the form. Choose required fields in the form designer or in Column management."))}</p><div class="layout-required" id="task-required-summary"></div><button type="button" class="button small" data-goto-settings-tab="custom-columns">${ico('column-plus')}${esc(t("Column management"))}</button></section>`;
}
function drawTaskLayoutSettings() {
  if (!$('#task-layout-mini')) return;
  const layout = settingsDraft.taskEditorLayout = normalizeTaskEditorLayout(settingsDraft);
  const fields = taskEditorFields(settingsDraft), names = new Map(fields.map(field => [field.id, layoutFieldName(field)]));
  const sections = layout.columns.flatMap(column => column.sections), placed = new Set(sections.flatMap(section => section.fields.map(field => field.id)));
  $('#task-layout-mini').innerHTML = layoutSchematic(layout, settingsDraft);
  const item = (label, value) => `<div><dt>${esc(t(label))}</dt><dd>${esc(value)}</dd></div>`;
  $('#task-layout-summary').innerHTML = item("Window size", `${layout.width} × ${layout.height || t("automatic height")} px`) + item("Layout columns", layout.columns.map(column => `${column.width}`).join(' : ')) +
    item("Sections", sections.length) + item("Fields on the form", fillText("{0} of {1}", placed.size, fields.length));
  const required = CustomColumns.requiredOf(settingsDraft, 'tasks').filter(id => names.has(id));
  $('#task-required-summary').innerHTML = required.length ? required.map(id => `<span class="layout-required-chip ${placed.has(id) ? '' : 'is-off'}">${esc(names.get(id))}<i class="required-mark" aria-hidden="true">*</i>${placed.has(id) ? '' : `<small>${esc(t("not on the form: not checked"))}</small>`}</span>`).join('') : `<p class="muted">${esc(t("No required fields."))}</p>`;
  $('#open-form-designer').onclick = () => openFormDesigner();
  $('#reset-task-layout').onclick = () => {
    settingsDraft.taskEditorLayout = defaultTaskEditorLayout(settingsDraft);
    drawTaskLayoutSettings(); refreshSettingsState();
    notify("Default layout restored. Save the settings to apply it.");
  };
}
// Required flags live in a list ordered like the columns, so toggling back and forth does not leave unsaved changes.
function setRequiredColumn(settings, kind, id, required) {
  const chosen = new Set(CustomColumns.requiredOf(settings, kind));
  if (required) chosen.add(id); else chosen.delete(id);
  settings[CustomColumns.requiredKey(kind)] = CustomColumns.schemaOf(settings, kind).map(field => field.id).filter(fieldId => chosen.has(fieldId));
}
let redrawColumnDefinitions = () => {};
const DESIGNER_TYPE_ICONS = { text: '<b>Abc</b>', richtext: '<b>¶</b>', number: '<b>123</b>', date: 'calendar', select: 'chevron-down', multiselect: 'tag', url: 'link', effort: 'clock', boolean: 'check', matches: 'link' };
const designerTypeIcon = type => { const icon = DESIGNER_TYPE_ICONS[type] || 'list'; return icon.startsWith('<') ? icon : ico(icon); };
const designerTypeName = field => t(field.id === 'hidden' ? "Checkbox" : field.id === 'matches' ? "Automatic" : fieldTypeNames[field.type] || field.type);
// Inert copy of the editor controls: same classes as the real form, so sizes in the designer match the task editor.
function designerControl(field, settings, required) {
  const mark = required ? '<span class="required-mark" aria-hidden="true">*</span>' : '';
  const name = `<span>${esc(layoutFieldName(field))}${mark}</span>`;
  if (field.type === 'richtext') return `<div class="field"><span class="field-label">${name}</span><div class="rich-editor"><div class="rich-toolbar"><button type="button"><b>B</b></button><button type="button"><i>I</i></button><button type="button"><u>U</u></button><button type="button">• List</button><button type="button">1. List</button><button type="button">Tx</button></div><div class="editable"></div></div></div>`;
  if (field.builtin && field.id === 'effort') return `<div class="form-grid task-effort-fields"><div class="field"><span class="task-effort-label"><span>${esc(t("Effort in days"))}${mark}</span> <small>${esc(fillText("1 day = {0} hours", settings.hoursPerDay))}</small></span><input type="number" value="0" tabindex="-1"></div><div class="field">${esc(t("Additional effort in hours"))}<input type="number" value="0" tabindex="-1"></div></div>`;
  if (field.id === 'hidden') return `<div class="field checkbox-field"><input type="checkbox" tabindex="-1"> ${esc(t("Hide from the task list only (still visible in milestones and kanban)"))}</div>`;
  if (field.id === 'matches') return `<div class="auto-match"><span>${ico('link')}${esc(t("Automatic link by portal code"))}</span><div>Incident: <strong>—</strong> Problem: <strong>—</strong></div></div>`;
  if (field.builtin && field.id === 'link') return `<div class="field portal-field"><span class="field-label">${esc(t("Specific link (optional)"))}${mark}</span><input tabindex="-1" placeholder="https://"><small>${esc(t("Link generated from the organization template"))}</small></div>`;
  let control;
  if (field.type === 'multiselect') control = `<button type="button" class="task-tags-button" tabindex="-1"><span class="tag-chips"><span class="muted">+ ${esc(layoutFieldName(field))}</span></span>${ico('chevron-down')}</button>`;
  else if (['select', 'boolean'].includes(field.type)) control = `<select tabindex="-1"><option>${esc(field.builtin ? t("Unassigned") : '—')}</option></select>`;
  else control = `<input tabindex="-1" type="${field.type === 'date' ? 'date' : ['number', 'effort'].includes(field.type) ? 'number' : 'text'}">`;
  return `<div class="field">${name}${control}${field.type === 'effort' ? `<small>${esc(t("Value in hours"))}</small>` : ''}</div>`;
}
function designerBackdrop() {
  const tasks = sortedRows(visibleTasks()).slice(0, 16);
  const rows = tasks.length ? tasks.map(task => { const status = statusOf(task); return `<div class="designer-ghost-row"><b>${esc(task.code || '—')}</b><span>${esc(plain(task.description || '').slice(0, 90))}</span>${pill(status.name, status.color)}<span>${esc(formatDate(task.releaseDate))}</span></div>`; }).join('')
    : Array.from({ length: 10 }, () => '<div class="designer-ghost-row"><i></i><i></i><i></i><i></i></div>').join('');
  return `<div class="designer-ghost-app"><div class="designer-ghost-rail">${icons.map(icon => `<span>${icon}</span>`).join('')}</div><div class="designer-ghost-main"><div class="designer-ghost-heading"><strong>${esc(data.settings.tabNames[0])}</strong><span class="button primary">${ico('plus')}</span></div><div class="designer-ghost-table">${rows}</div></div></div>`;
}
const LAYOUT_PRESETS = [[100], [50, 50], [40, 60], [60, 40], [33, 67], [67, 33], [33, 34, 33], [25, 50, 25]];
function openFormDesigner() {
  if (!settingsDraft || document.getElementById('form-designer')) return;
  const organizationId = activeOrganizationId, fields = taskEditorFields(settingsDraft), byId = new Map(fields.map(field => [field.id, field]));
  const state = { layout: structuredClone(normalizeTaskEditorLayout(settingsDraft)), required: CustomColumns.requiredOf(settingsDraft, 'tasks') };
  const initial = JSON.stringify(state), undoStack = [], redoStack = [];
  let selection = { type: 'form' }, lastKey = '', scale = 1, frozen = false, approved = false, drag = null, paletteQuery = '', unusedOnly = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'form-designer';
  dialog.className = 'form-designer';
  dialog.setAttribute('aria-labelledby', 'form-designer-title');
  dialog.innerHTML = `<header class="designer-bar"><div class="designer-title"><span class="eyebrow">${esc(t("Form designer"))} · ${esc(organizations.find(o => o.id === organizationId)?.name || '')}</span><h2 id="form-designer-title">${esc(t("Task editor layout"))}</h2></div><div class="designer-tools"><button type="button" class="icon-button" id="designer-undo" title="${esc(t("Undo (Ctrl+Z)"))}" aria-label="${esc(t("Undo (Ctrl+Z)"))}">${ico('undo')}</button><button type="button" class="icon-button" id="designer-redo" title="${esc(t("Redo (Ctrl+Y)"))}" aria-label="${esc(t("Redo (Ctrl+Y)"))}">${ico('redo')}</button><button type="button" class="button" id="designer-reset">${ico('reset')}${esc(t("Restore default layout"))}</button><span class="designer-divider" aria-hidden="true"></span><button type="button" class="button" id="designer-cancel">${esc(t("Cancel"))}</button><button type="button" class="button primary" id="designer-save">${ico('check')}${esc(t("Save"))}</button></div></header>
    <div class="designer-body"><aside class="designer-palette" aria-labelledby="designer-fields-title"><div class="designer-palette-head"><h3 id="designer-fields-title">${esc(t("Fields"))}</h3><span class="tiny-count" id="designer-field-count"></span></div><label class="designer-search"><span aria-hidden="true">${ico('search')}</span><input type="search" id="designer-search" placeholder="${esc(t("Search fields…"))}" aria-label="${esc(t("Search fields…"))}" autocomplete="off" spellcheck="false"></label><label class="toggle-label"><input type="checkbox" id="designer-unused"> ${esc(t("Only fields not on the form"))}</label><ul class="designer-field-list" id="designer-fields" aria-labelledby="designer-fields-title"></ul><h3>${esc(t("Components"))}</h3><div class="designer-components">${[1, 2, 3, 4].map(count => `<button type="button" class="designer-component" data-add-section="${count}"><span class="designer-component-icon" aria-hidden="true">${'<i></i>'.repeat(count)}</span>${esc(fillText(count === 1 ? "Section with 1 column" : "Section with {0} columns", count))}</button>`).join('')}</div><p class="muted designer-hint">${esc(t("Drag fields and sections onto the form. With the keyboard: Enter adds the field to the selected section, the arrow keys move the selected item and Delete removes it."))}</p></aside>
    <div class="designer-canvas"><div class="designer-ghost" aria-hidden="true" inert>${designerBackdrop()}</div><div class="designer-stage" id="designer-stage"><div class="designer-frame" id="designer-frame"><div class="task-form designer-modal" id="designer-modal"><div class="modal-heading" inert><div><div class="eyebrow">TASK</div><h2>${esc(t("Edit task"))}</h2></div><span class="icon-button">${ico('close')}</span></div><div class="task-edit-layout" id="designer-layout" role="group" aria-label="${esc(t("Form preview"))}"></div><div class="modal-actions" inert><span class="button danger">${esc(t("Delete"))}</span><span class="spacer"></span><span class="button">${esc(t("Cancel"))}</span><span class="button primary">${esc(t("Save task"))}</span></div></div>
      <div class="designer-grip designer-grip-e" data-grip="e" tabindex="0" role="separator" aria-orientation="vertical" aria-label="${esc(t("Window width"))}"></div><div class="designer-grip designer-grip-s" data-grip="s" tabindex="0" role="separator" aria-orientation="horizontal" aria-label="${esc(t("Window height"))}"></div><div class="designer-grip designer-grip-se" data-grip="se" aria-hidden="true"></div></div><p class="designer-size" id="designer-size" aria-live="polite"></p></div></div>
    <aside class="designer-props" id="designer-props" aria-label="${esc(t("Properties"))}"></aside></div>`;
  document.body.append(dialog);
  const $d = selector => dialog.querySelector(selector), stage = $d('#designer-stage'), frame = $d('#designer-frame'), modal = $d('#designer-modal'), body = $d('#designer-layout');
  const allSections = () => state.layout.columns.flatMap((column, columnIndex) => column.sections.map((section, index) => ({ section, column, columnIndex, index })));
  const findSection = id => allSections().find(entry => entry.section.id === id);
  const locate = id => { for (const entry of allSections()) { const fieldIndex = entry.section.fields.findIndex(field => field.id === id); if (fieldIndex >= 0) return { ...entry, fieldIndex }; } return null; };
  const placedIds = () => new Set(allSections().flatMap(entry => entry.section.fields.map(field => field.id)));
  const required = id => state.required.includes(id);
  const announce = message => announceOrder(body, message);
  const snapshot = () => JSON.stringify(state);
  const dirty = () => snapshot() !== initial;
  function mutate(change, key = '', options = {}) {
    const before = snapshot();
    change();
    if (snapshot() === before) return false;
    if (!key || key !== lastKey) { undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); }
    redoStack.length = 0;
    lastKey = key;
    draw(options);
    return true;
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const saved = JSON.parse(from.pop());
    state.layout = saved.layout; state.required = saved.required; lastKey = '';
    if (selection.type === 'section' && !findSection(selection.id)) selection = { type: 'form' };
    draw();
  }
  const unplace = id => { if (!state.layout.unplaced.includes(id)) state.layout.unplaced.push(id); };
  function detachField(id) {
    const where = locate(id);
    if (where) return where.section.fields.splice(where.fieldIndex, 1)[0];
    state.layout.unplaced = state.layout.unplaced.filter(fieldId => fieldId !== id);
    return { id, span: byId.get(id).span };
  }
  function placeField(id, sectionId, index) {
    const target = findSection(sectionId)?.section;
    if (!target || !byId.has(id)) return;
    const field = detachField(id);
    target.fields.splice(Math.max(0, Math.min(index, target.fields.length)), 0, { id, span: Math.min(field.span, target.columns) });
  }
  function removeField(id) {
    if (!locate(id)) return;
    detachField(id); unplace(id);
  }
  function newSection(columnCount) {
    if (allSections().length >= TASK_LAYOUT.sections) throw new Error(fillText("A form can have up to {0} sections.", TASK_LAYOUT.sections));
    let id;
    do id = `section-${uid().slice(0, 8)}`; while (findSection(id));
    return { id, name: t("New section").slice(0, TASK_LAYOUT.sectionName), showName: true, columns: columnCount, fields: [] };
  }
  function insertSection(section, columnIndex, index) {
    const column = state.layout.columns[Math.min(columnIndex, state.layout.columns.length - 1)];
    column.sections.splice(Math.max(0, Math.min(index, column.sections.length)), 0, section);
  }
  function moveSection(id, columnIndex, index) {
    const where = findSection(id);
    if (!where) return;
    where.column.sections.splice(where.index, 1);
    insertSection(where.section, columnIndex, index);
  }
  function deleteSection(id) {
    const where = findSection(id);
    if (!where) return;
    where.section.fields.forEach(field => unplace(field.id));
    where.column.sections.splice(where.index, 1);
  }
  function setLayoutColumns(widths) {
    const columns = state.layout.columns, kept = widths.map((width, index) => ({ width, sections: columns[index]?.sections || [] }));
    kept.at(-1).sections.push(...columns.slice(widths.length).flatMap(column => column.sections));
    state.layout.columns = kept;
  }
  // Target section for keyboard and click additions: the selection, else the first section, else a new one.
  function targetSection() {
    if (selection.type === 'section' && findSection(selection.id)) return selection.id;
    if (selection.type === 'field' && locate(selection.id)) return locate(selection.id).section.id;
    const first = allSections()[0];
    if (first) return first.section.id;
    const section = newSection(2);
    insertSection(section, 0, 0);
    return section.id;
  }
  function addFieldToForm(id) {
    let sectionId;
    mutate(() => { sectionId = targetSection(); placeField(id, sectionId, findSection(sectionId).section.fields.length); });
    selection = { type: 'field', id };
    draw();
    focusCanvas('field', id);
    announce(fillText("“{0}” added to {1}.", layoutFieldName(byId.get(id)), layoutSectionLabel(findSection(sectionId).section, allSections().findIndex(entry => entry.section.id === sectionId))));
  }
  function addSection(columnCount, columnIndex, index) {
    const section = newSection(columnCount);
    mutate(() => {
      if (columnIndex === undefined) {
        const anchor = selection.type === 'section' ? findSection(selection.id) : selection.type === 'field' ? locate(selection.id) : null;
        if (anchor) { columnIndex = anchor.columnIndex; index = anchor.index + 1; }
        else { columnIndex = state.layout.columns.length - 1; index = state.layout.columns.at(-1).sections.length; }
      }
      insertSection(section, columnIndex, index);
    });
    selection = { type: 'section', id: section.id };
    draw();
    focusCanvas('section', section.id);
    announce(t("Section added."));
  }
  function moveFieldBy(id, step) {
    const where = locate(id);
    if (!where) return;
    const entries = allSections(), position = entries.findIndex(entry => entry.section.id === where.section.id);
    mutate(() => {
      const next = where.fieldIndex + step;
      if (next >= 0 && next < where.section.fields.length) where.section.fields.splice(next, 0, ...where.section.fields.splice(where.fieldIndex, 1));
      else if (entries[position + step]) { const target = entries[position + step].section; placeField(id, target.id, step < 0 ? target.fields.length : 0); }
    });
    focusCanvas('field', id);
    const now = locate(id);
    announce(fillText("Position {0} of {1} in {2}.", now.fieldIndex + 1, now.section.fields.length, layoutSectionLabel(now.section, allSections().findIndex(entry => entry.section.id === now.section.id))));
  }
  function moveSectionBy(id, step, across = false) {
    const where = findSection(id);
    if (!where) return;
    mutate(() => {
      if (across) { const columnIndex = where.columnIndex + step; if (columnIndex >= 0 && columnIndex < state.layout.columns.length) moveSection(id, columnIndex, state.layout.columns[columnIndex].sections.length); }
      else if (where.index + step >= 0 && where.index + step < where.column.sections.length) moveSection(id, where.columnIndex, where.index + step);
    });
    focusCanvas('section', id);
    const now = findSection(id);
    announce(fillText("Column {0}, position {1} of {2}.", now.columnIndex + 1, now.index + 1, now.column.sections.length));
  }
  function toggleRequired(id, value) {
    const chosen = new Set(state.required);
    if (value) chosen.add(id); else chosen.delete(id);
    state.required = CustomColumns.schemaOf(settingsDraft, 'tasks').map(field => field.id).filter(fieldId => chosen.has(fieldId));
  }
  // ---- Drawing ----
  function designerItem(field) {
    const item = document.createElement('div');
    item.className = 'designer-item';
    item.dataset.designerField = field.id;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', layoutFieldName(field) + (required(field.id) ? ` (${t("Required")})` : ''));
    item.innerHTML = `<div class="designer-item-body" inert>${designerControl(field, settingsDraft, required(field.id))}</div>`;
    return item;
  }
  function decorateSection(element, section) {
    const entries = allSections(), index = entries.findIndex(entry => entry.section.id === section.id);
    element.classList.add('designer-section');
    element.dataset.designerSection = section.id;
    element.tabIndex = 0;
    element.setAttribute('aria-label', `${t("Section")}: ${layoutSectionLabel(section, index)}`);
    const tab = document.createElement('span');
    tab.className = 'designer-section-tab';
    tab.innerHTML = `<span class="designer-grab" aria-hidden="true"></span>${esc(layoutSectionLabel(section, index))} · ${esc(fillText(section.columns === 1 ? "1 column" : "{0} columns", section.columns))}`;
    element.prepend(tab);
    if (!section.fields.length) element.querySelector('.task-form-grid').innerHTML = `<p class="designer-empty-section">${esc(t("Drag fields here"))}</p>`;
  }
  function drawCanvas() {
    const focused = document.activeElement, focusField = focused?.dataset?.designerField, focusSection = focused?.dataset?.designerSection;
    modal.style.setProperty('--task-form-width', `${state.layout.width}px`);
    modal.style.setProperty('--task-form-height', `${state.layout.height || 720}px`);
    modal.classList.toggle('fixed-height', state.layout.height > 0);
    const items = new Map();
    const columns = buildTaskLayoutColumns(state.layout, settingsDraft, id => {
      if (!byId.has(id)) return null;
      if (!items.has(id)) items.set(id, designerItem(byId.get(id)));
      return items.get(id);
    }, { keepEmpty: true, decorate: decorateSection });
    body.replaceChildren(...columns.map(column => column.element));
    body.style.gridTemplateColumns = taskLayoutTemplate(columns);
    for (const column of body.querySelectorAll('.task-form-column')) {
      if (!column.children.length) column.innerHTML = `<p class="designer-empty-column" data-empty-column="${column.dataset.layoutColumn}">${esc(t("Drag a field or a section here"))}</p>`;
    }
    markSelection();
    if (focusField) focusCanvas('field', focusField);
    else if (focusSection) focusCanvas('section', focusSection);
    fit();
  }
  function markSelection() {
    dialog.querySelectorAll('.is-selected').forEach(element => element.classList.remove('is-selected'));
    dialog.querySelectorAll('[aria-pressed]').forEach(element => element.matches('.designer-item, .designer-palette-field') && element.setAttribute('aria-pressed', 'false'));
    const selector = selection.type === 'field' ? `[data-designer-field="${CSS.escape(selection.id)}"], [data-palette-field="${CSS.escape(selection.id)}"]` : selection.type === 'section' ? `[data-designer-section="${CSS.escape(selection.id)}"]` : '#designer-modal';
    dialog.querySelectorAll(selector).forEach(element => { element.classList.add('is-selected'); if (element.matches('.designer-item, .designer-palette-field')) element.setAttribute('aria-pressed', 'true'); });
  }
  function focusCanvas(type, id) {
    const element = body.querySelector(type === 'field' ? `[data-designer-field="${CSS.escape(id)}"]` : `[data-designer-section="${CSS.escape(id)}"]`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function fit() {
    const width = state.layout.width + 2, height = modal.offsetHeight;
    if (!frozen) {
      const room = { width: stage.clientWidth - 56, height: stage.clientHeight - 90 };
      scale = Math.max(0.3, Math.min(1, room.width / width, room.height / Math.max(height, 1)));
    }
    modal.style.transform = `scale(${scale})`;
    frame.style.width = `${Math.round(width * scale)}px`;
    frame.style.height = `${Math.round(height * scale)}px`;
    // The real task window is capped at 94% of the app window and scrolls beyond that.
    const limited = height > Math.floor(window.innerHeight * 0.94);
    $d('#designer-size').textContent = `${state.layout.width} × ${state.layout.height ? `${state.layout.height}` : t("automatic height")} px · ${Math.round(scale * 100)}%` + (limited ? ` · ${t("limited to the window height")}` : '');
  }
  function drawPalette() {
    const placed = placedIds(), needle = paletteQuery.trim().toLocaleLowerCase();
    $d('#designer-field-count').textContent = `${placed.size}/${fields.length}`;
    const shown = fields.filter(field => (!unusedOnly || !placed.has(field.id)) && (!needle || layoutFieldName(field).toLocaleLowerCase().includes(needle)));
    $d('#designer-fields').innerHTML = shown.map(field => {
      const on = placed.has(field.id), warn = required(field.id) && !on;
      return `<li><button type="button" class="designer-palette-field ${on ? 'is-placed' : ''}" data-palette-field="${esc(field.id)}" aria-pressed="false" title="${esc(on ? t("On the form: click to select it") : t("Drag onto the form or press Enter to add it"))}"><span class="designer-type" title="${esc(designerTypeName(field))}">${designerTypeIcon(field.type)}</span><span class="designer-palette-name">${esc(layoutFieldName(field))}${required(field.id) ? '<i class="required-mark" aria-hidden="true">*</i>' : ''}<small>${esc(designerTypeName(field))}${required(field.id) ? ` · ${esc(t("Required"))}` : ''}</small></span><span class="designer-palette-state ${warn ? 'is-warning' : ''}" title="${esc(warn ? t("Required but not on the form: it will not be checked.") : '')}">${warn ? ico('warning') : on ? ico('check') : ''}<span class="sr-only">${esc(t(on ? "On the form" : "Not on the form"))}</span></span></button></li>`;
    }).join('') || `<li class="muted designer-palette-empty">${esc(t(needle ? "No results." : "All fields are on the form."))}</li>`;
    markSelection();
  }
  function drawProps() {
    const pane = $d('#designer-props'), entries = allSections();
    const sectionOptions = selected => entries.map((entry, index) => `<option value="${esc(entry.section.id)}" ${entry.section.id === selected ? 'selected' : ''}>${esc((state.layout.columns.length > 1 ? `${fillText("Column {0}", entry.columnIndex + 1)} › ` : '') + layoutSectionLabel(entry.section, index))}</option>`).join('');
    if (selection.type === 'field' && byId.has(selection.id)) {
      const field = byId.get(selection.id), where = locate(field.id), allowed = CustomColumns.canRequire(settingsDraft, 'tasks', field.id);
      pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${esc(t("Field properties"))}</span><h3>${esc(layoutFieldName(field))}</h3><span class="muted">${esc(designerTypeName(field))}</span></div>
        <label class="field">${esc(t("Section"))}<select id="designer-field-section"><option value="">${esc(t("Not on the form"))}</option>${sectionOptions(where?.section.id)}</select></label>
        <label class="field">${esc(t("Width"))}<select id="designer-field-span" ${where ? '' : 'disabled'}>${Array.from({ length: where?.section.columns || 1 }, (_, index) => `<option value="${index + 1}" ${where && where.section.fields[where.fieldIndex].span === index + 1 ? 'selected' : ''}>${esc(fillText(index ? "{0} columns" : "1 column", index + 1))}</option>`).join('')}</select></label>
        <label class="checkbox-field designer-check"><input type="checkbox" id="designer-field-required" ${required(field.id) ? 'checked' : ''} ${allowed ? '' : 'disabled'}> ${esc(t("Required"))}</label>
        <p class="muted designer-note">${esc(t(!allowed ? "This field cannot be required." : required(field.id) && !where ? "Required but not on the form: it will not be checked." : "Required fields must be filled in to save the task."))}</p>
        ${where ? `<div class="designer-prop-actions"><button type="button" class="button small" id="designer-field-up">${ico('arrow-up')}${esc(t("Move up"))}</button><button type="button" class="button small" id="designer-field-down">${ico('arrow-down')}${esc(t("Move down"))}</button></div><button type="button" class="button danger" id="designer-field-remove">${ico('minus')}${esc(t("Remove from the form"))}</button>` : `<button type="button" class="button primary" id="designer-field-add">${ico('plus')}${esc(t("Add to the form"))}</button>`}`;
      $d('#designer-field-section').onchange = event => mutate(() => {
        if (!event.target.value) removeField(field.id);
        else placeField(field.id, event.target.value, findSection(event.target.value).section.fields.length);
      });
      $d('#designer-field-span').onchange = event => mutate(() => { locate(field.id).section.fields[locate(field.id).fieldIndex].span = Number(event.target.value); });
      $d('#designer-field-required').onchange = event => mutate(() => toggleRequired(field.id, event.target.checked));
      if (where) {
        $d('#designer-field-up').onclick = () => moveFieldBy(field.id, -1);
        $d('#designer-field-down').onclick = () => moveFieldBy(field.id, 1);
        $d('#designer-field-remove').onclick = () => { mutate(() => removeField(field.id)); announce(fillText("“{0}” removed from the form.", layoutFieldName(field))); };
      } else $d('#designer-field-add').onclick = () => addFieldToForm(field.id);
      return;
    }
    if (selection.type === 'section' && findSection(selection.id)) {
      const where = findSection(selection.id), section = where.section, index = entries.findIndex(entry => entry.section.id === section.id);
      pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${esc(t("Section properties"))}</span><h3>${esc(layoutSectionLabel(section, index))}</h3><span class="muted">${esc(fillText(section.fields.length === 1 ? "1 field" : "{0} fields", section.fields.length))}</span></div>
        <label class="field">${esc(t("Section name"))}<input id="designer-section-name" maxlength="${TASK_LAYOUT.sectionName}" value="${esc(section.name)}"></label>
        <label class="checkbox-field designer-check"><input type="checkbox" id="designer-section-show" ${section.showName ? 'checked' : ''}> ${esc(t("Show the name on the form"))}</label>
        <label class="field">${esc(t("Columns"))}<select id="designer-section-columns">${[1, 2, 3, 4].map(count => `<option value="${count}" ${section.columns === count ? 'selected' : ''}>${count}</option>`).join('')}</select></label>
        ${state.layout.columns.length > 1 ? `<label class="field">${esc(t("Layout column"))}<select id="designer-section-column">${state.layout.columns.map((_, columnIndex) => `<option value="${columnIndex}" ${columnIndex === where.columnIndex ? 'selected' : ''}>${esc(fillText("Column {0}", columnIndex + 1))}</option>`).join('')}</select></label>` : ''}
        <div class="designer-prop-actions"><button type="button" class="button small" id="designer-section-up" ${where.index ? '' : 'disabled'}>${ico('arrow-up')}${esc(t("Move up"))}</button><button type="button" class="button small" id="designer-section-down" ${where.index < where.column.sections.length - 1 ? '' : 'disabled'}>${ico('arrow-down')}${esc(t("Move down"))}</button></div>
        <button type="button" class="button danger" id="designer-section-delete">${ico('minus')}${esc(t("Delete section"))}</button><p class="muted designer-note">${esc(t("The fields of a deleted section go back to the field list."))}</p>`;
      $d('#designer-section-name').oninput = event => mutate(() => { section.name = event.target.value.slice(0, TASK_LAYOUT.sectionName); }, `name:${section.id}`, { props: false });
      $d('#designer-section-show').onchange = event => mutate(() => { section.showName = event.target.checked; });
      $d('#designer-section-columns').onchange = event => mutate(() => { section.columns = Number(event.target.value); section.fields.forEach(field => { field.span = Math.min(field.span, section.columns); }); });
      if ($d('#designer-section-column')) $d('#designer-section-column').onchange = event => mutate(() => moveSection(section.id, Number(event.target.value), state.layout.columns[Number(event.target.value)].sections.length));
      $d('#designer-section-up').onclick = () => moveSectionBy(section.id, -1);
      $d('#designer-section-down').onclick = () => moveSectionBy(section.id, 1);
      $d('#designer-section-delete').onclick = () => { mutate(() => deleteSection(section.id)); selection = { type: 'form' }; draw(); announce(t("Section deleted.")); };
      return;
    }
    selection = { type: 'form' };
    const layout = state.layout, current = layout.columns.map(column => column.width).join('-');
    pane.innerHTML = `<div class="designer-props-head"><span class="eyebrow">${esc(t("Form properties"))}</span><h3>${esc(t("Task window"))}</h3><span class="muted">${esc(t("Drag the edges of the window or enter its size."))}</span></div>
      <label class="field">${esc(t("Width (px)"))}<input type="number" id="designer-width" min="${TASK_LAYOUT.width.min}" max="${TASK_LAYOUT.width.max}" step="10" value="${layout.width}"></label>
      <label class="checkbox-field designer-check"><input type="checkbox" id="designer-auto-height" ${layout.height ? '' : 'checked'}> ${esc(t("Automatic height (fits the content)"))}</label>
      <label class="field">${esc(t("Height (px)"))}<input type="number" id="designer-height" min="${TASK_LAYOUT.height.min}" max="${TASK_LAYOUT.height.max}" step="10" value="${layout.height || Math.max(TASK_LAYOUT.height.min, Math.round((modal.offsetHeight - 2) / 10) * 10)}" ${layout.height ? '' : 'disabled'}></label>
      <fieldset class="designer-presets"><legend>${esc(t("Layout columns"))}</legend>${LAYOUT_PRESETS.map(widths => `<button type="button" class="designer-preset" data-preset="${widths.join('-')}" aria-pressed="${widths.join('-') === current}" title="${esc(widths.join(' : '))}" aria-label="${esc(fillText(widths.length === 1 ? "1 column" : "{0} columns", widths.length) + ' ' + widths.join(' : '))}">${widths.map(width => `<i style="flex:${width}"></i>`).join('')}</button>`).join('')}</fieldset>
      <div class="designer-column-widths">${layout.columns.map((column, index) => `<label class="field">${esc(fillText("Column {0}", index + 1))}<input type="number" data-column-width="${index}" min="${TASK_LAYOUT.columnWidth.min}" max="${TASK_LAYOUT.columnWidth.max}" step="1" value="${column.width}"></label>`).join('')}</div>
      <p class="muted designer-note">${esc(t("Column widths are proportional. On narrow windows the columns are stacked."))}</p>`;
    const number = (input, { min, max }) => { const value = Math.round(Number(input.value)); return Number.isFinite(value) && value >= min && value <= max ? value : null; };
    $d('#designer-width').oninput = event => { const value = number(event.target, TASK_LAYOUT.width); if (value) mutate(() => { layout.width = value; }, 'width', { props: false }); };
    $d('#designer-height').oninput = event => { const value = number(event.target, TASK_LAYOUT.height); if (value) mutate(() => { layout.height = value; }, 'height', { props: false }); };
    for (const id of ['#designer-width', '#designer-height']) $d(id).onchange = () => { lastKey = ''; drawProps(); };
    $d('#designer-auto-height').onchange = event => mutate(() => { layout.height = event.target.checked ? 0 : Number($d('#designer-height').value) || TASK_LAYOUT.height.min; });
    dialog.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => mutate(() => setLayoutColumns(button.dataset.preset.split('-').map(Number))));
    dialog.querySelectorAll('[data-column-width]').forEach(input => {
      input.oninput = () => { const value = number(input, TASK_LAYOUT.columnWidth); if (value) mutate(() => { layout.columns[Number(input.dataset.columnWidth)].width = value; }, `column:${input.dataset.columnWidth}`, { props: false }); };
      input.onchange = () => { lastKey = ''; drawProps(); };
    });
  }
  function draw({ props = true } = {}) {
    drawCanvas(); drawPalette();
    if (props) drawProps();
    $d('#designer-undo').disabled = !undoStack.length;
    $d('#designer-redo').disabled = !redoStack.length;
  }
  function select(type, id, { focus = false } = {}) {
    selection = type === 'form' ? { type } : { type, id };
    markSelection(); drawProps();
    if (focus && type !== 'form') focusCanvas(type, id);
  }
  // ---- Pointer: drag fields, sections and components; resize the window from its edges ----
  const indicator = document.createElement('div'), ghost = document.createElement('div');
  indicator.className = 'designer-drop-indicator'; ghost.className = 'designer-drag-ghost';
  indicator.hidden = ghost.hidden = true;
  dialog.append(indicator, ghost);
  function showIndicator(rect, horizontal) {
    if (!rect) { indicator.hidden = true; return; }
    indicator.hidden = false;
    indicator.classList.toggle('is-horizontal', horizontal);
    Object.assign(indicator.style, horizontal ? { left: `${rect.left}px`, top: `${rect.top - 2}px`, width: `${rect.width}px`, height: '4px' } : { left: `${rect.left - 2}px`, top: `${rect.top}px`, width: '4px', height: `${rect.height}px` });
  }
  function fieldTarget(x, y, id) {
    const element = document.elementFromPoint(x, y);
    if (!element || !dialog.contains(element)) return null;
    if (element.closest('.designer-palette')) return locate(id) ? { type: 'palette' } : null;
    const empty = element.closest('[data-empty-column]');
    if (empty) { const box = empty.getBoundingClientRect(); return { type: 'new-section', column: Number(empty.dataset.emptyColumn), rect: { left: box.left, top: box.top + box.height / 2, width: box.width }, horizontal: true }; }
    let section = element.closest('[data-designer-section]');
    if (!section) {
      const column = element.closest('.task-form-column');
      if (!column) return null;
      const sections = [...column.querySelectorAll(':scope > [data-designer-section]')];
      section = sections.find(item => y <= item.getBoundingClientRect().bottom) || sections.at(-1);
      if (!section) return null;
    }
    const items = [...section.querySelectorAll(':scope > .task-form-grid > .designer-item')].filter(item => item.dataset.designerField !== id);
    let index = items.findIndex(item => { const box = item.getBoundingClientRect(); return y < box.top || (y <= box.bottom && x < box.left + box.width / 2); });
    if (index < 0) index = items.length;
    let rect, horizontal = false;
    if (items[index]) { const box = items[index].getBoundingClientRect(); rect = { left: box.left - 5 * scale, top: box.top, height: box.height }; }
    else if (items.length) { const box = items.at(-1).getBoundingClientRect(); rect = { left: box.right + 5 * scale, top: box.top, height: box.height }; }
    else { const box = section.querySelector('.task-form-grid').getBoundingClientRect(); rect = { left: box.left, top: box.top + box.height / 2, width: box.width }; horizontal = true; }
    return { type: 'section', id: section.dataset.designerSection, index, rect, horizontal };
  }
  function sectionTarget(x, y, id) {
    const element = document.elementFromPoint(x, y), column = element && dialog.contains(element) && element.closest('.task-form-column');
    if (!column) return null;
    const sections = [...column.querySelectorAll(':scope > [data-designer-section]')].filter(item => item.dataset.designerSection !== id);
    let index = sections.findIndex(item => { const box = item.getBoundingClientRect(); return y < box.top + box.height / 2; });
    if (index < 0) index = sections.length;
    const columnBox = column.getBoundingClientRect(), gap = 9 * scale;
    const top = sections[index] ? sections[index].getBoundingClientRect().top - gap : sections.length ? sections.at(-1).getBoundingClientRect().bottom + gap : columnBox.top + 12;
    return { type: 'column', column: Number(column.dataset.layoutColumn), index, rect: { left: columnBox.left, top, width: columnBox.width }, horizontal: true };
  }
  function autoScroll() {
    if (!drag?.active) return;
    const box = stage.getBoundingClientRect(), edge = 48;
    const dy = drag.y < box.top + edge ? -12 : drag.y > box.bottom - edge ? 12 : 0, dx = drag.x < box.left + edge && drag.x > box.left ? -12 : drag.x > box.right - edge && drag.x < box.right ? 12 : 0;
    if (dx || dy) { stage.scrollBy(dx, dy); updateDrag(); }
    drag.frame = requestAnimationFrame(autoScroll);
  }
  function updateDrag() {
    ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 12}px)`;
    drag.target = drag.source.type === 'field' ? fieldTarget(drag.x, drag.y, drag.source.id) : sectionTarget(drag.x, drag.y, drag.source.id);
    dialog.classList.toggle('is-removing', drag.target?.type === 'palette');
    showIndicator(drag.target?.rect, drag.target?.horizontal);
  }
  function endDrag(apply) {
    const current = drag;
    drag = null;
    cancelAnimationFrame(current.frame);
    for (const [type, listener] of Object.entries(current.listeners)) window.removeEventListener(type, listener, true);
    indicator.hidden = ghost.hidden = true;
    dialog.classList.remove('is-dragging', 'is-removing');
    dialog.querySelectorAll('.is-drag-source').forEach(element => element.classList.remove('is-drag-source'));
    if (!current.active) { current.click?.(); return; }
    const { source, target } = current;
    if (!apply || !target) return;
    if (source.type === 'field') {
      const name = layoutFieldName(byId.get(source.id));
      if (target.type === 'palette') { mutate(() => removeField(source.id)); announce(fillText("“{0}” removed from the form.", name)); return; }
      if (target.type === 'new-section') {
        const section = newSection(byId.get(source.id).type === 'richtext' ? 1 : 2);
        mutate(() => { insertSection(section, target.column, 0); placeField(source.id, section.id, 0); });
      } else mutate(() => placeField(source.id, target.id, target.index));
      select('field', source.id, { focus: true });
      announce(fillText("“{0}” moved.", name));
      return;
    }
    if (source.type === 'new-section') { addSection(source.columns, target.column, target.index); return; }
    mutate(() => moveSection(source.id, target.column, target.index));
    select('section', source.id, { focus: true });
    announce(t("Section moved."));
  }
  function beginPointer(event, source, click) {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    const listeners = {
      pointermove: move => {
        if (move.pointerId !== event.pointerId) return;
        drag.x = move.clientX; drag.y = move.clientY;
        if (!drag.active && Math.hypot(drag.x - event.clientX, drag.y - event.clientY) < 4) return;
        move.preventDefault();
        if (!drag.active) {
          drag.active = true;
          dialog.classList.add('is-dragging');
          source.element?.classList.add('is-drag-source');
          ghost.textContent = source.label;
          ghost.hidden = false;
          drag.frame = requestAnimationFrame(autoScroll);
        }
        updateDrag();
      },
      pointerup: up => { if (up.pointerId === event.pointerId) endDrag(true); },
      pointercancel: () => endDrag(false),
      keydown: key => { if (key.key === 'Escape' && drag?.active) { key.preventDefault(); key.stopPropagation(); endDrag(false); announce(t("Move cancelled.")); } }
    };
    drag = { source, click, listeners, active: false, x: event.clientX, y: event.clientY, frame: 0, target: null };
    for (const [type, listener] of Object.entries(listeners)) window.addEventListener(type, listener, true);
  }
  function beginResize(event, edge) {
    if (drag || event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, width: state.layout.width, height: state.layout.height || Math.round((modal.offsetHeight - 2) / 10) * 10 };
    const before = snapshot();
    frozen = true;
    dialog.classList.add('is-resizing');
    const clamp = (value, { min, max }) => Math.max(min, Math.min(max, Math.round(value / 10) * 10));
    const move = pointer => {
      if (edge.includes('e')) state.layout.width = clamp(start.width + 2 * (pointer.clientX - start.x) / scale, TASK_LAYOUT.width);
      if (edge.includes('s')) state.layout.height = clamp(start.height + (pointer.clientY - start.y) / scale, TASK_LAYOUT.height);
      drawCanvas();
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      frozen = false;
      dialog.classList.remove('is-resizing');
      if (snapshot() !== before) { undoStack.push(before); redoStack.length = 0; lastKey = ''; }
      selection = { type: 'form' };
      draw();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }
  dialog.addEventListener('pointerdown', event => {
    const grip = event.target.closest('[data-grip]');
    if (grip) { beginResize(event, grip.dataset.grip); return; }
    const item = event.target.closest('.designer-item'), palette = event.target.closest('[data-palette-field]'), component = event.target.closest('[data-add-section]');
    const section = !item && event.target.closest('[data-designer-section]');
    if (item) beginPointer(event, { type: 'field', id: item.dataset.designerField, element: item, label: layoutFieldName(byId.get(item.dataset.designerField)) }, () => select('field', item.dataset.designerField, { focus: true }));
    else if (palette) beginPointer(event, { type: 'field', id: palette.dataset.paletteField, element: palette, label: layoutFieldName(byId.get(palette.dataset.paletteField)) }, () => {
      const id = palette.dataset.paletteField;
      if (placedIds().has(id)) select('field', id, { focus: true }); else select('field', id);
    });
    else if (component) beginPointer(event, { type: 'new-section', columns: Number(component.dataset.addSection), label: component.textContent.trim() }, () => addSection(Number(component.dataset.addSection)));
    else if (section) beginPointer(event, { type: 'section', id: section.dataset.designerSection, element: section, label: section.querySelector('.designer-section-tab').textContent }, () => select('section', section.dataset.designerSection, { focus: true }));
    else if (event.target.closest('.designer-canvas') && !event.target.closest('.designer-size')) select('form');
  });
  dialog.addEventListener('keydown', event => {
    const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase(), typing = event.target.closest('input, select, textarea');
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!drag) requestClose(); return; }
    event.stopPropagation();
    if (command && !typing && (key === 'z' || key === 'y')) { event.preventDefault(); if (key === 'y' || event.shiftKey) restore(redoStack, undoStack); else restore(undoStack, redoStack); return; }
    if (command || event.altKey || drag) return;
    const grip = event.target.closest('[data-grip]');
    if (grip && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const step = (event.shiftKey ? 50 : 10) * (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
      if (grip.dataset.grip === 'e') mutate(() => { state.layout.width = Math.max(TASK_LAYOUT.width.min, Math.min(TASK_LAYOUT.width.max, state.layout.width + step)); }, 'width');
      else mutate(() => { state.layout.height = Math.max(TASK_LAYOUT.height.min, Math.min(TASK_LAYOUT.height.max, (state.layout.height || Math.round((modal.offsetHeight - 2) / 10) * 10) + step)); }, 'height');
      return;
    }
    const item = event.target.closest('.designer-item'), section = !item && event.target.matches('[data-designer-section]') && event.target, palette = event.target.closest('[data-palette-field]');
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (item) {
      const id = item.dataset.designerField;
      if (step) { event.preventDefault(); moveFieldBy(id, step); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); const next = item.nextElementSibling?.dataset.designerField || item.previousElementSibling?.dataset.designerField; mutate(() => removeField(id)); announce(fillText("“{0}” removed from the form.", layoutFieldName(byId.get(id)))); if (next) select('field', next, { focus: true }); else select('form'); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select('field', id); $d('#designer-field-section')?.focus(); }
    } else if (section) {
      const id = section.dataset.designerSection;
      if (step) { event.preventDefault(); moveSectionBy(id, step, event.key === 'ArrowLeft' || event.key === 'ArrowRight'); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); mutate(() => deleteSection(id)); select('form'); announce(t("Section deleted.")); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select('section', id); $d('#designer-section-name')?.focus(); }
    } else if (palette && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const id = palette.dataset.paletteField;
      if (placedIds().has(id)) select('field', id, { focus: true }); else addFieldToForm(id);
    }
  });
  dialog.addEventListener('focusin', event => {
    const item = event.target.closest?.('.designer-item'), section = event.target.matches?.('[data-designer-section]') && event.target;
    if (item && !(selection.type === 'field' && selection.id === item.dataset.designerField)) select('field', item.dataset.designerField);
    else if (section && !(selection.type === 'section' && selection.id === section.dataset.designerSection)) select('section', section.dataset.designerSection);
  });
  $d('#designer-search').oninput = event => { paletteQuery = event.target.value; drawPalette(); };
  $d('#designer-unused').onchange = event => { unusedOnly = event.target.checked; drawPalette(); };
  $d('#designer-undo').onclick = () => restore(undoStack, redoStack);
  $d('#designer-redo').onclick = () => restore(redoStack, undoStack);
  $d('#designer-reset').onclick = () => { mutate(() => { state.layout = defaultTaskEditorLayout(settingsDraft); }); select('form'); announce(t("Default layout restored.")); };
  function applyDesign() {
    if (view !== 4 || activeOrganizationId !== organizationId || !$('#task-layout-mini')) throw new Error(t("The settings page was reloaded: open the form designer again."));
    settingsDraft.taskEditorLayout = normalizeTaskEditorLayout(settingsDraft, structuredClone(state.layout));
    settingsDraft.requiredTaskColumns = [...state.required];
    approved = true;
    dialog.close();
    drawTaskLayoutSettings(); redrawColumnDefinitions(); refreshSettingsState();
  }
  function requestClose() {
    if (!dirty()) { approved = true; dialog.close(); return; }
    confirmDialog("Discard the form changes?", "The changes made in the form designer have not been saved.", () => { approved = true; dialog.close(); });
  }
  $d('#designer-cancel').onclick = requestClose;
  // One step, like the rest of the settings: the design goes into the draft and the whole draft is saved.
  $d('#designer-save').onclick = action(async () => { applyDesign(); await saveSettings(); rerenderPreservingView(); notify("Settings saved."); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!drag) requestClose(); });
  const observer = new ResizeObserver(() => fit());
  const onResize = () => fit();
  dialog.addEventListener('close', () => {
    if (!approved && dirty()) { dialog.showModal(); return; }
    if (drag) endDrag(false);
    observer.disconnect();
    window.removeEventListener('resize', onResize);
    dialog.remove();
    syncWindowChrome();
    $('#open-form-designer')?.focus();
  });
  dialog.showModal();
  syncWindowChrome();
  observer.observe(modal);
  window.addEventListener('resize', onResize);
  draw();
  dialog.querySelector('.designer-palette-field')?.focus();
}
function updatesPanel() {
  return ui`<section class="panel settings-section full" id="updates-panel"><h2>App & updates</h2><p class="section-description">Updates and shortcuts apply to this portable copy, not to one organization. GitHub receives no workspace data. Downloading and installing always require your action.</p><p>Installed version: <strong>${esc(appVersion)}</strong></p><p id="update-status" role="status" aria-live="polite"></p><progress id="update-progress" max="100" hidden aria-label="Update download progress"></progress><label class="field checkbox-field"><input type="checkbox" id="update-auto"><span>Check for updates at startup</span></label><div class="storage-actions"><button type="button" class="button" id="update-check">Check for updates</button><button type="button" class="button" id="update-download" hidden>Download update</button><button type="button" class="button primary" id="update-install" hidden>Install and restart</button><button type="button" class="button" id="update-release">View releases</button></div><hr><h3>Windows shortcut</h3><p class="section-description">Create a shortcut to the portable launcher, not the temporary app. Remove old broken pins, then pin the new shortcut or the running app once. Moving the portable folder requires recreating its shortcut.</p><button type="button" class="button" id="create-shortcut">Create desktop shortcut</button></section>`;
}
function drawUpdateState() {
  if (!$('#update-status')) return;
  const state = updateState, supported = !browserMode() && state.supported, busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  const messages = {
    idle: "Ready to check for updates.", checking: "Checking GitHub releases…", available: "A new version is available.",
    latest: "You are using the latest version.", downloading: "Downloading update…", ready: "Update verified and ready to install.",
    installing: "The app is restarting to install an update.", error: "Update failed."
  };
  $('#update-status').textContent = !supported ? t(browserMode() ? "Manage updates from the desktop app. Browser tabs reconnect after it restarts." : "Updates can only be installed from the Windows portable app.") :
    `${t(messages[state.phase] || messages.idle)}${state.version ? ` v${state.version}` : ''}${state.phase === 'downloading' ? ` (${state.percent}%)` : ''}${state.error ? ` ${t(state.error)}` : ''}`;
  $('#update-progress').hidden = state.phase !== 'downloading';
  $('#update-progress').value = state.percent;
  $('#update-check').disabled = !supported || busy;
  $('#update-auto').disabled = !supported || busy;
  $('#update-auto').checked = state.autoCheck;
  $('#update-download').hidden = !supported || state.phase !== 'available';
  $('#update-install').hidden = !supported || state.phase !== 'ready';
  $('#update-download').disabled = $('#update-download').hidden;
  $('#update-install').disabled = $('#update-install').hidden;
  $('#create-shortcut').disabled = browserMode() || !window.workspace?.createShortcut || busy;
}
function drawUpdateNotice() {
  const notice = $('#update-notice');
  let badge = $('#update-badge');
  const openUpdates = action(() => withSavedSettings(() => { view = 4; settingsTab = 'updates'; render(); $('#update-check').focus(); }));
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'update-badge';
    badge.type = 'button';
    badge.className = 'button subtle topbar-tool';
    badge.innerHTML = `${ico('reset')}<span class="update-badge-dot" aria-hidden="true"></span>`;
    $('.topbar-right').prepend(badge);
  }
  const available = !browserMode() && updateState.supported && Boolean(updateState.version) && !['idle', 'latest', 'installing'].includes(updateState.phase);
  const title = fillText("Update available: v{0}", updateState.version);
  badge.hidden = !available;
  badge.title = title;
  badge.setAttribute('aria-label', title);
  badge.onclick = openUpdates;
  notice.hidden = !available || dismissedUpdateVersions.has(updateState.version);
  notice.setAttribute('aria-label', t("App update"));
  const message = t(updateState.phase === 'ready' ? "Update verified and ready to install." : updateState.phase === 'downloading' ? "Downloading update…" : updateState.phase === 'error' ? "Update failed. Open App & updates for details." : "Open App & updates to download it. Installation always requires your confirmation.");
  if ($('#update-notice-title').textContent !== title) $('#update-notice-title').textContent = title;
  if ($('#update-notice-message').textContent !== message) $('#update-notice-message').textContent = message;
  $('.update-notice-icon').innerHTML = ico('reset');
  $('#update-notice-open').textContent = t("View update");
  $('#update-notice-open').onclick = openUpdates;
  $('#update-notice-dismiss').innerHTML = ico('close');
  $('#update-notice-dismiss').setAttribute('aria-label', t("Dismiss update notification"));
  $('#update-notice-dismiss').onclick = () => {
    dismissedUpdateVersions.add(updateState.version);
    notice.hidden = true;
    badge.focus({ preventScroll: true });
  };
}
function adoptUpdateState(state) {
  updateState = state;
  drawUpdateState();
  drawUpdateNotice();
}
function wireUpdates() {
  drawUpdateState();
  $('#update-check').onclick = action(async () => adoptUpdateState(await workspaceApi.updates('check')));
  $('#update-download').onclick = action(async () => adoptUpdateState(await workspaceApi.updates('download')));
  $('#update-install').onclick = action(() => withSavedSettings(async () => adoptUpdateState(await workspaceApi.updates('install'))));
  $('#update-auto').onchange = action(async () => {
    try { adoptUpdateState(await workspaceApi.updates('auto-check', $('#update-auto').checked)); }
    finally { drawUpdateState(); }
  });
  $('#update-release').onclick = action(() => workspaceApi.openLink(updateState.releaseUrl));
  $('#create-shortcut').onclick = action(async () => { if (await workspaceApi.createShortcut()) notify("Shortcut created. You can now pin it to the taskbar."); });
}
function renderSettings() {
  settingsDraft = structuredClone(data.settings);
  settingsBase = structuredClone(data.settings);
  settingsDraft.highlights ??= [];
  settingsDraft.tags ??= [];
  settingsDraft.taskFields ??= []; settingsDraft.issueFields ??= [];
  settingsDraft.taskColumns = configuredColumns('tasks', settingsDraft);
  settingsDraft.issueColumns = configuredColumns('issues', settingsDraft);
  const organization = organizations.find(o => o.id === activeOrganizationId);
  $('#content').innerHTML = '<div id="settings-page">' + heading(t("Settings"), "Names, workflows and colors. Configure your workspace and take it anywhere.", ui`<button class="button primary" id="save-settings">Save settings</button>`) +
    ui`<div class="unsaved-banner" id="unsaved-banner" role="status" aria-live="polite" hidden><span class="unsaved-icon" aria-hidden="true">${ico('warning')}</span><div class="unsaved-text"><strong>You have unsaved settings.</strong> Changes, including the previewed theme and text sizes, take effect only when you save. If you leave without saving, the previous configuration remains.<span class="unsaved-where" id="unsaved-where"></span></div><div class="unsaved-actions"><button type="button" class="button small" id="discard-settings">Discard changes</button><button type="button" class="button primary small" id="save-settings-inline">Save</button></div></div><div class="info-banner"><strong>${APP_NAME}</strong> · Organization configuration: <strong>${esc(organization.name)}</strong><br>Organization settings apply only to the selected organization. App & updates applies to this portable copy.</div>
    <div class="settings-layout">${settingsNav()}<div class="settings-panels"><section class="panel settings-section full" id="organizations-panel"><h2>Organizations</h2><p class="section-description">Data and settings are isolated per organization. Your selection is saved automatically.</p>
    <details id="create-organization-section"><summary>New organization</summary><form id="create-organization"><div class="form-grid"><label class="field">Organization name<input name="name" required maxlength="100"></label><label class="field">Interface language<select name="language">${languageOptions(data.settings.language)}</select></label><label class="field full checkbox-field demo-field"><input type="checkbox" name="demo"><span>Include demo data<small>Biweekly milestones since January 2025 with sample tasks, issues, notes and hidden rows.</small></span></label><div class="field full"><label for="create-logo-file">New organization logo</label><input id="create-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"><small>Choose a logo during creation: it will be stored with the organization and automatically generate its theme.</small><div id="create-logo-preview"></div><output id="create-logo-result" aria-live="polite"></output><button type="button" class="button small" id="clear-create-logo">Remove logo</button></div></div><div class="organization-actions"><button class="button primary" type="submit">Create organization</button></div></form></details>
    <button class="button danger small" id="delete-organization" ${organizations.length === 1 ? 'disabled' : ''}>Delete organization</button></section>
        <section class="panel settings-section full" id="portal-panel"><h2>Portal link</h2><p class="section-description">Each task link is built from its portal code: enter this organization’s portal address and put the {code} placeholder where the code must appear.</p><div class="form-grid"><label class="field full">Link template<input id="portal-url-template" maxlength="2000" spellcheck="false" autocomplete="off" inputmode="url" placeholder="https://jira.company.com/browse/{code}" value="${esc(data.settings.portalUrlTemplate)}"><small>Examples: https://jira.company.com/browse/{code} or https://portal.net/{code}/details. If missing, https:// is added automatically. Leave empty to generate no links. A specific link entered in a task takes precedence.</small></label><div class="portal-preview full" id="portal-preview" aria-live="polite"></div></div></section>
        <section class="panel settings-section" id="identity-panel"><h2>Identity & navigation</h2><p class="section-description">Make this space truly yours.</p><div class="form-grid"><label class="field full">Organization name<input id="organization-name" maxlength="100" required value="${esc(organization.name)}"></label>${data.settings.tabNames.map((name, i) => ui`<label class="field">Tab name ${i + 1}<input data-tab-name="${i}" maxlength="60" required value="${esc(name)}"></label>`).join('')}
    <label class="field">Hours per effort day<input id="hours-per-day" type="number" min="0.01" max="24" step="0.01" value="${data.settings.hoursPerDay}"><small>Changes the display in days. Previously recorded hours stay the same.</small></label>
    <div class="full logo-settings"><h3>Organization logo</h3><div id="logo-preview"></div><label class="field">Upload logo and generate theme<input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">The logo and theme belong only to this organization and travel with the archive.</p><button class="button small" id="remove-logo" type="button">Remove logo</button><output id="logo-result" aria-live="polite"></output></div></div></section>
    <section class="panel settings-section full" id="languages-panel"><h2>Language & translations</h2><p class="section-description">Choose the language of this organization. Translations are plain JSON files: you can add more without changing the app.</p><div class="form-grid"><label class="field">Interface language<select id="language">${languageOptions(data.settings.language)}</select><small>Language is saved per organization. Custom names and content are not translated.</small></label><p class="language-missing" id="language-missing" role="status" hidden>This language is not installed on this PC: texts are shown in English.</p></div><div id="languages-details"></div></section>
    <section class="panel settings-section" id="themes-panel"><div class="themes-heading"><div><h2>Themes & atmosphere</h2><p class="section-description">Choose a palette or create your own.</p></div><button class="button" id="add-theme">${ico('plus')}Create theme</button></div><div class="themes-layout"><div class="theme-browser"><div class="theme-toolbar"><label class="theme-search"><span aria-hidden="true">${ico('search')}</span><input type="search" id="theme-search" placeholder="Search themes…" aria-label="Search themes" autocomplete="off" spellcheck="false" value="${esc(themeQuery)}"></label><span class="theme-count" id="theme-count" aria-live="polite"></span></div><div class="theme-gallery" id="theme-list"></div></div><div class="theme-editor-panel" id="theme-editor"></div></div></section>${fontSizePanel()}
    ${taskLayoutPanel()}<section class="panel settings-section" id="columns-panel"><h2>List columns</h2><p class="section-description">Choose which columns the task list shows and in what order. Hiding a column does not delete any data. You can also do this with the “Columns” button above the table.</p><div id="columns-editor"></div><button type="button" class="button" id="reset-columns">${ico('reset')}Restore default columns</button></section>${customColumnsPanel()}
    <section class="panel settings-section full" id="browser-panel"><h2>Browser access</h2><p class="section-description">While OrbitKanban is open you can also work from a browser on this PC, with different organizations in separate tabs. Changes sync in real time between the app and the tabs.</p><code class="data-path" id="browser-url">${esc(browserUrl || t("Not available"))}</code><div class="storage-actions"><button class="button" id="browser-open" ${browserUrl ? '' : 'disabled'}>${ico('globe')}${t(browserMode() ? "Open in new tab" : "Open in browser")}</button><button class="button" id="browser-copy" ${browserUrl ? '' : 'disabled'}>${t(browserMode() ? "Copy address" : "Copy access link")}</button></div><p class="muted">${t(browserMode() ? "You are using OrbitKanban from the browser: the app on the PC must stay open. Each tab can show a different organization." : "Reachable only from this computer (127.0.0.1) and protected by a personal key: the access link contains the key, do not share it. Closing the app disconnects the browser tabs.")}</p></section>
    ${transferPanel()}<section class="panel settings-section full" id="storage-panel"><div class="storage-heading"><div><h2>Data that travels with you</h2><p class="section-description">Local JSON archive with an automatic copy of the previous save.</p></div><span class="readonly-badge">100% LOCAL</span></div><code class="data-path">${esc(dataFolder)}</code><div class="storage-actions"><button class="button" id="export-data">${ico('export')}Export backup</button><button class="button" id="import-data">${ico('import')}Import backup</button><button class="button" id="open-folder">Open data folder</button><span class="spacer"></span><button class="button danger" id="clear-data">Clear tasks and issues</button></div><div class="backup-section"><div class="storage-heading"><div><h3>Automatic backups</h3><p class="section-description">One copy per day, kept in the data folder for the last 14 days. You can restore one without losing the current archive: the standard .bak backup is created first.</p></div><button type="button" class="button small" id="refresh-backups">Refresh backups</button></div><p id="backup-status" class="muted" role="status" aria-live="polite"></p><div id="backup-list"></div></div><p class="muted">To share the app, close it and copy the executable together with the data folder. Do not run copies using the same data folder at the same time.</p></section></div></div></div>`;
      $('.settings-panels').insertAdjacentHTML('beforeend', updatesPanel());
      showSettingsTab(settingsTab); wireSettingsNav(); wireUpdates();
      drawOptionLists(); drawThemes(); drawLogoPreview(); wireOrganizationCreation(); drawPortalPreview(); wireFontSizes(); wireLanguages();
      columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft);
      $('#reset-columns').onclick = () => { settingsDraft.taskColumns.splice(0, settingsDraft.taskColumns.length, ...configuredColumns('tasks', settingsDraft, [])); columnEditor($('#columns-editor'), settingsDraft.taskColumns, 'tasks', settingsDraft); };
      wireCustomColumns();
      $('#theme-search').oninput = event => { themeQuery = event.target.value; drawThemeChoices(); };
  $('#portal-url-template').oninput = drawPortalPreview;
  for (const type of ['input', 'change', 'click']) $('#settings-page').addEventListener(type, () => queueMicrotask(refreshSettingsState));
  $('#delete-organization').onclick = () => confirmDialog("Delete this organization?", "All its data, logo and settings will be deleted. Other organizations will not be changed. Export a backup first.", () => organizationAction('delete', { id: activeOrganizationId }));
  const logoFile = $('#logo-file'), logoResult = $('#logo-result');
  logoFile.onchange = action(async () => {
    const file = logoFile.files[0];
    if (!file) return;
    logoFile.disabled = true;
    logoResult.textContent = t("Loading image…");
    const draft = settingsDraft;
    try {
      const { logo, palette } = await processLogo(file);
      if (settingsDraft !== draft || !logoFile.isConnected) return;
      draft.logo = logo;
      let theme = draft.themes.find(theme => theme.id === 'organization-logo');
      if (!theme) {
        theme = { id: 'organization-logo', name: t("Theme from logo") };
        draft.themes.push(theme);
      }
      for (const [key] of themeFields) theme[key] = palette[key];
      draft.themeId = theme.id;
      drawLogoPreview(); drawThemes(); refreshSettingsState();
      logoResult.textContent = t("Logo loaded and theme previewed. Save settings to keep them.");
    } catch (error) { logoResult.textContent = t(error.message); throw error; }
    finally { logoFile.disabled = false; logoFile.value = ''; }
  });
  $('#remove-logo').onclick = () => { settingsDraft.logo = ''; drawLogoPreview(); logoResult.textContent = ''; };
  $('#save-settings').onclick = $('#save-settings-inline').onclick = action(async () => {
    await saveSettings(); rerenderPreservingView(); notify("Settings saved.");
  });
  $('#discard-settings').onclick = () => { render(); notify("Changes discarded."); };
  $('#export-data').onclick = action(async () => { if (await workspaceApi.exportData()) notify("Backup exported."); });
  $('#import-data').onclick = action(async () => {
    const imported = await workspaceApi.importData();
    if (imported) { clearHistory(); columnFilters = { tasks: {}, issues: {} }; issueSearch = ''; adoptSnapshot(imported); search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; selectedTasks.clear(); showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; activeSavedViewId = ''; sort = [{ key: 'releaseDate', direction: 'asc' }]; render(); notify("Archive imported."); }
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
    notify(browserMode() ? "Address copied to the clipboard." : "Access link copied to the clipboard.");
  });
  $('#clear-data').onclick = () => confirmDialog("Clear this workspace?", "All tasks and issue associations in this organization will be deleted. Themes and settings will stay unchanged. Export a backup first to keep them.", async () => {
    await commit(next => { next.tasks = []; next.issues = []; }); render(); notify("Workspace cleared.");
  });
  $('#add-theme').onclick = () => {
    const theme = structuredClone(settingsDraft.themes.find(t => t.id === settingsDraft.themeId));
    theme.id = uid(); theme.name = t("My theme"); settingsDraft.themes.push(theme); settingsDraft.themeId = theme.id;
    themeQuery = ''; $('#theme-search').value = '';
    drawThemes();
    $('#theme-name').focus(); $('#theme-name').select();
  };
}
function languageOptions(selected) {
  const installed = window.OrbitaI18n.languages();
  const list = installed.length ? installed : [{ code: 'it', name: "Italian" }];
  const options = list.map(language => `<option value="${esc(language.code)}" ${language.code === selected ? 'selected' : ''}>${esc(language.name)}</option>`);
  if (selected && !list.some(language => language.code === selected)) options.unshift(`<option value="${esc(selected)}" selected>${esc(fillText("{0} (not installed)", selected))}</option>`);
  return options.join('');
}
async function loadLanguages(operation = 'info') {
  const info = await workspaceApi.languages(operation);
  const registry = window.OrbitaI18n;
  registry.reset();
  for (const pack of info?.packs || []) {
    try { registry.register(pack, { replace: true }); }
    catch (error) { console.error('Language not registered:', pack?.code, error); }
  }
  const sources = new Map((info?.languages || []).map(language => [language.code, language.source]));
  languageInfo = {
    folder: info?.folder || '', template: info?.template || '',
    languages: registry.languages().map(language => ({ ...language, source: sources.get(language.code) || 'built-in' })),
    errors: Array.isArray(info?.errors) ? info.errors : []
  };
  return languageInfo;
}
const languageSources = { 'built-in': "Built-in", added: "Added from file", customized: "Customized from file" };
const languageSteps = [
  "Open the languages folder: it contains en.template.json, the complete English file to use as a template.",
  "Copy it using the code of the new language, for example de.json, and update code, name and locale.",
  "Translate only the values on the right: the keys on the left are the original text and must not be changed. Missing texts stay in English.",
  "Press “Reload languages”: the new language will appear in the list."
];
function drawLanguages() {
  const details = $('#languages-details');
  if (!details) return;
  const select = $('#language');
  $('#language-missing').hidden = !select || window.OrbitaI18n.has(select.value);
  const languages = languageInfo.languages.map(language => `<li><span class="language-name">${esc(language.name)}</span><code>${esc(language.code)}</code><span class="language-source ${esc(language.source)}">${esc(t(languageSources[language.source] || languageSources['built-in']))}</span></li>`).join('');
  const errors = languageInfo.errors.length ? `<div class="language-errors" role="alert"><h3>${esc(t("Ignored language files"))}</h3><ul>${languageInfo.errors.map(error => `<li><code>${esc(error.file || '—')}</code> ${esc(t(error.message))}</li>`).join('')}</ul></div>` : '';
  const folder = languageInfo.folder ? `<p class="muted language-folder-label">${esc(t("Languages folder"))}</p><code class="data-path" id="languages-folder">${esc(languageInfo.folder)}</code>` : '';
  details.innerHTML = `<div class="languages-layout"><div><h3>${esc(t("Available languages"))}</h3><ul class="language-list">${languages}</ul></div><div><h3>${esc(t("Add a language"))}</h3><ol class="language-steps">${languageSteps.map(step => `<li>${esc(t(step))}</li>`).join('')}</ol></div></div>${folder}<div class="storage-actions"><button type="button" class="button" id="open-languages-folder">${ico('folder')}${esc(t("Open languages folder"))}</button><button type="button" class="button" id="reload-languages">${esc(t("Reload languages"))}</button></div>${errors}`;
  $('#open-languages-folder').onclick = action(async () => { await loadLanguages('open-folder'); drawLanguages(); });
  $('#reload-languages').onclick = action(async () => {
    const draftLanguage = $('#language').value, changed = settingsChanged();
    await loadLanguages('reload');
    if (!changed) render();
    else { $('#language').innerHTML = languageOptions(draftLanguage); drawLanguages(); }
    notify("Languages reloaded.");
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
  if (!template) { preview.textContent = t("No template: links exist only when entered in the individual task."); return; }
  if (!hasPortalPlaceholder(template)) { preview.textContent = t("Add the {code} placeholder where the portal code must be inserted."); return; }
  if (!validPortalTemplate(template)) { preview.textContent = t("Invalid address: use a web address, for example https://jira.company.com/browse/{code}."); return; }
  const url = portalUrl({ code: sample, url: '' }, { portalUrlTemplate: template });
  preview.innerHTML = `${esc(t("Preview with"))} <strong>${esc(sample)}</strong>: <a class="portal-link" href="${esc(url)}" data-open-url>${esc(url)}${ico('external')}</a>`;
}
function drawLogoPreview() {
  $('#logo-preview').innerHTML = settingsDraft.logo ? `<img src="${settingsDraft.logo}" alt="${esc(t("Organization logo"))}">` : `<span class="muted">${t("No logo")}</span>`;
}
async function decodeImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) throw new Error(t("Choose a PNG, JPEG, WebP, GIF or BMP image."));
  if (file.size > 15 * 1024 * 1024) throw new Error(t("The image is too large. The limit is 15 MB."));
  try { return await createImageBitmap(file); }
  catch { throw new Error(t("Cannot read this image. The file may be damaged or unsupported.")); }
}
async function processLogo(file) {
  const bitmap = await decodeImage(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error(t("The image picker is unavailable on this device."));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL('image/png');
    if (logo.length > 1500000) throw new Error(t("The logo image is too large after conversion."));
    const palette = themeFromLogo(context.getImageData(0, 0, canvas.width, canvas.height).data);
    return { logo, palette };
  } finally { bitmap.close(); }
}
const highlightPalette = ['#f2c94c', '#f0647a', '#5aa9f6', '#4fcf8f', '#b18cff', '#ff9f5a', '#3fd0c9', '#ff7ac6', '#9ccc65', '#7986cb', '#e57373', '#4db6ac', '#ffd54f', '#ba68c8', '#90a4ae', '#a1887f'];
function optionCatalog(key) {
  const custom = choiceSettingsTabs().find(tab => tab.id === key);
  if (!custom) throw new Error(t("This column no longer exists."));
  return custom.field.options;
}
function setOptionCatalog(key, list) {
  const custom = choiceSettingsTabs().find(tab => tab.id === key);
  if (custom?.field.catalog) settingsDraft[custom.field.catalog] = list;
  else if (custom) custom.field.options = list;
  else throw new Error(t("This column no longer exists."));
}
function drawOptionLists() {
  closeColorPicker();
  for (const custom of choiceSettingsTabs()) {
    const key = custom.id, list = optionCatalog(key);
    if (!document.getElementById(`${key}-list`)) continue;
    const usage = id => {
      const count = data[custom.kind].filter(row => { const value = CustomColumns.valueOf(row, custom.field); return Array.isArray(value) ? value.includes(id) : value === id; }).length;
      return `<span class="option-usage" title="${esc(t("Rows with this label"))}">${count}</span>`;
    };
    document.getElementById(`${key}-list`).innerHTML = list.map((item, index) => ui`<div class="option-row">${dragHandle(item.name)}<span class="order-number">${String(index + 1).padStart(2, '0')}</span>${colorControl(item.color, item.name, `data-color="${key}:${esc(item.id)}"`)}<input class="option-name" aria-label="Option name" maxlength="60" data-option-name="${key}:${esc(item.id)}" value="${esc(item.name)}">${usage(item.id)}${key === 'statuses' ? ui`<button class="icon-button star ${item.highlight ? 'selected' : ''}" data-highlight="${esc(item.id)}" title="Highlight tasks with this status" aria-pressed="${item.highlight}">${ico(item.highlight ? 'star' : 'star-line')}</button>` : ''}<button class="icon-button" data-move="${key}:${esc(item.id)}:-1" ${index === 0 ? 'disabled' : ''} title="Move up">${ico('arrow-up')}</button><button class="icon-button" data-move="${key}:${esc(item.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} title="Move down">${ico('arrow-down')}</button><button class="icon-button delete-option" data-remove="${key}:${esc(item.id)}" title="Delete option">${ico('close')}</button></div>`).join('') || `<p class="muted option-empty">${esc(t("No labels. Add one to get started."))}</p>`;
    const choiceAdd = document.querySelector(`[data-add-choice="${key}"]`);
    if (choiceAdd) choiceAdd.disabled = list.length >= (key === 'highlights' ? HIGHLIGHT_LIMIT : TAG_LIMIT);
    sortable(document.getElementById(`${key}-list`), '.option-row', (from, to) => { list.splice(to, 0, ...list.splice(from, 1)); drawOptionLists(); refreshSettingsState(); });
  }
  function optionId(value) { const [key, ...parts] = value.split(':'); return [key, parts.join(':')]; }
  function itemAt(value) { const [key, id] = optionId(value); return optionCatalog(key).find(x => x.id === id); }
  document.querySelectorAll('[data-color]').forEach(button => {
    button.onclick = () => openColorPicker(button);
    button.oninput = () => { itemAt(button.dataset.color).color = button.value; updateColorControl(button, button.value); refreshSettingsState(); };
  });
  document.querySelectorAll('[data-option-name]').forEach(input => input.oninput = () => {
    itemAt(input.dataset.optionName).name = input.value;
    const button = input.closest('.option-row').querySelector('.color-control');
    button.dataset.colorLabel = input.value; updateColorControl(button, button.value);
  });
  document.querySelectorAll('[data-highlight]').forEach(b => b.onclick = () => {
    const item = settingsDraft.statuses.find(s => s.id === b.dataset.highlight); item.highlight = !item.highlight; drawOptionLists();
  });
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
    const parts = b.dataset.move.split(':'), key = parts.shift(), offset = parts.pop(), id = parts.join(':'), list = optionCatalog(key), index = list.findIndex(x => x.id === id);
    [list[index], list[index + Number(offset)]] = [list[index + Number(offset)], list[index]]; drawOptionLists(); refreshSettingsState();
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    const [key, id] = optionId(b.dataset.remove);
    setOptionCatalog(key, optionCatalog(key).filter(x => x.id !== id)); drawOptionLists(); refreshSettingsState();
  });
}
const themeFields = [['background', "Background"], ['surface', "Surfaces"], ['text', "Text"], ['accent', "Accent"]];
const themePresets = new Map(defaultThemes().map(theme => [theme.id, theme]));
function themeKind(theme) {
  const preset = themePresets.get(theme.id);
  if (!preset) return "Custom";
  return theme.name === preset.name && themeFields.every(([key]) => theme[key].toLowerCase() === preset[key]) ? "Built-in" : "Modified built-in";
}
function drawThemeChoices() {
  const query = themeQuery.trim().toLocaleLowerCase(), total = settingsDraft.themes.length;
  const themes = settingsDraft.themes.filter(theme => !query || theme.name.toLocaleLowerCase().includes(query));
  const themeCount = plural(total, 'theme');
  $('#theme-count').textContent = query ? `${themes.length} / ${themeCount}` : themeCount;
  $('#theme-list').innerHTML = themes.length ? themes.map(theme => {
    const chosen = theme.id === settingsDraft.themeId, mock = themeFields.map(([key]) => `--mock-${key}:${theme[key]}`).join(';');
    return `<button type="button" class="theme-choice ${chosen ? 'chosen' : ''}" data-theme="${esc(theme.id)}" aria-pressed="${chosen}" title="${esc(theme.name)}"><span class="theme-mock" style="${mock}" aria-hidden="true"><span class="theme-mock-card"><span class="theme-mock-line"></span><span class="theme-mock-pill"></span></span></span><span class="theme-choice-info"><span class="theme-choice-name">${esc(theme.name)}</span><span class="theme-kind">${esc(t(themeKind(theme)))}</span><span class="theme-swatches">${themeFields.map(([key, label]) => `<i style="background:${theme[key]}" title="${t(label)}: ${theme[key]}" role="img" aria-label="${t(label)}: ${theme[key]}"></i>`).join('')}</span></span>${chosen ? `<span class="theme-check" aria-hidden="true">${ico('check')}</span>` : ''}</button>`;
  }).join('') : `<p class="theme-empty">${esc(t("No theme matches your search."))}</p>`;
  document.querySelectorAll('#theme-list [data-theme]').forEach(b => b.onclick = () => {
    settingsDraft.themeId = b.dataset.theme; drawThemes();
    document.querySelector(`#theme-list [data-theme="${CSS.escape(b.dataset.theme)}"]`)?.focus({ preventScroll: true });
  });
}
function updateThemeChoice(theme) {
  const choice = document.querySelector(`#theme-list [data-theme="${CSS.escape(theme.id)}"]`);
  if (!choice) return;
  choice.querySelector('.theme-kind').textContent = t(themeKind(theme));
  themeFields.forEach(([key, label], index) => {
    choice.querySelector('.theme-mock').style.setProperty(`--mock-${key}`, theme[key]);
    const swatch = choice.querySelectorAll('.theme-swatches i')[index];
    swatch.style.background = theme[key];
    swatch.title = `${t(label)}: ${theme[key]}`;
    swatch.setAttribute('aria-label', swatch.title);
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
    if (!context) throw new Error("The image picker is unavailable on this device.");
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false;
    return true;
  } finally { bitmap.close(); }
}
function drawThemes() {
  closeColorPicker();
  drawThemeChoices();
  const theme = settingsDraft.themes.find(t => t.id === settingsDraft.themeId);
  paintTheme(theme);
  $('#theme-editor').innerHTML = ui`<div class="theme-edit"><h3 class="theme-edit-title">Edit theme</h3><label class="field">Theme name<input id="theme-name" value="${esc(theme.name)}"></label><div class="theme-colors">${themeFields.map(([key, label]) => `<div class="theme-color-field"><span>${esc(t(label))}</span>${colorControl(theme[key], t(label), `data-theme-color="${key}"`, true)}</div>`).join('')}</div>
    <div class="image-picker"><label class="field">Generate 4 colors from an image<input id="theme-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"></label><p class="muted">Upload an image: background, surfaces, text and accent are extracted and assigned automatically. You can then adjust them with the color controls. Transparency is shown on white. Colors are adjusted as little as possible to meet WCAG AA contrast.</p><canvas id="theme-image-canvas" hidden role="img" aria-label="Image used to automatically generate the four theme colors"></canvas><label class="field">Optional adjustment: color to sample with a click<select id="theme-image-target">${themeFields.map(([key, label]) => `<option value="${key}">${t(label)}</option>`).join('')}</select></label><output id="theme-image-result" aria-live="polite">The image stays local and is not saved: only colors are stored in the theme.</output></div>
    <small class="muted">Live preview: the theme is applied to the app immediately. Save settings to keep it, otherwise the previous one remains.</small>${themePresets.has(theme.id) ? ui`<button class="button small" id="reset-theme">Restore built-in theme</button>` : ui`<button class="button small" id="delete-theme">Delete theme</button>`}</div>`;
  $('#theme-name').oninput = e => { theme.name = e.target.value; drawThemeChoices(); };
  document.querySelectorAll('[data-theme-color]').forEach(button => {
    button.onclick = () => openColorPicker(button);
    button.oninput = () => { theme[button.dataset.themeColor] = button.value; updateColorControl(button, button.value); updateThemeChoice(theme); paintTheme(theme); refreshSettingsState(); };
  });
  const canvas = $('#theme-image-canvas'), fileInput = $('#theme-image-file'), result = $('#theme-image-result');
  fileInput.onchange = action(async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.disabled = true;
    result.textContent = t("Loading image…");
    try {
      if (await loadThemeImage(file, canvas)) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error("Cannot extract a palette from this image.");
        const palette = themeFromImage(context.getImageData(0, 0, canvas.width, canvas.height).data);
        for (const [key] of themeFields) {
          theme[key] = palette[key];
          updateColorControl(document.querySelector(`[data-theme-color="${key}"]`), palette[key]);
        }
        updateThemeChoice(theme); paintTheme(theme); refreshSettingsState();
        const contrastNote = palette.adjusted.length
          ? fillText("Adjusted as little as possible for WCAG AA contrast: {0}.", palette.adjusted.map(role => t(themeFields.find(([key]) => key === role)[1]).toLowerCase()).join(', '))
          : t("The extracted colors already meet WCAG AA contrast.");
        result.textContent = `${file.name} — ${t("four colors assigned automatically.")} ${palette.colorCount < 4 ? t("The image has few distinct colors: some roles share the same color.") + ' ' : ''}${contrastNote} ${t("Click “Save settings” to keep them.")}`;
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
    if (!context) throw new Error("Cannot read the image color.");
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
    if (settingsDraft.themes.length === 1) { notify("At least one theme must remain.", true); return; }
    settingsDraft.themes = settingsDraft.themes.filter(t => t.id !== theme.id); settingsDraft.themeId = settingsDraft.themes[0].id; drawThemes();
  };
  revealChosenTheme();
}
$('#settings-button').onclick = () => { view = 4; render(); };
$('#guide-button').onclick = openGuide;
$('#sidebar-toggle').onclick = toggleSidebar;
$('#folder-button').onclick = action(() => workspaceApi.openDataFolder());
async function openBrowserAccess() {
  await workspaceApi.browserAccess('open', activeOrganizationId);
  if (!browserMode()) notify("Organization opened in the default browser.");
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
  if ($('#form-designer')?.open) return;
  const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (e.key === 'F1' && !command && !e.altKey && !$('#modal').open && data) { e.preventDefault(); openGuide(); return; }
  if (command && key === 'k' && !$('#modal').open && data) { e.preventDefault(); action(() => withSavedSettings(openGlobalSearch))(); return; }
  // Rich text keeps Ctrl+B for bold.
  if (command && key === 'b' && !e.shiftKey && !e.altKey && !$('#modal').open && !e.target.isContentEditable) { e.preventDefault(); if (!e.repeat) toggleSidebar(); return; }
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
  const enterColor = color => { $('#color-hex').value = color; $('#color-hex').dispatchEvent(new Event('input', { bubbles: true })); };
  const pickColor = (button, color) => { button.click(); enterColor(color); $('#color-picker').requestSubmit(); };
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
      if (Date.now() > deadline) throw new Error(`Timeout while saving the test. After: ${checks.at(-1) || '-'}${$('#toast')?.textContent ? `; message: ${$('#toast').textContent}` : ''}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const initialTaskCount = data.tasks.length;
  const tableArea = $('.table-scroll').getBoundingClientRect();
  check($('.page-heading').offsetHeight <= 75 && tableArea.top < 330 && tableArea.height >= innerHeight * 0.5 && tableArea.bottom <= $('footer').getBoundingClientRect().top, 'Compact heading leaves at least half the window available for the table');
  check(getComputedStyle($('.page-heading h1')).userSelect === 'none' && getComputedStyle($('#task-rows td')).userSelect === 'none' && getComputedStyle($('#search')).userSelect === 'text', "Interface text is not selectable, while search text is selectable");
  const boxOf = selector => $(selector).getBoundingClientRect(), heightOf = selector => Math.round(boxOf(selector).height);
  check(['#global-search', '#redo-button', '#save-status', '.topbar-right .avatar'].every(selector => heightOf(selector) === heightOf('#undo-button')) && Math.round(boxOf('#undo-button').width) === heightOf('#undo-button'), 'Top-bar controls share one height and undo/redo are square');
  check(heightOf('#new-task') === heightOf('#columns-button') && heightOf('#columns-button') === heightOf('#reset-sort') && heightOf('#reset-sort') === heightOf('#saved-view-manage') && document.querySelectorAll('#task-rows tr:first-child td:last-child .icon-button').length && [...document.querySelectorAll('#task-rows tr:first-child td:last-child .icon-button')].every(button => Math.round(button.getBoundingClientRect().height) === Math.round(button.getBoundingClientRect().width)), 'Page buttons, toolbar buttons and row actions use the shared size scale');
  const iconSprite = document.getElementById('orbit-icon-sprite');
  check(iconSprite && window.OrbitaIcons.names().every(name => iconSprite.querySelector(`symbol#i-${name}`)) && document.querySelectorAll('#navigation .nav-icon svg.ico').length === data.settings.tabNames.length && $('#settings-button svg.ico') && $('#new-task svg.ico') && $('#columns-button svg.ico') && !/[▤⌘◈▥⚙⌕↶↷↗＋◉◌⋯▽▾]/.test([...document.querySelectorAll('#navigation button, .topbar button, #content .page-heading button, #content .table-toolbar button, #task-rows td:last-child button')].map(button => button.textContent).join('')), 'Icons come from the shared sprite instead of text glyphs');
  const rootStyle = getComputedStyle(document.documentElement), hexOf = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  check(getComputedStyle($('#navigation .nav-icon .ico')).getPropertyValue('--ico-front').trim() === 'url(#ig-blue)' && Object.keys(window.OrbitaCore.ICON_FAMILIES).every(family => /^#[0-9a-f]{6}$/i.test(rootStyle.getPropertyValue(`--ig-${family}-1`).trim())), 'Feature icons use per-theme gradient stops');
  check(window.OrbitaCore.contrastRatio(hexOf(getComputedStyle($('#new-task')).color), hexOf(getComputedStyle($('#new-task')).backgroundColor)) >= 4.5, 'Primary button labels meet WCAG AA contrast on the accent');
  if (customTitleBar()) {
    const overlay = navigator.windowControlsOverlay, area = overlay?.visible ? overlay.getTitlebarAreaRect() : null;
    const controls = area ? innerWidth - area.x - area.width : 0, region = selector => getComputedStyle($(selector)).getPropertyValue('-webkit-app-region');
    check(document.documentElement.classList.contains('custom-titlebar') && region('.topbar') === 'drag' && region('.sidebar .brand') === 'drag' && region('#modal') === 'no-drag' && region('#toast') === 'no-drag' && region('#organization-select') !== 'drag' && controls >= 90 && parseFloat(getComputedStyle($('.topbar')).paddingRight) >= controls + 23 && $('.topbar .avatar').getBoundingClientRect().right <= innerWidth - controls, 'Top bar is draggable as a title bar with room for window controls');
    const style = document.documentElement.style;
    check(windowChromeSent && windowChromeSent.background === style.getPropertyValue('--background') && windowChromeSent.text === style.getPropertyValue('--text') && windowChromeSent.height === $('.topbar').clientHeight && $('.topbar').clientHeight < $('.topbar').offsetHeight && windowChromeSent.dimmed === false && Math.abs(area.height - windowChromeSent.height) <= 1, 'Window controls match the theme colors and top bar height');
    openModal('<p>OrbitKanban</p>');
    await tick();
    const dimmed = windowChromeSent.dimmed === true;
    $('#modal').close();
    await tick();
    check(dimmed && windowChromeSent.dimmed === false, 'Window controls dim with the page while dialogs are open');
  }
  // Sidebar toggle: the menu button and Ctrl+B fold the sidebar into a column of icons; the smoke run ends with it expanded.
  const sidebar = $('#sidebar'), sidebarToggle = $('#sidebar-toggle'), sidebarWidth = boxOf('#sidebar').width, tableWidth = boxOf('.table-scroll').width;
  const sidebarState = folded => document.documentElement.classList.contains('sidebar-collapsed') === folded && !sidebar.inert && sidebarToggle.getAttribute('aria-expanded') === String(!folded) && Math.abs(boxOf('main').left - boxOf('#sidebar').width) < 1;
  const inRail = () => sidebarState(true), expanded = () => sidebarState(false) && Math.abs(boxOf('#sidebar').width - sidebarWidth) < 1;
  const tooltipTargets = () => [...document.querySelectorAll('#navigation .nav-button, #settings-button, #open-browser, #organization-select')];
  const insideRail = element => { const box = element.getBoundingClientRect(), rail = boxOf('#sidebar'); return box.width > 1 && box.height > 1 && box.left >= rail.left - 0.5 && box.right <= rail.right + 0.5; };
  const labelHidden = element => element.getBoundingClientRect().width <= 1 && element.getBoundingClientRect().height <= 1;
  const pressCtrlB = target => { const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event.defaultPrevented; };
  const finishSidebarMotion = () => sidebarAnimations.forEach(animation => animation.finish());
  const seekSidebarMotion = time => sidebarAnimations.forEach(animation => { animation.pause(); animation.currentTime = time; });
  check(expanded() && sidebarWidth > 150 && sidebarToggle.getAttribute('aria-controls') === 'sidebar' && sidebarToggle.getAttribute('aria-keyshortcuts') === 'Control+B' && sidebarToggle.getAttribute('aria-label') === t("Sidebar") && sidebarToggle.title === t("Collapse the sidebar (Ctrl+B)") && sidebarToggle.querySelector('use')?.getAttribute('href') === '#i-menu' && heightOf('#sidebar-toggle') === heightOf('#undo-button') && Math.round(boxOf('#sidebar-toggle').width) === heightOf('#sidebar-toggle') && boxOf('#sidebar-toggle').right < boxOf('.breadcrumb').left && (!customTitleBar() || getComputedStyle(sidebarToggle).getPropertyValue('-webkit-app-region') === 'no-drag') && tooltipTargets().every(element => !element.hasAttribute('title')), 'Menu button sits in the top bar as a square tool before the breadcrumb');
  const initialIcon = boxOf('#navigation .nav-icon');
  sidebarToggle.click();
  if (!sidebarReducedMotion.matches) {
    seekSidebarMotion(0);
    check(Math.abs(boxOf('#sidebar').width - sidebarWidth) < 1 && Math.abs(boxOf('#navigation .nav-icon').left - initialIcon.left) < 1 && Math.abs(boxOf('#navigation .nav-icon').top - initialIcon.top) < 1, 'Sidebar motion starts at the visible layout without jumping the icons');
    seekSidebarMotion(110);
    const middleWidth = boxOf('#sidebar').width, targetWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-sidebar')) * 68;
    check(sidebarAnimations.every(animation => animation.effect.getTiming().duration === 220) && middleWidth > targetWidth + 1 && middleWidth < sidebarWidth - 1 && Math.abs(boxOf('main').left - middleWidth) < 1 && Math.abs(boxOf('main').right - innerWidth) < 1 && Math.abs(parseFloat(getComputedStyle($('#toast')).left) - (innerWidth + middleWidth) / 2) < 1 && Math.abs(boxOf('#navigation .nav-icon').width - initialIcon.width) < 1, 'Sidebar animates for 220ms with synchronized content and toast, without stretching icons');
  }
  finishSidebarMotion();
  const railWidth = boxOf('#sidebar').width;
  check(inRail() && sidebarToggle.title === t("Expand the sidebar (Ctrl+B)") && railWidth >= 48 && railWidth < sidebarWidth / 2 && Math.abs(boxOf('.table-scroll').width - tableWidth - (sidebarWidth - railWidth)) < 1 && sidebar.scrollWidth <= sidebar.clientWidth && localStorage.getItem('orbitkanban.sidebarCollapsed') === '1', 'Menu button folds the sidebar into a column of icons and gives the space to the list');
  const railButtons = [...document.querySelectorAll('#navigation .nav-button, #guide-button, #settings-button')], railCenter = (boxOf('#sidebar').left + boxOf('#sidebar').right) / 2;
  check(railButtons.length === data.settings.tabNames.length + 2 && railButtons.every(button => { const icon = button.querySelector('.nav-icon'), box = icon.getBoundingClientRect(), label = button.querySelector('.nav-label'); return insideRail(icon) && Math.abs((box.left + box.right) / 2 - railCenter) < 2 && labelHidden(label) && button.title === (button.id === 'guide-button' ? term("Open the guide (F1)") : label.textContent); }) && $('#navigation .nav-button').title === data.settings.tabNames[0] && $('#settings-button').title === t("Settings") && [...document.querySelectorAll('.brand > div:last-child, .local-card')].every(element => !element.getClientRects().length) && insideRail($('.brand-icon')) && insideRail($('#app-version')), 'Column keeps every view icon, the guide and settings, with their names as tooltips');
  const taskBadge = $('#navigation .nav-count'), listIcon = $('#navigation .nav-icon').getBoundingClientRect();
  check(insideRail(taskBadge) && taskBadge.textContent === String(visibleTasks().length) && getComputedStyle(taskBadge).position === 'absolute' && taskBadge.getBoundingClientRect().left > (listIcon.left + listIcon.right) / 2 && taskBadge.getBoundingClientRect().top > listIcon.top, 'Task counter becomes a badge on the list icon');
  $('#navigation [data-view="1"]').click();
  check(view === 1 && inRail() && $('#navigation [data-view="1"]').classList.contains('active') && $('#navigation [data-view="1"]').title === data.settings.tabNames[1] && $('#settings-button').title === t("Settings") && $('#current-tab').textContent === data.settings.tabNames[1], 'Views open from the column and it stays folded across renders');
  $('#navigation [data-view="0"]').click();
  await tick();
  const organizationIcon = boxOf('.organization-icon'), organizationMenu = boxOf('#organization-select'), activeOrganizationName = organizations.find(o => o.id === activeOrganizationId).name;
  check(view === 0 && inRail() && insideRail($('.organization-icon')) && ['top', 'left', 'width', 'height'].every(side => Math.abs(organizationIcon[side] - organizationMenu[side]) < 1) && document.elementFromPoint(organizationIcon.left + organizationIcon.width / 2, organizationIcon.top + organizationIcon.height / 2) === $('#organization-select') && $('#organization-select').title === fillText("Organization: {0}", activeOrganizationName) && !$('#manage-organizations').getClientRects().length && insideRail($('#open-browser')) && labelHidden($('#open-browser .nav-label')) && $('#open-browser').title === $('#open-browser .nav-label').textContent, 'Organization menu and browser button stay usable from the column');
  const editableProbe = document.createElement('div');
  editableProbe.contentEditable = 'true';
  $('#content').append(editableProbe);
  const boldKept = !pressCtrlB(editableProbe) && inRail();
  editableProbe.remove();
  openModal('<p>OrbitKanban</p>');
  const dialogKept = !pressCtrlB($('#modal-content')) && inRail();
  $('#modal').close();
  await tick();
  check(boldKept && dialogKept, 'Ctrl+B is left to rich text and ignored while a dialog is open');
  const expandedWithShortcut = pressCtrlB(document.body);
  if (!sidebarReducedMotion.matches) {
    seekSidebarMotion(110);
    check(boxOf('#sidebar').width > railWidth + 1 && boxOf('#sidebar').width < sidebarWidth - 1 && Math.abs(boxOf('main').left - boxOf('#sidebar').width) < 1 && Number(getComputedStyle($('#navigation .nav-label')).opacity) > 0 && Number(getComputedStyle($('#navigation .nav-label')).opacity) < 1, 'Expanding slides the sidebar back and fades in the labels');
  }
  finishSidebarMotion();
  check(expandedWithShortcut && expanded() && Math.abs(boxOf('.table-scroll').width - tableWidth) < 1 && localStorage.getItem('orbitkanban.sidebarCollapsed') === null && tooltipTargets().every(element => !element.hasAttribute('title')) && $('#manage-organizations').getClientRects().length > 0 && !labelHidden($('#navigation .nav-label')), 'Ctrl+B expands the sidebar again and restores the layout');
  const navButton = $('#navigation .nav-button');
  navButton.focus();
  pressCtrlB(navButton);
  finishSidebarMotion();
  const iconFocusKept = inRail() && document.activeElement === navButton;
  pressCtrlB(navButton);
  finishSidebarMotion();
  $('#manage-organizations').focus();
  pressCtrlB($('#manage-organizations'));
  finishSidebarMotion();
  check(iconFocusKept && inRail() && document.activeElement === sidebarToggle, 'Folding keeps the focus on icons and moves it from hidden controls to the menu button');
  sidebarToggle.click();
  finishSidebarMotion();
  check(expanded() && localStorage.getItem('orbitkanban.sidebarCollapsed') === null, 'Menu button expands the sidebar again');
  if (!sidebarReducedMotion.matches) {
    sidebarToggle.click();
    seekSidebarMotion(80);
    const interruptedWidth = boxOf('#sidebar').width, interruptedIcon = boxOf('#navigation .nav-icon');
    sidebarToggle.click();
    seekSidebarMotion(0);
    check(Math.abs(boxOf('#sidebar').width - interruptedWidth) < 1 && Math.abs(boxOf('#navigation .nav-icon').left - interruptedIcon.left) < 1 && Math.abs(boxOf('#navigation .nav-icon').top - interruptedIcon.top) < 1, 'Rapid toggles reverse the animation from its current position');
    finishSidebarMotion();
    check(expanded() && localStorage.getItem('orbitkanban.sidebarCollapsed') === null, 'Interrupted sidebar motion settles in the last requested state');
  }
  taskDialog(data.tasks.find(task => !task.hidden));
  const editModal = $('#modal'), editBody = $('.task-edit-layout'), editWidth = editModal.clientWidth;
  const propertiesSection = $('#task-form [data-section="section-properties"]'), textSection = $('#task-form [data-section="section-text"]');
  check(editWidth >= Math.min(1100, innerWidth * 0.9) && propertiesSection.getBoundingClientRect().right < textSection.getBoundingClientRect().left && $('#task-form .task-edit-pool').hidden, "Wide task editor places properties and text side by side");
  check(editModal.scrollHeight <= editModal.clientHeight + 1 && editBody.scrollHeight <= editBody.clientHeight + 1 && $('#task-form [type="submit"]').getBoundingClientRect().bottom <= innerHeight, 'Desktop editor fits onscreen without scrolling the modal');
  check($('#task-form [data-form-field="sequence"] .required-mark') && $('#task-form').elements.sequence.getAttribute('aria-required') === 'true' && document.querySelectorAll('#task-form .required-mark').length === 1, 'Default required fields are marked in the task editor');
  $('#description-editor').innerHTML = "<p>Long description to edit.</p>".repeat(100);
  $('#notes-editor').innerHTML = "<p>Long notes to edit.</p>".repeat(100);
  check($('#description-editor').scrollHeight > $('#description-editor').clientHeight && $('#notes-editor').scrollHeight > $('#notes-editor').clientHeight && editBody.scrollHeight <= editBody.clientHeight + 1, 'Long text scrolls only inside the editors without moving fields or buttons');
  editModal.close();
  openModal('<p>OrbitKanban</p>');
  check($('#modal').clientWidth < editWidth, 'Other dialogs keep a compact layout');
  $('#modal').close();
  {
    const baseline = structuredClone(data), taskId = data.tasks.find(task => !task.hidden).id;
    await commit(next => {
      next.settings.taskFields.push({ id: 'custom-layout-value', name: 'Layout value', type: 'text', options: [] }, { id: 'custom-layout-text', name: 'Layout text', type: 'richtext', options: [] });
      next.tasks.find(task => task.id === taskId).customFields = { 'custom-layout-value': 'Keep this value', 'custom-layout-text': '<p>Keep this text</p>' };
    });
    view = 4; render(); showSettingsTab('task-layout');
    const fieldCount = taskEditorFields(data.settings).length;
    check(!$('#task-layout-panel').hidden && $('#task-layout-mini').querySelectorAll('.layout-mini-field').length === fieldCount && $('#task-required-summary').textContent.includes(term('Sequence')) && !settingsChanged(), 'Task layout settings summarize the form and its required fields without creating unsaved changes');
    const key = (target, name, options = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }));
    const pointer = (target, type, x, y) => (type === 'pointerdown' ? target : window).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: y }));
    const centre = element => { const box = element.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; };
    const tap = element => { const [x, y] = centre(element); pointer(element, 'pointerdown', x, y); pointer(element, 'pointerup', x, y); };
    const dragTo = (source, [x, y]) => { const [sx, sy] = centre(source); pointer(source, 'pointerdown', sx, sy); pointer(source, 'pointermove', sx + 8, sy + 8); pointer(source, 'pointermove', x, y); pointer(source, 'pointerup', x, y); };
    const change = (element, value) => { if (element.type === 'checkbox') element.checked = value; else element.value = value; element.dispatchEvent(new Event(element.type === 'checkbox' || element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    $('#open-form-designer').click();
    const designer = $('#form-designer'), inDesigner = selector => designer.querySelector(selector), onForm = id => inDesigner(`#designer-layout [data-designer-field="${id}"]`);
    check(designer?.open && designer.getBoundingClientRect().width >= innerWidth - 1 && designer.querySelectorAll('[data-palette-field]').length === fieldCount && designer.querySelectorAll('#designer-layout .designer-item').length === fieldCount && inDesigner('.designer-ghost .designer-ghost-app') && inDesigner('#designer-modal.task-form'), 'Form designer opens full screen with the field list, the blurred app and a live form preview');
    check(!inDesigner('#designer-apply') && inDesigner('#designer-save.primary') && inDesigner('.designer-tools').querySelectorAll('.button.primary').length === 1, 'The designer offers a single save action');
    if (customTitleBar()) {
      const area = navigator.windowControlsOverlay.getTitlebarAreaRect(), controls = innerWidth - area.x - area.width, bar = inDesigner('.designer-bar'), region = element => getComputedStyle(element).getPropertyValue('-webkit-app-region');
      check(controls >= 90 && region(bar) === 'drag' && [...bar.querySelectorAll('button')].every(button => region(button) === 'no-drag' && button.getBoundingClientRect().right <= innerWidth - controls) && bar.getBoundingClientRect().height >= area.height && windowChromeSent.background === document.documentElement.style.getPropertyValue('--surface'), 'The designer bar drags the window, keeps its buttons clear of the window controls and lends them its color');
    }
    onForm('code').focus(); key(onForm('code'), 'Delete');
    check(!onForm('code') && !inDesigner('[data-palette-field="code"]').classList.contains('is-placed') && !inDesigner('#designer-undo').disabled && document.activeElement?.dataset.designerField, 'Delete removes the focused field from the form, returns it to the field list and keeps focus on the form');
    key(designer, 'z', { ctrlKey: true });
    const restored = Boolean(onForm('code'));
    key(designer, 'y', { ctrlKey: true });
    check(restored && !onForm('code'), 'Ctrl+Z and Ctrl+Y undo and redo designer changes');
    const component = inDesigner('[data-add-section="1"]'), [cx, cy] = centre(component);
    pointer(component, 'pointerdown', cx, cy); pointer(component, 'pointerup', cx, cy);
    const sectionId = inDesigner('.designer-section.is-selected')?.dataset.designerSection;
    check(sectionId && inDesigner('#designer-section-name') && designer.querySelectorAll('[data-designer-section]').length === 3, 'Section components add a new section and select it');
    const nameInput = inDesigner('#designer-section-name');
    nameInput.focus(); change(nameInput, 'Planning');
    check(inDesigner(`[data-designer-section="${sectionId}"] .task-form-section-title`)?.textContent === 'Planning' && document.activeElement === nameInput, 'Section properties rename the section live while typing');
    const paletteCode = inDesigner('[data-palette-field="code"]');
    paletteCode.focus(); key(paletteCode, 'Enter');
    check(inDesigner(`[data-designer-section="${sectionId}"] [data-designer-field="code"]`) && document.activeElement === onForm('code'), 'Enter on a listed field adds it to the selected section');
    const planned = () => [...designer.querySelectorAll(`[data-designer-section="${sectionId}"] [data-designer-field]`)].map(item => item.dataset.designerField).join();
    const codeBox = onForm('code').getBoundingClientRect();
    dragTo(onForm('custom-layout-value'), [codeBox.right - 3, codeBox.top + codeBox.height / 2]);
    check(planned() === 'code,custom-layout-value' && inDesigner('.designer-drop-indicator').hidden && !designer.classList.contains('is-dragging'), 'Dragging a field drops it at the pointer position in another section');
    onForm('custom-layout-value').focus(); key(onForm('custom-layout-value'), 'ArrowUp');
    check(planned() === 'custom-layout-value,code' && document.activeElement === onForm('custom-layout-value'), 'Arrow keys reorder the focused field and keep focus on it');
    dragTo(onForm('custom-layout-value'), centre(inDesigner('#designer-fields')));
    check(!onForm('custom-layout-value') && !inDesigner('[data-palette-field="custom-layout-value"]').classList.contains('is-placed'), 'Dropping a field on the field list removes it from the form');
    tap(onForm('code'));
    change(inDesigner('#designer-field-required'), true);
    check(onForm('code').querySelector('.required-mark') && inDesigner('[data-palette-field="code"] .required-mark') && inDesigner('#designer-field-required').checked, 'Required can be set in the field properties and shows on the preview and in the field list');
    tap(onForm('hidden'));
    check(inDesigner('#designer-field-required').disabled, 'Fields that are never empty cannot be required');
    const width = settingsDraft.taskEditorLayout.width, east = inDesigner('[data-grip="e"]');
    east.focus(); key(east, 'ArrowLeft', { shiftKey: true });
    check(inDesigner('#designer-modal').style.getPropertyValue('--task-form-width') === `${width - 50}px` && inDesigner('#designer-size').textContent.startsWith(`${width - 50} ×`), 'The window edge resizes the form with the keyboard and shows its size');
    const south = inDesigner('[data-grip="s"]'), [gx, gy] = centre(south);
    pointer(south, 'pointerdown', gx, gy); pointer(south, 'pointermove', gx, gy + 60); pointer(south, 'pointerup', gx, gy + 60);
    check(inDesigner('#designer-modal').classList.contains('fixed-height') && !inDesigner('#designer-auto-height').checked && Number(inDesigner('#designer-height').value) >= 360, 'Dragging the bottom edge switches the form to a fixed height');
    inDesigner('[data-preset="100"]').click();
    check(designer.querySelectorAll('#designer-layout > .task-form-column').length === 1 && designer.querySelectorAll('[data-designer-section]').length === 3, 'Column presets keep the sections of removed layout columns');
    key(designer, 'z', { ctrlKey: true });
    check(designer.querySelectorAll('#designer-layout > .task-form-column').length === 2 && inDesigner('#designer-modal').classList.contains('fixed-height'), 'Undo restores the previous column layout');
    key(designer, 'Escape');
    check($('#modal').open && $('#confirm-action') && designer.open, 'Escape asks before discarding the designer changes');
    $('#modal [data-close]').click();
    check(designer.open && !$('#modal').open && document.body.contains(designer), 'Cancelling the confirmation keeps the designer open');
    inDesigner('#designer-save').click();
    await waitFor(() => !saving && !$('#form-designer') && data.settings.requiredTaskColumns.includes('code'));
    const savedLayout = data.settings.taskEditorLayout, planning = savedLayout.columns.flatMap(column => column.sections).find(section => section.id === sectionId);
    check(planning?.name === 'Planning' && planning.fields.map(field => field.id).join() === 'code' && savedLayout.unplaced.includes('custom-layout-value') && savedLayout.height > 0 && $('#settings-tab-task-layout .settings-tab-dot').hidden && !settingsChanged() && (!customTitleBar() || windowChromeSent.background === document.documentElement.style.getPropertyValue('--background')), 'Save stores the designed form and required fields in one step and closes the designer');
    check($('#custom-definitions-tasks [data-field-id="code"] [data-field-required]').checked && $('#custom-definitions-tasks [data-field-id="tags"] [data-field-required]').disabled && $('#task-required-summary').textContent.includes(term('Portal code')), 'Column management and the layout summary show the new required field');
    const configured = structuredClone(data.settings.taskEditorLayout), savedTask = structuredClone(data.tasks.find(task => task.id === taskId)), stored = (await workspaceApi.load()).data.settings;
    check(JSON.stringify(stored.taskEditorLayout) === JSON.stringify(configured) && stored.requiredTaskColumns.join() === 'sequence,code' && JSON.stringify(data.settings.taskColumns) === JSON.stringify(baseline.settings.taskColumns.concat([{ id: 'custom-layout-value', visible: true }, { id: 'custom-layout-text', visible: true }])), 'Task form and required fields persist without reordering or hiding list columns');
    taskDialog(savedTask);
    const form = $('#task-form'), planningSection = form.querySelector(`[data-section="${sectionId}"]`);
    check(planningSection?.querySelector('.task-form-section-title')?.textContent === 'Planning' && planningSection.contains(form.elements.code) && form.querySelector('.task-edit-pool').contains(form.elements['custom-layout-value']) && form.elements['custom-layout-value'].value === 'Keep this value' && form.querySelector('[data-form-field="code"] .required-mark') && form.classList.contains('fixed-height'), 'The task editor uses the designed sections and size, keeps values of fields off the form and marks required fields');
    form.elements.code.value = '';
    form.requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 50));
    check($('#modal').open && form.querySelector('[data-form-field="code"] .field-error') && form.elements.code.getAttribute('aria-invalid') === 'true' && document.activeElement === form.elements.code, 'Empty required fields block saving, are flagged and receive focus');
    form.elements.code.value = savedTask.code || 'PRJ-LAYOUT';
    form.elements.code.dispatchEvent(new Event('input', { bubbles: true }));
    check(!form.querySelector('[data-form-field="code"] .field-error') && form.elements.code.getAttribute('aria-invalid') !== 'true', 'Typing in a required field clears its error');
    form.elements.releaseDate.value = '2030-07-12';
    form.requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    const edited = data.tasks.find(task => task.id === taskId);
    check(edited.releaseDate === '2030-07-12' && ['sequence', 'description', 'notes', 'effortHours', 'hidden', 'customFields', 'tagIds'].every(key => JSON.stringify(edited[key]) === JSON.stringify(savedTask[key])), 'Saving never clears values of fields kept off the form');
    taskDialog();
    check($(`#task-form [data-section="${sectionId}"]`) && $('#task-form .task-edit-pool').contains($('#task-form').elements['custom-layout-value']) && Number($('#task-form').elements.sequence.value) > Math.max(...data.tasks.map(task => task.sequence)), 'New tasks use the saved form and still initialize fields kept off it');
    $('#modal').close();
    view = 4; render(); showSettingsTab('custom-columns');
    change($('#custom-definitions-tasks [data-field-id="sequence"] [data-field-required]'), false);
    change($('#custom-definitions-tasks [data-field-id="releaseDate"] [data-field-required]'), true);
    change($('#custom-definitions-issues [data-field-id="problem"] [data-field-required]'), true);
    check(settingsDraft.requiredTaskColumns.join() === 'code,releaseDate' && settingsDraft.requiredIssueColumns.join() === 'problem' && document.activeElement === $('#custom-definitions-issues [data-field-id="problem"] [data-field-required]') && !$('#settings-tab-custom-columns .settings-tab-dot').hidden, 'Column management toggles required fields for both lists and keeps focus');
    await saveSettings();
    taskDialog();
    const fresh = $('#task-form'), top = Math.max(...data.tasks.map(task => task.sequence));
    fresh.elements.sequence.value = ''; fresh.elements.code.value = 'PRJ-AUTO'; fresh.elements.releaseDate.value = '2031-01-10';
    fresh.requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    check(data.tasks.find(task => task.code === 'PRJ-AUTO')?.sequence === top + 1, 'An optional empty sequence takes the next number');
    issueDialog();
    const issueForm = $('#issue-form');
    issueForm.elements.code.value = 'PRJ-AUTO'; issueForm.elements.problem.value = '';
    issueForm.requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 50));
    check($('#modal').open && issueForm.querySelector('[data-form-field="problem"] .required-mark') && issueForm.querySelector('[data-form-field="problem"] .field-error') && !data.issues.some(issue => issue.code === 'PRJ-AUTO'), 'The issue editor enforces required columns');
    $('#modal').close();
    bulkDialog([taskId]);
    check(!$('#bulk-release-mode option[value="clear"]') && $('#bulk-release-mode option[value="set"]') && $('#bulk-form select[name="highlightId"] option[value="__none"]'), 'Bulk edit cannot clear a required release date');
    $('#modal').close();
    view = 4; render(); showSettingsTab('task-layout');
    $('#reset-task-layout').click();
    check(JSON.stringify(settingsDraft.taskEditorLayout) === JSON.stringify(defaultTaskEditorLayout(settingsDraft)) && settingsChanged(), 'Default task layout can be restored without deleting columns or values');
    $('#discard-settings').click();
    check(JSON.stringify(settingsDraft.taskEditorLayout) === JSON.stringify(configured) && !settingsChanged(), 'Discard restores the saved editor layout');
    $('#open-form-designer').click();
    const second = $('#form-designer'), grip = second.querySelector('[data-grip="e"]');
    grip.focus(); key(grip, 'ArrowRight');
    second.querySelector('#designer-save').click();
    await waitFor(() => !saving && !$('#form-designer') && data.settings.taskEditorLayout.width === configured.width + 10);
    check(!settingsChanged() && $('#task-layout-summary').textContent.includes(`${configured.width + 10} ×`), 'A later save from the designer stores the resized window');
    await commit(next => { const layout = next.settings.taskEditorLayout; layout.columns = [{ width: 100, sections: layout.columns.flatMap(column => column.sections) }]; layout.height = 0; });
    taskDialog(data.tasks.find(task => task.id === taskId));
    check($('#task-form [data-section="section-text"]').getBoundingClientRect().top >= $('#task-form [data-section="section-properties"]').getBoundingClientRect().bottom && $('#task-form [type="submit"]').getBoundingClientRect().bottom <= innerHeight, 'Stacked task layout keeps the sections scrollable and the save action reachable');
    $('#modal').close();
    await commit(baseline); clearHistory(activeOrganizationId); view = 0; render();
  }
  {
    const baseline = structuredClone(data);
    view = 4; render(); showSettingsTab('statuses');
    const button = $('#statuses-list [data-color]'), initial = button.value, statusId = settingsDraft.statuses[0].id;
    check(button.tagName === 'BUTTON' && !document.querySelector('input[type="color"]') && document.querySelectorAll('.theme-colors .color-control').length === 4, 'Labels and all four theme roles use themed controls instead of native color pickers');
    button.click();
    const bounds = $('#color-picker').getBoundingClientRect();
    check($('#color-picker').matches(':popover-open') && document.activeElement === $('#color-hex') && button.getAttribute('aria-expanded') === 'true' && bounds.left >= 8 && bounds.right <= innerWidth - 7 && bounds.top >= 8 && bounds.bottom <= innerHeight - 7, 'Color picker opens above clipping containers, fits the viewport and focuses HEX');
    enterColor('#xyz');
    check($('#color-hex').getAttribute('aria-invalid') === 'true' && !$('#color-error').hidden && $('#color-picker [type="submit"]').disabled && button.value === initial, 'Invalid HEX displays an error and cannot modify or apply a color');
    $('#color-picker').requestSubmit();
    check(Boolean($('#color-picker')), 'Invalid color cannot be submitted through Enter');
    enterColor('AbC');
    check(button.value === '#aabbcc' && settingsDraft.statuses[0].color === '#aabbcc' && button.style.getPropertyValue('--picked-color') === '#aabbcc', 'Short HEX normalizes to six digits and immediately previews the label swatch');
    $('#color-hex').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    check(!$('#color-picker') && button.value === initial && settingsDraft.statuses[0].color === initial && document.activeElement === button && button.getAttribute('aria-expanded') === 'false', 'Escape restores the original color, expanded state and trigger focus');
    button.click(); enterColor('#000000');
    for (const [id, value] of [['hue', 220], ['s', 100], ['v', 100]]) {
      const slider = $(`#color-${id}`); slider.value = value; slider.dispatchEvent(new Event('input'));
    }
    check(button.value === '#0055ff' && $('#color-hue-value').textContent === '220\u00b0', 'Hue, saturation and brightness controls preserve hue through black');
    $('.color-original').click();
    check(button.value === initial, 'Original-color swatch restores the starting color without closing');
    const preset = $('[data-color-preset]'), presetColor = preset.dataset.colorPreset;
    preset.click();
    check(button.value === presetColor && preset.getAttribute('aria-pressed') === 'true', 'Theme and preset swatches select exact colors and expose selection');
    const last = $('#color-picker [type="submit"]');
    last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    check(document.activeElement === $('#color-picker button'), 'Keyboard focus wraps inside the color picker');
    $('#color-picker [data-color-cancel]').click();
    check(button.value === initial && !$('#color-picker'), 'Cancel closes the picker without retaining the preview');
    button.click(); enterColor('#123456');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    check(button.value === initial && !$('#color-picker'), 'Clicking outside cancels the preview');
    button.click(); enterColor('#123456'); showSettingsTab('themes');
    check(button.value === initial && !$('#color-picker'), 'Switching settings sections cancels an open color preview');
    const accent = $('[data-theme-color="accent"]'), originalAccent = accent.value;
    accent.click();
    const pickerBackground = getComputedStyle($('#color-picker')).backgroundColor;
    enterColor('#12ab34');
    check(document.documentElement.style.getPropertyValue('--accent') === '#12ab34' && accent.querySelector('.color-control-value').textContent === '#12AB34' && getComputedStyle($('#color-picker')).backgroundColor === pickerBackground, 'Theme editing retains live preview and updates the HEX trigger while keeping the picker stable');
    $('#color-picker [data-color-cancel]').click();
    check(document.documentElement.style.getPropertyValue('--accent') === originalAccent && accent.value === originalAccent, 'Cancel also restores the app theme preview');
    showSettingsTab('statuses');
    pickColor(button, '#123456');
    check(!$('#color-picker') && settingsDraft.statuses[0].color === '#123456' && data.settings.statuses[0].color === initial, 'Apply accepts the preview without prematurely saving settings');
    await saveSettings();
    check((await workspaceApi.load()).data.settings.statuses.find(status => status.id === statusId).color === '#123456', 'Applied custom color persists in the portable archive on Save settings');
    await commit(baseline); view = 0; render();
  }
  {
    const baseline = structuredClone(data), taskId = data.tasks.find(task => !task.hidden).id, issueId = data.issues[0].id;
    view = 4; render(); showSettingsTab('custom-columns');
    check(['tasks', 'issues'].every(kind => document.querySelectorAll(`#custom-definitions-${kind} [data-delete-field]`).length === CustomColumns.BUILTIN_FIELDS[kind].length), 'Every default column has the same delete action as custom columns');
    const deleteField = async (kind, id) => {
      $(`#custom-definitions-${kind} [data-field-id="${id}"] [data-delete-field]`).click();
      $('#confirm-action').click(); await waitFor(() => !$('#modal').open);
    };
    await deleteField('tasks', 'tags');
    check(!$('#settings-tab-tags') && !$('#tags-panel') && data.settings.taskColumns.some(column => column.id === 'tags'), 'Deleting a default column hides its settings in the draft without changing saved data');
    $('#discard-settings').click(); showSettingsTab('custom-columns');
    check($('#settings-tab-tags') && hasColumn('tags'), 'Discard restores the default column and its settings');
    const usedStatus = data.tasks.find(task => task.id === taskId).statusId;
    showSettingsTab('statuses');
    $(`[data-remove="statuses:${usedStatus}"]`).click();
    await saveSettings();
    check(data.tasks.find(task => task.id === taskId).statusId === '' && !(await workspaceApi.load()).data.settings.statuses.some(option => option.id === usedStatus), 'Deleting a used built-in choice clears assignments just like a custom choice');
    view = 0; render(); taskDialog(data.tasks.find(task => task.id === taskId));
    check($('#task-form [name="statusId"]').value === '', 'An unassigned built-in choice stays empty in the editor');
    $('#modal').close();
    view = 3; render();
    check(document.querySelectorAll('.task-card').length === data.tasks.length, 'Deleting a status label never loses tasks from kanban');
    await commit(baseline); view = 4; render(); showSettingsTab('custom-columns');
    for (const kind of ['tasks', 'issues']) for (const field of CustomColumns.BUILTIN_FIELDS[kind]) await deleteField(kind, field.id);
    check(!$('#settings-tab-statuses') && !$('#settings-tab-urgencies') && !$('#settings-tab-highlights') && !$('#settings-tab-tags') && !$('#settings-tab-portal') && $('#hours-per-day').closest('.field').hidden, 'All deleted-column settings disappear, including portal and effort configuration');
    await saveSettings();
    const stored = (await workspaceApi.load()).data;
    check(['tasks', 'issues'].every(kind => !configuredColumns(kind).length && CustomColumns.deletedOf(stored.settings, kind).length === CustomColumns.BUILTIN_FIELDS[kind].length) && stored.tasks.length === baseline.tasks.length && stored.issues.length === baseline.issues.length, 'Empty schemas persist without deleting tasks or issues');
    view = 0; render();
    check(!document.querySelector('.activity-table th[data-column]') && !$('#status-filter') && !$('#highlight-filter') && !$('#reset-sort') && !document.querySelector('[data-mark-task]') && !document.querySelector('#task-rows [data-drag-handle]') && !releaseViewIds().length, 'Tables with no data columns keep row actions and omit dependent filters, highlighters and dragging');
    taskDialog(data.tasks.find(task => task.id === taskId));
    check(!$('#task-form input[name="code"]') && !$('#task-form select[name="statusId"]') && !$('#description-editor') && !$('#notes-editor') && !$('#match-preview'), 'Task editor excludes deleted fields and derived links');
    $('#task-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    taskDialog();
    $('#task-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    check(data.tasks.length === baseline.tasks.length + 1 && data.tasks.at(-1).code === '' && data.tasks.at(-1).statusId === '', 'New tasks can be saved without default columns');
    bulkDialog([taskId]);
    check(!$('#bulk-form [name="statusId"]') && !$('#bulk-form [name="releaseMode"]') && !$('#bulk-form [name="highlightId"]'), 'Bulk edit excludes deleted-column controls');
    $('#bulk-form').elements.hidden.value = 'hide';
    $('#bulk-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    view = 1; render(); issueDialog(data.issues.find(issue => issue.id === issueId));
    check(!$('#issue-form input[name="code"]') && !$('#issue-form input[name="incident"]') && !$('#issue-form input[name="problem"]'), 'Issue editor excludes all removed default fields');
    $('#issue-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    view = 2; render(); check($('#restore-view-column') && !$('.milestone-track'), 'Milestones explain their missing release-date dependency');
    view = 3; render(); check($('#restore-view-column') && !$('.kanban-board'), 'Kanban explains its missing status dependency');
    excelDialog();
    check($('#excel-form [value="milestones"]').disabled && $('#excel-form [value="kanban"]').disabled, 'Export disables sheets whose required columns were deleted');
    $('#modal').close();
    const workbook = await situationWorkbook({ scope: 'all', columns: 'all', sheets: ['summary', 'tasks', 'issues'] });
    check(workbook.byteLength > 0, 'Excel export handles empty schemas without reviving deleted columns');
    view = 4; render(); showSettingsTab('custom-columns');
    for (const kind of ['tasks', 'issues']) for (const field of CustomColumns.BUILTIN_FIELDS[kind]) $(`#restore-columns-${kind} [data-restore-column="${field.id}"]`).click();
    await saveSettings();
    check(hasColumn('code') && hasColumn('status') && data.tasks.every(task => !task.code && !task.statusId && !task.releaseDate) && data.issues.every(issue => !issue.code && !issue.incident), 'Explicit restoration restores definitions and settings, never deleted values');
    view = 3; render();
    check([...document.querySelectorAll('.kanban-column')].some(column => column.querySelector('.kanban-heading span').textContent === t("Unassigned")) && document.querySelectorAll('.task-card').length === data.tasks.length, 'Unassigned tasks remain visible after restoring Status');
    await commit(baseline);
    columnFilters = { tasks: {}, issues: {} }; search = ''; statusFilter = ''; highlightFilter = ''; highlighter = ''; sort = CustomColumns.defaultSort(data.settings);
    selectedTasks.clear(); clearHistory(activeOrganizationId); view = 0; render();
  }
  {
    const baseline = structuredClone(data), editedId = data.tasks.find(task => !task.hidden).id;
    view = 4; render(); showSettingsTab('custom-columns');
    for (const kind of ['tasks', 'issues']) {
      const add = $(`[data-add-field="${kind}"]`);
      add.elements.name.value = `Pending ${kind}`; add.elements.type.value = 'multiselect';
      add.elements.name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await tick();
    check(settingsChanged() && !$('#unsaved-banner').hidden && !$('#settings-tab-custom-columns .settings-tab-dot').hidden, "Filled but unadded columns are flagged as unsaved changes");
    $('#save-settings').click();
    await waitFor(() => !saving && data.settings.taskFields.some(field => field.name === 'Pending tasks'));
    const pendingStored = await workspaceApi.load();
    check(pendingStored.data.settings.issueFields.some(field => field.name === 'Pending issues') && data.settings.taskColumns.some(column => column.id === data.settings.taskFields[0].id), "Saving settings creates and persists both columns without requiring Add column");
    await commit(baseline); render(); showSettingsTab('custom-columns');
    check(!$('#custom-columns-panel').hidden && document.querySelectorAll('[data-add-field]').length === 2, "Settings has separate schemas for tasks and issues");
    const errorTabs = [
      ["Invalid custom column list.", 'custom-columns'], ["Invalid custom column.", 'custom-columns'], ["Column names and identifiers must be unique.", 'custom-columns'], ["Invalid column options.", 'custom-columns'],
      ["Invalid tags.", 'tags'], ["Tag names must be unique.", 'tags'], ["Invalid highlighters.", 'highlights'], ["Invalid list columns.", 'columns'],
      ["The portal link template must be a valid web address containing {code}.", 'portal'], ["Invalid text sizes.", 'fonts'], ["Invalid font.", 'fonts'],
      ["Invalid themes.", 'themes'], ["Selected theme does not exist.", 'themes'], ["The urgencies list is invalid or empty.", 'urgencies'], ["Invalid urgencies values.", 'urgencies'],
      ["The statuses list is invalid or empty.", 'statuses'], ["Invalid statuses values.", 'statuses'], ["Invalid status highlighting.", 'statuses'], ["Unsupported language.", 'languages'],
      ["Specify four valid tab names.", 'identity'], ["Hours per day must be greater than 0 and no more than 24.", 'identity'], ["Invalid logo.", 'identity'], ["Invalid organization name.", 'identity']
    ];
    const wrongTabs = errorTabs.flatMap(([message, tab]) => ['en', 'it'].filter(language => settingsErrorTab(window.OrbitaI18n.translate(message, language)) !== tab).map(language => `${language} “${message}”`));
    check(!wrongTabs.length, wrongTabs.length ? `Settings errors open the wrong tab: ${wrongTabs.join(', ')}` : "Settings errors open the matching tab in English and Italian");
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
          inputs.forEach((input, index) => { input.value = ['One', 'Two'][index]; input.dispatchEvent(new Event('input', { bubbles: true })); });
        }
      }
    }
    check(settingsDraft.taskFields.length === 9 && settingsDraft.issueFields.length === 4 && !$('#unsaved-banner').hidden && document.querySelectorAll('.custom-definition select').length === 0, 'All nine types can be added, types stay fixed, and changes remain unsaved');
    check(choiceSettingsTabs().length === 8 && document.querySelectorAll('#choice-settings-panels [id^="choice-"] .option-row').length === 8 && ['statuses', 'urgencies', 'tags', 'highlights'].every(key => $(`#choice-settings-panels #${key}-panel`)), 'Built-in and custom choices share dynamic labels and colors sections');
    $('#save-settings').click();
    await waitFor(() => !saving && data.settings.taskFields.length === 9);
    const taskFields = Object.fromEntries(data.settings.taskFields.map(field => [field.type, field]));
    const issueFields = Object.fromEntries(data.settings.issueFields.map(field => [field.type, field]));
    check((await workspaceApi.load()).data.settings.issueFields.length === 4 && data.settings.taskColumns.some(column => column.id === taskFields.number.id), 'Schemas and default columns persist in storage');
    const pendingTask = $('[data-add-field="tasks"]'), pendingIssue = $('[data-add-field="issues"]');
    pendingTask.elements.name.value = taskFields.text.name;
    pendingIssue.elements.name.value = 'Must not partially save';
    let duplicateRejected = false;
    try { await saveSettings(); } catch (error) { duplicateRejected = /unique/i.test(error.message); }
    check(duplicateRejected && (await workspaceApi.load()).data.settings.issueFields.length === 4 && pendingTask.elements.name.value === taskFields.text.name && pendingIssue.elements.name.value === 'Must not partially save', 'Duplicate name is rejected without partial save or losing pending columns');
    view = 0; render(); taskDialog(data.tasks.find(task => task.id === editedId));
    const form = $('#task-form'), values = { text: 'Needle custom text '.repeat(40), number: '17.5', date: '2028-02-29', select: taskFields.select.options[1].id, url: 'https://example.com/custom', effort: '1.25', boolean: 'false' };
    for (const [type, value] of Object.entries(values)) form.elements[taskFields[type].id].value = value;
    form.querySelector('[data-choice-picker]').click();
    $('.task-edit-layout').dispatchEvent(new Event('scroll'));
    check(Boolean($('#tag-menu')), 'Scrolling the editor does not close the newly opened multiselect');
    closeTagMenu(true);
    check(form.querySelector('[data-choice-picker]').getAttribute('aria-expanded') === 'false' && document.activeElement === form.querySelector('[data-choice-picker]'), 'Closing the menu restores editor state and selector focus, not focus to the underlying table');
    form.querySelector('[data-choice-picker]').click();
    document.querySelectorAll('#tag-menu input').forEach(input => { input.checked = true; });
    $('#tag-menu').requestSubmit(); await waitFor(() => !$('#tag-menu'));
    check(!form.querySelector('select[multiple]') && form.querySelectorAll('.tag-pill').length === 2 && $('#modal').open, 'Multiselect in the task tab uses a dropdown and colored pills instead of a native list');
    $(`#editor-${taskFields.richtext.id}`).innerHTML = '<p>Needle custom <strong>rich</strong></p>';
    form.requestSubmit();
    await waitFor(() => !saving && !$('#modal').open);
    const edited = () => data.tasks.find(task => task.id === editedId);
    check(edited().customFields[taskFields.number.id] === 17.5 && edited().customFields[taskFields.boolean.id] === false && edited().customFields[taskFields.multiselect.id].length === 2 && edited().customFields[taskFields.richtext.id].includes('<strong>'), 'Editor saves numbers, false booleans, multiselects, and custom rich text');
    const storedCustom = (await workspaceApi.load()).data.tasks.find(task => task.id === editedId).customFields;
    check(JSON.stringify(storedCustom) === JSON.stringify(edited().customFields), 'All custom values read back from the backend match the saved values');
    const customCells = $(`[data-task-row="${editedId}"]`).querySelectorAll('.custom-cell');
    check(customCells.length === 9 && [...customCells].some(cell => cell.querySelector('a[data-open-url]')) && [...customCells].some(cell => cell.querySelector('.date-pill')) && getComputedStyle(customCells[0]).overflowWrap === 'anywhere', "Typed columns render links, colored dates, and contained long text");
    check(globalSearchResults('Needle custom').some(result => result.id === editedId), "Global search includes custom values");
    async function setColumnFilter(id, kind, fields) {
      columnFilterDialog(id, kind);
      const form = $('#column-filter-form');
      for (const [name, value] of Object.entries(fields)) form.elements[name].value = value;
      form.requestSubmit(); await tick();
    }
    // The rows must be on screen, not just in the DOM: the filter bar once took the table's space and hid every row.
    const tableShowsRows = rowSelector => {
      const area = $('.table-scroll').getBoundingClientRect(), bar = $('.column-filter-bar').getBoundingClientRect(), row = $(rowSelector)?.getBoundingClientRect();
      return area.height >= 160 && bar.height < 80 && bar.bottom <= area.top + 1 && Boolean(row) && row.height > 0 && row.top < area.bottom && row.bottom > area.top;
    };
    await setColumnFilter(taskFields.number.id, 'tasks', { min: '10', max: '20' });
    check(filteredTasks().length === 1 && $('.column-filter-button.active'), 'Numeric column filter selects the expected row');
    check(tableShowsRows('#task-rows tr[data-task-row]') && $('#task-rows tr[data-task-row]').children.length === shownColumns().length + 2, 'Table stays fully visible while a column filter is active');
    await setColumnFilter(taskFields.text.id, 'tasks', { empty: 'empty' });
    check(filteredTasks().length === 0 && $('.column-filter-bar').querySelectorAll('[data-filter-column]').length === 2, 'Filters on different columns combine with AND, including empty values');
    $('[data-clear-column-filters]').click();
    check(filteredTasks().length === baseline.tasks.filter(task => !task.hidden).length && !$('.column-filter-bar'), "Clearing filters restores the list without changing data");
    const dated = data.tasks.find(task => task.releaseDate && !task.hidden), sameDay = data.tasks.filter(task => !task.hidden && task.releaseDate === dated.releaseDate).length;
    await setColumnFilter('releaseDate', 'tasks', { min: dated.releaseDate, max: dated.releaseDate });
    check(filteredTasks().length === sameDay && document.querySelectorAll('#task-rows tr[data-task-row]').length === sameDay && $('#row-count').textContent.startsWith(String(sameDay)) && tableShowsRows('#task-rows tr[data-task-row]'), 'Same-day release date filter shows rows for that date');
    const visibleDated = data.tasks.filter(task => !task.hidden), presentDates = [...new Set(visibleDated.map(task => task.releaseDate).filter(Boolean))].sort(), unassignedCount = visibleDated.filter(task => !task.releaseDate).length;
    columnFilterDialog('releaseDate', 'tasks');
    const dateBoxes = () => [...document.querySelectorAll('#column-filter-form input[name="values"]')];
    check($('#column-filter-form').elements.min.tagName === 'SELECT' && !$('#column-filter-form input[type="date"]') && !$('#column-filter-form').elements.empty && [...$('#column-filter-form').elements.max.options].slice(1).map(option => option.value).join() === presentDates.join(), "Date filter pickers select existing dates without typing");
    check(dateBoxes()[0].value === CustomColumns.EMPTY_VALUE && dateBoxes().slice(1).map(box => box.value).join() === presentDates.join() && $('#column-filter-form .date-filter-option .tiny-count').textContent === String(unassignedCount) && dateBoxes().every(box => !box.checked), "Date filter list includes Unassigned, every existing date, and counts");
    $('#column-filter-form').elements.min.value = ''; $('#column-filter-form').elements.max.value = '';
    $(`#column-filter-form input[name="values"][value="${dated.releaseDate}"]`).checked = true;
    $('#column-filter-form').requestSubmit(); await tick();
    check(filteredTasks().length === sameDay && columnFilters.tasks.releaseDate.values.join() === dated.releaseDate && !columnFilters.tasks.releaseDate.min && tableShowsRows('#task-rows tr[data-task-row]') && $('.column-filter-bar').textContent.includes(formatDate(dated.releaseDate)), 'Selecting an existing date shows its rows and displays the date in the filter bar');
    columnFilterDialog('releaseDate', 'tasks');
    check(dateBoxes().filter(box => box.checked).map(box => box.value).join() === dated.releaseDate, 'Reopening the date filter keeps the date selected');
    $('#column-filter-form [data-check-dates="none"]').click();
    $(`#column-filter-form input[value="${CustomColumns.EMPTY_VALUE}"]`).checked = true;
    $('#column-filter-form').requestSubmit(); await tick();
    check(columnFilters.tasks.releaseDate.empty === 'empty' && filteredTasks().length === unassignedCount && filteredTasks().every(task => !task.releaseDate), "Unassigned shows only tasks without a release date");
    columnFilterDialog('releaseDate', 'tasks');
    $('#column-filter-form [data-check-dates="all"]').click();
    $(`#column-filter-form input[value="${CustomColumns.EMPTY_VALUE}"]`).checked = false;
    $('#column-filter-form').requestSubmit(); await tick();
    check(columnFilters.tasks.releaseDate.empty === 'filled' && !columnFilters.tasks.releaseDate.values.length && filteredTasks().length === visibleDated.length - unassignedCount, "All dates without Unassigned becomes “dated only,” including future dates");
    columnFilterDialog('releaseDate', 'tasks');
    check(dateBoxes().slice(1).every(box => box.checked) && !dateBoxes()[0].checked, 'Reopened “dated only” filter selects all existing dates');
    $('#column-filter-form [data-check-dates="all"]').click();
    $('#column-filter-form').requestSubmit(); await tick();
    check(!columnFilters.tasks.releaseDate && filteredTasks().length === visibleDated.length, "Select all, including Unassigned, clears the date filter");
    if (presentDates.length > 1) {
      columnFilterDialog('releaseDate', 'tasks');
      $('#column-filter-form').elements.min.value = presentDates[1]; $('#column-filter-form').elements.max.value = presentDates[0];
      $('#column-filter-form').requestSubmit(); await tick();
      check($('#modal').open && !columnFilters.tasks.releaseDate, 'Reversed date range is rejected without applying the filter');
      $('#modal').close();
    }
    check(!$('.column-filter-bar') && !Object.keys(columnFilters.tasks).length, 'Column filter bar disappears when no filters are active');
    await csvImportDialog(new File(['code;releaseDate\nBAD;2027-02-29'], 'invalid.csv'), 'tasks');
    check($('#csv-import').disabled && $('#csv-status').textContent.includes('1') && data.tasks.length === baseline.tasks.length, 'Invalid CSV reports errors and imports no rows');
    $('#modal').close();
    const transfer = new DataTransfer();
    transfer.items.add(new File([`Ticket;${taskFields.number.name};${taskFields.date.name};${taskFields.url.name}\nCSV-CUSTOM;42;2031-01-02;https://example.com/csv`], 'mapped.csv'));
    $('#csv-file-tasks').files = transfer.files;
    $('#csv-file-tasks').dispatchEvent(new Event('change'));
    await waitFor(() => $('#modal').open && Boolean($('#csv-import-form')));
    check($('#csv-import').disabled && $('[data-csv-column="1"]').value === taskFields.number.id, 'CSV file selection suggests custom columns and requires code mapping');
    $('[data-csv-column="0"]').value = 'code'; $('[data-csv-column="0"]').dispatchEvent(new Event('change'));
    check(!$('#csv-import').disabled && $('#csv-preview').textContent.includes('CSV-CUSTOM') && $('#csv-import').getBoundingClientRect().bottom <= $('#modal').getBoundingClientRect().bottom, 'Manual mapping updates the preview and enables import with a visible button');
    $('#csv-import-form').requestSubmit();
    await waitFor(() => !saving && !$('#modal').open && data.tasks.length === baseline.tasks.length + 1);
    check(data.tasks.find(task => task.code === 'CSV-CUSTOM').customFields[taskFields.number.id] === 42, "CSV import adds typed values without overwriting tasks");
    $('#undo-button').click(); await waitFor(() => !saving && data.tasks.length === baseline.tasks.length);
    $('#redo-button').click(); await waitFor(() => !saving && data.tasks.length === baseline.tasks.length + 1);
    check(data.tasks.some(task => task.code === 'CSV-CUSTOM'), 'Entire CSV import can be undone and redone in one operation');
    await setColumnFilter('code', 'tasks', { text: 'CSV-CUSTOM' });
    await setColumnFilter(taskFields.number.id, 'tasks', { min: '40' });
    $(`[data-sort="${taskFields.number.id}"]`).click();
    await saveSavedView('Custom filters smoke');
    const saved = data.settings.savedViews.find(saved => saved.name === 'Custom filters smoke');
    columnFilters.tasks = {}; await applySavedView(saved.id);
    check(filteredTasks().length === 1 && columnFilters.tasks[taskFields.number.id].min === '40' && savedViewSummary(saved).includes(taskFields.number.name), "Saved views retain custom column filters and sorting");
    check(tableShowsRows('#task-rows tr[data-task-row]'), 'Saved view with column filters displays rows in the table');
    view = 1; render();
    await csvImportDialog(new File([`code;incident;${issueFields.select.name}\nCSV-CUSTOM;INC-CSV-CUSTOM;Two`], 'issues.csv'), 'issues');
    $('#csv-import-form').requestSubmit();
    await waitFor(() => !saving && !$('#modal').open && data.issues.some(issue => issue.incident === 'INC-CSV-CUSTOM'));
    check(matchIssues(data.tasks.find(task => task.code === 'CSV-CUSTOM'), data.issues).incidents.includes('INC-CSV-CUSTOM'), "Issues CSV automatically updates task incident and problem values");
    const csvIssue = data.issues.find(issue => issue.incident === 'INC-CSV-CUSTOM');
    issueDialog(csvIssue); $('#issue-form').elements[issueFields.boolean.id].value = 'false';
    $('#issue-form').requestSubmit(); await waitFor(() => !saving && !$('#modal').open);
    check(data.issues.find(issue => issue.id === csvIssue.id).customFields[issueFields.boolean.id] === false, 'Issue editor retains imported selections and saves other custom fields');
    columnFilterDialog(issueFields.select.id, 'issues');
    $('#column-filter-form').querySelector(`input[value="${issueFields.select.options[1].id}"]`).checked = true;
    $('#column-filter-form').requestSubmit(); await tick();
    await setColumnFilter('linked', 'issues', { min: '1' });
    check(filteredIssues().length === 1 && document.querySelectorAll('#issue-rows [data-issue]').length === 2, "Issue filters combine custom selection with linked-task count");
    check(tableShowsRows('#issue-rows tr'), 'Issue table stays visible with active column filters');
    const book = await unzipParts(await situationWorkbook({ scope: 'view', columns: 'all', sheets: ['tasks', 'issues'] }));
    const xml = text => new DOMParser().parseFromString(text, 'application/xml');
    check(xml(book.get('xl/worksheets/sheet1.xml')).getElementsByTagName('row').length === 2 && xml(book.get('xl/worksheets/sheet2.xml')).getElementsByTagName('row').length === 2, 'Excel view applies filters from both lists');
    check(book.get('xl/sharedStrings.xml').includes(taskFields.number.name) && book.get('xl/sharedStrings.xml').includes(issueFields.select.name) && book.get('xl/worksheets/sheet1.xml').includes(`<v>${window.OrbitaXlsx.excelDate('2031-01-02')}</v>`) && book.get('xl/worksheets/_rels/sheet1.xml.rels').includes('https://example.com/csv'), 'Excel includes custom names, actual dates, and links');
    $('#issue-columns-button').click();
    $(`#columns-dialog-editor [data-column-visible="${issueFields.select.id}"]`).click();
    $('#columns-apply').click(); await waitFor(() => !saving && !$('#modal').open);
    const visibleBook = await unzipParts(await situationWorkbook({ scope: 'view', columns: 'visible', sheets: ['issues'] }));
    check(!visibleBook.get('xl/sharedStrings.xml').includes(issueFields.select.name) && $('.column-filter-bar').textContent.includes(issueFields.select.name), "Hidden issue column is excluded from Excel, but its filter stays visible and removable");
    const issuePicker = document.querySelector(`#issue-rows [data-choice-field="${issueFields.multiselect.id}"]`);
    issuePicker.click();
    $('#tag-menu input').checked = true; $('#tag-menu').requestSubmit();
    await waitFor(() => !saving && !$('#tag-menu'));
    check(data.issues.find(issue => issue.id === csvIssue.id).customFields[issueFields.multiselect.id].length === 1 && !$('#modal').open, 'Multiselect dropdown works directly in the issue table and saves');
    view = 4; render(); showSettingsTab('custom-columns');
    const optionKey = `choice-tasks-${taskFields.multiselect.id}`, chosenId = taskFields.multiselect.options[0].id;
    showSettingsTab(optionKey);
    const labelInput = document.querySelector(`#${optionKey}-list [data-option-name]`), colorInput = document.querySelector(`#${optionKey}-list [data-color]`);
    labelInput.value = 'Renamed label'; labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    pickColor(colorInput, '#12ab34');
    $(`#${optionKey}-list [data-move="${optionKey}:${chosenId}:1"]`).click();
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.taskFields.find(field => field.id === taskFields.multiselect.id).options[1].name === 'Renamed label');
    check(edited().customFields[taskFields.multiselect.id].includes(chosenId) && customText([chosenId], data.settings.taskFields.find(field => field.id === taskFields.multiselect.id)) === 'Renamed label', 'Rename, color, and reorder preserve assignments using stable IDs');
    view = 0; columnFilters.tasks = {}; render();
    const picker = document.querySelector(`[data-task-row="${editedId}"] [data-choice-field="${taskFields.multiselect.id}"]`);
    check(picker.textContent.includes('Renamed label') && picker.querySelectorAll('.tag-pill')[1].style.getPropertyValue('--pill') === '#12ab34', 'Updated catalog labels and colors appear in table pills');
    picker.click(); $('#tag-menu input').checked = false; $('#tag-menu').requestSubmit();
    await waitFor(() => !saving && !$('#tag-menu'));
    check(edited().customFields[taskFields.multiselect.id].length === 1 && !$('#modal').open, "Multiselect dropdown works directly in the task list");
    view = 4; render(); showSettingsTab(optionKey);
    $(`#${optionKey}-list [data-remove="${optionKey}:${chosenId}"]`).click();
    check(edited().customFields[taskFields.multiselect.id].includes(chosenId), 'Removed label remains undoable before saving');
    $('#save-settings').click(); await waitFor(() => !saving && !edited().customFields[taskFields.multiselect.id].includes(chosenId));
    check(data.settings.taskFields.find(field => field.id === taskFields.multiselect.id).options.length === 1, 'Deleting a label clears its values only after saving');
    showSettingsTab('custom-columns');
    $(`[data-field-id="${taskFields.number.id}"] [data-delete-field]`).click();
    $('#confirm-action').click(); await waitFor(() => !$('#modal').open);
    check(edited().customFields[taskFields.number.id] === 17.5, "Column deletion requires confirmation and leaves data untouched until saving");
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.taskFields.length === 8);
    const cleaned = data.settings.savedViews.find(view => view.id === saved.id);
    check(edited().customFields[taskFields.number.id] === undefined && !cleaned.columnFilters[taskFields.number.id] && cleaned.sort[0].key === 'releaseDate', 'Saving removes values, filters, and sorting for the deleted column without invalidating views');
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
    try { await saveSettings(); } catch (error) { conflictRejected = error.message === t("Columns changed in another window. Discard the settings changes and try again: saved data has not been overwritten."); }
    const protectedData = (await workspaceApi.load()).data;
    check(conflictRejected && protectedData.settings.taskFields.some(field => field.id === 'custom-remote') && protectedData.tasks[0].customFields['custom-remote'] === 'Keep this value', 'Stale draft does not delete columns or values saved by another window');
    adoptSnapshot(await workspaceApi.load());
    await commit(baseline); render(); clearHistory(activeOrganizationId);
  }
  {
    const baseline = structuredClone(data);
    view = 4; render(); showSettingsTab('fonts');
    for (const font of FONT_FAMILIES) {
      $('#font-family').value = font.id; $('#font-family').dispatchEvent(new Event('change', { bubbles: true }));
      if (font.bundled) {
        const regular = await document.fonts.load(`400 14px "${font.name}"`, "Tasks Łódź"), bold = await document.fonts.load(`700 14px "${font.name}"`, "Tasks Łódź");
        check(regular.length > 0 && bold.length > 0 && [...regular, ...bold].every(face => face.status === 'loaded'), `Font ${font.name} actually loads from local files, including accented and bold faces`);
      }
      check(getComputedStyle($('.font-sample input')).fontFamily === getComputedStyle(document.documentElement).fontFamily && document.documentElement.style.fontFamily === font.css, `Font ${font.name} preview is also applied to controls`);
    }
    $('#discard-settings').click();
    check(data.settings.fontFamily === DEFAULT_FONT_FAMILY && $('#font-family').value === DEFAULT_FONT_FAMILY, "Canceling settings restores the previous font");
    $('#font-family').value = 'verdana'; $('#font-family').dispatchEvent(new Event('change', { bubbles: true }));
    $('#save-settings').click(); await waitFor(() => !saving && data.settings.fontFamily === 'verdana');
    check((await workspaceApi.load()).data.settings.fontFamily === 'verdana' && $('#unsaved-banner').hidden, 'Saved font persists in storage and reloads in settings');
    await commit(baseline); clearHistory(activeOrganizationId); view = 0; render();
  }
  const historyTask = data.tasks.find(task => !task.hidden);
  const originalHistoryNotes = historyTask.notes;
  await commit(next => { next.tasks.find(task => task.id === historyTask.id).notes = '<p>Undo smoke</p>'; });
  check(!$('#undo-button').disabled && $('#redo-button').disabled, "Persisted changes enable Cancel");
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === originalHistoryNotes);
  check($('#undo-button').disabled && !$('#redo-button').disabled, "Ctrl+Z restores data and enables Restore");
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === '<p>Undo smoke</p>');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => !saving && data.tasks.find(task => task.id === historyTask.id).notes === originalHistoryNotes);
  clearHistory(activeOrganizationId);
  check($('#undo-button').disabled && $('#redo-button').disabled, "Cancel and Restore stay disabled when there are no history operations");
  view = 2;
  render();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  check($('#modal').open && $('#global-search-input'), 'Ctrl+K opens global search from another tab');
  const searchTask = data.tasks.find(task => !task.hidden);
  $('#global-search-input').value = searchTask.code;
  $('#global-search-input').dispatchEvent(new Event('input', { bubbles: true }));
  check($('#global-search-results [data-global-kind="task"]')?.dataset.globalId === searchTask.id, "Global search finds tasks by code");
  $('#global-search-results [data-global-kind="task"]').click();
  check(view === 0 && $('#modal').open && $('#task-form'), "Task result opens the editor directly");
  $('#modal').close();
  const searchIssue = data.issues.find(issue => issue.incident);
  openGlobalSearch(searchIssue.incident);
  check($('#global-search-results [data-global-kind="issue"]'), "Global search finds issues by incident");
  $('#global-search-results [data-global-kind="issue"]').click();
  check(view === 1 && $('#modal').open && $('#issue-form'), 'Issue result opens the editor directly');
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
  check(statusFilter === savedViewTask.statusId && showHidden && sort[0].key === 'sequence' && sort[0].direction === 'desc' && shownColumns().join() === 'code,releaseDate', 'Saved view reapplies filters, sorting, and columns');
  openSavedViews();
  $('#saved-view-list [data-view-action="delete"]').click();
  check($('#confirm-action'), 'Deleting a view requires confirmation');
  $('#confirm-action').click();
  await waitFor(() => !saving && !data.settings.savedViews.some(saved => saved.id === smokeView.id));
  await commit(next => { next.settings.savedViews = savedViewState.savedViews; next.settings.taskColumns = savedViewState.columns; });
  ({ search, statusFilter, highlightFilter, showHidden, duplicatesOnly, sort } = savedViewState);
  activeSavedViewId = '';
  clearHistory(activeOrganizationId);
  render();
  check(!(data.settings.savedViews || []).some(saved => saved.name === 'Smoke saved view'), "Deleted saved view leaves no test data behind");
  {
    const releaseState = { search, statusFilter, highlightFilter, showHidden, duplicatesOnly, filters: structuredClone(columnFilters.tasks) };
    showHidden = false; view = 0; render();
    const day = today(), shownDates = [...new Set(data.tasks.filter(task => !task.hidden && task.releaseDate).map(task => task.releaseDate))].sort();
    const releaseOptions = () => [...$('#saved-view-select').querySelectorAll(`option[value^="${RELEASE_VIEW}"]`)];
    const groupOf = date => $('#saved-view-select').querySelector(`option[value="${RELEASE_VIEW}${date}"]`)?.parentElement.label;
    check(releaseOptions().map(option => option.value.slice(RELEASE_VIEW.length)).filter(Boolean).sort().join() === shownDates.join() && shownDates.every(date => groupOf(date) === t(date >= day ? "Upcoming releases" : "Past releases")), 'One automatic view per release date, split into upcoming and past');
    const unassignedTasks = data.tasks.filter(task => !task.hidden && !task.releaseDate).length;
    check(Boolean(groupOf('')) === unassignedTasks > 0 && (!unassignedTasks || releaseOptions().find(option => option.value === RELEASE_VIEW).textContent.endsWith(`(${unassignedTasks})`)), "Automatic view for tasks without release dates includes a count");
    const tasksOn = date => data.tasks.filter(task => !task.hidden && task.releaseDate === date).length;
    const releaseDate = shownDates.find(date => date >= day && tasksOn(date) > 1) || shownDates.find(date => tasksOn(date) > 1);
    search = 'not-a-release'; statusFilter = data.settings.statuses[0].id; render();
    $('#saved-view-select').value = RELEASE_VIEW + releaseDate;
    $('#saved-view-select').dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => activeSavedViewId === RELEASE_VIEW + releaseDate);
    check(!search && !statusFilter && filteredTasks().length === tasksOn(releaseDate) && document.querySelectorAll('#task-rows tr[data-task-row]').length === tasksOn(releaseDate) && $('#saved-view-select').value === RELEASE_VIEW + releaseDate && $('.column-filter-bar').textContent.includes(formatDate(releaseDate)), "Release view shows only tasks with that date and remains selected");
    const moved = data.tasks.find(task => !task.hidden && task.releaseDate === releaseDate), farDate = '2099-12-30';
    await commit(next => { next.tasks.find(task => task.id === moved.id).releaseDate = farDate; });
    render();
    check(groupOf(farDate) === t("Upcoming releases") && $('#saved-view-select').value === RELEASE_VIEW + releaseDate && filteredTasks().length === tasksOn(releaseDate), 'New release date immediately creates its view and updates the active view');
    await commit(next => { next.tasks.find(task => task.id === moved.id).releaseDate = releaseDate; });
    if (unassignedTasks) {
      applyReleaseView(RELEASE_VIEW);
      check(filteredTasks().length === unassignedTasks && filteredTasks().every(task => !task.releaseDate) && $('#saved-view-select').value === RELEASE_VIEW, "“Unassigned” release view shows tasks to schedule");
    }
    $('#show-hidden').click();
    check(!activeSavedViewId && $('#saved-view-select').value === '', 'Editing filters leaves the release view, as with saved views');
    ({ search, statusFilter, highlightFilter, showHidden, duplicatesOnly } = releaseState);
    columnFilters.tasks = releaseState.filters;
    activeSavedViewId = '';
    clearHistory(activeOrganizationId);
    render();
  }
  check(initialTaskCount > 200 && visibleTasks().length < initialTaskCount && document.querySelectorAll('#task-rows tr').length === visibleTasks().length, "Demo data loads with already released rows hidden");
  const demoReleases = [...new Set(data.tasks.map(t => t.releaseDate).filter(Boolean))].sort();
  check(demoReleases[0] === '2025-01-01' && demoReleases.length > 40 && demoReleases.every((date, i) => new Date(`${date}T12:00:00Z`).getUTCDay() === 3 && (!i || Date.parse(date) - Date.parse(demoReleases[i - 1]) === 14 * 86400000)), "Demo milestones occur every other Wednesday from January 2025");
  check(data.tasks.some(t => !t.releaseDate) && data.tasks.some(t => t.url) && data.settings.portalUrlTemplate.includes("{code}") && data.settings.themes.length > 3, "Demo data covers backlog, links, portal template, and themes");
  check(data.tasks.some(t => matchIssues(t, data.issues).incidents.length >= 2), 'One-to-many associations');
  taskDialog();
  const form = $('#task-form');
  form.elements.code.value = 'SMOKE-1';
  form.elements.days.value = '1';
  form.elements.hours.value = '2';
  form.elements.releaseDate.value = '2027-01-15';
  $('#description-editor').innerHTML = '<p>Test <strong>rich text</strong></p>';
  $('#notes-editor').innerHTML = '<ul><li>Test note</li></ul>';
  form.requestSubmit();
  await waitFor(() => data.tasks.some(t => t.code === 'SMOKE-1') && !saving);
  check(data.tasks.some(t => t.code === 'SMOKE-1' && t.effortHours === 10 && t.notes.includes('<ul>')), 'Created task persists effort and rich text');
  check(data.tasks.find(t => t.code === 'SMOKE-1').url === '', "Portal link is optional when creating a task");
  issueDialog();
  const issueForm = $('#issue-form');
  issueForm.elements.code.value = 'smoke-1';
  issueForm.elements.incident.value = 'INC-SMOKE';
  issueForm.elements.problem.value = 'PRB-SMOKE';
  issueForm.requestSubmit();
  await waitFor(() => data.issues.some(i => i.incident === 'INC-SMOKE') && !saving);
  check(matchIssues(data.tasks.find(t => t.code === 'SMOKE-1'), data.issues).problems[0] === 'PRB-SMOKE', "Adding an issue automatically updates tasks");
  const reloaded = await workspaceApi.load();
  check(reloaded.data.tasks.some(t => t.code === 'SMOKE-1' && t.description.includes('<strong>')) && reloaded.data.issues.some(i => i.incident === 'INC-SMOKE'), "Reloading the real archive preserves rich text and associations");
  let rejected = false;
  try { await workspaceApi.save({ ...data, version: 999 }); } catch { rejected = true; }
  check(rejected && (await workspaceApi.load()).data.version === 1, "Invalid archive is rejected without data loss");
  for (let i = 1; i < 4; i++) {
    view = i; render();
    check($('#content').textContent.includes(data.settings.tabNames[i]), `Tab ${i + 1} renders`);
    check($('.page-heading').offsetHeight <= 75 && document.documentElement.scrollHeight <= innerHeight + 1, `Compact heading and internal scrolling in tab ${i + 1}`);
  }
  check(document.querySelectorAll('.kanban-column').length === data.settings.statuses.length, "Kanban columns and status order");
  check(!document.querySelector('.kanban-board button'), 'Kanban is truly read-only');
  doubleClick($('.kanban-board .task-card'));
  check(!$('#modal').open, 'Double-clicking in kanban preserves read-only mode');
  view = 2; render();
  check($('#content').textContent.includes('SMOKE-1'), "Milestones update after insertion");
  const upcoming = () => $('#next-release-milestone');
  const upcomingVisible = () => {
    const column = upcoming().getBoundingClientRect(), scroll = $('.milestone-scroll').getBoundingClientRect();
    return column.left >= scroll.left - 1 && column.right <= scroll.right + 1;
  };
  check(document.querySelectorAll('.milestone-column.is-next-release').length === 1 && upcoming().dataset.releaseDate === nextReleaseDate(data.tasks) && upcoming().getAttribute('aria-current') === 'step' && upcoming().querySelector('.next-release-badge'), 'A single column identifies the next release in chronological order');
  const frame = upcoming().getBoundingClientRect(), cards = upcoming().querySelectorAll('.task-card');
  check(parseFloat(getComputedStyle(upcoming()).borderTopWidth) >= 2 && frame.top < cards[0].getBoundingClientRect().top && frame.bottom >= cards[cards.length - 1].getBoundingClientRect().bottom && upcoming().style.getPropertyValue('--milestone') === dateColor(upcoming().dataset.releaseDate), "Highlight spans all tasks without changing the date color");
  check(upcomingVisible() && $('.milestone-scroll').scrollLeft > 0, 'Opening milestones brings the next release into view despite extensive history');
  $('.milestone-scroll').scrollLeft = 0;
  $('.milestone-scroll').scrollTop = 42;
  const milestoneScrollTop = $('.milestone-scroll').scrollTop;
  rerenderPreservingView();
  check($('.milestone-scroll').scrollLeft === 0 && $('.milestone-scroll').scrollTop === milestoneScrollTop, 'Milestone updates preserve manual scrolling');
  $('#next-release-button').click();
  check(upcomingVisible() && $('.milestone-scroll').scrollTop === 0, 'Next release button finds the column and its heading');
  const previousMilestoneElement = upcoming();
  milestoneDay = '1900-01-01';
  refreshMilestoneDate();
  check(milestoneDay === today() && upcoming() !== previousMilestoneElement && upcomingVisible(), 'Indicator recalculates at day change without losing scroll position');
  taskDialog(data.tasks[0]);
  const milestoneEditor = $('#description-editor');
  milestoneEditor.innerHTML = '<p>Draft across midnight</p>';
  milestoneDay = '1900-01-01';
  refreshMilestoneDate();
  check($('#modal').open && $('#description-editor') === milestoneEditor && milestoneEditor.textContent === 'Draft across midnight' && milestoneDay === '1900-01-01', 'Updating the date does not interrupt an open editor');
  $('#modal').close();
  refreshMilestoneDate();
  check(milestoneDay === today(), 'Indicator can be updated after the editor closes');
  const scheduledTasks = data.tasks, milestoneLanguage = data.settings.language, localDay = today();
  const followingDay = new Date(Date.parse(`${localDay}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  try {
    data.tasks = ['2000-01-01', localDay, followingDay, '', localDay].map((releaseDate, index) => ({
      ...scheduledTasks[0], id: `milestone-check-${index}`, releaseDate, hidden: index === 1
    }));
    render();
    check(upcoming().dataset.releaseDate === localDay && $('.next-release-badge').textContent === t("Today's release") && upcoming().querySelectorAll('.task-card').length === 2 && upcoming().querySelector('.task-card.is-hidden'), "Today’s release is prioritized, grouped, and includes hidden rows");
    data.tasks = data.tasks.filter(task => task.releaseDate !== localDay);
    render();
    check(upcoming().dataset.releaseDate === followingDay && $('.next-release-badge').textContent === t("Next release"), 'Removing a milestone advances the indicator to the next one');
    data.settings.language = 'en'; render();
    check($('.next-release-badge').textContent === 'Next release' && $('#next-release-button').title === 'Go to next release', 'Next-release labels are translated into English');
    data.tasks = data.tasks.map(task => ({ ...task, releaseDate: task.releaseDate ? '2000-01-01' : '' }));
    render();
    check(!upcoming() && !$('#next-release-button') && $('.next-release-empty').textContent === 'No upcoming release' && !document.querySelector('.milestone-column[data-release-date=""].is-next-release'), 'No next release when only past dates or backlog exist');
    data.tasks = []; render();
    check(!upcoming() && !document.querySelector('.milestone-column') && $('.milestone-track .empty'), "Empty workspace does not highlight nonexistent milestones");
  } finally { data.tasks = scheduledTasks; data.settings.language = milestoneLanguage; render(); }
  const next = structuredClone(data); next.tasks.find(t => t.code === 'SMOKE-1').hidden = true; await commit(next); render();
  check($('#content').textContent.includes('SMOKE-1') && document.querySelector('.milestone-column .task-card.is-hidden .hidden-badge'), "Tasks hidden from the list remain visible and marked in milestones");
  view = 3; render();
  check($('#content').textContent.includes('SMOKE-1') && document.querySelector('.kanban-column .task-card.is-hidden'), "Tasks hidden from the list remain in kanban");
  view = 0; showHidden = false; render();
  check(!$('#task-rows').textContent.includes('SMOKE-1') && $('.nav-count').textContent === String(data.tasks.filter(t => !t.hidden).length), "Hidden tasks are excluded only from the list");
  view = 0; showHidden = true; render();
  check($('#task-rows').textContent.includes('SMOKE-1'), "Hidden tasks can be restored from the list");
  const datePills = [...document.querySelectorAll('.date-pill')];
  check(datePills[0].style.getPropertyValue('--date') === datePills[1].style.getPropertyValue('--date'), 'Matching dates share the same color');
  check(document.querySelectorAll('tr.highlighted').length > 0, "Rows are highlighted according to the configured status");
  const markedRows = () => [...document.querySelectorAll('#task-rows tr.marked')];
  check(markedRows().length > 0 && markedRows().every(row => highlightOf(data.tasks.find(task => task.id === row.dataset.taskRow))) && document.querySelectorAll('.highlighter-bar [data-highlighter]').length === highlightsOf().length + 1, 'Rows use custom highlight colors and the highlighter bar');
  const smokeTask = () => data.tasks.find(task => task.code === 'SMOKE-1');
  const smokeRow = () => document.querySelector(`tr[data-task-row="${CSS.escape(smokeTask().id)}"]`);
  const savedSequences = new Map(data.tasks.map(task => [task.id, task.sequence]));
  const rowIds = () => [...document.querySelectorAll('#task-rows [data-drag-handle]')].map(handle => handle.closest('tr').dataset.taskRow);
  const beforeDrag = rowIds(), targetRow = document.querySelector(`[data-task-row="${beforeDrag[2]}"]`);
  const rowLifted = dragTo($('#task-rows [data-drag-handle]'), targetRow);
  await waitFor(() => !saving && sort[0].key === 'sequence');
  check(rowLifted && rowIds()[2] === beforeDrag[0] && data.tasks.every(task => task.sequence >= 1) && new Set(data.tasks.map(task => task.sequence)).size === data.tasks.length, 'Dragging rows saves unique sequence values and preserves manual order');
  check((await workspaceApi.load()).data.tasks.find(task => task.id === beforeDrag[0]).sequence === data.tasks.find(task => task.id === beforeDrag[0]).sequence, 'Reordered sequence values persist on disk');
  const beforeCancel = rowIds(), sequenceBeforeCancel = data.tasks.map(task => task.sequence).join();
  dragTo($('#task-rows [data-drag-handle]'), document.querySelector(`[data-task-row="${beforeCancel[2]}"]`), 'escape');
  check(rowIds().join() === beforeCancel.join() && data.tasks.map(task => task.sequence).join() === sequenceBeforeCancel && !saving, 'Escape during drag leaves order and sequence values unchanged');
  $('#task-rows [data-drag-handle]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await waitFor(() => !saving && rowIds()[1] === beforeCancel[0]);
  check(rowIds()[1] === beforeCancel[0], "Tasks can also be reordered with the handle arrows");
  await commit(next => next.tasks.forEach(task => { task.sequence = savedSequences.get(task.id); }));
  sort = [{ key: 'releaseDate', direction: 'asc' }]; render();
  const oldText = { description: smokeTask().description, notes: smokeTask().notes };
  await commit(next => Object.assign(next.tasks.find(task => task.id === smokeTask().id), { description: '<p>' + 'LongDescription'.repeat(100) + '</p>', notes: '<p>' + 'LongNotes'.repeat(100) + '</p>' }));
  rerenderPreservingView();
  const descriptions = [...smokeRow().querySelectorAll('.description-cell')];
  check(descriptions.length === 2 && smokeRow().querySelector('.notes-cell').textContent.startsWith('LongNotes') && descriptions.every(cell => cell.scrollWidth <= cell.clientWidth + 1 && cell.getBoundingClientRect().right <= cell.closest('td').getBoundingClientRect().right), "Notes stay readable and long text wraps within cells");
  $('.table-scroll').scrollTop = 500; $('.table-scroll').scrollLeft = 160;
  const tablePosition = [$('.table-scroll').scrollLeft, $('.table-scroll').scrollTop];
  taskDialog(smokeTask());
  check($('#description-editor').scrollWidth <= $('#description-editor').clientWidth + 1 && $('#notes-editor').scrollWidth <= $('#notes-editor').clientWidth + 1, 'Description and notes editors wrap even very long words');
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(tablePosition[0] > 0 && tablePosition[1] > 0 && Math.abs($('.table-scroll').scrollTop - tablePosition[1]) <= 1 && Math.abs($('.table-scroll').scrollLeft - tablePosition[0]) <= 1, "Editing tasks preserves the list’s horizontal and vertical scroll positions");
  await commit(next => Object.assign(next.tasks.find(task => task.id === smokeTask().id), oldText));
  render();
  view = 4; render(); showSettingsTab('tags');
  check(!$('#tags-panel').hidden && $('#settings-tab-tags').getAttribute('aria-current') === 'true' && document.querySelectorAll('#tags-list .option-row').length === data.settings.tags.length, "Tag catalog has a dedicated organization tab");
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
  check(!$('#settings-tab-tags .settings-tab-dot').hidden && !$('#unsaved-banner').hidden && data.settings.tags.length === savedTagCount, 'New tags stay in draft until saved');
  $('#save-settings-inline').click();
  await waitFor(() => !saving && data.settings.tags.length === savedTagCount + 2);
  check((await workspaceApi.load()).data.settings.tags.some(tag => tag.id === tagOne), 'Tag catalog is saved to the local archive');
  view = 0; render();
  check($('.activity-table th[data-column="tags"] .column-heading > span').textContent === 'Tags' && !$('.activity-table th[data-column="tags"] [data-sort]') && $('.activity-table th[data-column="tags"] [data-filter-column]'), "Tags column is visible and filterable but not sortable as multi-value text");
  smokeRow().querySelector('.task-tags-button').click();
  check($('#tag-menu') && !$('#modal').open && document.querySelectorAll('.tag-choice').length === data.settings.tags.length && !$('.tag-choice b') && document.activeElement?.name === 'tagIds', "Tags column opens the multiselect dropdown without the task editor and safely displays text");
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  document.querySelector(`.tag-choice input[value="${tagTwo}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  check(smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo) && smokeRow().querySelectorAll('.tag-pill').length === 2, 'Multiselect values appear as labels in the row');
  check((await workspaceApi.load()).data.tasks.find(task => task.id === smokeTask().id).tagIds.length === 2, 'Multiselect values persist on disk');
  smokeRow().querySelector('.task-tags-button').click();
  check(document.querySelectorAll('.tag-choice input:checked').length === 2, 'Editing restores the previously selected tags');
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  check(smokeTask().tagIds.length === 1 && smokeTask().tagIds[0] === tagTwo, "A tag can be removed from an individual task");
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').requestSubmit();
  await waitFor(() => !saving && !$('#tag-menu'));
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  $('#tag-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!$('#tag-menu') && smokeTask().tagIds.includes(tagOne), 'Escape cancels the dropdown without changing tags');
  taskDialog(smokeTask());
  check(!$('#task-form [name="tagIds"]') && !$('#task-form .task-tags'), "Tags are no longer editable from the task tab");
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(smokeTask().tagIds.length === 2, "Saving a task tab preserves the tags in the list");
  smokeRow().querySelector('.task-tags-button').click();
  document.querySelector(`.tag-choice input[value="${tagOne}"]`).click();
  const submitTagChanges = $('#tag-menu').onsubmit;
  const externalTag = data.settings.tags[0].id, externalSnapshot = await workspaceApi.load();
  externalSnapshot.data.tasks.find(task => task.id === smokeTask().id).tagIds.push(externalTag);
  await workspaceApi.save(externalSnapshot.data, activeOrganizationId, undefined, externalSnapshot.revision);
  await submitTagChanges(new Event('submit', { cancelable: true }));
  check(smokeTask().tagIds.includes(externalTag) && !smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo), 'Tag dropdown preserves additions made concurrently in other windows');
  await commit(next => { next.tasks.find(task => task.id === smokeTask().id).tagIds = [tagOne, tagTwo]; });
  rerenderPreservingView();
  $('#search').value = 'smoke-tag';
  $('#search').dispatchEvent(new Event('input'));
  check(document.querySelectorAll('#task-rows tr[data-task-row]').length === 1 && smokeRow(), "Task search includes tag names");
  $('#search').value = ''; $('#search').dispatchEvent(new Event('input'));
  $('#columns-button').click();
  $('[data-column-visible="tags"]').click();
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(!$('.activity-table th[data-column="tags"]') && smokeTask().tagIds.length === 2, 'Hiding Tags does not delete assignments');
  $('#columns-button').click();
  $('[data-column-visible="tags"]').click();
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(smokeRow().querySelectorAll('.tag-pill').length === 2, "Tags column is restored with saved data");
  view = 4; render(); showSettingsTab('tags');
  setTagName(tagTwo, 'SMOKE-TAG Updated');
  const tagColor = document.querySelector(`[data-color="tags:${tagTwo}"]`);
  pickColor(tagColor, '#12ab34');
  document.querySelector(`[data-move="tags:${tagTwo}:-1"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => !saving && data.settings.tags.find(tag => tag.id === tagTwo).name === 'SMOKE-TAG Updated');
  view = 0; render();
  check(smokeRow().querySelector('.tag-pill').textContent === 'SMOKE-TAG Updated' && smokeRow().querySelector('.tag-pill').style.getPropertyValue('--pill') === '#12ab34', "Catalog name, color, and order are reflected in tasks");
  view = 4; render(); showSettingsTab('tags');
  document.querySelector(`[data-remove="tags:${tagOne}"]`).click();
  $('#discard-settings').click();
  check(settingsDraft.tags.some(tag => tag.id === tagOne) && smokeTask().tagIds.includes(tagOne), 'Canceling deletion preserves the catalog and assignments');
  document.querySelector(`[data-remove="tags:${tagOne}"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => !saving && !data.settings.tags.some(tag => tag.id === tagOne));
  check(smokeTask().hidden && !smokeTask().tagIds.includes(tagOne) && smokeTask().tagIds.includes(tagTwo) && data.tasks.length === initialTaskCount + 1, "Deleting a tag also clears hidden rows without deleting tasks or other tags");
  view = 0; render();
  doubleClick(smokeRow().querySelector('.sequence'));
  check($('#modal').open && $('#task-form').elements.code.value === 'SMOKE-1', "Double-clicking a cell opens the corresponding task editor");
  check(getComputedStyle($('#task-form').elements.code).userSelect === 'text' && getComputedStyle($('#description-editor strong')).userSelect === 'text', 'Rich-text fields and content remain selectable');
  $('#notes-editor').innerHTML += '<p>Double-click verified</p>';
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check((await workspaceApi.load()).data.tasks.find(task => task.code === 'SMOKE-1').notes.includes('Double-click verified'), "Editor opened by double-click is saved to the archive");
  doubleClick(smokeRow().querySelector('[data-mark-task]'));
  doubleClick(smokeRow().querySelector('a'));
  check(!$('#modal').open, 'Double-clicking buttons or links does not open another editor');
  view = 1; render();
  $('#issue-search').value = 'INC-SMOKE';
  $('#issue-search').dispatchEvent(new Event('input'));
  doubleClick($('#issue-rows tr[data-issue-row]').cells[1]);
  check($('#modal').open && $('#issue-form').elements.incident.value === 'INC-SMOKE', 'Double-click edits the correct issue after filtering');
  $('#issue-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(data.issues.some(issue => issue.incident === 'INC-SMOKE' && issue.problem === 'PRB-SMOKE'), 'Association can be saved from the editor opened by double-click');
  $('#issue-search').value = 'no-result-double-click';
  $('#issue-search').dispatchEvent(new Event('input'));
  doubleClick($('#issue-rows .empty'));
  check(!$('#modal').open, "Double-clicking the empty list does not create associations");
  render();
  check($('#issue-search').value === 'no-result-double-click', "Issue search is retained while the list rerenders");
  $('#issue-search').value = ''; $('#issue-search').dispatchEvent(new Event('input'));
  check(!duplicatesOf().groups.length && !document.querySelector('.nav-alert, #issue-rows .dup-ref') && $('#issue-duplicates-only').disabled && !$('#remove-identical'), 'No duplicate is flagged without repeated incidents');
  issueDialog();
  const duplicateIssueForm = $('#issue-form');
  check($('#issue-duplicate').hidden, 'No duplicate warning for a new empty association');
  duplicateIssueForm.elements.code.value = 'SMOKE-DUP';
  duplicateIssueForm.elements.incident.value = ' inc-smoke ';
  duplicateIssueForm.elements.incident.dispatchEvent(new Event('input'));
  check(!$('#issue-duplicate').hidden && $('#issue-duplicate').textContent.includes('INC-SMOKE') && $('#issue-duplicate').textContent.includes('smoke-1 · PRB-SMOKE'), 'Immediate warning for an existing incident, regardless of case or whitespace');
  duplicateIssueForm.requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  const smokeIssue = data.issues.find(issue => issue.incident === 'INC-SMOKE'), duplicateIssue = data.issues.find(issue => issue.code === 'SMOKE-DUP');
  check(duplicateIssue?.incident === 'inc-smoke' && (await workspaceApi.load()).data.issues.some(issue => issue.id === duplicateIssue.id), 'Association with a duplicate incident can still be saved');
  const flaggedIssues = () => [...document.querySelectorAll('#issue-rows tr.duplicate-row')].map(row => row.dataset.issueRow).sort().join();
  check(flaggedIssues() === [smokeIssue.id, duplicateIssue.id].sort().join() && document.querySelectorAll('#issue-rows .dup-ref').length === 2, "Both associations with the same incident are flagged");
  check($('[data-view="1"] .nav-alert [aria-hidden]')?.textContent === '2' && !$('[data-view="0"] .nav-alert'), "Navigation flags duplicate associations, not tasks with a single link");
  $('#issue-duplicates-only').click();
  check(issueDuplicatesOnly && document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 2, "Duplicates filter shows only the affected associations");
  const identicalId = uid();
  await commit(next => { next.issues.push({ id: identicalId, code: 'smoke-dup', incident: 'INC-SMOKE', problem: '' }); });
  render();
  check(document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 3 && document.querySelectorAll('#issue-rows .dup-note').length === 1 && $(`#issue-rows tr[data-issue-row="${identicalId}"] .dup-note`) && $('#remove-identical .tiny-count').textContent === '1', "Identical association is detected and marked");
  $('#remove-identical').click();
  check($('#modal').open && $('#confirm-action'), 'Removing identical associations requires confirmation');
  $('#confirm-action').click();
  await waitFor(() => !saving && !$('#modal').open);
  const issuesOnDisk = (await workspaceApi.load()).data.issues;
  check(!data.issues.some(issue => issue.id === identicalId) && !issuesOnDisk.some(issue => issue.id === identicalId) && issuesOnDisk.some(issue => issue.id === duplicateIssue.id) && issuesOnDisk.some(issue => issue.id === smokeIssue.id) && !$('#remove-identical'), "Remove identical deletes only the copies, leaving the first");
  $('#issue-duplicates-only').click();
  $(`#issue-rows tr[data-issue-row="${duplicateIssue.id}"] .dup-ref`).click();
  check($('#issue-search').value === 'INC-SMOKE' && issueDuplicatesOnly && document.querySelectorAll('#issue-rows tr[data-issue-row]').length === 2, "Clicking a duplicate incident filters the affected associations");
  view = 0; render();
  taskDialog();
  const duplicateTaskForm = $('#task-form');
  duplicateTaskForm.elements.code.value = 'smoke-dup';
  duplicateTaskForm.elements.code.dispatchEvent(new Event('input'));
  check($('#match-preview .duplicate-warning')?.textContent.includes('INC-SMOKE') && $('#match-preview .duplicate-warning').textContent.includes(`#${smokeTask().sequence} SMOKE-1`), "Possible duplicate warning appears while entering a task incident");
  duplicateTaskForm.requestSubmit();
  await waitFor(() => !saving && !$('#modal').open && data.tasks.some(task => task.code === 'smoke-dup'));
  const duplicateTask = data.tasks.find(task => task.code === 'smoke-dup'), taskRowOf = id => document.querySelector(`#task-rows tr[data-task-row="${CSS.escape(id)}"]`);
  check(duplicatesOf().tasks.size === 2 && $('[data-view="0"] .nav-alert [aria-hidden]')?.textContent === '2' && $('#duplicates-only').closest('label').classList.contains('has-duplicates'), "Linked tasks sharing an incident are flagged in navigation and the filter");
  check([smokeTask().id, duplicateTask.id].every(id => taskRowOf(id)?.classList.contains('duplicate-row') && taskRowOf(id).querySelector('.dup-flag') && (!shownColumns().includes('incident') || taskRowOf(id).querySelector('.dup-ref'))) && document.querySelectorAll('#task-rows .dup-flag').length === 2, 'Rows, incidents, and actions indicate possible duplicates');
  check(taskRowOf(duplicateTask.id).querySelector('.dup-flag').title.includes(`#${smokeTask().sequence} SMOKE-1`), "Signal identifies which tasks share the incident");
  showHidden = false; render();
  check(smokeTask().hidden && !taskRowOf(smokeTask().id), "Hidden duplicate task is excluded from the normal list");
  $('#duplicates-only').click();
  check(duplicatesOnly && document.querySelectorAll('#task-rows tr[data-task-row]').length === 2 && taskRowOf(smokeTask().id), "Duplicates filter also includes hidden tasks");
  $('#duplicates-only').click();
  taskRowOf(duplicateTask.id).querySelector('.dup-flag').click();
  check(search === 'INC-SMOKE' && $('#search').value === 'INC-SMOKE' && duplicatesOnly && document.querySelectorAll('#task-rows tr[data-task-row]').length === 2 && !$('#modal').open, "Clicking the signal shows tasks that share the incident");
  doubleClick(taskRowOf(duplicateTask.id).querySelector('.dup-flag'));
  check(!$('#modal').open, 'Double-clicking the duplicate signal does not open the editor');
  await commit(next => {
    next.tasks = next.tasks.filter(task => task.id !== duplicateTask.id);
    next.issues = next.issues.filter(issue => issue.id !== duplicateIssue.id);
  });
  search = ''; duplicatesOnly = false; issueDuplicatesOnly = false; showHidden = true; render();
  check(!duplicatesOf().groups.length && !document.querySelector('.nav-alert, .dup-flag, .dup-ref') && $('#duplicates-only').disabled && data.tasks.length === initialTaskCount + 1, 'Resolving a duplicate removes its flags and filter');
  view = 0; render();
  const paint = highlightsOf()[1];
  $(`.highlighter-bar [data-highlighter="${paint.id}"]`).click();
  check(highlighter === paint.id && $('.activity-table').classList.contains('painting') && $('.highlighter-bar').classList.contains('active') && $(`.highlighter-bar [data-highlighter="${paint.id}"]`).getAttribute('aria-pressed') === 'true', "Highlighter can be toggled from the bar above the table");
  smokeRow().querySelector('.description-cell').click();
  check(!$('#modal').open && smokeRow().classList.contains('marked'), 'Clicking a row with the highlighter colors it without opening the task');
  await waitFor(() => !saving && !markFlush);
  check(smokeTask().highlightId === paint.id && (await workspaceApi.load()).data.tasks.find(task => task.code === 'SMOKE-1').highlightId === paint.id && smokeRow().classList.contains('marked') && smokeRow().style.getPropertyValue('--mark').trim() === paint.color && highlighter === paint.id, "Row highlight is saved in the portable archive");
  doubleClick(smokeRow().cells[1]);
  check(!$('#modal').open && highlighter === paint.id, 'Double-clicking with the highlighter active does not open the editor');
  smokeRow().cells[1].click();
  await waitFor(() => !saving && !markFlush);
  check(smokeTask().highlightId === '' && !smokeRow().classList.contains('marked'), 'Second click with the same color removes the highlight');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(highlighter === '' && !$('.activity-table').classList.contains('painting') && !$('.highlighter-bar').classList.contains('active'), 'Escape exits highlighter mode');
  smokeRow().querySelector('[data-mark-task]').click();
  check($('#mark-menu') && document.querySelectorAll('#mark-menu [data-mark-choice]').length === highlightsOf().length + 1 && smokeRow().querySelector('[data-mark-task]').getAttribute('aria-expanded') === 'true' && document.activeElement.closest('#mark-menu'), 'Highlight menu opens from the dot at the end of the row');
  $('#mark-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!$('#mark-menu') && document.activeElement === smokeRow().querySelector('[data-mark-task]'), 'Escape closes the menu and restores focus to the dot');
  smokeRow().querySelector('[data-mark-task]').click();
  $(`#mark-menu [data-mark-choice="${highlightsOf()[0].id}"]`).click();
  await waitFor(() => !saving && !markFlush);
  check(!$('#mark-menu') && smokeTask().highlightId === highlightsOf()[0].id && smokeRow().classList.contains('marked') && smokeRow().querySelector('.mark-button.is-marked'), "Color chosen from the menu is applied to the row");
  const listedRows = () => [...document.querySelectorAll('#task-rows tr[data-task-row]')];
  const setHighlightFilter = value => { $('#highlight-filter').value = value; $('#highlight-filter').dispatchEvent(new Event('change')); };
  setHighlightFilter(highlightsOf()[0].id);
  check(listedRows().length > 0 && listedRows().every(row => data.tasks.find(task => task.id === row.dataset.taskRow).highlightId === highlightsOf()[0].id) && listedRows().includes(smokeRow()), 'Filter the list by highlight color');
  setHighlightFilter('__none');
  check(listedRows().length > 0 && listedRows().every(row => !row.classList.contains('marked')), 'Filter rows without a highlight');
  setHighlightFilter('');
  check(listedRows().length === filteredTasks().length && highlightFilter === '', 'Highlight filter is cleared');
  smokeRow().querySelector('.code-link').click();
  check($('#task-form').elements.highlightId.value === highlightsOf()[0].id && $('#task-form').elements.highlightId.options.length === highlightsOf().length + 1, "Highlight field in the task editor");
  $('#task-form').elements.highlightId.value = highlightsOf()[2].id;
  $('#task-form').requestSubmit();
  await waitFor(() => !saving && !$('#modal').open && smokeTask().highlightId === highlightsOf()[2].id);
  check(smokeRow().classList.contains('marked') && smokeRow().style.getPropertyValue('--mark').trim() === highlightsOf()[2].color, "Highlight can be edited in the task editor");
  const headerIds = () => [...document.querySelectorAll('.activity-table thead th[data-column]')].map(th => th.dataset.column);
  check(headerIds().join() === 'sequence,code,description,urgency,status,tags,effort,incident,problem,releaseDate,notes' && document.querySelectorAll('#task-rows td.description-col').length === listedRows().length, "Default columns in the task list");
  $('#columns-button').click();
  const columnToggle = id => $(`#columns-dialog-editor [data-column-visible="${id}"]`);
  check($('#modal').open && document.querySelectorAll('#columns-dialog-editor [data-column-visible]').length === Object.keys(taskColumnDefs).length && !columnToggle('highlight').checked && columnToggle('notes').checked, "Choose columns from the Columns button");
  columnToggle('highlight').click();
  columnToggle('notes').click();
  $('#columns-dialog-editor [data-column-move="highlight:-1"]').click();
  check(document.activeElement?.dataset.columnMove === 'highlight:-1', 'Column movement works with the keyboard');
  const dialogOrder = () => [...document.querySelectorAll('#columns-dialog-editor [data-column-visible]')].map(input => input.dataset.columnVisible);
  const columnsBeforeDrag = dialogOrder();
  check(document.querySelectorAll('#columns-dialog-editor .column-row [data-drag-handle]').length === columnsBeforeDrag.length && $('#modal .section-description').textContent === t("Tick the columns to show and drag them (or use the arrows) to change their order. Hiding a column does not delete any data."), 'Every column has a drag handle');
  const codeRow = () => columnToggle('code').closest('.column-row');
  const columnLifted = dragTo(codeRow().querySelector('.column-toggle span'), columnToggle('sequence').closest('.column-row'));
  columnToggle('code').closest('label').click();
  await tick();
  check(columnLifted && dialogOrder().join() === ['code', 'sequence', ...columnsBeforeDrag.slice(2)].join() && columnToggle('code').checked && $('#modal').open && !document.querySelector('.is-dragging') && $('#modal > .sort-status')?.textContent === fillText("Moved to position {0} of {1}", 1, columnsBeforeDrag.length), "Columns can also be dragged by name without changing visibility");
  codeRow().querySelector('[data-drag-handle]').focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  check(dialogOrder().join() === columnsBeforeDrag.join() && document.activeElement === codeRow().querySelector('[data-drag-handle]') && codeRow() === document.querySelectorAll('#columns-dialog-editor .column-row')[1], "Columns can be reordered with the handle arrows");
  $('#columns-apply').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(headerIds().join() === 'sequence,code,description,urgency,highlight,status,tags,effort,incident,problem,releaseDate' && smokeRow().cells.length === headerIds().length + 2 && smokeRow().querySelector('.mark-pill') && !data.settings.taskColumns.find(column => column.id === 'notes').visible && (await workspaceApi.load()).data.settings.taskColumns.find(column => column.id === 'highlight').visible, "Shown, hidden, and reordered columns are saved");
  $('[data-sort="highlightId"]').click();
  check(sort.length === 1 && sort[0].key === 'highlightId' && listedRows()[0].classList.contains('marked') && !listedRows().at(-1).classList.contains('marked'), "Sort by highlight");
  await commit(next => { next.settings.taskColumns = defaultTaskColumns(); });
  render();
  check(headerIds().at(-1) === 'notes' && !headerIds().includes('highlight') && sort.length === 1 && sort[0].key === 'releaseDate', "Sorting by a hidden column returns to release date");
  view = 2; render();
  check(document.querySelector('.milestone-column .task-card.is-marked .mark-chip'), "Highlight is visible in milestones");
  view = 3; render();
  check(document.querySelector('.kanban-column .task-card.is-marked .mark-chip'), "Highlight is visible in kanban");
  // Bulk selection and edit.
  const bulkTasks = () => ['BULK-1', 'BULK-2', 'BULK-3'].map(code => data.tasks.find(task => task.code === code));
  await commit(next => {
    ['2031-03-14', '2031-03-14', ''].forEach((releaseDate, i) => next.tasks.push({ ...structuredClone(next.tasks[0]), id: uid(), code: `BULK-${i + 1}`, sequence: 990001 + i, description: `<p>Bulk ${i + 1}</p>`, notes: '', url: '', releaseDate, hidden: false, highlightId: '', tagIds: [], statusId: next.settings.statuses[0].id, urgencyId: next.settings.urgencies[0].id }));
  });
  view = 0; search = 'BULK-'; statusFilter = ''; highlightFilter = ''; duplicatesOnly = false; showHidden = false; sort = [{ key: 'code', direction: 'asc' }]; selectedTasks.clear(); render();
  const selectBoxes = () => [...document.querySelectorAll('#task-rows input[data-select-task]')];
  check(selectBoxes().length === 3 && $('.activity-table thead th.select-col #select-all') && $('#bulk-bar').hidden && !$('#footer-hint').hidden && !$('#select-all').checked && !$('#select-all').indeterminate, "Task selection column appears; action bar stays hidden without a selection");
  selectBoxes()[0].click();
  check(selectedTasks.size === 1 && selectBoxes()[0].closest('tr').classList.contains('selected') && !$('#bulk-bar').hidden && $('#footer-hint').hidden && $('#select-all').indeterminate && $('#bulk-count').textContent === fillText("{0} selected", 1), 'Selecting a row shows the bulk edit bar');
  selectBoxes()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
  check(selectedTasks.size === 3 && selectBoxes().every(box => box.checked) && $('#select-all').checked && !$('#select-all').indeterminate, 'Shift-click selects a range of rows');
  $('#select-all').click();
  check(!selectedTasks.size && $('#bulk-bar').hidden && selectBoxes().every(box => !box.checked), 'Header checkbox deselects all visible rows');
  $('#select-all').click();
  $('#search').value = 'BULK-1'; $('#search').dispatchEvent(new Event('input'));
  check(selectedTasks.size === 3 && $('#bulk-count').textContent === `${fillText("{0} selected", 3)} · ${fillText("{0} not visible with the current filters", 2)}`, 'Selection is preserved when filters change, with a count of hidden rows');
  $('#search').value = 'BULK-'; $('#search').dispatchEvent(new Event('input'));
  doubleClick(selectBoxes()[0].closest('td'));
  check(!$('#modal').open, 'Double-clicking the selection checkbox does not open the editor');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!selectedTasks.size && $('#bulk-bar').hidden, 'Escape clears the selection');
  $('#select-all').click();
  $('#bulk-edit').click();
  const bulkForm = () => $('#bulk-form'), bulkBox = code => bulkForm().querySelector(`input[name="taskIds"][value="${CSS.escape(data.tasks.find(task => task.code === code).id)}"]`);
  check($('#modal').open && bulkForm() && bulkForm().querySelectorAll('input[name="taskIds"]:checked').length === 3 && $('#bulk-apply').disabled && $('#bulk-summary').textContent === fillText("{0} ready: choose what to change.", plural(3, "tasks")), "Bulk edit lists the affected tasks");
  const bulkTag = (data.settings.tags || [])[0], bulkStatus = data.settings.statuses[1], bulkMark = highlightsOf()[0];
  bulkBox('BULK-2').click();
  bulkForm().elements.statusId.value = bulkStatus.id;
  bulkForm().elements.releaseMode.value = 'shift';
  bulkForm().elements.highlightId.value = bulkMark.id;
  bulkForm().elements[`tag:${bulkTag.id}`].value = 'add';
  bulkForm().dispatchEvent(new Event('change'));
  check(!bulkForm().elements.shiftDays.hidden && bulkForm().elements.releaseDate.hidden && !$('#bulk-apply').disabled && $('#bulk-summary').textContent === fillText("Changes will be applied to {0}.", plural(2, "tasks")) && $('#bulk-release-hint').textContent === fillText("Only tasks with a date: {0} of {1}.", 1, 2), "Bulk edit summary updates live");
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  const [bulkOne, bulkTwo, bulkThree] = bulkTasks(), savedBulk = (await workspaceApi.load()).data.tasks.filter(task => task.code.startsWith('BULK-'));
  check([bulkOne, bulkThree].every(task => task.statusId === bulkStatus.id && task.highlightId === bulkMark.id && task.tagIds.includes(bulkTag.id)) && bulkOne.releaseDate === '2031-03-21' && bulkThree.releaseDate === '' && bulkTwo.statusId === data.settings.statuses[0].id && bulkTwo.releaseDate === '2031-03-14' && !bulkTwo.tagIds.length && savedBulk.filter(task => task.statusId === bulkStatus.id).length === 2, "Bulk edit applies status, release date, highlight, and tags only to selected tasks");
  check($('#toast').textContent === fillText("Bulk edit applied: {0} updated.", plural(2, "tasks")) && selectedTasks.size === 3 && document.querySelectorAll('#task-rows tr.selected').length === 3, 'Bulk edit result and selection are preserved');
  $('#bulk-edit').click();
  bulkForm().requestSubmit();
  await tick();
  check($('#modal').open && $('#toast').textContent === t("Choose at least one field to change."), "Bulk edit is blocked when no fields are selected");
  bulkForm().elements.releaseMode.value = 'set';
  bulkForm().dispatchEvent(new Event('change'));
  bulkForm().requestSubmit();
  await tick();
  check($('#modal').open && !bulkForm().elements.releaseDate.hidden && $('#toast').textContent === t("Choose the new release date."), "A new release date is required for bulk editing");
  bulkForm().elements.releaseMode.value = '';
  bulkForm().elements.hidden.value = 'hide';
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(bulkTasks().every(task => task.hidden) && !selectBoxes().length && selectedTasks.size === 3 && $('#bulk-count').textContent.includes(fillText("{0} not visible with the current filters", 3)), "Bulk edit hides tasks without losing the selection");
  view = 2; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1 && document.querySelectorAll('.milestone-heading [data-bulk-release]').length === document.querySelectorAll('.milestone-column').length, "Bulk edit and Excel are available from milestones");
  document.querySelector('[data-bulk-release="2031-03-21"]').click();
  check(bulkForm() && [...bulkForm().querySelectorAll('input[name="taskIds"]')].map(box => box.value).join() === bulkOne.id && bulkForm().querySelector('.bulk-item.is-hidden') && $('#bulk-form .section-description').textContent === fillText("Tasks of the {0} release, hidden ones included.", formatDate('2031-03-21')), "Milestone editor includes its tasks, including hidden ones");
  bulkForm().elements.releaseMode.value = 'set';
  bulkForm().elements.releaseDate.value = '2031-04-01';
  bulkForm().requestSubmit();
  await waitFor(() => !saving && !$('#modal').open);
  check(bulkTasks()[0].releaseDate === '2031-04-01' && view === 2 && $('.milestone-column[data-release-date="2031-04-01"]') && !$('.milestone-column[data-release-date="2031-03-21"]'), "Milestone is moved using bulk edit from milestones");
  view = 3; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1, 'Excel export is available from kanban');
  view = 1; render();
  check(document.querySelectorAll('.page-heading [data-excel-export]').length === 1, 'Excel export is available from issues');
  // Excel workbook content.
  check(richText("<ol><li>One</li><li>Two</li></ol><ul><li>Three</li></ul><p>To<br>B</p>") === "1. One\n2. Two\n• Three\nTo\nB" && hexColor('hsl(0 100% 50%)') === '#ff0000' && tint('#000000', 0.5) === '#808080' && hexColor('nonsense') === '#929bb2', "Rich text and colors are converted for Excel");
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
  check([...fullBook].every(([name, text]) => !/\.(xml|rels)$/.test(name) || !xmlDoc(text).querySelector('parsererror')) && bookSheets.join('|') === window.OrbitaXlsx.sheetNames([t("Summary"), ...data.settings.tabNames.slice(0, 4)]).join('|'), 'Well-formed Excel workbook includes a summary and one sheet per tab');
  const taskSheetXml = fullBook.get('xl/worksheets/sheet2.xml'), sharedXml = fullBook.get('xl/sharedStrings.xml');
  check(xmlDoc(taskSheetXml).getElementsByTagName('row').length === data.tasks.length + 1 && sharedXml.includes('SMOKE-1') && sharedXml.includes('BULK-3') && taskSheetXml.includes(`<v>${window.OrbitaXlsx.excelDate('2031-04-01')}</v>`) && taskSheetXml.includes('<autoFilter ') && taskSheetXml.includes('state="frozen"') && fullBook.has('xl/worksheets/_rels/sheet2.xml.rels'), "Task sheet includes every row, real dates, filters, frozen panes, and links");
  check(fullBook.get('xl/styles.xml').includes(window.OrbitaXlsx.argb(tint(bulkStatus.color, 0.35))) && fullBook.get('xl/styles.xml').includes(window.OrbitaXlsx.argb(tint(dateColor('2031-04-01'), 0.5))) && fullBook.get('xl/worksheets/sheet3.xml').includes('<autoFilter ') && fullBook.get('xl/styles.xml').includes('FFFFF1C2') && [t("Next release"), t("Today's release")].some(text => sharedXml.includes(text)), 'Status colors, dates, and next release are included in the Excel file');
  const pickedBook = await unzipParts(await situationWorkbook({ scope: 'selected', columns: 'visible', sheets: ['summary', 'tasks'] }));
  const pickedSheet = pickedBook.get('xl/worksheets/sheet2.xml'), pickedShared = pickedBook.get('xl/sharedStrings.xml');
  check(!pickedBook.has('xl/worksheets/sheet3.xml') && xmlDoc(pickedSheet).getElementsByTagName('row').length === 4 && pickedShared.includes(t("Selected only")) && pickedShared.includes(t("Hidden")) && !pickedShared.includes('SMOKE-1'), "Excel export includes only selected tasks and chosen sheets");
  view = 0; render();
  $('#bulk-excel').click();
  const excelForm = () => $('#excel-form');
  check($('#modal').open && excelForm().elements.scope.value === 'selected' && excelForm().querySelectorAll('input[name="sheets"]:checked').length === allSheets.length && excelForm().querySelectorAll('input[name="sheets"]').length === 5, "Excel exports the tasks selected from the selection bar");
  excelForm().querySelectorAll('input[name="sheets"]').forEach(box => { box.checked = false; });
  excelForm().requestSubmit();
  await tick();
  check($('#modal').open && $('#toast').textContent === t("Choose at least one sheet to export."), 'Excel export requires at least one sheet');
  excelForm().querySelectorAll('input[name="sheets"]').forEach(box => { box.checked = true; });
  excelForm().requestSubmit();
  await waitFor(() => !$('#modal').open);
  const excelName = situationFileName(organizations.find(o => o.id === activeOrganizationId).name, currentLanguage());
  check($('#toast').textContent === `${t("Excel exported:")} ${excelName}` && excelChoices.scope === 'selected', "Excel export is saved with the organization name and date in the filename");
  clearSelection();
  $('[data-excel-export]').click();
  check(excelForm().elements.scope.value === 'view' && excelForm().querySelector('input[value="selected"]').disabled, 'Without a selection, Excel export uses the current view');
  $('#modal').close();
  $('#select-all').click();
  check(!selectedTasks.size, "No visible rows can be selected when tasks are hidden");
  showHidden = true; render(); $('#select-all').click();
  $('#bulk-edit').click();
  $('#bulk-delete').click();
  check($('#confirm-action') && $('.confirm-message').textContent.includes('BULK-1'), 'Bulk deletion requires confirmation');
  $('#confirm-action').click();
  await waitFor(() => !saving && !$('#modal').open);
  check(!bulkTasks().some(Boolean) && data.tasks.length === initialTaskCount + 1 && !selectedTasks.size && $('#bulk-bar').hidden && !(await workspaceApi.load()).data.tasks.some(task => task.code.startsWith('BULK-')), "Selected tasks are deleted in bulk");
  search = ''; showHidden = false; sort = [{ key: 'releaseDate', direction: 'asc' }];
  view = 0; render();
  $('.highlighter-bar [data-manage-highlights]').click();
  check(view === 4 && settingsTab === 'highlights' && !$('#highlights-panel').hidden, "Manage colors opens the Highlighters tab");
  const guideSectionIds = window.OrbitaGuide.sections.map(section => section.id);
  const guideSearch = value => { $('#guide-search').value = value; $('#guide-search').dispatchEvent(new Event('input', { bubbles: true })); };
  const shownGuideSections = () => [...document.querySelectorAll('.guide-section:not([hidden])')].map(section => section.dataset.guideId);
  const pressF1 = () => { const event = new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }); document.dispatchEvent(event); return event; };
  view = 0; render();
  $('#guide-button').click();
  check(view === 5 && $('#guide-button').classList.contains('active') && !$('#settings-button').classList.contains('active') && $('#current-tab').textContent === term("Guide") && $('#guide-page h1').textContent.startsWith(term("Guide")) && $('#guide-search').placeholder === term("Search the guide…"), "Guide button opens the in-app guide");
  check(document.querySelectorAll('.guide-section').length === guideSectionIds.length && guideSectionIds.every(id => $(`#guide-${id}`) && $(`.guide-nav-link[data-guide-section="${id}"]`)) && [0, 1, 2, 3].every(i => $(`#guide-${window.OrbitaGuide.sections.find(section => section.tab === i).id}-title`).textContent === data.settings.tabNames[i]), "Guide lists every section in its contents, using the organization's tab names");
  const guidePageText = $('#guide-page').textContent;
  check(!guidePageText.includes('**') && !guidePageText.includes('`') && $('#guide-page li strong') && $('#guide-page li kbd') && $('#guide-page li code') && document.querySelectorAll('.guide-shortcuts tbody tr').length === window.OrbitaGuide.sections.find(section => section.shortcuts).shortcuts.length && $('.guide-topic .guide-badge')?.textContent === term("Desktop app only"), "Guide renders bold labels, keys, code, shortcuts and badges");
  check($('#content').scrollWidth <= $('#content').clientWidth + 1 && [...document.querySelectorAll('.guide-section')].every(section => section.scrollWidth <= section.clientWidth + 1), "Guide fits the window without horizontal scrolling");
  check($('#guide-kanban [data-guide-settings="statuses"]') && $('#guide-tasks [data-guide-view="0"]').textContent === fillTerm("Go to {0}", data.settings.tabNames[0]), "Guide shortcuts point to views and settings tabs");
  $('.guide-nav-link[data-guide-section="updates"]').click();
  check(document.activeElement === $('#guide-updates-title') && $('.guide-nav-link[data-guide-section="updates"]').getAttribute('aria-current') === 'true' && document.querySelectorAll('.guide-nav-link[aria-current]').length === 1 && $('#content').scrollTop > 0, "Guide contents jump to a section and mark it");
  $('#content').scrollTop = 0;
  markGuideSection();
  check($('.guide-nav-link[data-guide-section="start"]').classList.contains('active') && document.querySelectorAll('.guide-nav-link.active').length === 1, "Guide contents follow the page while scrolling");
  guideSearch('sha-256');
  check(shownGuideSections().join() === 'updates' && document.querySelectorAll('.guide-section:not([hidden]) [data-guide-topic]:not([hidden])').length === 1 && document.querySelectorAll('.guide-nav-link:not([hidden])').length === 1 && $('#guide-empty').hidden && $('#guide-status').textContent === fillTerm("Matching topics: {0}", 1), "Guide search keeps only matching topics and announces the count");
  render();
  check($('#guide-search').value === 'sha-256' && shownGuideSections().join() === 'updates', "Guide search survives a rerender");
  guideSearch('zzqx-no-topic');
  check(!shownGuideSections().length && !$('#guide-empty').hidden && $('#guide-status').textContent === fillTerm("Matching topics: {0}", 0), "Guide search shows an empty state when nothing matches");
  check(foldText('Attività ÈCCO') === 'attivita ecco', "Guide search ignores accents and letter case");
  guideSearch('');
  check(shownGuideSections().length === guideSectionIds.length && $('#guide-empty').hidden && !$('#guide-status').textContent, "Clearing the guide search shows every section");
  view = 0; render();
  check(pressF1().defaultPrevented && view === 5 && $('#guide-page'), "F1 opens the guide from any view");
  view = 0; render(); taskDialog();
  check(!pressF1().defaultPrevented && view === 0 && $('#modal').open, "F1 is ignored while a dialog is open");
  $('#modal').close();
  view = 5; render();
  $('#guide-milestones [data-guide-view="2"]').click();
  check(view === 2 && !$('#guide-page'), "Guide links open the matching view");
  view = 5; render();
  $('#guide-appearance [data-guide-settings="themes"]').click();
  check(view === 4 && settingsTab === 'themes' && !$('#themes-panel').hidden, "Guide links open the matching settings tab");
  view = 4; render();
  const visibleSettingsPanels = () => allSettingsTabs().filter(tab => !$(`#${tab.panel}`).hidden).map(tab => tab.id);
  check(document.querySelectorAll('.settings-nav .settings-tab').length === allSettingsTabs().length && allSettingsTabs().every(tab => $(`#${tab.panel}`) && $(`#settings-tab-${tab.id}`).getAttribute('aria-controls') === tab.panel) && visibleSettingsPanels().length === 1, "Settings are divided into tabs with only one panel visible");
  $('[data-settings-tab="themes"]').click();
  check(visibleSettingsPanels().join() === 'themes' && $('#settings-tab-themes').getAttribute('aria-current') === 'true' && !$('#settings-tab-identity').hasAttribute('aria-current') && settingsTab === 'themes', "Themes tab can be selected from navigation");
  render();
  check(visibleSettingsPanels().join() === 'themes' && $('#settings-tab-themes').classList.contains('active'), 'Settings tab remains selected after rerender');
  $('#settings-tab-themes').focus();
  $('#settings-tab-themes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  check(settingsTab === 'fonts' && visibleSettingsPanels().join() === 'fonts' && document.activeElement === $('#settings-tab-fonts'), 'Settings tabs are keyboard navigable');
  showSettingsTab('themes');
  const accent = () => document.documentElement.style.getPropertyValue('--accent');
  const savedAccent = data.settings.themes.find(theme => theme.id === data.settings.themeId).accent;
  check($('#unsaved-banner').hidden && !settingsChanged() && accent() === savedAccent, 'No warning appears when settings have not changed');
  check(defaultThemes().length === 40 && defaultThemes().every(theme => data.settings.themes.some(saved => saved.id === theme.id)) && $('#reset-theme') && !$('#delete-theme') && [...document.querySelectorAll('#theme-list .theme-kind')].filter(label => label.textContent === t("Built-in")).length === 40, "Catalog of 40 default themes is available without importing");
  {
    const original = updateState;
    const visible = selector => $(selector).getClientRects().length > 0;
    showSettingsTab('updates');
    check($('#update-check').disabled && $('#update-auto').disabled && !visible('#update-download') && !visible('#update-install') && $('#update-status').textContent.includes(t("Updates can only be installed from the Windows portable app.")), 'Source and smoke builds cannot download or install real updates');
    const testState = { ...original, supported: true, version: '99.0.0' };
    adoptUpdateState({ ...testState, phase: 'available' });
    check(visible('#update-download') && !$('#update-download').disabled && !visible('#update-install') && $('#update-install').disabled && !$('#update-check').disabled, 'Available update offers download but not install');
    check(visible('#update-notice') && visible('#update-badge') && $('#update-notice-title').textContent.includes('99.0.0') && $('#update-notice .update-notice-copy').getAttribute('role') === 'status', 'Detected updates display a persistent accessible notification and a top-bar badge');
    view = 0; render();
    check(visible('#update-notice') && visible('#update-badge'), 'Update notifications remain visible outside settings and across view changes');
    $('#update-notice-dismiss').click();
    adoptUpdateState({ ...testState, phase: 'available' }); render();
    check(!visible('#update-notice') && visible('#update-badge') && document.activeElement === $('#update-badge'), 'Dismissing an update suppresses repeated alerts for that version but keeps the badge');
    $('#update-badge').click(); await tick();
    check(view === 4 && settingsTab === 'updates' && !$('#updates-panel').hidden, 'The notification badge opens the update settings without downloading automatically');
    $('#organization-name').value += ' unsaved';
    refreshSettingsState();
    $('#update-badge').click(); await tick();
    check($('#modal').open && $('#discard-switch') && settingsChanged(), 'Opening updates protects unsaved organization settings');
    $('#modal [data-close]').click();
    $('#discard-settings').click();
    adoptUpdateState({ ...testState, version: '99.0.1', phase: 'available' });
    check(visible('#update-notice') && $('#update-notice-title').textContent.includes('99.0.1'), 'A newer detected version appears even after an earlier notification was dismissed');
    $('#update-notice-open').click(); await tick();
    adoptUpdateState({ ...testState, phase: 'downloading', percent: 42 });
    check(visible('#update-progress') && $('#update-progress').value === 42 && $('#update-check').disabled && $('#update-auto').disabled && !visible('#update-download') && !visible('#update-install'), 'Download progress is accessible and blocks duplicate actions');
    adoptUpdateState({ ...testState, phase: 'ready' });
    check(visible('#update-install') && !$('#update-install').disabled && !visible('#update-download') && !visible('#update-progress'), 'Only verified downloads offer install and restart');
    adoptUpdateState({ ...testState, phase: 'error', error: 'Update checksum or size does not match. Nothing was installed.' });
    check(!visible('#update-install') && $('#update-install').disabled && $('#update-status').textContent.includes(t('Update checksum or size does not match. Nothing was installed.')), 'Failed updates show the error without an install action');
    adoptUpdateState(original);
    dismissedUpdateVersions.delete('99.0.0');
    check(!visible('#update-notice') && !visible('#update-badge'), 'Unsupported or up-to-date copies do not display update alerts');
    showSettingsTab('themes');
    check(!settingsChanged(), 'Application update state does not dirty organization settings');
  }
  const previewTheme = data.settings.themes.find(theme => theme.id !== data.settings.themeId && theme.accent !== savedAccent);
  document.querySelector(`[data-theme="${previewTheme.id}"]`).click();
  await new Promise(resolve => setTimeout(resolve));
  check(accent() === previewTheme.accent && document.documentElement.style.getPropertyValue('--background') === previewTheme.background, 'Selected theme is immediately applied in the preview');
  if (customTitleBar()) check(windowChromeSent.background === previewTheme.background && windowChromeSent.text === previewTheme.text, 'Title bar updated with the theme preview');
  check(!$('#unsaved-banner').hidden && data.settings.themeId !== previewTheme.id, 'Unsaved settings warning appears without saving the theme');
  const swatchGallery = $('#theme-list'), previousGalleryStyle = swatchGallery.style.cssText;
  swatchGallery.style.gridTemplateColumns = '152px';
  swatchGallery.style.setProperty('--fs', '0.8');
  const selectedCard = $('.theme-choice.chosen'), cardBounds = selectedCard.getBoundingClientRect();
  const swatchBounds = [...selectedCard.querySelectorAll('.theme-swatches i')].map(dot => dot.getBoundingClientRect());
  check(Math.abs(cardBounds.width - 152) < 0.1 && swatchBounds.length === 4 && swatchBounds.every(dot => Math.abs(dot.width - 12) < 0.1 && Math.abs(dot.height - 12) < 0.1), 'Selected theme keeps four circular 12px swatches at the narrowest compact gallery width');
  check(swatchBounds.every(dot => dot.left >= cardBounds.left && dot.right <= cardBounds.right) && swatchBounds.at(-1).right <= selectedCard.querySelector('.theme-check').getBoundingClientRect().left, 'Fixed-size theme swatches stay inside the card without overlapping the selection mark');
  swatchGallery.style.cssText = previousGalleryStyle;
  check(!$('#settings-tab-themes .settings-tab-dot').hidden && settingsTabs.filter(tab => !$(`#settings-tab-${tab.id} .settings-tab-dot`).hidden).length === 1 && $('#unsaved-where').textContent.includes(t("Themes & atmosphere")) && $('#unsaved-where [data-goto-settings-tab="themes"]'), 'Modified tab is flagged in navigation and in the warning');
  showSettingsTab('identity');
  $('#unsaved-where [data-goto-settings-tab="themes"]').click();
  check(settingsTab === 'themes' && visibleSettingsPanels().join() === 'themes', "Warning link opens the modified tab");
  const searchThemes = value => { $('#theme-search').value = value; $('#theme-search').dispatchEvent(new Event('input', { bubbles: true })); };
  const themeQueryText = previewTheme.name.slice(1, 4).toLocaleUpperCase();
  const expectedThemes = settingsDraft.themes.filter(theme => theme.name.toLocaleLowerCase().includes(themeQueryText.toLocaleLowerCase()));
  searchThemes(themeQueryText);
  check(document.querySelectorAll('#theme-list .theme-choice').length === expectedThemes.length && expectedThemes.length < settingsDraft.themes.length && $('#theme-count').textContent.startsWith(`${expectedThemes.length} / ${settingsDraft.themes.length}`), "Theme search filters the gallery regardless of letter case");
  searchThemes('no-theme-with-this-name');
  check($('.theme-empty') && !document.querySelector('#theme-list .theme-choice') && $('#theme-editor #theme-name'), "Theme search with no results displays a message and keeps the editor");
  searchThemes('');
  check(document.querySelectorAll('#theme-list .theme-choice').length === settingsDraft.themes.length && themeQuery === '', "Clearing theme search shows all themes");
  document.querySelector('[data-theme-color="accent"]').value = '#12ab34';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input', { bubbles: true }));
  check(accent() === '#12ab34', "Theme color editing is applied in real time");
  if (customTitleBar()) {
    const backgroundInput = document.querySelector('[data-theme-color="background"]');
    backgroundInput.value = '#f4f1e8';
    backgroundInput.dispatchEvent(new Event('input', { bubbles: true }));
    check(windowChromeSent.background === '#f4f1e8' && windowChromeSent.text === previewTheme.text, 'Title bar background follows the theme in real time');
  }
  check($('.theme-choice.chosen .theme-kind').textContent === t("Modified built-in") && !$('#delete-theme'), 'Default theme can be edited without deleting the built-in version');
  $('#reset-theme').click();
  check(accent() === previewTheme.accent && $('#theme-name').value === previewTheme.name && $('.theme-choice.chosen .theme-kind').textContent === t("Built-in"), 'Resetting the theme restores its original name and four colors');
  document.querySelector('[data-theme-color="accent"]').value = '#12ab34';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input', { bubbles: true }));
  $('#discard-settings').click();
  check(accent() === savedAccent && $('#unsaved-banner').hidden && !settingsDraft.themes.some(theme => theme.accent === '#12ab34'), "Discard changes restores the saved theme");
  if (customTitleBar()) {
    const savedTheme = data.settings.themes.find(theme => theme.id === data.settings.themeId);
    check(windowChromeSent.background === savedTheme.background && windowChromeSent.text === savedTheme.text, 'Title bar is restored with the saved theme');
  }
  document.querySelector(`[data-theme="${previewTheme.id}"]`).click();
  check(accent() === previewTheme.accent, 'Theme preview is re-enabled');
  document.querySelector('[data-view="0"]').click();
  check(view === 0 && accent() === savedAccent && data.settings.themeId !== previewTheme.id, 'Leaving without saving keeps the previous theme');
  view = 4; render();
  document.querySelector('[data-tab-name="1"]').value = "Edit temporanea";
  document.querySelector('[data-tab-name="1"]').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  check(!$('#unsaved-banner').hidden, 'Warning appears for any changed setting');
  check(!$('#settings-tab-identity .settings-tab-dot').hidden && $('#settings-tab-themes .settings-tab-dot').hidden, "Editing tab names is flagged on the Identity tab");
  document.querySelector('[data-tab-name="1"]').value = data.settings.tabNames[1];
  document.querySelector('[data-tab-name="1"]').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  check($('#unsaved-banner').hidden, 'Warning disappears when changes match the saved values');
  showSettingsTab('themes');
  const galleryThemes = Array.from({ length: 30 }, (_, index) => ({ id: uid(), name: `Galleria ${index + 1}`, background: '#101820', surface: '#203040', text: '#f0f4fc', accent: '#40a0e0' }));
  settingsDraft.themes.push(...galleryThemes);
  settingsDraft.themeId = galleryThemes.at(-1).id;
  drawThemes();
  check($('.theme-choice.chosen .theme-kind').textContent === t("Custom") && $('#delete-theme') && !$('#reset-theme'), 'Custom theme is distinct from defaults and can still be deleted');
  $('#delete-theme').click();
  check(!settingsDraft.themes.some(theme => theme.id === galleryThemes.at(-1).id) && defaultThemes().every(theme => settingsDraft.themes.some(saved => saved.id === theme.id)), 'Deleting a custom theme does not remove default themes');
  settingsDraft.themes.push(galleryThemes.at(-1));
  settingsDraft.themeId = galleryThemes.at(-1).id;
  drawThemes();
  const gallery = $('#theme-list'), lastGalleryTile = gallery.querySelector('.theme-choice.chosen');
  check(gallery.scrollHeight > gallery.clientHeight + 100 && gallery.scrollTop > 0 && lastGalleryTile.offsetTop >= gallery.scrollTop && lastGalleryTile.offsetTop + lastGalleryTile.offsetHeight <= gallery.scrollTop + gallery.clientHeight + 1 && $('#themes-panel').offsetHeight < $('#theme-editor').offsetHeight + 400, "Compact theme gallery scrolls internally and shows the selected theme");
  $('#discard-settings').click();
  check(settingsDraft.themes.length === data.settings.themes.length && $('#unsaved-banner').hidden, "Added themes are discarded from the gallery");
  showSettingsTab('highlights');
  const savedHighlights = structuredClone(data.settings.highlights), removedHighlight = savedHighlights.find(h => h.id === smokeTask().highlightId);
  check(visibleSettingsPanels().join() === 'highlights' && document.querySelectorAll('#highlights-list .option-row').length === savedHighlights.length && document.querySelectorAll('#highlights-list .option-usage').length === savedHighlights.length && !$('#highlights-list .star'), "Highlighters tab uses the organization colors");
  $('[data-add-option="highlights"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(settingsDraft.highlights.length === savedHighlights.length + 1 && !savedHighlights.some(h => h.color === settingsDraft.highlights.at(-1).color) && !$('#settings-tab-highlights .settings-tab-dot').hidden && !$('#unsaved-banner').hidden, "New color with an unused tint is flagged as a change");
  $('#discard-settings').click();
  check(settingsDraft.highlights.length === savedHighlights.length && $('#unsaved-banner').hidden, "New color is discarded when changes are canceled");
  document.querySelector(`[data-remove="highlights:${removedHighlight.id}"]`).click();
  $('#save-settings-inline').click();
  await waitFor(() => data.settings.highlights.length === savedHighlights.length - 1 && !saving);
  check(!data.tasks.some(task => task.highlightId === removedHighlight.id) && smokeTask().highlightId === '', 'Deleting a color removes highlights from rows');
  await commit(next => { next.settings.highlights = savedHighlights; });
  render();
  showSettingsTab('statuses');
  const savedStatuses = structuredClone(data.settings.statuses), statusIds = list => list.map(status => status.id).join();
  const statusRow = index => document.querySelectorAll('#statuses-list .option-row')[index], statusHandle = index => statusRow(index).querySelector('[data-drag-handle]');
  check(savedStatuses.length >= 3 && document.querySelectorAll('#statuses-list [data-drag-handle]').length === savedStatuses.length && getComputedStyle(statusHandle(0)).cursor === 'grab' && $('#unsaved-banner').hidden, 'Every status has a drag handle');
  const statusLifted = dragTo(statusHandle(0), statusRow(2));
  await tick();
  const draggedStatuses = [savedStatuses[1], savedStatuses[2], savedStatuses[0], ...savedStatuses.slice(3)];
  check(statusLifted && statusIds(settingsDraft.statuses) === statusIds(draggedStatuses) && document.activeElement === statusHandle(2) && !document.querySelector('.is-dragging') && !document.body.classList.contains('is-sorting') && !$('#settings-tab-statuses .settings-tab-dot').hidden && !$('#unsaved-banner').hidden && $('body > .sort-status')?.textContent === fillText("Moved to position {0} of {1}", 3, savedStatuses.length), 'Dragging reorders statuses, flags the change, and announces it');
  const statusCancelled = dragTo(statusHandle(0), statusRow(2), 'escape');
  await tick();
  const listedStatusIds = () => [...document.querySelectorAll('#statuses-list [data-option-name]')].map(input => input.dataset.optionName.slice('statuses:'.length)).join();
  check(statusCancelled && statusIds(settingsDraft.statuses) === statusIds(draggedStatuses) && listedStatusIds() === statusIds(draggedStatuses) && !document.querySelector('.is-dragging') && !statusRow(0).style.transform && !$('#modal').open, 'Escape cancels dragging and restores the order');
  statusHandle(2).focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  const keyedStatuses = [savedStatuses[1], savedStatuses[0], savedStatuses[2], ...savedStatuses.slice(3)];
  check(statusIds(settingsDraft.statuses) === statusIds(keyedStatuses) && listedStatusIds() === statusIds(keyedStatuses) && document.activeElement === statusHandle(1), 'Statuses can be reordered using the handle arrows');
  $('#save-settings-inline').click();
  await waitFor(() => !saving && statusIds(data.settings.statuses) === statusIds(keyedStatuses));
  view = 3; render();
  check(statusIds((await workspaceApi.load()).data.settings.statuses) === statusIds(keyedStatuses) && [...document.querySelectorAll('.kanban-column .kanban-heading span')].map(span => span.textContent).join() === keyedStatuses.map(status => status.name).join(), 'New status order is saved and applied to kanban');
  await commit(next => { next.settings.statuses = savedStatuses; });
  view = 4; render();
  showSettingsTab('columns');
  $('#columns-editor [data-column-visible="link"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(settingsDraft.taskColumns.find(column => column.id === 'link').visible && !$('#settings-tab-columns .settings-tab-dot').hidden, "List columns can be configured in settings");
  $('#reset-columns').click();
  await new Promise(resolve => setTimeout(resolve));
  check(!settingsDraft.taskColumns.find(column => column.id === 'link').visible && $('#unsaved-banner').hidden, 'Default columns are restored');
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
  }) && document.querySelectorAll('#font-size-panel .font-sample[inert]').length === FONT_SIZE_PARTS.length, "Text size is configurable per section with limits and previews");
  const tableSampleSize = fontPx($('.font-sample[data-part="tables"] .code-link')), baseSampleSize = fontPx($('.font-sample[data-part="base"] .button'));
  const navSize = fontPx($('.sidebar .nav-button')), topbarSize = fontPx($('.topbar'));
  await setFontSize('tables', 130);
  check(rootSize('tables') === '1.3' && Math.abs(fontPx($('.font-sample[data-part="tables"] .code-link')) - tableSampleSize * 1.3) < 0.1 && fontPx($('.font-sample[data-part="base"] .button')) === baseSampleSize && $('#font-size-tables-value').textContent === '130%' && !$('#unsaved-banner').hidden && data.settings.fontSizes.tables === 100, 'Table size preview applies immediately only to the table area');
  await setFontSize('tables', 400);
  check(settingsDraft.fontSizes.tables === 150 && $('#font-size-tables').value === '150' && rootSize('tables') === '1.5', "Text size is capped at the allowed maximum");
  $('[data-font-preset="85"]').click();
  await new Promise(resolve => setTimeout(resolve));
  check(FONT_SIZE_PARTS.every(({ id }) => settingsDraft.fontSizes[id] === 85 && rootSize(id) === '0.85') && $('[data-font-preset="85"]').getAttribute('aria-pressed') === 'true' && Math.abs(fontPx($('.sidebar .nav-button')) - navSize * 0.85) < 0.05 && Math.abs(fontPx($('.topbar')) - topbarSize * 0.85) < 0.05, 'Compact preset applies to the entire interface');
  $('#discard-settings').click();
  check(FONT_SIZE_PARTS.every(({ id }) => rootSize(id) === '1' && $(`#font-size-${id}`).value === '100') && $('#unsaved-banner').hidden && fontPx($('.font-sample[data-part="tables"] .code-link')) === tableSampleSize && fontPx($('.topbar')) === topbarSize, "Discard changes restores the saved text sizes");
  await setFontSize('kanban', 120);
  document.querySelector('[data-view="3"]').click();
  const kanbanTitleSize = fontPx($('.kanban-column .card-title'));
  check(view === 3 && rootSize('kanban') === '1' && data.settings.fontSizes.kanban === 100, 'Leaving without saving keeps the previous text sizes');
  view = 4; render();
  await setFontSize('kanban', 120);
  $('#save-settings-inline').click();
  await waitFor(() => data.settings.fontSizes.kanban === 120 && !saving);
  check((await workspaceApi.load()).data.settings.fontSizes.kanban === 120 && rootSize('kanban') === '1.2' && $('#unsaved-banner').hidden, "Text sizes are saved per organization");
  view = 3; render();
  check(Math.abs(fontPx($('.kanban-column .card-title')) - kanbanTitleSize * 1.2) < 0.1, 'Kanban is enlarged after saving');
  view = 0; render();
  check(Math.abs(fontPx($('#task-rows .code-link')) - tableSampleSize) < 0.05, "Tables remain unchanged and match the preview");
  let invalidSizesRejected = false;
  const invalidSizes = structuredClone(data);
  invalidSizes.settings.fontSizes.tables = 500;
  try { await workspaceApi.save(invalidSizes, activeOrganizationId, undefined, revision); } catch (error) { invalidSizesRejected = error.message.includes("Invalid text sizes."); }
  check(invalidSizesRejected && (await workspaceApi.load()).data.settings.fontSizes.tables === 100, 'Out-of-range text sizes are rejected by the archive');
  view = 4; render();
  const sampleCode = data.tasks.find(task => task.code.trim()).code.trim();
  const setTemplate = async value => { $('#portal-url-template').value = value; $('#portal-url-template').dispatchEvent(new Event('input', { bubbles: true })); await new Promise(resolve => setTimeout(resolve)); };
  const savedTemplate = data.settings.portalUrlTemplate;
  await setTemplate('https://jira.smoke.test/browse/');
  check($('#portal-preview').classList.contains('invalid') && $('#portal-preview').textContent.includes(t("{code}")), 'Link template without a placeholder is flagged');
  showSettingsTab('themes');
  $('#save-settings-inline').click();
  await waitFor(() => $('#toast').textContent.includes(t("The portal link template must be a valid web address containing {code}.")) && !saving);
  check(data.settings.portalUrlTemplate === savedTemplate && !$('#unsaved-banner').hidden, 'Invalid link template is not saved');
  check(settingsTab === 'portal' && visibleSettingsPanels().join() === 'portal' && !$('#settings-tab-portal .settings-tab-dot').hidden, 'Save error opens the tab containing the field to fix');
  await setTemplate("jira.smoke.test/browse/{code}");
  check($('#portal-preview a[data-open-url]').getAttribute('href') === `https://jira.smoke.test/browse/${encodeURIComponent(sampleCode)}` && !$('#unsaved-banner').hidden, 'Link template preview automatically adds https://');
  $('#portal-preview a[data-open-url]').click();
  await waitFor(() => lastOpenedLink === `https://jira.smoke.test/browse/${encodeURIComponent(sampleCode)}`);
  check(location.protocol === 'file:' && view === 4, 'Preview link opens in the default browser without navigating the app');
  $('#organization-name').value = 'Test workspace';
  document.querySelector('[data-tab-name="2"]').value = 'Custom roadmap';
  settingsDraft.statuses.reverse();
  showSettingsTab('themes');
  $('#add-theme').click();
  $('#theme-name').value = 'Test theme';
  $('#theme-name').dispatchEvent(new Event('input'));
  pickColor(document.querySelector('[data-theme-color="accent"]'), '#ff8844');
  check([...document.querySelectorAll('.theme-swatches')].every(swatches => swatches.children.length === 4), "Theme previews show all four colors");
  check(document.querySelector(`.theme-choice.chosen [aria-label="${t("Accent")}: #ff8844"]`), 'Preview updates immediately from the color picker');
  const paletteImage = async colors => {
    const source = document.createElement('canvas');
    source.width = colors.length * 10; source.height = 10;
    const context = source.getContext('2d');
    for (const [index, color] of colors.entries()) {
      context.fillStyle = color; context.fillRect(index * 10, 0, 10, 10);
    }
    return { source, context, blob: await new Promise(resolve => source.toBlob(resolve, 'image/png')) };
  };
  const loadPaletteImage = async (blob, name) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type: 'image/png' }));
    $('#theme-image-file').files = transfer.files;
    $('#theme-image-file').dispatchEvent(new Event('change'));
    await waitFor(() => !$('#theme-image-canvas').hidden && !$('#theme-image-file').disabled);
  };
  const lowContrastColors = ['#1c1c22', '#26262e', '#4a4a55', '#3a2f6a'];
  await loadPaletteImage((await paletteImage(lowContrastColors)).blob, 'low-contrast.png');
  const lowContrast = Object.fromEntries(themeFields.map(([key]) => [key, document.querySelector(`[data-theme-color="${key}"]`).value]));
  const { contrastRatio, WCAG_TEXT_CONTRAST, WCAG_GRAPHIC_CONTRAST } = window.OrbitaCore;
  check(lowContrastColors.includes(lowContrast.background) && contrastRatio(lowContrast.text, lowContrast.background) >= WCAG_TEXT_CONTRAST && contrastRatio(lowContrast.text, lowContrast.surface) >= WCAG_TEXT_CONTRAST && contrastRatio(lowContrast.accent, lowContrast.background) >= WCAG_GRAPHIC_CONTRAST && $('#theme-image-result').textContent.includes(fillText("Adjusted as little as possible for WCAG AA contrast: {0}.", '').slice(0, -2)), 'Low-contrast image colors are adjusted to WCAG AA and the change is reported');
  const { source: imageSource, context: imageContext, blob: imageBlob } = await paletteImage(['#101820', '#303848', '#f0f4fc', '#d06090']);
  await loadPaletteImage(imageBlob, 'palette-test.png');
  const generated = { background: '#101820', surface: '#303848', text: '#f0f4fc', accent: '#d06090' };
  for (const [key, label] of themeFields) {
    check(document.querySelector(`[data-theme-color="${key}"]`).value === generated[key], `Image loading assigns ${key} automatically`);
    check(document.querySelector(`.theme-choice.chosen [aria-label="${t(label)}: ${generated[key]}"]`), `Automatic preview is synchronized for ${key}`);
  }
  check($('#theme-image-result').textContent.includes(t("four colors assigned automatically.")) && $('#theme-image-result').textContent.includes(t("The extracted colors already meet WCAG AA contrast.")), 'All four colors are extracted without manual clicks and compliant colors stay unchanged');
  settingsDraft.themes.push({ id: uid(), name: 'Automatic palette', ...generated });
  const canvas = $('#theme-image-canvas');
  const bounds = canvas.getBoundingClientRect();
  for (const [key] of themeFields) {
    $('#theme-image-target').value = key;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: bounds.left + bounds.width * (key === 'text' ? 0.625 : 0.125), clientY: bounds.top + bounds.height / 2 }));
    const expected = key === 'text' ? '#f0f4fc' : '#101820';
    check(document.querySelector(`[data-theme-color="${key}"]`).value === expected, `Image picker assigns the exact color to ${key}`);
    check(document.querySelector(`.theme-choice.chosen [aria-label="${t(themeFields.find(([field]) => field === key)[1])}: ${expected}"]`), `Preview is synchronized after picking ${key}`);
  }
  let invalidImageRejected = false;
  try { await loadThemeImage(new File(['invalid'], 'invalid.png', { type: 'image/png' }), canvas); } catch { invalidImageRejected = true; }
  check(invalidImageRejected, 'Unreadable image is explicitly rejected');
  let oversizedImageRejected = false;
  try { await loadThemeImage(new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), canvas); } catch { oversizedImageRejected = true; }
  check(oversizedImageRejected, 'Image size limit is enforced');
  document.querySelector('[data-theme-color="accent"]').value = '#ff8844';
  document.querySelector('[data-theme-color="accent"]').dispatchEvent(new Event('input'));
  check(accent() === '#ff8844' && !$('#unsaved-banner').hidden, 'Custom theme is previewed before saving');
  $('#save-settings-inline').click();
  const organizationName = () => organizations.find(o => o.id === activeOrganizationId).name;
  await waitFor(() => organizationName() === 'Test workspace' && !saving);
  check(view === 4 && $('#unsaved-banner').hidden && accent() === '#ff8844', 'Saving from the warning applies the theme and removes the warning');
  check(data.settings.portalUrlTemplate === "https://jira.smoke.test/browse/{code}" && (await workspaceApi.load()).data.settings.portalUrlTemplate === data.settings.portalUrlTemplate, "Portal link template is saved per organization");
  view = 0; showHidden = true; render();
  const generatedSmokeLink = 'https://jira.smoke.test/browse/SMOKE-1', overrideLink = 'https://other.portal.example/ticket/SMOKE-1';
  const listLink = document.querySelector(`#task-rows a[data-open-url][href="${generatedSmokeLink}"]`);
  check(listLink && data.tasks.find(t => t.code === 'SMOKE-1').url === '', "Template generates a link for tasks without a specific link");
  listLink.click();
  await waitFor(() => lastOpenedLink === generatedSmokeLink);
  check(location.protocol === 'file:' && view === 0, 'List link opens in the default browser');
  let unsafeLinkRejected = false;
  try { await workspaceApi.openLink('javascript:alert(1)'); } catch { unsafeLinkRejected = true; }
  check(unsafeLinkRejected, 'Non-web addresses are rejected');
  taskDialog(data.tasks.find(t => t.code === 'SMOKE-1'));
  check($('#portal-link-preview a').getAttribute('href') === generatedSmokeLink && $('#task-url').placeholder === generatedSmokeLink && !$('#task-url').required, 'Dialog displays the link generated from the code');
  $('#task-url').value = 'other.portal.example/ticket/SMOKE-1';
  $('#task-url').dispatchEvent(new Event('input'));
  check($('#portal-link-preview a').getAttribute('href') === overrideLink, "Specific link is normalized in the preview");
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.find(t => t.code === 'SMOKE-1').url === overrideLink && !saving);
  check(document.querySelector(`#task-rows a[href="${overrideLink}"]`) && !document.querySelector(`#task-rows a[href="${generatedSmokeLink}"]`), "Specific link takes precedence over the template");
  taskDialog(data.tasks.find(t => t.code === 'SMOKE-1'));
  $('#task-url').value = '';
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.find(t => t.code === 'SMOKE-1').url === '' && !saving);
  check(document.querySelector(`#task-rows a[href="${generatedSmokeLink}"]`), 'Without a specific link, the template link is used');
  view = 2; render();
  check(document.querySelector(`.milestone-column a.card-portal-link[href="${generatedSmokeLink}"]`), "Portal link can be opened from milestones");
  view = 3; render();
  check(document.querySelector(`.kanban-column a.card-portal-link[href="${generatedSmokeLink}"]`) && !document.querySelector('.kanban-board button'), "Portal link appears in kanban without editing controls");
  check(organizationName() === 'Test workspace' && document.title === APP_NAME && $('#brand-name').textContent === APP_NAME && !$('#app-name'), "Organization name is editable while the OrbitKanban identity stays fixed");
  check(data.settings.tabNames[2] === 'Custom roadmap' && data.settings.themes.some(t => t.name === 'Test theme' && t.accent === '#ff8844'), 'Tab names and user theme are saved');
  const savedTheme = (await workspaceApi.load()).data.settings.themes.find(t => t.name === 'Test theme');
  check(savedTheme.background === '#101820' && savedTheme.surface === '#101820' && savedTheme.text === '#f0f4fc', 'Colors extracted from an image persist on disk');
  check((await workspaceApi.load()).data.settings.themes.some(t => t.name === 'Automatic palette' && themeFields.every(([key]) => t[key] === generated[key])), 'Entire automatic palette is preserved on disk');
  view = 3; render();
  check(document.querySelector('.kanban-heading').textContent.includes(data.settings.statuses[0].name), 'Kanban order follows settings');
  check(sanitize('<img src=x onerror=alert(1)><p onclick="x()">ok<script>x()</script></p>') === '<p>ok</p>', 'Rich text is sanitized');
  check(plain('<p>First</p><p>Second<br>Third</p>') === 'First Second Third', 'Rich-text previews preserve word spacing');
  const previewSource = `<p>Preview ${uid()}<script>hidden</script></p>`;
  const parseDocument = DOMParser.prototype.parseFromString;
  let previewParses = 0, cachedPreview;
  try {
    DOMParser.prototype.parseFromString = function (...args) { previewParses++; return parseDocument.apply(this, args); };
    cachedPreview = plain(previewSource);
    plain(previewSource);
    plain(previewSource + '<p>Edited</p>');
  } finally { DOMParser.prototype.parseFromString = parseDocument; }
  check(previewParses === 2 && !cachedPreview.includes('hidden') && plain(previewSource + '<p>Edited</p>').endsWith('Edited'), 'Preview cache avoids repeated parsing without reusing stale or unsanitized text');
  const formatterLanguage = data.settings.language;
  try {
    for (const language of ['en', 'it', 'en']) {
      data.settings.language = language;
      check(formatDate('2026-11-02') === new Date('2026-11-02T12:00:00').toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }), `Date formatter is reused in the ${language} language`);
    }
  } finally { data.settings.language = formatterLanguage; }
  const firstOrganizationId = activeOrganizationId;
  const firstSettings = structuredClone(data.settings);
  const firstOrganizationName = organizationName();
  check(organizations.length === 1 && $('#organization-select').options.length === 1, "Previous archive is migrated into a single organization");
  $('#manage-organizations').click();
  const createForm = $('#create-organization');
  createForm.elements.name.value = "Second organization";
  const upload = new DataTransfer();
  upload.items.add(new File([imageBlob], 'logo.png', { type: 'image/png' }));
  $('#create-logo-file').files = upload.files;
  $('#create-logo-file').dispatchEvent(new Event('change'));
  await waitFor(() => Boolean($('#create-logo-preview img')) && !$('#create-logo-file').disabled);
  const creationLogo = $('#create-logo-preview img').src;
  check($('#create-logo-preview .theme-swatches').children.length === 4 && view === 4, "New organization is created in Settings with a logo and four-color preview");
  check(settingsTab === 'organizations' && visibleSettingsPanels().join() === 'organizations', 'Organization management opens its tab directly');
  createForm.requestSubmit();
  await waitFor(() => activeOrganizationId !== firstOrganizationId && !organizationBusy);
  const secondOrganizationId = activeOrganizationId;
  check(data.tasks.length === 0 && data.issues.length === 0 && data.settings.logo === creationLogo, "New organization is created with its own logo and data in one save");
  check($('.brand-icon img').src === creationLogo && $('#brand-name').textContent === APP_NAME, "Organization logo appears immediately without renaming the app");
  view = 4; render();
  check(settingsDraft.themeId === 'organization-logo' && themeFields.every(([key]) => settingsDraft.themes.find(theme => theme.id === 'organization-logo')[key] === generated[key]), 'Logo automatically generates a dedicated theme with four colors');
  const secondLogo = settingsDraft.logo;
  showSettingsTab('languages');
  const languagePanel = () => $('#languages-panel').textContent;
  check(visibleSettingsPanels().join() === 'languages' && [...$('#language').options].map(option => option.value).join() === 'de,en,it' && $('#language').value === 'it' && $('#language-missing').hidden, 'Language tab shows built-in languages and languages added from files');
  check(['Deutsch', t("Added from file"), t("Built-in"), t("Add a language"), 'en.template.json', t("Open languages folder"), t("Reload languages")].every(text => languagePanel().includes(text)) && $('#languages-folder').textContent.endsWith('languages'), "Language list, instructions, and folder are visible");
  check($('.language-errors') && $('.language-errors').textContent.includes('broken.json') && $('.language-errors').textContent.includes(t("Invalid JSON file.")), 'Invalid language files are reported without blocking the app');
  check(languageOptions('fr').includes(fillText("{0} (not installed)", 'fr')) && !$('#identity-panel #language'), 'Uninstalled language is indicated and the selector is moved to the Languages tab');
  await $('#open-languages-folder').onclick();
  check(languageInfo.template.endsWith('en.template.json') && languageInfo.errors.length === 1, "Languages folder is prepared with the English template");
  $('#language').value = 'de';
  $('#language').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  check(!$('#settings-tab-languages .settings-tab-dot').hidden && $('#settings-tab-identity .settings-tab-dot').hidden && $('#language-missing').hidden, 'Language change is flagged on the Languages tab');
  $('#save-settings').click();
  await waitFor(() => data.settings.language === 'de' && !saving);
  check(document.documentElement.lang === 'de' && $('#current-tab').textContent === 'Einstellungen' && $('#save-settings').textContent === 'Einstellungen speichern' && $('#manage-organizations').textContent === 'Manage organizations' && $('#theme-count').textContent.endsWith('themes'), 'Language added from a file uses English for missing strings');
  await $('#reload-languages').onclick();
  check($('#toast').textContent === 'Languages reloaded.' && $('#language').value === 'de' && $('#current-tab').textContent === 'Einstellungen' && settingsTab === 'languages', "Reloading languages updates the tab without losing the selection");
  $('#language').value = 'en';
  $('#organization-name').value = 'English workspace';
  $('#save-settings').click();
  await waitFor(() => data.settings.language === 'en' && !saving);
  check(document.documentElement.lang === 'en' && $('#current-tab').textContent === 'Settings' && $('#save-settings').textContent === 'Save settings', 'English selector translates settings and navigation');
  check($('#content').textContent.includes('Organization logo') && $('#content').textContent.includes('Interface language') && !$('#content').textContent.includes(window.OrbitaI18n.translate("Identity & navigation", 'it')), "Settings, logo, and language are translated into English");
  check($('.settings-nav').getAttribute('aria-label') === 'Settings sections' && ['Appearance', 'Themes & atmosphere', "Data & access"].every(text => $('.settings-nav').textContent.includes(text)) && $('#theme-search').placeholder === 'Search themes…' && $('#theme-count').textContent.endsWith('themes'), "Settings tabs and theme gallery are translated into English");
  check($('#portal-panel').textContent.includes('Link template') && $('#portal-panel').textContent.includes('{code}') && !$('#portal-panel').textContent.includes(window.OrbitaI18n.translate("{code}", 'it')) && $('#portal-url-template').placeholder.endsWith('{code}'), 'Portal link section is translated into English');
  check($('.brand-icon img').src === secondLogo && document.documentElement.style.getPropertyValue('--accent') === generated.accent, "Active organization’s logo and theme appear in the sidebar");
  check([...document.querySelectorAll('.theme-swatches')].every(swatches => swatches.children.length === 4) && document.querySelector('.theme-choice.chosen [aria-label="Text: #f0f4fc"]'), 'Four colors and their labels are translated');
  view = 0; render();
  check($('#new-task').textContent.includes('New task') && $('#search').placeholder.startsWith('Search'), "Task list and search are translated");
  check($('.highlighter-label').textContent.includes('Highlighter') && $('#columns-button').textContent.includes('Columns') && $('#highlight-filter').options[0].textContent === 'All highlights' && $('.activity-table th[data-column="description"] .column-heading > span').textContent === 'Description', "Highlighter and columns are translated into English");
  check($('#saved-view-select').options[0].textContent === 'Choose a view…' && [...$('#saved-view-select').querySelectorAll('optgroup')].every(group => ['Saved views', 'Upcoming releases', 'Past releases'].includes(group.label)), 'View menu and release groups are translated into English');
  columnFilterDialog('releaseDate', 'tasks');
  check($('#column-filter-form legend').textContent === 'Dates in the list' && $('#column-filter-form .date-filter-option').textContent.includes('Unassigned') && $('#column-filter-form [data-check-dates="all"]').textContent === 'Select all' && $('#column-filter-form .filter-note').textContent.startsWith('Ticked dates') && $('#column-filter-form').textContent.includes('From'), 'Date filter is translated into English with Unassigned');
  $('#modal').close();
  openSavedViews();
  check($('#modal-content h2').textContent === 'Saved views' && $('#modal-content .filter-note').textContent.startsWith("A view for every release date"), "Saved views and release-view note are in English");
  $('#modal').close();
  taskDialog();
  check($('#task-form').textContent.includes('Portal code') && $('#task-form').textContent.includes('Effort in days') && $('#task-form').textContent.includes('1 day'), "Task dialog, editor, and units are in English");
  check(data.settings.tags.length === 0 && !$('.tag-choice') && !$('.task-tags'), "Tag catalog is isolated and selector is absent from the task tab");
  $('#task-form').elements.code.value = 'SMOKE-1';
  $('#description-editor').innerHTML = "<p>Custom tasks</p>";
  $('#task-form').elements.days.value = '1';
  $('#task-form').requestSubmit();
  await waitFor(() => data.tasks.length === 1 && !saving);
  check(data.tasks[0].code === 'SMOKE-1' && matchIssues(data.tasks[0], data.issues).incidents.length === 0, "Matching codes across organizations do not share issues");
  check(data.settings.portalUrlTemplate === '' && !document.querySelector('#task-rows a[data-open-url]'), "Link template is separate for each organization");
  check($('#task-rows').textContent.includes("Custom tasks") && effort(data.tasks[0].effortHours) === '1d', 'User content is preserved and effort is localized');
  $('.task-tags-button').click();
  check($('#tag-menu').textContent.includes('No tags available. Add them in Settings'), 'Dropdown without a catalog shows instructions in English');
  closeTagMenu();
  view = 1; render(); issueDialog();
  check($('#issue-form').textContent.includes('Save association') && $('.page-heading p').textContent.startsWith('Connect work to its origin.'), 'Issue view and dialog are translated into English');
  $('#modal').close();
  view = 2; render();
  check($('#content').textContent.includes('Unscheduled') && $('.page-heading p').textContent.startsWith('Every release is a milestone.'), "Milestones and missing date are translated");
  view = 3; render();
  check($('#content').textContent.includes('Read only') && !document.querySelector('.kanban-board button'), 'Kanban remains read-only in English');
  view = 4; render();
  $('#organization-name').value = 'Unsaved name';
  const selectOrganization = id => { $('#organization-select').value = id; $('#organization-select').dispatchEvent(new Event('change')); };
  selectOrganization(firstOrganizationId);
  check($('#modal').open && $('#save-switch') && activeOrganizationId === secondOrganizationId, "Organization change protects unsaved changes");
  $('#modal [data-close]').click();
  check(activeOrganizationId === secondOrganizationId && $('#organization-name').value === 'Unsaved name', 'Canceling the organization change preserves edits');
  selectOrganization(firstOrganizationId);
  $('#discard-switch').click();
  await waitFor(() => activeOrganizationId === firstOrganizationId && !organizationBusy);
  check(data.tasks.length === initialTaskCount + 1 && data.issues.some(issue => issue.incident === 'INC-SMOKE') && organizationName() === firstOrganizationName, "Returning to the first organization preserves tasks, associations, and settings");
  check(document.documentElement.lang === 'it' && $('.brand-icon img').getAttribute('src') === 'app-logo.svg' && document.documentElement.style.getPropertyValue('--accent') === firstSettings.themes.find(theme => theme.id === firstSettings.themeId).accent, "Language and theme are per organization, with the app logo as fallback");
  imageContext.fillStyle = '#22cc88'; imageContext.fillRect(30, 0, 10, 10);
  const firstLogoBlob = await new Promise(resolve => imageSource.toBlob(resolve, 'image/png'));
  const firstLogoUpload = new DataTransfer();
  firstLogoUpload.items.add(new File([firstLogoBlob], 'first-logo.png', { type: 'image/png' }));
  $('#logo-file').files = firstLogoUpload.files;
  $('#logo-file').dispatchEvent(new Event('change'));
  await waitFor(() => Boolean(settingsDraft.logo) && !$('#logo-file').disabled);
  $('#organization-name').value = "First organization with logo";
  selectOrganization(secondOrganizationId);
  $('#save-switch').click();
  await waitFor(() => activeOrganizationId === secondOrganizationId && !organizationBusy);
  check(organizationName() === 'English workspace' && data.settings.logo === secondLogo && document.documentElement.lang === 'en', "Save and switch preserves language and logo separately for each organization");
  let staleSaveRejected = false;
  try { await workspaceApi.save(structuredClone(data), firstOrganizationId); } catch { staleSaveRejected = true; }
  const snapshotAfterRejection = await workspaceApi.load();
  check(staleSaveRejected && snapshotAfterRejection.organizations.find(o => o.id === snapshotAfterRejection.activeOrganizationId).name === 'English workspace', "Save for a stale organization is rejected without contaminating data");
  $('#manage-organizations').click();
  $('#organization-name').value = 'Second renamed';
  $('#save-settings').click();
  await waitFor(() => organizations.some(o => o.name === 'Second renamed') && !saving);
  check($('#organization-select').selectedOptions[0].textContent === 'Second renamed', "Renaming an organization updates the menu");
  $('#manage-organizations').click();
  $('#create-organization').elements.name.value = 'Temporary';
  $('#create-organization').requestSubmit();
  await waitFor(() => organizations.length === 3 && !organizationBusy);
  check(data.settings.language === 'en' && data.settings.tabNames[0] === 'Tasks', "New organization inherits the language and localized default names");
  $('#manage-organizations').click();
  $('#delete-organization').click();
  $('#confirm-action').click();
  await waitFor(() => organizations.length === 2 && !organizationBusy);
  check(!organizations.some(o => o.name === 'Temporary'), "Deleting an organization is confirmed without affecting the others");
  const finalSnapshot = await workspaceApi.load();
  check(finalSnapshot.organizations.length === 2 && finalSnapshot.data.settings.logo.startsWith('data:image/png;base64,'), "Organizations and embedded logo persist on disk");
  await organizationAction('switch', { id: firstOrganizationId });
  check(data.settings.logo !== secondLogo && organizationName() === "First organization with logo", "Each organization retains a distinct logo after repeated switches");
  check(document.title === APP_NAME && $('#brand-name').textContent === APP_NAME && data.settings.appName === undefined, "OrbitKanban name stays fixed regardless of organization or language");
  view = 4; render();
  check($('#browser-panel') && /^http:\/\/127\.0\.0\.1:\d+\/$/.test($('#browser-url').textContent) && !$('#browser-open').disabled && !$('#browser-copy').disabled, 'Browser access section shows a local address');
  check(!$('#open-browser').disabled && $('#open-browser').textContent.includes(t("Open in browser")) && /^\d+\.\d+\.\d+$/.test(appVersion) && $('#app-version').textContent === `v${appVersion}`, 'Browser button and app version are visible');
  check((await workspaceApi.browserAccess('info', activeOrganizationId)).url === browserUrl, 'Browser address matches the app');
  $('#open-browser').click();
  await waitFor(() => $('#toast').textContent.includes(t("Organization opened in the default browser.")));
  check(location.protocol === 'file:', "Organization opens in the default browser without navigating the app");
  check($('#create-organization [name="demo"]') && !$('#create-organization [name="demo"]').checked, "Demo data option appears when creating an organization");
  view = 0; showHidden = true; render();
  const remoteBase = await workspaceApi.load(activeOrganizationId);
  remoteBase.data.tasks.push({ ...structuredClone(remoteBase.data.tasks[0]), id: uid(), code: 'REMOTE-1', sequence: 9001, hidden: false, notes: '' });
  const remoteSaved = await workspaceApi.save(remoteBase.data, activeOrganizationId, undefined, remoteBase.revision);
  await waitFor(() => revision === remoteSaved.revision && !refreshing);
  check(data.tasks.some(t => t.code === 'REMOTE-1') && $('#task-rows').textContent.includes('REMOTE-1'), 'Changes from another window synchronize in real time');
  const staleRevision = revision;
  const external = await workspaceApi.load(activeOrganizationId);
  external.data.tasks.find(t => t.code === 'REMOTE-1').notes = '<p>Remote note</p>';
  const externalSaved = await workspaceApi.save(external.data, activeOrganizationId, undefined, external.revision);
  await waitFor(() => revision === externalSaved.revision && !refreshing);
  revision = staleRevision;
  let conflictCode = '';
  try { await commit(structuredClone(data)); } catch (error) { conflictCode = error.code; }
  check(conflictCode === 'conflict', "Save using a stale revision is rejected as a conflict");
  await commit(next => { next.tasks.find(t => t.code === 'REMOTE-1').hidden = true; });
  const merged = await workspaceApi.load(activeOrganizationId);
  const mergedTask = merged.data.tasks.find(t => t.code === 'REMOTE-1');
  check(mergedTask.hidden && mergedTask.notes === '<p>Remote note</p>' && revision === merged.revision, 'Conflict is resolved by reapplying the change without losing the remote update');
  view = 4; render();
  $('#organization-name').value = 'Local draft';
  $('#organization-name').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve));
  const draftBase = await workspaceApi.load(activeOrganizationId);
  draftBase.data.tasks.find(t => t.code === 'REMOTE-1').code = 'REMOTE-2';
  const draftSaved = await workspaceApi.save(draftBase.data, activeOrganizationId, undefined, draftBase.revision);
  await waitFor(() => revision === draftSaved.revision && !refreshing);
  check(view === 4 && $('#organization-name').value === 'Local draft' && !$('#unsaved-banner').hidden && data.tasks.some(t => t.code === 'REMOTE-2'), 'Remote update preserves unsaved settings');
  $('#discard-settings').click();
  check($('#organization-name').value === organizationName() && $('#unsaved-banner').hidden, 'Draft is discarded after synchronization');
  const originalOrganizationId = activeOrganizationId;
  const created = await workspaceApi.organization('create', { name: "Remote organization", language: 'it', demo: true }, 'external-client');
  await waitFor(() => organizations.length === 3 && !refreshing);
  check(activeOrganizationId === originalOrganizationId && $('#organization-select').options.length === 3 && created.data.tasks.length > 200 && created.data.issues.length > 0, "Organization created elsewhere with demo data appears without changing the view");
  await organizationAction('switch', { id: created.activeOrganizationId });
  check(activeOrganizationId === created.activeOrganizationId && visibleTasks().length < data.tasks.length && data.tasks.some(t => t.hidden), "Demo organization can be opened");
  await workspaceApi.organization('delete', { id: created.activeOrganizationId }, 'external-client');
  await waitFor(() => activeOrganizationId !== created.activeOrganizationId && organizations.length === 2 && !refreshing);
  check(organizations.some(o => o.id === activeOrganizationId) && $('#toast').textContent.includes(t("The open organization was deleted in another window. You are now viewing another organization.")), "Organization deleted elsewhere is handled without losing the session");
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
  check($('#transfer-panel') && document.querySelectorAll('#transfer-panel [data-export-kind]').length === 4 && $('#organization-file').type === 'file' && $('#transfer-panel').textContent.includes(t("Export settings")), "Organization export and import section appears in Settings");
  $('#organization-name').value = 'Export draft';
  $('#organization-name').dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-export-kind="themes"]').click();
  await waitFor(() => $('#modal').open && $('#discard-switch'));
  check($('#modal-content').textContent.includes(t("You have unsaved changes: export and import use the saved settings. Save or discard them before continuing.")) && $('#discard-switch').textContent === t("Discard and continue") && $('#save-switch').textContent === t("Save and continue"), 'Export with unsaved settings asks whether to save or discard them');
  $('#discard-switch').click();
  await waitFor(() => $('#toast').textContent.includes(t("Themes exported:")));
  check(!$('#modal').open && $('#organization-name').value === organizationName() && $('#unsaved-banner').hidden && new RegExp(`OrbitKanban-[a-z0-9-]+-${term("themes")}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test($('#toast').textContent), "Draft is discarded and themes are exported to a separate file");
  for (const [kind, label] of [['settings', "settings"], ['data', "data"], ['organization', "organization"]]) {
    const localizedLabel = term(label);
    document.querySelector(`[data-export-kind="${kind}"]`).click();
    await waitFor(() => new RegExp(`-${localizedLabel}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test($('#toast').textContent));
  }
  check($('#toast').textContent.startsWith(t("Organization exported:")) && !$('#modal').open, "Settings, data, and full organization are exported to separate files");
  chooseImportFile('{ not json', 'broken.json');
  await waitFor(() => $('#toast').classList.contains('error') && $('#toast').textContent.includes(t("The selected file is not a valid JSON file.")));
  chooseImportFile({ version: 2, activeOrganizationId: 'x', organizations: [{ id: 'x', name: 'Backup', data: {} }] }, 'backup.json');
  await waitFor(() => $('#toast').textContent.includes(t("This file is a full archive backup: use “Import backup” in the “Data that travels with you” section.")));
  check(!$('#modal').open, 'Invalid files and full backups are rejected with a clear message');
  const importSource = baseData('en');
  importSource.settings.statuses[1].name = data.settings.statuses[2].name;
  importSource.tasks = [
    { id: 'smoke-import-1', code: 'IMPORT-1', sequence: 8001, url: '', description: "<p>Imported task</p>", notes: '', releaseDate: '2026-03-04', statusId: importSource.settings.statuses[1].id, urgencyId: importSource.settings.urgencies[0].id, effortHours: 4, hidden: false },
    { id: 'smoke-import-2', code: 'IMPORT-2', sequence: 8002, url: '', description: '', notes: '', releaseDate: '', statusId: importSource.settings.statuses[3].id, urgencyId: importSource.settings.urgencies[3].id, effortHours: 0, hidden: false }
  ];
  importSource.issues = [{ id: 'smoke-import-issue', code: 'IMPORT-1', incident: 'INC-IMPORT', problem: 'PRB-IMPORT' }];
  const dataFile = organizationExport({ name: 'External source', data: importSource }, 'data', { appVersion: '9.9.9' });
  const sameName = name => option => option.name.trim().toLowerCase() === name.trim().toLowerCase();
  const expectedNamedStatus = data.settings.statuses.find(sameName(data.settings.statuses[2].name)).id;
  const expectedPositionStatus = (data.settings.statuses.find(sameName('Done')) || data.settings.statuses[Math.min(3, data.settings.statuses.length - 1)]).id;
  const expectedPositionUrgency = (data.settings.urgencies.find(sameName('Low')) || data.settings.urgencies[Math.min(3, data.settings.urgencies.length - 1)]).id;
  chooseImportFile(dataFile, "data.json");
  await waitFor(importDialogOpen);
  const dataForm = $('#organization-import-form');
  check(!dataForm.elements.themes && !dataForm.elements.settings && dataForm.elements.data.checked && dataForm.elements.destination.value === 'current' && $('#import-name-field').hidden && dataForm.textContent.includes('External source') && dataForm.textContent.includes('v9.9.9') && dataForm.textContent.includes(plural(dataFile.data.tasks.length, "tasks")), 'Import dialog shows source, version, and only the parts present in the file');
  const tasksBeforeImport = data.tasks.length;
  dataForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.tasks.some(t => t.id === 'smoke-import-2'));
  const importedFirst = data.tasks.find(t => t.id === 'smoke-import-1'), importedSecond = data.tasks.find(t => t.id === 'smoke-import-2');
  check(data.tasks.length === tasksBeforeImport + 2 && importedFirst.statusId === expectedNamedStatus && importedSecond.statusId === expectedPositionStatus && importedSecond.urgencyId === expectedPositionUrgency && matchIssues(importedFirst, data.issues).incidents.includes('INC-IMPORT') && data.tasks.some(t => t.code === 'SMOKE-1') && $('#toast').textContent.includes(t("Import completed.")), "Data is merged into the organization with statuses and priorities matched by name or position");
  const countsBeforeReimport = [data.tasks.length, data.issues.length];
  chooseImportFile(dataFile, "data.json");
  await waitFor(importDialogOpen);
  $('#organization-import-form').requestSubmit();
  await waitFor(() => !$('#modal').open && !saving);
  check(data.tasks.length === countsBeforeReimport[0] && data.issues.length === countsBeforeReimport[1], "Reimporting the same file updates without duplicating tasks or issues");
  const themesBeforeImport = data.settings.themes.length;
  chooseImportFile({ format: 'orbitkanban-organization', version: 1, kind: 'themes', exportedAt: new Date().toISOString(), appVersion, organization: { name: 'Shared palette' }, themes: { themeId: 'smoke-imported-theme', themes: [{ id: 'smoke-imported-theme', name: 'Imported theme', background: '#14121f', surface: '#1f1b30', text: '#f4f1ff', accent: '#ff7a59', extra: 'ignored' }] } }, "themes.json");
  await waitFor(importDialogOpen);
  const themeForm = $('#organization-import-form');
  check(themeForm.elements.themes.checked && themeForm.elements.activateTheme.checked && !themeForm.elements.data && themeForm.textContent.includes(fillText("Activate the “{0}” theme", 'Imported theme')) && themeForm.querySelectorAll('.import-sub .theme-swatches i').length === 4, "Theme import offers to activate the file’s theme with its four colors");
  themeForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.settings.themeId === 'smoke-imported-theme');
  check(data.settings.themes.length === themesBeforeImport + 1 && data.settings.themes.find(theme => theme.id === 'smoke-imported-theme').extra === undefined && document.documentElement.style.getPropertyValue('--accent') === '#ff7a59', 'Imported theme is added, activated, and applied without unrelated fields');
  const fullFile = organizationExport({ name: organizationName(), data }, 'organization', { appVersion });
  check(fullFile.settings.fontSizes.kanban === 120 && fullFile.settings.fontSizes.tables === 100, 'Full export includes text sizes');
  const expectedImportedName = `${organizationName()} (2)`;
  chooseImportFile(fullFile, "organization.json");
  await waitFor(importDialogOpen);
  const fullForm = $('#organization-import-form');
  check(['themes', 'settings', 'data'].every(part => fullForm.elements[part].checked) && fullForm.elements.destination.value === 'new' && fullForm.elements.name.value === expectedImportedName && !$('#import-name-field').hidden && fullForm.elements.logo.checked && fullForm.elements.logo.disabled && $('#import-data-mode').hidden && $('#confirm-import').textContent === t("Create and import"), "Full organization is offered as a new organization with a unique name and logo");
  fullForm.querySelector('[name="destination"][value="current"]').click();
  check(!fullForm.elements.logo.checked && !fullForm.elements.logo.disabled && !$('#import-data-mode').hidden && $('#import-name-field').hidden && $('#import-notes').textContent.includes(t("The current settings will be replaced: existing tasks are kept and mapped to the file’s statuses and urgencies with the same name, otherwise to the same position.")), "When importing into the current organization, its logo is replaced only on request");
  fullForm.querySelector('[name="destination"][value="new"]').click();
  const organizationsBeforeImport = organizations.length;
  fullForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !organizationBusy && organizations.length === organizationsBeforeImport + 1);
  const importedOrganizationId = activeOrganizationId;
  check(importedOrganizationId !== firstOrganizationId && organizationName() === expectedImportedName && data.tasks.length === fullFile.data.tasks.length && data.issues.length === fullFile.data.issues.length && data.settings.logo === fullFile.settings.logo && data.settings.themeId === fullFile.themes.themeId && $('.brand-icon img').src === fullFile.settings.logo && $('#toast').textContent.includes(t("Organization imported.")), "Full organization is imported as new with data, themes, logo, and settings");
  check(data.settings.fontSizes.kanban === 120 && rootSize('kanban') === '1.2', "Text sizes are imported with the full organization");
  const settingsSource = baseData('en');
  settingsSource.settings.statuses = [{ id: 'smoke-status-a', name: data.settings.statuses[0].name.toUpperCase(), color: '#3366ff', highlight: false }, { id: 'smoke-status-b', name: 'Shipped', color: '#33aa66', highlight: true }];
  settingsSource.settings.tabNames = ['Imported tasks', 'Imported issues', 'Imported milestones', 'Imported board'];
  settingsSource.settings.portalUrlTemplate = "https://imported.example.com/browse/{code}";
  settingsSource.settings.logo = secondLogo;
  settingsSource.settings.fontSizes.tables = 110;
  const settingsFile = organizationExport({ name: 'Remote settings', data: settingsSource }, 'settings', { appVersion });
  const firstStatusTasks = data.tasks.filter(t => t.statusId === data.settings.statuses[0].id).map(t => t.id);
  chooseImportFile(settingsFile, "settings.json");
  await waitFor(importDialogOpen);
  const settingsForm = $('#organization-import-form');
  check(settingsForm.elements.settings.checked && settingsForm.elements.destination.value === 'current' && !settingsForm.elements.logo.checked && !settingsForm.elements.logo.disabled && settingsForm.querySelector('.import-logo'), "Settings import is offered for the current organization without replacing its logo");
  check(settingsForm.textContent.includes(t("Language, portal link, tab names, hours per day, text sizes, statuses, urgencies, highlighters, tags and list columns. Replaces current settings.")), "Settings import indicates the text sizes");
  settingsForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.settings.language === 'en');
  check(firstStatusTasks.length > 0 && firstStatusTasks.every(id => data.tasks.find(t => t.id === id).statusId === 'smoke-status-a') && data.tasks.every(t => ['smoke-status-a', 'smoke-status-b'].includes(t.statusId)) && data.settings.logo === fullFile.settings.logo && data.settings.tabNames[0] === 'Imported tasks' && data.settings.portalUrlTemplate === "https://imported.example.com/browse/{code}", "Settings are imported with statuses remapped and logo unchanged");
  check(data.settings.fontSizes.tables === 110 && data.settings.fontSizes.kanban === 100 && rootSize('tables') === '1.1' && rootSize('kanban') === '1', "Text sizes are replaced by the imported settings");
  check(document.documentElement.lang === 'en' && $('#current-tab').textContent === 'Settings' && $('#transfer-panel').textContent.includes('Export and import organization') && $('#transfer-panel').textContent.includes('Export everything') && $('#import-organization').textContent.includes('Import from file') && $('#toast').textContent === 'Import completed.', 'Export and import section is translated using the imported language');
  check($('#font-size-panel h2').textContent === 'Text size' && $('label[for="font-size-tables"]').textContent === 'Tables' && $('[data-font-preset="130"]').textContent.includes('Extra large') && $('#font-size-tables').value === '110', 'Text size section is translated into English');
  chooseImportFile(dataFile, 'data.json');
  await waitFor(importDialogOpen);
  const replaceForm = $('#organization-import-form');
  check($('#modal-content .eyebrow').textContent === 'IMPORT' && replaceForm.textContent.includes('What to import') && replaceForm.textContent.includes('Add and update') && replaceForm.textContent.includes('2 tasks') && !replaceForm.textContent.includes(window.OrbitaI18n.translate("What to import", 'it')), 'Import dialog is translated into English');
  replaceForm.querySelector('[name="dataMode"][value="replace"]').click();
  check($('#import-notes').textContent.includes('will be deleted and replaced'), "Task and issue replacement is flagged before importing");
  replaceForm.requestSubmit();
  await waitFor(() => !$('#modal').open && !saving && data.tasks.length === 2);
  check(data.tasks.every(t => t.code.startsWith('IMPORT-') && ['smoke-status-a', 'smoke-status-b'].includes(t.statusId)) && data.issues.length === 1, "Data is replaced in the imported organization");
  await organizationAction('delete', { id: importedOrganizationId });
  if (activeOrganizationId !== firstOrganizationId) await organizationAction('switch', { id: firstOrganizationId });
  check(organizations.length === 2 && !organizations.some(o => o.id === importedOrganizationId) && organizationName() === "First organization with logo" && data.tasks.some(t => t.id === 'smoke-import-1') && data.settings.themeId === 'smoke-imported-theme', "Imported organization is deleted without affecting the others");
  check(rootSize('kanban') === '1.2' && rootSize('tables') === '1' && data.settings.fontSizes.kanban === 120, "Text sizes are separate per organization");
  return { ok: true, checks };
};
async function boot() {
  try {
    if (!window.workspace) throw new Error(t("Start the app using OrbitKanban-Portable.exe or npm start, not by opening the HTML file directly."));
    try { await loadLanguages(); }
    catch (error) { console.error('Languages not loaded:', error); }
    const loaded = await workspaceApi.load();
    adoptSnapshot(loaded); render(); subscribe();
    if (!browserMode() && window.workspace.updates) {
      if (!updateSubscribed) { window.workspace.onUpdate(adoptUpdateState); updateSubscribed = true; }
      adoptUpdateState(await workspaceApi.updates());
    }
  } catch (error) {
    $('#content').innerHTML = ui`<section class="fatal-error"><h1>Cannot open the workspace</h1><p>${esc(t(error.message))}</p><p>Check folder write permissions and preserve the existing archive before making changes.</p><button class="button" id="retry-load">Retry</button></section>`;
    $('#retry-load').onclick = boot;
    notify(error.message, true);
  } finally {
    window.workspace?.ready?.();
  }
}
boot();
