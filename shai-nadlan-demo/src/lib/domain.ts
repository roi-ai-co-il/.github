import { heDays } from './format';
export const PROPERTY_TYPES: Record<string, string> = {
  apartment: 'דירה',
  penthouse: 'פנטהאוז',
  garden_apartment: 'דירת גן',
  house: 'בית פרטי',
  commercial: 'מסחרי',
  office: 'משרד',
  storage: 'מחסן',
  parking: 'חניה',
};

export const PROPERTY_STATUS: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  rented:     { label: 'מושכר',  dot: 'bg-success', text: 'text-success', bg: 'bg-success-tint' },
  vacant:     { label: 'פנוי',   dot: 'bg-warning', text: 'text-warning', bg: 'bg-warning-tint' },
  renovation: { label: 'בשיפוץ', dot: 'bg-info',    text: 'text-info',    bg: 'bg-info-tint' },
  for_sale:   { label: 'למכירה', dot: 'bg-accent',  text: 'text-accent',  bg: 'bg-accent-tint' },
};

/** Lease urgency from days-to-end. */
export function leaseUrgency(days: number): 'expired' | 'critical' | 'soon' | 'ok' {
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'soon';
  return 'ok';
}

export const URGENCY_STYLE: Record<
  string,
  { label: (d: number) => string; text: string; bg: string; bar: string }
> = {
  expired:  { label: (d) => `הסתיים לפני ${heDays(d)}`, text: 'text-danger',  bg: 'bg-danger-tint',  bar: 'bg-danger' },
  critical: { label: (d) => (d === 0 ? 'מסתיים היום' : `נותרו ${heDays(d)}`), text: 'text-danger', bg: 'bg-danger-tint', bar: 'bg-danger' },
  soon:     { label: (d) => `נותרו ${heDays(d)}`, text: 'text-warning', bg: 'bg-warning-tint', bar: 'bg-warning' },
  ok:       { label: (d) => `נותרו ${heDays(d)}`, text: 'text-success', bg: 'bg-success-tint', bar: 'bg-success' },
};
