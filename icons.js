(function () {
'use strict';
// Interface icons: one hidden SVG sprite with per-theme gradients (colors come from CSS variables set by paintTheme).
// Feature icons are filled duotone shapes with light or dark inner details; line icons are single-color strokes.
const FAMILY_FALLBACK = {
  blue: ['#5ac8ff', '#2f6bff'], violet: ['#b490ff', '#6a4cff'], teal: ['#3ee0c5', '#0f9f9a'], amber: ['#ffcf4d', '#ff8a3d'],
  rose: ['#ff8fb1', '#e5487f'], green: ['#7ee081', '#22a35a'], slate: ['#a9b6cc', '#5d6b82'], accent: ['#b9a8ff', '#7a63f0']
};
const families = { ...FAMILY_FALLBACK, ...(typeof window !== 'undefined' && window.OrbitaCore?.ICON_FAMILIES || {}) };
const round = value => Math.round(value * 100) / 100;
function gearPath(cx, cy, outer, inner, teeth) {
  const step = Math.PI * 2 / teeth, points = [];
  for (let i = 0; i < teeth; i++) {
    const angle = i * step - Math.PI / 2;
    for (const [radius, offset] of [[inner, -0.3], [outer, -0.17], [outer, 0.17], [inner, 0.3]]) {
      points.push(`${round(cx + radius * Math.cos(angle + offset * step))} ${round(cy + radius * Math.sin(angle + offset * step))}`);
    }
  }
  return `M${points.join('L')}Z`;
}
const gear = gearPath(12, 12, 10.2, 7.4, 8);
// Layers: b = translucent back shape, f = gradient body, r = body with rounded joins, d = inner detail, ds = detail stroke, s = gradient stroke.
const FEATURE = {
  tasks: ['blue', [['b', '<rect x="6.5" y="2" width="15" height="17" rx="3.5"/>'], ['f', '<rect x="2.5" y="5" width="15" height="17" rx="3.5"/>'], ['ds', '<path d="M6 11.3l1.5 1.5 2.8-3M6 17.3l1.5 1.5 2.8-3M12.6 11.4h2M12.6 17.4h2"/>']]],
  link: ['violet', [['bs', '<path d="M10.4 13.6a4 4 0 0 1 0-5.6l2.9-2.9a4 4 0 0 1 5.6 5.6l-1.4 1.4"/>', 2.8], ['s', '<path d="M13.6 10.4a4 4 0 0 1 0 5.6l-2.9 2.9a4 4 0 0 1-5.6-5.6l1.4-1.4"/>', 2.8]]],
  flag: ['amber', [['b', '<rect x="3.6" y="2.5" width="2.8" height="19.5" rx="1.4"/>'], ['r', '<path d="M7.8 4.3c2.5-1.4 4.8-1.4 7 0 1.8 1.1 3.6 1.2 5.6.3.4-.2.9.1.9.6v8.3c0 .4-.2.7-.6.9-2 .9-4 .8-5.9-.4-2.2-1.4-4.5-1.4-7 0z"/>']]],
  kanban: ['teal', [['b', '<rect x="2.5" y="3" width="19" height="18" rx="4"/>'], ['f', '<rect x="5" y="5.8" width="4" height="12.4" rx="1.4"/><rect x="10" y="5.8" width="4" height="8" rx="1.4"/><rect x="15" y="5.8" width="4" height="10.2" rx="1.4"/>']]],
  settings: ['slate', [['r', `<path d="${gear}"/>`], ['d', '<circle cx="12" cy="12" r="3.3"/>']]],
  id: ['blue', [['f', '<rect x="2" y="4.5" width="20" height="15" rx="3.5"/>'], ['d', '<circle cx="8.2" cy="10.3" r="2.3"/><path d="M4.8 16.2c.5-2 1.8-3 3.4-3s2.9 1 3.4 3z"/><rect x="13.3" y="8.8" width="5.6" height="1.9" rx=".95"/><rect x="13.3" y="12.8" width="4" height="1.9" rx=".95"/>']]],
  translate: ['teal', [['b', '<rect x="8.5" y="8" width="13.5" height="13" rx="3.2"/>'], ['s', '<path d="M12.3 12.6h6.4M15.5 11.2v1.4M17.6 12.6c-.6 2.4-2.1 4.1-4.5 5M14.4 14.6c.9 1.3 2.2 2.3 3.9 2.9"/>', 1.5], ['r', '<path d="M5 2.5h8a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H8.6l-3.4 2.7c-.4.3-.9 0-.9-.4v-2.5A2.5 2.5 0 0 1 2.5 11V5A2.5 2.5 0 0 1 5 2.5z"/>'], ['ds', '<path d="M6.4 11l2.6-6 2.6 6M7.4 9h3.2"/>', 1.5]]],
  portal: ['blue', [['b', '<rect x="2.5" y="5.5" width="16" height="16" rx="3.5"/>'], ['f', '<circle cx="17" cy="7" r="5.5"/>'], ['ds', '<path d="M15 9l4-4M16.1 5h2.9v2.9"/>', 1.6]]],
  building: ['violet', [['b', '<rect x="13" y="8" width="8.5" height="13.5" rx="2.2"/>'], ['f', '<path d="M5 2.5h7A2.5 2.5 0 0 1 14.5 5v16.5h-12V5A2.5 2.5 0 0 1 5 2.5z"/>'], ['d', '<rect x="5.4" y="6" width="2.2" height="2.2" rx=".6"/><rect x="9.4" y="6" width="2.2" height="2.2" rx=".6"/><rect x="5.4" y="10" width="2.2" height="2.2" rx=".6"/><rect x="9.4" y="10" width="2.2" height="2.2" rx=".6"/><rect x="5.4" y="14" width="2.2" height="2.2" rx=".6"/><rect x="9.4" y="14" width="2.2" height="2.2" rx=".6"/>']]],
  palette: ['rose', [['f', '<path d="M12 2.5c-5.5 0-9.5 4-9.5 9.3 0 5.4 4.3 9.7 9.4 9.7 1.6 0 2.6-.9 2.6-2.2 0-.6-.3-1.1-.6-1.5-.3-.4-.6-.9-.6-1.5 0-1.2 1-2.1 2.2-2.1h2.3c2.6 0 4.7-2.1 4.7-4.7C22.5 6.2 17.9 2.5 12 2.5z"/>'], ['d', '<circle cx="7.2" cy="12.4" r="1.6"/><circle cx="8.6" cy="7.6" r="1.6"/><circle cx="13.2" cy="6.2" r="1.6"/><circle cx="17.3" cy="8.9" r="1.6"/>']]],
  font: ['violet', [['bs', '<circle cx="18" cy="16.4" r="3.3"/><path d="M21.3 12.8v7.6"/>', 2.2], ['s', '<path d="M2.8 20.3 8.6 4.2l5.8 16.1M5 14.4h7.2"/>', 2.6]]],
  list: ['teal', [['b', '<rect x="9" y="4.5" width="12.5" height="3.4" rx="1.7"/><rect x="9" y="10.3" width="12.5" height="3.4" rx="1.7"/><rect x="9" y="16.1" width="12.5" height="3.4" rx="1.7"/>'], ['f', '<circle cx="4.8" cy="6.2" r="2.3"/><circle cx="4.8" cy="12" r="2.3"/><circle cx="4.8" cy="17.8" r="2.3"/>']]],
  flame: ['rose', [['f', '<path d="M12.2 2.3c.7 3.1-1.7 4.8-3.4 6.8-1.3 1.6-2.3 3.4-2.3 5.6 0 3.8 2.5 7 5.5 7s5.5-3.2 5.5-7c0-2.4-1-4.4-2.4-5.9-.2 1.4-1 2.6-2.1 3 .6-3.1-.1-6.5-.8-9.5z"/>'], ['d', '<path d="M12 13.2c1.6 1.3 2.6 2.7 2.6 4.2a2.6 2.6 0 0 1-5.2 0c0-1.5 1-2.9 2.6-4.2z"/>']]],
  highlighter: ['amber', [['b', '<rect x="2.5" y="19" width="19" height="3" rx="1.5"/>'], ['r', '<path d="M15.9 3.3a2.2 2.2 0 0 1 3.1 0l1.7 1.7a2.2 2.2 0 0 1 0 3.1L11 17.8H6.2v-4.8z"/>'], ['ds', '<path d="M8.6 10.6l4.8 4.8"/>', 1.4]]],
  tag: ['green', [['f', '<path d="M3 5.5V11c0 .7.3 1.3.7 1.8l7.6 7.6a2.4 2.4 0 0 0 3.4 0l5.7-5.7a2.4 2.4 0 0 0 0-3.4L12.8 3.7A2.5 2.5 0 0 0 11 3H5.5A2.5 2.5 0 0 0 3 5.5z"/>'], ['d', '<circle cx="7.7" cy="7.7" r="1.9"/>']]],
  columns: ['blue', [['b', '<rect x="2.5" y="3.5" width="19" height="17" rx="3.5"/>'], ['f', '<rect x="5" y="6" width="3.6" height="12" rx="1.2"/><rect x="10.2" y="6" width="3.6" height="12" rx="1.2"/><rect x="15.4" y="6" width="3.6" height="12" rx="1.2"/>']]],
  'column-plus': ['violet', [['b', '<rect x="2.5" y="3.5" width="14" height="17" rx="3.2"/>'], ['f', '<rect x="5" y="6" width="3.4" height="12" rx="1.2"/><rect x="10.3" y="6" width="3.4" height="7.5" rx="1.2"/><circle cx="17.5" cy="17" r="5"/>'], ['ds', '<path d="M17.5 14.6v4.8M15.1 17h4.8"/>', 1.7]]],
  transfer: ['teal', [['b', '<path d="M16 21l-4.6-4.6c-.5-.5-.1-1.3.6-1.3h2.4V4.1a1.6 1.6 0 0 1 3.2 0v11H20c.7 0 1.1.8.6 1.3z"/>'], ['f', '<path d="M8 3l4.6 4.6c.5.5.1 1.3-.6 1.3H9.6v11a1.6 1.6 0 0 1-3.2 0v-11H4c-.7 0-1.1-.8-.6-1.3z"/>']]],
  database: ['slate', [['b', '<path d="M4 6v12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V6z"/>'], ['s', '<path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5"/>', 1.8], ['f', '<ellipse cx="12" cy="6" rx="8" ry="3.5"/>']]],
  globe: ['blue', [['f', '<circle cx="12" cy="12" r="9.5"/>'], ['ds', '<path d="M2.9 12h18.2M12 2.6c2.5 2.6 3.8 5.7 3.8 9.4s-1.3 6.8-3.8 9.4M12 2.6C9.5 5.2 8.2 8.3 8.2 12s1.3 6.8 3.8 9.4"/>', 1.4]]],
  folder: ['amber', [['b', '<path d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.2c.7 0 1.3.3 1.8.8l1.5 1.7H19A2.5 2.5 0 0 1 21.5 9v1h-19z"/>'], ['f', '<path d="M2.5 9.5h19V18a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18z"/>']]],
  warning: ['amber', [['r', '<path d="M10.3 3.7a2 2 0 0 1 3.4 0l8 13.9a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3z"/>'], ['d', '<rect x="10.9" y="8.4" width="2.2" height="6.6" rx="1.1"/><circle cx="12" cy="17.6" r="1.3"/>']]],
  star: ['amber', [['r', '<path d="M12 2.9l2.7 5.5 6.1.9-4.4 4.2 1 6.1L12 16.7l-5.4 2.9 1-6.1-4.4-4.2 6.1-.9z"/>']]],
  lock: ['slate', [['s', '<path d="M7.6 10.5V8a4.4 4.4 0 0 1 8.8 0v2.5"/>', 2.4], ['f', '<rect x="4.5" y="10" width="15" height="11.5" rx="3"/>'], ['d', '<circle cx="12" cy="14.9" r="1.8"/><rect x="11.2" y="15" width="1.6" height="3.4" rx=".8"/>']]],
  excel: ['green', [['b', '<rect x="7" y="2.5" width="14.5" height="19" rx="3"/>'], ['s', '<path d="M14.3 7.5h4.2M14.3 12h4.2M14.3 16.5h4.2"/>', 1.5], ['f', '<rect x="2.5" y="6.5" width="11" height="11" rx="2.6"/>'], ['ds', '<path d="M5.8 9.7l4.4 4.6M10.2 9.7l-4.4 4.6"/>', 1.7]]],
  import: ['teal', [['b', '<path d="M2.5 14.5h4.3c.6 0 1.1.4 1.3 1l.4 1.2c.2.6.7 1 1.3 1h4.4c.6 0 1.1-.4 1.3-1l.4-1.2c.2-.6.7-1 1.3-1h4.3V18a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z"/>'], ['f', '<path d="M12 2.5c.8 0 1.5.7 1.5 1.5v6.4l1.9-1.9a1.5 1.5 0 0 1 2.1 2.1L13 15.1a1.5 1.5 0 0 1-2.1 0l-4.5-4.5a1.5 1.5 0 0 1 2.1-2.1l1.9 1.9V4c0-.8.7-1.5 1.5-1.5z"/>']]],
  export: ['teal', [['b', '<path d="M2.5 14.5h4.3c.6 0 1.1.4 1.3 1l.4 1.2c.2.6.7 1 1.3 1h4.4c.6 0 1.1-.4 1.3-1l.4-1.2c.2-.6.7-1 1.3-1h4.3V18a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z"/>'], ['f', '<path d="M12 14.5c.8 0 1.5-.7 1.5-1.5V6.6l1.9 1.9a1.5 1.5 0 0 0 2.1-2.1L13 1.9a1.5 1.5 0 0 0-2.1 0L6.4 6.4a1.5 1.5 0 0 0 2.1 2.1l1.9-1.9V13c0 .8.7 1.5 1.5 1.5z"/>']]],
  sparkle: ['accent', [['r', '<path d="M10 3.2l1.2 4.2c.3 1.1 1.2 2 2.3 2.3l4.2 1.2-4.2 1.2c-1.1.3-2 1.2-2.3 2.3L10 18.6l-1.2-4.2c-.3-1.1-1.2-2-2.3-2.3L2.3 10.9l4.2-1.2c1.1-.3 2-1.2 2.3-2.3z"/>'], ['b', '<path d="M18.5 2.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>']]],
  eraser: ['rose', [['b', '<path d="M3.6 13.6a2.2 2.2 0 0 1 0-3.1l2.3-2.3 8.7 8.7-1.9 1.9H8.3z"/>'], ['r', '<path d="M13.6 3.6a2.2 2.2 0 0 1 3.1 0l3.7 3.7a2.2 2.2 0 0 1 0 3.1l-5.8 5.8-8.7-8.7z"/>'], ['s', '<path d="M12.5 20.6h8"/>', 2]]],
  clock: ['amber', [['f', '<circle cx="12" cy="12" r="9.5"/>'], ['ds', '<path d="M12 7v5.2l3.4 2"/>', 1.9]]],
  diamond: ['accent', [['r', '<path d="M12 3.2l8.8 8.8-8.8 8.8L3.2 12z"/>'], ['d', '<path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12z"/>']]],
  book: ['rose', [['b', '<path d="M11.2 6.3C9.3 4.9 6.8 4.3 3.8 4.4c-.7 0-1.3.6-1.3 1.3v11.7c0 .7.6 1.3 1.3 1.3 2.9-.1 5.3.5 7.4 1.9z"/>'], ['r', '<path d="M12.8 6.3c1.9-1.4 4.4-2 7.4-1.9.7 0 1.3.6 1.3 1.3v11.7c0 .7-.6 1.3-1.3 1.3-2.9-.1-5.3.5-7.4 1.9z"/>'], ['ds', '<path d="M15.3 9.4c1.2-.4 2.4-.5 3.6-.4M15.3 12.9c1.2-.4 2.4-.5 3.6-.4"/>', 1.5]]],
  keyboard: ['slate', [['f', '<rect x="2" y="5.5" width="20" height="13" rx="3"/>'], ['d', '<rect x="5" y="8.4" width="2.2" height="2" rx=".6"/><rect x="8.6" y="8.4" width="2.2" height="2" rx=".6"/><rect x="12.2" y="8.4" width="2.2" height="2" rx=".6"/><rect x="15.8" y="8.4" width="3.2" height="2" rx=".6"/><rect x="5" y="11.8" width="3.2" height="2" rx=".6"/><rect x="9.6" y="11.8" width="2.2" height="2" rx=".6"/><rect x="13.2" y="11.8" width="2.2" height="2" rx=".6"/><rect x="16.8" y="11.8" width="2.2" height="2" rx=".6"/><rect x="7.5" y="15.2" width="9" height="1.8" rx=".9"/>']]]
};
const LINE = {
  search: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="M15.3 15.3l5 5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" style="stroke-width:3.2"/>',
  'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  sort: '<path d="M8 19V5M4 9l4-4 4 4M16 5v14M12 15l4 4 4-4"/>',
  filter: '<path d="M4 5.2h16l-6.2 7.4v5.6l-3.6 1.6v-7.2z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v3.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6H10"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3.1M6.7 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  reset: '<path d="M4 4v5h5"/><path d="M4.7 14a7.8 7.8 0 1 0 1.9-8.1L4 8.6"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2.9 2.9 0 0 0-4.2-4.2L4 15.8z"/><path d="m13.4 6.4 4.2 4.2"/>',
  'arrow-in': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  'arrow-out': '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  'arrows-h': '<path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18"/>',
  'star-line': '<path d="M12 3.4l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.7l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  gear: `<path d="${gearPath(12, 12, 9.4, 6.9, 8)}"/><circle cx="12" cy="12" r="2.9"/>`
};
const LAYER_STYLE = {
  b: () => 'fill:var(--ico-back);fill-opacity:var(--ico-back-op,.38)',
  f: () => 'fill:var(--ico-front)',
  r: () => 'fill:var(--ico-front);stroke:var(--ico-front);stroke-width:1.4;stroke-linejoin:round',
  d: () => 'fill:var(--ico-detail)',
  ds: width => `fill:none;stroke:var(--ico-detail);stroke-width:${width || 1.6};stroke-linecap:round;stroke-linejoin:round`,
  s: width => `fill:none;stroke:var(--ico-front);stroke-width:${width || 2};stroke-linecap:round;stroke-linejoin:round`,
  bs: width => `fill:none;stroke:var(--ico-back);stroke-opacity:var(--ico-back-op,.38);stroke-width:${width || 2};stroke-linecap:round;stroke-linejoin:round`
};
const names = () => [...Object.keys(FEATURE), ...Object.keys(LINE)];
function spriteMarkup() {
  const gradients = Object.entries(families).map(([family, [from, to]]) => `<linearGradient id="ig-${family}" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--ig-${family}-1,${from})"/><stop offset="1" style="stop-color:var(--ig-${family}-2,${to})"/></linearGradient>`).join('');
  const feature = Object.entries(FEATURE).map(([name, [, layers]]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${layers.map(([layer, shapes, width]) => `<g style="${LAYER_STYLE[layer](width)}">${shapes}</g>`).join('')}</symbol>`).join('');
  const line = Object.entries(LINE).map(([name, shapes]) => `<symbol id="i-${name}" viewBox="0 0 24 24"><g style="fill:none;stroke:var(--ico-line,currentColor);stroke-width:var(--ico-stroke,2);stroke-linecap:round;stroke-linejoin:round">${shapes}</g></symbol>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" id="orbit-icon-sprite" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${gradients}</defs>${feature}${line}</svg>`;
}
// Feature icons take their own color family unless another one is requested; line icons follow the text color.
function icon(name, family) {
  if (LINE[name]) return `<svg class="ico ico-line" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  if (!FEATURE[name]) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="ico ico-${families[family] ? family : FEATURE[name][0]}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}
function install(documentRef = document) {
  if (documentRef.getElementById('orbit-icon-sprite')) return;
  const holder = documentRef.createElement('div');
  holder.innerHTML = spriteMarkup();
  documentRef.body.prepend(holder.firstElementChild);
}
const api = { icon, install, names, spriteMarkup, families: Object.keys(families), isLine: name => Boolean(LINE[name]) };
if (typeof module !== 'undefined') module.exports = api;
else {
  window.OrbitaIcons = api;
  install();
}
})();
