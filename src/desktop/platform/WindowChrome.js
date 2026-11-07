'use strict';
// Colors and size of the native caption buttons drawn over the app's own top bar (Windows title bar overlay).
class WindowChrome {
  static #HEX = /^#[0-9a-f]{6}$/i;
  static DEFAULT_COLORS = Object.freeze({ background: '#10131c', text: '#edf0fa' });
  // Same tint as dialog::backdrop in styles.css, so the caption buttons dim together with the page behind a dialog.
  static BACKDROP = Object.freeze({ color: '#050812', alpha: 0xb8 / 255 });
  static TITLE_BAR_HEIGHT = Object.freeze({ min: 28, max: 120, initial: 43 });
  static TITLE_BAR_ARGUMENT = '--orbitkanban-title-bar=overlay';

  static themeColors(settings) {
    const theme = settings?.themes?.find?.(item => item?.id === settings.themeId);
    return WindowChrome.#HEX.test(theme?.background || '') && WindowChrome.#HEX.test(theme?.text || '') ? { background: theme.background.toLowerCase(), text: theme.text.toLowerCase() } : { ...WindowChrome.DEFAULT_COLORS };
  }
  static #mix(color, other, weight) {
    const channels = value => value.slice(1).match(/.{2}/g).map(part => parseInt(part, 16));
    const a = channels(color), b = channels(other);
    return `#${a.map((value, i) => Math.round(value + (b[i] - value) * weight).toString(16).padStart(2, '0')).join('')}`;
  }
  // Returns the options for BrowserWindow#setTitleBarOverlay, or null when the request is not valid.
  static titleBarOverlay(request, zoom = 1) {
    if (!request || typeof request !== 'object') return null;
    const { background, text, dimmed = false } = request, height = Number(request.height), factor = Number(zoom);
    if (!WindowChrome.#HEX.test(background || '') || !WindowChrome.#HEX.test(text || '') || typeof dimmed !== 'boolean' || !Number.isFinite(height) || !Number.isFinite(factor) || factor <= 0) return null;
    const color = dimmed ? WindowChrome.#mix(background.toLowerCase(), WindowChrome.BACKDROP.color, WindowChrome.BACKDROP.alpha) : background.toLowerCase();
    // Symbols are dimmed less than the page, so the window can still be minimized or closed while a dialog is open.
    const symbolColor = dimmed ? WindowChrome.#mix(text.toLowerCase(), WindowChrome.BACKDROP.color, WindowChrome.BACKDROP.alpha / 2) : text.toLowerCase();
    return { color, symbolColor, height: Math.min(WindowChrome.TITLE_BAR_HEIGHT.max, Math.max(WindowChrome.TITLE_BAR_HEIGHT.min, Math.round(height * factor))) };
  }
}

module.exports = WindowChrome;
