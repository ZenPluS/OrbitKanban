// In-app guide view.
import { Component } from '../core/Component.js';
import { ColumnSchema, GuideContent, NavigationSections } from '../shared.js';

export class GuideView extends Component {
  constructor(app) {
    super(app);
    this.guideSection = this.guideSection.bind(this);
    this.openGuide = this.openGuide.bind(this);
  }
  // ---- In-app guide (view 5): content and texts come from GuideContent, translated as exact terms ----
  foldText = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  fillTerm = (text, value) => this.term(text).replaceAll('{0}', () => String(value));
  #guideInline(text) {
    const keys = new Set(GuideContent.keyWords().map(this.term));
    return this.esc(this.term(text))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, (_, value) => {
        const parts = value.split('+');
        return parts.every(part => GuideContent.isLiteralKey(part) || keys.has(part)) ? parts.map(part => `<kbd>${part}</kbd>`).join('+') : `<code>${value}</code>`;
      });
  }
  // Settings tabs are resolved from the saved settings, so a leftover draft never adds or hides a destination.
  #guideSettingsTarget(id) {
    const fixed = this.app.settings.settingsTabs.find(tab => tab.id === id);
    if (fixed) return this.t(fixed.label);
    const field = ColumnSchema.schemaOf(this.state.data.settings, 'tasks').find(item => item.catalog === id && ['select', 'multiselect'].includes(item.type));
    return field ? this.t(field.name) : '';
  }
  #guideSections() {
    return GuideContent.sections.map(section => ({
      ...section,
      name: section.tab === undefined ? this.term(section.title) : this.app.sections.nameOf(NavigationSections.TYPES[section.tab]),
      go: (section.go || []).map(target => target.view !== undefined
        ? { attr: `data-guide-view="${target.view}"`, label: this.app.sections.list().some(item => item.type === NavigationSections.TYPES[target.view]) ? this.app.sections.nameOf(NavigationSections.TYPES[target.view]) : '' }
        : { attr: `data-guide-settings="${this.esc(target.settings)}"`, label: this.#guideSettingsTarget(target.settings) }).filter(target => target.label)
    }));
  }
  #guideShortcuts(section) {
    const combo = keys => `<span class="guide-combo">${keys.map(key => `<kbd>${this.esc(this.term(key))}</kbd>`).join('+')}</span>`;
    return `<table class="guide-shortcuts"><thead><tr><th scope="col">${this.esc(this.term("Shortcut"))}</th><th scope="col">${this.esc(this.term("Action"))}</th></tr></thead><tbody>${section.shortcuts.map(([combos, description]) => `<tr data-guide-topic><td>${combos.map(combo).join('<span class="guide-or">/</span>')}</td><td>${this.#guideInline(description)}</td></tr>`).join('')}</tbody></table>`;
  }
  guideSection(section) {
    const body = section.shortcuts ? this.#guideShortcuts(section) : `<div class="guide-topics">${section.topics.map(topic => `<section class="guide-topic" data-guide-topic><h3>${this.esc(this.term(topic.title))}${topic.desktop ? `<span class="guide-badge">${this.esc(this.term("Desktop app only"))}</span>` : ''}</h3><ul>${topic.items.map(item => `<li>${this.#guideInline(item)}</li>`).join('')}</ul></section>`).join('')}</div>`;
    const actions = section.go.length ? `<div class="guide-actions">${section.go.map(target => `<button type="button" class="button small" ${target.attr}>${this.esc(this.fillTerm("Go to {0}", target.label))}</button>`).join('')}</div>` : '';
    return `<article class="panel guide-section" id="guide-${section.id}" data-guide-id="${section.id}" aria-labelledby="guide-${section.id}-title"><header class="guide-section-head"><span class="guide-section-icon" aria-hidden="true">${this.ico(section.icon, section.family)}</span><div><h2 id="guide-${section.id}-title" tabindex="-1">${this.esc(section.name)}</h2><p>${this.#guideInline(section.summary)}</p></div></header>${body}${actions}</article>`;
  }
  renderGuide() {
    const sections = this.#guideSections();
    const searchField = `<label class="theme-search guide-search"><span aria-hidden="true">${this.ico('search')}</span><input type="search" id="guide-search" placeholder="${this.esc(this.term("Search the guide…"))}" aria-label="${this.esc(this.term("Search the guide"))}" autocomplete="off" spellcheck="false" value="${this.esc(this.state.guideQuery)}"></label>`;
    this.$('#content').innerHTML = `<div id="guide-page"><section class="page-heading"><div><h1>${this.esc(this.term("Guide"))}<span class="title-dot">.</span></h1><p>${this.esc(this.term("Everything OrbitKanban can do, explained step by step."))}</p></div><div class="heading-actions">${searchField}</div></section>
    <div class="guide-layout"><nav class="guide-nav" aria-label="${this.esc(this.term("Guide contents"))}">${sections.map(section => `<button type="button" class="guide-nav-link" data-guide-section="${section.id}"><span class="settings-tab-icon" aria-hidden="true">${this.ico(section.icon, section.family)}</span><span class="guide-nav-text">${this.esc(section.name)}</span></button>`).join('')}</nav>
    <div class="guide-body"><p class="sr-only" id="guide-status" role="status" aria-live="polite"></p><p class="panel guide-empty" id="guide-empty" hidden>${this.esc(this.term("No topics match your search."))}</p>${sections.map(this.guideSection).join('')}</div></div></div>`;
    this.$('#guide-search').oninput = event => { this.state.guideQuery = event.target.value; this.state.guidePinned = null; this.#filterGuide(); };
    this.$('#guide-page').addEventListener('click', event => {
      const link = event.target.closest('[data-guide-section]');
      if (link) { this.#showGuideSection(link.dataset.guideSection); return; }
      const target = event.target.closest('[data-guide-view],[data-guide-settings]');
      if (target?.dataset.guideSettings) this.app.settings.openSettingsTab(target.dataset.guideSettings);
      else if (target) this.app.notifier.action(() => this.app.sections.openType(NavigationSections.TYPES[Number(target.dataset.guideView)]))();
    });
    this.#filterGuide();
  }
  #showGuideSection(id) {
    const section = document.getElementById(`guide-${id}`);
    if (!section || section.hidden) return;
    section.scrollIntoView({ block: 'start' });
    section.querySelector('h2').focus({ preventScroll: true });
    this.state.guidePinned = { id, scrollTop: this.$('#content').scrollTop };
    this.markGuideSection();
  }
  #filterGuide() {
    const query = this.foldText(this.state.guideQuery.trim());
    let shown = 0;
    document.querySelectorAll('.guide-section').forEach(section => {
      const whole = !query || this.foldText(section.querySelector('.guide-section-head').textContent).includes(query);
      let visible = 0;
      section.querySelectorAll('[data-guide-topic]').forEach(topic => {
        topic.hidden = !whole && !this.foldText(topic.textContent).includes(query);
        if (!topic.hidden) visible++;
      });
      section.hidden = !visible;
      document.querySelector(`[data-guide-section="${section.dataset.guideId}"]`).hidden = !visible;
      shown += visible;
    });
    this.$('#guide-empty').hidden = shown > 0;
    this.$('#guide-status').textContent = query ? this.fillTerm("Matching topics: {0}", shown) : '';
    this.markGuideSection();
  }
  // The contents entry follows the section at the top of the page; a section chosen from the contents stays marked until the page scrolls.
  markGuideSection() {
    const content = this.$('#content');
    if (this.state.view !== 5 || !this.$('#guide-page')) return;
    const sections = [...document.querySelectorAll('.guide-section:not([hidden])')];
    let current = sections[0]?.dataset.guideId;
    if (this.state.guidePinned && this.state.guidePinned.scrollTop === content.scrollTop && sections.some(section => section.dataset.guideId === this.state.guidePinned.id)) current = this.state.guidePinned.id;
    else {
      this.state.guidePinned = null;
      // The last sections can never scroll up to the reading line: over the final stretch it slides to the bottom edge,
      // so each of them is marked in turn and the last one is marked at the end of the page.
      const base = Math.min(160, content.clientHeight / 3), maxScroll = content.scrollHeight - content.clientHeight;
      const stretch = Math.min(maxScroll, content.clientHeight - base);
      const progress = stretch > 0 ? Math.min(1, Math.max(0, 1 - (maxScroll - content.scrollTop) / stretch)) : 0;
      const line = content.getBoundingClientRect().top + base + (content.clientHeight - base - 2) * progress;
      for (const section of sections) if (section.getBoundingClientRect().top <= line) current = section.dataset.guideId;
    }
    const previous = document.querySelector('.guide-nav-link.active')?.dataset.guideSection;
    document.querySelectorAll('.guide-nav-link').forEach(link => {
      const active = link.dataset.guideSection === current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    });
    // Scrolls only the contents list, never the page, so the marked entry stays visible in both layouts.
    const nav = this.$('.guide-nav'), link = document.querySelector('.guide-nav-link.active');
    if (!link || current === previous) return;
    const navBox = nav.getBoundingClientRect(), box = link.getBoundingClientRect();
    if (box.left < navBox.left) nav.scrollLeft -= navBox.left - box.left + 8;
    else if (box.right > navBox.right) nav.scrollLeft += box.right - navBox.right + 8;
    if (box.top < navBox.top) nav.scrollTop -= navBox.top - box.top + 8;
    else if (box.bottom > navBox.bottom) nav.scrollTop += box.bottom - navBox.bottom + 8;
  }
  #guideScrollFrame = 0;
  openGuide() {
    if (this.state.view === 5) { this.$('#guide-search')?.focus(); return; }
    this.state.view = 5;
    this.app.shell.render();
  }
  install() {
    this.$('#content').addEventListener('scroll', () => {
      if (this.state.view !== 5 || this.#guideScrollFrame) return;
      this.#guideScrollFrame = requestAnimationFrame(() => { this.#guideScrollFrame = 0; this.markGuideSection(); });
    }, { passive: true });
  }
}
