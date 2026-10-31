'use strict';
// Dependency-free writer for Office Open XML spreadsheets (.xlsx), shared by the renderer and the Node tests.
(() => {
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_CELL_TEXT = 32767, MAX_ROWS = 1048576, MAX_COLS = 16384, MAX_LINK = 2079, MAX_SHEET_NAME = 31;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const BUILTIN_FORMATS = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };
const HORIZONTAL = ['left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'];
const VERTICAL = ['top', 'center', 'bottom', 'justify', 'distributed'];
const LINES = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'hair'];
const SIDES = ['left', 'right', 'top', 'bottom'];
const RESERVED_SHEET_NAMES = new Set(['history']);
const encoder = new TextEncoder();

function cleanText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function cellText(value) {
  let text = cleanText(value);
  if (text.length > MAX_CELL_TEXT) text = text.slice(0, MAX_CELL_TEXT).replace(/[\uD800-\uDBFF]$/, '');
  return text;
}
const xml = value => cleanText(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function columnName(index) {
  let name = '';
  for (let n = Math.floor(index) + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
const cellRef = (row, col) => `${columnName(col)}${row + 1}`;
const absoluteRef = (row, col) => `$${columnName(col)}$${row + 1}`;
function argb(color) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color ?? '').trim());
  if (!match) return '';
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  return `FF${hex.toUpperCase()}`;
}
// Excel serial dates count days from 1899-12-30 (the 1900 system), so Unix day 0 is serial 25569.
function excelDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds()) / 86400000 + 25569;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number), time = Date.UTC(year, month - 1, day), check = new Date(time);
  if (year < 1900 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time / 86400000 + 25569;
}
const webLink = value => {
  const url = cleanText(value).trim();
  return /^https?:\/\/\S+$/i.test(url) && url.length <= MAX_LINK ? url : '';
};
function sheetNames(names) {
  const used = new Set();
  const tidy = value => cleanText(value).replace(/[[\]:*?/\\\n\t]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
  return names.map((name, index) => {
    const base = tidy(tidy(name).slice(0, MAX_SHEET_NAME)) || `Sheet${index + 1}`;
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()) || RESERVED_SHEET_NAMES.has(candidate.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      candidate = tidy(base.slice(0, MAX_SHEET_NAME - suffix.length)) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
const quotedSheet = name => `'${name.replace(/'/g, "''")}'`;

function fontXml({ bold, italic, underline, color, size }) {
  return `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}${underline ? '<u/>' : ''}<sz val="${size || 11}"/>${color ? `<color rgb="${color}"/>` : '<color theme="1"/>'}<name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
}
function borderXml(border) {
  const spec = typeof border === 'string' ? { color: border } : border;
  const color = argb(spec.color) || 'FFD0D5E0', line = LINES.includes(spec.style) ? spec.style : 'thin';
  const sides = Array.isArray(spec.sides) ? spec.sides : SIDES;
  const side = name => sides.includes(name) ? `<${name} style="${line}"><color rgb="${color}"/></${name}>` : `<${name}/>`;
  return `<border>${SIDES.map(side).join('')}<diagonal/></border>`;
}
function createStyles() {
  const fonts = [fontXml({})], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], formats = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfIndex = new Map();
  const intern = (list, item) => {
    const index = list.indexOf(item);
    return index >= 0 ? index : list.push(item) - 1;
  };
  function style(spec, type) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const fontId = intern(fonts, fontXml({ bold: Boolean(s.bold), italic: Boolean(s.italic), underline: Boolean(s.underline), color: argb(s.color), size: Number(s.size) > 0 ? Math.min(409, Number(s.size)) : 0 }));
    const fill = argb(s.fill);
    const fillId = fill ? intern(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = s.border ? intern(borders, borderXml(s.border)) : 0;
    const format = s.numFmt ?? (type === 'date' ? 14 : type === 'datetime' ? 22 : 0);
    const numFmtId = Number.isInteger(format) && format >= 0 ? format : typeof format === 'string' && format ? BUILTIN_FORMATS[format] ?? 164 + intern(formats, format) : 0;
    const alignment = [
      HORIZONTAL.includes(s.horizontal) && `horizontal="${s.horizontal}"`,
      VERTICAL.includes(s.vertical) && `vertical="${s.vertical}"`,
      s.wrap && 'wrapText="1"',
      Number.isInteger(s.indent) && s.indent > 0 && `indent="${Math.min(250, s.indent)}"`
    ].filter(Boolean).join(' ');
    const key = `${numFmtId}|${fontId}|${fillId}|${borderId}|${alignment}`;
    if (key === '0|0|0|0|') return 0;
    if (!xfIndex.has(key)) {
      xfIndex.set(key, xfs.length);
      xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${alignment ? ` applyAlignment="1"><alignment ${alignment}/></xf>` : '/>'}`);
    }
    return xfIndex.get(key);
  }
  const toXml = () => `${HEAD}<styleSheet xmlns="${NS}">${formats.length ? `<numFmts count="${formats.length}">${formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0"/></styleSheet>`;
  return { style, toXml };
}

function cellXml(raw, row, col, context, links) {
  const cell = raw !== null && typeof raw === 'object' && !(raw instanceof Date) ? raw : { v: raw };
  const v = cell.v;
  let type = cell.type || (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : v instanceof Date ? 'datetime' : 'string');
  let value = '', kind = '';
  const empty = v === null || v === undefined || v === '';
  if (type === 'number') { if (!empty && Number.isFinite(Number(v))) value = `<v>${Number(v)}</v>`; }
  else if (type === 'date' || type === 'datetime') {
    const serial = excelDate(v);
    if (serial !== null) value = `<v>${serial}</v>`;
    else if (!empty) type = 'string';
  } else if (type === 'bool') { if (!empty) { kind = ' t="b"'; value = `<v>${v ? 1 : 0}</v>`; } }
  else type = 'string';
  if (type === 'string' && !empty) {
    const text = cellText(v);
    if (text) { kind = ' t="s"'; value = `<v>${context.sharedString(text)}</v>`; }
  }
  const link = value ? webLink(cell.link) : '';
  const styleId = context.styles.style(link ? { color: '#1F5FBF', underline: true, ...cell.style } : cell.style, type);
  if (!value && !styleId) return '';
  const ref = cellRef(row, col);
  if (link) links.push({ ref, link });
  return `<c r="${ref}"${styleId ? ` s="${styleId}"` : ''}${kind}>${value}</c>`;
}
function sheetXml(sheet, index, name, context) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  if (rows.length > MAX_ROWS) throw new Error('Il foglio Excel supera il numero massimo di righe.');
  const links = [], body = [];
  let width = 0;
  rows.forEach((row, r) => {
    const cells = Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : [];
    const height = !Array.isArray(row) && Number(row?.height) > 0 ? Math.min(409, Number(row.height)) : 0;
    const out = [];
    cells.slice(0, MAX_COLS).forEach((cell, c) => {
      const text = cellXml(cell, r, c, context, links);
      if (text) { out.push(text); width = Math.max(width, c + 1); }
    });
    if (out.length || height) body.push(`<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${out.join('')}</row>`);
  });
  const freezeRow = Math.max(0, Math.floor(Number(sheet.freeze?.row) || 0)), freezeCol = Math.max(0, Math.floor(Number(sheet.freeze?.col) || 0));
  let pane = '';
  if (freezeRow || freezeCol) {
    const active = freezeRow && freezeCol ? 'bottomRight' : freezeRow ? 'bottomLeft' : 'topRight', topLeft = cellRef(freezeRow, freezeCol);
    pane = `<pane${freezeCol ? ` xSplit="${freezeCol}"` : ''}${freezeRow ? ` ySplit="${freezeRow}"` : ''} topLeftCell="${topLeft}" activePane="${active}" state="frozen"/><selection pane="${active}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
  }
  const columns = (Array.isArray(sheet.columns) ? sheet.columns : []).slice(0, MAX_COLS).map((column, i) => {
    const size = Number(column?.width);
    if (!(size > 0) && !column?.hidden) return '';
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(255, size > 0 ? size : 8.43)}" customWidth="1"${column.hidden ? ' hidden="1"' : ''}/>`;
  }).filter(Boolean);
  const defined = [];
  let filter = '';
  if (sheet.autoFilter && rows.length && width) {
    const spec = sheet.autoFilter === true ? {} : sheet.autoFilter;
    const r0 = Math.max(0, spec.row || 0), c0 = Math.max(0, spec.col || 0), r1 = Math.min(rows.length - 1, spec.lastRow ?? rows.length - 1), c1 = Math.min(width - 1, spec.lastCol ?? width - 1);
    if (r1 >= r0 && c1 >= c0) {
      filter = `<autoFilter ref="${cellRef(r0, c0)}:${cellRef(r1, c1)}"/>`;
      defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${xml(quotedSheet(name))}!${absoluteRef(r0, c0)}:${absoluteRef(r1, c1)}</definedName>`);
    }
  }
  const print = sheet.print && typeof sheet.print === 'object' ? sheet.print : null;
  if (print && freezeRow) defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${xml(quotedSheet(name))}!$1:$${freezeRow}</definedName>`);
  const merges = (Array.isArray(sheet.merges) ? sheet.merges : []).filter(m => (m.rows || 1) > 1 || (m.cols || 1) > 1)
    .map(m => `<mergeCell ref="${cellRef(m.row, m.col)}:${cellRef(m.row + (m.rows || 1) - 1, m.col + (m.cols || 1) - 1)}"/>`);
  const tab = argb(sheet.tabColor);
  const properties = tab || print?.fitWidth ? `<sheetPr>${tab ? `<tabColor rgb="${tab}"/>` : ''}${print?.fitWidth ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : '';
  const text = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${DOC_REL}">${properties}<dimension ref="${width ? `A1:${cellRef(rows.length - 1, width - 1)}` : 'A1'}"/><sheetViews><sheetView${sheet.gridLines === false ? ' showGridLines="0"' : ''}${index === 0 ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${columns.length ? `<cols>${columns.join('')}</cols>` : ''}<sheetData>${body.join('')}</sheetData>${filter}${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}${links.length ? `<hyperlinks>${links.map((link, i) => `<hyperlink ref="${link.ref}" r:id="rId${i + 1}"/>`).join('')}</hyperlinks>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${print ? `<pageSetup paperSize="9" orientation="${print.landscape ? 'landscape' : 'portrait'}"${print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : ''}/>` : ''}</worksheet>`;
  const rels = links.length ? `${HEAD}<Relationships xmlns="${PKG_REL}">${links.map((link, i) => `<Relationship Id="rId${i + 1}" Type="${DOC_REL}/hyperlink" Target="${xml(link.link)}" TargetMode="External"/>`).join('')}</Relationships>` : '';
  return { xml: text, rels, defined };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}
async function zip(entries, date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const chunks = [], directory = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const path = encoder.encode(name), data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data), deflated = await deflateRaw(data), packed = deflated && deflated.length < data.length;
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

async function buildWorkbook(book) {
  const sheets = Array.isArray(book?.sheets) ? book.sheets : [];
  if (!sheets.length) throw new Error('Nessun foglio da esportare.');
  const created = book.created instanceof Date && !Number.isNaN(book.created.getTime()) ? book.created : new Date();
  const names = sheetNames(sheets.map(sheet => sheet.name)), strings = new Map();
  let stringCount = 0;
  const context = {
    styles: createStyles(),
    sharedString(text) {
      stringCount++;
      if (!strings.has(text)) strings.set(text, strings.size);
      return strings.get(text);
    }
  };
  const parts = [], defined = [];
  sheets.forEach((sheet, i) => {
    const result = sheetXml(sheet, i, names[i], context);
    parts.push([`xl/worksheets/sheet${i + 1}.xml`, result.xml]);
    if (result.rels) parts.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, result.rels]);
    defined.push(...result.defined);
  });
  const stamp = new Date(created.getTime()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const workbookRels = `${HEAD}<Relationships xmlns="${PKG_REL}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${DOC_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${DOC_REL}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${DOC_REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const files = [
    ['[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${DOC_REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ['docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${book.title ? `<dc:title>${xml(book.title)}</dc:title>` : ''}${book.creator ? `<dc:creator>${xml(book.creator)}</dc:creator><cp:lastModifiedBy>${xml(book.creator)}</cp:lastModifiedBy>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`],
    ['docProps/app.xml', `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${xml(book.application || 'OrbitKanban')}</Application></Properties>`],
    ['xl/workbook.xml', `${HEAD}<workbook xmlns="${NS}" xmlns:r="${DOC_REL}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15600" activeTab="0"/></bookViews><sheets>${names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined.length ? `<definedNames>${defined.join('')}</definedNames>` : ''}<calcPr calcId="191029"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ...parts,
    ['xl/styles.xml', context.styles.toXml()],
    ['xl/sharedStrings.xml', `${HEAD}<sst xmlns="${NS}" count="${stringCount}" uniqueCount="${strings.size}">${[...strings.keys()].map(text => `<si><t xml:space="preserve">${xml(text)}</t></si>`).join('')}</sst>`]
  ];
  return zip(files, created);
}

const OrbitaXlsx = Object.freeze({ MIME, MAX_CELL_TEXT, buildWorkbook, columnName, cellRef, excelDate, sheetNames, cleanText, crc32, argb });
if (typeof module !== 'undefined') module.exports = OrbitaXlsx;
else window.OrbitaXlsx = OrbitaXlsx;
})();
