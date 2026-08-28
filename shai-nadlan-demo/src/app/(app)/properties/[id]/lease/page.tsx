import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LeaseForm from '@/components/LeaseForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'השכרת נכס' };

export default async function NewLeasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ renew?: string }>;
}) {
  const { id } = await params;
  const { renew } = await searchParams;
  const supabase = await createClient();

  const [{ data: property }, { data: tenants }, { data: active }] = await Promise.all([
    supabase.from('properties').select('id, name, asking_rent').eq('id', id).maybeSingle(),
    supabase.from('tenants').select('id, full_name, phone').order('full_name'),
    supabase
      .from('leases')
      .select('id, tenant_id, monthly_rent, start_date, end_date, tenant:tenants(full_name)')
      .eq('property_id', id)
      .eq('status', 'active')
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!property) notFound();

  const activeLease = active
    ? {
        id: active.id,
        tenant_id: active.tenant_id,
        tenant_name: (active.tenant as { full_name: string } | null)?.full_name ?? 'השוכר הנוכחי',
        monthly_rent: Number(active.monthly_rent),
        start_date: active.start_date,
        end_date: active.end_date,
      }
    : null;

  return (
    <LeaseForm
      propertyId={property.id}
      propertyName={property.name}
      tenants={tenants ?? []}
      activeLease={activeLease}
      renew={renew === '1'}
      askingRent={property.asking_rent != null ? Number(property.asking_rent) : null}
    />
  );
}
