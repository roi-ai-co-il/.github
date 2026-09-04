/**
 * Reading a Hebrew address that carries the unit inside it.
 *
 * Shai writes his properties the way every Israeli landlord does — the street,
 * then the floor, then the flat: "רוטשילד 12 קומה 1 דירה 2". Three facts are
 * hiding in that one string, and pulling them out is what makes the rest work:
 *
 *   - the FLOOR, so the field does not have to be typed again
 *   - the FLAT, which is what makes two rows at one address two properties
 *   - the BASE address, which is what makes them one BUILDING
 *
 * The base address is used only for grouping. Duplicate detection keeps using
 * the full address, because "קומה 1 דירה 2" and "קומה 4 דירה 7" at the same
 * street are emphatically not the same property.
 */

import { clean } from './coerce';

export interface ParsedAddress {
  /** The address with the floor/flat part removed — the building. */
  base: string;
  floor: number | null;
  apartment: string | null;
  /** True when a unit marker was actually found, rather than merely absent. */
  hasUnit: boolean;
}

/* Hebrew abbreviations come with any of four apostrophes, or none at all. */
const G = '["\'׳״]?';

const FLOOR_RE = new RegExp(`(?:^|[\\s,־-])(?:קומה|קומת|ק${G})\\s*[.:]?\\s*(\\d{1,2}|קרקע|מרתף)`, 'u');
const FLAT_RE = new RegExp(`(?:^|[\\s,־-])(?:דירה|דירת|יחידה|ד${G})\\s*[.:]?\\s*([0-9]{1,4}[א-ת]?)`, 'u');
/* "רוטשילד 12/7" — a house number, a slash, a flat. Only after a number, so a
   date or a fraction elsewhere in the line cannot be mistaken for one. */
const SLASH_FLAT_RE = /(\d{1,4})\s*\/\s*([0-9]{1,4}[א-ת]?)(?=\s|,|$)/u;

const FLOOR_WORDS: Record<string, number> = { 'קרקע': 0, 'מרתף': -1 };

export function parseAddress(raw: string): ParsedAddress {
  const s = clean(raw);
  if (!s) return { base: '', floor: null, apartment: null, hasUnit: false };

  let base = s;
  let floor: number | null = null;
  let apartment: string | null = null;

  const fm = FLOOR_RE.exec(s);
  if (fm) {
    const v = fm[1];
    floor = v in FLOOR_WORDS ? FLOOR_WORDS[v] : Number(v);
    if (!Number.isFinite(floor)) floor = null;
    base = base.replace(fm[0], ' ');
  }

  const am = FLAT_RE.exec(s);
  if (am) {
    apartment = am[1];
    base = base.replace(am[0], ' ');
  } else {
    const sm = SLASH_FLAT_RE.exec(s);
    if (sm) {
      apartment = sm[2];
      base = base.replace(sm[0], ` ${sm[1]} `);
    }
  }

  base = base.replace(/[,;]\s*(?=[,;]|$)/g, ' ').replace(/\s+/g, ' ').replace(/[\s,־-]+$/, '').trim();

  return { base: base || s, floor, apartment, hasUnit: !!(am || floor !== null || apartment) };
}

/** The grouping key for "these rows are in the same building". */
export function buildingKey(address: string, city: string): string {
  const { base } = parseAddress(address);
  const strip = (v: string) =>
    clean(v).replace(/["'׳״]/g, '')
      .replace(/[.,\-־/\\]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STREET_WORDS.has(w))
      .join(' ')
      .toLowerCase();
  return `${strip(base)}|${strip(city)}`;
}

const STREET_WORDS = new Set(['רחוב', 'רח', 'שדרות', 'שד', 'שדרת', 'סמטת', 'דרך']);

/** A readable name for a building we are creating ourselves. */
export function buildingNameFor(address: string, city: string): string {
  const { base } = parseAddress(address);
  const b = base.trim();
  const c = clean(city);
  return c && !b.includes(c) ? `${b}, ${c}` : b;
}
