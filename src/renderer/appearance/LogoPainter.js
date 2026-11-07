// Draws the app logo in the theme colors, like a themed launcher icon: sidebar, browser tab and desktop window icon.
// An organization logo still replaces it in the sidebar and the browser tab.
import { Component } from '../core/Component.js';
import { AppLogo, Common } from '../shared.js';

export class LogoPainter extends Component {
  #logoCache = new Map();
  #brandKey = '';
  #windowIconKey = '';
  #windowIconTimer = null;
  // Last theme logo sent to the desktop window, read by the smoke tests.
  windowIconSent = '';

  themedLogo(theme) {
    const key = [theme.background, theme.surface, theme.text, theme.accent].join();
    if (!this.#logoCache.has(key)) {
      if (this.#logoCache.size > 50) this.#logoCache.clear();
      this.#logoCache.set(key, AppLogo.dataUrl(theme));
    }
    return this.#logoCache.get(key);
  }
  paintLogo(theme, organization) {
    const custom = this.state.data.settings.logo, source = custom || this.themedLogo(theme);
    const alt = custom ? organization.name : Common.APP_NAME, key = JSON.stringify([source, alt]);
    if (key !== this.#brandKey) {
      this.#brandKey = key;
      const icon = this.$('link[rel="icon"]');
      if (icon) { icon.type = custom ? 'image/png' : 'image/svg+xml'; icon.href = source; }
      this.$('.brand-icon').innerHTML = `<img src="${source}" alt="${this.esc(alt)}">`;
      this.$('.brand-icon').classList.add('has-logo');
    }
    this.#scheduleWindowIcon(theme);
  }
  // Theme edits repaint often: the window icon is redrawn once the colors settle.
  #scheduleWindowIcon(theme) {
    if (typeof window.workspace?.windowIcon !== 'function') return;
    const logo = this.themedLogo(theme);
    if (logo === this.#windowIconKey) return;
    this.#windowIconKey = logo;
    clearTimeout(this.#windowIconTimer);
    this.#windowIconTimer = setTimeout(() => this.#sendWindowIcon(theme, logo), 250);
  }
  async #sendWindowIcon(theme, logo) {
    try {
      const images = await LogoPainter.rasterize(theme);
      if (logo !== this.#windowIconKey) return;
      this.unwrap(await window.workspace.windowIcon(images));
      this.windowIconSent = logo;
    } catch (error) {
      if (logo === this.#windowIconKey) this.#windowIconKey = '';
      console.error('The window icon could not be updated:', error);
    }
  }
  // Each icon size is drawn with the logo viewport set to that size, so its small-size rules apply like in the executable icon.
  static async rasterize(theme) {
    const images = [];
    for (const size of AppLogo.ICON_SIZES) {
      const image = new Image();
      image.src = AppLogo.dataUrl(theme, size);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, size, size);
      if (size === 256) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        images.push({ size, png: new Uint8Array(await blob.arrayBuffer()) });
      } else images.push({ size, rgba: new Uint8Array(context.getImageData(0, 0, size, size).data.buffer) });
    }
    return images;
  }
}
