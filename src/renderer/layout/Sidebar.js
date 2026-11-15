// Collapsible sidebar with its animation and saved state.
import { Component } from '../core/Component.js';

export class Sidebar extends Component {
  constructor(app) {
    super(app);
    this.toggleSidebar = this.toggleSidebar.bind(this);
  }
  // The sidebar can fold into a column of icons so the views get more space; the choice is kept on this device.
  #SIDEBAR_COLLAPSED_KEY = 'orbitkanban.sidebarCollapsed';
  sidebarCollapsed = (() => { try { return localStorage.getItem(this.#SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; } })();
  sidebarReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  sidebarAnimations = [];
  applySidebar() {
    const toggle = this.$('#sidebar-toggle'), select = this.$('#organization-select');
    const right = this.state.data.settings.sidebarPosition === 'right';
    document.documentElement.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    document.documentElement.classList.toggle('sidebar-right', right);
    const toolbar = this.$(right ? '.topbar-right' : '.topbar-left');
    if (toggle.parentElement !== toolbar) {
      if (right) toolbar.append(toggle); else toolbar.prepend(toggle);
    }
    toggle.setAttribute('aria-expanded', String(!this.sidebarCollapsed));
    toggle.setAttribute('aria-label', this.t("Sidebar"));
    toggle.title = this.t(this.sidebarCollapsed ? "Expand the sidebar (Ctrl+B)" : "Collapse the sidebar (Ctrl+B)");
    // In the column the names are hidden, so they become tooltips.
    for (const button of document.querySelectorAll('#navigation .nav-button, #settings-button, #open-browser')) {
      if (this.sidebarCollapsed) button.title = button.querySelector('.nav-label').textContent; else button.removeAttribute('title');
    }
    if (this.sidebarCollapsed) select.title = this.app.transfer.fillText("Organization: {0}", select.selectedOptions[0]?.textContent ?? ''); else select.removeAttribute('title');
  }
  toggleSidebar() {
    const focused = document.activeElement;
    const sidebar = this.$('#sidebar'), main = this.$('main');
    const previousLeft = main.getBoundingClientRect().left, previousWidth = sidebar.getBoundingClientRect().width;
    this.sidebarAnimations.forEach(animation => animation.cancel());
    this.sidebarAnimations = [];
    this.sidebarCollapsed = !this.sidebarCollapsed;
    try { if (this.sidebarCollapsed) localStorage.setItem(this.#SIDEBAR_COLLAPSED_KEY, '1'); else localStorage.removeItem(this.#SIDEBAR_COLLAPSED_KEY); } catch {}
    const focusIn = selector => Boolean(document.querySelector(selector)?.contains(document.activeElement));
    this.app.tagMenu.closeTagMenu(focusIn('#tag-menu'));
    this.app.rowMarks.closeMarkMenu(focusIn('#mark-menu'));
    this.applySidebar();
    const nextLeft = main.getBoundingClientRect().left;
    if (!this.sidebarReducedMotion.matches) {
      // Reflow once, then move the content as one compositor layer. Icons never leave the clipped sidebar.
      const motion = { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
      if (this.state.data.settings.sidebarPosition !== 'right') {
        this.sidebarAnimations.push(main.animate([{ transform: `translateX(${previousLeft - nextLeft}px)` }, { transform: 'translateX(0)' }], motion));
      }
      if (!this.sidebarCollapsed) {
        const right = this.state.data.settings.sidebarPosition === 'right';
        const hidden = Math.max(0, right ? sidebar.getBoundingClientRect().width - previousWidth : nextLeft - previousLeft);
        const clip = right ? `inset(0 0 0 ${hidden}px)` : `inset(0 ${hidden}px 0 0)`;
        this.sidebarAnimations.push(sidebar.animate([{ clipPath: clip }, { clipPath: 'inset(0 0 0 0)' }], motion));
      }
      this.sidebarAnimations.push(sidebar.animate([{ opacity: 0.4 }, { opacity: 1 }], motion));
    }
    if (sidebar.contains(focused) && !focused.getClientRects().length) this.$('#sidebar-toggle').focus({ preventScroll: true });
    this.app.colorPicker.positionColorPicker();
  }
  install() {
    this.sidebarReducedMotion.addEventListener('change', () => {
      if (this.sidebarReducedMotion.matches) this.sidebarAnimations.forEach(animation => animation.cancel());
    });
    // Set before the first render so a collapsed sidebar does not flash open; render() applies the rest.
    document.documentElement.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    new ResizeObserver(this.app.colorPicker.positionColorPicker).observe(this.$('main'));
  }
}
