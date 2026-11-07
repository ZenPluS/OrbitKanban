// Applies theme colors to the page and keeps the desktop title bar in sync.
import { Component } from '../core/Component.js';
import { ThemeGenerator } from '../shared.js';

export class ThemePainter extends Component {
  constructor(app) {
    super(app);
    this.syncWindowChrome = this.syncWindowChrome.bind(this);
  }
  #themeExtrasCache = new Map();
  // Readable label color on accent fills and per-theme icon gradients, computed once per color combination.
  #themeExtras(theme) {
    const key = [theme.background, theme.surface, theme.text, theme.accent].join();
    if (!this.#themeExtrasCache.has(key)) {
      if (this.#themeExtrasCache.size > 200) this.#themeExtrasCache.clear();
      const properties = { '--on-accent': ThemeGenerator.onAccentColor(theme) };
      for (const [family, stops] of Object.entries(ThemeGenerator.iconPalette(theme))) {
        stops.forEach((stop, i) => { properties[`--ig-${family}-${i + 1}`] = stop; });
        properties[`--ig-${family}-ink`] = ThemeGenerator.iconInk(stops);
      }
      this.#themeExtrasCache.set(key, properties);
    }
    return this.#themeExtrasCache.get(key);
  }
  paintTheme(theme) {
    const style = document.documentElement.style;
    for (const key of ['background', 'surface', 'text', 'accent']) style.setProperty(`--${key}`, theme[key]);
    for (const [property, value] of Object.entries(this.#themeExtras(theme))) style.setProperty(property, value);
    const rgb = theme.background.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
    document.documentElement.style.colorScheme = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? 'light' : 'dark';
    this.#windowChromeColors = { background: theme.background, surface: theme.surface, text: theme.text };
    this.syncWindowChrome();
  }
  // The desktop window has no native title bar: the top bar drags it and the caption buttons take the theme colors.
  customTitleBar = () => window.workspace?.titleBarOverlay === true && typeof window.workspace.windowChrome === 'function';
  #windowChromeColors = null; #windowChromeKey = ''; windowChromeSent = null;
  syncWindowChrome() {
    if (!this.customTitleBar() || !this.#windowChromeColors) return;
    // The overlay stops above the top bar's bottom border, so the separator line runs under the caption buttons too.
    // The form designer covers the top bar with its own bar, so the caption buttons take that bar's color while it is open.
    const designer = document.getElementById('form-designer')?.open === true;
    const request = { background: designer ? this.#windowChromeColors.surface : this.#windowChromeColors.background, text: this.#windowChromeColors.text, height: this.$('.topbar').clientHeight, dimmed: this.$('#modal').open };
    const key = JSON.stringify([request, devicePixelRatio]);
    if (key === this.#windowChromeKey) return;
    this.#windowChromeKey = key;
    this.windowChromeSent = request;
    window.workspace.windowChrome(request);
  }
  install() {
    if (this.customTitleBar()) {
      document.documentElement.classList.add('custom-titlebar');
      new ResizeObserver(this.syncWindowChrome).observe(this.$('.topbar'));
      new MutationObserver(this.syncWindowChrome).observe(this.$('#modal'), { attributes: true, attributeFilter: ['open'] });
      // Page zoom changes the device pixel ratio but not the CSS height of the top bar.
      window.addEventListener('resize', this.syncWindowChrome);
    }
  }
}
