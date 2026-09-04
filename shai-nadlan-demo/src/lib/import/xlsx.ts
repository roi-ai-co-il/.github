/**
 * A minimal .xlsx reader.
 *
 * An xlsx is a zip of XML. Everything this app needs from one is the visible
 * grid of the sheet the user picks, so the reader is deliberately small: shared
 * strings, the worksheet, and just enough of the style table to know that a
 * cell holding 46388 is meant to be read as a date.
 *
 * The four things a naive reader gets wrong, all handled below:
 *   - a row that skips columns (<c r="D3"> straight after <c r="A3">)
 *   - a shared string split into runs (<si><r><t>שלום</t></r><r><t> עולם</t></r></si>)
 *   - an inline string (t="inlineStr") instead of a shared one
 *   - a date, which is a plain number until the style says otherwise
 */

import { unzipSync, strFromU8 } from 'fflate';

export interface SheetData {
  name: string;
  rows: string[][];
}

/* ------------------------------------------------------------------ helpers */

/** Column letters to a 0-based index: A→0, Z→25, AA→26. */
export function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** All `<t>` text inside one element, concatenated — which is exactly how a
 *  rich-text shared string is meant to be read. */
function textOf(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += unescapeXml(m[1] ?? '');
  return out;
}

/* ------------------------------------------------------------------- styles */

// The built-in number formats Excel reserves for dates and times.
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Does this format code describe a date? Strip anything quoted or escaped
 *  first, so a currency format like `"₪"#,##0` cannot be mistaken for one
 *  because of a letter inside its literal text. */
function isDateFormatCode(code: string): boolean {
  const bare = code
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '');
  return /[ymdhs]/i.test(bare) && !/^[^ymdhs]*$/i.test(bare);
}

function parseStyles(xml: string | undefined): { isDate: (styleIdx: number) => boolean } {
  if (!xml) return { isDate: () => false };

  const custom = new Map<number, string>();
  const fmtRe = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = fmtRe.exec(xml))) custom.set(+m[1], unescapeXml(m[2]));

  // Only the cellXfs block maps a cell's style index onto a numFmtId; cellStyleXfs
  // has the same shape and must not be read in its place.
  const cellXfs = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? '';
  const ids: number[] = [];
  const xfRe = /<xf\b[^>]*>/g;
  while ((m = xfRe.exec(cellXfs))) ids.push(+(/numFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0));

  return {
    isDate(styleIdx: number) {
      const id = ids[styleIdx];
      if (id === undefined) return false;
      if (BUILTIN_DATE_FMTS.has(id)) return true;
      const code = custom.get(id);
      return code ? isDateFormatCode(code) : false;
    },
  };
}

/* -------------------------------------------------------------------- dates */

/**
 * Excel's day 1 is 1900-01-01 and it also believes 1900 was a leap year, so
 * every serial from 61 up is one day ahead of a real count from 1900-01-01 —
 * anchoring at 1899-12-30 absorbs both facts at once. Workbooks saved by the
 * old Mac Excel use a 1904 epoch instead and say so in workbookPr.
 */
export function serialToIso(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(serial);
  // Serial 60 is Excel's imaginary 29 February 1900 and is not a real day.
  if (!date1904 && days === 60) return null;
  if (days < 1 || days > 2958465) return null;
  // Excel's serials 1..59 count from 1899-12-31 (its day 1 is 1900-01-01);
  // 60 is its imaginary 29 Feb 1900, rejected above; and from 61 on the extra
  // day means the count runs from 1899-12-30. One anchor cannot serve both.
  const epoch = date1904
    ? Date.UTC(1904, 0, 1)
    : days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const ms = epoch + days * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** A number as a human would have seen it in the cell — no exponent, no
 *  floating-point tail like 1234.5600000000001. */
function numberToText(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(15)));
}

/* ------------------------------------------------------------------ reading */

export function readXlsx(buf: ArrayBuffer): SheetData[] {
  const files = unzipSync(new Uint8Array(buf));
  const get = (path: string) => (files[path] ? strFromU8(files[path]) : undefined);

  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('NOT_XLSX');

  const date1904 = /date1904="(1|true)"/i.test(workbook);
  const styles = parseStyles(get('xl/styles.xml'));

  // Shared strings: index-ordered, one entry per <si>.
  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) shared.push(m[1] ? textOf(m[1]) : '');
  }

  // rId → file path, so a workbook whose sheets are not in xl/worksheets/sheetN.xml
  // (which happens) still resolves.
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  const relTarget = new Map<string, string>();
  {
    const re = /<Relationship\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rels))) {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1];
      let target = /Target="([^"]+)"/.exec(m[0])?.[1];
      if (!id || !target) continue;
      target = target.replace(/^\/?xl\//, '').replace(/^\.\//, '');
      relTarget.set(id, `xl/${target}`);
    }
  }

  const sheets: SheetData[] = [];
  const sheetRe = /<sheet\b[^>]*>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(workbook))) {
    const name = unescapeXml(/name="([^"]*)"/.exec(sm[0])?.[1] ?? `גיליון ${sheets.length + 1}`);
    // A hidden sheet is hidden for a reason; it is not what the user meant.
    if (/state="(hidden|veryHidden)"/i.test(sm[0])) continue;
    const rid = /r:id="([^"]+)"/.exec(sm[0])?.[1];
    const path = (rid && relTarget.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = get(path);
    if (!xml) continue;
    sheets.push({ name, rows: readSheet(xml, shared, styles, date1904) });
  }

  if (!sheets.length) throw new Error('NO_SHEETS');
  return sheets;
}

function readSheet(
  xml: string,
  shared: string[],
  styles: { isDate: (i: number) => boolean },
  date1904: boolean,
): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(xml))) {
    const attrs = rm[1] ?? '';
    const body = rm[2] ?? '';
    // Honour r="N": a spreadsheet with blank rows in the middle must keep them,
    // or every row below shifts up and lines up with the wrong data.
    const declared = +(/r="(\d+)"/.exec(attrs)?.[1] ?? 0);
    const target = declared > 0 ? declared - 1 : rows.length;
    while (rows.length < target) rows.push([]);

    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let auto = 0;
    while ((cm = cellRe.exec(body))) {
      const cAttrs = cm[1] ?? '';
      const inner = cm[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
      const idx = ref ? colIndex(ref) : auto;
      auto = idx + 1;
      while (cells.length < idx) cells.push('');

      const t = /t="([^"]+)"/.exec(cAttrs)?.[1];
      const s = /s="(\d+)"/.exec(cAttrs)?.[1];
      let value = '';

      if (t === 's') {
        const i = +(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? -1);
        value = shared[i] ?? '';
      } else if (t === 'inlineStr') {
        value = textOf(inner);
      } else if (t === 'str') {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      } else if (t === 'b') {
        value = /<v>1<\/v>/.test(inner) ? 'TRUE' : 'FALSE';
      } else if (t === 'e') {
        // A formula error (#REF!, #N/A). Keeping the text is honest; the row
        // will be flagged rather than silently reading as blank.
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw != null && raw !== '') {
          const n = Number(raw);
          if (!Number.isFinite(n)) value = unescapeXml(raw);
          else if (s != null && styles.isDate(+s)) value = serialToIso(n, date1904) ?? numberToText(n);
          else value = numberToText(n);
        }
      }
      cells.push(value);
    }
    rows.push(cells);
  }
  return rows;
}
