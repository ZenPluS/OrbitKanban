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
    document.documentElement.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
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
    const layout = this.sidebarReducedMotion.matches ? [] : [
      [this.$('#sidebar'), ['width', 'paddingLeft', 'paddingRight']],
      [this.$('main'), ['width', 'marginLeft']],
      [this.$('#toast'), ['left']]
    ];
    const propertiesOf = (element, properties) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map(property => [property, style[property]]));
    };
    const beforeLayout = layout.map(([element, properties]) => propertiesOf(element, properties));
    const moving = this.sidebarReducedMotion.matches ? [] : [
      ...[...document.querySelectorAll('#navigation, #guide-button, #settings-button, #open-browser, .sidebar .version')].map(element => [element, 'y']),
      ...[...document.querySelectorAll('.sidebar .nav-icon, .sidebar .nav-count, #open-browser .ico, #app-version')].map(element => [element, 'x']),
      [this.$('.sidebar .brand-icon'), 'xy']
    ];
    const beforePositions = moving.map(([element]) => element.getBoundingClientRect());
    // Capture the visible positions before cancelling, so a quick second click reverses smoothly.
    this.sidebarAnimations.forEach(animation => animation.cancel());
    this.sidebarAnimations = [];
    this.sidebarCollapsed = !this.sidebarCollapsed;
    try { if (this.sidebarCollapsed) localStorage.setItem(this.#SIDEBAR_COLLAPSED_KEY, '1'); else localStorage.removeItem(this.#SIDEBAR_COLLAPSED_KEY); } catch {}
    this.applySidebar();
    const motion = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
    const afterLayout = layout.map(([element, properties]) => propertiesOf(element, properties));
    if (!this.sidebarCollapsed && !this.sidebarReducedMotion.matches) {
      // Reveal full-width labels through the growing sidebar instead of wrapping them while it opens.
      const children = [...this.$('#sidebar').children].map(element => [element, getComputedStyle(element).width]);
      this.sidebarAnimations.push(...children.map(([element, width]) => element.animate([{ minWidth: width }, { minWidth: width }], motion)));
    }
    this.sidebarAnimations.push(...layout.map(([element], index) => element.animate([beforeLayout[index], afterLayout[index]], motion)));
    // Move icons without scaling them, and compensate for controls changing rows in the compact layout.
    const afterPositions = moving.map(([element]) => element.getBoundingClientRect());
    this.sidebarAnimations.push(...moving.map(([element, axes], index) => {
      const x = axes.includes('x') ? beforePositions[index].left - afterPositions[index].left : 0;
      const y = axes.includes('y') ? beforePositions[index].top - afterPositions[index].top : 0;
      return element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], motion);
    }));
    if (!this.sidebarReducedMotion.matches) {
      const labels = this.sidebarCollapsed ? '.sidebar .organization-icon' : '.sidebar .nav-label, .sidebar .brand > div:last-child, .sidebar .organization-switcher label, #organization-select, #manage-organizations, .sidebar .local-card';
      const fade = this.sidebarCollapsed ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }];
      this.sidebarAnimations.push(...[...document.querySelectorAll(labels)].map(element => element.animate(fade, motion)));
    }
    // Controls that only exist in the full sidebar hand the focus to the menu button.
    if (this.$('#sidebar').contains(focused) && !focused.getClientRects().length) this.$('#sidebar-toggle').focus({ preventScroll: true });
    // The views change width without a window resize, so menus anchored to them follow the resize rules.
    const focusIn = selector => Boolean(document.querySelector(selector)?.contains(document.activeElement));
    this.app.tagMenu.closeTagMenu(focusIn('#tag-menu'));
    this.app.rowMarks.closeMarkMenu(focusIn('#mark-menu'));
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
