'use strict';
// The OrbitKanban atom in the colors of a theme, like a themed launcher icon: the loading screen, the sidebar, the browser tab
// and the desktop window icon all take their colors from here. The executable keeps the full-color app-logo.svg.
(() => {
const ColorMath = typeof module !== 'undefined' ? require('./ColorMath') : globalThis.OrbitKanban.Graphics.ColorMath;
const ThemeGenerator = typeof module !== 'undefined' ? require('./ThemeGenerator') : globalThis.OrbitKanban.Graphics.ThemeGenerator;

class AppLogo {
  // Sizes of the Windows icons (executable and window); up to 40 px the atom drops its electrons and thickens the orbits.
  static ICON_SIZES = Object.freeze([16, 24, 32, 48, 64, 128, 256]);
  // Midnight, the default theme.
  static DEFAULT_THEME = Object.freeze({ background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#b39cff' });
  static #KEYS = ['background', 'surface', 'text', 'accent'];
  static #HEX = /^#[0-9a-f]{6}$/i;

  static mix(color, other, weight) {
    const from = ColorMath.hexToRgb(color), to = ColorMath.hexToRgb(other);
    return ColorMath.rgbToHex(from.map((channel, index) => channel + (to[index] - channel) * weight));
  }
  // The four theme colors in lower case, or the default theme when one of them is missing or invalid.
  static theme(theme) {
    if (!theme || !AppLogo.#KEYS.every(key => AppLogo.#HEX.test(theme[key] || ''))) return { ...AppLogo.DEFAULT_THEME };
    return Object.fromEntries(AppLogo.#KEYS.map(key => [key, theme[key].toLowerCase()]));
  }
  // Flat colors: the badge is the theme surface, the orbits are the accent and its two icon tints, all readable on the badge.
  static palette(theme) {
    const colors = AppLogo.theme(theme), { background, text } = colors;
    const badge = ColorMath.contrastRatio(colors.surface, background) >= 1.08 ? colors.surface : AppLogo.mix(background, text, 0.08);
    const accent = ColorMath.shiftToContrast(colors.accent, [background, badge], ColorMath.WCAG_GRAPHIC_CONTRAST) || text;
    const [light, deep] = ThemeGenerator.iconPalette({ ...colors, surface: badge }).accent;
    return { accent, badge, ring: AppLogo.mix(badge, accent, 0.45), orbits: [light, accent, deep], electron: text, nucleus: accent };
  }
  // Same drawing as app-logo.svg, flat: the size sets the SVG viewport, so its small-size rules apply to small icons.
  static svg(theme, size = 64) {
    const colors = AppLogo.palette(theme);
    const orbit = (rotation, color, electronX) => `<g${rotation ? ` transform="rotate(${rotation} 32 32)"` : ''}>` +
      `<ellipse class="orbit" cx="32" cy="32" rx="24" ry="9.5" stroke="${color}"/>` +
      `<circle class="electron" cx="${electronX}" cy="32" r="3.2" fill="${colors.electron}"/></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
      '<style>.orbit{fill:none;stroke-width:3}@media (max-width:40px){.orbit{stroke-width:4.4}.electron{display:none}}</style>' +
      `<circle cx="32" cy="32" r="31" fill="${colors.badge}" stroke="${colors.ring}" stroke-width="1.2"/>` +
      orbit(120, colors.orbits[0], 56) + orbit(60, colors.orbits[1], 8) + orbit(0, colors.orbits[2], 56) +
      `<circle cx="32" cy="32" r="5.6" fill="${colors.nucleus}"/></svg>`;
  }
  static dataUrl(theme, size = 64) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(AppLogo.svg(theme, size))}`;
  }
}

if (typeof module !== 'undefined') module.exports = AppLogo;
else ((globalThis.OrbitKanban ??= {}).Graphics ??= {}).AppLogo = AppLogo;
})();
