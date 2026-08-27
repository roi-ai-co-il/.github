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
  rented:     { label: 'מושכר',   dot: 'bg-green-500',  text: 'text-green-800',  bg: 'bg-green-50' },
  vacant:     { label: 'פנוי',    dot: 'bg-amber-500',  text: 'text-amber-800',  bg: 'bg-amber-50' },
  renovation: { label: 'בשיפוץ',  dot: 'bg-violet-500', text: 'text-violet-800', bg: 'bg-violet-50' },
  for_sale:   { label: 'למכירה',  dot: 'bg-sky-500',    text: 'text-sky-800',    bg: 'bg-sky-50' },
};

/** Lease urgency from days-to-end. */
export function leaseUrgency(days: number): 'expired' | 'critical' | 'soon' | 'ok' {
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'soon';
  return 'ok';
}

export const URGENCY_STYLE: Record<string, { label: (d: number) => string; text: string; bg: string; border: string }> = {
  expired:  { label: (d) => `הסתיים לפני ${Math.abs(d)} ימים`, text: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200' },
  critical: { label: (d) => (d === 0 ? 'מסתיים היום' : `נותרו ${d} ימים`), text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  soon:     { label: (d) => `נותרו ${d} ימים`, text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  ok:       { label: (d) => `נותרו ${d} ימים`, text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
};
