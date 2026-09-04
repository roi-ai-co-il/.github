/**
 * Turning a spreadsheet cell into a typed value.
 *
 * Every function here returns THREE states, never two. `Number('')` is 0 and
 * `parseInt('שני')` is NaN, and the `|| 0` that usually follows either one
 * turns "I could not read this" into a confident wrong answer that is
 * indistinguishable, downstream, from a real reading. A blank cell and a cell
 * we failed to parse are different facts and the review screen shows them
 * differently: blank is fine, unreadable is a red row the user must look at.
 */

export type Parsed<T> =
  | { state: 'ok'; value: T }
  | { state: 'empty' }
  | { state: 'unreadable'; raw: string };

export const ok = <T,>(value: T): Parsed<T> => ({ state: 'ok', value });
export const empty = <T,>(): Parsed<T> => ({ state: 'empty' });
export const bad = <T,>(raw: string): Parsed<T> => ({ state: 'unreadable', raw });

/** The value if it parsed, otherwise null — for callers that genuinely treat
 *  "blank" and "unreadable" the same (a nullable DB column). The DIFFERENCE is
 *  never lost, because the issue list is built from the Parsed value itself. */
export const valueOrNull = <T,>(p: Parsed<T>): T | null => (p.state === 'ok' ? p.value : null);

/* Spreadsheets carry invisible junk: a right-to-left mark before a number, a
   non-breaking space as a thousands separator, a zero-width joiner pasted out
   of a web page. None of it is visible and all of it breaks Number(). */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function clean(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).replace(INVISIBLE, '').replace(/\u00A0/g, ' ').trim();
}

export function text(raw: string | null | undefined): Parsed<string> {
  const s = clean(raw);
  return s ? ok(s) : empty();
}

/* ------------------------------------------------------------------ numbers */

/** A number written the way people write money: ₪, commas, a trailing "ש\"ח",
 *  a leading minus or a parenthesised negative. Anything left over after the
 *  known decorations are removed means we did NOT understand the cell. */
export function num(raw: string | null | undefined): Parsed<number> {
  const s0 = clean(raw);
  if (!s0) return empty();

  let s = s0
    .replace(/[₪$€£]/g, '')
    .replace(/ש["״']?ח/g, '')
    .replace(/\bILS\b|\bNIS\b/gi, '')
    .replace(/\bמ["״']?ר\b/g, '')
    .replace(/\bsqm\b|\bm2\b|\bm²\b/gi, '')
    .replace(/[,\s]/g, '')
    .trim();

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);

  // A bare "1.234.567" is a European thousands grouping, not a decimal.
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');

  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return bad(s0);
  const n = Number(s.endsWith('.') ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return bad(s0);
  return ok(negative ? -n : n);
}

/** Money must also be a sane magnitude. A cell holding a year (2019) in a rent
 *  column is readable as a number and is still not a rent. */
export function money(raw: string | null | undefined, band?: { min: number; max: number }): Parsed<number> {
  const p = num(raw);
  if (p.state !== 'ok') return p;
  if (p.value < 0) return bad(clean(raw));
  if (band && (p.value < band.min || p.value > band.max)) return bad(clean(raw));
  return p;
}

export function int(raw: string | null | undefined, band?: { min: number; max: number }): Parsed<number> {
  const p = num(raw);
  if (p.state !== 'ok') return p;
  if (!Number.isInteger(p.value)) return bad(clean(raw));
  if (band && (p.value < band.min || p.value > band.max)) return bad(clean(raw));
  return p;
}

/* -------------------------------------------------------------------- dates */

/** Is this y-m-d an actual day on the calendar? "2026-02-31" satisfies every
 *  regex ever written for a date and is not a date; Postgres rejects it with
 *  22007 and takes the whole request down with it. Reject what the DATABASE
 *  rejects, not what a pattern accepts. */
function realDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A two-digit year: 26 → 2026, 98 → 1998. The pivot is deliberate — a lease
 *  or a purchase in this portfolio is never in the 2070s. */
const widenYear = (y: number) => (y >= 100 ? y : y <= 69 ? 2000 + y : 1900 + y);

export type DateOrder = 'dmy' | 'mdy';

/**
 * `03/04/2026` is 3 April in Israel and 4 March in a US export, and NOTHING in
 * the cell says which. The order is therefore decided for the COLUMN, by
 * `detectDateOrder` below, and passed in here — never guessed per cell.
 */
export function date(raw: string | null | undefined, order: DateOrder = 'dmy'): Parsed<string> {
  const s = clean(raw);
  if (!s) return empty();

  // Already ISO (this is also what the xlsx reader emits for date cells).
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return realDay(y, mo, d) ? ok(iso(y, mo, d)) : bad(s);
  }

  // d/m/y or m/d/y, any of / . -
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = widenYear(+m[3]);
    let day: number, mo: number;
    if (order === 'dmy') { day = a; mo = b; } else { day = b; mo = a; }
    // A component that cannot be a month settles it regardless of the order.
    if (mo > 12 && day <= 12) { const t = mo; mo = day; day = t; }
    return realDay(y, mo, day) ? ok(iso(y, mo, day)) : bad(s);
  }

  // A month with no day carries no day — do NOT invent the 1st.
  if (/^\d{1,2}[-/.]\d{4}$/.test(s) || /^\d{4}$/.test(s)) return bad(s);

  return bad(s);
}

/**
 * Read a whole column and decide which order its dates are written in.
 * Evidence, not preference: a first component above 12 can only be a day, a
 * second component above 12 can only be a day in the other position. When the
 * column is entirely ambiguous (every value ≤ 12/12) we fall back to
 * day-first, because that is how dates are written in Israel — and the review
 * screen says so out loud rather than deciding quietly.
 */
export function detectDateOrder(values: (string | null | undefined)[]): {
  order: DateOrder;
  evidence: 'proven' | 'assumed';
} {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(clean(v));
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy > mdy) return { order: 'dmy', evidence: 'proven' };
  if (mdy > dmy) return { order: 'mdy', evidence: 'proven' };
  return { order: 'dmy', evidence: 'assumed' };
}

/* ------------------------------------------------------------------- phones */

/** Normalised to the local 0-prefixed form the rest of the app stores. A
 *  number we do not recognise is returned unreadable rather than mangled —
 *  a half-repaired phone number is worse than a visible problem. */
export function phone(raw: string | null | undefined): Parsed<string> {
  const s = clean(raw);
  if (!s) return empty();
  let d = s.replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4);
  else if (d.startsWith('972') && d.length >= 11) d = '0' + d.slice(3);
  d = d.replace(/\D/g, '');
  if (/^0(5\d|7\d)\d{7}$/.test(d)) return ok(d);   // mobile
  if (/^0[23489]\d{7}$/.test(d)) return ok(d);      // landline
  return bad(s);
}

/* --------------------------------------------------------------- vocabulary */

/** Map a written label onto a stored key. An unknown word is UNREADABLE, never
 *  the first option — a silently defaulted status is a lie the user cannot see. */
export function vocab(raw: string | null | undefined, table: Record<string, string[]>): Parsed<string> {
  const s = clean(raw);
  if (!s) return empty();
  const norm = s.toLowerCase().replace(/["'׳״]/g, '').replace(/\s+/g, ' ');
  for (const [key, words] of Object.entries(table)) {
    if (key.toLowerCase() === norm) return ok(key);
    for (const w of words) {
      const wn = w.toLowerCase().replace(/["'׳״]/g, '');
      if (wn === norm || norm.includes(wn)) return ok(key);
    }
  }
  return bad(s);
}

export function bool(raw: string | null | undefined): Parsed<boolean> {
  const s = clean(raw).toLowerCase().replace(/["'׳״]/g, '');
  if (!s) return empty();
  if (['כן', 'yes', 'y', 'true', '1', 'v', '✓', 'צמוד', 'מדד'].includes(s)) return ok(true);
  if (['לא', 'no', 'n', 'false', '0', '-', '—', 'x'].includes(s)) return ok(false);
  return bad(clean(raw));
}
