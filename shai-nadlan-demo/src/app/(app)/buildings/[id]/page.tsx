import { notFound } from 'next/navigation';
import { Building } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import RegistryDetail from '@/components/RegistryDetail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ?? 'אתר' };
}

/** One site: what it holds, what it is worth, and every unit in it. */
export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: building }, { data: properties }] = await Promise.all([
    supabase.from('buildings')
      .select('id, name, address, city, notes, entity:owner_entities(name)')
      .eq('id', id).maybeSingle(),
    supabase.from('properties')
      .select('id, name, address, city, property_type, rooms, area_sqm, floor_no, status, current_value, asking_rent, cover_image_url, building:buildings(id, name), leases(monthly_rent, end_date, status, tenant:tenants(full_name, phone))')
      .eq('building_id', id)
      .order('floor_no', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  if (!building) notFound();

  /* Floor order alone put the car park and the storage room first, because they
     are on level -1 — so a building opened on its two least interesting units
     and pushed the flats below the fold. Homes come first, each set still in
     floor order, and the ancillary units follow. */
  const DWELLING = new Set(['apartment', 'penthouse', 'garden_apartment', 'house']);
  const units = [...(properties ?? [])].sort((a, b) => {
    const rank = (p: typeof a) => (DWELLING.has(p.property_type) ? 0 : 1);
    return rank(a) - rank(b) || (a.floor_no ?? 0) - (b.floor_no ?? 0);
  });

  return (
    <RegistryDetail
      backHref="/buildings"
      backLabel="אתרים"
      name={building.name}
      meta={[building.address, building.city, building.entity?.name, building.notes]}
      icon={Building}
      properties={units}
      emptyText="אין עדיין נכסים באתר הזה. אפשר לשייך נכס אליו מתוך עמוד הנכס."
    />
  );
}
