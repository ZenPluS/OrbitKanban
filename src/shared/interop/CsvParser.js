'use strict';
// Reads CSV text: delimiter detection and RFC 4180 parsing.
(() => {
class CsvParser {
  static MAX_BYTES = 16 * 1024 * 1024; static MAX_ROWS = 10000;
  static assert = (ok, message) => { if (!ok) throw new Error(message); };
  static normalized = value => String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  static detectDelimiter(text) {
    text = text.replace(/^(?:[ \t]*(?:\r\n|[\r\n]))+/, '');
    const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && /[\r\n]/.test(text[i])) break;
      else if (!quoted && counts.has(text[i])) counts.set(text[i], counts.get(text[i]) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  static parseCsv(input, delimiter = '') {
    CsvParser.assert(typeof input === 'string' && input.length <= CsvParser.MAX_BYTES, "The CSV exceeds the 16 MB limit.");
    const text = input.replace(/^\uFEFF/, '');
    delimiter ||= CsvParser.detectDelimiter(text);
    CsvParser.assert([';', ',', '\t'].includes(delimiter), "Invalid CSV delimiter.");
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false, skipped = 0;
    const endCell = () => { row.push(cell); cell = ''; closed = false; CsvParser.assert(row.length <= 100, "The CSV has too many columns."); };
    const endRow = () => { endCell(); if (row.some(value => value.trim())) rows.push(row); else skipped++; row = []; CsvParser.assert(rows.length <= CsvParser.MAX_ROWS + 1, "The CSV exceeds the 10000-row limit."); };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
        else cell += char;
      } else if (char === delimiter) endCell();
      else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else if (closed && char === ' ') continue;
      else if (char === '"' && !cell && !closed) quoted = true;
      else { CsvParser.assert(char !== '"' && !closed, "Invalid CSV quotes."); cell += char; }
    }
    CsvParser.assert(!quoted, "The CSV contains an unclosed quoted field.");
    if (cell || row.length || closed) endRow();
    CsvParser.assert(rows.length > 0, "The CSV is empty.");
    return { rows, delimiter, skipped };
  }
}

if (typeof module !== 'undefined') module.exports = CsvParser;
else ((globalThis.OrbitKanban ??= {}).Interop ??= {}).CsvParser = CsvParser;
})();
