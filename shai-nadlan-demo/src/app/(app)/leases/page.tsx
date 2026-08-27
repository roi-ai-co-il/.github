import Link from 'next/link';
import { FileText, AlertCircle, CheckCircle2, Phone, MessageSquare, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ILS, heDate, daysUntil, waLink } from '@/lib/format';
import { leaseUrgency, URGENCY_STYLE } from '@/lib/domain';
import { Group, Rows, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'חוזים' };

type LeaseRow = {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  linked_to_cpi: boolean;
  notes: string | null;
  property: { id: string; name: string; city: string } | null;
  tenant: { full_name: string; phone: string | null } | null;
};

export default async function LeasesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('leases')
    .select('id, start_date, end_date, monthly_rent, linked_to_cpi, notes, property:properties(id, name, city), tenant:tenants(full_name, phone)')
    .eq('status', 'active')
    .order('end_date', { ascending: true });

  const leases: (LeaseRow & { days: number })[] = (data ?? []).map((l) => ({
    ...l,
    days: daysUntil(l.end_date),
  }));

  const attention = leases.filter((l) => l.days <= 90);
  const rest = leases.filter((l) => l.days > 90);
  const monthlyTotal = leases.reduce((s, l) => s + l.monthly_rent, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[30px] font-bold text-label tracking-tight leading-tight">חוזים</h1>
        <p className="text-[13px] text-label-tertiary mt-0.5">
          {leases.length} פעילים · {ILS(monthlyTotal)} לחודש
        </p>
      </div>

      {leases.length === 0 && (
        <div className="bg-surface rounded-2xl border border-separator">
          <EmptyState icon={FileText} text="אין חוזים פעילים עדיין" />
        </div>
      )}

      {attention.length > 0 && (
        <Group
          title="דורש טיפול"
          action={
            <span className="flex items-center gap-1 text-[13px] font-semibold text-danger">
              <AlertCircle size={14} strokeWidth={2.5} />
              עד 90 יום
            </span>
          }
        >
          <Rows>
            {attention.map((l) => <LeaseItem key={l.id} lease={l} />)}
          </Rows>
        </Group>
      )}

      {rest.length > 0 && (
        <Group
          title="תקינים"
          action={
            <span className="flex items-center gap-1 text-[13px] font-semibold text-success">
              <CheckCircle2 size={14} strokeWidth={2.5} />
              {rest.length}
            </span>
          }
        >
          <Rows>
            {rest.map((l) => <LeaseItem key={l.id} lease={l} />)}
          </Rows>
        </Group>
      )}
    </div>
  );
}

function LeaseItem({ lease }: { lease: LeaseRow & { days: number } }) {
  const urgency = leaseUrgency(lease.days);
  const style = URGENCY_STYLE[urgency];

  const totalDays = daysUntil(lease.end_date) - daysUntil(lease.start_date);
  const elapsed = -daysUntil(lease.start_date);
  const progress = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 100;

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Link href={`/properties/${lease.property?.id}`} className="press-row flex-1 min-w-0 -m-1 p-1 rounded-lg">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-[15px] text-label truncate">{lease.property?.name}</p>
            <ChevronLeft size={15} className="text-label-tertiary shrink-0" strokeWidth={2.5} />
          </div>
          <p className="text-[13px] text-label-secondary truncate mt-0.5">
            {lease.tenant?.full_name}
            {lease.linked_to_cpi && (
              <span className="mr-2 text-[11px] font-semibold text-info bg-info-tint rounded-full px-2 py-0.5">
                צמוד מדד
              </span>
            )}
          </p>
        </Link>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-semibold text-[15px] text-label whitespace-nowrap">{ILS(lease.monthly_rent)}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${style.text} ${style.bg}`}>
            {style.label(lease.days)}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-label-tertiary mb-1">
          <span>{heDate(lease.start_date)}</span>
          <span>{heDate(lease.end_date)}</span>
        </div>
        <div className="h-1 rounded-full bg-fill overflow-hidden">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2">
        {lease.notes ? (
          <p className="text-[12px] text-label-tertiary truncate">{lease.notes}</p>
        ) : <span />}
        {lease.tenant?.phone && (
          <div className="flex items-center shrink-0 -mb-1">
            <a href={waLink(lease.tenant.phone)} target="_blank" rel="noreferrer"
              className="press touch-target rounded-full text-label-tertiary hover:text-success" title="וואטסאפ לשוכר">
              <MessageSquare size={18} strokeWidth={2} />
            </a>
            <a href={`tel:${lease.tenant.phone}`}
              className="press touch-target rounded-full text-label-tertiary hover:text-accent" title="התקשר לשוכר">
              <Phone size={18} strokeWidth={2} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
