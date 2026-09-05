/**
 * What deleting a property really destroys.
 *
 * The foreign keys cascade further than anyone reading the delete button would
 * guess: a property takes its leases with it, the leases take every rent
 * payment, and the payments take the receipts that were issued for them. The
 * confirmation used to say "including its contracts and images", which is true
 * and badly incomplete — the worst shape a warning can have.
 *
 * This list is the dialog's vocabulary. It is checked against the live foreign
 * key graph by scripts/test-delete-impact.mjs, so a table added later that also
 * cascades from `properties` fails the build instead of quietly going unnamed.
 */
export interface CascadeChild {
  /** The table, as the FK graph names it. */
  table: string;
  /** Hebrew for one, and for many — "1 חוזה" reads wrong as "1 חוזים". */
  one: string;
  many: string;
}

export const PROPERTY_CASCADE: CascadeChild[] = [
  { table: 'leases',             one: 'חוזה',          many: 'חוזים' },
  { table: 'lease_payments',     one: 'תשלום',         many: 'תשלומים' },
  { table: 'receipts',           one: 'קבלה שהופקה',   many: 'קבלות שהופקו' },
  { table: 'property_documents', one: 'מסמך',          many: 'מסמכים' },
  { table: 'property_images',    one: 'תמונה',         many: 'תמונות' },
  { table: 'repairs',            one: 'תיקון',         many: 'תיקונים' },
];

/** Only the things that actually exist get mentioned — a zero is noise. */
export function impactLines(counts: Record<string, number>) {
  return PROPERTY_CASCADE
    .filter((c) => (counts[c.table] ?? 0) > 0)
    .map((c) => ({
      label: counts[c.table] === 1 ? c.one : c.many,
      count: counts[c.table],
    }));
}
