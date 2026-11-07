'use strict';
// Build-time helpers for the portable launcher: the splash bitmap and the looping clip of the loading bar.
class SplashImage {
  static #hexColor = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));

  // Chromium captures premultiplied BGRA: composite over the background to get opaque RGB triplets.
  static toRgb(pixels, width, height, background) {
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
    const rgb = SplashImage.toRgb(pixels, width, height, background);
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

  // Shared palette of at most 256 colors for RGB frames: exact when the frames use few colors, median cut otherwise.
  static quantize(frames) {
    if (!Array.isArray(frames) || !frames.length || frames.some(frame => !(frame instanceof Uint8Array) || frame.length % 3 || frame.length !== frames[0].length)) throw new Error('Invalid frames.');
    const counts = new Map();
    for (const frame of frames) for (let index = 0; index < frame.length; index += 3) {
      const key = frame[index] << 16 | frame[index + 1] << 8 | frame[index + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const colors = [...counts].map(([key, count]) => ({ rgb: [key >> 16 & 255, key >> 8 & 255, key & 255], count }));
    let boxes = [colors];
    while (boxes.length < 256) {
      let best = null, bestRange = 0, channel = 0;
      for (const box of boxes) {
        if (box.length < 2) continue;
        for (let c = 0; c < 3; c++) {
          let min = 255, max = 0;
          for (const color of box) { min = Math.min(min, color.rgb[c]); max = Math.max(max, color.rgb[c]); }
          if (max - min > bestRange) { best = box; bestRange = max - min; channel = c; }
        }
      }
      if (!best) break;
      best.sort((a, b) => a.rgb[channel] - b.rgb[channel]);
      const total = best.reduce((sum, color) => sum + color.count, 0);
      let half = 0, split = 1;
      for (; split < best.length - 1; split++) { half += best[split - 1].count; if (half * 2 >= total) break; }
      boxes = boxes.filter(box => box !== best).concat([best.slice(0, split), best.slice(split)]);
    }
    const palette = boxes.map(box => {
      const total = box.reduce((sum, color) => sum + color.count, 0);
      return [0, 1, 2].map(c => Math.round(box.reduce((sum, color) => sum + color.rgb[c] * color.count, 0) / total));
    });
    const lookup = new Map();
    for (const { rgb } of colors) {
      let nearest = 0, distance = Infinity;
      palette.forEach((entry, index) => {
        const d = (entry[0] - rgb[0]) ** 2 + (entry[1] - rgb[1]) ** 2 + (entry[2] - rgb[2]) ** 2;
        if (d < distance) { distance = d; nearest = index; }
      });
      lookup.set(rgb[0] << 16 | rgb[1] << 8 | rgb[2], nearest);
    }
    const indexed = frames.map(frame => {
      const out = new Uint8Array(frame.length / 3);
      for (let index = 0; index < out.length; index++) out[index] = lookup.get(frame[index * 3] << 16 | frame[index * 3 + 1] << 8 | frame[index * 3 + 2]);
      return out;
    });
    return { palette, frames: indexed };
  }

  // Uncompressed 8-bit AVI: the format the Windows animation control (SysAnimate32) plays on its own thread.
  static encodeAvi({ width, height, fps, palette, frames }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || !Number.isInteger(fps) || fps <= 0 || fps > 60) throw new Error('Invalid video format.');
    if (!Array.isArray(palette) || !palette.length || palette.length > 256 || !Array.isArray(frames) || !frames.length || frames.some(frame => frame.length !== width * height)) throw new Error('Invalid frames.');
    const rowSize = Math.ceil(width / 4) * 4, frameSize = rowSize * height;
    const fourcc = (buffer, offset, text) => buffer.write(text, offset, 'ascii');
    const chunk = (id, data) => {
      const out = Buffer.alloc(8 + data.length + (data.length & 1));
      fourcc(out, 0, id); out.writeUInt32LE(data.length, 4); data.copy(out, 8);
      return out;
    };
    const list = (type, children) => {
      const body = Buffer.concat([Buffer.from(type, 'ascii'), ...children]);
      return chunk('LIST', body);
    };
    const avih = Buffer.alloc(56);
    [Math.round(1e6 / fps), frameSize * fps, 0, 0x10, frames.length, 0, 1, frameSize, width, height].forEach((value, index) => avih.writeUInt32LE(value, index * 4));
    const strh = Buffer.alloc(56);
    fourcc(strh, 0, 'vids'); fourcc(strh, 4, 'DIB ');
    strh.writeUInt32LE(1, 20); strh.writeUInt32LE(fps, 24); strh.writeUInt32LE(frames.length, 32); strh.writeUInt32LE(frameSize, 36); strh.writeInt32LE(-1, 40);
    strh.writeInt16LE(width, 52); strh.writeInt16LE(height, 54);
    const strf = Buffer.alloc(40 + 256 * 4);
    strf.writeUInt32LE(40, 0); strf.writeInt32LE(width, 4); strf.writeInt32LE(height, 8); strf.writeUInt16LE(1, 12); strf.writeUInt16LE(8, 14);
    strf.writeUInt32LE(frameSize, 20); strf.writeUInt32LE(256, 32);
    palette.forEach(([red, green, blue], index) => { strf[40 + index * 4] = blue; strf[41 + index * 4] = green; strf[42 + index * 4] = red; });
    const frameChunks = frames.map(frame => {
      const data = Buffer.alloc(frameSize);
      for (let y = 0; y < height; y++) Buffer.from(frame.buffer, frame.byteOffset + y * width, width).copy(data, (height - 1 - y) * rowSize);
      return chunk('00db', data);
    });
    const index = Buffer.alloc(16 * frames.length);
    let offset = 4;
    frameChunks.forEach((frameChunk, number) => {
      fourcc(index, number * 16, '00db');
      index.writeUInt32LE(0x10, number * 16 + 4);
      index.writeUInt32LE(offset, number * 16 + 8);
      index.writeUInt32LE(frameSize, number * 16 + 12);
      offset += frameChunk.length;
    });
    const body = Buffer.concat([
      Buffer.from('AVI ', 'ascii'),
      list('hdrl', [chunk('avih', avih), list('strl', [chunk('strh', strh), chunk('strf', strf)])]),
      list('movi', frameChunks),
      chunk('idx1', index)
    ]);
    const file = Buffer.alloc(8);
    fourcc(file, 0, 'RIFF'); file.writeUInt32LE(body.length, 4);
    return Buffer.concat([file, body]);
  }
}

module.exports = SplashImage;
