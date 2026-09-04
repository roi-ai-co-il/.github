/**
 * Deciding what each column IS.
 *
 * Two independent kinds of evidence, deliberately kept apart so the review
 * screen can say which one carried a mapping:
 *
 *   header evidence — the words in the column title
 *   value evidence  — what the column actually contains
 *
 * Either can map a column alone. That is the whole point: a column titled
 * "עמודה 3" full of Israeli cities is a city column, and a column titled
 * "City" full of rents is not one.
 */

import { FIELDS, sampleWeight, type FieldDef } from './fields';
import { columnValues } from './grid';

export type MatchBasis = 'header' | 'values' | 'both' | 'manual' | 'none';

export interface ColumnMapping {
  column: number;
  header: string;
  fieldKey: string | null;
  confidence: number;      // 0..1
  basis: MatchBasis;
  /** Runners-up, so the mapping UI can offer "did you mean…" without rescoring. */
  alternatives: { fieldKey: string; score: number }[];
}

/* Words that carry no meaning in a header and only dilute a comparison. */
const NOISE = /\b(של|את|ה|the|of|no|num|number|מספר|מס)\b/g;

export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/[()[\]{}.,:;\\/_+*#?!|-]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hebrew has no ASCII word boundary — `\b` matches nothing useful in it, which
 * is why "מדד" must not be allowed to match inside "המדדים" by accident while
 * still matching "צמוד מדד". The boundary is checked explicitly against a
 * Unicode letter/digit class instead.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const boundary = /[\p{L}\p{N}]/u;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = i > 0 ? haystack[i - 1] : '';
    const after = i + needle.length < haystack.length ? haystack[i + needle.length] : '';
    if ((!before || !boundary.test(before)) && (!after || !boundary.test(after))) return true;
    from = i + 1;
  }
}

/** 0..1. A longer synonym matching is stronger evidence than a shorter one —
 *  "שכר דירה מבוקש" must beat "שכר דירה" on the same header. */
export function headerScore(header: string, field: FieldDef): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of field.synonyms) {
    const s = normalizeHeader(syn);
    if (!s) continue;
    const specificity = Math.min(1, s.length / 14);
    let score = 0;
    if (h === s) score = 0.85 + 0.15 * specificity;
    else if (containsWord(h, s)) score = 0.55 + 0.3 * specificity;
    else if (containsWord(s, h) && h.length >= 3) score = 0.42 + 0.2 * specificity;
    else {
      const ht = new Set(h.split(' ').filter(Boolean));
      const st = s.split(' ').filter(Boolean);
      if (st.length) {
        const overlap = st.filter((t) => ht.has(t)).length / st.length;
        if (overlap >= 0.5) score = 0.3 * overlap;
      }
    }
    if (score > best) best = score;
  }
  return best;
}

export interface AutoMapResult {
  mappings: ColumnMapping[];
  /** Fields the sheet does not appear to carry at all. */
  unmapped: string[];
}

/**
 * Greedy best-first assignment: every (column, field) pair is scored, the pairs
 * are taken in descending order, and each column and each field is claimed at
 * most once. Greedy is right here because the scores are far apart in practice
 * and because the user can override any single decision — an optimal
 * assignment that is harder to explain would be a worse product.
 */
export function autoMap(headers: string[], body: string[][]): AutoMapResult {
  const values = headers.map((_, c) => columnValues(body, c));

  const pairs: { col: number; field: FieldDef; score: number; basis: MatchBasis }[] = [];
  for (let c = 0; c < headers.length; c++) {
    for (const field of FIELDS) {
      const hs = headerScore(headers[c], field);
      // Two values agreeing is real evidence, but less of it than twenty.
      const weight = sampleWeight(values[c]);
      const vsRaw = (field.shape ? field.shape(values[c]) : 0) * weight;
      const vs = Math.max(-1, Math.min(1, vsRaw));

      // A header match is the stronger signal; values confirm it, or carry the
      // mapping alone at a discount. A NEGATIVE shape score (the values are the
      // wrong kind of thing) suppresses a header that merely reads right.
      let score: number;
      let basis: MatchBasis;
      if (hs > 0 && vs > 0)      { score = hs * 0.72 + vs * 0.28; basis = 'both'; }
      else if (hs > 0)           { score = hs * (vs < 0 ? 0.45 : 0.85);  basis = 'header'; }
      // Only here does the prior apply: the header had nothing to say.
      else if (vs > 0)           { score = vs * 0.6 * (field.valuePrior ?? 1); basis = 'values'; }
      else continue;

      if (score > 0.001) pairs.push({ col: c, field, score, basis });
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  const byCol = new Map<number, { field: FieldDef; score: number; basis: MatchBasis }>();
  const takenFields = new Set<string>();
  const alternatives = new Map<number, { fieldKey: string; score: number }[]>();

  for (const p of pairs) {
    const list = alternatives.get(p.col) ?? [];
    if (list.length < 4 && !list.some((a) => a.fieldKey === p.field.key)) {
      list.push({ fieldKey: p.field.key, score: Number(p.score.toFixed(3)) });
      alternatives.set(p.col, list);
    }
    if (byCol.has(p.col) || takenFields.has(p.field.key)) continue;
    if (p.score < 0.28) continue;   // below this it is a guess, not a reading
    byCol.set(p.col, { field: p.field, score: p.score, basis: p.basis });
    takenFields.add(p.field.key);
  }

  const mappings: ColumnMapping[] = headers.map((header, column) => {
    const hit = byCol.get(column);
    return {
      column,
      header,
      fieldKey: hit?.field.key ?? null,
      confidence: hit ? Math.min(1, hit.score) : 0,
      basis: hit?.basis ?? 'none',
      alternatives: (alternatives.get(column) ?? []).filter((a) => a.fieldKey !== hit?.field.key),
    };
  });

  return {
    mappings,
    unmapped: FIELDS.filter((f) => !takenFields.has(f.key)).map((f) => f.key),
  };
}

/** Apply a manual override, keeping the "one field, one column" invariant —
 *  choosing a field that another column already holds moves it. */
export function setMapping(mappings: ColumnMapping[], column: number, fieldKey: string | null): ColumnMapping[] {
  return mappings.map((m) => {
    if (m.column === column) return { ...m, fieldKey, confidence: fieldKey ? 1 : 0, basis: fieldKey ? 'manual' : 'none' };
    if (fieldKey && m.fieldKey === fieldKey) return { ...m, fieldKey: null, confidence: 0, basis: 'none' };
    return m;
  });
}
