import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import RegistryList, { type RegistryRow } from '@/components/RegistryList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ישויות' };

export default async function EntitiesPage() {
  const supabase = await createClient();
  const [{ data: entities }, { data: properties }] = await Promise.all([
    supabase.from('owner_entities').select('id, name, entity_type').order('name'),
    supabase.from('properties').select('id, entity_id, current_value'),
  ]);

  // Counted here rather than with a database aggregate: the portfolio is small,
  // and one round trip beats a view that has to be kept in step with the table.
  const rows: RegistryRow[] = (entities ?? []).map((e) => {
    const owned = (properties ?? []).filter((p) => p.entity_id === e.id);
    return {
      id: e.id, name: e.name, sub: e.entity_type,
      count: owned.length,
      value: owned.reduce((s, p) => s + (p.current_value ?? 0), 0),
    };
  });

  return (
    <RegistryList
      title="ישויות"
      hint="מי מחזיק במה — אדם או חברה שעל שמם רשומים הנכסים"
      table="owner_entities"
      icon={Users}
      rows={rows}
      placeholder="שם הישות"
      subPlaceholder="יחיד / חברה"
      subLabel="סוג הישות"
    />
  );
}
