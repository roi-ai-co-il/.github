import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui';
import TenantCard, { type TenantWithLease } from '@/components/TenantCard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'שוכרים' };

export default async function TenantsPage() {
  const supabase = await createClient();

  const [{ data: tenants }, { data: leases }] = await Promise.all([
    supabase.from('tenants').select('id, full_name, phone').order('full_name'),
    supabase.from('leases').select('tenant_id, status, monthly_rent, property_id, property:properties(name)'),
  ]);

  const rows: TenantWithLease[] = (tenants ?? []).map((t) => {
    const mine = (leases ?? []).filter((l) => l.tenant_id === t.id);
    const active = mine.find((l) => l.status === 'active');
    return {
      id: t.id,
      full_name: t.full_name,
      phone: t.phone,
      leaseCount: mine.length,
      activeLease: active
        ? {
            propertyId: active.property_id,
            propertyName: (active.property as { name: string } | null)?.name ?? 'נכס',
            rent: Number(active.monthly_rent),
          }
        : null,
    };
  });

  // Active renters first, then the rest alphabetically (already sorted).
  rows.sort((a, b) => Number(!!b.activeLease) - Number(!!a.activeLease));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/leases" className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>חוזים</span>
        </Link>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight mt-2">שוכרים</h1>
        <p className="text-[13px] text-label-tertiary mt-1">
          {rows.length} שוכרים · {rows.filter((r) => r.activeLease).length} עם חוזה פעיל
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-separator">
          <EmptyState icon={Users} text="אין שוכרים עדיין — הם נוצרים כשמשכירים נכס" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
          {rows.map((t) => (
            <TenantCard key={t.id} tenant={t} />
          ))}
        </div>
      )}
    </div>
  );
}
