import { createClient } from '@/lib/supabase/server';
import VendorsList, { type VendorRow } from '@/components/VendorsList';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'בעלי מקצוע' };

export default async function VendorsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendors')
    .select('id, name, trade, phone, notes')
    .order('name');

  return <VendorsList vendors={(data ?? []) as VendorRow[]} />;
}
