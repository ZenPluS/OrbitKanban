'use strict';
// Color conversions and WCAG contrast math (hex, HSV, OKLCH, luminance).
(() => {
const Common = typeof module !== 'undefined' ? require('../domain/Common') : globalThis.OrbitKanban.Domain.Common;

class ColorMath {
  // WCAG 2.x contrast: relative luminance of sRGB colors and the (L1 + 0.05) / (L2 + 0.05) ratio.
  static WCAG_TEXT_CONTRAST = 4.5; static WCAG_GRAPHIC_CONTRAST = 3;
  static #HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  static hexToRgb(color) {
    Common.assert(typeof color === 'string' && ColorMath.#HEX_COLOR.test(color), "Invalid color.");
    const digits = color.length === 4 ? [...color.slice(1)].map(digit => digit + digit).join('') : color.slice(1);
    return digits.match(/.{2}/g).map(channel => parseInt(channel, 16));
  }
  static rgbToHex = channels => '#' + channels.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('');
  static hexToHsv(color) {
    const [r, g, b] = ColorMath.hexToRgb(color).map(channel => channel / 255);
    const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
    const sector = !delta ? 0 : max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return { h: (sector * 60 + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 };
  }
  static hsvToHex({ h, s, v }) {
    Common.assert([h, s, v].every(Number.isFinite) && h >= 0 && h <= 360 && s >= 0 && s <= 100 && v >= 0 && v <= 100, "Invalid color.");
    const chroma = v / 100 * s / 100, hue = h / 60 % 6, x = chroma * (1 - Math.abs(hue % 2 - 1)), m = v / 100 - chroma;
    const channels = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(hue)];
    return ColorMath.rgbToHex(channels.map(channel => (channel + m) * 255));
  }
  static #srgbToLinear = channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  static #linearToSrgb = value => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
  static relativeLuminance(color) {
    return ColorMath.hexToRgb(color).map(ColorMath.#srgbToLinear).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  }
  static contrastRatio(a, b) {
    const first = ColorMath.relativeLuminance(a), second = ColorMath.relativeLuminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }
  static meetsContrast = (color, against, minimum) => against.every(other => ColorMath.contrastRatio(color, other) >= minimum);
  static readableSurface(color) {
    const text = ColorMath.contrastRatio(color, '#000000') >= ColorMath.contrastRatio(color, '#ffffff') ? '#000000' : '#ffffff';
    const base = ColorMath.hexToRgb(color), target = ColorMath.hexToRgb(text);
    const mix = amount => ColorMath.rgbToHex(base.map((channel, index) => channel * (1 - amount) + target[index] * amount));
    let low = 0, high = 0.12;
    for (let step = 0; step < 16; step++) {
      const middle = (low + high) / 2;
      if (ColorMath.contrastRatio(mix(middle), text) >= ColorMath.WCAG_TEXT_CONTRAST) low = middle; else high = middle;
    }
    return { text, header: mix(low) };
  }
  // OKLCH keeps hue and chroma while only the perceived lightness moves, so corrected colors stay recognisable.
  static toOklch(color) {
    const [r, g, b] = ColorMath.hexToRgb(color).map(ColorMath.#srgbToLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const chroma = Math.hypot(a, bb);
    return { l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, c: chroma < 1e-4 ? 0 : chroma, h: Math.atan2(bb, a) };
  }
  static fromOklch({ l, c, h }) {
    const lightness = Math.min(1, Math.max(0, l));
    const linear = chroma => {
      const a = chroma * Math.cos(h), b = chroma * Math.sin(h);
      const lc = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3, mc = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3, sc = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc, -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc, -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc];
    };
    const inGamut = rgb => rgb.every(value => value >= -1e-6 && value <= 1 + 1e-6);
    let rgb = linear(c);
    if (!inGamut(rgb)) {
      // Out-of-gamut colors lose chroma, never lightness or hue.
      let low = 0, high = c;
      for (let step = 0; step < 24; step++) { const middle = (low + high) / 2; if (inGamut(linear(middle))) low = middle; else high = middle; }
      rgb = linear(low);
    }
    return ColorMath.rgbToHex(rgb.map(value => ColorMath.#linearToSrgb(Math.min(1, Math.max(0, value)))));
  }
  // Smallest lightness change (towards white or black, hue kept) that reaches the minimum contrast against every color; null if impossible.
  static shiftToContrast(color, against, minimum) {
    if (ColorMath.meetsContrast(color, against, minimum)) return color;
    const base = ColorMath.toOklch(color);
    const candidates = [1, 0].map(target => {
      const at = amount => ColorMath.fromOklch({ ...base, l: base.l + (target - base.l) * amount });
      const steps = 64;
      let previous = 0, found = -1;
      for (let step = 1; step <= steps; step++) {
        if (ColorMath.meetsContrast(at(step / steps), against, minimum)) { found = step / steps; break; }
        previous = step / steps;
      }
      if (found < 0) return null;
      let low = previous, high = found;
      for (let step = 0; step < 20; step++) { const middle = (low + high) / 2; if (ColorMath.meetsContrast(at(middle), against, minimum)) high = middle; else low = middle; }
      return { color: at(high), distance: Math.abs(target - base.l) * high };
    }).filter(Boolean);
    return candidates.length ? candidates.sort((a, b) => a.distance - b.distance)[0].color : null;
  }
}

if (typeof module !== 'undefined') module.exports = ColorMath;
else ((globalThis.OrbitKanban ??= {}).Graphics ??= {}).ColorMath = ColorMath;
})();
