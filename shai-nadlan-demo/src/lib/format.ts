const ilsFmt = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

export const ILS = (v: number | null | undefined) => ilsFmt.format(v ?? 0);

export const heDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const heDateLong = (d: string | Date) =>
  new Date(d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Whole days from today until `date` (negative = already passed). */
export function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** WhatsApp link from an Israeli phone number. */
export const waLink = (phone: string) =>
  `https://wa.me/${phone.replace(/[^0-9]/g, '').replace(/^0/, '972')}`;

/** Hebrew inflects one, two and many differently, and "1 ימים" is exactly what
 *  makes an app sound machine-written. One helper so every screen says it the
 *  same way — the dashboard, the tasks list and the lease badges all used to
 *  format this themselves. */
export function heDays(n: number): string {
  const d = Math.abs(Math.round(n));
  if (d === 0) return 'היום';
  if (d === 1) return 'יום אחד';
  if (d === 2) return 'יומיים';
  return `${d} ימים`;
}
