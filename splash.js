'use strict';
const path = require('node:path');

const SPLASH_SIZE = Object.freeze({ width: 520, height: 320 });
const SPLASH_BACKGROUND = '#10131c';
const SPLASH_STATUS = 'Loading your workspace…';
// The bar keeps moving, so the screen only needs to stay long enough not to flicker.
const SPLASH_MIN_VISIBLE = 400;
function splashHoldTime(shownAt, now) {
  if (shownAt == null) return 0;
  return Math.max(0, SPLASH_MIN_VISIBLE - Math.max(0, now - shownAt));
}
// The main window starts with the organization background, so it does not flash a different color while painting.
function windowBackground(settings) {
  const color = settings?.themes?.find(theme => theme.id === settings.themeId)?.background;
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color : SPLASH_BACKGROUND;
}

function createSplash({ BrowserWindow, screen, appRoot, title, version = '', show = true }) {
  let closed = false, shownAt = null;
  const { width, height } = SPLASH_SIZE, area = screen.getPrimaryDisplay().bounds;
  // Centered on the whole primary screen, exactly like the launcher bitmap, so the two screens overlap.
  const window = new BrowserWindow({
    width, height, useContentSize: true, title,
    x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
    show: false, frame: false, resizable: false, maximizable: false, fullscreenable: false, closable: false,
    backgroundColor: SPLASH_BACKGROUND,
    webPreferences: { preload: path.join(appRoot, 'splash-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { closed = true; });
  window.once('show', () => { shownAt = Date.now(); });
  // Shown at once with the launcher background: waiting for the first paint would leave the desktop visible longer.
  if (show) window.show();
  window.loadFile(path.join(appRoot, 'splash.html'), { query: { version } }).catch(() => {});
  return {
    window,
    get closed() { return closed || window.isDestroyed(); },
    get shownAt() { return shownAt; },
    inspect: () => window.webContents.executeJavaScript(`(() => {
      const byId = id => document.getElementById(id), image = document.querySelector('.logo img'), bar = byId('splash-progress');
      return { lang: document.documentElement.lang, status: byId('splash-status').textContent, version: byId('splash-version').textContent, busy: document.querySelector('.splash').getAttribute('aria-busy'), indeterminate: bar.getAttribute('role') === 'progressbar' && !bar.hasAttribute('aria-valuenow'), animated: document.getAnimations().some(animation => animation.playState === 'running'), logo: Boolean(image && image.complete && image.naturalWidth > 0) };
    })()`),
    close() {
      if (!closed && !window.isDestroyed()) window.destroy();
      closed = true;
    }
  };
}

module.exports = { SPLASH_SIZE, SPLASH_BACKGROUND, SPLASH_STATUS, SPLASH_MIN_VISIBLE, splashHoldTime, windowBackground, createSplash };
