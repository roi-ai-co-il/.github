import { ILS } from '@/lib/format';

/**
 * תיקונים — an electrician, a plumber, a leak.
 *
 * The only thing the app decides is WHO PAYS. Every amount that follows from
 * that decision is computed by the database (generated columns on `repairs`),
 * so a screen can read them but can never invent them and can never disagree
 * with another screen. This file is only vocabulary and formatting.
 */

export type ChargeMode = 'owner' | 'tenant' | 'split';

export const CHARGE_MODES: { value: ChargeMode; label: string; hint: string }[] = [
  { value: 'owner',  label: 'על חשבוני',       hint: 'יורד מהרווח' },
  { value: 'tenant', label: 'על חשבון הדייר',  hint: 'נגבה ממנו' },
  { value: 'split',  label: 'חלוקה',           hint: 'חלק ממנו, חלק ממני' },
];

export const CHARGE_LABEL: Record<ChargeMode, string> =
  Object.fromEntries(CHARGE_MODES.map((m) => [m.value, m.label])) as Record<ChargeMode, string>;

/** Suggestions, not a closed list — the column has no CHECK on it. */
export const TRADES = [
  'אינסטלטור', 'חשמלאי', 'מזגנים', 'צבע', 'ניקיון',
  'מנעולן', 'שיפוצניק', 'גנן', 'דוד שמש', 'אטימות', 'אחר',
];

export interface RepairRow {
  id: string;
  property_id: string;
  vendor_id: string | null;
  title: string;
  trade: string | null;
  reported_on: string;
  done_on: string | null;
  cost: string | number | null;
  charge_mode: ChargeMode;
  tenant_share: string | number | null;
  tenant_charge: string | number | null;
  owner_cost: string | number | null;
  notes: string | null;
  property?: { id: string; name: string } | null;
  vendor?: { id: string; name: string; trade: string | null } | null;
}

/**
 * PostgREST sends numeric as a string, and an absent invoice as null.
 *
 * Returning null rather than 0 is the whole point: `Number(null)` is 0 and
 * `parseFloat('') || 0` is 0, and both are indistinguishable downstream from a
 * repair that genuinely cost nothing. A repair whose invoice has not arrived
 * has to stay unknown all the way to the screen.
 */
export function money(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ₪ when the amount is known, an em dash when it is not. Never ₪0 for null. */
export function ILSorDash(v: string | number | null | undefined): string {
  const n = money(v);
  return n == null ? '—' : ILS(n);
}

export const isOpen = (r: RepairRow) => r.done_on == null;

/** Only a split has two halves worth naming. */
export const isSplit = (r: RepairRow) => r.charge_mode === 'split';

/** One line saying who ended up paying, in the words on the form. */
export function whoPaid(r: RepairRow): string {
  if (r.charge_mode === 'owner') return 'על חשבוני';
  if (r.charge_mode === 'tenant') return 'על חשבון הדייר';
  const share = money(r.tenant_share);
  return share == null ? 'חלוקה' : `חלוקה · ${ILS(share)} מהדייר`;
}

/**
 * What a set of repairs did to the profit, and what was passed on.
 *
 * `unknown` is reported rather than folded into the totals: three invoices
 * that have not arrived is a fact the screen should say out loud, not a
 * silent ₪0 that makes a bad month look like a good one.
 */
export function totals(rows: RepairRow[]) {
  let fromProfit = 0;
  let fromTenants = 0;
  let unknown = 0;
  let recharged = 0;
  for (const r of rows) {
    const own = money(r.owner_cost);
    const ten = money(r.tenant_charge);
    if (own == null && money(r.cost) == null) { unknown += 1; continue; }
    fromProfit += own ?? 0;
    fromTenants += ten ?? 0;
    if ((ten ?? 0) > 0) recharged += 1;
  }
  return { fromProfit, fromTenants, unknown, recharged, open: rows.filter(isOpen).length };
}
