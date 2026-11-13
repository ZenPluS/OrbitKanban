'use strict';
// Public, declarative appearance packages. No scripts, URLs or arbitrary SVG attributes are accepted.
(() => {
class AppearancePacks {
  static OFFICIAL = [
    { kind: 'icons', repository: 'zenplus/orbit_icons' },
    { kind: 'themes', repository: 'zenplus/orbit_themes' }
  ];
  static #id = /^[a-z][a-z0-9-]{0,79}$/;
  static #color = /^#[0-9a-f]{6}$/i;
  static #families = ['line', 'blue', 'violet', 'teal', 'amber', 'rose', 'green', 'slate', 'accent'];
  static #assert(value, message = 'Invalid appearance pack.') { if (!value) throw new Error(message); }
  static repository(input) {
    AppearancePacks.#assert(typeof input === 'string', 'Enter a public GitHub repository as owner/repository.');
    const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(input.trim());
    AppearancePacks.#assert(match && !['.', '..'].includes(match[2]), 'Enter a public GitHub repository as owner/repository.');
    return `${match[1]}/${match[2]}`.toLowerCase();
  }
  static sources(sources = []) {
    AppearancePacks.#assert(Array.isArray(sources) && sources.length <= 20, 'Too many appearance repositories.');
    const result = AppearancePacks.OFFICIAL.map(source => ({ ...source }));
    for (const source of sources) {
      AppearancePacks.#assert(source && ['icons', 'themes'].includes(source.kind), 'Invalid appearance repository.');
      const repository = AppearancePacks.repository(source.repository);
      if (!result.some(item => item.kind === source.kind && item.repository === repository)) result.push({ kind: source.kind, repository });
    }
    return result;
  }
  static validateTheme(theme) {
    return theme && typeof theme.id === 'string' && AppearancePacks.#id.test(theme.id) && typeof theme.name === 'string' && theme.name.trim() && theme.name.length <= 100 &&
      ['background', 'surface', 'text', 'accent'].every(key => typeof theme[key] === 'string' && AppearancePacks.#color.test(theme[key]));
  }
  static validateSettings(settings) {
    if (settings.packSources !== undefined) AppearancePacks.sources(settings.packSources);
    AppearancePacks.#assert(settings.iconPack === undefined || settings.iconPack === 'default' ||
      (typeof settings.iconPack === 'string' && /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9_.-]+:[a-z][a-z0-9-]{0,79}$/.test(settings.iconPack)), 'Invalid icon pack selection.');
    if (settings.packThemeBases !== undefined) {
      AppearancePacks.#assert(settings.packThemeBases && typeof settings.packThemeBases === 'object' && !Array.isArray(settings.packThemeBases), 'Invalid appearance theme history.');
      for (const [id, base] of Object.entries(settings.packThemeBases)) {
        AppearancePacks.#assert(/^[a-z0-9][a-z0-9_./:-]{0,301}$/.test(id) && base?.id === id && AppearancePacks.validateTheme({ ...base, id: 'base' }), 'Invalid appearance theme history.');
      }
    }
  }
  static #shape(shape) {
    AppearancePacks.#assert(shape && ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(shape.tag) &&
      shape.attrs && typeof shape.attrs === 'object' && !Array.isArray(shape.attrs));
    const attrs = {};
    for (const [key, value] of Object.entries(shape.attrs)) {
      if (key === 'd') AppearancePacks.#assert(typeof value === 'string' && value.length <= 20000 && /^[MmZzLlHhVvCcSsQqTtAa0-9.,+\-\seE]+$/.test(value));
      else if (key === 'points') AppearancePacks.#assert(typeof value === 'string' && value.length <= 20000 && /^[0-9.,+\-\seE]+$/.test(value));
      else if (key === 'fill') AppearancePacks.#assert(['none', 'currentColor', 'pin'].includes(value));
      else {
        AppearancePacks.#assert(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width'].includes(key) &&
          typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000);
      }
      attrs[key] = value;
    }
    AppearancePacks.#assert(Object.keys(attrs).length > 0 && (shape.tag !== 'path' || typeof attrs.d === 'string'));
    return { tag: shape.tag, attrs };
  }
  static validate(input, kind) {
    AppearancePacks.#assert(['icons', 'themes'].includes(kind) && input?.format === `orbitkanban-${kind}` && input.version === 1 &&
      Array.isArray(input.packs) && input.packs.length > 0 && input.packs.length <= 30);
    const packs = input.packs.map(pack => {
      AppearancePacks.#assert(pack && typeof pack.id === 'string' && AppearancePacks.#id.test(pack.id) && typeof pack.name === 'string' && pack.name.trim() && pack.name.length <= 100);
      const result = { id: pack.id, name: pack.name.trim() };
      if (kind === 'themes') {
        AppearancePacks.#assert(Array.isArray(pack.themes) && pack.themes.length > 0 && pack.themes.length <= 200 &&
          pack.themes.every(theme => AppearancePacks.validateTheme(theme)) && new Set(pack.themes.map(theme => theme.id)).size === pack.themes.length);
        result.themes = pack.themes.map(theme => Object.fromEntries(['id', 'name', 'background', 'surface', 'text', 'accent'].map(key => [key, theme[key]])));
      } else {
        AppearancePacks.#assert(pack.icons && typeof pack.icons === 'object' && !Array.isArray(pack.icons) &&
          Object.keys(pack.icons).length > 0 && Object.keys(pack.icons).length <= 300);
        result.icons = Object.fromEntries(Object.entries(pack.icons).map(([name, icon]) => {
          AppearancePacks.#assert(AppearancePacks.#id.test(name) && icon && AppearancePacks.#families.includes(icon.family) &&
            Array.isArray(icon.layers) && icon.layers.length > 0 && icon.layers.length <= 12);
          const layers = icon.layers.map(layer => {
            AppearancePacks.#assert(layer && ['b', 'f', 'r', 'd', 'ds', 's', 'bs', 'line'].includes(layer.style) &&
              (layer.width === undefined || (typeof layer.width === 'number' && layer.width > 0 && layer.width <= 8)) &&
              Array.isArray(layer.shapes) && layer.shapes.length > 0 && layer.shapes.length <= 64);
            return { style: layer.style, ...(layer.width === undefined ? {} : { width: layer.width }), shapes: layer.shapes.map(shape => AppearancePacks.#shape(shape)) };
          });
          return [name, { family: icon.family, layers }];
        }));
      }
      return result;
    });
    AppearancePacks.#assert(new Set(packs.map(pack => pack.id)).size === packs.length);
    return { format: input.format, version: 1, packs };
  }
  static themePresets(catalog) {
    const result = [];
    for (const source of catalog?.sources || []) {
      if (source.kind !== 'themes' || !source.manifest) continue;
      const official = source.repository === AppearancePacks.OFFICIAL[1].repository;
      for (const pack of AppearancePacks.validate(source.manifest, 'themes').packs) {
        for (const theme of pack.themes) result.push({ ...theme, id: official ? theme.id : `${source.repository}:${pack.id}:${theme.id}` });
      }
    }
    return result;
  }
  static mergeThemes(settings, catalog) {
    settings.packThemeBases ??= {};
    const saved = new Map(settings.themes.map(theme => [theme.id, theme]));
    const same = (a, b) => a && ['name', 'background', 'surface', 'text', 'accent'].every(key => a[key] === b[key]);
    for (const preset of AppearancePacks.themePresets(catalog)) {
      if (preset.id === 'midnight') continue;
      const current = saved.get(preset.id), base = settings.packThemeBases[preset.id];
      if (!current) { const theme = { ...preset }; settings.themes.push(theme); saved.set(theme.id, theme); }
      else if (same(current, base)) Object.assign(current, preset);
      settings.packThemeBases[preset.id] = { ...preset };
    }
  }
}
if (typeof module !== 'undefined') module.exports = AppearancePacks;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).AppearancePacks = AppearancePacks;
})();
