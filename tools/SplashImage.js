'use strict';
// Build-time helper for the portable launcher: the bitmaps BgImage can display (the fallback loading screen and its placeholder).
class SplashImage {
  static #hexColor = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));

  // Chromium captures premultiplied BGRA: composite over the background to get opaque RGB triplets.
  static #toRgb(pixels, width, height, background) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || !pixels || pixels.length !== width * height * 4) throw new Error("Invalid bitmap data.");
    const [red, green, blue] = SplashImage.#hexColor(background), rgb = new Uint8Array(width * height * 3);
    for (let source = 0, target = 0; source < pixels.length; source += 4, target += 3) {
      const uncovered = 1 - pixels[source + 3] / 255;
      rgb[target] = Math.min(255, Math.round(pixels[source + 2] + red * uncovered));
      rgb[target + 1] = Math.min(255, Math.round(pixels[source + 1] + green * uncovered));
      rgb[target + 2] = Math.min(255, Math.round(pixels[source] + blue * uncovered));
    }
    return rgb;
  }

  // 24-bit bottom-up BMP, the format NSIS BgImage can display.
  static encodeBmp(pixels, width, height, background = '#10131c') {
    const rgb = SplashImage.#toRgb(pixels, width, height, background);
    const rowSize = Math.ceil(width * 3 / 4) * 4, imageSize = rowSize * height, file = Buffer.alloc(54 + imageSize);
    file.write('BM', 0, 'ascii');
    file.writeUInt32LE(file.length, 2);
    file.writeUInt32LE(54, 10);
    file.writeUInt32LE(40, 14);
    file.writeInt32LE(width, 18);
    file.writeInt32LE(height, 22);
    file.writeUInt16LE(1, 26);
    file.writeUInt16LE(24, 28);
    file.writeUInt32LE(imageSize, 34);
    file.writeInt32LE(2835, 38);
    file.writeInt32LE(2835, 42);
    for (let y = 0; y < height; y++) {
      const row = 54 + (height - 1 - y) * rowSize;
      for (let x = 0; x < width; x++) {
        const source = (y * width + x) * 3, target = row + x * 3;
        file[target] = rgb[source + 2];
        file[target + 1] = rgb[source + 1];
        file[target + 2] = rgb[source];
      }
    }
    return file;
  }
}

module.exports = SplashImage;
