/**
 * CSV / TSV, and the clipboard.
 *
 * Written by hand rather than pulled in, because the interesting cases here
 * are not the RFC: a UTF-8 BOM that Excel always writes, a Hebrew file saved
 * as windows-1255, a semicolon delimiter from a European Excel, and a paste
 * out of a browser table that arrives as HTML.
 */

const DELIMITERS = [',', '\t', ';', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Count each candidate delimiter OUTSIDE quotes across the first few lines and
 * take the one whose per-line count is both highest and most consistent —
 * a consistent count is what tells a real delimiter from a comma that merely
 * appears inside addresses.
 */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  if (!lines.length) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((line) => {
      let n = 0, q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') q = !q;
        else if (!q && c === d) n++;
      }
      return n;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const mean = total / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    // Consistency dominates: 4 commas on every line beats 9 on one line and 0 elsewhere.
    const score = mean / (1 + variance);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** RFC-4180 with the real-world tolerances: CRLF/LF/CR, "" escaping, and a
 *  final line with no newline. */
export function parseDelimited(text: string, delimiter?: Delimiter): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const d = delimiter ?? sniffDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"' && field === '') { quoted = true; continue; }
    if (c === d) { row.push(field); field = ''; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * A paste out of Excel, Sheets or a web page. The browser puts BOTH a
 * `text/html` and a `text/plain` flavour on the clipboard; the HTML one is
 * strictly better, because a cell containing a comma or a line break survives
 * it intact and is destroyed by the plain-text one.
 */
export function parseClipboardHtml(html: string): string[][] | null {
  if (typeof DOMParser === 'undefined') return null;
  let doc: Document;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return null; }
  const table = doc.querySelector('table');
  if (!table) return null;

  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td, th'));
    if (!cells.length) continue;
    rows.push(cells.map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()));
  }
  return rows.length ? rows : null;
}

/**
 * Decode file bytes. Hebrew CSVs exported by older Israeli software are
 * windows-1255, not UTF-8, and decoding those as UTF-8 produces a page of
 * replacement characters rather than an error — so the mojibake itself is the
 * signal to try again.
 */
export function decodeBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements === 0) return utf8;
  for (const enc of ['windows-1255', 'windows-1252']) {
    try {
      const alt = new TextDecoder(enc).decode(bytes);
      if (!alt.includes('\uFFFD')) return alt;
    } catch { /* the browser does not ship this legacy decoder */ }
  }
  return utf8;
}
