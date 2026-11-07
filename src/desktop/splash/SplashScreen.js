'use strict';
// Loading screen shown while the main window prepares the workspace (when the portable launcher is not showing its own).
const path = require('node:path');

class SplashScreen {
  static SPLASH_SIZE = Object.freeze({ width: 520, height: 320 });
  static SPLASH_BACKGROUND = '#10131c';
  static SPLASH_STATUS = 'Loading your workspace…';
  // The bar keeps moving, so the screen only needs to stay long enough not to flicker.
  static SPLASH_MIN_VISIBLE = 400;
  static splashHoldTime(shownAt, now) {
    if (shownAt == null) return 0;
    return Math.max(0, SplashScreen.SPLASH_MIN_VISIBLE - Math.max(0, now - shownAt));
  }
  // The main window starts with the organization background, so it does not flash a different color while painting.
  static windowBackground(settings) {
    const color = settings?.themes?.find(theme => theme.id === settings.themeId)?.background;
    return /^#[0-9a-f]{6}$/i.test(color || '') ? color : SplashScreen.SPLASH_BACKGROUND;
  }

  #closed = false;
  #shownAt = null;

  constructor({ BrowserWindow, screen, appRoot, title, icon, version = '', show = true }) {
    const { width, height } = SplashScreen.SPLASH_SIZE, area = screen.getPrimaryDisplay().bounds;
    // Centered on the whole primary screen, exactly like the launcher bitmap, so the two screens overlap.
    const window = new BrowserWindow({
      width, height, useContentSize: true, title, icon,
      x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
      show: false, frame: false, resizable: false, maximizable: false, fullscreenable: false, closable: false, skipTaskbar: true,
      backgroundColor: SplashScreen.SPLASH_BACKGROUND,
      webPreferences: { preload: path.join(appRoot, 'src', 'desktop', 'splash', 'splash-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('closed', () => { this.#closed = true; });
    window.once('show', () => { this.#shownAt = Date.now(); });
    // Shown at once with the launcher background: waiting for the first paint would leave the desktop visible longer.
    if (show) window.show();
    window.loadFile(path.join(appRoot, 'splash.html'), { query: { version } }).catch(() => {});
  }
  get closed() { return this.#closed || this.window.isDestroyed(); }
  get shownAt() { return this.#shownAt; }
  inspect() {
    return this.window.webContents.executeJavaScript(`(() => {
      const byId = id => document.getElementById(id), image = document.querySelector('.logo img'), bar = byId('splash-progress');
      return { lang: document.documentElement.lang, status: byId('splash-status').textContent, version: byId('splash-version').textContent, busy: document.querySelector('.splash').getAttribute('aria-busy'), indeterminate: bar.getAttribute('role') === 'progressbar' && !bar.hasAttribute('aria-valuenow'), animated: document.getAnimations().some(animation => animation.playState === 'running'), logo: Boolean(image && image.complete && image.naturalWidth > 0) };
    })()`);
  }
  close() {
    if (!this.#closed && !this.window.isDestroyed()) this.window.destroy();
    this.#closed = true;
  }
}

module.exports = SplashScreen;
