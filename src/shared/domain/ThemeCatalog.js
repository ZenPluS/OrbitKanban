'use strict';
// Built-in themes and highlight colors, and normalization of saved themes.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;
const Limits = typeof module !== 'undefined' ? require('./Limits') : globalThis.OrbitKanban.Domain.Limits;

class ThemeCatalog {
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
    return [
      { id: 'midnight', name: 'Midnight', background: '#10131c', surface: '#191d2a', text: '#edf0fa', accent: '#b39cff' },
      { id: 'ocean', name: 'Ocean', background: '#082032', surface: '#103b50', text: '#e8f1f5', accent: '#00b4d8' },
      { id: 'daylight', name: 'Daylight', background: '#eef0f7', surface: '#ffffff', text: '#252a42', accent: '#6953d9' },
      { id: 'aurora', name: 'Aurora', background: '#0e1a1f', surface: '#16262d', text: '#e6f4f1', accent: '#62d6a6' },
      { id: 'monokai', name: 'Monokai', background: '#272822', surface: '#3e3d32', text: '#f8f8f2', accent: '#ff8ab4' },
      { id: 'dracula', name: 'Dracula', background: '#282a36', surface: '#343746', text: '#f8f8f2', accent: '#bd93f9' },
      { id: 'nord', name: 'Nord', background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' },
      { id: 'solarized-dark', name: 'Solarized Dark', background: '#002b36', surface: '#073642', text: '#eee8d5', accent: '#2aa8e8' },
      { id: 'solarized-light', name: 'Solarized Light', background: '#fdf6e3', surface: '#eee8d5', text: '#073642', accent: '#006b9f' },
      { id: 'gruvbox-dark', name: 'Gruvbox Dark', background: '#282828', surface: '#3c3836', text: '#ebdbb2', accent: '#fabd2f' },
      { id: 'gruvbox-light', name: 'Gruvbox Light', background: '#fbf1c7', surface: '#ebdbb2', text: '#3c3836', accent: '#8b4f00' },
      { id: 'tokyo-night', name: 'Tokyo Night', background: '#1a1b26', surface: '#24283b', text: '#c0caf5', accent: '#7aa2f7' },
      { id: 'one-dark', name: 'One Dark', background: '#282c34', surface: '#353b45', text: '#abb2bf', accent: '#61afef' },
      { id: 'material-ocean', name: 'Material Ocean', background: '#0f111a', surface: '#1b1e2b', text: '#d0d0d0', accent: '#82aaff' },
      { id: 'github-light', name: 'GitHub Light', background: '#ffffff', surface: '#f6f8fa', text: '#24292f', accent: '#0969da' },
      { id: 'github-dark', name: 'GitHub Dark', background: '#0d1117', surface: '#161b22', text: '#e6edf3', accent: '#2f81f7' },
      { id: 'synthwave', name: 'Synthwave', background: '#241b2f', surface: '#342542', text: '#f8e9ff', accent: '#ff7edb' },
      { id: 'ayu-dark', name: 'Ayu Dark', background: '#0b0e14', surface: '#11151c', text: '#bfbdb6', accent: '#e6b450' },
      { id: 'everforest', name: 'Everforest', background: '#2d353b', surface: '#343f44', text: '#d3c6aa', accent: '#a7c080' },
      { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', background: '#1e1e2e', surface: '#313244', text: '#cdd6f4', accent: '#cba6f7' },
      { id: 'rose-pine', name: 'Rosé Pine', background: '#191724', surface: '#26233a', text: '#e0def4', accent: '#ebbcba' },
      { id: 'forest', name: 'Forest', background: '#14251c', surface: '#20382b', text: '#e6f0e8', accent: '#7fb069' },
      { id: 'paper', name: 'Paper', background: '#f3f1eb', surface: '#ffffff', text: '#30352f', accent: '#40624a' },
      { id: 'pearl', name: 'Pearl', background: '#f0f2f5', surface: '#ffffff', text: '#293444', accent: '#425a9e' },
      { id: 'sandstone', name: 'Sandstone', background: '#f5ebdf', surface: '#fff9f1', text: '#49382b', accent: '#99502d' },
      { id: 'mist', name: 'Mist', background: '#e8f0f2', surface: '#f8fcfd', text: '#253e48', accent: '#206879' },
      { id: 'sage-light', name: 'Sage Light', background: '#eaf0e5', surface: '#f8fcf5', text: '#30402d', accent: '#4d702f' },
      { id: 'lavender-light', name: 'Lavender Light', background: '#eeeaf7', surface: '#faf8ff', text: '#3d3455', accent: '#7450a2' },
      { id: 'rose-quartz', name: 'Rose Quartz', background: '#f7e9ec', surface: '#fff7f9', text: '#51343f', accent: '#a23b66' },
      { id: 'iceberg', name: 'Iceberg', background: '#e8f0fa', surface: '#f7fbff', text: '#273a53', accent: '#2762a6' },
      { id: 'mint', name: 'Mint', background: '#e5f2ee', surface: '#f6fffb', text: '#23463c', accent: '#16765c' },
      { id: 'graphite', name: 'Graphite', background: '#1d2024', surface: '#292e34', text: '#e4e8ed', accent: '#afc4d9' },
      { id: 'obsidian', name: 'Obsidian', background: '#121214', surface: '#222226', text: '#eeeef2', accent: '#dfba73' },
      { id: 'deep-space', name: 'Deep Space', background: '#0d1528', surface: '#192640', text: '#e2ecff', accent: '#8ab8ff' },
      { id: 'blue-hour', name: 'Blue Hour', background: '#20243a', surface: '#303750', text: '#e2e6fa', accent: '#a8a0ff' },
      { id: 'copper', name: 'Copper', background: '#241c19', surface: '#352a25', text: '#f3e5dc', accent: '#eba578' },
      { id: 'plum', name: 'Plum', background: '#261b2e', surface: '#392940', text: '#f1e2f5', accent: '#dba0eb' },
      { id: 'burgundy', name: 'Burgundy', background: '#291a21', surface: '#3c2732', text: '#f6e5eb', accent: '#f299b7' },
      { id: 'desert-night', name: 'Desert Night', background: '#28251e', surface: '#39352b', text: '#f3ecd8', accent: '#dfc17a' },
      { id: 'emerald', name: 'Emerald', background: '#10251f', surface: '#1c3830', text: '#e0f4ec', accent: '#60d5ac' }
    ];
  }
  // Built-in themes renamed when the source moved to English: saved copies keep their colors and only lose the old default name.
  static #LEGACY_THEME_NAMES = { daylight: 'Luce' };
  static modernThemeName(theme) {
    return ThemeCatalog.#LEGACY_THEME_NAMES[theme.id] === theme.name ? ThemeCatalog.defaultThemes().find(preset => preset.id === theme.id).name : theme.name;
  }
  static normalizeThemes(settings) {
    for (const theme of settings.themes) theme.name = ThemeCatalog.modernThemeName(theme);
    // Append new presets without replacing saved palettes, their order or the active theme.
    const known = new Set(settings.themes.map(theme => theme.id));
    settings.themes.push(...ThemeCatalog.defaultThemes().filter(theme => !known.has(theme.id)));
  }
}

if (typeof module !== 'undefined') module.exports = ThemeCatalog;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).ThemeCatalog = ThemeCatalog;
})();
