'use strict';
// Font families and the per-area font size scale chosen in Settings › Fonts.
(() => {
class Typography {
  static FONT_SIZE_PARTS = [
    { id: 'base', min: 80, max: 140 },
    { id: 'sidebar', min: 80, max: 130 },
    { id: 'headings', min: 80, max: 140 },
    { id: 'tables', min: 80, max: 150 },
    { id: 'milestones', min: 80, max: 150 },
    { id: 'kanban', min: 80, max: 150 },
    { id: 'dialogs', min: 80, max: 140 }
  ];
  static FONT_SIZE_STEP = 5;
  static FONT_FAMILIES = [
    { id: 'segoe', name: 'Segoe UI', css: '"Segoe UI", sans-serif' },
    { id: 'aptos', name: 'Aptos', css: 'Aptos, "Segoe UI", sans-serif' },
    { id: 'arial', name: 'Arial', css: 'Arial, sans-serif' },
    { id: 'calibri', name: 'Calibri', css: 'Calibri, "Segoe UI", sans-serif' },
    { id: 'verdana', name: 'Verdana', css: 'Verdana, sans-serif' },
    { id: 'tahoma', name: 'Tahoma', css: 'Tahoma, sans-serif' },
    { id: 'trebuchet', name: 'Trebuchet MS', css: '"Trebuchet MS", sans-serif' },
    { id: 'georgia', name: 'Georgia', css: 'Georgia, serif' },
    { id: 'consolas', name: 'Consolas', css: 'Consolas, monospace' },
    ...[
      ['roboto', 'Roboto'], ['inter', 'Inter'], ['opensans', 'Open Sans'], ['lato', 'Lato'],
      ['montserrat', 'Montserrat'], ['poppins', 'Poppins'], ['nunito', 'Nunito'], ['nunitosans', 'Nunito Sans'],
      ['raleway', 'Raleway'], ['rubik', 'Rubik'], ['worksans', 'Work Sans'], ['sourcesans3', 'Source Sans 3'],
      ['notosans', 'Noto Sans'], ['dmsans', 'DM Sans'], ['manrope', 'Manrope'], ['firasans', 'Fira Sans'],
      ['notoserif', 'Noto Serif', 'serif'], ['merriweather', 'Merriweather', 'serif'], ['lora', 'Lora', 'serif'],
      ['playfairdisplay', 'Playfair Display', 'serif'], ['sourceserif4', 'Source Serif 4', 'serif'],
      ['robotoslab', 'Roboto Slab', 'serif'], ['firacode', 'Fira Code', 'monospace'], ['jetbrainsmono', 'JetBrains Mono', 'monospace']
    ].map(([id, name, fallback = 'sans-serif']) => ({ id, name, css: `${name.includes(' ') ? `"${name}"` : name}, ${fallback}`, bundled: true }))
  ];
  static DEFAULT_FONT_FAMILY = 'segoe';
  static validFontFamily = value => Typography.FONT_FAMILIES.some(font => font.id === value);
  static defaultFontSizes = () => Object.fromEntries(Typography.FONT_SIZE_PARTS.map(part => [part.id, 100]));
  static validFontSizes(sizes) {
    return Boolean(sizes) && typeof sizes === 'object' && !Array.isArray(sizes) && Object.keys(sizes).length === Typography.FONT_SIZE_PARTS.length
      && Typography.FONT_SIZE_PARTS.every(({ id, min, max }) => Number.isInteger(sizes[id]) && sizes[id] >= min && sizes[id] <= max);
  }
  static clampFontSize(partId, value) {
    const part = Typography.FONT_SIZE_PARTS.find(item => item.id === partId);
    const stepped = Math.round(Number(value) / Typography.FONT_SIZE_STEP) * Typography.FONT_SIZE_STEP;
    return Number.isFinite(stepped) ? Math.min(part.max, Math.max(part.min, stepped)) : 100;
  }
}

if (typeof module !== 'undefined') module.exports = Typography;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).Typography = Typography;
})();
