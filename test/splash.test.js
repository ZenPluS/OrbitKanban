'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const SplashScreen = require('../src/desktop/splash/SplashScreen');
const SplashTheme = require('../src/desktop/splash/SplashTheme');
const { ColorMath } = require('../src/shared/graphics');
const { DataFactory } = require('../src/shared/domain');
const { SPLASH_STATUS, SPLASH_MIN_VISIBLE, splashHoldTime, windowBackground } = SplashScreen;
const { encodeBmp } = require('../tools/SplashImage');
const PAGE = SplashScreen.page(ROOT);
const PAGE_HTML = fs.readFileSync(PAGE, 'utf8');
const PAGE_SCRIPT = fs.readFileSync(path.join(path.dirname(PAGE), 'splash.js'), 'utf8');
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const themes = () => { const data = DataFactory.initialData(); return (data.organizations?.[0]?.data.settings ?? data.settings).themes; };

test('loading screen is English only with an indeterminate bar and no step counter', () => {
  assert.match(PAGE_HTML, /<html lang="en">/);
  assert.ok(PAGE_HTML.includes(`>${SPLASH_STATUS}<`));
  assert.match(PAGE_HTML, /role="progressbar"/);
  assert.doesNotMatch(PAGE_HTML, /aria-valuenow|splash-counter|Caricamento|Preparazione/);
  assert.equal(PAGE_HTML.match(/class="brand"/g).length, 1, 'markup appears once');
  assert.match(PAGE_HTML, /@keyframes sweep/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'splash.html')), 'one loading screen page');
});
test('loading screen page also runs in the Windows HTML engine used by the launcher', () => {
  assert.match(PAGE_HTML, /<meta http-equiv="X-UA-Compatible" content="IE=edge">/);
  assert.doesNotMatch(PAGE_HTML, /var\(--|--[\w-]+:/, 'IE11 has no CSS custom properties');
  assert.doesNotMatch(PAGE_HTML, /<script>|\son\w+=/, 'no inline script: the policy allows script-src self only');
  assert.match(PAGE_HTML, /<script src="splash\.js"><\/script>/);
  assert.doesNotMatch(PAGE_HTML, /\.(?:avi|gif|mp4|webm)\b|<video|<img/i, 'the animation is CSS only');
  // Electrons are HTML elements: IE11 does not animate CSS transforms on SVG elements.
  assert.equal(PAGE_HTML.match(/class="logo-electron"/g).length, 3);
  assert.equal(PAGE_HTML.match(/class="logo-orbit logo-orbit-\d"/g).length, 3);
  for (const id of ['splash-version', 'splash-status', 'splash-progress']) assert.ok(PAGE_HTML.includes(`id="${id}"`), id);
  // ES5 only: no arrow functions, block-scoped declarations, classes, template literals or URLSearchParams.
  const code = PAGE_SCRIPT.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /=>|\b(?:let|const|class)\s|`|URLSearchParams|\.includes\(|\.startsWith\(/);
});
test('loading screen colors default to the Midnight theme, the same palette the app saves for it', () => {
  const palette = SplashTheme.palette(undefined);
  assert.deepEqual(SplashTheme.theme(undefined), SplashTheme.DEFAULT_THEME);
  assert.equal(palette.background, SplashScreen.SPLASH_BACKGROUND);
  // Every saved rule repeats the colors of the same page rule, so a missing theme file looks exactly like the default theme.
  const rules = SplashTheme.css(undefined).split('\n').slice(1).filter(Boolean);
  assert.ok(rules.length >= 10);
  for (const rule of rules) {
    const [, selector, body] = rule.match(/^(.+?) \{ (.+) \}$/);
    const page = PAGE_HTML.match(new RegExp(`\\n\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
    assert.ok(page, selector);
    for (const color of body.match(/#[0-9a-f]{6}/g)) assert.ok(page[1].includes(color), `${selector} ${color}`);
  }
});
test('saved loading screen colors stay readable in every built-in theme', () => {
  for (const theme of themes()) {
    const palette = SplashTheme.palette({ themeId: theme.id, themes: themes() });
    assert.equal(palette.background, theme.background.toLowerCase(), theme.id);
    assert.ok(ColorMath.contrastRatio(palette.muted, palette.background) >= ColorMath.WCAG_TEXT_CONTRAST, `${theme.id} version text`);
    for (const surface of [palette.background, palette.badge]) {
      assert.ok(ColorMath.contrastRatio(palette.accent, surface) >= ColorMath.WCAG_GRAPHIC_CONTRAST, `${theme.id} accent`);
    }
    assert.equal(palette.orbits.length, 3);
    for (const color of [...palette.orbits, palette.line, palette.badge]) assert.match(color, /^#[0-9a-f]{6}$/, theme.id);
  }
});
test('loading screen style sheet carries the organization theme and only a safe PNG logo', () => {
  const daylight = { themeId: 'daylight', themes: themes() };
  const css = SplashTheme.css(daylight);
  assert.ok(css.startsWith('/* OrbitKanban splash theme v1 background=#eef0f7 */\n'));
  assert.match(css, /^html, body \{ background: #eef0f7; color: #[0-9a-f]{6}; \}$/m);
  assert.doesNotMatch(css, /logo-custom|logo-default/, 'no logo: the themed atom is drawn');
  assert.deepEqual(SplashTheme.parse(css), { background: '#eef0f7' });
  const withLogo = SplashTheme.css({ ...daylight, logo: LOGO });
  assert.ok(withLogo.includes(`.logo-custom { display: block; background-image: url("${LOGO}"); }`));
  assert.ok(withLogo.includes('.logo-default { display: none; }'));
  for (const logo of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA"); } body { display: none', `${LOGO}\n`, 42, 'data:image/png;base64,' + 'A'.repeat(1500001)]) {
    assert.doesNotMatch(SplashTheme.css({ ...daylight, logo }), /logo-custom/, String(logo).slice(0, 40));
  }
  for (const settings of [{ themeId: 'missing', themes: themes() }, { themeId: 'bad', themes: [{ id: 'bad', background: 'red', surface: '#000000', text: '#ffffff', accent: '#ff0000' }] }]) {
    assert.ok(SplashTheme.css(settings).startsWith('/* OrbitKanban splash theme v1 background=#10131c */'));
  }
  for (const text of ['', 'html { }', '/* OrbitKanban splash theme v1 background=red */\n', null, '/* OrbitKanban splash theme v1 background=#eef0f7 */\n' + ' '.repeat(3 * 1024 * 1024)]) {
    assert.equal(SplashTheme.parse(text), null);
  }
});
test('loading screen theme is saved atomically next to the runtime data and only when it changes', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitkanban-splash-theme-'));
  try {
    const runtime = path.join(folder, 'runtime'), store = new SplashTheme(runtime);
    assert.equal(store.file, path.join(runtime, SplashTheme.FILE_NAME));
    assert.equal(store.read(), null, 'nothing saved yet');
    const settings = { themeId: 'daylight', themes: themes(), logo: LOGO };
    assert.equal(await store.save(settings), true);
    assert.equal(fs.readFileSync(store.file, 'utf8'), SplashTheme.css(settings));
    assert.deepEqual(store.read(), { background: '#eef0f7', url: pathToFileURL(store.file).href });
    assert.equal(await store.save(settings), false, 'unchanged');
    assert.equal(await new SplashTheme(runtime).save(settings), false, 'unchanged on disk');
    assert.equal(await store.save({ ...settings, themeId: 'midnight' }), true);
    assert.equal(store.read().background, '#10131c');
    assert.deepEqual(fs.readdirSync(runtime), [SplashTheme.FILE_NAME], 'no temporary files left');
    fs.writeFileSync(store.file, 'body { background: red; }');
    assert.equal(store.read(), null, 'unrecognized file');
    const quoted = new SplashTheme(path.join(folder, "O'Brien", 'runtime'));
    await quoted.save(settings);
    assert.match(quoted.read().url, /^file:\/\/\/.*\/O%27Brien\/runtime\/splash-theme\.css$/, 'accepted by the loading screen script');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
test('loading screen script accepts only its own theme file and a plain version', () => {
  const run = ({ search = '', hash = '', width = 520 }) => {
    const written = [], element = { textContent: 'Portable' }, listeners = {};
    const document = {
      write: html => written.push(html), getElementById: id => id === 'splash-version' ? element : null,
      addEventListener: (name, listener) => { listeners[name] = listener; }, documentElement: { clientWidth: width }
    };
    vm.runInNewContext(PAGE_SCRIPT, { window: { location: { search, hash }, innerWidth: width }, document });
    return { html: written.join(''), version: element.textContent, document };
  };
  const launcher = run({ hash: '#version=2.71.0&theme=splash-theme.css', width: 650 });
  assert.equal(launcher.version, 'Portable \u00b7 v2.71.0');
  assert.equal(launcher.html, '<link rel="stylesheet" href="splash-theme.css"><style>.splash { zoom: 1.2500; }</style>');
  const file = 'file:///C:/Users/me/Portable%20Apps/OrbitKanban/data/runtime/splash-theme.css';
  const electron = run({ search: `?version=2.71.0-beta.1&theme=${encodeURIComponent(file)}` });
  assert.equal(electron.version, 'Portable \u00b7 v2.71.0-beta.1');
  assert.equal(electron.html, `<link rel="stylesheet" href="${file}">`, 'no zoom at 100%');
  for (const theme of ['http://example.com/splash-theme.css', 'javascript:alert(1)//splash-theme.css', 'splash-theme.css"><script>alert(1)</script>', 'file:///C:/x"/splash-theme.css', '//example.com/splash-theme.css', 'theme.css']) {
    assert.equal(run({ hash: `#theme=${encodeURIComponent(theme)}` }).html, '', theme);
  }
  for (const version of ['<b>2</b>', '2.71.0 & more', 'x'.repeat(33), '%E0%A4%A']) {
    assert.equal(run({ hash: `#version=${version}` }).version, 'Portable', version);
  }
  assert.equal(typeof run({}).document.oncontextmenu, 'function');
});
test('loading screen stays just long enough not to flicker', () => {
  assert.equal(splashHoldTime(null, 5000), 0, 'never shown: nothing to wait for');
  assert.equal(splashHoldTime(1000, 1100), SPLASH_MIN_VISIBLE - 100);
  assert.equal(splashHoldTime(1000, 1000 + SPLASH_MIN_VISIBLE + 50), 0);
  assert.equal(splashHoldTime(1000, 900), SPLASH_MIN_VISIBLE, 'clock going backwards');
  assert.ok(SPLASH_MIN_VISIBLE <= 500);
});
test('Windows build embeds the application logo without requiring code signing', () => {
  const { build, scripts } = require('../package.json');
  assert.equal(build.win.icon, 'build/icon.ico', 'executables use the ICO generated from app-logo.svg');
  assert.ok(build.files.includes('app-logo.png'), 'window icon');
  assert.ok(build.files.includes('app-logo.svg'));
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^build\/icon\.ico$/m);
  assert.match(fs.readFileSync(path.join(ROOT, 'tools', 'make-splash.js'), 'utf8'), /encodeIco\(/);
  assert.match(fs.readFileSync(path.join(ROOT, 'build-and-push.ps1'), 'utf8'), /'tools\\AppIcon\.js'\), '--verify'/);
  assert.equal(build.win.signAndEditExecutable, true);
  assert.equal(build.win.signExecutable, false);
  assert.equal(scripts.prestart, 'npm run icon');
  assert.equal(scripts.presmoke, 'npm run icon');
  assert.equal(scripts.predist, 'npm run splash');
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<img src="app-logo\.svg"/);
  // The loading screen draws the same atom inline, so it can recolor it with the organization theme.
  assert.ok(PAGE_HTML.includes('viewBox="0 0 64 64"'));
  assert.ok(!build.files.includes('splash.html'));
});
test('loading window uses the same native icon as the application', async () => {
  const { EventEmitter } = require('node:events');
  const icon = { name: 'application-icon' };
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
    }
    async loadFile(file, options) { this.file = file; this.query = options?.query; }
    isDestroyed() { return false; }
  }
  const screen = { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) };
  const splash = new SplashScreen({ BrowserWindow: Window, screen, appRoot: ROOT, title: 'OrbitKanban', version: '2.6.2', icon, show: false });
  assert.equal(splash.window.options.icon, icon);
  assert.equal(splash.window.options.show, false);
  assert.equal(splash.window.options.skipTaskbar, true);
  assert.equal(splash.window.options.webPreferences.preload, undefined, 'the page needs no privileged bridge');
  assert.equal(splash.window.file, path.join(ROOT, 'src', 'desktop', 'splash', 'splash.html'));
  assert.deepEqual(splash.window.query, { version: '2.6.2' });
  assert.equal(splash.window.options.backgroundColor, SplashScreen.SPLASH_BACKGROUND);
  const theme = { background: '#eef0f7', url: pathToFileURL(path.join(ROOT, 'data', 'runtime', SplashTheme.FILE_NAME)).href };
  const themed = new SplashScreen({ BrowserWindow: Window, screen, appRoot: ROOT, title: 'OrbitKanban', version: '2.6.2', icon, theme, show: false });
  assert.equal(themed.window.options.backgroundColor, '#eef0f7', 'opens in the theme color before the page paints');
  assert.deepEqual(themed.window.query, { version: '2.6.2', theme: theme.url });
});
test('main window starts with the organization theme background', () => {
  const themes = [{ id: 'midnight', background: '#10131c' }, { id: 'daylight', background: '#EEF0F7' }];
  assert.equal(windowBackground({ themeId: 'daylight', themes }), '#EEF0F7');
  assert.equal(windowBackground({ themeId: 'missing', themes }), '#10131c');
  assert.equal(windowBackground({ themeId: 'bad', themes: [{ id: 'bad', background: 'red' }] }), '#10131c');
  assert.equal(windowBackground(undefined), '#10131c');
});
test('BMP encoder writes a padded bottom-up 24-bit bitmap over the background', () => {
  // 3×2 premultiplied BGRA: top row blue, green, transparent; bottom row red, half white, opaque black.
  const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 128, 128, 128, 128, 0, 0, 0, 255]);
  const file = encodeBmp(pixels, 3, 2, '#102030');
  const rowSize = 12;
  assert.equal(file.toString('ascii', 0, 2), 'BM');
  assert.equal(file.length, 54 + rowSize * 2);
  assert.deepEqual([file.readUInt32LE(2), file.readUInt32LE(10), file.readUInt32LE(14)], [file.length, 54, 40]);
  assert.deepEqual([file.readInt32LE(18), file.readInt32LE(22), file.readUInt16LE(26), file.readUInt16LE(28), file.readUInt32LE(34)], [3, 2, 1, 24, rowSize * 2]);
  const pixel = (x, y) => [...file.subarray(54 + (1 - y) * rowSize + x * 3, 54 + (1 - y) * rowSize + x * 3 + 3)];
  assert.deepEqual(pixel(0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(1, 0), [0, 255, 0]);
  assert.deepEqual(pixel(2, 0), [0x30, 0x20, 0x10]);
  assert.deepEqual(pixel(0, 1), [0, 0, 255]);
  assert.deepEqual(pixel(1, 1), [152, 144, 136]);
  assert.deepEqual(pixel(2, 1), [0, 0, 0]);
  assert.deepEqual([...file.subarray(54 + 9, 54 + 12)], [0, 0, 0], 'row padding');
});
test('BMP encoder rejects inconsistent input', () => {
  assert.throws(() => encodeBmp(Buffer.alloc(10), 3, 2), /invalid bitmap data/i);
  assert.throws(() => encodeBmp(Buffer.alloc(0), 0, 0), /invalid bitmap data/i);
  assert.throws(() => encodeBmp(null, 1, 1), /invalid bitmap data/i);
  assert.throws(() => encodeBmp(Buffer.alloc(8), 1.5, 2), /invalid bitmap data/i);
});
