import { createClient } from '@/lib/supabase/server';
import PropertiesGrid from '@/components/PropertiesGrid';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'נכסים' };

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address, city, property_type, rooms, area_sqm, status, current_value, asking_rent, cover_image_url, leases(monthly_rent, end_date, status, tenant:tenants(full_name, phone))')
    .order('created_at', { ascending: true });

  return <PropertiesGrid properties={properties ?? []} />;
}
