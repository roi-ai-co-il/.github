/**
 * From a raw rectangle of cells to "here is the header, here is the data".
 *
 * Real spreadsheets do not start at A1 with a header. They start with a title,
 * a blank row, sometimes a merged banner, and only then the column names — so
 * assuming row 1 is the header is the single fastest way to import 28 rows of
 * garbage. The header is FOUND, and the user can move it.
 */

export interface Grid {
  /** Every row, empty edges trimmed away. */
  rows: string[][];
  /** Index into `rows` of the row holding the column names, or -1 when the
   *  table has none — a paste straight out of a selection usually does not, and
   *  treating its first row as a header silently DELETES a property. */
  headerRow: number;
  headers: string[];
  /** Data rows, i.e. everything below the header that has any content. */
  body: string[][];
  /** How the header row was chosen — shown to the user, never hidden. */
  headerEvidence: 'detected' | 'none' | 'chosen';
}

const isBlank = (v: string | undefined) => !v || !v.trim();

/** Trim rows and columns that are empty everywhere, so a sheet with a wide
 *  print area does not present 40 phantom columns. */
export function trimGrid(raw: string[][]): string[][] {
  const rows = raw.map((r) => r.map((c) => (c ?? '').toString()));
  let top = 0, bottom = rows.length;
  while (top < bottom && rows[top].every(isBlank)) top++;
  while (bottom > top && rows[bottom - 1].every(isBlank)) bottom--;
  const kept = rows.slice(top, bottom);
  if (!kept.length) return [];

  const width = Math.max(...kept.map((r) => r.length));
  const used: boolean[] = Array.from({ length: width }, (_, c) =>
    kept.some((r) => !isBlank(r[c])),
  );
  let left = 0, right = width;
  while (left < right && !used[left]) left++;
  while (right > left && !used[right - 1]) right--;

  return kept.map((r) => {
    const out: string[] = [];
    for (let c = left; c < right; c++) out.push((r[c] ?? '').trim());
    return out;
  });
}

const looksNumeric = (v: string) => /^[\d\s.,₪%-]+$/.test(v.trim()) && /\d/.test(v);
/* A header cell is a word. A cell that reads as a date is data, however
   label-like it looks — without this, a sheet whose first row is already data
   can out-score the real header row above it. */
const looksDatey = (v: string) => /^\d{1,4}[-/.]\d{1,2}([-/.]\d{2,4})?$/.test(v.trim());
const isLabelish = (v: string) => !looksNumeric(v) && !looksDatey(v) && v.length <= 40;
/* The test that separates a header from a first row of data: a column NAME is
   a word. "כתובת" is one; "רוטשילד 12", "054-1234567" and "₪6,200" are not,
   and a row made mostly of those is data no matter what sits under it. */
const isPureLabel = (v: string) => isLabelish(v) && !/\d/.test(v) && v.trim().length > 0;

/**
 * Score a candidate header row. A header is a row of short, non-numeric,
 * distinct labels that fills roughly the same columns the rows beneath it fill.
 * That last part is what separates a header from a title line: a title fills
 * one cell, a header fills the whole width.
 */
function headerScore(rows: string[][], i: number): number {
  const row = rows[i];
  if (!row) return -1;
  const filled = row.filter((c) => !isBlank(c));
  if (filled.length < 2) return -1;

  const labelish = filled.filter(isLabelish).length;
  if (labelish < 2) return -1;

  const distinct = new Set(filled.map((c) => c.trim())).size / filled.length;

  // How well this row's filled columns line up with the body below it.
  const below = rows.slice(i + 1, i + 6).filter((r) => r.some((c) => !isBlank(c)));
  if (!below.length) return -1;
  const width = Math.max(...rows.map((r) => r.length));
  let agree = 0;
  for (let c = 0; c < width; c++) {
    const headerHas = !isBlank(row[c]);
    const bodyHas = below.some((r) => !isBlank(r[c]));
    if (headerHas === bodyHas) agree++;
  }
  const coverage = agree / Math.max(1, width);

  // The body under a real header is measurably less label-like than the header.
  const bodyLabelish =
    below.reduce((n, r) => n + r.filter((c) => !isBlank(c) && isLabelish(c)).length, 0) /
    Math.max(1, below.reduce((n, r) => n + r.filter((c) => !isBlank(c)).length, 0));
  const contrast = Math.max(0, (labelish / filled.length) - bodyLabelish);

  return labelish * 1.0 + distinct * 3 + coverage * 6 + contrast * 4 - i * 0.4;
}

/** Share of a row's filled cells that read as column NAMES rather than values. */
function pureLabelRatio(row: string[]): number {
  const filled = row.filter((c) => !isBlank(c));
  if (!filled.length) return 0;
  return filled.filter(isPureLabel).length / filled.length;
}

/* Below this, the best candidate is not a header at all and the table is read
   as headerless. Set from the two shapes that matter: a real Hebrew or English
   header scores 1.0, and a pasted first data row of address/city/name/phone/
   money/date scores about 0.33. */
const HEADER_BAR = 0.6;

export function buildGrid(raw: string[][], forcedHeaderRow?: number): Grid {
  const rows = trimGrid(raw);
  if (!rows.length) {
    return { rows: [], headerRow: -1, headers: [], body: [], headerEvidence: 'none' };
  }

  let headerRow = -1;
  let evidence: Grid['headerEvidence'] = 'none';

  if (forcedHeaderRow != null && forcedHeaderRow >= 0 && forcedHeaderRow < rows.length) {
    headerRow = forcedHeaderRow;
    evidence = 'chosen';
  } else {
    let best = -Infinity;
    headerRow = -1;
    const limit = Math.min(rows.length - 1, 15);
    for (let i = 0; i <= limit; i++) {
      const s = headerScore(rows, i);
      if (s > best && pureLabelRatio(rows[i]) >= HEADER_BAR) { best = s; headerRow = i; }
    }
    evidence = headerRow >= 0 ? 'detected' : 'none';
  }

  const width = Math.max(...rows.map((r) => r.length));
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const base = headerRow >= 0 ? (rows[headerRow]?.[c] ?? '').trim() : '';
    const label = base || `עמודה ${c + 1}`;
    // Two columns called "תאריך" must stay distinguishable in the mapping UI.
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    headers.push(n === 1 ? label : `${label} (${n})`);
  }

  const body = rows.slice(headerRow + 1).filter((r) => r.some((c) => !isBlank(c)));
  return { rows, headerRow, headers, body, headerEvidence: evidence };
}

/** The values of one column across the body, for the shape tests. */
export function columnValues(body: string[][], col: number, limit = 60): string[] {
  const out: string[] = [];
  for (const row of body) {
    out.push((row[col] ?? '').trim());
    if (out.length >= limit) break;
  }
  return out;
}
