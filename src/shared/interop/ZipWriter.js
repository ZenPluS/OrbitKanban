'use strict';
// Minimal ZIP container writer (stored or deflated entries with CRC-32).
(() => {
class ZipWriter {
  static #encoder = new TextEncoder();

  static #CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  static crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = ZipWriter.#CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  static async #deflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { return null; }
  }
  static async zip(entries, date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const chunks = [], directory = [];
    let offset = 0;
    for (const [name, content] of entries) {
      const path = ZipWriter.#encoder.encode(name), data = typeof content === 'string' ? ZipWriter.#encoder.encode(content) : content;
      const crc = ZipWriter.crc32(data), deflated = await ZipWriter.#deflateRaw(data), packed = deflated && deflated.length < data.length;
      const body = packed ? deflated : data, method = packed ? 8 : 0;
      const local = new Uint8Array(30 + path.length), head = new DataView(local.buffer);
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(8, method, true);
      head.setUint16(10, time, true); head.setUint16(12, day, true); head.setUint32(14, crc, true);
      head.setUint32(18, body.length, true); head.setUint32(22, data.length, true); head.setUint16(26, path.length, true);
      local.set(path, 30);
      const central = new Uint8Array(46 + path.length), entry = new DataView(central.buffer);
      entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(10, method, true);
      entry.setUint16(12, time, true); entry.setUint16(14, day, true); entry.setUint32(16, crc, true);
      entry.setUint32(20, body.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, path.length, true);
      entry.setUint32(42, offset, true);
      central.set(path, 46);
      chunks.push(local, body);
      directory.push(central);
      offset += local.length + body.length;
    }
    const size = directory.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), tail = new DataView(end.buffer);
    tail.setUint32(0, 0x06054b50, true); tail.setUint16(8, entries.length, true); tail.setUint16(10, entries.length, true);
    tail.setUint32(12, size, true); tail.setUint32(16, offset, true);
    const parts = [...chunks, ...directory, end], result = new Uint8Array(offset + size + end.length);
    let position = 0;
    for (const part of parts) { result.set(part, position); position += part.length; }
    return result;
  }
}

if (typeof module !== 'undefined') module.exports = ZipWriter;
else ((globalThis.OrbitKanban ??= {}).Interop ??= {}).ZipWriter = ZipWriter;
})();
