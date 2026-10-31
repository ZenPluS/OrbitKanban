'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { MIME, MAX_CELL_TEXT, buildWorkbook, columnName, cellRef, excelDate, sheetNames, cleanText, crc32, argb } = require('./xlsx');

function unzip(bytes) {
  const buffer = Buffer.from(bytes), files = new Map();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'end of central directory');
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(position), 0x02014b50);
    const method = buffer.readUInt16LE(position + 10), crc = buffer.readUInt32LE(position + 16), size = buffer.readUInt32LE(position + 20), length = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28), offset = buffer.readUInt32LE(position + 42), name = buffer.toString('utf8', position + 46, position + 46 + nameLength);
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28), body = buffer.subarray(start, start + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    assert.equal(data.length, length, `${name} size`);
    assert.equal(crc32(data), crc, `${name} crc`);
    files.set(name, data.toString('utf8'));
    position += 46 + nameLength + buffer.readUInt16LE(position + 30) + buffer.readUInt16LE(position + 32);
  }
  return files;
}
const sharedStrings = files => [...files.get('xl/sharedStrings.xml').matchAll(/<si><t xml:space="preserve">([\s\S]*?)<\/t><\/si>/g)].map(m => m[1]);
const cell = (sheet, ref) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheet);

test('helpers convert columns, dates, colors and sheet names', () => {
  assert.equal(MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual([0, 25, 26, 51, 52, 701, 702, 16383].map(columnName), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD']);
  assert.equal(cellRef(0, 0), 'A1');
  assert.equal(cellRef(9, 27), 'AB10');
  assert.equal(excelDate('1900-03-01'), 61);
  assert.equal(excelDate('2026-01-15'), 46037);
  assert.equal(excelDate(new Date(2026, 0, 15, 12, 0, 0)), 46037.5);
  assert.equal(excelDate('2026-02-30'), null);
  assert.equal(excelDate('15/01/2026'), null);
  assert.equal(excelDate(''), null);
  assert.equal(argb('#a1b2c3'), 'FFA1B2C3');
  assert.equal(argb('fff'), 'FFFFFFFF');
  assert.equal(argb('red'), '');
  assert.deepEqual(sheetNames(['Attività', 'attività', 'A/B: [x]?*', '', "'quoted'", 'History', 'Un nome davvero molto lungo per un foglio Excel', 'Un nome davvero molto lungo per un foglio Excel']),
    ['Attività', 'attività (2)', 'A B x', 'Sheet4', 'quoted', 'History (2)', 'Un nome davvero molto lungo per', 'Un nome davvero molto lungo (2)']);
  assert.ok(sheetNames(['x'.repeat(40)])[0].length <= 31);
  assert.equal(cleanText('a\u0000b\u0007c\r\nd\te\uD800f\uDC00g😀'), 'abc\nd\tefg😀');
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('workbook is a valid zip package with typed, styled and linked cells', async () => {
  const bytes = await buildWorkbook({
    title: 'Situazione & <stato>', creator: 'OrbitKanban', created: new Date(2026, 4, 6, 10, 30, 0),
    sheets: [
      {
        name: 'Attività', columns: [{ width: 10 }, { width: 40 }, {}, { width: 14 }], freeze: { row: 1, col: 1 }, autoFilter: true, tabColor: '#6c5ce7', print: { landscape: true, fitWidth: true },
        rows: [
          [{ v: 'Codice', style: { bold: true, fill: '#202432', color: '#ffffff', border: '#cccccc' } }, 'Descrizione', 'Effort (ore)', 'Release'],
          [{ v: 'PRJ-1', link: 'https://jira.example.com/browse/PRJ-1?a=1&b=2' }, { v: 'Riga 1\nRiga 2 <b>&</b> "ok"', style: { wrap: true, vertical: 'top' } }, 12.5, { v: '2026-01-15', type: 'date', style: { fill: '#ffeeaa' } }],
          [{ v: 'PRJ-2', link: 'javascript:alert(1)' }, '', { v: 'n/a', type: 'number' }, { v: '', type: 'date', style: { fill: '#eeeeee' } }],
          { height: 30, cells: [true, false, null, { v: new Date(2026, 4, 6, 10, 30, 0) }] }
        ]
      },
      { name: 'Attività', merges: [{ row: 0, col: 0, cols: 3 }], gridLines: false, rows: [[{ v: 'Titolo', style: { bold: true, size: 16 } }], [], ['x'.repeat(MAX_CELL_TEXT + 10)]] }
    ]
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('hex'), '504b0304');
  const files = unzip(bytes);
  assert.deepEqual([...files.keys()].sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].sort());
  for (const [name, text] of files) {
    assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), name);
    assert.doesNotMatch(text.replace(/&(amp|lt|gt|quot);/g, ''), /&/, `${name} escapes ampersands`);
  }
  const types = files.get('[Content_Types].xml');
  assert.match(types, /PartName="\/xl\/worksheets\/sheet2\.xml"/);
  assert.match(types, /sharedStrings\+xml/);
  const workbook = files.get('xl/workbook.xml');
  assert.match(workbook, /<sheet name="Attività" sheetId="1" r:id="rId1"\/><sheet name="Attività \(2\)" sheetId="2" r:id="rId2"\/>/);
  assert.match(workbook, /<definedName name="_xlnm\._FilterDatabase" localSheetId="0" hidden="1">'Attività'!\$A\$1:\$D\$4<\/definedName>/);
  assert.match(workbook, /<definedName name="_xlnm\.Print_Titles" localSheetId="0">'Attività'!\$1:\$1<\/definedName>/);
  assert.match(files.get('docProps/core.xml'), /<dc:title>Situazione &amp; &lt;stato&gt;<\/dc:title>/);

  const strings = sharedStrings(files);
  assert.ok(strings.includes('Riga 1\nRiga 2 &lt;b&gt;&amp;&lt;/b&gt; &quot;ok&quot;'));
  assert.equal(strings.find(text => text.startsWith('xxx')).length, MAX_CELL_TEXT);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<sheetPr><tabColor rgb="FF6C5CE7"\/><pageSetUpPr fitToPage="1"\/><\/sheetPr><dimension ref="A1:D4"\/>/);
  assert.match(sheet, /<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/);
  assert.match(sheet, /<col min="1" max="1" width="10" customWidth="1"\/><col min="2" max="2" width="40" customWidth="1"\/><col min="4" max="4" width="14" customWidth="1"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:D4"\/>/);
  assert.match(sheet, /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
  assert.equal(cell(sheet, 'C2')[1], '<v>12.5</v>');
  assert.equal(cell(sheet, 'D2')[1], '<v>46037</v>');
  assert.match(cell(sheet, 'D2')[0], /t="s"|s="\d+"/);
  assert.equal(cell(sheet, 'B3'), null, 'empty unstyled strings are omitted');
  assert.equal(cell(sheet, 'C3'), null, 'invalid numbers are omitted');
  assert.match(cell(sheet, 'D3')[0], /^<c r="D3" s="\d+"\/?>/, 'empty styled cells keep their fill');
  assert.match(sheet, /<row r="4" ht="30" customHeight="1"><c r="A4" t="b"><v>1<\/v><\/c><c r="B4" t="b"><v>0<\/v><\/c><c r="D4" s="\d+"><v>46148\.4375<\/v><\/c><\/row>/);
  assert.match(sheet, /<hyperlinks><hyperlink ref="A2" r:id="rId1"\/><\/hyperlinks>/);
  assert.doesNotMatch(sheet, /hyperlink ref="A3"/, 'only web links become hyperlinks');
  assert.equal(files.get('xl/worksheets/_rels/sheet1.xml.rels').includes('Target="https://jira.example.com/browse/PRJ-1?a=1&amp;b=2" TargetMode="External"'), true);

  const styles = files.get('xl/styles.xml');
  assert.match(styles, /<fill><patternFill patternType="solid"><fgColor rgb="FF202432"\/><bgColor indexed="64"\/><\/patternFill><\/fill>/);
  assert.match(styles, /<font><b\/><sz val="11"\/><color rgb="FFFFFFFF"\/>/);
  assert.match(styles, /<font><u\/><sz val="11"\/><color rgb="FF1F5FBF"\/>/);
  assert.match(styles, /<xf numFmtId="14" [^>]*applyNumberFormat="1"/);
  assert.match(styles, /<xf numFmtId="22" [^>]*applyNumberFormat="1"/);
  assert.match(styles, /<alignment vertical="top" wrapText="1"\/>/);
  assert.match(styles, /<left style="thin"><color rgb="FFCCCCCC"\/><\/left>/);
  const xfCount = Number(/<cellXfs count="(\d+)">/.exec(styles)[1]);
  assert.equal((styles.match(/<cellXfs[\s\S]*<\/cellXfs>/)[0].match(/<xf /g) || []).length, xfCount);
  const second = files.get('xl/worksheets/sheet2.xml');
  assert.match(second, /<sheetView showGridLines="0" workbookViewId="0">/);
  assert.match(second, /<mergeCells count="1"><mergeCell ref="A1:C1"\/><\/mergeCells>/);
  assert.match(files.get('xl/sharedStrings.xml'), /count="\d+" uniqueCount="\d+"/);
});

test('workbook requires at least one sheet and strips invalid XML characters', async () => {
  await assert.rejects(buildWorkbook({ sheets: [] }), /Nessun foglio da esportare/);
  const files = unzip(await buildWorkbook({ sheets: [{ name: 'S', rows: [['ok\u0001\uFFFF fine'], [{ v: 'custom', style: { numFmt: '0.0" h"' } }, { v: 3, style: { numFmt: '0.00' } }]] }] }));
  assert.ok(sharedStrings(files).includes('ok fine'));
  assert.match(files.get('xl/styles.xml'), /<numFmts count="1"><numFmt numFmtId="164" formatCode="0\.0&quot; h&quot;"\/><\/numFmts>/);
  assert.match(files.get('xl/styles.xml'), /<xf numFmtId="2" /);
});
