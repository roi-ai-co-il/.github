import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import RegistryDetail from '@/components/RegistryDetail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('owner_entities').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ?? 'ישות' };
}

/** One holder: everything registered to this person or company. */
export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: entity }, { data: properties }] = await Promise.all([
    supabase.from('owner_entities').select('id, name, entity_type, tax_id, notes').eq('id', id).maybeSingle(),
    supabase.from('properties')
      .select('id, name, address, city, property_type, rooms, area_sqm, status, current_value, asking_rent, cover_image_url, building:buildings(id, name), leases(monthly_rent, end_date, status, tenant:tenants(full_name, phone))')
      .eq('entity_id', id)
      .order('city', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  if (!entity) notFound();

  return (
    <RegistryDetail
      backHref="/entities"
      backLabel="ישויות"
      name={entity.name}
      meta={[entity.entity_type, entity.tax_id ? `ח.פ. ${entity.tax_id}` : null, entity.notes]}
      icon={Users}
      properties={properties ?? []}
      emptyText="אין עדיין נכסים רשומים על הישות הזאת."
    />
  );
}
