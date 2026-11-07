'use strict';
// Renders the loading screen (src/desktop/splash/splash.html) offscreen for the portable launcher: the fallback bitmap of the
// default theme, used only when Windows cannot show the HTML loading screen, and the 1×1 placeholder the template displays first.
// Also draws the executable icon (build/icon.ico) and app-logo.png from app-logo.svg. Run with Electron: electron tools/make-splash.js [--icon-only]
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version } = require('../package.json');
const SplashScreen = require('../src/desktop/splash/SplashScreen');
const SplashImage = require('./SplashImage');
const AppIcon = require('./AppIcon');

const ROOT = path.join(__dirname, '..');
const BUILD_FOLDER = path.join(ROOT, 'build');
const OUTPUTS = { bitmap: path.join(BUILD_FOLDER, 'splash.bmp'), placeholder: path.join(BUILD_FOLDER, 'splash-placeholder.bmp'), icon: path.join(BUILD_FOLDER, 'icon.ico') };

class LauncherArtwork {
  static #ICON_SIZE = 512;
  #profile;

  // Uses a throwaway Electron profile and a fixed scale so the captures do not depend on the build machine.
  constructor() {
    this.#profile = fs.mkdtempSync(path.join(os.tmpdir(), 'orbitkanban-splash-'));
    app.setPath('userData', this.#profile);
    app.setPath('sessionData', this.#profile);
    app.commandLine.appendSwitch('force-device-scale-factor', '1');
    app.disableHardwareAcceleration();
  }

  async render({ iconOnly = false } = {}) {
    const { width, height } = SplashScreen.SPLASH_SIZE;
    const win = new BrowserWindow({
      width, height, useContentSize: true, show: false, frame: false, backgroundColor: SplashScreen.SPLASH_BACKGROUND,
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    // Executable icon: each size is drawn with the logo's own viewport set to that size, so the SVG's
    // small-size rules (thicker orbits, no electrons) apply exactly as they do on screen.
    await win.loadURL('about:blank');
    const logo = fs.readFileSync(path.join(ROOT, 'app-logo.svg'), 'utf8');
    const rendered = await win.webContents.executeJavaScript(`(async (source, sizes) => {
      const encode = bytes => { let text = ''; for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768)); return btoa(text); };
      const result = [];
      for (const size of sizes) {
        const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, size, size);
        result.push({ size, rgba: encode(context.getImageData(0, 0, size, size).data), png: size === 256 ? canvas.toDataURL('image/png').split(',')[1] : null });
      }
      return result;
    })(${JSON.stringify(logo)}, ${JSON.stringify(AppIcon.ICON_SIZES)})`);
    const ico = AppIcon.encodeIco(rendered.map(({ size, rgba, png }) => ({ size, rgba: Buffer.from(rgba, 'base64'), png: png && Buffer.from(png, 'base64') })));
    fs.mkdirSync(BUILD_FOLDER, { recursive: true });
    fs.writeFileSync(OUTPUTS.icon, ico);
    console.log(`Executable icon: app-logo.svg -> ${path.relative(ROOT, OUTPUTS.icon)} (${AppIcon.ICON_SIZES.join(', ')} px)`);
    // The loading screen page sits in src/desktop/splash/: the logo is the same app-logo.svg file the interface draws.
    await win.loadFile(SplashScreen.page(ROOT), { query: { version } });
    const iconData = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = '../../../app-logo.svg';
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ${LauncherArtwork.#ICON_SIZE};
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    })()`);
    const icon = nativeImage.createFromDataURL(iconData);
    if (icon.isEmpty() || icon.getSize().width !== LauncherArtwork.#ICON_SIZE || icon.getSize().height !== LauncherArtwork.#ICON_SIZE) throw new Error('Invalid application icon.');
    fs.writeFileSync(path.join(ROOT, 'app-logo.png'), icon.toPNG());
    console.log(`Icon: app-logo.svg -> app-logo.png (${LauncherArtwork.#ICON_SIZE}x${LauncherArtwork.#ICON_SIZE})`);
    if (iconOnly) {
      win.destroy();
      return;
    }
    // Fallback bitmap: a still frame of the animation in the default theme, so it matches the HTML loading screen.
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const state = await win.webContents.executeJavaScript(`(() => {
      document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = animation.animationName === 'sweep' ? 700 : 0; });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
        version: document.getElementById('splash-version').textContent, electrons: document.querySelectorAll('.logo-default .logo-electron').length, animations: document.getAnimations().length
      }))));
    })()`);
    if (state.version !== `Portable · v${version}` || state.electrons !== 3 || state.animations !== 7) throw new Error(`Unexpected loading screen: ${JSON.stringify(state)}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const screen = await win.webContents.capturePage();
    if (screen.isEmpty() || screen.getSize().width !== width || screen.getSize().height !== height) throw new Error(`Invalid capture: ${JSON.stringify(screen.getSize())}`);
    fs.writeFileSync(OUTPUTS.bitmap, SplashImage.encodeBmp(screen.toBitmap(), width, height, SplashScreen.SPLASH_BACKGROUND));
    // The template always shows its bitmap first; the launcher shows this single pixel instead and hides it once the HTML screen is open.
    fs.writeFileSync(OUTPUTS.placeholder, SplashImage.encodeBmp(Buffer.alloc(4), 1, 1, SplashScreen.SPLASH_BACKGROUND));
    console.log(`Launcher: ${path.relative(ROOT, OUTPUTS.bitmap)} (${width}×${height}, v${version}, fallback), ${path.relative(ROOT, OUTPUTS.placeholder)} (1×1)`);
    win.destroy();
  }
  finish(code) {
    try { fs.rmSync(this.#profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    app.exit(code);
  }
}

const artwork = new LauncherArtwork();
app.whenReady().then(() => artwork.render({ iconOnly: process.argv.includes('--icon-only') })).then(() => artwork.finish(0)).catch(error => {
  console.error(error);
  artwork.finish(1);
});
