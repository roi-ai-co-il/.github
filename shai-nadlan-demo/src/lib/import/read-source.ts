/**
 * One entry point for "the user gave us a table" — a dropped file, a chosen
 * file, or a paste. Everything downstream sees the same rectangle of strings.
 */

import { decodeBytes, parseClipboardHtml, parseDelimited } from './csv';
import { readXlsx, type SheetData } from './xlsx';

export interface Source {
  kind: 'file' | 'paste';
  filename: string | null;
  sheets: SheetData[];
}

export class ImportReadError extends Error {}

const XLSX_EXT = /\.(xlsx|xlsm)$/i;
const OLD_XLS = /\.xls$/i;
const TEXT_EXT = /\.(csv|tsv|txt)$/i;

export async function readFile(file: File): Promise<Source> {
  const name = file.name;

  if (OLD_XLS.test(name)) {
    throw new ImportReadError(
      'זה קובץ Excel בפורמט הישן (‎.xls). פתח אותו באקסל ושמור בתור ‎.xlsx או ‎.csv, ונסה שוב.',
    );
  }

  const buf = await file.arrayBuffer();

  // A zip signature is what an xlsx actually is; the extension is only a hint,
  // and a file renamed to .csv by a well-meaning person is still a workbook.
  const head = new Uint8Array(buf.slice(0, 2));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;

  if (isZip || XLSX_EXT.test(name)) {
    try {
      return { kind: 'file', filename: name, sheets: readXlsx(buf) };
    } catch (e) {
      if (!TEXT_EXT.test(name)) {
        throw new ImportReadError(
          e instanceof Error && e.message === 'NOT_XLSX'
            ? 'לא הצלחנו לפתוח את הקובץ כגיליון אקסל. נסה לשמור אותו מחדש בתור ‎.xlsx או ‎.csv.'
            : 'הקובץ נראה פגום — נסה לשמור אותו מחדש מאקסל.',
        );
      }
    }
  }

  const text = decodeBytes(buf);
  if (!text.trim()) throw new ImportReadError('הקובץ ריק.');
  return { kind: 'file', filename: name, sheets: [{ name: name, rows: parseDelimited(text) }] };
}

/**
 * A paste. The HTML flavour is tried first and is strictly better — it keeps a
 * cell that contains a comma or a line break in one piece, which the plain-text
 * flavour cannot.
 */
export function readPaste(data: DataTransfer | null, plainFallback = ''): Source | null {
  const html = data?.getData('text/html') ?? '';
  if (html) {
    const rows = parseClipboardHtml(html);
    if (rows?.length) return { kind: 'paste', filename: null, sheets: [{ name: 'הדבקה', rows }] };
  }
  const text = data?.getData('text/plain') || plainFallback;
  if (!text.trim()) return null;
  return { kind: 'paste', filename: null, sheets: [{ name: 'הדבקה', rows: parseDelimited(text) }] };
}
