'use strict';
// Builds accessible theme palettes from images and logos, and icon palettes from a theme.
(() => {
const Common = typeof module !== 'undefined' ? require('../domain/Common') : globalThis.OrbitKanban.Domain.Common;
const ColorMath = typeof module !== 'undefined' ? require('./ColorMath') : globalThis.OrbitKanban.Graphics.ColorMath;

class ThemeGenerator {
  static extractThemePalette(pixels) {
    Common.assert(pixels && pixels.length > 0 && pixels.length % 4 === 0, "The image has no valid pixels.");
    const bins = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      const rgb = [0, 1, 2].map(channel => Math.round(pixels[i + channel] * alpha + 255 * (1 - alpha)));
      const key = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
      if (!bins.has(key)) bins.set(key, { sum: [0, 0, 0], count: 0 });
      const bin = bins.get(key);
      bin.count++;
      rgb.forEach((value, channel) => { bin.sum[channel] += value; });
    }
    const samples = [...bins.values()].map(bin => ({ rgb: bin.sum.map(value => value / bin.count), count: bin.count }))
      .sort((a, b) => b.count - a.count);
    const distance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
    let centers = [samples[0].rgb];
    while (centers.length < Math.min(4, samples.length)) {
      const next = samples.reduce((best, sample) => {
        const score = Math.min(...centers.map(center => distance(sample.rgb, center))) * Math.sqrt(sample.count);
        return score > best.score ? { rgb: sample.rgb, score } : best;
      }, { rgb: null, score: 0 });
      if (!next.rgb) break;
      centers.push(next.rgb);
    }
    for (let iteration = 0; iteration < 10; iteration++) {
      const clusters = centers.map(() => ({ sum: [0, 0, 0], count: 0 }));
      for (const sample of samples) {
        let nearest = 0;
        centers.forEach((center, i) => {
          if (distance(sample.rgb, center) < distance(sample.rgb, centers[nearest])) nearest = i;
        });
        clusters[nearest].count += sample.count;
        sample.rgb.forEach((value, i) => { clusters[nearest].sum[i] += value * sample.count; });
      }
      const next = clusters.filter(cluster => cluster.count).map(cluster => cluster.sum.map(value => value / cluster.count));
      const stable = next.length === centers.length && next.every((center, i) => distance(center, centers[i]) < 1);
      centers = next;
      if (stable) break;
    }
    const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    centers.sort((a, b) => luminance(a) - luminance(b));
    const background = centers[0], text = centers[centers.length - 1];
    const middle = centers.slice(1, -1);
    const chroma = rgb => Math.max(...rgb) - Math.min(...rgb);
    const accent = middle.length ? [...middle].sort((a, b) => chroma(b) - chroma(a))[0] : text;
    const surface = middle.find(color => color !== accent) || background;
    const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
    return { background: hex(background), surface: hex(surface), text: hex(text), accent: hex(accent), colorCount: centers.length };
  }
  // WCAG AA for a theme: text 4.5:1 on background and surfaces, accent 3:1 (UI components), each moved as little as possible.
  static accessibleThemePalette(input) {
    const palette = { ...input };
    let text = ColorMath.shiftToContrast(palette.text, [palette.background, palette.surface], ColorMath.WCAG_TEXT_CONTRAST);
    if (!text) {
      // Background and surface are too far apart for any text color: the surface moves just enough towards the background side.
      const lightText = ColorMath.relativeLuminance(palette.text) >= ColorMath.relativeLuminance(palette.background);
      for (const extreme of lightText ? ['#ffffff', '#000000'] : ['#000000', '#ffffff']) {
        if (ColorMath.contrastRatio(extreme, palette.background) < ColorMath.WCAG_TEXT_CONTRAST) continue;
        const surface = ColorMath.shiftToContrast(palette.surface, [extreme], ColorMath.WCAG_TEXT_CONTRAST);
        const candidate = surface && ColorMath.shiftToContrast(palette.text, [palette.background, surface], ColorMath.WCAG_TEXT_CONTRAST);
        if (candidate) { palette.surface = surface; text = candidate; break; }
      }
    }
    palette.text = text;
    palette.accent = ColorMath.shiftToContrast(palette.accent, [palette.background, palette.surface], ColorMath.WCAG_GRAPHIC_CONTRAST) || palette.text;
    const adjusted = ['background', 'surface', 'text', 'accent'].filter(role => palette[role].toLowerCase() !== String(input[role]).toLowerCase());
    return { palette, adjusted };
  }
  static themeFromImage(pixels) {
    const extracted = ThemeGenerator.extractThemePalette(pixels);
    const { palette, adjusted } = ThemeGenerator.accessibleThemePalette(extracted);
    return { ...palette, colorCount: extracted.colorCount, extracted: { background: extracted.background, surface: extracted.surface, text: extracted.text, accent: extracted.accent }, adjusted };
  }
  // Label color for filled accent buttons: the theme background when it is readable, otherwise the most readable option.
  static onAccentColor(theme) {
    if (ColorMath.contrastRatio(theme.background, theme.accent) >= ColorMath.WCAG_TEXT_CONTRAST) return theme.background;
    return [theme.background, theme.text, '#ffffff', '#000000'].reduce((best, color) => ColorMath.contrastRatio(color, theme.accent) > ColorMath.contrastRatio(best, theme.accent) ? color : best);
  }
  // Gradient stops for the interface icons: each family keeps its hue and gets 3:1 against background and surfaces.
  static ICON_FAMILIES = {
    blue: ['#5ac8ff', '#2f6bff'],
    violet: ['#b490ff', '#6a4cff'],
    teal: ['#3ee0c5', '#0f9f9a'],
    amber: ['#ffcf4d', '#ff8a3d'],
    rose: ['#ff8fb1', '#e5487f'],
    green: ['#7ee081', '#22a35a'],
    slate: ['#a9b6cc', '#5d6b82']
  };
  static iconPalette(theme) {
    const against = [theme.background, theme.surface];
    const accessible = color => ColorMath.shiftToContrast(color, against, ColorMath.WCAG_GRAPHIC_CONTRAST) || theme.text;
    const accent = ColorMath.toOklch(theme.accent);
    const accentStops = [ColorMath.fromOklch({ ...accent, l: accent.l + 0.12, h: accent.h - 0.35 }), ColorMath.fromOklch({ ...accent, l: accent.l - 0.04, h: accent.h + 0.2 })];
    return Object.fromEntries([...Object.entries(ThemeGenerator.ICON_FAMILIES), ['accent', accentStops]].map(([family, stops]) => [family, stops.map(accessible)]));
  }
  // Inner details of a gradient icon: white, or a deep ink when white would fade on light gradients.
  static iconInk(stops) {
    const legibility = color => Math.min(...stops.map(stop => ColorMath.contrastRatio(color, stop)));
    return legibility('#ffffff') >= legibility('#1d1b26') ? '#ffffff' : '#1d1b26';
  }
  static themeFromLogo(pixels) {
    const palette = ThemeGenerator.extractThemePalette(pixels);
    const mix = (a, b, weight) => ColorMath.rgbToHex(ColorMath.hexToRgb(a).map((channel, i) => channel * (1 - weight) + ColorMath.hexToRgb(b)[i] * weight));
    const foreground = ColorMath.contrastRatio(palette.background, '#ffffff') > ColorMath.contrastRatio(palette.background, '#000000') ? '#ffffff' : '#000000';
    if (!ColorMath.meetsContrast(palette.text, [palette.background, palette.surface], ColorMath.WCAG_TEXT_CONTRAST)) palette.text = foreground;
    if (ColorMath.contrastRatio(palette.text, palette.surface) < ColorMath.WCAG_TEXT_CONTRAST || ColorMath.contrastRatio(palette.background, palette.surface) < 1.1) palette.surface = mix(palette.background, palette.text, 0.08);
    if (ColorMath.contrastRatio(palette.text, palette.surface) < ColorMath.WCAG_TEXT_CONTRAST) palette.surface = mix(palette.background, palette.text === '#ffffff' ? '#000000' : '#ffffff', 0.08);
    if (!ColorMath.meetsContrast(palette.accent, [palette.background, palette.surface], ColorMath.WCAG_GRAPHIC_CONTRAST)) {
      for (let weight = 0.1; weight <= 1.01; weight += 0.1) {
        const accent = mix(palette.accent, palette.text, weight);
        if (ColorMath.meetsContrast(accent, [palette.background, palette.surface], ColorMath.WCAG_GRAPHIC_CONTRAST)) { palette.accent = accent; break; }
      }
    }
    return palette;
  }
}

if (typeof module !== 'undefined') module.exports = ThemeGenerator;
else ((globalThis.OrbitKanban ??= {}).Graphics ??= {}).ThemeGenerator = ThemeGenerator;
})();
