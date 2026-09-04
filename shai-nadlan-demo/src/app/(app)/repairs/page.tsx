import { createClient } from '@/lib/supabase/server';
import RepairsList from '@/components/RepairsList';
import type { RepairRow } from '@/lib/repairs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'תיקונים' };

const SELECT =
  'id, property_id, vendor_id, title, trade, reported_on, done_on, cost, ' +
  'charge_mode, tenant_share, tenant_charge, owner_cost, notes, ' +
  'property:properties(id, name), vendor:vendors(id, name, trade)';

export default async function RepairsPage() {
  const supabase = await createClient();

  const [{ data: repairs }, { data: properties }, { data: vendors }] = await Promise.all([
    supabase
      .from('repairs')
      .select(SELECT)
      // Open first, then most recent — the same shape as משימות, so the two
      // screens read the same way.
      .order('done_on', { ascending: true, nullsFirst: true })
      .order('reported_on', { ascending: false }),
    supabase.from('properties').select('id, name').order('name'),
    supabase.from('vendors').select('id, name, trade').order('name'),
  ]);

  return (
    <RepairsList
      repairs={(repairs ?? []) as unknown as RepairRow[]}
      properties={properties ?? []}
      vendors={vendors ?? []}
    />
  );
}
