'use strict';
// Midnight is the sole embedded theme. Other presets come from external package snapshots.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;
const Limits = typeof module !== 'undefined' ? require('./Limits') : globalThis.OrbitKanban.Domain.Limits;
const AppearancePacks = typeof module !== 'undefined' ? require('./AppearancePacks') : globalThis.OrbitKanban.Domain.AppearancePacks;
class ThemeCatalog {
  static #external = typeof module !== 'undefined' ? AppearancePacks.validate(require('../../../resources/packs/orbit-themes.json'), 'themes').packs.flatMap(pack => pack.themes) : [];
  static defaultHighlights(language = 'it') {
    const T = text => { const value = Common.term(text, language).trim(); return value && value.length <= Limits.HIGHLIGHT_NAME_MAX ? value : text; };
    return [
      { id: 'highlight-yellow', name: T("Attention"), color: '#f2c94c' },
      { id: 'highlight-red', name: T("Blocker"), color: '#f0647a' },
      { id: 'highlight-blue', name: T("To discuss"), color: '#5aa9f6' },
      { id: 'highlight-green', name: T("Ready"), color: '#4fcf8f' }
    ];
  }
  static defaultThemes() {
    return [{ id: 'midnight', name: 'Midnight', background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#b39cff' }];
  }
  static setExternalThemes(themes) {
    if (!Array.isArray(themes) || !themes.every(theme => AppearancePacks.validateTheme(theme))) throw new Error('Invalid appearance pack.');
    ThemeCatalog.#external = structuredClone(themes);
  }
  static availableThemes() {
    return [...ThemeCatalog.defaultThemes(), ...structuredClone(ThemeCatalog.#external.filter(theme => theme.id !== 'midnight'))];
  }
  static modernThemeName(theme) { return theme.id === 'daylight' && theme.name === 'Luce' ? 'Daylight' : theme.name; }
  static normalizeThemes(settings) {
    for (const theme of settings.themes) theme.name = ThemeCatalog.modernThemeName(theme);
    const known = new Set(settings.themes.map(theme => theme.id));
    settings.themes.push(...ThemeCatalog.availableThemes().filter(theme => !known.has(theme.id)));
  }
}
if (typeof module !== 'undefined') module.exports = ThemeCatalog;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).ThemeCatalog = ThemeCatalog;
})();
