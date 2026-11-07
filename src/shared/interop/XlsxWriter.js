'use strict';
// Dependency-free writer for Office Open XML spreadsheets (.xlsx).
(() => {
const ZipWriter = typeof module !== 'undefined' ? require('./ZipWriter') : globalThis.OrbitKanban.Interop.ZipWriter;

class XlsxWriter {
  static MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  static MAX_CELL_TEXT = 32767; static #MAX_ROWS = 1048576; static #MAX_COLS = 16384; static #MAX_LINK = 2079; static #MAX_SHEET_NAME = 31;
  static #NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  static #DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  static #PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  static #HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  static #BUILTIN_FORMATS = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };
  static #HORIZONTAL = ['left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'];
  static #VERTICAL = ['top', 'center', 'bottom', 'justify', 'distributed'];
  static #LINES = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'hair'];
  static #SIDES = ['left', 'right', 'top', 'bottom'];
  static #RESERVED_SHEET_NAMES = new Set(['history']);

  static cleanText(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  }
  static #cellText(value) {
    let text = XlsxWriter.cleanText(value);
    if (text.length > XlsxWriter.MAX_CELL_TEXT) text = text.slice(0, XlsxWriter.MAX_CELL_TEXT).replace(/[\uD800-\uDBFF]$/, '');
    return text;
  }
  static #xml = value => XlsxWriter.cleanText(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  static columnName(index) {
    let name = '';
    for (let n = Math.floor(index) + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
  }
  static cellRef = (row, col) => `${XlsxWriter.columnName(col)}${row + 1}`;
  static #absoluteRef = (row, col) => `$${XlsxWriter.columnName(col)}$${row + 1}`;
  static argb(color) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color ?? '').trim());
    if (!match) return '';
    const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
    return `FF${hex.toUpperCase()}`;
  }
  // Excel serial dates count days from 1899-12-30 (the 1900 system), so Unix day 0 is serial 25569.
  static excelDate(value) {
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
  static #webLink = value => {
    const url = XlsxWriter.cleanText(value).trim();
    return /^https?:\/\/\S+$/i.test(url) && url.length <= XlsxWriter.#MAX_LINK ? url : '';
  };
  static sheetNames(names) {
    const used = new Set();
    const tidy = value => XlsxWriter.cleanText(value).replace(/[[\]:*?/\\\n\t]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
    return names.map((name, index) => {
      const base = tidy(tidy(name).slice(0, XlsxWriter.#MAX_SHEET_NAME)) || `Sheet${index + 1}`;
      let candidate = base;
      for (let n = 2; used.has(candidate.toLowerCase()) || XlsxWriter.#RESERVED_SHEET_NAMES.has(candidate.toLowerCase()); n++) {
        const suffix = ` (${n})`;
        candidate = tidy(base.slice(0, XlsxWriter.#MAX_SHEET_NAME - suffix.length)) + suffix;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    });
  }
  static #quotedSheet = name => `'${name.replace(/'/g, "''")}'`;

  static #fontXml({ bold, italic, underline, color, size }) {
    return `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}${underline ? '<u/>' : ''}<sz val="${size || 11}"/>${color ? `<color rgb="${color}"/>` : '<color theme="1"/>'}<name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
  }
  static #borderXml(border) {
    const spec = typeof border === 'string' ? { color: border } : border;
    const color = XlsxWriter.argb(spec.color) || 'FFD0D5E0', line = XlsxWriter.#LINES.includes(spec.style) ? spec.style : 'thin';
    const sides = Array.isArray(spec.sides) ? spec.sides : XlsxWriter.#SIDES;
    const side = name => sides.includes(name) ? `<${name} style="${line}"><color rgb="${color}"/></${name}>` : `<${name}/>`;
    return `<border>${XlsxWriter.#SIDES.map(side).join('')}<diagonal/></border>`;
  }
  static #createStyles() {
    const fonts = [XlsxWriter.#fontXml({})], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], formats = [];
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfIndex = new Map();
    const intern = (list, item) => {
      const index = list.indexOf(item);
      return index >= 0 ? index : list.push(item) - 1;
    };
    function style(spec, type) {
      const s = spec && typeof spec === 'object' ? spec : {};
      const fontId = intern(fonts, XlsxWriter.#fontXml({ bold: Boolean(s.bold), italic: Boolean(s.italic), underline: Boolean(s.underline), color: XlsxWriter.argb(s.color), size: Number(s.size) > 0 ? Math.min(409, Number(s.size)) : 0 }));
      const fill = XlsxWriter.argb(s.fill);
      const fillId = fill ? intern(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const borderId = s.border ? intern(borders, XlsxWriter.#borderXml(s.border)) : 0;
      const format = s.numFmt ?? (type === 'date' ? 14 : type === 'datetime' ? 22 : 0);
      const numFmtId = Number.isInteger(format) && format >= 0 ? format : typeof format === 'string' && format ? XlsxWriter.#BUILTIN_FORMATS[format] ?? 164 + intern(formats, format) : 0;
      const alignment = [
        XlsxWriter.#HORIZONTAL.includes(s.horizontal) && `horizontal="${s.horizontal}"`,
        XlsxWriter.#VERTICAL.includes(s.vertical) && `vertical="${s.vertical}"`,
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
    const toXml = () => `${XlsxWriter.#HEAD}<styleSheet xmlns="${XlsxWriter.#NS}">${formats.length ? `<numFmts count="${formats.length}">${formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${XlsxWriter.#xml(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0"/></styleSheet>`;
    return { style, toXml };
  }

  static #cellXml(raw, row, col, context, links) {
    const cell = raw !== null && typeof raw === 'object' && !(raw instanceof Date) ? raw : { v: raw };
    const v = cell.v;
    let type = cell.type || (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : v instanceof Date ? 'datetime' : 'string');
    let value = '', kind = '';
    const empty = v === null || v === undefined || v === '';
    if (type === 'number') { if (!empty && Number.isFinite(Number(v))) value = `<v>${Number(v)}</v>`; }
    else if (type === 'date' || type === 'datetime') {
      const serial = XlsxWriter.excelDate(v);
      if (serial !== null) value = `<v>${serial}</v>`;
      else if (!empty) type = 'string';
    } else if (type === 'bool') { if (!empty) { kind = ' t="b"'; value = `<v>${v ? 1 : 0}</v>`; } }
    else type = 'string';
    if (type === 'string' && !empty) {
      const text = XlsxWriter.#cellText(v);
      if (text) { kind = ' t="s"'; value = `<v>${context.sharedString(text)}</v>`; }
    }
    const link = value ? XlsxWriter.#webLink(cell.link) : '';
    const styleId = context.styles.style(link ? { color: '#1F5FBF', underline: true, ...cell.style } : cell.style, type);
    if (!value && !styleId) return '';
    const ref = XlsxWriter.cellRef(row, col);
    if (link) links.push({ ref, link });
    return `<c r="${ref}"${styleId ? ` s="${styleId}"` : ''}${kind}>${value}</c>`;
  }
  static #sheetXml(sheet, index, name, context) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    if (rows.length > XlsxWriter.#MAX_ROWS) throw new Error("The Excel sheet exceeds the maximum number of rows.");
    const links = [], body = [];
    let width = 0;
    rows.forEach((row, r) => {
      const cells = Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : [];
      const height = !Array.isArray(row) && Number(row?.height) > 0 ? Math.min(409, Number(row.height)) : 0;
      const out = [];
      cells.slice(0, XlsxWriter.#MAX_COLS).forEach((cell, c) => {
        const text = XlsxWriter.#cellXml(cell, r, c, context, links);
        if (text) { out.push(text); width = Math.max(width, c + 1); }
      });
      if (out.length || height) body.push(`<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${out.join('')}</row>`);
    });
    const freezeRow = Math.max(0, Math.floor(Number(sheet.freeze?.row) || 0)), freezeCol = Math.max(0, Math.floor(Number(sheet.freeze?.col) || 0));
    let pane = '';
    if (freezeRow || freezeCol) {
      const active = freezeRow && freezeCol ? 'bottomRight' : freezeRow ? 'bottomLeft' : 'topRight', topLeft = XlsxWriter.cellRef(freezeRow, freezeCol);
      pane = `<pane${freezeCol ? ` xSplit="${freezeCol}"` : ''}${freezeRow ? ` ySplit="${freezeRow}"` : ''} topLeftCell="${topLeft}" activePane="${active}" state="frozen"/><selection pane="${active}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
    }
    const columns = (Array.isArray(sheet.columns) ? sheet.columns : []).slice(0, XlsxWriter.#MAX_COLS).map((column, i) => {
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
        filter = `<autoFilter ref="${XlsxWriter.cellRef(r0, c0)}:${XlsxWriter.cellRef(r1, c1)}"/>`;
        defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${XlsxWriter.#xml(XlsxWriter.#quotedSheet(name))}!${XlsxWriter.#absoluteRef(r0, c0)}:${XlsxWriter.#absoluteRef(r1, c1)}</definedName>`);
      }
    }
    const print = sheet.print && typeof sheet.print === 'object' ? sheet.print : null;
    if (print && freezeRow) defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${XlsxWriter.#xml(XlsxWriter.#quotedSheet(name))}!$1:$${freezeRow}</definedName>`);
    const merges = (Array.isArray(sheet.merges) ? sheet.merges : []).filter(m => (m.rows || 1) > 1 || (m.cols || 1) > 1)
      .map(m => `<mergeCell ref="${XlsxWriter.cellRef(m.row, m.col)}:${XlsxWriter.cellRef(m.row + (m.rows || 1) - 1, m.col + (m.cols || 1) - 1)}"/>`);
    const tab = XlsxWriter.argb(sheet.tabColor);
    const properties = tab || print?.fitWidth ? `<sheetPr>${tab ? `<tabColor rgb="${tab}"/>` : ''}${print?.fitWidth ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : '';
    const text = `${XlsxWriter.#HEAD}<worksheet xmlns="${XlsxWriter.#NS}" xmlns:r="${XlsxWriter.#DOC_REL}">${properties}<dimension ref="${width ? `A1:${XlsxWriter.cellRef(rows.length - 1, width - 1)}` : 'A1'}"/><sheetViews><sheetView${sheet.gridLines === false ? ' showGridLines="0"' : ''}${index === 0 ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${columns.length ? `<cols>${columns.join('')}</cols>` : ''}<sheetData>${body.join('')}</sheetData>${filter}${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}${links.length ? `<hyperlinks>${links.map((link, i) => `<hyperlink ref="${link.ref}" r:id="rId${i + 1}"/>`).join('')}</hyperlinks>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${print ? `<pageSetup paperSize="9" orientation="${print.landscape ? 'landscape' : 'portrait'}"${print.fitWidth ? ' fitToWidth="1" fitToHeight="0"' : ''}/>` : ''}</worksheet>`;
    const rels = links.length ? `${XlsxWriter.#HEAD}<Relationships xmlns="${XlsxWriter.#PKG_REL}">${links.map((link, i) => `<Relationship Id="rId${i + 1}" Type="${XlsxWriter.#DOC_REL}/hyperlink" Target="${XlsxWriter.#xml(link.link)}" TargetMode="External"/>`).join('')}</Relationships>` : '';
    return { xml: text, rels, defined };
  }

  static async buildWorkbook(book) {
    const sheets = Array.isArray(book?.sheets) ? book.sheets : [];
    if (!sheets.length) throw new Error("No sheet to export.");
    const created = book.created instanceof Date && !Number.isNaN(book.created.getTime()) ? book.created : new Date();
    const names = XlsxWriter.sheetNames(sheets.map(sheet => sheet.name)), strings = new Map();
    let stringCount = 0;
    const context = {
      styles: XlsxWriter.#createStyles(),
      sharedString(text) {
        stringCount++;
        if (!strings.has(text)) strings.set(text, strings.size);
        return strings.get(text);
      }
    };
    const parts = [], defined = [];
    sheets.forEach((sheet, i) => {
      const result = XlsxWriter.#sheetXml(sheet, i, names[i], context);
      parts.push([`xl/worksheets/sheet${i + 1}.xml`, result.xml]);
      if (result.rels) parts.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, result.rels]);
      defined.push(...result.defined);
    });
    const stamp = new Date(created.getTime()).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const workbookRels = `${XlsxWriter.#HEAD}<Relationships xmlns="${XlsxWriter.#PKG_REL}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${XlsxWriter.#DOC_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${XlsxWriter.#DOC_REL}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${XlsxWriter.#DOC_REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
    const files = [
      ['[Content_Types].xml', `${XlsxWriter.#HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
      ['_rels/.rels', `${XlsxWriter.#HEAD}<Relationships xmlns="${XlsxWriter.#PKG_REL}"><Relationship Id="rId1" Type="${XlsxWriter.#DOC_REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${XlsxWriter.#PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${XlsxWriter.#DOC_REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ['docProps/core.xml', `${XlsxWriter.#HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${book.title ? `<dc:title>${XlsxWriter.#xml(book.title)}</dc:title>` : ''}${book.creator ? `<dc:creator>${XlsxWriter.#xml(book.creator)}</dc:creator><cp:lastModifiedBy>${XlsxWriter.#xml(book.creator)}</cp:lastModifiedBy>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`],
      ['docProps/app.xml', `${XlsxWriter.#HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${XlsxWriter.#xml(book.application || 'OrbitKanban')}</Application></Properties>`],
      ['xl/workbook.xml', `${XlsxWriter.#HEAD}<workbook xmlns="${XlsxWriter.#NS}" xmlns:r="${XlsxWriter.#DOC_REL}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15600" activeTab="0"/></bookViews><sheets>${names.map((name, i) => `<sheet name="${XlsxWriter.#xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined.length ? `<definedNames>${defined.join('')}</definedNames>` : ''}<calcPr calcId="191029"/></workbook>`],
      ['xl/_rels/workbook.xml.rels', workbookRels],
      ...parts,
      ['xl/styles.xml', context.styles.toXml()],
      ['xl/sharedStrings.xml', `${XlsxWriter.#HEAD}<sst xmlns="${XlsxWriter.#NS}" count="${stringCount}" uniqueCount="${strings.size}">${[...strings.keys()].map(text => `<si><t xml:space="preserve">${XlsxWriter.#xml(text)}</t></si>`).join('')}</sst>`]
    ];
    return ZipWriter.zip(files, created);
  }
}

Object.freeze(XlsxWriter);
if (typeof module !== 'undefined') module.exports = XlsxWriter;
else ((globalThis.OrbitKanban ??= {}).Interop ??= {}).XlsxWriter = XlsxWriter;
})();
