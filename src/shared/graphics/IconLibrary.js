'use strict';
// Theme-aware sprite renderer for validated declarative icon packs.
(() => {
const AppearancePacks = typeof module !== 'undefined' ? require('../domain/AppearancePacks') : globalThis.OrbitKanban.Domain.AppearancePacks;
class IconLibrary {
  static #palettes = {
    blue: ['#5ac8ff', '#2f6bff'], violet: ['#b490ff', '#6a4cff'], teal: ['#3ee0c5', '#0f9f9a'], amber: ['#ffcf4d', '#ff8a3d'],
    rose: ['#ff8fb1', '#e5487f'], green: ['#7ee081', '#22a35a'], slate: ['#a9b6cc', '#5d6b82'], accent: ['#b9a8ff', '#7a63f0']
  };
  static #icons = typeof module !== 'undefined' ? AppearancePacks.validate(require('../../../resources/packs/orbit-icons.json'), 'icons').packs[0].icons : {};
  static #LAYER_STYLE = {
    b: () => 'fill:var(--ico-back);fill-opacity:var(--ico-back-op,.38)',
    f: () => 'fill:var(--ico-front)',
    r: () => 'fill:var(--ico-front);stroke:var(--ico-front);stroke-width:1.4;stroke-linejoin:round',
    d: () => 'fill:var(--ico-detail)',
    ds: width => `fill:none;stroke:var(--ico-detail);stroke-width:${width || 1.6};stroke-linecap:round;stroke-linejoin:round`,
    s: width => `fill:none;stroke:var(--ico-front);stroke-width:${width || 2};stroke-linecap:round;stroke-linejoin:round`,
    bs: width => `fill:none;stroke:var(--ico-back);stroke-opacity:var(--ico-back-op,.38);stroke-width:${width || 2};stroke-linecap:round;stroke-linejoin:round`,
    line: () => 'fill:none;stroke:var(--ico-line,currentColor);stroke-width:var(--ico-stroke,2);stroke-linecap:round;stroke-linejoin:round'
  };
  static configure(catalog, selection = 'default', documentRef) {
    const source = catalog.sources.find(source => source.kind === 'icons' && source.repository === AppearancePacks.OFFICIAL[0].repository);
    if (!source?.manifest) throw new Error('The default icon pack is unavailable.');
    const defaults = AppearancePacks.validate(source.manifest, 'icons').packs[0];
    let selected;
    for (const entry of catalog.sources.filter(entry => entry.kind === 'icons' && entry.manifest)) {
      for (const pack of AppearancePacks.validate(entry.manifest, 'icons').packs) {
        if (`${entry.repository}:${pack.id}` === selection) selected = pack;
      }
    }
    IconLibrary.#icons = { ...defaults.icons, ...(selected?.icons || {}) };
    if (documentRef) {
      documentRef.getElementById('orbit-icon-sprite')?.remove();
      IconLibrary.install(documentRef);
      documentRef.querySelectorAll('svg.ico').forEach(svg => {
        const name = svg.querySelector('use')?.getAttribute('href')?.slice(3);
        if (name && IconLibrary.#icons[name]) svg.outerHTML = IconLibrary.icon(name, svg.dataset.iconFamily);
      });
    }
    return selection === 'default' || Boolean(selected);
  }
  static names = () => Object.keys(IconLibrary.#icons);
  static spriteMarkup() {
    const gradients = Object.entries(IconLibrary.#palettes).map(([family, [from, to]]) => `<linearGradient id="ig-${family}" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--ig-${family}-1,${from})"/><stop offset="1" style="stop-color:var(--ig-${family}-2,${to})"/></linearGradient>`).join('');
    const symbols = Object.entries(IconLibrary.#icons).map(([name, icon]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${icon.layers.map(layer => {
      const shapes = layer.shapes.map(shape => {
        const attrs = Object.entries(shape.attrs).map(([key, value]) => key === 'fill' && value === 'pin' ? 'style="fill:var(--pin-fill,none)"' : `${key}="${value}"`).join(' ');
        return `<${shape.tag} ${attrs}/>`;
      }).join('');
      return `<g style="${IconLibrary.#LAYER_STYLE[layer.style](layer.width)}">${shapes}</g>`;
    }).join('')}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" id="orbit-icon-sprite" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${gradients}</defs>${symbols}</svg>`;
  }
  static icon(name, family) {
    const icon = IconLibrary.#icons[name];
    if (!icon) throw new Error(`Unknown icon: ${name}`);
    return `<svg class="ico ico-${icon.family === 'line' ? 'line' : IconLibrary.#palettes[family] ? family : icon.family}"${IconLibrary.#palettes[family] ? ` data-icon-family="${family}"` : ''} aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  }
  static install(documentRef = document) {
    if (documentRef.getElementById('orbit-icon-sprite')) return;
    const holder = documentRef.createElement('div');
    holder.innerHTML = IconLibrary.spriteMarkup();
    documentRef.body.prepend(holder.firstElementChild);
  }
  static families = Object.keys(IconLibrary.#palettes);
  static isLine(name) { return IconLibrary.#icons[name]?.family === 'line'; }
}
if (typeof module !== 'undefined') module.exports = IconLibrary;
else ((globalThis.OrbitKanban ??= {}).Graphics ??= {}).IconLibrary = IconLibrary;
})();
