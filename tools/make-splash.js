'use strict';
// Renders splash.html offscreen for the portable launcher: the bitmap shown while it unpacks the app
// and the looping clip of the loading bar, played on top of the bitmap so the screen never looks frozen.
// Also draws the executable icon (build/icon.ico) and app-logo.png from app-logo.svg. Run with Electron: electron tools/make-splash.js [--icon-only] [--png]
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
const OUTPUTS = { bitmap: path.join(BUILD_FOLDER, 'splash.bmp'), clip: path.join(BUILD_FOLDER, 'splash-bar.avi'), geometry: path.join(BUILD_FOLDER, 'splash-bar.nsh'), icon: path.join(BUILD_FOLDER, 'icon.ico') };

class LauncherArtwork {
  static #FPS = 30;
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

  async render({ iconOnly = false, png = false } = {}) {
    const { width, height } = SplashScreen.SPLASH_SIZE;
    const win = new BrowserWindow({
      width, height, useContentSize: true, show: false, frame: false, backgroundColor: SplashScreen.SPLASH_BACKGROUND,
      webPreferences: { offscreen: true, preload: path.join(ROOT, 'src', 'desktop', 'splash', 'splash-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
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
    await win.loadFile(path.join(ROOT, 'splash.html'), { query: { version } });
    const iconData = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'app-logo.svg';
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
    // The launcher animates regardless of the build machine's motion settings, so render the full animation.
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await win.webContents.executeJavaScript(`Promise.all([document.fonts.ready, ...[...document.images].map(image => image.decode())]).then(() => true)`);
    const layout = await win.webContents.executeJavaScript(`(() => {
      const box = document.getElementById('splash-progress').getBoundingClientRect();
      return { rect: { x: box.x, y: box.y, width: box.width, height: box.height }, durations: document.getAnimations().map(animation => animation.effect.getComputedTiming().duration) };
    })()`);
    const rect = layout.rect;
    if (!Object.values(rect).every(Number.isInteger) || rect.width < 16 || rect.height < 2) throw new Error(`The loading bar is not pixel-aligned: ${JSON.stringify(rect)}`);
    if (layout.durations.length !== 1 || !(layout.durations[0] > 0)) throw new Error(`Expected exactly one loading-bar animation: ${JSON.stringify(layout.durations)}`);
    const seek = async time => {
      await win.webContents.executeJavaScript(`document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = ${time}; });
        new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      await new Promise(resolve => setTimeout(resolve, 40));
    };
    const capture = async area => {
      const image = await win.webContents.capturePage(area);
      const size = image.getSize(), expected = area || { width, height };
      if (image.isEmpty() || size.width !== expected.width || size.height !== expected.height) throw new Error(`Invalid capture: ${JSON.stringify(size)}`);
      return image;
    };

    await seek(0);
    await new Promise(resolve => setTimeout(resolve, 300));
    const screen = await capture();
    const frameCount = Math.round(layout.durations[0] / 1000 * LauncherArtwork.#FPS), frames = [];
    for (let index = 0; index < frameCount; index++) {
      await seek(index * 1000 / LauncherArtwork.#FPS);
      frames.push(SplashImage.toRgb((await capture(rect)).toBitmap(), rect.width, rect.height, SplashScreen.SPLASH_BACKGROUND));
    }
    // The clip covers the bitmap: its first frame must match the bitmap, and the bar has to actually move.
    const still = SplashImage.toRgb(screen.crop(rect).toBitmap(), rect.width, rect.height, SplashScreen.SPLASH_BACKGROUND);
    if (frames[0].some((value, index) => Math.abs(value - still[index]) > 2)) throw new Error('The first frame does not match the launcher screen.');
    if (new Set(frames.map(frame => Buffer.from(frame).toString('base64'))).size < frameCount / 2) throw new Error('The loading-bar animation was not captured.');
    const { palette, frames: indexed } = SplashImage.quantize(frames);

    fs.mkdirSync(BUILD_FOLDER, { recursive: true });
    fs.writeFileSync(OUTPUTS.bitmap, SplashImage.encodeBmp(screen.toBitmap(), width, height, SplashScreen.SPLASH_BACKGROUND));
    fs.writeFileSync(OUTPUTS.clip, SplashImage.encodeAvi({ width: rect.width, height: rect.height, fps: LauncherArtwork.#FPS, palette, frames: indexed }));
    fs.writeFileSync(OUTPUTS.geometry, [
      '; Generated by tools/make-splash.js: where the loading bar clip (splash-bar.avi) sits on splash.bmp.',
      ...Object.entries({ X: rect.x, Y: rect.y, WIDTH: rect.width, HEIGHT: rect.height }).map(([key, value]) => `!define ORBITKANBAN_BAR_${key} ${value}`),
      ''
    ].join('\r\n'));
    if (png) {
      fs.writeFileSync(OUTPUTS.bitmap.replace(/\.bmp$/, '.png'), screen.toPNG());
      const sheet = Buffer.alloc(rect.width * rect.height * frameCount * 4);
      indexed.forEach((frame, number) => frame.forEach((entry, pixel) => {
        const [red, green, blue] = palette[entry], at = (number * rect.width * rect.height + pixel) * 4;
        sheet[at] = blue; sheet[at + 1] = green; sheet[at + 2] = red; sheet[at + 3] = 255;
      }));
      fs.writeFileSync(OUTPUTS.clip.replace(/\.avi$/, '.png'), nativeImage.createFromBitmap(sheet, { width: rect.width, height: rect.height * frameCount }).toPNG());
    }
    console.log(`Launcher: ${path.relative(ROOT, OUTPUTS.bitmap)} (${width}×${height}, v${version}), ${path.relative(ROOT, OUTPUTS.clip)} (${rect.width}×${rect.height}, ${frameCount} frames, ${palette.length} colors)`);
    win.destroy();
  }

  finish(code) {
    try { fs.rmSync(this.#profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    app.exit(code);
  }
}

const artwork = new LauncherArtwork();
app.whenReady().then(() => artwork.render({ iconOnly: process.argv.includes('--icon-only'), png: process.argv.includes('--png') })).then(() => artwork.finish(0)).catch(error => {
  console.error(error);
  artwork.finish(1);
});
