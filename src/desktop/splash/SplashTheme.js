'use strict';
// Colors and logo of the loading screen, kept in data/runtime/splash-theme.css so the next start opens in the organization theme.
// The portable launcher shows splash.html before the app (and Chromium) exists, so the theme is a plain style sheet it can copy from disk.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { AppLogo, ColorMath } = require('../../shared/graphics');

class SplashTheme {
  static FILE_NAME = 'splash-theme.css';
  // Midnight, the default theme: splash.html carries the same colors for the first start, before any theme is saved.
  static DEFAULT_THEME = AppLogo.DEFAULT_THEME;
  // Same rules as ArchiveValidator: the logo is inserted into a CSS url("…"), so only base64 characters may reach it.
  static #LOGO = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
  static #MAX_LOGO = 1500000;
  static #MAX_FILE = 3 * 1024 * 1024;
  static #HEADER = /^\/\* OrbitKanban splash theme v1 background=(#[0-9a-f]{6}) \*\/\r?\n/;

  static theme(settings) {
    return AppLogo.theme(settings?.themes?.find?.(item => item?.id === settings.themeId));
  }
  // Flat colors for the page; the atom takes the same themed colors as the app icon.
  static palette(settings) {
    const theme = SplashTheme.theme(settings), { background, text } = theme;
    let muted = text;
    for (let weight = 0.55; weight < 1; weight += 0.05) {
      const candidate = AppLogo.mix(background, text, weight);
      if (ColorMath.contrastRatio(candidate, background) >= ColorMath.WCAG_TEXT_CONTRAST) { muted = candidate; break; }
    }
    return { background, text, muted, line: AppLogo.mix(background, text, 0.1), ...AppLogo.palette(theme) };
  }
  static logo(settings) {
    const logo = settings?.logo;
    return typeof logo === 'string' && logo.length <= SplashTheme.#MAX_LOGO && SplashTheme.#LOGO.test(logo) ? logo : '';
  }
  // Plain CSS 2 selectors and properties: the launcher renders the page with the Windows HTML engine (IE11 mode), without custom properties.
  static css(settings) {
    const colors = SplashTheme.palette(settings), logo = SplashTheme.logo(settings);
    const rules = [
      `/* OrbitKanban splash theme v1 background=${colors.background} */`,
      `html, body { background: ${colors.background}; color: ${colors.text}; }`,
      `body { border-color: ${colors.line}; }`,
      `.meta { color: ${colors.muted}; }`,
      `.track { background: ${colors.line}; }`,
      `.sweep { background: ${colors.accent}; }`,
      `.logo-badge { fill: ${colors.badge}; }`,
      ...colors.orbits.map((color, index) => `.logo-orbit-${index + 1} { stroke: ${color}; }`),
      `.logo-electron { background: ${colors.electron}; }`,
      `.logo-nucleus { fill: ${colors.nucleus}; }`
    ];
    if (logo) rules.push('.logo-default { display: none; }', `.logo-custom { display: block; background-image: url("${logo}"); }`);
    return `${rules.join('\n')}\n`;
  }
  static parse(text) {
    const match = typeof text === 'string' && text.length <= SplashTheme.#MAX_FILE ? SplashTheme.#HEADER.exec(text) : null;
    return match ? { background: match[1] } : null;
  }

  #written = null;

  constructor(folder) {
    this.file = path.join(folder, SplashTheme.FILE_NAME);
  }
  // Read synchronously before the loading window is created; null when there is no valid saved theme.
  read() {
    try {
      if (fs.statSync(this.file).size > SplashTheme.#MAX_FILE) return null;
      const saved = SplashTheme.parse(fs.readFileSync(this.file, 'utf8'));
      // An apostrophe is legal in Windows paths but not in the URLs splash.js accepts; %27 is the same file.
      return saved && { ...saved, url: pathToFileURL(this.file).href.replace(/'/g, '%27') };
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('The loading screen theme could not be read:', error);
      return null;
    }
  }
  // Writes the theme only when it changed, through a temporary file so a reader never sees half a style sheet.
  async save(settings) {
    const css = SplashTheme.css(settings);
    if (css === this.#written) return false;
    try {
      if (await fsp.readFile(this.file, 'utf8') === css) { this.#written = css; return false; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fsp.writeFile(temp, css, { encoding: 'utf8', flag: 'wx' });
      await fsp.rename(temp, this.file);
    } catch (error) {
      await fsp.rm(temp, { force: true });
      throw error;
    }
    this.#written = css;
    return true;
  }
}

module.exports = SplashTheme;
