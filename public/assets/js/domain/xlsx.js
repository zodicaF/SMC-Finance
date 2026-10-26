// @ts-check
// Builds an Excel workbook (.xlsx) from rows, with no library. An .xlsx file is a zip of a few
// XML files, so this writes the zip itself (stored, no compression). Pure code: no DOM, no
// storage, so it can also run on the server later.
//
// Text goes in as text cells, never as formulas, so a beneficiary called "=1+1" stays text and
// IBANs keep their letters. Amounts and dates are real numbers and dates, so Excel can sum,
// sort and filter them.

/**
 * @typedef {'text' | 'int' | 'amount' | 'rate' | 'date'} ColumnType
 * @typedef {{header: string, key: string, type: ColumnType, width?: number}} Column
 */

const ENC = new TextEncoder();

/** @param {string} s */
const bytes = (s) => ENC.encode(s);

// ---- zip ----------------------------------------------------------------------------------

/** @type {Uint32Array | null} */
let crcTable = null;

/** @param {Uint8Array} data */
export function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip file holding the given files, uncompressed.
 * @param {{name: string, data: Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function zipStore(files) {
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // fixed stamp: 2026-01-01
  /** @type {Uint8Array[]} */
  const parts = [];
  /** @type {Uint8Array[]} */
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = bytes(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, file.data.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- spreadsheet XML ----------------------------------------------------------------------

/** XML-safe text: control characters Excel rejects are dropped. @param {unknown} value */
export function xmlText(value) {
  return (
    String(value ?? '')
      // eslint-disable-next-line no-control-regex -- removing control characters is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

/** 0 -> 'A', 25 -> 'Z', 26 -> 'AA'. @param {number} index */
export function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * An ISO time as an Excel date number showing Riyadh wall-clock time (UTC+3, no daylight saving).
 * @param {string} iso
 */
export function excelDate(iso) {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.round(((ms + 3 * 3600000) / 86400000 + 25569) * 1e6) / 1e6;
}

/** Cell style numbers in styles.xml, by column type. */
const STYLE = { text: 0, header: 1, amount: 2, date: 3, rate: 4, int: 5 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/><numFmt numFmtId="165" formatCode="0.0000"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE3EE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Sheet names: at most 31 characters, none of []:*?/\ . @param {string} name */
export function safeSheetName(name) {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || 'Sheet1';
}

/**
 * @param {{sheetName: string, rtl?: boolean, columns: Column[], rows: Record<string, any>[]}} options
 * @returns {Uint8Array}  the .xlsx file
 */
export function buildXlsx({ sheetName, rtl = false, columns, rows }) {
  const cell = (
    /** @type {number} */ col,
    /** @type {number} */ row,
    /** @type {Column} */ c,
    /** @type {any} */ value,
  ) => {
    const ref = `${columnName(col)}${row}`;
    if (value === null || value === undefined || value === '') return '';
    if (c.type === 'text') {
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
    }
    const n = c.type === 'date' ? excelDate(String(value)) : Number(value);
    if (n === null || !Number.isFinite(n)) return '';
    return `<c r="${ref}" s="${STYLE[c.type]}"><v>${n}</v></c>`;
  };

  const head = columns
    .map(
      (c, i) =>
        `<c r="${columnName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${xmlText(c.header)}</t></is></c>`,
    )
    .join('');
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 2}">${columns.map((c, i) => cell(i, r + 2, c, row[c.key])).join('')}</row>`,
    )
    .join('');
  const last = `${columnName(columns.length - 1)}${rows.length + 1}`;
  const widths = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths}</cols><sheetData><row r="1" ht="30" customHeight="1">${head}</row>${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlText(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const rels = (/** @type {string} */ inner) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  return zipStore([
    {
      name: '[Content_Types].xml',
      data: bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      name: '_rels/.rels',
      data: bytes(
        rels(`<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/>`),
      ),
    },
    { name: 'xl/workbook.xml', data: bytes(workbook) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: bytes(
        rels(
          `<Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/>`,
        ),
      ),
    },
    { name: 'xl/styles.xml', data: bytes(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: bytes(sheet) },
  ]);
}
