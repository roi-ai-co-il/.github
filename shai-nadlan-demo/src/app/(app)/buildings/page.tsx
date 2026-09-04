import { createClient } from '@/lib/supabase/server';
import RegistryList, { type RegistryRow } from '@/components/RegistryList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אתרים' };

export default async function BuildingsPage() {
  const supabase = await createClient();
  const [{ data: buildings }, { data: properties }] = await Promise.all([
    supabase.from('buildings').select('id, name, city').order('name'),
    supabase.from('properties').select('id, building_id, current_value'),
  ]);

  const rows: RegistryRow[] = (buildings ?? []).map((b) => {
    const inside = (properties ?? []).filter((p) => p.building_id === b.id);
    return {
      id: b.id, name: b.name, sub: b.city,
      count: inside.length,
      value: inside.reduce((s, p) => s + (p.current_value ?? 0), 0),
    };
  });

  return (
    <RegistryList
      title="אתרים"
      hint="בניין או מתחם שמכיל כמה נכסים. אם הנכסים שלך מפוזרים — אפשר לדלג על זה"
      table="buildings"
      rows={rows}
      placeholder="שם האתר"
      subPlaceholder="עיר"
      subLabel="עיר"
    />
  );
}
