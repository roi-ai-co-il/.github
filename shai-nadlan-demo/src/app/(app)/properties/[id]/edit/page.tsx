import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PropertyForm from '@/components/PropertyForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'עריכת נכס' };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, name, address, city, property_type, status, rooms, area_sqm, floor_no, purchase_price, purchase_date, current_value, notes')
    .eq('id', id)
    .maybeSingle();

  if (!property) notFound();

  return <PropertyForm initial={property} />;
}
