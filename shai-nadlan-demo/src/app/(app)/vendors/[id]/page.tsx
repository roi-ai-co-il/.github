import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Wrench, Receipt, TrendingDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS } from '@/lib/format';
import { totals, type RepairRow } from '@/lib/repairs';
import { StatCard, IconChip } from '@/components/ui';
import ContactButtons from '@/components/ContactButtons';
import RepairHistory from '@/components/RepairHistory';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('vendors').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ?? 'בעל מקצוע' };
}

/**
 * One tradesman: how to reach him, and every job he has done.
 *
 * Until now a name in בעלי מקצוע opened nothing at all — the same defect as the
 * one in אתרים, where a site's name led to a list of the whole portfolio. A row
 * that names something has to open that thing.
 */
export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: vendor }, { data: repairs }] = await Promise.all([
    supabase.from('vendors').select('id, name, trade, phone, email, notes').eq('id', id).maybeSingle(),
    supabase
      .from('repairs')
      .select('id, property_id, vendor_id, title, trade, reported_on, done_on, cost, charge_mode, tenant_share, tenant_charge, owner_cost, notes, property:properties(id, name)')
      .eq('vendor_id', id)
      .order('done_on', { ascending: true, nullsFirst: true })
      .order('reported_on', { ascending: false }),
  ]);

  if (!vendor) notFound();

  const jobs = (repairs ?? []) as unknown as RepairRow[];
  const sums = totals(jobs);
  const billed = sums.fromProfit + sums.fromTenants;

  return (
    <div className="space-y-5">
      <Link href="/vendors" className="press inline-flex items-center gap-0.5 text-[15px] font-medium text-accent -mr-1">
        <ChevronRight size={18} />
        <span>בעלי מקצוע</span>
      </Link>

      <div className="flex items-start gap-3">
        <IconChip icon={Wrench} tone="neutral" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight truncate">
            {vendor.name}
          </h1>
          <p className="text-[13px] text-label-tertiary mt-0.5">
            {[vendor.trade, vendor.notes].filter(Boolean).join(' · ') || 'ללא מקצוע רשום'}
          </p>
        </div>
        {vendor.phone && <ContactButtons phone={vendor.phone} name={vendor.name} />}
      </div>

      {jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="סך העבודות" value={ILS(billed)}
            sub={`${jobs.length} תיקונים${sums.unknown ? ` · ${sums.unknown} ללא חשבונית` : ''}`}
            icon={Receipt} tone="neutral"
          />
          <StatCard
            title="ירד מהרווח" value={ILS(sums.fromProfit)}
            sub={sums.fromTenants > 0 ? `${ILS(sums.fromTenants)} נגבו מהדיירים` : 'הכל על חשבוני'}
            icon={TrendingDown} tone="danger"
          />
        </div>
      )}

      <RepairHistory
        repairs={jobs}
        title="העבודות שלו"
        empty={`עוד לא נרשם תיקון של ${vendor.name}. כשתרשום תיקון ותבחר בו — הוא יופיע כאן.`}
      />
    </div>
  );
}
